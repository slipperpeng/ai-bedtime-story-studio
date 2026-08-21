import { afterEach, describe, expect, it, vi } from 'vitest'
import { MiniMaxSpeechProvider } from '../src/main/providers/speech-provider'

const voiceId = 'bedtime_voice_20260817'
const sample = wavBytes()
const context = () => ({ signal: new AbortController().signal, report: vi.fn() })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('MiniMax speech provider', () => {
  it('uploads a validated sample and clones a voice with mapped progress', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        file: { file_id: 72_081_701, filename: 'reference.wav', purpose: 'voice_clone' },
        base_resp: { status_code: 0, status_msg: 'success' },
      }))
      .mockResolvedValueOnce(jsonResponse({ base_resp: { status_code: 0, status_msg: 'success' } }))
    vi.stubGlobal('fetch', fetchMock)
    const runContext = context()

    const result = await provider().prepareVoice({
      sampleBytes: sample,
      fileName: 'reference.wav',
      mimeType: 'audio/wav',
      voiceId,
      previewText: '月光落在安静的窗台上。',
    }, runContext)

    expect(result).toEqual({ fileId: 72_081_701, voiceId })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(uploadUrl).toBe('https://api.minimaxi.com/v1/files/upload')
    expect(uploadInit.headers).toEqual({ Authorization: 'Bearer unit-test-key' })
    expect(uploadInit.body).toBeInstanceOf(FormData)
    const form = uploadInit.body as FormData
    expect(form.get('purpose')).toBe('voice_clone')
    const file = form.get('file') as File
    expect(file.name).toBe('reference.wav')
    expect(file.type).toBe('audio/wav')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(sample)

    const [cloneUrl, cloneInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(cloneUrl).toBe('https://api.minimaxi.com/v1/voice_clone')
    expect(JSON.parse(String(cloneInit.body))).toEqual({
      file_id: 72_081_701,
      voice_id: voiceId,
      text: '月光落在安静的窗台上。',
      model: 'speech-2.8-hd',
    })
    expect(runContext.report).toHaveBeenLastCalledWith(100, 'MiniMax 在线音色已准备好。')
  })

  it('synthesizes MP3 as hex with the documented non-streaming request', async () => {
    const audio = mp3Bytes()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      data: { audio: audio.toString('hex'), status: 2 },
      base_resp: { status_code: 0, status_msg: 'success' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await provider().synthesize({
      voiceId,
      text: '星星慢慢落进了梦里。',
      speed: 0.82,
    }, context())

    expect(result).toEqual({ bytes: audio, mimeType: 'audio/mpeg', extension: 'mp3' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.minimaxi.com/v1/t2a_v2')
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'speech-2.8-hd',
      text: '星星慢慢落进了梦里。',
      stream: false,
      voice_setting: { voice_id: voiceId, speed: 0.82 },
      audio_setting: { format: 'mp3', sample_rate: 32_000, bitrate: 128_000, channel: 1 },
      output_format: 'hex',
    })
  })

  it.each(['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm'] as const)(
    'accepts the Speech-2.8 emotion %s',
    async (emotion) => {
      const audio = mp3Bytes()
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
        data: { audio: audio.toString('hex'), status: 2 },
        base_resp: { status_code: 0, status_msg: 'success' },
      }))
      vi.stubGlobal('fetch', fetchMock)

      await provider().synthesize({ voiceId, text: '晚安。', emotion }, context())

      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
        voice_setting: { voice_id: voiceId, emotion },
      })
    },
  )

  it('supports WAV output at 44.1 kHz mono with valid voice settings', async () => {
    const audio = wavBytes()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      data: { audio: Buffer.from(audio).toString('hex'), status: 2 },
      base_resp: { status_code: 0, status_msg: 'success' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await provider().synthesize({
      voiceId,
      text: '晚安。',
      format: 'wav',
      sampleRate: 44_100,
      channel: 1,
      speed: 0.85,
      pitch: -2,
      volume: 1,
      emotion: 'calm',
    }, context())

    expect(result).toEqual({ bytes: Buffer.from(audio), mimeType: 'audio/wav', extension: 'wav' })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      model: 'speech-2.8-hd',
      text: '晚安。',
      stream: false,
      voice_setting: { voice_id: voiceId, speed: 0.85, vol: 1, pitch: -2, emotion: 'calm' },
      audio_setting: { format: 'wav', sample_rate: 44_100, channel: 1 },
      output_format: 'hex',
    })
  })

  it('sends the documented Chinese language boost for a Mandarin system voice', async () => {
    const audio = mp3Bytes()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      data: { audio: audio.toString('hex'), status: 2 },
      base_resp: { status_code: 0, status_msg: 'success' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await provider().synthesize({
      voiceId: 'Chinese (Mandarin)_Warm_Bestie',
      text: '月光轻轻落在窗台上。',
      emotion: 'calm',
      languageBoost: 'Chinese',
    }, context())

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toMatchObject({
      language_boost: 'Chinese',
      voice_setting: { voice_id: 'Chinese (Mandarin)_Warm_Bestie', emotion: 'calm' },
    })
  })

  it('rejects the unsupported neutral emotion before making a request', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider().synthesize({
      voiceId,
      text: '晚安。',
      emotion: 'neutral' as unknown as 'happy',
    }, context())).rejects.toThrow('情绪参数无效')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['fluent', 'whisper'])('does not send Speech-2.8 the legacy emotion %s', async (emotion) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider().synthesize({
      voiceId,
      text: '晚安。',
      emotion: emotion as never,
    }, context())).rejects.toThrow('情绪参数无效')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects zero volume before making a request', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider().synthesize({
      voiceId,
      text: '晚安。',
      volume: 0,
    }, context())).rejects.toThrow('音量参数无效')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves the official Cantonese voice id and sends the Yue language boost', async () => {
    const audio = mp3Bytes()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      data: { audio: audio.toString('hex'), status: 2 },
      base_resp: { status_code: 0, status_msg: 'success' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await provider().synthesize({
      voiceId: 'Cantonese_ProfessionalHost（F)',
      text: '月光輕輕落喺窗邊。',
      languageBoost: 'Chinese,Yue',
    }, context())

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toMatchObject({
      language_boost: 'Chinese,Yue',
      voice_setting: { voice_id: 'Cantonese_ProfessionalHost（F)' },
    })
  })

  it.each([
    ['Mandarin', 'Chinese (Mandarin)_Warm_Bestie', undefined],
    ['Cantonese', 'Cantonese_GentleLady', 'Chinese'],
  ])('rejects a missing or mismatched language boost for a %s system voice', async (_label, systemVoiceId, languageBoost) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider().synthesize({
      voiceId: systemVoiceId,
      text: '晚安。',
      languageBoost: languageBoost as 'Chinese' | undefined,
    }, context())).rejects.toThrow('系统音色的语言参数无效')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('queries the current account for a whitelisted system voice and tolerates optional metadata', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      system_voice: [
        null,
        { voice_id: '\0invalid' },
        {
          voice_id: 'Chinese (Mandarin)_Warm_Bestie',
          description: ['', '温暖自然的普通话女声', 42],
        },
      ],
      base_resp: { status_code: 0, status_msg: 'success' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const runContext = context()

    const result = await provider().assertSystemVoiceAvailable(
      'Chinese (Mandarin)_Warm_Bestie',
      runContext,
    )

    expect(result).toEqual({
      voiceId: 'Chinese (Mandarin)_Warm_Bestie',
      voiceName: '',
      descriptions: ['温暖自然的普通话女声'],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.minimaxi.com/v1/get_voice')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer unit-test-key', 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init.body))).toEqual({ voice_type: 'system' })
    expect(runContext.report).toHaveBeenLastCalledWith(100, 'MiniMax 内置音色可用。')
  })

  it('fails availability checks when the account response omits the selected system voice', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      system_voice: [{ voice_id: 'male-qn-qingse', voice_name: '青涩青年音色' }],
      base_resp: { status_code: 0, status_msg: 'success' },
    })))

    await expect(provider().assertSystemVoiceAvailable(
      'Chinese (Mandarin)_Warm_Bestie',
      context(),
    )).rejects.toThrow('当前 MiniMax 账号暂不可用')
  })

  it('rejects a malformed system voice list response', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      system_voice: { voice_id: 'Chinese (Mandarin)_Warm_Bestie' },
      base_resp: { status_code: 0, status_msg: 'success' },
    })))

    await expect(provider().assertSystemVoiceAvailable(
      'Chinese (Mandarin)_Warm_Bestie',
      context(),
    )).rejects.toThrow('系统音色列表无效')
  })

  it.each([
    'Chinese (Mandarin)_Warm_Bestie',
    'clever_boy',
  ])('never accepts system voice id %s as a deletable cloned voice', async (voiceId) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider().deleteVoice(
      voiceId,
      context(),
    )).rejects.toThrow('内置系统音色不能作为复刻音色编号')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a cloned voice when MiniMax marks the input sample as sensitive', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      input_sensitive: true,
      base_resp: { status_code: 0, status_msg: 'success' },
    })))

    await expect(provider().cloneVoice({
      fileId: 72_081_701,
      voiceId,
    }, context())).rejects.toThrow('声音样本未通过内容安全检查')
  })

  it('explains how to recover when a remote voice no longer exists', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      base_resp: { status_code: 2013, status_msg: 'voice not found' },
    })))

    await expect(provider().synthesize({ voiceId, text: '晚安。' }, context()))
      .rejects.toThrow('重新在线复刻')
  })

  it('validates the requested voice id before uploading a sample', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider().prepareVoice({
      sampleBytes: sample,
      fileName: 'reference.wav',
      mimeType: 'audio/wav',
      voiceId: '../bad',
    }, context())).rejects.toThrow('音色编号必须为 8 至 256 位')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a voice id ending in a hyphen or underscore before making a request', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider().synthesize({
      voiceId: 'bedtime_voice_',
      text: '晚安。',
    }, context())).rejects.toThrow('字母或数字结尾')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects sample bytes whose declared type does not match their content', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>())

    await expect(provider().uploadSample({
      bytes: sample,
      fileName: 'reference.mp3',
      mimeType: 'audio/mpeg',
    }, context())).rejects.toThrow('内容、扩展名与类型一致')
  })

  it('rejects an invalid file id returned by the upload endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      file: { file_id: '../../not-an-id' },
      base_resp: { status_code: 0, status_msg: 'success' },
    })))

    await expect(provider().uploadSample({
      bytes: sample,
      fileName: 'reference.wav',
      mimeType: 'audio/wav',
    }, context())).rejects.toThrow('文件编号无效')
  })

  it.each([
    ['odd-length hex', '49443'],
    ['non-hex text', 'not-hex-audio'],
    ['wrong MP3 signature', Buffer.from('RIFFfakeWAVE').toString('hex')],
  ])('rejects invalid synthesized audio: %s', async (_label, audio) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      data: { audio, status: 2 },
      base_resp: { status_code: 0, status_msg: 'success' },
    })))

    await expect(provider().synthesize({ voiceId, text: '晚安。' }, context())).rejects.toThrow(/音频/)
  })

  it('rejects T2A audio until MiniMax reports completed status 2', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      data: { audio: mp3Bytes().toString('hex'), status: 1 },
      base_resp: { status_code: 0, status_msg: 'success' },
    })))

    await expect(provider().synthesize({ voiceId, text: '晚安。' }, context())).rejects.toThrow('未返回已完成状态')
  })

  it('rejects a success response with a non-JSON content type', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })))

    await expect(provider().synthesize({ voiceId, text: '晚安。' }, context())).rejects.toThrow('不受支持的内容类型')
  })

  it('maps MiniMax business errors without exposing API credentials', async () => {
    const secret = ['sk', 'unit', 'secret', '123456789'].join('-')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      error: { message: `invalid Bearer ${secret}` },
      base_resp: { status_code: 2049, status_msg: 'invalid key' },
    })))

    const operation = provider().synthesize({ voiceId, text: '晚安。' }, context())
    await expect(operation).rejects.toThrow('已隐藏')
    await expect(operation).rejects.not.toThrow(secret)
  })

  it('does not mistake an HTTP 404 route error for a deleted remote voice', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })))

    await expect(provider().deleteVoice(voiceId, context())).rejects.toThrow('MiniMax 在线音色删除失败')
  })

  it('treats an explicit voice-not-found business response as an idempotent deletion', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      base_resp: { status_code: 2013, status_msg: 'voice not found' },
    })))

    await expect(provider().deleteVoice(voiceId, context())).resolves.toBeUndefined()
  })

  it('does not trust a missing response when the caller cannot prove the original account binding', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      base_resp: { status_code: 2013, status_msg: 'voice not found' },
    })))

    await expect(provider().deleteVoice(voiceId, context(), { allowMissing: false }))
      .rejects.toThrow('与创建该音色时不同')
  })

  it('does not hide unrelated deletion failures', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      base_resp: { status_code: 1008, status_msg: 'insufficient balance' },
    })))

    await expect(provider().deleteVoice(voiceId, context())).rejects.toThrow('账户余额不足')
  })

  it('requires the documented missing-voice code before treating deletion as idempotent', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      base_resp: { status_code: 1008, status_msg: 'voice not found' },
    })))

    await expect(provider().deleteVoice(voiceId, context())).rejects.toThrow('[1008]')
  })

  it('does not automatically repeat a billable synthesis request after an ambiguous server failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('temporary failure', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider().synthesize({ voiceId, text: '晚安。' }, context())).rejects.toThrow('在线语音合成失败')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('waits and retries when the synthesis service explicitly returns rate limit code 1002', async () => {
    vi.useFakeTimers()
    const audio = mp3Bytes()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        base_resp: { status_code: 1002, status_msg: 'rate limit exceeded(RPM)' },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: { audio: audio.toString('hex'), status: 2 },
        base_resp: { status_code: 0, status_msg: 'success' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const runContext = context()

    const operation = provider().synthesize({ voiceId, text: '晚安。' }, runContext)
    await vi.advanceTimersByTimeAsync(5_000)

    await expect(operation).resolves.toEqual({ bytes: audio, mimeType: 'audio/mpeg', extension: 'mp3' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(runContext.report).toHaveBeenCalledWith(8, '在线语音请求较多，正在等待服务恢复（约 5 秒）…')
  })

  it('stops after the bounded rate-limit recovery window and keeps the friendly 1002 error', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({
      base_resp: { status_code: 1002, status_msg: 'rate limit exceeded(RPM)' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const operation = provider().synthesize({ voiceId, text: '晚安。' }, context())
    const rejection = expect(operation).rejects.toThrow('请求过于频繁，请稍后重试。')
    await vi.advanceTimersByTimeAsync(65_000)

    await rejection
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('uses Retry-After for HTTP 429 before retrying synthesis', async () => {
    vi.useFakeTimers()
    const audio = mp3Bytes()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('busy', { status: 429, headers: { 'retry-after': '7' } }))
      .mockResolvedValueOnce(jsonResponse({
        data: { audio: audio.toString('hex'), status: 2 },
        base_resp: { status_code: 0, status_msg: 'success' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const runContext = context()

    const operation = provider().synthesize({ voiceId, text: '晚安。' }, runContext)
    await vi.advanceTimersByTimeAsync(6_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(operation).resolves.toMatchObject({ mimeType: 'audio/mpeg' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(runContext.report).toHaveBeenCalledWith(8, '在线语音请求较多，正在等待服务恢复（约 7 秒）…')
  })

  it('cancels immediately while waiting to recover from a rate limit', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      base_resp: { status_code: 1002, status_msg: 'rate limit exceeded(RPM)' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const operation = provider().synthesize({ voiceId, text: '晚安。' }, {
      signal: controller.signal,
      report: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('paces consecutive synthesis calls made by the same provider instance', async () => {
    vi.useFakeTimers()
    const audio = mp3Bytes()
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({
      data: { audio: audio.toString('hex'), status: 2 },
      base_resp: { status_code: 0, status_msg: 'success' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const speechProvider = provider()

    await speechProvider.synthesize({ voiceId, text: '第一段。' }, context())
    const second = speechProvider.synthesize({ voiceId, text: '第二段。' }, context())
    await vi.advanceTimersByTimeAsync(2_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(second).resolves.toMatchObject({ mimeType: 'audio/mpeg' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a synthesis request after a network error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network disconnected'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider().synthesize({ voiceId, text: '晚安。' }, context()))
      .rejects.toThrow('network disconnected')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

function provider(): MiniMaxSpeechProvider {
  return new MiniMaxSpeechProvider({
    baseUrl: 'https://api.minimaxi.com/v1',
    apiKey: 'unit-test-key',
    model: 'speech-2.8-hd',
  })
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function wavBytes(): Uint8Array {
  const bytes = new Uint8Array(44)
  bytes.set(Buffer.from('RIFF'), 0)
  bytes.set(Buffer.from('WAVE'), 8)
  return bytes
}

function mp3Bytes(): Buffer {
  const bytes = Buffer.alloc(16)
  bytes.write('ID3', 0, 'ascii')
  return bytes
}
