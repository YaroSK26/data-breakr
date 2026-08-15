// app/api/categories/route.ts
//
// Returns the list of 4-digit NACE categories actually usable for Module B
// filtering, derived from the real ingested nace_codes table rather than a
// hardcoded/guessed list. One representative Slovak name is picked per
// 4-digit group (nace_codes stores names at 5-digit granularity).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface CategoryRow {
  kod4: string
  nazov: string
}

export async function GET() {
  const rows = await prisma.$queryRaw<CategoryRow[]>`
    SELECT DISTINCT ON (kod4)
      kod4,
      nazov_sk AS nazov
    FROM nace_codes
    ORDER BY kod4, kod5
  `

  return NextResponse.json({ categories: rows })
}
