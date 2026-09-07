// scripts/outreach/mark-sent.ts
//
// Krok 4: po odoslaní týždenného e-mailu označí všetky 'ma_info' firmy,
// ktoré doň vošli, aby sa v budúcom briefe neopakovali (v tabuľke ostávajú,
// len sa už nezahŕňajú do súhrnu v summary.ts).
//
// Použitie: npx tsx scripts/outreach/mark-sent.ts
import { prisma } from '../../lib/prisma'

export async function markSent(p: typeof prisma = prisma) {
  const result = await p.outreachFirm.updateMany({
    where: { stav: 'ma_info', poslaneVBriefe: null },
    data: { poslaneVBriefe: new Date() },
  })
  return { oznacene: result.count }
}

async function main() {
  const result = await markSent(prisma)
  console.log(`Označených ${result.oznacene} firiem ako odoslané v briefe.`)
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
