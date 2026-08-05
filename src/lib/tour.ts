import { LY_PER_PC } from './astro.ts'
import type { LoadedCatalog } from './catalog-loader.ts'
import type { useStarmap } from '../state/store.ts'

type Store = ReturnType<typeof useStarmap.getState>

/** Captions take only the catalogue, so the overlay subscribes to one field. */
export type TourText = string | ((catalog: LoadedCatalog | null) => string)

export interface TourStep {
  id: string
  /** Headline for the step; a function when it quotes real catalogue numbers. */
  caption: TourText
  detail?: TourText
  /** How long to hold before advancing, in milliseconds. */
  holdMs: number
  /** Puts the scene into this step's state. Camera moves damp on their own. */
  apply: (store: Store) => void
}

/**
 * A figure's depth spread, read from the catalogue rather than written into the
 * script — the numbers the tour quotes are the numbers the app is showing.
 */
function spread(catalog: LoadedCatalog | null, id: string) {
  const constellation = catalog?.constellations.find((c) => c.id === id)
  if (!constellation) return null
  return {
    nearest: Math.round(constellation.nearestPc * LY_PER_PC),
    farthest: Math.round(constellation.farthestPc * LY_PER_PC),
    ratio: Math.round(constellation.farthestPc / Math.max(constellation.nearestPc, 1e-6)),
  }
}

/** Everything the tour assumes about layers, so it never inherits a stray toggle. */
function resetLayers(store: Store) {
  store.set('showGalaxy', false)
  store.set('showGrid', false)
  store.set('isolate', false)
  store.set('showLabels', true)
  store.set('sizeMode', 'apparent')
  store.set('exposure', 1)
  store.set('maxDistancePc', 3000)
  store.set('dissolve', 1)
}

/**
 * The opening sixty seconds.
 *
 * Without this the app is a good instrument and a poor argument: every point it
 * makes is behind a control nobody was told about. The tour walks the argument
 * end to end, then leaves the viewer somewhere they can explore from.
 */
export const TOUR: TourStep[] = [
  {
    id: 'sky',
    caption: 'The night sky, from Earth.',
    detail: 'Every star you can see, in the direction you would see it.',
    holdMs: 4500,
    apply: (store) => {
      resetLayers(store)
      store.set('showConstellations', false)
      store.setActiveConstellation(null)
      store.select(null)
      store.resetView()
    },
  },
  {
    id: 'figure',
    caption: 'People drew a hunter here.',
    detail: 'Orion. Betelgeuse at the shoulder, Rigel at the foot, three stars for a belt.',
    holdMs: 5000,
    apply: (store) => {
      store.set('showConstellations', true)
      store.setActiveConstellation('Ori')
    },
  },
  {
    id: 'reveal',
    caption: 'Step sideways, and the hunter falls apart.',
    detail: 'The same stars, seen from a few hundred light years off Earth’s line of sight.',
    holdMs: 7500,
    apply: (store) => {
      store.revealConstellation('Ori')
    },
  },
  {
    id: 'numbers',
    caption: (catalog) => {
      const s = spread(catalog, 'Ori')
      return s
        ? `Orion runs ${s.ratio} times deeper than it looks.`
        : 'They were never neighbours.'
    },
    detail: (catalog) => {
      const s = spread(catalog, 'Ori')
      return s
        ? `Its nearest star is ${s.nearest.toLocaleString()} light years away; its farthest is ${s.farthest.toLocaleString()}. They share a line of sight, and nothing else.`
        : 'They share a line of sight, and nothing else.'
    },
    holdMs: 6500,
    apply: (store) => {
      store.set('showLabels', true)
      store.set('isolate', true)
    },
  },
  {
    id: 'galaxy',
    caption: 'Everything we have measured is this bubble.',
    detail:
      'Real stars reach 3,000 parsecs. The Sun sits 8,150 parsecs out on the Local Arm — the disk and arms beyond our bubble are a model, not data.',
    holdMs: 8500,
    apply: (store) => {
      store.set('isolate', false)
      store.setActiveConstellation(null)
      store.viewGalaxy()
    },
  },
  {
    id: 'end',
    caption: 'Constellations are an accident of where we stand.',
    detail: 'Now go and look for yourself.',
    holdMs: 5000,
    apply: (store) => {
      store.set('showGalaxy', false)
      store.set('showConstellations', true)
      store.resetView()
    },
  },
]

export function resolveText(value: TourText | undefined, catalog: LoadedCatalog | null): string {
  if (value === undefined) return ''
  return typeof value === 'function' ? value(catalog) : value
}
