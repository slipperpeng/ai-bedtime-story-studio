import { describe, expect, it } from 'vitest'
import {
  analyzeAudioActivity,
  encodePcm16Wav,
  guidedSampleIssue,
  guidedSegmentIssue,
  mergeMonoWavSegments,
  recordedAudioIssue,
} from '../src/renderer/src/lib/audio'

describe('audio activity analysis', () => {
  it('distinguishes silence from sustained useful signal', () => {
    const sampleRate = 1_000
    const samples = new Float32Array(5_000)
    for (let index = 1_000; index < 4_000; index += 1) {
      samples[index] = Math.sin(index / 4) * 0.12
    }

    const activity = analyzeAudioActivity(samples, sampleRate)

    expect(activity.durationMs).toBe(5_000)
    expect(activity.speechMs).toBeGreaterThanOrEqual(2_900)
    expect(activity.speechMs).toBeLessThanOrEqual(3_100)
    expect(activity.peak).toBeGreaterThan(0.1)
    expect(analyzeAudioActivity(new Float32Array(5_000), sampleRate).speechMs).toBe(0)
  })

  it('enforces per-segment and combined guided-sample thresholds', () => {
    expect(guidedSegmentIssue({ durationMs: 2_000, speechMs: 1_500 })).toContain('太短')
    expect(guidedSegmentIssue({ durationMs: 3_000, speechMs: 500 })).toContain('有效声音')
    expect(guidedSegmentIssue({ durationMs: 3_000, speechMs: 1_500 })).toBeUndefined()
    expect(guidedSampleIssue({ durationMs: 10_000, speechMs: 4_000 })).toContain('4.5 秒')
    expect(guidedSampleIssue({ durationMs: 10_000, speechMs: 5_000 })).toBeUndefined()
    expect(recordedAudioIssue({ speechMs: 0 })).toContain('清晰人声')
    expect(recordedAudioIssue({ speechMs: 500 })).toBeUndefined()
  })
})

describe('WAV segment merging', () => {
  it('joins canonical mono PCM recordings with a silent gap', () => {
    const first = encodePcm16Wav(new Float32Array(1_000).fill(0.25), 1_000)
    const second = encodePcm16Wav(new Float32Array(500).fill(-0.25), 1_000)

    const merged = mergeMonoWavSegments([first, second], 250)
    const view = new DataView(merged.buffer, merged.byteOffset, merged.byteLength)

    expect(merged.byteLength).toBe(44 + 1_750 * 2)
    expect(view.getUint32(24, true)).toBe(1_000)
    expect(view.getUint32(40, true)).toBe(1_750 * 2)
    expect(view.getInt16(44 + 1_100 * 2, true)).toBe(0)
    expect(view.getInt16(44 + 1_300 * 2, true)).toBeLessThan(0)
  })

  it('rejects incompatible or malformed inputs', () => {
    const oneKhz = encodePcm16Wav(new Float32Array(10), 1_000)
    const twoKhz = encodePcm16Wav(new Float32Array(10), 2_000)

    expect(() => mergeMonoWavSegments([], 250)).toThrow('至少需要')
    expect(() => mergeMonoWavSegments([oneKhz, twoKhz], 250)).toThrow('采样率')
    expect(() => mergeMonoWavSegments([new Uint8Array([1, 2, 3])], 250)).toThrow('有效的 WAV')
  })
})
