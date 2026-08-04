import { FIELDS_PER_STAR, type Constellation, type DetailTier } from './catalog-format.ts'
import type { Vec3 } from './astro.ts'

export interface Vantage {
  /** Point to orbit, in catalogue coordinates. */
  target: Vec3
  /** Unit direction from the target toward the camera. */
  lookFrom: Vec3
  /** Orbit radius that frames the figure's depth spread. */
  distance: number
  /** Sun-to-figure extent being framed, in parsecs. */
  spanPc: number
}

function memberPositions(constellation: Constellation, t0: DetailTier): Vec3[] {
  return constellation.members.map((index) => {
    const base = index * FIELDS_PER_STAR
    return [t0.attributes[base], t0.attributes[base + 1], t0.attributes[base + 2]] as Vec3
  })
}

function normalise([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z)
  if (length === 0) return [1, 0, 0]
  return [x / length, y / length, z / length]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

/**
 * Picks a viewpoint that makes a constellation's depth spread visible.
 *
 * Seen from the Sun a figure is, by construction, perfectly arranged — that is
 * what makes it a constellation. The interesting vantage is side-on: looking
 * across the line of sight rather than along it, so the range of distances
 * turns into visible separation.
 */
export function constellationVantage(
  constellation: Constellation,
  t0: DetailTier,
): Vantage {
  const positions = memberPositions(constellation, t0)
  if (positions.length === 0) {
    return { target: [0, 0, 0], lookFrom: [1, 0, 0], distance: 100, spanPc: 100 }
  }

  const centroid = positions.reduce<Vec3>(
    (sum, p) => [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]],
    [0, 0, 0],
  )
  const target: Vec3 = [
    centroid[0] / positions.length,
    centroid[1] / positions.length,
    centroid[2] / positions.length,
  ]

  // Sight line from the Sun out to the figure.
  const sightLine = normalise(target)

  // Any direction perpendicular to the sight line works; cross with whichever
  // axis is least parallel to it to stay numerically well conditioned.
  const axis: Vec3 =
    Math.abs(sightLine[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const lookFrom = normalise(cross(sightLine, axis))

  // Frame from the Sun out to the bulk of the figure rather than to its
  // farthest member. Figures like Orion have a lone supergiant an order of
  // magnitude past the rest; framing that outlier shrinks everything else to
  // nothing and the reveal stops being readable.
  const distances = positions.map((p) => Math.hypot(p[0], p[1], p[2])).sort((a, b) => a - b)

  // A high percentile alone is not robust for the handful of members a small
  // figure has — with five stars the 90th percentile interpolates straight into
  // the outlier it was meant to reject. Capping against the median bounds it
  // regardless of member count.
  const span = Math.max(
    Math.min(percentile(distances, 0.9), percentile(distances, 0.5) * 4),
    20,
  )

  return {
    // Look at the midpoint of the Sun-to-figure span so both ends are in frame.
    target: [sightLine[0] * span * 0.5, sightLine[1] * span * 0.5, sightLine[2] * span * 0.5],
    lookFrom,
    distance: span * 1.3,
    spanPc: span,
  }
}

/** Linear-interpolated percentile over a pre-sorted ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = (sorted.length - 1) * p
  const low = Math.floor(index)
  const high = Math.ceil(index)
  if (low === high) return sorted[low]
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low)
}

/** Distance spread across a figure's members, in parsecs. */
export function constellationSpread(constellation: Constellation) {
  return {
    nearestPc: constellation.nearestPc,
    farthestPc: constellation.farthestPc,
    ratio:
      constellation.nearestPc > 0
        ? constellation.farthestPc / constellation.nearestPc
        : Number.POSITIVE_INFINITY,
  }
}
