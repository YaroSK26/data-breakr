// scripts/ingest/susr/sync.test.ts
import { describe, it, expect } from 'vitest'
import { citajRiadky, popisky, type JsonStatDataset } from './jsonstat'
import { naZaznamy } from './sync'
import type { DatasetKonfig } from './client'

// Zmenšenina toho, čo vracia DATAcube: dva "okresy" (jeden je v skutočnosti
// kraj), jeden rok, tri sekcie.
function dataset(hodnoty: (number | null)[]): JsonStatDataset {
  return {
    id: ['nuts14', 'x_rok', 'x_dim1'],
    size: [2, 1, 3],
    dimension: {
      nuts14: {
        category: {
          index: { SK0422: 0, SK042: 1 },
          label: { SK0422: 'Okres Košice I', SK042: 'Košický kraj' },
        },
      },
      x_rok: { category: { index: { '2024': 0 } } },
      x_dim1: {
        category: {
          index: { SPOLU: 0, A: 1, C: 2 },
          label: { SPOLU: 'Spolu', A: 'Poľnohospodárstvo', C: 'Priemyselná výroba' },
        },
      },
    },
    value: hodnoty,
  }
}

const konfig: DatasetKonfig = {
  kod: 'x',
  ukazovatel: 'PRIEM_MZDA',
  popis: 'test',
  vyber: [],
  sekciaDim: 'x_dim1',
}

describe('citajRiadky', () => {
  it('priradí hodnoty správnym kombináciám rozmerov (posledný sa mení najrýchlejšie)', () => {
    const riadky = [...citajRiadky(dataset([1, 2, 3, 4, 5, 6]))]

    expect(riadky).toHaveLength(6)
    expect(riadky[0]).toEqual({ kody: { nuts14: 'SK0422', x_rok: '2024', x_dim1: 'SPOLU' }, hodnota: 1 })
    expect(riadky[2]).toEqual({ kody: { nuts14: 'SK0422', x_rok: '2024', x_dim1: 'C' }, hodnota: 3 })
    expect(riadky[3]).toEqual({ kody: { nuts14: 'SK042', x_rok: '2024', x_dim1: 'SPOLU' }, hodnota: 4 })
  })

  it('zvládne riedke hodnoty zapísané ako objekt', () => {
    const d = dataset([])
    d.value = { '0': 10, '4': 20 }

    const riadky = [...citajRiadky(d)]

    expect(riadky[0].hodnota).toBe(10)
    expect(riadky[1].hodnota).toBeNull()
    expect(riadky[4].hodnota).toBe(20)
  })
})

describe('popisky', () => {
  it('vráti názvy kategórií rozmeru', () => {
    expect(popisky(dataset([1, 2, 3, 4, 5, 6]), 'x_dim1').get('C')).toBe('Priemyselná výroba')
  })
})

describe('naZaznamy', () => {
  const jeOkres = (kod: string) => kod === 'SK0422'

  it('nechá len okresy - kraje a súhrny by inak zdvojili každý súčet', () => {
    const zaznamy = naZaznamy(dataset([1, 2, 3, 4, 5, 6]), konfig, jeOkres)

    expect(zaznamy).toHaveLength(3)
    expect(zaznamy.every((z) => z.okresKod === 'SK0422')).toBe(true)
  })

  it('vynechá nezverejnené hodnoty namiesto toho, aby z nich spravil nuly', () => {
    const zaznamy = naZaznamy(dataset([1, null, 3, 4, 5, 6]), konfig, jeOkres)

    expect(zaznamy.map((z) => z.sekcia)).toEqual(['SPOLU', 'C'])
  })

  it('doplní rok, ukazovateľ aj názov sekcie', () => {
    const [prvy] = naZaznamy(dataset([1, 2, 3, 4, 5, 6]), konfig, jeOkres)

    expect(prvy).toEqual({
      okresKod: 'SK0422',
      rok: 2024,
      ukazovatel: 'PRIEM_MZDA',
      sekcia: 'SPOLU',
      sekciaNazov: 'Spolu',
      hodnota: 1,
    })
  })
})
