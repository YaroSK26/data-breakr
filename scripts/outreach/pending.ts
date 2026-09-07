// scripts/outreach/pending.ts
//
// Krok 2: vypíše firmy čakajúce na web-search klasifikáciu (nove alebo
// bez_info z predošlých týždňov) ako JSON - vstup pre agenta, ktorý ich
// jednu po druhej preverí a zapíše výsledok cez update.ts.
//
// Použitie: npx tsx scripts/outreach/pending.ts
import { prisma } from '../../lib/prisma'

export async function pending(p: typeof prisma = prisma) {
  return p.outreachFirm.findMany({
    where: { stav: { in: ['nove', 'bez_info'] } },
    orderBy: { datumVzniku: 'desc' },
  })
}

async function main() {
  const rows = await pending(prisma)
  console.log(JSON.stringify(rows, null, 2))
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
