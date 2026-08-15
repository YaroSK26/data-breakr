// lib/prisma.ts
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { config as loadEnv } from 'dotenv'

// Next.js auto-loads .env.local, but the ingestion scripts under
// scripts/ingest/ run via bare `tsx` and get no automatic env loading, so
// DATABASE_URL would otherwise be undefined outside the Next.js runtime.
// CI supplies these vars directly via GitHub Actions secrets, so this is a
// local-dev-only concern, but it must not silently fall back to whatever
// default connectionString the pg driver picks in that case.
if (!process.env.DATABASE_URL) {
  loadEnv({ path: '.env.local' })
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
