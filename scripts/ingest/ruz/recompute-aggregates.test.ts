// scripts/ingest/ruz/recompute-aggregates.test.ts
import { describe, it, expect, vi } from 'vitest'
import { recomputeAggregates } from './recompute-aggregates'

describe('recomputeAggregates', () => {
  it('nulls value columns when firm_count is below 5, keeps them when at or above 5', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          naceKod5: '56101',
          okresKod: 'SK0101',
          rok: 2023,
          firmCount: 3n,
          trzbyValues: [100, 200, 300],
          vysledokValues: [10, 20, 30],
        },
        {
          naceKod5: '56101',
          okresKod: 'SK0102',
          rok: 2023,
          firmCount: 7n,
          trzbyValues: [10, 20, 30, 40, 50, 60, 70],
          vysledokValues: [1, 2, 3, 4, 5, 6, 7],
        },
      ]),
      firmAggregate: { upsert: vi.fn() },
    }

    const result = await recomputeAggregates(prisma as never)

    expect(result.groupsComputed).toBe(2)
    const smallGroupCall = prisma.firmAggregate.upsert.mock.calls.find(
      (c) => c[0].where.naceKod5_regionOrDistrictKod_granularity_rok.regionOrDistrictKod === 'SK0101'
    )
    expect(smallGroupCall[0].create.firmCount).toBe(3)
    expect(smallGroupCall[0].create.medianTrzby).toBeNull()
    expect(smallGroupCall[0].create.avgTrzby).toBeNull()
    expect(smallGroupCall[0].create.medianMarza).toBeNull()

    const bigGroupCall = prisma.firmAggregate.upsert.mock.calls.find(
      (c) => c[0].where.naceKod5_regionOrDistrictKod_granularity_rok.regionOrDistrictKod === 'SK0102'
    )
    expect(bigGroupCall[0].create.firmCount).toBe(7)
    expect(bigGroupCall[0].create.medianTrzby).toBe(40)

    // The update clause runs on every re-computation (e.g. a group that previously had >=5 firms
    // shrinks below 5 on a later run), so it must carry the same anonymization result as create.
    expect(smallGroupCall[0].update.firmCount).toBe(3)
    expect(smallGroupCall[0].update.medianTrzby).toBeNull()
    expect(bigGroupCall[0].update.firmCount).toBe(7)
    expect(bigGroupCall[0].update.medianTrzby).toBe(40)
  })

  it('computes a real median when firm_count is exactly at the anonymization threshold (5)', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          naceKod5: '56101',
          okresKod: 'SK0103',
          rok: 2023,
          firmCount: 5n,
          trzbyValues: [10, 20, 30, 40, 50],
          vysledokValues: [1, 2, 3, 4, 5],
        },
      ]),
      firmAggregate: { upsert: vi.fn() },
    }

    await recomputeAggregates(prisma as never)

    const call = prisma.firmAggregate.upsert.mock.calls[0]
    expect(call[0].create.firmCount).toBe(5)
    expect(call[0].create.medianTrzby).toBe(30)
    expect(call[0].create.medianTrzby).not.toBeNull()
  })

  it('computes the average of the two middle values for an even-length trzby array', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          naceKod5: '56101',
          okresKod: 'SK0104',
          rok: 2023,
          firmCount: 6n,
          trzbyValues: [40, 10, 30, 20],
          vysledokValues: [4, 1, 3, 2],
        },
      ]),
      firmAggregate: { upsert: vi.fn() },
    }

    await recomputeAggregates(prisma as never)

    const call = prisma.firmAggregate.upsert.mock.calls[0]
    // sorted: [10, 20, 30, 40] -> average of the two middle values (20, 30) = 25
    expect(call[0].create.medianTrzby).toBe(25)
  })

  it('computes avgTrzby and medianMarza from paired trzby/vysledokHospodarenia values', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          naceKod5: '56101',
          okresKod: 'SK0105',
          rok: 2023,
          firmCount: 5n,
          // trzby: 100, 200, 300, 400, 500 -> avg = 300
          // marza (vysledok/trzby): 10/100=.1, 40/200=.2, 90/300=.3, 160/400=.4, 250/500=.5 -> median = .3
          trzbyValues: [100, 200, 300, 400, 500],
          vysledokValues: [10, 40, 90, 160, 250],
        },
      ]),
      firmAggregate: { upsert: vi.fn() },
    }

    await recomputeAggregates(prisma as never)

    const call = prisma.firmAggregate.upsert.mock.calls[0]
    expect(call[0].create.avgTrzby).toBe(300)
    expect(call[0].create.medianMarza).toBeCloseTo(0.3)
  })

  it('skips a firm-year pair from medianMarza when trzby is zero (avoids division by zero)', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          naceKod5: '56101',
          okresKod: 'SK0106',
          rok: 2023,
          firmCount: 5n,
          trzbyValues: [0, 100, 200, 300, 400],
          vysledokValues: [5, 10, 20, 30, 40],
        },
      ]),
      firmAggregate: { upsert: vi.fn() },
    }

    await recomputeAggregates(prisma as never)

    const call = prisma.firmAggregate.upsert.mock.calls[0]
    // marza values only from the 4 non-zero-trzby firms: .1, .1, .1, .1 -> median .1
    expect(call[0].create.medianMarza).toBeCloseTo(0.1)
  })

  it('computes yoyTrendPct by comparing to the same group last year, only when neither year is anonymized', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          naceKod5: '56101',
          okresKod: 'SK0107',
          rok: 2022,
          firmCount: 5n,
          trzbyValues: [100, 100, 100, 100, 100],
          vysledokValues: [1, 1, 1, 1, 1],
        },
        {
          naceKod5: '56101',
          okresKod: 'SK0107',
          rok: 2023,
          firmCount: 5n,
          trzbyValues: [150, 150, 150, 150, 150],
          vysledokValues: [1, 1, 1, 1, 1],
        },
      ]),
      firmAggregate: { upsert: vi.fn() },
    }

    await recomputeAggregates(prisma as never)

    const y2022 = prisma.firmAggregate.upsert.mock.calls.find((c) => c[0].where.naceKod5_regionOrDistrictKod_granularity_rok.rok === 2022)
    const y2023 = prisma.firmAggregate.upsert.mock.calls.find((c) => c[0].where.naceKod5_regionOrDistrictKod_granularity_rok.rok === 2023)

    // No prior year available for 2022 in this fixture.
    expect(y2022[0].create.yoyTrendPct).toBeNull()
    // (150 - 100) / 100 * 100 = 50%
    expect(y2023[0].create.yoyTrendPct).toBe(50)
  })

  it('does not compute yoyTrendPct across an anonymized year', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          naceKod5: '56101',
          okresKod: 'SK0108',
          rok: 2022,
          firmCount: 2n, // below threshold - anonymized
          trzbyValues: [100, 100],
          vysledokValues: [1, 1],
        },
        {
          naceKod5: '56101',
          okresKod: 'SK0108',
          rok: 2023,
          firmCount: 6n,
          trzbyValues: [150, 150, 150, 150, 150, 150],
          vysledokValues: [1, 1, 1, 1, 1, 1],
        },
      ]),
      firmAggregate: { upsert: vi.fn() },
    }

    await recomputeAggregates(prisma as never)

    const y2023 = prisma.firmAggregate.upsert.mock.calls.find((c) => c[0].where.naceKod5_regionOrDistrictKod_granularity_rok.rok === 2023)
    // 2022's medianTrzby was anonymized to null, so it must not have been recorded as a
    // usable "previous year" value - yoyTrendPct must stay null, not compute against it.
    expect(y2023[0].create.yoyTrendPct).toBeNull()
  })
})
