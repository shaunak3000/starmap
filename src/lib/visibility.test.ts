import { describe, expect, it } from 'vitest'
import { equatorialToCartesian, type Vec3 } from './astro.ts'
import {
  MONTH_NAMES,
  bestViewingMonth,
  centroidDirection,
  describeVisibility,
  isCircumpolar,
  transitAltitude,
  visibilityFor,
} from './visibility.ts'

/** A cluster of points around a given sky position, at assorted distances. */
function figureAt(raHours: number, decDeg: number): Vec3[] {
  return [
    equatorialToCartesian(raHours, decDeg, 50),
    equatorialToCartesian(raHours + 0.2, decDeg + 2, 400),
    equatorialToCartesian(raHours - 0.2, decDeg - 2, 900),
  ]
}

describe('centroidDirection', () => {
  it('averages directions, not positions', () => {
    // A lone distant member must not drag the centre across the sky: averaging
    // raw positions here would land near the 5000 pc star, not between them.
    const near = equatorialToCartesian(6, 0, 5)
    const far = equatorialToCartesian(6.4, 0, 5000)
    const { raHours } = centroidDirection([near, far])
    expect(raHours).toBeGreaterThan(6)
    expect(raHours).toBeLessThan(6.4)
  })

  it('normalises right ascension into [0, 24)', () => {
    const { raHours } = centroidDirection([equatorialToCartesian(23.5, 10, 100)])
    expect(raHours).toBeGreaterThanOrEqual(0)
    expect(raHours).toBeLessThan(24)
    expect(raHours).toBeCloseTo(23.5, 3)
  })

  it('survives an empty figure', () => {
    expect(centroidDirection([])).toEqual({ raHours: 0, decDeg: 0 })
  })
})

describe('bestViewingMonth', () => {
  // Every one of these is a fact anyone who has looked up can check.
  it.each([
    { name: 'Orion', ra: 5.5, month: 'December' },
    { name: 'Scorpius', ra: 16.8, month: 'June' },
    { name: 'Leo', ra: 10.5, month: 'February' },
    { name: 'Cygnus', ra: 20.3, month: 'July' },
    { name: 'Taurus', ra: 4.5, month: 'November' },
    { name: 'Aquarius', ra: 22.5, month: 'August' },
  ])('puts $name at its midnight best in $month', ({ ra, month }) => {
    expect(MONTH_NAMES[bestViewingMonth(ra) - 1]).toBe(month)
  })

  it('advances through the year as right ascension advances', () => {
    // A sign error here would run the calendar backwards, which the individual
    // cases above could still pass by coincidence.
    const months = [0, 4, 8, 12, 16, 20].map((ra) => bestViewingMonth(ra))
    expect(new Set(months).size).toBe(6)
  })

  it('returns a valid month for every hour of right ascension', () => {
    for (let ra = 0; ra < 24; ra += 0.25) {
      const month = bestViewingMonth(ra)
      expect(month).toBeGreaterThanOrEqual(1)
      expect(month).toBeLessThanOrEqual(12)
    }
  })
})

describe('transitAltitude', () => {
  it('puts an object overhead when its declination matches the latitude', () => {
    expect(transitAltitude(40, 40)).toBe(90)
  })

  it('goes negative for objects that never rise', () => {
    // Crux at -60 declination, seen from 40 north.
    expect(transitAltitude(-60, 40)).toBeLessThan(0)
  })
})

describe('isCircumpolar', () => {
  it('is true for Ursa Minor from mid-northern latitudes', () => {
    expect(isCircumpolar(75, 40)).toBe(true)
  })

  it('is false for the celestial equator anywhere', () => {
    expect(isCircumpolar(0, 40)).toBe(false)
    expect(isCircumpolar(0, -33)).toBe(false)
  })

  it('is true for deep southern declinations from the south', () => {
    expect(isCircumpolar(-75, -33)).toBe(true)
  })
})

describe('visibilityFor', () => {
  // Reproduces the table measured against the real catalogue.
  it.each([
    { name: 'Orion', ra: 5.5, dec: 7, month: 'December', hemisphere: 'both' },
    { name: 'Scorpius', ra: 16.8, dec: -34, month: 'June', hemisphere: 'both' },
    { name: 'Ursa Major', ra: 10.8, dec: 55, month: 'March', hemisphere: 'northern' },
    { name: 'Crux', ra: 12.5, dec: -60, month: 'March', hemisphere: 'southern' },
    { name: 'Cassiopeia', ra: 1.0, dec: 60, month: 'October', hemisphere: 'northern' },
    { name: 'Centaurus', ra: 13.5, dec: -49, month: 'April', hemisphere: 'southern' },
  ])('describes $name as $hemisphere, best in $month', ({ ra, dec, month, hemisphere }) => {
    const visibility = visibilityFor(figureAt(ra, dec))
    expect(MONTH_NAMES[visibility.bestMonth - 1]).toBe(month)
    expect(visibility.hemisphere).toBe(hemisphere)
  })

  it('puts Cygnus overhead in the northern summer', () => {
    const visibility = visibilityFor(figureAt(20.3, 40))
    expect(visibility.altitudeNorth).toBeGreaterThan(85)
  })

  it('keeps Crux permanently below a mid-northern horizon', () => {
    expect(visibilityFor(figureAt(12.5, -60)).altitudeNorth).toBeLessThan(0)
  })
})

describe('describeVisibility', () => {
  it('says so plainly when a figure never rises', () => {
    const text = describeVisibility(visibilityFor(figureAt(12.5, -60)), true)
    expect(text).toMatch(/never rises/i)
  })

  it('calls out circumpolar figures', () => {
    expect(describeVisibility(visibilityFor(figureAt(2, 75)), true)).toMatch(/circumpolar/i)
  })

  it('hedges to midnight rather than claiming a whole month', () => {
    // Visibility spans months either side; an unqualified "visible in December"
    // would simply be wrong.
    expect(describeVisibility(visibilityFor(figureAt(5.5, 7)), true)).toMatch(
      /best seen at midnight in December/i,
    )
  })
})
