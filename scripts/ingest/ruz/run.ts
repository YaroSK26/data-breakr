// scripts/ingest/ruz/run.ts
import { prisma } from '../../../lib/prisma'
import { upsertDataSource } from '../data-sources'
import { RuzClient } from './client'
import { syncClassifiers } from './sync-classifiers'
import { syncFirms } from './sync-entities'
import { syncStatements } from './sync-statements'
import { recomputeAggregates } from './recompute-aggregates'

async function main() {
  const client = new RuzClient()
  const runStart = new Date()

  const existing = await prisma.dataSource.findUnique({ where: { sourceName: 'RÚZ' } })
  const since = existing?.lastSyncedAt ?? new Date('2020-01-01')

  console.log('Syncing classifiers...')
  await syncClassifiers(prisma, client)

  console.log(`Syncing firms changed since ${since.toISOString()}...`)
  const firmsResult = await syncFirms(prisma, client, since)
  console.log(`Processed ${firmsResult.processed} firms (${firmsResult.skipped} skipped).`)

  console.log(`Syncing statements changed since ${since.toISOString()}...`)
  const statementsResult = await syncStatements(prisma, client, since)
  console.log(`Processed ${statementsResult.processed} statements (${statementsResult.skipped} skipped).`)

  console.log('Recomputing aggregates...')
  const aggResult = await recomputeAggregates(prisma)
  console.log(`Recomputed ${aggResult.groupsComputed} aggregate groups.`)

  const totalFirms = await prisma.firm.count()
  await upsertDataSource(prisma, {
    sourceName: 'RÚZ',
    sourceUrl: 'https://registeruz.sk/cruz-public/domain/accountingentity/simplesearch',
    lastSyncedAt: runStart,
    recordsCount: totalFirms,
  })

  console.log('RÚZ ingestion complete.')
}

main()
  .catch((err) => {
    console.error('RÚZ ingestion failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
