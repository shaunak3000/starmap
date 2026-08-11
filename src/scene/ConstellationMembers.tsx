import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { LY_PER_PC } from '../lib/astro.ts'
import { FIELDS_PER_STAR } from '../lib/catalog-format.ts'
import { starLabel } from '../lib/catalog-loader.ts'
import { epochPosition, starVelocity } from '../lib/epoch.ts'
import { useStarmap } from '../state/store.ts'
import { CELESTIAL_SPHERE_RADIUS_PC } from './StarField.tsx'
import type { LabelCandidate } from './labels.ts'

/** Ring markers so a figure's vertices stay findable at any range. */
const VERTEX_SHADER = /* glsl */ `
  const float PC_PER_KM_S_YEAR = 1.0227121650537077e-6;

  uniform float uDissolve;
  uniform float uSphereRadius;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uYears;

  attribute vec3 aVelocity;

  void main() {
    vec3 epochPosition = position + aVelocity * (uYears * PC_PER_KM_S_YEAR);

    vec3 renderPosition = mix(
      normalize(epochPosition) * uSphereRadius,
      epochPosition,
      uDissolve
    );
    vec4 viewPosition = modelViewMatrix * vec4(renderPosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = uSize * uPixelRatio;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r = length(uv);
    if (r > 1.0) discard;
    // Hollow ring: a filled dot would just be mistaken for the star itself.
    float ring = smoothstep(0.55, 0.72, r) * (1.0 - smoothstep(0.88, 1.0, r));
    if (ring < 0.01) discard;
    gl_FragColor = vec4(uColor, ring * 0.9);
  }
`

export function ConstellationMembers() {
  const catalog = useStarmap((state) => state.catalog)
  const active = useStarmap((state) => state.activeConstellation)
  const dissolve = useStarmap((state) => state.dissolve)
  const sphereRadiusPc = useStarmap((state) => state.sphereRadiusPc)
  const years = useStarmap((state) => state.years)
  const unit = useStarmap((state) => state.unit)
  const show = useStarmap((state) => state.showConstellations)

  const constellation = useMemo(() => {
    if (!catalog || !active) return null
    return catalog.constellations.find((c) => c.id === active) ?? null
  }, [catalog, active])

  /** True positions and distances, in catalogue space. */
  const members = useMemo(() => {
    if (!catalog || !constellation) return []
    return constellation.members.map((index) => {
      const base = index * FIELDS_PER_STAR
      const position = new THREE.Vector3(
        catalog.t0.attributes[base],
        catalog.t0.attributes[base + 1],
        catalog.t0.attributes[base + 2],
      )
      const velocity = starVelocity(catalog.t0, index)
      return {
        index,
        position,
        velocity,
        distancePc: position.length(),
        meta: catalog.metaByIndex.get(index),
      }
    })
  }, [catalog, constellation])

  const geometry = useMemo(() => {
    if (members.length === 0) return null
    const positions = new Float32Array(members.length * 3)
    const velocities = new Float32Array(members.length * 3)
    members.forEach((member, i) => {
      positions[i * 3] = member.position.x
      positions[i * 3 + 1] = member.position.y
      positions[i * 3 + 2] = member.position.z
      velocities[i * 3] = member.velocity[0]
      velocities[i * 3 + 1] = member.velocity[1]
      velocities[i * 3 + 2] = member.velocity[2]
    })
    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    buffer.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3))
    return buffer
  }, [members])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uDissolve: { value: 1 },
          uYears: { value: 0 },
          uSphereRadius: { value: CELESTIAL_SPHERE_RADIUS_PC },
          uColor: { value: new THREE.Color('#8fd0ff') },
          uSize: { value: 16 },
          uPixelRatio: { value: window.devicePixelRatio },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  )

  useEffect(() => {
    material.uniforms.uDissolve.value = dissolve
    material.uniforms.uSphereRadius.value = sphereRadiusPc
    material.uniforms.uYears.value = years
  }, [material, dissolve, sphereRadiusPc, years])

  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => geometry?.dispose(), [geometry])

  /**
   * Label candidates, ranked so the collision pass drops the least useful.
   *
   * The nearest and farthest members carry the whole argument about depth, so
   * they outrank everything. Proper names come next, brightest first, since
   * those are the stars anyone recognises. Bayer designations fill any space
   * left over.
   */
  const candidates = useMemo<LabelCandidate[]>(() => {
    if (members.length === 0) return []

    const byDistance = [...members].sort((a, b) => a.distancePc - b.distancePc)
    const nearest = byDistance[0].index
    const farthest = byDistance[byDistance.length - 1].index

    const priorityOf = (member: (typeof members)[number]) => {
      if (member.index === nearest || member.index === farthest) return 0
      if (member.meta?.proper) return 1 + (member.meta.mag ?? 10) / 100
      if (member.meta?.bayer) return 3 + (member.meta.mag ?? 10) / 100
      return 10
    }

    return members
      .filter((member) => priorityOf(member) < 10)
      .map((member) => ({
        key: member.index,
        // Follows the collapse, so a label never floats away from its star.
        position: (() => {
          const [x, y, z] = epochPosition(catalog!.t0, member.index, years)
          const epoch = new THREE.Vector3(x, y, z)
          return epoch.clone().normalize().multiplyScalar(sphereRadiusPc).lerp(epoch, dissolve)
        })(),
        name: starLabel(member.meta),
        detail:
          unit === 'pc'
            ? `${member.distancePc.toFixed(0)} pc`
            : `${(member.distancePc * LY_PER_PC).toFixed(0)} ly`,
        priority: priorityOf(member),
      }))
  }, [members, dissolve, sphereRadiusPc, unit, years, catalog])

  // Published rather than rendered here: the DOM lives outside the Canvas.
  useEffect(() => {
    useStarmap.setState({ labelCandidates: show ? candidates : [] })
  }, [candidates, show])

  if (!show || !constellation || !geometry) return null

  return <points geometry={geometry} material={material} frustumCulled={false} />
}
