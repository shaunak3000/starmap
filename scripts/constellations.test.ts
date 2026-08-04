import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { collectConstellationHips, parseStellariumSkyCulture } from './constellations.ts'
import { RAW_DIR } from './sources.ts'

const FIXTURE = JSON.stringify({
  constellations: [
    {
      id: 'CON modern Ori',
      lines: [
        [26727, 26311, 25930],
        [25930, 24436],
      ],
      common_name: { english: 'Hunter', native: 'Orion' },
    },
    {
      id: 'CON modern UMa',
      lines: [[54061, 53910]],
      common_name: { native: 'Ursa Major' },
    },
    { id: 'CON modern Bad', lines: [[1]] },
    { id: 'CON modern Empty', lines: [] },
  ],
})

describe('parseStellariumSkyCulture', () => {
  it('extracts abbreviation, names and polylines', () => {
    const [orion] = parseStellariumSkyCulture(FIXTURE)
    expect(orion.abbreviation).toBe('Ori')
    expect(orion.latin).toBe('Orion')
    expect(orion.english).toBe('Hunter')
    expect(orion.lines).toEqual([
      [26727, 26311, 25930],
      [25930, 24436],
    ])
  })

  it('deduplicates HIP ids shared between polylines', () => {
    const [orion] = parseStellariumSkyCulture(FIXTURE)
    expect(orion.hips).toEqual([26727, 26311, 25930, 24436])
  })

  it('falls back to the Latin name when English is absent', () => {
    const uma = parseStellariumSkyCulture(FIXTURE).find((c) => c.abbreviation === 'UMa')!
    expect(uma.english).toBe('Ursa Major')
  })

  it('drops figures whose polylines are too short to draw', () => {
    const ids = parseStellariumSkyCulture(FIXTURE).map((c) => c.abbreviation)
    expect(ids).not.toContain('Bad')
    expect(ids).not.toContain('Empty')
  })

  it('throws when the sky culture has no constellations', () => {
    expect(() => parseStellariumSkyCulture('{}')).toThrow(/no constellations/)
  })
})

describe('collectConstellationHips', () => {
  it('unions HIP ids across figures', () => {
    const hips = collectConstellationHips(parseStellariumSkyCulture(FIXTURE))
    expect(hips.has(26727)).toBe(true)
    expect(hips.has(54061)).toBe(true)
    expect(hips.size).toBe(6)
  })
})

// Guards against upstream restructuring the real file we pinned. Only runs
// where the raw download exists — CI builds from the committed catalogue and
// never fetches it. The read has to be lazy: `describe.runIf` still executes
// the callback to collect tests, so an eager readFileSync throws even when the
// suite is going to be skipped.
const realSkyCulture = path.join(RAW_DIR, 'stellarium-modern.json')
describe.runIf(fs.existsSync(realSkyCulture))('the pinned Stellarium sky culture', () => {
  let parsed: ReturnType<typeof parseStellariumSkyCulture>

  beforeAll(() => {
    parsed = parseStellariumSkyCulture(fs.readFileSync(realSkyCulture, 'utf8'))
  })

  it('yields all 88 IAU constellations', () => {
    expect(parsed).toHaveLength(88)
  })

  it('gives every figure a three-letter abbreviation', () => {
    for (const constellation of parsed) {
      expect(constellation.abbreviation).toMatch(/^[A-Z][A-Za-z]{2}$/)
    }
  })

  it('includes Orion with a plausible figure', () => {
    const orion = parsed.find((c) => c.abbreviation === 'Ori')!
    expect(orion.latin).toBe('Orion')
    // Betelgeuse (27989) and Rigel (24436) both anchor the figure.
    expect(orion.hips).toContain(27989)
    expect(orion.hips).toContain(24436)
  })

  it('references a few thousand distinct stars in total', () => {
    const hips = collectConstellationHips(parsed)
    expect(hips.size).toBeGreaterThan(500)
    expect(hips.size).toBeLessThan(5000)
  })
})
