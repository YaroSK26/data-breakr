// app/api/stats/route.ts
//
// Reads the precomputed cache (see StatsCache in schema.prisma) instead of
// aggregating the full business_entities table on every request.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const cache = await prisma.statsCache.findUnique({ where: { key: 'homepage' } })

  if (!cache) {
    return NextResponse.json({ error: 'Štatistiky ešte neboli vypočítané.' }, { status: 503 })
  }

  return NextResponse.json({ ...(cache.data as object), computedAt: cache.computedAt })
}
