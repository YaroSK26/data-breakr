'use client'

// components/RychlyPrehlad.tsx
//
// Plávajúce tlačidlo na každej stránke -> popup, v ktorom si človek vyberie
// okres a odvetvie a dostane všetky čísla naraz. Tie isté údaje sa na webe
// dajú vyklikať aj dnes, ale rozhádzane: hustotu na mape, mzdu na
// /statistiky-okresov, zaniknuté na /zaniknute-firmy, platcov DPH až v
// detaile okresu. Toto je skratka, nie nový dataset.
import { useCallback, useEffect, useState } from 'react'
import { DataSourceBanner } from './DataSourceBanner'
import { SearchableSelect } from './SearchableSelect'

interface Category {
  kod4: string
  nazov: string
  sekcia: string
  sekciaNazov: string
}

interface Okres {
  kod: string
  nazov: string
  kraj: string
}

interface Prehlad {
  okres: { kod: string; nazov: string; kraj: string; obyvatelov: number | null }
  odvetvie: { kod: string; nazov: string; sekcia: string; sekciaNazov: string } | null
  firmy: {
    aktivnych: number
    nove12m: number
    na1000: number | null
    platcovDph: number
    podielPlatcovDph: number | null
  }
  hustota: {
    poradie: number | null
    zPoctuOkresov: number
    najhustejsie: { nazov: string; na1000: number }[]
    celoslovenskyPriemerNa1000: number | null
    celkomNaSlovensku: number
  }
  zaniky: { rok: number; pocet: number }[]
  mzda: {
    hodnota: number
    rok: number
    sekcia: string
    sekciaNazov: string | null
    zaOkresSpolu: boolean
  } | null
  dlznici: { pocet: number; suma: number; aktualizovane: string } | null
  upozornenia: string[]
  zdroje: {
    sourceName: string
    sourceUrl: string
    lastSyncedAt: string | null
    recordsCount: number | null
  }[]
}

const cislo = (n: number, desatiny = 0) =>
  n.toLocaleString('sk-SK', { minimumFractionDigits: desatiny, maximumFractionDigits: desatiny })

export function RychlyPrehlad() {
  const [otvorene, setOtvorene] = useState(false)
  const [okresy, setOkresy] = useState<Okres[]>([])
  const [kategorie, setKategorie] = useState<Category[]>([])
  const [okres, setOkres] = useState('')
  const [nace, setNace] = useState('')
  const [data, setData] = useState<Prehlad | null>(null)
  const [nacitava, setNacitava] = useState(false)
  const [chyba, setChyba] = useState<string | null>(null)

  // Zoznamy do výberov sa sťahujú až pri prvom otvorení - inak by každá
  // stránka webu platila za 650 kategórií, ktoré väčšina návštevníkov
  // nikdy neuvidí.
  useEffect(() => {
    if (!otvorene || okresy.length > 0) return
    fetch('/api/okresy')
      .then((r) => r.json())
      .then((d: { okresy: Okres[] }) => setOkresy(d.okresy))
      .catch(() => setChyba('Zoznam okresov sa nepodarilo načítať.'))
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d: { categories: Category[] }) => setKategorie(d.categories))
      .catch(() => setChyba('Zoznam odvetví sa nepodarilo načítať.'))
  }, [otvorene, okresy.length])

  useEffect(() => {
    if (!otvorene) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOtvorene(false)
    }
    document.addEventListener('keydown', onKey)
    // Bez tohto scrolluje stránka pod dialógom - kolieskom nad prekrytím sa
    // posúvala mapa aj grafy, hoci dialóg zostal stáť.
    const povodnyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = povodnyOverflow
    }
  }, [otvorene])

  const nacitaj = useCallback(async () => {
    if (!okres) return
    setNacitava(true)
    setChyba(null)
    try {
      const params = new URLSearchParams({ okres })
      if (nace) params.set('nace', nace)
      const res = await fetch(`/api/prehlad-odvetvia?${params}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Nepodarilo sa načítať prehľad.')
      setData(d)
    } catch (e) {
      setChyba(e instanceof Error ? e.message : 'Nepodarilo sa načítať prehľad.')
      setData(null)
    } finally {
      setNacitava(false)
    }
  }, [okres, nace])

  // Okres stačí sám o sebe (prehľad celého okresu), odvetvie je voliteľné
  // spresnenie - preto sa ťahá pri každej zmene ktoréhokoľvek z nich.
  useEffect(() => {
    if (!otvorene || !okres) return
    nacitaj()
  }, [otvorene, okres, nace, nacitaj])

  return (
    <>
      <button
        onClick={() => setOtvorene(true)}
        aria-label="Rýchly prehľad okresu a odvetvia"
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          // Pod hlavičkou (zIndex 5000), aby jej rozbalené menu tlačidlo
          // prekrylo, nie naopak.
          zIndex: 4000,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 20px',
          borderRadius: 999,
          border: 'none',
          background: '#2563eb',
          color: 'white',
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(37,99,235,0.35)',
        }}
      >
        <span aria-hidden style={{ fontSize: 16 }}>◎</span>
        Rýchly prehľad
      </button>

      {otvorene && (
        <div
          onClick={() => setOtvorene(false)}
          style={{
            position: 'fixed',
            inset: 0,
            // Nad hlavičkou, ktorá je position:fixed so zIndex 5000 - inak
            // dialóg síce vyjde v strede, ale hornú časť aj so zatváracím
            // krížikom prekryje modrý pruh hlavičky.
            zIndex: 6000,
            background: 'rgba(15,23,42,0.55)',
            // Centrovanie cez margin:auto na dieťati, nie cez alignItems:
            // pri obsahu vyššom ako obrazovka flexbox centrovanie oreže
            // vrch dialógu tak, že sa k nemu nedá odscrollovať.
            display: 'flex',
            justifyContent: 'center',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Rýchly prehľad"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 14,
              maxWidth: 720,
              width: '100%',
              padding: 24,
              boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
              margin: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#0f172a' }}>
                  Kde a v čom podnikať
                </h2>
                <p style={{ margin: 0, fontSize: 13.5, color: '#64748b', lineHeight: 1.5 }}>
                  Vyber okres a odvetvie - všetko, čo o tej dvojici vieme, na jednom mieste.
                </p>
              </div>
              <button
                onClick={() => setOtvorene(false)}
                aria-label="Zavrieť"
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  color: '#475569',
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  fontSize: 18,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
                margin: '20px 0',
              }}
            >
              <SearchableSelect
                options={okresy.map((o) => ({
                  value: o.kod,
                  label: o.nazov,
                  keywords: o.kraj,
                }))}
                value={okres}
                onChange={setOkres}
                placeholder="Okres (napíš názov)"
                emptyOptionLabel="Vyber okres"
              />
              <SearchableSelect
                options={kategorie.map((k) => ({
                  value: k.kod4,
                  label: k.nazov,
                  keywords: `${k.sekciaNazov} ${k.kod4}`,
                }))}
                value={nace}
                onChange={setNace}
                placeholder="Odvetvie (voliteľné)"
                emptyOptionLabel="Všetky odvetvia"
              />
            </div>

            {!okres && (
              <p style={{ color: '#64748b', fontSize: 14, margin: '24px 0' }}>
                Začni výberom okresu.
              </p>
            )}
            {nacitava && (
              <p style={{ color: '#64748b', fontSize: 14, margin: '24px 0' }}>Počítam…</p>
            )}
            {chyba && (
              <p style={{ color: '#b91c1c', fontSize: 14, margin: '24px 0' }}>{chyba}</p>
            )}

            {data && !nacitava && <Karta data={data} />}
          </div>
        </div>
      )}
    </>
  )
}

function Karta({ data }: { data: Prehlad }) {
  const { okres, odvetvie, firmy, hustota, zaniky, mzda, dlznici } = data
  const zanikSpolu = zaniky.reduce((s, z) => s + z.pocet, 0)
  const mieraZaniku = firmy.aktivnych > 0 ? (zanikSpolu / firmy.aktivnych) * 100 : null

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 15, color: '#0f172a' }}>
        <strong>{odvetvie ? odvetvie.nazov : 'Všetky odvetvia'}</strong> v okrese{' '}
        <strong>{okres.nazov}</strong>
        {okres.obyvatelov ? ` (${cislo(okres.obyvatelov)} obyvateľov)` : ''}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
        }}
      >
        <Dlazdica
          popis="Aktívnych subjektov"
          hodnota={cislo(firmy.aktivnych)}
          detail={
            hustota.poradie
              ? `${hustota.poradie}. najhustejší okres zo ${hustota.zPoctuOkresov}`
              : undefined
          }
        />
        <Dlazdica
          popis="Na 1000 obyvateľov"
          hodnota={firmy.na1000 !== null ? cislo(firmy.na1000, 2) : '—'}
          detail={
            hustota.celoslovenskyPriemerNa1000 !== null
              ? `celoslovenský priemer ${cislo(hustota.celoslovenskyPriemerNa1000, 2)}`
              : undefined
          }
        />
        <Dlazdica
          popis="Nových za 12 mesiacov"
          hodnota={cislo(firmy.nove12m)}
          detail={
            firmy.aktivnych > 0
              ? `${cislo((firmy.nove12m / firmy.aktivnych) * 100, 1)} % dnešného stavu`
              : undefined
          }
        />
        <Dlazdica
          popis="Platcovia DPH"
          hodnota={
            firmy.podielPlatcovDph !== null ? `${cislo(firmy.podielPlatcovDph, 1)} %` : '—'
          }
          detail={`${cislo(firmy.platcovDph)} z ${cislo(firmy.aktivnych)}`}
        />
        <Dlazdica
          popis={
            mzda?.zaOkresSpolu
              ? 'Priem. mzda v okrese'
              : `Priem. mzda${mzda ? ` (${mzda.sekcia})` : ''}`
          }
          hodnota={mzda ? `${cislo(mzda.hodnota)} €` : '—'}
          detail={mzda ? `ŠÚ SR, rok ${mzda.rok}` : undefined}
        />
        <Dlazdica
          popis={zaniky.length > 0 ? `Zaniklo ${zaniky.map((z) => z.rok).join(' + ')}` : 'Zaniklo'}
          hodnota={cislo(zanikSpolu)}
          detail={mieraZaniku !== null ? `${cislo(mieraZaniku, 1)} % dnešného stavu` : undefined}
        />
      </div>

      {hustota.najhustejsie.length > 0 && (
        <p style={{ margin: '14px 0 0', fontSize: 13, color: '#475569' }}>
          Najhustejšie okresy v tomto odvetví:{' '}
          {hustota.najhustejsie
            .map((o) => `${o.nazov} (${cislo(o.na1000, 2)})`)
            .join(', ')}
          .
        </p>
      )}

      {dlznici && (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#475569' }}>
          V okrese je {cislo(dlznici.pocet)} daňových dlžníkov s dlhom{' '}
          {cislo(dlznici.suma / 1_000_000, 1)} mil. € (za všetky odvetvia spolu).
        </p>
      )}

      {data.upozornenia.length > 0 && (
        <div
          style={{
            marginTop: 18,
            border: '1px solid #fcd34d',
            background: '#fffbeb',
            borderLeft: '4px solid #f59e0b',
            borderRadius: 8,
            padding: '12px 14px',
          }}
        >
          <p
            style={{
              margin: '0 0 6px',
              fontWeight: 700,
              fontSize: 13,
              color: '#92400e',
            }}
          >
            Čo tieto čísla nehovoria
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#92400e', lineHeight: 1.55 }}>
            {data.upozornenia.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <DataSourceBanner sources={data.zdroje} />
      </div>
    </div>
  )
}

function Dlazdica({
  popis,
  hodnota,
  detail,
}: {
  popis: string
  hodnota: string
  detail?: string
}) {
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '12px 14px',
        background: '#f8fafc',
      }}
    >
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{popis}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
        {hodnota}
      </div>
      {detail && (
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4, lineHeight: 1.35 }}>
          {detail}
        </div>
      )}
    </div>
  )
}
