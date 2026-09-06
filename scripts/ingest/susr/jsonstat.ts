// scripts/ingest/susr/jsonstat.ts
//
// Minimálny čítač formátu JSON-stat 2.0, v ktorom ŠÚ SR vracia dáta z
// DATAcube. Hodnoty prídu ako jedno ploché pole a rozmery ako zoznam
// kódov - pozíciu v poli treba dopočítať z veľkostí rozmerov, inak sa
// hodnota priradí k nesprávnemu okresu či roku.

export interface JsonStatDataset {
  label?: string
  id: string[]
  size: number[]
  dimension: Record<string, { label?: string; category?: { index?: Record<string, number>; label?: Record<string, string> } }>
  value: (number | null)[] | Record<string, number | null>
}

export interface JsonStatRiadok {
  /** kód kategórie pre každý rozmer, kľúčom je id rozmeru */
  kody: Record<string, string>
  hodnota: number | null
}

/**
 * Rozbalí ploché pole hodnôt na riadky s kódmi rozmerov.
 *
 * JSON-stat používa "row-major" poradie: posledný rozmer sa mení
 * najrýchlejšie. Hodnoty môžu prísť aj ako objekt (riedke dáta) - vtedy
 * chýbajúce indexy znamenajú null, nie nulu.
 */
export function* citajRiadky(dataset: JsonStatDataset): Generator<JsonStatRiadok> {
  const { id, size } = dataset
  const pocetHodnot = size.reduce((a, b) => a * b, 1)

  // Pre každý rozmer zoznam kódov v poradí podľa jeho indexu.
  const kodyRozmerov: string[][] = id.map((dimId) => {
    const index = dataset.dimension[dimId]?.category?.index ?? {}
    const zoradene: string[] = []
    for (const [kod, poz] of Object.entries(index)) zoradene[poz] = kod
    return zoradene
  })

  const hodnotaNa = (i: number): number | null => {
    if (Array.isArray(dataset.value)) return dataset.value[i] ?? null
    return dataset.value[String(i)] ?? null
  }

  for (let i = 0; i < pocetHodnot; i++) {
    const kody: Record<string, string> = {}
    let zvysok = i
    // Od konca: posledný rozmer sa mení najrýchlejšie.
    for (let d = id.length - 1; d >= 0; d--) {
      const rozmer = size[d]
      const poz = zvysok % rozmer
      zvysok = Math.floor(zvysok / rozmer)
      kody[id[d]] = kodyRozmerov[d][poz]
    }
    yield { kody, hodnota: hodnotaNa(i) }
  }
}

/** Popisky kategórií jedného rozmeru (kód -> názov). */
export function popisky(dataset: JsonStatDataset, dimId: string): Map<string, string> {
  const label = dataset.dimension[dimId]?.category?.label ?? {}
  return new Map(Object.entries(label))
}
