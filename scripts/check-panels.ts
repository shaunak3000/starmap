/**
 * Drives real pointer movement to check the panels hide and reveal.
 *
 *   npx tsx scripts/check-panels.ts [url]
 *
 * Screenshots cannot show hover behaviour, and the failure modes here are all
 * about timing and geometry: a panel that never comes back, one that never goes
 * away, or one that snatches itself away mid-drag.
 */

import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:5173/?probe=1'

/**
 * How much of a panel is on screen, in CSS pixels.
 *
 * The side is baked into the expression rather than passed as an argument:
 * `page.evaluate` given a string evaluates it as an expression and silently
 * ignores any arguments, which returns undefined for every probe.
 */
function onScreenExpression(side: 'left' | 'right'): string {
  const selector = side === 'left' ? '.panel-left' : '.panel-right'
  const measure =
    side === 'left' ? 'Math.round(rect.right)' : 'Math.round(window.innerWidth - rect.left)'

  return `(() => {
    const el = document.querySelector('${selector}')
    if (!el) return -1
    const rect = el.getBoundingClientRect()
    return ${measure}
  })()`
}

async function main() {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))

  const check = (name: string, ok: boolean, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures.push(name)
  }

  const visible = async (side: 'left' | 'right') =>
    (await page.evaluate(onScreenExpression(side))) as number

  const settle = (ms = 700) => page.waitForTimeout(ms)

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('canvas')
  await page.evaluate(`window.__starmap.getState().stopTour()`)
  await settle(900)

  // Park the pointer in the middle so neither edge is being asked for.
  await page.mouse.move(640, 400)
  await settle()

  check('both panels start hidden', (await visible('left')) <= 0 && (await visible('right')) <= 0,
    `left ${await visible('left')}px, right ${await visible('right')}px`)

  check('an edge handle marks where they went', await page.locator('.edge-handle-left').isVisible())

  // Reach for the left edge.
  await page.mouse.move(4, 400)
  await settle()
  const leftOut = await visible('left')
  check('the left panel returns at the edge', leftOut > 100, `${leftOut}px on screen`)
  check('the right panel stays away', (await visible('right')) <= 0)

  // Moving onto the panel itself must keep it out.
  await page.mouse.move(120, 300)
  await settle()
  check('it stays out while the pointer is on it', (await visible('left')) > 100)

  // And away again.
  await page.mouse.move(640, 400)
  await settle(900)
  check('it slides away once the pointer leaves', (await visible('left')) <= 0)

  // The right edge is independent.
  await page.mouse.move(1276, 400)
  await settle()
  check('the right panel returns at its own edge', (await visible('right')) > 100)
  check('the left panel is unaffected', (await visible('left')) <= 0)

  await page.mouse.move(640, 400)
  await settle(900)

  /*
   * A slider drag that strays off the panel must not snatch it away: pointer
   * capture keeps events targeted at the control, which the reveal treats as
   * still being inside.
   */
  await page.mouse.move(4, 400)
  await settle()
  const slider = page.locator('.panel-left input[type="range"]').first()
  const box = await slider.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(700, box.y + box.height / 2, { steps: 10 })
    await settle(600)
    check('a drag off the panel does not close it', (await visible('left')) > 100)
    await page.mouse.up()
  } else {
    check('a drag off the panel does not close it', false, 'no slider found')
  }

  // Turning the preference off pins them open.
  await page.evaluate(`window.__starmap.getState().set('autoHidePanels', false)`)
  await page.mouse.move(640, 400)
  await settle()
  check(
    'switching auto-hide off pins both open',
    (await visible('left')) > 100 && (await visible('right')) > 100,
  )

  await browser.close()

  if (failures.length > 0) {
    console.log(`\n${failures.length} failure(s)`)
    process.exit(1)
  }
  console.log('\npanel reveal OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
