// scripts/outreach/update.ts
//
// Krok 3: zapíše výsledok web-search klasifikácie pre jednu firmu.
// stav 'ma_info' je konečný (firma sa z frontu 'nove'/'bez_info' vyradí);
// 'bez_info' ostáva vo fronte a skúsi sa znova o týždeň.
//
// Použitie: npx tsx scripts/outreach/update.ts <ico> <ma_info|bez_info> "<najdena_info>"
import { supabase } from './supabase-client'

export async function updateStav(
  ico: string,
  stav: 'ma_info' | 'bez_info',
  najdenaInfo: string | null,
) {
  const { data: current, error: e1 } = await supabase
    .from('outreach_firm')
    .select('pocet_kontrol')
    .eq('ico', ico)
    .single()
  if (e1) throw e1

  const { error: e2 } = await supabase
    .from('outreach_firm')
    .update({
      stav,
      najdena_info: najdenaInfo,
      posledne_check: new Date().toISOString(),
      pocet_kontrol: (current?.pocet_kontrol ?? 0) + 1,
    })
    .eq('ico', ico)
  if (e2) throw e2
}

async function main() {
  const [ico, stav, najdenaInfo] = process.argv.slice(2)
  if (!ico || (stav !== 'ma_info' && stav !== 'bez_info')) {
    console.error('Použitie: npx tsx scripts/outreach/update.ts <ico> <ma_info|bez_info> "<najdena_info>"')
    process.exit(1)
  }
  await updateStav(ico, stav, najdenaInfo ?? null)
  console.log(`${ico} -> ${stav}`)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
