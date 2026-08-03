/**
 * Packs the raw AT-HYG catalogue into the binary tiers the app streams.
 *
 *   t0.bin  naked-eye + every named / constellation star   (metadata attached)
 *   t1.bin  down to magnitude 9
 *   t2.bin  the rest, lazy-loaded
 *
 * Run after `npm run data:fetch`.
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import zlib from 'node:zlib'
import {
  absoluteMagnitude,
  apparentMagnitude,
  equatorialToCartesian,
  spectralTypeToBv,
} from '../src/lib/astro.ts'
import {
  type CatalogManifest,
  type Constellation,
  type StarMeta,
  encodeTier,
} from '../src/lib/catalog-format.ts'
import { indexColumns, num, splitCsvRow, str } from './csv.ts'
import { collectConstellationHips, parseStellariumSkyCulture } from './constellations.ts'
import { GrowableFloat32, GrowableUint32 } from './growable.ts'
import { ATTRIBUTION, OUT_DIR, RAW_DIR } from './sources.ts'

/**
 * Everything inside this radius is kept; constellation stars are exempt.
 *
 * 3 kpc is roughly where Gaia DR3 parallaxes stop being defensible for ordinary
 * stars. Past it the catalogue thins from tens of thousands per kiloparsec shell
 * to a few hundred — that is the survey running out of precision, not the Galaxy
 * ending, so anything beyond is modelled rather than plotted.
 */
const MAX_DISTANCE_PC = 3000

/** HYG-lineage catalogues use a huge sentinel distance for "parallax unusable". */
const DISTANCE_SENTINEL_PC = 100000

const T0_MAG_LIMIT = 6.5
const T1_MAG_LIMIT = 9.0

/** Fallback colour when a star has neither a colour index nor a spectral type. */
const DEFAULT_BV = 0.65

const REQUIRED_COLUMNS = [
  'id', 'hip', 'hd', 'bayer', 'flam', 'con', 'proper',
  'ra', 'dec', 'dist', 'x0', 'y0', 'z0', 'mag', 'absmag', 'ci', 'spect',
]

interface Tier {
  name: string
  file: string
  magLimit: number | null
  attributes: GrowableFloat32
  ids: GrowableUint32
  count: number
}

function makeTier(name: string, file: string, magLimit: number | null): Tier {
  return {
    name,
    file,
    magLimit,
    attributes: new GrowableFloat32(1 << 16),
    ids: new GrowableUint32(1 << 14),
    count: 0,
  }
}

async function main() {
  const athygPath = path.join(RAW_DIR, 'athyg_40.csv.gz')
  const skyCulturePath = path.join(RAW_DIR, 'stellarium-modern.json')

  for (const required of [athygPath, skyCulturePath]) {
    if (!fs.existsSync(required)) {
      throw new Error(`missing ${required}. Run: npm run data:fetch`)
    }
  }

  const rawConstellations = parseStellariumSkyCulture(
    fs.readFileSync(skyCulturePath, 'utf8'),
  )
  const constellationHips = collectConstellationHips(rawConstellations)
  console.log(
    `Sky culture: ${rawConstellations.length} constellations referencing ${constellationHips.size} stars`,
  )

  const tiers = [
    makeTier('naked-eye + named', 't0.bin', T0_MAG_LIMIT),
    makeTier('to magnitude 9', 't1.bin', T1_MAG_LIMIT),
    makeTier('faint field', 't2.bin', null),
  ]

  const meta: StarMeta[] = []
  const hipToT0Index = new Map<number, number>()

  const stats = {
    rows: 0,
    kept: 0,
    noDistance: 0,
    beyondRange: 0,
    noMagnitude: 0,
    ciFromSpectralType: 0,
    ciDefaulted: 0,
    beyondRangeKeptForConstellation: 0,
    maxPositionDeviationPc: 0,
  }

  let columns: Record<string, number> | undefined

  const input = readline.createInterface({
    input: fs.createReadStream(athygPath).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  })

  for await (const line of input) {
    if (line === '') continue

    const fields = splitCsvRow(line)

    if (columns === undefined) {
      columns = indexColumns(fields, REQUIRED_COLUMNS)
      continue
    }

    stats.rows++

    const dist = num(fields[columns.dist])
    if (dist === undefined || dist <= 0 || dist >= DISTANCE_SENTINEL_PC) {
      stats.noDistance++
      continue
    }

    const hip = num(fields[columns.hip])
    const isConstellationStar = hip !== undefined && constellationHips.has(hip)

    if (dist > MAX_DISTANCE_PC) {
      if (!isConstellationStar) {
        stats.beyondRange++
        continue
      }
      stats.beyondRangeKeptForConstellation++
    }

    let mag = num(fields[columns.mag])
    let absMag = num(fields[columns.absmag])
    if (mag === undefined && absMag === undefined) {
      stats.noMagnitude++
      continue
    }
    if (absMag === undefined) absMag = absoluteMagnitude(mag!, dist)
    if (mag === undefined) mag = apparentMagnitude(absMag, dist)

    const ra = num(fields[columns.ra])
    const dec = num(fields[columns.dec])
    if (ra === undefined || dec === undefined) {
      stats.noDistance++
      continue
    }

    const spect = str(fields[columns.spect])

    let ci = num(fields[columns.ci])
    if (ci === undefined) {
      ci = spectralTypeToBv(spect)
      if (ci === undefined) {
        ci = DEFAULT_BV
        stats.ciDefaulted++
      } else {
        stats.ciFromSpectralType++
      }
    }
    ci = Math.min(Math.max(ci, -0.4), 2.5)

    const [x, y, z] = equatorialToCartesian(ra, dec, dist)

    // Cross-check our trigonometry against the catalogue's own cartesian columns.
    const x0 = num(fields[columns.x0])
    const y0 = num(fields[columns.y0])
    const z0 = num(fields[columns.z0])
    if (x0 !== undefined && y0 !== undefined && z0 !== undefined) {
      const deviation = Math.hypot(x - x0, y - y0, z - z0)
      if (deviation > stats.maxPositionDeviationPc) {
        stats.maxPositionDeviationPc = deviation
      }
    }

    const proper = str(fields[columns.proper])
    const inT0 = isConstellationStar || proper !== undefined || mag <= T0_MAG_LIMIT
    const tierIndex = inT0 ? 0 : mag <= T1_MAG_LIMIT ? 1 : 2
    const tier = tiers[tierIndex]

    const id = num(fields[columns.id]) ?? 0
    const starIndex = tier.count

    tier.attributes.push(x, y, z, absMag, ci)
    tier.ids.push(id)
    tier.count++
    stats.kept++

    if (tierIndex === 0) {
      const hd = num(fields[columns.hd])
      const bayer = str(fields[columns.bayer])
      const flam = str(fields[columns.flam])
      const con = str(fields[columns.con])

      if (hip !== undefined && !hipToT0Index.has(hip)) {
        hipToT0Index.set(hip, starIndex)
      }

      // Only stars carrying an identifier are worth a metadata row; the rest are
      // anonymous points that the UI describes from geometry alone.
      if (proper || bayer || flam || hip !== undefined || hd !== undefined) {
        meta.push({
          i: starIndex,
          id,
          ...(hip !== undefined ? { hip } : {}),
          ...(hd !== undefined ? { hd } : {}),
          ...(proper ? { proper } : {}),
          ...(bayer ? { bayer } : {}),
          ...(flam ? { flam } : {}),
          ...(con ? { con } : {}),
          ...(spect ? { spect } : {}),
          mag: Number(mag.toFixed(3)),
          dist: Number(dist.toFixed(4)),
        })
      }
    }
  }

  const constellations = buildConstellations(rawConstellations, hipToT0Index, tiers[0])

  fs.mkdirSync(OUT_DIR, { recursive: true })

  for (const tier of tiers) {
    const buffer = encodeTier(tier.attributes.toTypedArray(), tier.ids.toTypedArray())
    fs.writeFileSync(path.join(OUT_DIR, tier.file), Buffer.from(buffer))
  }

  fs.writeFileSync(path.join(OUT_DIR, 't0.meta.json'), JSON.stringify(meta))
  fs.writeFileSync(
    path.join(OUT_DIR, 'constellations.json'),
    JSON.stringify(constellations),
  )

  const manifest: CatalogManifest = {
    generatedAt: new Date().toISOString(),
    maxDistancePc: MAX_DISTANCE_PC,
    sources: ATTRIBUTION,
    tiers: tiers.map((tier) => ({
      name: tier.name,
      file: tier.file,
      count: tier.count,
      magLimit: tier.magLimit,
    })),
    constellationCount: constellations.length,
  }
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

  report(tiers, meta, constellations, stats)
}

function buildConstellations(
  raw: ReturnType<typeof parseStellariumSkyCulture>,
  hipToT0Index: Map<number, number>,
  t0: Tier,
): Constellation[] {
  const positions = t0.attributes.toTypedArray()

  const distanceOf = (index: number) => {
    const base = index * 5
    return Math.hypot(positions[base], positions[base + 1], positions[base + 2])
  }

  return raw
    .map((constellation) => {
      const missingHip: number[] = []
      const lines: { path: number[] }[] = []

      for (const polyline of constellation.lines) {
        // A missing star breaks the chain rather than shortcutting across it,
        // so the figure keeps its true shape wherever data allows.
        let run: number[] = []
        for (const hip of polyline) {
          const index = hipToT0Index.get(hip)
          if (index === undefined) {
            if (!missingHip.includes(hip)) missingHip.push(hip)
            if (run.length >= 2) lines.push({ path: run })
            run = []
          } else {
            run.push(index)
          }
        }
        if (run.length >= 2) lines.push({ path: run })
      }

      const members = [...new Set(lines.flatMap((line) => line.path))]
      const distances = members.map(distanceOf)

      return {
        id: constellation.abbreviation,
        latin: constellation.latin,
        english: constellation.english,
        lines,
        members,
        missingHip,
        nearestPc: distances.length ? Math.min(...distances) : 0,
        farthestPc: distances.length ? Math.max(...distances) : 0,
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

function report(
  tiers: Tier[],
  meta: StarMeta[],
  constellations: Constellation[],
  stats: Record<string, number>,
) {
  const bytes = (file: string) => fs.statSync(path.join(OUT_DIR, file)).size
  const mb = (n: number) => `${(n / 1024 ** 2).toFixed(1)} MB`

  console.log(`\nRead ${stats.rows.toLocaleString()} catalogue rows, kept ${stats.kept.toLocaleString()}`)
  console.log(`  skipped: ${stats.noDistance.toLocaleString()} without usable distance, ${stats.beyondRange.toLocaleString()} beyond ${MAX_DISTANCE_PC} pc, ${stats.noMagnitude.toLocaleString()} without magnitude`)
  console.log(`  colour:  ${stats.ciFromSpectralType.toLocaleString()} inferred from spectral type, ${stats.ciDefaulted.toLocaleString()} defaulted to B-V ${DEFAULT_BV}`)
  console.log(`  kept beyond ${MAX_DISTANCE_PC} pc because they anchor a constellation: ${stats.beyondRangeKeptForConstellation}`)
  console.log(`  max deviation from catalogue x0/y0/z0: ${stats.maxPositionDeviationPc.toExponential(2)} pc`)

  console.log('\nTiers:')
  for (const tier of tiers) {
    console.log(`  ${tier.file.padEnd(8)} ${tier.count.toLocaleString().padStart(10)} stars  ${mb(bytes(tier.file)).padStart(9)}  (${tier.name})`)
  }
  console.log(`  ${'t0.meta'.padEnd(8)} ${meta.length.toLocaleString().padStart(10)} rows   ${mb(bytes('t0.meta.json')).padStart(9)}`)

  const totalMissing = constellations.reduce((sum, c) => sum + c.missingHip.length, 0)
  const drawn = constellations.reduce((sum, c) => sum + c.lines.length, 0)
  console.log(`\nConstellations: ${constellations.length}, ${drawn} polylines, ${totalMissing} unresolved HIP references`)

  const widest = [...constellations].sort((a, b) => b.farthestPc - a.farthestPc).slice(0, 5)
  console.log('  deepest figures (nearest -> farthest member):')
  for (const c of widest) {
    console.log(`    ${c.id} ${c.latin.padEnd(18)} ${c.nearestPc.toFixed(1).padStart(8)} -> ${c.farthestPc.toFixed(1).padStart(8)} pc`)
  }

  if (totalMissing > 0) {
    const worst = [...constellations]
      .filter((c) => c.missingHip.length > 0)
      .sort((a, b) => b.missingHip.length - a.missingHip.length)
      .slice(0, 5)
    console.log('  figures with unresolved stars:')
    for (const c of worst) {
      console.log(`    ${c.id}: ${c.missingHip.length} (${c.missingHip.slice(0, 6).join(', ')})`)
    }
  }
}

main().catch((error) => {
  console.error(`\nbuild failed: ${error.message}`)
  process.exit(1)
})
