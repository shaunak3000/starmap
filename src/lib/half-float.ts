/**
 * IEEE 754 binary16 conversion.
 *
 * Implemented by hand rather than via `DataView.setFloat16` so the data
 * pipeline does not depend on a very recent Node; the test suite cross-checks
 * every path against the native implementation where one exists.
 *
 * Half floats suit star positions specifically because their precision is
 * *relative*: about 0.05% of the value. Proxima at 1.3 pc lands within
 * 0.0006 pc, while a star at the 3 kpc edge is within about 1.5 pc — far below
 * the parallax uncertainty out there. A fixed-point encoding over the same
 * range would put the error budget in exactly the wrong place.
 */

const f32 = new Float32Array(1)
const u32 = new Uint32Array(f32.buffer)

/** Largest finite binary16 value. Anything above this saturates to Infinity. */
export const HALF_MAX = 65504

/** Encodes a number as binary16 bits, rounding to nearest-even. */
export function toHalf(value: number): number {
  f32[0] = value
  const bits = u32[0]

  const sign = (bits >>> 16) & 0x8000
  const exponent = (bits >>> 23) & 0xff
  const mantissa = bits & 0x7fffff

  // Infinity and NaN keep their class; NaN must stay non-zero in the mantissa.
  if (exponent === 0xff) {
    return sign | 0x7c00 | (mantissa === 0 ? 0 : 0x200)
  }

  // Rebias: float32 excess-127 to float16 excess-15.
  const rebiased = exponent - 127 + 15

  if (rebiased >= 0x1f) {
    // Overflows the half range.
    return sign | 0x7c00
  }

  if (rebiased <= 0) {
    // Too small even for a subnormal.
    if (rebiased < -10) return sign

    // Subnormal: restore the implicit leading 1, then shift into place.
    const withImplicit = mantissa | 0x800000
    const shift = 14 - rebiased
    const truncated = withImplicit >>> shift

    // Round to nearest, ties to even.
    const remainder = withImplicit & ((1 << shift) - 1)
    const halfway = 1 << (shift - 1)
    const roundUp =
      remainder > halfway || (remainder === halfway && (truncated & 1) === 1)

    return sign | (truncated + (roundUp ? 1 : 0))
  }

  // Normal. Rounding may carry into the exponent, which the addition handles
  // correctly because the mantissa sits directly below it in the layout.
  const truncated = (rebiased << 10) | (mantissa >>> 13)
  const remainder = mantissa & 0x1fff
  const roundUp = remainder > 0x1000 || (remainder === 0x1000 && (truncated & 1) === 1)

  return sign | (truncated + (roundUp ? 1 : 0))
}

/** Decodes binary16 bits back to a number. */
export function fromHalf(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1
  const exponent = (bits >>> 10) & 0x1f
  const mantissa = bits & 0x3ff

  if (exponent === 0) return sign * 2 ** -14 * (mantissa / 1024)
  if (exponent === 0x1f) return mantissa === 0 ? sign * Infinity : Number.NaN

  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024)
}

/** Encodes a Float32Array into packed binary16 bits. */
export function encodeHalfArray(values: Float32Array): Uint16Array {
  const out = new Uint16Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = toHalf(values[i])
  return out
}
