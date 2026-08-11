import { useEffect, useMemo } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { DetailTier } from '../lib/catalog-format.ts'
import { epochPosition } from '../lib/epoch.ts'
import { starLabel } from '../lib/catalog-loader.ts'
import { useStarmap } from '../state/store.ts'

/** Position a tier-0 star currently occupies, accounting for the collapse. */
function renderedPosition(
  t0: DetailTier,
  index: number,
  dissolve: number,
  sphereRadiusPc: number,
  years: number,
): THREE.Vector3 {
  const position = new THREE.Vector3(...epochPosition(t0, index, years))
  return position
    .clone()
    .normalize()
    .multiplyScalar(sphereRadiusPc)
    .lerp(position, dissolve)
}

/** Rings and a name tag for the hovered and selected stars. */
export function SelectionMarker() {
  const catalog = useStarmap((state) => state.catalog)
  const hovered = useStarmap((state) => state.hovered)
  const selection = useStarmap((state) => state.selection)
  const dissolve = useStarmap((state) => state.dissolve)
  const sphereRadiusPc = useStarmap((state) => state.sphereRadiusPc)
  const years = useStarmap((state) => state.years)

  const hoverPosition = useMemo(() => {
    if (!catalog || hovered === null) return null
    return renderedPosition(catalog.t0, hovered, dissolve, sphereRadiusPc, years)
  }, [catalog, hovered, dissolve, sphereRadiusPc, years])

  const selectedPosition = useMemo(() => {
    if (!catalog || !selection) return null
    return renderedPosition(catalog.t0, selection.index, dissolve, sphereRadiusPc, years)
  }, [catalog, selection, dissolve, sphereRadiusPc, years])

  const selectedGeometry = useMemo(() => {
    if (!selectedPosition) return null
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [selectedPosition.x, selectedPosition.y, selectedPosition.z],
        3,
      ),
    )
    return geometry
  }, [selectedPosition])

  useEffect(() => () => selectedGeometry?.dispose(), [selectedGeometry])

  if (!catalog) return null

  return (
    <>
      {/* Drawn explicitly so a selected star survives isolation, which hides
          the tier it normally comes from. */}
      {selectedGeometry && (
        <points geometry={selectedGeometry} frustumCulled={false}>
          <pointsMaterial
            size={7}
            sizeAttenuation={false}
            color="#ffffff"
            transparent
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}

      {hoverPosition && hovered !== selection?.index && (
        <Html position={hoverPosition} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div className="hover-tag">{starLabel(catalog.metaByIndex.get(hovered!))}</div>
        </Html>
      )}

      {selectedPosition && (
        <Html
          position={selectedPosition}
          center
          zIndexRange={[30, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="selection-ring" />
        </Html>
      )}
    </>
  )
}
