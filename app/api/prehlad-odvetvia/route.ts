// app/api/prehlad-odvetvia/route.ts
//
// Jedna kartička so všetkým, čo si o dvojici okres + odvetvie inak musel
// pozbierať z mapy, zo štatistík okresov a zo stránky zaniknutých firiem.
// Nepridáva žiadne nové dáta - iba skladá to, čo už v databáze je, do
// jednej odpovede.
//
// Počty sa rátajú naživo z business_entities rovnakým dotazom ako
// /api/density, nie z predpočítaného business_density_agg. Agregát je
// lacnejší, ale je to denný snapshot - karta by potom pri tom istom okrese
// ukazovala iné číslo ako mapa nad ňou, a nesúhlasiace čísla na jednej
// obrazovke sú horšie ako o niečo drahší dotaz.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveNaceFilter } from '@/lib/nace'

// Rozpad zaniknutých subjektov podľa odvetvia vedie zaniknute_agg až od
// roku 2025 - staršie roky majú NACE vyplnené v desiatkach riadkov z
// desaťtisícov (2024: 35 zo 15 487, 2023: 8 zo 14 857). Karta preto ukazuje
// len roky, v ktorých ten rozpad naozaj existuje, a vedľa toho to prizná.
const PRVY_ROK_NACE_ROZPADU = 2025

interface OkresRow {
  kod: string
  nazov: string
  kraj: string
  obyvatelov: bigint | null
}

interface OdvetvieRow {
  kod: string
  nazov: string
  sekcia: string
  sekciaNazov: string
}

interface PocetRow {
  aktivnych: bigint
  nove12m: bigint
  platcovDph: bigint
}

interface RebricekRow {
  okresKod: string
  nazov: string
  pocet: bigint
  obyvatelov: bigint | null
}

interface ZanikRow {
  rok: number
  pocet: bigint
}

interface MzdaRow {
  rok: number
  sekcia: string
  sekciaNazov: string | null
  hodnota: number
}

export async function GET(req: NextRequest) {
  const okres = req.nextUrl.searchParams.get('okres')
  const nace = req.nextUrl.searchParams.get('nace')

  if (!okres) {
    return NextResponse.json({ error: 'Chýba parameter okres.' }, { status: 400 })
  }

  // Rovnaký preklad cez prevodník ako /api/density a /api/firms-in-district -
  // inak by karta pri staršom odkaze s kódom Rev. 2 tíško ukázala nuly.
  const naceCodes = nace ? await resolveNaceFilter(prisma, nace) : []
  const naceFilter =
    naceCodes.length > 0 ? Prisma.sql`AND be."nace_kod4" IN (${Prisma.join(naceCodes)})` : Prisma.empty

  const [okresRows, odvetvieRows, pocty, rebricek, zaniky, dlznik, zdroje] = await Promise.all([
    prisma.$queryRaw<OkresRow[]>`
      SELECT d.kod, d.nazov_sk AS nazov, r.nazov_sk AS kraj,
             (SELECT SUM(m.population) FROM municipalities m WHERE m.district_kod = d.kod) AS obyvatelov
      FROM districts d
      JOIN regions r ON r.kod = d.region_kod
      WHERE d.kod = ${okres}
    `,
    nace
      ? prisma.$queryRaw<OdvetvieRow[]>`
          SELECT trieda.kod, trieda.nazov_sk AS nazov,
                 sekcia.kod AS "sekcia", sekcia.nazov_sk AS "sekciaNazov"
          FROM nace21_codes trieda
          JOIN nace21_codes skupina ON skupina.kod = trieda.parent_kod
          JOIN nace21_codes divizia ON divizia.kod = skupina.parent_kod
          JOIN nace21_codes sekcia  ON sekcia.kod  = divizia.parent_kod
          WHERE trieda.kod = ${naceCodes[0] ?? nace}
        `
      : Promise.resolve([] as OdvetvieRow[]),
    prisma.$queryRaw<PocetRow[]>`
      SELECT
        COUNT(*) AS "aktivnych",
        COUNT(*) FILTER (WHERE be."datum_vzniku" >= CURRENT_DATE - INTERVAL '12 months') AS "nove12m",
        COUNT(fp.ico) AS "platcovDph"
      FROM business_entities be
      LEFT JOIN fs_platca_dph fp ON fp.ico = be."ico"
      WHERE be."okres_kod" = ${okres} AND be."datum_zaniku" IS NULL
      ${naceFilter}
    `,
    prisma.$queryRaw<RebricekRow[]>`
      SELECT be."okres_kod" AS "okresKod", d.nazov_sk AS nazov, COUNT(*) AS "pocet",
             MAX(dp.population) AS "obyvatelov"
      FROM business_entities be
      JOIN districts d ON d.kod = be."okres_kod"
      LEFT JOIN (
        SELECT district_kod, SUM(population) AS population
        FROM municipalities
        GROUP BY district_kod
      ) dp ON dp.district_kod = be."okres_kod"
      WHERE be."datum_zaniku" IS NULL AND be."okres_kod" IS NOT NULL
      ${naceFilter}
      GROUP BY be."okres_kod", d.nazov_sk
    `,
    prisma.$queryRaw<ZanikRow[]>`
      SELECT za.rok_zaniku AS rok, SUM(za.pocet)::bigint AS pocet
      FROM zaniknute_agg za
      WHERE za.okres_kod = ${okres}
        AND za.rok_zaniku >= ${PRVY_ROK_NACE_ROZPADU}
        ${
          naceCodes.length > 0
            ? Prisma.sql`AND za.nace_kod4 IN (${Prisma.join(naceCodes)})`
            : Prisma.empty
        }
      GROUP BY za.rok_zaniku
      ORDER BY za.rok_zaniku
    `,
    prisma.fsDanovyDlznikOkres.findUnique({ where: { okresKod: okres } }),
    prisma.dataSource.findMany({ orderBy: { sourceName: 'asc' } }),
  ])

  const okresInfo = okresRows[0]
  if (!okresInfo) {
    return NextResponse.json({ error: 'Neznámy okres.' }, { status: 404 })
  }

  const odvetvie = odvetvieRows[0] ?? null
  const aktivnych = Number(pocty[0]?.aktivnych ?? 0)
  const nove12m = Number(pocty[0]?.nove12m ?? 0)
  const platcovDph = Number(pocty[0]?.platcovDph ?? 0)
  const obyvatelov = okresInfo.obyvatelov ? Number(okresInfo.obyvatelov) : null

  // Mzdy zo ŠÚ SR sú kódované v sekciách SK NACE Rev. 2, register firiem v
  // Rev. 2.1. Písmená sekcií A-S sa medzi revíziami prekrývajú, ale Rev. 2.1
  // pridala sekcie T, U a V, ku ktorým žiadne mzdové čísla neexistujú -
  // vtedy sa vezme mzda za okres spolu a karta to povie nahlas, namiesto
  // aby podsunula mzdu z nesúvisiaceho odvetvia.
  const sekcia = odvetvie?.sekcia ?? 'SPOLU'
  const mzdy = await prisma.$queryRaw<MzdaRow[]>`
    SELECT rok, sekcia, sekcia_nazov AS "sekciaNazov", hodnota
    FROM susr_okres_ukazovatel
    WHERE okres_kod = ${okres}
      AND ukazovatel = 'PRIEM_MZDA'
      AND sekcia IN (${sekcia}, 'SPOLU')
    ORDER BY rok DESC
  `
  const mzdaOdvetvia = mzdy.find((m) => m.sekcia === sekcia) ?? null
  const mzdaSpolu = mzdy.find((m) => m.sekcia === 'SPOLU') ?? null
  const mzda = mzdaOdvetvia ?? mzdaSpolu
  const mzdaJeZaOkresSpolu = mzdaOdvetvia === null && mzdaSpolu !== null

  // Poradie okresu v hustote na 1000 obyvateľov. Okresy bez známej
  // populácie do rebríčka nevstupujú - nemajú z čoho mať prepočet.
  const sPrepoctom = rebricek
    .map((r) => ({
      okresKod: r.okresKod,
      nazov: r.nazov,
      pocet: Number(r.pocet),
      obyvatelov: r.obyvatelov ? Number(r.obyvatelov) : 0,
    }))
    .filter((r) => r.obyvatelov > 0)
    .map((r) => ({ ...r, na1000: (r.pocet / r.obyvatelov) * 1000 }))
    .sort((a, b) => b.na1000 - a.na1000)

  const poradie = sPrepoctom.findIndex((r) => r.okresKod === okres) + 1
  const celkomNaSlovensku = rebricek.reduce((s, r) => s + Number(r.pocet), 0)
  const obyvatelovSpolu = sPrepoctom.reduce((s, r) => s + r.obyvatelov, 0)

  const upozornenia: string[] = []
  if (nace) {
    upozornenia.push(
      'Rozpad zaniknutých subjektov podľa odvetvia vedie register až od roku 2025 - počty zaniknutých za staršie roky sa pre konkrétne odvetvie zobraziť nedajú.',
    )
  } else {
    // Bez odvetvia by okresné počty zaniknutých siahali aj hlbšie do
    // minulosti, ale karta ich zámerne reže na tú istú hranicu ako pri
    // odvetví - inak by prepnutie odvetvia ticho menilo obdobie, za ktoré
    // sa čísla čítajú.
    upozornenia.push(
      `Počet zaniknutých je za roky ${PRVY_ROK_NACE_ROZPADU} a novšie, nie za celú históriu okresu.`,
    )
  }
  if (mzdaJeZaOkresSpolu) {
    upozornenia.push(
      `Pre toto odvetvie nemá ŠÚ SR samostatnú mzdu (sekcia ${sekcia} v klasifikácii Rev. 2, v ktorej sú mzdy vedené, neexistuje) - zobrazená je priemerná mzda za okres spolu.`,
    )
  } else if (odvetvie) {
    upozornenia.push(
      'Mzda je vedená v sekciách SK NACE Rev. 2, kým firmy sú kódované v Rev. 2.1 - sekcia je priradená podľa písmena, nie cez prevodník.',
    )
  }
  upozornenia.push(
    'Počet nových subjektov za 12 mesiacov zahŕňa len tie, ktoré k dnešnému dňu stále existujú - tie, čo medzitým zanikli, v ňom nie sú.',
  )

  return NextResponse.json({
    okres: { kod: okresInfo.kod, nazov: okresInfo.nazov, kraj: okresInfo.kraj, obyvatelov },
    odvetvie,
    firmy: {
      aktivnych,
      nove12m,
      na1000: obyvatelov ? (aktivnych / obyvatelov) * 1000 : null,
      platcovDph,
      podielPlatcovDph: aktivnych > 0 ? (platcovDph / aktivnych) * 100 : null,
    },
    hustota: {
      poradie: poradie > 0 ? poradie : null,
      zPoctuOkresov: sPrepoctom.length,
      najhustejsie: sPrepoctom.slice(0, 3).map((r) => ({ nazov: r.nazov, na1000: r.na1000 })),
      celoslovenskyPriemerNa1000:
        obyvatelovSpolu > 0 ? (celkomNaSlovensku / obyvatelovSpolu) * 1000 : null,
      celkomNaSlovensku,
    },
    zaniky: zaniky.map((z) => ({ rok: z.rok, pocet: Number(z.pocet) })),
    mzda: mzda
      ? {
          hodnota: Number(mzda.hodnota),
          rok: mzda.rok,
          sekcia: mzda.sekcia,
          sekciaNazov: mzda.sekciaNazov,
          zaOkresSpolu: mzdaJeZaOkresSpolu,
        }
      : null,
    dlznici: dlznik
      ? { pocet: dlznik.pocetDlznikov, suma: dlznik.sumaDlhu, aktualizovane: dlznik.aktualizovane }
      : null,
    upozornenia,
    zdroje: zdroje.map((z) => ({
      sourceName: z.sourceName,
      sourceUrl: z.sourceUrl,
      lastSyncedAt: z.lastSyncedAt,
      recordsCount: z.recordsCount,
    })),
  })
}
