import { useMemo, useState } from 'react'
import { FIELDS_PER_STAR } from '../lib/catalog-format.ts'
import { searchStars } from '../lib/star-info.ts'
import { useStarmap } from '../state/store.ts'

export function SearchBox() {
  const catalog = useStarmap((state) => state.catalog)
  const focusOn = useStarmap((state) => state.focusOn)
  const select = useStarmap((state) => state.select)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    if (!catalog || !open) return []
    return searchStars(catalog, query)
  }, [catalog, query, open])

  const go = (index: number) => {
    if (!catalog) return
    const base = index * FIELDS_PER_STAR
    const position: [number, number, number] = [
      catalog.t0.attributes[base],
      catalog.t0.attributes[base + 1],
      catalog.t0.attributes[base + 2],
    ]
    const distance = Math.hypot(...position)

    select(index)
    // Stand off by a fraction of the star's distance so nearby and remote stars
    // both arrive framed rather than either clipping or vanishing.
    focusOn(position, Math.max(distance * 0.08, 1.5))
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="search">
      <input
        className="search-input"
        placeholder="Search stars — Betelgeuse, Alp Ori, HIP 27989…"
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && results.length > 0) go(results[0].index)
          if (event.key === 'Escape') {
            setQuery('')
            setOpen(false)
            event.currentTarget.blur()
          }
        }}
      />

      {results.length > 0 && (
        <div className="search-results panel">
          {results.map((result) => (
            <button
              key={result.index}
              type="button"
              className="search-result"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => go(result.index)}
            >
              <span>{result.label}</span>
              <span className="search-result-detail">{result.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
