import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import type { CatalogTier } from '../lib/catalog-format.ts'
import { useStarmap } from '../state/store.ts'
import { createStarGeometry, createStarMaterial } from './starMaterial.ts'

/** Slider maximum; at or above this the distance filter is switched off entirely. */
export const DISTANCE_FILTER_MAX_PC = 1000

/**
 * Default radius of the shell stars collapse onto at dissolve 0, used until a
 * constellation reveal retunes it. Sits beyond most naked-eye stars so the
 * flattened sky reads as a dome you are inside.
 */
export const CELESTIAL_SPHERE_RADIUS_PC = 120

interface StarFieldProps {
  tier: CatalogTier
  /** Scales point size, letting fainter tiers render more subtly. */
  sizeScale?: number
  /** Scales brightness; the faint field needs holding well below 1. */
  intensityScale?: number
  /** Extra size trim applied only in map mode, where distance is ignored. */
  mapSizeScale?: number
  visible?: boolean
}

export function StarField({
  tier,
  sizeScale = 1,
  intensityScale = 1,
  mapSizeScale = 1,
  visible = true,
}: StarFieldProps) {
  const gl = useThree((state) => state.gl)

  const geometry = useMemo(() => createStarGeometry(tier), [tier])
  const material = useMemo(() => createStarMaterial(), [])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  const sizeMode = useStarmap((state) => state.sizeMode)
  const exposure = useStarmap((state) => state.exposure)
  const maxDistancePc = useStarmap((state) => state.maxDistancePc)
  const dissolve = useStarmap((state) => state.dissolve)
  const sphereRadiusPc = useStarmap((state) => state.sphereRadiusPc)

  useEffect(() => {
    const uniforms = material.uniforms
    uniforms.uSizeMode.value = sizeMode === 'apparent' ? 0 : 1
    uniforms.uExposure.value = exposure
    uniforms.uBaseSize.value = 2.0 * sizeScale
    uniforms.uMapScale.value = 1.5 * sizeScale * mapSizeScale
    uniforms.uIntensityScale.value = intensityScale
    uniforms.uDissolve.value = dissolve
    uniforms.uSphereRadius.value = sphereRadiusPc
    // The far constellation anchors sit past 1000 pc, so the top of the slider
    // has to mean "no limit" rather than a hard cut that breaks their figures.
    uniforms.uMaxDistancePc.value =
      maxDistancePc >= DISTANCE_FILTER_MAX_PC ? 1e9 : maxDistancePc
  }, [
    material,
    sizeMode,
    exposure,
    maxDistancePc,
    sizeScale,
    intensityScale,
    mapSizeScale,
    dissolve,
    sphereRadiusPc,
  ])

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
