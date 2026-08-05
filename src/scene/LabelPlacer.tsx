import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStarmap } from '../state/store.ts'
import { labelNodes } from './labels.ts'
import { frameMatrix } from './frame.ts'

/**
 * Places star labels in screen space, rejecting collisions.
 *
 * Anchoring one label per star and hoping for the best turned the near end of a
 * figure into a pile of overlapping text — Orion's shield and Canis Major's
 * inner group were both unreadable. Candidates are placed in priority order and
 * any whose box would overlap one already placed is dropped: showing fewer
 * labels beats stacking two.
 *
 * Nodes are moved imperatively rather than through React state, because the
 * camera moves every frame and re-rendering a tree at 60 Hz to nudge some text
 * would be pure waste.
 */

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Breathing room around each label, in pixels. */
const PADDING = 6

function overlaps(a: Rect, b: Rect): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

export function LabelPlacer() {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)

  const frame = useStarmap((state) => state.frame)
  const candidates = useStarmap((state) => state.labelCandidates)
  const showLabels = useStarmap((state) => state.showLabels)
  const dissolve = useStarmap((state) => state.dissolve)

  const dataToWorld = useMemo(() => frameMatrix(frame), [frame])
  const scratch = useMemo(() => new THREE.Vector3(), [])

  const ordered = useMemo(
    () => [...candidates].sort((a, b) => a.priority - b.priority),
    [candidates],
  )

  // Labels quote true distances, so they would be lying about a star drawn on
  // the collapsed shell.
  const visible = showLabels && dissolve > 0.6

  useFrame(() => {
    const width = gl.domElement.clientWidth
    const height = gl.domElement.clientHeight
    const placed: Rect[] = []

    for (const candidate of ordered) {
      const node = labelNodes.get(candidate.key)
      if (!node) continue

      if (!visible) {
        node.style.visibility = 'hidden'
        continue
      }

      scratch.copy(candidate.position).applyMatrix4(dataToWorld).project(camera)

      // Behind the camera.
      if (scratch.z > 1) {
        node.style.visibility = 'hidden'
        continue
      }

      const x = (scratch.x * 0.5 + 0.5) * width
      const y = (-scratch.y * 0.5 + 0.5) * height
      if (x < -120 || x > width + 120 || y < -60 || y > height + 60) {
        node.style.visibility = 'hidden'
        continue
      }

      // Reading offsetWidth forces layout, so it happens only for labels that
      // survived the cheap rejections above.
      const w = node.offsetWidth
      const h = node.offsetHeight
      const rect: Rect = {
        left: x - w / 2 - PADDING,
        right: x + w / 2 + PADDING,
        // Anchored above the star, matching the transform applied below.
        top: y - h - PADDING,
        bottom: y + PADDING,
      }

      if (placed.some((other) => overlaps(rect, other))) {
        node.style.visibility = 'hidden'
        continue
      }

      placed.push(rect)
      node.style.visibility = 'visible'
      node.style.transform = `translate(-50%, -100%) translate(${Math.round(x)}px, ${Math.round(y)}px)`
    }
  })

  return null
}
