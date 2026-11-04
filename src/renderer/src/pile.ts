import { coveredByAny, placeCard, type CardRect } from '@shared/placement'
import { PILE_LIMIT, type MediaItem } from '@shared/types'
import { freezeVideo, photoSize, releaseImage, releaseVideo, type LoadedMedia } from './media'

interface Card {
  el: HTMLDivElement
  rect: CardRect
  item: MediaItem
  video: HTMLVideoElement | null
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function captionFor(item: MediaItem): string {
  const when = item.takenAt ?? (item.createdAt > 0 ? item.createdAt : null)
  return when ? dateFormat.format(new Date(when)) : ''
}

/** The stack of Polaroids on screen, newest last in the DOM (and so on top). */
export class Pile {
  private cards: Card[] = []

  constructor(private readonly table: HTMLElement) {}

  /** Drops a card onto the pile and resolves when it has landed. */
  drop(media: LoadedMedia): { card: HTMLDivElement; landed: Promise<void> } {
    const W = window.innerWidth
    const H = window.innerHeight
    const photo = photoSize(media.aspect)
    // Polaroid proportions: side borders about 5% of the photo width, a deeper strip at the bottom
    const side = Math.round(Math.max(10, photo.w * 0.05))
    const strip = Math.round(Math.max(36, photo.h * 0.16))
    const cardW = photo.w + side * 2
    const cardH = photo.h + side + strip

    const previous = this.cards
      .slice()
      .reverse()
      .map((c) => c.rect)
    const place = placeCard({ screenW: W, screenH: H, cardW, cardH, previous, maxCoverage: 0.12 })
    const s = place.scale
    const rect: CardRect = { cx: place.cx, cy: place.cy, w: cardW * s, h: cardH * s, angle: place.angle }

    const el = document.createElement('div')
    el.className = 'card'
    el.style.width = `${rect.w}px`
    el.style.height = `${rect.h}px`
    el.style.left = `${rect.cx - rect.w / 2}px`
    el.style.top = `${rect.cy - rect.h / 2}px`
    el.style.padding = `${side * s}px ${side * s}px 0`
    el.style.transform = `rotate(${rect.angle}deg)`

    const m = media.el
    m.classList.add('photo')
    m.style.width = `${photo.w * s}px`
    m.style.height = `${photo.h * s}px`
    el.appendChild(m)

    const caption = document.createElement('div')
    caption.className = 'caption'
    caption.style.height = `${strip * s}px`
    caption.style.fontSize = `${Math.round(strip * s * 0.42)}px`
    caption.textContent = captionFor(media.item)
    el.appendChild(caption)

    this.table.appendChild(el)
    const video = m instanceof HTMLVideoElement ? m : null
    const card: Card = { el, rect, item: media.item, video }
    this.cards.push(card)
    // A video plays once; when it ends, keep a still of its last frame and free the decoder.
    video?.addEventListener('ended', () => this.freeze(card), { once: true })

    // Old cards are removed only after the new one lands: changing the stack mid-fall
    // makes the compositor rebuild its layers, which shows up as flicker.
    const landed = this.animateFall(el, rect).then(() => {
      this.afterLanding()
      this.trim()
    })
    return { card: el, landed }
  }

  /** Dropped from above the table: starts larger and higher, tilts into place, settles with a small bounce. */
  private animateFall(el: HTMLElement, rect: CardRect): Promise<void> {
    const spin = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10)
    const driftX = (Math.random() - 0.5) * 80
    const final = `rotate(${rect.angle}deg)`

    // The deep "held above the table" shadow is its own layer that fades out, so the fall only
    // animates transform and opacity, which the GPU handles without repainting the card.
    const lift = document.createElement('div')
    lift.className = 'lift-shadow'
    el.appendChild(lift)

    const timing = { duration: 950, easing: 'cubic-bezier(0.45, 0, 0.75, 0.6)' }
    const card = el.animate(
      [
        { transform: `translate(${driftX}px, -70px) rotate(${rect.angle + spin}deg) scale(1.32)`, opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.12 },
        { transform: `${final} scale(0.975)`, offset: 0.78, easing: 'ease-out' },
        { transform: `${final} scale(1.006)`, offset: 0.9 },
        { transform: `${final} scale(1)` }
      ],
      timing
    )
    lift.animate([{ opacity: 1 }, { opacity: 0, offset: 0.78 }, { opacity: 0 }], { ...timing, fill: 'forwards' })

    // Nothing about the card's layers changes when it lands (the faded shadow stays, invisible),
    // so the GPU never has to re-draw a card that is already on screen.
    return card.finished.then(
      () => undefined,
      () => undefined
    )
  }

  /** Pauses videos that are now mostly hidden under newer cards. */
  private afterLanding(): void {
    this.cards.forEach((c, i) => {
      if (!c.video || c.video.paused || c.video.ended) return
      const above = this.cards.slice(i + 1).map((x) => x.rect)
      if (coveredByAny(c.rect, above) > 0.6) this.freeze(c)
    })
  }

  private freeze(card: Card): void {
    if (!card.video) return
    void freezeVideo(card.video)
    card.video = null
  }

  private release(card: Card): void {
    if (card.video) releaseVideo(card.video)
    card.el.querySelectorAll('img').forEach(releaseImage)
    card.el.remove()
  }

  /** Keeps the DOM small: removes the oldest cards beyond the pile limit. */
  private trim(): void {
    while (this.cards.length > PILE_LIMIT) {
      const old = this.cards.shift()
      if (!old) break
      this.release(old)
    }
  }

  playingVideos(): HTMLVideoElement[] {
    return this.cards.flatMap((c) => (c.video && !c.video.paused && !c.video.ended ? [c.video] : []))
  }

  clear(): void {
    for (const c of this.cards) {
      this.release(c)
    }
    this.cards = []
  }
}
