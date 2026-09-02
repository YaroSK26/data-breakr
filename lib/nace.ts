// lib/nace.ts
//
// Two NACE revisions meet in this app:
//
//   - business_entities.nace_kod4 - NACE Rev. 2.1 classes, what RPO has
//     published since the 2025 changeover. This is what the filters query.
//   - firms.nace_kod5 - SK NACE Rev. 2 subclasses, what RÚZ still codes
//     accounting entities in, and what any link shared before this change
//     carries in its ?nace= parameter.
//
// resolveNaceFilter() turns whatever code arrives into the set of Rev. 2.1
// classes to filter on, using ŠÚ SR's official prevodník
// (nace_rev2_to_rev21). A Rev. 2 code can map to several Rev. 2.1 classes
// - 47.19.0 alone was split across 47.11, 47.12 and 47.13 - so the result
// is a list, not a single code.
import type { PrismaClient } from '@prisma/client'

export async function resolveNaceFilter(prisma: PrismaClient, code: string): Promise<string[]> {
  const kod = code.trim()
  if (!kod) return []

  // Already a Rev. 2.1 class: the overwhelmingly common case, one indexed
  // lookup, no expansion.
  const current = await prisma.nace21Code.findFirst({
    where: { kod, uroven: 4 },
    select: { kod: true },
  })
  if (current) return [current.kod]

  // A Rev. 2 subclass ("62010") maps directly; a Rev. 2 class ("6201")
  // covers all its subclasses, so match on the 4-digit prefix.
  const mapped = await prisma.naceRev2ToRev21.findMany({
    where: kod.length === 5 ? { rev2Kod5: kod } : { rev2Kod5: { startsWith: kod } },
    select: { rev21Kod4: true },
    distinct: ['rev21Kod4'],
  })

  // Nothing recognised it: hand the code back unchanged so the caller
  // filters on it and returns an empty result, rather than silently
  // dropping the filter and showing the whole country.
  return mapped.length > 0 ? mapped.map((m) => m.rev21Kod4) : [kod]
}
