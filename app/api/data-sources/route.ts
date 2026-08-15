// app/api/data-sources/route.ts
//
// Per CLAUDE.md's standing rule: every data-backed section must show its
// source and last-updated date read from data_sources, never hardcoded.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const sources = await prisma.dataSource.findMany({
    orderBy: { sourceName: 'asc' },
  })

  return NextResponse.json({ sources })
}
