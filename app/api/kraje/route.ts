// app/api/kraje/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const rawRegions = await prisma.region.findMany({
    select: { kod: true, nazovSk: true },
    orderBy: { nazovSk: 'asc' },
  })
  // RPO obsahuje viac technických kódov pre rovnaké zahraničné
  // územie. Vo filtri má používateľ vidieť jeden názov, nie duplicity.
  const seenNames = new Set<string>()
  const regions = rawRegions.filter((region) => {
    // normalize() + odstránenie medzier/interpunkcie zachytí aj varianty
    // s NBSP, zero-width znakom alebo iným Unicode zápisom diakritiky.
    // Všetky technické zahraničné regióny zámerne zdieľajú jeden kľúč.
    const normalizedText = region.nazovSk
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase('sk')
      .replace(/[^a-z0-9]/g, '')
    const normalized = normalizedText.startsWith('zahranic') ? 'zahranicie' : normalizedText
    if (seenNames.has(normalized)) return false
    seenNames.add(normalized)
    return true
  })
  return NextResponse.json(
    { regions },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
