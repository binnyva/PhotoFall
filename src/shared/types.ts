export type MediaKind = 'photo' | 'video'

export type SortBy = 'name' | 'random' | 'exifDate' | 'createdDate'
export type SortOrder = 'asc' | 'desc'

export interface Settings {
  /** Seconds between photo drops. Videos use the fixed video rule instead. */
  delaySeconds: number
  sourceFolder: string
  includeSubfolders: boolean
  sortBy: SortBy
  sortOrder: SortOrder
  showDate: boolean
  videoSound: boolean
}

/** What the renderer knows about one file. The real path stays in the main process. */
export interface MediaItem {
  id: string
  kind: MediaKind
  name: string
  /** Best known capture date (EXIF / QuickTime), in ms since epoch, or null. */
  takenAt: number | null
  /** File creation (birth) time in ms since epoch. */
  createdAt: number
  /** Relative path inside the source folder, used for name sorting. */
  relPath: string
}

export interface Playlist {
  folder: string
  items: MediaItem[]
  /** Set when the folder could not be read. */
  error?: string
}

export const VIDEO_HOLD_SECONDS = 3
/** Cards kept on the table. Older ones are removed from the page and freed. */
export const PILE_LIMIT = 20
