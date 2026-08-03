import { LY_PER_PC, apparentMagnitude, bvToRgb, bvToTemperature } from './astro.ts'
import { FIELDS_PER_STAR, type StarMeta } from './catalog-format.ts'
import { type LoadedCatalog, starLabel } from './catalog-loader.ts'

export interface StarInfo {
  index: number
  label: string
  meta: StarMeta | undefined
  position: [number, number, number]
  distancePc: number
  distanceLy: number
  absMag: number
  /** Apparent magnitude from the Sun. */
  appMag: number
  colorIndex: number
  temperatureK: number
  /** CSS colour for a swatch, matching what the shader draws. */
  swatch: string
  designations: string[]
}

/** Reads everything the UI needs about a tier-0 star. */
export function starInfo(catalog: LoadedCatalog, index: number): StarInfo | null {
  const { t0, metaByIndex } = catalog
  if (index < 0 || index >= t0.count) return null

  const base = index * FIELDS_PER_STAR
  const x = t0.attributes[base]
  const y = t0.attributes[base + 1]
  const z = t0.attributes[base + 2]
  const absMag = t0.attributes[base + 3]
  const colorIndex = t0.attributes[base + 4]

  const distancePc = Math.hypot(x, y, z)
  const meta = metaByIndex.get(index)

  const [r, g, b] = bvToRgb(colorIndex)
  const swatch = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`

  const designations: string[] = []
  if (meta?.bayer && meta.con) designations.push(`${meta.bayer} ${meta.con}`)
  if (meta?.flam && meta.con) designations.push(`${meta.flam} ${meta.con}`)
  if (meta?.hip !== undefined) designations.push(`HIP ${meta.hip}`)
  if (meta?.hd !== undefined) designations.push(`HD ${meta.hd}`)

  return {
    index,
    label: starLabel(meta),
    meta,
    position: [x, y, z],
    distancePc,
    distanceLy: distancePc * LY_PER_PC,
    absMag,
    // Prefer the catalogued apparent magnitude; fall back to deriving it.
    appMag: meta?.mag ?? apparentMagnitude(absMag, distancePc),
    colorIndex,
    temperatureK: bvToTemperature(colorIndex),
    swatch,
    designations: [...new Set(designations)],
  }
}

export interface SearchHit {
  index: number
  label: string
  detail: string
}

/**
 * Substring search over star names and designations, ranked so that a prefix
 * match on a proper name beats an incidental match inside a catalogue number.
 */
export function searchStars(catalog: LoadedCatalog, query: string, limit = 8): SearchHit[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []

  const scored: { hit: SearchHit; score: number }[] = []

  for (const meta of catalog.meta) {
    const candidates: [string, number][] = []
    if (meta.proper) candidates.push([meta.proper, 0])
    if (meta.bayer && meta.con) candidates.push([`${meta.bayer} ${meta.con}`, 1])
    if (meta.flam && meta.con) candidates.push([`${meta.flam} ${meta.con}`, 2])
    if (meta.hip !== undefined) candidates.push([`HIP ${meta.hip}`, 3])
    if (meta.hd !== undefined) candidates.push([`HD ${meta.hd}`, 4])

    let best: number | null = null
    for (const [text, rank] of candidates) {
      const position = text.toLowerCase().indexOf(needle)
      if (position === -1) continue
      // Earlier matches in shorter, higher-ranked fields win.
      const score = rank * 100 + position * 10 + text.length * 0.1
      if (best === null || score < best) best = score
    }

    if (best !== null) {
      scored.push({
        hit: {
          index: meta.i,
          label: starLabel(meta),
          detail: [meta.con, meta.spect, `mag ${meta.mag.toFixed(1)}`]
            .filter(Boolean)
            .join(' · '),
        },
        score: best,
      })
    }
  }

  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((entry) => entry.hit)
}
