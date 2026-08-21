import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createRendererUrlPolicy } from '../src/main/security/navigation'
import { SaveSettingsSchema } from '../src/shared/schemas'

describe('renderer navigation policy', () => {
  it('allows only the packaged renderer file, not another file URL with a null origin', () => {
    const policy = createRendererUrlPolicy('file:///C:/Program%20Files/Bedtime/resources/app.asar/out/renderer/index.html')

    expect(policy('file:///C:/Program%20Files/Bedtime/resources/app.asar/out/renderer/index.html#story')).toBe(true)
    expect(policy('file:///C:/Users/child/Downloads/untrusted.html')).toBe(false)
    expect(policy('story-asset://local/projects/example/output/story.html')).toBe(false)
  })

  it('limits the development renderer to its configured origin', () => {
    const policy = createRendererUrlPolicy('http://localhost:5173/')

    expect(policy('http://localhost:5173/src/main.tsx')).toBe(true)
    expect(policy('http://localhost:5174/')).toBe(false)
    expect(policy('https://localhost:5173/')).toBe(false)
  })

  it('does not allow inline renderer scripts', async () => {
    const html = await readFile(resolve('src/renderer/index.html'), 'utf8')
    expect(html).toContain("script-src 'self';")
    expect(html).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(html).toMatch(/href=["']\.\/app-icon\.svg["']/)
    expect(html).not.toMatch(/href=["']\/app-icon\.svg["']/)
  })

  it('does not expose online voice credential bindings to the renderer', async () => {
    const ipc = await readFile(resolve('src/main/ipc.ts'), 'utf8')

    expect(ipc).toContain('delete result.remoteProviderBaseUrl')
    expect(ipc).toContain('delete result.remoteCredentialFingerprint')
    expect(ipc).toContain('voices: publicVoices()')
  })

  it('only exposes hashed MP3 files from the system voice preview cache', async () => {
    const source = await readFile(resolve('src/main/index.ts'), 'utf8')
    expect(source).toContain('/^previews\\/system-voices\\/[0-9a-f]{64}\\.mp3$/')
    expect(source).not.toContain("normalized.startsWith('previews/')")
  })
})

describe('provider endpoint policy', () => {
  const settings = {
    defaultStoryProvider: 'minimax',
    miniMaxBaseUrl: 'https://api.minimaxi.com/v1',
    miniMaxGroupId: '',
    miniMaxTextPath: '/chat/completions',
    miniMaxImagePath: '/image_generation',
    miniMaxTextModel: 'MiniMax-M3',
    miniMaxImageModel: 'image-01',
    openAiBaseUrl: 'https://api.openai.com/v1',
    openAiModel: 'gpt-4.1-mini',
  }

  it('requires HTTPS for remote providers but permits loopback HTTP compatibility endpoints', () => {
    expect(() => SaveSettingsSchema.parse({ ...settings, miniMaxBaseUrl: 'http://api.minimaxi.com/v1' })).toThrow()
    expect(() => SaveSettingsSchema.parse({ ...settings, openAiBaseUrl: 'http://192.168.1.20:8000/v1' })).toThrow()
    expect(() => SaveSettingsSchema.parse({ ...settings, openAiBaseUrl: 'http://localhost:8000/v1' })).not.toThrow()
  })

  it('rejects credentials in remote provider URLs', () => {
    expect(() => SaveSettingsSchema.parse({ ...settings, miniMaxBaseUrl: 'https://key@api.minimaxi.com/v1' })).toThrow()
  })
})
