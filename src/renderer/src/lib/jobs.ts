import type { GenerationJob } from '../../../shared/contracts'

export function mergeBufferedJobs(baseline: GenerationJob[], buffered: GenerationJob[]): GenerationJob[] {
  return buffered.reduce((jobs, incoming) => {
    const current = jobs.find((job) => job.id === incoming.id)
    if (current && !isFresherJob(incoming, current)) return jobs
    return [incoming, ...jobs.filter((job) => job.id !== incoming.id)]
  }, baseline)
}

export function findRecentVoiceJob(jobs: GenerationJob[]): GenerationJob | undefined {
  return jobs
    .filter((job) => job.kind === 'voice')
    .reduce<GenerationJob | undefined>((latest, job) => (
      !latest || job.updatedAt > latest.updatedAt ? job : latest
    ), undefined)
}

export function findActiveStoryJob(
  jobs: GenerationJob[],
  currentJobId?: string,
  currentProjectId?: string,
): GenerationJob | undefined {
  const selected = currentJobId
    ? jobs.find((job) => job.kind === 'story' && job.id === currentJobId)
    : undefined
  if (selected) return selected
  if (!currentProjectId) return undefined
  return jobs.find((job) => job.kind === 'story' && job.projectId === currentProjectId)
}

function isFresherJob(incoming: GenerationJob, current: GenerationJob): boolean {
  const incomingTerminal = isTerminal(incoming)
  const currentTerminal = isTerminal(current)
  if (incomingTerminal !== currentTerminal) return incomingTerminal
  if (incoming.updatedAt !== current.updatedAt) return incoming.updatedAt > current.updatedAt
  return incoming.overallProgress > current.overallProgress
}

function isTerminal(job: GenerationJob): boolean {
  return job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled'
}
