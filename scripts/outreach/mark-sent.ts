// scripts/outreach/mark-sent.ts
//
// Krok 4: po odoslaní týždenného e-mailu označí všetky 'ma_info' firmy,
// ktoré doň vošli, aby sa v budúcom briefe neopakovali (v tabuľke ostávajú,
// len sa už nezahŕňajú do súhrnu v summary.ts).
//
// Použitie: npx tsx scripts/outreach/mark-sent.ts
import { supabase } from './supabase-client'

export async function markSent() {
  const { data, error } = await supabase
    .from('outreach_firm')
    .update({ poslane_v_briefe: new Date().toISOString() })
    .eq('stav', 'ma_info')
    .is('poslane_v_briefe', null)
    .select('ico')
  if (error) throw error
  return { oznacene: data?.length ?? 0 }
}

async function main() {
  const result = await markSent()
  console.log(`Označených ${result.oznacene} firiem ako odoslané v briefe.`)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
