export interface PreparedAudio {
  bytes: Uint8Array
  durationMs: number
  previewUrl: string
  speechMs: number
  referenceText?: string
}

export interface AudioPreparationOptions {
  targetSampleRate?: number
  maxSeconds?: number
  maxBytes?: number
}

export class AudioLimitError extends Error {}

export interface AudioActivity {
  durationMs: number
  speechMs: number
  peak: number
  rms: number
}

export const GUIDED_SEGMENT_MIN_DURATION_MS = 2_500
export const GUIDED_SEGMENT_MIN_SPEECH_MS = 1_200
export const GUIDED_SAMPLE_MIN_DURATION_MS = 9_000
export const GUIDED_SAMPLE_MIN_SPEECH_MS = 4_500
export const RECORDED_AUDIO_MIN_SPEECH_MS = 500

export function recordedAudioIssue(audio: Pick<PreparedAudio, 'speechMs'>): string | undefined {
  if (audio.speechMs < RECORDED_AUDIO_MIN_SPEECH_MS) {
    return '录音中没有检测到足够的清晰人声，请靠近麦克风重新录制。'
  }
  return undefined
}

export function guidedSegmentIssue(audio: Pick<PreparedAudio, 'durationMs' | 'speechMs'>): string | undefined {
  if (audio.durationMs < GUIDED_SEGMENT_MIN_DURATION_MS) return '这一段太短，请自然地完整读完句子。'
  if (audio.speechMs < GUIDED_SEGMENT_MIN_SPEECH_MS) return '这一段检测到的有效声音太少，请靠近麦克风重新朗读。'
  return undefined
}

export function guidedSampleIssue(
  audio: Pick<PreparedAudio, 'durationMs' | 'speechMs'>,
  maxDurationMs = 30_000,
): string | undefined {
  if (audio.durationMs < GUIDED_SAMPLE_MIN_DURATION_MS) return '声音样本总时长不足 9 秒，请放慢语速重新录制较短的段落。'
  if (audio.speechMs < GUIDED_SAMPLE_MIN_SPEECH_MS) return '有效朗读不足 4.5 秒，请在安静环境中重新录制音量较弱的段落。'
  if (audio.durationMs > maxDurationMs) return `声音样本不能超过 ${Math.floor(maxDurationMs / 1_000)} 秒。`
  return undefined
}

export async function blobToMonoWav(blob: Blob, options: AudioPreparationOptions = {}): Promise<PreparedAudio> {
  const { targetSampleRate = 24_000, maxSeconds, maxBytes } = options
  assertAudioWithinLimits(blob.size, undefined, { maxSeconds, maxBytes })
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    assertAudioWithinLimits(blob.size, decoded.duration, { maxSeconds, maxBytes })
    const frames = Math.max(1, Math.round(decoded.duration * targetSampleRate))
    const mono = new Float32Array(frames)
    for (let outputIndex = 0; outputIndex < frames; outputIndex += 1) {
      const sourcePosition = (outputIndex / targetSampleRate) * decoded.sampleRate
      const leftIndex = Math.min(decoded.length - 1, Math.floor(sourcePosition))
      const rightIndex = Math.min(decoded.length - 1, leftIndex + 1)
      const mix = sourcePosition - leftIndex
      let value = 0
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const data = decoded.getChannelData(channel)
        value += data[leftIndex] * (1 - mix) + data[rightIndex] * mix
      }
      mono[outputIndex] = value / decoded.numberOfChannels
    }
    const wav = encodePcm16Wav(mono, targetSampleRate)
    const activity = analyzeAudioActivity(mono, targetSampleRate)
    const wavBlob = new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' })
    return {
      bytes: wav,
      durationMs: Math.round((frames / targetSampleRate) * 1_000),
      previewUrl: URL.createObjectURL(wavBlob),
      speechMs: activity.speechMs,
    }
  } finally {
    await context.close()
  }
}

export function analyzeAudioActivity(samples: Float32Array, sampleRate: number): AudioActivity {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length === 0) {
    return { durationMs: 0, speechMs: 0, peak: 0, rms: 0 }
  }

  const windowFrames = Math.max(1, Math.round(sampleRate * 0.02))
  const windowRms: number[] = []
  let peak = 0
  let totalSquares = 0

  for (let offset = 0; offset < samples.length; offset += windowFrames) {
    const end = Math.min(samples.length, offset + windowFrames)
    let windowSquares = 0
    for (let index = offset; index < end; index += 1) {
      const sample = Number.isFinite(samples[index]) ? samples[index] : 0
      const absolute = Math.abs(sample)
      peak = Math.max(peak, absolute)
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
    activeFrames += Math.min(windowFrames, samples.length - offset)
  })

  return {
    durationMs: Math.round((samples.length / sampleRate) * 1_000),
    speechMs: Math.round((activeFrames / sampleRate) * 1_000),
    peak,
    rms: Math.sqrt(totalSquares / samples.length),
  }
}

export function mergeMonoWavSegments(wavSegments: Uint8Array[], gapMs = 250): Uint8Array {
  if (wavSegments.length === 0) throw new Error('至少需要一段 WAV 录音。')
  if (!Number.isFinite(gapMs) || gapMs < 0 || gapMs > 2_000) throw new Error('录音间隔无效。')

  const parsed = wavSegments.map(parseMonoPcm16Wav)
  const sampleRate = parsed[0].sampleRate
  if (parsed.some((segment) => segment.sampleRate !== sampleRate)) {
    throw new Error('待合并录音的采样率必须一致。')
  }

  const gapFrames = Math.round((gapMs / 1_000) * sampleRate)
  const totalFrames = parsed.reduce((sum, segment) => sum + segment.samples.length, 0) + gapFrames * (parsed.length - 1)
  const combined = new Float32Array(totalFrames)
  let offset = 0
  parsed.forEach((segment, index) => {
    combined.set(segment.samples, offset)
    offset += segment.samples.length
    if (index < parsed.length - 1) offset += gapFrames
  })
  return encodePcm16Wav(combined, sampleRate)
}

export function mergePreparedAudio(segments: PreparedAudio[], gapMs = 250, referenceText?: string): PreparedAudio {
  const bytes = mergeMonoWavSegments(segments.map((segment) => segment.bytes), gapMs)
  const sampleRate = readWavSampleRate(bytes)
  const frames = (bytes.length - 44) / 2
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' })
  return {
    bytes,
    durationMs: Math.round((frames / sampleRate) * 1_000),
    previewUrl: URL.createObjectURL(blob),
    speechMs: segments.reduce((sum, segment) => sum + segment.speechMs, 0),
    referenceText,
  }
}

interface ParsedMonoWav {
  sampleRate: number
  samples: Float32Array
}

function parseMonoPcm16Wav(bytes: Uint8Array): ParsedMonoWav {
  if (bytes.byteLength < 44 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') {
    throw new Error('录音不是有效的 WAV 文件。')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  let sampleRate = 0
  let validFormat = false
  let dataOffset = -1
  let dataLength = 0

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readAscii(bytes, offset, 4)
    const chunkLength = view.getUint32(offset + 4, true)
    const contentOffset = offset + 8
    if (contentOffset + chunkLength > bytes.byteLength) throw new Error('WAV 数据不完整。')
    if (chunkId === 'fmt ' && chunkLength >= 16) {
      const encoding = view.getUint16(contentOffset, true)
      const channels = view.getUint16(contentOffset + 2, true)
      sampleRate = view.getUint32(contentOffset + 4, true)
      const bitsPerSample = view.getUint16(contentOffset + 14, true)
      validFormat = encoding === 1 && channels === 1 && bitsPerSample === 16 && sampleRate > 0
    } else if (chunkId === 'data') {
      dataOffset = contentOffset
      dataLength = chunkLength
    }
    offset = contentOffset + chunkLength + (chunkLength % 2)
  }

  if (!validFormat || dataOffset < 0 || dataLength === 0 || dataLength % 2 !== 0) {
    throw new Error('只支持单声道 16 位 PCM WAV 录音。')
  }
  const samples = new Float32Array(dataLength / 2)
  for (let index = 0; index < samples.length; index += 1) {
    const value = view.getInt16(dataOffset + index * 2, true)
    samples[index] = value < 0 ? value / 0x8000 : value / 0x7fff
  }
  return { sampleRate, samples }
}

function readWavSampleRate(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(24, true)
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let value = ''
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(bytes[offset + index])
  return value
}

export function assertAudioWithinLimits(
  byteLength: number,
  durationSeconds: number | undefined,
  limits: Pick<AudioPreparationOptions, 'maxSeconds' | 'maxBytes'>,
): void {
  if (limits.maxBytes !== undefined && byteLength > limits.maxBytes) {
    throw new AudioLimitError(`音频文件不能超过 ${formatMegabytes(limits.maxBytes)} MB。`)
  }
  if (durationSeconds === undefined) return
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new AudioLimitError('音频中没有可用的声音内容。')
  }
  if (limits.maxSeconds !== undefined && durationSeconds > limits.maxSeconds) {
    throw new AudioLimitError(`音频时长不能超过 ${limits.maxSeconds} 秒。`)
  }
}

export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const output = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(output)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => {
    const limited = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, limited < 0 ? limited * 0x8000 : limited * 0x7fff, true)
  })
  return new Uint8Array(output)
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
}

function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)
}
