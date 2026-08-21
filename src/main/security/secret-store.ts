import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { safeStorage } from 'electron'
import { z } from 'zod'

export interface ProviderSecrets {
  miniMaxApiKey?: string
  openAiApiKey?: string
}

export interface ProviderEndpoints {
  miniMaxBaseUrl: string
  openAiBaseUrl: string
}

interface EncryptedProviderSecrets extends ProviderSecrets {
  miniMaxOrigin?: string
  openAiOrigin?: string
}

const encryptedSecretsSchema = z.object({
  miniMaxApiKey: z.string().min(1).max(500).optional(),
  openAiApiKey: z.string().min(1).max(500).optional(),
  miniMaxOrigin: z.string().url().optional(),
  openAiOrigin: z.string().url().optional(),
}).strict()

const officialMiniMaxOrigin = 'https://api.minimaxi.com'
const officialOpenAiOrigin = 'https://api.openai.com'

export function providerOrigin(baseUrl: string): string {
  const url = new URL(baseUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('模型服务地址无效。')
  }
  return url.origin
}

export class SecretStore {
  private readonly filePath: string
  private values: EncryptedProviderSecrets = {}

  constructor(
    dataRoot: string,
    private readonly getEndpoints: () => ProviderEndpoints = () => ({
      miniMaxBaseUrl: `${officialMiniMaxOrigin}/v1`,
      openAiBaseUrl: `${officialOpenAiOrigin}/v1`,
    }),
  ) {
    this.filePath = resolve(dataRoot, 'provider-secrets.bin')
  }

  async initialize(): Promise<void> {
    try {
      const encrypted = await readFile(this.filePath)
      if (safeStorage.isEncryptionAvailable()) {
        const plain = safeStorage.decryptString(encrypted)
        this.values = encryptedSecretsSchema.parse(JSON.parse(plain))
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Unable to load encrypted provider settings.')
      }
    }

    const importEnvironment = process.env.BEDTIME_IMPORT_PROVIDER_KEYS === '1'
    let shouldPersist = false
    if ((importEnvironment || !this.values.miniMaxApiKey) && process.env.MINIMAX_API_KEY) {
      this.values.miniMaxApiKey = process.env.MINIMAX_API_KEY
      this.values.miniMaxOrigin = environmentOrigin('MINIMAX_API_ORIGIN', officialMiniMaxOrigin)
      shouldPersist ||= importEnvironment
    }
    if ((importEnvironment || !this.values.openAiApiKey) && process.env.OPENAI_COMPATIBLE_API_KEY) {
      this.values.openAiApiKey = process.env.OPENAI_COMPATIBLE_API_KEY
      this.values.openAiOrigin = environmentOrigin('OPENAI_COMPATIBLE_API_ORIGIN', officialOpenAiOrigin)
      shouldPersist ||= importEnvironment
    }
    if (shouldPersist) await this.persistEncrypted(this.values)
  }

  get(): ProviderSecrets {
    const endpoints = this.getEndpoints()
    return {
      miniMaxApiKey: this.isBoundTo(this.values.miniMaxApiKey, this.values.miniMaxOrigin, endpoints.miniMaxBaseUrl)
        ? this.values.miniMaxApiKey
        : undefined,
      openAiApiKey: this.isBoundTo(this.values.openAiApiKey, this.values.openAiOrigin, endpoints.openAiBaseUrl)
        ? this.values.openAiApiKey
        : undefined,
    }
  }

  hasMiniMaxKey(): boolean {
    return Boolean(this.get().miniMaxApiKey)
  }

  hasOpenAiKey(): boolean {
    return Boolean(this.get().openAiApiKey)
  }

  assertTargetOrigins(endpoints: ProviderEndpoints, update: ProviderSecrets = {}): void {
    this.assertTargetOrigin('MiniMax', this.values.miniMaxApiKey, this.values.miniMaxOrigin, endpoints.miniMaxBaseUrl, update.miniMaxApiKey)
    this.assertTargetOrigin('兼容模型', this.values.openAiApiKey, this.values.openAiOrigin, endpoints.openAiBaseUrl, update.openAiApiKey)
  }

  async save(update: ProviderSecrets, endpoints: ProviderEndpoints = this.getEndpoints()): Promise<void> {
    this.assertTargetOrigins(endpoints, update)
    const next: EncryptedProviderSecrets = { ...this.values }
    if (update.miniMaxApiKey) {
      next.miniMaxApiKey = update.miniMaxApiKey
      next.miniMaxOrigin = providerOrigin(endpoints.miniMaxBaseUrl)
    }
    if (update.openAiApiKey) {
      next.openAiApiKey = update.openAiApiKey
      next.openAiOrigin = providerOrigin(endpoints.openAiBaseUrl)
    }
    await this.persistEncrypted(next)
    this.values = next
  }

  private async persistEncrypted(values: EncryptedProviderSecrets): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统无法使用安全凭据存储，请改用环境变量配置 API Key。')
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(values))
    await writeFile(this.filePath, encrypted)
  }

  private isBoundTo(key: string | undefined, boundOrigin: string | undefined, baseUrl: string): boolean {
    return Boolean(key && boundOrigin && boundOrigin === providerOrigin(baseUrl))
  }

  private assertTargetOrigin(
    label: string,
    key: string | undefined,
    boundOrigin: string | undefined,
    baseUrl: string,
    replacement: string | undefined,
  ): void {
    if (!key || replacement) return
    const targetOrigin = providerOrigin(baseUrl)
    if (!boundOrigin) throw new Error(`${label} API Key 来自旧版本，请重新输入一次以绑定当前服务地址。`)
    if (boundOrigin !== targetOrigin) throw new Error(`修改 ${label} 服务地址时必须重新输入对应的 API Key。`)
  }
}

function environmentOrigin(variable: string, fallback: string): string {
  const configured = process.env[variable]
  return configured ? providerOrigin(configured) : fallback
}
