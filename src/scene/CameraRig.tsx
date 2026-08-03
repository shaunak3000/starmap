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
const MAX_DISTANCE_PC = 8000
const MIN_FOV = 12
const MAX_FOV = 85
const DEFAULT_FOV = 60
const PITCH_LIMIT = Math.PI / 2 - 0.001

/** Exponential approach rates, in units of "e-folds per second". */
const ROTATE_DAMPING = 14
const DISTANCE_DAMPING = 7
const TARGET_DAMPING = 6

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

  // Starting yaw of pi puts the camera on +z looking back at the Sun, matching
  // the initial camera in App.
  const desired = useRef<RigState>({
    yaw: Math.PI,
    pitch: 0,
    target: new THREE.Vector3(0, 0, 0),
    distance: 60,
    fov: DEFAULT_FOV,
  })
  const actual = useRef<RigState>({
    yaw: Math.PI,
    pitch: 0,
    target: new THREE.Vector3(0, 0, 0),
    distance: 60,
    fov: DEFAULT_FOV,
  })

  /** Distance to restore when leaving a zero-distance mode. */
  const lastOrbitDistance = useRef(60)
  const keys = useRef(new Set<string>())
  const modeRef = useRef(cameraMode)
  const speedRef = useRef(flySpeed)

  modeRef.current = cameraMode
  speedRef.current = flySpeed

  const scratch = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      move: new THREE.Vector3(),
      world: new THREE.Vector3(),
      worldUp: new THREE.Vector3(0, 1, 0),
    }),
    [],
  )

  const dataToWorld = useMemo(() => frameMatrix(frame), [frame])
  const worldToData = useMemo(() => dataToWorld.clone().invert(), [dataToWorld])

  // Pointer, wheel and key input.
  useEffect(() => {
    const element = gl.domElement
    let dragging = false
    let lastX = 0
    let lastY = 0

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      dragging = true
      lastX = event.clientX
      lastY = event.clientY
      element.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY

      // Scale by field of view so a zoomed-in planetarium view pans slowly.
      const sensitivity = 0.0026 * (actual.current.fov / DEFAULT_FOV)
      const state = desired.current

      // Orbiting reads naturally when dragging pulls the sky the other way.
      const sign = modeRef.current === 'orbit' ? 1 : -1
      state.yaw += dx * sensitivity * sign
      state.pitch = Math.max(
        -PITCH_LIMIT,
        Math.min(PITCH_LIMIT, state.pitch + dy * sensitivity * sign),
      )
    }

    const onPointerUp = (event: PointerEvent) => {
      dragging = false
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId)
      }
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const state = desired.current

      if (modeRef.current === 'earth') {
        // Planetarium zoom is a focal-length change, not a move.
        state.fov = Math.max(MIN_FOV, Math.min(MAX_FOV, state.fov * Math.exp(event.deltaY * 0.0012)))
        return
      }

      if (modeRef.current === 'fly') {
        useStarmap.setState({
          flySpeed: Math.max(0.05, Math.min(500, speedRef.current * Math.exp(-event.deltaY * 0.0015))),
        })
        return
      }

      // Exponential dolly: one wheel notch covers the same *ratio* of distance
      // whether you are 0.1 pc or 3000 pc out, which is the only way a single
      // control spans five orders of magnitude.
      state.distance = Math.max(
        MIN_DISTANCE_PC,
        Math.min(MAX_DISTANCE_PC, state.distance * Math.exp(event.deltaY * 0.0011)),
      )
      lastOrbitDistance.current = state.distance
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
    element.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerUp)
      element.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [gl])

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
    state.target.set(...focusRequest.position)
    state.distance = Math.max(focusRequest.distance, MIN_DISTANCE_PC)
    lastOrbitDistance.current = state.distance

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
    if (useStarmap.getState().cameraMode === 'earth') {
      useStarmap.setState({ cameraMode: 'orbit' })
    }
  }, [focusRequest, dataToWorld, scratch])

  useFrame((_, rawDelta) => {
    // Clamp so a stalled tab does not teleport the camera on the next frame.
    const dt = Math.min(rawDelta, 0.1)
    const goal = desired.current
    const now = actual.current

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
          scratch.move.normalize().multiplyScalar(step)
          // Movement is authored in world space but the target lives in data
          // space, so undo the frame rotation before applying it.
          scratch.move.applyMatrix4(worldToData)
          goal.target.add(scratch.move)
        }
      }
    }

    now.yaw = damp(now.yaw, goal.yaw, ROTATE_DAMPING, dt)
    now.pitch = damp(now.pitch, goal.pitch, ROTATE_DAMPING, dt)
    now.fov = damp(now.fov, goal.fov, DISTANCE_DAMPING, dt)

    // Distance is interpolated in log space so a trip from 3000 pc to 0.5 pc
    // feels uniform instead of crawling for the last hundredth.
    const from = Math.max(now.distance, 1e-5)
    const to = Math.max(goal.distance, 1e-5)
    const logged = damp(Math.log(from), Math.log(to), DISTANCE_DAMPING, dt)
    now.distance = goal.distance <= 1e-5 && from < 1e-3 ? goal.distance : Math.exp(logged)

    const targetAlpha = 1 - Math.exp(-TARGET_DAMPING * dt)
    now.target.lerp(goal.target, targetAlpha)

    look(now.yaw, now.pitch, scratch.dir)
    scratch.world.copy(now.target).applyMatrix4(dataToWorld)

    camera.position.copy(scratch.world).addScaledVector(scratch.dir, -now.distance)
    camera.lookAt(
      camera.position.x + scratch.dir.x,
      camera.position.y + scratch.dir.y,
      camera.position.z + scratch.dir.z,
    )

    // Near plane has to track the scale being viewed, or standing 0.05 pc from
    // a star clips it away while a 3000 pc overview z-fights.
    const near = Math.max(1e-4, Math.min(1, Math.max(now.distance, 0.02) * 5e-4))
    if (camera.fov !== now.fov || camera.near !== near) {
      camera.fov = now.fov
      camera.near = near
      camera.updateProjectionMatrix()
    }

    const distanceFromSun = camera.position.length()
    const reported = useStarmap.getState().cameraDistancePc
    if (Math.abs(distanceFromSun - reported) > Math.max(reported * 0.01, 0.005)) {
      useStarmap.setState({ cameraDistancePc: distanceFromSun })
    }
  })

  return null
}
