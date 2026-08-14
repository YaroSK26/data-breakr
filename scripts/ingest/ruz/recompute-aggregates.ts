// scripts/ingest/ruz/recompute-aggregates.ts
import type { PrismaClient } from '@prisma/client'

const ANONYMITY_THRESHOLD = 5

interface RawGroup {
  naceKod5: string
  okresKod: string
  rok: number
  firmCount: bigint
  trzbyValues: number[]
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export async function recomputeAggregates(prisma: PrismaClient) {
  const groups = await prisma.$queryRaw<RawGroup[]>`
    SELECT
      f."nace_kod5" AS "naceKod5",
      f."okres_kod" AS "okresKod",
      EXTRACT(YEAR FROM fs."obdobie_do")::int AS "rok",
      COUNT(DISTINCT f.id) AS "firmCount",
      array_agg(ff."trzby") FILTER (WHERE ff."trzby" IS NOT NULL) AS "trzbyValues"
    FROM firms f
    JOIN financial_statements fs ON fs.firm_id = f.id
    JOIN financial_facts ff ON ff.statement_id = fs.id
    WHERE f."nace_kod5" IS NOT NULL AND f."okres_kod" IS NOT NULL AND fs."obdobie_do" IS NOT NULL
    GROUP BY f."nace_kod5", f."okres_kod", EXTRACT(YEAR FROM fs."obdobie_do")
  `

  for (const g of groups) {
    const firmCount = Number(g.firmCount)
    const belowThreshold = firmCount < ANONYMITY_THRESHOLD
    const medianTrzby = belowThreshold || g.trzbyValues.length === 0 ? null : median(g.trzbyValues)

    await prisma.firmAggregate.upsert({
      where: {
        naceKod5_regionOrDistrictKod_granularity_rok: {
          naceKod5: g.naceKod5,
          regionOrDistrictKod: g.okresKod,
          granularity: 'okres',
          rok: g.rok,
        },
      },
      create: {
        naceKod5: g.naceKod5,
        regionOrDistrictKod: g.okresKod,
        granularity: 'okres',
        rok: g.rok,
        firmCount,
        medianTrzby,
      },
      update: {
        firmCount,
        medianTrzby,
      },
    })
  }

  return { groupsComputed: groups.length }
}
