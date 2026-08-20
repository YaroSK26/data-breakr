// app/api/density/route.ts
//
// Lightweight density VALUES keyed by district - geometry lives in
// /api/municipalities-geo (fetched once, since it never changes) so a
// filter change here only moves a few dozen small numbers, not ~2MB of
// polygon data.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface DensityRow {
  okresKod: string;
  pocet: bigint;
  population: number | null;
}

export async function GET(req: NextRequest) {
  const naceKod4 = req.nextUrl.searchParams.get("nace");
  const kraj = req.nextUrl.searchParams.get("kraj");
  const pravnaForma = req.nextUrl.searchParams.get("forma");

  const filters = Prisma.sql`
    be."datum_zaniku" IS NULL AND be."okres_kod" IS NOT NULL
    ${naceKod4 ? Prisma.sql`AND be."nace_kod4" = ${naceKod4}` : Prisma.empty}
    ${kraj ? Prisma.sql`AND be."kraj_kod" = ${kraj}` : Prisma.empty}
    ${pravnaForma ? Prisma.sql`AND be."pravna_forma_kod" = ${pravnaForma}` : Prisma.empty}
  `;

  const rows = await prisma.$queryRaw<DensityRow[]>`
    SELECT
      be."okres_kod" AS "okresKod",
      COUNT(*) AS "pocet",
      MAX(dp.population) AS "population"
    FROM business_entities be
    LEFT JOIN (
      SELECT district_kod, SUM(population) AS population
      FROM municipalities
      GROUP BY district_kod
    ) dp ON dp.district_kod = be."okres_kod"
    WHERE ${filters}
    GROUP BY be."okres_kod"
  `;

  const byDistrict: Record<string, { pocetPrevadzok: number; pocetNa1000Obyvatelov: number | null }> = {};
  for (const row of rows) {
    const pocet = Number(row.pocet);
    const population = row.population ? Number(row.population) : null;
    byDistrict[row.okresKod] = {
      pocetPrevadzok: pocet,
      pocetNa1000Obyvatelov: population ? (pocet / population) * 1000 : null,
    };
  }

  return NextResponse.json({ byDistrict });
}
