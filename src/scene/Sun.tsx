import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Marks the origin. The Sun is in the catalogue as an ordinary star, but at
 * zero distance the apparent-magnitude shader would render it as a screen-wide
 * white disc, so the viewpoint gets its own restrained marker instead.
 */
export function Sun() {
  const ring = useRef<THREE.Mesh>(null)

  useFrame(({ camera }) => {
    // Hold the marker at a constant screen size regardless of zoom.
    if (!ring.current) return
    const distance = camera.position.length()
    const scale = Math.max(distance * 0.012, 0.05)
    ring.current.scale.setScalar(scale)
    ring.current.quaternion.copy(camera.quaternion)
  })

  return (
    <mesh ref={ring}>
      <ringGeometry args={[0.7, 1, 32]} />
      <meshBasicMaterial
        color="#ffd27f"
        transparent
        opacity={0.75}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}
