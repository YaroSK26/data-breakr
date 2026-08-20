// lib/legalForms.ts
//
// RPO reports pravna_forma_kod as a raw numeric code with no name stored
// on our side (the source JSON includes the Slovak name per-entity, but
// upsert-entity.ts only ever kept the code). Names below were fetched live
// from the real RPO API (GET /entity/{id}) for one sample entity per code -
// verified against the actual source, not guessed. Covers the ~15 codes
// that make up the large majority of active entities; anything outside
// this list still works as a raw code, just without a friendly label.
export const LEGAL_FORMS: { kod: string; nazov: string }[] = [
  { kod: '101', nazov: 'Živnostník (fyzická osoba)' },
  { kod: '112', nazov: 'Spoločnosť s ručením obmedzeným (s. r. o.)' },
  { kod: '121', nazov: 'Akciová spoločnosť (a. s.)' },
  { kod: '105', nazov: 'Slobodné povolanie (mimo živnostenského zákona)' },
  { kod: '103', nazov: 'Samostatne hospodáriaci roľník' },
  { kod: '205', nazov: 'Družstvo' },
  { kod: '701', nazov: 'Združenie (zväz, spolok, klub ai.)' },
  { kod: '271', nazov: 'Spoločenstvo vlastníkov bytov/pozemkov' },
  { kod: '272', nazov: 'Pozemkové spoločenstvo' },
  { kod: '120', nazov: 'Nezisková organizácia' },
  { kod: '141', nazov: 'Poľovnícka organizácia' },
  { kod: '321', nazov: 'Rozpočtová organizácia' },
  { kod: '721', nazov: 'Cirkevná organizácia' },
  { kod: '751', nazov: 'Záujmové združenie právnických osôb' },
  { kod: '801', nazov: 'Obec / mesto' },
]
