// scripts/ingest/geo/compute-district-boundaries.ts
//
// No EU-harmonized source publishes Slovak district (okres) boundary
// polygons directly (Eurostat's LAU is municipality-level, NUTS3 is
// region-level) - see the data layer design spec. This derives district
// boundaries by dissolving (union) the municipality polygons already
// ingested from GISCO, grouped by district_kod. Run once after
// sync-boundaries-population.ts, and again whenever municipality
// geometry is re-synced.
import type { PrismaClient } from '@prisma/client'
import * as turf from '@turf/turf'
import type { Feature, Polygon, MultiPolygon } from 'geojson'

export async function computeDistrictBoundaries(prisma: PrismaClient) {
  const districts = await prisma.district.findMany({ select: { kod: true } })

  let computed = 0
  let skipped = 0

  for (const district of districts) {
    const allMunicipalities = await prisma.municipality.findMany({
      where: { districtKod: district.kod },
      select: { geometry: true },
    })
    const municipalities = allMunicipalities.filter((m) => m.geometry !== null)

    if (municipalities.length === 0) {
      skipped++
      continue
    }

    const features: Feature<Polygon | MultiPolygon>[] = municipalities.map((m) => ({
      type: 'Feature',
      properties: {},
      geometry: m.geometry as unknown as Polygon | MultiPolygon,
    }))

    let dissolved: Feature<Polygon | MultiPolygon> | null = null
    if (features.length === 1) {
      dissolved = features[0]
    } else {
      const collection = turf.featureCollection(features)
      const unioned = turf.union(collection)
      dissolved = unioned as Feature<Polygon | MultiPolygon> | null
    }

    if (!dissolved) {
      skipped++
      continue
    }

    await prisma.district.update({
      where: { kod: district.kod },
      data: { geometry: dissolved.geometry as never },
    })
    computed++
  }

  return { computed, skipped, total: districts.length }
}
