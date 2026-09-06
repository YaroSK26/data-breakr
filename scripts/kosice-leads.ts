// scripts/kosice-leads.ts
//
// Enriches the newly-established Košice firms we already have in
// business_entities with the two fields that actually decide whether a
// firm is worth contacting - and that our own ingest does not store:
//
//   - statutoryBodies -> konateľ / owner name. A brand-new s.r.o. has no
//     website, but the person behind it usually has an existing business,
//     LinkedIn or Facebook page under their own name. The name is the
//     search key that turns an anonymous shell into a findable lead.
//   - activities[].economicActivityDescription -> the free-text trade
//     licence scope ("Poskytovanie právnych služieb"), which is far more
//     specific than the NACE class RPO assigns (half of them land in
//     "Ostatné pomocné obchodné činnosti i. n.").
//
// Both come from RPO's entity detail endpoint. business_entities.id is
// RPO's own internal id, so this is one request per firm, no lookup.
//
// Usage: npx tsx scripts/kosice-leads.ts [--od 2026-08-18] [--out kosice-leady.txt]
import { writeFileSync } from 'fs'
import { prisma } from '../lib/prisma'
import { fetchJson } from './ingest/http'

// Košice I-IV (city) + Košice-okolie, same set as kosice-new-firms-log.ts.
const KOSICE_DISTRICT_KODS = ['SK0422', 'SK0423', 'SK0424', 'SK0425', 'SK0426']
const BASE = 'https://api.statistics.sk/rpo/v1'
const CONCURRENCY = 4

interface RpoDetail {
  statutoryBodies?: {
    stakeholderType?: { value?: string }
    personName?: { formatedName?: string }
    validTo?: string
  }[]
  activities?: { economicActivityDescription?: string; validTo?: string }[]
}

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  return {
    od: get('--od') ?? '2026-08-18',
    out: get('--out') ?? 'kosice-leady.txt',
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i])
      }
    })
  )
  return results
}

async function main() {
  const { od, out } = parseArgs()

  const firms = await prisma.businessEntity.findMany({
    where: {
      okresKod: { in: KOSICE_DISTRICT_KODS },
      datumVzniku: { gte: new Date(od) },
      datumZaniku: null,
    },
    select: { id: true, ico: true, nazov: true, mesto: true, ulica: true, naceKod4: true, datumVzniku: true },
    orderBy: [{ datumVzniku: 'asc' }, { nazov: 'asc' }],
  })

  const naceNames = new Map(
    (await prisma.nace21Code.findMany({ where: { uroven: 4 }, select: { kod: true, nazovSk: true } })).map((n) => [
      n.kod,
      n.nazovSk,
    ])
  )

  console.log(`Enriching ${firms.length} Košice firms established since ${od}...`)

  const enriched = await mapWithConcurrency(firms, CONCURRENCY, async (f) => {
    let detail: RpoDetail | null = null
    try {
      detail = await fetchJson<RpoDetail>(`${BASE}/entity/${f.id}`, { retries: 2 })
    } catch {
      // A single missing/failed record must not abort a 240-firm run -
      // the row is still worth printing without the enrichment.
      detail = null
    }
    const people = (detail?.statutoryBodies ?? [])
      // Sole traders carry a statutory row with no personName - the person
      // IS the firm, and their name is already the firm name, so an entry
      // rendered as "?" would be noise.
      .filter((s) => !s.validTo && s.personName?.formatedName)
      .map((s) => `${s.personName!.formatedName}${s.stakeholderType?.value ? ` (${s.stakeholderType.value})` : ''}`)
    const activities = (detail?.activities ?? []).filter((a) => !a.validTo).map((a) => a.economicActivityDescription ?? '')
    return { firm: f, people, activities }
  })

  const lines = enriched.map(({ firm, people, activities }) => {
    const parts = [
      firm.nazov ?? '(bez názvu)',
      `IČO: ${firm.ico ?? '-'}`,
      `vznik: ${firm.datumVzniku?.toISOString().slice(0, 10) ?? '-'}`,
      `${firm.ulica ?? ''}, ${firm.mesto ?? ''}`.replace(/^, /, ''),
      `NACE: ${firm.naceKod4 ?? '-'} ${firm.naceKod4 ? (naceNames.get(firm.naceKod4) ?? '') : ''}`.trim(),
      `Konateľ: ${people.length ? people.join('; ') : '-'}`,
      `Činnosti: ${activities.length ? activities.join(' | ') : '-'}`,
    ]
    return parts.join('\n   ')
  })

  const header =
    `Košické firmy založené od ${od} - obohatené o konateľov a predmet činnosti z RPO\n` +
    `Zdroj: RPO (api.statistics.sk/rpo/v1/entity), vygenerované ${new Date().toISOString()}\n` +
    `Počet: ${firms.length}\n\n`

  writeFileSync(out, header + lines.map((l, i) => `${i + 1}. ${l}`).join('\n\n') + '\n', 'utf-8')
  console.log(`Written ${firms.length} enriched firms to ${out}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
