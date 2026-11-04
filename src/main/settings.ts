import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings, SortBy, SortOrder } from '@shared/types'

const SORTS: SortBy[] = ['name', 'random', 'exifDate', 'createdDate']
const ORDERS: SortOrder[] = ['asc', 'desc']

export function defaultSettings(): Settings {
  return {
    delaySeconds: 6,
    sourceFolder: app.getPath('pictures'),
    includeSubfolders: true,
    sortBy: 'exifDate',
    sortOrder: 'asc',
    showDate: true,
    videoSound: false
  }
}

/** Merges untrusted input over a base, keeping only valid values. */
export function sanitize(input: Partial<Settings>, base: Settings): Settings {
  const out = { ...base }
  if (typeof input.delaySeconds === 'number' && Number.isFinite(input.delaySeconds)) {
    out.delaySeconds = Math.min(600, Math.max(1, input.delaySeconds))
  }
  if (typeof input.sourceFolder === 'string' && input.sourceFolder.length > 0) out.sourceFolder = input.sourceFolder
  if (typeof input.includeSubfolders === 'boolean') out.includeSubfolders = input.includeSubfolders
  if (SORTS.includes(input.sortBy as SortBy)) out.sortBy = input.sortBy as SortBy
  if (ORDERS.includes(input.sortOrder as SortOrder)) out.sortOrder = input.sortOrder as SortOrder
  if (typeof input.showDate === 'boolean') out.showDate = input.showDate
  if (typeof input.videoSound === 'boolean') out.videoSound = input.videoSound
  return out
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

export function loadSettings(): Settings {
  try {
    return sanitize(JSON.parse(readFileSync(file(), 'utf8')), defaultSettings())
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(s: Settings): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(s, null, 2))
}
