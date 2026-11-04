import { describe, expect, it } from 'vitest'
import { sortItems, shuffle } from '../src/shared/sort'
import type { MediaItem } from '../src/shared/types'

const item = (relPath: string, takenAt: number | null, createdAt: number): MediaItem => ({
  id: relPath,
  kind: 'photo',
  name: relPath,
  relPath,
  takenAt,
  createdAt
})

const items = [
  item('IMG_10.jpg', 300, 10),
  item('IMG_2.jpg', null, 20),
  item('IMG_1.jpg', 100, 30)
]
const names = (list: MediaItem[]): string[] => list.map((m) => m.relPath)

describe('sortItems', () => {
  it('sorts names naturally', () => {
    expect(names(sortItems(items, 'name', 'asc'))).toEqual(['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg'])
    expect(names(sortItems(items, 'name', 'desc'))).toEqual(['IMG_10.jpg', 'IMG_2.jpg', 'IMG_1.jpg'])
  })

  it('sorts by EXIF date and falls back to created date', () => {
    // IMG_2 has no EXIF date, so its created date (20) is used
    expect(names(sortItems(items, 'exifDate', 'asc'))).toEqual(['IMG_2.jpg', 'IMG_1.jpg', 'IMG_10.jpg'])
  })

  it('sorts by created date', () => {
    expect(names(sortItems(items, 'createdDate', 'asc'))).toEqual(['IMG_10.jpg', 'IMG_2.jpg', 'IMG_1.jpg'])
  })

  it('shuffles for random and keeps every item', () => {
    const out = sortItems(items, 'random', 'asc', () => 0)
    expect(out).toHaveLength(3)
    expect(new Set(names(out))).toEqual(new Set(names(items)))
  })

  it('does not mutate the input', () => {
    const copy = items.slice()
    sortItems(items, 'name', 'desc')
    expect(items).toEqual(copy)
    shuffle(items)
    expect(items).toEqual(copy)
  })
})
