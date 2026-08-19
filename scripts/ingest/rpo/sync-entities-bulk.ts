// scripts/ingest/rpo/sync-entities-bulk.ts
import type { PrismaClient } from '@prisma/client'
import { mkdir } from 'fs/promises'
import path from 'path'
import { findLatestInitBatchFiles, downloadBucketObject, deleteFile, streamEntitiesFromFile } from './bulk-source'
import { upsertBusinessEntity, type MunicipalityGeo } from './upsert-entity'
import type { RpoEntityDetail } from './types'

// DB-write throughput is the bottleneck here, not network (unlike the REST
// crawl, where ENTITY_CONCURRENCY=5 exists to avoid hammering an API with
// no documented rate limit). Entities are already sitting in memory from
// the stream, so this can run well above that.
const UPSERT_CONCURRENCY = 20

export async function syncBusinessEntitiesBulk(prisma: PrismaClient, tmpDir: string) {
  const allMunicipalities = await prisma.municipality.findMany({ include: { district: true } })
  console.log(`Loaded ${allMunicipalities.length} municipalities.`)

  const municipalityLookup = new Map<string, MunicipalityGeo>(
    allMunicipalities.map((m) => [
      m.kod,
      { districtKod: m.districtKod, regionKod: (m as unknown as { district: { regionKod: string } }).district.regionKod },
    ])
  )

  const files = await findLatestInitBatchFiles()
  if (files.length === 0) throw new Error('No init batch files found in the RPO bulk export bucket.')
  console.log(`Found ${files.length} files in the latest init batch (${(files.reduce((s, f) => s + f.size, 0) / 1e6).toFixed(0)} MB compressed).`)

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
          console.error(`Failed to upsert bulk entity ${entity.id}:`, err)
          skipped++
        }
      })
    )
  }

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const file = files[fileIndex]
    const localPath = path.join(tmpDir, path.basename(file.key))

    // A failure on one file (bad download, corrupt gzip, etc.) shouldn't
    // take down the whole import - same resilience pattern as the REST
    // crawl's per-municipality try/catch. Skip to the next file.
    try {
      console.log(`[${fileIndex + 1}/${files.length}] downloading ${file.key} (${(file.size / 1e6).toFixed(0)} MB)...`)
      await downloadBucketObject(file.key, localPath)

      let batch: RpoEntityDetail[] = []
      let fileEntityCount = 0
      for await (const entity of streamEntitiesFromFile(localPath)) {
        batch.push(entity)
        fileEntityCount++
        if (batch.length >= UPSERT_CONCURRENCY) {
          await flushBatch(batch)
          batch = []
        }
        if (fileEntityCount % 5000 === 0) {
          console.log(`  [${fileIndex + 1}/${files.length}] ${fileEntityCount} entities from this file (processed=${processed} skipped=${skipped})`)
        }
      }
      if (batch.length > 0) await flushBatch(batch)

      console.log(`[${fileIndex + 1}/${files.length}] done: ${fileEntityCount} entities (processed=${processed} skipped=${skipped})`)
    } catch (err) {
      console.error(`Failed to process bulk file ${file.key}, skipping:`, err)
    } finally {
      await deleteFile(localPath)
    }
  }

  return { processed, skipped }
}
