// scripts/ingest/ruz/recompute-aggregates.test.ts
import { describe, it, expect, vi } from 'vitest'
import { recomputeAggregates } from './recompute-aggregates'

describe('recomputeAggregates', () => {
  it('nulls value columns when firm_count is below 5, keeps them when at or above 5', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { naceKod5: '56101', okresKod: 'SK0101', rok: 2023, firmCount: 3n, trzbyValues: [100, 200, 300] },
        {
          naceKod5: '56101',
          okresKod: 'SK0102',
          rok: 2023,
          firmCount: 7n,
          trzbyValues: [10, 20, 30, 40, 50, 60, 70],
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

    const bigGroupCall = prisma.firmAggregate.upsert.mock.calls.find(
      (c) => c[0].where.naceKod5_regionOrDistrictKod_granularity_rok.regionOrDistrictKod === 'SK0102'
    )
    expect(bigGroupCall[0].create.firmCount).toBe(7)
    expect(bigGroupCall[0].create.medianTrzby).toBe(40)
  })
})
