import { describe, expect, it } from 'vitest'
import {
  MAX_SPEED_KM_S,
  PC_PER_KM_S_YEAR,
  clampVelocity,
  describeYear,
  positionAtYear,
} from './proper-motion.ts'

describe('PC_PER_KM_S_YEAR', () => {
  it('moves a 1 km/s star about 1.02 parsecs in a million years', () => {
    expect(PC_PER_KM_S_YEAR * 1_000_000).toBeCloseTo(1.0227, 4)
  })

  it('moves a typical 40 km/s star about 4 parsecs in 100,000 years', () => {
    // This is why the scrubber is worth having: 4 pc is an enormous angular
    // sweep for anything nearby.
    expect(40 * PC_PER_KM_S_YEAR * 100_000).toBeCloseTo(4.09, 2)
  })
})

describe('positionAtYear', () => {
  it('leaves a star where it is at year zero', () => {
    expect(positionAtYear([1, 2, 3], [40, -20, 10], 0)).toEqual([1, 2, 3])
  })

  it('runs backwards as well as forwards', () => {
    const forward = positionAtYear([0, 0, 0], [10, 0, 0], 50_000)
    const backward = positionAtYear([0, 0, 0], [10, 0, 0], -50_000)
    expect(forward[0]).toBeCloseTo(-backward[0], 12)
    expect(forward[0]).toBeGreaterThan(0)
  })

  it('is linear in time', () => {
    const one = positionAtYear([0, 0, 0], [30, 0, 0], 10_000)[0]
    const two = positionAtYear([0, 0, 0], [30, 0, 0], 20_000)[0]
    expect(two).toBeCloseTo(one * 2, 10)
  })

  it('carries Barnard-like motion the expected distance', () => {
    // Barnard's Star: about 90 km/s space velocity at 1.83 pc. Over 10,000
    // years that is roughly 0.9 pc — half its distance from us, which is why
    // it is the fastest-moving star on our sky.
    const moved = positionAtYear([1.83, 0, 0], [0, 90, 0], 10_000)
    expect(moved[1]).toBeCloseTo(0.92, 2)
  })
})

describe('clampVelocity', () => {
  it('leaves ordinary stars untouched', () => {
    expect(clampVelocity(30, -20, 10)).toEqual([30, -20, 10])
  })

  it('caps unphysical speeds but keeps the direction', () => {
    const [x, y, z] = clampVelocity(12_000, 0, 0)
    expect(Math.hypot(x, y, z)).toBeCloseTo(MAX_SPEED_KM_S, 6)
    expect(x).toBeGreaterThan(0)
    expect(y).toBe(0)
  })

  it('preserves direction exactly when clamping', () => {
    const original = [3000, -4000, 0]
    const [x, y] = clampVelocity(original[0], original[1], original[2])
    // Same 3:-4 ratio, just shorter.
    expect(x / y).toBeCloseTo(original[0] / original[1], 10)
  })

  it('treats missing data as stationary rather than as NaN', () => {
    expect(clampVelocity(Number.NaN, 0, 0)).toEqual([0, 0, 0])
    expect(clampVelocity(0, Number.POSITIVE_INFINITY, 0)).toEqual([0, 0, 0])
  })

  it('survives a zero velocity', () => {
    expect(clampVelocity(0, 0, 0)).toEqual([0, 0, 0])
  })
})

describe('describeYear', () => {
  it('names the present plainly', () => {
    expect(describeYear(0)).toBe('today')
    expect(describeYear(0.4)).toBe('today')
  })

  it('distinguishes past from future', () => {
    expect(describeYear(50_000)).toBe('50,000 years from now')
    expect(describeYear(-50_000)).toBe('50,000 years ago')
  })
})
