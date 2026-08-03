import { LY_PER_PC } from '../lib/astro.ts'
import { constellationSpread } from '../lib/constellation-view.ts'
import { useStarmap } from '../state/store.ts'

function format(pc: number, unit: 'pc' | 'ly'): string {
  const value = unit === 'pc' ? pc : pc * LY_PER_PC
  const suffix = unit === 'pc' ? 'pc' : 'ly'
  if (value < 0.01) return `0 ${suffix}`
  if (value < 10) return `${value.toFixed(2)} ${suffix}`
  if (value < 1000) return `${value.toFixed(0)} ${suffix}`
  return `${(value / 1000).toFixed(1)}k ${suffix}`
}

export function Hud() {
  const catalog = useStarmap((state) => state.catalog)
  const unit = useStarmap((state) => state.unit)
  const cameraDistancePc = useStarmap((state) => state.cameraDistancePc)
  const activeConstellation = useStarmap((state) => state.activeConstellation)
  const showFaintField = useStarmap((state) => state.showFaintField)
  const fieldTier = useStarmap((state) => state.fieldTier)
  const fps = useStarmap((state) => state.fps)

  if (!catalog) return null

  const rendered =
    catalog.t0.count +
    catalog.t1.count +
    (showFaintField && fieldTier ? fieldTier.count : 0)

  const active = activeConstellation
    ? catalog.constellations.find((c) => c.id === activeConstellation)
    : undefined

  return (
    <div className="hud">
      <div>
        <span className="hud-figure">{rendered.toLocaleString()}</span> stars ·{' '}
        <span className="hud-figure">{format(cameraDistancePc, unit)}</span> from the Sun
        {fps > 0 && (
          <>
            {' · '}
            <span className="hud-figure">{fps}</span> fps
          </>
        )}
      </div>
      {active && (
        <div>
          {active.latin}: <span className="hud-figure">{format(active.nearestPc, unit)}</span> to{' '}
          <span className="hud-figure">{format(active.farthestPc, unit)}</span> —{' '}
          <span className="hud-figure">
            {constellationSpread(active).ratio.toFixed(0)}x
          </span>{' '}
          deep
        </div>
      )}
    </div>
  )
}
