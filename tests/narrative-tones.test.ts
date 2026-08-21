import { describe, expect, it } from 'vitest'
import {
  NARRATIVE_TONES,
  findNarrativeTone,
  narrativeSpeechSpeed,
  narrativeTonePrompt,
} from '../src/shared/narrative-tones'

describe('narrative tone catalog', () => {
  it('provides four distinct user-facing styles with matching examples and speech settings', () => {
    expect(NARRATIVE_TONES.map((tone) => tone.id)).toEqual([
      '温柔舒缓',
      '轻松有趣',
      '梦幻诗意',
      '安静治愈',
    ])
    expect(new Set(NARRATIVE_TONES.map((tone) => tone.example)).size).toBe(4)
    expect(NARRATIVE_TONES.every((tone) => tone.summary.length > 4)).toBe(true)
    expect(NARRATIVE_TONES.every((tone) => tone.prompt.length > 20)).toBe(true)
    expect(findNarrativeTone('梦幻诗意')?.example).toContain('月光')
    expect(narrativeTonePrompt('安静治愈')).toContain('不催促、不评判')
    expect(NARRATIVE_TONES.map((tone) => tone.speechSpeed)).toEqual([0.66, 0.72, 0.65, 0.60])
    expect(NARRATIVE_TONES.map((tone) => tone.speechTempo)).toEqual(['偏慢 · 适合睡前', '偏慢 · 保留俏皮感', '偏慢 · 画面感停顿', '慢速 · 最安静'])
  })

  it('preserves a custom legacy tone as a prompt with safe speech defaults', () => {
    expect(narrativeTonePrompt('温柔、舒缓、富有安全感')).toBe('温柔、舒缓、富有安全感')
    expect(narrativeSpeechSpeed('温柔、舒缓、富有安全感')).toBe(0.66)
  })
})
