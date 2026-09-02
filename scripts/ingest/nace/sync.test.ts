// scripts/ingest/nace/sync.test.ts
import { describe, it, expect, vi } from 'vitest'
import { parseCsv, parseCsvRecords } from './csv'
import { normalizeCode, parseSkDate, parseNace21, parseRev2Mapping, syncNace } from './sync'
import type { SusrClassificationClient } from './client'

const NACE21_HEADER =
  'codeAssociationSortNumber,level,codeAcronym,codeOfficialTitle,codeMediumTitle,codeShortTitle,codeOfficialTitleEn,codeMediumTitleEn,codeShortTitleEn,codeNote,codeNoteEn,codeIncludes,codeIncludesEn,codeIncludesAlso,codeIncludesAlsoEn,codeExcludes,codeExcludesEn,codeInfo,codeAdditionalInfo,codeInfoEn,codeAdditionalInfoEn,codeUnitOfMeasure,parentCode,codeValidFrom,codeValidTo,codeDateCreated,codeDateModified'

function nace21Row(level: string, acronym: string, title: string, short: string, parent: string) {
  const cols = Array(27).fill('')
  cols[0] = '1'
  cols[1] = level
  cols[2] = acronym
  cols[3] = title
  cols[5] = short
  cols[6] = `${title} (EN)`
  cols[22] = parent
  cols[23] = '31.12.2024'
  return cols.map((c) => `"${c}"`).join(',')
}

describe('parseCsv', () => {
  it('keeps commas and newlines that sit inside a quoted field', () => {
    const rows = parseCsv('a,b\n"one, two","line1\nline2"\n')

    expect(rows).toEqual([
      ['a', 'b'],
      ['one, two', 'line1\nline2'],
    ])
  })

  it('unescapes doubled quotes and strips a BOM', () => {
    expect(parseCsvRecords('﻿name\n"say ""hi"""\n')).toEqual([{ name: 'say "hi"' }])
  })
})

describe('normalizeCode', () => {
  it('strips the separators ŠÚ SR writes but RPO and RÚZ do not', () => {
    expect(normalizeCode('47.12')).toBe('4712')
    expect(normalizeCode('01.11.0')).toBe('01110')
    expect(normalizeCode('A')).toBe('A')
  })
})

describe('parseSkDate', () => {
  it('reads dd.mm.yyyy', () => {
    expect(parseSkDate('31.12.2024')?.toISOString()).toBe('2024-12-31T00:00:00.000Z')
    expect(parseSkDate('')).toBeNull()
  })
})

describe('parseNace21', () => {
  it('maps the hierarchy, using the official title and not the abbreviation', () => {
    const csv = [
      NACE21_HEADER,
      nace21Row('1', 'G', 'VEĽKOOBCHOD A MALOOBCHOD', 'Veľkoobchod,maloobchod', ''),
      nace21Row('4', '47.12', 'Maloobchod v nešpecializovaných predajniach', 'MO nešpecializ.', '47.1'),
      '',
    ].join('\n')

    expect(parseNace21(csv)).toEqual([
      {
        kod: 'G',
        uroven: 1,
        parentKod: null,
        nazovSk: 'VEĽKOOBCHOD A MALOOBCHOD',
        nazovEn: 'VEĽKOOBCHOD A MALOOBCHOD (EN)',
        skratkaSk: 'Veľkoobchod,maloobchod',
        platnostOd: new Date('2024-12-31T00:00:00.000Z'),
      },
      {
        kod: '4712',
        uroven: 4,
        parentKod: '471',
        nazovSk: 'Maloobchod v nešpecializovaných predajniach',
        nazovEn: 'Maloobchod v nešpecializovaných predajniach (EN)',
        skratkaSk: 'MO nešpecializ.',
        platnostOd: new Date('2024-12-31T00:00:00.000Z'),
      },
    ])
  })
})

describe('parseRev2Mapping', () => {
  it('keeps every target of a split Rev. 2 subclass, deduplicated', () => {
    const csv = [
      'correspondenceItems.sourceCode.acronym,correspondenceItems.targetCode.acronym',
      '"47190","4711"',
      '"47190","4712"',
      '"47190","4712"',
      '"62010","6210"',
      '',
    ].join('\n')

    expect(parseRev2Mapping(csv)).toEqual([
      { rev2Kod5: '47190', rev21Kod4: '4711' },
      { rev2Kod5: '47190', rev21Kod4: '4712' },
      { rev2Kod5: '62010', rev21Kod4: '6210' },
    ])
  })
})

describe('syncNace', () => {
  function fullCsvs() {
    const codes = Array.from({ length: 700 }, (_, i) =>
      nace21Row('4', `${10 + Math.floor(i / 10)}.${i % 10}`, `Trieda ${i}`, `T${i}`, '10')
    )
    const mappings = Array.from({ length: 700 }, (_, i) => `"${10000 + i}","${1000 + i}"`)
    return {
      nace21: [NACE21_HEADER, ...codes, ''].join('\n'),
      mapping: [
        'correspondenceItems.sourceCode.acronym,correspondenceItems.targetCode.acronym',
        ...mappings,
        '',
      ].join('\n'),
    }
  }

  function fakePrisma() {
    return {
      nace21Code: { deleteMany: vi.fn(() => 'del-codes'), createMany: vi.fn((a) => a) },
      naceRev2ToRev21: { deleteMany: vi.fn(() => 'del-map'), createMany: vi.fn((a) => a) },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    }
  }

  it('replaces both tables in one transaction', async () => {
    const csvs = fullCsvs()
    const client: Partial<SusrClassificationClient> = {
      getNace21Csv: async () => csvs.nace21,
      getRev2ToRev21Csv: async () => csvs.mapping,
    }
    const prisma = fakePrisma()

    const result = await syncNace(prisma as never, client as SusrClassificationClient)

    expect(result).toEqual({ codes: 700, mappings: 700 })
    expect(prisma.nace21Code.deleteMany).toHaveBeenCalled()
    expect(prisma.naceRev2ToRev21.deleteMany).toHaveBeenCalled()
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    // 2 deletes + 2 chunks per table (700 rows at 500 per batch)
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(6)
  })

  it('refuses to wipe the codelists when the download comes back short', async () => {
    const client: Partial<SusrClassificationClient> = {
      getNace21Csv: async () => [NACE21_HEADER, nace21Row('4', '47.12', 'X', 'X', '47.1'), ''].join('\n'),
      getRev2ToRev21Csv: async () => fullCsvs().mapping,
    }
    const prisma = fakePrisma()

    await expect(syncNace(prisma as never, client as SusrClassificationClient)).rejects.toThrow(
      /Refusing to sync/
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
