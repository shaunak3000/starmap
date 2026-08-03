import { create } from 'zustand'
import type { CatalogTier } from '../lib/catalog-format.ts'
import { type LoadedCatalog, loadCatalog, loadTier } from '../lib/catalog-loader.ts'

/**
 * How star size is derived.
 *
 * `apparent` is the physically honest mode: brightness falls off with distance,
 * so stars swell as you approach them. `map` fixes size by absolute magnitude
 * so the structure stays legible from any range.
 */
export type SizeMode = 'apparent' | 'map'

export type CameraMode = 'orbit' | 'fly' | 'earth'

export type ReferenceFrame = 'equatorial' | 'galactic'

export type DistanceUnit = 'pc' | 'ly'

export interface Selection {
  /** Index into tier 0. */
  index: number
}

interface StarmapState {
  catalog: LoadedCatalog | null
  loading: boolean
  error: string | null

  /** The faint field, fetched only when the user asks for it. */
  fieldTier: CatalogTier | null
  fieldLoading: boolean

  sizeMode: SizeMode
  cameraMode: CameraMode
  frame: ReferenceFrame
  unit: DistanceUnit

  /** Exposure multiplier applied to star brightness. */
  exposure: number
  /** Bloom intensity; 0 disables the pass. */
  bloom: number
  /** Upper distance bound on rendered stars, in parsecs. */
  maxDistancePc: number

  showConstellations: boolean
  showGrid: boolean
  showFaintField: boolean
  showLabels: boolean

  selection: Selection | null
  hovered: number | null
  /** Abbreviation of the focused constellation, if any. */
  activeConstellation: string | null
  /** 0 = figure projected on the celestial sphere, 1 = true 3D positions. */
  dissolve: number

  init: () => Promise<void>
  enableFaintField: () => Promise<void>
  set: <K extends keyof StarmapState>(key: K, value: StarmapState[K]) => void
  select: (index: number | null) => void
  setActiveConstellation: (id: string | null) => void
}

export const useStarmap = create<StarmapState>((set, get) => ({
  catalog: null,
  loading: true,
  error: null,

  fieldTier: null,
  fieldLoading: false,

  sizeMode: 'apparent',
  cameraMode: 'earth',
  frame: 'equatorial',
  unit: 'ly',

  exposure: 1,
  bloom: 0.6,
  maxDistancePc: 1000,

  showConstellations: true,
  showGrid: false,
  showFaintField: false,
  showLabels: true,

  selection: null,
  hovered: null,
  activeConstellation: null,
  dissolve: 0,

  init: async () => {
    set({ loading: true, error: null })
    try {
      const catalog = await loadCatalog()
      set({ catalog, loading: false })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  enableFaintField: async () => {
    const { fieldTier, fieldLoading } = get()
    if (fieldTier || fieldLoading) {
      set({ showFaintField: true })
      return
    }

    set({ fieldLoading: true })
    try {
      const tier = await loadTier('t2.bin')
      set({ fieldTier: tier, fieldLoading: false, showFaintField: true })
    } catch (error) {
      set({
        fieldLoading: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  set: (key, value) => set({ [key]: value } as never),

  select: (index) => set({ selection: index === null ? null : { index } }),

  setActiveConstellation: (id) =>
    set((state) => ({
      activeConstellation: id,
      // Leaving a constellation snaps the figure back together.
      dissolve: id === null ? 0 : state.dissolve,
    })),
}))

// Lets the screenshot harness drive the scene into a given state.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __starmap: typeof useStarmap }).__starmap = useStarmap
}
