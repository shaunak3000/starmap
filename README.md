# starmap

A 3D map of every catalogued star within 1000 parsecs of the Sun, built to make
one thing obvious: **constellations are an accident of where we happen to
stand.**

From Earth, Orion is a hunter. Fly a few hundred light years sideways and it is
nothing at all — its stars turn out to be scattered from 26 to 1,977 light
years away, with no relationship to each other beyond sharing a line of sight.

![Orion, revealed side-on, with its members at true distances](docs/images/reveal.png)

## What it does

- **1.9M stars** from AT-HYG v4 (Gaia DR3 astrometry, with Hipparcos filling the
  bright end Gaia saturates on), rendered as a GPU point cloud.
- **All 88 IAU constellations**, joined to the catalogue by HIP number, drawn at
  their stars' true 3D positions.
- **Three viewpoints.** Earth POV is a planetarium locked to the Sun. Orbit
  circles any star or figure. Fly is free movement through the volume.
- **A depth slider** that collapses every star onto a single shell — the sky the
  constellations implicitly assume — and expands it back to reality.
- **Star inspection**: click any naked-eye or named star for distance,
  magnitudes, temperature and spectral class.

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
| `t0.bin` | 8,130 | naked-eye and named, with metadata |
| `t1.bin` | 107,812 | down to magnitude 9 |
| `t2.bin` | 1,769,926 | the faint field, loaded on demand |

Positions are recomputed from RA/Dec/distance rather than trusting the
catalogue's own cartesian columns; the two agree to 1.3e-4 pc across all 1.9M
stars, which is the pipeline's main correctness check.

Stars anchoring a constellation are kept even when they fall outside 1000 pc —
otherwise Orion loses a shoulder.

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
wheel notch covers the same *ratio* of distance at 0.1 pc as at 3000 pc.

## Caveats worth knowing

- **Supergiant distances are soft.** Gaia's parallaxes degrade for the most
  luminous stars, which are exactly the ones anchoring famous figures. HIP 54463
  in Carina is catalogued here at 4,489 pc against a literature range of roughly
  1.5–2.9 kpc. The app shows what AT-HYG says rather than second-guessing it.
- **The catalogue is magnitude-limited.** At 1000 pc only intrinsically bright
  stars appear, so the outer volume is genuinely sparser than reality.
- **Constellation figures are one culture's.** These are Stellarium's modern
  Western set. They are a convention, not data — which is the point.

## Sources

- [AT-HYG v4](https://codeberg.org/astronexus/athyg) — Astronomy Nexus, CC BY-SA.
  Merges Gaia DR3, Hipparcos, Tycho-2, Yale Bright Star and Gliese.
- [ESA Gaia DR3](https://www.cosmos.esa.int/gaia) — CC BY-SA 3.0 IGO.
- [Stellarium](https://github.com/Stellarium/stellarium) modern sky culture
  (pinned to v25.3) for the constellation figures.
