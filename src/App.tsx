import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Scene } from './scene/Scene.tsx'
import { useStarmap } from './state/store.ts'
import { Hud } from './ui/Hud.tsx'
import { SearchBox } from './ui/SearchBox.tsx'
import { Sidebar } from './ui/Sidebar.tsx'
import { StarCard } from './ui/StarCard.tsx'

function LoadState() {
  const loading = useStarmap((state) => state.loading)
  const error = useStarmap((state) => state.error)

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

  return null
}

export default function App() {
  const init = useStarmap((state) => state.init)
  const ready = useStarmap((state) => state.catalog !== null)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    // The camera-input harness projects world points to check what the viewer
    // actually sees move; that needs three's maths in the page.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __three: typeof THREE }).__three = THREE
    }
  }, [])

  return (
    <>
      <Canvas
        camera={{ fov: 60, near: 0.01, far: 120000, position: [0, 0, 60] }}
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

      <LoadState />

      {ready && (
        <>
          <Sidebar />
          <SearchBox />
          <StarCard />
          <Hud />
        </>
      )}
    </>
  )
}
