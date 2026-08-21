import { describe, expect, it } from 'vitest'
import { assertMergeablePcmWav, mergePcmWavSegments } from '../src/main/services/audio-merge'

describe('PCM WAV scene merge', () => {
  it('downmixes stereo, inserts exact silence and emits mono PCM16 WAV', () => {
    const first = pcm16Wav([1_000, -1_000, 2_000, -2_000], 1_000, 2)
    const second = pcm16Wav([3_000, -3_000], 1_000, 1)
    const merged = mergePcmWavSegments([first, second], [250])

    expect(merged.toString('ascii', 0, 4)).toBe('RIFF')
    expect(merged.toString('ascii', 8, 12)).toBe('WAVE')
    expect(merged.readUInt16LE(20)).toBe(1)
    expect(merged.readUInt16LE(22)).toBe(1)
    expect(merged.readUInt32LE(24)).toBe(1_000)
    expect(merged.readUInt16LE(34)).toBe(16)
    expect(merged.readUInt32LE(40)).toBe(508)
    expect(merged.readInt16LE(44)).toBe(0)
    expect(merged.readInt16LE(46)).toBe(0)
    expect(merged.subarray(48, 548).every((value) => value === 0)).toBe(true)
    expect(merged.readInt16LE(548)).toBe(3_000)
    expect(merged.readInt16LE(550)).toBe(-3_000)
  })

  it('rejects incompatible sample rates and invalid transition plans', () => {
    const first = pcm16Wav([1], 16_000, 1)
    const second = pcm16Wav([1], 24_000, 1)

    expect(() => mergePcmWavSegments([first, second], [300])).toThrow('采样率不一致')
    expect(() => mergePcmWavSegments([first, first], [])).toThrow('过渡停顿无效')
  })

  it('validates cached scene audio before it is reused', () => {
    expect(() => assertMergeablePcmWav(pcm16Wav([1, -1], 44_100, 1))).not.toThrow()
    expect(() => assertMergeablePcmWav(Buffer.from('not a wav'))).toThrow('不是有效的 WAV')
  })
})

function pcm16Wav(samples: number[], sampleRate: number, channels: 1 | 2): Buffer {
  if (samples.length % channels !== 0) throw new Error('test samples must contain complete frames')
  const output = Buffer.alloc(44 + samples.length * 2)
  output.write('RIFF', 0, 'ascii')
  output.writeUInt32LE(output.length - 8, 4)
  output.write('WAVE', 8, 'ascii')
  output.write('fmt ', 12, 'ascii')
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(channels, 22)
  output.writeUInt32LE(sampleRate, 24)
  output.writeUInt32LE(sampleRate * channels * 2, 28)
  output.writeUInt16LE(channels * 2, 32)
  output.writeUInt16LE(16, 34)
  output.write('data', 36, 'ascii')
  output.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((sample, index) => output.writeInt16LE(sample, 44 + index * 2))
  return output
}
