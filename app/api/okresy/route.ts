// app/api/okresy/route.ts
//
// Plochý zoznam okresov pre výbery vo formulároch. Existujúce endpointy
// vracajú okresy vždy až spolu s dátami (/api/susr-okresy ich filtruje
// podľa ukazovateľa, /api/district-boundaries k nim pridáva geometriu),
// takže výber okresu v rýchlom prehľade by si inak musel stiahnuť ~2 MB
// polygónov len kvôli názvom.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Okresy sa nemenia ingestom - zoznam je stabilný medzi behmi.
export const revalidate = 86400

export async function GET() {
  const okresy = await prisma.district.findMany({
    select: { kod: true, nazovSk: true, region: { select: { nazovSk: true } } },
    orderBy: { nazovSk: 'asc' },
  })

  return NextResponse.json({
    okresy: okresy.map((o) => ({ kod: o.kod, nazov: o.nazovSk, kraj: o.region.nazovSk })),
  })
}
