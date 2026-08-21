import { abortableDelay } from '../async'

export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  options: {
    signal: AbortSignal
    attempts?: number
    timeoutMs?: number
    retryResponse?: (response: Response) => boolean | Promise<boolean>
  },
): Promise<Response> {
  const attempts = options.attempts ?? 3
  const timeoutMs = options.timeoutMs ?? 120_000
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = AbortSignal.any([options.signal, timeoutSignal])
    try {
      const response = await fetch(input, { ...init, signal })
      const retryableHttpStatus = response.status === 429 || response.status >= 500
      const retryableApplicationStatus = response.ok && options.retryResponse
        ? await options.retryResponse(response.clone())
        : false
      if (!retryableHttpStatus && !retryableApplicationStatus) return response
      lastError = new Error(retryableApplicationStatus
        ? '远程模型暂时不可用。'
        : `远程模型暂时不可用（HTTP ${response.status}）。`)
      if (attempt === attempts - 1) return response
      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader)
      await abortableDelay(Number.isFinite(retryAfter) ? retryAfter * 1_000 : (2 ** attempt) * 800, options.signal)
    } catch (error) {
      if (options.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      lastError = timeoutSignal.aborted
        ? new Error(`远程模型请求超时（${Math.ceil(timeoutMs / 1_000)} 秒）。`)
        : error
      if (attempt === attempts - 1) break
      await abortableDelay((2 ** attempt) * 800, options.signal)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('远程模型请求失败。')
}

export async function readErrorResponse(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string }; base_resp?: { status_msg?: string }; message?: string }
    return redactProviderSecrets(parsed.error?.message || parsed.base_resp?.status_msg || parsed.message || `HTTP ${response.status}`)
  } catch {
    return redactProviderSecrets(text.slice(0, 300) || `HTTP ${response.status}`)
  }
}

export function redactProviderSecrets(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [已隐藏]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[已隐藏的 API Key]')
}
