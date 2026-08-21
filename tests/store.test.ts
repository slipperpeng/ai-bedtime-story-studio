import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppStore } from '../src/main/storage/store'
import { CreateProjectSchema, CreateVoiceSchema } from '../src/shared/schemas'
import { MINIMAX_CHINESE_SYSTEM_VOICES } from '../src/shared/minimax-system-voices'
import { MINIMAX_TEMP_VOICE_WINDOW_MS } from '../src/shared/voice-lifecycle'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('AppStore', () => {
  it('persists voice metadata while keeping the sample inside the data root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const voice = await store.createVoice({
      provider: 'minimax-online',
      name: '妈妈的晚安声',
      language: 'zh',
      referenceText: '今天的月亮很温柔。',
      audioBytes: new Uint8Array([82, 73, 70, 70]),
      mimeType: 'audio/wav',
      durationMs: 10_000,
      consentConfirmed: true,
      speakerIsAdult: true,
      onlineUploadConfirmed: true,
    })

    const reloaded = new AppStore(root)
    await reloaded.initialize()
    expect(reloaded.getVoice(voice.id).name).toBe('妈妈的晚安声')
    expect(reloaded.getVoice(voice.id).provider).toBe('minimax-online')
    expect(reloaded.resolveAsset(voice.sampleAsset).startsWith(root)).toBe(true)
  })

  it('migrates existing settings to the MiniMax story provider default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-provider-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const project = await store.createProject({
      title: '旧画风故事', childName: '小禾', childAge: 6, theme: '月光与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'minimax', storyModel: 'MiniMax-M3', voiceProfileId: MINIMAX_CHINESE_SYSTEM_VOICES[0].id,
    })
    const statePath = join(root, 'state.json')
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    delete state.settings.defaultStoryProvider
    delete state.projects[0].illustrationStyle
    await writeFile(statePath, JSON.stringify(state), 'utf8')

    const migrated = new AppStore(root)
    await migrated.initialize()

    expect(migrated.getSettings().defaultStoryProvider).toBe('minimax')
    expect(migrated.getProject(project.id).illustrationStyle).toBe('moonlight-watercolor')
    const persisted = JSON.parse(await readFile(statePath, 'utf8'))
    expect(persisted.settings.defaultStoryProvider).toBe('minimax')
    expect(persisted.projects[0].illustrationStyle).toBe('moonlight-watercolor')
  })

  it('migrates schema version 1 without losing voices, projects, jobs, or local prompt metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-v1-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const voice = await store.createVoice({
      provider: 'minimax-online',
      name: '旧版音色', language: 'zh', referenceText: '今天的月亮很温柔。',
      audioBytes: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav', durationMs: 10_000,
      consentConfirmed: true, speakerIsAdult: true, onlineUploadConfirmed: true,
    })
    await store.updateVoice(voice.id, (target) => { target.provider = 'local-qwen3' })
    const preparedAsset = `voices/${voice.id}/qwen3-tts-prompt.pt`
    await store.writeAsset(preparedAsset, new Uint8Array([1, 2, 3]))
    await store.updateVoice(voice.id, (target) => {
      target.preparedAsset = preparedAsset
      target.preparedModel = 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'
      target.status = 'ready'
    })
    const project = await store.createProject({
      title: '旧版故事', childName: '小禾', childAge: 6, theme: '月光与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'demo', storyModel: 'local-demo',
      voiceProfileId: voice.id,
    })
    const createdAt = new Date().toISOString()
    const jobId = randomUUID()
    await store.createJob({
      id: jobId, kind: 'story', projectId: project.id, status: 'paused', overallProgress: 20,
      steps: [{ id: 'voice_prepare', label: '准备音色', status: 'succeeded', progress: 100, message: '已完成' }],
      createdAt, updatedAt: createdAt,
    })

    const statePath = join(root, 'state.json')
    const legacy = JSON.parse(await readFile(statePath, 'utf8'))
    legacy.schemaVersion = 1
    delete legacy.settings.miniMaxSpeechModel
    legacy.voices.forEach((item: Record<string, unknown>) => {
      delete item.provider
      delete item.remoteVoiceId
    })
    legacy.projects.forEach((item: Record<string, unknown>) => {
      delete item.chapterCharMin
      delete item.chapterCharMax
      delete item.backgroundMusicEnabled
    })
    await writeFile(statePath, JSON.stringify(legacy), 'utf8')

    const migrated = new AppStore(root)
    await migrated.initialize()

    expect(migrated.getSettings().miniMaxSpeechModel).toBe('speech-2.8-hd')
    expect(migrated.getVoice(voice.id)).toMatchObject({
      provider: 'local-qwen3',
      preparedAsset,
      preparedModel: 'Qwen/Qwen3-TTS-12Hz-0.6B-Base',
      status: 'ready',
    })
    expect(migrated.getProject(project.id).voiceProfileId).toBe(voice.id)
    expect(migrated.getProject(project.id)).toMatchObject({ chapterCharMin: 90, chapterCharMax: 180, backgroundMusicEnabled: false })
    expect(migrated.getJob(jobId).projectId).toBe(project.id)
    const persisted = JSON.parse(await readFile(statePath, 'utf8'))
    expect(persisted.schemaVersion).toBe(4)
    expect(persisted.voices[0].provider).toBe('local-qwen3')
  })

  it('migrates schema version 2 to version 4 without losing existing records', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-v2-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const voice = await store.createVoice({
      provider: 'minimax-online',
      name: '二版音色', language: 'zh', referenceText: '今天的月亮很温柔。',
      audioBytes: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav', durationMs: 10_000,
      consentConfirmed: true, speakerIsAdult: true, onlineUploadConfirmed: true,
    })
    const project = await store.createProject({
      title: '二版故事', childName: '小禾', childAge: 6, theme: '月光与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'demo', storyModel: 'local-demo',
      voiceProfileId: voice.id,
    })
    const createdAt = new Date().toISOString()
    const jobId = randomUUID()
    await store.createJob({
      id: jobId, kind: 'story', projectId: project.id, status: 'paused', overallProgress: 20,
      steps: [{ id: 'voice_prepare', label: '准备音色', status: 'succeeded', progress: 100, message: '已完成' }],
      createdAt, updatedAt: createdAt,
    })

    const statePath = join(root, 'state.json')
    const version2 = JSON.parse(await readFile(statePath, 'utf8'))
    version2.schemaVersion = 2
    version2.projects.forEach((item: Record<string, unknown>) => {
      delete item.chapterCharMin
      delete item.chapterCharMax
      delete item.backgroundMusicEnabled
    })
    await writeFile(statePath, JSON.stringify(version2), 'utf8')

    const migrated = new AppStore(root)
    await migrated.initialize()

    expect(migrated.getVoice(voice.id).name).toBe('二版音色')
    expect(migrated.getProject(project.id).voiceProfileId).toBe(voice.id)
    expect(migrated.getProject(project.id)).toMatchObject({ chapterCharMin: 90, chapterCharMax: 180, backgroundMusicEnabled: false })
    expect(migrated.getJob(jobId).projectId).toBe(project.id)
    expect(JSON.parse(await readFile(statePath, 'utf8')).schemaVersion).toBe(4)
  })

  it('adds the legacy 90–180 character range while migrating schema version 3', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-v3-'))
    roots.push(root)
    const systemVoice = MINIMAX_CHINESE_SYSTEM_VOICES.find((voice) => voice.id === 'minimax-zh-cn-041')!
    const store = new AppStore(root)
    await store.initialize()
    const project = await store.createProject({
      title: '三版故事', childName: '小禾', childAge: 6, theme: '月光与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 180, chapterCharMax: 260,
      storyProvider: 'minimax', storyModel: 'MiniMax-M3', voiceProfileId: systemVoice.id,
    })

    const statePath = join(root, 'state.json')
    const version3 = JSON.parse(await readFile(statePath, 'utf8'))
    version3.schemaVersion = 3
    delete version3.projects[0].chapterCharMin
    delete version3.projects[0].chapterCharMax
    delete version3.projects[0].backgroundMusicEnabled
    await writeFile(statePath, JSON.stringify(version3), 'utf8')

    const migrated = new AppStore(root)
    await migrated.initialize()

    expect(migrated.getProject(project.id)).toMatchObject({ chapterCharMin: 90, chapterCharMax: 180, backgroundMusicEnabled: false })
    expect(JSON.parse(await readFile(statePath, 'utf8')).schemaVersion).toBe(4)
  })

  it('persists and reopens a project that directly selects a MiniMax system voice', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-system-voice-'))
    roots.push(root)
    const systemVoice = MINIMAX_CHINESE_SYSTEM_VOICES.find((voice) => voice.id === 'minimax-zh-cn-041')!
    const store = new AppStore(root)
    await store.initialize()

    const project = await store.createProject({
      title: '内置音色故事', childName: '小禾', childAge: 6, theme: '月光与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'minimax', storyModel: 'MiniMax-M3',
      voiceProfileId: systemVoice.id,
    })

    expect(store.listVoices()).toEqual([])
    expect(store.getNarratorVoice(systemVoice.id)).toEqual(systemVoice)

    const reopened = new AppStore(root)
    await reopened.initialize()

    expect(reopened.getProject(project.id)).toMatchObject({
      voiceProfileId: systemVoice.id,
      chapterCharMin: 120,
      chapterCharMax: 180,
    })
    expect(reopened.getNarratorVoice(systemVoice.id)).toEqual(systemVoice)
    const persisted = JSON.parse(await readFile(join(root, 'state.json'), 'utf8'))
    expect(persisted.schemaVersion).toBe(4)
    expect(persisted.voices).toEqual([])
  })

  it('persists narration fingerprints while accepting chapters created before fingerprints existed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-audio-fingerprint-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const systemVoice = MINIMAX_CHINESE_SYSTEM_VOICES[0]
    const project = await store.createProject({
      title: '朗读缓存故事', childName: '小禾', childAge: 6, theme: '月光与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'minimax', storyModel: 'MiniMax-M3', voiceProfileId: systemVoice.id,
    })
    const fingerprint = 'a'.repeat(64)
    await store.updateProject(project.id, (target) => {
      target.chapters = [
        { id: randomUUID(), index: 1, title: '第一章', text: '晚安。', imagePrompt: '窗边温柔的月亮', imageAlt: '月亮', audioFingerprint: fingerprint },
        { id: randomUUID(), index: 2, title: '第二章', text: '好梦。', imagePrompt: '夜空闪亮的星星', imageAlt: '星星' },
      ]
    })

    const reopened = new AppStore(root)
    await reopened.initialize()

    expect(reopened.getProject(project.id).chapters.map((chapter) => chapter.audioFingerprint)).toEqual([
      fingerprint,
      undefined,
    ])
  })

  it('persists lossless scene boundaries without trimming their newlines', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-scene-boundary-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const project = await store.createProject({
      title: '分镜边界故事', childName: '小禾', childAge: 6, theme: '月光与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'minimax', storyModel: 'MiniMax-M3', voiceProfileId: MINIMAX_CHINESE_SYSTEM_VOICES[0].id,
    })
    const chapterId = randomUUID()
    const text = '月亮照进窗台。\n小禾发现了一封信。'
    await store.updateProject(project.id, (target) => {
      target.chapters = [
        {
          id: chapterId,
          index: 1,
          title: '月光来信',
          text,
          imagePrompt: '月光照进安静的儿童房间',
          imageAlt: '月光与信',
          scenes: [
            { id: randomUUID(), index: 1, text: '月亮照进窗台。\n', sceneType: 'peaceful', emotion: 'calm', speed: 0.66, pitch: -2 },
            { id: randomUUID(), index: 2, text: '小禾发现了一封信。', sceneType: 'adventure', emotion: 'surprised', speed: 0.69, pitch: -1 },
          ],
        },
        {
          id: randomUUID(), index: 2, title: '晚安回信', text: '小禾把信放在枕边，说了一声晚安。',
          imagePrompt: '孩子把月光信放在枕边准备入睡', imageAlt: '枕边的信',
        },
      ]
    })

    const reopened = new AppStore(root)
    await reopened.initialize()
    const chapter = reopened.getProject(project.id).chapters[0]

    expect(chapter.scenes?.map((scene) => scene.text).join('')).toBe(chapter.text)
    expect(chapter.scenes?.[0].text.endsWith('\n')).toBe(true)
  })

  it('rejects an arbitrary system-like narrator id without leaving a project directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-invalid-system-voice-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const input = {
      title: '伪造音色故事', childName: '小禾', childAge: 6, theme: '月光与友谊',
      sourceMode: 'ai' as const, sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'minimax' as const,
      storyModel: 'MiniMax-M3', voiceProfileId: 'minimax-zh-cn-999',
    }

    expect(CreateProjectSchema.safeParse(input).success).toBe(false)
    await expect(store.createProject(input)).rejects.toThrow('找不到指定音色')
    expect(await readdir(join(root, 'projects'))).toEqual([])
  })

  it('requires a valid per-chapter character range for every new project', () => {
    const base = {
      title: '字数范围故事', childName: '小禾', childAge: 6, theme: '月光与友谊',
      sourceMode: 'ai' as const, sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'minimax' as const, storyModel: 'MiniMax-M3', voiceProfileId: 'minimax-zh-cn-041',
    }
    const { chapterCharMin: _omitted, ...missingMinimum } = base

    expect(CreateProjectSchema.safeParse(base).success).toBe(true)
    expect(CreateProjectSchema.safeParse(missingMinimum).success).toBe(false)
    expect(CreateProjectSchema.safeParse({ ...base, chapterCharMin: 220, chapterCharMax: 180 }).success).toBe(false)
    expect(CreateProjectSchema.safeParse({ ...base, chapterCharMin: 59 }).success).toBe(false)
    expect(CreateProjectSchema.safeParse({ ...base, chapterCharMax: 501 }).success).toBe(false)
    expect(CreateProjectSchema.safeParse({ ...base, illustrationStyle: 'paper-cut-collage' }).success).toBe(true)
    expect(CreateProjectSchema.safeParse({ ...base, illustrationStyle: 'unknown-style' }).success).toBe(false)
  })

  it('requires explicit upload consent and stricter samples for MiniMax online voices', () => {
    const base = {
      provider: 'minimax-online' as const,
      name: '在线音色',
      language: 'zh' as const,
      referenceText: '今天的月亮很温柔。',
      audioBytes: voiceWavBytes(10_000),
      mimeType: 'audio/wav' as const,
      durationMs: 10_000,
      consentConfirmed: true as const,
      speakerIsAdult: true as const,
    }
    expect(CreateVoiceSchema.safeParse(base).success).toBe(false)
    expect(CreateVoiceSchema.safeParse({
      ...base,
      audioBytes: voiceWavBytes(9_000),
      durationMs: 9_000,
      onlineUploadConfirmed: true,
    }).success).toBe(false)
    expect(CreateVoiceSchema.safeParse({
      ...base,
      audioBytes: new Uint8Array(20 * 1024 * 1024 + 1),
      onlineUploadConfirmed: true,
    }).success).toBe(false)
    expect(CreateVoiceSchema.safeParse({ ...base, onlineUploadConfirmed: true }).success).toBe(true)
    expect(CreateVoiceSchema.safeParse({
      ...base,
      audioBytes: new Uint8Array(44),
      onlineUploadConfirmed: true,
    }).success).toBe(false)
    expect(CreateVoiceSchema.safeParse({
      ...base,
      audioBytes: voiceWavBytes(10_000, 0),
      onlineUploadConfirmed: true,
    }).success).toBe(false)
    expect(CreateVoiceSchema.safeParse({
      ...base,
      durationMs: 12_000,
      onlineUploadConfirmed: true,
    }).success).toBe(false)
  })

  it('persists a MiniMax online voice with a provider-bound remote identity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-online-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const voice = await store.createVoice({
      provider: 'minimax-online',
      name: '在线讲述者', language: 'zh', referenceText: '今天的月亮很温柔。',
      audioBytes: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav', durationMs: 10_000,
      consentConfirmed: true, speakerIsAdult: true, onlineUploadConfirmed: true,
    })
    await store.updateVoice(voice.id, (target) => {
      target.remoteVoiceId = 'bedtime_voice_20260817'
      target.preparedModel = 'speech-2.8-hd'
      target.status = 'ready'
    })

    const reloaded = new AppStore(root)
    await reloaded.initialize()

    expect(reloaded.getVoice(voice.id)).toMatchObject({
      provider: 'minimax-online',
      remoteVoiceId: 'bedtime_voice_20260817',
      preparedModel: 'speech-2.8-hd',
      status: 'ready',
    })
    expect(reloaded.getVoice(voice.id).preparedAsset).toBeUndefined()
  })

  it('marks an unactivated MiniMax voice as expired when the app restarts after 168 hours', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-expired-online-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const voice = await store.createVoice({
      provider: 'minimax-online',
      name: '待激活在线音色', language: 'zh', referenceText: '今天的月亮很温柔。',
      audioBytes: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav', durationMs: 10_000,
      consentConfirmed: true, speakerIsAdult: true, onlineUploadConfirmed: true,
    })
    await store.updateVoice(voice.id, (target) => {
      target.remoteVoiceId = 'bedtime_voice_expired'
      target.remoteCreatedAt = new Date(Date.now() - MINIMAX_TEMP_VOICE_WINDOW_MS - 1_000).toISOString()
      target.preparedModel = 'speech-2.8-hd'
      target.status = 'ready'
    })

    const reopened = new AppStore(root)
    await reopened.initialize()

    expect(reopened.getVoice(voice.id)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('168 小时'),
    })
  })

  it('rejects absolute and parent-traversal asset paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    expect(() => store.resolveAsset('../provider-secrets.bin')).toThrow('越界')
    expect(() => store.resolveAsset('C:\\Windows\\system.ini')).toThrow('无效')
  })

  it('preserves an invalid state file and recovers with safe defaults', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const statePath = join(root, 'state.json')
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    state.settings.miniMaxBaseUrl = 'http://attacker.invalid/v1'
    await writeFile(statePath, JSON.stringify(state), 'utf8')

    const recovered = new AppStore(root)
    await recovered.initialize()

    expect(recovered.getSettings().miniMaxBaseUrl).toBe('https://api.minimaxi.com/v1')
    const backup = (await readdir(root)).find((name) => name.startsWith('state.invalid-'))
    expect(backup).toBeTruthy()
    expect(await readFile(join(root, backup!), 'utf8')).toContain('attacker.invalid')
  })

  it('migrates the retired MiniMax text defaults without touching other settings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const voice = await store.createVoice({
      provider: 'minimax-online',
      name: '迁移测试音色', language: 'zh', referenceText: '今天的月亮很温柔。',
      audioBytes: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav', durationMs: 10_000,
      consentConfirmed: true, speakerIsAdult: true, onlineUploadConfirmed: true,
    })
    const project = await store.createProject({
      title: '待迁移故事', childName: '小禾', childAge: 6, theme: '勇气与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'minimax', storyModel: 'MiniMax-Text-01',
      voiceProfileId: voice.id,
    })
    const statePath = join(root, 'state.json')
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    state.settings.miniMaxTextPath = '/text/chatcompletion_v2'
    state.settings.miniMaxTextModel = 'MiniMax-Text-01'
    state.settings.miniMaxImageModel = 'image-01-live'
    await writeFile(statePath, JSON.stringify(state), 'utf8')

    const migrated = new AppStore(root)
    await migrated.initialize()

    expect(migrated.getSettings()).toMatchObject({
      miniMaxTextPath: '/chat/completions',
      miniMaxTextModel: 'MiniMax-M3',
      miniMaxImageModel: 'image-01-live',
    })
    const persisted = JSON.parse(await readFile(statePath, 'utf8'))
    expect(persisted.settings.miniMaxTextPath).toBe('/chat/completions')
    expect(persisted.settings.miniMaxTextModel).toBe('MiniMax-M3')
    expect(migrated.getProject(project.id).storyModel).toBe('MiniMax-M3')
  })

  it('does not rewrite an explicitly configured MiniMax-compatible proxy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const statePath = join(root, 'state.json')
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    state.settings.miniMaxBaseUrl = 'https://proxy.example/v1'
    state.settings.miniMaxTextPath = '/text/chatcompletion_v2'
    state.settings.miniMaxTextModel = 'MiniMax-Text-01'
    await writeFile(statePath, JSON.stringify(state), 'utf8')

    const reloaded = new AppStore(root)
    await reloaded.initialize()

    expect(reloaded.getSettings()).toMatchObject({
      miniMaxBaseUrl: 'https://proxy.example/v1',
      miniMaxTextPath: '/text/chatcompletion_v2',
      miniMaxTextModel: 'MiniMax-Text-01',
    })
  })

  it('keeps active voice data tracked and records the demo image model', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const voice = await store.createVoice({
      provider: 'minimax-online',
      name: '讲述者', language: 'zh', referenceText: '今天的月亮很温柔。',
      audioBytes: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav', durationMs: 10_000,
      consentConfirmed: true, speakerIsAdult: true, onlineUploadConfirmed: true,
    })
    const createdAt = new Date().toISOString()
    await store.createJob({
      id: randomUUID(), kind: 'voice', voiceProfileId: voice.id, status: 'queued', overallProgress: 0,
      steps: [{ id: 'voice_prepare', label: '准备音色', status: 'pending', progress: 0, message: '等待开始' }],
      createdAt, updatedAt: createdAt,
    })

    await expect(store.removeVoice(voice.id)).rejects.toThrow('任务正在运行')
    await expect(stat(store.resolveAsset(voice.sampleAsset))).resolves.toBeTruthy()

    const project = await store.createProject({
      title: '星光故事', childName: '小禾', childAge: 6, theme: '勇气与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'demo', storyModel: 'local-demo',
      voiceProfileId: voice.id,
    })
    expect(project.imageModel).toBe('local-demo')
  })

  it('blocks new project references while external voice cleanup is in progress', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-voice-cleanup-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const voice = await store.createVoice({
      provider: 'minimax-online',
      name: '删除锁测试音色', language: 'zh', referenceText: '今天的月亮很温柔。',
      audioBytes: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav', durationMs: 10_000,
      consentConfirmed: true, speakerIsAdult: true, onlineUploadConfirmed: true,
    })
    let releaseCleanup!: () => void
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve })
    let signalCleanupStarted!: () => void
    const cleanupStarted = new Promise<void>((resolve) => { signalCleanupStarted = resolve })
    const removing = store.removeVoiceWithCleanup(voice.id, async () => {
      signalCleanupStarted()
      await cleanupGate
    })
    await cleanupStarted

    await expect(store.createProject({
      title: '竞态故事', childName: '小禾', childAge: 6, theme: '勇气与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'demo', storyModel: 'local-demo',
      voiceProfileId: voice.id,
    })).rejects.toThrow('正在删除')
    expect(store.getVoice(voice.id).id).toBe(voice.id)

    releaseCleanup()
    await removing
    expect(() => store.getVoice(voice.id)).toThrow('找不到指定音色')
  })

  it('allows concurrent voice readers but makes destructive lifecycle work wait', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-voice-lease-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const voice = await store.createVoice({
      provider: 'minimax-online',
      name: '音色租约测试', language: 'zh', referenceText: '今天的月亮很温柔。',
      audioBytes: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav', durationMs: 10_000,
      consentConfirmed: true, speakerIsAdult: true, onlineUploadConfirmed: true,
    })
    let releaseReaders!: () => void
    const readersGate = new Promise<void>((resolve) => { releaseReaders = resolve })
    let readersStarted = 0
    let signalBothReaders!: () => void
    const bothReaders = new Promise<void>((resolve) => { signalBothReaders = resolve })
    const reader = () => store.withVoiceLifecycleLease(voice.id, 'shared', async () => {
      readersStarted += 1
      if (readersStarted === 2) signalBothReaders()
      await readersGate
    })
    const firstReader = reader()
    const secondReader = reader()
    await bothReaders
    let writerStarted = false
    const writer = store.withVoiceLifecycleLease(voice.id, 'exclusive', async () => {
      writerStarted = true
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(writerStarted).toBe(false)
    releaseReaders()
    await Promise.all([firstReader, secondReader, writer])
    expect(writerStarted).toBe(true)
  })

  it('rejects a project whose voice does not exist without leaving a project directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()

    await expect(store.createProject({
      title: '星光故事', childName: '小禾', childAge: 6, theme: '勇气与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'demo', storyModel: 'local-demo',
      voiceProfileId: randomUUID(),
    })).rejects.toThrow('找不到指定音色')
    expect(await readdir(join(root, 'projects'))).toEqual([])
  })

  it('deletes a project and its assets so the referenced voice can be removed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-store-'))
    roots.push(root)
    const store = new AppStore(root)
    await store.initialize()
    const voice = await store.createVoice({
      provider: 'minimax-online',
      name: '可删除讲述者', language: 'zh', referenceText: '今天的月亮很温柔。',
      audioBytes: new Uint8Array([82, 73, 70, 70]), mimeType: 'audio/wav', durationMs: 10_000,
      consentConfirmed: true, speakerIsAdult: true, onlineUploadConfirmed: true,
    })
    const project = await store.createProject({
      title: '临时故事', childName: '小禾', childAge: 6, theme: '勇气与友谊',
      sourceMode: 'ai', sourceText: '', chapterCount: 2, chapterCharMin: 120, chapterCharMax: 180,
      storyProvider: 'demo', storyModel: 'local-demo',
      voiceProfileId: voice.id,
    })
    await store.writeAsset(`projects/${project.id}/audio/test.wav`, new Uint8Array([1, 2, 3]))

    await expect(store.removeVoice(voice.id)).rejects.toThrow('故事使用')
    await store.removeProject(project.id)
    expect(() => store.getProject(project.id)).toThrow('找不到指定故事')
    await expect(stat(store.resolveAsset(`projects/${project.id}`))).rejects.toMatchObject({ code: 'ENOENT' })

    await store.removeVoice(voice.id)
    expect(() => store.getVoice(voice.id)).toThrow('找不到指定音色')
  })
})

function voiceWavBytes(durationMs: number, amplitude = 0.12): Uint8Array {
  const sampleRate = 24_000
  const frameCount = Math.round((durationMs / 1_000) * sampleRate)
  const bytes = new Uint8Array(44 + frameCount * 2)
  const view = new DataView(bytes.buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
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
  view.setUint32(40, frameCount * 2, true)
  for (let index = 0; index < frameCount; index += 1) {
    const sample = amplitude * Math.sin((2 * Math.PI * 220 * index) / sampleRate)
    view.setInt16(44 + index * 2, Math.round(sample * 0x7fff), true)
  }
  return bytes
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}
