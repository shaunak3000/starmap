/**
 * Drives real pointer and wheel input at the running app and asserts the camera
 * responded. Screenshots cannot show whether panning and zooming feel right,
 * but they can at least prove the handlers are wired and moving the right axes.
 *
 *   npx tsx scripts/check-camera.ts
 */

import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:5173/?probe=1'

interface Probe {
  x: number
  y: number
  z: number
  distance: number
}

async function main() {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('canvas')

  // Orbit mode is the one with pan and dolly; Earth POV deliberately has neither.
  await page.evaluate(`window.__starmap.getState().set('cameraMode', 'orbit')`)
  await page.waitForTimeout(2500)

  const read = async (): Promise<Probe> =>
    (await page.evaluate(`(() => {
      const c = window.__starmap.getState().__camera
      return { x: c.position.x, y: c.position.y, z: c.position.z,
               distance: c.position.length() }
    })()`)) as Probe

  const settle = () => page.waitForTimeout(1400)

  const before = await read()

  // Wheel out, then in, and check the dolly is exponential and reversible.
  await page.mouse.move(640, 400)
  await page.mouse.wheel(0, 400)
  await settle()
  const zoomedOut = await read()

  await page.mouse.wheel(0, -400)
  await settle()
  const zoomedBack = await read()

  // Right-drag should pan: the camera translates without changing range much.
  await page.mouse.move(640, 400)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(840, 400, { steps: 12 })
  await page.mouse.up({ button: 'right' })
  await settle()
  const panned = await read()

  const check = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures.push(name)
  }

  check(
    'wheel dollies out',
    zoomedOut.distance > before.distance * 1.3,
    `${before.distance.toFixed(1)} -> ${zoomedOut.distance.toFixed(1)} pc`,
  )
  check(
    'wheel returns near the starting range',
    Math.abs(zoomedBack.distance - before.distance) < before.distance * 0.45,
    `${zoomedOut.distance.toFixed(1)} -> ${zoomedBack.distance.toFixed(1)} pc`,
  )

  const panShift = Math.hypot(
    panned.x - zoomedBack.x,
    panned.y - zoomedBack.y,
    panned.z - zoomedBack.z,
  )
  check('right-drag pans the camera', panShift > zoomedBack.distance * 0.05, `moved ${panShift.toFixed(2)} pc`)
  check(
    'panning holds the viewing range',
    Math.abs(panned.distance - zoomedBack.distance) < zoomedBack.distance * 0.9,
    `${zoomedBack.distance.toFixed(1)} -> ${panned.distance.toFixed(1)} pc`,
  )

  await browser.close()

  if (failures.length > 0) {
    console.log(`\n${failures.length} failure(s)`)
    process.exit(1)
  }
  console.log('\ncamera input OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
