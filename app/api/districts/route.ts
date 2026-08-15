// app/api/districts/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const districts = await prisma.district.findMany({
    select: { kod: true, nazovSk: true, regionKod: true },
    orderBy: { nazovSk: 'asc' },
  })
  return NextResponse.json({ districts })
}
