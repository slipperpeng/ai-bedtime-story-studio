import { CheckCircle2, Circle, Clock3, LoaderCircle, RotateCcw, Square, XCircle } from 'lucide-react'
import type { GenerationJob } from '../../../shared/contracts'
import { BACKGROUND_MUSIC_FEATURE_ENABLED } from '../../../shared/features'
import { localizedUserFacingFailure, neutralizeProviderBrand, type FailureContext } from '../lib/user-facing-errors'
import { useLanguage } from '../lib/i18n'

interface ProgressPanelProps {
  job?: GenerationJob
  title?: string
  failureContext?: FailureContext
  onCancel?(jobId: string): void
  onRetry?(): void
}

export function ProgressPanel({ job, title, failureContext, onCancel, onRetry }: ProgressPanelProps) {
  const { language } = useLanguage()
  const isEn = language === 'en'
  if (!job) return <div className="empty-state compact"><Clock3 size={24} /><p>{isEn ? 'Progress and estimated time remaining will appear here after you start.' : '开始制作后，这里会显示每个耗时步骤的进度与预计剩余时间。'}</p></div>
  const overallProgress = Math.round(Math.max(0, Math.min(100, job.overallProgress)))
  const activeStep = job.steps.find((step) => step.status === 'running')
  const failedStep = job.steps.find((step) => step.status === 'failed')
  const context = failureContext || (job.kind === 'voice' ? 'local-voice' : 'story')
  const failureMessage = job.status === 'failed'
    ? localizedUserFacingFailure(job.error || failedStep?.message, context, language)
    : undefined
  const isFailed = job.status === 'failed'
  const retryLabelZh = job.kind === 'story'
    ? '从已完成步骤续作'
    : context === 'online-voice' ? '重新在线复刻' : '保留已下载内容并重试'
  const retryLabel = isEn
    ? job.kind === 'story' ? 'Continue from completed steps' : context === 'online-voice' ? 'Clone voice again' : 'Keep downloaded content and retry'
    : retryLabelZh
  const visibleSteps = job.steps.filter((step) => BACKGROUND_MUSIC_FEATURE_ENABLED || step.id !== 'music_generate')
  return <div className={`progress-panel ${job.status}`} aria-busy={job.status === 'queued' || job.status === 'running'}>
    <p className="sr-only" role="status" aria-live={isFailed ? 'assertive' : 'polite'} aria-atomic="true">{statusText(job.status, language)}, {isEn ? 'overall progress' : '总进度'} {overallProgress}%.{failureMessage || (activeStep ? `${stepLabel(activeStep.id, activeStep.label, language)}: ${stepMessage(activeStep.id, activeStep.message, language)}` : '')}</p>
    <div className="progress-head">
      <div><p className="eyebrow">{isEn ? 'Production task' : '制作任务'}</p><h2>{title || (job.kind === 'voice' ? (isEn ? 'Preparing personal voice' : '准备专属音色') : (isEn ? 'Generating story' : '正在生成故事'))}</h2></div>
      <div className="progress-total"><strong>{isFailed ? (isEn ? 'Incomplete' : '未完成') : `${overallProgress}%`}</strong><span>{isFailed ? `${isEn ? 'Stopped at' : '停在'} ${overallProgress}%` : statusText(job.status, language)}</span></div>
    </div>
    <div className="progress-track large" role="progressbar" aria-label={isEn ? 'Overall task progress' : '任务总进度'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={overallProgress} aria-valuetext={`${statusText(job.status, language)}, ${overallProgress}%`}><span aria-hidden="true" style={{ width: `${overallProgress}%` }} /></div>
    <div className="step-list">
      {visibleSteps.map((step) => <div className={`step-row ${step.status}`} key={step.id}>
        <div className="step-icon" aria-hidden="true">{stepIcon(step.status)}</div>
        <div className="step-copy">
        <div className="step-title"><strong>{stepLabel(step.id, step.label, language)}</strong><span>{step.current !== undefined && step.total !== undefined ? formatProgressCount(step.current, step.total) : `${Math.round(step.progress)}%`}</span></div>
        <p>{step.status === 'failed' ? (isEn ? 'This step is incomplete. Follow the message below.' : '本步骤未完成，请按下方提示处理。') : stepMessage(step.id, step.message, language)}</p>
        {(step.status === 'running' || step.progress > 0) && <div className="progress-track" role="progressbar" aria-label={`${stepLabel(step.id, step.label, language)}${isEn ? ' progress' : '进度'}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(step.progress)}><span aria-hidden="true" style={{ width: `${step.progress}%` }} /></div>}
        </div>
        <span className="eta">{step.etaSeconds !== undefined && step.etaSeconds > 0 ? `${isEn ? 'About ' : '约 '}${formatEta(step.etaSeconds, language)}` : ''}</span>
      </div>)}
    </div>
    {failureMessage && <div className="inline-alert error" role="alert"><XCircle size={18} aria-hidden="true" /><span>{failureMessage}</span></div>}
    <div className="panel-actions">
      {job.status === 'running' && onCancel && <button className="button secondary" type="button" onClick={() => onCancel(job.id)}><Square size={16} />{isEn ? 'Stop task' : '停止任务'}</button>}
      {(job.status === 'failed' || job.status === 'paused' || job.status === 'cancelled') && onRetry && <button className="button primary" type="button" onClick={onRetry}><RotateCcw size={17} />{retryLabel}</button>}
    </div>
  </div>
}

function stepIcon(status: string) {
  if (status === 'succeeded' || status === 'skipped') return <CheckCircle2 size={20} />
  if (status === 'running') return <LoaderCircle className="spin progress-spinner" size={20} />
  if (status === 'failed' || status === 'cancelled') return <XCircle size={20} />
  return <Circle size={20} />
}

function formatEta(seconds: number, language: 'zh' | 'en'): string {
  if (seconds < 60) return language === 'en' ? `${seconds}s` : `${seconds} 秒`
  return language === 'en' ? `${Math.ceil(seconds / 60)}m` : `${Math.ceil(seconds / 60)} 分钟`
}

function formatProgressCount(current: number, total: number): string {
  if (total < 1_000_000) return `${current}/${total}`
  return `${formatBytes(current)} / ${formatBytes(total)}`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.max(0, Math.round(bytes / 1_000))} KB`
}

function statusText(status: GenerationJob['status'], language: 'zh' | 'en' = 'zh'): string {
  return (language === 'en'
    ? { queued: 'Queued', running: 'In progress', paused: 'Paused', succeeded: 'Complete', failed: 'Failed', cancelled: 'Cancelled' }
    : { queued: '排队中', running: '进行中', paused: '可续作', succeeded: '已完成', failed: '失败', cancelled: '已取消' })[status]
}

function stepLabel(id: GenerationJob['steps'][number]['id'], fallback: string, language: 'zh' | 'en'): string {
  if (language === 'zh') return fallback
  return {
    voice_prepare: 'Prepare narration voice',
    story_generate: 'Write story chapters',
    music_generate: 'Create background music',
    image_generate: 'Illustrate chapters',
    tts_synthesize: 'Synthesize narration',
    html_export: 'Build HTML picture book',
  }[id] || fallback
}

function stepMessage(id: GenerationJob['steps'][number]['id'], message: string, language: 'zh' | 'en'): string {
  if (language === 'zh') return neutralizeProviderBrand(message)
  const normalized = message.replace(/MiniMax/g, 'online service')
  if (id === 'voice_prepare') return 'The selected voice is being prepared for narration.'
  if (id === 'story_generate') return 'Writing age-appropriate chapters and scene directions.'
  if (id === 'music_generate') return 'Creating a gentle music bed for the story.'
  if (id === 'image_generate') return 'Generating one illustration for each chapter.'
  if (id === 'tts_synthesize') return 'Turning every chapter into clear, gentle narration.'
  if (id === 'html_export') return 'Packaging the picture book and audio into one HTML file.'
  return normalized
}
