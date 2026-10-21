// scripts/ingest/rpo/backfill-stav.ts
//
// Jednorazovo doplní stĺpec business_entities.stav (migrácia
// 20261021120000_business_entity_stav) bez plného reimportu: prejde
// posledný mesačný snapshot RPO a po ňom denné dávky (novšia verzia
// subjektu vyhráva), stav určí rovnako ako ingest (lib/stavSubjektu.ts) a
// zapíše len riadky, ktorým sa stav mení. Stĺpec má DEFAULT 'aktivny',
// takže sa prepisuje ~215 tis. riadkov, nie celý milión - DB je nad
// limitom Supabase Free plánu a plný UPDATE by ju na čas zdvojnásobil.
//
// Súbory číta po riadkoch, nie cez stream-json ako bulk import: RPO ich
// zapisuje jeden subjekt na riadok a stream-json tu bol ~20x pomalší
// (desiatky minút na súbor). Ak by sa formát zmenil, riadok nepôjde
// sparsovať a skript skončí chybou, nič nezapíše.
//
// Ide cez DIRECT_URL (dlhé dávky UPDATE cez pgbouncer nejdú spoľahlivo).
//
// Použitie: npx tsx scripts/ingest/rpo/backfill-stav.ts [--dry-run]
import { config } from 'dotenv'
import { createReadStream } from 'fs'
import { mkdir } from 'fs/promises'
import os from 'os'
import path from 'path'
import readline from 'readline'
import zlib from 'zlib'
import { Client } from 'pg'
import { findLatestInitBatchFiles, listBucketObjects, downloadBucketObject, deleteFile } from './bulk-source'
import { urcStav, type Stav } from '../../../lib/stavSubjektu'
import type { RpoEntityDetail } from './types'

config({ path: '.env.local' })

const BATCH = 5_000
const SUBEZNE_SUBORY = 4

async function* entityPoRiadkoch(filePath: string): AsyncGenerator<RpoEntityDetail> {
  const rl = readline.createInterface({
    input: createReadStream(filePath).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  })
  for await (const raw of rl) {
    let line = raw.trim()
    if (line.startsWith(',')) line = line.slice(1)
    if (!line.startsWith('{"id"')) continue
    if (line.endsWith(',')) line = line.slice(0, -1)
    if (line.endsWith(']}')) line = line.slice(0, -2)
    yield JSON.parse(line) as RpoEntityDetail
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const dnes = new Date().toISOString().slice(0, 10)
  const tmpDir = path.join(os.tmpdir(), 'rpo-backfill-stav')
  await mkdir(tmpDir, { recursive: true })

  const init = await findLatestInitBatchFiles()
  const initDatum = init[0]?.key.match(/init_(\d{4}-\d{2}-\d{2})_/)?.[1]
  if (!initDatum) throw new Error('Nenašiel sa žiadny init snapshot RPO.')
  const denne = (await listBucketObjects('batch-daily/'))
    .filter((o) => o.key.endsWith('.json.gz') && o.key >= `batch-daily/actual_${initDatum}`)
    .sort((a, b) => a.key.localeCompare(b.key))
  console.log(`Snapshot ${initDatum}: ${init.length} súborov, potom ${denne.length} denných dávok.`)

  // id -> stav. Zaniknuté subjekty sa vynechajú, v tabuľke nie sú.
  const stavy = new Map<number, Stav>()
  const spracuj = async (key: string) => {
    const lokalne = path.join(tmpDir, path.basename(key))
    await downloadBucketObject(key, lokalne)
    try {
      const vysledok: [number, Stav | null][] = []
      for await (const e of entityPoRiadkoch(lokalne)) {
        vysledok.push([e.id, e.termination ? null : urcStav(e, dnes)])
      }
      return vysledok
    } finally {
      await deleteFile(lokalne)
    }
  }
  const zapis = (vysledok: [number, Stav | null][]) => {
    for (const [id, stav] of vysledok) {
      if (stav) stavy.set(id, stav)
      else stavy.delete(id)
    }
  }

  // Init súbory sa navzájom neprekrývajú, môžu ísť súbežne.
  const fronta = [...init]
  await Promise.all(
    Array.from({ length: SUBEZNE_SUBORY }, async () => {
      for (let f = fronta.shift(); f; f = fronta.shift()) {
        zapis(await spracuj(f.key))
        console.log(`  ${f.key} (${stavy.size} subjektov)`)
      }
    })
  )
  // Denné dávky postupne - neskoršia verzia subjektu musí prepísať staršiu.
  for (const f of denne) {
    zapis(await spracuj(f.key))
    console.log(`  ${f.key}`)
  }

  const podlaStavu = new Map<Stav, number[]>()
  for (const [id, stav] of stavy) {
    if (!podlaStavu.has(stav)) podlaStavu.set(stav, [])
    podlaStavu.get(stav)!.push(id)
  }
  for (const [stav, ids] of podlaStavu) console.log(`${stav}: ${ids.length}`)
  if (dryRun) {
    console.log('--dry-run: nič sa nezapisuje.')
    return
  }

  const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL })
  await client.connect()
  try {
    let zmenene = 0
    for (const [stav, ids] of podlaStavu) {
      if (stav === 'aktivny') continue
      for (let i = 0; i < ids.length; i += BATCH) {
        const res = await client.query(
          `UPDATE business_entities SET stav = $1 WHERE id = ANY($2::bigint[]) AND stav <> $1`,
          [stav, ids.slice(i, i + BATCH)]
        )
        zmenene += res.rowCount ?? 0
      }
      console.log(`zapísané ${stav} (spolu zmenených ${zmenene})`)
    }

    // Pri opakovanom behu: subjekt, ktorý sa medzitým vrátil do aktívneho
    // stavu (napr. skončila mu pozastavená živnosť).
    const neaktivne = await client.query<{ id: string }>(`SELECT id FROM business_entities WHERE stav <> 'aktivny'`)
    const naAktivne = neaktivne.rows.map((r) => Number(r.id)).filter((id) => stavy.get(id) === 'aktivny')
    for (let i = 0; i < naAktivne.length; i += BATCH) {
      const res = await client.query(`UPDATE business_entities SET stav = 'aktivny' WHERE id = ANY($1::bigint[])`, [
        naAktivne.slice(i, i + BATCH),
      ])
      zmenene += res.rowCount ?? 0
    }
    console.log(`Hotovo, zmenených riadkov: ${zmenene}`)

    // Bez VACUUM by staré verzie riadkov ostali ležať a zaberali miesto.
    await client.query('VACUUM (ANALYZE) business_entities')
    const pocty = await client.query(`SELECT stav, COUNT(*)::int AS n FROM business_entities GROUP BY stav ORDER BY n DESC`)
    console.table(pocty.rows)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
