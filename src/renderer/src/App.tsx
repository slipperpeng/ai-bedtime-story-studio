import { BookOpenText, Check, CheckCircle2, Cloud, Languages, Library, MoonStar, Settings, Trash2, Volume2, WandSparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppSnapshot,
  GenerationJob,
  SaveSettingsInput,
  StoryProject,
  TokenPlanUsage,
} from '../../shared/contracts'
import { APP_VERSION } from '../../shared/app-version'
import { ProgressPanel } from './components/ProgressPanel'
import { ConfirmationDialog, type ConfirmationOptions } from './components/ConfirmationDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { OnlineUsageMeter } from './components/OnlineUsageMeter'
import { StepCelebration } from './components/StepCelebration'
import { StoryComposer } from './components/StoryComposer'
import { StoryPreview } from './components/StoryPreview'
import { VoiceLibrary } from './components/VoiceLibrary'
import { collectNewCompletionMoments, initializeCompletionTracking, type CompletionMoment } from './lib/completion-moments'
import { findActiveStoryJob, mergeBufferedJobs } from './lib/jobs'
import { detectLanguage, LanguageContext, persistLanguage, translate, type AppLanguage } from './lib/i18n'

type Section = 'voices' | 'story' | 'production' | 'library'
type ToastState = { message: string; tone: 'status' | 'error' }

export function App() {
  const [language, setLanguageState] = useState<AppLanguage>(() => detectLanguage())
  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next)
    persistLanguage(next)
  }, [])
  const t = useCallback((key: Parameters<typeof translate>[1], ...args: string[]) => translate(language, key, ...args), [language])
  const [snapshot, setSnapshot] = useState<AppSnapshot>()
  const [section, setSection] = useState<Section>('voices')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [currentProjectId, setCurrentProjectId] = useState<string>()
  const [currentJobId, setCurrentJobId] = useState<string>()
  const [preferredVoiceId, setPreferredVoiceId] = useState<string>()
  const [toast, setToast] = useState<ToastState>()
  const [celebration, setCelebration] = useState<CompletionMoment>()
  const [fatalError, setFatalError] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationOptions>()
  const [tokenPlanUsage, setTokenPlanUsage] = useState<TokenPlanUsage>()
  const [usageRefreshing, setUsageRefreshing] = useState(false)
  const sectionRef = useRef<Section>('voices')
  const currentJobIdRef = useRef<string | undefined>(undefined)
  const toastTimerRef = useRef<number | undefined>(undefined)
  const celebrationQueueRef = useRef<CompletionMoment[]>([])
  const celebrationActiveRef = useRef(false)
  const completedStepsRef = useRef(new Set<string>())
  const completionTrackingReadyRef = useRef(false)
  const bufferedProgressJobsRef = useRef<GenerationJob[]>([])
  const refreshBufferedJobsRef = useRef(new Map<number, GenerationJob[]>())
  const refreshRequestRef = useRef(0)
  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | undefined>(undefined)
  const usageAlertRef = useRef('')

  const askForConfirmation = useCallback((options: ConfirmationOptions): Promise<boolean> => new Promise((resolve) => {
    confirmationResolverRef.current?.(false)
    confirmationResolverRef.current = resolve
    setConfirmation(options)
  }), [])

  const resolveConfirmation = useCallback((confirmed: boolean) => {
    const resolve = confirmationResolverRef.current
    confirmationResolverRef.current = undefined
    setConfirmation(undefined)
    resolve?.(confirmed)
  }, [])

  const selectSection = useCallback((next: Section) => {
    sectionRef.current = next
    setSection(next)
  }, [])

  const showToast = useCallback((message: string, tone: ToastState['tone'] = 'status', durationMs = 4_000) => {
    if (toastTimerRef.current !== undefined) window.clearTimeout(toastTimerRef.current)
    setToast({ message, tone })
    toastTimerRef.current = window.setTimeout(() => {
      setToast(undefined)
      toastTimerRef.current = undefined
    }, durationMs)
  }, [])

  const refreshUsage = useCallback(async () => {
    setUsageRefreshing(true)
    try {
      const usage = await window.bedtime.usage.get()
      setTokenPlanUsage(usage)
      if (usage.status === 'low' || usage.status === 'exhausted') {
        const alertKey = `${usage.status}:${Math.floor(usage.remainingPercent ?? usage.remaining ?? 0)}`
        if (usageAlertRef.current !== alertKey) {
          usageAlertRef.current = alertKey
          showToast(
            usage.status === 'exhausted'
            ? (language === 'en' ? 'Your online credits are exhausted. Add credits before creating another story.' : '在线套餐额度已用完，请补充额度后再制作故事。')
            : (language === 'en' ? 'Online credits are running low. Add credits to avoid stopping mid-production.' : '在线套餐余量不多了，建议补充额度，避免制作中途停止。'),
            'error',
            8_000,
          )
        }
      } else if (usage.status === 'available') {
        usageAlertRef.current = ''
      }
    } catch {
      setTokenPlanUsage({ status: 'unavailable', checkedAt: new Date().toISOString(), message: language === 'en' ? 'Plan usage is temporarily unavailable. The app will retry automatically.' : '套餐余量暂时查询不到，稍后会自动重试。' })
    } finally {
      setUsageRefreshing(false)
    }
  }, [language, showToast])

  const chooseSystemVoice = useCallback((voiceId: string) => {
    setPreferredVoiceId(voiceId)
    selectSection('story')
  }, [selectSection])

  const celebrate = useCallback((moment: CompletionMoment) => {
    celebrationQueueRef.current.push(moment)
    if (celebrationActiveRef.current) return
    celebrationActiveRef.current = true
    setCelebration(celebrationQueueRef.current.shift())
  }, [])

  const finishCelebration = useCallback(() => {
    const next = celebrationQueueRef.current.shift()
    if (next) {
      setCelebration(next)
      return
    }
    celebrationActiveRef.current = false
    setCelebration(undefined)
  }, [])

  useEffect(() => () => {
    if (toastTimerRef.current !== undefined) window.clearTimeout(toastTimerRef.current)
    confirmationResolverRef.current?.(false)
  }, [])

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestRef.current
    const refreshBufferedJobs: GenerationJob[] = []
    refreshBufferedJobsRef.current.set(requestId, refreshBufferedJobs)
    try {
      let next = await window.bedtime.bootstrap()
      if (requestId !== refreshRequestRef.current) return
      if (!completionTrackingReadyRef.current) {
        const bufferedJobs = bufferedProgressJobsRef.current.splice(0)
        const moments = initializeCompletionTracking(next.jobs, bufferedJobs, completedStepsRef.current, language)
        if (bufferedJobs.length > 0) {
          next = {
            ...next,
            jobs: mergeBufferedJobs(next.jobs, bufferedJobs),
          }
        }
        completionTrackingReadyRef.current = true
        moments.forEach(celebrate)
      }
      setSnapshot({
        ...next,
        jobs: mergeBufferedJobs(next.jobs, refreshBufferedJobs),
      })
      setFatalError('')
    } catch (error) {
      if (requestId !== refreshRequestRef.current) return
      setFatalError(error instanceof Error ? error.message : (language === 'en' ? 'Unable to read the local workspace.' : '无法读取本地工作区。'))
    } finally {
      refreshBufferedJobsRef.current.delete(requestId)
    }
  }, [celebrate, language])

  useEffect(() => {
    void refresh()
    const unsubscribe = window.bedtime.jobs.onProgress((job) => {
      refreshBufferedJobsRef.current.forEach((jobs) => jobs.push(job))
      setSnapshot((current) => current ? {
        ...current,
        jobs: [job, ...current.jobs.filter((item) => item.id !== job.id)],
      } : current)
      if (completionTrackingReadyRef.current) {
        collectNewCompletionMoments(job, completedStepsRef.current, language).forEach(celebrate)
      } else {
        bufferedProgressJobsRef.current.push(job)
      }
      if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
        void refresh()
        if (job.kind === 'story') void refreshUsage()
        if (job.kind === 'story' && job.status === 'succeeded') {
          const isActiveProduction = sectionRef.current === 'production' && currentJobIdRef.current === job.id
          if (isActiveProduction) {
            setCurrentProjectId(job.projectId)
            selectSection('library')
          } else {
            showToast(language === 'en' ? 'Story production is complete. Open the library to view it.' : '故事制作完成，可在成品中查看。')
          }
        }
      }
    })
    const healthTimer = window.setInterval(() => void refresh(), 15_000)
    return () => {
      unsubscribe()
      window.clearInterval(healthTimer)
    }
  }, [celebrate, language, refresh, refreshUsage, selectSection, showToast])

  useEffect(() => {
    if (!snapshot) return
    void refreshUsage()
    const usageTimer = window.setInterval(() => void refreshUsage(), 5 * 60_000)
    return () => window.clearInterval(usageTimer)
  }, [snapshot?.settings.hasMiniMaxKey, refreshUsage])

  const readyProjects = useMemo(() => snapshot?.projects.filter((project) => project.status === 'ready') || [], [snapshot?.projects])
  const selectableVoices = useMemo(() => snapshot?.voices.filter((voice) => voice.provider === 'minimax-online') || [], [snapshot?.voices])
  const currentJob = findActiveStoryJob(snapshot?.jobs || [], currentJobId, currentProjectId)
  const currentProject = snapshot?.projects.find((project) => project.id === currentProjectId)

  const receiveJob = (job: GenerationJob) => {
    currentJobIdRef.current = job.id
    setCurrentJobId(job.id)
    setSnapshot((current) => current ? { ...current, jobs: [job, ...current.jobs.filter((item) => item.id !== job.id)] } : current)
  }

  const storyStarted = (project: StoryProject, job: GenerationJob) => {
    setCurrentProjectId(project.id)
    receiveJob(job)
    setSnapshot((current) => current ? { ...current, projects: [project, ...current.projects] } : current)
    celebrate({ key: `project:${project.id}`, title: language === 'en' ? 'Story settings are ready' : '故事设定已经收好', message: language === 'en' ? 'Characters, theme, and chapters are ready. Production is starting.' : '人物、主题和章节都准备好了，现在开始制作。' })
    selectSection('production')
  }

  const retry = async () => {
    if (!currentProjectId) return
    try {
      receiveJob(await window.bedtime.jobs.start(currentProjectId))
    } catch (error) {
      showToast(errorMessage(error, language === 'en' ? 'Unable to restart story production.' : '无法重新开始故事制作。'), 'error', 7_000)
    }
  }

  const cancelJob = async (jobId: string) => {
    try {
      await window.bedtime.jobs.cancel(jobId)
    } catch (error) {
      showToast(errorMessage(error, language === 'en' ? 'Unable to stop the current task.' : '无法停止当前任务。'), 'error', 7_000)
    }
  }

  const saveSettings = async (input: SaveSettingsInput) => {
    const settings = await window.bedtime.settings.save(input)
    setSnapshot((current) => current ? { ...current, settings } : current)
    showToast(language === 'en' ? 'Settings saved securely.' : '设置已安全保存。', 'status', 2_500)
    void refreshUsage()
  }

  const exportStory = async (projectId: string) => {
    const project = snapshot?.projects.find((item) => item.id === projectId)
    if (!project || !await askForConfirmation({
      title: language === 'en' ? `Export “${project.title}”?` : `分享《${project.title}》？`,
      message: language === 'en' ? 'The HTML file includes the child nickname, story text, illustrations, and synthesized narration.' : '导出的 HTML 会包含孩子昵称、故事正文、插图和 AI 合成朗读。',
      detail: language === 'en' ? 'Share it only with trusted recipients. A file copied off this computer cannot be recalled remotely.' : '请只分享给可信的接收者。文件离开本机后无法远程撤回。',
      confirmLabel: language === 'en' ? 'Export' : '继续导出',
      cancelLabel: language === 'en' ? 'Not now' : '暂不导出',
      tone: 'info',
    })) return
    try {
      const result = await window.bedtime.export.story(projectId)
      if (!result.cancelled) showToast(language === 'en' ? `Story exported: ${result.filePath}` : `故事已导出：${result.filePath}`)
    } catch (error) {
      showToast(errorMessage(error, language === 'en' ? 'Unable to export the story file.' : '无法导出故事文件。'), 'error', 7_000)
    }
  }

  const removeStory = async (projectId: string) => {
    const project = snapshot?.projects.find((item) => item.id === projectId)
    if (!project || !await askForConfirmation({
      title: language === 'en' ? `Delete “${project.title}”?` : `删除《${project.title}》？`,
      message: language === 'en' ? 'This removes the local chapters, illustrations, narration, and internal HTML for this story.' : '这个故事在应用内保存的章节、插图、朗读和内部 HTML 会一起删除。',
      detail: language === 'en' ? 'Files already copied elsewhere are not affected. This cannot be undone inside the app.' : '已经另存到桌面或其他位置的文件不会被删除。此操作无法在应用内撤销。',
      confirmLabel: language === 'en' ? 'Delete story' : '删除故事',
      cancelLabel: language === 'en' ? 'Keep story' : '保留故事',
      tone: 'danger',
    })) return
    try {
      await window.bedtime.stories.remove(projectId)
      if (currentProjectId === projectId) {
        currentJobIdRef.current = undefined
        setCurrentJobId(undefined)
        setCurrentProjectId(undefined)
      }
      await refresh()
      showToast(language === 'en' ? 'The story and its local files were deleted.' : '故事及其本地产物已删除。')
    } catch (error) {
      showToast(errorMessage(error, language === 'en' ? 'Unable to delete the story.' : '无法删除故事。'), 'error', 7_000)
    }
  }

  if (!snapshot) return <div className="app-loading"><MoonStar size={34} /><strong>{t('loading')}</strong>{fatalError && <p>{fatalError}</p>}</div>

  const navItems: Array<{ id: Section; label: string; description: string; icon: typeof Volume2; complete: boolean }> = [
    { id: 'voices', label: t('voices'), description: t('voiceDescription'), icon: Volume2, complete: Boolean(preferredVoiceId || currentProject?.voiceProfileId) },
    { id: 'story', label: t('story'), description: t('storyDescription'), icon: BookOpenText, complete: Boolean(currentProject) },
    { id: 'production', label: t('production'), description: t('productionDescription'), icon: WandSparkles, complete: currentProject?.status === 'ready' },
    { id: 'library', label: t('library'), description: t('libraryDescription'), icon: Library, complete: false },
  ]
  return <LanguageContext.Provider value={{ language, setLanguage, t }}><div className="app-shell">
    <aside className="app-sidebar">
      <div className="brand"><span className="brand-mark"><img src="./app-icon.svg" alt={t('appName')} /></span><div><strong><span className="brand-text">{t('appName')}</span><span className="brand-version">v{APP_VERSION}</span></strong><small>{t('appTagline')}</small></div></div>
      <nav className="workflow-nav" aria-label={t('workflow')}>{navItems.map((item, index) => {
        const Icon = item.icon
        return <button type="button" key={item.id} className={`${section === item.id ? 'active' : ''} ${item.complete ? 'complete' : ''}`} aria-current={section === item.id ? 'step' : undefined} onClick={() => selectSection(item.id)}>
          <span className="nav-index" aria-hidden="true">{item.complete ? <Check size={12} strokeWidth={2.8} /> : index + 1}</span>
          <Icon size={19} />
          <span><strong>{item.label}</strong><small>{item.description}</small></span>
        </button>
      })}</nav>
      <div className="sidebar-status">
        <OnlineUsageMeter usage={tokenPlanUsage} refreshing={usageRefreshing} onRefresh={refreshUsage} onConfigure={() => setSettingsOpen(true)} />
      </div>
    </aside>
    <div className="app-body">
      <header className="topbar"><div>{currentProject ? <><span className="topbar-label">{t('currentStory')}</span><strong>{currentProject.title}</strong></> : <><span className="topbar-label">{t('workspace')}</span><strong>{t('newStory')}</strong></>}</div><div className="topbar-actions"><div className="language-switch" role="group" aria-label={t('language')}><Languages size={16} aria-hidden="true" /><button type="button" className={language === 'zh' ? 'active' : ''} aria-pressed={language === 'zh'} onClick={() => setLanguage('zh')}>中文</button><button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button></div><button className="icon-button" type="button" title={t('settings')} aria-label={t('settings')} onClick={() => setSettingsOpen(true)}><Settings size={20} /></button></div></header>
      <main className="app-content">
        {section === 'voices' && <VoiceLibrary voices={selectableVoices} systemVoices={snapshot.systemVoices} jobs={snapshot.jobs} settings={snapshot.settings} onChanged={refresh} onJob={receiveJob} onCancel={(jobId) => void cancelJob(jobId)} onOpenSettings={() => setSettingsOpen(true)} onChooseSystemVoice={chooseSystemVoice} onConfirm={askForConfirmation} />}
        {section === 'story' && <StoryComposer settings={snapshot.settings} voices={selectableVoices} systemVoices={snapshot.systemVoices} initialVoiceId={preferredVoiceId} onVoiceChanged={setPreferredVoiceId} onOpenSettings={() => setSettingsOpen(true)} onStarted={storyStarted} />}
        {section === 'production' && <div className="production-page"><header className="section-head"><div><p className="eyebrow">{t('step', '3')}</p><h1>{t('productionTitle')}</h1><p>{currentProject ? `${currentProject.chapterCount} ${language === 'en' ? 'chapters' : '章'} · ${currentProject.storyProvider === 'demo' ? (language === 'en' ? 'local demo' : '本地演示') : (language === 'en' ? 'online' : '在线生成')}` : t('selectOrCreateTask')}</p></div><WandSparkles size={28} /></header><ProgressPanel job={currentJob} title={currentProject?.title} onCancel={(jobId) => void cancelJob(jobId)} onRetry={currentProjectId ? () => void retry() : undefined} /><div className="project-maintenance">{currentProject && currentJob?.status !== 'running' && currentJob?.status !== 'queued' && <button className="text-button danger-text" type="button" onClick={() => void removeStory(currentProject.id)}><Trash2 size={15} />{t('deleteStory')}</button>}</div></div>}
        {section === 'library' && <StoryPreview projects={readyProjects} voices={snapshot.voices} selectedId={currentProjectId} onSelect={setCurrentProjectId} onExport={exportStory} onRemove={removeStory} />}
      </main>
    </div>
    <SettingsDialog
      open={settingsOpen}
      settings={snapshot.settings}
      onClose={() => setSettingsOpen(false)}
      onSave={saveSettings}
    />
    <ConfirmationDialog options={confirmation} onResolve={resolveConfirmation} />
    {celebration && <StepCelebration key={celebration.key} moment={celebration} onFinished={finishCelebration} />}
    {toast && <div className={`toast ${toast.tone === 'error' ? 'error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}>{toast.message}</div>}
  </div></LanguageContext.Provider>
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
