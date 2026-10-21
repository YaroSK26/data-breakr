// lib/stavSubjektu.ts
//
// Čo znamená "aktívny subjekt". Predtým appka brala za aktívne všetko, čo
// v RPO nemá dátum zániku - lenže firma v likvidácii, v konkurze alebo
// zrušená súdom dátum zániku ešte nemá (dostane ho až po výmaze, často roky
// neskôr), a živnostník s pozastavenou alebo skončenou živnosťou ho nemá
// vôbec, kým sa sám neodhlási. RPO tieto stavy posiela v `legalStatuses`
// (číselník CL010108) a pri živnostníkoch v `activities` - obe sa tu
// zohľadňujú.
// Ďalšie pravidlo je pri predmetoch činnosti - viď urcStav.
//
// Mimo stavu stojí otázka, či je subjekt vôbec podnik: spolky, SVB, obce,
// cirkvi či rozpočtové organizácie sú v RPO tiež, ale firmou nie sú. Tie
// dostanú stav 'nepodnikatel', aby sa nemiešali do počtov firiem.

export const STAVY = {
  aktivny: 'Aktívny',
  pozastaveny: 'Pozastavená alebo prerušená činnosť',
  bez_opravnenia: 'Bez platného predmetu činnosti',
  likvidacia: 'V likvidácii',
  konkurz: 'V konkurze alebo reštrukturalizácii',
  zruseny: 'Zrušený alebo v inom konaní, čaká na výmaz',
  nepodnikatel: 'Nepodnikateľský subjekt (spolok, SVB, obec, cirkev…)',
} as const

export type Stav = keyof typeof STAVY

// Právne formy, ktoré sú podnikom. Zoznam je povoľujúci, nie zakazujúci:
// neznámy alebo "nešpecifikovaný" kód (995) sa do firiem nezapočíta, kým ho
// niekto neoverí - radšej o pár stoviek menej než tichý odhad.
// Názvy kódov overené v RPO dávkach (číselník CL000056).
const PODNIKATELSKE_FORMY = new Set([
  '001', '101', '102', '103', '104', '105', '106', '107', '108', // fyzické osoby - podnikatelia
  '111', '112', '113', '121', '123', '125', // obchodné spoločnosti
  '005', // podnik zahraničnej osoby
  '205', // družstvo
  '301', // štátny podnik
])

export function jePodnikatelskaForma(kod: string | null | undefined): boolean {
  if (!kod) return false
  // 4xx = zahraničné osoby a ich organizačné zložky, podnikajú tu.
  return PODNIKATELSKE_FORMY.has(kod) || kod.startsWith('4')
}

// Kódy CL010108 -> stav. "1 Bez záznamu" a chýbajúci stav znamenajú, že
// register o žiadnom probléme nevie.
const PRAVNY_STAV: Record<string, Stav> = {
  '2': 'likvidacia',
  '3': 'konkurz',
  '4': 'konkurz', // reštrukturalizácia - tiež insolvenčné konanie
  '7': 'pozastaveny',
  '8': 'pozastaveny',
  '10': 'zruseny',
  '16': 'zruseny',
  '17': 'zruseny', // "Zaniknutá spoločnosť" bez dátumu zániku
  '18': 'zruseny',
  '19': 'zruseny', // záznam zrušený pre technickú chybu
  '20': 'zruseny', // konanie o dedičstve - podnikateľ zomrel
}

// Kód, ktorý číselník pozná, no tu chýba (napr. '5' - v dávkach sa jeho
// názov neobjavil), nie je "bez záznamu" - register o subjekte niečo hlási.
// Za aktívny sa preto nepovažuje.
const BEZ_ZAZNAMU = '1'

interface Platnost {
  validFrom?: string
  validTo?: string
}

export interface StavVstup {
  legalForms?: { value: { code: string } }[]
  legalStatuses?: ({ value: { code: string } } & Platnost)[]
  activities?: ({ suspendedFrom?: string; suspendedTo?: string } & Platnost)[]
}

// `dnes` ako 'YYYY-MM-DD' - dátumy v RPO sú v tomto tvare, takže stačí
// porovnanie reťazcov.
export function urcStav(e: StavVstup, dnes: string): Stav {
  const forma = e.legalForms?.[e.legalForms.length - 1]?.value.code
  if (!jePodnikatelskaForma(forma)) return 'nepodnikatel'

  const platne = (e.legalStatuses ?? [])
    .filter((s) => !s.validTo && (!s.validFrom || s.validFrom <= dnes))
    .sort((a, b) => (a.validFrom ?? '').localeCompare(b.validFrom ?? ''))
  const kodStavu = platne[platne.length - 1]?.value.code
  if (kodStavu && kodStavu !== BEZ_ZAZNAMU) return PRAVNY_STAV[kodStavu] ?? 'zruseny'

  // Predmety činnosti (živnosti, predmety podnikania). Keď sú všetky
  // skončené, subjekt nemá na čo podnikať; keď sú všetky pozastavené,
  // činnosť stojí - to je typický živnostník, ktorý si živnosť "uspal".
  // Subjekt bez zoznamu sa podľa neho nesúdi: chýbajúci zoznam (časté pri
  // slobodných povolaniach) neznamená, že nič nerobí.
  const cinnosti = e.activities ?? []
  if (cinnosti.length > 0) {
    const otvorene = cinnosti.filter((a) => !a.validTo || a.validTo >= dnes)
    if (otvorene.length === 0) return 'bez_opravnenia'
    const bezia = otvorene.filter(
      (a) => !(a.suspendedFrom && a.suspendedFrom <= dnes && (!a.suspendedTo || a.suspendedTo >= dnes))
    )
    if (bezia.length === 0) return 'pozastaveny'
  }

  return 'aktivny'
}
