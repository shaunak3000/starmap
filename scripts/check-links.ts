/**
 * Proves a shared link actually restores the view it captured.
 *
 * The unit tests cover encode/decode in isolation; this covers the part that
 * can still be wrong afterwards — that the app writes a hash describing what is
 * on screen, and that opening that hash in a fresh browser reproduces it.
 *
 *   npx tsx scripts/check-links.ts [url]
 */

import { chromium, type Page } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:5173/?probe=1'

interface View {
  culture: string
  figure: string | null
  frame: string
  grid: boolean
  galaxy: boolean
  dissolve: number
  distance: number
  yaw: number | null
  pitch: number | null
}

const readView = `(() => {
  const s = window.__starmap.getState()
  return {
    culture: s.skyCulture,
    figure: s.activeConstellation,
    frame: s.frame,
    grid: s.showGrid,
    galaxy: s.showGalaxy,
    dissolve: s.dissolve,
    distance: Math.round(s.cameraDistancePc * 10) / 10,
    yaw: s.cameraPose ? Math.round(s.cameraPose.yaw * 1000) / 1000 : null,
    pitch: s.cameraPose ? Math.round(s.cameraPose.pitch * 1000) / 1000 : null,
  }
})()`

async function settle(page: Page, ms = 4000) {
  await page.waitForTimeout(ms)
}

async function main() {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const failures: string[] = []

  const check = (name: string, ok: boolean, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures.push(name)
  }

  // Build a distinctive view, then read the link the app produced.
  const author = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  author.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))

  await author.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
  await author.waitForSelector('canvas')
  await author.evaluate(`(() => {
    const s = window.__starmap.getState()
    s.stopTour()
    s.set('showGrid', true)
    s.set('frame', 'galactic')
    s.revealConstellation('CMa')
  })()`)
  await settle(author, 6000)

  const authored = (await author.evaluate(readView)) as View
  const hash = await author.evaluate('window.location.hash')

  check('the app writes a hash for a non-default view', typeof hash === 'string' && hash.length > 1, String(hash))
  check('the hash names the figure', String(hash).includes('fig=CMa'))
  check('the hash carries a camera', String(hash).includes('cam='))
  await author.close()

  // Open that link cold and compare.
  const visitor = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  visitor.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))

  const base = URL.split('#')[0]
  await visitor.goto(`${base}${hash}`, { waitUntil: 'networkidle', timeout: 60000 })
  await visitor.waitForSelector('canvas')
  await settle(visitor, 6000)

  const restored = (await visitor.evaluate(readView)) as View

  check('restores the figure', restored.figure === authored.figure, `${restored.figure}`)
  check('restores the frame', restored.frame === authored.frame, restored.frame)
  check('restores the grid layer', restored.grid === authored.grid, String(restored.grid))
  check(
    'restores the camera range',
    Math.abs(restored.distance - authored.distance) < Math.max(authored.distance * 0.02, 0.5),
    `${authored.distance} -> ${restored.distance} pc`,
  )
  check(
    'restores the heading',
    restored.yaw !== null && authored.yaw !== null && Math.abs(restored.yaw - authored.yaw) < 0.01,
    `${authored.yaw} -> ${restored.yaw}`,
  )
  check('a shared link suppresses the intro tour', await visitor.evaluate('window.__starmap.getState().tourStep === null'))

  // A culture swap has to survive too, since figure ids are culture-scoped.
  await visitor.evaluate(`window.__starmap.getState().setSkyCulture('indian')`)
  await settle(visitor, 3000)
  const cultureHash = String(await visitor.evaluate('window.location.hash'))
  check('the hash records a culture swap', cultureHash.includes('cul=indian'), cultureHash)
  await visitor.close()

  // And a bare URL must still mean the default view.
  const plain = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  await plain.goto(base, { waitUntil: 'networkidle', timeout: 60000 })
  await plain.waitForSelector('canvas')
  await settle(plain, 3000)
  const fresh = (await plain.evaluate(readView)) as View
  check(
    'a bare URL is still the default view',
    fresh.culture === 'modern' && fresh.grid === false && fresh.galaxy === false,
    `${fresh.culture}, grid=${fresh.grid}`,
  )
  await plain.close()

  await browser.close()

  if (failures.length > 0) {
    console.log(`\n${failures.length} failure(s)`)
    process.exit(1)
  }
  console.log('\nshared links OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
