// scripts/outreach/sync-new.ts
//
// Krok 1 týždenného košického briefu: nájde ČERSTVO ZAREGISTROVANÉ firmy v
// Košickom kraji (SK042) - vznik v posledných DNI_SPATNE dňoch - ktoré ešte
// nie sú vo fronte outreach_firm, a pridá ich so stavom 'nove'.
//
// DNI_SPATNE=9 pri týždennej kadencii (7 dní + 2 dni rezerva, aby sa nič
// nestratilo pri posune behu) - úmyselne NEberie všetky historicky aktívne
// firmy v kraji naraz (bolo by ich ~100 tisíc, na web-search klasifikáciu
// nepoužiteľné množstvo). Existujúce riadky sa nemenia - fronta si drží
// vlastný stav (ma_info / bez_info) naprieč týždňami, tento krok len dopĺňa
// nové.
//
// PostgREST nevie robiť anti-join cez dve tabuľky v jednom volaní - existujúce
// ICO vo fronte sa preto načítajú a filtrujú v JS namiesto v SQL. Fronta
// rastie pomaly (rádovo desiatky za týždeň), takže to ostáva malé aj o rok.
//
// Použitie: npx tsx scripts/outreach/sync-new.ts
import { supabase } from './supabase-client'

const KOSICKY_KRAJ = 'SK042'
const DNI_SPATNE = 9

export async function syncNew() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - DNI_SPATNE)

  const [{ data: kandidati, error: e1 }, { data: existujuce, error: e2 }] = await Promise.all([
    supabase
      .from('business_entities')
      .select('ico, nazov, okres_kod, kraj_kod, datum_vzniku')
      .eq('kraj_kod', KOSICKY_KRAJ)
      .is('datum_zaniku', null)
      .not('ico', 'is', null)
      .gte('datum_vzniku', cutoff.toISOString()),
    supabase.from('outreach_firm').select('ico'),
  ])

  if (e1) throw e1
  if (e2) throw e2

  const uzVoFronte = new Set((existujuce ?? []).map((r) => r.ico))
  const nove = (kandidati ?? []).filter((f) => !uzVoFronte.has(f.ico))

  if (nove.length === 0) return { pridane: 0 }

  const { error: e3 } = await supabase.from('outreach_firm').insert(
    nove.map((f) => ({
      ico: f.ico,
      nazov: f.nazov,
      okres_kod: f.okres_kod,
      kraj_kod: f.kraj_kod,
      datum_vzniku: f.datum_vzniku,
    })),
  )
  if (e3) throw e3

  return { pridane: nove.length }
}

async function main() {
  const result = await syncNew()
  console.log(`Pridaných ${result.pridane} nových firiem do outreach frontu.`)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
