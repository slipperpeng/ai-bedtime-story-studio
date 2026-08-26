import type { ProviderRunContext } from './contracts'
import { MINIMAX_SYSTEM_VOICES, isMiniMaxSystemRemoteVoiceId, isMiniMaxSystemVoiceId } from '../../shared/minimax-system-voices'
import { abortableDelay } from '../async'
import { fetchWithRetry, readErrorResponse } from './http'
import { assertMiniMaxSuccess, isRetryableMiniMaxResponse, readMiniMaxStatusCode } from './minimax-response'

export type MiniMaxFileId = number | string
export type MiniMaxAudioFormat = 'mp3' | 'wav' | 'flac'
export type MiniMaxSpeechEmotion = 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'calm'

export interface MiniMaxSpeechConfig {
  baseUrl: string
  apiKey: string
  model: string
  uploadPath?: string
  clonePath?: string
  synthesisPath?: string
  deletePath?: string
  listPath?: string
}

export interface MiniMaxVoiceSample {
  bytes: Uint8Array
  fileName: string
  mimeType: string
}

export interface MiniMaxPreparedVoice {
  fileId: MiniMaxFileId
  voiceId: string
}

export interface MiniMaxSynthesizedSpeech {
  bytes: Buffer
  mimeType: 'audio/mpeg' | 'audio/wav' | 'audio/flac'
  extension: MiniMaxAudioFormat
}

export interface MiniMaxSpeechSynthesisInput {
  voiceId: string
  text: string
  model?: string
  format?: MiniMaxAudioFormat
  sampleRate?: 16_000 | 24_000 | 32_000 | 44_100
  bitrate?: 32_000 | 64_000 | 128_000 | 256_000
  channel?: 1 | 2
  speed?: number
  volume?: number
  pitch?: number
  emotion?: MiniMaxSpeechEmotion
  languageBoost?: 'Chinese' | 'Chinese,Yue' | 'English'
}

export interface MiniMaxSystemVoiceInfo {
  voiceId: string
  voiceName: string
  descriptions: string[]
}

const MAX_SAMPLE_BYTES = 20 * 1024 * 1024
const MIN_SAMPLE_BYTES = 44
const MAX_AUDIO_BYTES = 50 * 1024 * 1024
const MIN_AUDIO_BYTES = 16
const MAX_STANDARD_JSON_BYTES = 2 * 1024 * 1024
const MAX_AUDIO_JSON_BYTES = (MAX_AUDIO_BYTES * 2) + MAX_STANDARD_JSON_BYTES
const MAX_SYNTHESIS_CHARACTERS = 10_000
const SYNTHESIS_REQUEST_INTERVAL_MS = 3_000
const SYNTHESIS_RATE_LIMIT_DELAYS_MS = [5_000, 10_000, 20_000, 30_000] as const
const DEFAULT_PATHS = {
  upload: '/files/upload',
  clone: '/voice_clone',
  synthesis: '/t2a_v2',
  delete: '/delete_voice',
  list: '/get_voice',
} as const

const sampleTypes = {
  wav: new Set(['audio/wav', 'audio/x-wav', 'audio/wave']),
  mp3: new Set(['audio/mpeg', 'audio/mp3']),
  m4a: new Set(['audio/mp4', 'audio/x-m4a', 'audio/m4a']),
} as const

const generatedTypes: Record<MiniMaxAudioFormat, MiniMaxSynthesizedSpeech['mimeType']> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
}

export class MiniMaxSpeechProvider {
  private lastSynthesisStartedAt: number | undefined
  private synthesisSlot = Promise.resolve()

  constructor(private readonly config: MiniMaxSpeechConfig) {
    endpointUrl(config.baseUrl, config.uploadPath || DEFAULT_PATHS.upload)
    if (!config.apiKey.trim()) throw new Error('MiniMax API Key 不能为空。')
    validateModel(config.model)
  }

  async prepareVoice(input: {
    sampleBytes: Uint8Array
    fileName: string
    mimeType: string
    voiceId: string
    previewText?: string
    model?: string
  }, context: ProviderRunContext): Promise<MiniMaxPreparedVoice> {
    validateManagedVoiceId(input.voiceId)
    validateSample({ bytes: input.sampleBytes, fileName: input.fileName, mimeType: input.mimeType })
    if (input.previewText !== undefined) validateText(input.previewText, '音色试听文字')
    const model = validateModel(input.model || this.config.model)

    const uploadContext = mapProgress(context, 0, 45)
    const fileId = await this.uploadSample({
      bytes: input.sampleBytes,
      fileName: input.fileName,
      mimeType: input.mimeType,
    }, uploadContext)
    const cloneContext = mapProgress(context, 45, 100)
    await this.cloneVoice({
      fileId,
      voiceId: input.voiceId,
      previewText: input.previewText,
      model,
    }, cloneContext)
    return { fileId, voiceId: input.voiceId }
  }

  async uploadSample(sample: MiniMaxVoiceSample, context: ProviderRunContext): Promise<MiniMaxFileId> {
    validateSample(sample)
    context.report(5, '正在上传已授权的声音样本…')
    const form = new FormData()
    form.append('purpose', 'voice_clone')
    form.append('file', new Blob([Uint8Array.from(sample.bytes)], { type: normalizeMimeType(sample.mimeType) }), sample.fileName)
    const response = await fetchWithRetry(this.url(this.config.uploadPath || DEFAULT_PATHS.upload), {
      method: 'POST',
      headers: this.headers(),
      body: form,
    }, { signal: context.signal, attempts: 1, timeoutMs: 180_000, retryResponse: isRetryableMiniMaxResponse })
    if (!response.ok) throw new Error(`MiniMax 声音样本上传失败：${await readErrorResponse(response)}`)
    const payload = await readJsonResponse(response, 'MiniMax 声音样本上传', MAX_STANDARD_JSON_BYTES)
    assertMiniMaxSuccess(payload, 'MiniMax 声音样本上传')
    const fileId = readFileId(payload)
    context.report(100, '声音样本上传完成。')
    return fileId
  }

  async cloneVoice(input: {
    fileId: MiniMaxFileId
    voiceId: string
    previewText?: string
    model?: string
  }, context: ProviderRunContext): Promise<string> {
    const fileId = validateFileId(input.fileId)
    validateManagedVoiceId(input.voiceId)
    if (input.previewText !== undefined) validateText(input.previewText, '音色试听文字')
    const model = validateModel(input.model || this.config.model)

    context.report(8, '正在创建 MiniMax 在线音色…')
    const body: Record<string, unknown> = {
      file_id: fileId,
      voice_id: input.voiceId,
    }
    if (input.previewText !== undefined) {
      body.text = input.previewText
      body.model = model
    }
    const response = await fetchWithRetry(this.url(this.config.clonePath || DEFAULT_PATHS.clone), {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify(body),
    }, { signal: context.signal, attempts: 1, timeoutMs: 180_000, retryResponse: isRetryableMiniMaxResponse })
    if (!response.ok) throw new Error(`MiniMax 在线音色创建失败：${await readErrorResponse(response)}`)
    const payload = await readJsonResponse(response, 'MiniMax 在线音色创建', MAX_STANDARD_JSON_BYTES)
    assertMiniMaxSuccess(payload, 'MiniMax 在线音色创建')
    if (payload.input_sensitive === true) {
      throw new Error('MiniMax 在线音色创建失败：声音样本未通过内容安全检查，请确认只包含一位已授权成年人的清晰自然朗读。')
    }
    context.report(100, 'MiniMax 在线音色已准备好。')
    return input.voiceId
  }

  async synthesize(
    input: MiniMaxSpeechSynthesisInput,
    context: ProviderRunContext,
  ): Promise<MiniMaxSynthesizedSpeech> {
    const systemVoice = MINIMAX_SYSTEM_VOICES.find((voice) => voice.remoteVoiceId === input.voiceId)
    if (systemVoice) {
      if (input.languageBoost !== systemVoice.languageBoost) {
        throw new Error(`MiniMax ${systemVoice.language === 'en' ? 'English' : systemVoice.locale === 'zh-HK' ? '粤语' : '普通话'}系统音色的语言参数无效。`)
      }
    } else {
      validateManagedVoiceId(input.voiceId)
    }
    validateText(input.text, '故事朗读文字')
    const model = validateModel(input.model || this.config.model)
    const format = input.format || 'mp3'
    const audioSetting = validatedAudioSetting(input, format)
    const voiceSetting = validatedVoiceSetting(input)

    const body: Record<string, unknown> = {
      model,
      text: input.text,
      stream: false,
      voice_setting: { voice_id: input.voiceId, ...voiceSetting },
      audio_setting: audioSetting,
      output_format: 'hex',
    }
    if (input.languageBoost) body.language_boost = input.languageBoost
    const payload = await this.requestSynthesis(body, context)
    if (isMissingVoiceResponse(payload)) {
      throw new Error(systemVoice
        ? 'MiniMax 在线语音合成失败：所选内置中文音色当前不可用，请回到故事页选择其他内置音色。'
        : 'MiniMax 在线语音合成失败：远端音色不存在或可能已过期，请回到音色库点击“重新在线复刻”，并在 7 天内完成一次朗读。')
    }
    assertMiniMaxSuccess(payload, 'MiniMax 在线语音合成')
    context.report(82, '正在校验合成音频…')
    const bytes = decodeAudioHex(readAudioHex(payload), format)
    context.report(100, '本章在线朗读已完成。')
    return { bytes, mimeType: generatedTypes[format], extension: format }
  }

  async deleteVoice(
    voiceId: string,
    context: ProviderRunContext,
    options: { allowMissing?: boolean } = {},
  ): Promise<void> {
    validateManagedVoiceId(voiceId)
    context.report(10, '正在删除 MiniMax 在线音色…')
    const response = await fetchWithRetry(this.url(this.config.deletePath || DEFAULT_PATHS.delete), {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ voice_type: 'voice_cloning', voice_id: voiceId }),
    }, { signal: context.signal, timeoutMs: 60_000, retryResponse: isRetryableMiniMaxResponse })
    if (!response.ok) throw new Error(`MiniMax 在线音色删除失败：${await readErrorResponse(response)}`)
    const payload = await readJsonResponse(response, 'MiniMax 在线音色删除', MAX_STANDARD_JSON_BYTES)
    if (isMissingVoiceResponse(payload)) {
      if (options.allowMissing === false) {
        throw new Error('MiniMax 在线音色删除失败：当前 API Key 或服务地址与创建该音色时不同，无法确认旧账户中的远端音色已经删除。请恢复原配置后重试，或在原账户控制台核对并删除。')
      }
    } else {
      assertMiniMaxSuccess(payload, 'MiniMax 在线音色删除')
    }
    context.report(100, 'MiniMax 在线音色已删除。')
  }

  async assertSystemVoiceAvailable(voiceId: string, context: ProviderRunContext): Promise<MiniMaxSystemVoiceInfo> {
    if (!isMiniMaxSystemRemoteVoiceId(voiceId)) {
      throw new Error('MiniMax 内置音色编号不在应用白名单中。')
    }
    context.report(12, '正在查询 MiniMax 内置音色…')
    const response = await fetchWithRetry(this.url(this.config.listPath || DEFAULT_PATHS.list), {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ voice_type: 'system' }),
    }, { signal: context.signal, attempts: 2, timeoutMs: 60_000, retryResponse: isRetryableMiniMaxResponse })
    if (!response.ok) throw new Error(`MiniMax 内置音色查询失败：${await readErrorResponse(response)}`)
    const payload = await readJsonResponse(response, 'MiniMax 内置音色查询', MAX_STANDARD_JSON_BYTES)
    assertMiniMaxSuccess(payload, 'MiniMax 内置音色查询')
    const selected = readSystemVoices(payload).find((voice) => voice.voiceId === voiceId)
    if (!selected) {
      throw new Error('当前 MiniMax 账号暂不可用所选内置中文音色，请换一个音色后重试。')
    }
    context.report(100, 'MiniMax 内置音色可用。')
    return selected
  }

  private url(path: string): string {
    return endpointUrl(this.config.baseUrl, path)
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.apiKey}` }
  }

  private jsonHeaders(): Record<string, string> {
    return { ...this.headers(), 'Content-Type': 'application/json' }
  }

  private async requestSynthesis(
    body: Record<string, unknown>,
    context: ProviderRunContext,
  ): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt <= SYNTHESIS_RATE_LIMIT_DELAYS_MS.length; attempt += 1) {
      await this.waitForSynthesisSlot(context.signal)
      context.report(8, attempt === 0 ? '正在提交在线朗读任务…' : '正在重新提交在线朗读任务…')
      const response = await fetchWithRetry(this.url(this.config.synthesisPath || DEFAULT_PATHS.synthesis), {
        method: 'POST',
        headers: this.jsonHeaders(),
        body: JSON.stringify(body),
      }, { signal: context.signal, attempts: 1, timeoutMs: 240_000 })

      if (response.status === 429) {
        if (attempt === SYNTHESIS_RATE_LIMIT_DELAYS_MS.length) {
          throw new Error(`在线语音合成失败：${await readErrorResponse(response)}`)
        }
        await this.waitForRateLimit(
          retryAfterMilliseconds(response, SYNTHESIS_RATE_LIMIT_DELAYS_MS[attempt]),
          context,
        )
        continue
      }
      if (!response.ok) throw new Error(`在线语音合成失败：${await readErrorResponse(response)}`)

      const payload = await readJsonResponse(response, '在线语音合成', MAX_AUDIO_JSON_BYTES)
      if (readMiniMaxStatusCode(payload) !== 1002) return payload
      if (attempt === SYNTHESIS_RATE_LIMIT_DELAYS_MS.length) return payload
      await this.waitForRateLimit(SYNTHESIS_RATE_LIMIT_DELAYS_MS[attempt], context)
    }
    throw new Error('在线语音合成失败：请求过于频繁，请稍后续作。')
  }

  private async waitForSynthesisSlot(signal: AbortSignal): Promise<void> {
    let releaseSlot!: () => void
    const previousSlot = this.synthesisSlot
    this.synthesisSlot = new Promise<void>((resolve) => {
      releaseSlot = resolve
    })
    await previousSlot
    try {
      const elapsed = this.lastSynthesisStartedAt === undefined
        ? SYNTHESIS_REQUEST_INTERVAL_MS
        : Date.now() - this.lastSynthesisStartedAt
      if (elapsed < SYNTHESIS_REQUEST_INTERVAL_MS) {
        await abortableDelay(SYNTHESIS_REQUEST_INTERVAL_MS - elapsed, signal)
      }
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      this.lastSynthesisStartedAt = Date.now()
    } finally {
      releaseSlot()
    }
  }

  private async waitForRateLimit(milliseconds: number, context: ProviderRunContext): Promise<void> {
    const seconds = Math.max(1, Math.ceil(milliseconds / 1_000))
    context.report(8, `在线语音请求较多，正在等待服务恢复（约 ${seconds} 秒）…`)
    await abortableDelay(milliseconds, context.signal)
  }
}

function retryAfterMilliseconds(response: Response, fallback: number): number {
  const rawValue = response.headers.get('retry-after')?.trim()
  if (!rawValue) return fallback
  const seconds = Number(rawValue)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(120_000, Math.max(SYNTHESIS_REQUEST_INTERVAL_MS, seconds * 1_000))
  }
  const retryAt = Date.parse(rawValue)
  if (!Number.isFinite(retryAt)) return fallback
  return Math.min(120_000, Math.max(SYNTHESIS_REQUEST_INTERVAL_MS, retryAt - Date.now()))
}

function endpointUrl(baseUrl: string, path: string): string {
  if (!path.startsWith('/') || path.includes('?') || path.includes('#')) {
    throw new Error('MiniMax 语音接口路径无效。')
  }
  const base = new URL(baseUrl)
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('MiniMax 语音服务地址必须使用无凭据的 HTTPS 地址。')
  }
  return new URL(`${base.toString().replace(/\/$/, '')}${path}`).toString()
}

function validateManagedVoiceId(voiceId: string): void {
    if (isMiniMaxSystemRemoteVoiceId(voiceId)) {
    throw new Error('MiniMax 内置系统音色不能作为复刻音色编号使用。')
  }
  if (typeof voiceId !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{6,254}[A-Za-z0-9]$/.test(voiceId)) {
    throw new Error('MiniMax 音色编号必须为 8 至 256 位，以英文字母开头、字母或数字结尾，中间只能包含字母、数字、下划线或连字符。')
  }
}

function readSystemVoices(payload: Record<string, unknown>): MiniMaxSystemVoiceInfo[] {
  if (!Array.isArray(payload.system_voice) || payload.system_voice.length > 1_000) {
    throw new Error('MiniMax 内置音色查询失败：响应中的系统音色列表无效。')
  }
  return payload.system_voice.flatMap((value) => {
    const record = asRecord(value)
    const voiceId = typeof record?.voice_id === 'string' ? record.voice_id.trim() : ''
    const voiceName = typeof record?.voice_name === 'string' ? record.voice_name.trim() : ''
    if (!voiceId || voiceId.length > 256 || /[\0-\x1f\x7f]/.test(voiceId)) return []
    const rawDescriptions = record?.description
    const descriptions = Array.isArray(rawDescriptions) && rawDescriptions.length <= 20
      ? rawDescriptions
          .filter((description): description is string => typeof description === 'string' && description.length <= 500)
          .map((description) => description.trim())
          .filter(Boolean)
      : []
    return [{ voiceId, voiceName: voiceName.slice(0, 100), descriptions }]
  })
}

function validateModel(value: string): string {
  const model = typeof value === 'string' ? value.trim() : ''
  if (!model || model.length > 120) throw new Error('MiniMax 语音模型无效。')
  return model
}

function validateFileId(value: MiniMaxFileId): MiniMaxFileId {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value > 0) return value
  } else if (typeof value === 'string' && /^[1-9]\d{0,31}$/.test(value)) {
    return value
  }
  throw new Error('MiniMax 返回的声音样本文件编号无效。')
}

function readFileId(payload: Record<string, unknown>): MiniMaxFileId {
  const file = asRecord(payload.file)
  if (!file) throw new Error('MiniMax 声音样本上传失败：响应中没有文件信息。')
  return validateFileId(file.file_id as MiniMaxFileId)
}

function validateSample(sample: MiniMaxVoiceSample): void {
  if (!(sample.bytes instanceof Uint8Array)
    || sample.bytes.byteLength < MIN_SAMPLE_BYTES
    || sample.bytes.byteLength > MAX_SAMPLE_BYTES) {
    throw new Error('MiniMax 声音样本大小必须在 44 字节至 20 MB 之间。')
  }
  const fileName = typeof sample.fileName === 'string' ? sample.fileName.trim() : ''
  if (!fileName || fileName.length > 128 || /[\\/\0-\x1f\x7f]/.test(fileName)) {
    throw new Error('MiniMax 声音样本文件名无效。')
  }
  const extension = /\.([A-Za-z0-9]+)$/.exec(fileName)?.[1]?.toLowerCase()
  const detected = detectSampleType(sample.bytes)
  const mimeType = normalizeMimeType(sample.mimeType)
  if (!detected || extension !== detected || !sampleTypes[detected].has(mimeType)) {
    throw new Error('MiniMax 声音样本必须是内容、扩展名与类型一致的 WAV、MP3 或 M4A 文件。')
  }
}

function normalizeMimeType(value: string): string {
  return typeof value === 'string' ? value.split(';', 1)[0].trim().toLowerCase() : ''
}

function detectSampleType(bytes: Uint8Array): keyof typeof sampleTypes | undefined {
  if (bytes.byteLength >= 12
    && ascii(bytes, 0, 4) === 'RIFF'
    && ascii(bytes, 8, 12) === 'WAVE') return 'wav'
  if (isMp3(bytes)) return 'mp3'
  if (bytes.byteLength >= 12 && ascii(bytes, 4, 8) === 'ftyp') return 'm4a'
  return undefined
}

function validateText(value: string, field: string): void {
  const length = typeof value === 'string' ? Array.from(value.trim()).length : 0
  if (length < 1 || length > MAX_SYNTHESIS_CHARACTERS) {
    throw new Error(`${field}必须为 1 至 ${MAX_SYNTHESIS_CHARACTERS} 个字符。`)
  }
}

function validatedAudioSetting(
  input: MiniMaxSpeechSynthesisInput,
  format: MiniMaxAudioFormat,
): Record<string, number | string> {
  if (!Object.hasOwn(generatedTypes, format)) throw new Error('MiniMax 输出音频格式无效。')
  const sampleRate = input.sampleRate ?? 32_000
  const channel = input.channel ?? 1
  if (![16_000, 24_000, 32_000, 44_100].includes(sampleRate)) throw new Error('MiniMax 音频采样率无效。')
  if (channel !== 1 && channel !== 2) throw new Error('MiniMax 音频声道数无效。')
  const result: Record<string, number | string> = { format, sample_rate: sampleRate, channel }
  if (format === 'mp3') {
    const bitrate = input.bitrate ?? 128_000
    if (![32_000, 64_000, 128_000, 256_000].includes(bitrate)) throw new Error('MiniMax 音频码率无效。')
    result.bitrate = bitrate
  }
  return result
}

function validatedVoiceSetting(input: MiniMaxSpeechSynthesisInput): Record<string, number | string> {
  const result: Record<string, number | string> = {}
  if (input.speed !== undefined) result.speed = finiteRange(input.speed, 0.5, 2, '语速')
  if (input.volume !== undefined) result.vol = finiteRange(input.volume, 0, 10, '音量', false)
  if (input.pitch !== undefined) result.pitch = finiteRange(input.pitch, -12, 12, '音调')
  if (input.emotion !== undefined) {
    if (!isMiniMaxSpeechEmotion(input.emotion)) {
      throw new Error('MiniMax 情绪参数无效。')
    }
    result.emotion = input.emotion
  }
  return result
}

function isMiniMaxSpeechEmotion(value: unknown): value is MiniMaxSpeechEmotion {
  return value === 'happy'
    || value === 'sad'
    || value === 'angry'
    || value === 'fearful'
    || value === 'disgusted'
    || value === 'surprised'
    || value === 'calm'
}

function finiteRange(value: number, min: number, max: number, label: string, inclusiveMin = true): number {
  if (!Number.isFinite(value) || (inclusiveMin ? value < min : value <= min) || value > max) {
    throw new Error(`MiniMax ${label}参数无效。`)
  }
  return value
}

function readAudioHex(payload: Record<string, unknown>): string {
  const data = asRecord(payload.data)
  if (!data || typeof data.audio !== 'string') throw new Error('MiniMax 在线语音合成失败：响应中没有音频。')
  if (data.status !== 2) throw new Error('MiniMax 在线语音合成失败：服务未返回已完成状态。')
  return data.audio
}

function decodeAudioHex(value: string, format: MiniMaxAudioFormat): Buffer {
  if (value.length < MIN_AUDIO_BYTES * 2
    || value.length % 2 !== 0
    || value.length > MAX_AUDIO_BYTES * 2
    || !/^[0-9a-fA-F]+$/.test(value)) {
    throw new Error('MiniMax 返回的音频十六进制编码无效或超过 50 MB。')
  }
  const bytes = Buffer.from(value, 'hex')
  const valid = format === 'mp3'
    ? isMp3(bytes)
    : format === 'wav'
      ? bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE'
      : bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'fLaC'
  if (!valid) throw new Error(`MiniMax 返回的音频内容与 ${format.toUpperCase()} 格式不一致。`)
  return bytes
}

function isMp3(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 && (
    ascii(bytes, 0, 3) === 'ID3'
    || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  )
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset + start, end - start).toString('ascii')
}

async function readJsonResponse(response: Response, operation: string, maxBytes: number): Promise<Record<string, unknown>> {
  const contentType = normalizeMimeType(response.headers.get('content-type') || '')
  if (contentType !== 'application/json' && !contentType.endsWith('+json')) {
    throw new Error(`${operation}失败：服务返回了不受支持的内容类型（${contentType || '未提供'}）。`)
  }
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`${operation}失败：服务响应超过安全大小限制。`)
  }
  const bytes = await readLimitedBody(response, maxBytes, operation)
  try {
    const payload: unknown = JSON.parse(bytes.toString('utf8'))
    const record = asRecord(payload)
    if (!record) throw new Error('not an object')
    return record
  } catch {
    throw new Error(`${operation}失败：服务返回了无法解析的 JSON。`)
  }
}

async function readLimitedBody(response: Response, maxBytes: number, operation: string): Promise<Buffer> {
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > maxBytes) throw new Error(`${operation}失败：服务响应超过安全大小限制。`)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel()
        throw new Error(`${operation}失败：服务响应超过安全大小限制。`)
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, length)
}

function isMissingVoiceResponse(payload: Record<string, unknown>): boolean {
  const envelope = payload as {
    error?: { message?: unknown }
    base_resp?: { status_code?: unknown; status_msg?: unknown }
  }
  if (Number(envelope.base_resp?.status_code) !== 2013) return false
  const messages = [envelope.error?.message, envelope.base_resp?.status_msg]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  return /(?:voice|音色|声音).*(?:not\s*found|does\s*not\s*exist|不存在|已删除)|(?:not\s*found|does\s*not\s*exist).*(?:voice|音色|声音)/i.test(messages)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function mapProgress(context: ProviderRunContext, start: number, end: number): ProviderRunContext {
  return {
    signal: context.signal,
    report(progress, message) {
      const bounded = Math.max(0, Math.min(100, progress))
      context.report(start + ((end - start) * bounded / 100), message)
    },
  }
}
