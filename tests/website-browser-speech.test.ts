import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserSpeechPlayback } from '../website/src/browser-speech'

interface SpeechCallState {
  cancel: number
  pause: number
  resume: number
  speak: number
  utterances: MockSpeechSynthesisUtterance[]
}

class MockSpeechSynthesisUtterance {
  lang = ''
  rate = 1
  pitch = 1
  voice: SpeechSynthesisVoice | null = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null

  constructor(readonly text: string) {}
}

describe('website browser speech playback', () => {
  let calls: SpeechCallState

  beforeEach(() => {
    vi.useFakeTimers()
    calls = { cancel: 0, pause: 0, resume: 0, speak: 0, utterances: [] }

    const voices = [
      { name: 'Microsoft Aria Online', lang: 'en-US', voiceURI: 'voice-aria' },
      { name: 'Microsoft Jenny Online', lang: 'en-US', voiceURI: 'voice-jenny' },
    ] as SpeechSynthesisVoice[]
    const synthesis = {
      getVoices: vi.fn(() => voices),
      speak: vi.fn((utterance: MockSpeechSynthesisUtterance) => {
        calls.speak += 1
        calls.utterances.push(utterance)
        utterance.onstart?.()
      }),
      pause: vi.fn(() => { calls.pause += 1 }),
      resume: vi.fn(() => { calls.resume += 1 }),
      cancel: vi.fn(() => { calls.cancel += 1 }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as SpeechSynthesis
    const browserWindow = {
      speechSynthesis: synthesis,
      setTimeout,
      clearTimeout,
    } as unknown as Window & typeof globalThis

    vi.stubGlobal('window', browserWindow)
    vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('pauses and resumes the same English voice and utterance', () => {
    const playback = new BrowserSpeechPlayback()

    expect(playback.speak('A quiet bedtime story.', {
      lang: 'en-US',
      rate: 0.82,
      pitch: 1,
    })).toBe(true)
    vi.runAllTimers()

    expect(calls.speak).toBe(1)
    expect(calls.utterances).toHaveLength(1)
    expect(calls.utterances[0].voice?.voiceURI).toBe('voice-aria')

    expect(playback.pause()).toBe(true)
    expect(playback.resume()).toBe(true)

    expect(calls.pause).toBe(1)
    expect(calls.resume).toBe(1)
    expect(calls.speak).toBe(1)
    expect(calls.utterances).toHaveLength(1)
    expect(calls.utterances[0].voice?.voiceURI).toBe('voice-aria')
  })
})
