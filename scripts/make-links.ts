/**
 * Captures shareable links for a few named views by driving the real app.
 *
 *   npx tsx scripts/make-links.ts [url]
 *
 * Hand-writing these into the README would mean publishing links nobody had
 * opened. Each one here is produced by putting the app into the view and
 * reading back the hash it wrote.
 */

import { chromium, type Page } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:5173/?probe=1'
const PUBLIC = 'https://shaunak3000.github.io/starmap/'

interface View {
  label: string
  setup: string
  /** Extra settling time for views involving a long camera flight. */
  settleMs?: number
}

const VIEWS: View[] = [
  {
    label: 'Orion, revealed side-on',
    setup: `s.revealConstellation('Ori')`,
    settleMs: 11000,
  },
  {
    label: 'Canis Major — Sirius at 9 ly, Aludra at 1,989',
    setup: `s.set('isolate', true); s.revealConstellation('CMa')`,
    settleMs: 11000,
  },
  {
    label: 'The Chinese sky over the same stars',
    setup: `s.setSkyCulture('chinese')`,
    settleMs: 6000,
  },
  {
    label: 'The Indian nakshatras',
    setup: `s.setSkyCulture('indian')`,
    settleMs: 6000,
  },
  {
    label: 'Our place in the Milky Way',
    setup: `s.viewGalaxy()`,
    settleMs: 13000,
  },
  {
    label: 'The sky the constellations assume',
    setup: `s.revealConstellation('Ori'); setTimeout(() => window.__starmap.setState({ dissolve: 0 }), 3000)`,
    settleMs: 13000,
  },
]

/**
 * Each view gets its own page.
 *
 * Reusing one and re-navigating does not work: `goto` to a URL that differs
 * only by fragment is a same-document navigation, so the app keeps all its
 * state and the next view silently inherits the last one's.
 */
async function capture(page: Page, view: View): Promise<string> {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('canvas')

  // `void` so an async action's promise is never returned to Playwright, which
  // would try to serialise it and fail once it is collected.
  await page.evaluate(`void (() => {
    const s = window.__starmap.getState()
    s.stopTour()
    ${view.setup}
  })()`)

  await page.waitForTimeout(view.settleMs ?? 4000)
  return String(await page.evaluate('window.location.hash'))
}

async function main() {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })

  for (const view of VIEWS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const hash = await capture(page, view)
    await page.close()

    if (!hash || hash === '#') {
      console.log(`SKIP  ${view.label} — produced no hash`)
      continue
    }
    console.log(`- [${view.label}](${PUBLIC}${hash})`)
  }

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
