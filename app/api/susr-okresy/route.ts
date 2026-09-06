// app/api/susr-okresy/route.ts
//
// Okresné ukazovatele zo ŠÚ SR DATAcube (mzdy, zamestnanci, počty podnikov).
// Vlastný endpoint aj vlastná stránka - zámerne oddelené od mapy firiem:
// odvetvia sú tu sekcie SK NACE Rev. 2, kým register firiem beží na
// Rev. 2.1. Spojiť ich do jedného filtra by znamenalo, že polovica čísel na
// výber kategórie reaguje a druhá nie.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface HodnotaRow {
  okresKod: string
  nazov: string
  hodnota: number
}

export async function GET(req: NextRequest) {
  const ukazovatel = req.nextUrl.searchParams.get('ukazovatel') ?? 'PRIEM_MZDA'
  const sekcia = req.nextUrl.searchParams.get('sekcia') ?? 'SPOLU'
  const rokParam = req.nextUrl.searchParams.get('rok')

  // Ponuky do prepínačov sa čítajú z toho, čo je naozaj uložené - nie z
  // natvrdo napísaného zoznamu, ktorý by po zmene datasetu klamal.
  const [roky, sekcie] = await Promise.all([
    prisma.susrOkresUkazovatel.findMany({
      where: { ukazovatel },
      distinct: ['rok'],
      select: { rok: true },
      orderBy: { rok: 'desc' },
    }),
    prisma.susrOkresUkazovatel.findMany({
      where: { ukazovatel },
      distinct: ['sekcia'],
      select: { sekcia: true, sekciaNazov: true },
      orderBy: { sekcia: 'asc' },
    }),
  ])

  const dostupneRoky = roky.map((r) => r.rok)
  // Klient posiela naposledy vybraný rok aj pri prepnutí ukazovateľa - tri
  // datasety (mzdy/zamestnanci/podniky) nemajú úplne rovnaký rozsah rokov
  // (podniky siahajú do 2008, mzdy len do 2009), takže požadovaný rok tu
  // treba overiť proti tomuto konkrétnemu ukazovateľu, nie ho slepo použiť -
  // inak by neplatný rok tíško vrátil prázdny zoznam okresov namiesto
  // najnovšieho dostupného roka.
  const rokRequested = rokParam ? Number(rokParam) : null
  const rok = rokRequested !== null && dostupneRoky.includes(rokRequested) ? rokRequested : (dostupneRoky[0] ?? 0)

  const hodnoty = await prisma.$queryRaw<HodnotaRow[]>`
    SELECT s.okres_kod AS "okresKod", d.nazov_sk AS nazov, s.hodnota
    FROM susr_okres_ukazovatel s
    JOIN districts d ON d.kod = s.okres_kod
    WHERE s.ukazovatel = ${ukazovatel} AND s.sekcia = ${sekcia} AND s.rok = ${rok}
    ORDER BY s.hodnota DESC
  `

  return NextResponse.json({
    ukazovatel,
    sekcia,
    rok,
    dostupneRoky,
    sekcie: sekcie.map((s) => ({ kod: s.sekcia, nazov: s.sekciaNazov ?? s.sekcia })),
    okresy: hodnoty.map((h) => ({ ...h, hodnota: Number(h.hodnota) })),
  })
}
