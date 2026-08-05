import { useMemo } from 'react'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useStarmap } from '../state/store.ts'
import { AxisGrid } from './AxisGrid.tsx'
import { CameraRig } from './CameraRig.tsx'
import { ConstellationLines } from './ConstellationLines.tsx'
import { ConstellationMembers } from './ConstellationMembers.tsx'
import { FrameMeter } from './FrameMeter.tsx'
import { LabelPlacer } from './LabelPlacer.tsx'
import { Galaxy } from './Galaxy.tsx'
import { Picking } from './Picking.tsx'
import { SelectionMarker } from './SelectionMarker.tsx'
import { StarField } from './StarField.tsx'
import { Sun } from './Sun.tsx'
import { frameMatrix } from './frame.ts'

export function Scene() {
  const catalog = useStarmap((state) => state.catalog)
  const fieldTier = useStarmap((state) => state.fieldTier)
  const showFaintField = useStarmap((state) => state.showFaintField)
  const frame = useStarmap((state) => state.frame)
  const bloom = useStarmap((state) => state.bloom)
  const cameraMode = useStarmap((state) => state.cameraMode)
  const isolate = useStarmap((state) => state.isolate)
  const activeConstellation = useStarmap((state) => state.activeConstellation)
  const selection = useStarmap((state) => state.selection)

  const matrix = useMemo(() => frameMatrix(frame), [frame])

  // Isolation only means anything once something is actually selected;
  // otherwise the toggle would just blank the screen.
  const isolating = isolate && (activeConstellation !== null || selection !== null)

  return (
    <>
      <CameraRig />
      <Picking />
      <FrameMeter />
      <LabelPlacer />

      <group matrixAutoUpdate={false} matrix={matrix}>
        {catalog && <StarField tier={catalog.t0} visible={!isolating} />}
        {catalog && <StarField tier={catalog.t1} sizeScale={0.85} visible={!isolating} />}
        {fieldTier && (
          <StarField
            tier={fieldTier}
            sizeScale={0.7}
            // 1.77M sprites: held right down, and trimmed further in map mode
            // where every one of them draws at full size regardless of distance.
            intensityScale={0.28}
            mapSizeScale={0.45}
            visible={showFaintField && !isolating}
          />
        )}

        <Galaxy />
        <ConstellationLines />
        <ConstellationMembers />
        <SelectionMarker />
        <AxisGrid />
      </group>

      {/* In planetarium mode you are standing on it, so the marker only gets in the way. */}
      {cameraMode !== 'earth' && <Sun />}

      {bloom > 0 && (
        <EffectComposer>
          <Bloom
            mipmapBlur
            intensity={bloom}
            luminanceThreshold={0.15}
            luminanceSmoothing={0.4}
          />
        </EffectComposer>
      )}
    </>
  )
}
