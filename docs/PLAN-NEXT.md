# Plan — after the guided tour

Three threads. **Sky cultures** let the same stars regroup into Chinese, Indian
or Norse figures, proving the half of the thesis the app does not yet make —
constellations are an accident of *who was looking*, not only of *where we
stand*. **Seasonal metadata** answers the first question anyone actually asks of
a star map: when can I see this, and from where. **Pacing and debts** clear what
has accumulated.

## Scope

- **In:** a curated set of sky cultures end to end; per-constellation season and
  hemisphere data; a faster tour; label decluttering; URL state.
- **Out:** proper motion / time scrubber (still v2); the HR diagram; fat lines
  (the brightness fix was enough); mobile and touch support.

## 1. Tour pacing

Do this first — it is small, and the tour is the first thing anyone sees.
Camera flights are governed by `FLIGHT_DAMPING` (3.2) and `FLIGHT_DURATION_MS`
(2200) in `CameraRig.tsx`; the step holds total 52 s in `tour.ts`.

Target roughly **38 s**: damping to ~5.5, flight window to ~1400 ms, and trim
the holds — step 3 ("Orion runs 163× deeper") is the longest at 9 s and the
camera has already settled well before it ends.

## 2. Sky cultures

Verified against the pinned Stellarium v25.3:

| culture | figures | stars | note |
| --- | --- | --- | --- |
| modern (current) | 88 | 710 | the Western baseline |
| chinese | 318 | 1,406 | far finer-grained; many tiny asterisms |
| **indian** | **50** | **296** | **nakshatras — a lunar system, not a solar one** |
| arabic_al-sufi | 51 | 903 | carries `transliteration` as well |
| boorong | 29 | 253 | ethnographic, Australian |
| egyptian | 28 | — | |
| inuit | 11 | — | |
| hawaiian_starlines | 13 | 84 | navigational star lines |
| norse / maori | 6 | — | small but vivid |

**Indian is the strongest addition after modern.** It is flagged
`lunar_system: yes` — the 27 nakshatras divide the sky by the Moon's monthly
path rather than grouping bright stars into pictures. That is not a different
set of drawings, it is a different *organising principle*, which makes the point
harder than another set of figures ever could.

Two shape differences that drive real work:

- **Ids are not IAU codes.** Chinese uses `"CON chinese 001"`, so
  `abbreviationFromId` returning `"001"` is fine as a key, but the UI's
  three-letter assumption and the parser test's `/^[A-Z][A-Za-z]{2}$/` are
  Western-specific and must become culture-scoped.
- **Naming is richer, not poorer:** `{english, native, pronounce,
  transliteration}`. `Constellation.latin` is simply wrong outside the Western
  set and should become `name`.

## 3. Season and hemisphere metadata

Computable from positions already in the catalogue, and verified — the maths
below reproduces every constellation I checked:

| | RA | Dec | best (midnight) | alt @40°N | alt @33°S | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Orion | 5.5h | +7° | December | 57° | 50° | both |
| Scorpius | 16.8h | −34° | June | 16° | 89° | both |
| Ursa Major | 10.8h | +55° | March | 75° | 2° | northern |
| Crux | 12.5h | −60° | March | −10° | 63° | southern |
| Cygnus | 20.3h | +40° | July | 90° | 17° | both |

Method: take the centroid of member unit vectors for RA/Dec; a figure transits
at local midnight when the Sun sits 12h away in RA, giving
`dayOfYear ≈ 79 + ((ra − 12) mod 24) / 24 × 365.25`; transit altitude is
`90 − |latitude − dec|`; circumpolar when `|dec| > 90 − |latitude|`.

Emit per figure into `constellations.json`: `raHours`, `decDeg`, `bestMonth`,
`altNorth`, `altSouth`, `hemisphere`, `circumpolarNorth/South`. Phrase it in the
UI as **"best seen at midnight in December"** — visibility spans months either
side, and claiming a single month without that qualifier would be wrong.

## Action Items

- [ ] **Speed up the tour**: retune `FLIGHT_DAMPING`, `FLIGHT_DURATION_MS` and
      the six `holdMs` values; re-run `shoot-tour.ts` to confirm the sequence
      still lands, and update the store test's duration bound.
- [ ] **Fetch the chosen cultures** into `data/raw/skycultures/<id>.json` via
      `sources.ts` / `fetch-athyg.ts`, pinned to v25.3.
- [ ] **Generalise the parser** (`scripts/constellations.ts`): culture-level
      metadata (id, name, region, classification, `lunar_system`), and carry
      `native` / `pronounce` / `transliteration`. Rename `latin` → `name`
      throughout.
- [ ] **Compute visibility** in a new `src/lib/visibility.ts` (centroid, best
      month, transit altitudes, hemisphere, circumpolar) so both the packer and
      the UI share one implementation.
- [ ] **Rework the packer**: force-include the **union** of every culture's HIP
      ids into t0, emit `constellations.<culture>.json` per culture with
      visibility attached, and list them in the manifest. Report t0 growth.
- [ ] **Add culture + visibility state** to `store.ts` and `catalog-loader.ts`:
      a `skyCulture` field with lazy per-culture loading and caching; clear the
      active figure on switch, since ids do not carry across.
- [ ] **Surface it in the UI**: a culture picker in `LayersPanel.tsx`; native
      name and pronunciation in the figure list; season and hemisphere on the
      constellation row and in a detail panel, with a hemisphere preference the
      viewer can set.
- [ ] **Declutter labels** in `ConstellationMembers.tsx` — flagged three times
      and still unfixed. Project to screen space each frame, drop any label whose
      box overlaps one already placed, priority to named stars then to the
      nearest and farthest members.
- [ ] **Add URL state**: hash-encode camera, layers, selection and culture;
      parse on load, replace (not push) on change.

## Validation

- [ ] Unit-test `visibility.ts` against the table above — Orion in December,
      Crux never rising from 40°N, Cygnus overhead in July. These are the cases
      that catch a sign error in the RA-to-month conversion.
- [ ] Extend `catalog-artifact.test.ts` so **every shipped culture** resolves
      entirely into t0 with no dangling indices, and add a non-Western parser
      fixture so the IAU-code assumption cannot creep back.
- [ ] Add store tests for culture switching (clears the active figure) and a URL
      round-trip (encode → parse → identical state).
- [ ] Screenshot the same patch of sky under modern, Chinese and Indian; re-run
      `shoot-tour.ts` and `check:camera` before deploying.

## Open Questions

1. **Final culture list?** Proposed: modern, Chinese, Indian, Arabic (al-Sufi),
   Norse, Inuit, Aztec, Boorong — eight that are visually distinct, well
   populated and geographically spread. Egyptian and Hawaiian are the next two.
2. **Should the tour end on a culture swap?** It is the strongest possible final
   beat, but it fights the goal of making the tour shorter.
3. **Render native script (毕宿, अश्विनी) in the figure list?** Adds real
   character but depends on the viewer's CJK/Devanagari fonts; English is always
   available as a fallback.
