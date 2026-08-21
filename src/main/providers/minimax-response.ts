import { redactProviderSecrets } from './http'

interface MiniMaxEnvelope {
  error?: { message?: unknown }
  base_resp?: {
    status_code?: unknown
    status_msg?: unknown
  }
}

const statusHints: Record<number, string> = {
  1001: '请求处理超时，请稍后重试。',
  1002: '请求过于频繁，请稍后重试。',
  1004: 'API Key 鉴权失败，请检查 MiniMax 设置。',
  1008: 'MiniMax 账户余额不足，请充值后重试。',
  1013: 'MiniMax 服务暂时异常，请稍后重试。',
  1026: '内容安全检查未通过，请调整故事或插图描述。',
  1027: '模型输出内容无效，请调整故事设定后重试。',
  1039: '生成内容超过模型长度限制，请减少章节数后重试。',
  2013: 'MiniMax 请求参数无效，请检查模型与接口设置。',
  2038: '在线音色复刻需要先完成 MiniMax 个人实名认证或企业认证。',
  2049: 'API Key 无效，请重新配置 MiniMax 密钥。',
}

const retryableStatusCodes = new Set([1001, 1002, 1013])

export function readMiniMaxStatusCode(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const rawCode = (payload as MiniMaxEnvelope).base_resp?.status_code
  if (rawCode === undefined || rawCode === null || rawCode === '') return undefined
  const code = Number(rawCode)
  return Number.isFinite(code) ? code : undefined
}

export async function isRetryableMiniMaxResponse(response: Response): Promise<boolean> {
  try {
    return retryableStatusCodes.has(readMiniMaxStatusCode(await response.json()) ?? Number.NaN)
  } catch {
    return false
  }
}

export function assertMiniMaxSuccess(payload: unknown, operation: string): asserts payload is Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${operation}失败：MiniMax 返回了无效响应。`)
  }
  const envelope = payload as MiniMaxEnvelope
  const directMessage = typeof envelope.error?.message === 'string' ? envelope.error.message : ''
  if (directMessage) throw new Error(`${operation}失败：${redactProviderSecrets(directMessage)}`)

  const rawCode = envelope.base_resp?.status_code
  if (rawCode === undefined || rawCode === null || rawCode === '' || Number(rawCode) === 0) return
  const code = readMiniMaxStatusCode(payload)
  const statusMessage = typeof envelope.base_resp?.status_msg === 'string'
    ? redactProviderSecrets(envelope.base_resp.status_msg.trim())
    : ''
  const hint = code === undefined ? undefined : statusHints[code]
  const detail = hint || statusMessage || '未知服务错误。'
  const suffix = statusMessage && statusMessage !== detail ? `（${statusMessage}）` : ''
  throw new Error(`${operation}失败：${detail}${suffix}${code === undefined ? '' : ` [${code}]`}`)
}
