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
  pocetPrevadzok: number
  pocetNa1000Obyvatelov: number | null
}

// Sequential blue scale, low -> high. Colorblind-safe (single hue, varying
// lightness only, per the design brief's "farby na heatmape vyhradené
// výhradne na kódovanie hodnôt").
const COLOR_SCALE = ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a']
const NO_DATA_COLOR = '#e5e7eb'

function colorFor(value: number | null, max: number): string {
  if (value === null || value === undefined || max <= 0) return NO_DATA_COLOR
  const ratio = value / max
  const idx = Math.min(COLOR_SCALE.length - 1, Math.floor(ratio * COLOR_SCALE.length))
  return COLOR_SCALE[idx]
}

function FitToData({ data }: { data: FeatureCollection | null }) {
  const map = useMap()
  useEffect(() => {
    if (!data || data.features.length === 0) return
    // Slovakia's approximate bounding box - fixed view rather than
    // recomputing from geometry on every fetch, since municipality
    // coverage is always national.
    map.fitBounds([
      [47.7, 16.8],
      [49.65, 22.6],
    ])
  }, [data, map])
  return null
}

export function DensityMap({ data, metric }: { data: FeatureCollection | null; metric: Metric }) {
  const [hovered, setHovered] = useState<MunicipalityProps | null>(null)

  const maxValue = useMemo(() => {
    if (!data) return 0
    let max = 0
    for (const f of data.features) {
      const p = f.properties as MunicipalityProps
      const v = metric === 'absolute' ? p.pocetPrevadzok : p.pocetNa1000Obyvatelov
      if (v !== null && v !== undefined && v > max) max = v
    }
    return max
  }, [data, metric])

  const style: StyleFunction<MunicipalityProps> = (feature) => {
    const p = feature?.properties as MunicipalityProps | undefined
    const value = p ? (metric === 'absolute' ? p.pocetPrevadzok : p.pocetNa1000Obyvatelov) : null
    return {
      fillColor: colorFor(value ?? null, maxValue),
      fillOpacity: 0.85,
      color: '#94a3b8',
      weight: 0.5,
    }
  }

  const onEachFeature = (feature: Feature<Geometry, MunicipalityProps>, layer: Layer) => {
    layer.on({
      mouseover: () => setHovered(feature.properties),
      mouseout: () => setHovered(null),
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <MapContainer
        center={[48.7, 19.5]}
        zoom={8}
        style={{ height: '70vh', width: '100%', borderRadius: 8 }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {data && (
          <GeoJSON
            key={metric + maxValue}
            data={data}
            style={style as StyleFunction}
            onEachFeature={onEachFeature as (feature: Feature, layer: Layer) => void}
          />
        )}
        <FitToData data={data} />
      </MapContainer>

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
