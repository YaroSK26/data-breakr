// scripts/ingest/rpo/run-bulk.ts
import os from 'os'
import path from 'path'
import { prisma } from '../../../lib/prisma'
import { upsertDataSource } from '../data-sources'
import { syncBusinessEntitiesBulk } from './sync-entities-bulk'
import { recomputeDensity } from './recompute-density'

async function main() {
  const runStart = new Date()
  const tmpDir = path.join(os.tmpdir(), 'rpo-bulk-import')

  console.log('Importing RPO business entities from the bulk S3 export...')
  const result = await syncBusinessEntitiesBulk(prisma, tmpDir)
  console.log(`Processed ${result.processed} business entities (${result.skipped} skipped).`)

  console.log('Recomputing business density aggregates...')
  const densityResult = await recomputeDensity(prisma)
  console.log(`Recomputed density for ${densityResult.areasComputed} areas.`)

  const totalEntities = await prisma.businessEntity.count()
  await upsertDataSource(prisma, {
    sourceName: 'RPO',
    sourceUrl: 'https://rpo.statistics.sk',
    lastSyncedAt: runStart,
    recordsCount: totalEntities,
  })

  console.log('RPO bulk import complete.')
}

main()
  .catch((err) => {
    console.error('RPO bulk import failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
