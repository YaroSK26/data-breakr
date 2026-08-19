// app/api/municipalities-geo/route.ts
//
// Static municipality shapes (geometry + names), split out from
// /api/density so the ~2MB of polygon geometry is fetched once on mount
// instead of being re-transferred on every NACE/metric filter change (the
// geometry never changes, only the density values do).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const municipalities = await prisma.municipality.findMany({
    where: { geometry: { not: undefined } },
    select: {
      kod: true,
      nazov: true,
      districtKod: true,
      population: true,
      geometry: true,
      district: { select: { nazovSk: true } },
    },
  })

  const features = municipalities
    .filter((m) => m.geometry !== null)
    .map((m) => ({
      type: 'Feature' as const,
      geometry: m.geometry,
      properties: {
        kod: m.kod,
        nazov: m.nazov,
        okresKod: m.districtKod,
        okresNazov: m.district.nazovSk,
        population: m.population,
      },
    }))

  return NextResponse.json({ type: 'FeatureCollection', features })
}
