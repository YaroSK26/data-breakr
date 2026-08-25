// scripts/ingest/rpo/recompute-density.ts
import type { PrismaClient } from '@prisma/client'

// One INSERT...SELECT...ON CONFLICT instead of a per-(okres, nace) JS loop
// of individual upserts - the loop version made one round trip per row
// (tens of thousands of them against okres x NACE-code combinations), which
// over a pooled connection took hours. This does the whole recompute as a
// single statement.
export async function recomputeDensity(prisma: PrismaClient) {
  const snapshotDate = new Date()
  snapshotDate.setUTCHours(0, 0, 0, 0)

  const result = await prisma.$executeRaw`
    INSERT INTO business_density_agg
      (area_kod, granularity, nace_kod4, snapshot_date, pocet_prevadzok, pocet_na_1000_obyvatelov, computed_at)
    SELECT
      be."okres_kod",
      'okres',
      COALESCE(be."nace_kod4", ''),
      ${snapshotDate},
      COUNT(*),
      CASE WHEN dp.population > 0 THEN (COUNT(*)::float8 / dp.population) * 1000 ELSE NULL END,
      now()
    FROM business_entities be
    LEFT JOIN (
      SELECT district_kod, SUM(population) AS population
      FROM municipalities
      GROUP BY district_kod
    ) dp ON dp.district_kod = be."okres_kod"
    WHERE be."datum_zaniku" IS NULL AND be."okres_kod" IS NOT NULL
    GROUP BY be."okres_kod", COALESCE(be."nace_kod4", ''), dp.population
    ON CONFLICT (area_kod, granularity, nace_kod4, snapshot_date)
    DO UPDATE SET
      pocet_prevadzok = EXCLUDED.pocet_prevadzok,
      pocet_na_1000_obyvatelov = EXCLUDED.pocet_na_1000_obyvatelov,
      computed_at = EXCLUDED.computed_at
  `

  return { areasComputed: result }
}
