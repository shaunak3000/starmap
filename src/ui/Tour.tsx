import { useEffect, useRef } from 'react'
import { TOUR, resolveText } from '../lib/tour.ts'
import { useStarmap } from '../state/store.ts'

const SEEN_KEY = 'starmap.tour.seen'

/** Autoplay is for first-time visitors only, and never against a stated preference. */
function shouldAutoplay(): boolean {
  try {
    if (window.localStorage.getItem(SEEN_KEY)) return false
  } catch {
    // Private browsing can throw on localStorage; treat it as a first visit.
  }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Nothing to do; the worst case is the tour offers itself again.
  }
}

/**
 * Drives the guided tour and renders its captions.
 *
 * Steps only ever write to the same store the controls write to, so there is no
 * separate "tour camera" to hand back from — the moment the viewer touches
 * anything, the tour stops and they are already in control of the exact view
 * they were looking at.
 */
export function Tour() {
  const catalog = useStarmap((state) => state.catalog)
  const ready = catalog !== null
  const tourStep = useStarmap((state) => state.tourStep)
  const startTour = useStarmap((state) => state.startTour)
  const stopTour = useStarmap((state) => state.stopTour)
  const setTourStep = useStarmap((state) => state.setTourStep)

  const started = useRef(false)

  // Offer the tour once, after the catalogue is up so the first beat has stars.
  useEffect(() => {
    if (!ready || started.current) return
    started.current = true
    if (shouldAutoplay()) startTour()
  }, [ready, startTour])

  // Apply the current step, then queue the next.
  useEffect(() => {
    if (tourStep === null) return

    const step = TOUR[tourStep]
    if (!step) {
      markSeen()
      stopTour()
      return
    }

    step.apply(useStarmap.getState())

    const timer = window.setTimeout(() => {
      if (tourStep + 1 >= TOUR.length) {
        markSeen()
        stopTour()
      } else {
        setTourStep(tourStep + 1)
      }
    }, step.holdMs)

    return () => window.clearTimeout(timer)
  }, [tourStep, stopTour, setTourStep])

  // Any deliberate interaction ends the tour and hands over mid-shot.
  useEffect(() => {
    if (tourStep === null) return

    const end = () => {
      markSeen()
      stopTour()
    }

    const onKey = (event: KeyboardEvent) => {
      // Ignore modifier taps so a stray Shift does not abort the intro.
      if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt') return
      end()
    }

    window.addEventListener('pointerdown', end)
    window.addEventListener('wheel', end, { passive: true })
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('pointerdown', end)
      window.removeEventListener('wheel', end)
      window.removeEventListener('keydown', onKey)
    }
  }, [tourStep, stopTour])

  if (tourStep === null) return null

  const step = TOUR[tourStep]
  if (!step) return null

  return (
    <div className="tour panel">
      <div className="tour-progress" aria-hidden>
        {TOUR.map((entry, index) => (
          <span
            key={entry.id}
            className={`tour-dot${index === tourStep ? ' is-current' : ''}${
              index < tourStep ? ' is-done' : ''
            }`}
          />
        ))}
      </div>

      <p className="tour-caption">{resolveText(step.caption, catalog)}</p>
      {step.detail && <p className="tour-detail">{resolveText(step.detail, catalog)}</p>}

      <button
        type="button"
        className="tour-skip"
        onClick={() => {
          markSeen()
          stopTour()
        }}
      >
        Skip · or just start exploring
      </button>
    </div>
  )
}
