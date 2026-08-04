import { encodeHalfArray } from './half-float.ts'

/**
 * Binary layout for the packed star tiers.
 *
 * Two shapes, because the tiers are used differently:
 *
 *   detail (t0)  Float32, interleaved. Small, and the *only* tier the CPU ever
 *                reads — picking, constellation geometry, the star card and
 *                search all index into it, and it holds the stars you fly to
 *                and quote distances for. Precision matters more than size.
 *
 *   field (t1, t2)  Float16, planar. Never touched by the CPU; uploaded
 *                straight to the GPU as HALF_FLOAT attributes. This is where
 *                nearly all the bytes live, so halving them is what makes the
 *                catalogue small enough to commit.
 *
 * Header (24 bytes, keeps both float32 and uint16 blocks aligned):
 *
 *   0   char[4]  magic "SMAP"
 *   4   uint32   format version
 *   8   uint32   star count
 *   12  uint32   fields per star
 *   16  uint32   element type (0 = float32, 1 = float16)
 *   20  uint32   layout (0 = interleaved, 1 = planar)
 *   24  ...      payload
 *
 * There is deliberately no per-star id array: nothing reads one at runtime, and
 * for the faint field it was 9 MB of dead weight.
 */

export const CATALOG_MAGIC = 'SMAP'
export const CATALOG_VERSION = 2
export const HEADER_BYTES = 24

/** x, y, z (parsecs, equatorial), absolute magnitude, B-V colour index. */
export const FIELDS_PER_STAR = 5

export const ELEMENT_FLOAT32 = 0
export const ELEMENT_FLOAT16 = 1
export const LAYOUT_INTERLEAVED = 0
export const LAYOUT_PLANAR = 1

export const FIELD_OFFSET = {
  x: 0,
  y: 1,
  z: 2,
  absMag: 3,
  colorIndex: 4,
} as const

/** Full-precision tier the CPU reads directly. */
export interface DetailTier {
  kind: 'detail'
  count: number
  /** Interleaved x, y, z, absMag, colourIndex. */
  attributes: Float32Array
}

/** Half-precision tier, GPU only. */
export interface FieldTier {
  kind: 'field'
  count: number
  /** Half-float bits, 3 per star. */
  positions: Uint16Array
  absMag: Uint16Array
  colorIndex: Uint16Array
}

export type CatalogTier = DetailTier | FieldTier

function writeHeader(
  buffer: ArrayBuffer,
  count: number,
  elementType: number,
  layout: number,
): void {
  const view = new DataView(buffer)
  for (let i = 0; i < 4; i++) view.setUint8(i, CATALOG_MAGIC.charCodeAt(i))
  view.setUint32(4, CATALOG_VERSION, true)
  view.setUint32(8, count, true)
  view.setUint32(12, FIELDS_PER_STAR, true)
  view.setUint32(16, elementType, true)
  view.setUint32(20, layout, true)
}

/** Packs interleaved Float32 attributes verbatim. */
export function encodeDetailTier(attributes: Float32Array): ArrayBuffer {
  const count = attributes.length / FIELDS_PER_STAR
  if (!Number.isInteger(count)) {
    throw new Error(`attribute length ${attributes.length} is not a multiple of ${FIELDS_PER_STAR}`)
  }

  const buffer = new ArrayBuffer(HEADER_BYTES + attributes.byteLength)
  writeHeader(buffer, count, ELEMENT_FLOAT32, LAYOUT_INTERLEAVED)
  new Float32Array(buffer, HEADER_BYTES, attributes.length).set(attributes)
  return buffer
}

/** Splits interleaved Float32 attributes into planar half-float blocks. */
export function encodeFieldTier(attributes: Float32Array): ArrayBuffer {
  const count = attributes.length / FIELDS_PER_STAR
  if (!Number.isInteger(count)) {
    throw new Error(`attribute length ${attributes.length} is not a multiple of ${FIELDS_PER_STAR}`)
  }

  const positions = new Float32Array(count * 3)
  const absMag = new Float32Array(count)
  const colorIndex = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const base = i * FIELDS_PER_STAR
    positions[i * 3] = attributes[base]
    positions[i * 3 + 1] = attributes[base + 1]
    positions[i * 3 + 2] = attributes[base + 2]
    absMag[i] = attributes[base + 3]
    colorIndex[i] = attributes[base + 4]
  }

  const halfPositions = encodeHalfArray(positions)
  const halfAbsMag = encodeHalfArray(absMag)
  const halfColorIndex = encodeHalfArray(colorIndex)

  const buffer = new ArrayBuffer(
    HEADER_BYTES + halfPositions.byteLength + halfAbsMag.byteLength + halfColorIndex.byteLength,
  )
  writeHeader(buffer, count, ELEMENT_FLOAT16, LAYOUT_PLANAR)

  let offset = HEADER_BYTES
  new Uint16Array(buffer, offset, halfPositions.length).set(halfPositions)
  offset += halfPositions.byteLength
  new Uint16Array(buffer, offset, halfAbsMag.length).set(halfAbsMag)
  offset += halfAbsMag.byteLength
  new Uint16Array(buffer, offset, halfColorIndex.length).set(halfColorIndex)

  return buffer
}

export function decodeTier(buffer: ArrayBuffer): CatalogTier {
  if (buffer.byteLength < HEADER_BYTES) {
    throw new Error('catalog tier truncated: shorter than header')
  }

  const view = new DataView(buffer)
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  )
  if (magic !== CATALOG_MAGIC) {
    throw new Error(`catalog tier magic mismatch: got "${magic}"`)
  }

  const version = view.getUint32(4, true)
  if (version !== CATALOG_VERSION) {
    throw new Error(`catalog tier version ${version}, expected ${CATALOG_VERSION}`)
  }

  const count = view.getUint32(8, true)
  const stride = view.getUint32(12, true)
  if (stride !== FIELDS_PER_STAR) {
    throw new Error(`catalog tier stride ${stride}, expected ${FIELDS_PER_STAR}`)
  }

  const elementType = view.getUint32(16, true)

  if (elementType === ELEMENT_FLOAT32) {
    const floats = count * FIELDS_PER_STAR
    const expected = HEADER_BYTES + floats * 4
    if (buffer.byteLength !== expected) {
      throw new Error(`catalog tier size mismatch: ${buffer.byteLength} bytes, expected ${expected}`)
    }
    return {
      kind: 'detail',
      count,
      attributes: new Float32Array(buffer, HEADER_BYTES, floats),
    }
  }

  if (elementType === ELEMENT_FLOAT16) {
    const expected = HEADER_BYTES + count * 3 * 2 + count * 2 + count * 2
    if (buffer.byteLength !== expected) {
      throw new Error(`catalog tier size mismatch: ${buffer.byteLength} bytes, expected ${expected}`)
    }

    let offset = HEADER_BYTES
    const positions = new Uint16Array(buffer, offset, count * 3)
    offset += count * 3 * 2
    const absMag = new Uint16Array(buffer, offset, count)
    offset += count * 2
    const colorIndex = new Uint16Array(buffer, offset, count)

    return { kind: 'field', count, positions, absMag, colorIndex }
  }

  throw new Error(`catalog tier has unknown element type ${elementType}`)
}

/** Per-star descriptive data, emitted only for the named/naked-eye tier. */
export interface StarMeta {
  /** Index into the tier's attribute block. */
  i: number
  id: number
  hip?: number
  hd?: number
  proper?: string
  bayer?: string
  flam?: string
  con?: string
  spect?: string
  /** Apparent magnitude as catalogued. */
  mag: number
  /** Distance in parsecs. */
  dist: number
}

export interface ConstellationLine {
  /** Polyline of indices into the T0 tier. */
  path: number[]
}

export interface Constellation {
  /** Three-letter IAU abbreviation, e.g. "Ori". */
  id: string
  /** Latin name, e.g. "Orion". */
  latin: string
  /** English name, e.g. "Hunter". */
  english: string
  lines: ConstellationLine[]
  /** Unique member star indices into T0. */
  members: number[]
  /** HIP ids referenced by the sky culture but absent from the catalogue. */
  missingHip: number[]
  /** Distance spread across members, in parsecs. */
  nearestPc: number
  farthestPc: number
}

export interface CatalogManifest {
  generatedAt: string
  maxDistancePc: number
  sources: { name: string; url: string; license: string }[]
  tiers: { name: string; file: string; count: number; magLimit: number | null }[]
  constellationCount: number
}
