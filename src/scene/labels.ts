import type * as THREE from 'three'

/**
 * Shared plumbing for the decluttered label layer.
 *
 * The DOM lives outside the Canvas and the placement maths lives inside it,
 * because React Three Fiber runs its own reconciler: rendering a `<span>` from
 * within the Canvas tree makes R3F try to construct a THREE object called Span.
 * So the two halves meet here — the layer registers its nodes in this map, and
 * the in-scene placer moves them.
 */

export interface LabelCandidate {
  key: number
  /** Position in catalogue (data-space) coordinates. */
  position: THREE.Vector3
  name: string
  detail?: string
  /** Lower is placed first, and so wins ties for space. */
  priority: number
}

/** Live DOM nodes, keyed the same as the candidates that produced them. */
export const labelNodes = new Map<number, HTMLDivElement>()
