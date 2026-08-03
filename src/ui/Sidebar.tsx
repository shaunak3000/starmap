import { useMemo, useState } from 'react'
import { LY_PER_PC } from '../lib/astro.ts'
import { DISTANCE_FILTER_MAX_PC } from '../scene/StarField.tsx'
import {
  type CameraMode,
  type DistanceUnit,
  type ReferenceFrame,
  type SizeMode,
  useStarmap,
} from '../state/store.ts'
import { Section, Segmented, Slider, Toggle } from './controls.tsx'

function formatDistance(pc: number, unit: DistanceUnit): string {
  const value = unit === 'pc' ? pc : pc * LY_PER_PC
  const suffix = unit === 'pc' ? 'pc' : 'ly'
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k ${suffix}`
  if (value >= 100) return `${value.toFixed(0)} ${suffix}`
  return `${value.toFixed(1)} ${suffix}`
}

export function Sidebar() {
  const state = useStarmap()
  const [filter, setFilter] = useState('')

  const constellations = useMemo(() => {
    if (!state.catalog) return []
    const needle = filter.trim().toLowerCase()
    const all = [...state.catalog.constellations].sort((a, b) =>
      a.latin.localeCompare(b.latin),
    )
    if (!needle) return all
    return all.filter(
      (c) =>
        c.latin.toLowerCase().includes(needle) ||
        c.english.toLowerCase().includes(needle) ||
        c.id.toLowerCase().includes(needle),
    )
  }, [state.catalog, filter])

  return (
    <aside className="sidebar panel">
      <div className="sidebar-scroll">
        <div className="brand">
          <span className="brand-name">starmap</span>
          <span className="brand-sub">3 kpc</span>
        </div>

        <Section title="Viewpoint">
          <Segmented<CameraMode>
            value={state.cameraMode}
            onChange={(value) => state.set('cameraMode', value)}
            options={[
              { value: 'earth', label: 'Earth', title: 'Stand on the Sun and look out' },
              { value: 'orbit', label: 'Orbit', title: 'Orbit a focus point' },
              { value: 'fly', label: 'Fly', title: 'Free flight (WASD, Q/E, Shift)' },
            ]}
          />
          <p className="hint">
            {state.cameraMode === 'earth'
              ? 'Drag to look around, scroll to zoom. This is the sky as we see it.'
              : state.cameraMode === 'fly'
                ? 'WASD to move, Q/E for up and down, Shift to boost, scroll for speed.'
                : 'Drag to orbit, scroll to dolly in and out.'}
          </p>
        </Section>

        <Section title="Scale">
          <button type="button" className="button" onClick={() => state.viewGalaxy()}>
            View the whole Galaxy
          </button>
          <p className="hint">
            Flies out to 30 kpc, face-on. The catalogue only reaches 3 kpc, so
            the disk and arms out there are a model — the real stars are the
            small bright knot around the Sun.
          </p>
        </Section>

        <Section title="Depth">
          <Slider
            label="True distance"
            value={state.dissolve}
            min={0}
            max={1}
            step={0.01}
            display={state.dissolve === 1 ? 'real' : state.dissolve === 0 ? 'sphere' : state.dissolve.toFixed(2)}
            onChange={(value) => state.set('dissolve', value)}
          />
          <p className="hint">
            Drag to zero to collapse every star onto one shell — the sky the
            constellations assume. From Earth it looks identical. From anywhere
            else it does not.
          </p>
        </Section>

        <Section title="Stars">
          <Segmented<SizeMode>
            value={state.sizeMode}
            onChange={(value) => state.set('sizeMode', value)}
            options={[
              { value: 'apparent', label: 'Apparent', title: 'Brightness as seen from the camera' },
              { value: 'map', label: 'Map', title: 'Size by intrinsic luminosity' },
            ]}
          />
          <Slider
            label="Exposure"
            value={state.exposure}
            min={0.2}
            max={4}
            step={0.05}
            display={`${state.exposure.toFixed(2)}x`}
            onChange={(value) => state.set('exposure', value)}
          />
          <Slider
            label="Bloom"
            value={state.bloom}
            min={0}
            max={2}
            step={0.05}
            display={state.bloom === 0 ? 'off' : state.bloom.toFixed(2)}
            onChange={(value) => state.set('bloom', value)}
          />
          <Slider
            label="Range"
            value={state.maxDistancePc}
            min={10}
            max={DISTANCE_FILTER_MAX_PC}
            step={10}
            display={
              state.maxDistancePc >= DISTANCE_FILTER_MAX_PC
                ? 'all'
                : formatDistance(state.maxDistancePc, state.unit)
            }
            onChange={(value) => state.set('maxDistancePc', value)}
          />
        </Section>

        <Section title="Layers">
          <Toggle
            label="Constellations"
            checked={state.showConstellations}
            onChange={(value) => state.set('showConstellations', value)}
          />
          <Toggle
            label="Distance labels"
            checked={state.showLabels}
            onChange={(value) => state.set('showLabels', value)}
          />
          <Toggle
            label="XYZ grid"
            checked={state.showGrid}
            onChange={(value) => state.set('showGrid', value)}
          />
          <Toggle
            label="Milky Way (model)"
            checked={state.showGalaxy}
            onChange={(value) => state.set('showGalaxy', value)}
          />
          <Toggle
            label="Isolate selection"
            checked={state.isolate}
            onChange={(value) => state.set('isolate', value)}
          />
          <Toggle
            label={
              state.fieldLoading
                ? 'Faint field (loading…)'
                : `Faint field${state.fieldTier ? '' : ' (+40 MB)'}`
            }
            checked={state.showFaintField}
            disabled={state.fieldLoading}
            onChange={(value) => {
              if (value) void state.enableFaintField()
              else state.set('showFaintField', false)
            }}
          />
        </Section>

        <Section title="Frame">
          <Segmented<ReferenceFrame>
            value={state.frame}
            onChange={(value) => state.set('frame', value)}
            options={[
              { value: 'equatorial', label: 'Equatorial', title: 'Earth’s celestial poles' },
              { value: 'galactic', label: 'Galactic', title: 'Aligned to the Milky Way' },
            ]}
          />
          <Segmented<DistanceUnit>
            value={state.unit}
            onChange={(value) => state.set('unit', value)}
            options={[
              { value: 'ly', label: 'Light years' },
              { value: 'pc', label: 'Parsecs' },
            ]}
          />
        </Section>

        <Section title={`Constellations (${constellations.length})`}>
          <input
            className="constellation-search"
            placeholder="Filter figures…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <div className="constellation-list">
            {constellations.map((constellation) => (
              <button
                key={constellation.id}
                type="button"
                className="constellation-row"
                aria-pressed={state.activeConstellation === constellation.id}
                onClick={() => state.revealConstellation(constellation.id)}
                title={`${constellation.english} — nearest ${formatDistance(constellation.nearestPc, state.unit)}, farthest ${formatDistance(constellation.farthestPc, state.unit)}`}
              >
                <span>{constellation.latin}</span>
                <span className="constellation-spread">
                  {formatDistance(constellation.nearestPc, state.unit)} –{' '}
                  {formatDistance(constellation.farthestPc, state.unit)}
                </span>
              </button>
            ))}
          </div>
          {state.activeConstellation && (
            <button
              type="button"
              className="button ghost"
              onClick={() => state.setActiveConstellation(null)}
            >
              Clear selection
            </button>
          )}
        </Section>

        <p className="credit">
          Stars: AT-HYG v4 (Gaia DR3 + Hipparcos), real out to 3,000 pc. The
          Milky Way layer is a <em>model</em> — spiral arms from the Reid et al.
          (2019) maser parallax fit — because the catalogue holds only a few
          hundred stars at the Galactic Centre’s distance. Supergiant distances
          carry real uncertainty.
        </p>
      </div>
    </aside>
  )
}
