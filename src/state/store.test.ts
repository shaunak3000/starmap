import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SPHERE_RADIUS_PC, useStarmap } from './store.ts'
import { TOUR } from '../lib/tour.ts'

const pristine = useStarmap.getState()

beforeEach(() => {
  useStarmap.setState(pristine, true)
})

describe('dissolve', () => {
  // Regression: this said 0 for a while, which is the *collapsed* celestial
  // sphere. Clearing a selection therefore flattened the entire sky onto a
  // shell, and the tour's galaxy beat ran with the stars on a false radius.
  it('returns to true distances when a figure is cleared', () => {
    useStarmap.setState({ activeConstellation: 'Ori', dissolve: 0, sphereRadiusPc: 400 })
    useStarmap.getState().setActiveConstellation(null)

    expect(useStarmap.getState().dissolve).toBe(1)
    expect(useStarmap.getState().sphereRadiusPc).toBe(DEFAULT_SPHERE_RADIUS_PC)
  })

  it('leaves the depth alone when selecting a different figure', () => {
    useStarmap.setState({ activeConstellation: 'Ori', dissolve: 0.4 })
    useStarmap.getState().setActiveConstellation('CMa')
    expect(useStarmap.getState().dissolve).toBe(0.4)
  })

  it('defaults to true distances', () => {
    expect(useStarmap.getState().dissolve).toBe(1)
  })
})

describe('resetView', () => {
  it('clears everything a tour or reveal may have left behind', () => {
    useStarmap.setState({
      cameraMode: 'fly',
      dissolve: 0,
      isolate: true,
      activeConstellation: 'Ori',
      selection: { index: 5 },
      sphereRadiusPc: 900,
    })

    useStarmap.getState().resetView()
    const state = useStarmap.getState()

    expect(state.cameraMode).toBe('earth')
    expect(state.dissolve).toBe(1)
    expect(state.isolate).toBe(false)
    expect(state.activeConstellation).toBeNull()
    expect(state.selection).toBeNull()
    expect(state.sphereRadiusPc).toBe(DEFAULT_SPHERE_RADIUS_PC)
  })
})

describe('the guided tour', () => {
  it('runs under a minute so it can be watched to the end', () => {
    const total = TOUR.reduce((sum, step) => sum + step.holdMs, 0)
    expect(total).toBeGreaterThan(30_000)
    expect(total).toBeLessThanOrEqual(60_000)
  })

  it('gives every step a caption and a unique id', () => {
    const ids = new Set(TOUR.map((step) => step.id))
    expect(ids.size).toBe(TOUR.length)
    for (const step of TOUR) expect(step.caption).toBeTruthy()
  })

  it('never leaves the sky collapsed onto a shell', () => {
    // The whole app argues from true distances; any beat that quietly sits at
    // dissolve 0 is showing the viewer a sky that is not there.
    for (const step of TOUR) {
      useStarmap.setState(pristine, true)
      useStarmap.setState({ catalog: null })
      step.apply(useStarmap.getState())
      expect(useStarmap.getState().dissolve, step.id).toBe(1)
    }
  })

  it('ends back somewhere a viewer can explore from', () => {
    const last = TOUR[TOUR.length - 1]
    last.apply(useStarmap.getState())
    const state = useStarmap.getState()

    expect(state.cameraMode).toBe('earth')
    expect(state.showGalaxy).toBe(false)
    expect(state.showConstellations).toBe(true)
    expect(state.isolate).toBe(false)
  })

  it('opens from a clean slate rather than inheriting stray toggles', () => {
    useStarmap.setState({
      showGalaxy: true,
      showGrid: true,
      isolate: true,
      exposure: 3,
      sizeMode: 'map',
      dissolve: 0,
    })

    TOUR[0].apply(useStarmap.getState())
    const state = useStarmap.getState()

    expect(state.showGalaxy).toBe(false)
    expect(state.showGrid).toBe(false)
    expect(state.isolate).toBe(false)
    expect(state.exposure).toBe(1)
    expect(state.sizeMode).toBe('apparent')
    expect(state.dissolve).toBe(1)
  })
})
