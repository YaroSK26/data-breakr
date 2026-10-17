import type { PrismaClient } from '@prisma/client'
import { DATASETY, stiahniDataset, type DatasetKonfig, type StatdataRiadok } from './client'

export interface Zaznam {
  okresKod: string
  rok: number
  ukazovatel: string
  sekcia: string
  sekciaNazov: string | null
  hodnota: number
}

function normalizujNazov(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('sk').replace(/^okres\s+/, '').replace(/[^a-z0-9]/g, '')
}

function kodSekcie(nazov: string): string | null {
  if (normalizujNazov(nazov) === 'spolu') return 'SPOLU'
  return nazov.match(/^([A-S](?:-[A-S])?)\s/)?.[1] ?? null
}

/** Prevedie ploché riadky STATdata na interný formát aplikácie. */
export function naZaznamy(riadky: StatdataRiadok[], konfig: DatasetKonfig, okresKodPodlaNazvu: ReadonlyMap<string, string>): Zaznam[] {
  const zaznamy: Zaznam[] = []
  for (const riadok of riadky) {
    const okresKod = okresKodPodlaNazvu.get(normalizujNazov(riadok.e_nuts14))
    if (!okresKod) continue
    const rok = Number(riadok.e_year)
    const hodnota = typeof riadok.value === 'number' ? riadok.value : Number(riadok.value)
    const sekcia = kodSekcie(riadok.e_nace2)
    if (!Number.isInteger(rok) || !Number.isFinite(hodnota) || riadok.value === null || !sekcia) continue
    zaznamy.push({ okresKod, rok, ukazovatel: konfig.ukazovatel, sekcia, sekciaNazov: riadok.e_nace2, hodnota })
  }
  return zaznamy
}

export async function syncSusr(prisma: PrismaClient, datasety: DatasetKonfig[] = DATASETY) {
  const okresy = await prisma.district.findMany({ select: { kod: true, nazovSk: true } })
  if (okresy.length === 0) throw new Error('Tabuľka districts je prázdna - najprv spusti RÚZ ingest (číselníky).')
  const okresKodPodlaNazvu = new Map(okresy.map((o) => [normalizujNazov(o.nazovSk), o.kod]))
  let spolu = 0
  const podlaDatasetu: Record<string, number> = {}
  for (const konfig of datasety) {
    const zaznamy = naZaznamy(await stiahniDataset(konfig), konfig, okresKodPodlaNazvu)
    if (zaznamy.length === 0) throw new Error(`Dataset ${konfig.kod} nevrátil žiadne použiteľné okresné riadky - nemažem staré dáta.`)
    await prisma.$transaction([
      prisma.susrOkresUkazovatel.deleteMany({ where: { ukazovatel: konfig.ukazovatel } }),
      ...chunk(zaznamy, 1000).map((davka) => prisma.susrOkresUkazovatel.createMany({ data: davka, skipDuplicates: true })),
    ], { timeout: 180000 })
    podlaDatasetu[konfig.kod] = zaznamy.length
    spolu += zaznamy.length
  }
  return { spolu, podlaDatasetu }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
