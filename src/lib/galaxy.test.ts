import { describe, expect, it } from 'vitest'
import { R_SUN_PC, equatorialToGalactic } from './astro.ts'
import {
  REID_2019_ARMS,
  armPolyline,
  armRadiusPc,
  galacticCentre,
  galactocentricToHeliocentric,
} from './galaxy.ts'

describe('galactocentricToHeliocentric', () => {
  it('puts the Sun at the origin', () => {
    const [x, y, z] = galactocentricToHeliocentric(R_SUN_PC, 0)
    expect(x).toBeCloseTo(0, 6)
    expect(y).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(0, 6)
  })

  it('puts the Galactic Centre on +x at R0', () => {
    const [x, y, z] = galactocentricToHeliocentric(0, 0)
    expect(x).toBeCloseTo(R_SUN_PC, 6)
    expect(y).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(0, 6)
  })

  it('sends increasing azimuth toward galactic rotation (+y)', () => {
    expect(galactocentricToHeliocentric(R_SUN_PC, 10)[1]).toBeGreaterThan(0)
  })
})

describe('galacticCentre', () => {
  it('round-trips back to the galactic +x axis at R0', () => {
    const [x, y, z] = equatorialToGalactic(galacticCentre())
    expect(x).toBeCloseTo(R_SUN_PC, 3)
    expect(y).toBeCloseTo(0, 3)
    expect(z).toBeCloseTo(0, 3)
  })

  it('points toward Sagittarius, near RA 17.76h Dec -28.9deg', () => {
    const [x, y, z] = galacticCentre()
    const raHours = ((Math.atan2(y, x) * 180) / Math.PI / 15 + 24) % 24
    const decDeg = (Math.asin(z / Math.hypot(x, y, z)) * 180) / Math.PI
    expect(raHours).toBeCloseTo(17.76, 1)
    expect(decDeg).toBeCloseTo(-28.94, 1)
  })
})

describe('armRadiusPc', () => {
  it('returns the kink radius exactly at the kink', () => {
    for (const arm of REID_2019_ARMS) {
      expect(armRadiusPc(arm, arm.betaKinkDeg)).toBeCloseTo(arm.rKinkPc, 6)
    }
  })

  it('trails: a positive pitch angle winds inward as azimuth increases', () => {
    // Azimuth increases along Galactic rotation, and the arms trail, so radius
    // has to fall as beta rises. This is the sign that is easiest to get wrong
    // and it flips the whole spiral into a leading one if inverted.
    const local = REID_2019_ARMS.find((a) => a.name === 'Local')!
    expect(local.pitchLowDeg).toBeGreaterThan(0)
    expect(armRadiusPc(local, 40)).toBeLessThan(armRadiusPc(local, 0))
  })

  it('flattens above a kink that drops the pitch angle', () => {
    // Sgr-Car goes from 17.1 deg below its kink to 1.0 deg above, so the arm
    // turns from steeply winding to very nearly circular.
    const sgr = REID_2019_ARMS.find((a) => a.name === 'Sagittarius–Carina')!
    const below = Math.abs(
      armRadiusPc(sgr, sgr.betaKinkDeg) - armRadiusPc(sgr, sgr.betaKinkDeg - 20),
    )
    const above = Math.abs(
      armRadiusPc(sgr, sgr.betaKinkDeg + 20) - armRadiusPc(sgr, sgr.betaKinkDeg),
    )
    expect(above).toBeLessThan(below / 5)
  })
})

describe('the Local Arm', () => {
  it('passes close to the Sun, which is why we are in it', () => {
    const local = REID_2019_ARMS.find((a) => a.name === 'Local')!
    // The Sun sits at R0 = 8150 pc; the Local Arm's kink radius is 8260 pc.
    const nearSun = armRadiusPc(local, 0)
    expect(Math.abs(nearSun - R_SUN_PC)).toBeLessThan(local.widthPc * 3)
  })
})

describe('armPolyline', () => {
  it('produces a continuous run of points for every arm', () => {
    for (const arm of REID_2019_ARMS) {
      const points = armPolyline(arm)
      expect(points.length).toBeGreaterThan(10)
      for (const point of points) {
        for (const component of point) expect(Number.isFinite(component)).toBe(true)
      }
    }
  })

  it('keeps every drawn point inside the clipped radius band', () => {
    for (const arm of REID_2019_ARMS) {
      for (const point of armPolyline(arm)) {
        const [gx, gy] = equatorialToGalactic(point)
        // Back to galactocentric radius: the Centre is at galactic x = R0.
        const radius = Math.hypot(R_SUN_PC - gx, gy)
        expect(radius).toBeGreaterThanOrEqual(1499)
        expect(radius).toBeLessThanOrEqual(20001)
      }
    }
  })

  it('lays the arms in the galactic plane', () => {
    for (const arm of REID_2019_ARMS) {
      for (const point of armPolyline(arm)) {
        expect(Math.abs(equatorialToGalactic(point)[2])).toBeLessThan(1e-6)
      }
    }
  })
})
