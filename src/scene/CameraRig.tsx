import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStarmap } from '../state/store.ts'
import { frameMatrix } from './frame.ts'

/**
 * One parameterisation drives all three camera modes:
 *
 *   position = target - dir(yaw, pitch) * distance
 *
 * Orbit is `distance > 0` about a focus point; Earth POV is `distance == 0`
 * pinned to the Sun; fly is `distance == 0` with a target the keys can push
 * around. Because the modes differ only in which inputs are live, switching
 * between them is algebraically continuous — the camera never jumps.
 */

const MIN_DISTANCE_PC = 0.02
/** Far enough out to hold the whole modelled Galaxy in frame. */
const MAX_DISTANCE_PC = 60000
const MIN_FOV = 12
const MAX_FOV = 85
const DEFAULT_FOV = 60
const PITCH_LIMIT = Math.PI / 2 - 0.001

/** Exponential approach rates, in e-folds per second. */
const ROTATE_DAMPING = 18
const DISTANCE_DAMPING = 13
const TARGET_DAMPING = 13
/** Slower rates while a scripted flight is in progress, so travel reads as travel. */
const FLIGHT_DAMPING = 5.5
const FLIGHT_DURATION_MS = 1400

interface RigState {
  yaw: number
  pitch: number
  /** Focus point in catalogue (data-space) coordinates. */
  target: THREE.Vector3
  distance: number
  fov: number
}

function look(yaw: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
  const cosPitch = Math.cos(pitch)
  return out.set(cosPitch * Math.sin(yaw), Math.sin(pitch), cosPitch * Math.cos(yaw))
}

/** Frame-rate independent exponential approach. */
function damp(current: number, goal: number, lambda: number, dt: number): number {
  return current + (goal - current) * (1 - Math.exp(-lambda * dt))
}

export function CameraRig() {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera

  const cameraMode = useStarmap((state) => state.cameraMode)
  const frame = useStarmap((state) => state.frame)
  const focusRequest = useStarmap((state) => state.focusRequest)
  const flySpeed = useStarmap((state) => state.flySpeed)

  // Starting yaw of pi puts the camera on +z looking back at the Sun.
  const initial = (): RigState => ({
    yaw: Math.PI,
    pitch: 0,
    target: new THREE.Vector3(0, 0, 0),
    distance: 60,
    fov: DEFAULT_FOV,
  })

  const desired = useRef<RigState>(initial())
  const actual = useRef<RigState>(initial())

  /** Distance to restore when leaving a zero-distance mode. */
  const lastOrbitDistance = useRef(60)
  const keys = useRef(new Set<string>())
  const modeRef = useRef(cameraMode)
  const speedRef = useRef(flySpeed)
  const cameraRef = useRef(camera)
  /** Scripted flights damp slower than hand input; this is when one ends. */
  const flightUntil = useRef(0)

  modeRef.current = cameraMode
  speedRef.current = flySpeed
  cameraRef.current = camera

  // Exposed for the input-check harness; screenshots cannot tell whether pan
  // and dolly actually moved the camera.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    useStarmap.setState({ __camera: camera } as never)
  }, [camera])

  const scratch = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      move: new THREE.Vector3(),
      world: new THREE.Vector3(),
      ray: new THREE.Vector3(),
      worldUp: new THREE.Vector3(0, 1, 0),
    }),
    [],
  )

  const dataToWorld = useMemo(() => frameMatrix(frame), [frame])
  const worldToData = useMemo(() => dataToWorld.clone().invert(), [dataToWorld])

  // Pointer, wheel and key input.
  useEffect(() => {
    const element = gl.domElement
    let drag: 'none' | 'rotate' | 'pan' = 'none'
    let lastX = 0
    let lastY = 0
    let pointerX = 0
    let pointerY = 0

    const panAllowed = () => modeRef.current !== 'earth'

    const onPointerDown = (event: PointerEvent) => {
      lastX = event.clientX
      lastY = event.clientY

      // Right or middle drag pans; shift-left does too, for one-button mice.
      const wantsPan = event.button === 1 || event.button === 2 || event.shiftKey
      if (wantsPan) {
        if (!panAllowed()) return
        drag = 'pan'
      } else if (event.button === 0) {
        drag = 'rotate'
      } else {
        return
      }

      element.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerY = -(((event.clientY - rect.top) / rect.height) * 2 - 1)

      if (drag === 'none') return

      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY

      const state = desired.current

      if (drag === 'rotate') {
        // A full drag down the viewport turns 180 degrees, so the gesture means
        // the same thing on any window size. Field of view scales it too, so a
        // zoomed-in planetarium view tracks slowly.
        const sensitivity =
          (Math.PI / element.clientHeight) * (actual.current.fov / DEFAULT_FOV)

        // Whatever you grab follows the mouse, in every mode. The arithmetic has
        // to differ because orbit swings the camera *around* a target while
        // Earth POV and fly pivot it in place: moving the camera right pushes
        // the scene left, whereas turning in place pulls it right. Same felt
        // behaviour, opposite sign.
        const sign = modeRef.current === 'orbit' ? -1 : 1

        state.yaw += dx * sensitivity * sign
        state.pitch = Math.max(
          -PITCH_LIMIT,
          Math.min(PITCH_LIMIT, state.pitch + dy * sensitivity * sign),
        )
        return
      }

      // Pan: slide the focus point across the view plane. The world distance
      // per pixel is set by how much of the scene the frustum spans at the
      // focus depth, so panning feels the same at every zoom level.
      const depth = Math.max(actual.current.distance, MIN_DISTANCE_PC)
      const worldPerPixel =
        (2 * depth * Math.tan((actual.current.fov * Math.PI) / 360)) / element.clientHeight

      look(actual.current.yaw, actual.current.pitch, scratch.dir)
      scratch.right.crossVectors(scratch.dir, scratch.worldUp).normalize()
      scratch.up.crossVectors(scratch.right, scratch.dir).normalize()

      scratch.move
        .set(0, 0, 0)
        .addScaledVector(scratch.right, -dx * worldPerPixel)
        .addScaledVector(scratch.up, dy * worldPerPixel)
        .applyMatrix4(worldToData)

      state.target.add(scratch.move)
      // Hand input should not inherit a flight's slow damping.
      flightUntil.current = 0
    }

    const onPointerUp = (event: PointerEvent) => {
      drag = 'none'
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId)
      }
    }

    const onContextMenu = (event: MouseEvent) => event.preventDefault()

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const state = desired.current

      // Trackpads emit a stream of small deltas and mice a few large ones;
      // clamping keeps one gesture from covering five orders of magnitude.
      const step = Math.max(-220, Math.min(220, event.deltaY))

      if (modeRef.current === 'earth') {
        // Planetarium zoom is a focal-length change, not a move.
        state.fov = Math.max(MIN_FOV, Math.min(MAX_FOV, state.fov * Math.exp(step * 0.0016)))
        return
      }

      if (modeRef.current === 'fly') {
        useStarmap.setState({
          flySpeed: Math.max(0.05, Math.min(2000, speedRef.current * Math.exp(-step * 0.0016))),
        })
        return
      }

      // Exponential dolly: one notch covers the same *ratio* of distance at
      // 0.1 pc as at 30 kpc, which is the only way one control spans six
      // orders of magnitude.
      const before = state.distance
      const after = Math.max(
        MIN_DISTANCE_PC,
        Math.min(MAX_DISTANCE_PC, before * Math.exp(step * 0.0022)),
      )
      state.distance = after
      lastOrbitDistance.current = after
      flightUntil.current = 0

      // Zoom toward the cursor rather than the orbit centre: shifting the focus
      // by (before - after) * (cursorRay - viewDir) keeps whatever is under the
      // pointer pinned in place while the camera closes in.
      const view = cameraRef.current
      scratch.ray
        .set(pointerX, pointerY, 0.5)
        .unproject(view)
        .sub(view.position)
        .normalize()

      look(actual.current.yaw, actual.current.pitch, scratch.dir)
      scratch.move
        .copy(scratch.ray)
        .sub(scratch.dir)
        .multiplyScalar(before - after)
        .applyMatrix4(worldToData)

      state.target.add(scratch.move)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      keys.current.add(event.code)
    }
    const onKeyUp = (event: KeyboardEvent) => keys.current.delete(event.code)
    const onBlur = () => keys.current.clear()

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerUp)
    element.addEventListener('contextmenu', onContextMenu)
    element.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerUp)
      element.removeEventListener('contextmenu', onContextMenu)
      element.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [gl, scratch, worldToData])

  // Mode changes only retarget; the damping loop makes them continuous.
  useEffect(() => {
    const state = desired.current

    if (cameraMode === 'earth') {
      state.target.set(0, 0, 0)
      state.distance = 0
    } else if (cameraMode === 'fly') {
      // Hand the current eye position to the target so the view holds still.
      look(actual.current.yaw, actual.current.pitch, scratch.dir)
      state.target
        .copy(actual.current.target)
        .addScaledVector(scratch.dir, -actual.current.distance)
      state.distance = 0
      state.fov = DEFAULT_FOV
    } else {
      state.distance = Math.max(lastOrbitDistance.current, MIN_DISTANCE_PC)
      state.fov = DEFAULT_FOV
    }
  }, [cameraMode, scratch])

  // Travel requests from search, star selection and constellation focus.
  useEffect(() => {
    if (!focusRequest) return
    const state = desired.current
    flightUntil.current = performance.now() + FLIGHT_DURATION_MS

    // Position and range are optional: a view preset only changes the angle.
    if (focusRequest.position) state.target.set(...focusRequest.position)
    if (focusRequest.distance !== undefined) {
      state.distance = Math.max(focusRequest.distance, MIN_DISTANCE_PC)
      if (focusRequest.distance > 0) lastOrbitDistance.current = state.distance
    }

    if (focusRequest.lookFrom) {
      // The request names where the camera should stand relative to the target;
      // the rig stores the direction it looks, which is the opposite.
      scratch.dir
        .set(...focusRequest.lookFrom)
        .applyMatrix4(dataToWorld)
        .normalize()
        .negate()

      state.yaw = Math.atan2(scratch.dir.x, scratch.dir.z)
      state.pitch = Math.max(
        -PITCH_LIMIT,
        Math.min(PITCH_LIMIT, Math.asin(THREE.MathUtils.clamp(scratch.dir.y, -1, 1))),
      )

      // Yaw is unbounded, so approach the requested heading the short way round
      // rather than unwinding several turns.
      const turns = Math.round((actual.current.yaw - state.yaw) / (Math.PI * 2))
      state.yaw += turns * Math.PI * 2
    }

    // Travelling somewhere implies wanting to look at it, so leave the
    // origin-locked planetarium view rather than silently ignoring the request.
    // A bare angle change is not travel, so it leaves the mode alone.
    const goingSomewhere = focusRequest.position !== undefined && (focusRequest.distance ?? 0) > 0
    if (goingSomewhere && useStarmap.getState().cameraMode === 'earth') {
      useStarmap.setState({ cameraMode: 'orbit' })
    }
  }, [focusRequest, dataToWorld, scratch])

  // Declared after the mode and focus effects on purpose: restorePose sets the
  // mode too, and effects run in declaration order, so an earlier pose effect
  // would be clobbered by the mode effect in the same commit.
  // A restored pose snaps rather than flies: it is where the viewer already
  // expected to be, so animating to it would just be a delay.
  const poseRequest = useStarmap((state) => state.poseRequest)
  useEffect(() => {
    if (!poseRequest) return
    for (const state of [desired.current, actual.current]) {
      state.target.set(...poseRequest.target)
      state.distance = poseRequest.distance
      state.yaw = poseRequest.yaw
      state.pitch = poseRequest.pitch
      state.fov = poseRequest.fov
    }
    if (poseRequest.distance > 0) lastOrbitDistance.current = poseRequest.distance
    flightUntil.current = 0
  }, [poseRequest])

  useFrame((_, rawDelta) => {
    // Clamp so a stalled tab does not teleport the camera on the next frame.
    const dt = Math.min(rawDelta, 0.1)
    const goal = desired.current
    const now = actual.current

    const flying = performance.now() < flightUntil.current
    const moveDamping = flying ? FLIGHT_DAMPING : TARGET_DAMPING
    const zoomDamping = flying ? FLIGHT_DAMPING : DISTANCE_DAMPING

    if (cameraMode === 'fly') {
      const pressed = keys.current
      const forward = (pressed.has('KeyW') ? 1 : 0) - (pressed.has('KeyS') ? 1 : 0)
      const strafe = (pressed.has('KeyD') ? 1 : 0) - (pressed.has('KeyA') ? 1 : 0)
      const rise =
        (pressed.has('KeyE') || pressed.has('Space') ? 1 : 0) - (pressed.has('KeyQ') ? 1 : 0)

      if (forward || strafe || rise) {
        look(goal.yaw, goal.pitch, scratch.dir)
        scratch.right.crossVectors(scratch.dir, scratch.worldUp).normalize()
        scratch.up.crossVectors(scratch.right, scratch.dir).normalize()

        const boost = pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? 6 : 1
        const step = speedRef.current * boost * dt

        scratch.move
          .set(0, 0, 0)
          .addScaledVector(scratch.dir, forward)
          .addScaledVector(scratch.right, strafe)
          .addScaledVector(scratch.up, rise)

        if (scratch.move.lengthSq() > 0) {
          // Movement is authored in world space but the target lives in data
          // space, so undo the frame rotation before applying it.
          scratch.move.normalize().multiplyScalar(step).applyMatrix4(worldToData)
          goal.target.add(scratch.move)
        }
      }
    }

    now.yaw = damp(now.yaw, goal.yaw, ROTATE_DAMPING, dt)
    now.pitch = damp(now.pitch, goal.pitch, ROTATE_DAMPING, dt)
    now.fov = damp(now.fov, goal.fov, DISTANCE_DAMPING, dt)

    // Distance is interpolated in log space so a trip from 30 kpc to 0.5 pc
    // feels uniform instead of crawling for the last hundredth.
    const from = Math.max(now.distance, 1e-5)
    const to = Math.max(goal.distance, 1e-5)
    const logged = damp(Math.log(from), Math.log(to), zoomDamping, dt)
    now.distance = goal.distance <= 1e-5 && from < 1e-3 ? goal.distance : Math.exp(logged)

    now.target.lerp(goal.target, 1 - Math.exp(-moveDamping * dt))

    look(now.yaw, now.pitch, scratch.dir)
    scratch.world.copy(now.target).applyMatrix4(dataToWorld)

    camera.position.copy(scratch.world).addScaledVector(scratch.dir, -now.distance)
    camera.lookAt(
      camera.position.x + scratch.dir.x,
      camera.position.y + scratch.dir.y,
      camera.position.z + scratch.dir.z,
    )

    // Both planes track the scale being viewed: standing 0.05 pc from a star
    // needs a tiny near plane, while a 30 kpc overview needs a far plane past
    // the whole modelled Galaxy. Everything drawn is additive with depth
    // testing off, so the resulting huge near/far ratio costs nothing.
    const near = Math.max(1e-4, Math.min(20, Math.max(now.distance, 0.02) * 5e-4))
    const far = Math.max(now.distance * 8, 120000)
    if (camera.fov !== now.fov || camera.near !== near || camera.far !== far) {
      camera.fov = now.fov
      camera.near = near
      camera.far = far
      camera.updateProjectionMatrix()
    }

    const distanceFromSun = camera.position.length()
    const reported = useStarmap.getState().cameraDistancePc
    if (Math.abs(distanceFromSun - reported) > Math.max(reported * 0.01, 0.005)) {
      useStarmap.setState({ cameraDistancePc: distanceFromSun })
    }

    publishPose(now, goal)
  })

  /**
   * Publishes the pose once motion has settled.
   *
   * Only on settle, because this is what the URL captures — rewriting the
   * address bar every frame of a drag would be absurd, and a half-finished
   * camera move is not a view anyone wants to share.
   */
  function publishPose(current: RigState, goal: RigState) {
    const settled =
      Math.abs(current.yaw - goal.yaw) < 1e-3 &&
      Math.abs(current.pitch - goal.pitch) < 1e-3 &&
      Math.abs(current.distance - goal.distance) < Math.max(goal.distance * 1e-3, 1e-4) &&
      current.target.distanceToSquared(goal.target) < 1e-6

    if (!settled) return

    const previous = useStarmap.getState().cameraPose
    const pose = {
      mode: modeRef.current,
      target: [current.target.x, current.target.y, current.target.z] as [number, number, number],
      distance: current.distance,
      yaw: current.yaw,
      pitch: current.pitch,
      fov: current.fov,
    }

    if (
      previous &&
      previous.mode === pose.mode &&
      Math.abs(previous.yaw - pose.yaw) < 1e-3 &&
      Math.abs(previous.pitch - pose.pitch) < 1e-3 &&
      Math.abs(previous.distance - pose.distance) < Math.max(pose.distance * 1e-3, 1e-4) &&
      Math.abs(previous.target[0] - pose.target[0]) < 1e-3 &&
      Math.abs(previous.target[1] - pose.target[1]) < 1e-3 &&
      Math.abs(previous.target[2] - pose.target[2]) < 1e-3
    ) {
      return
    }

    useStarmap.setState({ cameraPose: pose })
  }

  return null
}
