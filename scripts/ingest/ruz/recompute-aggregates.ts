// scripts/ingest/ruz/recompute-aggregates.ts
import type { PrismaClient } from '@prisma/client'

const ANONYMITY_THRESHOLD = 5

interface RawGroup {
  naceKod5: string
  okresKod: string
  rok: number
  firmCount: bigint
  trzbyValues: number[] | null
  vysledokValues: (number | null)[] | null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export async function recomputeAggregates(prisma: PrismaClient) {
  const groups = await prisma.$queryRaw<RawGroup[]>`
    SELECT
      f."nace_kod5" AS "naceKod5",
      f."okres_kod" AS "okresKod",
      EXTRACT(YEAR FROM fs."obdobie_do")::int AS "rok",
      COUNT(DISTINCT f.id) AS "firmCount",
      array_agg(ff."trzby") FILTER (WHERE ff."trzby" IS NOT NULL) AS "trzbyValues",
      array_agg(ff."vysledok_hospodarenia") FILTER (WHERE ff."trzby" IS NOT NULL) AS "vysledokValues"
    FROM firms f
    JOIN financial_statements fs ON fs.firm_id = f.id
    JOIN financial_facts ff ON ff.statement_id = fs.id
    WHERE f."nace_kod5" IS NOT NULL AND f."okres_kod" IS NOT NULL AND fs."obdobie_do" IS NOT NULL
    GROUP BY f."nace_kod5", f."okres_kod", EXTRACT(YEAR FROM fs."obdobie_do")
  `

  // medianTrzby per (naceKod5, okresKod, rok), tracked separately so a
  // second pass can compute year-over-year trend without re-querying.
  // Only populated for groups at/above the anonymity threshold - a below-
  // threshold year must not leak into an adjacent year's trend either.
  const medianByGroupYear = new Map<string, number>()
  const computed: {
    naceKod5: string
    okresKod: string
    rok: number
    firmCount: number
    medianTrzby: number | null
    avgTrzby: number | null
    medianMarza: number | null
  }[] = []

  for (const g of groups) {
    const firmCount = Number(g.firmCount)
    const belowThreshold = firmCount < ANONYMITY_THRESHOLD
    // Postgres's array_agg(...) FILTER (...) returns SQL NULL, not an
    // empty array, when the filter excludes every row in the group (e.g.
    // every statement in this nace/okres/year has an undecoded trzby).
    // Real production data hits this constantly - most financial_facts
    // rows currently have decode_confidence='template_unmapped'.
    const trzbyValues = g.trzbyValues ?? []
    const vysledokValues = g.vysledokValues ?? []
    const hasValues = trzbyValues.length > 0

    const medianTrzby = belowThreshold || !hasValues ? null : median(trzbyValues)
    const avgTrzby = belowThreshold || !hasValues ? null : average(trzbyValues)

    const marzaValues: number[] = []
    if (!belowThreshold) {
      for (let i = 0; i < trzbyValues.length; i++) {
        const trzby = trzbyValues[i]
        const vysledok = vysledokValues[i]
        if (trzby && vysledok !== null && vysledok !== undefined) {
          marzaValues.push(vysledok / trzby)
        }
      }
    }
    const medianMarza = belowThreshold || marzaValues.length === 0 ? null : median(marzaValues)

    if (medianTrzby !== null) {
      medianByGroupYear.set(`${g.naceKod5}|${g.okresKod}|${g.rok}`, medianTrzby)
    }

    computed.push({
      naceKod5: g.naceKod5,
      okresKod: g.okresKod,
      rok: g.rok,
      firmCount,
      medianTrzby,
      avgTrzby,
      medianMarza,
    })
  }

  for (const c of computed) {
    const prevKey = `${c.naceKod5}|${c.okresKod}|${c.rok - 1}`
    const prevMedian = medianByGroupYear.get(prevKey)
    const yoyTrendPct =
      c.medianTrzby !== null && prevMedian !== undefined && prevMedian !== 0
        ? ((c.medianTrzby - prevMedian) / prevMedian) * 100
        : null

    await prisma.firmAggregate.upsert({
      where: {
        naceKod5_regionOrDistrictKod_granularity_rok: {
          naceKod5: c.naceKod5,
          regionOrDistrictKod: c.okresKod,
          granularity: 'okres',
          rok: c.rok,
        },
      },
      create: {
        naceKod5: c.naceKod5,
        regionOrDistrictKod: c.okresKod,
        granularity: 'okres',
        rok: c.rok,
        firmCount: c.firmCount,
        medianTrzby: c.medianTrzby,
        avgTrzby: c.avgTrzby,
        medianMarza: c.medianMarza,
        yoyTrendPct,
      },
      update: {
        firmCount: c.firmCount,
        medianTrzby: c.medianTrzby,
        avgTrzby: c.avgTrzby,
        medianMarza: c.medianMarza,
        yoyTrendPct,
      },
    })
  }

  return { groupsComputed: groups.length }
}
