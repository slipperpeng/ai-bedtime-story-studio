import { Check, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import type { CompletionMoment } from '../lib/completion-moments'

interface StepCelebrationProps {
  moment: CompletionMoment
  onFinished(): void
}

const DISPLAY_MS = 2_800

export function StepCelebration({ moment, onFinished }: StepCelebrationProps) {
  useEffect(() => {
    const timer = window.setTimeout(onFinished, DISPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [moment.key, onFinished])

  return <div className="step-celebration" role="status" aria-live="polite" aria-atomic="true">
    <span className="celebration-icon" aria-hidden="true"><Check size={22} strokeWidth={3} /></span>
    <span className="celebration-copy"><strong>{moment.title}</strong><span>{moment.message}</span></span>
    <Sparkles className="celebration-sparkle" size={18} aria-hidden="true" />
  </div>
}
