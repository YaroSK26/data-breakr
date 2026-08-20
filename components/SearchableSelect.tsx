'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface SearchableOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: SearchableOption[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  emptyOptionLabel: string
}

// Native <input list><datalist> looked broken in practice - inconsistent
// browser rendering, a fixed short height that hides most of 600+ NACE
// categories, and no reliable way to tell "typed text" apart from "picked
// option". A small custom combobox instead: type to filter, click (or
// Enter) to pick, always shows a real scrollable list.
export function SearchableSelect({ options, value, onChange, placeholder, emptyOptionLabel }: SearchableSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedLabel = options.find((o) => o.value === value)?.label ?? ''

  useEffect(() => {
    if (!open) setQuery(selectedLabel)
  }, [selectedLabel, open])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!open || !q || q === selectedLabel.toLowerCase()) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query, open, selectedLabel])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        value={open ? query : selectedLabel}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', width: '100%' }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'white',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
            // Above the fixed header (5000) - confirmed live, this
            // dropdown was rendering underneath it near the top of the page.
            zIndex: 6000,
          }}
        >
          <div
            onMouseDown={(e) => {
              e.preventDefault()
              onChange('')
              setOpen(false)
            }}
            style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}
          >
            {emptyOptionLabel}
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 13, color: '#94a3b8' }}>Nič nenájdené.</div>
          ) : (
            filtered.map((o) => (
              <div
                key={o.value}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(o.value)
                  setOpen(false)
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  cursor: 'pointer',
                  background: o.value === value ? '#eff6ff' : 'white',
                  color: '#1e293b',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = o.value === value ? '#eff6ff' : 'white')}
              >
                {o.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
