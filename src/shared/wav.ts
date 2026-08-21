export interface NormalizedVoiceWavInfo {
  durationMs: number
  speechMs: number
  peak: number
  rms: number
}

const NORMALIZED_SAMPLE_RATE = 24_000
const NORMALIZED_CHANNELS = 1
const NORMALIZED_BITS_PER_SAMPLE = 16
const PCM_FORMAT = 1

export function inspectNormalizedVoiceWav(bytes: Uint8Array): NormalizedVoiceWavInfo {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 44) {
    throw new Error('声音样本不是完整的 WAV 文件。')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 12) !== 'WAVE') {
    throw new Error('声音样本不是有效的 RIFF/WAVE 文件。')
  }
  if (view.getUint32(4, true) + 8 !== bytes.byteLength) {
    throw new Error('声音样本的 WAV 文件长度无效。')
  }

  let formatFound = false
  let dataOffset = -1
  let dataLength = 0
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const chunkId = ascii(bytes, offset, offset + 4)
    const chunkLength = view.getUint32(offset + 4, true)
    const contentOffset = offset + 8
    const contentEnd = contentOffset + chunkLength
    if (contentEnd > bytes.byteLength) throw new Error('声音样本包含损坏的 WAV 数据块。')
    if (chunkId === 'fmt ') {
      if (formatFound || chunkLength < 16) throw new Error('声音样本的 WAV 格式信息无效。')
      formatFound = true
      const encoding = view.getUint16(contentOffset, true)
      const channels = view.getUint16(contentOffset + 2, true)
      const sampleRate = view.getUint32(contentOffset + 4, true)
      const byteRate = view.getUint32(contentOffset + 8, true)
      const blockAlign = view.getUint16(contentOffset + 12, true)
      const bitsPerSample = view.getUint16(contentOffset + 14, true)
      if (encoding !== PCM_FORMAT
        || channels !== NORMALIZED_CHANNELS
        || sampleRate !== NORMALIZED_SAMPLE_RATE
        || bitsPerSample !== NORMALIZED_BITS_PER_SAMPLE
        || blockAlign !== 2
        || byteRate !== NORMALIZED_SAMPLE_RATE * 2) {
        throw new Error('声音样本必须是 24 kHz、单声道、16 位 PCM WAV。')
      }
    } else if (chunkId === 'data') {
      if (dataOffset !== -1 || chunkLength === 0 || chunkLength % 2 !== 0) {
        throw new Error('声音样本的 WAV 音频数据无效。')
      }
      dataOffset = contentOffset
      dataLength = chunkLength
    }
    offset = contentEnd + (chunkLength % 2)
  }
  if (!formatFound || dataOffset === -1) throw new Error('声音样本缺少 WAV 格式或音频数据。')

  const frameCount = dataLength / 2
  const windowFrames = Math.max(1, Math.round(NORMALIZED_SAMPLE_RATE * 0.02))
  const windowRms: number[] = []
  let peak = 0
  let totalSquares = 0
  for (let offset = 0; offset < frameCount; offset += windowFrames) {
    const end = Math.min(frameCount, offset + windowFrames)
    let windowSquares = 0
    for (let index = offset; index < end; index += 1) {
      const sample = view.getInt16(dataOffset + index * 2, true) / 0x8000
      peak = Math.max(peak, Math.abs(sample))
      windowSquares += sample * sample
    }
    totalSquares += windowSquares
    windowRms.push(Math.sqrt(windowSquares / (end - offset)))
  }
  const sortedWindows = [...windowRms].sort((left, right) => left - right)
  const noiseFloor = sortedWindows[Math.floor(sortedWindows.length * 0.2)] ?? 0
  const activityThreshold = Math.max(0.008, Math.min(0.03, noiseFloor * 2.2))
  let activeFrames = 0
  windowRms.forEach((value, index) => {
    if (value < activityThreshold) return
    const offset = index * windowFrames
    activeFrames += Math.min(windowFrames, frameCount - offset)
  })

  return {
    durationMs: Math.round((frameCount / NORMALIZED_SAMPLE_RATE) * 1_000),
    speechMs: Math.round((activeFrames / NORMALIZED_SAMPLE_RATE) * 1_000),
    peak,
    rms: Math.sqrt(totalSquares / frameCount),
  }
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = ''
  for (let index = start; index < end; index += 1) value += String.fromCharCode(bytes[index])
  return value
}
