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
}
