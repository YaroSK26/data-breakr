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

  it('passes an AbortSignal so a hung connection cannot stall the caller forever', async () => {
    // Regression test: without a timeout, a request that never resolves
    // (server accepts the connection but never responds) hangs the entire
    // sequential ingestion loop indefinitely, with no error and no retry -
    // confirmed live against production (a national ingest run sat at the
    // same record count for 5+ hours with the process still alive).
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    await fetchJson('https://example.test/x')

    const callOptions = mockFetch.mock.calls[0][1] as RequestInit
    expect(callOptions.signal).toBeInstanceOf(AbortSignal)
  })

  it('retries when the connection hangs past the timeout', async () => {
    const abortError = new DOMException('The operation was aborted.', 'TimeoutError')
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: 1 }) })
    global.fetch = mockFetch as unknown as typeof fetch

    const result = await fetchJson<{ ok: number }>('https://example.test/x', { retries: 2 })
    expect(result).toEqual({ ok: 1 })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
