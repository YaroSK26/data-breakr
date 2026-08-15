// app/api/districts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const onlyWithBenchmarkData = req.nextUrl.searchParams.get('onlyWithBenchmarkData') === 'true'

  if (onlyWithBenchmarkData) {
    // Ingestion so far only covers a partial national sample (a bounded
    // pilot run, not full RÚZ coverage), so most districts have zero
    // firm_aggregates rows - listing all 82 nationally would mostly lead
    // to a dead-end "no data" result. Scope the selector to what's real.
    const withData = await prisma.firmAggregate.findMany({
      select: { regionOrDistrictKod: true },
      distinct: ['regionOrDistrictKod'],
    })
    const kods = withData.map((d) => d.regionOrDistrictKod)
    const districts = await prisma.district.findMany({
      where: { kod: { in: kods } },
      select: { kod: true, nazovSk: true, regionKod: true },
      orderBy: { nazovSk: 'asc' },
    })
    return NextResponse.json({ districts })
  }

  const districts = await prisma.district.findMany({
    select: { kod: true, nazovSk: true, regionKod: true },
    orderBy: { nazovSk: 'asc' },
  })
  return NextResponse.json({ districts })
}
