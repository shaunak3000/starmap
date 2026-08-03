import { describe, expect, it } from 'vitest'
import {
  EQUATORIAL_TO_GALACTIC,
  absoluteMagnitude,
  apparentMagnitude,
  bvToTemperature,
  cartesianToEquatorial,
  equatorialToCartesian,
  equatorialToGalactic,
  parsecsToLightYears,
  spectralTypeToBv,
  temperatureToRgb,
} from './astro.ts'

describe('equatorialToCartesian', () => {
  it('places RA 0h Dec 0deg on the +x axis', () => {
    const [x, y, z] = equatorialToCartesian(0, 0, 10)
    expect(x).toBeCloseTo(10, 10)
    expect(y).toBeCloseTo(0, 10)
    expect(z).toBeCloseTo(0, 10)
  })

  it('places RA 6h Dec 0deg on the +y axis', () => {
    const [x, y, z] = equatorialToCartesian(6, 0, 10)
    expect(x).toBeCloseTo(0, 10)
    expect(y).toBeCloseTo(10, 10)
    expect(z).toBeCloseTo(0, 10)
  })

  it('places the north celestial pole on the +z axis', () => {
    const [x, y, z] = equatorialToCartesian(0, 90, 10)
    expect(x).toBeCloseTo(0, 10)
    expect(y).toBeCloseTo(0, 10)
    expect(z).toBeCloseTo(10, 10)
  })

  // Cross-checks against verbatim AT-HYG v4 rows: if our trigonometry drifts
  // from the catalogue's own x0/y0/z0, the whole pipeline is suspect.
  it.each([
    { name: 'Sirius', ra: 6.7525694, dec: -16.71314306, dist: 2.6371, x0: -0.4944, y0: 2.4768, z0: -0.7584 },
    { name: 'Rigel', ra: 5.24229757, dec: -8.20163919, dist: 264.5503, x0: 51.6011, y0: 256.7097, z0: -37.74 },
    { name: 'Betelgeuse', ra: 5.91952477, dec: 7.40703634, dist: 152.6718, x0: 3.1895, y0: 151.3642, z0: 19.682 },
  ])('matches the AT-HYG x0/y0/z0 columns for $name', ({ ra, dec, dist, x0, y0, z0 }) => {
    const [x, y, z] = equatorialToCartesian(ra, dec, dist)
    expect(x).toBeCloseTo(x0, 3)
    expect(y).toBeCloseTo(y0, 3)
    expect(z).toBeCloseTo(z0, 3)
    expect(Math.hypot(x, y, z)).toBeCloseTo(dist, 3)
  })

  it('round-trips through cartesianToEquatorial', () => {
    for (const [ra, dec, dist] of [
      [0, 0, 1],
      [5.5, 41.2, 137.5],
      [18.25, -63.4, 812.0],
      [23.99, 89.0, 40.0],
    ]) {
      const back = cartesianToEquatorial(equatorialToCartesian(ra, dec, dist))
      expect(back.raHours).toBeCloseTo(ra, 8)
      expect(back.decDeg).toBeCloseTo(dec, 8)
      expect(back.distPc).toBeCloseTo(dist, 8)
    }
  })

  it('normalises negative RA from the round trip into [0, 24)', () => {
    const back = cartesianToEquatorial(equatorialToCartesian(23, -10, 5))
    expect(back.raHours).toBeGreaterThanOrEqual(0)
    expect(back.raHours).toBeLessThan(24)
    expect(back.raHours).toBeCloseTo(23, 8)
  })
})

describe('EQUATORIAL_TO_GALACTIC', () => {
  it('is orthonormal', () => {
    const m = EQUATORIAL_TO_GALACTIC
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const dot =
          m[r * 3] * m[c * 3] + m[r * 3 + 1] * m[c * 3 + 1] + m[r * 3 + 2] * m[c * 3 + 2]
        expect(dot).toBeCloseTo(r === c ? 1 : 0, 12)
      }
    }
  })

  it('maps Sgr A* to within 0.1 degrees of the +x axis', () => {
    // Sgr A*: RA 17h45m40.04s, Dec -29d00m28.1s (J2000). It lands near, but not
    // exactly on, (l=0, b=0): the IAU 1958 galactic frame was fixed before the
    // true dynamical centre was pinned down, leaving Sgr A* about 0.06deg off.
    const sgrA = equatorialToCartesian(17 + 45 / 60 + 40.04 / 3600, -(29 + 28.1 / 3600), 1)
    const [x, y, z] = equatorialToGalactic(sgrA)

    const offsetDeg = Math.hypot(y, z) * (180 / Math.PI)
    expect(x).toBeGreaterThan(0.999)
    expect(offsetDeg).toBeLessThan(0.1)
    expect(offsetDeg).toBeGreaterThan(0.01)
  })

  it('maps the north galactic pole to the +z axis', () => {
    const [x, y, z] = equatorialToGalactic(equatorialToCartesian(192.85948 / 15, 27.12825, 1))
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(1, 6)
  })

  it('preserves distance', () => {
    const v = equatorialToCartesian(9.3, 22.7, 415)
    const g = equatorialToGalactic(v)
    expect(Math.hypot(...g)).toBeCloseTo(415, 6)
  })
})

describe('magnitudes', () => {
  it('makes apparent and absolute magnitude equal at 10 parsecs', () => {
    expect(apparentMagnitude(4.83, 10)).toBeCloseTo(4.83, 12)
  })

  it('reproduces the Sun: absmag 4.83 at 1 AU is about -26.7', () => {
    const oneAu = 1 / 206264.806
    expect(apparentMagnitude(4.83, oneAu)).toBeCloseTo(-26.73, 1)
  })

  it('dims by exactly 5 magnitudes per factor of 10 in distance', () => {
    expect(apparentMagnitude(0, 100) - apparentMagnitude(0, 10)).toBeCloseTo(5, 12)
  })

  it('inverts itself', () => {
    expect(absoluteMagnitude(apparentMagnitude(1.4, 260), 260)).toBeCloseTo(1.4, 10)
  })

  it('reproduces the AT-HYG absmag column', () => {
    // Verbatim catalogue rows: mag, dist -> absmag.
    expect(absoluteMagnitude(0.283, 264.5503)).toBeCloseTo(-6.83, 2) // Rigel
    expect(absoluteMagnitude(0.769, 152.6718)).toBeCloseTo(-5.15, 2) // Betelgeuse
    expect(absoluteMagnitude(-1.088, 2.6371)).toBeCloseTo(1.806, 2) // Sirius
  })
})

describe('colour', () => {
  it('gives the Sun about 5800K from its B-V of 0.65', () => {
    expect(bvToTemperature(0.65)).toBeGreaterThan(5500)
    expect(bvToTemperature(0.65)).toBeLessThan(6100)
  })

  it('makes bluer stars hotter', () => {
    expect(bvToTemperature(-0.3)).toBeGreaterThan(bvToTemperature(0.0))
    expect(bvToTemperature(0.0)).toBeGreaterThan(bvToTemperature(1.5))
  })

  it('renders hot stars blue-dominant and cool stars red-dominant', () => {
    const [hr, , hb] = temperatureToRgb(30000)
    expect(hb).toBeGreaterThan(hr)

    const [cr, , cb] = temperatureToRgb(3000)
    expect(cr).toBeGreaterThan(cb)
  })

  it('keeps every channel in 0..1', () => {
    for (const t of [1000, 2500, 5778, 12000, 40000]) {
      for (const channel of temperatureToRgb(t)) {
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('spectralTypeToBv', () => {
  it('lands near published main-sequence colours', () => {
    expect(spectralTypeToBv('G2 V')).toBeCloseTo(0.65, 1) // Sun: 0.65
    expect(spectralTypeToBv('A0m...')).toBeCloseTo(0.0, 1) // Sirius: 0.00
    expect(spectralTypeToBv('K1III')).toBeCloseTo(0.87, 1)
  })

  it('parses subclasses with a decimal point', () => {
    const b0 = spectralTypeToBv('B0Ia')!
    const b05 = spectralTypeToBv('B0.5Ia')!
    const b1 = spectralTypeToBv('B1Ia')!
    expect(b05).toBeGreaterThan(b0)
    expect(b05).toBeLessThan(b1)
  })

  it('treats an unqualified class as mid-class', () => {
    expect(spectralTypeToBv('K III')).toBeCloseTo(spectralTypeToBv('K5III')!, 6)
  })

  it('keeps M-class subclasses ramping toward the red', () => {
    expect(spectralTypeToBv('M5')!).toBeGreaterThan(spectralTypeToBv('M0')!)
    expect(spectralTypeToBv('M5')!).toBeCloseTo(1.65, 1) // M5V: about 1.64
  })

  it('orders the main sequence from blue to red', () => {
    const o = spectralTypeToBv('O5 V')!
    const a = spectralTypeToBv('A0 V')!
    const g = spectralTypeToBv('G2 V')!
    const m = spectralTypeToBv('M5 V')!
    expect(o).toBeLessThan(a)
    expect(a).toBeLessThan(g)
    expect(g).toBeLessThan(m)
  })

  it('returns undefined for junk', () => {
    expect(spectralTypeToBv('')).toBeUndefined()
    expect(spectralTypeToBv(undefined)).toBeUndefined()
    expect(spectralTypeToBv('???')).toBeUndefined()
  })
})

describe('unit conversion', () => {
  it('puts Proxima at about 4.25 light years', () => {
    expect(parsecsToLightYears(1.301)).toBeCloseTo(4.244, 2)
  })
})
