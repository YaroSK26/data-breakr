// scripts/ingest/rpo/upsert-entity.ts
import type { PrismaClient } from '@prisma/client'
import type { RpoAddress, RpoEntityDetail } from './types'

export interface MunicipalityGeo {
  districtKod: string
  regionKod: string
}

export interface FallbackMuni {
  kod: string
  districtKod: string
  regionKod: string
}

// The live RPO `search?addressMunicipality=` endpoint matches an entity's
// entire address *history*, not just its current address - an entity that
// used to be registered in a municipality but has since moved will still be
// returned by a search for that (now stale) municipality. So the search-loop
// municipality cannot be trusted as the entity's actual location; we must
// derive it from the entity's own current address instead.
export function findCurrentAddress(addresses: RpoAddress[]): RpoAddress | undefined {
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

// Resolves geography and upserts a single business entity. Shared between
// the live RPO API crawl (sync-entities.ts) and the bulk S3 export import
// (sync-entities-bulk.ts) - both source the same entity-detail shape, and
// the geography-resolution rules (current-address-wins, explicit-null-on-
// stale-geography) must stay in sync between the two paths rather than
// risk drifting apart as two copies.
//
// `fallbackMuni` is only meaningful for the live crawl: when an entity has
// no address on record at all, the municipality it was found under via
// search is the only location signal available. The bulk import has no
// such signal (entities are read directly, not discovered via a
// municipality search), so it's omitted there and such entities are left
// geography-less instead.
export async function upsertBusinessEntity(
  prisma: PrismaClient,
  municipalityLookup: Map<string, MunicipalityGeo>,
  detail: RpoEntityDetail,
  fallbackMuni?: FallbackMuni
): Promise<void> {
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
  } else if (fallbackMuni) {
    // No address on record at all, so there is no current-address
    // signal to derive geography from. This differs from the two
    // cases above (a current address exists but can't be resolved):
    // here there was never a location signal from the entity itself,
    // so the search-loop municipality is the only signal available at
    // all - use it as a best-effort fallback on both create and
    // update. Because there was no resolvable current-address signal
    // to begin with, this isn't "stale data that must clear" the way
    // the other two cases are.
    municipalityKod = fallbackMuni.kod
    okresKod = fallbackMuni.districtKod
    krajKod = fallbackMuni.regionKod
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
}
