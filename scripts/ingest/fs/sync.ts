// scripts/ingest/fs/sync.ts
import type { PrismaClient } from '@prisma/client'
import { parseSkDate } from '../nace/sync'

export interface DphRow {
  ico: string
  icDph: string | null
  druhRegistracie: string | null
  datumRegistracie: Date | null
  platDphOd: Date | null
}

export interface DsddRow {
  psc: string
  ciastka: number
}

// FS XML nemá atribúty ani vnorené prvky v ITEM, takže jednoduchý regex na
// pole je bezpečný a oveľa rýchlejší než plnohodnotný XML parser na
// súboroch s desiatkami MB a stovkami tisíc <ITEM> blokov.
function itemBloky(xml: string): string[] {
  return xml.match(/<ITEM>[\s\S]*?<\/ITEM>/g) ?? []
}

function pole(blok: string, tag: string): string | null {
  const m = blok.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  if (!m) return null
  return m[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

export function parseDphs(xml: string): DphRow[] {
  const riadky: DphRow[] = []
  for (const blok of itemBloky(xml)) {
    const ico = pole(blok, 'ICO')
    if (!ico) continue // pár riadkov v zdroji nemá IČO (napr. zahraničné subjekty) - bez IČO sa nedajú spárovať na naše firmy
    riadky.push({
      ico,
      icDph: pole(blok, 'IC_DPH'),
      druhRegistracie: pole(blok, 'DRUH_REG_DPH'),
      datumRegistracie: parseSkDate(pole(blok, 'DATUM_REG') ?? ''),
      platDphOd: parseSkDate(pole(blok, 'PLAT_DPH_OD') ?? ''),
    })
  }
  return riadky
}

export function parseDsdd(xml: string): DsddRow[] {
  const riadky: DsddRow[] = []
  for (const blok of itemBloky(xml)) {
    const psc = pole(blok, 'PSC')
    const ciastkaStr = pole(blok, 'CIASTKA')
    if (!psc || !ciastkaStr) continue
    const ciastka = parseFloat(ciastkaStr)
    if (!Number.isFinite(ciastka)) continue
    riadky.push({ psc: psc.replace(/\s/g, ''), ciastka })
  }
  return riadky
}

/**
 * Mapa PSČ -> okres väčšinovým hlasovaním z vlastných dát
 * (business_entities), nie z externého číselníka. Jedno PSČ zvyčajne patrí
 * jednému okresu, ale niekedy pretína hranicu - berie sa okres, v ktorom má
 * dané PSČ najviac firiem.
 */
export async function buildPscToOkres(prisma: PrismaClient): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<{ psc: string; okresKod: string; pocet: bigint }[]>`
    SELECT psc, okres_kod AS "okresKod", COUNT(*) AS pocet
    FROM business_entities
    WHERE psc IS NOT NULL AND okres_kod IS NOT NULL AND psc ~ '^[0-9]{5}$'
    GROUP BY psc, okres_kod
  `
  const najlepsi = new Map<string, { okresKod: string; pocet: bigint }>()
  for (const r of rows) {
    const existujuci = najlepsi.get(r.psc)
    if (!existujuci || r.pocet > existujuci.pocet) {
      najlepsi.set(r.psc, { okresKod: r.okresKod, pocet: r.pocet })
    }
  }
  return new Map([...najlepsi].map(([psc, v]) => [psc, v.okresKod]))
}

const MIN_DPH_RIADKOV = 250_000
const MIN_DLZNIK_RIADKOV = 80_000
const MIN_OKRES_MATCH_PCT = 0.9

export async function syncDph(prisma: PrismaClient, rows: DphRow[]): Promise<number> {
  if (rows.length < MIN_DPH_RIADKOV) {
    throw new Error(`Zoznam platiteľov DPH má len ${rows.length} riadkov, čakalo sa aspoň ${MIN_DPH_RIADKOV} - nemazať existujúce dáta.`)
  }

  // Jeden INSERT cez unnest namiesto stoviek chunkovaných createMany() -
  // 150+ samostatných príkazov v jednej Prisma $transaction cez Supabase
  // pooler (transaction-mode pgbouncer) sa v praxi zaseklo na 3 minúty
  // bez chyby aj bez pokroku. Jeden round trip so 4 paralelnými poľami je
  // rádovo rýchlejší a pooleru nevadí.
  await prisma.$executeRaw`DELETE FROM fs_platca_dph`
  await prisma.$executeRaw`
    INSERT INTO fs_platca_dph (ico, ic_dph, druh_registracie, datum_registracie, plat_dph_od)
    SELECT * FROM unnest(
      ${rows.map((r) => r.ico)}::text[],
      ${rows.map((r) => r.icDph)}::text[],
      ${rows.map((r) => r.druhRegistracie)}::text[],
      ${rows.map((r) => r.datumRegistracie)}::timestamp[],
      ${rows.map((r) => r.platDphOd)}::timestamp[]
    )
  `

  return rows.length
}

export async function syncDlznici(
  prisma: PrismaClient,
  rows: DsddRow[],
  pscToOkres: Map<string, string>
): Promise<{ dlznikov: number; sOkresom: number; matchPct: number }> {
  if (rows.length < MIN_DLZNIK_RIADKOV) {
    throw new Error(`Zoznam daňových dlžníkov má len ${rows.length} riadkov, čakalo sa aspoň ${MIN_DLZNIK_RIADKOV} - nemazať existujúce dáta.`)
  }

  const poOkresoch = new Map<string, { pocet: number; suma: number }>()
  let sOkresom = 0
  for (const r of rows) {
    const okresKod = pscToOkres.get(r.psc)
    if (!okresKod) continue // zahraničné alebo neznáme PSČ - nepatria do žiadneho okresu
    sOkresom++
    const existujuci = poOkresoch.get(okresKod) ?? { pocet: 0, suma: 0 }
    existujuci.pocet++
    existujuci.suma += r.ciastka
    poOkresoch.set(okresKod, existujuci)
  }

  const matchPct = sOkresom / rows.length
  if (matchPct < MIN_OKRES_MATCH_PCT) {
    throw new Error(
      `Len ${(matchPct * 100).toFixed(1)} % dlžníkov sa priradilo k okresu (čakalo sa aspoň ${MIN_OKRES_MATCH_PCT * 100} %) - nemazať existujúce dáta.`
    )
  }

  const aktualizovane = new Date()
  const zaznamy = [...poOkresoch].map(([okresKod, v]) => ({
    okresKod,
    pocetDlznikov: v.pocet,
    sumaDlhu: v.suma,
    aktualizovane,
  }))

  await prisma.$transaction(
    [
      prisma.fsDanovyDlznikOkres.deleteMany(),
      prisma.fsDanovyDlznikOkres.createMany({ data: zaznamy }),
    ],
    { timeout: 60000 }
  )

  return { dlznikov: rows.length, sOkresom, matchPct }
}
