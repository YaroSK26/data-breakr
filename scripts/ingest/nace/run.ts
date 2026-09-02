// scripts/ingest/nace/run.ts
import { prisma } from '../../../lib/prisma'
import { upsertDataSource } from '../data-sources'
import { SusrClassificationClient, CLASSIFICATIONS_PAGE } from './client'
import { syncNace } from './sync'

async function main() {
  const runStart = new Date()
  const client = new SusrClassificationClient()

  console.log('Syncing NACE Rev. 2.1 classification and the SK NACE Rev. 2 prevodník...')
  const result = await syncNace(prisma, client)
  console.log(`Stored ${result.codes} NACE Rev. 2.1 codes and ${result.mappings} mapping rows.`)

  await upsertDataSource(prisma, {
    sourceName: 'ŠÚ SR - klasifikácie (NACE)',
    sourceUrl: CLASSIFICATIONS_PAGE,
    lastSyncedAt: runStart,
    recordsCount: result.codes,
  })

  console.log('NACE ingestion complete.')
}

main()
  .catch((err) => {
    console.error('NACE ingestion failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
