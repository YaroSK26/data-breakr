import { prisma } from '../../../lib/prisma'
import { computeRegionBoundaries } from './compute-region-boundaries'

computeRegionBoundaries(prisma)
  .then((result) => {
    console.log(
      `Regions computed: ${result.computed}/${result.total} (${result.skipped} skipped).`,
    )
  })
  .catch((error) => {
    console.error('Region boundary computation failed:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
