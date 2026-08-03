import {
  type CatalogManifest,
  type CatalogTier,
  type Constellation,
  type StarMeta,
  decodeTier,
} from './catalog-format.ts'

const CATALOG_BASE = `${import.meta.env.BASE_URL}catalog/`

export interface LoadedCatalog {
  manifest: CatalogManifest
  /** Naked-eye and named stars. Constellation lines index into this tier. */
  t0: CatalogTier
  /** Stars to magnitude 9. */
  t1: CatalogTier
  meta: StarMeta[]
  /** Metadata by tier-0 index. */
  metaByIndex: Map<number, StarMeta>
  constellations: Constellation[]
}

async function fetchJson<T>(file: string): Promise<T> {
  const response = await fetch(`${CATALOG_BASE}${file}`)
  if (!response.ok) {
    throw new Error(`${file}: HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

export async function loadTier(file: string): Promise<CatalogTier> {
  const response = await fetch(`${CATALOG_BASE}${file}`)
  if (!response.ok) {
    throw new Error(`${file}: HTTP ${response.status}`)
  }
  return decodeTier(await response.arrayBuffer())
}

/**
 * Loads everything needed for a first frame. The faint field (t2) is deliberately
 * left out — it is an order of magnitude larger and only fetched on demand.
 */
export async function loadCatalog(): Promise<LoadedCatalog> {
  const [manifest, t0, t1, meta, constellations] = await Promise.all([
    fetchJson<CatalogManifest>('manifest.json'),
    loadTier('t0.bin'),
    loadTier('t1.bin'),
    fetchJson<StarMeta[]>('t0.meta.json'),
    fetchJson<Constellation[]>('constellations.json'),
  ])

  const metaByIndex = new Map(meta.map((entry) => [entry.i, entry]))

  return { manifest, t0, t1, meta, metaByIndex, constellations }
}

/** Human-readable label for a star, falling back through its identifiers. */
export function starLabel(meta: StarMeta | undefined): string {
  if (!meta) return 'Unnamed star'
  if (meta.proper) return meta.proper
  if (meta.bayer && meta.con) return `${meta.bayer} ${meta.con}`
  if (meta.flam && meta.con) return `${meta.flam} ${meta.con}`
  if (meta.hip !== undefined) return `HIP ${meta.hip}`
  if (meta.hd !== undefined) return `HD ${meta.hd}`
  return `AT-HYG ${meta.id}`
}

/** Every string a user might reasonably type to find a given star. */
export function searchKeys(meta: StarMeta): string[] {
  const keys: string[] = []
  if (meta.proper) keys.push(meta.proper)
  if (meta.bayer && meta.con) keys.push(`${meta.bayer} ${meta.con}`)
  if (meta.flam && meta.con) keys.push(`${meta.flam} ${meta.con}`)
  if (meta.hip !== undefined) keys.push(`HIP ${meta.hip}`)
  if (meta.hd !== undefined) keys.push(`HD ${meta.hd}`)
  return keys
}
