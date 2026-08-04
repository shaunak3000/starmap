# starmap

A 3D map of every catalogued star within 3,000 parsecs of the Sun, set inside a
modelled Milky Way, built to make one thing obvious: **constellations are an
accident of where we happen to stand.**

From Earth, Orion is a hunter. Fly a few hundred light years sideways and it is
nothing at all — its stars turn out to be scattered from 26 to 1,977 light
years away, with no relationship to each other beyond sharing a line of sight.

![Orion, revealed side-on, with its members at true distances](docs/images/reveal.png)

## What it does

- **2.5M stars** from AT-HYG v4 (Gaia DR3 astrometry, with Hipparcos filling the
  bright end Gaia saturates on), rendered as a GPU point cloud.
- **All 88 IAU constellations**, joined to the catalogue by HIP number, drawn at
  their stars' true 3D positions.
- **Three viewpoints.** Earth POV is a planetarium locked to the Sun. Orbit
  circles any star or figure. Fly is free movement through the volume.
- **A depth slider** that collapses every star onto a single shell — the sky the
  constellations implicitly assume — and expands it back to reality.
- **A modelled Milky Way** for galactic context, with our 3 kpc bubble of real
  data drawn to scale inside it.
- **An adaptive XYZ grid** that resnaps its spacing from parsecs to kiloparsecs
  as you zoom, and an isolate mode that strips the view to one figure.
- **Star inspection**: click any naked-eye or named star for distance,
  magnitudes, temperature and spectral class.

### Where we actually are

![The modelled Milky Way with the Sun on the Local Arm](docs/images/galaxy.png)

The Sun sits 8.15 kpc from the Galactic Centre, on the Local Arm, with Perseus
outside us and Sagittarius–Carina within. The small ringed circle is the edge of
the real catalogue — everything beyond it is model, and the app says so.

### One figure, alone

![Canis Major isolated, spanning 8.6 to 5,000 light years](docs/images/isolate.png)

Isolate mode drops everything except the selection. Canis Major runs from Sirius
at 8.6 light years to a member 5,000 light years out: **583× deep**, and utterly
meaningless as a shape from anywhere but here.

### The sky as we see it

Earth POV reproduces the real sky. Orion here matches any star chart —
Betelgeuse orange at the shoulder, the belt, Rigel at the foot.

![Orion from Earth](docs/images/earth.png)

### The sky the constellations assume

Pull the depth slider to zero and every star collapses onto one shell. Seen
from the Sun this is *indistinguishable* from the real sky — which is precisely
why the constellations survived for millennia. Seen from outside, it is a
hollow ball with us at the centre.

![Every star collapsed onto a celestial sphere](docs/images/sphere.png)

## Running it

```bash
npm install
npm run data     # downloads ~190 MB, packs the binary tiers (one time)
npm run dev
```

`npm run data` fetches AT-HYG and the Stellarium sky culture into `data/raw/`,
then writes binary tiers into `public/catalog/`. Both directories are
gitignored and fully reproducible.

```bash
npm test         # unit tests
npm run build    # production bundle
```

## How it is put together

**Data pipeline** (`scripts/`) — streams 2.5M catalogue rows, keeps the 1.9M
with usable distances inside 1000 pc, and packs them into three tiers by
magnitude so the app can show something immediately and stream the rest:

| tier | stars | contents |
| --- | --- | --- |
| `t0.bin` | 8,292 | naked-eye and named, with metadata |
| `t1.bin` | 111,696 | down to magnitude 9 |
| `t2.bin` | 2,378,331 | the faint field, loaded on demand |

Positions are recomputed from RA/Dec/distance rather than trusting the
catalogue's own cartesian columns; the two agree to 1.3e-4 pc across all 2.5M
stars, which is the pipeline's main correctness check.

Stars anchoring a constellation are kept even when they fall outside 3,000 pc —
otherwise Orion loses a shoulder.

**Why the cut is at 3 kpc.** It is where Gaia's parallaxes stop being
defensible for ordinary stars. The catalogue's own distance histogram shows the
cliff:

| shell | stars |
| --- | --- |
| 0 – 1,000 pc | 1,885,860 |
| 1,000 – 2,000 pc | 515,921 |
| 2,000 – 3,000 pc | 96,537 |
| 3,000 – 5,000 pc | 28,557 |
| 8,000 – 10,000 pc | 631 |

That collapse is the survey running out of precision, not the Galaxy ending. At
the Galactic Centre's distance the catalogue holds a few hundred stars against a
few hundred billion real ones — which is exactly why galactic structure has to
be modelled rather than plotted.

**Galaxy model** (`src/lib/galaxy.ts`) — the spiral arms are not invented. They
are the log-periodic fit of Reid et al. (2019), derived from VLBI trigonometric
parallaxes of ~200 high-mass star-forming regions, evaluated as
`ln(R/R_kink) = -(β - β_kink) tan ψ` with the paper's per-arm pitch angles and
kinks. The disk haze, bar and radius rings are schematic. The whole layer is
styled as cold thin lines so it never reads as catalogue data.

**Rendering** (`src/scene/`) — one interleaved GPU buffer per tier, five floats
per star. Apparent-magnitude mode computes brightness per-vertex from the
camera's actual distance, so stars genuinely brighten as you approach. Sub-pixel
stars shed their surplus area into brightness instead of clamping to a uniform
speck, which is what keeps the faint majority from becoming grey haze.

**Camera** (`src/scene/CameraRig.tsx`) — all three modes are one
parameterisation, `position = target − dir(yaw, pitch) × distance`. Earth POV is
distance 0 at the Sun; fly is distance 0 with a movable target. Because the
modes differ only in which inputs are live, switching between them is
algebraically continuous. Dolly and travel interpolate in log space so one
wheel notch covers the same *ratio* of distance at 0.1 pc as at 30 kpc, and the
dolly is exactly reversible. Wheeling zooms toward the cursor rather than the
orbit centre; right- or shift-drag pans; Top / Edge-on / Reset jump to canonical
angles relative to whichever reference frame is active.

Rotation follows the universal convention that whatever you grab tracks your
mouse. The arithmetic differs by mode — orbit swings the camera *around* a
target, so moving it right pushes the scene left, while Earth POV pivots in
place and pulls the scene right — which is exactly the kind of sign that is easy
to get backwards in one mode and not notice.

`npm run check:camera` drives real pointer and wheel events at the running app
and asserts what the viewer sees move, since screenshots cannot show whether
navigation works. Orbit is checked on the camera's own displacement rather than
a marker: orbiting sweeps a point at target depth sideways whichever way you
drag, so a marker test passes just as happily with the sign inverted.

## Caveats worth knowing

- **Supergiant distances are soft.** Gaia's parallaxes degrade for the most
  luminous stars, which are exactly the ones anchoring famous figures. HIP 54463
  in Carina is catalogued here at 4,489 pc against a literature range of roughly
  1.5–2.9 kpc. The app shows what AT-HYG says rather than second-guessing it.
- **The catalogue is magnitude-limited.** At 3,000 pc only intrinsically bright
  stars appear, so the outer volume is genuinely sparser than reality.
- **The Galaxy layer is a model, not data.** Arm geometry comes from a published
  fit; the disk haze is a synthetic exponential disk standing in for a
  population the catalogue cannot see. Nothing in that layer is a measurement of
  an individual star.
- **Constellation figures are one culture's.** These are Stellarium's modern
  Western set. They are a convention, not data — which is the point.

## Sources

- [AT-HYG v4](https://codeberg.org/astronexus/athyg) — Astronomy Nexus, CC BY-SA.
  Merges Gaia DR3, Hipparcos, Tycho-2, Yale Bright Star and Gliese.
- [ESA Gaia DR3](https://www.cosmos.esa.int/gaia) — CC BY-SA 3.0 IGO.
- [Stellarium](https://github.com/Stellarium/stellarium) modern sky culture
  (pinned to v25.3) for the constellation figures.
- Reid et al. (2019), *Trigonometric Parallaxes of High-mass Star-forming
  Regions: Our View of the Milky Way*, ApJ 885, 131
  ([arXiv:1910.03357](https://arxiv.org/abs/1910.03357)) — spiral arm fit and
  R₀ = 8.15 kpc.
