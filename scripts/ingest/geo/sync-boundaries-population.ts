// scripts/ingest/geo/sync-boundaries-population.ts
//
// Source: Eurostat GISCO (https://gisco-services.ec.europa.eu), the EU's
// official open geodata service. Two datasets, both public/free to reuse:
//   - NUTS level 3 = Slovak "kraje" (regions), 8 features, NUTS_ID matches
//     our regions.kod exactly (e.g. "SK010").
//   - LAU (Local Administrative Units) = Slovak "obce" (municipalities).
//     LAU_ID is a 6-digit numeric code that is always the trailing 6
//     characters of our municipalities.kod (verified against RÚZ's /sidla
//     classifier, e.g. RÚZ kod "SK0222513156" ends in LAU_ID "513156").
//     This dataset also carries POP_2023 (population) and AREA_KM2 per
//     municipality, which is why this one script covers both the GeoJSON
//     boundary requirement and the population requirement the original
//     design spec left unverified.
import type { PrismaClient } from '@prisma/client'
import { fetchJson } from '../http'

const NUTS3_URL =
  'https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_20M_2024_4326_LEVL_3.geojson'
const LAU_URL = 'https://gisco-services.ec.europa.eu/distribution/v2/lau/geojson/LAU_RG_01M_2023_4326.geojson'

interface GeoFeature {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: unknown
}

interface GeoFeatureCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

export async function syncBoundariesAndPopulation(prisma: PrismaClient) {
  const [nuts3, lau] = await Promise.all([
    fetchJson<GeoFeatureCollection>(NUTS3_URL),
    fetchJson<GeoFeatureCollection>(LAU_URL),
  ])

  let regionsUpdated = 0
  for (const f of nuts3.features) {
    if (f.properties.CNTR_CODE !== 'SK') continue
    const kod = f.properties.NUTS_ID as string
    const result = await prisma.region.updateMany({
      where: { kod },
      data: { geometry: f.geometry as never },
    })
    regionsUpdated += result.count
  }

  let municipalitiesUpdated = 0
  let municipalitiesUnmatched = 0
  for (const f of lau.features) {
    if (f.properties.CNTR_CODE !== 'SK') continue
    const lauId = f.properties.LAU_ID as string
    const population = f.properties.POP_2023 as number | null
    const areaKm2 = f.properties.AREA_KM2 as number | null

    const result = await prisma.municipality.updateMany({
      where: { kod: { endsWith: lauId } },
      data: {
        geometry: f.geometry as never,
        population: population ?? undefined,
        populationYear: population != null ? 2023 : undefined,
        areaKm2: areaKm2 ?? undefined,
      },
    })

    if (result.count === 0) {
      municipalitiesUnmatched++
    } else {
      municipalitiesUpdated += result.count
    }
  }

  return { regionsUpdated, municipalitiesUpdated, municipalitiesUnmatched }
}
