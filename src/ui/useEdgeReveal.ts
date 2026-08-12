import { useEffect, useRef, useState } from 'react'

/**
 * Slides a panel out of the way until the pointer asks for it.
 *
 * The panels are chrome; the sky is the thing. Once someone has set a view up
 * they want to look at it, not at thirty controls framing it. Moving toward the
 * edge brings the panel back.
 *
 * A panel stays open while the pointer is inside it, while it holds keyboard
 * focus, and for a short grace period after the pointer leaves — without that
 * last part, dragging a slider and straying a few pixels off would snatch the
 * control away mid-gesture.
 */

/** How close to the viewport edge counts as reaching for the panel. */
const EDGE_PX = 28

/** Grace period before a panel slides away again. */
const HIDE_DELAY_MS = 450

export function useEdgeReveal<T extends HTMLElement>(
  side: 'left' | 'right',
  enabled: boolean,
) {
  const ref = useRef<T | null>(null)
  const [open, setOpen] = useState(false)

  // Mirrored so the pointer listener never needs `open` in its dependencies,
  // which would tear the listener down and rebuild it on every reveal.
  const openRef = useRef(false)
  const hideTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    if (!enabled) {
      window.clearTimeout(hideTimer.current)
      setOpen(false)
      openRef.current = false
      return
    }

    const show = () => {
      window.clearTimeout(hideTimer.current)
      if (!openRef.current) {
        openRef.current = true
        setOpen(true)
      }
    }

    const scheduleHide = () => {
      if (!openRef.current) return
      window.clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => {
        // Focus inside means someone is tabbing through the controls; taking
        // the panel away underneath them would be hostile.
        if (ref.current?.contains(document.activeElement)) return
        openRef.current = false
        setOpen(false)
      }, HIDE_DELAY_MS)
    }

    const onPointerMove = (event: PointerEvent) => {
      const nearEdge =
        side === 'left'
          ? event.clientX <= EDGE_PX
          : event.clientX >= window.innerWidth - EDGE_PX

      // Pointer capture keeps the target inside the panel through a slider
      // drag, so this also covers gestures that wander off the panel.
      const inside = ref.current?.contains(event.target as Node) ?? false

      if (nearEdge || inside) show()
      else scheduleHide()
    }

    const onFocusIn = (event: FocusEvent) => {
      if (ref.current?.contains(event.target as Node)) show()
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('focusin', onFocusIn)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('focusin', onFocusIn)
      window.clearTimeout(hideTimer.current)
    }
  }, [enabled, side])

  return { ref, open: !enabled || open }
}
