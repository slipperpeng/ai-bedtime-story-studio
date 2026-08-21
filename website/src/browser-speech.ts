export interface BrowserSpeechOptions {
  lang: string
  rate: number
  pitch: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (event: SpeechSynthesisErrorEvent) => void
}

/**
 * Defensive wrapper around SpeechSynthesis. Chromium can leave a cancelled
 * utterance queued, so each request gets a generation token and a short delay
 * before speak() to avoid clipped or duplicated first words.
 */
export class BrowserSpeechPlayback {
  private generation = 0
  private startTimer: number | undefined

  speak(text: string, options: BrowserSpeechOptions): boolean {
    this.cancel()
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      return false
    }

    const synthesis = window.speechSynthesis
    const generation = this.generation
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = options.lang
    utterance.rate = options.rate
    utterance.pitch = options.pitch
    const voice = this.pickVoice(synthesis.getVoices(), options.lang)
    if (voice) utterance.voice = voice

    utterance.onstart = () => {
      if (generation === this.generation) options.onStart?.()
    }
    utterance.onend = () => {
      if (generation === this.generation) options.onEnd?.()
    }
    utterance.onerror = (event) => {
      if (generation === this.generation && event.error !== 'canceled' && event.error !== 'interrupted') {
        options.onError?.(event)
      }
    }

    // Give Chromium time to flush a cancelled utterance before queueing the new one.
    this.startTimer = window.setTimeout(() => {
      this.startTimer = undefined
      if (generation === this.generation) synthesis.speak(utterance)
    }, 45)
    return true
  }

  cancel(): void {
    this.generation += 1
    if (this.startTimer !== undefined) {
      window.clearTimeout(this.startTimer)
      this.startTimer = undefined
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  private pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
    const language = lang.toLowerCase()
    const chineseVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('zh'))
    if (!chineseVoices.length) return undefined

    const preferredNames = ['xiaoxiao', 'xiaoyi', 'tingting', 'yaoyao', 'huihui', 'hanhan', 'meijia']
    return chineseVoices.find((voice) => {
      const name = voice.name.toLowerCase()
      return preferredNames.some((preferred) => name.includes(preferred))
    })
      ?? chineseVoices.find((voice) => voice.lang.toLowerCase().startsWith(language))
      ?? chineseVoices[0]
  }
}
