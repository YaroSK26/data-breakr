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
    expect(result.skipped).toBe(0)
    expect(client.listChangedEntityIds).toHaveBeenNthCalledWith(2, '2026-08-01T00:00:00.000Z', 2)
    expect(prisma.firm.upsert).toHaveBeenCalledTimes(3)
    // the private entity (id 2) is stored with stav only on create, and has
    // every other field explicitly nulled out on update (it may have been
    // public - and fully populated - before going private)
    const privateCall = prisma.firm.upsert.mock.calls.find((c) => c[0].where.id === 2n)![0]
    expect(privateCall.create.stav).toBe('NEVEREJNÁ')
    expect(privateCall.create.nazov).toBeUndefined()
    expect(privateCall.update.stav).toBe('NEVEREJNÁ')
    expect(privateCall.update.nazov).toBeNull()
    expect(privateCall.update.ico).toBeNull()
    expect(privateCall.update.okresKod).toBeNull()
  })

  it('clears a cleared dissolution date on update instead of leaving the old value stale', async () => {
    const client: Partial<RuzClient> = {
      listChangedEntityIds: vi.fn().mockResolvedValueOnce({ ids: [7], hasMore: false }),
      getEntity: vi.fn().mockResolvedValue({ id: 7, nazovUJ: 'Firm 7' }),
    }
    const prisma = fakePrisma()

    await syncFirms(prisma as never, client as RuzClient, new Date('2026-08-01'))

    expect(prisma.firm.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ datumZrusenia: null }),
      })
    )
  })

  it('logs and skips a record whose detail fetch fails, without aborting the rest of the batch', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client: Partial<RuzClient> = {
      listChangedEntityIds: vi.fn().mockResolvedValueOnce({ ids: [1, 2, 3], hasMore: false }),
      getEntity: vi.fn(async (id: number) => {
        if (id === 2) throw new Error('boom')
        return { id, ico: `ICO${id}`, nazovUJ: `Firm ${id}` }
      }),
    }
    const prisma = fakePrisma()

    const result = await syncFirms(prisma as never, client as RuzClient, new Date('2026-08-01'))

    expect(result.processed).toBe(2)
    expect(result.skipped).toBe(1)
    expect(prisma.firm.upsert).toHaveBeenCalledTimes(2)
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('stops paginating when hasMore is true but the id page comes back empty', async () => {
    const client: Partial<RuzClient> = {
      listChangedEntityIds: vi.fn().mockResolvedValueOnce({ ids: [], hasMore: true }),
      getEntity: vi.fn(),
    }
    const prisma = fakePrisma()

    const result = await syncFirms(prisma as never, client as RuzClient, new Date('2026-08-01'))

    expect(result.processed).toBe(0)
    expect(client.listChangedEntityIds).toHaveBeenCalledTimes(1)
  })
})
