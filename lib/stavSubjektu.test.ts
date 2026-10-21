// lib/stavSubjektu.test.ts
import { describe, it, expect } from 'vitest'
import { urcStav, type StavVstup } from './stavSubjektu'

const DNES = '2026-10-21'
const sro = (extra: Partial<StavVstup> = {}): StavVstup => ({
  legalForms: [{ value: { code: '112' } }],
  ...extra,
})
const zivnostnik = (extra: Partial<StavVstup> = {}): StavVstup => ({
  legalForms: [{ value: { code: '101' } }],
  ...extra,
})

describe('urcStav', () => {
  it('s. r. o. bez stavu a s platným predmetom činnosti je aktívna', () => {
    expect(urcStav(sro({ activities: [{ validFrom: '2010-01-01' }] }), DNES)).toBe('aktivny')
  })

  it('"Bez záznamu" (kód 1) je bežný stav, nie problém', () => {
    expect(urcStav(sro({ legalStatuses: [{ value: { code: '1' }, validFrom: '2020-01-01' }] }), DNES)).toBe('aktivny')
  })

  it('firma v likvidácii nie je aktívna, aj keď nemá dátum zániku', () => {
    expect(urcStav(sro({ legalStatuses: [{ value: { code: '2' }, validFrom: '2025-05-01' }] }), DNES)).toBe('likvidacia')
  })

  it('berie len platný stav - ukončená likvidácia sa nepočíta', () => {
    const e = sro({
      legalStatuses: [
        { value: { code: '2' }, validFrom: '2020-01-01', validTo: '2021-01-01' },
        { value: { code: '1' }, validFrom: '2021-01-01' },
      ],
    })
    expect(urcStav(e, DNES)).toBe('aktivny')
  })

  it('stav s dátumom v budúcnosti ešte neplatí', () => {
    expect(urcStav(sro({ legalStatuses: [{ value: { code: '3' }, validFrom: '2027-01-01' }] }), DNES)).toBe('aktivny')
  })

  it('konkurz aj reštrukturalizácia', () => {
    expect(urcStav(sro({ legalStatuses: [{ value: { code: '3' } }] }), DNES)).toBe('konkurz')
    expect(urcStav(sro({ legalStatuses: [{ value: { code: '4' } }] }), DNES)).toBe('konkurz')
  })

  it('neznámy kód stavu nepovažuje za aktívny', () => {
    expect(urcStav(sro({ legalStatuses: [{ value: { code: '5' } }] }), DNES)).toBe('zruseny')
  })

  it('živnostník so všetkými živnosťami pozastavenými je pozastavený', () => {
    const e = zivnostnik({
      activities: [
        { validFrom: '2015-01-01', suspendedFrom: '2025-01-01' },
        { validFrom: '2015-01-01', validTo: '2018-01-01' },
      ],
    })
    expect(urcStav(e, DNES)).toBe('pozastaveny')
  })

  it('pozastavenie, ktoré už skončilo, živnostníka neblokuje', () => {
    const e = zivnostnik({ activities: [{ validFrom: '2015-01-01', suspendedFrom: '2024-01-01', suspendedTo: '2025-01-01' }] })
    expect(urcStav(e, DNES)).toBe('aktivny')
  })

  it('stačí jedna bežiaca živnosť', () => {
    const e = zivnostnik({
      activities: [{ validFrom: '2015-01-01', suspendedFrom: '2025-01-01' }, { validFrom: '2016-01-01' }],
    })
    expect(urcStav(e, DNES)).toBe('aktivny')
  })

  it('všetky živnosti skončené = bez predmetu činnosti', () => {
    expect(urcStav(zivnostnik({ activities: [{ validFrom: '2015-01-01', validTo: '2020-01-01' }] }), DNES)).toBe('bez_opravnenia')
  })

  it('subjekt bez zoznamu činností sa podľa neho nesúdi', () => {
    expect(urcStav({ legalForms: [{ value: { code: '105' } }] }, DNES)).toBe('aktivny')
  })

  it('spolok, SVB, obec ani neznáma forma nie sú podnik', () => {
    for (const kod of ['701', '271', '801', '995']) {
      expect(urcStav({ legalForms: [{ value: { code: kod } }] }, DNES)).toBe('nepodnikatel')
    }
    expect(urcStav({}, DNES)).toBe('nepodnikatel')
  })

  it('platí posledná právna forma', () => {
    const e = { legalForms: [{ value: { code: '701' } }, { value: { code: '112' } }] }
    expect(urcStav(e, DNES)).toBe('aktivny')
  })
})
