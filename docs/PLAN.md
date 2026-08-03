# starmap — build plan

3D visualization of the Sun's neighborhood: a 1000 pc cube of ~1.5M stars from AT-HYG v3, rendered as a GPU point cloud you can fly through. The thesis feature: constellations are line-of-sight illusions — the app makes their dissolution, and the huge depth spread of their member stars, viscerally obvious.

## Approach

Static single-page app, no backend. An offline pipeline packs the catalog into binary buffers served as static assets; the app streams them into a custom-shader point cloud. Constellation geometry, labels, and UI are thin layers on top.

**Stack:** Vite + React + TypeScript + react-three-fiber + drei + zustand + @react-three/postprocessing. Vitest for tests, tsx for pipeline scripts.
(Vite over Next.js: no routes, no SSR, no backend — a Next app would be scaffolding overhead for a single WebGL canvas.)

## Decisions (2026-08-03)

- **Catalog:** AT-HYG v3 (latest v3.x) from `codeberg.org/astronexus/athyg`. Gaia DR3 distances + Hipparcos bright stars already merged — solves Gaia's bright-star gap (Gaia astrometry fails below G≈3; Sirius/Vega/Betelgeuse etc. come from Hipparcos).
- **Extent:** bulk field cut at heliocentric distance ≤ 1000 pc. **Exception: every star referenced by a constellation line is kept regardless of distance** (some, e.g. Deneb ~800 pc, Orion OB stars, sit near or past the cut).
- **Constellation lines:** Stellarium's modern sky culture `constellationship.fab` — segments as pairs of HIP ids; AT-HYG carries `hip`, so joining is a lookup. IAU boundaries: out of scope (2D-sky concept, B1875 coords, low value in 3D).
- **Units/frame:** 1 world unit = 1 pc, heliocentric equatorial J2000 (compute xyz from ra/dec/dist in the pipeline; don't trust catalog xyz columns). Float32 is fine — worst-case resolution at 1000 pc ≈ 12 AU. Galactic-frame view = single rotation matrix applied at render time.
- **Attribution:** AT-HYG is CC BY-SA; Stellarium data is GPL. Credit both in the UI footer/README.

## Data pipeline (`scripts/`)

- Download AT-HYG v3 gzipped CSVs, cache in `data/raw/` (gitignored).
- Filter: has real distance (`dist_src` not empty/fallback), dist ≤ 1000 pc, plus all constellation-line HIP stars unconditionally.
- Pack per-star record into little-endian Float32: `x, y, z, absmag, ci` (20 B/star). ~1.5M stars ≈ 30 MB raw, less over the wire with compression.
- Three LOD tiers, separate files:
  - **T0** mag ≤ 6.5 (~9k, naked-eye set — includes all constellation/named stars) + JSON sidecar: proper name, Bayer/Flamsteed, HIP, spectral class, constellation.
  - **T1** mag ≤ 9 (~120k).
  - **T2** remainder (lazy-loaded).
- Emit `constellations.json`: parsed fab → per-constellation list of segments as indices into T0.
- Emit search index (name/Bayer/HIP → T0 index).

## Rendering

- Raw `BufferGeometry` + custom `ShaderMaterial` points, additive blending, soft radial-falloff sprite.
- Color from color index (B−V → blackbody RGB lookup table).
- Two sizing modes:
  - **True apparent** (default): brightness computed from absmag + distance-to-camera — stars physically brighten as you approach. This is the "extremely good" look.
  - **Map**: size ∝ absmag, distance-independent — readable overview mode.
- Bloom pass; exposure slider; optional diffraction spikes on the brightest N stars.
- Faint galactic-plane grid + Sun marker; scale bar that adapts to zoom (pc/ly toggle).

## Camera & navigation

- Three modes: **Orbit** (around Sun or selected star), **Fly** (WASD + mouse), **Earth POV** (locked at origin, pan/tilt + FOV zoom — planetarium mode).
- Log-scale dolly: usable from 0.1 pc to full-cube overview; dynamic near/far.
- Animated "go to star" transitions with easing; smooth mode handoffs (no camera snaps).

## Constellation dissolution (showcase)

- Earth POV: figures render canonically, matching the real sky.
- Select a constellation → **depth reveal**: members projected onto a fixed-radius celestial sphere (where the figure looks perfect), then each star animates along its sight-line out to its true distance. The figure shatters in depth. Reverse to reassemble.
- While revealed: per-star distance labels + a spread readout ("Orion: nearest member X pc, farthest Y pc").
- Free-camera orbit of a true-3D constellation shows the figure skewing into nonsense — no special code needed, just make the lines follow true positions outside Earth POV.

## Action items

[ ] M0 — Scaffold: Vite + React + TS app, deps, lint/format, repo hygiene (`data/raw/` gitignored).
[ ] M1 — Pipeline: download/filter/pack scripts, all tier files + JSON sidecars generated; unit tests for coordinate conversion and fab parsing.
[ ] M2 — Star field: T0+T1 point cloud with shader (color, both sizing modes), bloom, grid, scale bar.
[ ] M3 — Camera: three modes, log dolly, animated transitions.
[ ] M4 — Constellations: fab lines in Earth POV + true-3D lines in free camera; dissolution animation with distance labels.
[ ] M5 — UI: search, hover/click picking (kd-tree over T0/T1), star info panel, layer toggles, settings.
[ ] M6 — Performance & polish: T2 lazy streaming, 60 fps with full set, exposure/quality settings, attribution, README with screenshots.
[ ] Validate: pipeline tests green (Sirius at 2.64 pc with correct xyz; 88 constellations parsed; tier counts sane); Earth-POV Orion visually matches a reference chart; frame-rate budget met.

Commit locally per milestone. No push unless asked.

## Open questions (non-blocking)

- Portfolio: build the repo public-ready from day 1 (README, screenshots, live deploy) as a github-portfolio candidate?
- Stretch for later: proper-motion time scrubber (AT-HYG has velocities) — watch constellations deform over ±100k years. Deferred, not planned.
