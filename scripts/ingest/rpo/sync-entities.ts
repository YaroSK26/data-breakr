// scripts/ingest/rpo/sync-entities.ts
import type { PrismaClient } from '@prisma/client'
import type { RpoClient } from './client'
import { delay } from '../http'

export async function syncBusinessEntities(prisma: PrismaClient, client: RpoClient) {
  const municipalities = await prisma.municipality.findMany({
    include: { district: true },
  })

  let processed = 0
  let skipped = 0

  for (const muni of municipalities) {
    const results = await client.searchByMunicipality(muni.kod)

    for (const result of results) {
      try {
        const detail = await client.getEntity(result.id)
        const ico = detail.identifiers[0]?.value
        const nazov = detail.fullNames[detail.fullNames.length - 1]?.value
        const naceKod4 = detail.statisticalCodes?.mainActivity?.code
        const pravnaFormaKod = detail.legalForms?.[detail.legalForms.length - 1]?.value.code

        await prisma.businessEntity.upsert({
          where: { id: BigInt(detail.id) },
          create: {
            id: BigInt(detail.id),
            ico,
            nazov,
            municipalityKod: muni.kod,
            okresKod: muni.districtKod,
            krajKod: (muni as unknown as { district: { regionKod: string } }).district.regionKod,
            naceKod4,
            pravnaFormaKod,
            datumVzniku: detail.establishment ? new Date(detail.establishment) : undefined,
            datumZaniku: detail.termination ? new Date(detail.termination) : undefined,
            zdrojDat: 'RPO',
          },
          update: {
            ico,
            nazov,
            naceKod4,
            pravnaFormaKod,
            // recompute-density.ts uses datumZaniku as the active/inactive
            // filter, so a cleared termination date on the source must
            // actually clear it locally rather than leaving the entity
            // stuck as inactive (or vice versa).
            datumZaniku: detail.termination ? new Date(detail.termination) : null,
          },
        })
        processed++
      } catch (err) {
        console.error(`Failed to sync business entity ${result.id}:`, err)
        skipped++
      }
    }

    await delay(250)
  }

  return { processed, skipped }
}
