'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Stats } from '@/app/page'

const BAR_COLOR = '#2563eb'
const CARD_STYLE: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '18px 20px',
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  marginBottom: 20,
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// recharts tick labels are plain SVG <text> with no native hover - a
// <title> child gives the full untruncated name as a browser tooltip on
// hover, for the labels that truncate() had to cut short.
function TruncatedTick({ x, y, payload, angle, textAnchor, maxLen, dy }: any) {
  const full: string = payload.value
  return (
    <text x={x} y={y} dy={dy ?? 4} textAnchor={textAnchor} fontSize={11} fill="#334155" transform={angle ? `rotate(${angle}, ${x}, ${y})` : undefined}>
      <title>{full}</title>
      {truncate(full, maxLen)}
    </text>
  )
}

// A fixed interval that looks fine at 1400px crowds badly at 375px - 32
// years is simply too many labels for a phone screen. Track viewport width
// and thin the labels further on narrow screens instead.
function useYearTickInterval(): number {
  const [interval, setInterval_] = useState(1)
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      setInterval_(w < 480 ? 5 : w < 768 ? 3 : 1)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return interval
}

export function StatsCharts({ stats }: { stats: Stats }) {
  const yearTickInterval = useYearTickInterval()
  return (
    <>
      <div style={{ ...CARD_STYLE, paddingLeft: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', paddingLeft: 12 }}>Kde je najviac firiem</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 4px', paddingLeft: 12 }}>Top 15 okresov (mestských častí) podľa počtu aktívnych firiem</p>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px', paddingLeft: 12 }}>
          Bratislava (5 okresov) a Košice (4 okresy) sú tu zjednotené za celé mesto - inak by ich formálne
          administratívne delenie nespravodlivo znížilo ich pozíciu oproti jednookresovým mestám ako Žilina.
        </p>
        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={stats.byDistrict} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis
              type="category"
              dataKey="nazov"
              width={118}
              tick={<TruncatedTick maxLen={18} textAnchor="end" />}
            />
            <Tooltip
              cursor={false}
              formatter={(v) => [Number(v).toLocaleString('sk-SK'), 'firiem']}
              contentStyle={{ fontSize: 13, borderRadius: 8 }}
            />
            <Bar dataKey="pocet" radius={[0, 4, 4, 0]}>
              {stats.byDistrict.map((_, i) => (
                <Cell key={i} fill={i === 0 ? '#1e3a8a' : BAR_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={CARD_STYLE}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Najčastejšie odvetvia</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>Top 12 kategórií (NACE) podľa počtu aktívnych firiem</p>
        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={stats.byCategory} margin={{ bottom: 100 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="nazov"
              tick={<TruncatedTick maxLen={26} textAnchor="end" dy={10} angle={-40} />}
              angle={-40}
              textAnchor="end"
              interval={0}
              height={100}
            />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
            <Tooltip
              cursor={false}
              formatter={(v) => [Number(v).toLocaleString('sk-SK'), 'firiem']}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.nazov ?? ''}
              contentStyle={{ fontSize: 13, borderRadius: 8 }}
            />
            <Bar dataKey="pocet" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={CARD_STYLE}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Registrácie podľa roku (od 1995)</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
          Počet firiem so vznikom v danom roku (aktívne aj odvtedy zaniknuté) - podľa dátumu vzniku v registri
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={stats.byYear}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="rok"
              tick={{ fontSize: 12, fill: '#64748b' }}
              // recharts' default "auto" interval skips labels
              // inconsistently (crowds some years, leaves big gaps at
              // others) - a fixed, viewport-aware interval is predictable
              // and thins out further on narrow/mobile screens.
              interval={yearTickInterval}
            />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
            <Tooltip formatter={(v) => [Number(v).toLocaleString('sk-SK'), 'firiem']} contentStyle={{ fontSize: 13, borderRadius: 8 }} />
            <Line type="monotone" dataKey="pocet" stroke={BAR_COLOR} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
