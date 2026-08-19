// app/api/firms-in-district/route.ts
//
// Drill-down list for the density map: firms/živnostníci in one district,
// optionally filtered by the same NACE category selected on the map.
// Capped per request - a large district can have thousands of active
// entities, and this is a list view, not a bulk export.
//
// Deduped by IČO: the source register can carry more than one entity row
// for the same real-world business (e.g. a re-registration event under an
// unchanged IČO gets a new internal RPO id) - about 2% of active IČOs have
// this. DISTINCT ON (ičo) collapses those to one representative row,
// preferring the one with a populated address, then the most recently
// established. Entities without a usable IČO ("Neuvedené"/null) aren't
// deduped against each other - each is kept as its own row.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 100

interface FirmRow {
  id: bigint
  ico: string | null
  nazov: string | null
  ulica: string | null
  mesto: string | null
  psc: string | null
  naceKod4: string | null
}

export async function GET(req: NextRequest) {
  const okres = req.nextUrl.searchParams.get('okres')
  const nace = req.nextUrl.searchParams.get('nace')
  const q = req.nextUrl.searchParams.get('q')
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? '0')

  if (!okres) {
    return NextResponse.json({ error: 'Chýba parameter okres.' }, { status: 400 })
  }

  const filters = Prisma.sql`
    okres_kod = ${okres}
    AND datum_zaniku IS NULL
    ${nace ? Prisma.sql`AND nace_kod4 = ${nace}` : Prisma.empty}
    ${q ? Prisma.sql`AND nazov ILIKE ${'%' + q + '%'}` : Prisma.empty}
  `

  const dedupedCte = Prisma.sql`
    SELECT DISTINCT ON (COALESCE(NULLIF(ico, 'Neuvedené'), id::text))
      id, ico, nazov, ulica, mesto, psc, nace_kod4 AS "naceKod4"
    FROM business_entities
    WHERE ${filters}
    ORDER BY COALESCE(NULLIF(ico, 'Neuvedené'), id::text), (ulica IS NOT NULL) DESC, datum_vzniku DESC NULLS LAST
  `

  const [totalRows, firms] = await Promise.all([
    prisma.$queryRaw<{ cnt: bigint }[]>`SELECT COUNT(*) AS cnt FROM (${dedupedCte}) x`,
    prisma.$queryRaw<FirmRow[]>`
      SELECT * FROM (${dedupedCte}) x
      ORDER BY nazov ASC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `,
  ])

  return NextResponse.json({
    total: Number(totalRows[0]?.cnt ?? 0),
    offset,
    pageSize: PAGE_SIZE,
    firms: firms.map((f) => ({ ...f, id: f.id.toString() })),
  })
}
