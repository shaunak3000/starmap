/**
 * Downloads the raw catalogue sources into data/raw/ (gitignored).
 *
 * Run once; build-catalog.ts consumes the cached files. Re-running skips any
 * file already present at the expected size, so it is safe to retry after a
 * dropped connection.
 */

import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { RAW_DIR, SOURCES, type RemoteSource } from './sources.ts'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

async function download(source: RemoteSource): Promise<void> {
  const dest = path.join(RAW_DIR, source.file)

  if (fs.existsSync(dest)) {
    const size = fs.statSync(dest).size
    if (source.bytes === undefined || size === source.bytes) {
      console.log(`  ${source.file}: cached (${formatBytes(size)})`)
      return
    }
    console.log(`  ${source.file}: cached copy is ${formatBytes(size)}, expected ${formatBytes(source.bytes)} — refetching`)
  }

  console.log(`  ${source.file}: downloading from ${source.url}`)
  const response = await fetch(source.url)
  if (!response.ok || !response.body) {
    throw new Error(`${source.url} -> HTTP ${response.status}`)
  }

  const total = Number(response.headers.get('content-length') ?? source.bytes ?? 0)
  let received = 0
  let lastReport = Date.now()

  const progress = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength
      const now = Date.now()
      if (now - lastReport > 500) {
        lastReport = now
        const pct = total ? ` (${((received / total) * 100).toFixed(1)}%)` : ''
        process.stdout.write(`\r    ${formatBytes(received)}${pct}   `)
      }
      controller.enqueue(chunk)
    },
  })

  // Write to a temp file first so an interrupted download never looks cached.
  const tmp = `${dest}.partial`
  await pipeline(
    Readable.fromWeb(response.body.pipeThrough(progress) as never),
    fs.createWriteStream(tmp),
  )
  process.stdout.write('\r')

  const size = fs.statSync(tmp).size
  if (source.bytes !== undefined && size !== source.bytes) {
    fs.rmSync(tmp)
    throw new Error(
      `${source.file}: downloaded ${formatBytes(size)}, expected ${formatBytes(source.bytes)}`,
    )
  }

  fs.renameSync(tmp, dest)
  console.log(`    saved ${formatBytes(size)}`)
}

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true })
  console.log(`Fetching catalogue sources into ${RAW_DIR}`)

  for (const source of SOURCES) {
    await download(source)
  }

  console.log('Done. Next: npm run data:build')
}

main().catch((error) => {
  console.error(`\nfetch failed: ${error.message}`)
  process.exit(1)
})
