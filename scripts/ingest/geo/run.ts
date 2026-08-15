// scripts/ingest/geo/run.ts
import { prisma } from '../../../lib/prisma'
import { upsertDataSource } from '../data-sources'
import { syncBoundariesAndPopulation } from './sync-boundaries-population'
import { computeDistrictBoundaries } from './compute-district-boundaries'

async function main() {
  const runStart = new Date()

  console.log('Syncing region/municipality boundaries and population from Eurostat GISCO...')
  const result = await syncBoundariesAndPopulation(prisma)
  console.log(
    `Regions updated: ${result.regionsUpdated}. Municipalities updated: ${result.municipalitiesUpdated} (${result.municipalitiesUnmatched} unmatched).`
  )

  console.log('Dissolving municipality boundaries into district boundaries...')
  const districtResult = await computeDistrictBoundaries(prisma)
  console.log(
    `Districts computed: ${districtResult.computed}/${districtResult.total} (${districtResult.skipped} skipped, no municipality geometry).`
  )

  const totalMunicipalities = await prisma.municipality.count({ where: { population: { not: null } } })
  await upsertDataSource(prisma, {
    sourceName: 'Eurostat GISCO (hranice a populácia)',
    sourceUrl: 'https://gisco-services.ec.europa.eu/distribution/v2/',
    lastSyncedAt: runStart,
    recordsCount: totalMunicipalities,
  })

  console.log('Boundary/population sync complete.')
}

main()
  .catch((err) => {
    console.error('Boundary/population sync failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
