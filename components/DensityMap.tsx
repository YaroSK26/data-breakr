'use client'

import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import type { Layer, StyleFunction } from 'leaflet'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import 'leaflet/dist/leaflet.css'

export type Metric = 'absolute' | 'perCapita'

interface MunicipalityProps {
  kod: string
  nazov: string
  okresKod: string
  okresNazov: string
  population: number | null
}

export interface DistrictDensity {
  pocetPrevadzok: number
  pocetNa1000Obyvatelov: number | null
}

// Sequential scale, low -> high, 7 steps for finer visual distinction than
// the original 5 (district counts range from single digits to several
// thousand - 5 buckets lumped most districts into one or two colors).
// Colorblind-safe: single hue, varying lightness only.
const COLOR_SCALE = ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#1e40af']
const NO_DATA_COLOR = '#e5e7eb'
const SK_BOUNDS: [[number, number], [number, number]] = [
  [47.0, 15.8],
  [50.3, 23.4],
]

// Scaled between the 10th and 90th percentile of the actual values, not
// 0-to-max. Business density is heavily right-skewed - confirmed live, the
// per-1000-obyvateľov metric ranges from ~91 (rural districts) to 746
// (Bratislava I, likely companies registered en masse at a handful of
// downtown addresses rather than genuine density). Scaling 0-to-max against
// that one outlier crushed every other district into 2-3 adjacent buckets,
// which is what "very similar colors everywhere" looked like. Clamping to
// the P10-P90 range spends the whole color scale on where the real spread
// is, at the cost of P90+ districts all reading as "highest".
function colorFor(value: number | null, scaleMin: number, scaleMax: number): string {
  if (value === null || value === undefined || scaleMax <= scaleMin) return NO_DATA_COLOR
  const clamped = Math.min(scaleMax, Math.max(scaleMin, value))
  const ratio = (clamped - scaleMin) / (scaleMax - scaleMin)
  const idx = Math.min(COLOR_SCALE.length - 1, Math.floor(ratio * COLOR_SCALE.length))
  return COLOR_SCALE[idx]
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[idx]
}

function FitToData() {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(SK_BOUNDS)
  }, [map])
  return null
}

interface DensityMapProps {
  densityByDistrict: Record<string, DistrictDensity> | null
  metric: Metric
  loading?: boolean
  onDistrictClick?: (okresKod: string, okresNazov: string) => void
}

export function DensityMap({ densityByDistrict, metric, loading, onDistrictClick }: DensityMapProps) {
  const [hovered, setHovered] = useState<(MunicipalityProps & DistrictDensity) | null>(null)
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null)
  const [districtBoundaries, setDistrictBoundaries] = useState<FeatureCollection | null>(null)

  // Municipality shapes and district outlines are both static - fetched
  // once on mount, independent of the NACE/metric filter. Only the
  // density VALUES (densityByDistrict, passed as a prop) change per filter.
  useEffect(() => {
    fetch('/api/municipalities-geo')
      .then((r) => r.json())
      .then((d) => setGeoData(d))
      .catch(() => setGeoData(null))

    fetch('/api/district-boundaries')
      .then((r) => r.json())
      .then((d) => setDistrictBoundaries(d))
      .catch(() => setDistrictBoundaries(null))
  }, [])

  const { scaleMin, scaleMax, maxValue } = useMemo(() => {
    if (!densityByDistrict) return { scaleMin: 0, scaleMax: 0, maxValue: 0 }
    const values = Object.values(densityByDistrict)
      .map((d) => (metric === 'absolute' ? d.pocetPrevadzok : d.pocetNa1000Obyvatelov))
      .filter((v): v is number => v !== null && v !== undefined)
      .sort((a, b) => a - b)
    return {
      scaleMin: percentile(values, 0.1),
      scaleMax: Math.max(percentile(values, 0.9), 1),
      maxValue: values.length > 0 ? values[values.length - 1] : 0,
    }
  }, [densityByDistrict, metric])

  const valueFor = (okresKod: string): number | null => {
    const d = densityByDistrict?.[okresKod]
    if (!d) return null
    return metric === 'absolute' ? d.pocetPrevadzok : d.pocetNa1000Obyvatelov
  }

  const style: StyleFunction<MunicipalityProps> = (feature) => {
    const p = feature?.properties as MunicipalityProps | undefined
    const value = p ? valueFor(p.okresKod) : null
    return {
      fillColor: colorFor(value, scaleMin, scaleMax),
      fillOpacity: 0.85,
      color: '#94a3b8',
      weight: 0.5,
    }
  }

  const onEachFeature = (feature: Feature<Geometry, MunicipalityProps>, layer: Layer) => {
    layer.on({
      mouseover: () => {
        const d = densityByDistrict?.[feature.properties.okresKod]
        setHovered({ ...feature.properties, pocetPrevadzok: d?.pocetPrevadzok ?? 0, pocetNa1000Obyvatelov: d?.pocetNa1000Obyvatelov ?? null })
      },
      mouseout: () => setHovered(null),
      click: () => onDistrictClick?.(feature.properties.okresKod, feature.properties.okresNazov),
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <MapContainer
        center={[48.7, 19.5]}
        zoom={8}
        minZoom={7}
        maxBounds={SK_BOUNDS}
        maxBoundsViscosity={1.0}
        style={{ height: '70vh', width: '100%', borderRadius: 8 }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {geoData && (
          <GeoJSON
            key={metric + scaleMin + scaleMax}
            data={geoData}
            style={style as StyleFunction}
            onEachFeature={onEachFeature as (feature: Feature, layer: Layer) => void}
          />
        )}
        {districtBoundaries && (
          <GeoJSON
            key="district-boundaries"
            data={districtBoundaries}
            // Decoration only - no fill, non-interactive so clicks pass
            // through to the municipality polygon underneath. Given its own
            // named pane with a fixed high zIndex so it always renders on
            // top of the municipality fill layer regardless of which layer
            // Leaflet happens to have (re)added most recently - without
            // this, re-adding the fill layer on every metric/category
            // change (its `key` changes) pushed it above the boundary
            // layer, making the district outlines flicker in and out.
            pane="districtBoundaryPane"
            style={() => ({ fill: false, color: '#475569', weight: 1.8, interactive: false })}
          />
        )}
        <DistrictBoundaryPane />
        <FitToData />
      </MapContainer>

      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(248, 250, 252, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'white',
              padding: '10px 18px',
              borderRadius: 999,
              boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
              fontSize: 14,
              color: '#475569',
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                border: '2px solid #cbd5e1',
                borderTopColor: '#2563eb',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            Načítavam dáta…
          </div>
          <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
        </div>
      )}

      <Legend scaleMin={scaleMin} scaleMax={scaleMax} maxValue={maxValue} metric={metric} />

      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'white',
            padding: '10px 14px',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            fontSize: 14,
            minWidth: 200,
            zIndex: 1000,
          }}
        >
          <strong>{hovered.nazov}</strong>
          <div style={{ color: '#64748b' }}>okres {hovered.okresNazov}</div>
          <div style={{ marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            Prevádzok: <strong>{hovered.pocetPrevadzok.toLocaleString('sk-SK')}</strong>
          </div>
          <div style={{ fontVariantNumeric: 'tabular-nums' }}>
            Na 1000 obyv.:{' '}
            <strong>
              {hovered.pocetNa1000Obyvatelov !== null
                ? hovered.pocetNa1000Obyvatelov.toFixed(1)
                : 'chýbajú dáta o populácii'}
            </strong>
          </div>
        </div>
      )}
    </div>
  )
}

// Registers a custom Leaflet pane with a fixed zIndex above the default
// overlayPane (400), so the district boundary layer always draws on top
// regardless of DOM/add order.
function DistrictBoundaryPane() {
  const map = useMap()
  useEffect(() => {
    if (!map.getPane('districtBoundaryPane')) {
      const pane = map.createPane('districtBoundaryPane')
      pane.style.zIndex = '450'
      pane.style.pointerEvents = 'none'
    }
  }, [map])
  return null
}

function Legend({
  scaleMin,
  scaleMax,
  maxValue,
  metric,
}: {
  scaleMin: number
  scaleMax: number
  maxValue: number
  metric: Metric
}) {
  if (scaleMax <= 0) return null
  const clipped = maxValue > scaleMax
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 12,
        background: 'white',
        padding: '10px 12px',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: 12,
        color: '#475569',
        zIndex: 1000,
      }}
    >
      <div style={{ marginBottom: 6, fontWeight: 600 }}>
        {metric === 'absolute' ? 'Počet firiem' : 'Na 1000 obyvateľov'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {COLOR_SCALE.map((c) => (
          <div key={c} style={{ width: 22, height: 12, background: c }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span>{Math.round(scaleMin).toLocaleString('sk-SK')}</span>
        <span>
          {clipped ? '≥ ' : ''}
          {Math.round(scaleMax).toLocaleString('sk-SK')}
        </span>
      </div>
      {clipped && (
        <div style={{ marginTop: 4, color: '#94a3b8', maxWidth: 160 }}>
          Škála orezaná na 90. percentil - najvyššia hodnota je {Math.round(maxValue).toLocaleString('sk-SK')}.
        </div>
      )}
    </div>
  )
}
