import { describe, expect, it } from 'vitest'
import { HALF_MAX, encodeHalfArray, fromHalf, toHalf } from './half-float.ts'

/**
 * Native binary16 as an independent oracle, where the runtime provides it.
 * `setFloat16` is ES2025 and newer than our lib target, so it is reached
 * through a narrow local type rather than by widening the whole project.
 */
type MaybeFloat16DataView = DataView & {
  setFloat16?: (offset: number, value: number, littleEndian?: boolean) => void
}

const native = (() => {
  const probe = new DataView(new ArrayBuffer(2)) as MaybeFloat16DataView
  if (typeof probe.setFloat16 !== 'function') return null

  return (value: number) => {
    const view = new DataView(new ArrayBuffer(2)) as MaybeFloat16DataView
    view.setFloat16!(0, value, true)
    return view.getUint16(0, true)
  }
})()

describe('toHalf / fromHalf', () => {
  it('round-trips exactly representable values', () => {
    for (const value of [0, 1, -1, 0.5, -0.5, 2, 1024, -2048, 0.25]) {
      expect(fromHalf(toHalf(value))).toBe(value)
    }
  })

  it('preserves signed zero', () => {
    expect(toHalf(0)).toBe(0x0000)
    expect(toHalf(-0)).toBe(0x8000)
  })

  it('encodes the canonical bit patterns', () => {
    expect(toHalf(1)).toBe(0x3c00)
    expect(toHalf(-2)).toBe(0xc000)
    expect(toHalf(HALF_MAX)).toBe(0x7bff)
  })

  it('saturates past the half range to infinity', () => {
    expect(fromHalf(toHalf(1e6))).toBe(Infinity)
    expect(fromHalf(toHalf(-1e6))).toBe(-Infinity)
  })

  it('flushes values below the subnormal range to zero', () => {
    expect(fromHalf(toHalf(1e-10))).toBe(0)
  })

  it('handles subnormals', () => {
    // Smallest positive subnormal is 2^-24.
    expect(fromHalf(toHalf(2 ** -24))).toBeCloseTo(2 ** -24, 30)
    expect(fromHalf(toHalf(2 ** -15))).toBeCloseTo(2 ** -15, 20)
  })

  it('keeps NaN and infinity distinct', () => {
    expect(Number.isNaN(fromHalf(toHalf(Number.NaN)))).toBe(true)
    expect(fromHalf(toHalf(Infinity))).toBe(Infinity)
  })
})

describe('precision across the catalogue range', () => {
  // The reason half floats are acceptable here: relative error, not absolute.
  it.each([
    { name: 'Proxima', pc: 1.3, tolerancePc: 0.002 },
    { name: 'Sirius', pc: 2.64, tolerancePc: 0.004 },
    { name: 'Betelgeuse', pc: 152.7, tolerancePc: 0.2 },
    { name: 'Alnilam', pc: 606, tolerancePc: 0.6 },
    { name: 'the 3 kpc edge', pc: 3000, tolerancePc: 2 },
    { name: 'the farthest constellation star', pc: 4489, tolerancePc: 4 },
  ])('keeps $name within $tolerancePc pc', ({ pc, tolerancePc }) => {
    expect(Math.abs(fromHalf(toHalf(pc)) - pc)).toBeLessThan(tolerancePc)
  })

  it('stays under 0.1% relative error across the whole range', () => {
    for (let pc = 0.01; pc < 5000; pc *= 1.05) {
      const error = Math.abs(fromHalf(toHalf(pc)) - pc) / pc
      expect(error).toBeLessThan(0.001)
    }
  })
})

describe.runIf(native !== null)('agreement with the native implementation', () => {
  it('matches on a wide sweep of magnitudes', () => {
    for (let exponent = -20; exponent <= 20; exponent++) {
      for (const mantissa of [1, 1.25, 1.5, 1.75, 1.9999]) {
        for (const sign of [1, -1]) {
          const value = sign * mantissa * 2 ** exponent
          expect(toHalf(value)).toBe(native!(value))
        }
      }
    }
  })

  it('matches on values that force rounding decisions', () => {
    // Halfway cases between adjacent halves are where naive truncation breaks.
    for (let i = 0; i < 4000; i++) {
      const value = 1 + i / 4096
      expect(toHalf(value)).toBe(native!(value))
    }
  })

  it('matches on subnormals and extremes', () => {
    for (const value of [0, -0, 2 ** -24, 2 ** -25, 2 ** -14, HALF_MAX, 1e6, -1e6, 1e-10]) {
      expect(toHalf(value)).toBe(native!(value))
    }
  })
})

describe('encodeHalfArray', () => {
  it('encodes elementwise', () => {
    const encoded = encodeHalfArray(new Float32Array([1, -2, 0.5]))
    expect([...encoded]).toEqual([toHalf(1), toHalf(-2), toHalf(0.5)])
  })
})
