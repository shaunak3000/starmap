/**
 * Drives real pointer and touch input to check the sidebar switch.
 *
 *   npx tsx scripts/check-panels.ts [url]
 *
 * Screenshots cannot show any of this: what matters is that the panels stay put
 * unless asked to go, that a finger can bring them back with no pointer to hover
 * with, and that the choice survives a reload.
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

/** Left edge of the HUD, which should reclaim the space a hidden panel leaves. */
const HUD_LEFT = `(() => {
  const el = document.querySelector('.hud')
  return el ? Math.round(el.getBoundingClientRect().left) : -1
})()`

async function main() {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  // hasTouch so the handle can be tapped the way a phone would tap it.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true })

  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))

  const check = (name: string, ok: boolean, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures.push(name)
  }

  const visible = async (side: 'left' | 'right') =>
    (await page.evaluate(onScreenExpression(side))) as number

  const settle = (ms = 600) => page.waitForTimeout(ms)

  /**
   * Polls until a measurement satisfies the predicate.
   *
   * CSS transitions only advance on a rendered frame, and under software WebGL
   * this page renders them slowly — a fixed sleep measures whatever the
   * transition happened to reach, which is a property of this machine rather
   * than of the app.
   */
  const settles = async (read: () => Promise<number>, ok: (value: number) => boolean) => {
    const deadline = Date.now() + 5000
    let value = await read()
    while (!ok(value) && Date.now() < deadline) {
      await page.waitForTimeout(100)
      value = await read()
    }
    return value
  }

  const load = async () => {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForSelector('canvas')
    // The store handle is dev-only. Against production, dismiss the intro the
    // way a visitor would instead.
    const hasStore = (await page.evaluate(`typeof window.__starmap`)) === 'function'
    if (hasStore) await page.evaluate(`window.__starmap.getState().stopTour()`)
    else await page.keyboard.press('Escape')
    await settle(1200)
  }

  await load()

  check(
    'both panels start visible',
    (await visible('left')) > 100 && (await visible('right')) > 100,
    `left ${await visible('left')}px, right ${await visible('right')}px`,
  )

  const hudDocked = (await page.evaluate(HUD_LEFT)) as number

  // Nothing about moving the pointer should move the chrome.
  await page.mouse.move(2, 400)
  await settle()
  check('reaching for the edge changes nothing', (await visible('left')) > 100)
  await page.mouse.move(640, 400)
  await settle()

  const toggle = page.locator('.sidebar-toggle')
  check('the switch sits in the top bar', await toggle.isVisible())
  check('it reads as a switch', (await toggle.getAttribute('aria-checked')) === 'false')

  await toggle.click()
  const leftGone = await settles(() => visible('left'), (v) => v <= 0)
  const rightGone = await settles(() => visible('right'), (v) => v <= 0)
  check(
    'the switch clears both panels',
    leftGone <= 0 && rightGone <= 0,
    `left ${leftGone}px, right ${rightGone}px`,
  )
  check('the switch shows its state', (await toggle.getAttribute('aria-checked')) === 'true')
  check('the switch itself stays reachable', await toggle.isVisible())
  check(
    'both edges show a handle',
    (await page.locator('.edge-handle-left').isVisible()) &&
      (await page.locator('.edge-handle-right').isVisible()),
  )

  const hudCleared = await settles(
    () => page.evaluate(HUD_LEFT) as Promise<number>,
    (v) => v < hudDocked - 100,
  )
  check(
    'the HUD reclaims the space',
    hudCleared < hudDocked - 100,
    `${hudDocked}px docked, ${hudCleared}px cleared`,
  )

  // They must stay gone: no pointer movement brings them back on its own.
  await page.mouse.move(2, 400)
  await settle(900)
  check('hovering the edge does not bring them back', (await visible('left')) <= 0)
  await page.mouse.move(640, 400)

  // A finger has no hover, so the handle has to be a real target.
  const handle = page.locator('.edge-handle-left')
  const box = await handle.boundingBox()
  check('the handle is a finger-sized target', (box?.width ?? 0) >= 40, `${box?.width ?? 0}px wide`)
  if (box) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    const back = await settles(() => visible('left'), (v) => v > 100)
    check('tapping the handle brings them back', back > 100, `${back}px on screen`)
  } else {
    check('tapping the handle brings them back', false, 'no handle found')
  }

  // The choice is a preference, so it outlives the page.
  await toggle.click()
  await settle()
  await load()
  check('the choice survives a reload', (await visible('left')) <= 0)
  check(
    'the handle is there to undo it',
    await page.locator('.edge-handle-left').isVisible(),
  )

  /*
   * Phone width. The right column is gone here, so its handle would promise
   * something that cannot appear, and the top bar has to clear the one column
   * that remains instead of centring on top of it.
   */
  await page.setViewportSize({ width: 390, height: 844 })
  await settle(900)
  await page.locator('.edge-handle-left').tap()
  await settles(() => visible('left'), (v) => v > 100)

  const overlap = (await page.evaluate(`(() => {
    const bar = document.querySelector('.top-bar').getBoundingClientRect()
    const panel = document.querySelector('.panel-left').getBoundingClientRect()
    return Math.round(panel.right - bar.left)
  })()`)) as number
  check('on a phone the top bar clears the panel', overlap <= 0, `${overlap}px of overlap`)
  check('the switch is still reachable', await page.locator('.sidebar-toggle').isVisible())

  await page.locator('.sidebar-toggle').tap()
  await settles(() => visible('left'), (v) => v <= 0)
  check('tapping it clears the panel', (await visible('left')) <= 0)
  check(
    'no handle for the column a phone does not have',
    !(await page.locator('.edge-handle-right').isVisible()),
  )

  await browser.close()

  if (failures.length > 0) {
    console.log(`\n${failures.length} failure(s)`)
    process.exit(1)
  }
  console.log('\nsidebar switch OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
