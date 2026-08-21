export type RecordingPhase = 'idle' | 'starting' | 'recording' | 'processing'

export interface RecordingSignalOptions {
  audibleThreshold?: number
  noInputTimeoutMs?: number
  trailingSilenceMs?: number
  minimumSpeechMs?: number
}

export type RecordingSignalAction = 'continue' | 'no-input' | 'complete'

export interface RecordingSignalObservation {
  action: RecordingSignalAction
  heardSpeech: boolean
  speechMs: number
  levelPercent: number
}

const DEFAULT_SIGNAL_OPTIONS: Required<RecordingSignalOptions> = {
  audibleThreshold: 0.012,
  noInputTimeoutMs: 5_000,
  trailingSilenceMs: 2_000,
  minimumSpeechMs: 1_500,
}

/**
 * Tracks microphone activity independently of React and Web Audio so timing,
 * silence handling, and stale animation frames can be tested deterministically.
 */
export class RecordingSignalDetector {
  private readonly options: Required<RecordingSignalOptions>
  private lastObservedAt: number
  private lastAudibleAt?: number
  private activeSpeechMs = 0
  private completed = false

  constructor(private readonly startedAt: number, options: RecordingSignalOptions = {}) {
    this.options = { ...DEFAULT_SIGNAL_OPTIONS, ...options }
    this.lastObservedAt = startedAt
  }

  observe(rms: number, observedAt: number): RecordingSignalObservation {
    const safeRms = Number.isFinite(rms) ? Math.max(0, rms) : 0
    const safeObservedAt = Math.max(this.lastObservedAt, observedAt)
    const elapsed = Math.min(250, safeObservedAt - this.lastObservedAt)
    const audible = safeRms >= this.options.audibleThreshold

    if (audible) {
      this.activeSpeechMs += elapsed
      this.lastAudibleAt = safeObservedAt
    }
    this.lastObservedAt = safeObservedAt

    let action: RecordingSignalAction = 'continue'
    const stalledBeforeMinimum = !audible
      && this.activeSpeechMs < this.options.minimumSpeechMs
      && safeObservedAt - this.startedAt >= this.options.noInputTimeoutMs
      && (this.lastAudibleAt === undefined || safeObservedAt - this.lastAudibleAt >= this.options.trailingSilenceMs)

    if (!this.completed && stalledBeforeMinimum) {
      action = 'no-input'
      this.completed = true
    } else if (
      !this.completed
      && this.lastAudibleAt !== undefined
      && this.activeSpeechMs >= this.options.minimumSpeechMs
      && safeObservedAt - this.lastAudibleAt >= this.options.trailingSilenceMs
    ) {
      action = 'complete'
      this.completed = true
    }

    return {
      action,
      heardSpeech: this.lastAudibleAt !== undefined,
      speechMs: Math.round(this.activeSpeechMs),
      levelPercent: Math.round(Math.min(100, safeRms * 420)),
    }
  }
}

export class RecordingSessionGate {
  private generation = 0
  private currentPhase: RecordingPhase = 'idle'

  get phase(): RecordingPhase {
    return this.currentPhase
  }

  begin(): number | undefined {
    if (this.currentPhase !== 'idle') return undefined
    this.generation += 1
    this.currentPhase = 'starting'
    return this.generation
  }

  isCurrent(token: number): boolean {
    return token === this.generation && this.currentPhase !== 'idle'
  }

  transition(token: number, phase: Exclude<RecordingPhase, 'idle'>): boolean {
    if (!this.isCurrent(token)) return false
    this.currentPhase = phase
    return true
  }

  release(token: number): boolean {
    if (!this.isCurrent(token)) return false
    this.currentPhase = 'idle'
    return true
  }

  cancel(): void {
    this.generation += 1
    this.currentPhase = 'idle'
  }
}
