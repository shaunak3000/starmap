import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url))
export const RAW_DIR = path.join(PROJECT_ROOT, 'data', 'raw')
export const OUT_DIR = path.join(PROJECT_ROOT, 'public', 'catalog')

/**
 * Stellarium is pinned to a release tag rather than tracking `master`: the sky
 * culture files are refactored between releases, and a silent upstream change
 * would break the HIP joins with no signal.
 */
const STELLARIUM_TAG = 'v25.3'

export interface RemoteSource {
  key: string
  file: string
  url: string
  /** Expected byte length, when the host advertises a stable one. */
  bytes?: number
  gzipped: boolean
}

export const SOURCES: RemoteSource[] = [
  {
    key: 'athyg',
    file: 'athyg_40.csv.gz',
    // Codeberg stores these under Git LFS; /media/ resolves the pointer to the
    // real object, whereas /raw/ hands back the 133-byte pointer file.
    url: 'https://codeberg.org/astronexus/athyg/media/branch/main/data/athyg_40.csv.gz',
    bytes: 199688001,
    gzipped: true,
  },
  {
    key: 'stellarium',
    file: 'stellarium-modern.json',
    url: `https://raw.githubusercontent.com/Stellarium/stellarium/${STELLARIUM_TAG}/skycultures/modern/index.json`,
    gzipped: false,
  },
]

export const ATTRIBUTION = [
  {
    name: 'AT-HYG v4.0 (Astronomy Nexus)',
    url: 'https://codeberg.org/astronexus/athyg',
    license: 'CC BY-SA 4.0',
  },
  {
    name: `Stellarium modern sky culture (${STELLARIUM_TAG})`,
    url: 'https://github.com/Stellarium/stellarium',
    license: 'GPL-2.0-or-later / CC BY-SA 4.0',
  },
  {
    name: 'ESA Gaia DR3, via AT-HYG',
    url: 'https://www.cosmos.esa.int/gaia',
    license: 'CC BY-SA 3.0 IGO',
  },
]
