import { DEG2RAD, R_SUN_PC, type Vec3, galacticToEquatorial } from './astro.ts'

/**
 * A schematic Milky Way, for context only.
 *
 * Everything here is MODEL, not measurement. The star catalogue reaches about
 * 3 kpc; the Galaxy is 30 kpc across, and at the Galactic Centre's distance the
 * catalogue holds a few hundred stars against a few hundred billion real ones.
 * So galactic structure has to be drawn from a fit rather than plotted from
 * data, and the UI has to keep the two visually distinct.
 *
 * The arm geometry is not invented: it is the log-periodic spiral fit of
 * Reid et al. (2019), ApJ 885, 131, Table 2, derived from VLBI trigonometric
 * parallaxes of ~200 high-mass star-forming regions.
 */

/**
 * Reid et al. (2019) Table 2. Each arm is a log-spiral allowed one "kink"
 * where the pitch angle changes:
 *
 *   ln(R / R_kink) = -(beta - beta_kink) * tan(psi)
 *
 * with psi taken from `pitchLow` for beta <= beta_kink and `pitchHigh` above.
 * Galactocentric azimuth beta is 0 toward the Sun and increases in the
 * direction of Galactic rotation.
 */
export interface ArmFit {
  name: string
  /** Kink azimuth, degrees. */
  betaKinkDeg: number
  /** Radius at the kink, parsecs. */
  rKinkPc: number
  /** Pitch angle below the kink, degrees. */
  pitchLowDeg: number
  /** Pitch angle above the kink, degrees. */
  pitchHighDeg: number
  /** Fitted arm width (1 sigma), parsecs. */
  widthPc: number
  /**
   * Azimuth span to draw, degrees. A rendering choice — the fit itself is only
   * constrained where the paper has masers — picked to match the extent shown
   * in the paper's own plan view.
   */
  betaRangeDeg: [number, number]
}

export const REID_2019_ARMS: ArmFit[] = [
  { name: '3 kpc', betaKinkDeg: 15, rKinkPc: 3520, pitchLowDeg: -4.2, pitchHighDeg: -4.2, widthPc: 180, betaRangeDeg: [-20, 45] },
  { name: 'Norma', betaKinkDeg: 18, rKinkPc: 4460, pitchLowDeg: -1.0, pitchHighDeg: 19.5, widthPc: 140, betaRangeDeg: [-25, 80] },
  { name: 'Scutum–Centaurus', betaKinkDeg: 23, rKinkPc: 4910, pitchLowDeg: 14.1, pitchHighDeg: 12.1, widthPc: 230, betaRangeDeg: [-25, 220] },
  { name: 'Sagittarius–Carina', betaKinkDeg: 24, rKinkPc: 6040, pitchLowDeg: 17.1, pitchHighDeg: 1.0, widthPc: 270, betaRangeDeg: [-25, 200] },
  { name: 'Local', betaKinkDeg: 9, rKinkPc: 8260, pitchLowDeg: 11.4, pitchHighDeg: 11.4, widthPc: 310, betaRangeDeg: [-15, 60] },
  { name: 'Perseus', betaKinkDeg: 40, rKinkPc: 8870, pitchLowDeg: 10.3, pitchHighDeg: 8.7, widthPc: 350, betaRangeDeg: [-25, 200] },
  { name: 'Outer', betaKinkDeg: 18, rKinkPc: 12240, pitchLowDeg: 3.0, pitchHighDeg: 9.4, widthPc: 650, betaRangeDeg: [-25, 190] },
]

/** Galactocentric radius of an arm at a given azimuth, in parsecs. */
export function armRadiusPc(arm: ArmFit, betaDeg: number): number {
  const pitch = (betaDeg <= arm.betaKinkDeg ? arm.pitchLowDeg : arm.pitchHighDeg) * DEG2RAD
  return arm.rKinkPc * Math.exp(-(betaDeg - arm.betaKinkDeg) * DEG2RAD * Math.tan(pitch))
}

/**
 * Galactocentric polar (R, beta) to heliocentric galactic cartesian, parsecs.
 *
 * Our galactic frame has +x toward the Galactic Centre, +y toward the direction
 * of rotation, +z toward the north galactic pole, with the Sun at the origin.
 * Reid's beta is measured at the Centre from the direction of the Sun, so a
 * source at (R, beta) sits `R_SUN - R cos(beta)` along +x.
 */
export function galactocentricToHeliocentric(rPc: number, betaDeg: number, zPc = 0): Vec3 {
  const beta = betaDeg * DEG2RAD
  return [R_SUN_PC - rPc * Math.cos(beta), rPc * Math.sin(beta), zPc]
}

/** Polyline for one arm, in equatorial catalogue coordinates. */
export function armPolyline(arm: ArmFit, steps = 160): Vec3[] {
  const [start, end] = arm.betaRangeDeg
  const points: Vec3[] = []

  for (let i = 0; i <= steps; i++) {
    const betaDeg = start + ((end - start) * i) / steps
    const radius = armRadiusPc(arm, betaDeg)
    // Clip where the fit runs past anything the paper constrains.
    if (radius < 1500 || radius > 20000) continue
    points.push(galacticToEquatorial(galactocentricToHeliocentric(radius, betaDeg)))
  }

  return points
}

/** Where the Galactic Centre sits, in equatorial catalogue coordinates. */
export function galacticCentre(): Vec3 {
  return galacticToEquatorial([R_SUN_PC, 0, 0])
}

/** Radius of the drawn stellar disk, parsecs. The disk fades rather than ends. */
export const DISK_RADIUS_PC = 15000

/** Half-length and position angle of the bar (Wegg+ 2015: ~5 kpc, ~27 deg). */
export const BAR_HALF_LENGTH_PC = 5000
export const BAR_ANGLE_DEG = 27
