// scripts/outreach/summary.ts
//
// Čísla do tela týždenného e-mailu: koľko aktívnych firiem má appka
// celkovo, koľko ich pribudlo tento týždeň v Košickom kraji, a aktuálny
// stav outreach frontu (na_briefovanie vs uz_ma_info).
//
// Použitie: npx tsx scripts/outreach/summary.ts
import { prisma } from '../../lib/prisma'

const KOSICKY_KRAJ = 'SK042'

export async function summary(p: typeof prisma = prisma) {
  const [totalActive, kosickychSpolu, frontNove, frontBezInfo, frontMaInfo] = await Promise.all([
    p.businessEntity.count({ where: { datumZaniku: null } }),
    p.businessEntity.count({ where: { krajKod: KOSICKY_KRAJ, datumZaniku: null } }),
    p.outreachFirm.count({ where: { stav: 'nove' } }),
    p.outreachFirm.count({ where: { stav: 'bez_info' } }),
    p.outreachFirm.count({ where: { stav: 'ma_info', poslaneVBriefe: null } }),
  ])
  return { totalActive, kosickychSpolu, frontNove, frontBezInfo, frontMaInfoNeposlane: frontMaInfo }
}

async function main() {
  console.log(JSON.stringify(await summary(prisma), null, 2))
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
