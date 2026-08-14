// scripts/ingest/rpo/sync-entities.test.ts
import { describe, it, expect, vi } from 'vitest'
import { syncBusinessEntities } from './sync-entities'
import type { RpoClient } from './client'

function fakePrisma(municipalities?: unknown[]) {
  return {
    municipality: {
      findMany: vi.fn().mockResolvedValue(
        municipalities ?? [{ kod: 'SK0315510335', districtKod: 'SK0315', district: { regionKod: 'SK031' } }]
      ),
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
    expect(result.skipped).toBe(0)
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

  it('attributes an entity to its CURRENT address municipality, not the search-loop municipality that found it', async () => {
    // The live RPO search-by-municipality endpoint matches address
    // *history*, not just the current address: an entity that used to be in
    // municipality A but has since moved to municipality B will still show
    // up when searching A. The sync must not attribute it to A.
    const prisma = fakePrisma([
      { kod: 'SK0315510335', districtKod: 'SK0315', district: { regionKod: 'SK031' } }, // A - stale, search hit
      { kod: 'SK0105529460', districtKod: 'SK0105', district: { regionKod: 'SK010' } }, // B - current
    ])
    const client: Partial<RpoClient> = {
      searchByMunicipality: vi.fn((kod: string) =>
        kod === 'SK0315510335'
          ? Promise.resolve([
              {
                id: 197264,
                identifiers: [{ value: '36407992' }],
                fullNames: [{ value: 'GEOMATIX, s.r.o.' }],
                addresses: [],
              },
            ])
          : Promise.resolve([])
      ),
      getEntity: vi.fn().mockResolvedValue({
        id: 197264,
        identifiers: [{ value: '36407992' }],
        fullNames: [{ value: 'GEOMATIX, s.r.o.' }],
        addresses: [
          // Historical address in the municipality that matched the search.
          { municipality: { code: 'SK0315510335' }, validFrom: '2002-10-09', validTo: '2007-01-23' },
          // Current address (no validTo) is in a different municipality.
          { municipality: { code: 'SK0105529460' }, validFrom: '2026-08-04' },
        ],
      }),
    }

    await syncBusinessEntities(prisma as never, client as RpoClient)

    expect(prisma.businessEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          municipalityKod: 'SK0105529460',
          okresKod: 'SK0105',
          krajKod: 'SK010',
        }),
      })
    )
  })

  it('leaves geography fields unset when the current address municipality is not in the municipalities table', async () => {
    const prisma = fakePrisma([{ kod: 'SK0315510335', districtKod: 'SK0315', district: { regionKod: 'SK031' } }])
    const client: Partial<RpoClient> = {
      searchByMunicipality: vi.fn().mockResolvedValue([
        { id: 1, identifiers: [{ value: 'ICO1' }], fullNames: [{ value: 'Firm 1' }], addresses: [] },
      ]),
      getEntity: vi.fn().mockResolvedValue({
        id: 1,
        identifiers: [{ value: 'ICO1' }],
        fullNames: [{ value: 'Firm 1' }],
        addresses: [{ municipality: { code: 'SK9999999999' }, validFrom: '2020-01-01' }],
      }),
    }

    await syncBusinessEntities(prisma as never, client as RpoClient)

    expect(prisma.businessEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          municipalityKod: undefined,
          okresKod: undefined,
          krajKod: undefined,
        }),
      })
    )
  })

  it('falls back to the search-loop municipality when the entity has no address on record at all', async () => {
    const prisma = fakePrisma()
    const client: Partial<RpoClient> = {
      searchByMunicipality: vi.fn().mockResolvedValue([
        { id: 1, identifiers: [{ value: 'ICO1' }], fullNames: [{ value: 'Firm 1' }], addresses: [] },
      ]),
      getEntity: vi.fn().mockResolvedValue({
        id: 1,
        identifiers: [{ value: 'ICO1' }],
        fullNames: [{ value: 'Firm 1' }],
        addresses: [],
      }),
    }

    await syncBusinessEntities(prisma as never, client as RpoClient)

    expect(prisma.businessEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          municipalityKod: 'SK0315510335',
          okresKod: 'SK0315',
          krajKod: 'SK031',
        }),
      })
    )
  })

  it('clears a cleared termination date on update instead of leaving the old value stale', async () => {
    const client: Partial<RpoClient> = {
      searchByMunicipality: vi.fn().mockResolvedValue([
        { id: 1, identifiers: [{ value: 'ICO1' }], fullNames: [{ value: 'Firm 1' }], addresses: [] },
      ]),
      getEntity: vi.fn().mockResolvedValue({
        id: 1,
        identifiers: [{ value: 'ICO1' }],
        fullNames: [{ value: 'Firm 1' }],
        addresses: [],
      }),
    }
    const prisma = fakePrisma()

    await syncBusinessEntities(prisma as never, client as RpoClient)

    expect(prisma.businessEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ datumZaniku: null }),
      })
    )
  })

  it('logs and skips an entity whose detail fetch fails, without aborting the rest of the batch', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client: Partial<RpoClient> = {
      searchByMunicipality: vi.fn().mockResolvedValue([
        { id: 1, identifiers: [], fullNames: [], addresses: [] },
        { id: 2, identifiers: [], fullNames: [], addresses: [] },
      ]),
      getEntity: vi.fn(async (id: number) => {
        if (id === 1) throw new Error('boom')
        return { id, identifiers: [{ value: 'ICO2' }], fullNames: [{ value: 'Firm 2' }], addresses: [] }
      }),
    }
    const prisma = fakePrisma()

    const result = await syncBusinessEntities(prisma as never, client as RpoClient)

    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(1)
    expect(prisma.businessEntity.upsert).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
