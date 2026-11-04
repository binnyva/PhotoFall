/** A card on the table: centre point, size and tilt, all in screen pixels / degrees. */
export interface CardRect {
  cx: number
  cy: number
  w: number
  h: number
  angle: number
}

export interface PlaceOptions {
  screenW: number
  screenH: number
  cardW: number
  cardH: number
  /** The cards the new one must not cover, newest first. Only the first `protect` are used. */
  previous: CardRect[]
  protect?: number
  candidates?: number
  /** Coverage of a protected card that counts as "not covering it". */
  maxCoverage?: number
  maxTilt?: number
  rng?: () => number
}

/** True if point (px, py) lies inside the rotated rectangle. */
export function containsPoint(r: CardRect, px: number, py: number): boolean {
  const rad = (-r.angle * Math.PI) / 180
  const dx = px - r.cx
  const dy = py - r.cy
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad)
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad)
  return Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2
}

/** Fraction (0..1) of `under` that `over` covers, estimated on a grid of sample points. */
export function coverage(under: CardRect, over: CardRect, samples = 12): number {
  const rad = (under.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  let hit = 0
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const lx = ((i + 0.5) / samples - 0.5) * under.w
      const ly = ((j + 0.5) / samples - 0.5) * under.h
      const px = under.cx + lx * cos - ly * sin
      const py = under.cy + lx * sin + ly * cos
      if (containsPoint(over, px, py)) hit++
    }
  }
  return hit / (samples * samples)
}

export interface Placement extends CardRect {
  /** Scale applied to the requested card size (1 = as asked; smaller when space was tight). */
  scale: number
}

/** Fraction (0..1) of `under` hidden by the union of `overs`. */
export function coveredByAny(under: CardRect, overs: CardRect[], samples = 12): number {
  if (overs.length === 0) return 0
  const rad = (under.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  let hit = 0
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const lx = ((i + 0.5) / samples - 0.5) * under.w
      const ly = ((j + 0.5) / samples - 0.5) * under.h
      const px = under.cx + lx * cos - ly * sin
      const py = under.cy + lx * sin + ly * cos
      if (overs.some((o) => containsPoint(o, px, py))) hit++
    }
  }
  return hit / (samples * samples)
}

/**
 * Picks where the next card lands. Tries a grid of spots plus random ones, each with a random
 * tilt, and scores each by the worst coverage of the protected (most recent) cards. Returns a
 * random spot that stays under `maxCoverage`. When no spot does, it tries again with the card
 * shrunk a little, and finally returns the least-covering spot it found.
 */
export function placeCard(opts: PlaceOptions): Placement {
  const scales = [1, 0.9, 0.8]
  let fallback: { rect: CardRect; score: number; scale: number } | null = null
  for (const scale of scales) {
    const { good, best, bestScore } = tryPlace(opts, scale)
    if (good.length > 0) {
      // Prefer a spot that still leaves room for the card after this one, so the pile
      // doesn't paint itself into a corner.
      const rng = opts.rng ?? Math.random
      const order = good.map((c) => ({ c, k: rng() })).sort((a, b) => a.k - b.k).map((x) => x.c)
      const protect = opts.protect ?? 2
      for (const c of order.slice(0, 12)) {
        const ahead = tryPlace({ ...opts, previous: [c, ...opts.previous].slice(0, protect), candidates: 20 }, 1, 6)
        if (ahead.good.length > 0) return { ...c, scale }
      }
      return { ...order[0], scale }
    }
    if (!fallback || bestScore < fallback.score) fallback = { rect: best, score: bestScore, scale }
  }
  const f = fallback as { rect: CardRect; score: number; scale: number }
  return { ...f.rect, scale: f.scale }
}

function tryPlace(
  opts: PlaceOptions,
  scale: number,
  samples = 10
): { good: CardRect[]; best: CardRect; bestScore: number } {
  const {
    screenW,
    screenH,
    previous,
    protect = 2,
    candidates = 60,
    maxCoverage = 0.1,
    maxTilt = 8,
    rng = Math.random
  } = opts
  const cardW = opts.cardW * scale
  const cardH = opts.cardH * scale
  const guarded = previous.slice(0, protect)
  const marginX = screenW * 0.02
  const marginY = screenH * 0.02
  const minX = Math.min(cardW / 2 + marginX, screenW / 2)
  const maxX = Math.max(screenW - cardW / 2 - marginX, screenW / 2)
  const minY = Math.min(cardH / 2 + marginY, screenH / 2)
  const maxY = Math.max(screenH - cardH / 2 - marginY, screenH / 2)

  const spots: Array<[number, number]> = []
  const gx = 7
  const gy = 5
  for (let i = 0; i < gx; i++) {
    for (let j = 0; j < gy; j++) spots.push([i / (gx - 1), j / (gy - 1)])
  }
  for (let i = 0; i < candidates; i++) spots.push([rng(), rng()])

  let best: CardRect | null = null
  let bestScore = Infinity
  const good: CardRect[] = []
  for (const [fx, fy] of spots) {
    const c: CardRect = {
      cx: minX + fx * (maxX - minX),
      cy: minY + fy * (maxY - minY),
      w: cardW,
      h: cardH,
      angle: (rng() * 2 - 1) * maxTilt
    }
    const score = guarded.reduce((worst, p) => Math.max(worst, coverage(p, c, samples)), 0)
    if (score <= maxCoverage) good.push(c)
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  return { good, best: best as CardRect, bestScore }
}

/** Fits a photo of the given aspect ratio inside a max box, returning its displayed size. */
export function fitSize(aspect: number, maxW: number, maxH: number): { w: number; h: number } {
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3
  let w = maxW
  let h = w / safe
  if (h > maxH) {
    h = maxH
    w = h * safe
  }
  return { w: Math.round(w), h: Math.round(h) }
}
