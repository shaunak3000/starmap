import { describe, expect, it } from 'vitest'
import type { CameraPose } from '../state/store.ts'
import { type UrlState, decodeUrlState, encodeUrlState } from './url-state.ts'

const pose: CameraPose = {
  mode: 'orbit',
  target: [52.31, 190.07, 26.24],
  distance: 537.482,
  yaw: 1.5708,
  pitch: -0.2143,
  fov: 60,
}

/** Encode then decode, which is the only property that actually matters. */
function roundTrip(state: UrlState): UrlState {
  return decodeUrlState(`#${encodeUrlState(state)}`)
}

describe('round trip', () => {
  it('preserves a full view', () => {
    const state: UrlState = {
      culture: 'chinese',
      figure: 'Ori',
      star: 1923,
      pose,
      frame: 'galactic',
      unit: 'pc',
      dissolve: 0.42,
      layers: { grid: true, galaxy: true, constellations: false },
    }

    expect(roundTrip(state)).toEqual(state)
  })

  it('preserves each camera mode', () => {
    for (const mode of ['orbit', 'fly', 'earth'] as const) {
      expect(roundTrip({ pose: { ...pose, mode } }).pose?.mode).toBe(mode)
    }
  })

  it('keeps camera numbers close enough to restore the same view', () => {
    const restored = roundTrip({ pose }).pose!
    expect(restored.target[0]).toBeCloseTo(pose.target[0], 2)
    expect(restored.target[1]).toBeCloseTo(pose.target[1], 2)
    expect(restored.target[2]).toBeCloseTo(pose.target[2], 2)
    expect(restored.distance).toBeCloseTo(pose.distance, 3)
    expect(restored.yaw).toBeCloseTo(pose.yaw, 4)
    expect(restored.pitch).toBeCloseTo(pose.pitch, 4)
  })

  it('survives a full turn of yaw and extreme distances', () => {
    const extreme: CameraPose = {
      mode: 'orbit',
      target: [0, 0, 0],
      distance: 30000,
      yaw: -12.566,
      pitch: 1.5,
      fov: 12,
    }
    const restored = roundTrip({ pose: extreme }).pose!
    expect(restored.yaw).toBeCloseTo(extreme.yaw, 3)
    expect(restored.distance).toBeCloseTo(extreme.distance, 3)
  })
})

describe('epoch and population', () => {
  it('round-trips a scrubbed epoch', () => {
    expect(roundTrip({ years: -75_000 }).years).toBe(-75_000)
  })

  it('omits the present epoch, so an ordinary link stays short', () => {
    expect(encodeUrlState({ years: 0 })).toBe('')
  })

  it('clamps an out-of-range epoch rather than trusting it', () => {
    expect(decodeUrlState('#yr=99999999').years).toBe(100_000)
    expect(decodeUrlState('#yr=-99999999').years).toBe(-100_000)
  })

  it('round-trips an HR brush', () => {
    const brush = { ciMin: 0.9, ciMax: 2.5, magMin: -8, magMax: 2 }
    expect(roundTrip({ brush }).brush).toEqual(brush)
  })

  it('ignores a malformed brush', () => {
    expect(decodeUrlState('#hr=1,2').brush).toBeUndefined()
    expect(decodeUrlState('#hr=a,b,c,d').brush).toBeUndefined()
  })
})

describe('defaults', () => {
  it('encodes nothing for an empty state', () => {
    expect(encodeUrlState({})).toBe('')
  })

  it('reads a bare hash as no opinion at all', () => {
    // A link with no parameters must mean "the default view", not "everything
    // off" — otherwise sharing the front page would break it.
    expect(decodeUrlState('')).toEqual({})
    expect(decodeUrlState('#')).toEqual({})
  })

  it('distinguishes a layer switched off from one left alone', () => {
    const decoded = roundTrip({ layers: { grid: true, galaxy: false } })
    expect(decoded.layers?.grid).toBe(true)
    expect(decoded.layers?.galaxy).toBe(false)
    expect(decoded.layers?.labels).toBeUndefined()
  })
})

describe('robustness', () => {
  it('ignores a malformed camera rather than throwing', () => {
    expect(decodeUrlState('#cam=nonsense').pose).toBeUndefined()
    expect(decodeUrlState('#cam=orbit,1,2').pose).toBeUndefined()
    expect(decodeUrlState('#cam=orbit,a,b,c,d,e,f,g').pose).toBeUndefined()
  })

  it('rejects an unknown camera mode', () => {
    expect(decodeUrlState('#cam=teleport,1,2,3,4,5,6,60').pose).toBeUndefined()
  })

  it('clamps depth into range', () => {
    expect(decodeUrlState('#dep=5').dissolve).toBe(1)
    expect(decodeUrlState('#dep=-3').dissolve).toBe(0)
  })

  it('ignores junk parameters', () => {
    expect(decodeUrlState('#nonsense=1&frm=nope&u=furlongs')).toEqual({})
  })

  it('survives a hash written by a future version', () => {
    const decoded = decodeUrlState('#cul=indian&somethingNew=42')
    expect(decoded.culture).toBe('indian')
  })
})

describe('readability', () => {
  it('leaves commas unescaped so links stay legible', () => {
    expect(encodeUrlState({ pose })).toContain('cam=orbit,')
  })

  it('stays short enough to paste', () => {
    const encoded = encodeUrlState({
      culture: 'chinese',
      figure: 'Ori',
      pose,
      layers: { grid: true, galaxy: true },
    })
    expect(encoded.length).toBeLessThan(140)
  })
})
