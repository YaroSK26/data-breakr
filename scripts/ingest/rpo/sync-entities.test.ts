// scripts/ingest/rpo/sync-entities.test.ts
import { describe, it, expect, vi } from 'vitest'
import { syncBusinessEntities } from './sync-entities'
import type { RpoClient } from './client'

function fakePrisma() {
  return {
    municipality: {
      findMany: vi.fn().mockResolvedValue([
        { kod: 'SK0315510335', districtKod: 'SK0315', district: { regionKod: 'SK031' } },
      ]),
    },
    businessEntity: { upsert: vi.fn() },
  }
}

describe('syncBusinessEntities', () => {
  it('searches each municipality, fetches full detail, and derives district/region from the municipality lookup', async () => {
    const client: Partial<RpoClient> = {
      searchByMunicipality: vi.fn().mockResolvedValue([
        {
          id: 9121860,
          identifiers: [{ value: '50782525' }],
          fullNames: [{ value: 'BOAT SERVICES s.r.o.' }],
          addresses: [{ municipality: { code: 'SK0315510335' } }],
          establishment: '2017-03-14',
        },
      ]),
      getEntity: vi.fn().mockResolvedValue({
        id: 9121860,
        identifiers: [{ value: '50782525' }],
        fullNames: [{ value: 'BOAT SERVICES s.r.o.' }],
        addresses: [{ municipality: { code: 'SK0315510335' } }],
        establishment: '2017-03-14',
        legalForms: [{ value: { code: '112' } }],
        statisticalCodes: { mainActivity: { value: 'Reštauračné činnosti', code: '5611' } },
      }),
    }
    const prisma = fakePrisma()

    const result = await syncBusinessEntities(prisma as never, client as RpoClient)

    expect(result.processed).toBe(1)
    expect(prisma.businessEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          id: 9121860n,
          ico: '50782525',
          naceKod4: '5611',
          municipalityKod: 'SK0315510335',
          okresKod: 'SK0315',
          krajKod: 'SK031',
        }),
      })
    )
  })
})
