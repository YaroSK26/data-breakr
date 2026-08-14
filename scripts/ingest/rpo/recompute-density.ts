// scripts/ingest/rpo/recompute-density.ts
import type { PrismaClient } from '@prisma/client'

interface RawDensityRow {
  okresKod: string
  naceKod4: string | null
  pocet: bigint
  population: number | null
}

export async function recomputeDensity(prisma: PrismaClient) {
  const snapshotDate = new Date()
  snapshotDate.setUTCHours(0, 0, 0, 0)

  const rows = await prisma.$queryRaw<RawDensityRow[]>`
    SELECT
      be."okres_kod" AS "okresKod",
      be."nace_kod4" AS "naceKod4",
      COUNT(*) AS "pocet",
      SUM(m.population) AS "population"
    FROM business_entities be
    JOIN municipalities m ON m.district_kod = be."okres_kod"
    WHERE be."datum_zaniku" IS NULL AND be."okres_kod" IS NOT NULL
    GROUP BY be."okres_kod", be."nace_kod4"
  `

  for (const row of rows) {
    const pocet = Number(row.pocet)
    const pocetNa1000 = row.population ? (pocet / row.population) * 1000 : null

    await prisma.businessDensityAgg.upsert({
      where: {
        areaKod_granularity_naceKod4_snapshotDate: {
          areaKod: row.okresKod,
          granularity: 'okres',
          naceKod4: row.naceKod4 ?? '',
          snapshotDate,
        },
      },
      create: {
        areaKod: row.okresKod,
        granularity: 'okres',
        naceKod4: row.naceKod4,
        snapshotDate,
        pocetPrevadzok: pocet,
        pocetNa1000Obyvatelov: pocetNa1000,
      },
      update: {
        pocetPrevadzok: pocet,
        pocetNa1000Obyvatelov: pocetNa1000,
      },
    })
  }

  return { areasComputed: rows.length }
}
