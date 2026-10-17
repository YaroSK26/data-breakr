// Vytvorí presnú vonkajšiu hranicu kraja zlúčením detailných hraníc
// jeho okresov. GISCO NUTS 3 (20M) je vhodné na prehľadovú mapu, ale pri
// priblížení má príliš hrubé rovné segmenty.
import type { PrismaClient } from '@prisma/client'
import * as turf from '@turf/turf'
import type { Feature, MultiPolygon, Polygon } from 'geojson'

export async function computeRegionBoundaries(prisma: PrismaClient) {
  const regions = await prisma.region.findMany({
    select: {
      kod: true,
      districts: { select: { geometry: true } },
    },
  })

  let computed = 0
  let skipped = 0

  for (const region of regions) {
    const features: Feature<Polygon | MultiPolygon>[] = region.districts
      .filter((district) => district.geometry !== null)
      .map((district) => ({
        type: 'Feature',
        properties: {},
        geometry: district.geometry as unknown as Polygon | MultiPolygon,
      }))

    if (features.length === 0) {
      skipped++
      continue
    }

    const boundary = features.length === 1
      ? features[0]
      : turf.union(turf.featureCollection(features))

    if (!boundary) {
      skipped++
      continue
    }

    await prisma.region.update({
      where: { kod: region.kod },
      data: { geometry: boundary.geometry as never },
    })
    computed++
  }

  return { computed, skipped, total: regions.length }
}
