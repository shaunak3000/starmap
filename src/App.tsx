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
import { StarCard } from './ui/StarCard.tsx'
import { Tour } from './ui/Tour.tsx'
import { UrlSync } from './ui/UrlSync.tsx'
import { ViewPanel } from './ui/ViewPanel.tsx'
import { useEdgeReveal } from './ui/useEdgeReveal.ts'

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
  const autoHide = useStarmap((state) => state.autoHidePanels)
  const touring = useStarmap((state) => state.tourStep !== null)

  // The tour fades the panels itself, so edge reveal stays out of its way.
  const left = useEdgeReveal<HTMLElement>('left', autoHide && !touring)
  const right = useEdgeReveal<HTMLElement>('right', autoHide && !touring)

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
        // Drive the chrome that sits between the columns, so the HUD, star card
        // and HR panel reclaim the space a hidden panel leaves behind.
        left.open ? '' : 'left-hidden',
        right.open ? '' : 'right-hidden',
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
          <ViewPanel ref={left.ref} open={left.open} />
          <LayersPanel ref={right.ref} open={right.open} />

          {/* Always-visible handles: a panel that has slid away needs to leave
              some sign that it exists, or the controls simply vanish. */}
          {autoHide && (
            <>
              <div className={`edge-handle edge-handle-left${left.open ? ' is-open' : ''}`} aria-hidden />
              <div className={`edge-handle edge-handle-right${right.open ? ' is-open' : ''}`} aria-hidden />
            </>
          )}
          <SearchBox />
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
