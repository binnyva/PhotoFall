import type { MediaItem } from '@shared/types'

export interface LoadedMedia {
  item: MediaItem
  el: HTMLImageElement | HTMLVideoElement
  aspect: number
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
  const img = new Image()
  img.decoding = 'async'
  img.src = url(item)
  await img.decode()
  return { item, el: img, aspect: img.naturalWidth / img.naturalHeight }
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
