// scripts/ingest/rpo/sync-entities.ts
import type { PrismaClient } from '@prisma/client'
import type { RpoClient } from './client'
import type { RpoAddress } from './types'
import { delay } from '../http'

interface MunicipalityGeo {
  districtKod: string
  regionKod: string
}

// The live RPO `search?addressMunicipality=` endpoint matches an entity's
// entire address *history*, not just its current address - an entity that
// used to be registered in a municipality but has since moved will still be
// returned by a search for that (now stale) municipality. So the search-loop
// municipality cannot be trusted as the entity's actual location; we must
// derive it from the entity's own current address instead.
function findCurrentAddress(addresses: RpoAddress[]): RpoAddress | undefined {
  if (addresses.length === 0) return undefined

  // An address still in effect has no validTo. Prefer those; if more than
  // one is "open" (shouldn't normally happen), take the one with the latest
  // validFrom.
  const open = addresses.filter((a) => !a.validTo)
  const candidates = open.length > 0 ? open : addresses

  return candidates.reduce((latest, a) => {
    if (!latest) return a
    return (a.validFrom ?? '') > (latest.validFrom ?? '') ? a : latest
  }, candidates[0])
}

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
      const ico = detail.identifiers[0]?.value
      const nazov = detail.fullNames[detail.fullNames.length - 1]?.value
      const naceKod4 = detail.statisticalCodes?.mainActivity?.code
      const pravnaFormaKod = detail.legalForms?.[detail.legalForms.length - 1]?.value.code

      const currentAddress = findCurrentAddress(detail.addresses ?? [])
      const hasCurrentAddress = currentAddress !== undefined
      const currentMuniCode = currentAddress?.municipality?.code

      let municipalityKod: string | undefined
      let okresKod: string | undefined
      let krajKod: string | undefined
      // Whether the geography fields must be explicitly nulled on update
      // rather than left `undefined`. Prisma treats `undefined` as "don't
      // touch this column" on update, so if we ever had geography stored
      // from a prior sync and now can't resolve it, leaving these fields
      // `undefined` would silently keep the stale value forever. `create`
      // doesn't have this problem - `undefined` there just writes NULL.
      let clearGeoOnUpdate = false

      if (currentMuniCode) {
        const geo = municipalityLookup.get(currentMuniCode)
        if (geo) {
          municipalityKod = currentMuniCode
          okresKod = geo.districtKod
          krajKod = geo.regionKod
        } else {
          // The entity's current address is in a municipality we have no
          // district/region data for (e.g. outside our municipalities
          // table). Leave geography fields unset on create rather than
          // guessing, and actively clear them on update - falling back to
          // the search-loop municipality here would silently reproduce the
          // exact mis-attribution this is fixing, and leaving `undefined`
          // on update would silently keep a stale district from before the
          // entity moved.
          clearGeoOnUpdate = true
        }
      } else if (hasCurrentAddress) {
        // A current address exists (RpoAddress.municipality.code is
        // optional on the source), but we can't resolve it to a
        // municipality. This is NOT the same as "no address on record" -
        // we know the entity has a current address, we just can't derive
        // geography from it. Treat it the same as the unresolvable-lookup
        // case above rather than falling back to the search-loop
        // municipality, which would reintroduce the exact mis-attribution
        // this file's current-address fix was meant to eliminate.
        clearGeoOnUpdate = true
      } else {
        // No address on record at all, so there is no current-address
        // signal to derive geography from. This differs from the two
        // cases above (a current address exists but can't be resolved):
        // here there was never a location signal from the entity itself,
        // so the search-loop municipality is the only signal available at
        // all - use it as a best-effort fallback on both create and
        // update. Because there was no resolvable current-address signal
        // to begin with, this isn't "stale data that must clear" the way
        // the other two cases are.
        municipalityKod = muni.kod
        okresKod = muni.districtKod
        krajKod = (muni as unknown as { district: { regionKod: string } }).district.regionKod
      }

      await prisma.businessEntity.upsert({
        where: { id: BigInt(detail.id) },
        create: {
          id: BigInt(detail.id),
          ico,
          nazov,
          municipalityKod,
          okresKod,
          krajKod,
          naceKod4,
          pravnaFormaKod,
          datumVzniku: detail.establishment ? new Date(detail.establishment) : undefined,
          datumZaniku: detail.termination ? new Date(detail.termination) : undefined,
          zdrojDat: 'RPO',
        },
        update: {
          ico,
          nazov,
          // An entity may have moved since the last sync - re-derive
          // geography from its current address every time rather than
          // leaving whatever was stored at creation in place. When the
          // current address can't be resolved to a municipality (but we
          // know it exists, or the lookup is missing it), explicitly null
          // these out instead of leaving them `undefined` - see
          // `clearGeoOnUpdate` above.
          municipalityKod: clearGeoOnUpdate ? null : municipalityKod,
          okresKod: clearGeoOnUpdate ? null : okresKod,
          krajKod: clearGeoOnUpdate ? null : krajKod,
          naceKod4,
          pravnaFormaKod,
          // recompute-density.ts uses datumZaniku as the active/inactive
          // filter, so a cleared termination date on the source must
          // actually clear it locally rather than leaving the entity
          // stuck as inactive (or vice versa).
          datumZaniku: detail.termination ? new Date(detail.termination) : null,
          lastSyncedAt: new Date(),
        },
      })
      processed++
    } catch (err) {
      console.error(`Failed to sync business entity ${result.id}:`, err)
      skipped++
    }
  }

  for (let muniIndex = 0; muniIndex < municipalitiesToSearch.length; muniIndex++) {
    const muni = municipalitiesToSearch[muniIndex]
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
