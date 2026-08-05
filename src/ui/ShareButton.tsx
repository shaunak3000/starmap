import { useEffect, useRef, useState } from 'react'

/**
 * Copies the current link.
 *
 * The address bar already carries the view, but nobody thinks to look there.
 * This makes the shareable-link feature findable, which is the entire point of
 * having built it.
 */
export function ShareButton() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {
      // Clipboard access needs a secure context and can be refused outright;
      // selecting the address bar still works, so this is not worth an alert.
      setCopied(false)
      return
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button type="button" className="button ghost" onClick={() => void copy()}>
      {copied ? 'Link copied' : 'Copy link to this view'}
    </button>
  )
}
