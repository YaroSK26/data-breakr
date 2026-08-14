// scripts/ingest/ruz/sync-statements.ts
import type { PrismaClient } from '@prisma/client'
import type { RuzClient } from './client'
import { decodeFinancialFacts } from './decode-tabulky'

export async function syncStatements(prisma: PrismaClient, client: RuzClient, since: Date) {
  const sinceIso = since.toISOString()
  let cursor: number | undefined
  let processed = 0

  while (true) {
    const { ids, hasMore } = await client.listChangedStatementIds(sinceIso, cursor)

    for (const id of ids) {
      const statement = await client.getStatement(id)

      let structuredVykaz: Awaited<ReturnType<typeof client.getVykaz>> | undefined
      for (const vykazId of statement.idUctovnychVykazov) {
        const vykaz = await client.getVykaz(vykazId)
        if (vykaz.obsah?.tabulky) {
          structuredVykaz = vykaz
          break
        }
      }

      await prisma.financialStatement.upsert({
        where: { id: BigInt(statement.id) },
        create: {
          id: BigInt(statement.id),
          firmId: BigInt(statement.idUJ),
          obdobieOd: statement.obdobieOd ? new Date(statement.obdobieOd) : undefined,
          obdobieDo: statement.obdobieDo ? new Date(statement.obdobieDo) : undefined,
          typ: statement.typ,
          idSablony: structuredVykaz?.idSablony,
          rawTabulky: structuredVykaz?.obsah?.tabulky ?? undefined,
          pristupnostDat: structuredVykaz?.pristupnostDat,
        },
        update: {
          idSablony: structuredVykaz?.idSablony,
          rawTabulky: structuredVykaz?.obsah?.tabulky ?? undefined,
          pristupnostDat: structuredVykaz?.pristupnostDat,
        },
      })

      if (structuredVykaz?.obsah?.tabulky && structuredVykaz.idSablony) {
        let template = await prisma.reportTemplate.findUnique({
          where: { idSablony: structuredVykaz.idSablony },
        })
        if (!template) {
          const sablona = await client.getSablona(structuredVykaz.idSablony)
          await prisma.reportTemplate.upsert({
            where: { idSablony: sablona.id },
            create: { idSablony: sablona.id, nazov: sablona.nazov, raw: sablona as never },
            update: { raw: sablona as never },
          })
          template = { idSablony: sablona.id, nazov: sablona.nazov, raw: sablona } as never
        }

        const rawTemplate = (template as unknown as { raw: { tabulky: unknown[] } }).raw
        const decoded = decodeFinancialFacts(
          structuredVykaz.obsah.tabulky,
          rawTemplate.tabulky as Parameters<typeof decodeFinancialFacts>[1]
        )

        await prisma.financialFacts.upsert({
          where: { statementId: BigInt(statement.id) },
          create: {
            statementId: BigInt(statement.id),
            trzby: decoded.trzby ?? undefined,
            naklady: decoded.naklady ?? undefined,
            vysledokHospodarenia: decoded.vysledokHospodarenia ?? undefined,
            decodeConfidence: decoded.confidence,
          },
          update: {
            trzby: decoded.trzby ?? undefined,
            naklady: decoded.naklady ?? undefined,
            vysledokHospodarenia: decoded.vysledokHospodarenia ?? undefined,
            decodeConfidence: decoded.confidence,
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
