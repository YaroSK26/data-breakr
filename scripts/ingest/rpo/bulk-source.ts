// scripts/ingest/rpo/bulk-source.ts
//
// RPO publishes a full-register bulk export alongside its per-entity REST
// API, documented at https://rpo.minv.sk/rpo-api-doc.html: monthly full
// snapshots (`batch-init/`) and daily incrementals (`batch-daily/`), both
// gzipped JSON, in a publicly readable S3-compatible bucket. Discovered
// while looking for a faster alternative to the municipality-by-municipality
// REST crawl (which has to make one HTTP request per municipality per
// entity and is limited to 500 results per municipality search with no
// working pagination). This bulk source has neither limitation - the whole
// register is a fixed, known set of files.
import { createReadStream, createWriteStream } from 'fs'
import { rm } from 'fs/promises'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import zlib from 'zlib'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import { pick } from 'stream-json/filters/pick.js'
import { streamArray } from 'stream-json/streamers/stream-array.js'
import type { RpoEntityDetail } from './types'

const BUCKET_BASE = 'https://frkqbrydxwdp.compat.objectstorage.eu-frankfurt-1.oraclecloud.com/susr-rpo'

export interface BucketObject {
  key: string
  size: number
}

export async function listBucketObjects(prefix: string): Promise<BucketObject[]> {
  const res = await fetch(`${BUCKET_BASE}/?list-type=2&prefix=${encodeURIComponent(prefix)}`)
  if (!res.ok) throw new Error(`Failed to list bucket objects at prefix "${prefix}": ${res.status}`)
  const xml = await res.text()

  const objects: BucketObject[] = []
  const entryRe = /<Contents>([\s\S]*?)<\/Contents>/g
  let entry: RegExpExecArray | null
  while ((entry = entryRe.exec(xml))) {
    const key = entry[1].match(/<Key>([^<]+)<\/Key>/)?.[1]
    const size = entry[1].match(/<Size>(\d+)<\/Size>/)?.[1]
    if (key && size) objects.push({ key, size: Number(size) })
  }
  return objects
}

// The bucket keeps every past init batch, not just the latest - a full
// monthly snapshot plus whatever daily batches have accumulated since. We
// only want the most recent complete snapshot, identified by the date
// embedded in the filename (init_YYYY-MM-DD_NNN.json.gz).
export async function findLatestInitBatchFiles(): Promise<BucketObject[]> {
  const all = await listBucketObjects('batch-init/')
  const jsonFiles = all.filter((o) => o.key.endsWith('.json.gz'))

  const dateOf = (key: string) => key.match(/init_(\d{4}-\d{2}-\d{2})_/)?.[1] ?? ''
  const latestDate = jsonFiles.reduce((max, o) => (dateOf(o.key) > max ? dateOf(o.key) : max), '')

  return jsonFiles.filter((o) => dateOf(o.key) === latestDate).sort((a, b) => a.key.localeCompare(b.key))
}

// Caller is responsible for ensuring destPath's parent directory exists.
export async function downloadBucketObject(key: string, destPath: string): Promise<void> {
  const res = await fetch(`${BUCKET_BASE}/${key}`)
  if (!res.ok || !res.body) throw new Error(`Failed to download ${key}: ${res.status}`)
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destPath))
}

export async function deleteFile(path: string): Promise<void> {
  await rm(path, { force: true })
}

// Streams entities out of one downloaded `init_*.json.gz` / `actual_*.json.gz`
// file without ever holding the whole (decompressed, potentially 300MB+)
// file in memory - the files are shaped `{"exportDate": "...", "results":
// [ ...entities... ]}`, and each entity matches the same shape as the
// per-ID REST endpoint (`RpoEntityDetail`), so downstream processing is
// identical regardless of which source produced it.
export async function* streamEntitiesFromFile(filePath: string): AsyncGenerator<RpoEntityDetail> {
  const pipelineStream = chain([
    createReadStream(filePath),
    zlib.createGunzip(),
    parser(),
    pick({ filter: 'results' }),
    streamArray(),
  ])

  for await (const { value } of pipelineStream as AsyncIterable<{ value: RpoEntityDetail }>) {
    yield value
  }
}
