// scripts/ingest/rpo/run.ts
import { prisma } from '../../../lib/prisma'
import { upsertDataSource } from '../data-sources'
import { RpoClient } from './client'
import { syncBusinessEntities } from './sync-entities'
import { recomputeDensity } from './recompute-density'

async function main() {
  const client = new RpoClient()
  const runStart = new Date()

  console.log('Syncing RPO business entities by municipality...')
  const result = await syncBusinessEntities(prisma, client)
  console.log(`Processed ${result.processed} business entities.`)

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

  console.log('RPO ingestion complete.')
}

main()
  .catch((err) => {
    console.error('RPO ingestion failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
