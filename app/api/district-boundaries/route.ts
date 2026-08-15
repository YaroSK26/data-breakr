// app/api/district-boundaries/route.ts
//
// District outline overlay for the density map - dissolved from
// municipality polygons (see scripts/ingest/geo/compute-district-boundaries.ts).
// Independent of any NACE/metric filter, so the frontend fetches this once,
// not on every filter change.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const districts = await prisma.district.findMany({
    where: { geometry: { not: undefined } },
    select: { kod: true, nazovSk: true, geometry: true },
  })

  const features = districts
    .filter((d) => d.geometry !== null)
    .map((d) => ({
      type: 'Feature' as const,
      geometry: d.geometry,
      properties: { kod: d.kod, nazov: d.nazovSk },
    }))

  return NextResponse.json({ type: 'FeatureCollection', features })
}
