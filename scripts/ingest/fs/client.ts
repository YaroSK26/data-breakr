// scripts/ingest/fs/client.ts
//
// Finančná správa SR publikuje tzv. informačné zoznamy ako denne
// aktualizované ZIP archívy s jedným XML súborom vnútri, bez potreby API
// kľúča. https://opendata.financnasprava.sk/page/openapi
import { fetchBuffer } from '../http'
import { unzipFirstEntry } from '../zip'

const BASE = 'https://report.financnasprava.sk'

export class FsOpenDataClient {
  /** Zoznam subjektov registrovaných k DPH (ds_dphs) - obsahuje IČO. */
  async getDphPlatci(): Promise<string> {
    const zip = await fetchBuffer(`${BASE}/ds_dphs.zip`)
    return unzipFirstEntry(zip)
  }

  /** Zoznam daňových dlžníkov (ds_dsdd) - meno + PSČ + suma, bez IČO. */
  async getDanoviDlznici(): Promise<string> {
    const zip = await fetchBuffer(`${BASE}/ds_dsdd.zip`)
    return unzipFirstEntry(zip)
  }
}
