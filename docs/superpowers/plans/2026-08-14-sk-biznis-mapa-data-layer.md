# SK Biznis Mapa - Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Postgres schema and RÚZ/RPO ingestion pipeline that Module A (finance benchmark) and Module B (density map) will later read from.

**Architecture:** Next.js (App Router, TS) app with Prisma as the DB layer. Standalone ingestion scripts under `scripts/ingest/`, run via `tsx` (no build step needed), invoked by GitHub Actions cron, writing directly to Supabase Postgres. No frontend routes are built in this plan.

**Tech Stack:** Next.js 15, TypeScript, Prisma, Supabase (Postgres), vitest, tsx, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-08-14-sk-biznis-mapa-data-layer-design.md](../specs/2026-08-14-sk-biznis-mapa-data-layer-design.md)

## Global Constraints

- Every ingested table's freshness/source must be readable from `data_sources` - never hardcode a source name/date/URL in code that isn't also written there.
- Anonymization: `firm_aggregates_nace_region_year` rows must have `firm_count` always populated, and `median_*`/`avg_*`/`yoy_trend_pct` set to `NULL` whenever `firm_count < 5`. This is enforced in the recompute step, not at read time.
- RÚZ entities with `stav` of `"NEVEREJNÁ"` or `"ZMAZANÉ"` are stored (so they aren't re-fetched) but never produce financial data.
- All external API calls go through the shared retry/backoff wrapper (`scripts/ingest/http.ts`) - no raw `fetch` calls in sync modules.
- NACE codes: RÚZ's native code is 5-digit (`nace_kod5`), the first 4 characters are stored separately (`nace_kod4`) for joining against RPO, which only exposes 4-digit codes.
- Region/district/municipality hierarchy comes from each classifier's own `nadradenaLokacia` field (confirmed real field name from RÚZ's `/okresy` and `/sidla` endpoints) - never derived by string-prefix guessing.

---

## File Structure

```
prisma/
  schema.prisma
lib/
  prisma.ts                    # Prisma client singleton
scripts/ingest/
  http.ts                      # shared fetchJson with retry/backoff
  data-sources.ts              # upsertDataSource helper
  ruz/
    types.ts                   # RÚZ API response TS types
    client.ts                  # RÚZ endpoint wrappers (uses http.ts)
    sync-classifiers.ts        # regions, districts, municipalities, nace_codes
    sync-entities.ts           # firms
    sync-statements.ts         # financial_statements + report_templates
    decode-tabulky.ts          # positional-array -> financial_facts decoder
    recompute-aggregates.ts    # firm_aggregates_nace_region_year
    run.ts                     # orchestrator
  rpo/
    types.ts                   # RPO API response TS types
    client.ts                  # RPO endpoint wrappers (uses http.ts)
    sync-entities.ts           # business_entities
    recompute-density.ts       # business_density_agg
    run.ts                     # orchestrator
.github/workflows/
  ingest-ruz.yml
  ingest-rpo.yml
```

---

## Task 1: Project scaffold

**Files:**

- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`
- Create: `app/layout.tsx`, `app/page.tsx` (placeholder, no design work - this plan is data-layer only)
- Create: `vitest.config.ts`

**Interfaces:** none (first task)

- [ ] **Step 1: Scaffold Next.js app**

```bash
npx create-next-app@latest . --typescript --app --no-tailwind --no-eslint --src-dir=false --import-alias "@/*" --use-npm
```

When prompted about the non-empty directory (it contains `docs/`), confirm to proceed.

- [ ] **Step 2: Install ingestion + test tooling**

```bash
npm install prisma @prisma/client
npm install -D vitest tsx @types/node
```

- [ ] **Step 3: Add npm scripts**

Edit `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"ingest:ruz": "tsx scripts/ingest/ruz/run.ts",
"ingest:rpo": "tsx scripts/ingest/rpo/run.ts",
"prisma:migrate": "prisma migrate dev",
"prisma:generate": "prisma generate"
```

- [ ] **Step 4: Add vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 5: Add `.env.example`**

```
# Supabase Postgres connection string (pooled, for the Next.js app)
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:6543/postgres?pgbouncer=true"
# Direct connection (for Prisma migrations)
DIRECT_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: builds successfully with the default Next.js placeholder page.

- [ ] **Step 7: Write `CLAUDE.md` with the standing data-transparency rule**

```markdown
# CLAUDE.md

## Standing rule: data transparency

Every data-backed section added to this app must:

1. Show its source and last-updated date, read from the `data_sources` table - never hardcoded in a component.
2. If the underlying data has known coverage limits (e.g. RÚZ under-representing sole traders who don't file structured accounts), show that limit as a visually prominent banner next to the data itself, not small print.

See `docs/superpowers/specs/2026-08-14-sk-biznis-mapa-data-layer-design.md` for the data layer this app is built on.
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with vitest and prisma tooling"
```

---

## Task 2: Prisma schema + Supabase migration

**Files:**

- Create: `prisma/schema.prisma`
- Modify: `.env.example` (already has placeholders from Task 1)
- Create (generated by Prisma): `prisma/migrations/`

**Interfaces:**

- Produces: `PrismaClient` model names used by every later task - `DataSource`, `Region`, `District`, `Municipality`, `NaceCode`, `ReportTemplate`, `Firm`, `FinancialStatement`, `FinancialFacts`, `FirmAggregate`, `BusinessEntity`, `BusinessDensityAgg`.

- [ ] **Step 1: Write the full schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model DataSource {
  id            Int      @id @default(autoincrement())
  sourceName    String   @map("source_name")
  sourceUrl     String   @map("source_url")
  lastSyncedAt  DateTime? @map("last_synced_at")
  recordsCount  Int?     @map("records_count")
  notes         String?

  @@unique([sourceName])
  @@map("data_sources")
}

model Region {
  kod       String      @id
  nazovSk   String      @map("nazov_sk")
  nazovEn   String      @map("nazov_en")
  districts District[]

  @@map("regions")
}

model District {
  kod           String         @id
  nazovSk       String         @map("nazov_sk")
  nazovEn       String         @map("nazov_en")
  regionKod     String         @map("region_kod")
  region        Region         @relation(fields: [regionKod], references: [kod])
  municipalities Municipality[]

  @@map("districts")
}

model Municipality {
  kod             String   @id
  nazov           String
  districtKod     String   @map("district_kod")
  district        District @relation(fields: [districtKod], references: [kod])
  population      Int?
  populationYear  Int?     @map("population_year")

  @@map("municipalities")
}

model NaceCode {
  kod5    String @id
  kod4    String
  nazovSk String @map("nazov_sk")
  nazovEn String @map("nazov_en")

  @@map("nace_codes")
}

model ReportTemplate {
  idSablony    Int      @id @map("id_sablony")
  nazov        String
  nariadenieMf String?  @map("nariadenie_mf")
  platneOd     DateTime? @map("platne_od")
  raw          Json
  fetchedAt    DateTime @default(now()) @map("fetched_at")

  statements FinancialStatement[]

  @@map("report_templates")
}

model Firm {
  id                  BigInt    @id
  ico                 String?
  dic                 String?
  nazov                String?
  ulica               String?
  mesto                String?
  psc                  String?
  krajKod              String?   @map("kraj_kod")
  okresKod             String?   @map("okres_kod")
  naceKod5             String?   @map("nace_kod5")
  pravnaForma          String?   @map("pravna_forma")
  velkostOrganizacie   String?   @map("velkost_organizacie")
  datumZalozenia       DateTime? @map("datum_zalozenia")
  datumZrusenia        DateTime? @map("datum_zrusenia")
  stav                 String?
  zdrojDat             String?   @map("zdroj_dat")
  lastSyncedAt         DateTime  @default(now()) @map("last_synced_at")

  statements FinancialStatement[]

  @@map("firms")
}

model FinancialStatement {
  id               BigInt    @id
  firmId           BigInt    @map("firm_id")
  firm             Firm      @relation(fields: [firmId], references: [id])
  obdobieOd        DateTime? @map("obdobie_od")
  obdobieDo        DateTime? @map("obdobie_do")
  typ              String?
  datumPodania     DateTime? @map("datum_podania")
  datumSchvalenia  DateTime? @map("datum_schvalenia")
  idSablony        Int?      @map("id_sablony")
  reportTemplate   ReportTemplate? @relation(fields: [idSablony], references: [idSablony])
  rawTabulky       Json?     @map("raw_tabulky")
  pristupnostDat   String?   @map("pristupnost_dat")
  lastSyncedAt     DateTime  @default(now()) @map("last_synced_at")

  facts FinancialFacts?

  @@map("financial_statements")
}

model FinancialFacts {
  statementId           BigInt   @id @map("statement_id")
  statement              FinancialStatement @relation(fields: [statementId], references: [id])
  trzby                  Float?
  naklady                Float?
  vysledokHospodarenia   Float?   @map("vysledok_hospodarenia")
  decodedAt              DateTime @default(now()) @map("decoded_at")
  decodeConfidence       String   @map("decode_confidence")

  @@map("financial_facts")
}

model FirmAggregate {
  id                          Int      @id @default(autoincrement())
  naceKod5                    String?  @map("nace_kod5")
  regionOrDistrictKod         String   @map("region_or_district_kod")
  granularity                 String
  rok                         Int
  firmCount                   Int      @map("firm_count")
  medianTrzby                 Float?   @map("median_trzby")
  avgTrzby                    Float?   @map("avg_trzby")
  medianMarza                 Float?   @map("median_marza")
  medianTrzbyNaZamestnanca    Float?   @map("median_trzby_na_zamestnanca")
  yoyTrendPct                 Float?   @map("yoy_trend_pct")
  computedAt                  DateTime @default(now()) @map("computed_at")

  @@unique([naceKod5, regionOrDistrictKod, granularity, rok])
  @@map("firm_aggregates_nace_region_year")
}

model BusinessEntity {
  id              BigInt    @id
  ico             String?
  nazov           String?
  ulica           String?
  mesto           String?
  psc             String?
  municipalityKod String?   @map("municipality_kod")
  okresKod        String?   @map("okres_kod")
  krajKod         String?   @map("kraj_kod")
  naceKod4        String?   @map("nace_kod4")
  pravnaFormaKod  String?   @map("pravna_forma_kod")
  datumVzniku     DateTime? @map("datum_vzniku")
  datumZaniku     DateTime? @map("datum_zaniku")
  zdrojDat        String?   @map("zdroj_dat")
  lastSyncedAt    DateTime  @default(now()) @map("last_synced_at")

  @@map("business_entities")
}

model BusinessDensityAgg {
  id                        Int      @id @default(autoincrement())
  areaKod                   String   @map("area_kod")
  granularity                String
  naceKod4                   String?  @map("nace_kod4")
  snapshotDate                DateTime @map("snapshot_date")
  pocetPrevadzok              Int      @map("pocet_prevadzok")
  pocetNa1000Obyvatelov       Float?   @map("pocet_na_1000_obyvatelov")
  computedAt                  DateTime @default(now()) @map("computed_at")

  @@unique([areaKod, granularity, naceKod4, snapshotDate])
  @@map("business_density_agg")
}
```

- [ ] **Step 2: Set up the Supabase project (manual, one-time)**

Create a free-tier project at supabase.com, copy the pooled connection string (port 6543) into `.env.local` as `DATABASE_URL` and the direct connection string (port 5432) as `DIRECT_URL`. `.env.local` is already gitignored by the Next.js scaffold - do not commit it.

- [ ] **Step 3: Run the migration**

Run: `npx prisma migrate dev --name init`
Expected: creates `prisma/migrations/<timestamp>_init/migration.sql` and applies it to the Supabase DB without errors.

- [ ] **Step 4: Generate the client and verify**

Run: `npx prisma generate`
Then verify with a throwaway script:

```bash
node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.\$queryRaw\`SELECT 1\`.then(r => { console.log('OK', r); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
```

Expected: prints `OK [ { '?column?': 1 } ]`.

- [ ] **Step 5: Commit**

```bash
git add prisma package.json package-lock.json
git commit -m "feat: add Prisma schema and initial migration for data layer"
```

---

## Task 3: Shared HTTP client + RÚZ classifier sync

**Files:**

- Create: `lib/prisma.ts`
- Create: `scripts/ingest/http.ts`
- Create: `scripts/ingest/data-sources.ts`
- Create: `scripts/ingest/ruz/types.ts`
- Create: `scripts/ingest/ruz/client.ts`
- Create: `scripts/ingest/ruz/sync-classifiers.ts`
- Test: `scripts/ingest/http.test.ts`
- Test: `scripts/ingest/ruz/sync-classifiers.test.ts`

**Interfaces:**

- Produces: `fetchJson<T>(url: string, opts?: { retries?: number }): Promise<T>` from `http.ts`, used by every later client module.
- Produces: `upsertDataSource(prisma: PrismaClient, args: { sourceName: string; sourceUrl: string; lastSyncedAt: Date; recordsCount: number }): Promise<void>` from `data-sources.ts`.
- Produces: `type Klasifikacia = { kod: string; nazov: { sk: string; en: string }; nadradenaLokacia?: string }` from `ruz/types.ts`.
- Produces: `RuzClient.getKraje/getOkresy/getSidla/getSkNace(): Promise<Klasifikacia[]>` from `ruz/client.ts`.
- Produces: `syncClassifiers(prisma: PrismaClient, client: RuzClient): Promise<{ regions: number; districts: number; municipalities: number; naceCodes: number }>` from `sync-classifiers.ts`.

- [ ] **Step 1: Write the failing test for the HTTP retry wrapper**

```typescript
// scripts/ingest/http.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchJson } from "./http";

describe("fetchJson", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hello: "world" }),
    }) as unknown as typeof fetch;

    const result = await fetchJson<{ hello: string }>("https://example.test/x");
    expect(result).toEqual({ hello: "world" });
  });

  it("retries on failure and succeeds on the second attempt", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: 1 }),
      });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await fetchJson<{ ok: number }>("https://example.test/x", {
      retries: 2,
    });
    expect(result).toEqual({ ok: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    await expect(
      fetchJson("https://example.test/x", { retries: 2 }),
    ).rejects.toThrow(/failed after 2 attempts/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/http.test.ts`
Expected: FAIL - `./http` module not found.

- [ ] **Step 3: Implement `http.ts`**

```typescript
// scripts/ingest/http.ts
export async function fetchJson<T>(
  url: string,
  opts: { retries?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", ...opts.headers },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
  }

  throw new Error(
    `fetchJson failed after ${retries} attempts for ${url}: ${lastError}`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ingest/http.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `lib/prisma.ts`**

```typescript
// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 6: Write `data-sources.ts`**

```typescript
// scripts/ingest/data-sources.ts
import type { PrismaClient } from "@prisma/client";

export async function upsertDataSource(
  prisma: PrismaClient,
  args: {
    sourceName: string;
    sourceUrl: string;
    lastSyncedAt: Date;
    recordsCount: number;
  },
): Promise<void> {
  await prisma.dataSource.upsert({
    where: { sourceName: args.sourceName },
    create: {
      sourceName: args.sourceName,
      sourceUrl: args.sourceUrl,
      lastSyncedAt: args.lastSyncedAt,
      recordsCount: args.recordsCount,
    },
    update: {
      sourceUrl: args.sourceUrl,
      lastSyncedAt: args.lastSyncedAt,
      recordsCount: args.recordsCount,
    },
  });
}
```

- [ ] **Step 7: Write `ruz/types.ts`**

```typescript
// scripts/ingest/ruz/types.ts
export interface Klasifikacia {
  kod: string;
  nazov: { sk: string; en: string };
  nadradenaLokacia?: string;
}
```

- [ ] **Step 8: Write `ruz/client.ts`**

```typescript
// scripts/ingest/ruz/client.ts
import { fetchJson } from "../http";
import type { Klasifikacia } from "./types";

const BASE = "https://www.registeruz.sk/cruz-public/api";

export class RuzClient {
  async getKraje(): Promise<Klasifikacia[]> {
    const res = await fetchJson<{ lokacie: Klasifikacia[] }>(`${BASE}/kraje`);
    return res.lokacie;
  }

  async getOkresy(): Promise<Klasifikacia[]> {
    const res = await fetchJson<{ lokacie: Klasifikacia[] }>(`${BASE}/okresy`);
    return res.lokacie;
  }

  async getSidla(): Promise<Klasifikacia[]> {
    const res = await fetchJson<{ lokacie: Klasifikacia[] }>(`${BASE}/sidla`);
    return res.lokacie;
  }

  async getSkNace(): Promise<Klasifikacia[]> {
    const res = await fetchJson<{ klasifikacie: Klasifikacia[] }>(
      `${BASE}/sk-nace`,
    );
    return res.klasifikacie;
  }
}
```

- [ ] **Step 9: Write the failing test for classifier sync**

```typescript
// scripts/ingest/ruz/sync-classifiers.test.ts
import { describe, it, expect, vi } from "vitest";
import { syncClassifiers } from "./sync-classifiers";
import type { RuzClient } from "./client";

function fakePrisma() {
  const calls: Record<string, unknown[]> = {
    region: [],
    district: [],
    municipality: [],
    naceCode: [],
  };
  return {
    region: { upsert: vi.fn((args) => calls.region.push(args)) },
    district: { upsert: vi.fn((args) => calls.district.push(args)) },
    municipality: { upsert: vi.fn((args) => calls.municipality.push(args)) },
    naceCode: { upsert: vi.fn((args) => calls.naceCode.push(args)) },
    _calls: calls,
  };
}

describe("syncClassifiers", () => {
  it("upserts regions, districts, municipalities, and derives 4-digit NACE", async () => {
    const client: Partial<RuzClient> = {
      getKraje: async () => [
        {
          kod: "SK031",
          nazov: { sk: "Žilinský kraj", en: "Region of Žilina" },
        },
      ],
      getOkresy: async () => [
        {
          kod: "SK0315",
          nazov: { sk: "Liptovský Mikuláš", en: "Liptovský Mikuláš" },
          nadradenaLokacia: "SK031",
        },
      ],
      getSidla: async () => [
        {
          kod: "SK0315510335",
          nazov: { sk: "Bobrovník", en: "Bobrovník" },
          nadradenaLokacia: "SK0315",
        },
      ],
      getSkNace: async () => [
        { kod: "56101", nazov: { sk: "Reštaurácie", en: "Restaurants" } },
      ],
    };
    const prisma = fakePrisma();

    const result = await syncClassifiers(prisma as never, client as RuzClient);

    expect(result).toEqual({
      regions: 1,
      districts: 1,
      municipalities: 1,
      naceCodes: 1,
    });
    expect(prisma.region.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.district.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ kod: "SK0315", regionKod: "SK031" }),
      }),
    );
    expect(prisma.naceCode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ kod5: "56101", kod4: "5610" }),
      }),
    );
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/ruz/sync-classifiers.test.ts`
Expected: FAIL - `./sync-classifiers` module not found.

- [ ] **Step 11: Implement `sync-classifiers.ts`**

```typescript
// scripts/ingest/ruz/sync-classifiers.ts
import type { PrismaClient } from "@prisma/client";
import type { RuzClient } from "./client";

export async function syncClassifiers(prisma: PrismaClient, client: RuzClient) {
  const [kraje, okresy, sidla, skNace] = await Promise.all([
    client.getKraje(),
    client.getOkresy(),
    client.getSidla(),
    client.getSkNace(),
  ]);

  for (const k of kraje) {
    await prisma.region.upsert({
      where: { kod: k.kod },
      create: { kod: k.kod, nazovSk: k.nazov.sk, nazovEn: k.nazov.en },
      update: { nazovSk: k.nazov.sk, nazovEn: k.nazov.en },
    });
  }

  for (const o of okresy) {
    if (!o.nadradenaLokacia) continue;
    await prisma.district.upsert({
      where: { kod: o.kod },
      create: {
        kod: o.kod,
        nazovSk: o.nazov.sk,
        nazovEn: o.nazov.en,
        regionKod: o.nadradenaLokacia,
      },
      update: {
        nazovSk: o.nazov.sk,
        nazovEn: o.nazov.en,
        regionKod: o.nadradenaLokacia,
      },
    });
  }

  for (const s of sidla) {
    if (!s.nadradenaLokacia) continue;
    await prisma.municipality.upsert({
      where: { kod: s.kod },
      create: {
        kod: s.kod,
        nazov: s.nazov.sk,
        districtKod: s.nadradenaLokacia,
      },
      update: { nazov: s.nazov.sk, districtKod: s.nadradenaLokacia },
    });
  }

  for (const n of skNace) {
    await prisma.naceCode.upsert({
      where: { kod5: n.kod },
      create: {
        kod5: n.kod,
        kod4: n.kod.slice(0, 4),
        nazovSk: n.nazov.sk,
        nazovEn: n.nazov.en,
      },
      update: {
        kod4: n.kod.slice(0, 4),
        nazovSk: n.nazov.sk,
        nazovEn: n.nazov.en,
      },
    });
  }

  return {
    regions: kraje.length,
    districts: okresy.filter((o) => o.nadradenaLokacia).length,
    municipalities: sidla.filter((s) => s.nadradenaLokacia).length,
    naceCodes: skNace.length,
  };
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npx vitest run scripts/ingest/ruz/sync-classifiers.test.ts`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add lib/prisma.ts scripts/ingest/http.ts scripts/ingest/http.test.ts scripts/ingest/data-sources.ts scripts/ingest/ruz/types.ts scripts/ingest/ruz/client.ts scripts/ingest/ruz/sync-classifiers.ts scripts/ingest/ruz/sync-classifiers.test.ts
git commit -m "feat: add HTTP retry client and RÚZ classifier sync"
```

---

## Task 4: RÚZ firms sync

**Files:**

- Modify: `scripts/ingest/ruz/types.ts`
- Modify: `scripts/ingest/ruz/client.ts`
- Create: `scripts/ingest/ruz/sync-entities.ts`
- Test: `scripts/ingest/ruz/sync-entities.test.ts`

**Interfaces:**

- Consumes: `fetchJson` from `../http`; `Klasifikacia` pattern from Task 3.
- Produces: `type FirmDetail` (see below) from `ruz/types.ts`.
- Produces: `RuzClient.listChangedEntityIds(since: string, cursor?: number): Promise<{ ids: number[]; hasMore: boolean }>` and `RuzClient.getEntity(id: number): Promise<FirmDetail>` from `ruz/client.ts`.
- Produces: `syncFirms(prisma: PrismaClient, client: RuzClient, since: Date): Promise<{ processed: number }>` from `sync-entities.ts`, used by Task 8's orchestrator.

- [ ] **Step 1: Add firm types to `ruz/types.ts`**

```typescript
// append to scripts/ingest/ruz/types.ts
export interface FirmDetail {
  id: number;
  stav?: "NEVEREJNÁ" | "ZMAZANÉ";
  ico?: string;
  dic?: string;
  nazovUJ?: string;
  mesto?: string;
  ulica?: string;
  psc?: string;
  kraj?: string;
  okres?: string;
  skNace?: string;
  pravnaForma?: string;
  velkostOrganizacie?: string;
  datumZalozenia?: string;
  datumZrusenia?: string;
  zdrojDat?: string;
  idUctovnychZavierok?: number[];
}

export interface IdListResponse {
  id: number[];
  existujeDalsieId: boolean;
}
```

- [ ] **Step 2: Add methods to `ruz/client.ts`**

```typescript
// append to RuzClient class in scripts/ingest/ruz/client.ts
import type { FirmDetail, IdListResponse } from './types'

// inside class RuzClient:
async listChangedEntityIds(since: string, cursor?: number): Promise<{ ids: number[]; hasMore: boolean }> {
  const params = new URLSearchParams({ 'zmenene-od': since, 'max-zaznamov': '1000' })
  if (cursor !== undefined) params.set('pokracovat-za-id', String(cursor))
  const res = await fetchJson<IdListResponse>(`${BASE}/uctovne-jednotky?${params}`)
  return { ids: res.id, hasMore: res.existujeDalsieId }
}

async getEntity(id: number): Promise<FirmDetail> {
  return fetchJson<FirmDetail>(`${BASE}/uctovna-jednotka?id=${id}`)
}
```

- [ ] **Step 3: Write the failing test**

```typescript
// scripts/ingest/ruz/sync-entities.test.ts
import { describe, it, expect, vi } from "vitest";
import { syncFirms } from "./sync-entities";
import type { RuzClient } from "./client";

function fakePrisma() {
  return { firm: { upsert: vi.fn() } };
}

describe("syncFirms", () => {
  it("paginates ids and upserts full entity detail", async () => {
    const client: Partial<RuzClient> = {
      listChangedEntityIds: vi
        .fn()
        .mockResolvedValueOnce({ ids: [1, 2], hasMore: true })
        .mockResolvedValueOnce({ ids: [3], hasMore: false }),
      getEntity: vi.fn(async (id: number) => {
        if (id === 2) return { id, stav: "NEVEREJNÁ" as const };
        return {
          id,
          ico: `ICO${id}`,
          nazovUJ: `Firm ${id}`,
          mesto: "Bratislava",
          kraj: "SK010",
          okres: "SK0101",
          skNace: "56101",
          pravnaForma: "112",
        };
      }),
    };
    const prisma = fakePrisma();

    const result = await syncFirms(
      prisma as never,
      client as RuzClient,
      new Date("2026-08-01"),
    );

    expect(result.processed).toBe(3);
    expect(client.listChangedEntityIds).toHaveBeenNthCalledWith(
      2,
      "2026-08-01T00:00:00.000Z",
      2,
    );
    expect(prisma.firm.upsert).toHaveBeenCalledTimes(3);
    // the private entity (id 2) is stored with stav only, no name/nace
    const privateCall = prisma.firm.upsert.mock.calls.find(
      (c) => c[0].where.id === 2n,
    );
    expect(privateCall[0].create.stav).toBe("NEVEREJNÁ");
    expect(privateCall[0].create.nazov).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/ruz/sync-entities.test.ts`
Expected: FAIL - `./sync-entities` module not found.

- [ ] **Step 5: Implement `sync-entities.ts`**

```typescript
// scripts/ingest/ruz/sync-entities.ts
import type { PrismaClient } from "@prisma/client";
import type { RuzClient } from "./client";

export async function syncFirms(
  prisma: PrismaClient,
  client: RuzClient,
  since: Date,
) {
  const sinceIso = since.toISOString();
  let cursor: number | undefined;
  let processed = 0;

  while (true) {
    const { ids, hasMore } = await client.listChangedEntityIds(
      sinceIso,
      cursor,
    );

    for (const id of ids) {
      const detail = await client.getEntity(id);

      if (detail.stav === "NEVEREJNÁ" || detail.stav === "ZMAZANÉ") {
        await prisma.firm.upsert({
          where: { id: BigInt(id) },
          create: { id: BigInt(id), stav: detail.stav },
          update: { stav: detail.stav },
        });
      } else {
        await prisma.firm.upsert({
          where: { id: BigInt(id) },
          create: {
            id: BigInt(id),
            ico: detail.ico,
            dic: detail.dic,
            nazov: detail.nazovUJ,
            ulica: detail.ulica,
            mesto: detail.mesto,
            psc: detail.psc,
            krajKod: detail.kraj,
            okresKod: detail.okres,
            naceKod5: detail.skNace,
            pravnaForma: detail.pravnaForma,
            velkostOrganizacie: detail.velkostOrganizacie,
            datumZalozenia: detail.datumZalozenia
              ? new Date(detail.datumZalozenia)
              : undefined,
            datumZrusenia: detail.datumZrusenia
              ? new Date(detail.datumZrusenia)
              : undefined,
            zdrojDat: detail.zdrojDat,
          },
          update: {
            ico: detail.ico,
            dic: detail.dic,
            nazov: detail.nazovUJ,
            ulica: detail.ulica,
            mesto: detail.mesto,
            psc: detail.psc,
            krajKod: detail.kraj,
            okresKod: detail.okres,
            naceKod5: detail.skNace,
            pravnaForma: detail.pravnaForma,
            velkostOrganizacie: detail.velkostOrganizacie,
            datumZalozenia: detail.datumZalozenia
              ? new Date(detail.datumZalozenia)
              : undefined,
            datumZrusenia: detail.datumZrusenia
              ? new Date(detail.datumZrusenia)
              : undefined,
            zdrojDat: detail.zdrojDat,
          },
        });
      }
      processed++;
    }

    if (!hasMore) break;
    cursor = ids[ids.length - 1];
  }

  return { processed };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run scripts/ingest/ruz/sync-entities.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/ingest/ruz/types.ts scripts/ingest/ruz/client.ts scripts/ingest/ruz/sync-entities.ts scripts/ingest/ruz/sync-entities.test.ts
git commit -m "feat: add RÚZ firms sync with cursor pagination"
```

---

## Task 5: financial_facts decoder (verified against a real filing)

**Files:**

- Create: `scripts/ingest/ruz/decode-tabulky.ts`
- Test: `scripts/ingest/ruz/decode-tabulky.test.ts`

**Interfaces:**

- Produces: `type VykazTable`, `type TemplateTable`, `type DecodedFacts` and `decodeFinancialFacts(vykazTabulky: VykazTable[], sablonaTabulky: TemplateTable[]): DecodedFacts`, consumed by Task 6.

This decoder's row-matching formula and expected values are verified against a real RÚZ filing (BOAT SERVICES s.r.o., IČO 50782525, statement id 4847452, report id 7716025, template id 687) fetched live on 2026-08-14 - the test fixture below is that real data, not a fabricated example.

- [ ] **Step 1: Write the failing test using the real captured filing**

```typescript
// scripts/ingest/ruz/decode-tabulky.test.ts
import { describe, it, expect } from "vitest";
import { decodeFinancialFacts } from "./decode-tabulky";

// Real "Výkaz ziskov a strát" data array from RÚZ report id 7716025
// (BOAT SERVICES s.r.o., obdobie 2020-01 to 2020-12, fetched 2026-08-14)
const REAL_PL_DATA = [
  "12000",
  "",
  "",
  "",
  "12000",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "8",
  "",
  "",
  "",
  "",
  "",
  "8",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "12000",
  "-8",
  "12000",
  "-8",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "84",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "84",
  "",
  "-84",
  "12000",
  "-92",
  "1449",
  "",
  "",
  "",
  "10551",
  "-92",
];

// Row labels from RÚZ sablona id 687, "Výkaz ziskov a strát" table (fetched 2026-08-14)
const REAL_PL_TEMPLATE_ROWS = [
  {
    cisloRiadku: 1,
    text: { sk: "Výnosy z hospodárskej činnosti spolu súčet (r. 02 až r. 07)" },
  },
  {
    cisloRiadku: 3,
    text: {
      sk: "Tržby z predaja vlastných výrobkov a služieb (601, 602, 606)",
    },
  },
  {
    cisloRiadku: 8,
    text: { sk: "Náklady na hospodársku činnosť spolu súčet (r. 09 až r. 17)" },
  },
  {
    cisloRiadku: 38,
    text: {
      sk: "Výsledok hospodárenia za účtovné obdobie po zdanení (+/-) (r. 35 - r. 36 - r. 37)",
    },
  },
];

describe("decodeFinancialFacts", () => {
  it("decodes trzby, naklady, and vysledok hospodarenia from a real filing", () => {
    const result = decodeFinancialFacts(
      [{ nazov: { sk: "Výkaz ziskov a strát" }, data: REAL_PL_DATA }],
      [
        {
          nazov: { sk: "Výkaz ziskov a strát" },
          pocetDatovychStlpcov: 2,
          riadky: REAL_PL_TEMPLATE_ROWS,
        },
      ],
    );

    expect(result.trzby).toBe(12000);
    expect(result.naklady).toBe(0);
    expect(result.vysledokHospodarenia).toBe(10551);
    expect(result.confidence).toBe("matched");
  });

  it("returns template_unmapped when the P&L table is missing", () => {
    const result = decodeFinancialFacts(
      [{ nazov: { sk: "Strana aktív" }, data: ["1"] }],
      [{ nazov: { sk: "Strana aktív" }, pocetDatovychStlpcov: 2, riadky: [] }],
    );

    expect(result.confidence).toBe("template_unmapped");
    expect(result.trzby).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/ruz/decode-tabulky.test.ts`
Expected: FAIL - `./decode-tabulky` module not found.

- [ ] **Step 3: Implement `decode-tabulky.ts`**

```typescript
// scripts/ingest/ruz/decode-tabulky.ts
export interface VykazTable {
  nazov: { sk: string };
  data: string[];
}

export interface TemplateRow {
  cisloRiadku: number;
  text: { sk: string };
}

export interface TemplateTable {
  nazov: { sk: string };
  pocetDatovychStlpcov: number;
  riadky: TemplateRow[];
}

export interface DecodedFacts {
  trzby: number | null;
  naklady: number | null;
  vysledokHospodarenia: number | null;
  confidence: "matched" | "template_unmapped";
}

const PL_TABLE_NAME = "Výkaz ziskov a strát";

const ROW_PATTERNS = {
  trzby: "Výnosy z hospodárskej činnosti spolu",
  naklady: "Náklady na hospodársku činnosť spolu",
  vysledokHospodarenia: "Výsledok hospodárenia za účtovné obdobie po zdanení",
} as const;

function parseValue(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  if (raw === "") return 0;
  const n = parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

export function decodeFinancialFacts(
  vykazTabulky: VykazTable[],
  sablonaTabulky: TemplateTable[],
): DecodedFacts {
  const vykazPl = vykazTabulky.find((t) => t.nazov.sk === PL_TABLE_NAME);
  const templatePl = sablonaTabulky.find((t) => t.nazov.sk === PL_TABLE_NAME);

  const empty: DecodedFacts = {
    trzby: null,
    naklady: null,
    vysledokHospodarenia: null,
    confidence: "template_unmapped",
  };

  if (!vykazPl || !templatePl) return empty;

  const cols = templatePl.pocetDatovychStlpcov;

  function findValue(pattern: string): number | null {
    const row = templatePl!.riadky.find((r) => r.text.sk.includes(pattern));
    if (!row) return null;
    const idx = (row.cisloRiadku - 1) * cols;
    return parseValue(vykazPl!.data[idx]);
  }

  const trzby = findValue(ROW_PATTERNS.trzby);
  const naklady = findValue(ROW_PATTERNS.naklady);
  const vysledokHospodarenia = findValue(ROW_PATTERNS.vysledokHospodarenia);

  const matched =
    trzby !== null && naklady !== null && vysledokHospodarenia !== null;

  return {
    trzby,
    naklady,
    vysledokHospodarenia,
    confidence: matched ? "matched" : "template_unmapped",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ingest/ruz/decode-tabulky.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/ruz/decode-tabulky.ts scripts/ingest/ruz/decode-tabulky.test.ts
git commit -m "feat: add financial_facts decoder verified against a real RÚZ filing"
```

---

## Task 6: RÚZ statements + report template sync (wires decoder in)

**Files:**

- Modify: `scripts/ingest/ruz/types.ts`
- Modify: `scripts/ingest/ruz/client.ts`
- Create: `scripts/ingest/ruz/sync-statements.ts`
- Test: `scripts/ingest/ruz/sync-statements.test.ts`

**Interfaces:**

- Consumes: `decodeFinancialFacts` from Task 5; `Firm` rows already present from Task 4.
- Produces: `syncStatements(prisma: PrismaClient, client: RuzClient, since: Date): Promise<{ processed: number }>`, used by Task 8's orchestrator.

- [ ] **Step 1: Add statement/vykaz/sablona types to `ruz/types.ts`**

```typescript
// append to scripts/ingest/ruz/types.ts
export interface ZavierkaDetail {
  id: number;
  idUJ: number;
  obdobieOd?: string;
  obdobieDo?: string;
  typ?: string;
  datumPodania?: string;
  datumSchvalenia?: string;
  idUctovnychVykazov: number[];
}

export interface VykazDetail {
  id: number;
  idSablony: number;
  pristupnostDat?: string;
  obsah?: { tabulky?: { nazov: { sk: string }; data: string[] }[] };
}

export interface SablonaDetail {
  id: number;
  nazov: string;
  nariadenieMF?: string;
  platneOd?: string;
  tabulky: {
    nazov: { sk: string };
    pocetDatovychStlpcov: number;
    riadky: { cisloRiadku: number; text: { sk: string } }[];
  }[];
}
```

- [ ] **Step 2: Add methods to `ruz/client.ts`**

```typescript
// append to RuzClient class in scripts/ingest/ruz/client.ts
import type { ZavierkaDetail, VykazDetail, SablonaDetail } from './types'

// inside class RuzClient:
async listChangedStatementIds(since: string, cursor?: number): Promise<{ ids: number[]; hasMore: boolean }> {
  const params = new URLSearchParams({ 'zmenene-od': since, 'max-zaznamov': '1000' })
  if (cursor !== undefined) params.set('pokracovat-za-id', String(cursor))
  const res = await fetchJson<IdListResponse>(`${BASE}/uctovne-zavierky?${params}`)
  return { ids: res.id, hasMore: res.existujeDalsieId }
}

async getStatement(id: number): Promise<ZavierkaDetail> {
  return fetchJson<ZavierkaDetail>(`${BASE}/uctovna-zavierka?id=${id}`)
}

async getVykaz(id: number): Promise<VykazDetail> {
  return fetchJson<VykazDetail>(`${BASE}/uctovny-vykaz?id=${id}`)
}

async getSablona(id: number): Promise<SablonaDetail> {
  return fetchJson<SablonaDetail>(`${BASE}/sablona?id=${id}`)
}
```

- [ ] **Step 3: Write the failing test**

```typescript
// scripts/ingest/ruz/sync-statements.test.ts
import { describe, it, expect, vi } from "vitest";
import { syncStatements } from "./sync-statements";
import type { RuzClient } from "./client";

function fakePrisma() {
  return {
    financialStatement: { upsert: vi.fn() },
    financialFacts: { upsert: vi.fn() },
    reportTemplate: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
  };
}

describe("syncStatements", () => {
  it("fetches both linked vykazy, finds the structured one, caches the template, and decodes facts", async () => {
    const client: Partial<RuzClient> = {
      listChangedStatementIds: vi
        .fn()
        .mockResolvedValueOnce({ ids: [4847452], hasMore: false }),
      getStatement: vi.fn().mockResolvedValue({
        id: 4847452,
        idUJ: 1685621,
        obdobieOd: "2020-01",
        obdobieDo: "2020-12",
        typ: "Riadna",
        idUctovnychVykazov: [10408386, 7716025],
      }),
      getVykaz: vi.fn(async (id: number) => {
        if (id === 10408386)
          return { id, idSablony: 1181, pristupnostDat: "Verejné" }; // PDF-only
        return {
          id,
          idSablony: 687,
          pristupnostDat: "Verejné",
          obsah: {
            tabulky: [
              {
                nazov: { sk: "Výkaz ziskov a strát" },
                data: ["12000", "", "", "", "12000"],
              },
            ],
          },
        };
      }),
      getSablona: vi.fn().mockResolvedValue({
        id: 687,
        nazov: "Úč MUJ",
        tabulky: [
          {
            nazov: { sk: "Výkaz ziskov a strát" },
            pocetDatovychStlpcov: 2,
            riadky: [
              {
                cisloRiadku: 1,
                text: { sk: "Výnosy z hospodárskej činnosti spolu" },
              },
            ],
          },
        ],
      }),
    };
    const prisma = fakePrisma();

    const result = await syncStatements(
      prisma as never,
      client as RuzClient,
      new Date("2026-08-01"),
    );

    expect(result.processed).toBe(1);
    expect(client.getVykaz).toHaveBeenCalledTimes(2);
    expect(prisma.reportTemplate.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.financialStatement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ id: 4847452n, idSablony: 687 }),
      }),
    );
    expect(prisma.financialFacts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          statementId: 4847452n,
          trzby: 12000,
        }),
      }),
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/ruz/sync-statements.test.ts`
Expected: FAIL - `./sync-statements` module not found.

- [ ] **Step 5: Implement `sync-statements.ts`**

```typescript
// scripts/ingest/ruz/sync-statements.ts
import type { PrismaClient } from "@prisma/client";
import type { RuzClient } from "./client";
import { decodeFinancialFacts } from "./decode-tabulky";

export async function syncStatements(
  prisma: PrismaClient,
  client: RuzClient,
  since: Date,
) {
  const sinceIso = since.toISOString();
  let cursor: number | undefined;
  let processed = 0;

  while (true) {
    const { ids, hasMore } = await client.listChangedStatementIds(
      sinceIso,
      cursor,
    );

    for (const id of ids) {
      const statement = await client.getStatement(id);

      let structuredVykaz:
        | Awaited<ReturnType<typeof client.getVykaz>>
        | undefined;
      for (const vykazId of statement.idUctovnychVykazov) {
        const vykaz = await client.getVykaz(vykazId);
        if (vykaz.obsah?.tabulky) {
          structuredVykaz = vykaz;
          break;
        }
      }

      await prisma.financialStatement.upsert({
        where: { id: BigInt(statement.id) },
        create: {
          id: BigInt(statement.id),
          firmId: BigInt(statement.idUJ),
          obdobieOd: statement.obdobieOd
            ? new Date(statement.obdobieOd)
            : undefined,
          obdobieDo: statement.obdobieDo
            ? new Date(statement.obdobieDo)
            : undefined,
          typ: statement.typ,
          idSablony: structuredVykaz?.idSablony,
          rawTabulky: structuredVykaz?.obsah?.tabulky ?? undefined,
          pristupnostDat: structuredVykaz?.pristupnostDat,
        },
        update: {
          idSablony: structuredVykaz?.idSablony,
          rawTabulky: structuredVykaz?.obsah?.tabulky ?? undefined,
          pristupnostDat: structuredVykaz?.pristupnostDat,
        },
      });

      if (structuredVykaz?.obsah?.tabulky && structuredVykaz.idSablony) {
        let template = await prisma.reportTemplate.findUnique({
          where: { idSablony: structuredVykaz.idSablony },
        });
        if (!template) {
          const sablona = await client.getSablona(structuredVykaz.idSablony);
          await prisma.reportTemplate.upsert({
            where: { idSablony: sablona.id },
            create: {
              idSablony: sablona.id,
              nazov: sablona.nazov,
              raw: sablona as never,
            },
            update: { raw: sablona as never },
          });
          template = {
            idSablony: sablona.id,
            nazov: sablona.nazov,
            raw: sablona,
          } as never;
        }

        const rawTemplate = (template as { raw: { tabulky: unknown[] } }).raw;
        const decoded = decodeFinancialFacts(
          structuredVykaz.obsah.tabulky,
          rawTemplate.tabulky as Parameters<typeof decodeFinancialFacts>[1],
        );

        await prisma.financialFacts.upsert({
          where: { statementId: BigInt(statement.id) },
          create: {
            statementId: BigInt(statement.id),
            trzby: decoded.trzby ?? undefined,
            naklady: decoded.naklady ?? undefined,
            vysledokHospodarenia: decoded.vysledokHospodarenia ?? undefined,
            decodeConfidence: decoded.confidence,
          },
          update: {
            trzby: decoded.trzby ?? undefined,
            naklady: decoded.naklady ?? undefined,
            vysledokHospodarenia: decoded.vysledokHospodarenia ?? undefined,
            decodeConfidence: decoded.confidence,
          },
        });
      }

      processed++;
    }

    if (!hasMore) break;
    cursor = ids[ids.length - 1];
  }

  return { processed };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run scripts/ingest/ruz/sync-statements.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/ingest/ruz/types.ts scripts/ingest/ruz/client.ts scripts/ingest/ruz/sync-statements.ts scripts/ingest/ruz/sync-statements.test.ts
git commit -m "feat: add RÚZ statement sync with template-based fact decoding"
```

---

## Task 7: firm_aggregates recompute with anonymization

**Files:**

- Create: `scripts/ingest/ruz/recompute-aggregates.ts`
- Test: `scripts/ingest/ruz/recompute-aggregates.test.ts`

**Interfaces:**

- Produces: `recomputeAggregates(prisma: PrismaClient): Promise<{ groupsComputed: number }>`, used by Task 8's orchestrator.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/ingest/ruz/recompute-aggregates.test.ts
import { describe, it, expect, vi } from "vitest";
import { recomputeAggregates } from "./recompute-aggregates";

describe("recomputeAggregates", () => {
  it("nulls value columns when firm_count is below 5, keeps them when at or above 5", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          naceKod5: "56101",
          okresKod: "SK0101",
          rok: 2023,
          firmCount: 3n,
          trzbyValues: [100, 200, 300],
        },
        {
          naceKod5: "56101",
          okresKod: "SK0102",
          rok: 2023,
          firmCount: 7n,
          trzbyValues: [10, 20, 30, 40, 50, 60, 70],
        },
      ]),
      firmAggregate: { upsert: vi.fn() },
    };

    const result = await recomputeAggregates(prisma as never);

    expect(result.groupsComputed).toBe(2);
    const smallGroupCall = prisma.firmAggregate.upsert.mock.calls.find(
      (c) =>
        c[0].where.naceKod5_regionOrDistrictKod_granularity_rok
          .regionOrDistrictKod === "SK0101",
    );
    expect(smallGroupCall[0].create.firmCount).toBe(3);
    expect(smallGroupCall[0].create.medianTrzby).toBeNull();

    const bigGroupCall = prisma.firmAggregate.upsert.mock.calls.find(
      (c) =>
        c[0].where.naceKod5_regionOrDistrictKod_granularity_rok
          .regionOrDistrictKod === "SK0102",
    );
    expect(bigGroupCall[0].create.firmCount).toBe(7);
    expect(bigGroupCall[0].create.medianTrzby).toBe(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/ruz/recompute-aggregates.test.ts`
Expected: FAIL - `./recompute-aggregates` module not found.

- [ ] **Step 3: Implement `recompute-aggregates.ts`**

```typescript
// scripts/ingest/ruz/recompute-aggregates.ts
import type { PrismaClient } from "@prisma/client";

const ANONYMITY_THRESHOLD = 5;

interface RawGroup {
  naceKod5: string;
  okresKod: string;
  rok: number;
  firmCount: bigint;
  trzbyValues: number[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function recomputeAggregates(prisma: PrismaClient) {
  const groups = await prisma.$queryRaw<RawGroup[]>`
    SELECT
      f."nace_kod5" AS "naceKod5",
      f."okres_kod" AS "okresKod",
      EXTRACT(YEAR FROM fs."obdobie_do")::int AS "rok",
      COUNT(DISTINCT f.id) AS "firmCount",
      array_agg(ff."trzby") FILTER (WHERE ff."trzby" IS NOT NULL) AS "trzbyValues"
    FROM firms f
    JOIN financial_statements fs ON fs.firm_id = f.id
    JOIN financial_facts ff ON ff.statement_id = fs.id
    WHERE f."nace_kod5" IS NOT NULL AND f."okres_kod" IS NOT NULL AND fs."obdobie_do" IS NOT NULL
    GROUP BY f."nace_kod5", f."okres_kod", EXTRACT(YEAR FROM fs."obdobie_do")
  `;

  for (const g of groups) {
    const firmCount = Number(g.firmCount);
    const belowThreshold = firmCount < ANONYMITY_THRESHOLD;
    const medianTrzby =
      belowThreshold || g.trzbyValues.length === 0
        ? null
        : median(g.trzbyValues);

    await prisma.firmAggregate.upsert({
      where: {
        naceKod5_regionOrDistrictKod_granularity_rok: {
          naceKod5: g.naceKod5,
          regionOrDistrictKod: g.okresKod,
          granularity: "okres",
          rok: g.rok,
        },
      },
      create: {
        naceKod5: g.naceKod5,
        regionOrDistrictKod: g.okresKod,
        granularity: "okres",
        rok: g.rok,
        firmCount,
        medianTrzby,
      },
      update: {
        firmCount,
        medianTrzby,
      },
    });
  }

  return { groupsComputed: groups.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ingest/ruz/recompute-aggregates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/ruz/recompute-aggregates.ts scripts/ingest/ruz/recompute-aggregates.test.ts
git commit -m "feat: add firm aggregate recompute with anonymization threshold"
```

---

## Task 8: RÚZ orchestrator + GitHub Actions workflow

**Files:**

- Create: `scripts/ingest/ruz/run.ts`
- Create: `.github/workflows/ingest-ruz.yml`

**Interfaces:**

- Consumes: `syncClassifiers`, `syncFirms`, `syncStatements`, `recomputeAggregates`, `upsertDataSource`, `prisma` from earlier tasks.

- [ ] **Step 1: Implement the orchestrator**

```typescript
// scripts/ingest/ruz/run.ts
import { prisma } from "../../../lib/prisma";
import { upsertDataSource } from "../data-sources";
import { RuzClient } from "./client";
import { syncClassifiers } from "./sync-classifiers";
import { syncFirms } from "./sync-entities";
import { syncStatements } from "./sync-statements";
import { recomputeAggregates } from "./recompute-aggregates";

async function main() {
  const client = new RuzClient();
  const runStart = new Date();

  const existing = await prisma.dataSource.findUnique({
    where: { sourceName: "RÚZ" },
  });
  const since = existing?.lastSyncedAt ?? new Date("2020-01-01");

  console.log("Syncing classifiers...");
  await syncClassifiers(prisma, client);

  console.log(`Syncing firms changed since ${since.toISOString()}...`);
  const firmsResult = await syncFirms(prisma, client, since);
  console.log(`Processed ${firmsResult.processed} firms.`);

  console.log(`Syncing statements changed since ${since.toISOString()}...`);
  const statementsResult = await syncStatements(prisma, client, since);
  console.log(`Processed ${statementsResult.processed} statements.`);

  console.log("Recomputing aggregates...");
  const aggResult = await recomputeAggregates(prisma);
  console.log(`Recomputed ${aggResult.groupsComputed} aggregate groups.`);

  const totalFirms = await prisma.firm.count();
  await upsertDataSource(prisma, {
    sourceName: "RÚZ",
    sourceUrl:
      "https://registeruz.sk/cruz-public/domain/accountingentity/simplesearch",
    lastSyncedAt: runStart,
    recordsCount: totalFirms,
  });

  console.log("RÚZ ingestion complete.");
}

main()
  .catch((err) => {
    console.error("RÚZ ingestion failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Verify it runs against the real Supabase DB from Task 2**

Run: `npm run ingest:ruz`
Expected: logs each stage and completes with "RÚZ ingestion complete." Since `since` defaults to 2020-01-01 on first run, this will attempt a full sync - for this verification step it's fine to `Ctrl+C` after confirming classifiers sync and the first page of firms/statements process without errors; full national ingestion is deferred to the pilot task at the end of this plan.

- [ ] **Step 3: Add the GitHub Actions workflow**

```yaml
# .github/workflows/ingest-ruz.yml
name: Ingest RÚZ

on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch: {}

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run ingest:ruz
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DIRECT_URL: ${{ secrets.DIRECT_URL }}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/ruz/run.ts .github/workflows/ingest-ruz.yml
git commit -m "feat: add RÚZ ingestion orchestrator and daily cron workflow"
```

---

## Task 9: RPO client + business_entities sync

**Files:**

- Create: `scripts/ingest/rpo/types.ts`
- Create: `scripts/ingest/rpo/client.ts`
- Create: `scripts/ingest/rpo/sync-entities.ts`
- Test: `scripts/ingest/rpo/sync-entities.test.ts`

**Interfaces:**

- Consumes: `fetchJson` from `../http`; `Municipality` rows already present from Task 3.
- Produces: `type RpoSearchResult` from `rpo/types.ts`.
- Produces: `RpoClient.searchByMunicipality(municipalityKod: string): Promise<RpoSearchResult[]>` and `RpoClient.getEntity(internalId: number): Promise<RpoEntityDetail>` from `rpo/client.ts`.
- Produces: `syncBusinessEntities(prisma: PrismaClient, client: RpoClient): Promise<{ processed: number }>`, used by Task 11's orchestrator.

- [ ] **Step 1: Write `rpo/types.ts`**

```typescript
// scripts/ingest/rpo/types.ts
export interface RpoAddress {
  street?: string;
  buildingNumber?: string;
  postalCodes?: string[];
  municipality?: { value: string; code?: string };
  validFrom?: string;
  validTo?: string;
}

export interface RpoSearchResult {
  id: number;
  identifiers: { value: string; validFrom?: string }[];
  fullNames: { value: string; validFrom?: string; validTo?: string }[];
  addresses: RpoAddress[];
  establishment?: string;
  termination?: string;
}

export interface RpoEntityDetail extends RpoSearchResult {
  legalForms?: { value: { code: string }; validFrom?: string }[];
  statisticalCodes?: {
    mainActivity?: { value: string; code: string };
  };
}
```

- [ ] **Step 2: Write `rpo/client.ts`**

```typescript
// scripts/ingest/rpo/client.ts
import { fetchJson } from "../http";
import type { RpoSearchResult, RpoEntityDetail } from "./types";

const BASE = "https://api.statistics.sk/rpo/v1";

export class RpoClient {
  async searchByMunicipality(
    municipalityKod: string,
  ): Promise<RpoSearchResult[]> {
    const res = await fetchJson<{ results: RpoSearchResult[] }>(
      `${BASE}/search?addressMunicipality=${encodeURIComponent(municipalityKod)}`,
    );
    return res.results;
  }

  async getEntity(internalId: number): Promise<RpoEntityDetail> {
    return fetchJson<RpoEntityDetail>(`${BASE}/entity/${internalId}`);
  }
}
```

- [ ] **Step 3: Write the failing test**

```typescript
// scripts/ingest/rpo/sync-entities.test.ts
import { describe, it, expect, vi } from "vitest";
import { syncBusinessEntities } from "./sync-entities";
import type { RpoClient } from "./client";

function fakePrisma() {
  return {
    municipality: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          {
            kod: "SK0315510335",
            districtKod: "SK0315",
            district: { regionKod: "SK031" },
          },
        ]),
    },
    businessEntity: { upsert: vi.fn() },
  };
}

describe("syncBusinessEntities", () => {
  it("searches each municipality, fetches full detail, and derives district/region from the municipality lookup", async () => {
    const client: Partial<RpoClient> = {
      searchByMunicipality: vi.fn().mockResolvedValue([
        {
          id: 9121860,
          identifiers: [{ value: "50782525" }],
          fullNames: [{ value: "BOAT SERVICES s.r.o." }],
          addresses: [{ municipality: { code: "SK0315510335" } }],
          establishment: "2017-03-14",
        },
      ]),
      getEntity: vi.fn().mockResolvedValue({
        id: 9121860,
        identifiers: [{ value: "50782525" }],
        fullNames: [{ value: "BOAT SERVICES s.r.o." }],
        addresses: [{ municipality: { code: "SK0315510335" } }],
        establishment: "2017-03-14",
        legalForms: [{ value: { code: "112" } }],
        statisticalCodes: {
          mainActivity: { value: "Reštauračné činnosti", code: "5611" },
        },
      }),
    };
    const prisma = fakePrisma();

    const result = await syncBusinessEntities(
      prisma as never,
      client as RpoClient,
    );

    expect(result.processed).toBe(1);
    expect(prisma.businessEntity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          id: 9121860n,
          ico: "50782525",
          naceKod4: "5611",
          municipalityKod: "SK0315510335",
          okresKod: "SK0315",
          krajKod: "SK031",
        }),
      }),
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/rpo/sync-entities.test.ts`
Expected: FAIL - `./sync-entities` module not found.

- [ ] **Step 5: Implement `sync-entities.ts`**

```typescript
// scripts/ingest/rpo/sync-entities.ts
import type { PrismaClient } from "@prisma/client";
import type { RpoClient } from "./client";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function syncBusinessEntities(
  prisma: PrismaClient,
  client: RpoClient,
) {
  const municipalities = await prisma.municipality.findMany({
    include: { district: true },
  });

  let processed = 0;

  for (const muni of municipalities) {
    const results = await client.searchByMunicipality(muni.kod);

    for (const result of results) {
      const detail = await client.getEntity(result.id);
      const ico = detail.identifiers[0]?.value;
      const nazov = detail.fullNames[detail.fullNames.length - 1]?.value;
      const naceKod4 = detail.statisticalCodes?.mainActivity?.code;
      const pravnaFormaKod =
        detail.legalForms?.[detail.legalForms.length - 1]?.value.code;

      await prisma.businessEntity.upsert({
        where: { id: BigInt(detail.id) },
        create: {
          id: BigInt(detail.id),
          ico,
          nazov,
          municipalityKod: muni.kod,
          okresKod: muni.districtKod,
          krajKod: (muni as unknown as { district: { regionKod: string } })
            .district.regionKod,
          naceKod4,
          pravnaFormaKod,
          datumVzniku: detail.establishment
            ? new Date(detail.establishment)
            : undefined,
          datumZaniku: detail.termination
            ? new Date(detail.termination)
            : undefined,
          zdrojDat: "RPO",
        },
        update: {
          ico,
          nazov,
          naceKod4,
          pravnaFormaKod,
          datumZaniku: detail.termination
            ? new Date(detail.termination)
            : undefined,
        },
      });
      processed++;
    }

    await delay(250);
  }

  return { processed };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run scripts/ingest/rpo/sync-entities.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/ingest/rpo/types.ts scripts/ingest/rpo/client.ts scripts/ingest/rpo/sync-entities.ts scripts/ingest/rpo/sync-entities.test.ts
git commit -m "feat: add RPO business entity sync by municipality"
```

---

## Task 10: business_density_agg recompute

**Files:**

- Create: `scripts/ingest/rpo/recompute-density.ts`
- Test: `scripts/ingest/rpo/recompute-density.test.ts`

**Interfaces:**

- Produces: `recomputeDensity(prisma: PrismaClient): Promise<{ areasComputed: number }>`, used by Task 11's orchestrator.

- [ ] **Step 1: Write the failing test**

```typescript
// scripts/ingest/rpo/recompute-density.test.ts
import { describe, it, expect, vi } from "vitest";
import { recomputeDensity } from "./recompute-density";

describe("recomputeDensity", () => {
  it("computes count per district and per-1000-population ratio when population is known", async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { okresKod: "SK0315", naceKod4: "5611", pocet: 12n, population: 6000 },
        { okresKod: "SK0101", naceKod4: "5611", pocet: 40n, population: null },
      ]),
      businessDensityAgg: { upsert: vi.fn() },
    };

    const result = await recomputeDensity(prisma as never);

    expect(result.areasComputed).toBe(2);
    const withPop = prisma.businessDensityAgg.upsert.mock.calls.find(
      (c) =>
        c[0].where.areaKod_granularity_naceKod4_snapshotDate.areaKod ===
        "SK0315",
    );
    expect(withPop[0].create.pocetPrevadzok).toBe(12);
    expect(withPop[0].create.pocetNa1000Obyvatelov).toBe(2);

    const withoutPop = prisma.businessDensityAgg.upsert.mock.calls.find(
      (c) =>
        c[0].where.areaKod_granularity_naceKod4_snapshotDate.areaKod ===
        "SK0101",
    );
    expect(withoutPop[0].create.pocetNa1000Obyvatelov).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/ingest/rpo/recompute-density.test.ts`
Expected: FAIL - `./recompute-density` module not found.

- [ ] **Step 3: Implement `recompute-density.ts`**

```typescript
// scripts/ingest/rpo/recompute-density.ts
import type { PrismaClient } from "@prisma/client";

interface RawDensityRow {
  okresKod: string;
  naceKod4: string | null;
  pocet: bigint;
  population: number | null;
}

export async function recomputeDensity(prisma: PrismaClient) {
  const snapshotDate = new Date();
  snapshotDate.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.$queryRaw<RawDensityRow[]>`
    SELECT
      be."okres_kod" AS "okresKod",
      be."nace_kod4" AS "naceKod4",
      COUNT(*) AS "pocet",
      SUM(m.population) AS "population"
    FROM business_entities be
    JOIN municipalities m ON m.district_kod = be."okres_kod"
    WHERE be."datum_zaniku" IS NULL AND be."okres_kod" IS NOT NULL
    GROUP BY be."okres_kod", be."nace_kod4"
  `;

  for (const row of rows) {
    const pocet = Number(row.pocet);
    const pocetNa1000 = row.population ? (pocet / row.population) * 1000 : null;

    await prisma.businessDensityAgg.upsert({
      where: {
        areaKod_granularity_naceKod4_snapshotDate: {
          areaKod: row.okresKod,
          granularity: "okres",
          naceKod4: row.naceKod4 ?? "",
          snapshotDate,
        },
      },
      create: {
        areaKod: row.okresKod,
        granularity: "okres",
        naceKod4: row.naceKod4,
        snapshotDate,
        pocetPrevadzok: pocet,
        pocetNa1000Obyvatelov: pocetNa1000,
      },
      update: {
        pocetPrevadzok: pocet,
        pocetNa1000Obyvatelov: pocetNa1000,
      },
    });
  }

  return { areasComputed: rows.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/ingest/rpo/recompute-density.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/rpo/recompute-density.ts scripts/ingest/rpo/recompute-density.test.ts
git commit -m "feat: add business density recompute with per-1000-population ratio"
```

---

## Task 11: RPO orchestrator + GitHub Actions workflow

**Files:**

- Create: `scripts/ingest/rpo/run.ts`
- Create: `.github/workflows/ingest-rpo.yml`

**Interfaces:**

- Consumes: `syncBusinessEntities`, `recomputeDensity`, `upsertDataSource`, `prisma` from earlier tasks.

- [ ] **Step 1: Implement the orchestrator**

```typescript
// scripts/ingest/rpo/run.ts
import { prisma } from "../../../lib/prisma";
import { upsertDataSource } from "../data-sources";
import { RpoClient } from "./client";
import { syncBusinessEntities } from "./sync-entities";
import { recomputeDensity } from "./recompute-density";

async function main() {
  const client = new RpoClient();
  const runStart = new Date();

  console.log("Syncing RPO business entities by municipality...");
  const result = await syncBusinessEntities(prisma, client);
  console.log(`Processed ${result.processed} business entities.`);

  console.log("Recomputing business density aggregates...");
  const densityResult = await recomputeDensity(prisma);
  console.log(`Recomputed density for ${densityResult.areasComputed} areas.`);

  const totalEntities = await prisma.businessEntity.count();
  await upsertDataSource(prisma, {
    sourceName: "RPO",
    sourceUrl: "https://rpo.statistics.sk",
    lastSyncedAt: runStart,
    recordsCount: totalEntities,
  });

  console.log("RPO ingestion complete.");
}

main()
  .catch((err) => {
    console.error("RPO ingestion failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add the GitHub Actions workflow**

```yaml
# .github/workflows/ingest-rpo.yml
name: Ingest RPO

on:
  schedule:
    - cron: "0 4 * * 0"
  workflow_dispatch: {}

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run ingest:rpo
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DIRECT_URL: ${{ secrets.DIRECT_URL }}
```

- [ ] **Step 3: Add both `DATABASE_URL` and `DIRECT_URL` as GitHub Actions repository secrets (manual, one-time)**

In the GitHub repo settings → Secrets and variables → Actions, add `DATABASE_URL` and `DIRECT_URL` using the same Supabase values from `.env.local`.

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/rpo/run.ts .github/workflows/ingest-rpo.yml
git commit -m "feat: add RPO ingestion orchestrator and weekly cron workflow"
```

---

## Task 12: Pilot run - one district, verify against the spec's testing plan

**Files:** none created - this is a validation task using scripts from Tasks 8 and 11.

- [ ] **Step 1: Temporarily scope the RÚZ orchestrator to a pilot district**

This is a manual, one-off check - not a permanent code change. In a scratch copy of `scripts/ingest/ruz/sync-entities.ts`, or by adding a temporary filter, restrict the run to firms in one district (e.g. `SK0315`, matching the district used in the decoder's real-data test) so the pilot stays near the ~100-firm scale the spec calls for. Do not commit this temporary scoping.

- [ ] **Step 2: Run the pilot**

Run: `npm run ingest:ruz`
Expected: completes without unhandled errors; `firms`, `financial_statements`, `financial_facts`, and `firm_aggregates_nace_region_year` tables have rows for the pilot district.

- [ ] **Step 3: Manually cross-check decoded facts**

Pick 3–5 firms from `financial_facts` where `decodeConfidence = 'matched'`. For each, refetch `GET /uctovny-vykaz?id=` for that statement and manually verify `trzby`/`vysledokHospodarenia` against the row the template says is "Výnosy z hospodárskej činnosti spolu" / "Výsledok hospodárenia za účtovné obdobie po zdanení". This mirrors the Task 5 test but against firms outside the fixture.

- [ ] **Step 4: Verify the anonymization threshold on real data**

Query: `SELECT * FROM firm_aggregates_nace_region_year WHERE firm_count < 5;`
Expected: every row returned has `median_trzby`, `avg_trzby`, `median_marza`, `yoy_trend_pct` all `NULL`.

- [ ] **Step 5: Run the RPO pilot for the same district**

Run: `npm run ingest:rpo`
Expected: `business_entities` has rows with `okres_kod = 'SK0315'` and populated `nace_kod4` values; `business_density_agg` has a row for that district (population-based ratio will be `NULL` until the ŠÚ SR population source is confirmed in the Module B sub-project).

- [ ] **Step 6: Verify cursor resumption on an interrupted run**

Run `npm run ingest:ruz`, then `Ctrl+C` it partway through the firms pagination loop (after the first "Processed" log line but before completion). Note the highest firm id logged so far. Re-run `npm run ingest:ruz`. Expected: the run completes without errors, and `SELECT COUNT(*) FROM firms;` does not show duplicate rows (upserts are keyed by `id`, so re-processing already-synced ids is a no-op, not a duplicate) - confirms the `zmenene-od` + `pokracovat-za-id` resumption pattern from Task 4 is safe to interrupt and restart.

- [ ] **Step 7: Revert the temporary pilot scoping from Step 1**

Confirm `git status` shows no uncommitted changes to `sync-entities.ts` (since the scoping was applied to a scratch copy, not the tracked file).

No commit for this task - it's a validation checkpoint, not a code change. If any check in Steps 3–5 fails, fix the underlying module (with its own test update) before proceeding to Module A/B sub-projects.
