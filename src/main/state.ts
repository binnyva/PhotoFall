import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** What is remembered between runs. Saved in userData/state.json. */
interface AppState {
  /** Absolute path of the last photo or video that fell onto the pile. */
  lastShown?: string
}

const file = (): string => join(app.getPath('userData'), 'state.json')
let state: AppState | null = null
let timer: ReturnType<typeof setTimeout> | null = null

export function getState(): AppState {
  if (!state) {
    try {
      state = JSON.parse(readFileSync(file(), 'utf8')) as AppState
    } catch {
      state = {}
    }
  }
  return state
}

export function flushState(): void {
  if (timer) clearTimeout(timer)
  timer = null
  try {
    writeFileSync(file(), JSON.stringify(getState(), null, 2))
  } catch {
    // Not fatal: the next run just starts from the beginning.
  }
}

/** Records the last shown file. Written shortly after, and on quit, so a crash loses little. */
export function setLastShown(path: string): void {
  getState().lastShown = path
  if (!timer) timer = setTimeout(flushState, 1000)
}
