import { RAD2DEG, type Vec3 } from './astro.ts'

/**
 * When and from where a constellation can be seen.
 *
 * This is the first question anyone actually asks of a star map, and it falls
 * straight out of positions the catalogue already has. Everything here is
 * derived, not tabulated, so it stays correct for any sky culture's figures.
 */

/** Latitudes the summary altitudes are quoted for: mid-northern and mid-southern. */
export const NORTHERN_LATITUDE = 40
export const SOUTHERN_LATITUDE = -33

/** Below this transit altitude a figure is too low to be worth calling visible. */
const USABLE_ALTITUDE_DEG = 10

export type Hemisphere = 'northern' | 'southern' | 'both'

export interface Visibility {
  /** Centroid of the figure's member directions. */
  raHours: number
  decDeg: number
  /** Month (1-12) in which the figure transits at local midnight. */
  bestMonth: number
  /** Transit altitude in degrees; negative means it never rises. */
  altitudeNorth: number
  altitudeSouth: number
  hemisphere: Hemisphere
  /** Never sets at the quoted latitude. */
  circumpolarNorth: boolean
  circumpolarSouth: boolean
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Mean direction of a set of positions.
 *
 * Unit vectors are averaged rather than the raw positions, otherwise a single
 * distant supergiant would drag the centroid across the sky — Orion's centre
 * would be pulled toward Chi-2 at 1.3 kpc rather than sitting on the belt.
 */
export function centroidDirection(positions: Vec3[]): { raHours: number; decDeg: number } {
  let x = 0
  let y = 0
  let z = 0

  for (const [px, py, pz] of positions) {
    const length = Math.hypot(px, py, pz)
    if (length === 0) continue
    x += px / length
    y += py / length
    z += pz / length
  }

  const length = Math.hypot(x, y, z)
  if (length === 0) return { raHours: 0, decDeg: 0 }

  let raHours = (Math.atan2(y, x) * RAD2DEG) / 15
  if (raHours < 0) raHours += 24

  return { raHours, decDeg: Math.asin(z / length) * RAD2DEG }
}

/**
 * Month in which a given right ascension transits at local midnight.
 *
 * A figure is best placed when the Sun sits opposite it, twelve hours away in
 * RA. The Sun's RA passes 0h at the March equinox (about day 79) and advances
 * a full turn over the year.
 */
export function bestViewingMonth(raHours: number): number {
  const sunRa = (((raHours - 12) % 24) + 24) % 24
  const dayOfYear = 79 + (sunRa / 24) * 365.25
  return monthOfYearDay(dayOfYear)
}

/** Calendar month (1-12) for a day-of-year, wrapping past the year end. */
function monthOfYearDay(dayOfYear: number): number {
  const wrapped = ((Math.round(dayOfYear) - 1) % 365 + 365) % 365
  const cumulative = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]
  for (let month = 0; month < cumulative.length; month++) {
    if (wrapped < cumulative[month]) return month + 1
  }
  return 12
}

/** Altitude of an object at upper transit, seen from a latitude. Can be negative. */
export function transitAltitude(decDeg: number, latitudeDeg: number): number {
  return 90 - Math.abs(latitudeDeg - decDeg)
}

/** True when the object never sets at that latitude. */
export function isCircumpolar(decDeg: number, latitudeDeg: number): boolean {
  if (latitudeDeg >= 0) return decDeg > 90 - latitudeDeg
  return decDeg < -90 - latitudeDeg
}

export function visibilityFor(positions: Vec3[]): Visibility {
  const { raHours, decDeg } = centroidDirection(positions)

  const altitudeNorth = transitAltitude(decDeg, NORTHERN_LATITUDE)
  const altitudeSouth = transitAltitude(decDeg, SOUTHERN_LATITUDE)

  // "Both" is the common case; a figure only earns a single hemisphere when it
  // is genuinely unusable from the other one.
  const hemisphere: Hemisphere =
    altitudeNorth < USABLE_ALTITUDE_DEG
      ? 'southern'
      : altitudeSouth < USABLE_ALTITUDE_DEG
        ? 'northern'
        : 'both'

  return {
    raHours,
    decDeg,
    bestMonth: bestViewingMonth(raHours),
    altitudeNorth,
    altitudeSouth,
    hemisphere,
    circumpolarNorth: isCircumpolar(decDeg, NORTHERN_LATITUDE),
    circumpolarSouth: isCircumpolar(decDeg, SOUTHERN_LATITUDE),
  }
}

/**
 * One-line summary. Deliberately says "best seen at midnight in <month>" rather
 * than "visible in <month>": a figure is up for months either side, and how
 * much of it you catch depends on the hour you look.
 */
export function describeVisibility(visibility: Visibility, viewerNorth = true): string {
  const month = MONTH_NAMES[visibility.bestMonth - 1]
  const altitude = viewerNorth ? visibility.altitudeNorth : visibility.altitudeSouth
  const circumpolar = viewerNorth ? visibility.circumpolarNorth : visibility.circumpolarSouth

  if (altitude < 0) {
    return `Never rises from ${viewerNorth ? 'mid-northern' : 'mid-southern'} latitudes`
  }
  if (circumpolar) {
    return `Circumpolar — never sets; highest at midnight in ${month}`
  }
  if (altitude < USABLE_ALTITUDE_DEG) {
    return `Barely clears the horizon; best at midnight in ${month}`
  }
  return `Best seen at midnight in ${month}, reaching ${Math.round(altitude)}° up`
}
