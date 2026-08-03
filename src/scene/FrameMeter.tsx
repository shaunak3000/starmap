import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStarmap } from '../state/store.ts'

/**
 * Rolling frame rate, published to the store about twice a second.
 *
 * Worth having in the UI rather than only in devtools: the faint field is a
 * 1.8M-point layer whose cost depends entirely on the viewer's GPU, and this is
 * how someone decides whether to leave it on.
 */
export function FrameMeter() {
  const frames = useRef(0)
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    frames.current += 1
    elapsed.current += delta

    if (elapsed.current >= 0.5) {
      const fps = frames.current / elapsed.current
      frames.current = 0
      elapsed.current = 0

      const previous = useStarmap.getState().fps
      // Round to whole frames so the readout is not a blur of digits.
      const rounded = Math.round(fps)
      if (rounded !== previous) useStarmap.setState({ fps: rounded })
    }
  })

  return null
}
