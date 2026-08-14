// scripts/ingest/http.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchJson } from './http'

describe('fetchJson', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hello: 'world' }),
    }) as unknown as typeof fetch

    const result = await fetchJson<{ hello: string }>('https://example.test/x')
    expect(result).toEqual({ hello: 'world' })
  })

  it('retries on failure and succeeds on the second attempt', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: 1 }) })
    global.fetch = mockFetch as unknown as typeof fetch

    const result = await fetchJson<{ ok: number }>('https://example.test/x', { retries: 2 })
    expect(result).toEqual({ ok: 1 })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws after exhausting retries', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch

    await expect(fetchJson('https://example.test/x', { retries: 2 })).rejects.toThrow(
      /failed after 2 attempts/
    )
  })
})
