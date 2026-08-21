import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { GenerationJob } from '../src/shared/contracts'
import type { SecretStore } from '../src/main/security/secret-store'
import { HtmlExporter } from '../src/main/services/html-exporter'
import { PipelineRunner } from '../src/main/services/pipeline'
import { AppStore } from '../src/main/storage/store'
import { MINIMAX_CHINESE_SYSTEM_VOICES } from '../src/shared/minimax-system-voices'

const miniMaxApiKey = process.env.MINIMAX_API_KEY?.trim() ?? ''
const runFullLive = process.env.RUN_FULL_LIVE === '1' && miniMaxApiKey.length > 0
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const localDataRoot = resolve(projectRoot, '.local-data')
const referenceTranscript = '月亮慢慢升起来，晚风轻轻吹过窗台，我们一起走进温柔的梦乡。'
const terminalStatuses = new Set<GenerationJob['status']>(['succeeded', 'failed', 'cancelled'])

describe.skipIf(!runFullLive)('live full production flow', () => {
  it('uses a built-in voice and exports a two-chapter MiniMax story', async () => {
    const runId = randomUUID()
    const markerToken = randomUUID()
    const liveRoot = resolve(localDataRoot, `live-e2e-${runId}`)
    const markerPath = resolve(liveRoot, '.live-e2e-owner')
    await mkdir(localDataRoot, { recursive: true })
    await mkdir(liveRoot)

    try {
      await writeFile(markerPath, markerToken, { encoding: 'utf8', flag: 'wx' })

      const store = new AppStore(liveRoot)
      await store.initialize()
      const voice = MINIMAX_CHINESE_SYSTEM_VOICES.find((item) => item.bedtimeRecommendationRank === 1)!
      const project = await store.createProject({
        title: '月光邮差的晚安信',
        childName: '小星',
        childAge: 6,
        theme: '一位月光邮差帮助森林朋友送出晚安信，故事温柔且自然入睡',
        sourceMode: 'ai',
        sourceText: '包含友谊、耐心和安静的月夜，不出现危险或惊吓情节。为缩短集成验证，每章正文 60 至 90 个汉字，绝不超过 100 个汉字。',
        chapterCount: 2,
        chapterCharMin: 60,
        chapterCharMax: 90,
        storyProvider: 'minimax',
        storyModel: store.getSettings().miniMaxTextModel,
        voiceProfileId: voice.id,
      })
      const secrets = { get: () => ({ miniMaxApiKey }) } as unknown as SecretStore
      const runner = new PipelineRunner(
        store,
        secrets,
        new HtmlExporter(store),
        () => undefined,
      )

      const started = await runner.startProject(project.id)
      const completedJob = await waitForTerminalJob(store, started.id, 45 * 60_000)
      if (completedJob.status !== 'succeeded') {
        throw new Error(`Live full flow ended with status "${completedJob.status}": ${safeJobMessage(completedJob)}`)
      }

      const completedProject = store.getProject(project.id)
      expect(completedProject.chapters).toHaveLength(2)
      for (const chapter of completedProject.chapters) {
        expect(chapter.imageAsset).toBeTruthy()
        expect(chapter.audioAsset).toBeTruthy()
        expect(await store.assetExists(chapter.imageAsset)).toBe(true)
        expect(await store.assetExists(chapter.audioAsset)).toBe(true)
        if (!chapter.audioAsset) throw new Error(`Chapter ${chapter.index} did not record an audio asset.`)
        const durationSeconds = wavDurationSeconds(await readFile(store.resolveAsset(chapter.audioAsset)))
        expect(durationSeconds).toBeGreaterThan(1)
        expect(durationSeconds).toBeLessThanOrEqual(90)
      }
      expect(completedProject.outputAsset).toBeTruthy()
      expect(await store.assetExists(completedProject.outputAsset)).toBe(true)
      if (!completedProject.outputAsset) throw new Error('The live project did not record its standalone HTML asset.')

      const html = await readFile(store.resolveAsset(completedProject.outputAsset), 'utf8')
      expect(html.length).toBeGreaterThan(0)
      expect(html).toContain('data:image/')
      expect(html).toContain('data:audio/')
    } finally {
      await removeOwnedLiveRoot(liveRoot, liveRoot, markerToken)
    }
  }, 48 * 60_000)
})

async function waitForTerminalJob(store: AppStore, jobId: string, timeoutMs: number): Promise<GenerationJob> {
  const deadline = Date.now() + timeoutMs
  let job = store.getJob(jobId)
  while (!terminalStatuses.has(job.status)) {
    if (Date.now() >= deadline) {
      throw new Error(`Live full flow timed out with status "${job.status}": ${safeJobMessage(job)}`)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000))
    job = store.getJob(jobId)
  }
  return job
}

function safeJobMessage(job: GenerationJob): string {
  const step = job.steps.find((item) => item.status === 'failed' || item.status === 'cancelled')
    || job.steps.find((item) => item.status === 'running')
  const message = step?.message || job.error || 'No job message was recorded.'
  const redacted = miniMaxApiKey ? message.replaceAll(miniMaxApiKey, '[redacted]') : message
  return redacted.replace(/\s+/g, ' ').slice(0, 1_000)
}

async function removeOwnedLiveRoot(
  ownedRoot: string,
  createdRoot: string,
  markerToken: string,
): Promise<boolean> {
  const resolvedRoot = resolve(ownedRoot)
  if (resolvedRoot !== resolve(createdRoot)) return false
  if (dirname(resolvedRoot) !== localDataRoot) return false
  if (!/^live-e2e-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(basename(resolvedRoot))) {
    return false
  }

  try {
    const rootInfo = await lstat(resolvedRoot)
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return false
    const marker = await readFile(resolve(resolvedRoot, '.live-e2e-owner'), 'utf8')
    if (marker !== markerToken) return false
  } catch {
    return false
  }

  await rm(resolvedRoot, { recursive: true, force: true })
  return true
}

function createTechnicalVoiceSample(): Uint8Array {
  const sampleRate = 24_000
  const durationSeconds = 12
  const sampleCount = sampleRate * durationSeconds
  const dataSize = sampleCount * 2
  const wav = Buffer.alloc(44 + dataSize)
  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8, 'ascii')
  wav.write('fmt ', 12, 'ascii')
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(dataSize, 40)

  let phase = 0
  let noiseState = 0x13579bdf
  let previousNoise = 0
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate
    const fundamental = 158
      + 17 * Math.sin(2 * Math.PI * 0.21 * time)
      + 8 * Math.sin(2 * Math.PI * 0.67 * time)
    phase += (2 * Math.PI * fundamental) / sampleRate

    let voiced = 0
    for (let harmonic = 1; harmonic <= 9; harmonic += 1) {
      const frequency = fundamental * harmonic
      const formantWeight = 0.18
        + gaussian(frequency, 520, 250)
        + 0.7 * gaussian(frequency, 1_250, 390)
        + 0.35 * gaussian(frequency, 2_450, 600)
      voiced += (formantWeight / harmonic ** 1.22) * Math.sin(phase * harmonic + harmonic * harmonic * 0.035)
    }

    const syllableLength = 0.64
    const syllableIndex = Math.floor(time / syllableLength)
    const syllablePosition = (time % syllableLength) / syllableLength
    const attack = Math.min(1, syllablePosition / 0.13)
    const release = Math.min(1, (1 - syllablePosition) / 0.24)
    const envelopePosition = Math.max(0, Math.min(attack, release))
    const syllableEnvelope = envelopePosition * envelopePosition * (3 - 2 * envelopePosition)
    const syllableStress = [0.94, 0.78, 0.88, 0.7, 0.84][syllableIndex % 5]
    const edgeFade = Math.min(1, time / 0.08, (durationSeconds - time) / 0.12)

    noiseState = (Math.imul(noiseState, 1_664_525) + 1_013_904_223) >>> 0
    const whiteNoise = (noiseState / 0xffff_ffff) * 2 - 1
    const breathNoise = whiteNoise - previousNoise * 0.62
    previousNoise = whiteNoise

    const signal = edgeFade * (
      voiced * 0.19 * syllableEnvelope * syllableStress
      + breathNoise * 0.012 * (0.4 + syllableEnvelope)
    )
    const shaped = Math.tanh(signal * 1.35) * 0.72
    const pcm16 = Math.round(Math.max(-0.98, Math.min(0.98, shaped)) * 32_767)
    wav.writeInt16LE(pcm16, 44 + index * 2)
  }
  return wav
}

function gaussian(value: number, center: number, width: number): number {
  const distance = (value - center) / width
  return Math.exp(-0.5 * distance * distance)
}

function wavDurationSeconds(bytes: Uint8Array): number {
  const wav = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('TTS output is not a valid RIFF/WAVE file.')
  }
  let byteRate = 0
  let dataSize = 0
  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    const dataOffset = offset + 8
    if (dataOffset + size > wav.length) throw new Error('TTS WAV contains a truncated chunk.')
    if (id === 'fmt ' && size >= 12) byteRate = wav.readUInt32LE(dataOffset + 8)
    if (id === 'data') dataSize += size
    offset = dataOffset + size + (size % 2)
  }
  if (!byteRate || !dataSize) throw new Error('TTS WAV is missing format or audio data.')
  return dataSize / byteRate
}
