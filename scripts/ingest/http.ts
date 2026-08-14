// scripts/ingest/http.ts
export async function fetchJson<T>(
  url: string,
  opts: { retries?: number; headers?: Record<string, string> } = {}
): Promise<T> {
  const retries = opts.retries ?? 3
  let lastError: unknown

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', ...opts.headers },
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
