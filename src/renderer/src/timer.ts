/** A one-shot timer that can be paused and resumed. */
export class PausableTimer {
  private handle: ReturnType<typeof setTimeout> | null = null
  private remaining = 0
  private startedAt = 0
  private fn: (() => void) | null = null

  start(ms: number, fn: () => void): void {
    this.cancel()
    this.fn = fn
    this.remaining = ms
    this.resume()
  }

  pause(): void {
    if (!this.handle) return
    clearTimeout(this.handle)
    this.handle = null
    this.remaining -= performance.now() - this.startedAt
  }

  resume(): void {
    if (this.handle || !this.fn) return
    this.startedAt = performance.now()
    this.handle = setTimeout(() => {
      const fn = this.fn
      this.handle = null
      this.fn = null
      fn?.()
    }, Math.max(0, this.remaining))
  }

  cancel(): void {
    if (this.handle) clearTimeout(this.handle)
    this.handle = null
    this.fn = null
  }

  get pending(): boolean {
    return this.fn !== null
  }
}
