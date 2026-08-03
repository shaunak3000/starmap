import { useMemo } from 'react'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useStarmap } from '../state/store.ts'
import { CameraRig } from './CameraRig.tsx'
import { ConstellationLines } from './ConstellationLines.tsx'
import { ConstellationMembers } from './ConstellationMembers.tsx'
import { DistanceGrid } from './DistanceGrid.tsx'
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

  const matrix = useMemo(() => frameMatrix(frame), [frame])

  return (
    <>
      <CameraRig />
      <Picking />

      <group matrixAutoUpdate={false} matrix={matrix}>
        {catalog && <StarField tier={catalog.t0} />}
        {catalog && <StarField tier={catalog.t1} sizeScale={0.85} />}
        {fieldTier && <StarField tier={fieldTier} sizeScale={0.7} visible={showFaintField} />}
        <ConstellationLines />
        <ConstellationMembers />
        <SelectionMarker />
        <DistanceGrid />
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
