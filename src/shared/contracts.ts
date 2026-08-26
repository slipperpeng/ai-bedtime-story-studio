import type { MiniMaxSystemVoice } from './minimax-system-voices'
import type { IllustrationStyleId } from './illustration-styles'
import type { BackgroundMusicTrackId } from './background-music'

export type StorySourceMode = 'ai' | 'written' | 'recorded'
export type CreateStorySourceMode = Exclude<StorySourceMode, 'recorded'>
export type StoryLanguage = 'zh' | 'en'
export type StoryProviderId = 'minimax' | 'openai-compatible' | 'demo'
export type VoiceProviderId = 'local-qwen3' | 'minimax-online'
export type VoiceStatus = 'sampled' | 'preparing' | 'ready' | 'failed'
export type ProjectStatus = 'draft' | 'generating' | 'ready' | 'failed'
export type JobStatus = 'queued' | 'running' | 'paused' | 'succeeded' | 'failed' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'

export const STORY_SCENE_TYPE_IDS = [
  'peaceful',
  'adventure',
  'playful',
  'tense',
  'climax',
  'warm',
  'reflective',
  'goodnight',
] as const

export type StorySceneType = (typeof STORY_SCENE_TYPE_IDS)[number]

export const STORY_SCENE_EMOTION_IDS = [
  'happy',
  'sad',
  'angry',
  'fearful',
  'disgusted',
  'surprised',
  'calm',
] as const

export type StorySceneEmotion = (typeof STORY_SCENE_EMOTION_IDS)[number]
export type PipelineStepId =
  | 'voice_prepare'
  | 'story_generate'
  | 'music_generate'
  | 'image_generate'
  | 'tts_synthesize'
  | 'html_export'

export interface ProviderSettings {
  defaultStoryProvider: StoryProviderId
  miniMaxBaseUrl: string
  miniMaxGroupId: string
  miniMaxTextPath: string
  miniMaxImagePath: string
  miniMaxTextModel: string
  miniMaxImageModel: string
  miniMaxSpeechModel: string
  openAiBaseUrl: string
  openAiModel: string
  hasMiniMaxKey: boolean
  hasOpenAiKey: boolean
}

export interface SaveSettingsInput extends Omit<ProviderSettings, 'hasMiniMaxKey' | 'hasOpenAiKey'> {
  miniMaxApiKey?: string
  openAiApiKey?: string
}

export interface VoiceProfile {
  id: string
  provider: VoiceProviderId
  name: string
  language: 'zh' | 'en'
  referenceText: string
  sampleAsset: string
  preparedAsset?: string
  preparedModel?: string
  remoteVoiceId?: string
  remoteCreatedAt?: string
  remoteActivatedAt?: string
  remoteProviderBaseUrl?: string
  remoteCredentialFingerprint?: string
  durationMs: number
  sampleSha256: string
  status: VoiceStatus
  consentAt: string
  createdAt: string
  updatedAt: string
  error?: string
}

export type NarratorVoice = VoiceProfile | MiniMaxSystemVoice

export interface CreateVoiceInput {
  provider: 'minimax-online'
  name: string
  language: 'zh' | 'en'
  referenceText: string
  audioBytes: Uint8Array
  mimeType: 'audio/wav'
  durationMs: number
  consentConfirmed: boolean
  speakerIsAdult: boolean
  onlineUploadConfirmed?: boolean
}

export interface StoryStyleBible {
  visualStyle: string
  palette: string
  characterDescriptions: string[]
  negativePrompt: string
}

export interface StoryScene {
  id: string
  index: number
  text: string
  sceneType: StorySceneType
  emotion?: StorySceneEmotion
  pitch: number
  speed: number
  audioAsset?: string
  audioFingerprint?: string
}

export interface StoryChapter {
  id: string
  index: number
  title: string
  text: string
  imagePrompt: string
  imageAlt: string
  imageAsset?: string
  audioAsset?: string
  audioFingerprint?: string
  scenes?: StoryScene[]
}

export interface StoryProject {
  id: string
  title: string
  childName: string
  childAge: number
  theme: string
  language?: StoryLanguage
  tone: string
  sourceMode: StorySourceMode
  sourceText: string
  chapterCount: number
  chapterCharMin: number
  chapterCharMax: number
  illustrationStyle: IllustrationStyleId
  storyProvider: StoryProviderId
  storyModel: string
  imageModel: string
  voiceProfileId: string
  backgroundMusicEnabled: boolean
  backgroundMusicTrackId?: BackgroundMusicTrackId
  backgroundMusicAsset?: string
  backgroundMusicPrompt?: string
  backgroundMusicModel?: string
  summary?: string
  styleBible?: StoryStyleBible
  chapters: StoryChapter[]
  outputAsset?: string
  status: ProjectStatus
  createdAt: string
  updatedAt: string
  error?: string
}

export interface CreateProjectInput {
  title: string
  childName: string
  childAge: number
  theme: string
  language?: StoryLanguage
  sourceMode: CreateStorySourceMode
  sourceText: string
  chapterCount: number
  chapterCharMin: number
  chapterCharMax: number
  illustrationStyle?: IllustrationStyleId
  storyProvider: StoryProviderId
  storyModel: string
  voiceProfileId: string
  backgroundMusicEnabled?: boolean
  backgroundMusicTrackId?: BackgroundMusicTrackId
}

export interface JobStep {
  id: PipelineStepId
  label: string
  status: StepStatus
  progress: number
  current?: number
  total?: number
  etaSeconds?: number
  message: string
  startedAt?: string
  completedAt?: string
}

export interface GenerationJob {
  id: string
  kind: 'voice' | 'story'
  projectId?: string
  voiceProfileId?: string
  status: JobStatus
  overallProgress: number
  steps: JobStep[]
  createdAt: string
  updatedAt: string
  error?: string
}

export interface AppSnapshot {
  settings: ProviderSettings
  voices: VoiceProfile[]
  systemVoices: MiniMaxSystemVoice[]
  projects: StoryProject[]
  jobs: GenerationJob[]
}

export interface ExportResult {
  cancelled: boolean
  filePath?: string
}

export interface SystemVoicePreviewResult {
  asset: string
  cached: boolean
}

export type TokenPlanUsageStatus = 'available' | 'low' | 'exhausted' | 'not-configured' | 'unavailable'

export interface TokenPlanUsage {
  status: TokenPlanUsageStatus
  remaining?: number
  remainingPercent?: number
  total?: number
  used?: number
  usedPercent?: number
  resetAt?: string
  checkedAt: string
  message?: string
}

export interface BedtimeApi {
  bootstrap(): Promise<AppSnapshot>
  settings: {
    save(input: SaveSettingsInput): Promise<ProviderSettings>
  }
  usage: {
    get(): Promise<TokenPlanUsage>
  }
  voices: {
    create(input: CreateVoiceInput): Promise<VoiceProfile>
    list(): Promise<VoiceProfile[]>
    prepare(voiceId: string): Promise<GenerationJob>
    previewSystem(voiceId: string): Promise<SystemVoicePreviewResult>
    remove(voiceId: string): Promise<void>
  }
  stories: {
    create(input: CreateProjectInput): Promise<StoryProject>
    list(): Promise<StoryProject[]>
    get(projectId: string): Promise<StoryProject>
    remove(projectId: string): Promise<void>
  }
  jobs: {
    start(projectId: string): Promise<GenerationJob>
    cancel(jobId: string): Promise<void>
    onProgress(listener: (job: GenerationJob) => void): () => void
  }
  export: {
    story(projectId: string): Promise<ExportResult>
  }
  assets: {
    toUrl(relativePath: string): string
  }
}
