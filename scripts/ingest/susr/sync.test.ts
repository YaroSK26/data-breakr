import { describe, expect, it } from 'vitest'
import { statdataUrl, type DatasetKonfig, type StatdataRiadok } from './client'
import { naZaznamy } from './sync'

const konfig: DatasetKonfig = { kod: 'np3110rr', ukazovatel: 'PRIEM_MZDA', popis: 'test', ukazovatelKod: 'U_NP_0001', jednotkaKod: 'UNIT_EUR', maPohlavie: true }
const okresy = new Map([['kosicei', 'SK0422'], ['banskabystrica', 'SK0321']])

describe('statdataUrl', () => {
  it('vyberie okresy, roky, NACE sekcie a správny kontext', () => {
    const url = statdataUrl(konfig)
    expect(url).toContain('/np3110rr/rows/e_nuts14,SOURCE_ORDER,all~e_nace2,SOURCE_ORDER,all')
    expect(url).toContain('/columns/e_year,SOURCE_ORDER,all/')
    expect(url).toContain('e_indic,SOURCE_ORDER,U_NP_0001')
    expect(url).toContain('e_sex,SOURCE_ORDER,TOTAL')
    expect(url).toContain('e_unit,SOURCE_ORDER,UNIT_EUR')
  })
})

describe('naZaznamy', () => {
  const riadky: StatdataRiadok[] = [
    { e_nuts14: 'Okres Košice I', e_year: '2025', e_nace2: 'A Poľnohospodárstvo, lesníctvo a rybolov', value: '1234.0' },
    { e_nuts14: 'Okres Banská Bystrica', e_year: '2025', e_nace2: 'Spolu', value: 1500 },
    { e_nuts14: 'Košický kraj', e_year: '2025', e_nace2: 'Spolu', value: '1400.0' },
    { e_nuts14: 'Okres Košice I', e_year: '2025', e_nace2: 'B-E Priemysel spolu', value: null },
  ]
  it('ponechá iba okresy a mapuje názvy na NUTS kódy', () => {
    const zaznamy = naZaznamy(riadky, konfig, okresy)
    expect(zaznamy).toHaveLength(2)
    expect(zaznamy.map((z) => z.okresKod)).toEqual(['SK0422', 'SK0321'])
  })
  it('prevedie hodnotu, rok a NACE sekciu', () => {
    expect(naZaznamy(riadky, konfig, okresy)[0]).toEqual({ okresKod: 'SK0422', rok: 2025, ukazovatel: 'PRIEM_MZDA', sekcia: 'A', sekciaNazov: 'A Poľnohospodárstvo, lesníctvo a rybolov', hodnota: 1234 })
    expect(naZaznamy(riadky, konfig, okresy)[1].sekcia).toBe('SPOLU')
  })
})
