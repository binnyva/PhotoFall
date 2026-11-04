import { describe, expect, it } from 'vitest'
import { coverage, fitSize, placeCard, type CardRect } from '../src/shared/placement'

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('coverage', () => {
  const a: CardRect = { cx: 100, cy: 100, w: 100, h: 100, angle: 0 }
  it('is 1 for the same card and 0 for a far card', () => {
    expect(coverage(a, a)).toBe(1)
    expect(coverage(a, { ...a, cx: 500 })).toBe(0)
  })
  it('is about half for a half overlap', () => {
    expect(coverage(a, { ...a, cx: 150 })).toBeCloseTo(0.5, 1)
  })
  it('accounts for rotation', () => {
    const rotated = coverage(a, { ...a, cx: 200, angle: 45 })
    expect(rotated).toBeGreaterThan(0)
    expect(rotated).toBeLessThan(0.25)
  })
})

describe('placeCard', () => {
  it('keeps new cards off the last two on a typical screen', () => {
    const rng = seeded(42)
    const screenW = 1728
    const screenH = 1117
    const pile: CardRect[] = []
    let misses = 0
    const runs = 500
    for (let i = 0; i < runs; i++) {
      // Same sizing as the renderer: photo box 40% x 44% of the screen, plus the Polaroid border
      const size = fitSize(i % 3 === 0 ? 3 / 4 : 4 / 3, screenW * 0.4, screenH * 0.44)
      const card = placeCard({
        screenW,
        screenH,
        cardW: size.w * 1.06,
        cardH: size.h * 1.2,
        previous: pile,
        maxCoverage: 0.12,
        rng
      })
      const worst = Math.max(0, ...pile.slice(0, 2).map((p) => coverage(p, card)))
      if (worst > 0.15) misses++
      expect(worst).toBeLessThan(0.3)
      pile.unshift(card)
    }
    expect(misses / runs).toBeLessThan(0.03)
  })

  it('stays on screen', () => {
    const rng = seeded(7)
    for (let i = 0; i < 100; i++) {
      const c = placeCard({ screenW: 1000, screenH: 600, cardW: 300, cardH: 250, previous: [], rng })
      expect(c.cx - c.w / 2).toBeGreaterThanOrEqual(0)
      expect(c.cx + c.w / 2).toBeLessThanOrEqual(1000)
      expect(c.cy - c.h / 2).toBeGreaterThanOrEqual(0)
      expect(c.cy + c.h / 2).toBeLessThanOrEqual(600)
      expect(Math.abs(c.angle)).toBeLessThanOrEqual(8)
    }
  })
})

describe('fitSize', () => {
  it('fits landscape and portrait photos in the box', () => {
    expect(fitSize(2, 400, 300)).toEqual({ w: 400, h: 200 })
    expect(fitSize(0.5, 400, 300)).toEqual({ w: 150, h: 300 })
  })
})

describe('coveredByAny', () => {
  it('combines several covering cards', async () => {
    const { coveredByAny } = await import('../src/shared/placement')
    const a: CardRect = { cx: 100, cy: 100, w: 100, h: 100, angle: 0 }
    expect(coveredByAny(a, [])).toBe(0)
    const left = { ...a, cx: 50 }
    const right = { ...a, cx: 150 }
    expect(coveredByAny(a, [left, right])).toBe(1)
  })
})
