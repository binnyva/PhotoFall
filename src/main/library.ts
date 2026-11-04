import { extname } from 'node:path'
import { sortItems } from '@shared/sort'
import type { MediaItem, MediaKind, Playlist, Settings } from '@shared/types'
import { flushMetaCache, getMeta, mapLimit } from './metadata'
import { CONVERT_EXT, scanFolder } from './scan'

interface Entry {
  path: string
  kind: MediaKind
  needsConvert: boolean
}

/** id -> file on disk. The renderer only ever sees ids. */
const registry = new Map<string, Entry>()
let lastKey = ''
let lastItems: MediaItem[] = []

export function lookup(id: string): Entry | undefined {
  return registry.get(id)
}

async function load(settings: Settings): Promise<MediaItem[]> {
  const key = `${settings.sourceFolder}|${settings.includeSubfolders}`
  if (key === lastKey) return lastItems
  const files = await scanFolder(settings.sourceFolder, settings.includeSubfolders)
  registry.clear()
  const items = await mapLimit(files, 8, async (f) => {
    const meta = await getMeta(f.path, f.kind).catch(() => ({ takenAt: null, createdAt: 0 }))
    const id = String(registry.size + 1) + '-' + Math.random().toString(36).slice(2, 8)
    registry.set(id, { path: f.path, kind: f.kind, needsConvert: CONVERT_EXT.has(extname(f.path).toLowerCase()) })
    const name = f.relPath.split(/[\\/]/).pop() ?? f.relPath
    return { id, kind: f.kind, name, relPath: f.relPath, ...meta } satisfies MediaItem
  })
  await flushMetaCache()
  lastKey = key
  lastItems = items
  return items
}

/** Scans (or reuses the last scan of) the source folder and returns it sorted per settings. */
export async function buildPlaylist(settings: Settings, rescan = false): Promise<Playlist> {
  if (rescan) lastKey = ''
  try {
    const items = await load(settings)
    return { folder: settings.sourceFolder, items: sortItems(items, settings.sortBy, settings.sortOrder) }
  } catch (err) {
    return { folder: settings.sourceFolder, items: [], error: (err as Error).message }
  }
}
