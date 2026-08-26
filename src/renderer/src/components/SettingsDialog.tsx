import { BookOpenText, Check, ExternalLink, KeyRound, LockKeyhole, UnlockKeyhole, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ProviderSettings, SaveSettingsInput } from '../../../shared/contracts'
import { focusWrapTarget } from '../lib/focus'
import { useLanguage } from '../lib/i18n'

interface SettingsDialogProps {
  open: boolean
  settings: ProviderSettings
  onClose(): void
  onSave(input: SaveSettingsInput): Promise<void>
}

export function SettingsDialog({
  open,
  settings,
  onClose,
  onSave,
}: SettingsDialogProps) {
  const { language } = useLanguage()
  const [form, setForm] = useState<SaveSettingsInput>(settings)
  const [saving, setSaving] = useState(false)
  const [advancedUnlocked, setAdvancedUnlocked] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const busyRef = useRef(false)
  const busy = saving

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    if (!open) return
    setForm({ ...settings, defaultStoryProvider: 'minimax' })
    setError('')
    setSaving(false)
    setAdvancedUnlocked(false)
    busyRef.current = false
  // Opening starts a fresh edit session; background refreshes must not overwrite it.
  }, [open])

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current
      const initial = dialog?.querySelector<HTMLElement>('[data-dialog-autofocus]') || dialog
      initial?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return
      if (event.key === 'Escape') {
        if (busyRef.current) return
        event.preventDefault()
        setForm(settings)
        setError('')
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ))
      const target = focusWrapTarget(focusable, document.activeElement as HTMLElement | null, event.shiftKey)
      if (target) {
        event.preventDefault()
        target.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  if (!open) return null

  const close = () => {
    if (busy) return
    setForm(settings)
    setError('')
    onClose()
  }

  const update = (key: keyof SaveSettingsInput, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    busyRef.current = true
    setSaving(true)
    setError('')
    try {
      await onSave({ ...form, defaultStoryProvider: 'minimax' })
      onClose()
    } catch (reason) {
      setError(language === 'en' ? 'Unable to save settings. Check the API Key and advanced fields, then try again.' : (reason instanceof Error ? reason.message : '保存设置失败。'))
    } finally {
      busyRef.current = false
      setSaving(false)
    }
  }

  if (language === 'en') return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section ref={dialogRef} className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" aria-describedby={error ? 'settings-error' : undefined} aria-busy={busy} tabIndex={-1}>
      <header className="dialog-head"><div><p className="eyebrow">Models and services</p><h2 id="settings-title">Generation settings</h2></div><button className="icon-button" type="button" title="Close settings" aria-label="Close settings" onClick={close} disabled={busy}><X size={20} /></button></header>
      <form onSubmit={submit}><div className={`settings-lock-bar ${advancedUnlocked ? 'unlocked' : ''}`}><div>{advancedUnlocked ? <UnlockKeyhole size={18} /> : <LockKeyhole size={18} />}<span><strong>{advancedUnlocked ? 'Advanced settings unlocked' : 'Advanced settings locked'}</strong><small>{advancedUnlocked ? 'Incorrect values can stop generation. Check carefully before saving.' : 'Recommended values are locked to prevent accidental changes. API Key remains editable.'}</small></span></div><button className="button secondary" type="button" aria-pressed={advancedUnlocked} onClick={() => setAdvancedUnlocked((value) => !value)}>{advancedUnlocked ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}{advancedUnlocked ? 'Lock again' : 'Unlock editing'}</button></div>
        <div className="settings-section"><div className="settings-section-title"><BookOpenText size={18} /><div><strong>Story and illustration</strong><span className="status-dot ready">Recommended online models</span></div></div><div className="form-grid two"><label className="field"><span>Story model ID</span><input value={form.miniMaxTextModel} onChange={(event) => update('miniMaxTextModel', event.target.value)} readOnly={!advancedUnlocked} required /></label><label className="field"><span>Image model ID</span><input value={form.miniMaxImageModel} onChange={(event) => update('miniMaxImageModel', event.target.value)} readOnly={!advancedUnlocked} required /></label></div></div>
        <div className="settings-section"><div className="settings-section-title"><KeyRound size={18} /><div><strong>MiniMax</strong><span className={`status-dot ${settings.hasMiniMaxKey ? 'ready' : ''}`}>{settings.hasMiniMaxKey ? 'API Key saved' : 'API Key not configured'}</span></div></div><div className="form-grid two"><label className="field span-two"><span>API base URL</span><input value={form.miniMaxBaseUrl} onChange={(event) => update('miniMaxBaseUrl', event.target.value)} readOnly={!advancedUnlocked} required /></label><label className="field span-two"><span>API Key</span><input data-dialog-autofocus type="password" value={form.miniMaxApiKey || ''} placeholder={settings.hasMiniMaxKey ? 'Saved securely; leave blank to keep it' : 'Enter your MiniMax API Key'} onChange={(event) => update('miniMaxApiKey', event.target.value)} /></label><label className="field"><span>Text endpoint path</span><input value={form.miniMaxTextPath} onChange={(event) => update('miniMaxTextPath', event.target.value)} readOnly={!advancedUnlocked} required /></label><label className="field"><span>Image endpoint path</span><input value={form.miniMaxImagePath} onChange={(event) => update('miniMaxImagePath', event.target.value)} readOnly={!advancedUnlocked} required /></label><label className="field"><span>Speech model</span><input value={form.miniMaxSpeechModel} onChange={(event) => update('miniMaxSpeechModel', event.target.value)} readOnly={!advancedUnlocked} required /></label></div><div className="settings-resource-links"><a href="https://platform.minimaxi.com/user-center/basic-information/interface-key" target="_blank" rel="noreferrer">Apply for an API Key<ExternalLink size={13} /></a><a href="https://platform.minimaxi.com/user-center/basic-information" target="_blank" rel="noreferrer">Complete voice-clone verification<ExternalLink size={13} /></a></div></div>
        {error && <div id="settings-error" className="inline-alert error" role="alert"><span>{error}</span></div>}<footer className="dialog-actions"><button className="button secondary" type="button" onClick={close} disabled={busy}>Cancel</button><button className="button primary" type="submit" disabled={busy}><Check size={17} />{saving ? 'Saving…' : 'Save settings'}</button></footer>
      </form>
    </section>
  </div>

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section ref={dialogRef} className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" aria-describedby={error ? 'settings-error' : undefined} aria-busy={busy} tabIndex={-1}>
      <header className="dialog-head"><div><p className="eyebrow">模型与服务</p><h2 id="settings-title">生成设置</h2></div><button className="icon-button" type="button" title="关闭设置" aria-label="关闭设置" onClick={close} disabled={busy}><X size={20} /></button></header>
      <form onSubmit={submit}>
        <div className={`settings-lock-bar ${advancedUnlocked ? 'unlocked' : ''}`}>
          <div>{advancedUnlocked ? <UnlockKeyhole size={18} /> : <LockKeyhole size={18} />}<span><strong>{advancedUnlocked ? '高级配置已解锁' : '高级配置已锁定'}</strong><small>{advancedUnlocked ? '修改错误可能导致生成失败，保存前请仔细核对。' : '除 API Key 外使用推荐配置，避免误操作。'}</small></span></div>
          <button className="button secondary" type="button" aria-pressed={advancedUnlocked} onClick={() => setAdvancedUnlocked((value) => !value)}>{advancedUnlocked ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}{advancedUnlocked ? '重新锁定' : '解锁编辑'}</button>
        </div>
        <div className="settings-section">
          <div className="settings-section-title"><BookOpenText size={18} /><div><strong>故事与插图</strong><span className="status-dot ready">使用推荐在线模型</span></div></div>
          <div className="form-grid two">
            <label className="field"><span>故事模型 ID</span><input value={form.miniMaxTextModel} onChange={(event) => update('miniMaxTextModel', event.target.value)} readOnly={!advancedUnlocked} required /></label>
            <label className="field"><span>插图模型 ID</span><input value={form.miniMaxImageModel} onChange={(event) => update('miniMaxImageModel', event.target.value)} readOnly={!advancedUnlocked} required /></label>
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-title"><KeyRound size={18} /><div><strong>MiniMax</strong><span className={`status-dot ${settings.hasMiniMaxKey ? 'ready' : ''}`}>{settings.hasMiniMaxKey ? '密钥已保存' : '尚未配置密钥'}</span></div></div>
          <div className="form-grid two">
            <label className="field span-two"><span>API 基础地址</span><input value={form.miniMaxBaseUrl} onChange={(event) => update('miniMaxBaseUrl', event.target.value)} readOnly={!advancedUnlocked} required /></label>
            <label className="field span-two"><span>API Key</span><input data-dialog-autofocus type="password" value={form.miniMaxApiKey || ''} placeholder={settings.hasMiniMaxKey ? '已加密保存，留空则不修改' : '输入 MiniMax API Key'} onChange={(event) => update('miniMaxApiKey', event.target.value)} /></label>
            <label className="field"><span>文本接口路径</span><input value={form.miniMaxTextPath} onChange={(event) => update('miniMaxTextPath', event.target.value)} readOnly={!advancedUnlocked} required /></label>
            <label className="field"><span>生图接口路径</span><input value={form.miniMaxImagePath} onChange={(event) => update('miniMaxImagePath', event.target.value)} readOnly={!advancedUnlocked} required /></label>
            <label className="field"><span>在线语音模型</span><input value={form.miniMaxSpeechModel} onChange={(event) => update('miniMaxSpeechModel', event.target.value)} readOnly={!advancedUnlocked} required /></label>
          </div>
          <div className="settings-resource-links"><a href="https://platform.minimaxi.com/user-center/basic-information/interface-key" target="_blank" rel="noreferrer">申请按量付费 API Key<ExternalLink size={13} /></a><a href="https://platform.minimaxi.com/user-center/basic-information" target="_blank" rel="noreferrer">完成音色复刻认证<ExternalLink size={13} /></a></div>
        </div>
        {error && <div id="settings-error" className="inline-alert error" role="alert"><span>{error}</span></div>}
        <footer className="dialog-actions"><button className="button secondary" type="button" onClick={close} disabled={busy}>取消</button><button className="button primary" type="submit" disabled={busy}><Check size={17} />{saving ? '保存中…' : '保存设置'}</button></footer>
      </form>
    </section>
  </div>
}
