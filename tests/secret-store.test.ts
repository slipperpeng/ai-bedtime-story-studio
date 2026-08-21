import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8'),
  },
}))

import { SecretStore } from '../src/main/security/secret-store'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('SecretStore origin binding', () => {
  it('does not expose or silently reuse a key after its service origin changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-secrets-'))
    roots.push(root)
    const endpoints = {
      miniMaxBaseUrl: 'https://api.minimaxi.com/v1',
      openAiBaseUrl: 'https://api.openai.com/v1',
    }
    const secrets = new SecretStore(root, () => endpoints)
    await secrets.initialize()
    await secrets.save({ miniMaxApiKey: 'original-key' }, endpoints)
    expect(secrets.get().miniMaxApiKey).toBe('original-key')

    endpoints.miniMaxBaseUrl = 'https://models.example/v1'
    expect(secrets.get().miniMaxApiKey).toBeUndefined()
    expect(() => secrets.assertTargetOrigins(endpoints)).toThrow('重新输入')

    await secrets.save({ miniMaxApiKey: 'replacement-key' }, endpoints)
    expect(secrets.get().miniMaxApiKey).toBe('replacement-key')
  })

  it('keeps legacy unbound keys encrypted but inactive until they are rebound', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-secrets-'))
    roots.push(root)
    await writeFile(join(root, 'provider-secrets.bin'), JSON.stringify({ miniMaxApiKey: 'legacy-key' }))
    const endpoints = {
      miniMaxBaseUrl: 'https://api.minimaxi.com/v1',
      openAiBaseUrl: 'https://api.openai.com/v1',
    }
    const secrets = new SecretStore(root, () => endpoints)
    await secrets.initialize()

    expect(secrets.hasMiniMaxKey()).toBe(false)
    expect(() => secrets.assertTargetOrigins(endpoints)).toThrow('旧版本')
  })

  it('persists environment keys only when the one-time import flag is enabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bedtime-secrets-'))
    roots.push(root)
    const endpoints = {
      miniMaxBaseUrl: 'https://api.minimaxi.com/v1',
      openAiBaseUrl: 'https://api.openai.com/v1',
    }
    vi.stubEnv('MINIMAX_API_KEY', 'environment-key')
    vi.stubEnv('BEDTIME_IMPORT_PROVIDER_KEYS', '1')
    const imported = new SecretStore(root, () => endpoints)
    await imported.initialize()
    expect(imported.get().miniMaxApiKey).toBe('environment-key')

    vi.stubEnv('MINIMAX_API_KEY', '')
    vi.stubEnv('BEDTIME_IMPORT_PROVIDER_KEYS', '')
    const reloaded = new SecretStore(root, () => endpoints)
    await reloaded.initialize()
    expect(reloaded.get().miniMaxApiKey).toBe('environment-key')
  })
})
