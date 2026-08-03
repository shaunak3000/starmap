import { useMemo } from 'react'
import { starInfo } from '../lib/star-info.ts'
import { useStarmap } from '../state/store.ts'

export function StarCard() {
  const catalog = useStarmap((state) => state.catalog)
  const selection = useStarmap((state) => state.selection)
  const unit = useStarmap((state) => state.unit)
  const select = useStarmap((state) => state.select)
  const focusOn = useStarmap((state) => state.focusOn)

  const info = useMemo(() => {
    if (!catalog || !selection) return null
    return starInfo(catalog, selection.index)
  }, [catalog, selection])

  if (!info) return null

  const distance =
    unit === 'pc'
      ? `${info.distancePc.toFixed(info.distancePc < 10 ? 2 : 1)} pc`
      : `${info.distanceLy.toFixed(info.distanceLy < 10 ? 2 : 1)} ly`

  return (
    <div className="star-card panel">
      <div className="star-card-head">
        <span className="star-card-swatch" style={{ background: info.swatch, color: info.swatch }} />
        <span className="star-card-name">{info.label}</span>
        <button
          type="button"
          className="star-card-close"
          aria-label="Close"
          onClick={() => select(null)}
        >
          ×
        </button>
      </div>

      {info.designations.length > 0 && (
        <div className="star-card-designations">{info.designations.join(' · ')}</div>
      )}

      <dl className="star-stats">
        <dt>Distance</dt>
        <dd>{distance}</dd>

        <dt>Apparent mag</dt>
        <dd>{info.appMag.toFixed(2)}</dd>

        <dt>Absolute mag</dt>
        <dd>{info.absMag.toFixed(2)}</dd>

        <dt>Temperature</dt>
        <dd>{Math.round(info.temperatureK).toLocaleString()} K</dd>

        {info.meta?.spect && (
          <>
            <dt>Spectral</dt>
            <dd>{info.meta.spect}</dd>
          </>
        )}

        {info.meta?.con && (
          <>
            <dt>Constellation</dt>
            <dd>{info.meta.con}</dd>
          </>
        )}
      </dl>

      <button
        type="button"
        className="button"
        onClick={() => focusOn(info.position, Math.max(info.distancePc * 0.08, 1.5))}
      >
        Fly here
      </button>
    </div>
  )
}
