import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import type {
  CreateProjectInput,
  CreateVoiceInput,
  GenerationJob,
  NarratorVoice,
  ProviderSettings,
  StoryProject,
  VoiceProfile,
} from '../../shared/contracts'
import { BACKGROUND_MUSIC_FEATURE_ENABLED } from '../../shared/features'
import { LEGACY_CHAPTER_CHAR_RANGE } from '../../shared/child-story-profile'
import { DEFAULT_ILLUSTRATION_STYLE, ILLUSTRATION_STYLE_IDS } from '../../shared/illustration-styles'
import { findMiniMaxSystemVoice, isMiniMaxSystemVoiceId } from '../../shared/minimax-system-voices'
import { StoredSettingsSchema } from '../../shared/schemas'
import { isUnactivatedMiniMaxVoiceExpired } from '../../shared/voice-lifecycle'
import { STORY_SCENE_EMOTION_IDS, STORY_SCENE_TYPE_IDS } from '../../shared/contracts'
import { BACKGROUND_MUSIC_TRACK_IDS } from '../../shared/background-music'

interface StoredSettings extends Omit<ProviderSettings, 'hasMiniMaxKey' | 'hasOpenAiKey'> {}

const persistedLosslessText = (min: number, max: number) => z.string().max(max).refine(
  (value) => value.trim().length >= min,
  `文字内容去除首尾空白后不能少于 ${min} 个字符。`,
)

interface PersistedState {
  schemaVersion: 4
  settings: StoredSettings
  voices: VoiceProfile[]
  projects: StoryProject[]
  jobs: GenerationJob[]
}

interface Version3PersistedState extends Omit<PersistedState, 'schemaVersion'> {
  schemaVersion: 3
}

interface Version2PersistedState extends Omit<PersistedState, 'schemaVersion'> {
  schemaVersion: 2
}

type VoiceLifecycleLeaseMode = 'shared' | 'exclusive'

interface PendingVoiceLifecycleLease {
  mode: VoiceLifecycleLeaseMode
  resolve: (release: () => void) => void
}

interface VoiceLifecycleLeaseState {
  readers: number
  writer: boolean
  queue: PendingVoiceLifecycleLease[]
}

type LegacyStoredSettings = Omit<StoredSettings, 'miniMaxSpeechModel'>
type LegacyVoiceProfile = Omit<VoiceProfile, 'provider' | 'remoteVoiceId' | 'remoteCreatedAt' | 'remoteActivatedAt' | 'remoteProviderBaseUrl' | 'remoteCredentialFingerprint'>

interface LegacyPersistedState {
  schemaVersion: 1
  settings: LegacyStoredSettings
  voices: LegacyVoiceProfile[]
  projects: StoryProject[]
  jobs: GenerationJob[]
}

const isoDateSchema = z.string().datetime()
const assetPathSchema = z.string().min(1).max(1_000).refine((value) => {
  if (isAbsolute(value) || value.includes('\0') || value.includes('\\')) return false
  const segments = value.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}, '资源路径必须是应用数据目录内的规范相对路径。')

const styleBibleSchema = z.object({
  visualStyle: z.string().trim().min(1).max(500),
  palette: z.string().trim().min(1).max(300),
  characterDescriptions: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  negativePrompt: z.string().trim().max(500),
}).strict()

const legacyVoiceProfileShape = {
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(50),
  language: z.enum(['zh', 'en']),
  referenceText: z.string().trim().min(4).max(600),
  sampleAsset: assetPathSchema,
  preparedAsset: assetPathSchema.optional(),
  preparedModel: z.string().trim().min(1).max(120).optional(),
  durationMs: z.number().int().min(3_000).max(30_000),
  sampleSha256: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(['sampled', 'preparing', 'ready', 'failed']),
  consentAt: isoDateSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  error: z.string().max(2_000).optional(),
}

function validateLocalVoiceAssets(
  voice: LegacyVoiceProfile,
  context: z.RefinementCtx,
): void {
  if (voice.sampleAsset !== `voices/${voice.id}/reference.wav`) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sampleAsset'], message: '声音样本路径与音色编号不匹配。' })
  }
  if (voice.preparedAsset && voice.preparedAsset !== `voices/${voice.id}/qwen3-tts-prompt.pt`) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['preparedAsset'], message: '音色提示路径与音色编号不匹配。' })
  }
  if (voice.preparedModel && voice.preparedModel !== 'Qwen/Qwen3-TTS-12Hz-0.6B-Base') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['preparedModel'], message: '本地音色模型无效。' })
  }
}

const legacyVoiceProfileSchema = z.object(legacyVoiceProfileShape).strict().superRefine(validateLocalVoiceAssets)

const voiceProfileSchema = z.object({
  ...legacyVoiceProfileShape,
  provider: z.enum(['local-qwen3', 'minimax-online']),
  remoteVoiceId: z.string().trim().min(8).max(256).regex(/^[A-Za-z](?:[A-Za-z0-9_-]*[A-Za-z0-9])$/).optional(),
  remoteCreatedAt: isoDateSchema.optional(),
  remoteActivatedAt: isoDateSchema.optional(),
  remoteProviderBaseUrl: z.string().trim().min(1).max(2_048).url().refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
  }).optional(),
  remoteCredentialFingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict().superRefine((voice, context) => {
  if (voice.sampleAsset !== `voices/${voice.id}/reference.wav`) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sampleAsset'], message: '声音样本路径与音色编号不匹配。' })
  }
  if (voice.provider === 'local-qwen3') {
    validateLocalVoiceAssets(voice, context)
    if (voice.remoteVoiceId || voice.remoteCreatedAt || voice.remoteActivatedAt
      || voice.remoteProviderBaseUrl || voice.remoteCredentialFingerprint) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['remoteVoiceId'], message: '本地音色不能保存远端音色编号。' })
    }
    return
  }
  if (voice.preparedAsset) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['preparedAsset'], message: 'MiniMax 在线音色不能保存本地音色提示。' })
  }
  if (voice.status === 'ready' && (!voice.remoteVoiceId || !voice.preparedModel)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: '可用的 MiniMax 在线音色缺少远端音色编号或模型。' })
  }
  if (voice.remoteActivatedAt && !voice.remoteCreatedAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['remoteActivatedAt'], message: '在线音色激活时间缺少创建时间。' })
  }
  if ((voice.remoteProviderBaseUrl && !voice.remoteCredentialFingerprint)
    || (!voice.remoteProviderBaseUrl && voice.remoteCredentialFingerprint)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['remoteCredentialFingerprint'], message: '在线音色的服务地址与凭据指纹必须同时保存。' })
  }
})

const storyChapterSchema = z.object({
  id: z.string().uuid(),
  index: z.number().int().min(1).max(12),
  title: z.string().trim().min(1).max(80),
  text: persistedLosslessText(1, 2_500),
  imagePrompt: z.string().trim().min(5).max(1_500),
  imageAlt: z.string().trim().min(2).max(200),
  imageAsset: assetPathSchema.optional(),
  audioAsset: assetPathSchema.optional(),
  audioFingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  scenes: z.array(z.object({
    id: z.string().uuid(),
    index: z.number().int().min(1).max(8),
    text: persistedLosslessText(1, 2_500),
    sceneType: z.enum(STORY_SCENE_TYPE_IDS),
    emotion: z.enum(STORY_SCENE_EMOTION_IDS).optional(),
    pitch: z.number().int().min(-12).max(12),
    speed: z.number().min(0.5).max(2),
    audioAsset: assetPathSchema.optional(),
    audioFingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  }).strict()).max(8).optional(),
}).strict()

const storyProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  childName: z.string().trim().min(1).max(30),
  childAge: z.number().int().min(2).max(14),
  theme: z.string().trim().min(2).max(120),
  language: z.enum(['zh', 'en']).default('zh'),
  tone: z.string().trim().min(2).max(80),
  sourceMode: z.enum(['ai', 'written', 'recorded']),
  sourceText: z.string().trim().max(20_000),
  chapterCount: z.number().int().min(2).max(12),
  chapterCharMin: z.number().int().min(60).max(500),
  chapterCharMax: z.number().int().min(60).max(500),
  illustrationStyle: z.enum(ILLUSTRATION_STYLE_IDS).default(DEFAULT_ILLUSTRATION_STYLE),
  storyProvider: z.enum(['minimax', 'openai-compatible', 'demo']),
  storyModel: z.string().trim().min(1).max(120),
  imageModel: z.string().trim().min(1).max(120),
  voiceProfileId: z.string().max(100).refine(
    (value) => z.string().uuid().safeParse(value).success || isMiniMaxSystemVoiceId(value),
    '朗读音色编号无效。',
  ),
  backgroundMusicEnabled: z.boolean().default(false),
  backgroundMusicTrackId: z.enum(BACKGROUND_MUSIC_TRACK_IDS).optional(),
  backgroundMusicAsset: assetPathSchema.optional(),
  backgroundMusicPrompt: z.string().trim().min(1).max(2_000).optional(),
  backgroundMusicModel: z.string().trim().min(1).max(120).optional(),
  summary: z.string().trim().min(1).max(600).optional(),
  styleBible: styleBibleSchema.optional(),
  chapters: z.array(storyChapterSchema).max(12),
  outputAsset: assetPathSchema.optional(),
  status: z.enum(['draft', 'generating', 'ready', 'failed']),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  error: z.string().max(10_000).optional(),
}).strict().superRefine((project, context) => {
  if (project.sourceMode !== 'ai' && project.sourceText.length < 20) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceText'], message: '故事原稿过短。' })
  }
  if (project.chapters.length !== 0 && project.chapters.length !== project.chapterCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters'], message: '持久化章节数与项目设定不一致。' })
  }
  if (project.chapterCharMin > project.chapterCharMax) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapterCharMax'], message: '每章最多字数不能少于最少字数。' })
  }
  if (project.backgroundMusicAsset
    && (!project.backgroundMusicAsset.startsWith(`projects/${project.id}/music/`)
      || !/\.(wav|mp3)$/i.test(project.backgroundMusicAsset))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['backgroundMusicAsset'], message: '背景音乐路径越界或格式无效。' })
  }
  if (!project.backgroundMusicEnabled
    && (project.backgroundMusicTrackId || project.backgroundMusicAsset || project.backgroundMusicPrompt || project.backgroundMusicModel)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['backgroundMusicEnabled'], message: '未启用背景音乐的故事不能保存音乐产物。' })
  }
  const chapterIds = new Set<string>()
  project.chapters.forEach((chapter, chapterOffset) => {
    if (chapterIds.has(chapter.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterOffset, 'id'], message: '章节编号重复。' })
    }
    chapterIds.add(chapter.id)
    if (chapter.index !== chapterOffset + 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterOffset, 'index'], message: '章节序号不连续。' })
    }
    const prefix = `projects/${project.id}/`
    if (chapter.imageAsset && (!chapter.imageAsset.startsWith(`${prefix}images/`) || !/\.(png|jpe?g|webp|svg)$/i.test(chapter.imageAsset))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterOffset, 'imageAsset'], message: '章节插图路径越界或格式无效。' })
    }
    if (chapter.audioAsset && (!chapter.audioAsset.startsWith(`${prefix}audio/`) || !/\.(wav|mp3|m4a|ogg)$/i.test(chapter.audioAsset))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterOffset, 'audioAsset'], message: '章节音频路径越界或格式无效。' })
    }
    if (chapter.scenes) {
      const sceneIds = new Set<string>()
      chapter.scenes.forEach((scene, sceneOffset) => {
        if (sceneIds.has(scene.id)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterOffset, 'scenes', sceneOffset, 'id'], message: '场景编号重复。' })
        }
        sceneIds.add(scene.id)
        if (scene.index !== sceneOffset + 1) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterOffset, 'scenes', sceneOffset, 'index'], message: '场景序号不连续。' })
        }
        if (scene.audioAsset && (!scene.audioAsset.startsWith(`${prefix}audio/scenes/`) || !/\.wav$/i.test(scene.audioAsset))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterOffset, 'scenes', sceneOffset, 'audioAsset'], message: '场景音频必须是可合并的 WAV 文件，且路径不能越界。' })
        }
      })
      if (chapter.scenes.map((scene) => scene.text).join('') !== chapter.text) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterOffset, 'scenes'], message: '场景正文拼接后必须与章节正文一致。' })
      }
    }
  })
  if (project.outputAsset && (!project.outputAsset.startsWith(`projects/${project.id}/output/`) || !project.outputAsset.endsWith('.html'))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['outputAsset'], message: '故事导出路径与项目编号不匹配。' })
  }
})

const jobStepSchema = z.object({
  id: z.enum(['voice_prepare', 'story_generate', 'music_generate', 'image_generate', 'tts_synthesize', 'html_export']),
  label: z.string().min(1).max(100),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled', 'skipped']),
  progress: z.number().min(0).max(100),
  current: z.number().int().min(0).optional(),
  total: z.number().int().min(0).optional(),
  etaSeconds: z.number().int().min(0).optional(),
  message: z.string().max(2_000),
  startedAt: isoDateSchema.optional(),
  completedAt: isoDateSchema.optional(),
}).strict()

const generationJobSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['voice', 'story']),
  projectId: z.string().uuid().optional(),
  voiceProfileId: z.string().uuid().optional(),
  status: z.enum(['queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled']),
  overallProgress: z.number().min(0).max(100),
  steps: z.array(jobStepSchema).min(1).max(6),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  error: z.string().max(10_000).optional(),
}).strict().superRefine((job, context) => {
  if (job.kind === 'voice' && (!job.voiceProfileId || job.projectId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '音色任务范围无效。' })
  }
  if (job.kind === 'story' && (!job.projectId || job.voiceProfileId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '故事任务范围无效。' })
  }
  if (new Set(job.steps.map((step) => step.id)).size !== job.steps.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['steps'], message: '任务步骤重复。' })
  }
})

const persistedStateSchema = z.object({
  schemaVersion: z.literal(4),
  settings: StoredSettingsSchema,
  voices: z.array(voiceProfileSchema).max(1_000),
  projects: z.array(storyProjectSchema).max(10_000),
  jobs: z.array(generationJobSchema).max(100),
}).strict().superRefine((state, context) => {
  const voiceIds = new Set(state.voices.map((voice) => voice.id))
  const projectIds = new Set(state.projects.map((project) => project.id))
  if (voiceIds.size !== state.voices.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['voices'], message: '音色编号重复。' })
  if (projectIds.size !== state.projects.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects'], message: '故事编号重复。' })
  state.projects.forEach((project, index) => {
    if (!voiceIds.has(project.voiceProfileId) && !isMiniMaxSystemVoiceId(project.voiceProfileId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['projects', index, 'voiceProfileId'], message: '故事引用了不存在的音色。' })
    }
  })
})

const version3PersistedStateSchema = z.object({
  schemaVersion: z.literal(3),
  settings: StoredSettingsSchema,
  voices: z.array(voiceProfileSchema).max(1_000),
  projects: z.array(storyProjectSchema).max(10_000),
  jobs: z.array(generationJobSchema).max(100),
}).strict()

const version2PersistedStateSchema = z.object({
  schemaVersion: z.literal(2),
  settings: StoredSettingsSchema,
  voices: z.array(voiceProfileSchema).max(1_000),
  projects: z.array(storyProjectSchema).max(10_000),
  jobs: z.array(generationJobSchema).max(100),
}).strict()

const legacyStoredSettingsSchema = StoredSettingsSchema.omit({ miniMaxSpeechModel: true })
const legacyPersistedStateSchema = z.object({
  schemaVersion: z.literal(1),
  settings: legacyStoredSettingsSchema,
  voices: z.array(legacyVoiceProfileSchema).max(1_000),
  projects: z.array(storyProjectSchema).max(10_000),
  jobs: z.array(generationJobSchema).max(100),
}).strict()

const configuredDefaultSettings: StoredSettings = {
  defaultStoryProvider: 'minimax',
  miniMaxBaseUrl: 'https://api.minimaxi.com/v1',
  miniMaxGroupId: '',
  miniMaxTextPath: '/chat/completions',
  miniMaxImagePath: '/image_generation',
  miniMaxTextModel: 'MiniMax-M3',
  miniMaxImageModel: 'image-01',
  miniMaxSpeechModel: 'speech-2.8-hd',
  openAiBaseUrl: 'https://api.openai.com/v1',
  openAiModel: 'gpt-4.1-mini',
}

const defaultSettings: StoredSettings = StoredSettingsSchema.parse(configuredDefaultSettings)

function emptyState(): PersistedState {
  return {
    schemaVersion: 4,
    settings: structuredClone(defaultSettings),
    voices: [],
    projects: [],
    jobs: [],
  }
}

function addLegacyChapterRanges(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const projects = (value as { projects?: unknown }).projects
  if (!Array.isArray(projects)) return value
  return {
    ...value,
    projects: projects.map((project) => typeof project === 'object' && project !== null
      ? {
        ...project,
        chapterCharMin: LEGACY_CHAPTER_CHAR_RANGE.min,
        chapterCharMax: LEGACY_CHAPTER_CHAR_RANGE.max,
      }
      : project),
  }
}

function parsePersistedState(value: unknown): { state: PersistedState; migrated: boolean } {
  if (typeof value === 'object' && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === 1) {
    const legacy = legacyPersistedStateSchema.parse(addLegacyChapterRanges(value)) as LegacyPersistedState
    const migrated = {
      schemaVersion: 4 as const,
      settings: { ...legacy.settings, miniMaxSpeechModel: 'speech-2.8-hd' },
      voices: legacy.voices.map((voice) => ({ ...voice, provider: 'local-qwen3' as const })),
      projects: legacy.projects,
      jobs: legacy.jobs,
    }
    return {
      state: persistedStateSchema.parse(migrated) as PersistedState,
      migrated: true,
    }
  }
  if (typeof value === 'object' && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === 2) {
    const legacy = version2PersistedStateSchema.parse(addLegacyChapterRanges(value)) as Version2PersistedState
    return {
      state: persistedStateSchema.parse({ ...legacy, schemaVersion: 4 }) as PersistedState,
      migrated: true,
    }
  }
  if (typeof value === 'object' && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === 3) {
    const legacy = version3PersistedStateSchema.parse(addLegacyChapterRanges(value)) as Version3PersistedState
    return {
      state: persistedStateSchema.parse({ ...legacy, schemaVersion: 4 }) as PersistedState,
      migrated: true,
    }
  }
  const missingStoryProvider = typeof value === 'object'
    && value !== null
    && typeof (value as { settings?: unknown }).settings === 'object'
    && (value as { settings: object }).settings !== null
    && !Object.hasOwn((value as { settings: object }).settings, 'defaultStoryProvider')
  const projects = typeof value === 'object' && value !== null && Array.isArray((value as { projects?: unknown }).projects)
    ? (value as { projects: unknown[] }).projects
    : []
  const missingIllustrationStyle = projects.some((project) => typeof project === 'object'
    && project !== null
    && !Object.hasOwn(project, 'illustrationStyle'))
  const missingBackgroundMusicSetting = projects.some((project) => typeof project === 'object'
    && project !== null
    && !Object.hasOwn(project, 'backgroundMusicEnabled'))
  return {
    state: persistedStateSchema.parse(value) as PersistedState,
    migrated: missingStoryProvider || missingIllustrationStyle || missingBackgroundMusicSetting,
  }
}

function migrateLegacyMiniMaxDefaults(state: PersistedState): boolean {
  let changed = false
  const settings = state.settings
  const officialApi = settings.miniMaxBaseUrl === 'https://api.minimaxi.com/v1'
  if (officialApi && settings.miniMaxTextPath === '/text/chatcompletion_v2') {
    settings.miniMaxTextPath = '/chat/completions'
    changed = true
  }
  if (officialApi && settings.miniMaxTextModel === 'MiniMax-Text-01') {
    settings.miniMaxTextModel = 'MiniMax-M3'
    changed = true
  }
  state.projects.forEach((project) => {
    if (officialApi && project.storyProvider === 'minimax' && project.storyModel === 'MiniMax-Text-01') {
      project.storyModel = 'MiniMax-M3'
      changed = true
    }
  })
  return changed
}

const now = () => new Date().toISOString()
const toPosix = (value: string) => value.split(sep).join('/')

export class AppStore {
  readonly root: string
  private readonly statePath: string
  private state: PersistedState = emptyState()
  private writeQueue: Promise<void> = Promise.resolve()
  private deletionQueue: Promise<void> = Promise.resolve()
  private readonly deletingVoices = new Set<string>()
  private readonly deletingProjects = new Set<string>()
  private readonly voiceLifecycleLeases = new Map<string, VoiceLifecycleLeaseState>()

  constructor(root: string) {
    this.root = resolve(root)
    this.statePath = resolve(this.root, 'state.json')
  }

  async initialize(): Promise<void> {
    let migratedSettings = false
    await Promise.all([
      mkdir(this.root, { recursive: true }),
      mkdir(resolve(this.root, 'voices'), { recursive: true }),
      mkdir(resolve(this.root, 'projects'), { recursive: true }),
    ])
    try {
      const source = await readFile(this.statePath, 'utf8')
      const parsed = parsePersistedState(JSON.parse(source))
      this.state = parsed.state
      migratedSettings = migrateLegacyMiniMaxDefaults(this.state) || parsed.migrated
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        await this.persist()
      } else if (error instanceof SyntaxError || error instanceof z.ZodError) {
        const suffix = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
        const recoveryPath = resolve(this.root, `state.invalid-${suffix}.json`)
        await rename(this.statePath, recoveryPath)
        this.state = emptyState()
        await this.persist()
        console.warn(`Invalid application state was preserved at ${recoveryPath}.`)
      } else {
        throw error
      }
    }

    let recovered = migratedSettings
    this.state.jobs = this.state.jobs.map((job) => {
      if (job.status !== 'running' && job.status !== 'queued') return job
      recovered = true
      return { ...job, status: 'paused', updatedAt: now(), error: '应用上次退出时任务尚未完成，可重新开始以续作。' }
    })
    this.state.projects = this.state.projects.map((project) => {
      if (project.status !== 'generating') return project
      recovered = true
      return { ...project, status: 'draft', updatedAt: now() }
    })
    this.state.voices = this.state.voices.map((voice) => {
      if (voice.status !== 'ready' || !isUnactivatedMiniMaxVoiceExpired(voice)) return voice
      recovered = true
      return {
        ...voice,
        status: 'failed',
        error: 'MiniMax 临时音色已超过 168 小时且尚未完成首次朗读，请重新在线复刻。',
        updatedAt: now(),
      }
    })
    if (recovered) await this.persist()
  }

  getSettings(): StoredSettings {
    return structuredClone(this.state.settings)
  }

  async setSettings(settings: StoredSettings): Promise<void> {
    await this.mutate((state) => {
      state.settings = structuredClone(settings)
    })
  }

  listVoices(): VoiceProfile[] {
    return structuredClone(this.state.voices).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getVoice(id: string): VoiceProfile {
    const voice = this.state.voices.find((item) => item.id === id)
    if (!voice) throw new Error('找不到指定音色。')
    return structuredClone(voice)
  }

  getNarratorVoice(id: string): NarratorVoice {
    const systemVoice = findMiniMaxSystemVoice(id)
    return systemVoice ? structuredClone(systemVoice) : this.getVoice(id)
  }

  async createVoice(input: CreateVoiceInput): Promise<VoiceProfile> {
    if (this.state.voices.some((item) => item.name.toLowerCase() === input.name.toLowerCase())) {
      throw new Error('已有同名音色，请换一个名称。')
    }
    const id = randomUUID()
    const createdAt = now()
    const sampleAsset = `voices/${id}/reference.wav`
    await this.writeAsset(sampleAsset, input.audioBytes)
    const voice: VoiceProfile = {
      id,
      provider: 'minimax-online',
      name: input.name,
      language: input.language,
      referenceText: input.referenceText,
      sampleAsset,
      durationMs: input.durationMs,
      sampleSha256: createHash('sha256').update(input.audioBytes).digest('hex'),
      status: 'sampled',
      consentAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    }
    try {
      await this.mutate((state) => {
        if (state.voices.some((item) => item.name.toLowerCase() === voice.name.toLowerCase())) {
          throw new Error('已有同名音色，请换一个名称。')
        }
        state.voices.unshift(voice)
      })
    } catch (error) {
      await rm(this.resolveAsset(`voices/${id}`), { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
    return structuredClone(voice)
  }

  async updateVoice(id: string, update: (voice: VoiceProfile) => void): Promise<VoiceProfile> {
    let result: VoiceProfile | undefined
    await this.mutate((state) => {
      const voice = state.voices.find((item) => item.id === id)
      if (!voice) throw new Error('找不到指定音色。')
      update(voice)
      voice.updatedAt = now()
      result = structuredClone(voice)
    })
    return result!
  }

  async withVoiceLifecycleLease<T>(
    id: string,
    mode: VoiceLifecycleLeaseMode,
    operation: (voice: VoiceProfile) => Promise<T>,
  ): Promise<T> {
    const release = await this.acquireVoiceLifecycleLease(id, mode)
    try {
      return await operation(this.getVoice(id))
    } finally {
      release()
    }
  }

  async removeVoice(id: string): Promise<void> {
    await this.removeVoiceWithCleanup(id, async () => undefined)
  }

  async removeVoiceWithCleanup(
    id: string,
    beforeLocalDelete: (voice: VoiceProfile) => Promise<void>,
  ): Promise<void> {
    await this.queueDeletion(() => this.withVoiceLifecycleLease(id, 'exclusive', async () => {
      await this.removeVoiceTransaction(id, beforeLocalDelete)
    }))
  }

  private async removeVoiceTransaction(
    id: string,
    beforeLocalDelete: (voice: VoiceProfile) => Promise<void>,
  ): Promise<void> {
    if (this.deletingVoices.has(id)) throw new Error('该音色正在删除。')
    this.deletingVoices.add(id)
    let voice: VoiceProfile
    try {
      // A project/job mutation may already have passed its first validation and be
      // waiting for state persistence. Drain it after publishing the deletion flag,
      // then repeat the reference checks before any irreversible remote cleanup.
      await this.writeQueue
      voice = this.getVoice(id)
      this.assertVoiceCanBeRemoved(id)
      await this.updateVoice(id, (target) => {
        target.status = 'failed'
        target.error = '音色删除正在进行；若应用意外退出，请重新点击删除以安全续作。'
      })
      let externalCleanupCompleted = false
      let localRemovalStarted = false
      try {
        await beforeLocalDelete(structuredClone(voice))
        externalCleanupCompleted = voice.provider === 'minimax-online' && Boolean(voice.remoteVoiceId)
        localRemovalStarted = true
        await this.removeVoiceLocally(id, voice, externalCleanupCompleted)
      } catch (error) {
        if (!externalCleanupCompleted && !localRemovalStarted) {
          try {
            await this.restoreVoiceAfterRemovalFailure(voice, false)
          } catch (restoreError) {
            throw new AggregateError([error, restoreError], '远端音色删除失败，且无法恢复本机音色状态。')
          }
        }
        throw error
      }
    } finally {
      this.deletingVoices.delete(id)
    }
  }

  private assertVoiceCanBeRemoved(id: string): void {
    if (this.state.projects.some((project) => project.voiceProfileId === id)) {
      throw new Error('该音色仍被故事使用，请先删除或改用其他音色。')
    }
    if (this.state.jobs.some((job) => job.voiceProfileId === id && (job.status === 'queued' || job.status === 'running'))) {
      throw new Error('该音色仍有任务正在运行，请先等待任务结束或取消任务。')
    }
  }

  private async removeVoiceLocally(
    id: string,
    voice: VoiceProfile,
    externalCleanupCompleted: boolean,
  ): Promise<void> {
    const target = this.resolveAsset(`voices/${id}`)
    const quarantine = this.resolveAsset(`voices/.deleting-${id}-${randomUUID()}`)
    let moved = false
    try {
      try {
        await rename(target, quarantine)
        moved = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await this.mutate((state) => {
        if (state.projects.some((project) => project.voiceProfileId === id)) {
          throw new Error('该音色刚刚被故事使用，无法删除。')
        }
        if (state.jobs.some((job) => job.voiceProfileId === id && (job.status === 'queued' || job.status === 'running'))) {
          throw new Error('该音色刚刚启动了新任务，无法删除。')
        }
        const before = state.voices.length
        state.voices = state.voices.filter((item) => item.id !== id)
        if (before === state.voices.length) throw new Error('找不到指定音色。')
      })
      if (moved) {
        await rm(quarantine, { recursive: true, force: true })
        moved = false
      }
    } catch (error) {
      if (moved) {
        try {
          await rename(quarantine, target)
          moved = false
        } catch (restoreError) {
          throw new AggregateError([error, restoreError], '删除失败，且无法恢复音色目录。')
        }
      }
      try {
        await this.restoreVoiceAfterRemovalFailure(voice, externalCleanupCompleted)
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], '删除失败，且无法恢复音色状态。')
      }
      throw error
    }
  }

  private async restoreVoiceAfterRemovalFailure(
    voice: VoiceProfile,
    externalCleanupCompleted: boolean,
  ): Promise<void> {
    const restored = structuredClone(voice)
    if (externalCleanupCompleted) {
      restored.status = 'failed'
      restored.error = '远端音色已删除，但本机档案清理失败。请再次点击删除以完成清理。'
      restored.updatedAt = now()
    }
    await this.mutate((state) => {
      const index = state.voices.findIndex((item) => item.id === restored.id)
      if (index === -1) state.voices.unshift(restored)
      else state.voices[index] = restored
    })
  }

  listProjects(): StoryProject[] {
    return structuredClone(this.state.projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getProject(id: string): StoryProject {
    const project = this.state.projects.find((item) => item.id === id)
    if (!project) throw new Error('找不到指定故事。')
    return structuredClone(project)
  }

  async removeProject(id: string): Promise<void> {
    await this.queueDeletion(() => this.removeProjectTransaction(id))
  }

  private async removeProjectTransaction(id: string): Promise<void> {
    const project = this.getProject(id)
    if (this.deletingProjects.has(id)) throw new Error('该故事正在删除。')
    if (this.state.jobs.some((job) => job.projectId === id && (job.status === 'queued' || job.status === 'running'))) {
      throw new Error('该故事仍有任务正在运行，请先停止任务。')
    }
    const relatedJobs = this.state.jobs.filter((job) => job.projectId === id)
    const target = this.resolveAsset(`projects/${id}`)
    const quarantine = this.resolveAsset(`projects/.deleting-${id}-${randomUUID()}`)
    this.deletingProjects.add(id)
    let moved = false
    try {
      try {
        await rename(target, quarantine)
        moved = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await this.mutate((state) => {
        if (state.jobs.some((job) => job.projectId === id && (job.status === 'queued' || job.status === 'running'))) {
          throw new Error('该故事刚刚启动了新任务，无法删除。')
        }
        const before = state.projects.length
        state.projects = state.projects.filter((item) => item.id !== id)
        state.jobs = state.jobs.filter((job) => job.projectId !== id)
        if (before === state.projects.length) throw new Error('找不到指定故事。')
      })
      if (moved) {
        try {
          await rm(quarantine, { recursive: true, force: true })
          moved = false
        } catch (error) {
          await rename(quarantine, target)
          moved = false
          await this.mutate((state) => {
            if (!state.projects.some((item) => item.id === project.id)) state.projects.unshift(project)
            const existingJobIds = new Set(state.jobs.map((job) => job.id))
            state.jobs.unshift(...relatedJobs.filter((job) => !existingJobIds.has(job.id)))
            state.jobs = state.jobs.slice(0, 100)
          })
          throw error
        }
      }
    } catch (error) {
      if (moved) {
        try {
          await rename(quarantine, target)
          moved = false
        } catch (restoreError) {
          throw new AggregateError([error, restoreError], '删除失败，且无法恢复故事目录。')
        }
      }
      throw error
    } finally {
      this.deletingProjects.delete(id)
    }
  }

  async createProject(input: CreateProjectInput): Promise<StoryProject> {
    const usesSystemVoice = isMiniMaxSystemVoiceId(input.voiceProfileId)
    if (!usesSystemVoice && this.deletingVoices.has(input.voiceProfileId)) throw new Error('指定音色正在删除，请稍后重试。')
    this.getNarratorVoice(input.voiceProfileId)
    const id = randomUUID()
    const createdAt = now()
    const project: StoryProject = {
      id,
      ...input,
      tone: '温暖微笑',
      language: input.language || 'zh',
      backgroundMusicEnabled: BACKGROUND_MUSIC_FEATURE_ENABLED && (input.backgroundMusicEnabled ?? false),
      backgroundMusicTrackId: BACKGROUND_MUSIC_FEATURE_ENABLED && input.backgroundMusicEnabled
        ? input.backgroundMusicTrackId
        : undefined,
      illustrationStyle: input.illustrationStyle || DEFAULT_ILLUSTRATION_STYLE,
      imageModel: input.storyProvider === 'demo' ? 'local-demo' : this.state.settings.miniMaxImageModel,
      chapters: [],
      status: 'draft',
      createdAt,
      updatedAt: createdAt,
    }
    const projectRoot = this.resolveAsset(`projects/${id}`)
    await mkdir(projectRoot, { recursive: true })
    try {
      await this.mutate((state) => {
        if (!usesSystemVoice && (this.deletingVoices.has(input.voiceProfileId)
          || !state.voices.some((voice) => voice.id === input.voiceProfileId))) {
          throw new Error('指定音色不存在或正在删除。')
        }
        state.projects.unshift(project)
      })
    } catch (error) {
      await rm(projectRoot, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
    return structuredClone(project)
  }

  async updateProject(id: string, update: (project: StoryProject) => void): Promise<StoryProject> {
    let result: StoryProject | undefined
    await this.mutate((state) => {
      const project = state.projects.find((item) => item.id === id)
      if (!project) throw new Error('找不到指定故事。')
      update(project)
      project.updatedAt = now()
      result = structuredClone(project)
    })
    return result!
  }

  listJobs(): GenerationJob[] {
    return structuredClone(this.state.jobs).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getJob(id: string): GenerationJob {
    const job = this.state.jobs.find((item) => item.id === id)
    if (!job) throw new Error('找不到指定任务。')
    return structuredClone(job)
  }

  async createJob(job: GenerationJob): Promise<GenerationJob> {
    await this.mutate((state) => {
      if (job.projectId && (this.deletingProjects.has(job.projectId)
        || !state.projects.some((project) => project.id === job.projectId))) {
        throw new Error('指定故事不存在或正在删除。')
      }
      if (job.voiceProfileId && (this.deletingVoices.has(job.voiceProfileId)
        || !state.voices.some((voice) => voice.id === job.voiceProfileId))) {
        throw new Error('指定音色不存在或正在删除。')
      }
      state.jobs.unshift(structuredClone(job))
      state.jobs = state.jobs.slice(0, 100)
    })
    return structuredClone(job)
  }

  async updateJob(id: string, update: (job: GenerationJob) => void): Promise<GenerationJob> {
    let result: GenerationJob | undefined
    await this.mutate((state) => {
      const job = state.jobs.find((item) => item.id === id)
      if (!job) throw new Error('找不到指定任务。')
      update(job)
      job.updatedAt = now()
      result = structuredClone(job)
    })
    return result!
  }

  resolveAsset(asset: string): string {
    if (!asset || isAbsolute(asset) || asset.includes('\0') || asset.includes('\\')) {
      throw new Error('无效的资源路径。')
    }
    const target = resolve(this.root, asset)
    const fromRoot = relative(this.root, target)
    if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) throw new Error('资源路径越界。')
    return target
  }

  toAssetPath(absolutePath: string): string {
    const normalized = resolve(absolutePath)
    const fromRoot = relative(this.root, normalized)
    if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) throw new Error('资源路径越界。')
    return toPosix(fromRoot)
  }

  async writeAsset(asset: string, bytes: Uint8Array | Buffer | string): Promise<string> {
    const target = this.resolveAsset(asset)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
    return target
  }

  async assetExists(asset: string | undefined): Promise<boolean> {
    if (!asset) return false
    try {
      const info = await stat(this.resolveAsset(asset))
      return info.isFile() && info.size > 0
    } catch {
      return false
    }
  }

  private acquireVoiceLifecycleLease(id: string, mode: VoiceLifecycleLeaseMode): Promise<() => void> {
    return new Promise((resolveLease) => {
      const state = this.voiceLifecycleLeases.get(id) || { readers: 0, writer: false, queue: [] }
      this.voiceLifecycleLeases.set(id, state)
      state.queue.push({ mode, resolve: resolveLease })
      this.drainVoiceLifecycleLeases(id, state)
    })
  }

  private drainVoiceLifecycleLeases(id: string, state: VoiceLifecycleLeaseState): void {
    if (state.writer || state.queue.length === 0) return
    if (state.readers > 0) {
      while (state.queue[0]?.mode === 'shared') {
        const lease = state.queue.shift()!
        state.readers += 1
        lease.resolve(this.voiceLifecycleLeaseRelease(id, state, 'shared'))
      }
      return
    }
    if (state.queue[0].mode === 'exclusive') {
      const lease = state.queue.shift()!
      state.writer = true
      lease.resolve(this.voiceLifecycleLeaseRelease(id, state, 'exclusive'))
      return
    }
    while (state.queue[0]?.mode === 'shared') {
      const lease = state.queue.shift()!
      state.readers += 1
      lease.resolve(this.voiceLifecycleLeaseRelease(id, state, 'shared'))
    }
  }

  private voiceLifecycleLeaseRelease(
    id: string,
    state: VoiceLifecycleLeaseState,
    mode: VoiceLifecycleLeaseMode,
  ): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      if (mode === 'exclusive') state.writer = false
      else state.readers -= 1
      if (!state.writer && state.readers === 0 && state.queue.length === 0) {
        this.voiceLifecycleLeases.delete(id)
        return
      }
      this.drainVoiceLifecycleLeases(id, state)
    }
  }

  private async mutate(operation: (state: PersistedState) => void): Promise<void> {
    const run = async () => {
      const draft = structuredClone(this.state)
      operation(draft)
      const validated = persistedStateSchema.parse(draft) as PersistedState
      await this.persistNow(validated)
      this.state = validated
    }
    const next = this.writeQueue.then(run, run)
    this.writeQueue = next.catch(() => undefined)
    await next
  }

  private async queueDeletion(operation: () => Promise<void>): Promise<void> {
    const next = this.deletionQueue.then(operation, operation)
    this.deletionQueue = next.catch(() => undefined)
    await next
  }

  private async persist(): Promise<void> {
    const run = () => this.persistNow(this.state)
    const next = this.writeQueue.then(run, run)
    this.writeQueue = next.catch(() => undefined)
    await next
  }

  private async persistNow(state: PersistedState): Promise<void> {
    const temporary = `${this.statePath}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(temporary, this.statePath)
  }
}
