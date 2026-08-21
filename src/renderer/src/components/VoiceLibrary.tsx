import {
  AudioLines,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Cloud,
  ExternalLink,
  Languages,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Settings,
  Square,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GenerationJob, ProviderSettings, VoiceProfile } from '../../../shared/contracts'
import {
  orderMiniMaxSystemVoicesForBedtime,
  type MiniMaxSystemVoice,
} from '../../../shared/minimax-system-voices'
import type { PreparedAudio } from '../lib/audio'
import { findRecentVoiceJob } from '../lib/jobs'
import { userFacingFailure } from '../lib/user-facing-errors'
import { AudioRecorder, GUIDED_CHINESE_REFERENCE_TEXT } from './AudioRecorder'
import type { ConfirmationOptions } from './ConfirmationDialog'
import { ProgressPanel } from './ProgressPanel'

interface VoiceLibraryProps {
  voices: VoiceProfile[]
  systemVoices: MiniMaxSystemVoice[]
  jobs: GenerationJob[]
  settings: ProviderSettings
  onChanged(): Promise<void>
  onJob(job: GenerationJob): void
  onCancel(jobId: string): void
  onOpenSettings(): void
  onChooseSystemVoice(voiceId: string): void
  onConfirm(options: ConfirmationOptions): Promise<boolean>
}

type VoiceMode = 'minimax-system' | 'minimax-online'
type SystemVoiceFilter = 'all' | MiniMaxSystemVoice['locale']

const englishSampleScript = 'Tonight the moonlight rests softly by the window, and we begin a gentle story together.'
const INITIAL_SYSTEM_VOICE_COUNT = 12

export function VoiceLibrary({
  voices,
  systemVoices,
  jobs,
  settings,
  onChanged,
  onJob,
  onCancel,
  onOpenSettings,
  onChooseSystemVoice,
  onConfirm,
}: VoiceLibraryProps) {
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [mode, setMode] = useState<VoiceMode>('minimax-system')
  const [referenceText, setReferenceText] = useState(GUIDED_CHINESE_REFERENCE_TEXT)
  const [audio, setAudio] = useState<PreparedAudio>()
  const [systemFilter, setSystemFilter] = useState<SystemVoiceFilter>('all')
  const [systemQuery, setSystemQuery] = useState('')
  const [showAllSystemVoices, setShowAllSystemVoices] = useState(false)
  const [previewingSystemVoiceId, setPreviewingSystemVoiceId] = useState<string>()
  const [playingSystemVoiceId, setPlayingSystemVoiceId] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const systemVoiceAudio = useRef<HTMLAudioElement | null>(null)
  const systemVoicePreviewRequest = useRef(0)
  const provider = 'minimax-online' as const
  const latestVoiceJob = useMemo(() => findRecentVoiceJob(jobs.filter((job) => (
    !job.voiceProfileId || voices.some((voice) => voice.id === job.voiceProfileId)
  ))), [jobs, voices])
  const latestJobVoice = latestVoiceJob?.voiceProfileId
    ? voices.find((voice) => voice.id === latestVoiceJob.voiceProfileId)
    : undefined
  const filteredSystemVoices = useMemo(() => {
    const query = systemQuery.trim().toLocaleLowerCase('zh-CN')
    return orderMiniMaxSystemVoicesForBedtime(systemVoices.filter((voice) => (
      (systemFilter === 'all' || voice.locale === systemFilter)
      && (!query
        || voice.name.toLocaleLowerCase('zh-CN').includes(query)
        || voice.remoteVoiceId.toLocaleLowerCase('en-US').includes(query))
    )))
  }, [systemFilter, systemQuery, systemVoices])
  const visibleSystemVoices = showAllSystemVoices || systemQuery.trim()
    ? filteredSystemVoices
    : filteredSystemVoices.slice(0, INITIAL_SYSTEM_VOICE_COUNT)

  useEffect(() => () => {
    if (audio?.previewUrl) URL.revokeObjectURL(audio.previewUrl)
  }, [audio?.previewUrl])

  useEffect(() => () => {
    systemVoicePreviewRequest.current += 1
    const player = systemVoiceAudio.current
    if (!player) return
    player.onended = null
    player.onerror = null
    player.pause()
    player.removeAttribute('src')
  }, [])

  const stopSystemVoicePreview = () => {
    const player = systemVoiceAudio.current
    if (player) {
      player.onended = null
      player.onerror = null
      player.pause()
      player.currentTime = 0
      player.removeAttribute('src')
    }
    systemVoiceAudio.current = null
    setPlayingSystemVoiceId(undefined)
  }

  const previewSystemVoice = async (voice: MiniMaxSystemVoice) => {
    if (playingSystemVoiceId === voice.id) {
      stopSystemVoicePreview()
      return
    }
    const requestId = systemVoicePreviewRequest.current + 1
    systemVoicePreviewRequest.current = requestId
    stopSystemVoicePreview()
    setPreviewingSystemVoiceId(voice.id)
    setError('')
    try {
      const preview = await window.bedtime.voices.previewSystem(voice.id)
      if (requestId !== systemVoicePreviewRequest.current) return
      const player = new Audio(window.bedtime.assets.toUrl(preview.asset))
      systemVoiceAudio.current = player
      player.onended = () => {
        if (systemVoiceAudio.current !== player) return
        systemVoiceAudio.current = null
        setPlayingSystemVoiceId(undefined)
      }
      player.onerror = () => {
        if (systemVoiceAudio.current !== player) return
        systemVoiceAudio.current = null
        setPlayingSystemVoiceId(undefined)
        setError('试听音频无法播放，请重新点击试听。')
      }
      setPlayingSystemVoiceId(voice.id)
      await player.play()
    } catch (reason) {
      if (requestId !== systemVoicePreviewRequest.current) return
      stopSystemVoicePreview()
      setError(userFacingFailure(reason, 'system-voice-preview'))
    } finally {
      if (requestId === systemVoicePreviewRequest.current) setPreviewingSystemVoiceId(undefined)
    }
  }

  const changeMode = (next: VoiceMode) => {
    if (next !== 'minimax-system') {
      systemVoicePreviewRequest.current += 1
      stopSystemVoicePreview()
      setPreviewingSystemVoiceId(undefined)
    }
    setMode(next)
    setError('')
  }

  const changeLanguage = (next: 'zh' | 'en') => {
    setLanguage(next)
    setAudio(undefined)
    setReferenceText(next === 'zh' ? GUIDED_CHINESE_REFERENCE_TEXT : englishSampleScript)
    setError('')
  }

  const changeAudio = (next?: PreparedAudio) => {
    setAudio(next)
    if (next?.referenceText) setReferenceText(next.referenceText)
    else if (next) setReferenceText('')
    setError('')
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!audio) return setError('请先录制或上传一段声音样本。')
    if (provider === 'minimax-online' && audio.durationMs < 10_000) return setError('在线复刻至少需要 10 秒样本，请继续录制或上传更长的声音。')
    const confirmed = await onConfirm({
      title: '确认保存并在线复刻？',
      message: '请确认录音者是成年人，并且你拥有和授权这段声音用于 AI 故事朗读。',
      detail: '确认后，这段授权录音和后续故事朗读文字会发送到在线语音服务处理。',
      confirmLabel: '确认并开始复刻',
      cancelLabel: '返回检查',
      tone: 'warning',
    })
    if (!confirmed) return
    setBusy(true)
    setError('')
    try {
      const voice = await window.bedtime.voices.create({
        name, language, referenceText: audio.referenceText ?? referenceText, audioBytes: audio.bytes, mimeType: 'audio/wav', durationMs: audio.durationMs,
        provider, consentConfirmed: true, speakerIsAdult: true,
        onlineUploadConfirmed: true,
      })
      const job = await window.bedtime.voices.prepare(voice.id)
      onJob(job)
      setName('')
      setAudio(undefined)
      setReferenceText(language === 'zh' ? GUIDED_CHINESE_REFERENCE_TEXT : englishSampleScript)
      await onChanged()
    } catch (reason) {
      setError(userFacingFailure(reason, 'online-voice'))
    } finally {
      setBusy(false)
    }
  }

  const prepare = async (voice: VoiceProfile) => {
    if (voice.provider === 'minimax-online' && voice.remoteVoiceId && !await onConfirm({
      title: `重新复刻“${voice.name}”？`,
      message: '应用会先尝试永久删除现有的云端音色，再上传当前样本创建新音色。',
      detail: '新音色首次正式朗读时，可能再次按在线服务规则收取音色启用费。',
      confirmLabel: '重新在线复刻',
      cancelLabel: '保留现有音色',
      tone: 'warning',
    })) return
    try {
      onJob(await window.bedtime.voices.prepare(voice.id))
    } catch (reason) {
      setError(userFacingFailure(reason, 'online-voice'))
    }
  }

  const remove = async (voice: VoiceProfile) => {
    const detail = '应用会先请求在线服务永久删除云端复刻音色，再删除本机样本和记录。'
    if (!await onConfirm({
      title: `删除音色“${voice.name}”？`,
      message: detail,
      detail: '已经使用这个音色制作完成的故事不会被删除。此操作无法在应用内撤销。',
      confirmLabel: '删除音色',
      cancelLabel: '保留音色',
      tone: 'danger',
    })) return
    try {
      await window.bedtime.voices.remove(voice.id)
      await onChanged()
    } catch (reason) {
      setError(userFacingFailure(reason, 'online-voice'))
    }
  }

  return <div className="feature-layout voice-layout">
    <section className="feature-main">
      <header className="section-head"><div><p className="eyebrow">步骤 1</p><h1>选择或建立朗读音色</h1><p>直接使用内置中文音色，或录制已授权的成年人声音建立专属音色。</p></div><span className="count-badge">{systemVoices.length} 个内置 · {voices.length} 个我的</span></header>
      <div className="segmented voice-provider-options" role="radiogroup" aria-label="音色来源">
        <button type="button" aria-pressed={mode === 'minimax-system'} className={mode === 'minimax-system' ? 'active' : ''} onClick={() => changeMode('minimax-system')}><Languages size={17} />内置中文</button>
        <button type="button" aria-pressed={mode === 'minimax-online'} className={mode === 'minimax-online' ? 'active' : ''} onClick={() => changeMode('minimax-online')}><Cloud size={17} />在线复刻</button>
      </div>

      {mode === 'minimax-system' ? <section className="system-voice-browser" aria-labelledby="system-voice-title">
        <div className="voice-provider-note online">
          <Cloud size={18} /><div><strong id="system-voice-title">云端内置中文音色</strong><span>无需录音和复刻；首次试听会合成一段短句并按字符计费，结果缓存在本机，制作时按章节正文字符数计费。</span>{!settings.hasMiniMaxKey && <button className="text-button inline-settings-link" type="button" onClick={onOpenSettings}><Settings size={14} />配置在线服务</button>}</div>
        </div>
        <div className="system-voice-tools">
          <label className="system-voice-search"><span className="sr-only">搜索内置中文音色</span><Search size={16} /><input value={systemQuery} onChange={(event) => setSystemQuery(event.target.value)} placeholder="搜索音色名称" /></label>
          <div className="segmented locale-filter" role="radiogroup" aria-label="中文类型">
            <button type="button" aria-pressed={systemFilter === 'all'} className={systemFilter === 'all' ? 'active' : ''} onClick={() => setSystemFilter('all')}>全部</button>
            <button type="button" aria-pressed={systemFilter === 'zh-CN'} className={systemFilter === 'zh-CN' ? 'active' : ''} onClick={() => setSystemFilter('zh-CN')}>普通话</button>
            <button type="button" aria-pressed={systemFilter === 'zh-HK'} className={systemFilter === 'zh-HK' ? 'active' : ''} onClick={() => setSystemFilter('zh-HK')}>粤语</button>
          </div>
        </div>
        <div className="system-voice-grid">
          {visibleSystemVoices.map((voice) => <article className={`system-voice-card ${voice.bedtimeRecommendationRank ? 'recommended' : ''}`} key={voice.id}>
            <span className="voice-avatar"><AudioLines size={19} /></span>
            <div className="system-voice-copy">
              <div className="system-voice-name"><strong>{voice.name}</strong>{voice.bedtimeRecommendationRank && <span className="voice-recommendation-badge">推荐</span>}</div>
              <span>{voice.locale === 'zh-HK' ? '粤语' : '普通话'} · {voice.bedtimeRecommendationReason || '云端内置'}</span>
            </div>
            <div className="system-voice-actions">
              <button
                className="button secondary compact"
                type="button"
                disabled={!settings.hasMiniMaxKey || Boolean(previewingSystemVoiceId)}
                aria-label={`${playingSystemVoiceId === voice.id ? '停止试听' : '试听'}“${voice.name}”`}
                onClick={() => void previewSystemVoice(voice)}
              >
                {previewingSystemVoiceId === voice.id
                  ? <><LoaderCircle className="spin" size={15} />生成中</>
                  : playingSystemVoiceId === voice.id
                    ? <><Square size={14} />停止</>
                    : <><Play size={15} />试听</>}
              </button>
              <button className="button secondary compact" type="button" disabled={!settings.hasMiniMaxKey} onClick={() => onChooseSystemVoice(voice.id)}><CircleCheck size={15} />选用</button>
            </div>
          </article>)}
        </div>
        {visibleSystemVoices.length === 0 && <div className="empty-state compact"><Search size={24} /><p>没有找到匹配的中文音色。</p></div>}
        {!systemQuery.trim() && filteredSystemVoices.length > INITIAL_SYSTEM_VOICE_COUNT && <button className="text-button system-voice-more" type="button" onClick={() => setShowAllSystemVoices((value) => !value)}>{showAllSystemVoices ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{showAllSystemVoices ? '收起音色' : `查看全部 ${filteredSystemVoices.length} 个`}</button>}
      </section> : <form className="voice-form" onSubmit={save}>
        <div className="voice-provider-note online">
          <Cloud size={20} /><div><strong>在线复刻</strong><span>至少 10 秒的录音样本和每章正文会发送到在线语音服务，需要联网、实名认证、API 额度并按服务规则计费。如果还未实名认证，请<a className="voice-auth-link" href="https://platform.minimaxi.com/console/team-info" target="_blank" rel="noreferrer">点击进行实名认证<ExternalLink size={13} /></a>。授权录音会保存在本机，远端临时音色过期后，点击音色卡上的“重新在线复刻”即可用本地样本恢复，无需重新录音。</span>{!settings.hasMiniMaxKey && <button className="text-button inline-settings-link" type="button" onClick={onOpenSettings}><Settings size={14} />先配置在线服务</button>}</div>
        </div>
        <div className="form-grid two">
          <label className="field"><span>音色名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：妈妈的晚安声" required maxLength={50} /></label>
          <label className="field"><span>朗读语言</span><select value={language} onChange={(event) => changeLanguage(event.target.value as 'zh' | 'en')}><option value="zh">中文</option><option value="en">English</option></select></label>
          <label className="field span-two"><span>录音中实际读出的文字{audio?.referenceText ? '（已与引导词同步）' : ''}</span><textarea rows={3} value={referenceText} onChange={(event) => setReferenceText(event.target.value)} readOnly={Boolean(audio?.referenceText)} placeholder="上传音频时，请填写音频中实际读出的完整文字" required maxLength={600} /></label>
        </div>
        <AudioRecorder key={language} value={audio} onChange={changeAudio} guided={language === 'zh'} />
        {error && <p className="field-error">{error}</p>}
        <div className="form-actions"><button className="button primary" type="submit" disabled={busy || !audio || !settings.hasMiniMaxKey}><WandSparkles size={18} />{busy ? '正在保存…' : '保存并在线复刻'}</button></div>
      </form>}
      {latestVoiceJob && latestVoiceJob.status !== 'succeeded' && <div className="inline-progress"><ProgressPanel
        job={latestVoiceJob}
        failureContext="online-voice"
        onCancel={onCancel}
        onRetry={(latestVoiceJob.status === 'failed' || latestVoiceJob.status === 'paused' || latestVoiceJob.status === 'cancelled') && latestJobVoice
          ? () => void prepare(latestJobVoice)
          : undefined}
      /></div>}
      {mode === 'minimax-system' && error && <p className="field-error">{error}</p>}
    </section>
    <aside className="feature-aside voice-list-pane">
      <div className="aside-head"><div><p className="eyebrow">我的声音</p><h2>录制的专属音色</h2></div></div>
      <div className="voice-list">
        {voices.length === 0 && <div className="empty-state compact"><AudioLines size={26} /><p>还没有录制专属音色，也可以直接选用左侧的内置中文音色。</p></div>}
        {voices.map((voice) => <article className="voice-card" key={voice.id}>
          <div className="voice-avatar"><AudioLines size={20} /></div>
          <div className="voice-card-main"><div className="voice-title"><strong>{voice.name}</strong><span className={`status-badge ${voice.status}`}>{voiceStatus(voice.status)}</span></div><p>{voice.language === 'zh' ? '中文' : 'English'} · {(voice.durationMs / 1_000).toFixed(1)} 秒 · 在线复刻</p>
            <audio controls preload="metadata" src={window.bedtime.assets.toUrl(voice.sampleAsset)} /></div>
          <div className="voice-actions"><button className="icon-button small" type="button" title="重新在线复刻" aria-label={`重新准备音色“${voice.name}”`} onClick={() => void prepare(voice)}><RefreshCw size={16} /></button><button className="icon-button small" type="button" title="删除音色" aria-label={`删除音色“${voice.name}”`} onClick={() => void remove(voice)}><Trash2 size={16} /></button></div>
          {voice.status === 'ready' && <CheckCircle2 className="voice-ready" size={18} />}
          {voice.error && <p className="card-error">{userFacingFailure(voice.error, 'online-voice')}</p>}
        </article>)}
      </div>
    </aside>
  </div>
}

function voiceStatus(status: VoiceProfile['status']): string {
  return ({ sampled: '待提取', preparing: '提取中', ready: '可使用', failed: '需重试' })[status]
}
