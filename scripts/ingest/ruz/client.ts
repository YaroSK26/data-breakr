// scripts/ingest/ruz/client.ts
import { fetchJson } from '../http'
import type { Klasifikacia } from './types'

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
}
