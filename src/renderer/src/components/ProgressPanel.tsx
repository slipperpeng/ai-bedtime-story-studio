import { CheckCircle2, Circle, Clock3, LoaderCircle, RotateCcw, Square, XCircle } from 'lucide-react'
import type { GenerationJob } from '../../../shared/contracts'
import { BACKGROUND_MUSIC_FEATURE_ENABLED } from '../../../shared/features'
import { neutralizeProviderBrand, type FailureContext, userFacingFailure } from '../lib/user-facing-errors'

interface ProgressPanelProps {
  job?: GenerationJob
  title?: string
  failureContext?: FailureContext
  onCancel?(jobId: string): void
  onRetry?(): void
}

export function ProgressPanel({ job, title, failureContext, onCancel, onRetry }: ProgressPanelProps) {
  if (!job) return <div className="empty-state compact"><Clock3 size={24} /><p>开始制作后，这里会显示每个耗时步骤的进度与预计剩余时间。</p></div>
  const overallProgress = Math.round(Math.max(0, Math.min(100, job.overallProgress)))
  const activeStep = job.steps.find((step) => step.status === 'running')
  const failedStep = job.steps.find((step) => step.status === 'failed')
  const context = failureContext || (job.kind === 'voice' ? 'local-voice' : 'story')
  const failureMessage = job.status === 'failed'
    ? userFacingFailure(job.error || failedStep?.message, context)
    : undefined
  const isFailed = job.status === 'failed'
  const retryLabel = job.kind === 'story'
    ? '从已完成步骤续作'
    : context === 'online-voice' ? '重新在线复刻' : '保留已下载内容并重试'
  const visibleSteps = job.steps.filter((step) => BACKGROUND_MUSIC_FEATURE_ENABLED || step.id !== 'music_generate')
  return <div className={`progress-panel ${job.status}`} aria-busy={job.status === 'queued' || job.status === 'running'}>
    <p className="sr-only" role="status" aria-live={isFailed ? 'assertive' : 'polite'} aria-atomic="true">{statusText(job.status)}，总进度 {overallProgress}%。{failureMessage || (activeStep ? `${activeStep.label}：${neutralizeProviderBrand(activeStep.message)}` : '')}</p>
    <div className="progress-head">
      <div><p className="eyebrow">制作任务</p><h2>{title || (job.kind === 'voice' ? '准备专属音色' : '正在生成故事')}</h2></div>
      <div className="progress-total"><strong>{isFailed ? '未完成' : `${overallProgress}%`}</strong><span>{isFailed ? `停在 ${overallProgress}%` : statusText(job.status)}</span></div>
    </div>
    <div className="progress-track large" role="progressbar" aria-label="任务总进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overallProgress} aria-valuetext={`${statusText(job.status)}，${overallProgress}%`}><span aria-hidden="true" style={{ width: `${overallProgress}%` }} /></div>
    <div className="step-list">
      {visibleSteps.map((step) => <div className={`step-row ${step.status}`} key={step.id}>
        <div className="step-icon" aria-hidden="true">{stepIcon(step.status)}</div>
        <div className="step-copy">
          <div className="step-title"><strong>{step.label}</strong><span>{step.current !== undefined && step.total !== undefined ? formatProgressCount(step.current, step.total) : `${Math.round(step.progress)}%`}</span></div>
          <p>{step.status === 'failed' ? '本步骤未完成，请按下方提示处理。' : neutralizeProviderBrand(step.message)}</p>
          {(step.status === 'running' || step.progress > 0) && <div className="progress-track" role="progressbar" aria-label={`${step.label}进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(step.progress)}><span aria-hidden="true" style={{ width: `${step.progress}%` }} /></div>}
        </div>
        <span className="eta">{step.etaSeconds !== undefined && step.etaSeconds > 0 ? `约 ${formatEta(step.etaSeconds)}` : ''}</span>
      </div>)}
    </div>
    {failureMessage && <div className="inline-alert error" role="alert"><XCircle size={18} aria-hidden="true" /><span>{failureMessage}</span></div>}
    <div className="panel-actions">
      {job.status === 'running' && onCancel && <button className="button secondary" type="button" onClick={() => onCancel(job.id)}><Square size={16} />停止任务</button>}
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

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`
  return `${Math.ceil(seconds / 60)} 分钟`
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

function statusText(status: GenerationJob['status']): string {
  return ({ queued: '排队中', running: '进行中', paused: '可续作', succeeded: '已完成', failed: '失败', cancelled: '已取消' })[status]
}
