import { Buffer } from 'node:buffer'

interface ParsedWav {
  readonly sampleRate: number
  readonly samples: Float32Array
}

export function assertMergeablePcmWav(segment: Uint8Array): void {
  parsePcmWav(segment)
}

/** Merge mono/stereo PCM16/24/32 WAV files and insert per-boundary silence. */
export function mergePcmWavSegments(segments: Uint8Array[], gapMs: number | number[] = 0): Buffer {
  if (!segments.length) throw new Error('至少需要一段 WAV 音频。')
  const parsed = segments.map(parsePcmWav)
  const sampleRate = parsed[0].sampleRate
  if (parsed.some((item) => item.sampleRate !== sampleRate)) {
    throw new Error('待拼接的朗读音频采样率不一致。')
  }
  const gaps = Array.isArray(gapMs) ? gapMs : parsed.slice(1).map(() => gapMs)
  if (gaps.length !== parsed.length - 1 || gaps.some((value) => !Number.isFinite(value) || value < 0 || value > 2_000)) {
    throw new Error('朗读场景之间的过渡停顿无效。')
  }
  const totalFrames = parsed.reduce((sum, item) => sum + item.samples.length, 0)
    + gaps.reduce((sum, value) => sum + Math.round((value / 1_000) * sampleRate), 0)
  const combined = new Float32Array(totalFrames)
  let offset = 0
  parsed.forEach((item, index) => {
    combined.set(item.samples, offset)
    offset += item.samples.length
    if (index < gaps.length) offset += Math.round((gaps[index] / 1_000) * sampleRate)
  })
  return encodePcm16Wav(combined, sampleRate)
}

function parsePcmWav(bytes: Uint8Array): ParsedWav {
  if (bytes.byteLength < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 12) !== 'WAVE') {
    throw new Error('MiniMax 返回的朗读不是有效的 WAV 文件。')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  let format = 0
  let channels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  let dataOffset = -1
  let dataLength = 0
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset, offset + 4)
    const length = view.getUint32(offset + 4, true)
    const content = offset + 8
    if (content + length > bytes.byteLength) throw new Error('朗读 WAV 数据不完整。')
    if (id === 'fmt ' && length >= 16) {
      format = view.getUint16(content, true)
      channels = view.getUint16(content + 2, true)
      sampleRate = view.getUint32(content + 4, true)
      bitsPerSample = view.getUint16(content + 14, true)
    } else if (id === 'data') {
      dataOffset = content
      dataLength = length
    }
    offset = content + length + (length % 2)
  }
  if (format !== 1 || ![1, 2].includes(channels) || ![16, 24, 32].includes(bitsPerSample)
    || !sampleRate || dataOffset < 0 || dataLength <= 0) {
    throw new Error('朗读 WAV 必须是单声道或双声道 PCM 音频。')
  }
  const bytesPerSample = bitsPerSample / 8
  const frameBytes = bytesPerSample * channels
  if (dataLength % frameBytes !== 0) throw new Error('朗读 WAV 音频帧不完整。')
  const samples = new Float32Array(dataLength / frameBytes)
  for (let frame = 0; frame < samples.length; frame += 1) {
    let sum = 0
    for (let channel = 0; channel < channels; channel += 1) {
      const position = dataOffset + frame * frameBytes + channel * bytesPerSample
      sum += readSample(view, position, bitsPerSample)
    }
    samples[frame] = sum / channels
  }
  return { sampleRate, samples }
}

function readSample(view: DataView, offset: number, bitsPerSample: number): number {
  if (bitsPerSample === 16) {
    const value = view.getInt16(offset, true)
    return value < 0 ? value / 0x8000 : value / 0x7fff
  }
  if (bitsPerSample === 24) {
    const b0 = view.getUint8(offset)
    const b1 = view.getUint8(offset + 1)
    const b2 = view.getInt8(offset + 2)
    const value = b0 | (b1 << 8) | (b2 << 16)
    return value < 0 ? value / 0x800000 : value / 0x7fffff
  }
  const value = view.getInt32(offset, true)
  return value < 0 ? value / 0x80000000 : value / 0x7fffffff
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number): Buffer {
  const output = Buffer.allocUnsafe(44 + samples.length * 2)
  output.write('RIFF', 0, 'ascii')
  output.writeUInt32LE(36 + samples.length * 2, 4)
  output.write('WAVE', 8, 'ascii')
  output.write('fmt ', 12, 'ascii')
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(1, 22)
  output.writeUInt32LE(sampleRate, 24)
  output.writeUInt32LE(sampleRate * 2, 28)
  output.writeUInt16LE(2, 32)
  output.writeUInt16LE(16, 34)
  output.write('data', 36, 'ascii')
  output.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((sample, index) => {
    const limited = Math.max(-1, Math.min(1, sample))
    output.writeInt16LE(Math.round(limited < 0 ? limited * 0x8000 : limited * 0x7fff), 44 + index * 2)
  })
  return output
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset + start, end - start).toString('ascii')
}
