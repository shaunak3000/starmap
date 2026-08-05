import { create } from 'zustand'
import type { CatalogTier } from '../lib/catalog-format.ts'
import type { LabelCandidate } from '../scene/labels.ts'
import {
  DEFAULT_CULTURE,
  type LoadedCatalog,
  loadCatalog,
  loadConstellations,
  loadTier,
} from '../lib/catalog-loader.ts'
import { constellationVantage } from '../lib/constellation-view.ts'
import { galacticToEquatorial } from '../lib/astro.ts'
import { galacticCentre } from '../lib/galaxy.ts'

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

/**
 * A request for the camera to travel somewhere, in catalogue (data-space)
 * coordinates. The token lets the rig notice repeat requests for the same spot.
 */
export interface FocusRequest {
  /** Omit to keep the current focus point — used by view presets. */
  position?: [number, number, number]
  /** Omit to keep the current range. */
  distance?: number
  /** Unit direction from the target toward the camera, in data space. */
  lookFrom?: [number, number, number]
  token: number
}

/** Canonical viewing angles, relative to whichever frame is active. */
export type ViewPreset = 'top' | 'edge'

/**
 * Where the camera is and which way it faces, in the rig's own terms.
 *
 * Published by the rig once motion settles so the URL can capture a view, and
 * consumed back on load to restore one. Kept in rig terms rather than as a
 * world matrix because that is what restores exactly.
 */
export interface CameraPose {
  mode: CameraMode
  /** Focus point in catalogue coordinates. */
  target: [number, number, number]
  distance: number
  yaw: number
  pitch: number
  fov: number
}

/** Shell radius used when no figure is driving it. */
export const DEFAULT_SPHERE_RADIUS_PC = 120

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
  /** Schematic Milky Way: modelled structure, not catalogue data. */
  showGalaxy: boolean
  /** Hide everything except the current selection. */
  isolate: boolean
  /** Current grid cell size in parsecs, published by AxisGrid. */
  gridStepPc: number
  /** Star labels awaiting placement, published by the active figure. */
  labelCandidates: LabelCandidate[]

  selection: Selection | null
  hovered: number | null
  /** Abbreviation of the focused constellation, if any. */
  activeConstellation: string | null
  /** 0 = figure projected on the celestial sphere, 1 = true 3D positions. */
  dissolve: number
  /**
   * Radius of the shell stars collapse onto at dissolve 0. Tracks the figure
   * being revealed, so collapsing rescales the sky instead of shrinking it into
   * a distant marble.
   */
  sphereRadiusPc: number

  focusRequest: FocusRequest | null
  /** Index of the running tour step, or null when no tour is playing. */
  tourStep: number | null
  /** Which sky culture's figures are drawn. */
  skyCulture: string
  cultureLoading: boolean
  /** Which hemisphere visibility summaries are quoted for. */
  viewerNorth: boolean
  /** Metres-per-second equivalent for fly mode, in parsecs per second. */
  flySpeed: number
  /** Live camera distance from the Sun, mirrored out of the rig for the HUD. */
  cameraDistancePc: number
  /** Settled camera pose, published by the rig for the URL to capture. */
  cameraPose: CameraPose | null
  /** A pose to restore; the rig consumes it once and snaps to it. */
  poseRequest: (CameraPose & { token: number }) | null
  /** Rolling frame rate, published by FrameMeter. */
  fps: number

  init: () => Promise<void>
  enableFaintField: () => Promise<void>
  set: <K extends keyof StarmapState>(key: K, value: StarmapState[K]) => void
  select: (index: number | null) => void
  setActiveConstellation: (id: string | null) => void
  focusOn: (
    position: [number, number, number],
    distance?: number,
    lookFrom?: [number, number, number],
  ) => void
  /** Flies side-on to a figure and expands it to true distances. */
  revealConstellation: (id: string) => void
  /** Flies to a face-on view of the modelled Galaxy, centred on the Centre. */
  viewGalaxy: () => void
  /** Swings to a canonical angle without changing what is being looked at. */
  orientView: (preset: ViewPreset) => void
  /** Back to the opening view: standing on the Sun, looking out. */
  resetView: () => void
  /** Swaps which culture's figures are drawn over the same stars. */
  setSkyCulture: (cultureId: string) => Promise<void>
  startTour: () => void
  stopTour: () => void
  setTourStep: (step: number) => void
  /** Restores a previously captured view, e.g. from a shared link. */
  restorePose: (pose: CameraPose) => void
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
  maxDistancePc: 3000,

  showConstellations: true,
  showGrid: false,
  showFaintField: false,
  showLabels: true,
  showGalaxy: false,
  isolate: false,
  gridStepPc: 10,
  labelCandidates: [],

  selection: null,
  hovered: null,
  activeConstellation: null,
  // Truth is the default; collapsing to the celestial sphere is the deliberate
  // act that shows what the constellations assume.
  dissolve: 1,
  sphereRadiusPc: DEFAULT_SPHERE_RADIUS_PC,

  focusRequest: null,
  tourStep: null,
  skyCulture: DEFAULT_CULTURE,
  cultureLoading: false,
  viewerNorth: true,
  flySpeed: 5,
  cameraDistancePc: 60,
  cameraPose: null,
  poseRequest: null,
  fps: 0,

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
      // Leaving a figure restores true distances. This said `0` until now,
      // which is the collapsed celestial sphere — the opposite of truth. It
      // dated from when dissolve defaulted to 0, and meant that clearing a
      // selection silently flattened the whole sky onto a shell.
      dissolve: id === null ? 1 : state.dissolve,
      sphereRadiusPc: id === null ? DEFAULT_SPHERE_RADIUS_PC : state.sphereRadiusPc,
    })),

  setSkyCulture: async (cultureId) => {
    const { catalog, skyCulture } = get()
    if (!catalog || cultureId === skyCulture) return

    set({ cultureLoading: true })
    try {
      const constellations = await loadConstellations(catalog.manifest, cultureId)
      set((state) => ({
        skyCulture: cultureId,
        cultureLoading: false,
        showConstellations: true,
        // Figure ids do not carry across cultures — Orion has no counterpart in
        // the nakshatras — so any active selection has to go.
        activeConstellation: null,
        dissolve: 1,
        sphereRadiusPc: DEFAULT_SPHERE_RADIUS_PC,
        catalog: state.catalog
          ? { ...state.catalog, constellations, cultureId }
          : state.catalog,
      }))
    } catch (error) {
      set({
        cultureLoading: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  restorePose: (pose) =>
    set((state) => ({
      cameraMode: pose.mode,
      poseRequest: { ...pose, token: (state.poseRequest?.token ?? 0) + 1 },
    })),

  startTour: () => set({ tourStep: 0 }),

  // The opening beat hides the figures to show bare sky. Stopping there would
  // otherwise strand the viewer with constellations off and no hint why, so the
  // tour always hands back the layer it borrowed.
  stopTour: () => set({ tourStep: null, showConstellations: true }),

  setTourStep: (step) => set({ tourStep: step }),

  viewGalaxy: () =>
    set((state) => ({
      showGalaxy: true,
      cameraMode: 'orbit',
      // Map mode sizes every star the same regardless of range, which at 30 kpc
      // turns the whole 3 kpc catalogue into one saturated blob. Apparent mode
      // lets distance do its work, so the real stars read as the small knot
      // around the Sun that they are.
      sizeMode: 'apparent',
      // Centring on the Centre rather than the Sun is the point: it puts us
      // 8.15 kpc out on a minor arm rather than at the middle of anything.
      focusRequest: {
        position: galacticCentre(),
        distance: 30000,
        // Straight down the north galactic pole, so the arms read face-on.
        lookFrom: galacticToEquatorial([0, 0, 1]),
        token: (state.focusRequest?.token ?? 0) + 1,
      },
    })),

  orientView: (preset) => {
    const { frame } = get()
    // "Top" means down the active frame's pole and "edge" means along its
    // plane, so the same button does the astronomically useful thing whether
    // you are thinking in equatorial or galactic terms.
    const axis: [number, number, number] = preset === 'top' ? [0, 0, 1] : [0, 1, 0]
    const lookFrom = frame === 'galactic' ? galacticToEquatorial(axis) : axis

    set((state) => ({
      focusRequest: { lookFrom, token: (state.focusRequest?.token ?? 0) + 1 },
    }))
  },

  resetView: () =>
    set((state) => ({
      cameraMode: 'earth',
      dissolve: 1,
      isolate: false,
      activeConstellation: null,
      selection: null,
      sphereRadiusPc: 120,
      focusRequest: {
        position: [0, 0, 0],
        distance: 0,
        token: (state.focusRequest?.token ?? 0) + 1,
      },
    })),

  focusOn: (position, distance = 4, lookFrom) =>
    set((state) => ({
      focusRequest: {
        position,
        distance,
        lookFrom,
        token: (state.focusRequest?.token ?? 0) + 1,
      },
    })),

  revealConstellation: (id) => {
    const { catalog } = get()
    if (!catalog) return

    const constellation = catalog.constellations.find((c) => c.id === id)
    if (!constellation) return

    const vantage = constellationVantage(constellation, catalog.t0)
    set((state) => ({
      activeConstellation: id,
      showConstellations: true,
      // Expanding to true distances is the reveal itself; the camera move only
      // provides an angle from which it is visible.
      dissolve: 1,
      // Match the shell to the figure so the collapse reads as stars sliding
      // along their sight lines, not as the sky shrinking away.
      sphereRadiusPc: vantage.spanPc * 0.5,
      focusRequest: {
        position: vantage.target,
        distance: vantage.distance,
        lookFrom: vantage.lookFrom,
        token: (state.focusRequest?.token ?? 0) + 1,
      },
    }))
  },
}))

// Lets the screenshot harness drive the scene into a given state.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __starmap: typeof useStarmap }).__starmap = useStarmap
}
