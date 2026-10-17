// Vonkajšie hranice krajov z Eurostat GISCO NUTS 3 geometrie.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const regions = await prisma.region.findMany({
    where: { geometry: { not: undefined } },
    select: { kod: true, nazovSk: true, geometry: true },
  })

  return NextResponse.json(
    {
      type: 'FeatureCollection',
      features: regions
        .filter((region) => region.geometry !== null)
        .map((region) => ({
          type: 'Feature',
          geometry: region.geometry,
          properties: { kod: region.kod, nazov: region.nazovSk },
        })),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
