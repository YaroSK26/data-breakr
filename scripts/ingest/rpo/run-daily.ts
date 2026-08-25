// scripts/ingest/rpo/run-daily.ts
//
// Daily catch-up: applies RPO's daily incremental batches since our last
// sync, across the whole of Slovakia, writing new/changed entities into
// business_entities - then recomputes density + stats so the live site's
// numbers actually reflect them. Meant to run once a day (see cron.md).
//
// Usage: npx tsx scripts/ingest/rpo/run-daily.ts [--since YYYY-MM-DD]
import os from 'os'
import path from 'path'
import { prisma } from '../../../lib/prisma'
import { upsertDataSource } from '../data-sources'
import { syncBusinessEntitiesDaily } from './sync-entities-daily'
import { recomputeDensity } from './recompute-density'
import { recomputeStats } from './recompute-stats'

function parseArgs() {
  const args = process.argv.slice(2)
  const i = args.indexOf('--since')
  return { since: i >= 0 ? args[i + 1] : undefined }
}

async function main() {
  const runStart = new Date()
  const tmpDir = path.join(os.tmpdir(), 'rpo-daily-import')
  const { since } = parseArgs()

  let sinceDate = since
  if (!sinceDate) {
    const existing = await prisma.dataSource.findUnique({ where: { sourceName: 'RPO' } })
    if (!existing?.lastSyncedAt) throw new Error('No RPO data_sources row (with a lastSyncedAt) found - run the full bulk import first.')
    sinceDate = existing.lastSyncedAt.toISOString().slice(0, 10)
  }

  console.log(`Applying RPO daily batches since ${sinceDate} (whole SK)...`)
  const result = await syncBusinessEntitiesDaily(prisma, tmpDir, sinceDate)
  console.log(`Processed ${result.processed} entities across ${result.filesApplied} daily batch(es) (${result.skipped} skipped).`)

  if (result.filesApplied > 0) {
    console.log('Recomputing business density aggregates...')
    const densityResult = await recomputeDensity(prisma)
    console.log(`Recomputed density for ${densityResult.areasComputed} areas.`)

    console.log('Recomputing homepage stats cache...')
    await recomputeStats(prisma)
  } else {
    console.log('No new daily batches - skipping recompute.')
  }

  const totalEntities = await prisma.businessEntity.count()
  await upsertDataSource(prisma, {
    sourceName: 'RPO',
    sourceUrl: 'https://rpo.statistics.sk',
    lastSyncedAt: runStart,
    recordsCount: totalEntities,
  })

  console.log('RPO daily sync complete.')
}

main()
  .catch((err) => {
    console.error('RPO daily sync failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
