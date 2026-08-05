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

  /**
   * Screen position of a fixed world point. Rotation is only "correct" in terms
   * of what the viewer sees move, so that is what gets asserted — checking that
   * yaw merely changed would pass just as happily with the sign inverted.
   */
  const project = async (point: [number, number, number]) =>
    (await page.evaluate(`(() => {
      const THREE = window.__three
      const c = window.__starmap.getState().__camera
      const v = new THREE.Vector3(${point[0]}, ${point[1]}, ${point[2]}).project(c)
      return { x: v.x, y: v.y }
    })()`)) as { x: number; y: number }

  /** Drags across the canvas and reports how a fixed point moved on screen. */
  const dragAndTrack = async (
    point: [number, number, number],
    from: [number, number],
    to: [number, number],
  ) => {
    const before = await project(point)
    await page.mouse.move(from[0], from[1])
    await page.mouse.down({ button: 'left' })
    await page.mouse.move(to[0], to[1], { steps: 15 })
    await page.mouse.up({ button: 'left' })
    await settle()
    const after = await project(point)
    return { dx: after.x - before.x, dy: after.y - before.y }
  }

  await page.evaluate(`window.__starmap.getState().focusOn([0, 0, 0], 90)`)
  await page.waitForTimeout(2600)

  /**
   * A world point placed in front of the camera and off to one side. Derived
   * from the live camera rather than hand-picked: a point on the view axis
   * barely moves under yaw, which silently makes the test meaningless.
   */
  const markerNear = async (): Promise<[number, number, number]> => {
    const p = (await page.evaluate(`(() => {
      const THREE = window.__three
      const c = window.__starmap.getState().__camera
      const fwd = new THREE.Vector3(); c.getWorldDirection(fwd)
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0)).normalize()
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize()
      const d = Math.max(c.position.length(), 10)
      const v = c.position.clone()
        .addScaledVector(fwd, d)
        .addScaledVector(right, d * 0.25)
        .addScaledVector(up, d * 0.25)
      return { x: v.x, y: v.y, z: v.z }
    })()`)) as { x: number; y: number; z: number }
    return [p.x, p.y, p.z]
  }

  const marker = await markerNear()

  void marker

  /**
   * Orbit is measured on the camera itself, not on a marker. Orbiting swings
   * the camera around a fixed target, so a point at target depth sweeps sideways
   * whichever way you drag — it cannot tell the two apart. The convention that
   * *can* be stated unambiguously, and the one three.js OrbitControls uses, is
   * that dragging right carries the camera around to its own left.
   */
  const dragAndTrackCamera = async (
    from: [number, number],
    to: [number, number],
  ): Promise<{ alongRight: number; alongUp: number }> => {
    const basis = (await page.evaluate(`(() => {
      const THREE = window.__three
      const c = window.__starmap.getState().__camera
      const fwd = new THREE.Vector3(); c.getWorldDirection(fwd)
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0)).normalize()
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize()
      return { p: c.position.toArray(), right: right.toArray(), up: up.toArray() }
    })()`)) as { p: number[]; right: number[]; up: number[] }

    await page.mouse.move(from[0], from[1])
    await page.mouse.down({ button: 'left' })
    await page.mouse.move(to[0], to[1], { steps: 15 })
    await page.mouse.up({ button: 'left' })
    await settle()

    const after = (await page.evaluate(
      `window.__starmap.getState().__camera.position.toArray()`,
    )) as number[]

    const delta = [after[0] - basis.p[0], after[1] - basis.p[1], after[2] - basis.p[2]]
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    return { alongRight: dot(delta, basis.right), alongUp: dot(delta, basis.up) }
  }

  const orbitRight = await dragAndTrackCamera([500, 400], [800, 400])
  check(
    'orbit: dragging right carries the camera to its left',
    orbitRight.alongRight < -1,
    `camera moved ${orbitRight.alongRight.toFixed(1)} pc along its right axis`,
  )

  const orbitDown = await dragAndTrackCamera([640, 300], [640, 520])
  check(
    'orbit: dragging down carries the camera upward',
    orbitDown.alongUp > 1,
    `camera moved ${orbitDown.alongUp.toFixed(1)} pc along its up axis`,
  )

  await page.evaluate(`window.__starmap.getState().set('cameraMode', 'earth')`)
  await page.waitForTimeout(2600)

  const earthMarker = await markerNear()
  const earthDrag = await dragAndTrack(earthMarker, [500, 400], [800, 400])
  check(
    'earth POV: the sky follows the mouse to the right',
    earthDrag.dx > 0.02,
    `fixed point moved ${earthDrag.dx > 0 ? 'right' : 'left'} (${earthDrag.dx.toFixed(3)} ndc)`,
  )

  await page.evaluate(`window.__starmap.getState().set('cameraMode', 'orbit')`)
  await page.waitForTimeout(2000)

  /*
   * Selecting a figure then switching to Earth POV must land looking at it.
   * A side-on reveal parks the camera perpendicular to the figure's line of
   * sight on purpose, so inheriting that heading used to drop the viewer into
   * the planetarium pointing ninety degrees away from what they had just asked
   * to see.
   */
  await page.evaluate(`window.__starmap.getState().revealConstellation('Ori')`)
  await settle()
  await settle()

  await page.evaluate(`window.__starmap.getState().set('cameraMode', 'earth')`)
  await settle()
  await settle()

  const offsetDeg = (await page.evaluate(`(() => {
    const THREE = window.__three
    const s = window.__starmap.getState()
    const c = s.__camera
    const cat = s.catalog
    const ori = cat.constellations.find((x) => x.id === 'Ori')

    // Mean direction of the figure's members, in world space.
    const sum = new THREE.Vector3()
    for (const i of ori.members) {
      const b = i * 5
      sum.add(new THREE.Vector3(
        cat.t0.attributes[b], cat.t0.attributes[b + 1], cat.t0.attributes[b + 2],
      ).normalize())
    }
    sum.normalize()

    // The scene group maps astronomical Z-up onto three.js Y-up.
    const world = new THREE.Vector3(sum.x, sum.z, -sum.y)
    const facing = new THREE.Vector3()
    c.getWorldDirection(facing)
    return (facing.angleTo(world) * 180) / Math.PI
  })()`)) as number

  check(
    'earth POV faces the selected figure',
    offsetDeg < 20,
    `${offsetDeg.toFixed(1)}deg off centre`,
  )

  await page.evaluate(`window.__starmap.getState().resetView()`)
  await settle()
  await page.evaluate(`window.__starmap.getState().set('cameraMode', 'orbit')`)
  await settle()

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
