import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('warm girl parameter comparison script', () => {
  it('builds controlled variants with secure project configuration', async () => {
    const [source, packageSource] = await Promise.all([
      readFile('scripts/generate-warm-girl-parameter-comparison.cjs', 'utf8'),
      readFile('package.json', 'utf8'),
    ])
    const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> }

    expect(packageJson.scripts['voices:compare:warm-girl'])
      .toBe('electron scripts/generate-warm-girl-parameter-comparison.cjs')
    expect(source).toContain("candidate.id === 'minimax-zh-cn-047'")
    expect(source).toContain("voice.name !== '温暖少女'")
    expect(source).toContain('safeStorage.decryptString(encrypted)')
    expect(source).toContain('prepareMiniMaxNarrationText(sourceText, tone, sceneType)')
    expect(source).toContain("'light-pauses'")
    expect(source).toContain("raw: { label: '仅原文标点', text: sourceText }")
    expect(source).toContain("emotion: 'calm'")
    expect(source).toContain("emotion: 'happy'")
    expect(source).toContain("emotion: 'surprised'")
    expect(source).toContain('speed: 0.84')
    expect(source).toContain('pitch: 1')
    expect(source).not.toContain('从今天起起我们')
    expect(source).not.toMatch(/sk-(?:cp-)?[A-Za-z0-9_-]{8,}/)
  })
})
