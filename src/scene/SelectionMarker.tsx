import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { FIELDS_PER_STAR } from '../lib/catalog-format.ts'
import { starLabel } from '../lib/catalog-loader.ts'
import { useStarmap } from '../state/store.ts'

/** Position a tier-0 star currently occupies, accounting for the collapse. */
function renderedPosition(
  attributes: Float32Array,
  index: number,
  dissolve: number,
  sphereRadiusPc: number,
): THREE.Vector3 {
  const base = index * FIELDS_PER_STAR
  const position = new THREE.Vector3(
    attributes[base],
    attributes[base + 1],
    attributes[base + 2],
  )
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

  const hoverPosition = useMemo(() => {
    if (!catalog || hovered === null) return null
    return renderedPosition(catalog.t0.attributes, hovered, dissolve, sphereRadiusPc)
  }, [catalog, hovered, dissolve, sphereRadiusPc])

  const selectedPosition = useMemo(() => {
    if (!catalog || !selection) return null
    return renderedPosition(catalog.t0.attributes, selection.index, dissolve, sphereRadiusPc)
  }, [catalog, selection, dissolve, sphereRadiusPc])

  if (!catalog) return null

  return (
    <>
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
