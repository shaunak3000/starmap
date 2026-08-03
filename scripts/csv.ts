/**
 * Fast CSV row splitter.
 *
 * AT-HYG rows are overwhelmingly quote-free, so the common path is a plain
 * split. The quoted path exists because proper names and spectral types are
 * free text and a single stray comma would silently shift every later column.
 */
export function splitCsvRow(line: string): string[] {
  if (!line.includes('"')) return line.split(',')

  const fields: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      fields.push(field)
      field = ''
    } else {
      field += char
    }
  }

  fields.push(field)
  return fields
}

/** Maps a header row to column indices, failing loudly on a schema change. */
export function indexColumns(header: string[], required: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  header.forEach((name, i) => {
    map[name.trim()] = i
  })

  const missing = required.filter((name) => map[name] === undefined)
  if (missing.length > 0) {
    throw new Error(
      `catalogue schema changed: missing column(s) ${missing.join(', ')}. Got: ${header.join(', ')}`,
    )
  }
  return map
}

/** Parses a possibly-empty numeric field. */
export function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Parses a possibly-empty text field. */
export function str(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}
