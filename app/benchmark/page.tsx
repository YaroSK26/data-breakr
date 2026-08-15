'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataSourceBanner } from '@/components/DataSourceBanner'

interface NaceCode {
  kod5: string
  nazovSk: string
}

interface District {
  kod: string
  nazovSk: string
  regionKod: string
}

interface AggregateRow {
  rok: number
  firmCount: number
  medianTrzby: number | null
  avgTrzby: number | null
  medianMarza: number | null
  yoyTrendPct: number | null
}

interface DataSource {
  sourceName: string
  sourceUrl: string
  lastSyncedAt: string | null
  recordsCount: number | null
}

const ANONYMITY_THRESHOLD = 5

function formatEur(v: number | null): string {
  if (v === null) return '—'
  return v.toLocaleString('sk-SK', { maximumFractionDigits: 0 }) + ' €'
}

function formatPct(v: number | null): string {
  if (v === null) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + ' %'
}

function FinancnyBenchmark() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Local state is the single source of truth for the two filters.
  // Reading-and-rewriting the URL on each change (via window.location or
  // the searchParams hook) races when both selects change in quick
  // succession, since router.push()'s navigation is asynchronous and
  // neither reflects the other's pending update yet. Local state has no
  // such race; the URL is a one-way sync derived FROM it.
  const [naceParam, setNaceParam] = useState(() => searchParams.get('nace') ?? '')
  const [okresParam, setOkresParam] = useState(() => searchParams.get('okres') ?? '')

  const [naceCodes, setNaceCodes] = useState<NaceCode[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [rows, setRows] = useState<AggregateRow[] | null>(null)
  const [sources, setSources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/nace5')
      .then((r) => r.json())
      .then((d) => setNaceCodes(d.codes))
      .catch(() => setNaceCodes([]))

    fetch('/api/districts?onlyWithBenchmarkData=true')
      .then((r) => r.json())
      .then((d) => setDistricts(d.districts))
      .catch(() => setDistricts([]))

    fetch('/api/data-sources')
      .then((r) => r.json())
      .then((d) => setSources(d.sources))
      .catch(() => setSources([]))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (naceParam) params.set('nace', naceParam)
    if (okresParam) params.set('okres', okresParam)
    router.replace(`/benchmark?${params.toString()}`, { scroll: false })
  }, [naceParam, okresParam, router])

  useEffect(() => {
    if (!naceParam || !okresParam) {
      setRows(null)
      return
    }
    setLoading(true)
    fetch(`/api/benchmark?nace=${encodeURIComponent(naceParam)}&okres=${encodeURIComponent(okresParam)}`)
      .then((r) => r.json())
      .then((d) => setRows(d.rows))
      .finally(() => setLoading(false))
  }, [naceParam, okresParam])

  const ruzSource = sources.find((s) => s.sourceName === 'RÚZ')

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: '0 auto',
        padding: '24px 20px 48px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#1e293b',
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Finančný benchmark odvetví</h1>
        <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>
          Medián tržieb, marže a medziročný trend podľa NACE kódu a okresu.
        </p>
      </header>

      {/* Mandatory, visually prominent data-coverage limitation banner */}
      <div
        style={{
          border: '2px solid #f59e0b',
          borderRadius: 8,
          padding: '14px 16px',
          background: '#fffbeb',
          marginBottom: 16,
          display: 'flex',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>ℹ️</span>
        <div style={{ fontSize: 14, color: '#78350f' }}>
          <strong>Tieto dáta pokrývajú najmä s.r.o. a a.s.</strong> Živnostníci sú zastúpení len
          čiastočne a nereprezentatívne — iba tí, ktorí dobrovoľne vedú jednoduché alebo podvojné
          účtovníctvo. Väčšina živnostníkov (na paušálne výdavky alebo daňovú evidenciu) v týchto
          dátach absentuje úplne. Berte preto tieto čísla ako orientačné, nie ako presný obraz
          celého odvetvia.
        </div>
      </div>

      <section
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          marginBottom: 16,
          padding: 16,
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            NACE kód
          </label>
          <select
            value={naceParam}
            onChange={(e) => setNaceParam(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', minWidth: 280 }}
          >
            <option value="">Vyberte odvetvie…</option>
            {naceCodes.map((c) => (
              <option key={c.kod5} value={c.kod5}>
                {c.nazovSk} ({c.kod5})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Okres <span style={{ fontWeight: 400, color: '#94a3b8' }}>(zatiaľ len okresy s dátami)</span>
          </label>
          <select
            value={okresParam}
            onChange={(e) => setOkresParam(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', minWidth: 220 }}
          >
            <option value="">Vyberte okres…</option>
            {districts.map((d) => (
              <option key={d.kod} value={d.kod}>
                {d.nazovSk}
              </option>
            ))}
          </select>
        </div>

        {loading && <span style={{ color: '#94a3b8', fontSize: 13 }}>Načítavam…</span>}
      </section>

      {!naceParam || !okresParam ? (
        <div
          style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 32,
            textAlign: 'center',
            color: '#94a3b8',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
          }}
        >
          Vyberte odvetvie a okres pre zobrazenie benchmarku.
        </div>
      ) : rows && rows.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: 32,
            textAlign: 'center',
            color: '#94a3b8',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
          }}
        >
          Pre túto kombináciu odvetvia a okresu nemáme žiadne dáta z účtovných závierok.
        </div>
      ) : rows ? (
        <div
          style={{
            overflowX: 'auto',
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '8px 16px',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Rok</th>
                <th style={{ padding: '8px 12px' }}>Počet firiem</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Medián tržieb</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Priemer tržieb</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Medián marže</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Medziročne</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const anonymized = r.firmCount < ANONYMITY_THRESHOLD
                return (
                  <tr key={r.rok} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>{r.rok}</td>
                    <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>{r.firmCount}</td>
                    {anonymized ? (
                      <td colSpan={4} style={{ padding: '10px 12px', color: '#94a3b8', fontStyle: 'italic' }}>
                        Nedostatok dát na zobrazenie (medián z {r.firmCount} firiem — pod hranicou anonymity)
                      </td>
                    ) : (
                      <>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatEur(r.medianTrzby)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {formatEur(r.avgTrzby)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {r.medianMarza !== null ? (r.medianMarza * 100).toFixed(1) + ' %' : '—'}
                        </td>
                        <td
                          style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                            color: r.yoyTrendPct === null ? '#94a3b8' : r.yoyTrendPct >= 0 ? '#16a34a' : '#dc2626',
                          }}
                        >
                          {formatPct(r.yoyTrendPct)}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
            Medián tržieb na zamestnanca nie je zobrazený — dáta o počte zamestnancov nie sú v tomto
            zdroji k dispozícii (RÚZ obsahuje len veľkostnú kategóriu, nie presný počet).
          </p>
        </div>
      ) : null}

      <div style={{ marginTop: 24 }}>
        <DataSourceBanner
          sources={ruzSource ? [ruzSource] : []}
        />
      </div>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <FinancnyBenchmark />
    </Suspense>
  )
}
