import { RESUME_PILE, VIDEO_HOLD_SECONDS, type MediaItem, type Playlist, type Settings } from '@shared/types'
import { loadMedia, releaseMedia, type LoadedMedia } from './media'
import { mapLimit } from './util'
import { Pile } from './pile'
import { PausableTimer } from './timer'

export interface SlideshowEvents {
  onNotice(html: string | null): void
  onPausedChange(paused: boolean): void
}

/**
 * Drives the show: picks the next item, drops it on the pile, and waits.
 * Photos wait `delaySeconds`. Videos play once; the next card falls 3 s after a video lands
 * (or when it ends, if sooner) and the video keeps playing underneath.
 */
export class Slideshow {
  private playlist: Playlist = { folder: '', items: [] }
  private index = 0
  private timer = new PausableTimer()
  private paused = false
  private userPaused = false
  private stepping = false
  private generation = 0
  private prefetch: { item: MediaItem; p: Promise<LoadedMedia> } | null = null
  private resumeVideos: HTMLVideoElement[] = []
  /** Identifies the card the current wait belongs to, so an old video ending can't skip ahead. */
  private waitToken = 0

  constructor(
    private readonly pile: Pile,
    private settings: Settings,
    private readonly events: SlideshowEvents
  ) {}

  updateSettings(s: Settings): void {
    this.settings = s
  }

  /** (Re)loads the playlist and starts from its first item. Keeps the cards already on the table. */
  async restart(rescan = false): Promise<void> {
    const gen = ++this.generation
    this.timer.cancel()
    this.dropPrefetch()
    this.events.onNotice('Loading photos…')
    const playlist = await window.photofall.getPlaylist(rescan)
    if (gen !== this.generation) return
    this.playlist = playlist
    this.index = 0
    if (playlist.error) {
      this.events.onNotice(`Can't open <strong>${escapeHtml(playlist.folder)}</strong><br>${escapeHtml(playlist.error)}`)
      return
    }
    if (playlist.items.length === 0) {
      this.events.onNotice(`No photos or videos in <strong>${escapeHtml(playlist.folder)}</strong>`)
      return
    }
    // Pick up where the last run stopped: the photo shown last falls first.
    if (playlist.resumeIndex !== undefined) {
      if (this.pile.size === 0) {
        // Fresh table (app launch): re-show the last photo on top of the 10 before it.
        this.index = playlist.resumeIndex
        await this.layResumePile(gen)
      } else {
        // Re-sorted mid-show: carry on with the photo after the current one.
        this.index = playlist.resumeIndex + 1
      }
      if (gen !== this.generation) return
    }
    this.events.onNotice(null)
    void this.step()
  }

  /** Lays the photos that came before the resume point onto the table at once, oldest first. */
  private async layResumePile(gen: number): Promise<void> {
    const items = this.playlist.items
    const count = Math.min(RESUME_PILE, items.length - 1)
    if (count <= 0) return
    const before: MediaItem[] = []
    for (let k = count; k >= 1; k--) before.push(items[(this.index - k + items.length) % items.length])
    const loaded = await mapLimit(before, 3, (item) => loadMedia(item).catch(() => null))
    for (const media of loaded) {
      if (!media) continue
      if (gen !== this.generation) {
        releaseMedia(media)
        continue
      }
      this.pile.drop(media, false)
    }
  }

  togglePause(): void {
    this.userPaused = !this.userPaused
    this.setPaused(this.userPaused)
    this.events.onPausedChange(this.userPaused)
  }

  /** Pauses without showing the paused badge (used while settings are open). */
  hold(on: boolean): void {
    this.setPaused(on || this.userPaused)
  }

  next(): void {
    if (this.playlist.items.length === 0) return
    this.timer.cancel()
    if (this.paused) {
      this.userPaused = false
      this.setPaused(false)
      this.events.onPausedChange(false)
    }
    void this.step()
  }

  private setPaused(on: boolean): void {
    if (on === this.paused) return
    this.paused = on
    if (on) {
      this.timer.pause()
      this.resumeVideos = this.pile.playingVideos()
      this.resumeVideos.forEach((v) => v.pause())
    } else {
      this.resumeVideos.forEach((v) => void v.play().catch(() => undefined))
      this.resumeVideos = []
      if (this.timer.pending) this.timer.resume()
      else void this.step()
    }
  }

  private async nextItem(): Promise<MediaItem> {
    if (this.index >= this.playlist.items.length) {
      this.index = 0
      // Random order gets a fresh shuffle on every loop.
      if (this.settings.sortBy === 'random') {
        const fresh = await window.photofall.getPlaylist(false)
        if (fresh.items.length > 0) this.playlist = fresh
      }
    }
    return this.playlist.items[this.index++]
  }

  private load(item: MediaItem): Promise<LoadedMedia> {
    if (this.prefetch?.item.id === item.id) {
      const p = this.prefetch.p
      this.prefetch = null
      return p
    }
    return loadMedia(item)
  }

  private dropPrefetch(): void {
    const old = this.prefetch
    this.prefetch = null
    old?.p.then(releaseMedia).catch(() => undefined)
  }

  private async step(): Promise<void> {
    if (this.stepping || this.paused) return
    this.stepping = true
    const gen = this.generation
    try {
      let media: LoadedMedia | null = null
      for (let tries = 0; tries < Math.min(this.playlist.items.length, 50) && !media; tries++) {
        const item = await this.nextItem()
        media = await this.load(item).catch((err) => {
          console.warn('Skipping', item.name, err)
          return null
        })
      }
      if (gen !== this.generation) return
      if (!media) {
        this.events.onNotice('None of these files could be opened.')
        return
      }

      const video = media.el instanceof HTMLVideoElement ? media.el : null
      if (video) {
        video.muted = !this.settings.videoSound
        void video.play().catch(() => {
          // Autoplay with sound refused: fall back to muted.
          video.muted = true
          void video.play().catch(() => undefined)
        })
      }
      const { landed } = this.pile.drop(media)
      window.photofall.reportShown(media.item.id)
      this.queuePrefetch()
      await landed
      if (gen !== this.generation) return

      const token = ++this.waitToken
      if (video) {
        const advance = (): void => {
          if (token === this.waitToken && this.timer.pending && !this.paused) {
            this.timer.cancel()
            void this.step()
          }
        }
        this.timer.start(VIDEO_HOLD_SECONDS * 1000, () => void this.step())
        video.addEventListener('ended', advance, { once: true })
        if (video.ended) advance()
      } else {
        this.timer.start(this.settings.delaySeconds * 1000, () => void this.step())
      }
      if (this.paused) this.timer.pause()
    } finally {
      this.stepping = false
    }
  }

  private queuePrefetch(): void {
    const items = this.playlist.items
    if (items.length === 0) return
    const next = items[this.index % items.length]
    if (this.settings.sortBy === 'random' && this.index >= items.length) return // reshuffled next loop
    this.dropPrefetch()
    const p = loadMedia(next)
    p.catch(() => undefined)
    this.prefetch = { item: next, p }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
