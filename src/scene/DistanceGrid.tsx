import { useMemo } from 'react'
import * as THREE from 'three'
import { LY_PER_PC } from '../lib/astro.ts'
import { useStarmap } from '../state/store.ts'

const RINGS_PC = [10, 25, 50, 100, 250, 500, 1000]
const SEGMENTS = 180
const SPOKES = 12

/**
 * Concentric rings in the reference plane, giving the eye something to judge
 * distance against. Without it the field reads as a flat scatter.
 */
export function DistanceGrid() {
  const showGrid = useStarmap((state) => state.showGrid)

  const { rings, spokes } = useMemo(() => {
    const ringPositions: number[] = []
    for (const radius of RINGS_PC) {
      for (let i = 0; i < SEGMENTS; i++) {
        const a0 = (i / SEGMENTS) * Math.PI * 2
        const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2
        ringPositions.push(
          Math.cos(a0) * radius, 0, Math.sin(a0) * radius,
          Math.cos(a1) * radius, 0, Math.sin(a1) * radius,
        )
      }
    }

    const spokePositions: number[] = []
    const outer = RINGS_PC[RINGS_PC.length - 1]
    for (let i = 0; i < SPOKES; i++) {
      const angle = (i / SPOKES) * Math.PI * 2
      spokePositions.push(0, 0, 0, Math.cos(angle) * outer, 0, Math.sin(angle) * outer)
    }

    const make = (positions: number[]) => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      return geometry
    }

    return { rings: make(ringPositions), spokes: make(spokePositions) }
  }, [])

  if (!showGrid) return null

  return (
    <group>
      <lineSegments geometry={rings}>
        <lineBasicMaterial color="#2a4468" transparent opacity={0.55} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={spokes}>
        <lineBasicMaterial color="#1d3050" transparent opacity={0.35} depthWrite={false} />
      </lineSegments>
    </group>
  )
}

/** Ring radii and their labels, for the HTML overlay to annotate. */
export function gridRings(unit: 'pc' | 'ly') {
  return RINGS_PC.map((pc) => ({
    pc,
    label: unit === 'pc' ? `${pc} pc` : `${Math.round(pc * LY_PER_PC)} ly`,
  }))
}
