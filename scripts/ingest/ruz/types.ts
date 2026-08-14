// scripts/ingest/ruz/types.ts
export interface Klasifikacia {
  kod: string
  nazov: { sk: string; en: string }
  nadradenaLokacia?: string
}

export interface FirmDetail {
  id: number
  stav?: 'NEVEREJNÁ' | 'ZMAZANÉ'
  ico?: string
  dic?: string
  nazovUJ?: string
  mesto?: string
  ulica?: string
  psc?: string
  kraj?: string
  okres?: string
  skNace?: string
  pravnaForma?: string
  velkostOrganizacie?: string
  datumZalozenia?: string
  datumZrusenia?: string
  zdrojDat?: string
  idUctovnychZavierok?: number[]
}

export interface IdListResponse {
  id: number[]
  existujeDalsieId: boolean
}

export interface ZavierkaDetail {
  id: number
  idUJ: number
  obdobieOd?: string
  obdobieDo?: string
  typ?: string
  datumPodania?: string
  datumSchvalenia?: string
  idUctovnychVykazov: number[]
}

export interface VykazDetail {
  id: number
  idSablony: number
  pristupnostDat?: string
  obsah?: { tabulky?: { nazov: { sk: string }; data: string[] }[] }
}

export interface SablonaDetail {
  id: number
  nazov: string
  nariadenieMF?: string
  platneOd?: string
  tabulky: {
    nazov: { sk: string }
    pocetDatovychStlpcov: number
    riadky: { cisloRiadku: number; text: { sk: string } }[]
  }[]
}
