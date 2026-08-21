import { describe, expect, it, vi } from 'vitest'
import { fetchTokenPlanUsage, TOKEN_PLAN_REMAINS_URL } from '../src/main/providers/token-plan-provider'

describe('token plan usage provider', () => {
  it('queries the official remaining-quota endpoint without exposing the key in the URL', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      model_remains: [{ model_name: 'story-model', remains: 12, total: 100, end_time: 1_800_000_000 }],
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

    const result = await fetchTokenPlanUsage('secret-key', fetcher)

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = vi.mocked(fetcher).mock.calls[0]
    expect(url).toBe(TOKEN_PLAN_REMAINS_URL)
    expect(String(url)).not.toContain('secret-key')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-key')
    expect(result.remaining).toBe(12)
    expect(result.used).toBe(88)
    expect(result.usedPercent).toBe(88)
    expect(result.resetAt).toBe(new Date(1_800_000_000_000).toISOString())
  })

  it('uses the lowest returned model quota for timely warnings', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: { model_remains: [{ remains: '42' }, { remains: 8 }] },
      base_resp: { status_code: 0 },
    }), { status: 200 })) as unknown as typeof fetch

    await expect(fetchTokenPlanUsage('secret-key', fetcher)).resolves.toMatchObject({ remaining: 8 })
  })

  it('uses the lowest live interval or weekly remaining percentage', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      model_remains: [
        {
          model_name: 'general',
          end_time: 1_787_140_800_000,
          weekly_end_time: 1_787_500_800_000,
          current_interval_remaining_percent: 48,
          current_weekly_remaining_percent: 89,
        },
        {
          model_name: 'video',
          current_interval_remaining_percent: 100,
          current_weekly_remaining_percent: 100,
        },
      ],
      base_resp: { status_code: 0 },
    }), { status: 200 })) as unknown as typeof fetch

    await expect(fetchTokenPlanUsage('secret-key', fetcher)).resolves.toMatchObject({
      remainingPercent: 48,
      usedPercent: 52,
      resetAt: new Date(1_787_140_800_000).toISOString(),
    })
  })

  it('rejects successful responses without recognizable quota data', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      base_resp: { status_code: 0 },
    }), { status: 200 })) as unknown as typeof fetch

    await expect(fetchTokenPlanUsage('secret-key', fetcher)).rejects.toThrow('套餐余量')
  })
})
