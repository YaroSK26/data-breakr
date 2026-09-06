// scripts/ingest/fs/run.ts
import { prisma } from '../../../lib/prisma'
import { upsertDataSource } from '../data-sources'
import { FsOpenDataClient } from './client'
import { buildPscToOkres, parseDphs, parseDsdd, syncDlznici, syncDph } from './sync'

async function main() {
  const runStart = new Date()
  const client = new FsOpenDataClient()

  console.log('Sťahujem zoznam platiteľov DPH...')
  const dphXml = await client.getDphPlatci()
  const dphRows = parseDphs(dphXml)
  console.log(`Naparsovaných ${dphRows.length} riadkov, ukladám...`)
  const dphPocet = await syncDph(prisma, dphRows)
  console.log(`Uložených ${dphPocet} platiteľov DPH.`)

  await upsertDataSource(prisma, {
    sourceName: 'Finančná správa SR - platitelia DPH',
    sourceUrl: 'https://opendata.financnasprava.sk/page/openapi',
    lastSyncedAt: runStart,
    recordsCount: dphPocet,
  })

  console.log('Sťahujem zoznam daňových dlžníkov...')
  const dsddXml = await client.getDanoviDlznici()
  const dsddRows = parseDsdd(dsddXml)
  console.log(`Naparsovaných ${dsddRows.length} riadkov, priraďujem k okresom...`)

  const pscToOkres = await buildPscToOkres(prisma)
  const vysledok = await syncDlznici(prisma, dsddRows, pscToOkres)
  console.log(
    `Priradených ${vysledok.sOkresom} z ${vysledok.dlznikov} (${(vysledok.matchPct * 100).toFixed(1)} %) k okresu.`
  )

  await upsertDataSource(prisma, {
    sourceName: 'Finančná správa SR - daňoví dlžníci',
    sourceUrl: 'https://opendata.financnasprava.sk/page/openapi',
    lastSyncedAt: runStart,
    recordsCount: vysledok.dlznikov,
  })

  console.log('Hotovo.')
}

main()
  .catch((err) => {
    console.error('FS SR ingest zlyhal:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
