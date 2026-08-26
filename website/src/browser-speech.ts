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
  private voiceLoadTimer: number | undefined
  private voicesChangedHandler: (() => void) | undefined
  private activeUtterance: SpeechSynthesisUtterance | undefined
  private paused = false
  private readonly selectedVoiceUriByLanguage = new Map<string, string>()

  speak(text: string, options: BrowserSpeechOptions): boolean {
    this.cancel()
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      return false
    }

    const synthesis = window.speechSynthesis
    const generation = this.generation
    const start = () => {
      if (generation !== this.generation) return
      this.clearVoiceWait(synthesis)
      const utterance = new SpeechSynthesisUtterance(text)
      this.activeUtterance = utterance
      utterance.lang = options.lang
      utterance.rate = options.rate
      utterance.pitch = options.pitch
      const voice = this.pickVoice(synthesis.getVoices(), options.lang)
      if (voice) utterance.voice = voice

      utterance.onstart = () => {
        if (generation === this.generation) options.onStart?.()
      }
      utterance.onend = () => {
        if (generation !== this.generation) return
        this.activeUtterance = undefined
        this.paused = false
        options.onEnd?.()
      }
      utterance.onerror = (event) => {
        if (generation !== this.generation) return
        this.activeUtterance = undefined
        this.paused = false
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          options.onError?.(event)
        }
      }

      // Give Chromium time to flush a cancelled utterance before queueing the new one.
      this.startTimer = window.setTimeout(() => {
        this.startTimer = undefined
        if (generation !== this.generation) return
        synthesis.speak(utterance)
        if (this.paused) synthesis.pause()
      }, 45)
    }

    if (synthesis.getVoices().length) {
      start()
    } else {
      this.voicesChangedHandler = start
      synthesis.addEventListener('voiceschanged', start, { once: true })
      this.voiceLoadTimer = window.setTimeout(start, 300)
    }
    return true
  }

  pause(): boolean {
    if (!('speechSynthesis' in window) || (!this.activeUtterance && this.startTimer === undefined)) return false
    this.paused = true
    window.speechSynthesis.pause()
    return true
  }

  resume(): boolean {
    if (!('speechSynthesis' in window) || !this.activeUtterance || !this.paused) return false
    this.paused = false
    window.speechSynthesis.resume()
    return true
  }

  cancel(): void {
    this.generation += 1
    if (this.startTimer !== undefined) {
      window.clearTimeout(this.startTimer)
      this.startTimer = undefined
    }
    if ('speechSynthesis' in window) {
      this.clearVoiceWait(window.speechSynthesis)
      window.speechSynthesis.cancel()
    }
    this.activeUtterance = undefined
    this.paused = false
  }

  private pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
    const language = lang.toLowerCase()
    const languagePrefix = language.split('-')[0]
    const matchingVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith(languagePrefix))
    if (!matchingVoices.length) return undefined

    const cachedVoiceUri = this.selectedVoiceUriByLanguage.get(languagePrefix)
    const cachedVoice = matchingVoices.find((voice) => voice.voiceURI === cachedVoiceUri)
    if (cachedVoice) return cachedVoice

    const preferredNames = languagePrefix === 'zh'
      ? ['xiaoxiao', 'xiaoyi', 'tingting', 'yaoyao', 'huihui', 'hanhan', 'meijia']
      : ['aria', 'jenny', 'samantha', 'serena', 'ava', 'susan', 'female']
    const selected = matchingVoices.find((voice) => {
      const name = voice.name.toLowerCase()
      return preferredNames.some((preferred) => name.includes(preferred))
    })
      ?? matchingVoices.find((voice) => voice.lang.toLowerCase().startsWith(language))
      ?? matchingVoices[0]
    this.selectedVoiceUriByLanguage.set(languagePrefix, selected.voiceURI)
    return selected
  }

  private clearVoiceWait(synthesis: SpeechSynthesis): void {
    if (this.voiceLoadTimer !== undefined) {
      window.clearTimeout(this.voiceLoadTimer)
      this.voiceLoadTimer = undefined
    }
    if (this.voicesChangedHandler) {
      synthesis.removeEventListener('voiceschanged', this.voicesChangedHandler)
      this.voicesChangedHandler = undefined
    }
  }
}
