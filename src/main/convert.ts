import { app } from 'electron'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const pending = new Map<string, Promise<string>>()

/**
 * Converts a HEIC/HEIF/TIFF file to a cached JPEG using macOS `sips` and returns the JPEG path.
 * The cache key includes size and mtime, so an edited file is converted again.
 */
export async function toJpeg(src: string): Promise<string> {
  const st = await stat(src)
  const key = createHash('sha1').update(`${src}|${st.size}|${st.mtimeMs}`).digest('hex')
  const dir = join(app.getPath('userData'), 'converted')
  const out = join(dir, `${key}.jpg`)
  if (existsSync(out)) return out
  const inFlight = pending.get(out)
  if (inFlight) return inFlight
  const job = (async () => {
    mkdirSync(dir, { recursive: true })
    await run('/usr/bin/sips', [
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', '88',
      '--resampleHeightWidthMax', '3000',
      src, '--out', out
    ])
    return out
  })().finally(() => pending.delete(out))
  pending.set(out, job)
  return job
}
