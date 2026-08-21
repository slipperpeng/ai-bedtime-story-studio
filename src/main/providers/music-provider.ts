import type { GeneratedMusic, MusicProvider, ProviderRunContext } from './contracts'
import type { StoryChapter, StoryProject } from '../../shared/contracts'
import { fetchWithRetry, readErrorResponse } from './http'
import { assertMiniMaxSuccess } from './minimax-response'
import { createDemoBackgroundMusicWav } from '../services/demo-media'

interface MiniMaxMusicConfig {
  baseUrl: string
  apiKey: string
  model?: string
}

const MAX_MUSIC_BYTES = 32 * 1024 * 1024

export class MiniMaxMusicProvider implements MusicProvider {
  readonly model: string

  constructor(private readonly config: MiniMaxMusicConfig) {
    this.model = config.model || 'music-3.0'
  }

  async generate(input: Parameters<MusicProvider['generate']>[0], context: ProviderRunContext): Promise<GeneratedMusic> {
    context.report(10, `正在为《${input.title}》构思轻音乐…`)
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/music_generation`
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: input.prompt,
        stream: false,
        output_format: 'hex',
        audio_setting: {
          sample_rate: 44_100,
          bitrate: 128_000,
          format: 'mp3',
        },
        aigc_watermark: false,
        lyrics_optimizer: false,
        is_instrumental: true,
      }),
    }, {
      signal: context.signal,
      attempts: 1,
      timeoutMs: 300_000,
    })
    if (!response.ok) throw new Error(`MiniMax 音乐生成失败：${await readErrorResponse(response)}`)

    context.report(75, '正在接收并校验背景音乐…')
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error('MiniMax 音乐生成失败：服务返回了无法解析的 JSON。')
    }
    assertMiniMaxSuccess(payload, 'MiniMax 音乐生成')
    const data = (payload.data || {}) as Record<string, unknown>
    const status = Number(data.status)
    if (Number.isFinite(status) && status !== 2) {
      throw new Error(`MiniMax 音乐生成失败：任务未完成（状态 ${status}）。`)
    }
    if (typeof data.audio !== 'string') throw new Error('MiniMax 音乐生成失败：响应中没有音频。')
    const bytes = decodeMp3Hex(data.audio)
    context.report(95, '背景音乐已生成，正在保存…')
    return { bytes, mimeType: 'audio/mpeg', extension: 'mp3' }
  }
}

export class DemoMusicProvider implements MusicProvider {
  async generate(input: Parameters<MusicProvider['generate']>[0], context: ProviderRunContext): Promise<GeneratedMusic> {
    context.report(30, '正在生成本地演示轻音乐…')
    const bytes = createDemoBackgroundMusicWav(`${input.title}\n${input.prompt}`)
    context.report(90, '演示背景音乐已完成。')
    return { bytes, mimeType: 'audio/wav', extension: 'wav' }
  }
}

export function buildBedtimeMusicPrompt(project: Pick<StoryProject, 'title' | 'theme' | 'summary'> & {
  chapters: Array<Pick<StoryChapter, 'title'>>
}): string {
  const chapterMood = project.chapters.map((chapter) => chapter.title).join('、')
  return [
    '创作一首适合儿童睡前故事的纯器乐轻音乐，作为整本绘本循环播放的背景音乐。',
    `故事标题：${project.title}`,
    `故事主题：${project.theme}`,
    project.summary ? `故事梗概：${project.summary}` : '',
    chapterMood ? `故事场景线索：${chapterMood}` : '',
    '音乐要求：温柔、舒缓、安心、富有童话感，旋律简单而有记忆点，整体低动态、音量平稳。',
    '配器以柔和钢琴、八音盒、轻弦乐和温暖木管为主，可加入很轻的自然氛围，但不要喧宾夺主。',
    '禁止人声、歌词、念白、强烈鼓点、突然变大的音量、尖锐高频、恐怖悬疑音效和悲伤压抑的和声。',
    '结尾自然回落并适合无缝循环，不要出现突兀收尾。',
  ].filter(Boolean).join('\n').slice(0, 2_000)
}

function decodeMp3Hex(value: string): Buffer {
  const hex = value.replace(/\s/g, '')
  if (!hex || hex.length % 2 !== 0 || hex.length > MAX_MUSIC_BYTES * 2 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('MiniMax 音乐生成失败：音频编码无效或文件过大。')
  }
  const bytes = Buffer.from(hex, 'hex')
  const hasId3 = bytes.length >= 3 && bytes.toString('ascii', 0, 3) === 'ID3'
  const hasFrameSync = bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
  if (!hasId3 && !hasFrameSync) throw new Error('MiniMax 音乐生成失败：返回内容不是有效的 MP3。')
  return bytes
}
