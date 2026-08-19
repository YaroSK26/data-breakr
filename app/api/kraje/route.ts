// app/api/kraje/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const regions = await prisma.region.findMany({
    select: { kod: true, nazovSk: true },
    orderBy: { nazovSk: 'asc' },
  })
  return NextResponse.json({ regions })
}
