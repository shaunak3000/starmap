import type { DetailTier } from './catalog-format.ts'
import { FIELDS_PER_STAR } from './catalog-format.ts'
import { PC_PER_KM_S_YEAR } from './proper-motion.ts'

/**
 * Star positions at a scrubbed epoch, for everything the CPU draws.
 *
 * The point cloud does this in the vertex shader, but constellation lines,
 * figure rings, labels, picking and the star card all read tier 0 directly.
 * They must use the identical formula or the lines drift off their own stars,
 * so both sides go through this one definition.
 */

/** Writes the epoch position of one tier-0 star into `out`. */
export function epochPosition(
  t0: DetailTier,
  index: number,
  years: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const base = index * FIELDS_PER_STAR
  out[0] = t0.attributes[base]
  out[1] = t0.attributes[base + 1]
  out[2] = t0.attributes[base + 2]

  if (years !== 0 && t0.velocities) {
    const scale = years * PC_PER_KM_S_YEAR
    const v = index * 3
    out[0] += t0.velocities[v] * scale
    out[1] += t0.velocities[v + 1] * scale
    out[2] += t0.velocities[v + 2] * scale
  }

  return out
}

/** Velocity of one tier-0 star in km/s, or zeroes where none is carried. */
export function starVelocity(
  t0: DetailTier,
  index: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  if (!t0.velocities) {
    out[0] = 0
    out[1] = 0
    out[2] = 0
    return out
  }

  const v = index * 3
  out[0] = t0.velocities[v]
  out[1] = t0.velocities[v + 1]
  out[2] = t0.velocities[v + 2]
  return out
}
