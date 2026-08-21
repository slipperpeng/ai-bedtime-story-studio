import { createHash } from 'node:crypto'

export const NARRATION_AUDIO_RULES_VERSION = 'bedtime-narration-v3-fixed-warm-smile'

export interface NarrationAudioFingerprintInput {
  sceneId?: string
  sceneIndex?: number
  sourceText: string
  preparedText: string
  voice: string
  provider: string
  model: string
  speed?: number
  emotion?: string
  pitch?: number
  voiceModify?: Record<string, unknown>
  rulesVersion: string
}

export function createNarrationAudioFingerprint(input: NarrationAudioFingerprintInput): string {
  const canonical = JSON.stringify({
    rulesVersion: input.rulesVersion,
    sceneId: input.sceneId ?? null,
    sceneIndex: input.sceneIndex ?? null,
    sourceText: input.sourceText,
    preparedText: input.preparedText,
    voice: input.voice,
    provider: input.provider,
    model: input.model,
    speed: input.speed ?? null,
    emotion: input.emotion ?? null,
    pitch: input.pitch ?? null,
    voiceModify: input.voiceModify ?? null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export function createChapterNarrationFingerprint(sceneFingerprints: string[], transitionRulesVersion: string): string {
  return createHash('sha256').update(JSON.stringify({
    transitionRulesVersion,
    sceneFingerprints,
  })).digest('hex')
}
