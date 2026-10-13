import { describe, expect, it } from 'vitest'
import { classifyPlace, isConfidentMatch } from './qualification'

const place = {
  id: 'abc',
  displayName: { text: 'Káva Košice' },
  formattedAddress: 'Hlavná 1, Košice, Slovensko',
  googleMapsUri: 'https://maps.google.com/example',
  nationalPhoneNumber: '0900 123 456',
  businessStatus: 'OPERATIONAL',
}

describe('outreach qualification', () => {
  it('accepts an active matching profile with a phone and no website', () => {
    expect(classifyPlace('Káva Košice, s. r. o.', 'Košice', place)).toBe('prospect')
  })

  it('rejects a business that already has a website', () => {
    expect(classifyPlace('Káva Košice, s. r. o.', 'Košice', { ...place, websiteUri: 'https://kava.sk' })).toBe('ma_web')
  })

  it('does not trust a similarly named result in another town', () => {
    expect(isConfidentMatch('Káva Košice', 'Prešov', place)).toBe(false)
    expect(classifyPlace('Káva Košice', 'Prešov', place)).toBe('bez_info')
  })

  it('rejects closed and contactless profiles', () => {
    expect(classifyPlace('Káva Košice', 'Košice', { ...place, businessStatus: 'CLOSED_PERMANENTLY' })).toBe('neaktivna')
    expect(classifyPlace('Káva Košice', 'Košice', { ...place, nationalPhoneNumber: undefined })).toBe('bez_kontaktu')
  })
})
