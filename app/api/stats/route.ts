// app/api/stats/route.ts
//
// Reads the precomputed cache (see StatsCache in schema.prisma) instead of
// aggregating the full business_entities table on every request.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { LEGAL_FORMS } from '@/lib/legalForms'

export const revalidate = 3600

interface LegalFormRow {
  kod: string
  pocet: bigint
}

const OTHER_LEGAL_FORM_CODES = new Set(['001', '005', '102'])

export async function GET() {
  const cache = await prisma.statsCache.findUnique({ where: { key: 'homepage' } })

  if (!cache) {
    return NextResponse.json({ error: 'Štatistiky ešte neboli vypočítané.' }, { status: 503 })
  }

  const [[zaniky], legalFormRows] = await Promise.all([
    prisma.$queryRaw<{ pocet: bigint }[]>(Prisma.sql`
      SELECT COALESCE(SUM(pocet), 0)::bigint AS pocet
      FROM zaniknute_agg
      WHERE rok_zaniku = 2025
    `),
    prisma.$queryRaw<LegalFormRow[]>(Prisma.sql`
      SELECT COALESCE(pravna_forma_kod, 'NEUVEDENE') AS kod, COUNT(*)::bigint AS pocet
      FROM business_entities
      WHERE datum_zaniku IS NULL
      GROUP BY pravna_forma_kod
      ORDER BY pocet DESC
    `),
  ])
  const legalFormNames = new Map(LEGAL_FORMS.map((form) => [form.kod, form.nazov]))
  const isOtherLegalForm = (kod: string) =>
    OTHER_LEGAL_FORM_CODES.has(kod) || (kod !== 'NEUVEDENE' && !legalFormNames.has(kod))
  const otherLegalFormsCount = legalFormRows.reduce(
    (sum, form) => sum + (isOtherLegalForm(form.kod) ? Number(form.pocet) : 0),
    0,
  )
  const byLegalForm = legalFormRows
    .filter((form) => !isOtherLegalForm(form.kod))
    .map((form) => ({
      kod: form.kod,
      nazov: form.kod === 'NEUVEDENE'
        ? 'Bez uvedenej právnej formy'
        : legalFormNames.get(form.kod)!,
      pocet: Number(form.pocet),
    }))

  if (otherLegalFormsCount > 0) {
    byLegalForm.push({
      kod: 'INE',
      nazov: 'Iné',
      pocet: otherLegalFormsCount,
    })
  }

  byLegalForm.sort((a, b) => b.pocet - a.pocet)

  return NextResponse.json({
    ...(cache.data as object),
    zaniklo2025: Number(zaniky?.pocet ?? 0),
    byLegalForm,
    computedAt: cache.computedAt,
  })
}
