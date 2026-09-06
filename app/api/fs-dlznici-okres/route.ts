// app/api/fs-dlznici-okres/route.ts
//
// Agregát daňových dlžníkov Finančnej správy SR po okresoch, spolu s
// kontextom potrebným na rebríček a krížovú analýzu (podiel platiteľov DPH,
// populácia) - jeden endpoint, jedno volanie, namiesto skladania z
// viacerých API na strane klienta.
//
// Nikdy nevracia mená konkrétnych dlžníkov - fs_danovy_dlznik_okres ich ani
// neukladá, zdrojový zoznam obsahuje aj fyzické osoby a mená sa z dôvodu
// ochrany súkromia nedržia.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Join cez 1M+ riadkov business_entities x fs_platca_dph pri každom
// volaní trvá rádovo sekundy - dáta sa menia len pri dennom ingeste FS SR,
// takže hodinová cache stačí (rovnaký vzor ako /api/zaniknute).
export const revalidate = 3600

interface Row {
  okresKod: string
  nazov: string
  pocetDlznikov: number
  sumaDlhu: number
  aktivnychFiriem: number
  pocetPlatcovDph: number
  obyvatelov: number | null
}

export async function GET() {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      d.kod AS "okresKod",
      d.nazov_sk AS nazov,
      COALESCE(f.pocet_dlznikov, 0) AS "pocetDlznikov",
      COALESCE(f.suma_dlhu, 0) AS "sumaDlhu",
      COALESCE(a.aktivnych, 0)::int AS "aktivnychFiriem",
      COALESCE(a.platcov_dph, 0)::int AS "pocetPlatcovDph",
      p.obyvatelov
    FROM districts d
    LEFT JOIN fs_danovy_dlznik_okres f ON f.okres_kod = d.kod
    LEFT JOIN (
      SELECT be.okres_kod, COUNT(*) AS aktivnych, COUNT(fp.ico) AS platcov_dph
      FROM business_entities be
      LEFT JOIN fs_platca_dph fp ON fp.ico = be.ico
      WHERE be.okres_kod IS NOT NULL
      GROUP BY be.okres_kod
    ) a ON a.okres_kod = d.kod
    LEFT JOIN (
      SELECT district_kod, SUM(population)::int AS obyvatelov FROM municipalities
      GROUP BY district_kod
    ) p ON p.district_kod = d.kod
    ORDER BY d.nazov_sk
  `

  return NextResponse.json({ okresy: rows })
}
