import type { MediaItem, SortBy, SortOrder } from './types'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Sorts a copy of `items`.
 * - name: natural order on the relative path (IMG_2 before IMG_10)
 * - exifDate: capture date, falling back to file created date when a file has none
 * - createdDate: file created (birth) date
 * - random: shuffled; `order` is ignored
 * Ties break on name so the order is stable.
 */
export function sortItems(
  items: MediaItem[],
  by: SortBy,
  order: SortOrder,
  rng: () => number = Math.random
): MediaItem[] {
  if (by === 'random') return shuffle(items, rng)

  const byName = (a: MediaItem, b: MediaItem): number => collator.compare(a.relPath, b.relPath)
  let cmp: (a: MediaItem, b: MediaItem) => number
  if (by === 'name') {
    cmp = byName
  } else {
    const key = by === 'exifDate' ? (m: MediaItem) => m.takenAt ?? m.createdAt : (m: MediaItem) => m.createdAt
    cmp = (a, b) => key(a) - key(b) || byName(a, b)
  }
  const sorted = items.slice().sort(cmp)
  return order === 'desc' ? sorted.reverse() : sorted
}
