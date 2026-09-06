// scripts/ingest/susr/sync.ts
import type { PrismaClient } from '@prisma/client'
import { DATASETY, stiahniRoky, stiahniZaRok, type DatasetKonfig } from './client'
import { citajRiadky, popisky, type JsonStatDataset } from './jsonstat'

export interface Zaznam {
  okresKod: string
  rok: number
  ukazovatel: string
  sekcia: string
  sekciaNazov: string | null
  hodnota: number
}

/**
 * Prevedie stiahnutý JSON-stat dataset na riadky pre našu tabuľku.
 *
 * Vyhadzuje sa dvoje: hodnoty null (ŠÚ SR takto značí nezverejnené alebo
 * dôverné údaje - nula by z nich spravila tvrdenie, ktoré v zdroji nie je)
 * a územia, ktoré nie sú okres. `nuts14` totiž popri 79 okresoch obsahuje
 * aj Slovensko ako celok, kraje a zlúčeniny typu "Bratislava (okresy I-V)";
 * keby sa uložili tiež, každý súčet cez okresy by dával dvojnásobok.
 */
export function naZaznamy(
  dataset: JsonStatDataset,
  konfig: DatasetKonfig,
  jeOkres: (kod: string) => boolean
): Zaznam[] {
  const nazvySekcii = popisky(dataset, konfig.sekciaDim)
  const rokDim = dataset.id.find((d) => d.endsWith('_rok'))
  if (!rokDim) throw new Error(`Dataset ${konfig.kod} nemá rozmer s rokom`)

  const zaznamy: Zaznam[] = []
  for (const { kody, hodnota } of citajRiadky(dataset)) {
    if (hodnota === null) continue
    const okresKod = kody['nuts14']
    if (!okresKod || !jeOkres(okresKod)) continue

    const rok = Number(kody[rokDim])
    if (!Number.isFinite(rok)) continue

    const sekcia = kody[konfig.sekciaDim]
    if (!sekcia) continue

    zaznamy.push({
      okresKod,
      rok,
      ukazovatel: konfig.ukazovatel,
      sekcia,
      sekciaNazov: nazvySekcii.get(sekcia) ?? null,
      hodnota,
    })
  }
  return zaznamy
}

export async function syncSusr(prisma: PrismaClient, datasety: DatasetKonfig[] = DATASETY) {
  const okresy = new Set((await prisma.district.findMany({ select: { kod: true } })).map((d) => d.kod))
  if (okresy.size === 0) {
    throw new Error('Tabuľka districts je prázdna - najprv spusti RÚZ ingest (číselníky).')
  }

  let spolu = 0
  const podlaDatasetu: Record<string, number> = {}

  for (const konfig of datasety) {
    const roky = await stiahniRoky(konfig)
    const zaznamy: Zaznam[] = []
    for (const rok of roky) {
      const dataset = await stiahniZaRok(konfig, rok)
      zaznamy.push(...naZaznamy(dataset, konfig, (kod) => okresy.has(kod)))
    }

    if (zaznamy.length === 0) {
      throw new Error(`Dataset ${konfig.kod} nevrátil žiadne použiteľné riadky - nemazať staré dáta.`)
    }

    // Prepis celého ukazovateľa naraz: ŠÚ SR revíduje aj staršie roky, a
    // prírastkový zápis by nechal starú hodnotu vedľa opravenej.
    await prisma.$transaction(
      [
        prisma.susrOkresUkazovatel.deleteMany({ where: { ukazovatel: konfig.ukazovatel } }),
        ...chunk(zaznamy, 1000).map((davka) =>
          prisma.susrOkresUkazovatel.createMany({ data: davka, skipDuplicates: true })
        ),
      ],
      { timeout: 180000 }
    )

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
