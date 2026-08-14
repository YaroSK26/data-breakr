// scripts/ingest/data-sources.ts
import type { PrismaClient } from '@prisma/client'

export async function upsertDataSource(
  prisma: PrismaClient,
  args: { sourceName: string; sourceUrl: string; lastSyncedAt: Date; recordsCount: number }
): Promise<void> {
  await prisma.dataSource.upsert({
    where: { sourceName: args.sourceName },
    create: {
      sourceName: args.sourceName,
      sourceUrl: args.sourceUrl,
      lastSyncedAt: args.lastSyncedAt,
      recordsCount: args.recordsCount,
    },
    update: {
      sourceUrl: args.sourceUrl,
      lastSyncedAt: args.lastSyncedAt,
      recordsCount: args.recordsCount,
    },
  })
}
