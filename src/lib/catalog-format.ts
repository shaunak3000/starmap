/**
 * Binary layout for the packed star tiers.
 *
 * A tier is one self-describing little-endian file:
 *
 *   offset 0   char[4]     magic "SMAP"
 *   offset 4   uint32      format version
 *   offset 8   uint32      star count
 *   offset 12  uint32      floats per star (FIELDS_PER_STAR)
 *   offset 16  float32[]   count * FIELDS_PER_STAR interleaved attributes
 *   ...        uint32[]    count catalogue ids, parallel to the attribute block
 *
 * Interleaving the attributes lets the whole block become a single
 * InterleavedBuffer on the GPU with no per-attribute copies.
 */

export const CATALOG_MAGIC = 'SMAP'
export const CATALOG_VERSION = 1

/** x, y, z (parsecs, equatorial), absolute magnitude, B-V colour index. */
export const FIELDS_PER_STAR = 5
export const HEADER_BYTES = 16

export const FIELD_OFFSET = {
  x: 0,
  y: 1,
  z: 2,
  absMag: 3,
  colorIndex: 4,
} as const

export interface CatalogTier {
  /** count * FIELDS_PER_STAR interleaved attributes. */
  attributes: Float32Array
  /** AT-HYG catalogue id per star. */
  ids: Uint32Array
  count: number
}

export function encodeTier(attributes: Float32Array, ids: Uint32Array): ArrayBuffer {
  const count = ids.length
  if (attributes.length !== count * FIELDS_PER_STAR) {
    throw new Error(
      `attribute/id length mismatch: ${attributes.length} floats for ${count} stars`,
    )
  }

  const buffer = new ArrayBuffer(
    HEADER_BYTES + attributes.byteLength + ids.byteLength,
  )
  const view = new DataView(buffer)

  for (let i = 0; i < 4; i++) view.setUint8(i, CATALOG_MAGIC.charCodeAt(i))
  view.setUint32(4, CATALOG_VERSION, true)
  view.setUint32(8, count, true)
  view.setUint32(12, FIELDS_PER_STAR, true)

  new Float32Array(buffer, HEADER_BYTES, attributes.length).set(attributes)
  new Uint32Array(buffer, HEADER_BYTES + attributes.byteLength, count).set(ids)

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

  const attributeFloats = count * FIELDS_PER_STAR
  const expected = HEADER_BYTES + attributeFloats * 4 + count * 4
  if (buffer.byteLength !== expected) {
    throw new Error(
      `catalog tier size mismatch: ${buffer.byteLength} bytes, expected ${expected}`,
    )
  }

  return {
    attributes: new Float32Array(buffer, HEADER_BYTES, attributeFloats),
    ids: new Uint32Array(buffer, HEADER_BYTES + attributeFloats * 4, count),
    count,
  }
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
