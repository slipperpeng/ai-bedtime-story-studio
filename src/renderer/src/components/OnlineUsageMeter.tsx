import { CloudSun, KeyRound, RefreshCw, Sparkles } from 'lucide-react'
import type { TokenPlanUsage } from '../../../shared/contracts'

interface OnlineUsageMeterProps {
  usage?: TokenPlanUsage
  refreshing: boolean
  onRefresh(): Promise<void>
  onConfigure(): void
}

export function OnlineUsageMeter({ usage, refreshing, onRefresh, onConfigure }: OnlineUsageMeterProps) {
  const status = usage?.status
  const remainingPercent = usage?.remainingPercent !== undefined
    ? usage.remainingPercent
    : usage?.usedPercent !== undefined
      ? Math.max(0, 100 - usage.usedPercent)
    : status === 'exhausted'
      ? 0
      : status === 'low'
        ? 18
        : status === 'available'
          ? 76
          : 0
  const value = usage?.remaining !== undefined
    ? `${formatQuota(usage.remaining)} 额度`
    : usage?.remainingPercent !== undefined
      ? `剩余 ${Math.round(usage.remainingPercent)}%`
    : status === 'not-configured'
      ? '尚未配置'
      : status === 'unavailable'
        ? '稍后再试'
        : '查询中'
  const detail = usage?.usedPercent !== undefined
    ? `已使用 ${Math.round(usage.usedPercent)}%`
    : status === 'not-configured'
      ? '请先填写在线服务 API Key'
      : usage?.message || (usage?.resetAt ? `更新于 ${formatResetTime(usage.resetAt)}` : '剩余额度会自动更新')

  return <section className={`online-usage ${status || 'loading'}`} aria-label="在线套餐用量">
    <div className="online-usage-head">
      <span className="online-usage-icon"><CloudSun size={17} /><Sparkles size={9} /></span>
      <div><strong>在线套餐</strong><small>{detail}</small></div>
      <button type="button" title={status === 'not-configured' ? '打开生成设置' : '刷新套餐余量'} aria-label={status === 'not-configured' ? '打开生成设置' : '刷新套餐余量'} disabled={refreshing} onClick={() => status === 'not-configured' ? onConfigure() : void onRefresh()}>
        {status === 'not-configured' ? <KeyRound size={14} /> : <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />}
      </button>
    </div>
    <div className="online-usage-value"><span>{value}</span>{status === 'low' && <em>快用完啦</em>}{status === 'exhausted' && <em>已用完</em>}</div>
    <div className="online-usage-track" role="progressbar" aria-label="在线套餐剩余量" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(remainingPercent)}>
      <span style={{ width: `${remainingPercent}%` }}><i aria-hidden="true">✦</i></span>
    </div>
  </section>
}

function formatQuota(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value)
}

function formatResetTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '稍后' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
