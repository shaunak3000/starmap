import { describe, expect, it } from 'vitest'
import { FIELDS_PER_STAR, type CatalogTier, type Constellation } from './catalog-format.ts'
import { constellationSpread, constellationVantage } from './constellation-view.ts'

/** Builds a tier whose stars sit at the given positions. */
function tierOf(positions: [number, number, number][]): CatalogTier {
  const attributes = new Float32Array(positions.length * FIELDS_PER_STAR)
  positions.forEach(([x, y, z], i) => {
    const base = i * FIELDS_PER_STAR
    attributes[base] = x
    attributes[base + 1] = y
    attributes[base + 2] = z
    attributes[base + 3] = 5
    attributes[base + 4] = 0.6
  })
  return {
    attributes,
    ids: new Uint32Array(positions.length),
    count: positions.length,
  }
}

function constellationOf(members: number[], nearestPc = 0, farthestPc = 0): Constellation {
  return {
    id: 'Tst',
    latin: 'Testus',
    english: 'Test',
    lines: [{ path: members }],
    members,
    missingHip: [],
    nearestPc,
    farthestPc,
  }
}

describe('constellationVantage', () => {
  // Stars strung along +x at very different distances: the shape a real figure
  // has once you stop assuming everything sits on one shell.
  const tier = tierOf([
    [10, 0, 0],
    [100, 1, 0],
    [200, -1, 0],
    [400, 2, 0],
  ])
  const constellation = constellationOf([0, 1, 2, 3])

  it('looks from a direction perpendicular to the sight line', () => {
    const { target, lookFrom } = constellationVantage(constellation, tier)
    const sight = [target[0], target[1], target[2]]
    const length = Math.hypot(...sight)
    const dot = (sight[0] * lookFrom[0] + sight[1] * lookFrom[1] + sight[2] * lookFrom[2]) / length
    expect(Math.abs(dot)).toBeLessThan(1e-6)
  })

  it('returns a unit look direction', () => {
    const { lookFrom } = constellationVantage(constellation, tier)
    expect(Math.hypot(...lookFrom)).toBeCloseTo(1, 10)
  })

  it('targets the midpoint of the Sun-to-figure span', () => {
    const { target, distance } = constellationVantage(constellation, tier)
    // 90th percentile of [10,100,200,400] is 340, so the midpoint is near 170.
    expect(Math.hypot(...target)).toBeCloseTo(170, 0)
    expect(distance).toBeCloseTo(442, 0)
  })

  it('ignores a lone far outlier when framing', () => {
    const withOutlier = tierOf([
      [10, 0, 0],
      [100, 1, 0],
      [200, -1, 0],
      [400, 2, 0],
      [8000, 0, 0],
    ])
    const framed = constellationVantage(constellationOf([0, 1, 2, 3, 4]), withOutlier)
    // Without percentile framing this would be driven to thousands of parsecs.
    expect(framed.distance).toBeLessThan(3000)
  })

  it('keeps a minimum framing distance for tightly packed figures', () => {
    const tight = tierOf([
      [1, 0, 0],
      [1.1, 0.1, 0],
    ])
    expect(constellationVantage(constellationOf([0, 1]), tight).distance).toBeGreaterThan(20)
  })

  it('survives a figure with no members', () => {
    const empty = constellationVantage(constellationOf([]), tier)
    expect(Number.isFinite(empty.distance)).toBe(true)
    expect(Math.hypot(...empty.lookFrom)).toBeCloseTo(1, 10)
  })

  it('stays well conditioned for a figure near the +z pole', () => {
    const polar = tierOf([
      [0, 0, 100],
      [1, 1, 300],
    ])
    const { lookFrom, target } = constellationVantage(constellationOf([0, 1]), polar)
    expect(Math.hypot(...lookFrom)).toBeCloseTo(1, 10)
    for (const component of [...lookFrom, ...target]) {
      expect(Number.isNaN(component)).toBe(false)
    }
  })
})

describe('constellationSpread', () => {
  it('reports the ratio between nearest and farthest members', () => {
    const spread = constellationSpread(constellationOf([0], 2.6, 1537))
    expect(spread.ratio).toBeCloseTo(591, 0)
  })

  it('does not divide by zero when a member sits at the origin', () => {
    expect(constellationSpread(constellationOf([0], 0, 100)).ratio).toBe(
      Number.POSITIVE_INFINITY,
    )
  })
})
