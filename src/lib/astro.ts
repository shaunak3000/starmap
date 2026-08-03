/**
 * Astronomy primitives shared by the offline data pipeline and the renderer.
 * Dependency-free so it runs identically under Node and in the browser.
 */

export const DEG2RAD = Math.PI / 180
export const RAD2DEG = 180 / Math.PI

/** Right ascension is catalogued in hours; 24h spans 360 degrees. */
export const HOURS_TO_DEG = 15

export const LY_PER_PC = 3.2615637769
export const PC_PER_LY = 1 / LY_PER_PC
export const AU_PER_PC = 206264.806

export type Vec3 = [number, number, number]

/**
 * Heliocentric equatorial cartesian coordinates, in parsecs.
 *
 * +x -> (RA 0h, Dec 0deg), +y -> (RA 6h, Dec 0deg), +z -> north celestial pole.
 * This is the convention HYG/AT-HYG use for their x0/y0/z0 columns, which lets
 * the pipeline cross-check its own arithmetic against the catalogue.
 */
export function equatorialToCartesian(raHours: number, decDeg: number, distPc: number): Vec3 {
  const ra = raHours * HOURS_TO_DEG * DEG2RAD
  const dec = decDeg * DEG2RAD
  const cosDec = Math.cos(dec)
  return [distPc * cosDec * Math.cos(ra), distPc * cosDec * Math.sin(ra), distPc * Math.sin(dec)]
}

/** Inverse of {@link equatorialToCartesian}. RA is normalised to [0, 24). */
export function cartesianToEquatorial([x, y, z]: Vec3): {
  raHours: number
  decDeg: number
  distPc: number
} {
  const distPc = Math.hypot(x, y, z)
  if (distPc === 0) return { raHours: 0, decDeg: 0, distPc: 0 }
  let raHours = (Math.atan2(y, x) * RAD2DEG) / HOURS_TO_DEG
  if (raHours < 0) raHours += 24
  return { raHours, decDeg: Math.asin(z / distPc) * RAD2DEG, distPc }
}

/**
 * Rotation from equatorial (J2000) to galactic cartesian coordinates.
 *
 * +x -> galactic centre, +y -> direction of galactic rotation, +z -> north
 * galactic pole. Built from the standard J2000 pole and node angles so the
 * "view along the Local Arm" camera preset has a real frame behind it.
 */
/** North galactic pole and ascending node, J2000. */
export const GALACTIC_POLE_RA_DEG = 192.85948
export const GALACTIC_POLE_DEC_DEG = 27.12825
export const GALACTIC_NODE_LON_DEG = 122.93192

/**
 * Canonical J2000 equatorial -> galactic rotation, row-major 3x3, as published
 * in the Hipparcos catalogue introduction. Used verbatim rather than rebuilt
 * from the pole angles: the closed form is easy to get subtly wrong, and this
 * is orthonormal to ~1e-15.
 */
export const EQUATORIAL_TO_GALACTIC: readonly number[] = [
  -0.0548755604162154, -0.873437090234885, -0.4838350155487132, 0.4941094278755837,
  -0.4448296299600112, 0.7469822444972189, -0.8676661490190047, -0.1980763734312015,
  0.4559837761750669,
]

export function equatorialToGalactic([x, y, z]: Vec3): Vec3 {
  const m = EQUATORIAL_TO_GALACTIC
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ]
}

/** Apparent magnitude of a star of absolute magnitude `absmag` seen from `distPc`. */
export function apparentMagnitude(absMag: number, distPc: number): number {
  return absMag + 5 * Math.log10(Math.max(distPc, 1e-6) / 10)
}

/** Absolute magnitude implied by an apparent magnitude at a known distance. */
export function absoluteMagnitude(appMag: number, distPc: number): number {
  return appMag - 5 * Math.log10(Math.max(distPc, 1e-6) / 10)
}

/**
 * Effective temperature from B-V colour index (Ballesteros 2012).
 * Accurate enough for colour rendering across the main sequence.
 */
export function bvToTemperature(bv: number): number {
  const c = Math.min(Math.max(bv, -0.4), 2.0)
  return 4600 * (1 / (0.92 * c + 1.7) + 1 / (0.92 * c + 0.62))
}

/**
 * Blackbody colour approximation (Tanner Helland), returning linear-ish sRGB in
 * 0..1. Mirrored in GLSL by the star shader — keep the two in step.
 */
export function temperatureToRgb(kelvin: number): Vec3 {
  const t = Math.min(Math.max(kelvin, 1000), 40000) / 100
  let r: number
  let g: number
  let b: number

  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)
  }

  if (t >= 66) {
    b = 255
  } else if (t <= 19) {
    b = 0
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307
  }

  const clamp = (v: number) => Math.min(Math.max(v, 0), 255) / 255
  return [clamp(r), clamp(g), clamp(b)]
}

export function bvToRgb(bv: number): Vec3 {
  return temperatureToRgb(bvToTemperature(bv))
}

/**
 * Main-sequence B-V anchored at subclass 0 of each MK class, used only when a
 * star has no measured colour index. Anchoring at subclass 0 (rather than at
 * the class midpoint) is what makes linear interpolation to the next class
 * land on the right value: G2 -> 0.63 against a true solar 0.65.
 */
const SPECTRAL_BV_AT_ZERO: Record<string, number> = {
  W: -0.35,
  O: -0.32,
  B: -0.3,
  A: 0.0,
  F: 0.3,
  G: 0.58,
  K: 0.81,
  M: 1.4,
}

/** Terminal anchor for M, which has no successor class to interpolate toward. */
const M_CLASS_END_BV = 1.9

/** Classes with no meaningful subclass ramp for our purposes. */
const SPECTRAL_BV_FLAT: Record<string, number> = {
  L: 2.0,
  T: 2.0,
  Y: 2.0,
  C: 2.0,
  S: 1.8,
}

const SPECTRAL_ORDER = 'OBAFGKM'

/**
 * Estimate B-V from an MK spectral type such as "G2 V", "K1III" or "B0.5Ia".
 * Interpolates between adjacent classes using the subclass digit.
 */
export function spectralTypeToBv(spect: string | undefined | null): number | undefined {
  if (!spect) return undefined
  const match = /^\s*([OBAFGKMLTYCSW])\s*(\d(?:\.\d)?)?/i.exec(spect)
  if (!match) return undefined

  const letter = match[1].toUpperCase()

  const flat = SPECTRAL_BV_FLAT[letter]
  if (flat !== undefined) return flat

  const base = SPECTRAL_BV_AT_ZERO[letter]
  if (base === undefined) return undefined

  // An unqualified class (e.g. "K III") sits mid-class by convention.
  const sub = Math.min(Math.max(match[2] === undefined ? 5 : Number(match[2]), 0), 9.9)

  const idx = SPECTRAL_ORDER.indexOf(letter)
  const next =
    letter === 'M'
      ? M_CLASS_END_BV
      : idx === -1
        ? undefined
        : SPECTRAL_BV_AT_ZERO[SPECTRAL_ORDER[idx + 1]]
  if (next === undefined) return base

  return base + (next - base) * (sub / 10)
}

export const parsecsToLightYears = (pc: number) => pc * LY_PER_PC
export const lightYearsToParsecs = (ly: number) => ly * PC_PER_LY
