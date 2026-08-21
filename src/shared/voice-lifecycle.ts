import type { VoiceProfile } from './contracts'

export const MINIMAX_TEMP_VOICE_WINDOW_MS = 168 * 60 * 60 * 1_000

export function isUnactivatedMiniMaxVoiceExpired(
  voice: Pick<VoiceProfile, 'provider' | 'remoteCreatedAt' | 'remoteActivatedAt'>,
  at = Date.now(),
): boolean {
  if (voice.provider !== 'minimax-online' || !voice.remoteCreatedAt || voice.remoteActivatedAt) return false
  const createdAt = Date.parse(voice.remoteCreatedAt)
  return Number.isFinite(createdAt) && at - createdAt >= MINIMAX_TEMP_VOICE_WINDOW_MS
}
