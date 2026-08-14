// scripts/ingest/ruz/sync-classifiers.ts
import type { PrismaClient } from '@prisma/client'
import type { RuzClient } from './client'

export async function syncClassifiers(prisma: PrismaClient, client: RuzClient) {
  const [kraje, okresy, sidla, skNace] = await Promise.all([
    client.getKraje(),
    client.getOkresy(),
    client.getSidla(),
    client.getSkNace(),
  ])

  for (const k of kraje) {
    await prisma.region.upsert({
      where: { kod: k.kod },
      create: { kod: k.kod, nazovSk: k.nazov.sk, nazovEn: k.nazov.en },
      update: { nazovSk: k.nazov.sk, nazovEn: k.nazov.en },
    })
  }

  for (const o of okresy) {
    if (!o.nadradenaLokacia) continue
    await prisma.district.upsert({
      where: { kod: o.kod },
      create: { kod: o.kod, nazovSk: o.nazov.sk, nazovEn: o.nazov.en, regionKod: o.nadradenaLokacia },
      update: { nazovSk: o.nazov.sk, nazovEn: o.nazov.en, regionKod: o.nadradenaLokacia },
    })
  }

  for (const s of sidla) {
    if (!s.nadradenaLokacia) continue
    await prisma.municipality.upsert({
      where: { kod: s.kod },
      create: { kod: s.kod, nazov: s.nazov.sk, districtKod: s.nadradenaLokacia },
      update: { nazov: s.nazov.sk, districtKod: s.nadradenaLokacia },
    })
  }

  for (const n of skNace) {
    await prisma.naceCode.upsert({
      where: { kod5: n.kod },
      create: { kod5: n.kod, kod4: n.kod.slice(0, 4), nazovSk: n.nazov.sk, nazovEn: n.nazov.en },
      update: { kod4: n.kod.slice(0, 4), nazovSk: n.nazov.sk, nazovEn: n.nazov.en },
    })
  }

  return {
    regions: kraje.length,
    districts: okresy.filter((o) => o.nadradenaLokacia).length,
    municipalities: sidla.filter((s) => s.nadradenaLokacia).length,
    naceCodes: skNace.length,
  }
}
