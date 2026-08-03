import { useMemo } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useStarmap } from '../state/store.ts'
import { DistanceGrid } from './DistanceGrid.tsx'
import { StarField } from './StarField.tsx'
import { Sun } from './Sun.tsx'
import { frameMatrix } from './frame.ts'

export function Scene() {
  const catalog = useStarmap((state) => state.catalog)
  const fieldTier = useStarmap((state) => state.fieldTier)
  const showFaintField = useStarmap((state) => state.showFaintField)
  const frame = useStarmap((state) => state.frame)
  const bloom = useStarmap((state) => state.bloom)

  const matrix = useMemo(() => frameMatrix(frame), [frame])

  return (
    <>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.45}
        zoomSpeed={0.9}
        minDistance={0.05}
        maxDistance={6000}
      />

      <group matrixAutoUpdate={false} matrix={matrix}>
        {catalog && <StarField tier={catalog.t0} />}
        {catalog && <StarField tier={catalog.t1} sizeScale={0.85} />}
        {fieldTier && <StarField tier={fieldTier} sizeScale={0.7} visible={showFaintField} />}
        <DistanceGrid />
      </group>

      <Sun />

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
