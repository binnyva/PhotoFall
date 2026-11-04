import type { Playlist, Settings } from '../shared/types'

export interface PhotoFallApi {
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  getPlaylist(rescan?: boolean): Promise<Playlist>
  chooseFolder(): Promise<string | null>
  exitFullscreen(): Promise<void>
  onOpenSettings(cb: () => void): () => void
  onTogglePause(cb: () => void): () => void
  onNext(cb: () => void): () => void
  onClear(cb: () => void): () => void
}

declare global {
  interface Window {
    photofall: PhotoFallApi
  }
}
