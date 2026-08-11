import { MAX_YEARS } from './proper-motion.ts'
import type { CameraPose } from '../state/store.ts'

/**
 * Shareable views, encoded in the URL hash.
 *
 * Without this the address bar never changes: you cannot send anyone a link to
 * "Orion, revealed, side-on" or "the Chinese sky", only instructions for
 * reproducing it. The hash is used rather than a path because GitHub Pages is a
 * static host with no routing — anything after `#` never reaches the server, so
 * a deep link survives a refresh with no server configuration at all.
 *
 * Only values that differ from the defaults are written, which keeps a bare URL
 * meaning "the default view" and keeps a shared link short enough to paste.
 */

export interface UrlState {
  culture?: string
  figure?: string
  star?: number
  pose?: CameraPose
  frame?: 'equatorial' | 'galactic'
  unit?: 'pc' | 'ly'
  dissolve?: number
  years?: number
  layers?: {
    constellations?: boolean
    labels?: boolean
    grid?: boolean
    galaxy?: boolean
    isolate?: boolean
    faint?: boolean
  }
}

/** Layer keys, in the order they are written into the hash. */
const LAYER_KEYS = ['constellations', 'labels', 'grid', 'galaxy', 'isolate', 'faint'] as const
type LayerKey = (typeof LAYER_KEYS)[number]

/** Short codes so the hash stays readable and paste-safe. */
const LAYER_CODES: Record<LayerKey, string> = {
  constellations: 'c',
  labels: 'l',
  grid: 'g',
  galaxy: 'w',
  isolate: 'i',
  faint: 'f',
}

/** Enough precision to restore a view; more just bloats the link. */
function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function encodePose(pose: CameraPose): string {
  // Angles to 4 places is finer than a pixel at any sane field of view;
  // positions to 2 places is a hundredth of a parsec.
  return [
    pose.mode,
    round(pose.target[0], 2),
    round(pose.target[1], 2),
    round(pose.target[2], 2),
    round(pose.distance, 3),
    round(pose.yaw, 4),
    round(pose.pitch, 4),
    round(pose.fov, 1),
  ].join(',')
}

function decodePose(raw: string): CameraPose | undefined {
  const parts = raw.split(',')
  if (parts.length !== 8) return undefined

  const mode = parts[0]
  if (mode !== 'orbit' && mode !== 'fly' && mode !== 'earth') return undefined

  const numbers = parts.slice(1).map(Number)
  if (numbers.some((value) => !Number.isFinite(value))) return undefined

  return {
    mode,
    target: [numbers[0], numbers[1], numbers[2]],
    distance: numbers[3],
    yaw: numbers[4],
    pitch: numbers[5],
    fov: numbers[6],
  }
}

export function encodeUrlState(state: UrlState): string {
  const params = new URLSearchParams()

  if (state.culture) params.set('cul', state.culture)
  if (state.figure) params.set('fig', state.figure)
  if (state.star !== undefined) params.set('star', String(state.star))
  if (state.pose) params.set('cam', encodePose(state.pose))
  if (state.frame) params.set('frm', state.frame === 'galactic' ? 'gal' : 'eq')
  if (state.unit) params.set('u', state.unit)
  if (state.dissolve !== undefined) params.set('dep', String(round(state.dissolve, 2)))
  if (state.years !== undefined && state.years !== 0) params.set('yr', String(Math.round(state.years)))

  if (state.layers) {
    // Written as two lists so an absent key means "leave at the default",
    // rather than silently switching a layer off.
    const on: string[] = []
    const off: string[] = []
    for (const key of LAYER_KEYS) {
      const value = state.layers[key]
      if (value === true) on.push(LAYER_CODES[key])
      else if (value === false) off.push(LAYER_CODES[key])
    }
    if (on.length) params.set('on', on.join(''))
    if (off.length) params.set('off', off.join(''))
  }

  // URLSearchParams percent-encodes commas, which makes the hash needlessly
  // ugly for something that never reaches a server.
  return params.toString().replace(/%2C/g, ',')
}

export function decodeUrlState(hash: string): UrlState {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const state: UrlState = {}

  const culture = params.get('cul')
  if (culture) state.culture = culture

  const figure = params.get('fig')
  if (figure) state.figure = figure

  const star = params.get('star')
  if (star !== null && Number.isInteger(Number(star))) state.star = Number(star)

  const cam = params.get('cam')
  if (cam) {
    const pose = decodePose(cam)
    if (pose) state.pose = pose
  }

  const frame = params.get('frm')
  if (frame === 'gal') state.frame = 'galactic'
  else if (frame === 'eq') state.frame = 'equatorial'

  const unit = params.get('u')
  if (unit === 'pc' || unit === 'ly') state.unit = unit

  const dissolve = params.get('dep')
  if (dissolve !== null) {
    const value = Number(dissolve)
    if (Number.isFinite(value)) state.dissolve = Math.min(Math.max(value, 0), 1)
  }

  const years = params.get('yr')
  if (years !== null) {
    const value = Number(years)
    if (Number.isFinite(value)) state.years = Math.min(Math.max(value, -MAX_YEARS), MAX_YEARS)
  }

  const on = params.get('on') ?? ''
  const off = params.get('off') ?? ''
  if (on || off) {
    const layers: NonNullable<UrlState['layers']> = {}
    for (const key of LAYER_KEYS) {
      const code = LAYER_CODES[key]
      if (on.includes(code)) layers[key] = true
      else if (off.includes(code)) layers[key] = false
    }
    if (Object.keys(layers).length > 0) state.layers = layers
  }

  return state
}
