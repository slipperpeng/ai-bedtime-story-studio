import { CloudSun, KeyRound, RefreshCw, Sparkles } from 'lucide-react'
import type { TokenPlanUsage } from '../../../shared/contracts'
import { useLanguage } from '../lib/i18n'

interface OnlineUsageMeterProps {
  usage?: TokenPlanUsage
  refreshing: boolean
  onRefresh(): Promise<void>
  onConfigure(): void
}

export function OnlineUsageMeter({ usage, refreshing, onRefresh, onConfigure }: OnlineUsageMeterProps) {
  const { language } = useLanguage()
  const isEn = language === 'en'
  const status = usage?.status
  const usageMessage = isEn && usage?.message && /[\u3400-\u9fff]/.test(usage.message)
    ? 'Plan usage is temporarily unavailable.'
    : usage?.message
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
      ? `${formatQuota(usage.remaining, language)} ${isEn ? 'credits' : '额度'}`
    : usage?.remainingPercent !== undefined
      ? `${isEn ? 'Remaining' : '剩余'} ${Math.round(usage.remainingPercent)}%`
    : status === 'not-configured'
      ? (isEn ? 'Not configured' : '尚未配置')
      : status === 'unavailable'
        ? (isEn ? 'Try again later' : '稍后再试')
        : (isEn ? 'Checking' : '查询中')
  const detail = usage?.usedPercent !== undefined
    ? `${isEn ? 'Used' : '已使用'} ${Math.round(usage.usedPercent)}%`
    : status === 'not-configured'
      ? (isEn ? 'Add an online service API Key first' : '请先填写在线服务 API Key')
      : usageMessage || (usage?.resetAt ? `${isEn ? 'Updated' : '更新于'} ${formatResetTime(usage.resetAt, language)}` : (isEn ? 'Remaining credits refresh automatically' : '剩余额度会自动更新'))

  return <section className={`online-usage ${status || 'loading'}`} aria-label={isEn ? 'Online plan usage' : '在线套餐用量'}>
    <div className="online-usage-head">
      <span className="online-usage-icon"><CloudSun size={17} /><Sparkles size={9} /></span>
      <div><strong>{isEn ? 'Online plan' : '在线套餐'}</strong><small>{detail}</small></div>
      <button type="button" title={status === 'not-configured' ? (isEn ? 'Open generation settings' : '打开生成设置') : (isEn ? 'Refresh plan usage' : '刷新套餐余量')} aria-label={status === 'not-configured' ? (isEn ? 'Open generation settings' : '打开生成设置') : (isEn ? 'Refresh plan usage' : '刷新套餐余量')} disabled={refreshing} onClick={() => status === 'not-configured' ? onConfigure() : void onRefresh()}>
        {status === 'not-configured' ? <KeyRound size={14} /> : <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />}
      </button>
    </div>
    <div className="online-usage-value"><span>{value}</span>{status === 'low' && <em>{isEn ? 'Running low' : '快用完啦'}</em>}{status === 'exhausted' && <em>{isEn ? 'Used up' : '已用完'}</em>}</div>
    <div className="online-usage-track" role="progressbar" aria-label={isEn ? 'Remaining online plan' : '在线套餐剩余量'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(remainingPercent)}>
      <span style={{ width: `${remainingPercent}%` }}><i aria-hidden="true">✦</i></span>
    </div>
  </section>
}

function formatQuota(value: number, language: 'zh' | 'en'): string {
  return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: 0 }).format(value)
}

function formatResetTime(value: string, language: 'zh' | 'en' = 'zh'): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? (language === 'en' ? 'later' : '稍后') : date.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
