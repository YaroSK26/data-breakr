// scripts/ingest/rpo/client.ts
import { fetchJson } from '../http'
import type { RpoSearchResult, RpoEntityDetail } from './types'

const BASE = 'https://api.statistics.sk/rpo/v1'

export class RpoClient {
  async searchByMunicipality(municipalityKod: string): Promise<RpoSearchResult[]> {
    const res = await fetchJson<{ results: RpoSearchResult[] }>(
      `${BASE}/search?addressMunicipality=${encodeURIComponent(municipalityKod)}`
    )
    return res.results
  }

  async getEntity(internalId: number): Promise<RpoEntityDetail> {
    return fetchJson<RpoEntityDetail>(`${BASE}/entity/${internalId}`)
  }
}
