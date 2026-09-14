// scripts/ingest/rpo/backfill-prezitie-vznik.ts
//
// Jednorazová oprava po chybe 42P10 v archivujZaniknuty (upsert-entity.ts).
//
// Čo sa stalo: INSERT do prezitie_agg mieril `ON CONFLICT (rok_vzniku,
// rok_zaniku)`, lenže živá tabuľka taký unikátny kľúč nemá. Postgres to
// odmietol, výnimka vyletela z archivujZaniknuty - ale to bolo AŽ PO tom,
// čo sa riadok z business_entities zmazal a započítal do zaniknute_agg.
// Postihnuté subjekty teda z tabuľky zmizli, v zaniknute_agg sú, ale do
// prezitie_agg a vznik_agg sa nikdy nedostali.
//
// Opakovaný beh dennej dávky ich nedorovná: archivujZaniknuty sa riadi tým,
// či DELETE naozaj našiel riadok, a ten už tam nie je. Preto sa chýbajúce
// prírastky musia dopočítať zo zdrojových denných dávok - to robí tento
// skript.
//
// NIE JE idempotentný - každý beh pripočíta +1 za každé nájdené IČO. Preto
// bez `--apply` iba vypíše, čo by spravil.
//
// Použitie:
//   npx tsx scripts/ingest/rpo/backfill-prezitie-vznik.ts --ids <subor> --since YYYY-MM-DD [--apply]
import os from 'os'
import path from 'path'
import { mkdir } from 'fs/promises'
import { readFileSync } from 'fs'
import { prisma } from '../../../lib/prisma'
import { listBucketObjects, downloadBucketObject, deleteFile, streamEntitiesFromFile } from './bulk-source'
import { findCurrentAddress } from './upsert-entity'

function parseArgs() {
  const args = process.argv.slice(2)
  const val = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const ids = val('--ids')
  const since = val('--since')
  if (!ids || !since) {
    console.error('Použitie: --ids <subor s ID, jedno na riadok> --since YYYY-MM-DD [--apply]')
    process.exit(1)
  }
  return { ids, since, apply: args.includes('--apply') }
}

async function main() {
  const { ids: idsPath, since, apply } = parseArgs()

  const hladane = new Set(
    readFileSync(idsPath, 'utf8')
      .split(/\s+/)
      .filter(Boolean),
  )
  console.log(`Hľadám ${hladane.size} subjektov v denných dávkach od ${since}.`)

  // Subjekt, ktorý sa medzitým do business_entities vrátil (RPO zrušilo
  // zánik), do agregátov zaniknutých nepatrí - inak by sa rátal dvakrát:
  // raz ako živý riadok a raz ako zaniknutý v agregáte.
  const stalePritomne = await prisma.businessEntity.findMany({
    where: { id: { in: [...hladane].map(BigInt) } },
    select: { id: true },
  })
  for (const r of stalePritomne) hladane.delete(r.id.toString())
  if (stalePritomne.length > 0) {
    console.log(`${stalePritomne.length} z nich je späť v business_entities - preskakujem ich.`)
  }

  const allMunicipalities = await prisma.municipality.findMany({ select: { kod: true, districtKod: true } })
  const okresPodlaObce = new Map<string, string>(allMunicipalities.map((m) => [m.kod, m.districtKod]))

  const tmpDir = path.join(os.tmpdir(), 'rpo-backfill')
  await mkdir(tmpDir, { recursive: true })

  const all = await listBucketObjects('batch-daily/')
  const files = all
    .filter((o) => o.key.endsWith('.json.gz') && o.key >= `batch-daily/actual_${since}`)
    .sort((a, b) => a.key.localeCompare(b.key))
  console.log(`Prechádzam ${files.length} dávok.`)

  // Neskoršia dávka prepíše staršiu: RPO posiela ten istý subjekt pri každej
  // zmene a platí posledný známy stav, nie prvý nájdený.
  const najdene = new Map<string, { rokVzniku: number | null; rokZaniku: number; okresKod: string | null }>()

  for (const file of files) {
    const localPath = path.join(tmpDir, path.basename(file.key))
    try {
      await downloadBucketObject(file.key, localPath)
      for await (const detail of streamEntitiesFromFile(localPath)) {
        const id = String(detail.id)
        if (!hladane.has(id) || !detail.termination) continue

        const muniKod = findCurrentAddress(detail.addresses ?? [])?.municipality?.code
        najdene.set(id, {
          rokVzniku: detail.establishment ? new Date(detail.establishment).getUTCFullYear() : null,
          rokZaniku: new Date(detail.termination).getUTCFullYear(),
          okresKod: (muniKod && okresPodlaObce.get(muniKod)) || null,
        })
      }
    } finally {
      await deleteFile(localPath)
    }
  }

  const sRokomVzniku = [...najdene.values()].filter((z) => z.rokVzniku !== null)
  console.log(`Našiel som ${najdene.size} subjektov, z toho ${sRokomVzniku.length} má dátum vzniku.`)
  const chybajuce = [...hladane].filter((id) => !najdene.has(id))
  if (chybajuce.length > 0) {
    console.log(`${chybajuce.length} sa v dávkach nenašlo (do agregátov sa nedopočítajú).`)
  }

  if (!apply) {
    console.log('\nSkúšobný beh - nič sa nezapísalo. Spusti s --apply.')
    return
  }

  let prezitieZapisane = 0
  let vznikZapisane = 0
  for (const { rokVzniku, rokZaniku, okresKod } of sRokomVzniku) {
    const p = await prisma.$executeRaw`
      UPDATE prezitie_agg SET pocet = pocet + 1
      WHERE rok_vzniku = ${rokVzniku} AND rok_zaniku = ${rokZaniku}
    `
    if (p === 0) {
      await prisma.$executeRaw`
        INSERT INTO prezitie_agg (rok_vzniku, rok_zaniku, pocet) VALUES (${rokVzniku}, ${rokZaniku}, 1)
      `
    }
    prezitieZapisane++

    const v = await prisma.$executeRaw`
      UPDATE vznik_agg SET pocet = pocet + 1
      WHERE okres_kod IS NOT DISTINCT FROM ${okresKod} AND rok_vzniku = ${rokVzniku}
    `
    if (v === 0) {
      await prisma.$executeRaw`
        INSERT INTO vznik_agg (okres_kod, rok_vzniku, pocet) VALUES (${okresKod}, ${rokVzniku}, 1)
      `
    }
    vznikZapisane++
  }

  console.log(`Dopočítané: prezitie_agg +${prezitieZapisane}, vznik_agg +${vznikZapisane}.`)
}

main()
  .catch((err) => {
    console.error('Backfill zlyhal:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
