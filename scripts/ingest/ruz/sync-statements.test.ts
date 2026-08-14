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
})
