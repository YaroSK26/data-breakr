// scripts/ingest/fs/sync.test.ts
import { describe, it, expect, vi } from 'vitest'
import { parseDphs, parseDsdd, buildPscToOkres, syncDph, syncDlznici } from './sync'

const DPHS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ZoznamSubjektovRegistrovanychkDPH>
  <DatumAktualizacieZoznamu>06092026</DatumAktualizacieZoznamu>
  <DS_DPHS>
    <ITEM>
      <IC_DPH>SK1020000135</IC_DPH>
      <ICO>36151475</ICO>
      <NAZOV_DS>JUDr. Beáta Krausová</NAZOV_DS>
      <OBEC>Vranov nad Topľou</OBEC>
      <PSC>09301</PSC>
      <ULICA_CISLO>Lúčna 825/10</ULICA_CISLO>
      <STAT>Slovensko</STAT>
      <DRUH_REG_DPH>§4</DRUH_REG_DPH>
      <DATUM_REG>01.08.1998</DATUM_REG>
      <PLAT_DPH_OD>01.08.1998</PLAT_DPH_OD>
    </ITEM>
    <ITEM>
      <IC_DPH>SK1020000999</IC_DPH>
      <NAZOV_DS>Zahraničný subjekt bez ICO</NAZOV_DS>
      <OBEC>Praha</OBEC>
      <PSC>11000</PSC>
      <STAT>Česko</STAT>
      <DRUH_REG_DPH>§5</DRUH_REG_DPH>
      <DATUM_REG>01.01.2020</DATUM_REG>
      <PLAT_DPH_OD>01.01.2020</PLAT_DPH_OD>
    </ITEM>
  </DS_DPHS>
</ZoznamSubjektovRegistrovanychkDPH>`

const DSDD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ZoznamDanovychDlznikov>
  <DatumAktualizacieZoznamu>31072026</DatumAktualizacieZoznamu>
  <DS_DSDD>
    <ITEM>
      <NAZOV_SUBJEKTU>&quot; A.G.S.K. spol. s r.o.&quot;</NAZOV_SUBJEKTU>
      <CIASTKA>780.00</CIASTKA>
      <ULICA_CISLO>Colnícka 12</ULICA_CISLO>
      <PSC>85110</PSC>
      <OBEC>Bratislava - mestská časť Rusovce</OBEC>
    </ITEM>
    <ITEM>
      <NAZOV_SUBJEKTU>Zahraničný dlžník</NAZOV_SUBJEKTU>
      <CIASTKA>150.50</CIASTKA>
      <ULICA_CISLO>Foo 1</ULICA_CISLO>
      <PSC>30-504</PSC>
      <OBEC>Praha</OBEC>
    </ITEM>
  </DS_DSDD>
</ZoznamDanovychDlznikov>`

describe('parseDphs', () => {
  it('vyparsuje riadky s IČO a preskočí tie bez neho', () => {
    const rows = parseDphs(DPHS_XML)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      ico: '36151475',
      icDph: 'SK1020000135',
      druhRegistracie: '§4',
      datumRegistracie: new Date('1998-08-01T00:00:00.000Z'),
      platDphOd: new Date('1998-08-01T00:00:00.000Z'),
    })
  })
})

describe('parseDsdd', () => {
  it('vyparsuje meno v úvodzovkách a odstráni medzery z PSČ', () => {
    const rows = parseDsdd(DSDD_XML)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ psc: '85110', ciastka: 780 })
    // Cudzie PSČ (s pomlčkou) sa parsuje rovnako - filtrovanie proti mape
    // okresov rieši buildPscToOkres/syncDlznici, nie parser.
    expect(rows[1]).toEqual({ psc: '30-504', ciastka: 150.5 })
  })
})

describe('buildPscToOkres', () => {
  it('vyberie okres s najviac firmami pre dané PSČ', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { psc: '04001', okresKod: 'SK0422', pocet: 100n },
        { psc: '04001', okresKod: 'SK0423', pocet: 3n },
        { psc: '85110', okresKod: 'SK0103', pocet: 50n },
      ]),
    }

    const mapa = await buildPscToOkres(prisma as never)

    expect(mapa.get('04001')).toBe('SK0422')
    expect(mapa.get('85110')).toBe('SK0103')
  })
})

describe('syncDph', () => {
  it('odmietne zápis, ak zdroj vráti podozrivo málo riadkov', async () => {
    const prisma = { $executeRaw: vi.fn() }

    await expect(syncDph(prisma as never, [{ ico: '1', icDph: null, druhRegistracie: null, datumRegistracie: null, platDphOd: null }])).rejects.toThrow(
      /nemazať existujúce dáta/
    )
    expect(prisma.$executeRaw).not.toHaveBeenCalled()
  })

  it('pri dosť riadkoch zmaže a vloží jedným INSERT ... unnest', async () => {
    // Stovky chunkovaných createMany() v jednej $transaction cez Supabase
    // pooler (transaction-mode pgbouncer) sa v praxi zasekli bez chyby aj
    // bez pokroku - preto jeden $executeRaw s poľami namiesto toho.
    const prisma = { $executeRaw: vi.fn(async () => 0) }
    const rows = Array.from({ length: 250_000 }, (_, i) => ({
      ico: String(i),
      icDph: null,
      druhRegistracie: null,
      datumRegistracie: null,
      platDphOd: null,
    }))

    const pocet = await syncDph(prisma as never, rows)

    expect(pocet).toBe(250_000)
    // DELETE + jeden INSERT, nie jeden príkaz na dávku.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2)
  })
})

describe('syncDlznici', () => {
  const dostByRiadkov = Array.from({ length: 80_000 }, () => ({ psc: '04001', ciastka: 10 }))

  it('odmietne zápis, ak zdroj vráti podozrivo málo riadkov', async () => {
    const prisma = { $transaction: vi.fn() }

    await expect(syncDlznici(prisma as never, [{ psc: '04001', ciastka: 10 }], new Map())).rejects.toThrow(
      /nemazať existujúce dáta/
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('odmietne zápis, ak sa priveľa riadkov nedá priradiť k okresu', async () => {
    const prisma = { $transaction: vi.fn() }
    // Prázdna mapa PSČ->okres, takže sa nespáruje nič.
    await expect(syncDlznici(prisma as never, dostByRiadkov, new Map())).rejects.toThrow(/priradilo k okresu/)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('agreguje sumu a počet dlžníkov po okresoch, cudzie PSČ vynechá', async () => {
    const prisma = {
      fsDanovyDlznikOkres: { deleteMany: vi.fn(() => 'del'), createMany: vi.fn((a) => a) },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    }
    const rows = [
      ...dostByRiadkov,
      { psc: '99999', ciastka: 999 }, // nepozná ho mapa - vynechá sa
    ]
    const pscToOkres = new Map([['04001', 'SK0422']])

    const vysledok = await syncDlznici(prisma as never, rows, pscToOkres)

    expect(vysledok).toEqual({ dlznikov: 80_001, sOkresom: 80_000, matchPct: 80_000 / 80_001 })
    const zapisane = prisma.fsDanovyDlznikOkres.createMany.mock.calls[0][0].data
    expect(zapisane).toEqual([{ okresKod: 'SK0422', pocetDlznikov: 80_000, sumaDlhu: 800_000, aktualizovane: expect.any(Date) }])
  })
})
