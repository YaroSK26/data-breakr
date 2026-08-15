// scripts/ingest/ruz/sync-statements.ts
import type { PrismaClient } from '@prisma/client'
import type { RuzClient } from './client'
import { decodeFinancialFacts } from './decode-tabulky'
import { delay } from '../http'

export async function syncStatements(prisma: PrismaClient, client: RuzClient, since: Date) {
  // The live registeruz.sk API rejects a full ISO-8601 datetime (it returns
  // HTTP 400) and only accepts a bare YYYY-MM-DD date for `zmenene-od`.
  const sinceIso = since.toISOString().slice(0, 10)
  let cursor: number | undefined
  let processed = 0
  let skipped = 0

  while (true) {
    const { ids, hasMore } = await client.listChangedStatementIds(sinceIso, cursor)

    for (const id of ids) {
      try {
        const statement = await client.getStatement(id)

        let structuredVykaz: Awaited<ReturnType<typeof client.getVykaz>> | undefined
        for (const vykazId of statement.idUctovnychVykazov) {
          const vykaz = await client.getVykaz(vykazId)
          if (vykaz.obsah?.tabulky) {
            structuredVykaz = vykaz
            break
          }
        }

        // The report_templates row referenced by financial_statements.id_sablony
        // (a foreign key) must exist BEFORE we upsert the statement that points
        // to it - ensuring the template only *after* upserting the statement
        // guarantees a foreign key violation on any id_sablony not already in
        // the table (which, for a fresh database, is every one of them).
        // Ensure the template first, under the same gate that used to guard
        // the decode step, and only carry idSablony onto the statement when
        // we actually managed to ensure it.
        let template: { idSablony: number; nazov: string; raw: unknown } | null = null
        let templateEnsured = false

        if (
          structuredVykaz?.obsah?.tabulky &&
          structuredVykaz.idSablony &&
          structuredVykaz.pristupnostDat === 'Verejné'
        ) {
          template = await prisma.reportTemplate.findUnique({
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
          templateEnsured = true
        }

        // Only carry idSablony onto the statement once its template row is
        // confirmed to exist - never point the FK at a template we didn't
        // actually ensure this pass.
        const confirmedIdSablony = templateEnsured ? structuredVykaz!.idSablony : undefined

        await prisma.financialStatement.upsert({
          where: { id: BigInt(statement.id) },
          create: {
            id: BigInt(statement.id),
            firmId: BigInt(statement.idUJ),
            obdobieOd: statement.obdobieOd ? new Date(statement.obdobieOd) : undefined,
            obdobieDo: statement.obdobieDo ? new Date(statement.obdobieDo) : undefined,
            typ: statement.typ,
            idSablony: confirmedIdSablony,
            rawTabulky: structuredVykaz?.obsah?.tabulky ?? undefined,
            pristupnostDat: structuredVykaz?.pristupnostDat,
          },
          update: {
            // A statement that previously had a confirmed template but this
            // time doesn't (e.g. it's no longer public, or the structured
            // vykaz is gone) must not keep pointing at the old, now-unverified
            // idSablony - clear it explicitly rather than silently leaving a
            // stale FK in place (same `?? null` reasoning as the other
            // stale-value fixes in this file: a value that can no longer be
            // confirmed must actively clear, not just skip being set).
            idSablony: confirmedIdSablony ?? null,
            rawTabulky: structuredVykaz?.obsah?.tabulky ?? undefined,
            pristupnostDat: structuredVykaz?.pristupnostDat,
          },
        })

        // Only decode and store financial_facts when the source marks the
        // underlying data as public ("Verejné"). The financial_statements row
        // is still tracked above regardless of accessibility. Reuses the
        // template ensured above instead of looking it up again.
        if (templateEnsured) {
          const rawTemplate = (template as unknown as { raw: { tabulky: unknown[] } }).raw
          const decoded = decodeFinancialFacts(
            structuredVykaz!.obsah!.tabulky!,
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
              // A field that now decodes to null (e.g. template mapping
              // regressed) must clear the stored value, not leave a stale
              // number behind while decodeConfidence flips to unmapped.
              trzby: decoded.trzby ?? null,
              naklady: decoded.naklady ?? null,
              vysledokHospodarenia: decoded.vysledokHospodarenia ?? null,
              decodeConfidence: decoded.confidence,
            },
          })
        }

        processed++
      } catch (err) {
        console.error(`Failed to sync statement ${id}:`, err)
        skipped++
      }

      await delay(100)
    }

    if (!hasMore || ids.length === 0) break
    cursor = ids[ids.length - 1]
  }

  return { processed, skipped }
}
