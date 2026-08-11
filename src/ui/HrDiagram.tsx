import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bvToRgb } from '../lib/astro.ts'
import { FIELDS_PER_STAR } from '../lib/catalog-format.ts'
import { fromHalf } from '../lib/half-float.ts'
import { useStarmap } from '../state/store.ts'

/**
 * Hertzsprung–Russell diagram, brushable.
 *
 * Colour index across, absolute magnitude up. Every star the app has loaded is
 * a pixel here, which is enough to make the main sequence, the giant branch and
 * the white dwarfs appear on their own — this is a real measurement, not a
 * drawing. Dragging a box dims everything outside it in the 3D view, so a
 * population selected by physics can be seen in space.
 */

const WIDTH = 250
const HEIGHT = 190
const PADDING = { left: 26, right: 6, top: 6, bottom: 18 }

/** Axis ranges, chosen to hold the catalogue with a little air. */
const CI_MIN = -0.45
const CI_MAX = 2.5
const MAG_MIN = -8
const MAG_MAX = 16

const plotWidth = WIDTH - PADDING.left - PADDING.right
const plotHeight = HEIGHT - PADDING.top - PADDING.bottom

const ciToX = (ci: number) => PADDING.left + ((ci - CI_MIN) / (CI_MAX - CI_MIN)) * plotWidth
const xToCi = (x: number) => CI_MIN + ((x - PADDING.left) / plotWidth) * (CI_MAX - CI_MIN)
// Brighter is a *smaller* magnitude, and belongs at the top.
const magToY = (mag: number) => PADDING.top + ((mag - MAG_MIN) / (MAG_MAX - MAG_MIN)) * plotHeight
const yToMag = (y: number) => MAG_MIN + ((y - PADDING.top) / plotHeight) * (MAG_MAX - MAG_MIN)

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function HrDiagram() {
  const catalog = useStarmap((state) => state.catalog)
  const fieldTier = useStarmap((state) => state.fieldTier)
  const showFaintField = useStarmap((state) => state.showFaintField)
  const brush = useStarmap((state) => state.hrBrush)
  const setBrush = useStarmap((state) => state.setHrBrush)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [drag, setDrag] = useState<Rect | null>(null)

  /**
   * The scatter is expensive relative to the brush overlay, so it is rendered
   * once to an offscreen canvas and blitted afterwards. Redrawing 120k points
   * on every pointer move would make the brush crawl.
   */
  const scatter = useMemo(() => {
    if (!catalog) return null

    const offscreen = document.createElement('canvas')
    offscreen.width = WIDTH
    offscreen.height = HEIGHT
    const ctx = offscreen.getContext('2d')
    if (!ctx) return null

    const plot = (ci: number, mag: number, alpha: number) => {
      if (!Number.isFinite(ci) || !Number.isFinite(mag)) return
      const x = ciToX(ci)
      const y = magToY(mag)
      if (x < PADDING.left || x > WIDTH - PADDING.right) return
      if (y < PADDING.top || y > HEIGHT - PADDING.bottom) return

      const [r, g, b] = bvToRgb(ci)
      ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha})`
      ctx.fillRect(x, y, 1, 1)
    }

    // Faint stars first so the bright, named ones sit on top.
    if (showFaintField && fieldTier && fieldTier.kind === 'field') {
      for (let i = 0; i < fieldTier.count; i += 3) {
        plot(fromHalf(fieldTier.colorIndex[i]), fromHalf(fieldTier.absMag[i]), 0.1)
      }
    }

    const t1 = catalog.t1
    for (let i = 0; i < t1.count; i++) {
      plot(fromHalf(t1.colorIndex[i]), fromHalf(t1.absMag[i]), 0.22)
    }

    const t0 = catalog.t0
    for (let i = 0; i < t0.count; i++) {
      const base = i * FIELDS_PER_STAR
      plot(t0.attributes[base + 4], t0.attributes[base + 3], 0.6)
    }

    return offscreen
  }, [catalog, fieldTier, showFaintField])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !scatter) return

    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    ctx.drawImage(scatter, 0, 0)

    // Axes.
    ctx.strokeStyle = 'rgba(150,180,230,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PADDING.left, PADDING.top)
    ctx.lineTo(PADDING.left, HEIGHT - PADDING.bottom)
    ctx.lineTo(WIDTH - PADDING.right, HEIGHT - PADDING.bottom)
    ctx.stroke()

    ctx.fillStyle = 'rgba(139,149,171,0.85)'
    ctx.font = '9px ui-monospace, monospace'
    ctx.fillText('−5', 2, magToY(-5) + 3)
    ctx.fillText('0', 8, magToY(0) + 3)
    ctx.fillText('5', 8, magToY(5) + 3)
    ctx.fillText('10', 3, magToY(10) + 3)
    ctx.fillText('15', 3, magToY(15) + 3)
    ctx.fillText('blue', PADDING.left, HEIGHT - 6)
    ctx.fillText('red', WIDTH - PADDING.right - 18, HEIGHT - 6)

    const active = drag ?? (brush ? brushToRect(brush) : null)
    if (active) {
      const x = Math.min(active.x0, active.x1)
      const y = Math.min(active.y0, active.y1)
      const w = Math.abs(active.x1 - active.x0)
      const h = Math.abs(active.y1 - active.y0)
      ctx.strokeStyle = 'rgba(124,198,255,0.9)'
      ctx.fillStyle = 'rgba(124,198,255,0.12)'
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
    }
  }, [scatter, drag, brush])

  useEffect(draw, [draw])

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    }
  }

  return (
    <div className="hr-panel panel">
      <div className="hr-head">
        <span className="hr-title">HR diagram</span>
        {brush && (
          <button type="button" className="hr-clear" onClick={() => setBrush(null)}>
            clear
          </button>
        )}
      </div>

      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="hr-canvas"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          const { x, y } = pointAt(event)
          setDrag({ x0: x, y0: y, x1: x, y1: y })
        }}
        onPointerMove={(event) => {
          if (!drag) return
          const { x, y } = pointAt(event)
          setDrag({ ...drag, x1: x, y1: y })
        }}
        onPointerUp={(event) => {
          if (!drag) return
          const { x, y } = pointAt(event)
          const final = { ...drag, x1: x, y1: y }
          setDrag(null)

          // A click rather than a drag means "clear", which is the obvious way
          // to undo a selection without hunting for a button.
          if (Math.abs(final.x1 - final.x0) < 3 && Math.abs(final.y1 - final.y0) < 3) {
            setBrush(null)
            return
          }

          setBrush({
            ciMin: Math.min(xToCi(final.x0), xToCi(final.x1)),
            ciMax: Math.max(xToCi(final.x0), xToCi(final.x1)),
            magMin: Math.min(yToMag(final.y0), yToMag(final.y1)),
            magMax: Math.max(yToMag(final.y0), yToMag(final.y1)),
          })
          void event
        }}
      />

      <p className="hr-hint">
        {brush
          ? 'Everything outside the box is dimmed in the sky.'
          : 'Drag a box to pick out a population; click to clear.'}
      </p>
    </div>
  )
}

function brushToRect(brush: NonNullable<ReturnType<typeof useStarmap.getState>['hrBrush']>): Rect {
  return {
    x0: ciToX(brush.ciMin),
    y0: magToY(brush.magMin),
    x1: ciToX(brush.ciMax),
    y1: magToY(brush.magMax),
  }
}
