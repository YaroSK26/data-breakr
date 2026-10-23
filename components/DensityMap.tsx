'use client'

import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import type { Layer, StyleFunction } from 'leaflet'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import 'leaflet/dist/leaflet.css'

export type Metric = 'absolute' | 'perCapita' | 'dphShare'

// Dáta sú len po okresy, takže mapa kreslí okresy, nie obce - inak by
// farba „skákala“ medzi obcami, hoci každá obec len opakuje číslo okresu.
interface DistrictProps {
  kod: string
  nazov: string
}

export interface DistrictDensity {
  pocetPrevadzok: number
  pocetNa1000Obyvatelov: number | null
  // Percento aktívnych subjektov v okrese, ktoré sú platiteľmi DPH
  // (Finančná správa SR, spárované cez IČO). Voliteľné - stránky, ktoré
  // túto metriku nepoužívajú (zaniknuté firmy, štatistiky okresov), ju
  // nemusia dodávať.
  podielPlatcovDph?: number | null
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
  // Mapa sa používa aj pre iné veličiny než počet prevádzok (napr. počty
  // zaniknutých firiem), takže popisky sa dajú prebiť. Predvolené hodnoty
  // zodpovedajú pôvodnej mape hustoty.
  popisHodnoty?: string
  popisLegendy?: { absolute: string; perCapita: string; dphShare?: string }
  // Niektoré zdroje (ŠÚ SR okresné ukazovatele) majú len jednu absolútnu
  // hodnotu na okres, žiadny zmysluplný "na obyvateľa" náprotivok - tam by
  // druhý riadok v tooltipe vždy hlásil "chýbajú dáta", čo je zavádzajúce
  // (dáta nechýbajú, tá metrika tam len neexistuje).
  skryTooltipPerCapita?: boolean
  selectedRegionCode?: string
}

export function DensityMap({
  densityByDistrict,
  metric,
  loading,
  onDistrictClick,
  popisHodnoty = 'Prevádzok',
  popisLegendy = { absolute: 'Počet firiem', perCapita: 'Na 1000 obyvateľov', dphShare: '% platcov DPH' },
  skryTooltipPerCapita = false,
  selectedRegionCode = '',
}: DensityMapProps) {
  const [mapMode, setMapMode] = useState<'data' | 'base'>('data')
  const [hovered, setHovered] = useState<(DistrictProps & DistrictDensity) | null>(null)
  const [districtBoundaries, setDistrictBoundaries] = useState<FeatureCollection | null>(null)
  const [regionBoundaries, setRegionBoundaries] = useState<FeatureCollection | null>(null)

  // District shapes are static - fetched once on mount, independent of the
  // NACE/metric filter. Only the density VALUES (densityByDistrict, passed
  // as a prop) change per filter.
  useEffect(() => {
    fetch('/api/district-boundaries')
      .then((r) => r.json())
      .then((d) => setDistrictBoundaries(d))
      .catch(() => setDistrictBoundaries(null))

    fetch('/api/region-boundaries?v=2', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setRegionBoundaries(d))
      .catch(() => setRegionBoundaries(null))
  }, [])

  const valueFor = (okresKod: string): number | null => {
    const d = densityByDistrict?.[okresKod]
    if (!d) return null
    if (metric === 'absolute') return d.pocetPrevadzok
    if (metric === 'dphShare') return d.podielPlatcovDph ?? null
    return d.pocetNa1000Obyvatelov
  }

  const { scaleMin, scaleMax, maxValue } = useMemo(() => {
    if (!densityByDistrict) return { scaleMin: 0, scaleMax: 0, maxValue: 0 }
    const values = Object.values(densityByDistrict)
      .map((d) =>
        metric === 'absolute' ? d.pocetPrevadzok : metric === 'dphShare' ? (d.podielPlatcovDph ?? null) : d.pocetNa1000Obyvatelov
      )
      .filter((v): v is number => v !== null && v !== undefined)
      .sort((a, b) => a - b)
    return {
      scaleMin: percentile(values, 0.1),
      scaleMax: Math.max(percentile(values, 0.9), 1),
      maxValue: values.length > 0 ? values[values.length - 1] : 0,
    }
  }, [densityByDistrict, metric])

  const selectedRegionBoundary = useMemo<FeatureCollection | null>(() => {
    if (!regionBoundaries || !selectedRegionCode) return null
    return {
      type: 'FeatureCollection',
      features: regionBoundaries.features.filter(
        (feature) => feature.properties?.kod === selectedRegionCode,
      ),
    }
  }, [regionBoundaries, selectedRegionCode])

  const style: StyleFunction<DistrictProps> = (feature) => {
    const p = feature?.properties as DistrictProps | undefined
    const value = p ? valueFor(p.kod) : null
    return {
      fillColor: colorFor(value, scaleMin, scaleMax),
      fillOpacity: 0.85,
      color: '#475569',
      weight: 1.2,
    }
  }

  const onEachFeature = (feature: Feature<Geometry, DistrictProps>, layer: Layer) => {
    layer.on({
      mouseover: () => {
        const d = densityByDistrict?.[feature.properties.kod]
        setHovered({
          ...feature.properties,
          pocetPrevadzok: d?.pocetPrevadzok ?? 0,
          pocetNa1000Obyvatelov: d?.pocetNa1000Obyvatelov ?? null,
          podielPlatcovDph: d?.podielPlatcovDph,
        })
      },
      mouseout: () => setHovered(null),
      click: () => onDistrictClick?.(feature.properties.kod, feature.properties.nazov),
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
        {districtBoundaries && mapMode === 'data' && (
          <GeoJSON
            key={`${metric}-${scaleMin}-${scaleMax}`}
            data={districtBoundaries}
            style={style as StyleFunction}
            onEachFeature={onEachFeature as (feature: Feature, layer: Layer) => void}
          />
        )}
        {selectedRegionBoundary && mapMode === 'data' && (
          <GeoJSON
            key={`selected-region-${selectedRegionCode}`}
            data={selectedRegionBoundary}
            pane="districtBoundaryPane"
            style={() => ({
              fill: false,
              color: '#dc2626',
              weight: 4,
              opacity: 1,
              interactive: false,
            })}
          />
        )}
        <DistrictBoundaryPane />
        <FitToData />
      </MapContainer>

      <div
        role="group"
        aria-label="Režim mapy"
        style={{
          position: 'absolute',
          top: 12,
          left: 52,
          zIndex: 1000,
          display: 'flex',
          padding: 3,
          gap: 2,
          borderRadius: 8,
          background: 'white',
          boxShadow: '0 2px 10px rgba(15,23,42,0.2)',
        }}
      >
        {([
          ['data', 'Dátová mapa'],
          ['base', 'Bežná mapa'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={mapMode === mode}
            onClick={() => setMapMode(mode)}
            style={{
              border: 0,
              borderRadius: 6,
              padding: '7px 10px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              background: mapMode === mode ? '#2563eb' : 'transparent',
              color: mapMode === mode ? 'white' : '#334155',
            }}
          >
            {label}
          </button>
        ))}
      </div>

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

      {mapMode === 'data' && <Legend
        scaleMin={scaleMin}
        scaleMax={scaleMax}
        maxValue={maxValue}
        metric={metric}
        popisLegendy={popisLegendy}
      />}

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
          <strong>okres {hovered.nazov}</strong>
          <div style={{ marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {popisHodnoty}: <strong>{hovered.pocetPrevadzok.toLocaleString('sk-SK')}</strong>
          </div>
          {!skryTooltipPerCapita && (
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>
              {popisLegendy.perCapita}:{' '}
              <strong>
                {hovered.pocetNa1000Obyvatelov !== null
                  ? hovered.pocetNa1000Obyvatelov.toFixed(1)
                  : 'chýbajú dáta'}
              </strong>
            </div>
          )}
          {hovered.podielPlatcovDph !== undefined && (
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>
              Platcov DPH:{' '}
              <strong>
                {hovered.podielPlatcovDph !== null ? `${hovered.podielPlatcovDph.toFixed(1)} %` : 'chýbajú dáta'}
              </strong>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Registers a custom Leaflet pane with a fixed zIndex above the default
// overlayPane (400), so the selected-region outline always draws on top of
// the district fill regardless of DOM/add order.
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
  popisLegendy,
}: {
  scaleMin: number
  scaleMax: number
  maxValue: number
  metric: Metric
  popisLegendy: { absolute: string; perCapita: string; dphShare?: string }
}) {
  if (scaleMax <= 0) return null
  const clipped = maxValue > scaleMax
  const jednotka = metric === 'dphShare' ? ' %' : ''
  const format = (v: number) => `${metric === 'dphShare' ? v.toFixed(1) : Math.round(v).toLocaleString('sk-SK')}${jednotka}`
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
        {metric === 'absolute' ? popisLegendy.absolute : metric === 'dphShare' ? (popisLegendy.dphShare ?? 'Platcov DPH') : popisLegendy.perCapita}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {COLOR_SCALE.map((c) => (
          <div key={c} style={{ width: 22, height: 12, background: c }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span>{format(scaleMin)}</span>
        <span>
          {clipped ? '≥ ' : ''}
          {format(scaleMax)}
        </span>
      </div>
      {clipped && (
        <div style={{ marginTop: 4, color: '#94a3b8', maxWidth: 160 }}>
          Škála orezaná na 90. percentil - najvyššia hodnota je {format(maxValue)}.
        </div>
      )}
    </div>
  )
}
