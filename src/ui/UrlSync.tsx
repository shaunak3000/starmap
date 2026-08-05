import { useEffect, useRef } from 'react'
import { DEFAULT_CULTURE } from '../lib/catalog-loader.ts'
import { type UrlState, decodeUrlState, encodeUrlState } from '../lib/url-state.ts'
import { useStarmap } from '../state/store.ts'

/**
 * Keeps the address bar in step with the view.
 *
 * Reads the hash once on load so a shared link opens where it points, then
 * writes back whenever the view settles. Writes use `replaceState`: `pushState`
 * would stack a history entry for every camera move, so Back would step through
 * someone's own panning instead of leaving the app.
 */

/** Quiet period before a change is written, so a drag writes once at the end. */
const WRITE_DELAY_MS = 400

/** Reads the hash exactly once, before anything else can move the camera. */
export function useInitialUrlState() {
  const applied = useRef(false)
  const catalog = useStarmap((state) => state.catalog)

  useEffect(() => {
    if (applied.current || !catalog) return
    applied.current = true

    const initial = decodeUrlState(window.location.hash)
    if (Object.keys(initial).length === 0) return

    const store = useStarmap.getState()

    // A link that names a view is a deliberate destination, so it wins over the
    // autoplaying intro.
    store.stopTour()

    if (initial.frame) store.set('frame', initial.frame)
    if (initial.unit) store.set('unit', initial.unit)
    if (initial.dissolve !== undefined) store.set('dissolve', initial.dissolve)

    if (initial.layers) {
      const { layers } = initial
      if (layers.constellations !== undefined) store.set('showConstellations', layers.constellations)
      if (layers.labels !== undefined) store.set('showLabels', layers.labels)
      if (layers.grid !== undefined) store.set('showGrid', layers.grid)
      if (layers.galaxy !== undefined) store.set('showGalaxy', layers.galaxy)
      if (layers.isolate !== undefined) store.set('isolate', layers.isolate)
      if (layers.faint) void store.enableFaintField()
    }

    if (initial.star !== undefined) store.select(initial.star)

    const finish = () => {
      const current = useStarmap.getState()

      // Figure ids are culture-scoped: "CMa" means nothing in the Chinese set.
      // A link carrying one from another culture must be ignored rather than
      // left dangling, or the UI offers to clear a selection that is not there.
      if (
        initial.figure &&
        current.catalog?.constellations.some((c) => c.id === initial.figure)
      ) {
        current.setActiveConstellation(initial.figure)
      }

      // Pose last: it must not be overwritten by the mode changes above.
      if (initial.pose) useStarmap.getState().restorePose(initial.pose)
    }

    if (initial.culture && initial.culture !== DEFAULT_CULTURE) {
      void store.setSkyCulture(initial.culture).then(finish)
    } else {
      finish()
    }
  }, [catalog])
}

/** Writes the view back into the hash once it settles. */
export function UrlSync() {
  useInitialUrlState()

  const state = useStarmap()
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!state.catalog) return

    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const next: UrlState = {
        ...(state.skyCulture !== DEFAULT_CULTURE ? { culture: state.skyCulture } : {}),
        ...(state.activeConstellation ? { figure: state.activeConstellation } : {}),
        ...(state.selection ? { star: state.selection.index } : {}),
        ...(state.cameraPose ? { pose: state.cameraPose } : {}),
        ...(state.frame !== 'equatorial' ? { frame: state.frame } : {}),
        ...(state.unit !== 'ly' ? { unit: state.unit } : {}),
        ...(state.dissolve !== 1 ? { dissolve: state.dissolve } : {}),
      }

      // Only layers that differ from their defaults, so the common link is short.
      const layers: NonNullable<UrlState['layers']> = {}
      if (!state.showConstellations) layers.constellations = false
      if (!state.showLabels) layers.labels = false
      if (state.showGrid) layers.grid = true
      if (state.showGalaxy) layers.galaxy = true
      if (state.isolate) layers.isolate = true
      if (state.showFaintField) layers.faint = true
      if (Object.keys(layers).length > 0) next.layers = layers

      const encoded = encodeUrlState(next)
      const hash = encoded ? `#${encoded}` : ''
      if (hash !== window.location.hash) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
      }
    }, WRITE_DELAY_MS)

    return () => window.clearTimeout(timer.current)
  }, [state])

  return null
}
