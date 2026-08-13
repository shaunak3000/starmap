import { useStarmap } from '../state/store.ts'

/**
 * Clears both columns off the sky and brings them back.
 *
 * It sits in the top bar rather than inside a panel for the obvious reason: a
 * control that hides the panels cannot live in one.
 */
export function SidebarToggle() {
  const hidden = useStarmap((state) => state.hideSidebars)
  const setHideSidebars = useStarmap((state) => state.setHideSidebars)

  return (
    <button
      type="button"
      role="switch"
      aria-checked={hidden}
      className={`sidebar-toggle${hidden ? ' is-on' : ''}`}
      title={hidden ? 'Bring the panels back' : 'Clear the panels off the sky'}
      onClick={() => setHideSidebars(!hidden)}
    >
      <span className="switch-track" aria-hidden="true">
        <span className="switch-knob" />
      </span>
      <span className="sidebar-toggle-label">Hide sidebars</span>
    </button>
  )
}
