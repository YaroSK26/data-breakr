// scripts/outreach/summary.ts
//
// Čísla do tela týždenného e-mailu: koľko aktívnych firiem má appka
// celkovo, koľko ich pribudlo tento týždeň v Košickom kraji, a aktuálny
// stav outreach frontu (na_briefovanie vs uz_ma_info).
//
// Použitie: npx tsx scripts/outreach/summary.ts
import { supabase } from './supabase-client'

const KOSICKY_KRAJ = 'SK042'

async function count(builder: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count: c, error } = await builder
  if (error) throw error
  return c ?? 0
}

export async function summary() {
  const [totalActive, kosickychSpolu, frontNove, frontBezInfo, frontMaInfoNeposlane] = await Promise.all([
    count(
      supabase
        .from('business_entities')
        .select('*', { count: 'exact', head: true })
        .is('datum_zaniku', null),
    ),
    count(
      supabase
        .from('business_entities')
        .select('*', { count: 'exact', head: true })
        .eq('kraj_kod', KOSICKY_KRAJ)
        .is('datum_zaniku', null),
    ),
    count(supabase.from('outreach_firm').select('*', { count: 'exact', head: true }).eq('stav', 'nove')),
    count(supabase.from('outreach_firm').select('*', { count: 'exact', head: true }).eq('stav', 'bez_info')),
    count(
      supabase
        .from('outreach_firm')
        .select('*', { count: 'exact', head: true })
        .eq('stav', 'ma_info')
        .is('poslane_v_briefe', null),
    ),
  ])
  return { totalActive, kosickychSpolu, frontNove, frontBezInfo, frontMaInfoNeposlane }
}

async function main() {
  console.log(JSON.stringify(await summary(), null, 2))
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
