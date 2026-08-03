import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FIELDS_PER_STAR } from '../lib/catalog-format.ts'
import { useStarmap } from '../state/store.ts'
import { frameMatrix } from './frame.ts'

/** Pointer must land within this many pixels of a star to hit it. */
const HIT_RADIUS_PX = 18

/**
 * Screen-space picking against tier 0.
 *
 * Only the named and naked-eye tier is pickable: those are the stars anyone
 * would want to interrogate, and 8k projections on a pointer move is cheap
 * where 1.8M would not be. Positions follow the dissolve so you always pick
 * the star you can actually see.
 */
export function Picking() {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)

  const catalog = useStarmap((state) => state.catalog)
  const dissolve = useStarmap((state) => state.dissolve)
  const sphereRadiusPc = useStarmap((state) => state.sphereRadiusPc)
  const frame = useStarmap((state) => state.frame)

  const dataToWorld = useMemo(() => frameMatrix(frame), [frame])

  /** World-space positions as currently drawn, rebuilt when the morph changes. */
  const worldPositions = useMemo(() => {
    if (!catalog) return null

    const { attributes, count } = catalog.t0
    const out = new Float32Array(count * 3)
    const vector = new THREE.Vector3()

    for (let i = 0; i < count; i++) {
      const base = i * FIELDS_PER_STAR
      const x = attributes[base]
      const y = attributes[base + 1]
      const z = attributes[base + 2]

      const length = Math.hypot(x, y, z) || 1
      const shell = sphereRadiusPc / length
      vector
        .set(
          x * shell * (1 - dissolve) + x * dissolve,
          y * shell * (1 - dissolve) + y * dissolve,
          z * shell * (1 - dissolve) + z * dissolve,
        )
        .applyMatrix4(dataToWorld)

      out[i * 3] = vector.x
      out[i * 3 + 1] = vector.y
      out[i * 3 + 2] = vector.z
    }

    return out
  }, [catalog, dissolve, sphereRadiusPc, dataToWorld])

  const pointer = useRef<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  const dragDistance = useRef(0)

  useEffect(() => {
    const element = gl.domElement

    const onPointerDown = () => {
      dragging.current = true
      dragDistance.current = 0
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      if (dragging.current) {
        dragDistance.current += Math.abs(event.movementX) + Math.abs(event.movementY)
      }
      pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    const onPointerUp = () => {
      // Only treat it as a click if the pointer barely moved; otherwise every
      // orbit drag would reselect whatever it finished over.
      if (dragging.current && dragDistance.current < 6) {
        const hovered = useStarmap.getState().hovered
        useStarmap.getState().select(hovered)
      }
      dragging.current = false
    }

    const onPointerLeave = () => {
      pointer.current = null
      useStarmap.setState({ hovered: null })
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointerleave', onPointerLeave)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [gl])

  const scratch = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    if (!worldPositions || !pointer.current) return

    const element = gl.domElement
    const width = element.clientWidth
    const height = element.clientHeight
    const { x: px, y: py } = pointer.current

    let bestIndex: number | null = null
    let bestDistance = HIT_RADIUS_PX * HIT_RADIUS_PX

    const count = worldPositions.length / 3
    for (let i = 0; i < count; i++) {
      scratch
        .set(worldPositions[i * 3], worldPositions[i * 3 + 1], worldPositions[i * 3 + 2])
        .project(camera)

      // Behind the camera.
      if (scratch.z > 1) continue

      const sx = (scratch.x * 0.5 + 0.5) * width
      const sy = (-scratch.y * 0.5 + 0.5) * height
      const dx = sx - px
      const dy = sy - py
      const squared = dx * dx + dy * dy

      if (squared < bestDistance) {
        bestDistance = squared
        bestIndex = i
      }
    }

    if (useStarmap.getState().hovered !== bestIndex) {
      useStarmap.setState({ hovered: bestIndex })
    }
  })

  return null
}
