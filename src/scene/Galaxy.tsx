import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { DEG2RAD, R_SUN_PC, galacticToEquatorial, type Vec3 } from '../lib/astro.ts'
import {
  BAR_ANGLE_DEG,
  BAR_HALF_LENGTH_PC,
  DISK_RADIUS_PC,
  REID_2019_ARMS,
  armPolyline,
  galacticCentre,
  galactocentricToHeliocentric,
} from '../lib/galaxy.ts'
import { useStarmap } from '../state/store.ts'

/**
 * Schematic Galaxy, drawn deliberately unlike the star field: thin cold lines
 * and a sparse haze, never solid points. The catalogue stops at 3 kpc and the
 * Galaxy is 30 kpc across, so everything here is a fit rather than a
 * measurement and it must not be mistakable for one.
 */

function polylineGeometry(points: Vec3[]): THREE.BufferGeometry {
  const positions: number[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    positions.push(...points[i], ...points[i + 1])
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

/** Concentric galactocentric radius rings, every 5 kpc. */
function diskRings(): THREE.BufferGeometry {
  const positions: number[] = []
  const segments = 256

  for (const radius of [5000, 10000, 15000]) {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * 360
      const a1 = ((i + 1) / segments) * 360
      positions.push(
        ...galacticToEquatorial(galactocentricToHeliocentric(radius, a0)),
        ...galacticToEquatorial(galactocentricToHeliocentric(radius, a1)),
      )
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

/** Sparse haze standing in for the disk's stellar population. */
function diskHaze(count = 26000): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3)
  // Deterministic so the Galaxy does not reshuffle on every render.
  let seed = 20260803
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  let written = 0
  while (written < count) {
    // Exponential disk: surface density falls off with radius, thin in z.
    const radius = -3500 * Math.log(1 - random() * 0.999)
    if (radius > DISK_RADIUS_PC || radius < 300) continue

    const beta = random() * 360
    // Thin-disk scale height is around 300 pc; sample both signs.
    const z = -300 * Math.log(1 - random() * 0.999) * (random() < 0.5 ? 1 : -1)

    const point = galacticToEquatorial(galactocentricToHeliocentric(radius, beta, z))
    positions[written * 3] = point[0]
    positions[written * 3 + 1] = point[1]
    positions[written * 3 + 2] = point[2]
    written++
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geometry
}

/**
 * Ring at the catalogue's edge, centred on the Sun.
 *
 * At galactic range the real stars are correctly too faint to see, which leaves
 * nothing showing how little of the Galaxy is actually measured. This draws
 * that boundary explicitly rather than letting the model imply full coverage.
 */
function catalogueLimitRing(radiusPc: number): THREE.BufferGeometry {
  const positions: number[] = []
  const segments = 128

  for (let i = 0; i < segments; i++) {
    const a0 = ((i / segments) * Math.PI * 2)
    const a1 = (((i + 1) / segments) * Math.PI * 2)
    // Centred on the Sun (the origin), lying in the galactic plane.
    positions.push(
      ...galacticToEquatorial([radiusPc * Math.cos(a0), radiusPc * Math.sin(a0), 0]),
      ...galacticToEquatorial([radiusPc * Math.cos(a1), radiusPc * Math.sin(a1), 0]),
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

/** The central bar, as a simple ellipse outline. */
function barOutline(): THREE.BufferGeometry {
  const positions: number[] = []
  const segments = 96
  const semiMajor = BAR_HALF_LENGTH_PC
  const semiMinor = BAR_HALF_LENGTH_PC * 0.35
  const angle = BAR_ANGLE_DEG * DEG2RAD

  const point = (t: number): Vec3 => {
    const x = semiMajor * Math.cos(t)
    const y = semiMinor * Math.sin(t)
    // Rotate in the galactic plane, then offset from the Centre.
    const gx = R_SUN_PC - (x * Math.cos(angle) - y * Math.sin(angle))
    const gy = x * Math.sin(angle) + y * Math.cos(angle)
    return galacticToEquatorial([gx, gy, 0])
  }

  for (let i = 0; i < segments; i++) {
    positions.push(
      ...point((i / segments) * Math.PI * 2),
      ...point(((i + 1) / segments) * Math.PI * 2),
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

/** How far the real catalogue reaches, matching MAX_DISTANCE_PC in the pipeline. */
const CATALOGUE_LIMIT_PC = 3000

const ARM_COLOURS: Record<string, string> = {
  Local: '#7cc6ff',
  Perseus: '#5d8fc4',
  'Sagittarius–Carina': '#5d8fc4',
  'Scutum–Centaurus': '#4a7099',
  Norma: '#43617f',
  Outer: '#43617f',
  '3 kpc': '#3a5570',
}

export function Galaxy() {
  const show = useStarmap((state) => state.showGalaxy)
  const showLabels = useStarmap((state) => state.showLabels)

  const arms = useMemo(
    () =>
      REID_2019_ARMS.map((arm) => {
        const points = armPolyline(arm)
        // Label at the arm's outermost drawn point: the inner ends all crowd
        // together near the bar, so midpoints pile the labels on top of each other.
        let outermost = points[0]
        let best = -1
        for (const point of points) {
          const radius = Math.hypot(...point)
          if (radius > best) {
            best = radius
            outermost = point
          }
        }

        return { arm, geometry: polylineGeometry(points), labelAt: outermost }
      }),
    [],
  )

  const rings = useMemo(diskRings, [])
  const haze = useMemo(() => diskHaze(), [])
  const bar = useMemo(barOutline, [])
  const centre = useMemo(galacticCentre, [])
  const limit = useMemo(() => catalogueLimitRing(CATALOGUE_LIMIT_PC), [])

  if (!show) return null

  return (
    <group>
      <points geometry={haze} frustumCulled={false}>
        <pointsMaterial
          size={1.6}
          sizeAttenuation={false}
          color="#6f86ad"
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <lineSegments geometry={rings} frustumCulled={false}>
        <lineBasicMaterial color="#2b4560" transparent opacity={0.22} depthWrite={false} depthTest={false} />
      </lineSegments>

      <lineSegments geometry={limit} frustumCulled={false}>
        <lineBasicMaterial color="#7cc6ff" transparent opacity={0.45} depthWrite={false} depthTest={false} />
      </lineSegments>

      <lineSegments geometry={bar} frustumCulled={false}>
        <lineBasicMaterial color="#8a6f4a" transparent opacity={0.6} depthWrite={false} depthTest={false} />
      </lineSegments>

      {arms.map(({ arm, geometry }) => (
        <lineSegments key={arm.name} geometry={geometry} frustumCulled={false}>
          <lineBasicMaterial
            color={ARM_COLOURS[arm.name] ?? '#5d8fc4'}
            transparent
            // The Local Arm is the one the viewer is standing in, so it leads.
            opacity={arm.name === 'Local' ? 1 : 0.8}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      ))}

      {showLabels && (
        <>
          <Html position={centre} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
            <div className="galaxy-tag galaxy-tag-centre">
              Galactic Centre
              <span>8,150 pc</span>
            </div>
          </Html>

          <Html
            position={galacticToEquatorial([0, -CATALOGUE_LIMIT_PC, 0])}
            center
            zIndexRange={[15, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div className="galaxy-tag galaxy-tag-local">real stars end here · 3 kpc</div>
          </Html>

          {arms.map(({ arm, labelAt }) =>
            labelAt ? (
              <Html
                key={arm.name}
                position={labelAt}
                center
                zIndexRange={[14, 0]}
                style={{ pointerEvents: 'none' }}
              >
                <div className={`galaxy-tag${arm.name === 'Local' ? ' galaxy-tag-local' : ''}`}>
                  {arm.name}
                </div>
              </Html>
            ) : null,
          )}
        </>
      )}
    </group>
  )
}
