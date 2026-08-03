import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Scene } from './scene/Scene.tsx'
import { useStarmap } from './state/store.ts'

function Overlay() {
  const loading = useStarmap((state) => state.loading)
  const error = useStarmap((state) => state.error)
  const catalog = useStarmap((state) => state.catalog)

  if (error) {
    return (
      <div className="overlay">
        <p className="overlay-title">Could not load the catalogue</p>
        <p className="overlay-detail">{error}</p>
        <p className="overlay-detail">Run `npm run data` to generate it.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="overlay">
        <p className="overlay-title">Loading the neighbourhood…</p>
      </div>
    )
  }

  if (!catalog) return null

  const total = catalog.t0.count + catalog.t1.count
  return (
    <div className="hud">
      {total.toLocaleString()} stars · {catalog.constellations.length} constellations
    </div>
  )
}

export default function App() {
  const init = useStarmap((state) => state.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <>
      <Canvas
        camera={{ fov: 60, near: 0.01, far: 20000, position: [0, 0, 60] }}
        gl={{
          antialias: true,
          // Stars are additive point sprites with a huge dynamic range; filmic
          // tone mapping crushes their colour toward white. Bloom carries the
          // highlights instead.
          toneMapping: THREE.NoToneMapping,
          // Screenshot tooling needs to sample the canvas after compositing.
          preserveDrawingBuffer: new URLSearchParams(location.search).has('probe'),
        }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#05060a']} />
        <Scene />
      </Canvas>
      <Overlay />
    </>
  )
}
