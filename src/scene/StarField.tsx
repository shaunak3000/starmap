import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import type { CatalogTier } from '../lib/catalog-format.ts'
import { useStarmap } from '../state/store.ts'
import { createStarGeometry, createStarMaterial } from './starMaterial.ts'

/** Slider maximum; at or above this the distance filter is switched off entirely. */
export const DISTANCE_FILTER_MAX_PC = 1000

interface StarFieldProps {
  tier: CatalogTier
  /** Scales point size, letting fainter tiers render more subtly. */
  sizeScale?: number
  visible?: boolean
}

export function StarField({ tier, sizeScale = 1, visible = true }: StarFieldProps) {
  const gl = useThree((state) => state.gl)

  const geometry = useMemo(() => createStarGeometry(tier), [tier])
  const material = useMemo(() => createStarMaterial(), [])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  const sizeMode = useStarmap((state) => state.sizeMode)
  const exposure = useStarmap((state) => state.exposure)
  const maxDistancePc = useStarmap((state) => state.maxDistancePc)

  useEffect(() => {
    const uniforms = material.uniforms
    uniforms.uSizeMode.value = sizeMode === 'apparent' ? 0 : 1
    uniforms.uExposure.value = exposure
    uniforms.uBaseSize.value = 1.6 * sizeScale
    uniforms.uMapScale.value = 1.5 * sizeScale
    // The far constellation anchors sit past 1000 pc, so the top of the slider
    // has to mean "no limit" rather than a hard cut that breaks their figures.
    uniforms.uMaxDistancePc.value =
      maxDistancePc >= DISTANCE_FILTER_MAX_PC ? 1e9 : maxDistancePc
  }, [material, sizeMode, exposure, maxDistancePc, sizeScale])

  useEffect(() => {
    material.uniforms.uPixelRatio.value = gl.getPixelRatio()
  }, [material, gl])

  return (
    <points
      geometry={geometry}
      material={material}
      visible={visible}
      // The cloud always surrounds the camera; culling it wastes a bounds test.
      frustumCulled={false}
    />
  )
}
