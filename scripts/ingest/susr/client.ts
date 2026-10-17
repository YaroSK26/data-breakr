// Verejné STATdata API ŠÚ SR. Pôvodné DATAcube API sa po
// 15. 9. 2026 prestalo aktualizovať; produktové kódy tabuliek zostali,
// zmenil sa endpoint a formát odpovede.
import { fetchJson } from '../http'

const BASE = 'https://statdata.statistics.sk/public/api/dc/opendata/cube/dataset'

export interface DatasetKonfig {
  kod: string
  ukazovatel: string
  popis: string
  ukazovatelKod: string
  jednotkaKod: string
  maPohlavie: boolean
}

export interface StatdataRiadok {
  e_nuts14: string
  e_year: string
  e_nace2: string
  value: string | number | null
}

export const DATASETY: DatasetKonfig[] = [
  { kod: 'np3110rr', ukazovatel: 'PRIEM_MZDA', popis: 'Priemerná mesačná mzda zamestnanca (Eur)', ukazovatelKod: 'U_NP_0001', jednotkaKod: 'UNIT_EUR', maPohlavie: true },
  { kod: 'pr3113rr', ukazovatel: 'ZAMESTNANCI', popis: 'Priemerný evidenčný počet zamestnancov', ukazovatelKod: 'U_PR_0024', jednotkaKod: 'UNIT_PERS', maPohlavie: true },
  { kod: 'og3803rr', ukazovatel: 'PODNIKY', popis: 'Podniky podľa ekonomických činností k 31. 12.', ukazovatelKod: 'U_OG_0003', jednotkaKod: 'UNIT_NR', maPohlavie: false },
]

export function statdataUrl(konfig: DatasetKonfig): string {
  const rows = 'e_nuts14,SOURCE_ORDER,all~e_nace2,SOURCE_ORDER,all'
  const columns = 'e_year,SOURCE_ORDER,all'
  const context = [
    `e_indic,SOURCE_ORDER,${konfig.ukazovatelKod}`,
    ...(konfig.maPohlavie ? ['e_sex,SOURCE_ORDER,TOTAL'] : []),
    `e_unit,SOURCE_ORDER,${konfig.jednotkaKod}`,
  ].join('~')
  return `${BASE}/${konfig.kod}/rows/${rows}/columns/${columns}/context/${context}?lang=SK&type=JSON`
}

export async function stiahniDataset(konfig: DatasetKonfig): Promise<StatdataRiadok[]> {
  return fetchJson<StatdataRiadok[]>(statdataUrl(konfig), { timeoutMs: 120000 })
}
