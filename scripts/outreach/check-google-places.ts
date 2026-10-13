import { pending } from './pending'
import { classifyPlace, type PlaceCandidate } from './qualification'
import { supabase } from './supabase-client'

const apiKey = process.env.GOOGLE_PLACES_API_KEY
const MAX_CHECKS = Number(process.env.OUTREACH_MAX_CHECKS ?? 25)

async function searchPlace(textQuery: string): Promise<PlaceCandidate | undefined> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey!,
      'X-Goog-FieldMask': [
        'places.id', 'places.displayName', 'places.formattedAddress',
        'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
        'places.websiteUri', 'places.googleMapsUri', 'places.businessStatus',
      ].join(','),
    },
    body: JSON.stringify({ textQuery, languageCode: 'sk', regionCode: 'SK', pageSize: 3 }),
  })
  if (!response.ok) throw new Error(`Google Places ${response.status}: ${await response.text()}`)
  const body = await response.json() as { places?: PlaceCandidate[] }
  return body.places?.[0]
}

export async function checkPending() {
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY must be set')
  const firms = (await pending()).slice(0, MAX_CHECKS)
  let prospects = 0

  for (const firm of firms) {
    const { data: entity, error: entityError } = await supabase
      .from('business_entities')
      .select('mesto, ulica, datum_zaniku')
      .eq('ico', firm.ico)
      .limit(1)
      .maybeSingle()
    if (entityError) throw entityError

    let place: PlaceCandidate | undefined
    let stav: ReturnType<typeof classifyPlace> = 'neaktivna'
    let note = 'Firma už nie je v registri vedená ako aktívna.'
    if (entity && !entity.datum_zaniku) {
      const query = [firm.nazov, entity.ulica, entity.mesto, 'Slovensko'].filter(Boolean).join(', ')
      place = await searchPlace(query)
      stav = classifyPlace(firm.nazov ?? '', entity.mesto, place)
      note = place ? `Google Places: ${place.displayName?.text ?? 'bez názvu'}; ${place.formattedAddress ?? 'bez adresy'}` : 'Google business profil sa nenašiel.'
    }

    const { error } = await supabase.from('outreach_firm').update({
      stav,
      najdena_info: note,
      posledne_check: new Date().toISOString(),
      pocet_kontrol: (firm.pocet_kontrol ?? 0) + 1,
      kontakt_telefon: place?.internationalPhoneNumber ?? place?.nationalPhoneNumber ?? null,
      profil_url: place?.googleMapsUri ?? null,
      web_url: place?.websiteUri ?? null,
      google_place_id: place?.id ?? null,
      overenie_poznamka: note,
    }).eq('ico', firm.ico)
    if (error) throw error
    if (stav === 'prospect') prospects++
    console.log(`${firm.ico}: ${stav}`)
  }
  return { checked: firms.length, prospects }
}

checkPending().then((result) => console.log(JSON.stringify(result))).catch((error) => {
  console.error(error)
  process.exit(1)
})
