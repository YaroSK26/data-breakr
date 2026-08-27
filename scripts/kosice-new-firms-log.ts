// scripts/kosice-new-firms-log.ts
//
// Appends a dated block of newly-established Košice-region firms (city
// districts I-IV plus the surrounding Košice-okolie district) to a
// persistent log file every time it's run - each run only looks at firms
// since the last run (tracked in .kosice-log-state.json), so entries never
// repeat across runs and each block is stamped with the date it was
// generated, not just the firms' own establishment dates.
//
// Reads straight from our own DB (already synced daily via the RPO bulk
// pipeline) rather than re-parsing RPO's daily batch files - matching by
// district code catches Košice-okolie's surrounding villages too, which a
// name-prefix match on "Košice ..." would miss entirely.
//
// Usage: npx tsx scripts/kosice-new-firms-log.ts
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'

const STATE_PATH = path.join(__dirname, '.kosice-log-state.json')
const LOG_PATH = path.join(__dirname, '..', 'nove-firmy-kosice-log.txt')

// Košice I-IV (city) + Košice-okolie (surrounding district).
const KOSICE_DISTRICT_KODS = ['SK0422', 'SK0423', 'SK0424', 'SK0425', 'SK0426']

function readState(): { lastOd: string } {
  if (existsSync(STATE_PATH)) return JSON.parse(readFileSync(STATE_PATH, 'utf-8'))
  const fallback = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  return { lastOd: fallback }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const { lastOd } = readState()

  const rows = await prisma.businessEntity.findMany({
    where: {
      okresKod: { in: KOSICE_DISTRICT_KODS },
      datumVzniku: { gte: new Date(lastOd) },
    },
    select: { ico: true, nazov: true, mesto: true, okresKod: true, datumVzniku: true },
    orderBy: { datumVzniku: 'asc' },
  })

  const lines = rows.map(
    (r) => `${r.nazov} | ${r.mesto} | vznik: ${r.datumVzniku?.toISOString().slice(0, 10)} | IČO: ${r.ico ?? ''} | okres: ${r.okresKod}`
  )

  const block = `\n=== ${today} (nové od ${lastOd}) - ${lines.length} firiem ===\n` + (lines.length ? lines.join('\n') + '\n' : '(žiadne nové)\n')

  if (existsSync(LOG_PATH)) {
    appendFileSync(LOG_PATH, block, 'utf-8')
  } else {
    writeFileSync(LOG_PATH, `Nové košické firmy (mesto + okolie) - denný log\n${block}`, 'utf-8')
  }

  writeFileSync(STATE_PATH, JSON.stringify({ lastOd: today }, null, 2), 'utf-8')
  console.log(`Appended ${lines.length} firms to ${LOG_PATH}, next run will check from ${today}.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
