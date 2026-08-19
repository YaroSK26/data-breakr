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
    // INNER JOIN, not LEFT: about 1 in 5 active NACE4 codes has no Slovak
    // name in our nace_codes table (RÚZ's classifier, our only source for
    // these names, only covers entities that file with RÚZ - RPO reports
    // more codes than that covers). Showing a bare number like "4712"
    // instead of a category name isn't useful, so this chart only ranks
    // categories we can actually label - not a claim that unlabeled
    // categories don't exist or aren't common.
    prisma.$queryRaw<CategoryCountRow[]>`
      SELECT be."nace_kod4" AS kod4, nc.nazov AS nazov, COUNT(*) AS pocet
      FROM business_entities be
      JOIN (
        -- One representative name per 4-digit code - nace_codes stores
        -- names at 5-digit granularity, so a plain join on kod4 would
        -- multiply-match and inflate the counts below.
        SELECT DISTINCT ON (kod4) kod4, nazov_sk AS nazov FROM nace_codes ORDER BY kod4, kod5
      ) nc ON nc.kod4 = be."nace_kod4"
      WHERE be."datum_zaniku" IS NULL
      GROUP BY be."nace_kod4", nc.nazov
      ORDER BY pocet DESC
      LIMIT 12
    `,
    prisma.$queryRaw<YearRow[]>`
      SELECT EXTRACT(YEAR FROM "datum_vzniku")::int AS rok, COUNT(*) AS pocet
      FROM business_entities
      WHERE "datum_vzniku" IS NOT NULL AND EXTRACT(YEAR FROM "datum_vzniku") >= 1995
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
