// scripts/ingest/susr/client.ts
//
// DATAcube ŠÚ SR - REST API bez kľúča, formát JSON-stat 2.0.
// https://data.statistics.sk/api/v2/dataset/{id}/{výber pre každý rozmer}
//
// Územný rozmer `nuts14` používa presne tie isté kódy okresov ako naša
// tabuľka districts (SK0422, SK042A, ...), takže sa dá spájať priamo, bez
// prevodného číselníka.
import { fetchJson } from '../http'
import type { JsonStatDataset } from './jsonstat'

const BASE = 'https://data.statistics.sk/api/v2/dataset'

export interface DatasetKonfig {
  /** id datasetu v DATAcube, napr. np3110rr */
  kod: string
  /** názov ukazovateľa, pod ktorým sa uloží k nám */
  ukazovatel: string
  /** ľudský popis do logu a do data_sources */
  popis: string
  /** výber pre jednotlivé rozmery v poradí, v akom ich dataset vymenúva (bez územia a roku) */
  vyber: string[]
  /** id rozmeru, ktorý nesie odvetvovú sekciu SK NACE */
  sekciaDim: string
}

// Tri okresné datasety, ktoré dávajú zmysel vedľa mapy firiem. Všetky sú
// ročné a delené podľa sekcií SK NACE Rev. 2 (pozor: nie Rev. 2.1, v ktorej
// je zvyšok appky - preto majú vlastnú stránku a nespájajú sa s filtrom
// kategórií na hlavnej mape).
export const DATASETY: DatasetKonfig[] = [
  {
    kod: 'np3110rr',
    ukazovatel: 'PRIEM_MZDA',
    popis: 'Priemerná mesačná mzda zamestnanca (Eur)',
    // rozmery: nuts14 / rok / ukaz / pohlavie / sekcia
    vyber: ['E_PRIEM_MZDA', '3'], // 3 = Spolu (muži + ženy)
    sekciaDim: 'np3110rr_dim2',
  },
  {
    kod: 'pr3113rr',
    ukazovatel: 'ZAMESTNANCI',
    popis: 'Priemerný evidenčný počet zamestnancov',
    vyber: ['PRIEM_POC_ZAM', '3'],
    sekciaDim: 'pr3113rr_dim2',
  },
  {
    kod: 'og3803rr',
    ukazovatel: 'PODNIKY',
    popis: 'Podniky podľa ekonomických činností k 31. 12.',
    // rozmery: nuts14 / rok / sekcia - žiadny výber navyše
    vyber: [],
    sekciaDim: 'og3803rr_dim1',
  },
]

// DATAcube odmieta príliš veľký výsek ("Too many results!"), takže sa
// nedá stiahnuť naraz všetko - roky × okresy × sekcie je nad limit. Preto
// dva kroky: najprv zistiť, ktoré roky dataset má (výsek len za súhrnnú
// sekciu je dosť malý), potom ťahať rok po roku.
export async function stiahniRoky(konfig: DatasetKonfig): Promise<string[]> {
  const cesta = ['all', 'all', ...konfig.vyber, 'SPOLU'].join('/')
  const dataset = await fetchJson<JsonStatDataset>(`${BASE}/${konfig.kod}/${cesta}?lang=sk`, {
    timeoutMs: 120000,
  })
  const rokDim = dataset.id.find((d) => d.endsWith('_rok'))
  if (!rokDim) throw new Error(`Dataset ${konfig.kod} nemá rozmer s rokom`)
  const index = dataset.dimension[rokDim]?.category?.index ?? {}
  return Object.keys(index).sort()
}

export async function stiahniZaRok(konfig: DatasetKonfig, rok: string): Promise<JsonStatDataset> {
  const cesta = ['all', rok, ...konfig.vyber, 'all'].join('/')
  return fetchJson<JsonStatDataset>(`${BASE}/${konfig.kod}/${cesta}?lang=sk`, {
    timeoutMs: 120000,
  })
}
