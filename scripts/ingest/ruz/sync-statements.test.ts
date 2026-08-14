// scripts/ingest/ruz/sync-statements.test.ts
import { describe, it, expect, vi } from 'vitest'
import { syncStatements } from './sync-statements'
import type { RuzClient } from './client'

function fakePrisma() {
  return {
    financialStatement: { upsert: vi.fn() },
    financialFacts: { upsert: vi.fn() },
    reportTemplate: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
  }
}

describe('syncStatements', () => {
  it('fetches both linked vykazy, finds the structured one, caches the template, and decodes facts', async () => {
    const client: Partial<RuzClient> = {
      listChangedStatementIds: vi.fn().mockResolvedValueOnce({ ids: [4847452], hasMore: false }),
      getStatement: vi.fn().mockResolvedValue({
        id: 4847452,
        idUJ: 1685621,
        obdobieOd: '2020-01',
        obdobieDo: '2020-12',
        typ: 'Riadna',
        idUctovnychVykazov: [10408386, 7716025],
      }),
      getVykaz: vi.fn(async (id: number) => {
        if (id === 10408386) return { id, idSablony: 1181, pristupnostDat: 'Verejné' } // PDF-only
        return {
          id,
          idSablony: 687,
          pristupnostDat: 'Verejné',
          obsah: {
            tabulky: [{ nazov: { sk: 'Výkaz ziskov a strát' }, data: ['12000', '', '', '', '12000'] }],
          },
        }
      }),
      getSablona: vi.fn().mockResolvedValue({
        id: 687,
        nazov: 'Úč MUJ',
        tabulky: [
          {
            nazov: { sk: 'Výkaz ziskov a strát' },
            pocetDatovychStlpcov: 2,
            riadky: [{ cisloRiadku: 1, text: { sk: 'Výnosy z hospodárskej činnosti spolu' } }],
          },
        ],
      }),
    }
    const prisma = fakePrisma()

    const result = await syncStatements(prisma as never, client as RuzClient, new Date('2026-08-01'))

    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(0)
    expect(client.getVykaz).toHaveBeenCalledTimes(2)
    expect(prisma.reportTemplate.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.financialStatement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ id: 4847452n, idSablony: 687 }),
      })
    )
    expect(prisma.financialFacts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ statementId: 4847452n, trzby: 12000 }),
      })
    )
  })

  it('clears a fact that now decodes to null on update instead of leaving the stale value in place', async () => {
    const client: Partial<RuzClient> = {
      listChangedStatementIds: vi.fn().mockResolvedValueOnce({ ids: [1], hasMore: false }),
      getStatement: vi.fn().mockResolvedValue({
        id: 1,
        idUJ: 2,
        idUctovnychVykazov: [10],
      }),
      getVykaz: vi.fn().mockResolvedValue({
        id: 10,
        idSablony: 687,
        pristupnostDat: 'Verejné',
        obsah: { tabulky: [{ nazov: { sk: 'Výkaz ziskov a strát' }, data: [] }] },
      }),
      getSablona: vi.fn().mockResolvedValue({
        id: 687,
        nazov: 'Úč MUJ',
        tabulky: [
          {
            nazov: { sk: 'Neznámy výkaz' },
            pocetDatovychStlpcov: 2,
            riadky: [],
          },
        ],
      }),
    }
    const prisma = fakePrisma()

    await syncStatements(prisma as never, client as RuzClient, new Date('2026-08-01'))

    expect(prisma.financialFacts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ trzby: null, naklady: null, vysledokHospodarenia: null }),
      })
    )
  })

  it('stores the financial_statement row but skips financial_facts when pristupnostDat is not public', async () => {
    const client: Partial<RuzClient> = {
      listChangedStatementIds: vi.fn().mockResolvedValueOnce({ ids: [999], hasMore: false }),
      getStatement: vi.fn().mockResolvedValue({ id: 999, idUJ: 111, idUctovnychVykazov: [222] }),
      getVykaz: vi.fn().mockResolvedValue({
        id: 222,
        idSablony: 687,
        pristupnostDat: 'Neverejné',
        obsah: {
          tabulky: [{ nazov: { sk: 'Výkaz ziskov a strát' }, data: ['12000', '', '', '', '12000'] }],
        },
      }),
      getSablona: vi.fn(),
    }
    const prisma = fakePrisma()

    const result = await syncStatements(prisma as never, client as RuzClient, new Date('2026-08-01'))

    expect(result.processed).toBe(1)
    expect(prisma.financialStatement.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.financialFacts.upsert).not.toHaveBeenCalled()
    expect(client.getSablona).not.toHaveBeenCalled()
  })

  it('logs and skips a statement whose detail fetch fails, without aborting the rest of the batch', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client: Partial<RuzClient> = {
      listChangedStatementIds: vi.fn().mockResolvedValueOnce({ ids: [1, 2], hasMore: false }),
      getStatement: vi.fn(async (id: number) => {
        if (id === 1) throw new Error('boom')
        return { id, idUJ: 55, idUctovnychVykazov: [] }
      }),
    }
    const prisma = fakePrisma()

    const result = await syncStatements(prisma as never, client as RuzClient, new Date('2026-08-01'))

    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(1)
    expect(prisma.financialStatement.upsert).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('stops paginating when hasMore is true but the id page comes back empty', async () => {
    const client: Partial<RuzClient> = {
      listChangedStatementIds: vi.fn().mockResolvedValueOnce({ ids: [], hasMore: true }),
      getStatement: vi.fn(),
    }
    const prisma = fakePrisma()

    const result = await syncStatements(prisma as never, client as RuzClient, new Date('2026-08-01'))

    expect(result.processed).toBe(0)
    expect(client.listChangedStatementIds).toHaveBeenCalledTimes(1)
  })
})
