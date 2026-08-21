import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('recommended voice comparison script', () => {
  it('uses the live catalog, encrypted project config, and current bedtime narration path', async () => {
    const [source, packageSource] = await Promise.all([
      readFile('scripts/generate-recommended-voice-comparison.cjs', 'utf8'),
      readFile('package.json', 'utf8'),
    ])
    const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> }

    expect(packageJson.scripts['voices:compare']).toBe('electron scripts/generate-recommended-voice-comparison.cjs')
    expect(source).toContain('safeStorage.decryptString(encrypted)')
    expect(source).toContain('MINIMAX_CHINESE_SYSTEM_VOICES')
    expect(source).toContain('orderMiniMaxSystemVoicesForBedtime')
    expect(source).toContain('voice.bedtimeRecommendationRank')
    expect(source).toContain('const preparedText = sourceText')
    expect(source).not.toContain('prepareMiniMaxNarrationText')
    expect(source).not.toContain('sceneSettings')
    expect(source).toContain("const tone = '温暖微笑'")
    expect(source).toContain("const sceneType = 'warm'")
    expect(source).toContain("const emotion = 'happy'")
    expect(source).toContain('const speed = 0.80')
    expect(source).toContain('const pitch = 0')
    expect(source).toContain('voices.length !== 2')
    expect(source).toContain("format: 'mp3'")
    expect(source).toContain('sampleRate: 44_100')
    expect(source).toContain("resolve(projectRoot, '.local-data')")
    expect(source).not.toMatch(/sk-(?:cp-)?[A-Za-z0-9_-]{8,}/)
  })
})
