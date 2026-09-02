// app/api/categories/route.ts
//
// Returns the NACE categories usable for Module B filtering.
//
// These are NACE Rev. 2.1 classes (nace21_codes, level 4), because that is
// the revision RPO codes business_entities.nace_kod4 in since the 2025
// changeover. The list used to be built from nace_codes - RÚZ's SK NACE
// Rev. 2 classifier - which left ~35% of registered entities (4712, 7020,
// 6210, 4100, 8210 ...) unmatched by any option in the filter, and offered
// retired Rev. 2 options (47.11, 62.01, 70.22) that match nothing at all.
//
// Only classes that at least one active entity is actually coded in are
// returned, so picking a category never yields an empty map.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// The EXISTS probe runs 651 index lookups over 2.2M business_entities rows
// (~1.2s cold). The answer only changes when an ingest run introduces a
// category nobody was registered in before, so serve it from the cache for
// a day rather than paying that on every page load.
export const revalidate = 86400

interface CategoryRow {
  kod4: string
  nazov: string
  sekcia: string
  sekciaNazov: string
}

export async function GET() {
  const rows = await prisma.$queryRaw<CategoryRow[]>`
    SELECT
      trieda.kod       AS kod4,
      trieda.nazov_sk  AS nazov,
      sekcia.kod       AS "sekcia",
      sekcia.nazov_sk  AS "sekciaNazov"
    FROM nace21_codes trieda
    -- class -> group -> division -> section, so each option can be shown
    -- with the industry it belongs to.
    JOIN nace21_codes skupina ON skupina.kod = trieda.parent_kod
    JOIN nace21_codes divizia ON divizia.kod = skupina.parent_kod
    JOIN nace21_codes sekcia  ON sekcia.kod  = divizia.parent_kod
    WHERE trieda.uroven = 4
      AND EXISTS (
        SELECT 1 FROM business_entities be
        WHERE be.nace_kod4 = trieda.kod AND be.datum_zaniku IS NULL
      )
    ORDER BY trieda.kod
  `

  return NextResponse.json({ categories: rows })
}
