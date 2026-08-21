import { createHash, randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  GenerationJob,
  JobStep,
  NarratorVoice,
  PipelineStepId,
  StoryProject,
  SystemVoicePreviewResult,
  VoiceProfile,
} from '../../shared/contracts'
import { BACKGROUND_MUSIC_FEATURE_ENABLED } from '../../shared/features'
import { backgroundMusicTrack } from '../../shared/background-music'
import { findMiniMaxSystemVoice } from '../../shared/minimax-system-voices'
import { hydrateStoryScenes, transitionPauseMs } from '../../shared/story-scenes'
import { isUnactivatedMiniMaxVoiceExpired } from '../../shared/voice-lifecycle'
import { AppStore } from '../storage/store'
import { SecretStore } from '../security/secret-store'
import { DemoImageProvider, MiniMaxImageProvider } from '../providers/image-provider'
import { MiniMaxSpeechProvider } from '../providers/speech-provider'
import { DemoStoryProvider, MiniMaxStoryProvider, OpenAiCompatibleStoryProvider } from '../providers/story-provider'
import type { ImageProvider, ProviderRunContext, StoryProvider } from '../providers/contracts'
import { createDemoAudioWav } from './demo-media'
import { HtmlExporter } from './html-exporter'
import {
  createChapterNarrationFingerprint,
  createNarrationAudioFingerprint,
  NARRATION_AUDIO_RULES_VERSION,
} from './narration-cache'
import { assertMergeablePcmWav, mergePcmWavSegments } from './audio-merge'

type JobListener = (job: GenerationJob) => void
type StepPatch = Partial<Omit<JobStep, 'id' | 'label'>>

interface ProgressReporter {
  context(signal: AbortSignal): ProviderRunContext
  flush(): Promise<void>
  drain(): Promise<void>
}

interface ActiveRun {
  controller: AbortController
  completion: Promise<void>
  cancellation?: Promise<void>
}

const storyStepTemplate: Array<[PipelineStepId, string]> = [
  ['voice_prepare', '准备朗读音色'],
  ['story_generate', '生成故事与分章'],
  ['music_generate', '创作故事背景音乐'],
  ['image_generate', '生成章节插图'],
  ['tts_synthesize', '合成章节朗读'],
  ['html_export', '组装分享文件'],
]

const weights: Record<PipelineStepId, number> = {
  voice_prepare: 0.10,
  story_generate: 0.20,
  music_generate: 0,
  image_generate: 0.35,
  tts_synthesize: 0.30,
  html_export: 0.05,
}

const now = () => new Date().toISOString()
const SYSTEM_VOICE_PREVIEW_TEXT = {
  'zh-CN': '晚安，今晚让我为你讲一个温柔的小故事。',
  'zh-HK': '晚安，今晚等我为你讲一个温柔嘅小故事。',
} as const
const SYSTEM_VOICE_PREVIEW_SPEED = 0.85
const SCENE_TRANSITION_RULES_VERSION = 'bedtime-scene-transitions-v1'

function createMiniMaxVoiceId(): string {
  return `bedtime${randomUUID().replaceAll('-', '')}`
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
}

export class PipelineRunner {
  private readonly active = new Map<string, ActiveRun>()
  private readonly projectStarts = new Map<string, Promise<GenerationJob>>()
  private readonly voiceStarts = new Map<string, Promise<GenerationJob>>()
  private readonly systemVoicePreviewStarts = new Map<string, Promise<SystemVoicePreviewResult>>()

  constructor(
    private readonly store: AppStore,
    private readonly secrets: SecretStore,
    private readonly exporter: HtmlExporter,
    private readonly listener: JobListener,
    private readonly builtInMusicRoot = resolve(process.cwd(), 'resources/background-music'),
  ) {}

  startProject(projectId: string): Promise<GenerationJob> {
    const pending = this.projectStarts.get(projectId)
    if (pending) return pending
    const operation = this.createProjectJob(projectId).finally(() => {
      if (this.projectStarts.get(projectId) === operation) this.projectStarts.delete(projectId)
    })
    this.projectStarts.set(projectId, operation)
    return operation
  }

  private async createProjectJob(projectId: string): Promise<GenerationJob> {
    const project = this.store.getProject(projectId)
    const narrator = this.store.getNarratorVoice(project.voiceProfileId)
    if (narrator.provider === 'local-qwen3') {
      throw new Error('本机克隆已停止支持。历史成品仍可播放和导出；如需重新制作，请新建故事并选择内置中文或在线复刻音色。')
    }
    const active = this.store.listJobs().find((job) => (
      job.projectId === projectId && (job.status === 'queued' || job.status === 'running')
    ))
    if (active) return active
    const job = this.makeJob('story', { projectId })
    await this.store.createJob(job)
    const controller = new AbortController()
    this.trackRun(job.id, controller, this.runProject(job.id, project, controller))
    return job
  }

  prepareVoice(voiceId: string): Promise<GenerationJob> {
    const pending = this.voiceStarts.get(voiceId)
    if (pending) return pending
    const operation = this.createVoiceJob(voiceId).finally(() => {
      if (this.voiceStarts.get(voiceId) === operation) this.voiceStarts.delete(voiceId)
    })
    this.voiceStarts.set(voiceId, operation)
    return operation
  }

  private async createVoiceJob(voiceId: string): Promise<GenerationJob> {
    const voice = this.store.getVoice(voiceId)
    if (voice.provider === 'local-qwen3') {
      throw new Error('本机克隆已停止支持。请使用内置中文或在线复刻音色。')
    }
    const active = this.store.listJobs().find((job) => (
      job.voiceProfileId === voiceId && (job.status === 'queued' || job.status === 'running')
    ))
    if (active) return active
    const job = this.makeJob('voice', { voiceProfileId: voiceId })
    await this.store.createJob(job)
    const controller = new AbortController()
    this.trackRun(job.id, controller, this.runVoiceJob(job.id, voiceId, controller))
    return job
  }

  async cancel(jobId: string): Promise<void> {
    const active = this.active.get(jobId)
    if (active) {
      active.cancellation ||= this.cancelActiveRun(jobId, active)
      await active.cancellation
      return
    }

    let changed = false
    const job = await this.store.updateJob(jobId, (item) => {
      if (item.status === 'succeeded' || item.status === 'failed' || item.status === 'cancelled') return
      changed = true
      item.status = 'cancelled'
      item.error = '任务已取消。'
      item.steps.forEach((step) => {
        if (step.status === 'running' || step.status === 'pending') {
          step.status = 'cancelled'
          step.message = '任务已取消。'
        }
      })
    })
    if (changed) this.listener(job)
  }

  private trackRun(jobId: string, controller: AbortController, operation: Promise<void>): void {
    const active: ActiveRun = { controller, completion: Promise.resolve() }
    active.completion = operation.finally(() => {
      if (this.active.get(jobId) === active) this.active.delete(jobId)
    })
    this.active.set(jobId, active)
    void active.completion.catch(() => undefined)
  }

  private async cancelActiveRun(jobId: string, active: ActiveRun): Promise<void> {
    active.controller.abort()
    try {
      let changed = false
      const job = await this.store.updateJob(jobId, (item) => {
        if (item.status !== 'queued' && item.status !== 'running') return
        changed = true
        const step = item.steps.find((candidate) => candidate.status === 'running')
          || item.steps.find((candidate) => candidate.status === 'pending')
        if (step) step.message = '正在停止，请稍候…'
      })
      if (changed) this.listener(job)
    } finally {
      await active.completion
    }
  }

  async removeVoice(voiceId: string): Promise<void> {
    await this.store.removeVoiceWithCleanup(voiceId, async (voice) => {
      if (voice.provider !== 'minimax-online' || !voice.remoteVoiceId) return
      const speech = this.miniMaxSpeechBinding(voice.preparedModel)
      const controller = new AbortController()
      await speech.provider.deleteVoice(voice.remoteVoiceId, {
        signal: controller.signal,
        report: () => undefined,
      }, { allowMissing: this.matchesMiniMaxBinding(voice, speech) })
    })
  }

  async previewSystemVoice(voiceId: string): Promise<SystemVoicePreviewResult> {
    const voice = findMiniMaxSystemVoice(voiceId)
    if (!voice) throw new Error('找不到指定的 MiniMax 内置中文音色。')
    const settings = this.store.getSettings()
    const text = SYSTEM_VOICE_PREVIEW_TEXT[voice.locale]
    const cacheKey = createHash('sha256')
      .update(JSON.stringify([voice.id, voice.remoteVoiceId, settings.miniMaxSpeechModel, text, SYSTEM_VOICE_PREVIEW_SPEED]))
      .digest('hex')
    const asset = `previews/system-voices/${cacheKey}.mp3`
    if (await this.store.assetExists(asset)) return { asset, cached: true }

    const pending = this.systemVoicePreviewStarts.get(cacheKey)
    if (pending) return pending
    const operation = this.generateSystemVoicePreview(voice, text, settings.miniMaxSpeechModel, asset)
      .finally(() => {
        if (this.systemVoicePreviewStarts.get(cacheKey) === operation) {
          this.systemVoicePreviewStarts.delete(cacheKey)
        }
      })
    this.systemVoicePreviewStarts.set(cacheKey, operation)
    return operation
  }

  private async generateSystemVoicePreview(
    voice: NonNullable<ReturnType<typeof findMiniMaxSystemVoice>>,
    text: string,
    model: string,
    asset: string,
  ): Promise<SystemVoicePreviewResult> {
    const speech = this.miniMaxSpeechBinding(model)
    const audio = await speech.provider.synthesize({
      voiceId: voice.remoteVoiceId,
      text,
      model,
      format: 'mp3',
      speed: SYSTEM_VOICE_PREVIEW_SPEED,
      languageBoost: voice.languageBoost,
    }, {
      signal: new AbortController().signal,
      report: () => undefined,
    })
    await this.store.writeAsset(asset, audio.bytes)
    return { asset, cached: false }
  }

  private async runVoiceJob(jobId: string, voiceId: string, controller: AbortController): Promise<void> {
    try {
      await this.markJobRunning(jobId)
      await this.store.withVoiceLifecycleLease(voiceId, 'exclusive', async () => (
        this.prepareVoiceWithFailureState(jobId, voiceId, controller.signal, true)
      ))
      await this.completeJob(jobId, controller.signal)
    } catch (error) {
      await this.failJob(jobId, error)
    }
  }

  private async runProject(jobId: string, initialProject: StoryProject, controller: AbortController): Promise<void> {
    let currentStep: PipelineStepId = 'voice_prepare'
    try {
      await this.markJobRunning(jobId)
      await this.store.updateProject(initialProject.id, (project) => {
        project.status = 'generating'
        delete project.error
      })

      const narrator = this.store.getNarratorVoice(initialProject.voiceProfileId)
      if (initialProject.storyProvider === 'demo') {
        await this.setStep(jobId, 'voice_prepare', { status: 'skipped', progress: 100, message: '演示模式不提取真实音色。' })
      } else if (narrator.provider === 'minimax-system') {
        await this.prepareMiniMaxSystemVoice(jobId, narrator, controller.signal)
      } else if (narrator.provider === 'minimax-online') {
        await this.store.withVoiceLifecycleLease(initialProject.voiceProfileId, 'exclusive', async () => (
          this.prepareVoiceWithFailureState(jobId, initialProject.voiceProfileId, controller.signal)
        ))
      } else {
        throw new Error('本机克隆已停止支持。请新建故事并选择内置中文或在线复刻音色。')
      }

      currentStep = 'story_generate'
      let project = this.store.getProject(initialProject.id)
      if (!project.chapters.length) {
        await this.setStep(jobId, currentStep, { status: 'running', progress: 5, startedAt: now(), message: '正在准备故事设定…' })
        const reporter = this.makeReporter(jobId, currentStep)
        const story = await this.runReported(reporter, () => (
          this.storyProvider(project).generate(project, reporter.context(controller.signal))
        ))
        project = await this.store.updateProject(project.id, (target) => {
          target.summary = story.summary
          target.styleBible = story.styleBible
          target.chapters = story.chapters.map((chapter, index) => {
            const chapterId = randomUUID()
            return {
              id: chapterId,
              index: index + 1,
              ...chapter,
              scenes: hydrateStoryScenes(
                chapterId,
                chapter.text,
                chapter.scenes,
              ),
            }
          })
        })
        await this.setStep(jobId, currentStep, { status: 'succeeded', progress: 100, completedAt: now(), message: `${project.chapters.length} 章故事已完成。` })
      } else {
        await this.setStep(jobId, currentStep, { status: 'skipped', progress: 100, message: '已恢复上次生成的故事章节。' })
      }

      currentStep = 'music_generate'
      if (BACKGROUND_MUSIC_FEATURE_ENABLED) {
        await this.generateBackgroundMusic(jobId, project.id, controller.signal)
      }

      currentStep = 'image_generate'
      await this.generateImages(jobId, project.id, controller.signal)

      currentStep = 'tts_synthesize'
      if (narrator.provider === 'minimax-system') {
        await this.generateAudio(jobId, project.id, controller.signal)
      } else {
        await this.store.withVoiceLifecycleLease(initialProject.voiceProfileId, 'shared', async () => (
          this.generateAudio(jobId, project.id, controller.signal)
        ))
      }

      currentStep = 'html_export'
      await this.setStep(jobId, currentStep, { status: 'running', progress: 25, startedAt: now(), message: '正在内联图像、音频和阅读器…' })
      project = this.store.getProject(project.id)
      const outputAsset = await this.exporter.build(project)
      await this.store.updateProject(project.id, (target) => {
        target.outputAsset = outputAsset
        target.status = 'ready'
        delete target.error
      })
      await this.setStep(jobId, currentStep, { status: 'succeeded', progress: 100, completedAt: now(), message: '独立 HTML 故事已生成。' })
      await this.completeJob(jobId, controller.signal)
    } catch (error) {
      await this.failJob(
        jobId,
        error,
        initialProject.id,
        currentStep,
      )
    }
  }

  private async prepareVoiceWithFailureState(
    jobId: string,
    voiceId: string,
    signal: AbortSignal,
    force = false,
  ): Promise<VoiceProfile> {
    try {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      return await this.prepareVoiceAsset(jobId, voiceId, signal, force)
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? '任务已取消。'
        : error instanceof Error ? error.message : String(error)
      // This runs while the caller still owns the exclusive lifecycle lease. A
      // later preparation can therefore never be overwritten by this failure.
      await this.store.updateVoice(voiceId, (voice) => {
        if (voice.status !== 'preparing') return
        voice.status = 'failed'
        voice.error = message.slice(0, 2_000)
      }).catch(() => undefined)
      throw error
    }
  }

  private async prepareVoiceAsset(jobId: string, voiceId: string, signal: AbortSignal, force = false): Promise<VoiceProfile> {
    const voice = this.store.getVoice(voiceId)
    if (voice.provider !== 'minimax-online') {
      throw new Error('本机克隆已停止支持。请使用内置中文或在线复刻音色。')
    }
    if (!force && voice.status === 'ready' && voice.remoteVoiceId && voice.preparedModel) {
      if (isUnactivatedMiniMaxVoiceExpired(voice)) {
        const message = 'MiniMax 临时音色已超过 168 小时且尚未完成首次朗读，请回到音色库重新在线复刻。'
        await this.store.updateVoice(voice.id, (target) => {
          target.status = 'failed'
          target.error = message
        })
        throw new Error(message)
      }
      await this.setStep(jobId, 'voice_prepare', { status: 'skipped', progress: 100, message: 'MiniMax 在线音色已经准备好。' })
      return voice
    }
    return this.prepareMiniMaxVoice(jobId, voice, signal)
  }

  private async prepareMiniMaxVoice(jobId: string, voice: VoiceProfile, signal: AbortSignal): Promise<VoiceProfile> {
    const settings = this.store.getSettings()
    const modelId = settings.miniMaxSpeechModel
    const speech = this.miniMaxSpeechBinding(modelId)
    const provider = speech.provider
    await this.store.updateVoice(voice.id, (target) => {
      target.status = 'preparing'
      delete target.error
    })
    await this.setStep(jobId, 'voice_prepare', { status: 'running', progress: 3, startedAt: now(), message: '正在连接 MiniMax 在线音色服务…' })

    if (voice.remoteVoiceId) {
      await this.setStep(jobId, 'voice_prepare', { progress: 5, message: '正在移除旧的 MiniMax 在线音色…' })
      await provider.deleteVoice(voice.remoteVoiceId, {
        signal,
        report: () => undefined,
      }, { allowMissing: this.matchesMiniMaxBinding(voice, speech) })
      await this.store.updateVoice(voice.id, (target) => {
        delete target.remoteVoiceId
        delete target.remoteCreatedAt
        delete target.remoteActivatedAt
        delete target.remoteProviderBaseUrl
        delete target.remoteCredentialFingerprint
        delete target.preparedModel
      })
    }

    const reporter = this.makeReporter(jobId, 'voice_prepare', (progress) => 15 + (progress * 0.85))
    const remoteVoiceId = createMiniMaxVoiceId()
    await this.store.updateVoice(voice.id, (target) => {
      target.remoteVoiceId = remoteVoiceId
      target.remoteCreatedAt = now()
      delete target.remoteActivatedAt
      target.remoteProviderBaseUrl = speech.baseUrl
      target.remoteCredentialFingerprint = speech.credentialFingerprint
      delete target.preparedModel
    })
    const prepared = await this.runReported(reporter, async () => provider.prepareVoice({
      sampleBytes: await readFile(this.store.resolveAsset(voice.sampleAsset)),
      fileName: 'reference.wav',
      mimeType: 'audio/wav',
      voiceId: remoteVoiceId,
    }, reporter.context(signal)))
    voice = await this.store.updateVoice(voice.id, (target) => {
      target.remoteVoiceId = prepared.voiceId
      target.remoteCreatedAt = now()
      target.preparedModel = modelId
      delete target.preparedAsset
      target.status = 'ready'
      delete target.error
    })
    await this.setStep(jobId, 'voice_prepare', { status: 'succeeded', progress: 100, completedAt: now(), message: 'MiniMax 在线音色复刻完成，可用于故事朗读。' })
    return voice
  }

  private async prepareMiniMaxSystemVoice(
    jobId: string,
    voice: Extract<NarratorVoice, { provider: 'minimax-system' }>,
    signal: AbortSignal,
  ): Promise<void> {
    await this.setStep(jobId, 'voice_prepare', {
      status: 'running', progress: 5, startedAt: now(), message: '正在确认 MiniMax 内置中文音色…',
    })
    const speech = this.miniMaxSpeechBinding(this.store.getSettings().miniMaxSpeechModel)
    const reporter = this.makeReporter(jobId, 'voice_prepare')
    await this.runReported(reporter, () => speech.provider.assertSystemVoiceAvailable(
      voice.remoteVoiceId,
      reporter.context(signal),
    ))
    await this.setStep(jobId, 'voice_prepare', {
      status: 'succeeded', progress: 100, completedAt: now(), message: `${voice.name}可直接使用，无需录音或复刻。`,
    })
  }

  private async generateBackgroundMusic(jobId: string, projectId: string, signal: AbortSignal): Promise<void> {
    let project = this.store.getProject(projectId)
    if (!project.backgroundMusicEnabled) {
      await this.setStep(jobId, 'music_generate', {
        status: 'skipped', progress: 100, completedAt: now(), message: '本次未选择背景音乐。',
      })
      return
    }
    if (await this.store.assetExists(project.backgroundMusicAsset)) {
      await this.setStep(jobId, 'music_generate', {
        status: 'skipped', progress: 100, completedAt: now(), message: '已恢复上次生成的背景音乐。',
      })
      return
    }

    throwIfAborted(signal)
    const track = backgroundMusicTrack(project.backgroundMusicTrackId)
    if (!track) {
      await this.store.updateProject(projectId, (target) => {
        target.backgroundMusicEnabled = false
        delete target.backgroundMusicTrackId
        delete target.backgroundMusicPrompt
        delete target.backgroundMusicModel
      })
      await this.setStep(jobId, 'music_generate', {
        status: 'skipped', progress: 100, completedAt: now(), message: '历史项目没有内置曲目选择，本次继续制作纯人声故事。',
      })
      return
    }
    await this.setStep(jobId, 'music_generate', {
      status: 'running', progress: 20, startedAt: now(), message: `正在添加《${track.label}》…`,
    })
    const music = await readFile(resolve(this.builtInMusicRoot, track.resourceFile))
    throwIfAborted(signal)
    const asset = `projects/${projectId}/music/${track.id}.mp3`
    await this.store.writeAsset(asset, music)
    await this.store.updateProject(projectId, (target) => {
      target.backgroundMusicAsset = asset
      target.backgroundMusicPrompt = track.label
      target.backgroundMusicModel = 'builtin-library-v1'
    })
    await this.setStep(jobId, 'music_generate', {
      status: 'succeeded', progress: 100, completedAt: now(), message: `已添加背景音乐《${track.label}》。`,
    })
  }

  private async generateImages(jobId: string, projectId: string, signal: AbortSignal): Promise<void> {
    let project = this.store.getProject(projectId)
    if (!project.styleBible) throw new Error('故事缺少统一画风设定。')
    const styleBible = project.styleBible
    const provider = this.imageProvider(project)
    const total = project.chapters.length
    const startedAt = Date.now()
    await this.setStep(jobId, 'image_generate', { status: 'running', progress: 0, current: 0, total, startedAt: now(), message: `准备生成 ${total} 张插图…` })
    for (let index = 0; index < total; index += 1) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      project = this.store.getProject(projectId)
      const chapter = project.chapters[index]
      if (await this.store.assetExists(chapter.imageAsset)) {
        await this.setUnitProgress(jobId, 'image_generate', index + 1, total, startedAt, '已恢复现有插图')
        continue
      }
      const reporter = this.makeReporter(jobId, 'image_generate', (progress) => ((index + progress / 100) / total) * 100)
      const image = await this.runReported(reporter, () => provider.generate({
          title: chapter.title,
          prompt: chapter.imagePrompt,
          alt: chapter.imageAlt,
          styleBible,
          chapterIndex: chapter.index,
        }, reporter.context(signal)))
      const asset = `projects/${projectId}/images/chapter-${String(chapter.index).padStart(2, '0')}.${image.extension}`
      await this.store.writeAsset(asset, image.bytes)
      await this.store.updateProject(projectId, (target) => {
        target.chapters[index].imageAsset = asset
      })
      await this.setUnitProgress(jobId, 'image_generate', index + 1, total, startedAt, `已完成第 ${index + 1}/${total} 张插图`)
    }
    await this.setStep(jobId, 'image_generate', { status: 'succeeded', progress: 100, current: total, total, etaSeconds: 0, completedAt: now(), message: '所有章节插图已完成。' })
  }

  private async generateAudio(jobId: string, projectId: string, signal: AbortSignal): Promise<void> {
    let project = this.store.getProject(projectId)
    const startedAt = Date.now()
    const demo = project.storyProvider === 'demo'
    const voice = this.store.getNarratorVoice(project.voiceProfileId)
    let clonedVoice = voice.provider === 'minimax-online' ? voice : undefined
    const systemVoice = voice.provider === 'minimax-system' ? voice : undefined
    const onlineVoiceReady = clonedVoice?.remoteVoiceId && clonedVoice.preparedModel
    if (!demo && voice.provider === 'local-qwen3') {
      throw new Error('本机克隆已停止支持。请新建故事并选择内置中文或在线复刻音色。')
    }
    if (!demo && voice.provider === 'minimax-online'
      && (voice.status !== 'ready' || !onlineVoiceReady)) {
      throw new Error('指定音色尚未准备完成。')
    }
    const onlineSpeech = !demo && (voice.provider === 'minimax-online' || voice.provider === 'minimax-system')
      ? this.miniMaxSpeechBinding(voice.provider === 'minimax-system'
          ? this.store.getSettings().miniMaxSpeechModel
          : voice.preparedModel)
      : undefined
    const onlineProvider = onlineSpeech?.provider
    const onlineVoiceId = systemVoice?.remoteVoiceId || clonedVoice?.remoteVoiceId
    const onlineModel = systemVoice ? this.store.getSettings().miniMaxSpeechModel : clonedVoice?.preparedModel
    const narrationProvider = demo ? 'demo' : voice.provider
    const narrationVoice = onlineVoiceId || voice.id
    const narrationModel = demo ? 'demo-audio-v1' : onlineModel || 'unknown'
    const narrationRulesVersion = NARRATION_AUDIO_RULES_VERSION

    project = await this.store.updateProject(projectId, (target) => {
      target.chapters = target.chapters.map((chapter) => ({
        ...chapter,
        scenes: hydrateStoryScenes(chapter.id, chapter.text, chapter.scenes),
      }))
    })
    const totalScenes = project.chapters.reduce((sum, chapter) => sum + (chapter.scenes?.length || 0), 0)
    if (!totalScenes) throw new Error('故事章节中没有可朗读的场景。')
    await this.setStep(jobId, 'tts_synthesize', {
      status: 'running', progress: 0, current: 0, total: totalScenes, startedAt: now(),
      message: `准备合成 ${totalScenes} 个情绪场景…`,
    })

    let completedScenes = 0
    for (let index = 0; index < project.chapters.length; index += 1) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      project = this.store.getProject(projectId)
      const chapter = project.chapters[index]
      const scenes = chapter.scenes || []
      const sceneAudio: Buffer[] = []
      const sceneFingerprints: string[] = []

      for (let sceneOffset = 0; sceneOffset < scenes.length; sceneOffset += 1) {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
        const scene = scenes[sceneOffset]
        const preparedText = scene.text
        const sceneFingerprint = createNarrationAudioFingerprint({
          rulesVersion: narrationRulesVersion,
          sceneId: scene.id,
          sceneIndex: scene.index,
          sourceText: scene.text,
          preparedText,
          voice: narrationVoice,
          provider: narrationProvider,
          model: narrationModel,
          speed: scene.speed,
          emotion: scene.emotion,
          pitch: scene.pitch,
        })
        const sceneAsset = `projects/${projectId}/audio/scenes/chapter-${String(chapter.index).padStart(2, '0')}-scene-${String(scene.index).padStart(2, '0')}.wav`
        let bytes: Buffer | undefined
        let reused = false

        if (scene.audioFingerprint === sceneFingerprint
          && scene.audioAsset === sceneAsset
          && await this.store.assetExists(scene.audioAsset)) {
          const cachedBytes = await readFile(this.store.resolveAsset(scene.audioAsset!))
          try {
            assertMergeablePcmWav(cachedBytes)
            reused = true
            bytes = cachedBytes
          } catch {
            await unlink(this.store.resolveAsset(scene.audioAsset!)).catch(() => undefined)
            await this.store.updateProject(projectId, (target) => {
              const targetScene = target.chapters[index].scenes?.[sceneOffset]
              if (!targetScene) return
              delete targetScene.audioAsset
              delete targetScene.audioFingerprint
            })
          }
        }

        if (!bytes) {
          if (demo) {
            bytes = createDemoAudioWav(scene.text)
            await this.store.writeAsset(sceneAsset, bytes)
          } else if (onlineProvider) {
            const reporter = this.makeReporter(
              jobId,
              'tts_synthesize',
              (progress) => ((completedScenes + progress / 100) / totalScenes) * 100,
            )
            const audio = await this.runReported(reporter, () => onlineProvider.synthesize({
              voiceId: onlineVoiceId!,
              text: preparedText,
              model: onlineModel!,
              format: 'wav',
              sampleRate: 44_100,
              channel: 1,
              speed: scene.speed,
              pitch: scene.pitch,
              emotion: scene.emotion,
              languageBoost: systemVoice?.languageBoost,
            }, reporter.context(signal)))
            bytes = audio.bytes
            await this.store.writeAsset(sceneAsset, bytes)
            if (clonedVoice
              && (!clonedVoice.remoteActivatedAt || !this.matchesMiniMaxBinding(clonedVoice, onlineSpeech!))) {
              clonedVoice = await this.store.updateVoice(clonedVoice.id, (target) => {
                target.remoteActivatedAt ||= now()
                target.remoteProviderBaseUrl = onlineSpeech!.baseUrl
                target.remoteCredentialFingerprint = onlineSpeech!.credentialFingerprint
              })
            }
          } else {
            throw new Error('当前朗读音色已停止支持，请选择内置中文或在线复刻音色。')
          }
        }

        await this.store.updateProject(projectId, (target) => {
          const targetScene = target.chapters[index].scenes?.[sceneOffset]
          if (!targetScene) throw new Error('朗读场景在生成过程中发生了变化。')
          targetScene.audioAsset = sceneAsset
          targetScene.audioFingerprint = sceneFingerprint
        })
        sceneAudio.push(bytes)
        sceneFingerprints.push(sceneFingerprint)
        completedScenes += 1
        await this.setUnitProgress(
          jobId,
          'tts_synthesize',
          completedScenes,
          totalScenes,
          startedAt,
          `已完成第 ${chapter.index} 章第 ${scene.index}/${scenes.length} 个情绪场景`,
        )
      }

      const chapterFingerprint = createChapterNarrationFingerprint(
        sceneFingerprints,
        `${SCENE_TRANSITION_RULES_VERSION}:${narrationRulesVersion}`,
      )
      const chapterAsset = `projects/${projectId}/audio/chapter-${String(chapter.index).padStart(2, '0')}.wav`
      if (chapter.audioFingerprint !== chapterFingerprint
        || chapter.audioAsset !== chapterAsset
        || !await this.store.assetExists(chapter.audioAsset)) {
        const gaps = scenes.slice(1).map((scene, sceneOffset) => (
          transitionPauseMs(scenes[sceneOffset].sceneType, scene.sceneType)
        ))
        await this.store.writeAsset(chapterAsset, mergePcmWavSegments(sceneAudio, gaps))
      }
      await this.store.updateProject(projectId, (target) => {
        target.chapters[index].audioAsset = chapterAsset
        target.chapters[index].audioFingerprint = chapterFingerprint
      })
    }
    await this.setStep(jobId, 'tts_synthesize', {
      status: 'succeeded', progress: 100, current: totalScenes, total: totalScenes,
      etaSeconds: 0, completedAt: now(),
      message: demo ? '演示占位音频已完成；正式成品请使用真实朗读音色。' : '所有情绪场景朗读已完成。',
    })
  }

  private storyProvider(project: StoryProject): StoryProvider {
    const settings = this.store.getSettings()
    const secrets = this.secrets.get()
    if (project.storyProvider === 'demo') return new DemoStoryProvider()
    if (project.storyProvider === 'openai-compatible') {
      if (!secrets.openAiApiKey) throw new Error('请先在设置中保存兼容模型 API Key。')
      return new OpenAiCompatibleStoryProvider({
        baseUrl: settings.openAiBaseUrl,
        model: project.storyModel || settings.openAiModel,
        apiKey: secrets.openAiApiKey,
      })
    }
    if (!secrets.miniMaxApiKey) throw new Error('请先在设置中保存 MiniMax API Key。')
    return new MiniMaxStoryProvider({
      baseUrl: settings.miniMaxBaseUrl,
      path: settings.miniMaxTextPath,
      model: project.storyModel || settings.miniMaxTextModel,
      apiKey: secrets.miniMaxApiKey,
    })
  }

  private imageProvider(project: StoryProject): ImageProvider {
    if (project.storyProvider === 'demo') return new DemoImageProvider()
    const settings = this.store.getSettings()
    const apiKey = this.secrets.get().miniMaxApiKey
    if (!apiKey) throw new Error('章节插图需要 MiniMax API Key，请先在设置中配置。')
    return new MiniMaxImageProvider({
      baseUrl: settings.miniMaxBaseUrl,
      path: settings.miniMaxImagePath,
      model: project.imageModel,
      apiKey,
    })
  }

  private miniMaxSpeechBinding(model?: string): {
    provider: MiniMaxSpeechProvider
    baseUrl: string
    credentialFingerprint: string
  } {
    const settings = this.store.getSettings()
    const apiKey = this.secrets.get().miniMaxApiKey
    if (!apiKey) throw new Error('MiniMax 在线音色需要 API Key，请先在设置中配置按量付费 API Key。')
    const baseUrl = new URL(settings.miniMaxBaseUrl).toString().replace(/\/$/, '')
    return {
      provider: new MiniMaxSpeechProvider({
        baseUrl,
        model: model || settings.miniMaxSpeechModel,
        apiKey,
      }),
      baseUrl,
      credentialFingerprint: createHash('sha256').update(apiKey).digest('hex'),
    }
  }

  private matchesMiniMaxBinding(
    voice: VoiceProfile,
    binding: { baseUrl: string; credentialFingerprint: string },
  ): boolean {
    return voice.remoteProviderBaseUrl === binding.baseUrl
      && voice.remoteCredentialFingerprint === binding.credentialFingerprint
  }

  private makeJob(kind: 'voice' | 'story', scope: { projectId?: string; voiceProfileId?: string }): GenerationJob {
    const createdAt = now()
    const template = kind === 'voice'
      ? storyStepTemplate.slice(0, 1)
      : storyStepTemplate.filter(([id]) => BACKGROUND_MUSIC_FEATURE_ENABLED || id !== 'music_generate')
    return {
      id: randomUUID(),
      kind,
      ...scope,
      status: 'queued',
      overallProgress: 0,
      steps: template.map(([id, label]) => ({ id, label, status: 'pending', progress: 0, message: '等待开始' })),
      createdAt,
      updatedAt: createdAt,
    }
  }

  private async markJobRunning(jobId: string): Promise<void> {
    const job = await this.store.updateJob(jobId, (target) => {
      target.status = 'running'
      delete target.error
    })
    this.listener(job)
  }

  private async completeJob(jobId: string, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal)
    const job = await this.store.updateJob(jobId, (target) => {
      throwIfAborted(signal)
      target.status = 'succeeded'
      target.overallProgress = 100
      delete target.error
    })
    this.listener(job)
  }

  private async failJob(
    jobId: string,
    error: unknown,
    projectId?: string,
    currentStep?: PipelineStepId,
  ): Promise<void> {
    const cancelled = error instanceof DOMException && error.name === 'AbortError'
    const message = cancelled ? '任务已取消。' : error instanceof Error ? error.message : String(error)
    const detailedMessage = message.slice(0, 10_000)
    const stepMessage = message.slice(0, 2_000)
    if (projectId) await this.store.updateProject(projectId, (project) => {
      project.status = cancelled ? 'draft' : 'failed'
      project.error = detailedMessage
    })
    const job = await this.store.updateJob(jobId, (target) => {
      target.status = cancelled ? 'cancelled' : 'failed'
      target.error = detailedMessage
      const step = currentStep ? target.steps.find((item) => item.id === currentStep) : target.steps.find((item) => item.status === 'running')
      if (step) {
        step.status = cancelled ? 'cancelled' : 'failed'
        step.message = stepMessage
      }
    })
    this.listener(job)
  }

  private async setUnitProgress(
    jobId: string,
    stepId: PipelineStepId,
    current: number,
    total: number,
    startedAt: number,
    message: string,
  ): Promise<void> {
    const elapsedSeconds = (Date.now() - startedAt) / 1_000
    const etaSeconds = current > 0 ? Math.round((elapsedSeconds / current) * (total - current)) : undefined
    await this.setStep(jobId, stepId, {
      status: 'running', progress: (current / total) * 100, current, total, etaSeconds, message,
    })
  }

  private makeReporter(jobId: string, stepId: PipelineStepId, transform = (value: number) => value): ProgressReporter {
    let queue = Promise.resolve()
    let reportError: unknown
    let hasReportError = false
    let closed = false
    const report = (progress: number, message: string, extra: Pick<StepPatch, 'current' | 'total' | 'etaSeconds'> = {}) => {
      if (closed) return
      queue = queue.then(async () => {
        if (hasReportError) return
        try {
          await this.setStep(jobId, stepId, {
            status: 'running', progress: transform(Math.max(0, Math.min(100, progress))), message, ...extra,
          })
        } catch (error) {
          hasReportError = true
          reportError = error
        }
      })
    }
    return {
      context: (signal: AbortSignal): ProviderRunContext => ({ signal, report: (progress, message) => report(progress, message) }),
      flush: async () => {
        closed = true
        await queue
        if (hasReportError) throw reportError
      },
      drain: async () => {
        closed = true
        await queue
      },
    }
  }

  private async runReported<T>(reporter: ProgressReporter, operation: () => Promise<T>): Promise<T> {
    try {
      const result = await operation()
      await reporter.flush()
      return result
    } catch (error) {
      await reporter.drain()
      throw error
    }
  }

  private async setStep(jobId: string, stepId: PipelineStepId, patch: StepPatch): Promise<void> {
    const job = await this.store.updateJob(jobId, (target) => {
      const step = target.steps.find((item) => item.id === stepId)
      if (!step) throw new Error(`任务缺少步骤：${stepId}`)
      Object.assign(step, patch)
      target.overallProgress = target.kind === 'voice'
        ? step.progress
        : target.steps.reduce((sum, item) => sum + item.progress * weights[item.id], 0)
    })
    this.listener(job)
  }
}
