import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { FIELDS_PER_STAR, type CatalogTier, type Constellation } from '../lib/catalog-format.ts'
import { useStarmap } from '../state/store.ts'
import { CELESTIAL_SPHERE_RADIUS_PC } from './StarField.tsx'

/**
 * Figure lines morph on exactly the same curve as the star field, so the sticks
 * stay welded to their stars through the whole collapse.
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uDissolve;
  uniform float uSphereRadius;

  void main() {
    vec3 renderPosition = mix(
      normalize(position) * uSphereRadius,
      position,
      uDissolve
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(renderPosition, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform vec3  uColor;
  uniform float uOpacity;

  void main() {
    gl_FragColor = vec4(uColor * uOpacity, uOpacity);
  }
`

function createLineMaterial(color: string, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uDissolve: { value: 1 },
      uSphereRadius: { value: CELESTIAL_SPHERE_RADIUS_PC },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

/** Expands polylines into gl_LINES pairs, reading true positions from tier 0. */
function buildSegments(constellations: Constellation[], t0: CatalogTier): THREE.BufferGeometry {
  const positions: number[] = []

  const pushStar = (index: number) => {
    const base = index * FIELDS_PER_STAR
    positions.push(t0.attributes[base], t0.attributes[base + 1], t0.attributes[base + 2])
  }

  for (const constellation of constellations) {
    for (const line of constellation.lines) {
      for (let i = 0; i + 1 < line.path.length; i++) {
        pushStar(line.path[i])
        pushStar(line.path[i + 1])
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

export function ConstellationLines() {
  const catalog = useStarmap((state) => state.catalog)
  const show = useStarmap((state) => state.showConstellations)
  const dissolve = useStarmap((state) => state.dissolve)
  const sphereRadiusPc = useStarmap((state) => state.sphereRadiusPc)
  const active = useStarmap((state) => state.activeConstellation)

  const all = useMemo(() => {
    if (!catalog) return null
    return buildSegments(catalog.constellations, catalog.t0)
  }, [catalog])

  const highlighted = useMemo(() => {
    if (!catalog || !active) return null
    const constellation = catalog.constellations.find((c) => c.id === active)
    if (!constellation) return null
    return buildSegments([constellation], catalog.t0)
  }, [catalog, active])

  const baseMaterial = useMemo(() => createLineMaterial('#4d7fb8', 0.32), [])
  const activeMaterial = useMemo(() => createLineMaterial('#8fd0ff', 0.95), [])

  useEffect(() => () => baseMaterial.dispose(), [baseMaterial])
  useEffect(() => () => activeMaterial.dispose(), [activeMaterial])
  useEffect(() => () => all?.dispose(), [all])
  useEffect(() => () => highlighted?.dispose(), [highlighted])

  useEffect(() => {
    for (const material of [baseMaterial, activeMaterial]) {
      material.uniforms.uDissolve.value = dissolve
      material.uniforms.uSphereRadius.value = sphereRadiusPc
    }
    // Selecting one figure pushes the rest back rather than hiding them, so the
    // chosen constellation reads against its context.
    baseMaterial.uniforms.uOpacity.value = active ? 0.1 : 0.32
  }, [baseMaterial, activeMaterial, dissolve, active, sphereRadiusPc])

  if (!show || !all) return null

  return (
    <>
      <lineSegments geometry={all} material={baseMaterial} frustumCulled={false} />
      {highlighted && (
        <lineSegments geometry={highlighted} material={activeMaterial} frustumCulled={false} />
      )}
    </>
  )
}
