// scripts/ingest/ruz/sync-entities.ts
import type { PrismaClient } from '@prisma/client'
import type { RuzClient } from './client'

export async function syncFirms(prisma: PrismaClient, client: RuzClient, since: Date) {
  const sinceIso = since.toISOString()
  let cursor: number | undefined
  let processed = 0

  while (true) {
    const { ids, hasMore } = await client.listChangedEntityIds(sinceIso, cursor)

    for (const id of ids) {
      const detail = await client.getEntity(id)

      if (detail.stav === 'NEVEREJNÁ' || detail.stav === 'ZMAZANÉ') {
        await prisma.firm.upsert({
          where: { id: BigInt(id) },
          create: { id: BigInt(id), stav: detail.stav },
          update: { stav: detail.stav },
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
            datumZrusenia: detail.datumZrusenia ? new Date(detail.datumZrusenia) : undefined,
            zdrojDat: detail.zdrojDat,
          },
        })
      }
      processed++
    }

    if (!hasMore) break
    cursor = ids[ids.length - 1]
  }

  return { processed }
}
