import { MAX_YEARS, describeYear } from '../lib/proper-motion.ts'
import { DISTANCE_FILTER_MAX_PC } from '../scene/StarField.tsx'
import {
  type CameraMode,
  type DistanceUnit,
  type ReferenceFrame,
  type SizeMode,
  useStarmap,
} from '../state/store.ts'
import { Section, Segmented, Slider } from './controls.tsx'
import { ShareButton } from './ShareButton.tsx'
import { formatDistance } from './format.ts'

/**
 * Left panel: everything about *how* you are looking. Kept short enough to fit
 * a laptop viewport without scrolling — hunting for a control you know is there
 * costs more than the words saved by explaining it.
 */
export function ViewPanel({
  ref,
  open = true,
}: {
  ref?: React.Ref<HTMLElement>
  open?: boolean
}) {
  const state = useStarmap()

  return (
    <aside ref={ref} className={`panel-left panel${open ? '' : ' is-hidden'}`}>
      <div className="panel-scroll">
        <div className="brand">
          <span className="brand-name">starmap</span>
          <span className="brand-sub">3 kpc</span>
        </div>

        <Section title="Viewpoint">
          <Segmented<CameraMode>
            value={state.cameraMode}
            onChange={(value) => state.set('cameraMode', value)}
            options={[
              { value: 'earth', label: 'Earth', title: 'Stand on the Sun and look out' },
              { value: 'orbit', label: 'Orbit', title: 'Orbit a focus point' },
              { value: 'fly', label: 'Fly', title: 'Free flight (WASD, Q/E, Shift)' },
            ]}
          />
          <div className="button-row">
            <button type="button" className="button ghost" onClick={() => state.orientView('top')}>
              Top
            </button>
            <button type="button" className="button ghost" onClick={() => state.orientView('edge')}>
              Edge-on
            </button>
            <button type="button" className="button ghost" onClick={() => state.resetView()}>
              Reset
            </button>
          </div>
          <p className="hint">
            {state.cameraMode === 'earth'
              ? 'Drag to look around, scroll to zoom.'
              : state.cameraMode === 'fly'
                ? 'WASD to move, Q/E up and down, Shift boosts. Right-drag pans.'
                : 'Drag to orbit, right-drag pans, scroll zooms toward the cursor.'}
          </p>
        </Section>

        <Section title="Scale">
          <button type="button" className="button" onClick={() => state.startTour()}>
            Take the tour
          </button>
          <button type="button" className="button ghost" onClick={() => state.viewGalaxy()}>
            View the whole Galaxy
          </button>
          <p className="hint">
            Real stars reach 3 kpc; the disk and arms beyond that are a model.
          </p>
        </Section>

        <Section title="Share">
          <ShareButton />
          <p className="hint">
            The address bar tracks whatever you are looking at, so any view can
            be sent as a link.
          </p>
        </Section>

        <Section title="Time">
          <Slider
            label="Epoch"
            value={state.years}
            min={-MAX_YEARS}
            max={MAX_YEARS}
            step={500}
            display={describeYear(state.years)}
            onChange={(value) => state.set('years', value)}
          />
          <div className="button-row">
            <button
              type="button"
              className="button ghost"
              onClick={() => state.set('years', 0)}
              disabled={state.years === 0}
            >
              Now
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => state.set('years', -MAX_YEARS)}
            >
              −100k
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => state.set('years', MAX_YEARS)}
            >
              +100k
            </button>
          </div>
          <p className="hint">
            Every star carries its own velocity. Wind the clock and the figures
            come apart — a constellation is an accident of <em>when</em> you look
            as much as of where you stand.
          </p>
        </Section>

        <Section title="Depth">
          <Slider
            label="True distance"
            value={state.dissolve}
            min={0}
            max={1}
            step={0.01}
            display={
              state.dissolve === 1 ? 'real' : state.dissolve === 0 ? 'sphere' : state.dissolve.toFixed(2)
            }
            onChange={(value) => state.set('dissolve', value)}
          />
          <p className="hint">
            Drag to zero and every star collapses onto one shell — the sky the
            constellations assume. Identical from Earth, nowhere else.
          </p>
        </Section>

        <Section title="Stars">
          <Segmented<SizeMode>
            value={state.sizeMode}
            onChange={(value) => state.set('sizeMode', value)}
            options={[
              { value: 'apparent', label: 'Apparent', title: 'Brightness as seen from the camera' },
              { value: 'map', label: 'Map', title: 'Size by intrinsic luminosity' },
            ]}
          />
          <Slider
            label="Exposure"
            value={state.exposure}
            min={0.2}
            max={4}
            step={0.05}
            display={`${state.exposure.toFixed(2)}x`}
            onChange={(value) => state.set('exposure', value)}
          />
          <Slider
            label="Bloom"
            value={state.bloom}
            min={0}
            max={2}
            step={0.05}
            display={state.bloom === 0 ? 'off' : state.bloom.toFixed(2)}
            onChange={(value) => state.set('bloom', value)}
          />
          <Slider
            label="Range"
            value={state.maxDistancePc}
            min={10}
            max={DISTANCE_FILTER_MAX_PC}
            step={10}
            display={
              state.maxDistancePc >= DISTANCE_FILTER_MAX_PC
                ? 'all'
                : formatDistance(state.maxDistancePc, state.unit)
            }
            onChange={(value) => state.set('maxDistancePc', value)}
          />
        </Section>

        <Section title="Frame">
          <Segmented<ReferenceFrame>
            value={state.frame}
            onChange={(value) => state.set('frame', value)}
            options={[
              { value: 'equatorial', label: 'Equatorial', title: 'Earth’s celestial poles' },
              { value: 'galactic', label: 'Galactic', title: 'Aligned to the Milky Way' },
            ]}
          />
          <Segmented<DistanceUnit>
            value={state.unit}
            onChange={(value) => state.set('unit', value)}
            options={[
              { value: 'ly', label: 'Light years' },
              { value: 'pc', label: 'Parsecs' },
            ]}
          />
        </Section>
      </div>
    </aside>
  )
}
