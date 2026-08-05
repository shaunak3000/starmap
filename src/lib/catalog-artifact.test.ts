import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FIELDS_PER_STAR,
  type CatalogManifest,
  type Constellation,
  type StarMeta,
  decodeTier,
} from './catalog-format.ts'
import { fromHalf } from './half-float.ts'

/**
 * Checks the catalogue that is actually committed and shipped.
 *
 * The packed tiers live in the repo rather than being rebuilt on deploy, which
 * means a bad repack would otherwise reach production unchallenged. These tests
 * read the real files, so they run in CI too.
 */

const CATALOG_DIR = path.join(
  fileURLToPath(new URL('../..', import.meta.url)),
  'public',
  'catalog',
)

function readTier(file: string) {
  const buffer = fs.readFileSync(path.join(CATALOG_DIR, file))
  return decodeTier(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  )
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, file), 'utf8')) as T
}

const manifest = readJson<CatalogManifest>('manifest.json')
const meta = readJson<StarMeta[]>('t0.meta.json')
/** Every culture's figures, keyed by culture id. */
const byCulture = new Map(
  manifest.cultures.map((culture) => [culture.id, readJson<Constellation[]>(culture.file)]),
)
const constellations = byCulture.get('modern')!

describe('the committed catalogue', () => {
  it('has every file the app loads on open', () => {
    for (const file of [
      'manifest.json',
      't0.bin',
      't1.bin',
      't2.bin',
      't0.meta.json',
      ...manifest.cultures.map((culture) => culture.file),
    ]) {
      expect(fs.existsSync(path.join(CATALOG_DIR, file)), file).toBe(true)
    }
  })

  it('keeps tier counts in step with the manifest', () => {
    for (const entry of manifest.tiers) {
      expect(readTier(entry.file).count, entry.file).toBe(entry.count)
    }
  })

  it('ships t0 at full precision and the bulk tiers as half floats', () => {
    // t0 is the only tier the CPU indexes into, so it must not be quantised.
    expect(readTier('t0.bin').kind).toBe('detail')
    expect(readTier('t1.bin').kind).toBe('field')
    expect(readTier('t2.bin').kind).toBe('field')
  })

  it('carries all 88 figures', () => {
    expect(constellations).toHaveLength(88)
    expect(manifest.cultures.find((c) => c.id === 'modern')?.constellationCount).toBe(88)
  })
})

describe('positions in the shipped bytes', () => {
  const t0 = readTier('t0.bin')

  it('places Sirius where the catalogue says', () => {
    if (t0.kind !== 'detail') throw new Error('t0 must be a detail tier')

    const sirius = meta.find((m) => m.proper === 'Sirius')
    expect(sirius).toBeDefined()

    const base = sirius!.i * FIELDS_PER_STAR
    const [x, y, z] = [
      t0.attributes[base],
      t0.attributes[base + 1],
      t0.attributes[base + 2],
    ]

    // Verbatim AT-HYG x0/y0/z0 for HIP 32349.
    expect(x).toBeCloseTo(-0.4944, 3)
    expect(y).toBeCloseTo(2.4768, 3)
    expect(z).toBeCloseTo(-0.7584, 3)
    expect(Math.hypot(x, y, z)).toBeCloseTo(2.6371, 3)
  })

  it('keeps every star inside the declared range', () => {
    // The one exception is constellation anchors, kept past the cut on purpose.
    const t2 = readTier('t2.bin')
    if (t2.kind !== 'field') throw new Error('t2 must be a field tier')

    let maxDistance = 0
    for (let i = 0; i < t2.count; i++) {
      const d = Math.hypot(
        fromHalf(t2.positions[i * 3]),
        fromHalf(t2.positions[i * 3 + 1]),
        fromHalf(t2.positions[i * 3 + 2]),
      )
      if (d > maxDistance) maxDistance = d
    }

    // Allow half-float slop at the far edge.
    expect(maxDistance).toBeLessThan(manifest.maxDistancePc * 1.01)
  })

  it('has no NaN or infinite coordinates in the half-float tiers', () => {
    for (const file of ['t1.bin', 't2.bin']) {
      const tier = readTier(file)
      if (tier.kind !== 'field') throw new Error(`${file} must be a field tier`)

      // Sampled rather than exhaustive: a systematic encoding fault would show
      // up immediately, and this keeps the suite fast.
      for (let i = 0; i < tier.count; i += 997) {
        for (let axis = 0; axis < 3; axis++) {
          expect(Number.isFinite(fromHalf(tier.positions[i * 3 + axis])), `${file}@${i}`).toBe(true)
        }
        expect(Number.isFinite(fromHalf(tier.absMag[i])), `${file} absmag @${i}`).toBe(true)
        expect(Number.isFinite(fromHalf(tier.colorIndex[i])), `${file} ci @${i}`).toBe(true)
      }
    }
  })
})

describe('constellation references', () => {
  const t0 = readTier('t0.bin')

  // Every culture indexes into the same t0, so t0 must hold the union of all
  // their stars. Miss one and a figure quietly loses a limb in that culture only.
  it.each([...byCulture.keys()])('resolves every %s figure into t0', (cultureId) => {
    const figures = byCulture.get(cultureId)!
    expect(figures.length).toBeGreaterThan(0)

    for (const constellation of figures) {
      expect(constellation.lines.length, `${cultureId}/${constellation.id}`).toBeGreaterThan(0)
      for (const index of constellation.members) {
        expect(index, `${cultureId}/${constellation.id}`).toBeGreaterThanOrEqual(0)
        expect(index, `${cultureId}/${constellation.id}`).toBeLessThan(t0.count)
      }
    }
  })

  it.each([...byCulture.keys()])('gives every %s figure a name and visibility', (cultureId) => {
    for (const constellation of byCulture.get(cultureId)!) {
      expect(constellation.name, constellation.id).toBeTruthy()
      expect(constellation.visibility.bestMonth).toBeGreaterThanOrEqual(1)
      expect(constellation.visibility.bestMonth).toBeLessThanOrEqual(12)
      expect(['northern', 'southern', 'both']).toContain(constellation.visibility.hemisphere)
    }
  })

  it('carries the Indian nakshatras as a lunar system', () => {
    // The reason Indian is worth shipping: it divides the sky by the Moon's
    // path rather than grouping stars into pictures.
    expect(manifest.cultures.find((culture) => culture.id === 'indian')?.lunarSystem).toBe(true)
    // Aśvinī is the first nakshatra.
    expect(byCulture.get('indian')!.some((c) => c.pronounce?.startsWith('Aśvinī'))).toBe(true)
  })

  it('keeps native names in their own script', () => {
    expect(byCulture.get('chinese')!.some((c) => /[一-鿿]/.test(c.native ?? ''))).toBe(true)
    expect(byCulture.get('indian')!.some((c) => /[ऀ-ॿ]/.test(c.native ?? ''))).toBe(true)
  })

  it('reports a spread matching the member positions', () => {
    if (t0.kind !== 'detail') throw new Error('t0 must be a detail tier')

    const orion = constellations.find((c) => c.id === 'Ori')!
    const distances = orion.members.map((index) => {
      const base = index * FIELDS_PER_STAR
      return Math.hypot(
        t0.attributes[base],
        t0.attributes[base + 1],
        t0.attributes[base + 2],
      )
    })

    expect(Math.min(...distances)).toBeCloseTo(orion.nearestPc, 2)
    expect(Math.max(...distances)).toBeCloseTo(orion.farthestPc, 2)
  })

  it('resolves the stars people recognise', () => {
    const byIndex = new Map(meta.map((m) => [m.i, m]))
    const orion = constellations.find((c) => c.id === 'Ori')!
    const names = orion.members.map((i) => byIndex.get(i)?.proper).filter(Boolean)

    for (const name of ['Betelgeuse', 'Rigel', 'Alnilam', 'Mintaka', 'Alnitak']) {
      expect(names, name).toContain(name)
    }
  })
})
