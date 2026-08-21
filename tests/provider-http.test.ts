import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithRetry, readErrorResponse, redactProviderSecrets } from '../src/main/providers/http'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('provider HTTP safety', () => {
  it('places an upper bound on an individual remote request', async () => {
    vi.stubGlobal('fetch', vi.fn((_input: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })))

    await expect(fetchWithRetry('https://api.minimaxi.com/v1/chat/completions', { method: 'POST' }, {
      signal: new AbortController().signal,
      attempts: 1,
      timeoutMs: 20,
    })).rejects.toThrow('请求超时')
  })

  it('removes API keys from structured and unstructured provider errors', async () => {
    const marker = ['sk', 'unit', 'only', '0123456789'].join('-')
    const structured = new Response(JSON.stringify({ error: { message: `bad Bearer ${marker}` } }), { status: 401 })
    const plain = new Response(`request rejected for ${marker}`, { status: 401 })

    expect(await readErrorResponse(structured)).not.toContain(marker)
    expect(await readErrorResponse(plain)).not.toContain(marker)
    expect(redactProviderSecrets(`Bearer ${marker}`)).toBe('Bearer [已隐藏]')
  })
})
