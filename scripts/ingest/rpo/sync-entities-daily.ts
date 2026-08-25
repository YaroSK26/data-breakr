// scripts/ingest/rpo/sync-entities-daily.ts
//
// Applies RPO's daily incremental batches (batch-daily/actual_YYYY-MM-DD.json.gz -
// entities added/modified that day, across all of Slovakia) on top of the
// existing full snapshot, for whichever days haven't been applied yet.
// Same entity shape and upsert logic as the full bulk import
// (sync-entities-bulk.ts) - just a much smaller, incremental input, so this
// is cheap enough to run daily instead of re-running the full ~2.3M-row
// import to catch up on new registrations.
import type { PrismaClient } from '@prisma/client'
import { mkdir } from 'fs/promises'
import path from 'path'
import { listBucketObjects, downloadBucketObject, deleteFile, streamEntitiesFromFile } from './bulk-source'
import { upsertBusinessEntity, type MunicipalityGeo } from './upsert-entity'
import type { RpoEntityDetail } from './types'

const UPSERT_CONCURRENCY = 20

export async function syncBusinessEntitiesDaily(prisma: PrismaClient, tmpDir: string, sinceDate: string) {
  const allMunicipalities = await prisma.municipality.findMany({ include: { district: true } })
  const municipalityLookup = new Map<string, MunicipalityGeo>(
    allMunicipalities.map((m) => [
      m.kod,
      { districtKod: m.districtKod, regionKod: (m as unknown as { district: { regionKod: string } }).district.regionKod },
    ])
  )

  const all = await listBucketObjects('batch-daily/')
  const files = all
    .filter((o) => o.key.endsWith('.json.gz') && o.key >= `batch-daily/actual_${sinceDate}`)
    .sort((a, b) => a.key.localeCompare(b.key))

  console.log(`Found ${files.length} daily batch(es) from ${sinceDate} onward.`)
  await mkdir(tmpDir, { recursive: true })

  let processed = 0
  let skipped = 0

  async function flushBatch(batch: RpoEntityDetail[]) {
    await Promise.all(
      batch.map(async (entity) => {
        try {
          await upsertBusinessEntity(prisma, municipalityLookup, entity)
          processed++
        } catch (err) {
          console.error(`Failed to upsert daily entity ${entity.id}:`, err)
          skipped++
        }
      })
    )
  }

  for (const file of files) {
    const localPath = path.join(tmpDir, path.basename(file.key))
    try {
      console.log(`Applying ${file.key}...`)
      await downloadBucketObject(file.key, localPath)

      let batch: RpoEntityDetail[] = []
      let fileCount = 0
      for await (const entity of streamEntitiesFromFile(localPath)) {
        batch.push(entity)
        fileCount++
        if (batch.length >= UPSERT_CONCURRENCY) {
          await flushBatch(batch)
          batch = []
        }
      }
      if (batch.length > 0) await flushBatch(batch)
      console.log(`  ${file.key}: ${fileCount} entities (processed=${processed} skipped=${skipped})`)
    } catch (err) {
      console.error(`Failed to process daily file ${file.key}, skipping:`, err)
    } finally {
      await deleteFile(localPath)
    }
  }

  return { processed, skipped, filesApplied: files.length }
}
