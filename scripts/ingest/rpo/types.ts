// scripts/ingest/rpo/types.ts
export interface RpoAddress {
  street?: string
  buildingNumber?: string
  postalCodes?: string[]
  municipality?: { value: string; code?: string }
  validFrom?: string
  validTo?: string
}

export interface RpoSearchResult {
  id: number
  identifiers: { value: string; validFrom?: string }[]
  fullNames: { value: string; validFrom?: string; validTo?: string }[]
  addresses: RpoAddress[]
  establishment?: string
  termination?: string
}

export interface RpoEntityDetail extends RpoSearchResult {
  legalForms?: { value: { code: string }; validFrom?: string }[]
  statisticalCodes?: {
    mainActivity?: { value: string; code: string }
  }
  // Likvidácia, konkurz, pozastavená činnosť... (číselník CL010108).
  legalStatuses?: { value: { code: string; value?: string }; validFrom?: string; validTo?: string }[]
  // Predmety činnosti / podnikania, pri živnostníkoch vrátane pozastavenia.
  activities?: {
    economicActivityDescription?: string
    validFrom?: string
    validTo?: string
    suspendedFrom?: string
    suspendedTo?: string
  }[]
}
