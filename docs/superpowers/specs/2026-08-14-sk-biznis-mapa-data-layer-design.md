# SK Biznis Mapa — Data Layer Design (Sub-project 1)

Status: approved by user, 2026-08-14
Scope: DB schema + ingestion pipeline for RÚZ and RPO. Frontend (Module A, Module B) are separate sub-projects with their own specs, built after this layer is working and tested on a pilot sample.

## Why this is a separate sub-project

The full "SK Biznis Mapa" request bundles several independent pieces: data ingestion, DB schema, a financial-benchmark UI (Module A), and a density-map UI (Module B). Per the project's own stated build order, the data layer must exist and be verified against real API responses before any frontend work starts. This spec covers only that layer.

## Confirmed external APIs

All endpoints below were hit live on 2026-08-14 — nothing here is assumed from documentation alone.

### RÚZ Open API — `https://registeruz.sk/cruz-public/api` (no auth, public)

| Endpoint | Purpose | Confirmed fields |
|---|---|---|
| `GET /uctovne-jednotky?zmenene-od=YYYY-MM-DD&max-zaznamov=N&pokracovat-za-id=ID` | List changed/new entity IDs, cursor-paginated | `{"id":[...], "existujeDalsieId": bool}` |
| `GET /uctovna-jednotka?id=ID` | Entity detail | `ico, dic, nazovUJ, mesto, ulica, psc, kraj, okres, skNace (5-digit), pravnaForma, velkostOrganizacie, datumZalozenia, datumZrusenia, sidlo, zdrojDat, konsolidovana, stav (present as "NEVEREJNÁ" when private, "ZMAZANÉ" when deleted), idUctovnychZavierok[]` |
| `GET /uctovne-zavierky?zmenene-od=...` | List changed statement IDs | same id-list shape |
| `GET /uctovna-zavierka?id=ID` | Statement detail | `idUJ, obdobieOd, obdobieDo, typ, datumPodania, datumSchvalenia, datumZostavenia, idUctovnychVykazov[]` (array of 2 report ids) |
| `GET /uctovny-vykaz?id=ID` | Report detail | Either PDF-only (`prilohy[]`, no numbers) or structured: `obsah.tabulky[]` — each table is `{nazov, data: [string,...]}`, a **flat positional array of numbers as strings, no field names**. Also carries `idSablony` (template id) and `pristupnostDat` ("Verejné" required to use). |
| `GET /sablona?id=ID` | Report template | Decodes `tabulky` positions: `tabulky[].hlavicka[]` (column headers with `riadok`/`stlpec` position) and `tabulky[].riadky[]` (row labels with `cisloRiadku`, `oznacenie` e.g. "A.I."). `pocetDatovychStlpcov` tells how many data columns per row. This is the only way to know which array position is "Tržby", which is "Výsledok hospodárenia", etc. — templates differ by entity size/type (e.g. `idSablony=687` is "Úč MUJ", the micro-entity template). |
| `GET /kraje`, `/okresy`, `/sidla`, `/sk-nace`, `/pravne-formy`, `/velkosti-organizacie` | Classifiers, no pagination | `{"klasifikacie":[{"kod":"...", "nazov":{"sk":"...","en":"..."}}]}` (regions/districts use `"lokacie"` key instead) |

Key implications:
- Numbers are meaningless without the matching template — ingestion must resolve `idSablony` → cached template before any line item can be decoded.
- Many entities return only `{"id":..., "stav":"NEVEREJNÁ", "datumPoslednejUpravy":...}` — no usable data. These must be recorded (so we don't refetch) but skipped for financial content.
- `skNace` here is **5-digit**.

### RPO (Register právnických osôb) — `https://api.statistics.sk/rpo/v1` (no auth, public)

Note: the spec originally pointed at "Slovensko.Digital Ekosystém" (`ekosystem.slovensko.digital`) for RPO access. That redirects to `datahub.ekosystem.slovensko.digital`, whose API docs are not published/discoverable, and its `/api/rpo/detail` route 404s. The actual working public RPO API is run by Štatistický úrad SR directly at `api.statistics.sk/rpo/v1`. Use this instead.

| Endpoint | Purpose | Confirmed fields |
|---|---|---|
| `GET /search?identifier=ICO` | Search by IČO | `results[]`, each with `id` (internal RPO id, needed for detail calls), `identifiers[]` (IČO history), `fullNames[]` (name history), `addresses[]` (history, each with `municipality.code`), `establishment`, `sourceRegister` |
| `GET /search?fullName=TEXT` | Search by name (substring) | same shape |
| `GET /search?addressMunicipality=MUNICIPALITY_CODE` | **Bulk list by municipality** — this is the endpoint Module B ingestion uses to enumerate all entities in a district, not name search | same shape, multiple results |
| `GET /entity/{internalId}` | Full entity detail (fetch after search) | Adds `legalForms[]`, `activities[]` (free-text trade-license descriptions, not NACE), `statutoryBodies[]`, `stakeholders[]`, `otherLegalFacts`, `authorizations`, `equities`, `deposits`, and critically **`statisticalCodes.mainActivity`**: `{value, code, codelistCode}` — a **4-digit** NACE-family code (e.g. `"5611"` for "Reštauračné činnosti"). This is the field Module B uses for category filtering. |

Key implications:
- No documented rate limit — ingestion must self-throttle conservatively regardless.
- Municipality code format matches RÚZ's `sidlo`/`okres`/`kraj` codes (e.g. `SK0315510335`), so district/region derivation from municipality is a lookup, not a separate fetch.
- **NACE granularity mismatch**: RÚZ gives 5-digit, RPO gives 4-digit. Resolved (user decision): store RÚZ's native 5-digit code for display, plus a generated 4-digit column for joining against RPO. Module B operates at 4-digit granularity; Module A can show extra precision when a user drills into one NACE code.
- `termination` field present/absent on statutory records indicates active vs. dissolved — no separate "is active" flag needed.

### Not yet verified — explicit open items, deferred to the Module B sub-project

Per the project's instruction not to assume API structure, these are **not designed against real responses yet** and must be verified before Module B ingestion is built:

1. **ŠÚ SR population by obec/okres** (DATAcube or other access method) — exact endpoint/format unconfirmed.
2. **GeoJSON district/municipality boundaries** — no source has been tested (ŠÚ SR geoportál / OSM / Eurostat NUTS-LAU all mentioned as candidates in the original brief, none verified).

Do not build `municipalities.population` ingestion or the map rendering layer until these are confirmed the same way RÚZ/RPO were confirmed above.

## Database schema (Postgres via Supabase)

```
data_sources
  id              serial pk
  source_name     text        -- e.g. "Register účtovných závierok (RÚZ)"
  source_url      text
  last_synced_at  timestamptz
  records_count   integer
  notes           text        -- free text for known limits, e.g. živnostníci coverage caveat

regions (kraje)
  kod             text pk     -- e.g. "SK010"
  nazov_sk        text
  nazov_en        text

districts (okresy)
  kod             text pk     -- e.g. "SK0326"
  nazov_sk        text
  nazov_en        text
  region_kod      text fk -> regions.kod

municipalities (sidla)
  kod             text pk     -- e.g. "SK0326511218"
  nazov           text
  district_kod    text fk -> districts.kod
  population      integer     -- null until ŠÚ SR source confirmed
  population_year integer

nace_codes
  kod5            text pk     -- 5-digit, RÚZ native
  kod4            text        -- generated: left(kod5, 4)
  nazov_sk        text
  nazov_en        text

report_templates (sablony)
  id_sablony      integer pk
  nazov           text
  nariadenie_mf   text
  platne_od       date
  raw             jsonb       -- full sablona response (hlavicka + riadky per tabulka)
  fetched_at      timestamptz

firms (RÚZ uctovne jednotky)
  id              bigint pk   -- RÚZ internal id
  ico             text
  dic             text
  nazov           text
  ulica           text
  mesto           text
  psc             text
  kraj_kod        text fk -> regions.kod
  okres_kod       text fk -> districts.kod
  nace_kod5       text fk -> nace_codes.kod5
  pravna_forma    text
  velkost_organizacie text
  datum_zalozenia date
  datum_zrusenia  date
  stav            text        -- 'VEREJNÁ' | 'NEVEREJNÁ' | 'ZMAZANÉ'
  zdroj_dat       text
  last_synced_at  timestamptz

financial_statements (uctovne zavierky)
  id              bigint pk   -- RÚZ zavierka id
  firm_id         bigint fk -> firms.id
  obdobie_od      date
  obdobie_do      date
  typ             text
  datum_podania   date
  datum_schvalenia date
  id_sablony      integer fk -> report_templates.id_sablony
  raw_tabulky     jsonb       -- full positional data, kept as fallback even after decoding
  pristupnost_dat text
  last_synced_at  timestamptz

financial_facts (decoded line items, one row per statement)
  statement_id    bigint pk fk -> financial_statements.id
  trzby           numeric     -- revenue
  naklady         numeric
  vysledok_hospodarenia numeric  -- profit/loss
  marza           numeric     -- generated: vysledok_hospodarenia / nullif(trzby,0)
  decoded_at      timestamptz
  decode_confidence text      -- 'matched' | 'template_unmapped' — surfaces gaps instead of hiding them

firm_aggregates_nace_region_year (Module A precomputed)
  id              serial pk
  nace_kod5       text fk -> nace_codes.kod5   -- nullable = aggregated at 4-digit level
  region_or_district_kod text                   -- kraj or okres code, per granularity column
  granularity     text        -- 'kraj' | 'okres'
  rok             integer
  firm_count      integer     -- always populated, even below threshold
  median_trzby    numeric     -- null if firm_count < 5
  avg_trzby       numeric     -- null if firm_count < 5
  median_marza    numeric     -- null if firm_count < 5
  median_trzby_na_zamestnanca numeric  -- null if firm_count < 5
  yoy_trend_pct   numeric     -- null if firm_count < 5 in either year
  computed_at     timestamptz

business_entities (RPO)
  id              bigint pk   -- RPO internal id
  ico             text
  nazov           text
  ulica           text
  mesto           text
  psc             text
  municipality_kod text fk -> municipalities.kod
  okres_kod       text fk -> districts.kod    -- derived from municipality at ingest time
  kraj_kod        text fk -> regions.kod       -- derived from municipality at ingest time
  nace_kod4       text
  pravna_forma_kod text
  datum_vzniku    date
  datum_zaniku    date        -- null = active
  zdroj_dat       text
  last_synced_at  timestamptz

business_density_agg (Module B precomputed)
  id              serial pk
  area_kod        text        -- municipality or district code, per granularity column
  granularity     text        -- 'obec' | 'okres'
  nace_kod4       text        -- nullable = all categories
  snapshot_date   date
  pocet_prevadzok integer
  pocet_na_1000_obyvatelov numeric  -- null until population data confirmed
  computed_at     timestamptz
```

Every user-facing table above traces back to a `data_sources` row via `source_name`/`zdroj_dat` matching, so the frontend can always render "zdroj: X, aktualizované: Y" without hardcoding either value.

## Ingestion pipeline

Location: `/scripts/ingest/`, run by GitHub Actions cron, connecting directly to Supabase Postgres (not through the Next.js app).

**`ingest-ruz.ts`** (daily)
1. Read cursor (`last_synced_at` from `data_sources` row for RÚZ, or a dedicated cursor if `zmenene-od` needs finer granularity than a timestamp allows).
2. Page through `/uctovne-jednotky?zmenene-od=cursor`, upsert into `firms`. For `stav = NEVEREJNÁ` or `ZMAZANÉ`, store the row with nulls elsewhere and stop — no further fetches for that id.
3. Page through `/uctovne-zavierky?zmenene-od=cursor` for changed statements, upsert `financial_statements`.
4. For each new/changed statement, fetch both linked `uctovny-vykaz` ids. The one with `obsah.tabulky` is structured — store its `raw_tabulky` and `idSablony`. If `idSablony` not yet in `report_templates`, fetch `/sablona?id=` once and cache.
5. Decode `financial_facts` from `raw_tabulky` using the template's row labels (match on row text containing "Tržby z predaja" for revenue, "Výsledok hospodárenia" for profit — exact label patterns to be finalized against real samples during the pilot run below). Set `decode_confidence = 'template_unmapped'` rather than guessing when a template's labels don't match known patterns, so gaps are visible in the data rather than silently wrong.
6. Recompute `firm_aggregates_nace_region_year` for touched (nace, region, year) combinations.
7. Update `data_sources` row: `last_synced_at`, `records_count`.

**`ingest-rpo.ts`** (daily or weekly)
1. Iterate `municipalities` table (seeded from RÚZ's `/sidla`).
2. For each municipality, `GET /search?addressMunicipality=code`, upsert into `business_entities`. Derive `okres_kod`/`kraj_kod` from the municipality lookup, not a separate API call.
3. Self-throttle (fixed delay + exponential backoff on errors) since no rate limit is documented.
4. Recompute `business_density_agg` for touched areas.
5. Update `data_sources` row.

**`ingest-population.ts`** (monthly, manual-trigger acceptable) — blocked on confirming the ŠÚ SR access method; not built in this sub-project.

**Error handling**: retry with backoff on 5xx/timeout; a single record's persistent failure is logged and skipped, not fatal to the run. The GitHub Actions job only fails loudly on a total run failure (e.g., can't reach the API at all, can't connect to DB).

## Anonymization rule

Enforced at aggregate-computation time, not read time: `firm_count` is always stored; `median_*`/`avg_*`/`yoy_trend_pct` columns are left `NULL` whenever `firm_count < 5`. The API/frontend layer treats `NULL` on those columns as "nedostatok dát na zobrazenie" and re-checks the count as defense in depth rather than trusting the precomputed table blindly.

## Testing plan (before national-scale ingestion)

1. Run `ingest-ruz.ts` against one district × a handful of NACE codes (~100 firms), per the project's own staged plan.
2. Manually cross-check 5–10 decoded `financial_facts` rows against the source filing (fetch the same `uctovny-vykaz`, compare decoded revenue/profit to what a human reading the template would compute).
3. Verify the anonymization threshold: construct a synthetic (nace, region, year) group with 3 firms and confirm the aggregate row has `firm_count = 3` and null value columns.
4. Verify `zmenene-od` cursor resumption: interrupt a run mid-page, restart, confirm no duplicate or skipped records.
5. Run `ingest-rpo.ts` against the same pilot district, confirm `nace_kod4` values are populated and district/region derivation from municipality is correct.

Only after this pilot passes does ingestion scale to the full national dataset.

## Standing rule for future data sections

Recorded here per the project's own requirement: every new data-backed section added to the app in the future must follow the same pattern established here — a visible source + last-updated date (via `data_sources`, not hardcoded) and, if the data has known coverage limits (like RÚZ's under-representation of sole traders), a visually prominent — not small-print — explanation of that limit next to the data itself. This rule belongs in the project's `CLAUDE.md` once the repo has one.
