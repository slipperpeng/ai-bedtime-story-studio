import { describe, expect, it } from 'vitest'
import {
  MINIMAX_NARRATION_RULES_VERSION,
  prepareMiniMaxNarrationText,
} from '../src/shared/narration-script'

describe('MiniMax bedtime narration script', () => {
  it('uses the v4 rules and inserts a paragraph pause between non-empty paragraphs', () => {
    const prepared = prepareMiniMaxNarrationText(
      '“月亮来了。”\n\n小猫停下来；它听见晚风。然后，它继续走。',
      '温柔舒缓',
    )

    expect(prepared).toContain('“月亮来了。”<#0.75#>\n\n')
    expect(prepared).toContain('晚风。<#0.42#>然后')
    expect(MINIMAX_NARRATION_RULES_VERSION).toBe('minimax-zh-bedtime-v4')
  })

  it.each([
    ['温柔舒缓', '0.75'],
    ['轻松有趣', '0.65'],
    ['梦幻诗意', '0.8'],
    ['安静治愈', '0.9'],
  ])('uses the %s paragraph pause profile', (tone, seconds) => {
    expect(prepareMiniMaxNarrationText('第一段。\n第二段。', tone)).toBe(
      `第一段。<#${seconds}#>\n第二段。`,
    )
  })

  it('adapts semantic pauses to the scene type', () => {
    const peaceful = prepareMiniMaxNarrationText(
      '小猫沿着月光铺成的小路慢慢向前走，晚风把树叶吹得沙沙作响。',
      '温柔舒缓',
      'peaceful',
    )
    const tense = prepareMiniMaxNarrationText(
      '小猫沿着月光铺成的小路慢慢向前走，晚风把树叶吹得沙沙作响。',
      '温柔舒缓',
      'tense',
    )

    expect(peaceful).toContain('<#0.2#>')
    expect(tense).not.toContain('<#0.2#>')
  })

  it('keeps the Speech-2.8 nonverbal allowlist and removes unknown stage directions', () => {
    const prepared = prepareMiniMaxNarrationText(
      '小猫(laughs)笑了。(sighs)它听见风声。(robotic)(开心地说)然后安心睡着。',
      '温柔舒缓',
    )

    expect(prepared).toContain('(laughs)')
    expect(prepared).toContain('(sighs)')
    expect(prepared).not.toMatch(/robotic|开心地说/i)
  })

  it('removes old pause markers and is idempotent', () => {
    const source = '小猫沿着月光走了很久，终于来到了安静的湖边。<#9#>它看见星星在水面轻轻摇晃。'
    const prepared = prepareMiniMaxNarrationText(source, '梦幻诗意', 'reflective')

    expect(prepared).not.toContain('<#9#>')
    expect(prepareMiniMaxNarrationText(prepared, '梦幻诗意', 'reflective')).toBe(prepared)
  })

  it('removes legacy pause markers even when their payload is unusually long', () => {
    const oldMarker = `<#${'9'.repeat(80)}#>`
    const prepared = prepareMiniMaxNarrationText(
      `小猫沿着月光走到湖边。${oldMarker}星星在水面轻轻摇晃。`,
      '温柔舒缓',
    )

    expect(prepared).not.toContain(oldMarker)
  })

  it('does not force a midpoint pause into short, ordinary prose', () => {
    const source = '小猫说：“晚安！”月亮轻轻亮着。'
    expect(prepareMiniMaxNarrationText(source, '温柔舒缓')).toBe(source)
  })

  it('places a dialogue transition pause after the closing quote', () => {
    const prepared = prepareMiniMaxNarrationText(
      '小猫认真想了很久，终于抬起头说：“我愿意和你一起寻找回家的路。”月亮照亮了前方。',
      '温柔舒缓',
      'warm',
    )

    expect(prepared).toContain('回家的路。”<#0.44#>月亮')
    expect(prepared).not.toMatch(/。<#[^#]+#>”/)
  })

  it('normalizes line endings while retaining single and blank line boundaries', () => {
    expect(prepareMiniMaxNarrationText('第一段\r\n第二段\r\n\r\n第三段', '安静治愈')).toBe(
      '第一段<#0.9#>\n第二段<#0.9#>\n\n第三段',
    )
  })

  it('never emits invalid, trailing, or consecutive pause markers', () => {
    const prepared = prepareMiniMaxNarrationText(
      '这是一段足够长的文字，用来测试逗号和句号之间不会出现连续的停顿标记，然后故事继续。\n下一段也有足够长的文字可以朗读。',
      '安静治愈',
      'goodnight',
    )
    const markers = [...prepared.matchAll(/<#([^#]+)#>/g)]

    expect(markers.length).toBeGreaterThan(0)
    expect(prepared).not.toMatch(/^\s*<#[^#]+#>/)
    expect(prepared).not.toMatch(/<#[^#]+#>\s*$/)
    expect(prepared).not.toMatch(/<#[^#]+#>\s*<#[^#]+#>/)
    for (const marker of markers) {
      expect(Number(marker[1])).toBeGreaterThanOrEqual(0.01)
      expect(Number(marker[1])).toBeLessThanOrEqual(99.99)
      expect(marker[1]).toMatch(/^\d+(?:\.\d{1,2})?$/)
    }
  })
})
