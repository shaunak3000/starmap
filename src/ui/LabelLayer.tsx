import { labelNodes } from '../scene/labels.ts'
import { useStarmap } from '../state/store.ts'

/**
 * The DOM half of the label layer.
 *
 * Lives outside the Canvas: React Three Fiber's reconciler would try to build a
 * THREE object out of any `<span>` rendered inside it. All this does is create
 * the nodes and register them; LabelPlacer positions them each frame.
 */
export function LabelLayer() {
  const candidates = useStarmap((state) => state.labelCandidates)

  return (
    <div className="label-layer">
      {candidates.map((candidate) => (
        <div
          key={candidate.key}
          ref={(node) => {
            if (node) labelNodes.set(candidate.key, node)
            else labelNodes.delete(candidate.key)
          }}
          className="star-tag"
        >
          <span className="star-tag-name">{candidate.name}</span>
          {candidate.detail && <span className="star-tag-distance">{candidate.detail}</span>}
        </div>
      ))}
    </div>
  )
}
