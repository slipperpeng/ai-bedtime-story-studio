import { copyFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ProviderSettings, TokenPlanUsage, VoiceProfile } from '../shared/contracts'
import {
  CreateProjectSchema,
  CreateVoiceSchema,
  SaveSettingsSchema,
} from '../shared/schemas'
import { MINIMAX_SYSTEM_VOICES } from '../shared/minimax-system-voices'
import { providerOrigin, SecretStore } from './security/secret-store'
import { fetchTokenPlanUsage } from './providers/token-plan-provider'
import { HtmlExporter } from './services/html-exporter'
import { PipelineRunner } from './services/pipeline'
import { AppStore } from './storage/store'

interface IpcDependencies {
  window: BrowserWindow
  store: AppStore
  secrets: SecretStore
  runner: PipelineRunner
  exporter: HtmlExporter
  isTrustedRendererUrl(url: string): boolean
}

export function registerIpcHandlers({ window, store, secrets, runner, exporter, isTrustedRendererUrl }: IpcDependencies): void {
  const publicSettings = (): ProviderSettings => ({
    ...store.getSettings(),
    hasMiniMaxKey: secrets.hasMiniMaxKey(),
    hasOpenAiKey: secrets.hasOpenAiKey(),
  })
  const publicVoice = (voice: VoiceProfile): VoiceProfile => {
    const result = structuredClone(voice)
    delete result.remoteProviderBaseUrl
    delete result.remoteCredentialFingerprint
    return result
  }
  const publicVoices = (): VoiceProfile[] => store.listVoices().map(publicVoice)
  const handle = (channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args) => {
      const frame = event.senderFrame
      if (event.sender !== window.webContents
        || !frame
        || frame !== window.webContents.mainFrame
        || !isTrustedRendererUrl(frame.url)) {
        throw new Error('拒绝来自非受信页面的应用请求。')
      }
      return listener(event, ...args)
    })
  }

  handle('bedtime:bootstrap', async () => ({
      settings: publicSettings(),
      voices: publicVoices(),
      systemVoices: structuredClone(MINIMAX_SYSTEM_VOICES),
      projects: store.listProjects(),
      jobs: store.listJobs(),
  }))

  handle('bedtime:settings:save', async (_event, raw: unknown) => {
    const input = SaveSettingsSchema.parse(raw)
    const endpoints = {
      miniMaxBaseUrl: input.miniMaxBaseUrl,
      openAiBaseUrl: input.openAiBaseUrl,
    }
    const secretUpdate = {
      miniMaxApiKey: input.miniMaxApiKey,
      openAiApiKey: input.openAiApiKey,
    }
    secrets.assertTargetOrigins(endpoints, secretUpdate)
    if (input.miniMaxApiKey || input.openAiApiKey) {
      await secrets.save(secretUpdate, endpoints)
    }
    const { miniMaxApiKey: _miniMaxApiKey, openAiApiKey: _openAiApiKey, ...settings } = input
    await store.setSettings(settings)
    return publicSettings()
  })

  handle('bedtime:usage:get', async (): Promise<TokenPlanUsage> => {
    const checkedAt = new Date().toISOString()
    if (!secrets.hasMiniMaxKey()) {
      return { status: 'not-configured', checkedAt, message: '配置在线服务后可查看套餐余量。' }
    }
    if (providerOrigin(store.getSettings().miniMaxBaseUrl) !== 'https://api.minimaxi.com') {
      return { status: 'unavailable', checkedAt, message: '自定义服务地址暂不支持套餐查询。' }
    }
    try {
      const result = await fetchTokenPlanUsage(secrets.get().miniMaxApiKey || '')
      const status = (result.remainingPercent !== undefined && result.remainingPercent <= 0)
        || (result.remaining !== undefined && result.remaining <= 0)
        ? 'exhausted'
        : result.usedPercent !== undefined
          ? result.usedPercent >= 85 ? 'low' : 'available'
          : result.remaining !== undefined && result.remaining <= 10 ? 'low' : 'available'
      return { ...result, status, checkedAt }
    } catch {
      return { status: 'unavailable', checkedAt, message: '套餐余量暂时查询不到，稍后会自动重试。' }
    }
  })

  handle('bedtime:voices:create', async (_event, raw: unknown) => {
    const input = CreateVoiceSchema.parse(normalizeBytes(raw))
    return publicVoice(await store.createVoice(input))
  })
  handle('bedtime:voices:list', () => publicVoices())
  handle('bedtime:voices:prepare', (_event, voiceId: string) => runner.prepareVoice(assertId(voiceId)))
  handle('bedtime:voices:preview-system', (_event, voiceId: unknown) => runner.previewSystemVoice(assertSystemVoiceId(voiceId)))
  handle('bedtime:voices:remove', (_event, voiceId: string) => runner.removeVoice(assertId(voiceId)))

  handle('bedtime:stories:create', (_event, raw: unknown) => store.createProject(CreateProjectSchema.parse(raw)))
  handle('bedtime:stories:list', () => store.listProjects())
  handle('bedtime:stories:get', (_event, projectId: string) => store.getProject(assertId(projectId)))
  handle('bedtime:stories:remove', (_event, projectId: string) => store.removeProject(assertId(projectId)))

  handle('bedtime:jobs:start', (_event, projectId: string) => runner.startProject(assertId(projectId)))
  handle('bedtime:jobs:cancel', (_event, jobId: string) => runner.cancel(assertId(jobId)))

  handle('bedtime:export:story', async (_event, projectId: string) => {
    const project = store.getProject(assertId(projectId))
    const outputAsset = await exporter.build(project)
    await store.updateProject(project.id, (target) => {
      target.outputAsset = outputAsset
    })
    const result = await dialog.showSaveDialog(window, {
      title: '导出独立故事文件',
      defaultPath: basename(store.resolveAsset(outputAsset)),
      filters: [{ name: 'HTML 故事', extensions: ['html'] }],
    })
    if (result.canceled || !result.filePath) return { cancelled: true }
    await copyFile(store.resolveAsset(outputAsset), result.filePath)
    return { cancelled: false, filePath: result.filePath }
  })
}

export function unregisterIpcHandlers(): void {
  const channels = [
    'bedtime:bootstrap', 'bedtime:settings:save', 'bedtime:usage:get', 'bedtime:voices:create', 'bedtime:voices:list',
    'bedtime:voices:prepare', 'bedtime:voices:preview-system', 'bedtime:voices:remove',
    'bedtime:stories:create', 'bedtime:stories:list', 'bedtime:stories:get', 'bedtime:stories:remove',
    'bedtime:jobs:start', 'bedtime:jobs:cancel', 'bedtime:export:story',
  ]
  channels.forEach((channel) => ipcMain.removeHandler(channel))
}

function assertId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error('无效的任务编号。')
  return value
}

function assertSystemVoiceId(value: unknown): string {
  if (typeof value !== 'string' || !MINIMAX_SYSTEM_VOICES.some((voice) => voice.id === value)) {
    throw new Error('无效的 MiniMax 内置音色编号。')
  }
  return value
}

function normalizeBytes(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const input = value as Record<string, unknown>
  const bytes = input.audioBytes
  if (bytes instanceof Uint8Array) return input
  if (bytes instanceof ArrayBuffer) return { ...input, audioBytes: new Uint8Array(bytes) }
  if (Array.isArray(bytes)) return { ...input, audioBytes: Uint8Array.from(bytes as number[]) }
  return input
}
