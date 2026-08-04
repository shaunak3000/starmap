# Plan — after the guided tour

Add multiple sky cultures so the same stars can be regrouped into Chinese, Norse,
Inuit or Aztec figures. The app currently argues that constellations are an
accident of *where we stand*; swapping cultures proves the other half — they are
also an accident of *who was looking*. Clear the three debts accumulated along
the way while the relevant files are already open.

## Scope

- **In:** a curated set of sky cultures end to end (fetch → pack → picker);
  label decluttering; URL state; tour pacing and a culture-swap final beat.
- **Out:** proper motion / time scrubber (still v2); the HR diagram; fat lines
  (brightness fix was enough); mobile and touch support.

## What the data looks like

Verified against the pinned Stellarium v25.3:

| culture | figures | distinct HIP |
| --- | --- | --- |
| modern (current) | 88 | 710 |
| chinese | 318 | 1,406 |
| egyptian | 28 | — |
| inuit | 11 | — |
| navajo | 8 | — |
| norse / maori | 6 | — |

Same `constellations[].lines` polyline shape my parser already reads. Two
differences that drive real work:

- **Ids are not IAU codes.** Chinese uses `"CON chinese 001"`, so
  `abbreviationFromId` returning `"001"` is fine as a key but the UI's
  three-letter-abbreviation assumption and the parser test's `/^[A-Z][A-Za-z]{2}$/`
  are Western-specific.
- **Naming is richer, not poorer:** `{english: "Net", native: "毕宿", pronounce:
  "Bi Xiu"}`. The current `Constellation` type drops `pronounce` and assumes
  `latin`, which is wrong outside the Western set.

## Action Items

- [ ] **Curate and fetch cultures.** Extend `scripts/sources.ts` and
      `fetch-athyg.ts` to pull a chosen set into `data/raw/skycultures/<id>.json`,
      pinned to the same v25.3 tag.
- [ ] **Generalise the parser** (`scripts/constellations.ts`): return culture-level
      metadata (id, display name, region, classification) alongside figures, and
      carry `native` / `pronounce` / `english` instead of assuming `latin`.
      Rename `Constellation.latin` → `name` across the codebase.
- [ ] **Rework the packer** (`scripts/build-catalog.ts`): force-include the
      **union** of every culture's HIP ids into t0, emit one
      `constellations.<culture>.json` per culture, and list them in the manifest.
      Report the t0 growth — it should be small, since most culture stars are
      already naked-eye.
- [ ] **Add culture state** to `store.ts` and `catalog-loader.ts`: a `skyCulture`
      field, lazy `loadConstellations(culture)`, and cache per culture. Clear the
      active figure on switch, since ids do not carry across.
- [ ] **Add the culture picker** to `LayersPanel.tsx`, and show native name plus
      pronunciation in the figure list where present.
- [ ] **Declutter labels** in `ConstellationMembers.tsx` — flagged three times and
      still unfixed. Project candidates to screen space each frame, drop any whose
      box overlaps an already-placed one, priority to named stars then to the
      nearest and farthest members.
- [ ] **Add URL state**: encode camera, layers, selection and culture in the hash
      so any view is shareable; parse on load, replace (not push) on change.
- [ ] **Retune the tour** using real-hardware pacing, and add a final beat that
      swaps Orion's stars into another culture's figures.

## Validation

- [ ] Extend `catalog-artifact.test.ts` to assert **every shipped culture**
      resolves entirely into t0 (no dangling indices) and reports a sane figure
      count; add a parser test using a non-Western fixture so the IAU-code
      assumption cannot creep back.
- [ ] Add a store test that switching culture clears the active figure and
      reloads, and a URL round-trip test (encode → parse → same state).
- [ ] Screenshot the same patch of sky under three cultures via `shoot.ts`, and
      re-run `shoot-tour.ts` and `check-camera.ts` before deploying.

## Open Questions

1. **Which cultures to ship?** Proposed default: modern, Chinese, Arabic
   (al-Sufi), Norse, Inuit, Polynesian (Maori or Hawaiian), Aztec, Egyptian —
   eight that are visually distinct and well populated. All 56 is possible but
   most are sparse or regional duplicates.
2. **Should the tour end on a culture swap?** It is the strongest possible final
   beat, but it lengthens a tour already at ~52 s.
3. **Render native script (毕宿) in the figure list?** Adds real character but
   depends on the viewer's CJK fonts; the English name is always available as a
   fallback.
