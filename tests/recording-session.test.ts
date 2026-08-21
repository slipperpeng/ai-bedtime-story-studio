import { describe, expect, it } from 'vitest'
import { RecordingSessionGate, RecordingSignalDetector } from '../src/renderer/src/lib/recording-session'

describe('recording session gate', () => {
  it('claims the permission request synchronously so a second start is ignored', () => {
    const gate = new RecordingSessionGate()

    const first = gate.begin()

    expect(first).toBeTypeOf('number')
    expect(gate.phase).toBe('starting')
    expect(gate.begin()).toBeUndefined()
    expect(gate.transition(first!, 'recording')).toBe(true)
    expect(gate.begin()).toBeUndefined()
    expect(gate.transition(first!, 'processing')).toBe(true)
    expect(gate.begin()).toBeUndefined()
    expect(gate.release(first!)).toBe(true)
    expect(gate.phase).toBe('idle')
    expect(gate.begin()).toBeTypeOf('number')
  })

  it('invalidates a pending permission result when its owner is cancelled', () => {
    const gate = new RecordingSessionGate()
    const stale = gate.begin()!

    gate.cancel()

    expect(gate.phase).toBe('idle')
    expect(gate.isCurrent(stale)).toBe(false)
    expect(gate.transition(stale, 'recording')).toBe(false)
    expect(gate.release(stale)).toBe(false)

    const current = gate.begin()!
    expect(current).not.toBe(stale)
    expect(gate.isCurrent(current)).toBe(true)
  })
})

describe('recording signal detector', () => {
  it('terminates a capture that never receives audible microphone input', () => {
    const detector = new RecordingSignalDetector(1_000, { noInputTimeoutMs: 5_000 })

    expect(detector.observe(0.002, 5_999).action).toBe('continue')
    const result = detector.observe(0.002, 6_000)

    expect(result.action).toBe('no-input')
    expect(result.heardSpeech).toBe(false)
    expect(result.speechMs).toBe(0)
  })

  it('does not let a brief noise bypass the no-input timeout', () => {
    const detector = new RecordingSignalDetector(0, { noInputTimeoutMs: 5_000 })

    expect(detector.observe(0.05, 100).heardSpeech).toBe(true)
    expect(detector.observe(0, 4_999).action).toBe('continue')
    expect(detector.observe(0, 5_000).action).toBe('no-input')
  })

  it('completes after enough speech followed by a deliberate pause', () => {
    const detector = new RecordingSignalDetector(0, {
      audibleThreshold: 0.01,
      minimumSpeechMs: 1_000,
      trailingSilenceMs: 1_500,
    })

    for (let time = 100; time <= 1_200; time += 100) {
      expect(detector.observe(0.05, time).action).toBe('continue')
    }
    expect(detector.observe(0, 2_699).action).toBe('continue')
    const result = detector.observe(0, 2_700)

    expect(result.action).toBe('complete')
    expect(result.heardSpeech).toBe(true)
    expect(result.speechMs).toBeGreaterThanOrEqual(1_000)
  })

  it('normalizes invalid levels and caps the visual meter', () => {
    const detector = new RecordingSignalDetector(0)

    expect(detector.observe(Number.NaN, 16).levelPercent).toBe(0)
    expect(detector.observe(10, 32).levelPercent).toBe(100)
  })
})
