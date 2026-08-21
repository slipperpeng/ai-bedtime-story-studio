import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GenerationJob } from '../src/shared/contracts'
import { MINIMAX_CHINESE_SYSTEM_VOICES } from '../src/shared/minimax-system-voices'
import type { SecretStore } from '../src/main/security/secret-store'
import { HtmlExporter } from '../src/main/services/html-exporter'
import { PipelineRunner } from '../src/main/services/pipeline'
import { AppStore } from '../src/main/storage/store'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('production pipeline', () => {
  it('builds a complete demo story with a selected built-in background track', async () => {
    const store = await createStore()
    const musicRoot = await mkdtemp(join(tmpdir(), 'bedtime-music-'))
    roots.push(musicRoot)
    await writeFile(join(musicRoot, 'moonlight-lullaby.mp3'), Buffer.from('ID3built-in-music'))
    const project = await store.createProject({
      title: '小禾的星光信', childName: '小禾', childAge: 6, theme: '勇气与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 3, chapterCharMin: 90, chapterCharMax: 180,
      storyProvider: 'demo', storyModel: 'local-demo',
      voiceProfileId: MINIMAX_CHINESE_SYSTEM_VOICES[0].id,
      backgroundMusicEnabled: true,
      backgroundMusicTrackId: 'moonlight-lullaby',
    })
    const terminal = waitForTerminal()
    const runner = new PipelineRunner(
      store,
      { get: () => ({}) } as unknown as SecretStore,
      new HtmlExporter(store),
      terminal.listener,
      musicRoot,
    )

    const [first, duplicate] = await Promise.all([runner.startProject(project.id), runner.startProject(project.id)])
    expect(duplicate.id).toBe(first.id)
    expect((await terminal.result).status).toBe('succeeded')

    const completed = store.getProject(project.id)
    expect(completed.status).toBe('ready')
    expect(completed.chapters).toHaveLength(3)
    expect(completed.chapters.every((chapter) => chapter.imageAsset && chapter.audioAsset)).toBe(true)
    expect(completed.backgroundMusicEnabled).toBe(true)
    expect(completed.backgroundMusicTrackId).toBe('moonlight-lullaby')
    expect(completed.backgroundMusicAsset).toBe(`projects/${project.id}/music/moonlight-lullaby.mp3`)
    expect(completed.backgroundMusicPrompt).toBe('月光摇篮')
    expect(completed.backgroundMusicModel).toBe('builtin-library-v1')
    expect((await terminal.result).steps.some((step) => step.id === 'music_generate')).toBe(true)
    const html = await readFile(store.resolveAsset(completed.outputAsset!), 'utf8')
    expect(html.match(/data:image\/svg\+xml;base64/g)).toHaveLength(3)
    expect(html.match(/data:audio\/wav;base64/g)).toHaveLength(3)
    expect(html).toContain('data:audio/mpeg;base64,')
    expect(html).toContain('<button class="dock-button music-button" data-background-toggle')
  })

  it('rejects legacy local voices before starting a new production job', async () => {
    const store = await createStore()
    const voice = await store.createVoice({
      provider: 'minimax-online', name: '历史音色', language: 'zh', referenceText: '今晚月色很温柔。',
      audioBytes: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav', durationMs: 10_000,
      consentConfirmed: true, speakerIsAdult: true, onlineUploadConfirmed: true,
    })
    await store.updateVoice(voice.id, (target) => { target.provider = 'local-qwen3' })
    const project = await store.createProject({
      title: '旧故事', childName: '小禾', childAge: 6, theme: '月光森林',
      sourceMode: 'written', sourceText: '这是一段用于验证历史项目兼容行为的完整故事原稿。',
      chapterCount: 2, chapterCharMin: 60, chapterCharMax: 90,
      storyProvider: 'demo', storyModel: 'local-demo', voiceProfileId: voice.id,
    })
    const runner = new PipelineRunner(
      store,
      { get: () => ({}) } as unknown as SecretStore,
      new HtmlExporter(store),
      () => undefined,
    )

    await expect(runner.startProject(project.id)).rejects.toThrow('本机克隆已停止支持')
    expect(store.listJobs()).toHaveLength(0)
  })
})

async function createStore(): Promise<AppStore> {
  const root = await mkdtemp(join(tmpdir(), 'bedtime-pipeline-'))
  roots.push(root)
  const store = new AppStore(root)
  await store.initialize()
  return store
}

function waitForTerminal(): { result: Promise<GenerationJob>; listener(job: GenerationJob): void } {
  let resolve!: (job: GenerationJob) => void
  const result = new Promise<GenerationJob>((done) => { resolve = done })
  return {
    result,
    listener: (job) => {
      if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') resolve(job)
    },
  }
}
