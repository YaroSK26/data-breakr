// components/buttonStyles.ts
//
// One shared button shape (radius, weight, padding rhythm) used everywhere
// a button/pill-link appears - hero CTAs, the "Detail" link on a firm row,
// FirmListPanel's pagination - so they read as the same design system
// instead of each screen inventing its own button.
import type { CSSProperties } from 'react'

type Size = 'md' | 'sm'
type Tone = 'onDark' | 'onLight'

const SIZE: Record<Size, CSSProperties> = {
  md: { padding: '12px 24px', fontSize: 15, borderRadius: 8 },
  sm: { padding: '6px 12px', fontSize: 12.5, borderRadius: 6 },
}

export function buttonPrimary(tone: Tone, size: Size = 'md'): CSSProperties {
  const base: CSSProperties = {
    ...SIZE[size],
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-block',
    cursor: 'pointer',
    border: 'none',
  }
  return tone === 'onDark'
    ? { ...base, background: 'white', color: '#1e3a8a', boxShadow: '0 4px 14px rgba(0,0,0,0.15)' }
    : { ...base, background: '#2563eb', color: 'white', boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }
}

export function buttonOutline(tone: Tone, size: Size = 'md'): CSSProperties {
  const base: CSSProperties = {
    ...SIZE[size],
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-block',
    cursor: 'pointer',
    background: 'transparent',
  }
  return tone === 'onDark'
    ? { ...base, color: 'white', border: '1.5px solid rgba(255,255,255,0.55)' }
    : { ...base, color: '#2563eb', border: '1.5px solid #bfdbfe' }
}
