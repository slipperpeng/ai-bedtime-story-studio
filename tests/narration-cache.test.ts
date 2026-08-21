import { describe, expect, it } from 'vitest'
import {
  createChapterNarrationFingerprint,
  createNarrationAudioFingerprint,
} from '../src/main/services/narration-cache'

const base = {
  rulesVersion: 'bedtime-narration-v1:minimax-zh-bedtime-v2',
  sourceText: '月亮轻轻照着窗台。',
  preparedText: '月亮轻轻照着窗台。',
  voice: 'Chinese (Mandarin)_Warm_Bestie',
  provider: 'minimax-system',
  model: 'speech-2.8-hd',
  sceneId: '8a0f4760-c820-4e29-8d44-111c75ec94a7',
  sceneIndex: 1,
  speed: 0.66,
  emotion: 'calm',
  pitch: -1,
}

describe('narration audio fingerprint', () => {
  it('is a stable SHA-256 digest for an identical narration request', () => {
    const first = createNarrationAudioFingerprint(base)
    const second = createNarrationAudioFingerprint({ ...base })

    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(second).toBe(first)
  })

  it.each([
    ['rulesVersion', 'bedtime-narration-v2:minimax-zh-bedtime-v2'],
    ['sourceText', '月亮照着另一扇窗。'],
    ['preparedText', '月亮轻轻照着窗台。<#0.55#>晚安。'],
    ['voice', 'Chinese (Mandarin)_Gentle_Senior'],
    ['provider', 'minimax-online'],
    ['model', 'speech-2.8-turbo'],
    ['sceneId', 'e5e89bed-d519-4bad-9818-4bf67bdc7140'],
    ['sceneIndex', 2],
    ['speed', 0.6],
    ['emotion', 'surprised'],
    ['pitch', -3],
  ] as const)('changes when %s changes', (key, value) => {
    expect(createNarrationAudioFingerprint({ ...base, [key]: value })).not.toBe(
      createNarrationAudioFingerprint(base),
    )
  })

  it('builds an order-sensitive chapter fingerprint from scene caches and transition rules', () => {
    const first = 'a'.repeat(64)
    const second = 'b'.repeat(64)
    const fingerprint = createChapterNarrationFingerprint([first, second], 'transitions-v1')

    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(createChapterNarrationFingerprint([second, first], 'transitions-v1')).not.toBe(fingerprint)
    expect(createChapterNarrationFingerprint([first, second], 'transitions-v2')).not.toBe(fingerprint)
  })
})
