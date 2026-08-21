import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSnapshot,
  BedtimeApi,
  CreateProjectInput,
  CreateVoiceInput,
  GenerationJob,
  ProviderSettings,
  SaveSettingsInput,
  StoryProject,
  SystemVoicePreviewResult,
  TokenPlanUsage,
  VoiceProfile,
} from '../shared/contracts'

const api: BedtimeApi = {
  bootstrap: () => ipcRenderer.invoke('bedtime:bootstrap') as Promise<AppSnapshot>,
  settings: {
    save: (input: SaveSettingsInput) => ipcRenderer.invoke('bedtime:settings:save', input) as Promise<ProviderSettings>,
  },
  usage: {
    get: () => ipcRenderer.invoke('bedtime:usage:get') as Promise<TokenPlanUsage>,
  },
  voices: {
    create: (input: CreateVoiceInput) => ipcRenderer.invoke('bedtime:voices:create', input) as Promise<VoiceProfile>,
    list: () => ipcRenderer.invoke('bedtime:voices:list') as Promise<VoiceProfile[]>,
    prepare: (voiceId: string) => ipcRenderer.invoke('bedtime:voices:prepare', voiceId) as Promise<GenerationJob>,
    previewSystem: (voiceId: string) => ipcRenderer.invoke('bedtime:voices:preview-system', voiceId) as Promise<SystemVoicePreviewResult>,
    remove: (voiceId: string) => ipcRenderer.invoke('bedtime:voices:remove', voiceId) as Promise<void>,
  },
  stories: {
    create: (input: CreateProjectInput) => ipcRenderer.invoke('bedtime:stories:create', input) as Promise<StoryProject>,
    list: () => ipcRenderer.invoke('bedtime:stories:list') as Promise<StoryProject[]>,
    get: (projectId: string) => ipcRenderer.invoke('bedtime:stories:get', projectId) as Promise<StoryProject>,
    remove: (projectId: string) => ipcRenderer.invoke('bedtime:stories:remove', projectId) as Promise<void>,
  },
  jobs: {
    start: (projectId: string) => ipcRenderer.invoke('bedtime:jobs:start', projectId) as Promise<GenerationJob>,
    cancel: (jobId: string) => ipcRenderer.invoke('bedtime:jobs:cancel', jobId) as Promise<void>,
    onProgress: (listener: (job: GenerationJob) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, job: GenerationJob) => listener(job)
      ipcRenderer.on('bedtime:job-progress', handler)
      return () => ipcRenderer.removeListener('bedtime:job-progress', handler)
    },
  },
  export: {
    story: (projectId: string) => ipcRenderer.invoke('bedtime:export:story', projectId),
  },
  assets: {
    toUrl: (relativePath: string) => `story-asset://local/${encodeURIComponent(relativePath)}`,
  },
}

contextBridge.exposeInMainWorld('bedtime', api)
