// scripts/ingest/ruz/client.ts
import { fetchJson } from '../http'
import type {
  Klasifikacia,
  FirmDetail,
  IdListResponse,
  ZavierkaDetail,
  VykazDetail,
  SablonaDetail,
} from './types'

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

  async listChangedStatementIds(since: string, cursor?: number): Promise<{ ids: number[]; hasMore: boolean }> {
    const params = new URLSearchParams({ 'zmenene-od': since, 'max-zaznamov': '1000' })
    if (cursor !== undefined) params.set('pokracovat-za-id', String(cursor))
    const res = await fetchJson<IdListResponse>(`${BASE}/uctovne-zavierky?${params}`)
    return { ids: res.id, hasMore: res.existujeDalsieId }
  }

  async getStatement(id: number): Promise<ZavierkaDetail> {
    return fetchJson<ZavierkaDetail>(`${BASE}/uctovna-zavierka?id=${id}`)
  }

  async getVykaz(id: number): Promise<VykazDetail> {
    return fetchJson<VykazDetail>(`${BASE}/uctovny-vykaz?id=${id}`)
  }

  async getSablona(id: number): Promise<SablonaDetail> {
    return fetchJson<SablonaDetail>(`${BASE}/sablona?id=${id}`)
  }
}
