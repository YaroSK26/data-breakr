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
  const municipalities = await prisma.municipality.findMany({
    include: { district: true },
  })

  // Lookup by municipality code so we can resolve district/region for ANY
  // municipality an entity's current address points to - not just the one
  // municipality we happened to be searching when we found it.
  const municipalityLookup = new Map<string, MunicipalityGeo>(
    municipalities.map((m) => [
      m.kod,
      { districtKod: m.districtKod, regionKod: (m as unknown as { district: { regionKod: string } }).district.regionKod },
    ])
  )

  let processed = 0
  let skipped = 0

  for (const muni of municipalities) {
    const results = await client.searchByMunicipality(muni.kod)

    for (const result of results) {
      try {
        const detail = await client.getEntity(result.id)
        const ico = detail.identifiers[0]?.value
        const nazov = detail.fullNames[detail.fullNames.length - 1]?.value
        const naceKod4 = detail.statisticalCodes?.mainActivity?.code
        const pravnaFormaKod = detail.legalForms?.[detail.legalForms.length - 1]?.value.code

        const currentAddress = findCurrentAddress(detail.addresses ?? [])
        const currentMuniCode = currentAddress?.municipality?.code

        let municipalityKod: string | undefined
        let okresKod: string | undefined
        let krajKod: string | undefined

        if (currentMuniCode) {
          const geo = municipalityLookup.get(currentMuniCode)
          if (geo) {
            municipalityKod = currentMuniCode
            okresKod = geo.districtKod
            krajKod = geo.regionKod
          }
          // else: the entity's current address is in a municipality we have
          // no district/region data for (e.g. outside our municipalities
          // table). Leave geography fields unset rather than guessing -
          // falling back to the search-loop municipality here would
          // silently reproduce the exact mis-attribution this is fixing.
        } else {
          // No address on record at all, so there is no current-address
          // signal to derive geography from. The search-loop municipality
          // is the only location signal we have for this entity - use it as
          // a best-effort fallback.
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
            // leaving whatever was stored at creation in place.
            municipalityKod,
            okresKod,
            krajKod,
            naceKod4,
            pravnaFormaKod,
            // recompute-density.ts uses datumZaniku as the active/inactive
            // filter, so a cleared termination date on the source must
            // actually clear it locally rather than leaving the entity
            // stuck as inactive (or vice versa).
            datumZaniku: detail.termination ? new Date(detail.termination) : null,
          },
        })
        processed++
      } catch (err) {
        console.error(`Failed to sync business entity ${result.id}:`, err)
        skipped++
      }
    }

    await delay(250)
  }

  return { processed, skipped }
}
