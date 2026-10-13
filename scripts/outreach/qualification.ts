export type PlaceCandidate = {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  googleMapsUri?: string
  businessStatus?: string
}

const LEGAL_WORDS = new Set(['sro', 'as', 'ks', 'vos', 'druzstvo', 'slovakia', 'sk'])

export function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokens(value: string) {
  return normalize(value)
    .split(' ')
    .filter((word) => word.length > 1 && !LEGAL_WORDS.has(word))
}

export function isConfidentMatch(firmName: string, town: string | null, place: PlaceCandidate) {
  const firmTokens = new Set(tokens(firmName))
  const placeTokens = new Set(tokens(place.displayName?.text ?? ''))
  const shared = [...firmTokens].filter((word) => placeTokens.has(word)).length
  const nameMatch = firmTokens.size > 0 && shared / firmTokens.size >= 0.6
  const townMatch = !town || normalize(place.formattedAddress ?? '').includes(normalize(town))
  return nameMatch && townMatch
}

export function classifyPlace(firmName: string, town: string | null, place?: PlaceCandidate) {
  if (!place || !isConfidentMatch(firmName, town, place)) return 'bez_info' as const
  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') return 'neaktivna' as const
  if (place.websiteUri) return 'ma_web' as const
  if (place.googleMapsUri && (place.nationalPhoneNumber || place.internationalPhoneNumber)) {
    return 'prospect' as const
  }
  return 'bez_kontaktu' as const
}
