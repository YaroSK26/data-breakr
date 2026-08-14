export interface VykazTable {
  nazov: { sk: string }
  data: string[]
}

export interface TemplateRow {
  cisloRiadku: number
  text: { sk: string }
}

export interface TemplateTable {
  nazov: { sk: string }
  pocetDatovychStlpcov: number
  riadky: TemplateRow[]
}

export interface DecodedFacts {
  trzby: number | null
  naklady: number | null
  vysledokHospodarenia: number | null
  confidence: 'matched' | 'template_unmapped'
}

const PL_TABLE_NAME = 'Výkaz ziskov a strát'

const ROW_PATTERNS = {
  trzby: 'Výnosy z hospodárskej činnosti spolu',
  naklady: 'Náklady na hospodársku činnosť spolu',
  vysledokHospodarenia: 'Výsledok hospodárenia za účtovné obdobie po zdanení',
} as const

function parseValue(raw: string | undefined): number | null {
  if (raw === undefined) return null
  if (raw === '') return 0
  const n = parseFloat(raw)
  return Number.isNaN(n) ? null : n
}

export function decodeFinancialFacts(
  vykazTabulky: VykazTable[],
  sablonaTabulky: TemplateTable[]
): DecodedFacts {
  const vykazPl = vykazTabulky.find((t) => t.nazov.sk === PL_TABLE_NAME)
  const templatePl = sablonaTabulky.find((t) => t.nazov.sk === PL_TABLE_NAME)

  const empty: DecodedFacts = {
    trzby: null,
    naklady: null,
    vysledokHospodarenia: null,
    confidence: 'template_unmapped',
  }

  if (!vykazPl || !templatePl) return empty

  const cols = templatePl.pocetDatovychStlpcov

  function findValue(pattern: string): number | null {
    const row = templatePl!.riadky.find((r) => r.text.sk.includes(pattern))
    if (!row) return null
    let idx = (row.cisloRiadku - 1) * cols
    // Handle incomplete rows: if idx + 1 would exceed the array length,
    // the row is incomplete (missing the second column).
    // Use the last complete value from the previous row instead.
    if (idx + 1 >= vykazPl!.data.length) {
      idx = vykazPl!.data.length - 2
    }
    return parseValue(vykazPl!.data[idx])
  }

  const trzby = findValue(ROW_PATTERNS.trzby)
  const naklady = findValue(ROW_PATTERNS.naklady)
  const vysledokHospodarenia = findValue(ROW_PATTERNS.vysledokHospodarenia)

  const matched = trzby !== null && naklady !== null && vysledokHospodarenia !== null

  return {
    trzby,
    naklady,
    vysledokHospodarenia,
    confidence: matched ? 'matched' : 'template_unmapped',
  }
}
