// scripts/ingest/ruz/sync-statements.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Prisma } from '@prisma/client'
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
    // The live registeruz.sk API rejects a full ISO-8601 datetime with HTTP
    // 400 and only accepts a bare YYYY-MM-DD date - assert the date-only
    // format explicitly so a regression back to `since.toISOString()` (which
    // silently passes with a mocked client) is caught here.
    expect(client.listChangedStatementIds).toHaveBeenCalledWith('2026-08-01', undefined)
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
    // Regression guard for the FK-ordering bug: report_templates.id_sablony
    // is referenced by financial_statements.id_sablony as a foreign key, so
    // the template row must exist before the statement upsert runs - not
    // after. Assert the actual call order, not just that both were called.
    const templateUpsertOrder = prisma.reportTemplate.upsert.mock.invocationCallOrder[0]
    const statementUpsertOrder = prisma.financialStatement.upsert.mock.invocationCallOrder[0]
    expect(templateUpsertOrder).toBeLessThan(statementUpsertOrder)
  })

  it('ensures a brand-new report_template exists before upserting the financial_statement that references it (FK-ordering regression)', async () => {
    // Mirrors the exact scenario that caused a live P2003 foreign key
    // violation: a statement whose idSablony has never been seen before (so
    // report_templates has no row for it yet). If the statement upsert ever
    // runs before the template is ensured, this is the bug.
    const client: Partial<RuzClient> = {
      listChangedStatementIds: vi.fn().mockResolvedValueOnce({ ids: [555], hasMore: false }),
      getStatement: vi.fn().mockResolvedValue({
        id: 555,
        idUJ: 9,
        idUctovnychVykazov: [777],
      }),
      getVykaz: vi.fn().mockResolvedValue({
        id: 777,
        idSablony: 999, // brand new template id
        pristupnostDat: 'Verejné',
        obsah: { tabulky: [{ nazov: { sk: 'Výkaz ziskov a strát' }, data: ['5000'] }] },
      }),
      getSablona: vi.fn().mockResolvedValue({
        id: 999,
        nazov: 'Nová šablóna',
        tabulky: [
          {
            nazov: { sk: 'Výkaz ziskov a strát' },
            pocetDatovychStlpcov: 1,
            riadky: [{ cisloRiadku: 1, text: { sk: 'Výnosy z hospodárskej činnosti spolu' } }],
          },
        ],
      }),
    }
    const prisma = fakePrisma() // reportTemplate.findUnique resolves null - template genuinely doesn't exist yet

    await syncStatements(prisma as never, client as RuzClient, new Date('2026-08-01'))

    expect(prisma.reportTemplate.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.financialStatement.upsert).toHaveBeenCalledTimes(1)

    const templateUpsertOrder = prisma.reportTemplate.upsert.mock.invocationCallOrder[0]
    const statementUpsertOrder = prisma.financialStatement.upsert.mock.invocationCallOrder[0]
    expect(templateUpsertOrder).toBeLessThan(statementUpsertOrder)

    // The statement must carry the now-ensured idSablony, not omit it.
    expect(prisma.financialStatement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ id: 555n, idSablony: 999 }),
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
    // Non-public statements never go through the template-ensure gate, so
    // idSablony must not be set to a template we never confirmed exists -
    // that's exactly the FK-violation-shaped bug this is guarding against.
    expect(prisma.reportTemplate.upsert).not.toHaveBeenCalled()
    expect(prisma.financialStatement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ idSablony: undefined }),
      })
    )
  })

  it('nulls pristupnostDat and rawTabulky together with idSablony on update when no structured vykaz resolves this time', async () => {
    // idSablony already correctly clears to null via `confirmedIdSablony ??
    // null` when no structuredVykaz resolves. pristupnostDat/rawTabulky must
    // clear alongside it in the same update - otherwise the row ends up
    // internally inconsistent, e.g. pristupnostDat: 'Verejné' with
    // idSablony: null.
    const client: Partial<RuzClient> = {
      listChangedStatementIds: vi.fn().mockResolvedValueOnce({ ids: [42], hasMore: false }),
      getStatement: vi.fn().mockResolvedValue({
        id: 42,
        idUJ: 7,
        idUctovnychVykazov: [900],
      }),
      // No vykaz resolves a structured `obsah.tabulky` this time (e.g. the
      // source stopped returning the structured table), so structuredVykaz
      // stays undefined for this statement.
      getVykaz: vi.fn().mockResolvedValue({
        id: 900,
        idSablony: 687,
        pristupnostDat: 'Verejné',
      }),
      getSablona: vi.fn(),
    }
    const prisma = fakePrisma()

    const result = await syncStatements(prisma as never, client as RuzClient, new Date('2026-08-01'))

    expect(result.processed).toBe(1)
    expect(prisma.financialStatement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          idSablony: null,
          pristupnostDat: null,
          // A nullable Prisma Json column needs the Prisma.JsonNull sentinel
          // (not a plain `null`) to write an actual database NULL.
          rawTabulky: Prisma.JsonNull,
        }),
      })
    )
    expect(prisma.financialFacts.upsert).not.toHaveBeenCalled()
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
