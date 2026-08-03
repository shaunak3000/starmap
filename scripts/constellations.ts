/**
 * Parses the Stellarium sky-culture JSON into HIP-keyed polylines.
 *
 * Stellarium stores each figure as a list of polylines (arrays of HIP ids), not
 * as disconnected segments, which is exactly what a line renderer wants.
 */

export interface RawConstellation {
  /** Three-letter IAU abbreviation, derived from the Stellarium id. */
  abbreviation: string
  latin: string
  english: string
  /** Polylines of HIP ids. */
  lines: number[][]
  /** Every HIP id referenced by this figure, deduplicated. */
  hips: number[]
}

interface StellariumCommonName {
  english?: string
  native?: string
}

interface StellariumConstellation {
  id?: string
  lines?: unknown
  common_name?: StellariumCommonName
}

interface StellariumIndex {
  constellations?: StellariumConstellation[]
}

/** "CON modern Ori" -> "Ori". */
function abbreviationFromId(id: string): string {
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

export function parseStellariumSkyCulture(json: string): RawConstellation[] {
  const index = JSON.parse(json) as StellariumIndex
  const source = index.constellations
  if (!Array.isArray(source) || source.length === 0) {
    throw new Error('sky culture has no constellations array')
  }

  const result: RawConstellation[] = []

  for (const entry of source) {
    if (typeof entry.id !== 'string') continue

    const lines = toPolylines(entry.lines)
    if (lines.length === 0) continue

    const abbreviation = abbreviationFromId(entry.id)
    const latin = entry.common_name?.native ?? abbreviation
    const english = entry.common_name?.english ?? latin

    const hips = [...new Set(lines.flat())]

    result.push({ abbreviation, latin, english, lines, hips })
  }

  return result
}

/** Every HIP id referenced by any figure — these are force-kept by the packer. */
export function collectConstellationHips(constellations: RawConstellation[]): Set<number> {
  const hips = new Set<number>()
  for (const constellation of constellations) {
    for (const hip of constellation.hips) hips.add(hip)
  }
  return hips
}
