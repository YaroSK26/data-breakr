import { writeFileSync } from 'fs'
import { rm } from 'fs/promises'
import path from 'path'
import os from 'os'
import { listBucketObjects, downloadBucketObject, streamEntitiesFromFile } from './ingest/rpo/bulk-source'

async function main() {
  const od = '2026-08-18'
  const tmpDir = path.join(os.tmpdir(), 'rpo-kosice-ico')
  await import('fs/promises').then((fs) => fs.mkdir(tmpDir, { recursive: true }))

  const all = await listBucketObjects('batch-daily/')
  const relevant = all.filter((o) => o.key.endsWith('.json.gz') && o.key >= `batch-daily/actual_${od}`)

  const seen = new Set<string>()
  const rows: string[] = []

  for (const file of relevant) {
    const localPath = path.join(tmpDir, path.basename(file.key))
    try {
      await downloadBucketObject(file.key, localPath)
      for await (const e of streamEntitiesFromFile(localPath)) {
        const addr = (e.addresses ?? []).find((a) => !a.validTo) ?? e.addresses?.[e.addresses.length - 1]
        const muniVal = (addr?.municipality as { value?: string } | undefined)?.value ?? ''
        if (!muniVal.toLowerCase().startsWith('košice')) continue
        const est = e.establishment
        if (!est || est < od) continue
        const name = e.fullNames?.[e.fullNames.length - 1]?.value ?? '(bez názvu)'
        const ico = e.identifiers?.[0]?.value ?? ''
        const key = name + muniVal
        if (seen.has(key)) continue
        seen.add(key)
        rows.push(`${ico}\t${name}\t${muniVal}\t${est}`)
      }
    } finally {
      await rm(localPath, { force: true })
    }
  }

  writeFileSync('scripts/_kosice-with-ico.tsv', 'ico\tnazov\tmesto\tvznik\n' + rows.join('\n') + '\n', 'utf-8')
  console.log(`Written ${rows.length} rows.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
