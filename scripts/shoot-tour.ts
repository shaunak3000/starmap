/**
 * Captures the guided tour as it actually plays.
 *
 * Screenshotting steps individually is misleading: each step's `apply` builds on
 * the last (step 3 assumes step 2 already flew the camera), so the only honest
 * check is to let the whole thing run and photograph it on the way past.
 *
 *   npx tsx scripts/shoot-tour.ts
 *
 * Note that headless WebGL runs at a few frames a second, and the camera damps
 * per frame, so scripted moves finish far later in wall-clock time here than in
 * a real browser. Judge the sequence and the captions, not the pacing.
 */

import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { PROJECT_ROOT } from './sources.ts'

const SHOT_DIR = path.join(PROJECT_ROOT, 'shots')
const URL = process.argv[2] ?? 'http://localhost:5173/?probe=1'

/** Seconds after the tour starts at which to capture. */
const CAPTURE_AT = [3, 10, 22, 34, 48, 62, 74]

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true })

  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('canvas')

  const started = Date.now()
  let previous = 0

  for (const at of CAPTURE_AT) {
    await page.waitForTimeout(Math.max(0, at * 1000 - (Date.now() - started)))

    // The store handle is dev-only, so against a production build fall back to
    // what the page is actually showing. That is the more honest check anyway.
    const state = (await page.evaluate(
      `(() => {
        const caption = document.querySelector('.tour-caption')?.textContent ?? null
        const hud = document.querySelector('.hud')?.textContent ?? null
        const s = window.__starmap ? window.__starmap.getState() : null
        return s
          ? { caption, hud, step: s.tourStep, mode: s.cameraMode,
              dist: Math.round(s.cameraDistancePc), galaxy: s.showGalaxy,
              isolate: s.isolate, dissolve: s.dissolve }
          : { caption, hud }
      })()`,
    )) as Record<string, unknown>

    const file = path.join(SHOT_DIR, `tour-t${String(at).padStart(2, '0')}s.png`)
    await page.screenshot({ path: file })

    const detail =
      state.step === undefined
        ? `  ${state.hud ?? ''}`
        : `  step=${state.step ?? '-'}  mode=${state.mode}  ${state.dist} pc  ` +
          `galaxy=${state.galaxy}  isolate=${state.isolate}  dissolve=${state.dissolve}`

    console.log(`t+${String(at).padStart(2)}s${detail}`)
    console.log(`        "${state.caption ?? '(no caption)'}"`)

    previous = at
  }
  void previous

  await browser.close()
  for (const problem of problems) console.log(`  ${problem}`)
  if (problems.length === 0) console.log('\nno console errors')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
