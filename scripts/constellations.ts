/**
 * Parses Stellarium sky-culture JSON into HIP-keyed polylines.
 *
 * Stellarium stores each figure as a list of polylines (arrays of HIP ids),
 * which is exactly what a line renderer wants. The format is shared across all
 * 56 shipped cultures, but the *content* is not: ids are only IAU codes in the
 * Western set ("CON modern Ori" versus "CON chinese 001"), and names outside it
 * carry native script and pronunciation that the Western set omits.
 */

export interface RawConstellation {
  /** Stable key within a culture. An IAU abbreviation only in the modern set. */
  id: string
  /** Best display name: native where present, else English. */
  name: string
  english?: string
  native?: string
  pronounce?: string
  /** Polylines of HIP ids. */
  lines: number[][]
  /** Every HIP id referenced by this figure, deduplicated. */
  hips: number[]
}

export interface RawSkyCulture {
  id: string
  constellations: RawConstellation[]
  /**
   * True where the culture defines a lunar mansion system — the Indian
   * nakshatras, Chinese xiu and Arabic manazil all do. It means the culture
   * *has* one, not that its whole sky is organised around it: the Chinese set
   * is still primarily 309 asterisms.
   */
  lunarSystem: boolean
  classification?: string
  region?: string
}

interface StellariumCommonName {
  english?: string
  native?: string
  pronounce?: string
  transliteration?: string
}

interface StellariumConstellation {
  id?: string
  lines?: unknown
  common_name?: StellariumCommonName
}

interface StellariumIndex {
  id?: string
  region?: string
  classification?: string
  lunar_system?: unknown
  constellations?: StellariumConstellation[]
}

/** "CON modern Ori" -> "Ori"; "CON chinese 001" -> "001". */
function idFromStellarium(id: string): string {
  const parts = id.trim().split(/\s+/)
  return parts[parts.length - 1]
}

function toPolylines(lines: unknown): number[][] {
  if (!Array.isArray(lines)) return []

  const polylines: number[][] = []
  for (const line of lines) {
    if (!Array.isArray(line)) continue
    const path = line.filter((hip): hip is number => typeof hip === 'number' && hip > 0)
    // A polyline needs two endpoints to draw anything.
    if (path.length >= 2) polylines.push(path)
  }
  return polylines
}

export function parseStellariumSkyCulture(json: string, cultureId?: string): RawSkyCulture {
  const index = JSON.parse(json) as StellariumIndex
  const source = index.constellations
  if (!Array.isArray(source) || source.length === 0) {
    throw new Error('sky culture has no constellations array')
  }

  const constellations: RawConstellation[] = []

  for (const entry of source) {
    if (typeof entry.id !== 'string') continue

    const lines = toPolylines(entry.lines)
    if (lines.length === 0) continue

    const id = idFromStellarium(entry.id)
    const native = entry.common_name?.native

    // Stellarium occasionally leaves its own internal label in the English
    // field — the Indian set has one figure named "C01". That is a placeholder,
    // not a name, and showing it in a picker tells the viewer nothing. The
    // figure itself is real, so it is kept and labelled honestly instead.
    const rawEnglish = entry.common_name?.english
    const english = rawEnglish === id ? undefined : rawEnglish
    // Transliteration is a reasonable stand-in where a culture gives no
    // pronunciation guide but does romanise the name.
    const pronounce = entry.common_name?.pronounce ?? entry.common_name?.transliteration

    constellations.push({
      id,
      // The native name is the culture's own; English is the translation. Lead
      // with the native one where it exists, since that is the actual name.
      name: native ?? english ?? `Unnamed (${id})`,
      ...(english ? { english } : {}),
      ...(native ? { native } : {}),
      ...(pronounce ? { pronounce } : {}),
      lines,
      hips: [...new Set(lines.flat())],
    })
  }

  return {
    id: cultureId ?? index.id ?? 'unknown',
    constellations,
    lunarSystem: Boolean(index.lunar_system),
    ...(index.classification ? { classification: index.classification } : {}),
    ...(index.region ? { region: index.region } : {}),
  }
}

/** Every HIP id referenced by any figure — these are force-kept by the packer. */
export function collectConstellationHips(constellations: RawConstellation[]): Set<number> {
  const hips = new Set<number>()
  for (const constellation of constellations) {
    for (const hip of constellation.hips) hips.add(hip)
  }
  return hips
}
