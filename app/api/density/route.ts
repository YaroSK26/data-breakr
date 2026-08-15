// app/api/density/route.ts
//
// Serves municipality-level GeoJSON polygons colored by district-level
// business density. Rendering granularity is "obec" (municipality, ~2900
// polygons, from Eurostat GISCO LAU data) but the DATA value shown is
// computed live at "okres" (district) granularity from business_entities —
// every municipality within a district shows the same count/ratio. This
// avoids needing district-boundary polygons (not available from any
// EU-harmonized source) while still satisfying the spec's "okresy, prípadne
// obce pri dostatočnom detaile" requirement: district-level values, at
// municipality-level render detail.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface DensityRow {
  okresKod: string
  pocet: bigint
  population: number | null
}

export async function GET(req: NextRequest) {
  const naceKod4 = req.nextUrl.searchParams.get('nace')

  const rows = naceKod4
    ? await prisma.$queryRaw<DensityRow[]>`
        SELECT
          be."okres_kod" AS "okresKod",
          COUNT(DISTINCT be.id) AS "pocet",
          MAX(dp.population) AS "population"
        FROM business_entities be
        LEFT JOIN (
          SELECT district_kod, SUM(population) AS population
          FROM municipalities
          GROUP BY district_kod
        ) dp ON dp.district_kod = be."okres_kod"
        WHERE be."datum_zaniku" IS NULL AND be."okres_kod" IS NOT NULL AND be."nace_kod4" = ${naceKod4}
        GROUP BY be."okres_kod"
      `
    : await prisma.$queryRaw<DensityRow[]>`
        SELECT
          be."okres_kod" AS "okresKod",
          COUNT(DISTINCT be.id) AS "pocet",
          MAX(dp.population) AS "population"
        FROM business_entities be
        LEFT JOIN (
          SELECT district_kod, SUM(population) AS population
          FROM municipalities
          GROUP BY district_kod
        ) dp ON dp.district_kod = be."okres_kod"
        WHERE be."datum_zaniku" IS NULL AND be."okres_kod" IS NOT NULL
        GROUP BY be."okres_kod"
      `

  const byDistrict = new Map<
    string,
    { pocetPrevadzok: number; pocetNa1000Obyvatelov: number | null }
  >()
  for (const row of rows) {
    const pocet = Number(row.pocet)
    const population = row.population ? Number(row.population) : null
    byDistrict.set(row.okresKod, {
      pocetPrevadzok: pocet,
      pocetNa1000Obyvatelov: population ? (pocet / population) * 1000 : null,
    })
  }

  const municipalities = await prisma.municipality.findMany({
    where: { geometry: { not: undefined } },
    select: {
      kod: true,
      nazov: true,
      districtKod: true,
      population: true,
      geometry: true,
      district: { select: { nazovSk: true } },
    },
  })

  const features = municipalities
    .filter((m) => m.geometry !== null)
    .map((m) => {
      const density = byDistrict.get(m.districtKod)
      return {
        type: 'Feature' as const,
        geometry: m.geometry,
        properties: {
          kod: m.kod,
          nazov: m.nazov,
          okresKod: m.districtKod,
          okresNazov: m.district.nazovSk,
          population: m.population,
          pocetPrevadzok: density?.pocetPrevadzok ?? 0,
          pocetNa1000Obyvatelov: density?.pocetNa1000Obyvatelov ?? null,
        },
      }
    })

  return NextResponse.json({
    type: 'FeatureCollection',
    features,
  })
}
