'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function AppHeader() {
  // Transparent over the hero at the top of the page, solid brand blue
  // once scrolled - a transparent sticky header stays legible over the
  // hero's own dark gradient, but would blend into the white page body
  // once it's the only thing at the top of the viewport. Only "/" has that
  // dark hero underneath the header - every other page starts with a
  // plain white background, so the header must render solid there from
  // the very top, or its white nav text becomes unreadable on white.
  const pathname = usePathname()
  const hasHero = pathname === '/'
  const [scrolledPastHero, setScrolledPastHero] = useState(false)
  const scrolled = !hasHero || scrolledPastHero
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!hasHero) return
    const onScroll = () => setScrolledPastHero(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [hasHero])

  // A route change (clicking a nav link) doesn't remount this component -
  // without this the dropdown stayed open over the next page.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    <>
      <a href="#main-content" className="skip-link">
        Preskočiť na obsah
      </a>
      <header
        style={{
          // Fixed, not sticky: this needs to overlap the hero (transparent,
          // hero's own dark gradient showing through) at the very top of
          // the page - sticky instead pushes the hero down below it in
          // normal flow, leaving nothing but the plain page background
          // behind the transparent header until you scroll.
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          // Higher than Leaflet's internal panes (tiles/markers/popups top
          // out around z-index 700) - confirmed live, the map was
          // rendering over the header on scroll without this.
          zIndex: 5000,
          background: scrolled ? '#2563eb' : 'transparent',
          backdropFilter: scrolled ? 'none' : 'blur(10px)',
          boxShadow: scrolled ? '0 4px 20px rgba(15, 23, 42, 0.2)' : '0 4px 24px rgba(0,0,0,0.12)',
          transition: 'background 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          <Link
            href="/"
            style={{ fontWeight: 700, fontSize: 17, color: 'white', textDecoration: 'none', textShadow: '0 1px 6px rgba(0,0,0,0.25)' }}
          >
            Databáza Firiem
          </Link>
          <nav className={`nav-links${menuOpen ? ' open' : ''}`}>
            <Link href="/#mapa" className="nav-link">
              Mapa hustoty
            </Link>
            <Link href="/zaniknute-firmy" className="nav-link">
              Zaniknuté firmy
            </Link>
            <Link href="/statistiky-okresov" className="nav-link">
              Štatistiky okresov
            </Link>
            <Link href="/statistiky" className="nav-link">
              Daňové dlžníctvo
            </Link>
          </nav>
          <button
            type="button"
            className="nav-toggle"
            aria-label={menuOpen ? 'Zavrieť menu' : 'Otvoriť menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>
    </>
  )
}
