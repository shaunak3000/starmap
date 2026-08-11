import { formatDistance as format } from './format.ts'
import { constellationSpread } from '../lib/constellation-view.ts'
import { describeVisibility } from '../lib/visibility.ts'
import { describeYear } from '../lib/proper-motion.ts'
import { useStarmap } from '../state/store.ts'

export function Hud() {
  const catalog = useStarmap((state) => state.catalog)
  const unit = useStarmap((state) => state.unit)
  const cameraDistancePc = useStarmap((state) => state.cameraDistancePc)
  const activeConstellation = useStarmap((state) => state.activeConstellation)
  const showFaintField = useStarmap((state) => state.showFaintField)
  const fieldTier = useStarmap((state) => state.fieldTier)
  const fps = useStarmap((state) => state.fps)
  const showGrid = useStarmap((state) => state.showGrid)
  const gridStepPc = useStarmap((state) => state.gridStepPc)
  const viewerNorth = useStarmap((state) => state.viewerNorth)
  const years = useStarmap((state) => state.years)

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
        {years !== 0 && (
          <>
            {' · '}
            <span className="hud-figure">{describeYear(years)}</span>
          </>
        )}
        {showGrid && (
          <>
            {' · grid '}
            <span className="hud-figure">{format(gridStepPc, unit)}</span>
          </>
        )}
      </div>
      {active && (
        <>
          <div>
            {active.name}
            {active.english && active.english !== active.name && ` (${active.english})`}:{' '}
            <span className="hud-figure">{format(active.nearestPc, unit)}</span> to{' '}
            <span className="hud-figure">{format(active.farthestPc, unit)}</span> —{' '}
            <span className="hud-figure">
              {constellationSpread(active).ratio.toFixed(0)}x
            </span>{' '}
            deep
          </div>
          <div>{describeVisibility(active.visibility, viewerNorth)}</div>
        </>
      )}
    </div>
  )
}
