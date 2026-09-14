// app/api/cron/rpo-daily/route.ts
//
// Applies RPO's daily incremental batches since our last sync, across the
// whole of Slovakia, then recomputes density + stats so the live site
// reflects the new entities - the same logic as `npm run ingest:rpo-daily`,
// just reachable over HTTP.
//
// POZOR: toto UŽ NIE JE denný spúšťač. Vercel Cron ho volal každý deň o
// 03:17, ale `maxDuration` je 60 s (na Hobby pláne strop, zdvihnúť sa nedá)
// a jedna denná dávka má 2-3 tisíc subjektov plus prepočet hustoty cez 26
// tisíc území - do minúty sa to nezmestilo ani raz. Funkcia spadla na
// timeout vždy, takže sa `lastSyncedAt` nikdy neposunul a rozsah ďalšieho
// behu sa každý deň zväčšoval. Denný beh teraz robí GitHub Actions
// (.github/workflows/ingest-rpo-daily.yml), kde časový strop nie je.
//
// Endpoint ostáva na ručné dobehnutie malého sklzu (jedna-dve dávky), keď
// sa nechce čakať na workflow - na väčší rozsah použi workflow alebo
// `npm run ingest:rpo-daily` lokálne.
//
// Volanie sa autentizuje hlavičkou `Authorization: Bearer $CRON_SECRET` -
// route odmietne každú požiadavku, ktorá ten istý secret nepredloží, takže
// ju nevie spustiť náhodný verejný request.
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
