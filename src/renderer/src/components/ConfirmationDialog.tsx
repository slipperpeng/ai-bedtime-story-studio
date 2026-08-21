import { AlertTriangle, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { focusWrapTarget } from '../lib/focus'

export interface ConfirmationOptions {
  title: string
  message: string
  detail?: string
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'warning' | 'info'
}

interface ConfirmationDialogProps {
  options?: ConfirmationOptions
  onResolve(confirmed: boolean): void
}

export function ConfirmationDialog({ options, onResolve }: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!options) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onResolve(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
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
  }, [onResolve, options])

  if (!options) return null
  const tone = options.tone || 'warning'
  const Icon = tone === 'danger' ? AlertTriangle : tone === 'info' ? ShieldCheck : Sparkles

  return <div className="modal-backdrop confirmation-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onResolve(false)}>
    <section ref={dialogRef} className={`confirmation-dialog ${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" tabIndex={-1}>
      <button className="confirmation-close" type="button" title="关闭" aria-label="取消并关闭确认窗口" onClick={() => onResolve(false)}><X size={18} /></button>
      <div className="confirmation-symbol" aria-hidden="true"><Icon size={25} /></div>
      <div className="confirmation-copy">
        <p className="eyebrow">请确认这一步</p>
        <h2 id="confirmation-title">{options.title}</h2>
        <p id="confirmation-message" className="confirmation-message">{options.message}</p>
        {options.detail && <p className="confirmation-detail">{options.detail}</p>}
      </div>
      <footer className="confirmation-actions">
        <button className="button secondary" type="button" data-dialog-autofocus onClick={() => onResolve(false)}>{options.cancelLabel || '先不操作'}</button>
        <button className={`button ${tone === 'danger' ? 'danger' : 'primary'}`} type="button" onClick={() => onResolve(true)}>{options.confirmLabel}</button>
      </footer>
    </section>
  </div>
}
