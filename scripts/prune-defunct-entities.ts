// scripts/prune-defunct-entities.ts
//
// Jednorazová (a opakovateľná) údržba: vyhodí zaniknuté subjekty z
// business_entities. Analýzy o nich už žijú v agregátoch, ktoré napĺňa
// scripts/ingest/rpo/archive-defunct.ts - ten musí zbehnúť PRED týmto,
// inak sa dáta stratia bez náhrady.
//
// Prečo: zaniknuté tvorili 54 % tabuľky (1,24 M z 2,27 M riadkov) a appka
// ich nikde nezobrazuje - každý dotaz má `datum_zaniku IS NULL`. Databáza
// pritom prerástla 500 MB limit Supabase Free plánu.
//
// Ide cez DIRECT_URL, nie cez pooler: dlhé DELETE dávky a VACUUM FULL sa
// cez pgbouncer správajú nepredvídateľne.
//
// Použitie: npx tsx scripts/prune-defunct-entities.ts [--dry-run]
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: '.env.local' })

const BATCH = 50_000
// Indexy, ktoré appka nepoužíva - IČO sa nikde nevyhľadáva (zoznam firiem
// dedupuje cez DISTINCT ON, nie cez index) a dátum vzniku ide po zmene
// štatistík z vznik_agg. Mažú sa PRED DELETE: uvoľnené miesto potrebuje
// VACUUM FULL na dočasnú kópiu tabuľky.
const DROP_INDEXES = ['business_entities_ico_idx', 'business_entities_datum_vzniku_idx']

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL })
  await client.connect()

  const size = async () =>
    (await client.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS s`)).rows[0].s

  console.log('DB pred:', await size())

  // Poistka: bez naplnených agregátov by mazanie zmazalo aj analýzy.
  const agg = await client.query(`SELECT COALESCE(SUM(pocet), 0)::bigint AS n FROM zaniknute_agg`)
  const live = await client.query(
    `SELECT COUNT(*)::bigint AS n FROM business_entities WHERE datum_zaniku IS NOT NULL`
  )
  const aggN = BigInt(agg.rows[0].n)
  const liveN = BigInt(live.rows[0].n)
  console.log(`zaniknute_agg: ${aggN} subjektov | v business_entities: ${liveN}`)

  if (aggN < liveN) {
    throw new Error(
      `Agregáty (${aggN}) nepokrývajú zaniknuté riadky (${liveN}). Najprv spusti archive-defunct.ts.`
    )
  }

  if (dryRun) {
    console.log('--dry-run: nič sa nemaže.')
    await client.end()
    return
  }

  for (const idx of DROP_INDEXES) {
    const t = Date.now()
    await client.query(`DROP INDEX IF EXISTS "${idx}"`)
    console.log(`DROP INDEX ${idx} - ${((Date.now() - t) / 1000).toFixed(1)}s`)
  }
  console.log('DB po zmazaní indexov:', await size())

  // Po dávkach: jeden DELETE cez 1,24 M riadkov drží dlhú transakciu a pri
  // páde sa vráti celý. Takto je každá dávka samostatne commitnutá, takže
  // prerušený beh nechá konzistentný, len nedokončený stav.
  let zmazanychSpolu = 0
  const start = Date.now()
  for (;;) {
    const t = Date.now()
    const res = await client.query(
      `DELETE FROM business_entities
       WHERE id IN (
         SELECT id FROM business_entities WHERE datum_zaniku IS NOT NULL LIMIT ${BATCH}
       )`
    )
    if (res.rowCount === 0) break
    zmazanychSpolu += res.rowCount ?? 0
    console.log(
      `zmazané ${zmazanychSpolu} (+${res.rowCount}) - dávka ${((Date.now() - t) / 1000).toFixed(1)}s`
    )
  }
  console.log(`DELETE hotový: ${zmazanychSpolu} riadkov za ${((Date.now() - start) / 60000).toFixed(1)} min`)
  console.log('DB po DELETE (miesto ešte nie je vrátené):', await size())

  console.log('VACUUM FULL business_entities - tabuľka je počas neho zamknutá...')
  const vt = Date.now()
  await client.query(`VACUUM (FULL, ANALYZE) business_entities`)
  console.log(`VACUUM FULL hotový za ${((Date.now() - vt) / 60000).toFixed(1)} min`)

  const zostalo = await client.query(`SELECT COUNT(*)::bigint AS n FROM business_entities`)
  console.log('riadkov v business_entities:', zostalo.rows[0].n)
  console.log('DB po:', await size())

  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
