// app/api/firms-in-district/route.ts
//
// Drill-down list for the density map: firms/živnostníci in one district,
// optionally filtered by the same NACE category selected on the map.
// Capped per request - a large district can have thousands of active
// entities, and this is a list view, not a bulk export.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 100

export async function GET(req: NextRequest) {
  const okres = req.nextUrl.searchParams.get('okres')
  const nace = req.nextUrl.searchParams.get('nace')
  const q = req.nextUrl.searchParams.get('q')
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? '0')

  if (!okres) {
    return NextResponse.json({ error: 'Chýba parameter okres.' }, { status: 400 })
  }

  const where = {
    okresKod: okres,
    datumZaniku: null,
    ...(nace ? { naceKod4: nace } : {}),
    ...(q ? { nazov: { contains: q, mode: 'insensitive' as const } } : {}),
  }

  const [total, firms] = await Promise.all([
    prisma.businessEntity.count({ where }),
    prisma.businessEntity.findMany({
      where,
      select: { id: true, nazov: true, ulica: true, mesto: true, psc: true, naceKod4: true, municipalityKod: true },
      orderBy: { nazov: 'asc' },
      take: PAGE_SIZE,
      skip: offset,
    }),
  ])

  return NextResponse.json({
    total,
    offset,
    pageSize: PAGE_SIZE,
    firms: firms.map((f) => ({ ...f, id: f.id.toString() })),
  })
}
