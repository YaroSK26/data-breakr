// app/api/benchmark/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const nace = req.nextUrl.searchParams.get('nace')
  const okres = req.nextUrl.searchParams.get('okres')

  if (!nace || !okres) {
    return NextResponse.json({ error: 'Chýba parameter nace alebo okres.' }, { status: 400 })
  }

  const rows = await prisma.firmAggregate.findMany({
    where: {
      naceKod5: nace,
      regionOrDistrictKod: okres,
      granularity: 'okres',
    },
    orderBy: { rok: 'desc' },
  })

  return NextResponse.json({ rows })
}
