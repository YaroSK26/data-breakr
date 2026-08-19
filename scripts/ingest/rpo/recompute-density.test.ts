// scripts/ingest/rpo/recompute-density.test.ts
import { describe, it, expect, vi } from 'vitest'
import { recomputeDensity } from './recompute-density'

describe('recomputeDensity', () => {
  it('computes count per district and per-1000-population ratio when population is known', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { okresKod: 'SK0315', naceKod4: '5611', pocet: 12n, population: 6000 },
        { okresKod: 'SK0101', naceKod4: '5611', pocet: 40n, population: null },
      ]),
      businessDensityAgg: { upsert: vi.fn() },
    }

    const result = await recomputeDensity(prisma as never)

    expect(result.areasComputed).toBe(2)
    const withPop = prisma.businessDensityAgg.upsert.mock.calls.find(
      (c) => c[0].where.areaKod_granularity_naceKod4_snapshotDate.areaKod === 'SK0315'
    )!
    expect(withPop[0].create.pocetPrevadzok).toBe(12)
    expect(withPop[0].create.pocetNa1000Obyvatelov).toBe(2)

    const withoutPop = prisma.businessDensityAgg.upsert.mock.calls.find(
      (c) => c[0].where.areaKod_granularity_naceKod4_snapshotDate.areaKod === 'SK0101'
    )!
    expect(withoutPop[0].create.pocetNa1000Obyvatelov).toBeNull()
  })

  it('normalizes naceKod4 identically in where and create/update so re-runs upsert, not duplicate, a null-NACE group', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { okresKod: 'SK0315', naceKod4: null, pocet: 5n, population: null },
      ]),
      businessDensityAgg: { upsert: vi.fn() },
    }

    await recomputeDensity(prisma as never)

    const [call] = prisma.businessDensityAgg.upsert.mock.calls
    const whereNaceKod4 = call[0].where.areaKod_granularity_naceKod4_snapshotDate.naceKod4
    expect(whereNaceKod4).toBe('')
    expect(call[0].create.naceKod4).toBe(whereNaceKod4)
    expect(call[0].update).not.toHaveProperty('naceKod4')
  })

  it('handles a BigInt population sum from a real Postgres SUM() without throwing', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { okresKod: 'SK0315', naceKod4: '5611', pocet: 3n, population: 500n },
      ]),
      businessDensityAgg: { upsert: vi.fn() },
    }

    await recomputeDensity(prisma as never)

    const [call] = prisma.businessDensityAgg.upsert.mock.calls
    expect(call[0].create.pocetNa1000Obyvatelov).toBe(6)
  })
})
