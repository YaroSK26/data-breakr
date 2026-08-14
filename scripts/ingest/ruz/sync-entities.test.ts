// scripts/ingest/ruz/sync-entities.test.ts
import { describe, it, expect, vi } from 'vitest'
import { syncFirms } from './sync-entities'
import type { RuzClient } from './client'

function fakePrisma() {
  return { firm: { upsert: vi.fn() } }
}

describe('syncFirms', () => {
  it('paginates ids and upserts full entity detail', async () => {
    const client: Partial<RuzClient> = {
      listChangedEntityIds: vi
        .fn()
        .mockResolvedValueOnce({ ids: [1, 2], hasMore: true })
        .mockResolvedValueOnce({ ids: [3], hasMore: false }),
      getEntity: vi.fn(async (id: number) => {
        if (id === 2) return { id, stav: 'NEVEREJNÁ' as const }
        return {
          id,
          ico: `ICO${id}`,
          nazovUJ: `Firm ${id}`,
          mesto: 'Bratislava',
          kraj: 'SK010',
          okres: 'SK0101',
          skNace: '56101',
          pravnaForma: '112',
        }
      }),
    }
    const prisma = fakePrisma()

    const result = await syncFirms(prisma as never, client as RuzClient, new Date('2026-08-01'))

    expect(result.processed).toBe(3)
    expect(client.listChangedEntityIds).toHaveBeenNthCalledWith(2, '2026-08-01T00:00:00.000Z', 2)
    expect(prisma.firm.upsert).toHaveBeenCalledTimes(3)
    // the private entity (id 2) is stored with stav only, no name/nace
    const privateCall = prisma.firm.upsert.mock.calls.find((c) => c[0].where.id === 2n)
    expect(privateCall[0].create.stav).toBe('NEVEREJNÁ')
    expect(privateCall[0].create.nazov).toBeUndefined()
  })
})
