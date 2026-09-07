// scripts/outreach/pending.ts
//
// Krok 2: vypíše firmy čakajúce na web-search klasifikáciu (nove alebo
// bez_info z predošlých týždňov) ako JSON - vstup pre agenta, ktorý ich
// jednu po druhej preverí a zapíše výsledok cez update.ts.
//
// Strop na beh - viac než pár desiatok firiem naraz by websearch nezvládol
// v jednom behu. Zvyšok ostáva vo fronte a dotiahne sa v ďalších týždňoch.
//
// Použitie: npx tsx scripts/outreach/pending.ts
import { supabase } from './supabase-client'

const MAX_NA_BEH = 25

export async function pending() {
  const { data, error } = await supabase
    .from('outreach_firm')
    .select('*')
    .in('stav', ['nove', 'bez_info'])
    .order('datum_vzniku', { ascending: false })
    .limit(MAX_NA_BEH)
  if (error) throw error
  return data ?? []
}

async function main() {
  console.log(JSON.stringify(await pending(), null, 2))
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
