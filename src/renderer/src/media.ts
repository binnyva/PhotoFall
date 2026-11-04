import type { MediaItem } from '@shared/types'

export interface LoadedMedia {
  item: MediaItem
  /** Photos: an empty canvas the pile sizes and paints from `bitmap`. Videos: the video. */
  el: HTMLCanvasElement | HTMLVideoElement
  aspect: number
  /** Full-size decoded photo, held only until the card is painted, then closed. */
  bitmap?: ImageBitmap
}

const url = (item: MediaItem): string => `photofall://media/${encodeURIComponent(item.id)}`

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out loading ${what}`)), ms)
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e))
    )
  })
}

async function loadPhoto(item: MediaItem): Promise<LoadedMedia> {
  const res = await fetch(url(item))
  if (!res.ok) throw new Error(`Can't open ${item.name} (${res.status})`)
  const bitmap = await createImageBitmap(await res.blob(), { imageOrientation: 'from-image' })
  const canvas = document.createElement('canvas')
  return { item, el: canvas, aspect: bitmap.width / bitmap.height, bitmap }
}

async function loadVideo(item: MediaItem): Promise<LoadedMedia> {
  const video = document.createElement('video')
  video.preload = 'auto'
  video.playsInline = true
  video.loop = false
  video.muted = true
  await new Promise<void>((resolve, reject) => {
    video.addEventListener('loadeddata', () => resolve(), { once: true })
    video.addEventListener('error', () => reject(new Error(`Can't play ${item.name}`)), { once: true })
    video.src = url(item)
  })
  return { item, el: video, aspect: video.videoWidth / video.videoHeight }
}

/** Loads and decodes a photo or the first frame of a video, ready to drop onto the pile. */
export function loadMedia(item: MediaItem): Promise<LoadedMedia> {
  const p = item.kind === 'video' ? loadVideo(item) : loadPhoto(item)
  return withTimeout(p, 20000, item.name)
}

/** Stops a video and lets Chromium free its decoder and buffers. */
export function releaseVideo(video: HTMLVideoElement): void {
  video.pause()
  video.removeAttribute('src')
  video.load()
}

/**
 * Paints a photo into its card's canvas at the size it is shown (times the screen's pixel ratio)
 * and frees the full-size decode. A 12 MP photo drops from about 48 MB to a few MB this way.
 */
export function paintPhoto(media: LoadedMedia, cssW: number, cssH: number): void {
  const canvas = media.el as HTMLCanvasElement
  const bitmap = media.bitmap
  if (!bitmap) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(cssW * dpr))
  canvas.height = Math.max(1, Math.round(cssH * dpr))
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    // Crop to fill, like object-fit: cover
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height)
    const sw = canvas.width / scale
    const sh = canvas.height / scale
    ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height)
  }
  bitmap.close()
  media.bitmap = undefined
}

/**
 * Swaps a finished (or hidden) video for a still of its current frame and frees the decoder.
 * Returns the canvas that replaced it.
 */
export function freezeVideo(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.className = video.className
  canvas.style.cssText = video.style.cssText
  const dpr = window.devicePixelRatio || 1
  const w = parseFloat(video.style.width) || video.videoWidth
  const h = parseFloat(video.style.height) || video.videoHeight
  canvas.width = Math.max(1, Math.round(w * dpr))
  canvas.height = Math.max(1, Math.round(h * dpr))
  const ctx = canvas.getContext('2d')
  if (ctx && video.videoWidth > 0) {
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
    const sw = canvas.width / scale
    const sh = canvas.height / scale
    try {
      ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height)
    } catch {
      // Leave the canvas blank if the frame can't be read.
    }
  }
  video.replaceWith(canvas)
  releaseVideo(video)
  return canvas
}

/** Frees whatever a loaded-but-unused item holds (a prefetch that was skipped). */
export function releaseMedia(media: LoadedMedia): void {
  media.bitmap?.close()
  media.bitmap = undefined
  if (media.el instanceof HTMLVideoElement) releaseVideo(media.el)
}
