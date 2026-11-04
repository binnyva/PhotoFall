import { fitSize } from '@shared/placement'
import type { MediaItem } from '@shared/types'

export interface LoadedMedia {
  item: MediaItem
  /** Photos: an <img> holding a screen-sized copy. Videos: the video element. */
  el: HTMLImageElement | HTMLVideoElement
  aspect: number
}

const url = (item: MediaItem): string => `photofall://media/${encodeURIComponent(item.id)}`

/** Largest size a photo is shown at, in CSS pixels. Cards may be drawn a little smaller. */
export function photoSize(aspect: number): { w: number; h: number } {
  return fitSize(aspect, window.innerWidth * 0.4, window.innerHeight * 0.44)
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out loading ${what}`)), ms)
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e))
    )
  })
}

/**
 * Draws `source` (cropped to fill) into a w x h canvas at device resolution and returns it as a
 * decoded <img>. Plain images paint together with the card's white border in one layer, unlike a
 * <canvas>, which the GPU keeps as a separate layer and can show a frame before its border.
 */
async function snapshot(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  w: number,
  h: number
): Promise<HTMLImageElement> {
  const dpr = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * dpr))
  canvas.height = Math.max(1, Math.round(h * dpr))
  const ctx = canvas.getContext('2d')
  if (ctx && srcW > 0 && srcH > 0) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const scale = Math.max(canvas.width / srcW, canvas.height / srcH)
    const sw = canvas.width / scale
    const sh = canvas.height / scale
    ctx.drawImage(source, (srcW - sw) / 2, (srcH - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height)
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  canvas.width = canvas.height = 0
  if (!blob) throw new Error('Could not encode photo')
  const img = new Image()
  img.src = URL.createObjectURL(blob)
  await img.decode()
  return img
}

async function loadPhoto(item: MediaItem): Promise<LoadedMedia> {
  const res = await fetch(url(item))
  if (!res.ok) throw new Error(`Can't open ${item.name} (${res.status})`)
  const bitmap = await createImageBitmap(await res.blob(), { imageOrientation: 'from-image' })
  try {
    const aspect = bitmap.width / bitmap.height
    const size = photoSize(aspect)
    const img = await snapshot(bitmap, bitmap.width, bitmap.height, size.w, size.h)
    return { item, el: img, aspect }
  } finally {
    // Free the full-resolution decode (about 48 MB for a 12 MP photo).
    bitmap.close()
  }
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

/** Loads a photo (downscaled to screen size) or the first frame of a video, ready to drop. */
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

/** Frees the screen-sized copy behind a photo <img>. */
export function releaseImage(img: HTMLImageElement): void {
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src)
}

/**
 * Swaps a finished (or hidden) video for a still of its current frame and frees the decoder.
 * The video stays on screen until the still is ready, so nothing blinks.
 */
export async function freezeVideo(video: HTMLVideoElement): Promise<void> {
  video.pause()
  const w = parseFloat(video.style.width) || video.videoWidth
  const h = parseFloat(video.style.height) || video.videoHeight
  try {
    const img = await snapshot(video, video.videoWidth, video.videoHeight, w, h)
    img.className = video.className
    img.style.cssText = video.style.cssText
    if (video.isConnected) video.replaceWith(img)
    else releaseImage(img)
  } catch {
    // Keep the paused video if the frame can't be captured.
    return
  }
  releaseVideo(video)
}

/** Frees whatever a loaded-but-unused item holds (a prefetch that was skipped). */
export function releaseMedia(media: LoadedMedia): void {
  if (media.el instanceof HTMLVideoElement) releaseVideo(media.el)
  else releaseImage(media.el)
}
