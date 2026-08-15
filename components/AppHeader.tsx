'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navLinkStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  color: active ? '#1e3a8a' : '#64748b',
  background: active ? '#dbeafe' : 'transparent',
  textDecoration: 'none',
})

export function AppHeader() {
  const pathname = usePathname()

  return (
    <header
      style={{
        borderBottom: '1px solid #e2e8f0',
        background: 'white',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <Link href="/" style={{ fontWeight: 700, fontSize: 17, color: '#1e293b', textDecoration: 'none' }}>
          SK Biznis Mapa
        </Link>
        <nav style={{ display: 'flex', gap: 4 }}>
          <Link href="/" style={navLinkStyle(pathname === '/')}>
            Mapa hustoty
          </Link>
          <Link href="/benchmark" style={navLinkStyle(pathname === '/benchmark')}>
            Finančný benchmark
          </Link>
        </nav>
      </div>
    </header>
  )
}
