'use client'

import { SlovakiaDots } from './SlovakiaDots'
import { buttonPrimary, buttonOutline } from './buttonStyles'

interface HeroProps {
  activeCount: number | null
}

export function Hero({ activeCount }: HeroProps) {
  return (
    <section
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        background: 'linear-gradient(160deg, #0f1f4d 0%, #1e3a8a 45%, #2563eb 100%)',
        color: 'white',
        // Header is position:fixed (overlaps this section rather than
        // taking its own flow space), so this compensates directly rather
        // than relying on flex centering to dodge it.
        padding: '96px 20px 48px',
        overflow: 'hidden',
      }}
    >
      <SlovakiaDots />
      <div
        style={{
          position: 'relative',
          maxWidth: 1100,
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 48,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 420px', minWidth: 280 }}>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 46px)', fontWeight: 800, margin: '0 0 18px', lineHeight: 1.15 }}>
            Kde na Slovensku podnikajú ľudia?
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: 'rgba(255,255,255,0.82)', maxWidth: 520, margin: '0 0 32px', lineHeight: 1.55 }}>
            Otvorená mapa hustoty firiem a živnostníkov podľa okresu a odvetvia - postavená na
            verejnom registri, aktualizovaná priamo z primárneho zdroja.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="#mapa" style={buttonPrimary('onDark')}>
              Preskúmať mapu ↓
            </a>
            <a href="#statistiky" style={buttonOutline('onDark')}>
              Zobraziť štatistiky
            </a>
          </div>
        </div>

        <div
          style={{
            flex: '1 1 320px',
            minWidth: 260,
            background: 'rgba(255,255,255,0.14)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 16,
            padding: '36px 36px',
            textAlign: 'center',
            boxShadow: '0 12px 40px rgba(2, 6, 23, 0.35)',
          }}
        >
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Aktívne podniká na Slovensku
          </div>
          <div style={{ fontSize: 'clamp(44px, 7vw, 64px)', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {activeCount !== null ? activeCount.toLocaleString('sk-SK') : '—'}
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: 10 }}>firiem a živnostníkov</div>
        </div>
      </div>
    </section>
  )
}
