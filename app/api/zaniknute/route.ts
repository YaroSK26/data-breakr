// app/api/zaniknute/route.ts
//
// Analytika zaniknutých subjektov. Číta z agregátov (zaniknute_agg,
// prezitie_agg, vznik_agg), nie z business_entities - tá drží už len živé
// subjekty, riadky zaniknutých boli po spočítaní zmazané kvôli veľkosti
// databázy (viď scripts/prune-defunct-entities.ts).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Agregáty sa menia len denným ingestom, takže nemá zmysel ich prepočítavať
// pri každom načítaní stránky.
export const revalidate = 3600

// Zdroj má aj nezmyselné dátumy (184 subjektov "zaniklo" pred rokom 1900),
// grafy ich orezávajú rovnako ako existujúci graf vzniku firiem.
const PRVY_ROK = 1995

interface RokRow {
  rok: number
  pocet: bigint
}

interface OkresRow {
  okresKod: string
  nazov: string
  zaniklo: bigint
  aktivnych: bigint
  obyvatelov: bigint | null
}

interface KodRow {
  kod: string
  nazov: string | null
  pocet: bigint
}

interface PrezitieRow {
  rokVzniku: number
  rokZaniku: number
  pocet: bigint
}

interface KohortaRow {
  rokVzniku: number
  velkost: bigint
}

export async function GET() {
  const [poRokoch, poOkresoch, poFormach, poOdvetviach, prezitieRaw, kohorty, pokrytie] =
    await Promise.all([
      prisma.$queryRaw<RokRow[]>`
        SELECT rok_zaniku AS rok, SUM(pocet)::bigint AS pocet
        FROM zaniknute_agg
        WHERE rok_zaniku BETWEEN ${PRVY_ROK} AND EXTRACT(YEAR FROM CURRENT_DATE)
        GROUP BY rok_zaniku
        ORDER BY rok_zaniku
      `,
      // Zániky aj živé firmy naraz, aby sa dal ukázať pomer - samotný počet
      // zánikov len kopíruje veľkosť okresu.
      prisma.$queryRaw<OkresRow[]>`
        SELECT d.kod AS "okresKod",
               d.nazov_sk AS nazov,
               COALESCE(z.zaniklo, 0)::bigint AS zaniklo,
               COALESCE(a.aktivnych, 0)::bigint AS aktivnych,
               p.obyvatelov
        FROM districts d
        LEFT JOIN (
          SELECT okres_kod, SUM(pocet)::bigint AS zaniklo FROM zaniknute_agg
          WHERE okres_kod IS NOT NULL GROUP BY okres_kod
        ) z ON z.okres_kod = d.kod
        LEFT JOIN (
          SELECT okres_kod, COUNT(*)::bigint AS aktivnych FROM business_entities
          WHERE okres_kod IS NOT NULL GROUP BY okres_kod
        ) a ON a.okres_kod = d.kod
        LEFT JOIN (
          SELECT district_kod, SUM(population)::bigint AS obyvatelov FROM municipalities
          GROUP BY district_kod
        ) p ON p.district_kod = d.kod
      `,
      prisma.$queryRaw<KodRow[]>`
        SELECT pravna_forma_kod AS kod, NULL::text AS nazov, SUM(pocet)::bigint AS pocet
        FROM zaniknute_agg
        WHERE pravna_forma_kod IS NOT NULL
        GROUP BY pravna_forma_kod
        ORDER BY pocet DESC
        LIMIT 10
      `,
      prisma.$queryRaw<KodRow[]>`
        SELECT z.nace_kod4 AS kod, n.nazov_sk AS nazov, SUM(z.pocet)::bigint AS pocet
        FROM zaniknute_agg z
        LEFT JOIN nace21_codes n ON n.kod = z.nace_kod4 AND n.uroven = 4
        WHERE z.nace_kod4 IS NOT NULL
        GROUP BY z.nace_kod4, n.nazov_sk
        ORDER BY pocet DESC
        LIMIT 12
      `,
      prisma.$queryRaw<PrezitieRow[]>`
        SELECT rok_vzniku AS "rokVzniku", rok_zaniku AS "rokZaniku", pocet::bigint
        FROM prezitie_agg
        WHERE rok_vzniku >= ${PRVY_ROK} AND rok_zaniku >= rok_vzniku
      `,
      // Veľkosť ročníka = tí, čo z neho ešte žijú, plus tí, čo už zanikli.
      // Druhá polovica je vo vznik_agg práve preto, že ich riadky v
      // business_entities už nie sú.
      prisma.$queryRaw<KohortaRow[]>`
        SELECT rok AS "rokVzniku", SUM(pocet)::bigint AS velkost FROM (
          SELECT EXTRACT(YEAR FROM datum_vzniku)::int AS rok, COUNT(*)::bigint AS pocet
          FROM business_entities WHERE datum_vzniku IS NOT NULL GROUP BY 1
          UNION ALL
          SELECT rok_vzniku AS rok, SUM(pocet)::bigint FROM vznik_agg GROUP BY 1
        ) x
        WHERE rok BETWEEN ${PRVY_ROK} AND EXTRACT(YEAR FROM CURRENT_DATE)
        GROUP BY rok
        ORDER BY rok
      `,
      // RPO priraďuje odvetvie len malej časti zaniknutých subjektov -
      // rebríček odvetví je preto postavený na zlomku dát a stránka to
      // musí povedať nahlas, nie schovať pod graf.
      prisma.$queryRaw<{ sNace: bigint; spolu: bigint }[]>`
        SELECT
          COALESCE(SUM(pocet) FILTER (WHERE nace_kod4 IS NOT NULL), 0)::bigint AS "sNace",
          COALESCE(SUM(pocet), 0)::bigint AS spolu
        FROM zaniknute_agg
      `,
    ])

  // Krivka prežitia: pre každý ročník podiel subjektov, ktoré po N rokoch
  // ešte existovali. Počíta sa z kumulatívnych úmrtí, nie z priameho počtu
  // živých - živé vieme len k dnešku, nie spätne k danému roku.
  const umrtiaPodlaKohorty = new Map<number, Map<number, number>>()
  for (const r of prezitieRaw) {
    const podlaRokov = umrtiaPodlaKohorty.get(r.rokVzniku) ?? new Map<number, number>()
    const vek = r.rokZaniku - r.rokVzniku
    podlaRokov.set(vek, (podlaRokov.get(vek) ?? 0) + Number(r.pocet))
    umrtiaPodlaKohorty.set(r.rokVzniku, podlaRokov)
  }

  const aktualnyRok = new Date().getFullYear()
  const prezitie = kohorty
    .map((k) => {
      const velkost = Number(k.velkost)
      const umrtia = umrtiaPodlaKohorty.get(k.rokVzniku) ?? new Map<number, number>()
      // Ročník sa sleduje len po dnešok - ďalej by krivka klesala len
      // preto, že tie roky ešte nenastali.
      const maxVek = aktualnyRok - k.rokVzniku
      let kumulativne = 0
      const body: { vek: number; podiel: number }[] = []
      for (let vek = 0; vek <= maxVek; vek++) {
        kumulativne += umrtia.get(vek) ?? 0
        body.push({
          vek,
          podiel: velkost > 0 ? Math.max(0, 1 - kumulativne / velkost) : 0,
        })
      }
      return { rokVzniku: k.rokVzniku, velkost, body }
    })
    .filter((k) => k.velkost > 0)

  const p = pokrytie[0]

  return NextResponse.json({
    poRokoch: poRokoch.map((r) => ({ rok: r.rok, pocet: Number(r.pocet) })),
    poOkresoch: poOkresoch.map((o) => ({
      okresKod: o.okresKod,
      nazov: o.nazov,
      zaniklo: Number(o.zaniklo),
      aktivnych: Number(o.aktivnych),
      obyvatelov: o.obyvatelov === null ? null : Number(o.obyvatelov),
    })),
    poFormach: poFormach.map((f) => ({ kod: f.kod, pocet: Number(f.pocet) })),
    poOdvetviach: poOdvetviach.map((o) => ({
      kod: o.kod,
      nazov: o.nazov ?? o.kod,
      pocet: Number(o.pocet),
    })),
    prezitie,
    pokrytieNace: {
      sOdvetvim: Number(p?.sNace ?? 0),
      spolu: Number(p?.spolu ?? 0),
    },
  })
}
