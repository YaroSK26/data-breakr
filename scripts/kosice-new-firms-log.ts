// scripts/kosice-new-firms-log.ts
//
// Appends a dated block of newly-established Košice firms to a persistent
// log file every time it's run - each run only looks at daily batches since
// the last run (tracked in .kosice-log-state.json), so entries never repeat
// across runs and each block is stamped with the date it was generated, not
// just the firms' own establishment dates.
//
// Usage: npx tsx scripts/kosice-new-firms-log.ts
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs'
import { rm } from 'fs/promises'
import path from 'path'
import os from 'os'
import { listBucketObjects, downloadBucketObject, streamEntitiesFromFile } from './ingest/rpo/bulk-source'

const STATE_PATH = path.join(__dirname, '.kosice-log-state.json')
const LOG_PATH = path.join(__dirname, '..', 'nove-firmy-kosice-log.txt')

function readState(): { lastOd: string } {
  if (existsSync(STATE_PATH)) return JSON.parse(readFileSync(STATE_PATH, 'utf-8'))
  // First run: no prior state - look back 7 days rather than the whole
  // 45-day retention window, so an accidental first run doesn't dump
  // weeks of history into one block.
  const fallback = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  return { lastOd: fallback }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const { lastOd } = readState()
  const tmpDir = path.join(os.tmpdir(), 'rpo-kosice-log')
  await import('fs/promises').then((fs) => fs.mkdir(tmpDir, { recursive: true }))

  const all = await listBucketObjects('batch-daily/')
  const relevant = all.filter((o) => o.key.endsWith('.json.gz') && o.key >= `batch-daily/actual_${lastOd}`)
  console.log(`Checking ${relevant.length} daily batch(es) since ${lastOd} for Košice...`)

  const seen = new Set<string>()
  const lines: string[] = []

  for (const file of relevant) {
    const localPath = path.join(tmpDir, path.basename(file.key))
    try {
      await downloadBucketObject(file.key, localPath)
      for await (const e of streamEntitiesFromFile(localPath)) {
        const addr = (e.addresses ?? []).find((a) => !a.validTo) ?? e.addresses?.[e.addresses.length - 1]
        const muniVal = (addr?.municipality as { value?: string } | undefined)?.value ?? ''
        if (!muniVal.toLowerCase().startsWith('košice')) continue
        const est = e.establishment
        if (!est || est < lastOd) continue
        const name = e.fullNames?.[e.fullNames.length - 1]?.value ?? '(bez názvu)'
        const key = name + muniVal
        if (seen.has(key)) continue
        seen.add(key)
        const nace = e.statisticalCodes?.mainActivity?.value ?? '?'
        lines.push(`${name} | ${muniVal} | vznik: ${est} | ${nace}`)
      }
    } finally {
      await rm(localPath, { force: true })
    }
  }

  const block = `\n=== ${today} (nové od ${lastOd}) - ${lines.length} firiem ===\n` + (lines.length ? lines.join('\n') + '\n' : '(žiadne nové)\n')

  if (existsSync(LOG_PATH)) {
    appendFileSync(LOG_PATH, block, 'utf-8')
  } else {
    writeFileSync(LOG_PATH, `Nové košické firmy - denný log\n${block}`, 'utf-8')
  }

  writeFileSync(STATE_PATH, JSON.stringify({ lastOd: today }, null, 2), 'utf-8')
  console.log(`Appended ${lines.length} firms to ${LOG_PATH}, next run will check from ${today}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
