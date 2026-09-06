# Finančná správa SR integration — design

## Goal

Extend the existing density map (`/`) with two Finančná správa SR (FS)
open-data feeds: DPH payer status per firm, and aggregated tax-debtor
counts per district. No new page — this is an extension of the
existing map/filter/drill-down UI.

Sources (no API key, daily-refreshed zip/XML, `opendata.financnasprava.sk`):

- `ds_dphs.zip` → `ds_dphs.xml` — VAT payers. Has `ICO`, joins directly
  to `business_entities.ico`. ~316k rows, ~300k match active firms (29%).
- `ds_dsdd.zip` → `ds_dsdd.xml` — tax debtors. No IČO, only
  `NAZOV_SUBJEKTU` (name — often a private person) + `PSC` + `CIASTKA`
  (debt amount). Never store per-debtor rows or names — aggregate to
  district only.

A third feed (tax reliability index) requires an API key the user
doesn't have yet — out of scope, not a blocker for this work.

## Schema

Two tables, same full-replace-on-each-ingest pattern as
`nace21_codes` / `nace_rev2_to_rev21`, RLS enabled like every other
`public` table (Supabase exposes everything via PostgREST):

```prisma
model FsPlatcaDph {
  ico              String    @id
  icDph            String?   @map("ic_dph")
  druhRegistracie  String?   @map("druh_registracie")
  datumRegistracie DateTime? @map("datum_registracie")
  platDphOd        DateTime? @map("plat_dph_od")

  @@map("fs_platca_dph")
}

model FsDanovyDlznikOkres {
  okresKod       String   @id @map("okres_kod")
  pocetDlznikov  Int      @map("pocet_dlznikov")
  sumaDlhu       Decimal  @map("suma_dlhu")
  aktualizovane  DateTime @map("aktualizovane")

  @@map("fs_danovy_dlznik_okres")
}
```

`fs_platca_dph` is keyed on `ico` (one row per IČO, matches the map's
join key). `fs_danovy_dlznik_okres` is keyed on `okres_kod` — one row
per district, no debtor identity ever stored.

## PSČ → okres mapping

No new external mapping table. `business_entities` already carries
`psc` + `okres_kod` for ~1M active firms — at ingest time, build a
majority-vote `psc → okres_kod` map from that table (`GROUP BY psc,
okres_kod`, take the most frequent `okres_kod` per `psc`). Only
5-digit numeric PSČ are looked up; `ds_dsdd` rows with a foreign
postcode (e.g. `30-504`, confirmed present in the real feed for
addresses outside Slovakia) are excluded from the district aggregate
and counted separately as "unmatched" for the ingest log / `data_sources`
record.

## Ingest pipeline

New `scripts/ingest/fs/`, mirroring `scripts/ingest/nace/`:

- **`client.ts`** — downloads both zips as `ArrayBuffer` (new
  `fetchBuffer` in `scripts/ingest/http.ts`, alongside existing
  `fetchText`/`fetchJson`), extracts the single XML entry from each
  with `adm-zip`, returns the XML string.
- **`sync.ts`**:
  - `parseDphs(xml): DphRow[]` and `parseDsdd(xml): DsddRow[]` via
    `fast-xml-parser`.
  - `parseSkDate` reused from `../nace/sync` (`dd.mm.yyyy`, same format
    FS uses for `DATUM_REG`/`PLAT_DPH_OD`).
  - `buildPscToOkres(prisma): Promise<Map<string, string>>` — the
    majority-vote query above.
  - `syncDph(prisma, rows)` — full replace `fs_platca_dph` (delete +
    chunked `createMany`, same pattern as `syncNace`). Sanity floor:
    refuse if parsed rows < 250,000 (real feed is ~316k).
  - `syncDlznici(prisma, rows, pscMap)` — aggregates `rows` by
    `pscMap.get(psc)`, full-replaces `fs_danovy_dlznik_okres`. Sanity
    floor: refuse if parsed rows < 80,000 (real feed is ~97k) or if
    okres match rate drops below 90% (real feed matches 97%).
- **`run.ts`** — downloads both feeds, runs both syncs, upserts two
  `data_sources` rows: `"Finančná správa SR - platitelia DPH"` and
  `"Finančná správa SR - daňoví dlžníci"`.
- **`.github/workflows/ingest-fs.yml`** — copy of `ingest-nace.yml`,
  daily cron.

## Migration

Applied manually via `DIRECT_URL` + `prisma migrate resolve --applied`,
per project convention (Supabase pooler doesn't handle DDL reliably).

## UI integration (extends `/`, no new page)

1. **Map metric** — `/api/density` LEFT JOINs `fs_platca_dph` (deduped
   by `ico`, same dedup key as `/api/firms-in-district`) into the
   existing `GROUP BY okres_kod` query, returning `pocetPlatcovDph`
   alongside `pocetPrevadzok`. `DensityMap`'s `Metric` type gains a
   third value `'dphShare'` = `pocetPlatcovDph / pocetPrevadzok`. A
   third toggle button appears next to "Absolútny počet"/"Na 1000
   obyvateľov" in `app/page.tsx`. Works with the existing nace/kraj/forma
   filters unchanged — it's one more aggregate column on the same
   query, not a separate data source to filter.
2. **Firm list badge** — `/api/firms-in-district` LEFT JOINs
   `fs_platca_dph` on `ico`, adds `platcaDph: boolean` to the row.
   `FirmListPanel` renders a small "platiteľ DPH" tag next to the firm
   name when true.
3. **Debtor banner** — new `/api/fs-dlznici-okres` returns
   `fs_danovy_dlznik_okres` rows (optionally scoped to the selected
   district). A banner under the map shows debtor share
   nationally/per-selected-okres, using the existing
   `DataSourceBanner` source+date pattern PLUS a visually prominent
   caveat block (per `CLAUDE.md`): "agregát podľa PSČ, nie zoznam
   konkrétnych firiem — dlžníci sú fyzické aj právnické osoby, mená sa
   neukladajú z dôvodu ochrany súkromia."
4. Both new `data_sources` rows are added to the `sources.filter`
   allow-list in `app/page.tsx` so the existing `DataSourceBanner` picks
   them up (source name + last-synced date, never hardcoded).

## Testing

- `scripts/ingest/fs/sync.test.ts` — unit tests for `parseDphs`,
  `parseDsdd`, `buildPscToOkres` majority-vote logic, and the
  foreign-postcode exclusion, following `scripts/ingest/nace/sync.test.ts`'s
  shape.
- `npx vitest run` must stay at 100% pass.
- `npx tsc --noEmit` must be clean before claiming done.
- Manual: run `scripts/ingest/fs/run.ts` against real feeds once,
  confirm row counts and okres-match rate match the numbers verified
  above before wiring the UI.
