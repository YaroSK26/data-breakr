'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataSourceBanner } from '@/components/DataSourceBanner'
import type { Metric } from '@/components/DensityMap'
import type { FeatureCollection } from 'geojson'

const DensityMap = dynamic(() => import('@/components/DensityMap').then((m) => m.DensityMap), {
  ssr: false,
  loading: () => (
    <div style={{ height: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
      Načítavam mapu…
    </div>
  ),
})

interface Category {
  kod4: string
  nazov: string
}

interface DataSource {
  sourceName: string
  sourceUrl: string
  lastSyncedAt: string | null
  recordsCount: number | null
}

function MapaHustotyFiriem() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const naceParam = searchParams.get('nace') ?? ''
  const metricParam = (searchParams.get('metrika') as Metric) ?? 'perCapita'

  const [categories, setCategories] = useState<Category[]>([])
  const [sources, setSources] = useState<DataSource[]>([])
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.categories))
      .catch(() => setCategories([]))

    fetch('/api/data-sources')
      .then((r) => r.json())
      .then((d) => setSources(d.sources))
      .catch(() => setSources([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    const url = naceParam ? `/api/density?nace=${encodeURIComponent(naceParam)}` : '/api/density'
    fetch(url)
      .then((r) => r.json())
      .then((d) => setGeoData(d))
      .finally(() => setLoading(false))
  }, [naceParam])

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/?${params.toString()}`, { scroll: false })
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '24px 20px 48px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#1e293b',
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>SK Biznis Mapa</h1>
        <p style={{ color: '#64748b', margin: '4px 0 0' }}>
          Mapa hustoty firiem a živnostníkov na Slovensku podľa okresu a kategórie.
        </p>
      </header>

      <section
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          marginBottom: 16,
          padding: 16,
          border: '1px solid #e2e8f0',
          borderRadius: 8,
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Kategória (NACE)
          </label>
          <select
            value={naceParam}
            onChange={(e) => updateParam('nace', e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', minWidth: 260 }}
          >
            <option value="">Všetky kategórie</option>
            {categories.map((c) => (
              <option key={c.kod4} value={c.kod4}>
                {c.nazov} ({c.kod4})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Metrika</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => updateParam('metrika', 'perCapita')}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: metricParam === 'perCapita' ? '#2563eb' : 'white',
                color: metricParam === 'perCapita' ? 'white' : '#1e293b',
                cursor: 'pointer',
              }}
            >
              Na 1000 obyvateľov
            </button>
            <button
              onClick={() => updateParam('metrika', 'absolute')}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: metricParam === 'absolute' ? '#2563eb' : 'white',
                color: metricParam === 'absolute' ? 'white' : '#1e293b',
                cursor: 'pointer',
              }}
            >
              Absolútny počet
            </button>
          </div>
        </div>

        {loading && <span style={{ color: '#94a3b8', fontSize: 13 }}>Načítavam…</span>}
      </section>

      <DensityMap data={geoData} metric={metricParam === 'absolute' ? 'absolute' : 'perCapita'} />

      <div style={{ marginTop: 16 }}>
        <DataSourceBanner sources={sources} />
      </div>
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MapaHustotyFiriem />
    </Suspense>
  )
}
