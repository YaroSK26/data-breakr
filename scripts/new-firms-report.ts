// scripts/new-firms-report.ts
//
// Ad-hoc report: new firms established since a given date, in a given
// municipality/city, sourced from RPO's daily incremental batches
// (batch-daily/actual_YYYY-MM-DD.json.gz) - each file only carries
// records added/modified that day, so this is far cheaper than re-running
// the full bulk import to answer "what's new since we last looked".
//
// Usage: npx tsx scripts/new-firms-report.ts --mesto Košice --od 2026-08-18 --out nove-firmy.txt
import { writeFileSync } from 'fs'
import { rm } from 'fs/promises'
import path from 'path'
import os from 'os'
import { listBucketObjects, downloadBucketObject, streamEntitiesFromFile } from './ingest/rpo/bulk-source'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  return {
    mesto: get('--mesto') ?? '',
    od: get('--od') ?? new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    out: get('--out') ?? 'nove-firmy.txt',
  }
}

async function main() {
  const { mesto, od, out } = parseArgs()
  const tmpDir = path.join(os.tmpdir(), 'rpo-daily-check')
  await import('fs/promises').then((fs) => fs.mkdir(tmpDir, { recursive: true }))

  const all = await listBucketObjects('batch-daily/')
  const relevant = all.filter((o) => o.key.endsWith('.json.gz') && o.key >= `batch-daily/actual_${od}`)
  console.log(`Checking ${relevant.length} daily batch(es) from ${od} onward for "${mesto || 'celé SK'}"...`)

  const seen = new Set<string>()
  const lines: string[] = []

  for (const file of relevant) {
    const localPath = path.join(tmpDir, path.basename(file.key))
    try {
      await downloadBucketObject(file.key, localPath)
      for await (const e of streamEntitiesFromFile(localPath)) {
        const addr = (e.addresses ?? []).find((a) => !a.validTo) ?? e.addresses?.[e.addresses.length - 1]
        const muniVal = (addr?.municipality as { value?: string } | undefined)?.value ?? ''
        const matchesMesto = !mesto || muniVal.toLowerCase().startsWith(mesto.toLowerCase())
        const est = e.establishment
        if (matchesMesto && est && est >= od) {
          const name = e.fullNames?.[e.fullNames.length - 1]?.value ?? '(bez názvu)'
          const key = name + muniVal
          if (seen.has(key)) continue
          seen.add(key)
          const nace = e.statisticalCodes?.mainActivity?.value ?? '?'
          lines.push(`${name} | ${muniVal} | vznik: ${est} | ${nace}`)
        }
      }
    } finally {
      await rm(localPath, { force: true })
    }
  }

  const header = `Nové firmy${mesto ? ` - ${mesto}` : ''} (vznik od ${od})\nZdroj: RPO denné prírastky (batch-daily), vygenerované ${new Date().toISOString()}\nPočet: ${lines.length}\n\n`
  writeFileSync(out, header + lines.join('\n') + '\n', 'utf-8')
  console.log(`Written ${lines.length} firms to ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
