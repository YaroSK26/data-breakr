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
// Použitie: npx tsx scripts/outreach/sync-new.ts
import { prisma } from '../../lib/prisma'

const KOSICKY_KRAJ = 'SK042'
const DNI_SPATNE = 9

interface NovaFirmaRow {
  ico: string
  nazov: string | null
  okresKod: string | null
  krajKod: string | null
  datumVzniku: Date | null
}

export async function syncNew(p: typeof prisma = prisma) {
  // Anti-join priamo v SQL namiesto Prisma relácie - outreach_firm.ico sa k
  // business_entities neviaže cez FK (fronta má prežiť aj keby sa
  // business_entities riadok neskôr zmenil/zmazal), takže to nie je
  // relácia, len zhoda stĺpca.
  const noveFirmy = await p.$queryRaw<NovaFirmaRow[]>`
    SELECT be."ico", be."nazov", be."okres_kod" AS "okresKod",
           be."kraj_kod" AS "krajKod", be."datum_vzniku" AS "datumVzniku"
    FROM business_entities be
    LEFT JOIN outreach_firm o ON o.ico = be."ico"
    WHERE be."kraj_kod" = ${KOSICKY_KRAJ}
      AND be."datum_zaniku" IS NULL
      AND be."ico" IS NOT NULL
      AND be."datum_vzniku" >= CURRENT_DATE - (${DNI_SPATNE} || ' days')::interval
      AND o.ico IS NULL
  `

  if (noveFirmy.length === 0) return { pridane: 0 }

  await p.outreachFirm.createMany({
    data: noveFirmy.map((f) => ({
      ico: f.ico,
      nazov: f.nazov,
      okresKod: f.okresKod,
      krajKod: f.krajKod,
      datumVzniku: f.datumVzniku,
    })),
    skipDuplicates: true,
  })

  return { pridane: noveFirmy.length }
}

async function main() {
  const result = await syncNew(prisma)
  console.log(`Pridaných ${result.pridane} nových firiem do outreach frontu.`)
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
