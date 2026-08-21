import { readErrorResponse } from './http'

export const TOKEN_PLAN_REMAINS_URL = 'https://www.minimaxi.com/v1/token_plan/remains'

export interface TokenPlanUsageResult {
  remaining?: number
  remainingPercent?: number
  total?: number
  used?: number
  usedPercent?: number
  resetAt?: string
}

export async function fetchTokenPlanUsage(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<TokenPlanUsageResult> {
  const response = await fetcher(TOKEN_PLAN_REMAINS_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(await readErrorResponse(response))

  const payload = await response.json() as unknown
  const root = asRecord(payload)
  const baseResponse = asRecord(root?.base_resp)
  const statusCode = finiteNumber(baseResponse?.status_code)
  if (statusCode !== undefined && statusCode !== 0) {
    throw new Error(typeof baseResponse?.status_msg === 'string' ? baseResponse.status_msg : `接口状态 ${statusCode}`)
  }

  const candidates = quotaCandidates(root)
    .map(parseQuotaCandidate)
    .filter((item): item is TokenPlanUsageResult => Boolean(item))
  const percentageCandidates = candidates
    .filter((item) => item.remainingPercent !== undefined)
    .sort((left, right) => (left.remainingPercent || 0) - (right.remainingPercent || 0))
  const countCandidates = candidates
    .filter((item) => item.remaining !== undefined)
    .sort((left, right) => (left.remaining || 0) - (right.remaining || 0))
  const quota = percentageCandidates[0] || countCandidates[0]
  if (!quota) throw new Error('接口没有返回可识别的套餐余量。')
  return quota
}

function quotaCandidates(root: Record<string, unknown> | undefined): Record<string, unknown>[] {
  if (!root) return []
  const data = asRecord(root.data)
  const raw = root.model_remains ?? data?.model_remains ?? root.token_plan_remains ?? data?.token_plan_remains
  if (Array.isArray(raw)) return raw.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
  const record = asRecord(raw)
  return [record, data, root].filter((item): item is Record<string, unknown> => Boolean(item))
}

function parseQuotaCandidate(candidate: Record<string, unknown>): TokenPlanUsageResult | undefined {
  const remaining = firstFinite(candidate, ['remains', 'remaining', 'remain', 'balance', 'remain_count'])
  const intervalRemainingPercent = validPercent(firstFinite(candidate, ['current_interval_remaining_percent', 'remaining_percent']))
  const weeklyRemainingPercent = validPercent(firstFinite(candidate, ['current_weekly_remaining_percent', 'weekly_remaining_percent']))
  const remainingPercent = [intervalRemainingPercent, weeklyRemainingPercent]
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right)[0]
  if ((remaining === undefined || remaining < 0) && remainingPercent === undefined) return undefined
  const declaredTotal = firstFinite(candidate, ['total', 'quota', 'limit', 'total_count', 'total_amount'])
  const declaredUsed = firstFinite(candidate, ['used', 'usage', 'used_count', 'used_amount'])
  const total = declaredTotal !== undefined && declaredTotal > 0
    ? declaredTotal
    : declaredUsed !== undefined && declaredUsed >= 0
      && remaining !== undefined
      ? declaredUsed + remaining
      : undefined
  const used = declaredUsed !== undefined
    ? Math.max(0, declaredUsed)
    : total !== undefined
      && remaining !== undefined
      ? Math.max(0, total - remaining)
      : undefined
  const usedPercent = remainingPercent !== undefined
    ? 100 - remainingPercent
    : total !== undefined && used !== undefined
    ? Math.min(100, Math.max(0, (used / total) * 100))
    : undefined
  const usesWeeklyReset = weeklyRemainingPercent !== undefined && weeklyRemainingPercent === remainingPercent
  return {
    remaining,
    remainingPercent,
    total,
    used,
    usedPercent,
    resetAt: parseResetTime(
      usesWeeklyReset
        ? candidate.weekly_end_time ?? candidate.end_time
        : candidate.end_time ?? candidate.reset_at ?? candidate.expire_time,
    ),
  }
}

function firstFinite(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = finiteNumber(record[key])
    if (value !== undefined) return value
  }
  return undefined
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function validPercent(value: number | undefined): number | undefined {
  return value !== undefined && value >= 0 && value <= 100 ? value : undefined
}

function parseResetTime(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
  }
  const timestamp = finiteNumber(value)
  if (timestamp === undefined || timestamp <= 0) return undefined
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1_000 : timestamp
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}
