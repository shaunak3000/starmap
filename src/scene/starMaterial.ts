import * as THREE from 'three'
import { FIELDS_PER_STAR, type CatalogTier } from '../lib/catalog-format.ts'

/**
 * Blackbody colour, mirroring `temperatureToRgb` in lib/astro.ts. The two must
 * stay in step: the TS version drives UI swatches, this one drives the points.
 */
const COLOUR_GLSL = /* glsl */ `
  const float LOG10 = 0.4342944819032518;
  /** Parsecs travelled per year per km/s of space velocity. */
  const float PC_PER_KM_S_YEAR = 1.0227121650537077e-6;

  float bvToTemperature(float bv) {
    float c = clamp(bv, -0.4, 2.0);
    return 4600.0 * (1.0 / (0.92 * c + 1.7) + 1.0 / (0.92 * c + 0.62));
  }

  vec3 temperatureToRgb(float kelvin) {
    float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
    float r, g, b;

    if (t <= 66.0) {
      r = 255.0;
      g = 99.4708025861 * log(t) - 161.1195681661;
    } else {
      r = 329.698727446 * pow(t - 60.0, -0.1332047592);
      g = 288.1221695283 * pow(t - 60.0, -0.0755148492);
    }

    if (t >= 66.0) {
      b = 255.0;
    } else if (t <= 19.0) {
      b = 0.0;
    } else {
      b = 138.5177312231 * log(t - 10.0) - 305.0447927307;
    }

    return clamp(vec3(r, g, b) / 255.0, 0.0, 1.0);
  }

  // True star colours are far subtler than people expect; a modest boost is
  // what makes spectral class legible at a glance.
  vec3 saturateColour(vec3 c, float amount) {
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return clamp(mix(vec3(luma), c, amount), 0.0, 1.0);
  }
`

const VERTEX_SHADER = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uExposure;
  uniform int   uSizeMode;      // 0 = apparent, 1 = map
  uniform float uBaseSize;
  uniform float uMinSize;
  uniform float uMaxSize;
  uniform float uRefMag;
  uniform float uMapScale;
  uniform float uMapRefAbsMag;
  uniform float uMaxDistancePc;
  uniform float uSaturation;
  uniform float uDissolve;      // 0 = celestial sphere, 1 = true distances
  uniform float uSphereRadius;
  uniform float uIntensityScale;
  uniform float uYears;
  // Brush from the HR diagram: colour index min/max, absolute magnitude min/max.
  uniform vec4  uBrush;
  uniform float uBrushStrength;

  attribute float aAbsMag;
  attribute float aColorIndex;

  #ifdef HAS_VELOCITY
  attribute vec3 aVelocity;
  #endif

  varying vec3  vColor;
  varying float vIntensity;

  ${COLOUR_GLSL}

  void main() {
    // Where the star is at the scrubbed epoch. Straight-line extrapolation is
    // well inside the error the distances already carry over +/-100 kyr.
    vec3 epochPosition = position;
    #ifdef HAS_VELOCITY
    epochPosition += aVelocity * (uYears * PC_PER_KM_S_YEAR);
    #endif

    // Distance from the Sun is rotation-invariant, so this stays valid in any
    // reference frame the scene graph happens to be using.
    float distanceFromSun = length(epochPosition);

    // Photometry always uses the true geometry, even while the rendered
    // positions are collapsed onto the sphere. Otherwise flattening the field
    // would relight the sky and the Earth view would stop matching reality.
    vec4 truePosition = modelViewMatrix * vec4(epochPosition, 1.0);
    float distanceFromCamera = max(length(truePosition.xyz), 1e-4);

    // Collapsing every star onto a shell is the pre-Copernican sky: from the
    // Sun it is indistinguishable from the real thing, and from anywhere else
    // it falls apart. That contrast is the whole point of the app.
    vec3 renderPosition = mix(
      normalize(epochPosition) * uSphereRadius,
      epochPosition,
      uDissolve
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(renderPosition, 1.0);

    vColor = saturateColour(temperatureToRgb(bvToTemperature(aColorIndex)), uSaturation);

    float rawSize;

    if (uSizeMode == 0) {
      // Apparent magnitude as seen from wherever the camera is standing, so
      // stars genuinely brighten as you fly toward them.
      float m = aAbsMag + 5.0 * LOG10 * log(distanceFromCamera / 10.0);
      float flux = pow(10.0, -0.4 * (m - uRefMag));
      rawSize = uBaseSize * sqrt(flux);
    } else {
      // Distance-independent: size tracks intrinsic luminosity alone. The
      // fourth root (rather than square root) keeps a 22-magnitude spread
      // inside a usable range of pixel sizes.
      float flux = pow(10.0, -0.4 * (aAbsMag - uMapRefAbsMag));
      rawSize = uMapScale * pow(flux, 0.25);
    }

    float size = clamp(rawSize, uMinSize, uMaxSize);

    // Per-tier trim. Nearly two million additive sprites sum to white however
    // correct each one is on its own, so the faint field is deliberately held
    // down to read as texture behind the stars that matter.
    float intensity = uExposure * uIntensityScale;

    if (rawSize < uMinSize) {
      // Below a pixel we cannot shrink further, so shed the surplus area as
      // brightness instead. Without this, faint stars form a solid grey haze.
      float ratio = rawSize / uMinSize;
      intensity *= ratio * ratio;
    } else if (rawSize > uMaxSize) {
      // Overdrive past the size clamp so the bloom pass carries the rest.
      intensity *= min(rawSize / uMaxSize, 12.0);
    }

    if (distanceFromSun > uMaxDistancePc) {
      // Push outside clip space; cheaper than a discard in the fragment stage.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      size = 0.0;
    }

    // Brushing the HR diagram dims everything outside the selection rather than
    // hiding it, so the highlighted population reads against the whole sky it
    // was drawn from.
    if (uBrushStrength > 0.0) {
      bool inside =
        aColorIndex >= uBrush.x && aColorIndex <= uBrush.y &&
        aAbsMag     >= uBrush.z && aAbsMag     <= uBrush.w;
      if (!inside) intensity *= mix(1.0, 0.04, uBrushStrength);
    }

    vIntensity = intensity;
    gl_PointSize = size * uPixelRatio;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uFalloff;

  varying vec3  vColor;
  varying float vIntensity;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;

    // Gaussian core, rebased so it reaches exactly zero at the sprite edge and
    // leaves no square seam where the quads overlap.
    float edge = exp(-uFalloff);
    float core = (exp(-r2 * uFalloff) - edge) / (1.0 - edge);

    gl_FragColor = vec4(vColor * core * vIntensity, 1.0);
  }
`

export interface StarMaterialOptions {
  /** Base pixel size for a star at the reference magnitude. */
  baseSize?: number
  minSize?: number
  maxSize?: number
  /** Apparent magnitude that renders at `baseSize`. */
  refMag?: number
  mapScale?: number
  /**
   * Compile the proper-motion path. A define rather than a zero-filled
   * attribute: the faint field has no velocities, and handing the GPU 28 MB of
   * zeros to animate stars nobody can see move would be absurd.
   */
  hasVelocity?: boolean
}

export function createStarMaterial(options: StarMaterialOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    defines: options.hasVelocity ? { HAS_VELOCITY: '' } : {},
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uPixelRatio: { value: 1 },
      uExposure: { value: 1 },
      uSizeMode: { value: 0 },
      uBaseSize: { value: options.baseSize ?? 2.0 },
      uMinSize: { value: options.minSize ?? 1.0 },
      uMaxSize: { value: options.maxSize ?? 42 },
      uRefMag: { value: options.refMag ?? 7.2 },
      uMapScale: { value: options.mapScale ?? 1.5 },
      uMapRefAbsMag: { value: 5.0 },
      uMaxDistancePc: { value: 1000 },
      uSaturation: { value: 1.55 },
      uIntensityScale: { value: 1 },
      uDissolve: { value: 1 },
      uSphereRadius: { value: 120 },
      uYears: { value: 0 },
      uBrush: { value: new THREE.Vector4(-1, 3, -20, 25) },
      uBrushStrength: { value: 0 },
      uFalloff: { value: 4.5 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    // Nothing in this scene is opaque, so depth buys nothing — and switching it
    // off frees the camera to span 0.02 pc to 30 kpc without depth precision
    // becoming the limiting factor.
    depthWrite: false,
    depthTest: false,
  })
}

/**
 * Wraps a packed tier as a points geometry.
 *
 * The full-precision tier stays in one interleaved Float32 buffer. The bulk
 * tiers arrive as planar half floats and become HALF_FLOAT attributes, which
 * the GPU widens for free — the shader is identical either way.
 */
export function createStarGeometry(tier: CatalogTier): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()

  if (tier.kind === 'detail') {
    const interleaved = new THREE.InterleavedBuffer(tier.attributes, FIELDS_PER_STAR)
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0))
    geometry.setAttribute('aAbsMag', new THREE.InterleavedBufferAttribute(interleaved, 1, 3))
    geometry.setAttribute('aColorIndex', new THREE.InterleavedBufferAttribute(interleaved, 1, 4))

    if (tier.velocities) {
      geometry.setAttribute('aVelocity', new THREE.BufferAttribute(tier.velocities, 3))
    }
  } else {
    geometry.setAttribute('position', new THREE.Float16BufferAttribute(tier.positions, 3))
    geometry.setAttribute('aAbsMag', new THREE.Float16BufferAttribute(tier.absMag, 1))
    geometry.setAttribute('aColorIndex', new THREE.Float16BufferAttribute(tier.colorIndex, 1))

    if (tier.velocities) {
      geometry.setAttribute('aVelocity', new THREE.Float16BufferAttribute(tier.velocities, 3))
    }
  }

  // The cloud always surrounds the camera, so an exact radius buys nothing;
  // taking it from the position attribute avoids decoding half floats here.
  const position = geometry.getAttribute('position')
  let maxRadius = 0
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getY(i), position.getZ(i))
    if (r > maxRadius) maxRadius = r
  }
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), maxRadius)

  return geometry
}
