import { LY_PER_PC } from '../lib/astro.ts'
import type { DistanceUnit } from '../state/store.ts'

/** Compact distance for controls and labels, in the user's chosen unit. */
export function formatDistance(pc: number, unit: DistanceUnit): string {
  const value = unit === 'pc' ? pc : pc * LY_PER_PC
  const suffix = unit === 'pc' ? 'pc' : 'ly'
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k ${suffix}`
  if (value >= 100) return `${value.toFixed(0)} ${suffix}`
  if (value >= 10) return `${value.toFixed(1)} ${suffix}`
  if (value < 0.01) return `0 ${suffix}`
  return `${value.toFixed(2)} ${suffix}`
}
