import { app } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import exifr from 'exifr'
import type { MediaKind } from '@shared/types'
import { readQuickTimeCreated } from './quicktime'

export interface FileMeta {
  takenAt: number | null
  createdAt: number
}

interface CacheEntry extends FileMeta {
  size: number
  mtimeMs: number
}

let cache: Record<string, CacheEntry> | null = null
let dirty = false
const cacheFile = (): string => join(app.getPath('userData'), 'metadata-cache.json')

async function loadCache(): Promise<Record<string, CacheEntry>> {
  if (cache) return cache
  try {
    cache = JSON.parse(await readFile(cacheFile(), 'utf8'))
  } catch {
    cache = {}
  }
  return cache as Record<string, CacheEntry>
}

export async function flushMetaCache(): Promise<void> {
  if (!cache || !dirty) return
  dirty = false
  await writeFile(cacheFile(), JSON.stringify(cache)).catch(() => undefined)
}

async function readTakenAt(path: string, kind: MediaKind): Promise<number | null> {
  try {
    if (kind === 'video') return await readQuickTimeCreated(path)
    const tags = await exifr.parse(path, { pick: ['DateTimeOriginal', 'CreateDate'] })
    const d: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : null
  } catch {
    return null
  }
}

export async function getMeta(path: string, kind: MediaKind): Promise<FileMeta> {
  const c = await loadCache()
  const st = await stat(path)
  const hit = c[path]
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) {
    return { takenAt: hit.takenAt, createdAt: hit.createdAt }
  }
  const createdAt = st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs
  const takenAt = await readTakenAt(path, kind)
  c[path] = { size: st.size, mtimeMs: st.mtimeMs, takenAt, createdAt }
  dirty = true
  return { takenAt, createdAt }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
