// scripts/ingest/nace/csv.ts
//
// Minimal RFC-4180 CSV reader. ŠÚ SR's classification exports quote every
// field and the description columns contain literal newlines and commas
// (whole paragraphs of "táto trieda zahŕňa..."), so splitting on lines or
// commas corrupts the file - it has to be parsed character by character.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // Strip the UTF-8 BOM: left in place it becomes part of the first header
  // name, so a lookup for "codeAcronym" silently misses.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/** Parses a CSV with a header row into objects keyed by column name. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []

  const header = rows[0]
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {}
    header.forEach((name, i) => {
      record[name] = row[i] ?? ''
    })
    return record
  })
}
