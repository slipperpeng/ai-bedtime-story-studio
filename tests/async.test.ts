import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abortableDelay } from '../src/main/async'

class TrackingAbortSignal {
  aborted = false
  readonly listeners = new Set<EventListenerOrEventListenerObject>()

  addEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.delete(listener)
  }

  abort(): void {
    this.aborted = true
    const event = new Event('abort')
    for (const listener of [...this.listeners]) {
      if (typeof listener === 'function') listener(event)
      else listener.handleEvent(event)
    }
  }
}

describe('abortableDelay', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('removes its abort listener after the timer resolves normally', async () => {
    const tracking = new TrackingAbortSignal()
    const pending = abortableDelay(650, tracking as unknown as AbortSignal)
    expect(tracking.listeners.size).toBe(1)

    await vi.advanceTimersByTimeAsync(650)
    await pending
    expect(tracking.listeners.size).toBe(0)
  })

  it('clears the timer and listener when aborted', async () => {
    const tracking = new TrackingAbortSignal()
    const pending = abortableDelay(650, tracking as unknown as AbortSignal)
    tracking.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(tracking.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
