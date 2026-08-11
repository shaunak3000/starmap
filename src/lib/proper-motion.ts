import type { Vec3 } from './astro.ts'

/**
 * Stars in motion.
 *
 * The catalogue carries a space velocity per star, so the sky can be wound
 * forwards and backwards. This is the third leg of the argument the app makes:
 * a constellation is an accident of *when* you look as much as of where you
 * stand and who you are. Wind far enough and the figures simply come apart.
 */

/**
 * Parsecs a star travels per year for each km/s of space velocity.
 *
 * A Julian year is 31,557,600 s and a parsec is 3.0856775814913673e13 km.
 */
export const PC_PER_KM_S_YEAR = 31_557_600 / 3.0856775814913673e13

/**
 * Speeds above this are measurement error, not stars.
 *
 * The local galactic escape velocity is roughly 550 km/s, so nothing bound to
 * the disk exceeds it by much. 55 of 2.5M catalogue rows do — almost certainly
 * bad radial velocities — and left alone they streak across the entire volume
 * within a few thousand years. The direction is kept; only the magnitude is cut.
 */
export const MAX_SPEED_KM_S = 600

/** How far the scrubber travels either side of now. */
export const MAX_YEARS = 100_000

export function clampVelocity(vx: number, vy: number, vz: number): Vec3 {
  if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) {
    return [0, 0, 0]
  }

  const speed = Math.hypot(vx, vy, vz)
  if (speed <= MAX_SPEED_KM_S || speed === 0) return [vx, vy, vz]

  const scale = MAX_SPEED_KM_S / speed
  return [vx * scale, vy * scale, vz * scale]
}

/**
 * Straight-line extrapolation. Over ±100 kyr this is well within the error the
 * distances already carry, and modelling galactic orbits would imply a
 * precision the parallaxes do not support.
 */
export function positionAtYear(position: Vec3, velocity: Vec3, years: number): Vec3 {
  const scale = years * PC_PER_KM_S_YEAR
  return [
    position[0] + velocity[0] * scale,
    position[1] + velocity[1] * scale,
    position[2] + velocity[2] * scale,
  ]
}

/** Human-readable epoch label, e.g. "in 50,000 years" or "48,000 BC". */
export function describeYear(years: number): string {
  if (Math.round(years) === 0) return 'today'

  const magnitude = Math.abs(Math.round(years))
  if (years > 0) return `${magnitude.toLocaleString()} years from now`
  return `${magnitude.toLocaleString()} years ago`
}
