import type { GenerationJob, PipelineStepId } from '../../../shared/contracts'

export interface CompletionMoment {
  key: string
  title: string
  message: string
}

const completionCopy: Partial<Record<PipelineStepId, Omit<CompletionMoment, 'key'>>> = {
  voice_prepare: {
    title: '专属音色准备好了',
    message: '这份熟悉的声音，已经可以为故事朗读。',
  },
  story_generate: {
    title: '故事长出新章节了',
    message: '情节已经整理好，接下来为每一页画上插图。',
  },
  image_generate: {
    title: '每一章都有画面了',
    message: '插图已经配齐，今晚的故事更有想象力。',
  },
  tts_synthesize: {
    title: '专属朗读合成好了',
    message: '熟悉的声音已经陪伴故事走完每一章。',
  },
  html_export: {
    title: '今晚的故事完成啦',
    message: '图画、文字和声音都已收好，可以一起阅读了。',
  },
}

export function rememberCompletedSteps(jobs: GenerationJob[], seen: Set<string>): void {
  for (const job of jobs) {
    for (const step of job.steps) {
      if (step.status === 'succeeded') seen.add(completionKey(job.id, step.id))
    }
  }
}

export function initializeCompletionTracking(
  baselineJobs: GenerationJob[],
  bufferedJobs: GenerationJob[],
  seen: Set<string>,
): CompletionMoment[] {
  rememberCompletedSteps(baselineJobs, seen)
  return bufferedJobs.flatMap((job) => collectNewCompletionMoments(job, seen))
}

export function collectNewCompletionMoments(job: GenerationJob, seen: Set<string>): CompletionMoment[] {
  const moments: CompletionMoment[] = []

  for (const step of job.steps) {
    if (step.status !== 'succeeded') continue
    const key = completionKey(job.id, step.id)
    if (seen.has(key)) continue
    seen.add(key)
    const copy = completionCopy[step.id]
    if (copy) moments.push({ key, ...copy })
  }

  return moments
}

function completionKey(jobId: string, stepId: PipelineStepId): string {
  return `${jobId}:${stepId}`
}
