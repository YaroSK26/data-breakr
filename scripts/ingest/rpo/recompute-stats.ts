// scripts/ingest/rpo/recompute-stats.ts
//
// Computes the /statistiky aggregates once and caches them - see
// StatsCache model comment in schema.prisma for why.
import type { PrismaClient } from '@prisma/client'

interface DistrictCountRow {
  okresKod: string
  nazovSk: string
  pocet: bigint
}

interface CategoryCountRow {
  kod4: string
  nazov: string
  pocet: bigint
}

interface YearRow {
  rok: number
  pocet: bigint
}

export async function recomputeStats(prisma: PrismaClient) {
  const [totalActive, totalTerminated, allDistrictCounts, byCategory, byYearRaw] = await Promise.all([
    prisma.businessEntity.count({ where: { datumZaniku: null } }),
    prisma.businessEntity.count({ where: { datumZaniku: { not: null } } }),
    prisma.$queryRaw<DistrictCountRow[]>`
      SELECT be."okres_kod" AS "okresKod", d.nazov_sk AS "nazovSk", COUNT(*) AS pocet
      FROM business_entities be
      JOIN districts d ON d.kod = be."okres_kod"
      WHERE be."datum_zaniku" IS NULL AND be."okres_kod" IS NOT NULL
      GROUP BY be."okres_kod", d.nazov_sk
    `,
    // Named from nace21_codes (NACE Rev. 2.1), the revision RPO codes these
    // entities in. This used to join RÚZ's SK NACE Rev. 2 list, which had
    // no name for about 1 in 5 active codes - and because this is a top-12
    // ranking, the unnamed ones were exactly the biggest categories (4712,
    // 4335, 7020, 4100), so the chart silently showed 7th-18th place as if
    // it were 1st-12th.
    prisma.$queryRaw<CategoryCountRow[]>`
      SELECT be."nace_kod4" AS kod4, COALESCE(nc.nazov_sk, be."nace_kod4") AS nazov, COUNT(*) AS pocet
      FROM business_entities be
      LEFT JOIN nace21_codes nc ON nc.kod = be."nace_kod4" AND nc.uroven = 4
      WHERE be."datum_zaniku" IS NULL AND be."nace_kod4" IS NOT NULL
      GROUP BY be."nace_kod4", nc.nazov_sk
      ORDER BY pocet DESC
      LIMIT 12
    `,
    // Upper-bounded at the current year, not just >= 1995 - a handful of
    // source records carry a datum_vzniku dated into next year (bad/typo
    // data from RPO, not real future registrations), which would otherwise
    // show up as a stray bar past "today" on the chart.
    prisma.$queryRaw<YearRow[]>`
      SELECT EXTRACT(YEAR FROM "datum_vzniku")::int AS rok, COUNT(*) AS pocet
      FROM business_entities
      WHERE "datum_vzniku" IS NOT NULL
        AND EXTRACT(YEAR FROM "datum_vzniku") BETWEEN 1995 AND EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY rok
      ORDER BY rok ASC
    `,
  ])

  // Bratislava (5 mestských okresov) and Košice (4) are administratively
  // split - a raw per-district ranking makes them look smaller than
  // single-district cities like Žilina or Nitra with comparable real
  // population/economic size. Merge each city's districts into one entry
  // before ranking, so the comparison is apples-to-apples.
  const merged = new Map<string, number>()
  for (const r of allDistrictCounts) {
    const displayName = r.nazovSk.startsWith('Bratislava')
      ? 'Bratislava (spolu)'
      : r.nazovSk.startsWith('Košice')
        ? 'Košice (spolu)'
        : r.nazovSk
    merged.set(displayName, (merged.get(displayName) ?? 0) + Number(r.pocet))
  }
  const byDistrict = Array.from(merged.entries())
    .map(([nazov, pocet]) => ({ nazov, pocet }))
    .sort((a, b) => b.pocet - a.pocet)
    .slice(0, 15)

  const data = {
    totalActive,
    totalTerminated,
    byDistrict,
    byCategory: byCategory.map((r) => ({ kod4: r.kod4, nazov: r.nazov ?? r.kod4, pocet: Number(r.pocet) })),
    byYear: byYearRaw.map((r) => ({ rok: r.rok, pocet: Number(r.pocet) })),
  }

  await prisma.statsCache.upsert({
    where: { key: 'homepage' },
    create: { key: 'homepage', data, computedAt: new Date() },
    update: { data, computedAt: new Date() },
  })

  return data
}
