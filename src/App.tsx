import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Scene } from './scene/Scene.tsx'
import { useStarmap } from './state/store.ts'
import { HrDiagram } from './ui/HrDiagram.tsx'
import { Hud } from './ui/Hud.tsx'
import { LabelLayer } from './ui/LabelLayer.tsx'
import { LayersPanel } from './ui/LayersPanel.tsx'
import { SearchBox } from './ui/SearchBox.tsx'
import { SidebarToggle } from './ui/SidebarToggle.tsx'
import { StarCard } from './ui/StarCard.tsx'
import { Tour } from './ui/Tour.tsx'
import { UrlSync } from './ui/UrlSync.tsx'
import { ViewPanel } from './ui/ViewPanel.tsx'

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
  const showHr = useStarmap((state) => state.showHrDiagram)
  const hidden = useStarmap((state) => state.hideSidebars)
  const setHideSidebars = useStarmap((state) => state.setHideSidebars)
  const touring = useStarmap((state) => state.tourStep !== null)

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
    <div
      className={[
        'app-root',
        touring ? 'tour-playing' : '',
        // Drives the chrome that sits between the columns, so the HUD, star card
        // and HR panel reclaim the space the panels leave behind.
        hidden ? 'sidebars-hidden' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
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
          <ViewPanel open={!hidden} />
          <LayersPanel open={!hidden} />

          {/* Buttons, not decoration: a panel that has slid away needs to leave
              some sign that it exists, and on touch there is no pointer to
              hover with — the handle has to be tappable to be a way back. */}
          {hidden && (
            <>
              <button
                type="button"
                className="edge-handle edge-handle-left"
                aria-label="Show the side panels"
                onClick={() => setHideSidebars(false)}
              />
              <button
                type="button"
                className="edge-handle edge-handle-right"
                aria-label="Show the side panels"
                onClick={() => setHideSidebars(false)}
              />
            </>
          )}

          <div className="top-bar">
            <SearchBox />
            <SidebarToggle />
          </div>
          <StarCard />
          {showHr && <HrDiagram />}
          <Hud />
          <LabelLayer />
          <Tour />
          <UrlSync />
        </>
      )}
    </div>
  )
}
