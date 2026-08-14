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
