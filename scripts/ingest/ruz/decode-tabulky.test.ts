import { describe, it, expect } from 'vitest'
import { decodeFinancialFacts } from './decode-tabulky'

// Real "Výkaz ziskov a strát" data array from RÚZ report id 7716025
// (BOAT SERVICES s.r.o., obdobie 2020-01 to 2020-12, fetched 2026-08-14)
const REAL_PL_DATA = [
  '12000', '', '', '', '12000', '', '', '', '', '', '', '', '', '', '',
  '8', '', '', '', '', '', '8', '', '', '', '', '', '', '', '', '', '',
  '', '', '12000', '-8', '12000', '-8', '', '', '', '', '', '', '', '',
  '', '', '', '', '', '', '84', '', '', '', '', '', '', '', '', '', '',
  '', '84', '', '-84', '12000', '-92', '1449', '', '', '', '10551', '-92',
]

// Row labels from RÚZ sablona id 687, "Výkaz ziskov a strát" table (fetched 2026-08-14)
const REAL_PL_TEMPLATE_ROWS = [
  { cisloRiadku: 1, text: { sk: 'Výnosy z hospodárskej činnosti spolu súčet (r. 02 až r. 07)' } },
  { cisloRiadku: 3, text: { sk: 'Tržby z predaja vlastných výrobkov a služieb (601, 602, 606)' } },
  { cisloRiadku: 8, text: { sk: 'Náklady na hospodársku činnosť spolu súčet (r. 09 až r. 17)' } },
  {
    cisloRiadku: 38,
    text: { sk: 'Výsledok hospodárenia za účtovné obdobie po zdanení (+/-) (r. 35 - r. 36 - r. 37)' },
  },
]

describe('decodeFinancialFacts', () => {
  it('decodes trzby, naklady, and vysledok hospodarenia from a real filing', () => {
    const result = decodeFinancialFacts(
      [{ nazov: { sk: 'Výkaz ziskov a strát' }, data: REAL_PL_DATA }],
      [
        {
          nazov: { sk: 'Výkaz ziskov a strát' },
          pocetDatovychStlpcov: 2,
          riadky: REAL_PL_TEMPLATE_ROWS,
        },
      ]
    )

    expect(result.trzby).toBe(12000)
    expect(result.naklady).toBe(0)
    expect(result.vysledokHospodarenia).toBe(10551)
    expect(result.confidence).toBe('matched')
  })

  it('returns template_unmapped when the P&L table is missing', () => {
    const result = decodeFinancialFacts(
      [{ nazov: { sk: 'Strana aktív' }, data: ['1'] }],
      [{ nazov: { sk: 'Strana aktív' }, pocetDatovychStlpcov: 2, riadky: [] }]
    )

    expect(result.confidence).toBe('template_unmapped')
    expect(result.trzby).toBeNull()
  })
})
