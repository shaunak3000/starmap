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
import { epochPosition } from './epoch.ts'

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

  it('carries velocities where stars can be seen moving, and nowhere else', () => {
    // t0 and t1 animate; the faint field does not, because an individual haze
    // star cannot be seen moving and carrying it would add 15 MB.
    expect(readTier('t0.bin').velocities, 't0').toBeDefined()
    expect(readTier('t1.bin').velocities, 't1').toBeDefined()
    expect(readTier('t2.bin').velocities, 't2').toBeUndefined()
  })

  it('keeps every velocity physically possible', () => {
    const t0 = readTier('t0.bin')
    if (t0.kind !== 'detail' || !t0.velocities) throw new Error('t0 must carry velocities')

    let fastest = 0
    for (let i = 0; i < t0.count; i++) {
      const speed = Math.hypot(
        t0.velocities[i * 3],
        t0.velocities[i * 3 + 1],
        t0.velocities[i * 3 + 2],
      )
      expect(Number.isFinite(speed), `star ${i}`).toBe(true)
      if (speed > fastest) fastest = speed
    }

    // Local galactic escape velocity is about 550 km/s; the packer clamps
    // anything past 600, which is where bad radial velocities live.
    expect(fastest).toBeLessThanOrEqual(600.001)
  })

  it('moves a nearby star a believable distance over 100,000 years', () => {
    const t0 = readTier('t0.bin')
    if (t0.kind !== 'detail' || !t0.velocities) throw new Error('t0 must carry velocities')

    const sirius = meta.find((m) => m.proper === 'Sirius')!
    const before = epochPosition(t0, sirius.i, 0)
    const after = epochPosition(t0, sirius.i, 100_000)

    const travelled = Math.hypot(
      after[0] - before[0],
      after[1] - before[1],
      after[2] - before[2],
    )

    // Sirius moves a few parsecs in 100 kyr — comparable to its own 2.6 pc
    // distance, which is why it will not stay the brightest star in our sky.
    expect(travelled).toBeGreaterThan(0.5)
    expect(travelled).toBeLessThan(20)
  })

  it('leaves positions untouched at the present epoch', () => {
    const t0 = readTier('t0.bin')
    if (t0.kind !== 'detail') throw new Error('t0 must be a detail tier')

    for (const index of [0, 100, 2309, t0.count - 1]) {
      const base = index * FIELDS_PER_STAR
      const [x, y, z] = epochPosition(t0, index, 0)
      expect(x).toBe(t0.attributes[base])
      expect(y).toBe(t0.attributes[base + 1])
      expect(z).toBe(t0.attributes[base + 2])
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
