/**
 * Screenshots the running app so the scene can be reviewed without a human in
 * the loop. Expects `npm run dev` to already be serving on PORT.
 *
 *   npx tsx scripts/shoot.ts [name] [--url=...] [--wait=ms] [--eval='js']
 *
 * Headless Chromium renders WebGL through SwiftShader, which is slow but pixel
 * accurate enough to judge colour, size falloff and bloom.
 */

import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PROJECT_ROOT } from './sources.ts'

const SHOT_DIR = path.join(PROJECT_ROOT, 'shots')

function arg(name: string, fallback: string): string {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`))
  return match ? match.slice(name.length + 3) : fallback
}

async function main() {
  const name = process.argv[2]?.startsWith('--') ? 'shot' : (process.argv[2] ?? 'shot')
  const url = arg('url', 'http://localhost:5173/')
  const waitMs = Number(arg('wait', '6000'))
  const script = arg('eval', '')
  const width = Number(arg('width', '1440'))
  const height = Number(arg('height', '900'))

  fs.mkdirSync(SHOT_DIR, { recursive: true })

  const browser = await chromium.launch({
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--disable-lcd-text',
    ],
  })

  const page = await browser.newPage({ viewport: { width, height } })

  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('canvas', { timeout: 30000 })

  if (script) {
    // Wrap in an IIFE so multi-statement scripts are a valid expression, and
    // surface throws instead of quietly producing a screenshot of nothing.
    const outcome = (await page.evaluate(
      `(() => { try { ${script}\n; return { ok: true } } catch (e) { return { ok: false, error: String(e) } } })()`,
    )) as { ok: boolean; error?: string }

    if (!outcome?.ok) {
      throw new Error(`--eval failed: ${outcome?.error ?? 'unknown error'}`)
    }
  }

  await page.waitForTimeout(waitMs)

  const file = path.join(SHOT_DIR, `${name}.png`)
  await page.screenshot({ path: file })

  // A star field that renders as pure black almost always means a silent shader
  // or data failure, which a passing screenshot would otherwise hide. Passed as
  // a string so this browser-context code stays out of the Node type program.
  // Requires ?probe=1, which turns on preserveDrawingBuffer.
  const luminance = (await page.evaluate(`(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return null
    const probe = document.createElement('canvas')
    probe.width = 160
    probe.height = 100
    const ctx = probe.getContext('2d')
    ctx.drawImage(canvas, 0, 0, probe.width, probe.height)
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data
    let sum = 0
    let bright = 0
    for (let i = 0; i < data.length; i += 4) {
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3
      sum += v
      if (v > 40) bright++
    }
    return { mean: sum / (data.length / 4), brightPixels: bright }
  })()`)) as { mean: number; brightPixels: number } | null

  await browser.close()

  console.log(`saved ${file}`)
  if (luminance) {
    console.log(`  mean luminance ${luminance.mean.toFixed(2)}, bright pixels ${luminance.brightPixels}`)
  }
  for (const problem of problems) console.log(`  ${problem}`)
  if (problems.length === 0) console.log('  no console errors')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
