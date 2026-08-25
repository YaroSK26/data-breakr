// app/api/cron/rpo-daily/route.ts
//
// Triggered once a day by Vercel Cron (see vercel.json). Applies RPO's
// daily incremental batches since our last sync, across the whole of
// Slovakia, then recomputes density + stats so the live site reflects the
// new entities - the same logic as `npm run ingest:rpo-daily`, just
// reachable over HTTP for the scheduler to call.
//
// Vercel signs its own cron requests with `Authorization: Bearer
// $CRON_SECRET` automatically once CRON_SECRET is set as an env var - this
// route rejects any request that doesn't present that same secret, so it
// can't be triggered by a random public POST.
import { NextResponse } from 'next/server'
import os from 'os'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { upsertDataSource } from '@/scripts/ingest/data-sources'
import { syncBusinessEntitiesDaily } from '@/scripts/ingest/rpo/sync-entities-daily'
import { recomputeDensity } from '@/scripts/ingest/rpo/recompute-density'
import { recomputeStats } from '@/scripts/ingest/rpo/recompute-stats'

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runStart = new Date()
  const tmpDir = path.join(os.tmpdir(), 'rpo-daily-import')

  const existing = await prisma.dataSource.findUnique({ where: { sourceName: 'RPO' } })
  if (!existing?.lastSyncedAt) {
    return NextResponse.json({ error: 'No RPO data_sources row (with a lastSyncedAt) - run the full bulk import first.' }, { status: 500 })
  }
  const sinceDate = existing.lastSyncedAt.toISOString().slice(0, 10)

  const result = await syncBusinessEntitiesDaily(prisma, tmpDir, sinceDate)

  if (result.filesApplied > 0) {
    await recomputeDensity(prisma)
    await recomputeStats(prisma)
  }

  const totalEntities = await prisma.businessEntity.count()
  await upsertDataSource(prisma, {
    sourceName: 'RPO',
    sourceUrl: 'https://rpo.statistics.sk',
    lastSyncedAt: runStart,
    recordsCount: totalEntities,
  })

  return NextResponse.json({ ok: true, sinceDate, ...result, totalEntities })
}
