// scripts/ingest/rpo/run.ts
import { prisma } from '../../../lib/prisma'
import { upsertDataSource } from '../data-sources'
import { RpoClient } from './client'
import { syncBusinessEntities } from './sync-entities'
import { recomputeDensity } from './recompute-density'

async function main() {
  const client = new RpoClient()
  const runStart = new Date()

  // If a previous sweep fully completed (no unsearched municipalities
  // left), start a fresh one - entities register, close, and move over
  // time, so a one-time sweep isn't enough. If the sweep is still in
  // progress (interrupted by a crash/restart), leave the markers alone so
  // syncBusinessEntities resumes where it left off instead of redoing
  // already-covered ground.
  const remaining = await prisma.municipality.count({ where: { rpoSearchedAt: null } as never })
  if (remaining === 0) {
    console.log('Previous RPO sweep fully covered - starting a fresh sweep.')
    await prisma.municipality.updateMany({ data: { rpoSearchedAt: null } as never })
  }

  console.log('Syncing RPO business entities by municipality...')
  const result = await syncBusinessEntities(prisma, client)
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

  console.log('RPO ingestion complete.')
}

main()
  .catch((err) => {
    console.error('RPO ingestion failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
