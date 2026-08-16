// scripts/ingest/http.ts
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchJson<T>(
  url: string,
  opts: { retries?: number; headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 3
  // Without a timeout, a single hung connection (server accepted the TCP
  // connection but never responds) stalls the entire sequential ingestion
  // loop forever - no error, no retry, no progress, and nothing in the
  // process looks crashed (it's still alive, just waiting). Confirmed live:
  // a national RPO run sat at the same record count for 5+ hours with the
  // process still running. 15s is generous for a small JSON API response.
  const timeoutMs = opts.timeoutMs ?? 15000
  let lastError: unknown

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', ...opts.headers },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`)
      }
      return (await res.json()) as T
    } catch (err) {
      lastError = err
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * attempt))
      }
    }
  }

  throw new Error(`fetchJson failed after ${retries} attempts for ${url}: ${lastError}`)
}
