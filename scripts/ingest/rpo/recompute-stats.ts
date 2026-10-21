// scripts/ingest/rpo/recompute-stats.ts
//
// Computes the /statistiky aggregates once and caches them - see
// StatsCache model comment in schema.prisma for why.
import { Prisma, type PrismaClient } from '@prisma/client'
import { PERSON_TYPE_CODES } from '../../../lib/legalForms'

interface DistrictCountRow {
  okresKod: string
  nazovSk: string
  pocet: bigint
}

interface CategoryCountRow {
  kod4: string
  nazov: string
  pocet: bigint
}

interface StavRow {
  stav: string
  pocet: bigint
}

interface YearRow {
  rok: number
  pocet: bigint
}

export async function recomputeStats(prisma: PrismaClient) {
  const [[{ totalActive, aktivnychPravnickych }], podlaStavuRaw, terminatedAgg, allDistrictCounts, byCategory, byYearRaw] = await Promise.all([
    // Počíta sa IČO, nie riadok: ~22 tis. ľudí má v RPO dva záznamy (živnosť
    // a slobodné povolanie pod tým istým IČO) a firmou sú raz. Rovnako sa
    // počítajú okresy a odvetvia nižšie, aby čísla na stránke sedeli.
    // Právnické osoby zvlášť - porovnávajú sa so ŠÚ SR, ktorý živnostníkov
    // do "podnikov" nepočíta.
    prisma.$queryRaw<{ totalActive: number; aktivnychPravnickych: number }[]>`
      SELECT
        COUNT(DISTINCT COALESCE(ico, id::text))::int AS "totalActive",
        COUNT(DISTINCT COALESCE(ico, id::text)) FILTER (
          WHERE pravna_forma_kod NOT IN (${Prisma.join([...PERSON_TYPE_CODES.fyzicke])})
        )::int AS "aktivnychPravnickych"
      FROM business_entities WHERE stav = 'aktivny'
    `,
    // Rozpis všetkého, čo v RPO nemá dátum zániku - stránka ho ukazuje, aby
    // bolo vidno, čo sa do aktívnych nezapočítalo a prečo.
    prisma.$queryRaw<StavRow[]>`
      SELECT stav, COUNT(*)::bigint AS pocet FROM business_entities GROUP BY stav
    `,
    // Zaniknuté subjekty už v business_entities nie sú (viď
    // prune-defunct-entities.ts), ich počet drží agregát.
    prisma.zaniknuteAgg.aggregate({ _sum: { pocet: true } }),
    prisma.$queryRaw<DistrictCountRow[]>`
      SELECT be."okres_kod" AS "okresKod", d.nazov_sk AS "nazovSk",
             COUNT(DISTINCT COALESCE(be.ico, be.id::text)) AS pocet
      FROM business_entities be
      JOIN districts d ON d.kod = be."okres_kod"
      WHERE be."stav" = 'aktivny' AND be."okres_kod" IS NOT NULL
      GROUP BY be."okres_kod", d.nazov_sk
    `,
    // Named from nace21_codes (NACE Rev. 2.1), the revision RPO codes these
    // entities in. This used to join RÚZ's SK NACE Rev. 2 list, which had
    // no name for about 1 in 5 active codes - and because this is a top-12
    // ranking, the unnamed ones were exactly the biggest categories (4712,
    // 4335, 7020, 4100), so the chart silently showed 7th-18th place as if
    // it were 1st-12th.
    prisma.$queryRaw<CategoryCountRow[]>`
      SELECT be."nace_kod4" AS kod4, COALESCE(nc.nazov_sk, be."nace_kod4") AS nazov,
             COUNT(DISTINCT COALESCE(be.ico, be.id::text)) AS pocet
      FROM business_entities be
      LEFT JOIN nace21_codes nc ON nc.kod = be."nace_kod4" AND nc.uroven = 4
      WHERE be."stav" = 'aktivny' AND be."nace_kod4" IS NOT NULL
      GROUP BY be."nace_kod4", nc.nazov_sk
      ORDER BY pocet DESC
      LIMIT 12
    `,
    // Upper-bounded at the current year, not just >= 1995 - a handful of
    // source records carry a datum_vzniku dated into next year (bad/typo
    // data from RPO, not real future registrations), which would otherwise
    // show up as a stray bar past "today" on the chart.
    // Dva zdroje, lebo tabuľka drží už len živé subjekty: vzniky
    // zaniknutých firiem sú vo vznik_agg. Bez tejto druhej polovice by
    // graf tvrdil, že v roku 2015 vzniklo o polovicu menej firiem, než
    // naozaj vzniklo - videl by len tie, čo dodnes prežili.
    prisma.$queryRaw<YearRow[]>`
      SELECT rok, SUM(pocet)::bigint AS pocet FROM (
        SELECT EXTRACT(YEAR FROM "datum_vzniku")::int AS rok, COUNT(*)::bigint AS pocet
        FROM business_entities
        WHERE "datum_vzniku" IS NOT NULL
        GROUP BY 1
        UNION ALL
        SELECT rok_vzniku AS rok, SUM(pocet)::bigint FROM vznik_agg GROUP BY 1
      ) spolu
      WHERE rok BETWEEN 1995 AND EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY rok
      ORDER BY rok ASC
    `,
  ])

  const totalTerminated = terminatedAgg._sum.pocet ?? 0

  // Bratislava (5 mestských okresov) and Košice (4) are administratively
  // split - a raw per-district ranking makes them look smaller than
  // single-district cities like Žilina or Nitra with comparable real
  // population/economic size. Merge each city's districts into one entry
  // before ranking, so the comparison is apples-to-apples.
  const merged = new Map<string, number>()
  for (const r of allDistrictCounts) {
    const displayName = r.nazovSk.startsWith('Bratislava')
      ? 'Bratislava (spolu)'
      : r.nazovSk.startsWith('Košice')
        ? 'Košice (spolu)'
        : r.nazovSk
    merged.set(displayName, (merged.get(displayName) ?? 0) + Number(r.pocet))
  }
  const byDistrict = Array.from(merged.entries())
    .map(([nazov, pocet]) => ({ nazov, pocet }))
    .sort((a, b) => b.pocet - a.pocet)
    .slice(0, 15)

  const podlaStavu = Object.fromEntries(podlaStavuRaw.map((r) => [r.stav, Number(r.pocet)]))
  const bezZaniku = podlaStavuRaw.reduce((sum, r) => sum + Number(r.pocet), 0)

  const data = {
    totalActive,
    // Záznamy v RPO bez dátumu zániku - toto číslo appka predtým
    // vydávala za "aktívne firmy".
    bezZaniku,
    podlaStavu,
    aktivnychPravnickych,
    totalTerminated,
    byDistrict,
    byCategory: byCategory.map((r) => ({ kod4: r.kod4, nazov: r.nazov ?? r.kod4, pocet: Number(r.pocet) })),
    byYear: byYearRaw.map((r) => ({ rok: r.rok, pocet: Number(r.pocet) })),
  }

  await prisma.statsCache.upsert({
    where: { key: 'homepage' },
    create: { key: 'homepage', data, computedAt: new Date() },
    update: { data, computedAt: new Date() },
  })

  return data
}
