// scripts/ingest/rpo/sync-entities.ts
import type { PrismaClient } from '@prisma/client'
import type { RpoClient } from './client'
import { delay } from '../http'
import { upsertBusinessEntity, type MunicipalityGeo } from './upsert-entity'

export async function syncBusinessEntities(prisma: PrismaClient, client: RpoClient) {
  const allMunicipalities = await prisma.municipality.findMany({
    include: { district: true },
  })
  console.log(`Loaded ${allMunicipalities.length} municipalities.`)

  // Lookup by municipality code so we can resolve district/region for ANY
  // municipality an entity's current address points to - not just the one
  // municipality we happened to be searching when we found it. Built from
  // ALL municipalities regardless of sweep progress, since an entity's
  // current address can point anywhere, not just an unsearched municipality.
  const municipalityLookup = new Map<string, MunicipalityGeo>(
    allMunicipalities.map((m) => [
      m.kod,
      { districtKod: m.districtKod, regionKod: (m as unknown as { district: { regionKod: string } }).district.regionKod },
    ])
  )

  // Only search municipalities not yet covered in the current sweep
  // (rpoSearchedAt null). Without this, every restart - and this run has
  // been restarted repeatedly today (an editor auto-update killed it, a
  // hung request stalled it) - re-walks from the very first municipality
  // (Bratislava-area, already fully searched), burning significant time
  // before reaching any new ground. Each municipality is marked searched
  // once its full result set (including per-entity detail fetches) is
  // done, so a restart resumes roughly where it left off.
  const municipalitiesToSearch = allMunicipalities.filter(
    (m) => (m as unknown as { rpoSearchedAt: Date | null }).rpoSearchedAt === null
  )
  console.log(
    `${municipalitiesToSearch.length} municipalities left to search this sweep (${allMunicipalities.length - municipalitiesToSearch.length} already done).`
  )

  let processed = 0
  let skipped = 0

  // How many entity-detail fetches run concurrently within one
  // municipality's result set. The RPO API has no documented rate limit,
  // and fully sequential processing (1 request at a time) makes the
  // observed real-world latency (4-10s per call today) the dominant
  // bottleneck: confirmed live, a run can sit for 10+ minutes without a
  // single new record while working through one municipality's results
  // one at a time. Kept modest (not unbounded) to stay a well-behaved
  // client against an API with no published limit.
  const ENTITY_CONCURRENCY = 5

  async function processEntity(result: { id: number }, muni: (typeof allMunicipalities)[number]) {
    try {
      const detail = await client.getEntity(result.id)
      await upsertBusinessEntity(prisma, municipalityLookup, detail, {
        kod: muni.kod,
        districtKod: muni.districtKod,
        regionKod: (muni as unknown as { district: { regionKod: string } }).district.regionKod,
      })
      processed++
    } catch (err) {
      console.error(`Failed to sync business entity ${result.id}:`, err)
      skipped++
    }
  }

  for (let muniIndex = 0; muniIndex < municipalitiesToSearch.length; muniIndex++) {
    const muni = municipalitiesToSearch[muniIndex]

    // A transient failure here (RPO API down, DB pooler unreachable, etc.)
    // used to crash the whole multi-day process - confirmed live on
    // 2026-08-18 via an uncaught "Can't reach database server" error from
    // the rpoSearchedAt update. Catch at the municipality level instead:
    // log it, leave rpoSearchedAt unset so the next run's resume logic
    // picks this municipality back up, and keep going.
    try {
      const searchStart = Date.now()
      const results = await client.searchByMunicipality(muni.kod)
      if (results.length > 50) {
        console.log(`  [${muni.kod}] large result set: ${results.length} entities (search took ${Date.now() - searchStart}ms)`)
      }

      for (let i = 0; i < results.length; i += ENTITY_CONCURRENCY) {
        const batchStart = Date.now()
        const batch = results.slice(i, i + ENTITY_CONCURRENCY)
        await Promise.all(batch.map((result) => processEntity(result, muni)))
        if (results.length > 50 && i % 100 === 0) {
          console.log(`  [${muni.kod}] batch ${i}/${results.length} done in ${Date.now() - batchStart}ms (processed=${processed} skipped=${skipped})`)
        }
      }

      await prisma.municipality.update({
        where: { kod: muni.kod },
        data: { rpoSearchedAt: new Date() } as never,
      })
    } catch (err) {
      console.error(`Failed to sync municipality ${muni.kod} (${muni.nazov}), will retry next run:`, err)
    }

    // Visible progress heartbeat - without this, a genuinely slow (but
    // working) run and a hung one look identical from the log alone.
    // Confirmed live: the log stayed at just the startup line for 20+
    // minutes with no way to tell which was happening.
    if ((muniIndex + 1) % 25 === 0 || muniIndex === municipalitiesToSearch.length - 1) {
      console.log(
        `[${new Date().toISOString()}] ${muniIndex + 1}/${municipalitiesToSearch.length} municipalities (${muni.kod}) - processed=${processed} skipped=${skipped}`
      )
    }

    await delay(250)
  }

  return { processed, skipped }
}
