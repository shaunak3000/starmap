import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStarmap } from '../state/store.ts'

/**
 * Cartesian XYZ reference grid.
 *
 * The scene spans six orders of magnitude, so a fixed grid is useless at all
 * but one of them. This one snaps its spacing to the nearest 1/2/5 decade below
 * the current view distance, the way a map scale bar does, and relabels itself.
 */

const CELLS = 10

/** Nearest 1-2-5 step at or below `target`. */
function niceStep(target: number): number {
  const decade = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1e-6))))
  const scaled = target / decade
  if (scaled >= 5) return 5 * decade
  if (scaled >= 2) return 2 * decade
  return decade
}

/** One square lattice in the plane spanned by two axes. */
function planeGeometry(axisA: 'x' | 'y' | 'z', axisB: 'x' | 'y' | 'z'): THREE.BufferGeometry {
  const positions: number[] = []
  const index = { x: 0, y: 1, z: 2 }

  const push = (a: number, b: number) => {
    const point = [0, 0, 0]
    point[index[axisA]] = a
    point[index[axisB]] = b
    positions.push(...point)
  }

  for (let i = -CELLS; i <= CELLS; i++) {
    push(i, -CELLS)
    push(i, CELLS)
    push(-CELLS, i)
    push(CELLS, i)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

function axisGeometry(): THREE.BufferGeometry {
  const positions = [
    -CELLS, 0, 0, CELLS, 0, 0,
    0, -CELLS, 0, 0, CELLS, 0,
    0, 0, -CELLS, 0, 0, CELLS,
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  // Per-axis tint: x red, y green, z blue, the usual convention.
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(
      [
        0.85, 0.33, 0.36, 0.85, 0.33, 0.36,
        0.4, 0.8, 0.48, 0.4, 0.8, 0.48,
        0.42, 0.58, 0.95, 0.42, 0.58, 0.95,
      ],
      3,
    ),
  )
  return geometry
}

export function AxisGrid() {
  const showGrid = useStarmap((state) => state.showGrid)

  const planes = useMemo(
    () => ({
      xy: planeGeometry('x', 'y'),
      xz: planeGeometry('x', 'z'),
      yz: planeGeometry('y', 'z'),
    }),
    [],
  )
  const axes = useMemo(axisGeometry, [])

  const group = useRef<THREE.Group>(null)

  useFrame(({ camera }) => {
    if (!group.current) return
    // Keep roughly ten cells across the view, whatever the scale.
    const step = niceStep(Math.max(camera.position.length(), 0.05) / 4)
    group.current.scale.setScalar(step)
    // Published so the HUD can label what one cell is worth.
    if (useStarmap.getState().gridStepPc !== step) {
      useStarmap.setState({ gridStepPc: step })
    }
  })

  if (!showGrid) return null

  return (
    <>
      <group ref={group}>
        {/* The XY plane is the busiest read, so the other two sit further back. */}
        <lineSegments geometry={planes.xy} frustumCulled={false}>
          <lineBasicMaterial color="#2a3f5c" transparent opacity={0.4} depthWrite={false} />
        </lineSegments>
        <lineSegments geometry={planes.xz} frustumCulled={false}>
          <lineBasicMaterial color="#233650" transparent opacity={0.16} depthWrite={false} />
        </lineSegments>
        <lineSegments geometry={planes.yz} frustumCulled={false}>
          <lineBasicMaterial color="#233650" transparent opacity={0.16} depthWrite={false} />
        </lineSegments>

        <lineSegments geometry={axes} frustumCulled={false}>
          <lineBasicMaterial vertexColors transparent opacity={0.75} depthWrite={false} />
        </lineSegments>
      </group>
    </>
  )
}
