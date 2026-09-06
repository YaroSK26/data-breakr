// scripts/ingest/rpo/recompute-density.test.ts
import { describe, it, expect, vi } from 'vitest'
import { recomputeDensity } from './recompute-density'

// recomputeDensity prešla z JS cyklu upsertov na jediný
// INSERT ... SELECT ... ON CONFLICT (rýchlosť - cyklus robil desaťtisíce
// round tripov cez pooler). Testy preto už nemôžu overovať výpočet v JS,
// ale vedia overiť to, čo v kóde zostalo: že ide o jeden príkaz, že vracia
// počet dotknutých riadkov a že SQL drží invarianty, na ktorých závisí
// idempotencia opakovaného behu.
function fakePrisma(rowsAffected = 0) {
  const executeRaw = vi.fn().mockResolvedValue(rowsAffected)
  return { $executeRaw: executeRaw, _sql: () => executeRaw.mock.calls[0][0].join('?') }
}

describe('recomputeDensity', () => {
  it('spustí jediný príkaz a vráti počet dotknutých riadkov', async () => {
    const prisma = fakePrisma(2)

    const result = await recomputeDensity(prisma as never)

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
    expect(result.areasComputed).toBe(2)
  })

  it('normalizuje prázdny NACE rovnako v SELECT aj v GROUP BY, aby sa re-run neduplikoval', async () => {
    const prisma = fakePrisma()

    await recomputeDensity(prisma as never)

    const sql = prisma._sql()
    // Kľúč unikátneho indexu nepripúšťa NULL, preto COALESCE na '' - a musí
    // byť rovnaký v oboch výskytoch, inak by sa skupina bez NACE pri každom
    // behu vložila znova namiesto aktualizácie.
    expect(sql).toContain(`COALESCE(be."nace_kod4", '')`)
    expect(sql).toContain('ON CONFLICT (area_kod, granularity, nace_kod4, snapshot_date)')
    expect(sql).toContain('DO UPDATE SET')
  })

  it('počíta len živé subjekty', async () => {
    const prisma = fakePrisma()

    await recomputeDensity(prisma as never)

    expect(prisma._sql()).toContain(`be."datum_zaniku" IS NULL`)
  })
})
