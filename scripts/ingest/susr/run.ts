// scripts/ingest/susr/run.ts
import { prisma } from '../../../lib/prisma'
import { upsertDataSource } from '../data-sources'
import { syncSusr } from './sync'

async function main() {
  const runStart = new Date()

  console.log('Sťahujem okresné ukazovatele zo ŠÚ SR STATdata...')
  const vysledok = await syncSusr(prisma)

  for (const [dataset, pocet] of Object.entries(vysledok.podlaDatasetu)) {
    console.log(`  ${dataset}: ${pocet} riadkov`)
  }
  console.log(`Spolu ${vysledok.spolu} riadkov.`)

  await upsertDataSource(prisma, {
    sourceName: 'ŠÚ SR - STATdata (okresné ukazovatele)',
    sourceUrl: 'https://statdata.statistics.sk/',
    lastSyncedAt: runStart,
    recordsCount: vysledok.spolu,
  })
  await prisma.dataSource.deleteMany({
    where: { sourceName: 'ŠÚ SR - DATAcube (okresné ukazovatele)' },
  })

  console.log('Hotovo.')
}

main()
  .catch((err) => {
    console.error('ŠÚ SR ingest zlyhal:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
