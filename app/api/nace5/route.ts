// app/api/nace5/route.ts
//
// Module A works at RÚZ's native 5-digit NACE granularity (unlike Module
// B, which is limited to RPO's 4-digit codes) - see the data layer design
// spec's NACE-matching decision.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const codes = await prisma.naceCode.findMany({
    select: { kod5: true, nazovSk: true },
    orderBy: { kod5: 'asc' },
  })
  return NextResponse.json({ codes })
}
