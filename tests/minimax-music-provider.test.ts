import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildBedtimeMusicPrompt, MiniMaxMusicProvider } from '../src/main/providers/music-provider'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MiniMax music provider', () => {
  it('sends a non-streaming instrumental music-3.0 request and decodes the MP3 hex response', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      data: { audio: Buffer.from('ID3bedtime-music').toString('hex'), status: 2 },
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const reports: Array<[number, string]> = []
    const provider = new MiniMaxMusicProvider({
      baseUrl: 'https://api.minimaxi.com/v1',
      apiKey: 'secret-key',
    })

    const result = await provider.generate({ title: '月亮邮局', prompt: '温柔舒缓的纯器乐轻音乐' }, {
      signal: new AbortController().signal,
      report: (progress, message) => reports.push([progress, message]),
    })

    expect(result).toMatchObject({ mimeType: 'audio/mpeg', extension: 'mp3' })
    expect(result.bytes.toString()).toBe('ID3bedtime-music')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.minimaxi.com/v1/music_generation')
    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(request.headers).toMatchObject({ Authorization: 'Bearer secret-key' })
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: 'music-3.0',
      stream: false,
      output_format: 'hex',
      is_instrumental: true,
      lyrics_optimizer: false,
      aigc_watermark: false,
      audio_setting: { sample_rate: 44_100, bitrate: 128_000, format: 'mp3' },
    })
    expect(reports.at(-1)?.[0]).toBe(95)
  })

  it('builds a child-safe prompt from story context without requesting vocals', () => {
    const prompt = buildBedtimeMusicPrompt({
      title: '星光小船',
      theme: '在夜空中寻找回家的路',
      summary: '孩子和朋友互相帮助，平安回家。',
      chapters: [{ title: '月光启航' }, { title: '晚安港湾' }],
    })

    expect(prompt).toContain('星光小船')
    expect(prompt).toContain('月光启航、晚安港湾')
    expect(prompt).toContain('纯器乐')
    expect(prompt).toContain('禁止人声、歌词、念白')
    expect(prompt).toContain('不要出现突兀收尾')
  })

  it('rejects a successful envelope that does not contain MP3 audio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { audio: Buffer.from('not-an-mp3').toString('hex'), status: 2 },
      base_resp: { status_code: 0 },
    }), { status: 200 })))
    const provider = new MiniMaxMusicProvider({ baseUrl: 'https://api.minimaxi.com/v1', apiKey: 'secret-key' })

    await expect(provider.generate({ title: '测试', prompt: '轻音乐' }, {
      signal: new AbortController().signal,
      report: () => undefined,
    })).rejects.toThrow('不是有效的 MP3')
  })
})
