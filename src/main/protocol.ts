import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { toJpeg } from './convert'
import { lookup } from './library'

export const SCHEME = 'photofall'

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm'
}

/** The page loads from file:// (or the dev server), so media responses must allow that origin. */
const CORS = { 'Access-Control-Allow-Origin': '*' }

/** Must run before app `ready`. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

/** Serves a file with HTTP Range support, which <video> needs for seeking and streaming. */
async function serveFile(path: string, request: Request): Promise<Response> {
  const { size } = await stat(path)
  const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '')
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2])
    let end = range[1] && range[2] ? Number(range[2]) : size - 1
    start = Math.max(0, start)
    end = Math.min(end, size - 1)
    if (start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
    return new Response(body, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        ...CORS
      }
    })
  }
  const body = Readable.toWeb(createReadStream(path)) as ReadableStream
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', ...CORS }
  })
}

/** photofall://media/<id> -> the registered file (HEIC/TIFF converted to JPEG first). */
export function handleScheme(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const entry = url.hostname === 'media' ? lookup(id) : undefined
    if (!entry) return new Response('Not found', { status: 404 })
    try {
      const path = entry.needsConvert ? await toJpeg(entry.path) : entry.path
      return await serveFile(path, request)
    } catch (err) {
      return new Response(String((err as Error).message), { status: 500 })
    }
  })
}
