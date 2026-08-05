import { useMemo, useState } from 'react'
import { useStarmap } from '../state/store.ts'
import { Section, Toggle } from './controls.tsx'
import { describeVisibility } from '../lib/visibility.ts'
import { formatDistance } from './format.ts'

/** Compact month labels for the figure list. */
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/**
 * Right panel: what is drawn, and which figure is being examined. The figure
 * list is the one thing here that genuinely cannot fit on screen at 88 entries,
 * so it gets its own scroll region and the rest stays fixed around it.
 */
export function LayersPanel() {
  const state = useStarmap()
  const [filter, setFilter] = useState('')

  const constellations = useMemo(() => {
    if (!state.catalog) return []
    const needle = filter.trim().toLowerCase()
    const all = [...state.catalog.constellations].sort((a, b) => a.name.localeCompare(b.name))
    if (!needle) return all
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (c.english?.toLowerCase().includes(needle) ?? false) ||
        (c.pronounce?.toLowerCase().includes(needle) ?? false) ||
        c.id.toLowerCase().includes(needle),
    )
  }, [state.catalog, filter])

  const cultures = state.catalog?.manifest.cultures ?? []
  const activeCulture = cultures.find((c) => c.id === state.skyCulture)

  return (
    <aside className="panel-right panel">
      <div className="panel-fixed">
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
                : `Faint field${state.fieldTier ? '' : ' (+21 MB)'}`
            }
            checked={state.showFaintField}
            disabled={state.fieldLoading}
            onChange={(value) => {
              if (value) void state.enableFaintField()
              else state.set('showFaintField', false)
            }}
          />
        </Section>
      </div>

      <div className="panel-flex">
        <p className="section-title">Sky culture</p>
        <select
          className="culture-select"
          value={state.skyCulture}
          disabled={state.cultureLoading}
          onChange={(event) => void state.setSkyCulture(event.target.value)}
        >
          {cultures.map((culture) => (
            <option key={culture.id} value={culture.id}>
              {culture.label} · {culture.constellationCount}
            </option>
          ))}
        </select>
        {activeCulture && <p className="hint culture-note">{activeCulture.note}</p>}

        <p className="section-title culture-list-title">
          Figures ({constellations.length})
        </p>
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
              title={[
                constellation.english,
                constellation.pronounce,
                describeVisibility(constellation.visibility, state.viewerNorth),
                `${formatDistance(constellation.nearestPc, state.unit)} – ${formatDistance(constellation.farthestPc, state.unit)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <span className="constellation-name">
                {constellation.name}
                {constellation.pronounce && constellation.pronounce !== constellation.name && (
                  <span className="constellation-pronounce">{constellation.pronounce}</span>
                )}
              </span>
              <span className="constellation-spread">
                {MONTH_ABBR[constellation.visibility.bestMonth - 1]}
                {constellation.visibility.hemisphere !== 'both' && (
                  <span className="constellation-hemi">
                    {constellation.visibility.hemisphere === 'northern' ? 'N' : 'S'}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel-fixed">
        {state.activeConstellation && (
          <button
            type="button"
            className="button ghost"
            onClick={() => state.setActiveConstellation(null)}
          >
            Clear selection
          </button>
        )}
        <p className="credit">
          AT-HYG v4 (Gaia DR3 + Hipparcos), real to 3,000 pc. The Milky Way layer
          is a model: arms from Reid et al. (2019).
        </p>
      </div>
    </aside>
  )
}
