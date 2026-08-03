import * as THREE from 'three'
import { EQUATORIAL_TO_GALACTIC } from '../lib/astro.ts'
import type { ReferenceFrame } from '../state/store.ts'

/**
 * Catalogue data is astronomical Z-up (+z toward the north celestial pole);
 * three.js is Y-up. Every scene node holding star data sits under this rotation
 * so the underlying coordinates stay honest and testable.
 */
export const Z_UP_TO_Y_UP = new THREE.Matrix4().makeRotationX(-Math.PI / 2)

const EQUATORIAL_TO_GALACTIC_M4 = new THREE.Matrix4().set(
  EQUATORIAL_TO_GALACTIC[0], EQUATORIAL_TO_GALACTIC[1], EQUATORIAL_TO_GALACTIC[2], 0,
  EQUATORIAL_TO_GALACTIC[3], EQUATORIAL_TO_GALACTIC[4], EQUATORIAL_TO_GALACTIC[5], 0,
  EQUATORIAL_TO_GALACTIC[6], EQUATORIAL_TO_GALACTIC[7], EQUATORIAL_TO_GALACTIC[8], 0,
  0, 0, 0, 1,
)

/** World matrix for the star field under a given reference frame. */
export function frameMatrix(frame: ReferenceFrame): THREE.Matrix4 {
  const matrix = Z_UP_TO_Y_UP.clone()
  if (frame === 'galactic') matrix.multiply(EQUATORIAL_TO_GALACTIC_M4)
  return matrix
}
