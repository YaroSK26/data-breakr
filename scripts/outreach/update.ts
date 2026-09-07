// scripts/outreach/update.ts
//
// Krok 3: zapíše výsledok web-search klasifikácie pre jednu firmu.
// stav 'ma_info' je konečný (firma sa z frontu 'nove'/'bez_info' vyradí);
// 'bez_info' ostáva vo fronte a skúsi sa znova o týždeň.
//
// Použitie: npx tsx scripts/outreach/update.ts <ico> <ma_info|bez_info> "<najdena_info>"
import { prisma } from '../../lib/prisma'

export async function updateStav(
  p: typeof prisma,
  ico: string,
  stav: 'ma_info' | 'bez_info',
  najdenaInfo: string | null,
) {
  return p.outreachFirm.update({
    where: { ico },
    data: {
      stav,
      najdenaInfo,
      posledneCheck: new Date(),
      pocetKontrol: { increment: 1 },
    },
  })
}

async function main() {
  const [ico, stav, najdenaInfo] = process.argv.slice(2)
  if (!ico || (stav !== 'ma_info' && stav !== 'bez_info')) {
    console.error('Použitie: npx tsx scripts/outreach/update.ts <ico> <ma_info|bez_info> "<najdena_info>"')
    process.exit(1)
  }
  await updateStav(prisma, ico, stav, najdenaInfo ?? null)
  console.log(`${ico} -> ${stav}`)
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
