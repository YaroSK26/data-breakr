// scripts/ingest/ruz/sync-entities.ts
import type { PrismaClient } from '@prisma/client'
import type { RuzClient } from './client'
import { delay } from '../http'

export async function syncFirms(prisma: PrismaClient, client: RuzClient, since: Date) {
  // The live registeruz.sk API rejects a full ISO-8601 datetime (it returns
  // HTTP 400) and only accepts a bare YYYY-MM-DD date for `zmenene-od`.
  const sinceIso = since.toISOString().slice(0, 10)
  let cursor: number | undefined
  let processed = 0
  let skipped = 0

  while (true) {
    const { ids, hasMore } = await client.listChangedEntityIds(sinceIso, cursor)

    for (const id of ids) {
      try {
        const detail = await client.getEntity(id)

        if (detail.stav === 'NEVEREJNÁ' || detail.stav === 'ZMAZANÉ') {
          // Entity has gone private/deleted. It may have been public (and fully
          // populated) before, so explicitly null out everything except id/stav
          // rather than leaving stale, no-longer-public data in place.
          await prisma.firm.upsert({
            where: { id: BigInt(id) },
            create: { id: BigInt(id), stav: detail.stav },
            update: {
              stav: detail.stav,
              ico: null,
              dic: null,
              nazov: null,
              ulica: null,
              mesto: null,
              psc: null,
              krajKod: null,
              okresKod: null,
              naceKod5: null,
              pravnaForma: null,
              velkostOrganizacie: null,
              datumZalozenia: null,
              datumZrusenia: null,
              zdrojDat: null,
            },
          })
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
              datumZalozenia: detail.datumZalozenia ? new Date(detail.datumZalozenia) : undefined,
              datumZrusenia: detail.datumZrusenia ? new Date(detail.datumZrusenia) : undefined,
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
              datumZalozenia: detail.datumZalozenia ? new Date(detail.datumZalozenia) : undefined,
              // A cleared dissolution date on the source must actually clear it
              // locally, not silently leave the previous value in place.
              datumZrusenia: detail.datumZrusenia ? new Date(detail.datumZrusenia) : null,
              zdrojDat: detail.zdrojDat,
            },
          })
        }
        processed++
      } catch (err) {
        console.error(`Failed to sync firm ${id}:`, err)
        skipped++
      }

      await delay(100)
    }

    if (!hasMore || ids.length === 0) break
    cursor = ids[ids.length - 1]
  }

  return { processed, skipped }
}
