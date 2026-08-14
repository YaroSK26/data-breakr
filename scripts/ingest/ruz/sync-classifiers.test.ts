// scripts/ingest/ruz/sync-classifiers.test.ts
import { describe, it, expect, vi } from 'vitest'
import { syncClassifiers } from './sync-classifiers'
import type { RuzClient } from './client'

function fakePrisma() {
  const calls: Record<string, unknown[]> = { region: [], district: [], municipality: [], naceCode: [] }
  return {
    region: { upsert: vi.fn((args) => calls.region.push(args)) },
    district: { upsert: vi.fn((args) => calls.district.push(args)) },
    municipality: { upsert: vi.fn((args) => calls.municipality.push(args)) },
    naceCode: { upsert: vi.fn((args) => calls.naceCode.push(args)) },
    _calls: calls,
  }
}

describe('syncClassifiers', () => {
  it('upserts regions, districts, municipalities, and derives 4-digit NACE', async () => {
    const client: Partial<RuzClient> = {
      getKraje: async () => [{ kod: 'SK031', nazov: { sk: 'Žilinský kraj', en: 'Region of Žilina' } }],
      getOkresy: async () => [
        { kod: 'SK0315', nazov: { sk: 'Liptovský Mikuláš', en: 'Liptovský Mikuláš' }, nadradenaLokacia: 'SK031' },
      ],
      getSidla: async () => [
        { kod: 'SK0315510335', nazov: { sk: 'Bobrovník', en: 'Bobrovník' }, nadradenaLokacia: 'SK0315' },
      ],
      getSkNace: async () => [{ kod: '56101', nazov: { sk: 'Reštaurácie', en: 'Restaurants' } }],
    }
    const prisma = fakePrisma()

    const result = await syncClassifiers(prisma as never, client as RuzClient)

    expect(result).toEqual({ regions: 1, districts: 1, municipalities: 1, naceCodes: 1 })
    expect(prisma.region.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.district.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ kod: 'SK0315', regionKod: 'SK031' }),
      })
    )
    expect(prisma.naceCode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ kod5: '56101', kod4: '5610' }),
      })
    )
  })
})
