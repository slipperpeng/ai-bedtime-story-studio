import { describe, expect, it } from 'vitest'
import {
  GUIDED_CHINESE_REFERENCE_TEXT,
  GUIDED_CHINESE_SCRIPTS,
  guidedSegmentLimitMs,
  stopFailureMessage,
} from '../src/renderer/src/components/AudioRecorder'

describe('guided Chinese recording limits', () => {
  it('keeps the three prompts short enough for unhurried reading within the 30 second sample budget', () => {
    const hanCounts = GUIDED_CHINESE_SCRIPTS.map((script) => script.text.match(/[\u3400-\u9fff]/g)?.length ?? 0)

    expect(hanCounts).toEqual([13, 12, 14])
    expect(Math.max(...hanCounts)).toBeLessThanOrEqual(14)
    expect(GUIDED_CHINESE_REFERENCE_TEXT).toBe(GUIDED_CHINESE_SCRIPTS.map((script) => script.text).join(' '))
    expect(guidedSegmentLimitMs(30)).toBe(9_800)
    expect(guidedSegmentLimitMs(30) * 3 + 250 * 2).toBeLessThanOrEqual(30_000)
  })

  it('rejects a guided segment stopped by the time limit instead of accepting truncated audio', () => {
    const message = stopFailureMessage('limit', guidedSegmentLimitMs(30))

    expect(message).toContain('约 10 秒上限')
    expect(message).toContain('没有保存')
    expect(message).toContain('完整读完')
    expect(stopFailureMessage('limit')).toBeUndefined()
  })
})
