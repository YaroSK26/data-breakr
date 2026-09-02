// scripts/ingest/nace/sync.ts
import type { PrismaClient } from '@prisma/client'
import type { SusrClassificationClient } from './client'
import { parseCsvRecords } from './csv'

export interface Nace21Row {
  kod: string
  uroven: number
  parentKod: string | null
  nazovSk: string
  nazovEn: string
  skratkaSk: string | null
  platnostOd: Date | null
}

export interface Rev2MappingRow {
  rev2Kod5: string
  rev21Kod4: string
}

/**
 * ŠÚ SR writes codes with separators ("47.12", "01.11.0"); RPO and RÚZ
 * both store them as plain digits ("4712", "01110"). Everything in our
 * schema uses the plain form, so normalise on the way in. Section letters
 * ("A".."U") have no separator and pass through unchanged.
 */
export function normalizeCode(code: string): string {
  return code.replace(/\./g, '').trim()
}

/** ŠÚ SR dates are dd.mm.yyyy. */
export function parseSkDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return null
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
}

export function parseNace21(csv: string): Nace21Row[] {
  return parseCsvRecords(csv)
    .filter((r) => r.codeAcronym)
    .map((r) => {
      const parent = normalizeCode(r.parentCode ?? '')
      return {
        kod: normalizeCode(r.codeAcronym),
        uroven: Number(r.level),
        parentKod: parent === '' ? null : parent,
        // codeOfficialTitle is the full legal wording ("Maloobchod v
        // nešpecializovaných predajniach..."). codeShortTitle is the
        // 25-char abbreviation, kept only as a fallback for cramped UI.
        nazovSk: r.codeOfficialTitle,
        nazovEn: r.codeOfficialTitleEn,
        skratkaSk: r.codeShortTitle || null,
        platnostOd: parseSkDate(r.codeValidFrom ?? ''),
      }
    })
}

export function parseRev2Mapping(csv: string): Rev2MappingRow[] {
  const seen = new Set<string>()
  const rows: Rev2MappingRow[] = []

  for (const r of parseCsvRecords(csv)) {
    const rev2Kod5 = normalizeCode(r['correspondenceItems.sourceCode.acronym'] ?? '')
    const rev21Kod4 = normalizeCode(r['correspondenceItems.targetCode.acronym'] ?? '')
    if (!rev2Kod5 || !rev21Kod4) continue

    const key = `${rev2Kod5}|${rev21Kod4}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ rev2Kod5, rev21Kod4 })
  }

  return rows
}

export async function syncNace(
  prisma: PrismaClient,
  client: SusrClassificationClient
): Promise<{ codes: number; mappings: number }> {
  const [nace21Csv, mappingCsv] = await Promise.all([
    client.getNace21Csv(),
    client.getRev2ToRev21Csv(),
  ])

  const codes = parseNace21(nace21Csv)
  const mappings = parseRev2Mapping(mappingCsv)

  // A classification download that came back short means the portal
  // returned an error page or a truncated file. Wiping a working codelist
  // and replacing it with that would leave the whole category filter
  // empty, so refuse before touching the tables. NACE Rev. 2.1 has 651
  // classes alone; the prevodník has ~1000 rows.
  if (codes.length < 600 || mappings.length < 600) {
    throw new Error(
      `Refusing to sync: got ${codes.length} NACE 2.1 codes and ${mappings.length} mappings, expected ~1050 / ~1030`
    )
  }

  // Full replace rather than upsert: these are small reference codelists
  // published as a whole, and a code retired by ŠÚ SR has to disappear
  // here too, not linger as an orphan filter option.
  await prisma.$transaction([
    prisma.nace21Code.deleteMany(),
    ...chunk(codes, 500).map((batch) => prisma.nace21Code.createMany({ data: batch })),
    prisma.naceRev2ToRev21.deleteMany(),
    ...chunk(mappings, 500).map((batch) => prisma.naceRev2ToRev21.createMany({ data: batch })),
  ])

  return { codes: codes.length, mappings: mappings.length }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}
