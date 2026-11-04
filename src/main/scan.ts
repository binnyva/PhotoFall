import { readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import type { MediaKind } from '@shared/types'

/** Formats Chromium shows directly. */
export const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'])
/** Formats converted to JPEG with macOS `sips` before showing. */
export const CONVERT_EXT = new Set(['.heic', '.heif', '.tif', '.tiff'])
export const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.webm'])

export function kindOf(file: string): MediaKind | null {
  const ext = extname(file).toLowerCase()
  if (PHOTO_EXT.has(ext) || CONVERT_EXT.has(ext)) return 'photo'
  if (VIDEO_EXT.has(ext)) return 'video'
  return null
}

/** Skips hidden entries and macOS library packages (Photos, Lightroom, etc.). */
function skipDir(name: string): boolean {
  return name.startsWith('.') || /\.(photoslibrary|photolibrary|aplibrary|lrdata|app)$/i.test(name)
}

export interface FoundFile {
  path: string
  relPath: string
  kind: MediaKind
}

export async function scanFolder(root: string, recursive: boolean): Promise<FoundFile[]> {
  const out: FoundFile[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (err) {
      if (dir === root) throw err
      return // unreadable subfolder: skip it
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (recursive && !skipDir(e.name)) await walk(full)
      } else if (e.isFile() && !e.name.startsWith('.')) {
        const kind = kindOf(e.name)
        if (kind) out.push({ path: full, relPath: relative(root, full), kind })
      }
    }
  }
  await walk(root)
  return out
}
