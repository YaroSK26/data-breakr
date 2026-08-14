// scripts/ingest/ruz/client.ts
import { fetchJson } from '../http'
import type { Klasifikacia, FirmDetail, IdListResponse } from './types'

const BASE = 'https://www.registeruz.sk/cruz-public/api'

export class RuzClient {
  async getKraje(): Promise<Klasifikacia[]> {
    const res = await fetchJson<{ lokacie: Klasifikacia[] }>(`${BASE}/kraje`)
    return res.lokacie
  }

  async getOkresy(): Promise<Klasifikacia[]> {
    const res = await fetchJson<{ lokacie: Klasifikacia[] }>(`${BASE}/okresy`)
    return res.lokacie
  }

  async getSidla(): Promise<Klasifikacia[]> {
    const res = await fetchJson<{ lokacie: Klasifikacia[] }>(`${BASE}/sidla`)
    return res.lokacie
  }

  async getSkNace(): Promise<Klasifikacia[]> {
    const res = await fetchJson<{ klasifikacie: Klasifikacia[] }>(`${BASE}/sk-nace`)
    return res.klasifikacie
  }

  async listChangedEntityIds(since: string, cursor?: number): Promise<{ ids: number[]; hasMore: boolean }> {
    const params = new URLSearchParams({ 'zmenene-od': since, 'max-zaznamov': '1000' })
    if (cursor !== undefined) params.set('pokracovat-za-id', String(cursor))
    const res = await fetchJson<IdListResponse>(`${BASE}/uctovne-jednotky?${params}`)
    return { ids: res.id, hasMore: res.existujeDalsieId }
  }

  async getEntity(id: number): Promise<FirmDetail> {
    return fetchJson<FirmDetail>(`${BASE}/uctovna-jednotka?id=${id}`)
  }
}
