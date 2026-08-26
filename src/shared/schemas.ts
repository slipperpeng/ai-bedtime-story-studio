import { z } from 'zod'
import { isMiniMaxSystemVoiceId } from './minimax-system-voices'
import { DEFAULT_ILLUSTRATION_STYLE, ILLUSTRATION_STYLE_IDS } from './illustration-styles'
import { inspectNormalizedVoiceWav } from './wav'
import { STORY_SCENE_EMOTION_IDS, STORY_SCENE_TYPE_IDS } from './contracts'
import { BACKGROUND_MUSIC_TRACK_IDS } from './background-music'

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max)
const losslessText = (min: number, max: number) => z.string().max(max).refine(
  (value) => value.trim().length >= min,
  `文字内容去除首尾空白后不能少于 ${min} 个字符。`,
)
const narratorVoiceId = z.string().max(100).refine(
  (value) => z.string().uuid().safeParse(value).success || isMiniMaxSystemVoiceId(value),
  '朗读音色编号无效。',
)

const secureRemoteBaseUrl = z.string().trim().min(1).max(2_048).url().refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:'
    && !url.username
    && !url.password
    && !url.search
    && !url.hash
}, '远程模型地址必须使用 HTTPS，且不能包含凭据、查询参数或片段。')

const openAiCompatibleBaseUrl = z.string().trim().min(1).max(2_048).url().refine((value) => {
  const url = new URL(value)
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]'
  return (url.protocol === 'https:' || (url.protocol === 'http:' && loopback))
    && !url.username
    && !url.password
    && !url.search
    && !url.hash
}, '兼容模型地址必须使用 HTTPS；只有本机回环地址可以使用 HTTP。')

const storedSettingsShape = {
  defaultStoryProvider: z.enum(['minimax', 'openai-compatible', 'demo']).default('minimax'),
  miniMaxBaseUrl: secureRemoteBaseUrl,
  miniMaxGroupId: z.string().trim().max(100),
  miniMaxTextPath: z.string().trim().startsWith('/').max(200),
  miniMaxImagePath: z.string().trim().startsWith('/').max(200),
  miniMaxTextModel: trimmed(1, 120),
  miniMaxImageModel: trimmed(1, 120),
  miniMaxSpeechModel: trimmed(1, 120).default('speech-2.8-hd'),
  openAiBaseUrl: openAiCompatibleBaseUrl,
  openAiModel: trimmed(1, 120),
}

// Strip the removed local-service fields when loading settings written by older versions.
export const StoredSettingsSchema = z.object(storedSettingsShape).strip()

export const CreateVoiceSchema = z.object({
  provider: z.literal('minimax-online'),
  name: trimmed(1, 50),
  language: z.enum(['zh', 'en']),
  referenceText: trimmed(4, 600),
  audioBytes: z.instanceof(Uint8Array).refine((value) => value.byteLength <= 30 * 1024 * 1024, {
    message: '声音样本不能超过 30 MB。',
  }),
  mimeType: z.literal('audio/wav'),
  durationMs: z.number().int().min(3_000).max(30_000),
  consentConfirmed: z.literal(true),
  speakerIsAdult: z.literal(true),
  onlineUploadConfirmed: z.literal(true),
}).superRefine((value, context) => {
  let wavInfo: ReturnType<typeof inspectNormalizedVoiceWav> | undefined
  try {
    wavInfo = inspectNormalizedVoiceWav(value.audioBytes)
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['audioBytes'],
      message: error instanceof Error ? error.message : '声音样本 WAV 无效。',
    })
    return
  }
  if (Math.abs(wavInfo.durationMs - value.durationMs) > 100) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['durationMs'],
      message: '声音样本上报时长与 WAV 实际时长不一致。',
    })
  }
  if (wavInfo.durationMs < 3_000 || wavInfo.durationMs > 30_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['audioBytes'],
      message: '声音样本实际时长必须为 3 至 30 秒。',
    })
  }
  if (wavInfo.speechMs < 500 || wavInfo.peak < 0.01 || wavInfo.rms < 0.002) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['audioBytes'],
      message: '声音样本中没有检测到足够的有效声音，请重新录制。',
    })
  }
  if (wavInfo.durationMs < 10_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['durationMs'],
      message: 'MiniMax 在线音色样本至少需要 10 秒。',
    })
  }
  if (value.audioBytes.byteLength > 20 * 1024 * 1024) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['audioBytes'],
      message: 'MiniMax 在线音色样本不能超过 20 MB。',
    })
  }
  if (value.onlineUploadConfirmed !== true) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['onlineUploadConfirmed'],
      message: '使用 MiniMax 在线音色前，必须明确同意上传声音样本。',
    })
  }
})

export const CreateProjectSchema = z.object({
  title: trimmed(1, 80),
  childName: trimmed(1, 30),
  childAge: z.number().int().min(2).max(14),
  theme: trimmed(2, 120),
  language: z.enum(['zh', 'en']).default('zh'),
  sourceMode: z.enum(['ai', 'written']),
  sourceText: z.string().trim().max(20_000),
  chapterCount: z.number().int().min(2).max(12),
  chapterCharMin: z.number().int().min(60).max(500),
  chapterCharMax: z.number().int().min(60).max(500),
  illustrationStyle: z.enum(ILLUSTRATION_STYLE_IDS).default(DEFAULT_ILLUSTRATION_STYLE),
  storyProvider: z.enum(['minimax', 'openai-compatible', 'demo']),
  storyModel: trimmed(1, 120),
  voiceProfileId: narratorVoiceId,
  backgroundMusicEnabled: z.boolean().default(false),
  backgroundMusicTrackId: z.enum(BACKGROUND_MUSIC_TRACK_IDS).optional(),
}).superRefine((value, context) => {
  if (value.sourceMode !== 'ai' && value.sourceText.length < 20) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceText'],
      message: '自己编写的故事至少需要 20 个字。',
    })
  }
  if (value.chapterCharMin > value.chapterCharMax) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['chapterCharMax'],
      message: '每章最多字数不能少于最少字数。',
    })
  }
  if (value.backgroundMusicEnabled && !value.backgroundMusicTrackId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['backgroundMusicTrackId'],
      message: '请选择一首背景音乐。',
    })
  }
  if (!value.backgroundMusicEnabled && value.backgroundMusicTrackId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['backgroundMusicTrackId'],
      message: '未启用背景音乐时不能保留音乐选择。',
    })
  }
})

export const SaveSettingsSchema = z.object({
  ...storedSettingsShape,
  miniMaxApiKey: z.string().trim().max(500).optional(),
  openAiApiKey: z.string().trim().max(500).optional(),
})

export const StoryPackageSchema = z.object({
  title: trimmed(1, 100),
  summary: trimmed(1, 600),
  styleBible: z.object({
    visualStyle: trimmed(1, 500),
    palette: trimmed(1, 300),
    characterDescriptions: z.array(trimmed(1, 500)).min(1).max(8),
    negativePrompt: z.string().trim().max(500).default('文字、水印、恐怖画面、写实儿童肖像'),
  }),
  chapters: z.array(z.object({
    title: trimmed(1, 80),
    text: losslessText(10, 2_500),
    imagePrompt: trimmed(5, 1_500),
    imageAlt: trimmed(2, 200),
    scenes: z.array(z.object({
      // Scene boundaries may intentionally contain a newline or a space.
      // Validation must not transform them because concatenation is lossless.
      text: losslessText(1, 2_500),
      sceneType: z.enum(STORY_SCENE_TYPE_IDS),
      emotion: z.enum(STORY_SCENE_EMOTION_IDS).optional(),
    }).strict()).min(1).max(8).optional(),
  })).min(2).max(12),
})

export type StoryPackage = z.infer<typeof StoryPackageSchema>
