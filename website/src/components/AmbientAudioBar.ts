/* ==========================================================================
   悬浮全局晚安轻音乐控制器 (Ambient Bedtime Audio Bar Component - Autoplay)
   ========================================================================== */

export class AmbientAudioBar {
  private isPlaying = false
  private audio: HTMLAudioElement
  private capsuleEl: HTMLElement | null = null
  private userInteracted = false

  constructor() {
    this.audio = new Audio('./audio/music/forest-goodnight.mp3')
    this.audio.loop = true
    this.audio.volume = 0.32
    this.audio.preload = 'auto'

    this.capsuleEl = document.getElementById('ambient-audio-capsule')
    this.bindEvents()
    this.initAutoplay()
  }

  private bindEvents() {
    const playBtn = document.getElementById('ambient-play-toggle-btn')
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.toggle()
      })
    }

    if (this.capsuleEl) {
      this.capsuleEl.addEventListener('click', () => {
        this.toggle()
      })
    }

    // 监听原生音频事件
    this.audio.addEventListener('play', () => {
      this.isPlaying = true
      this.updateUi()
    })

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false
      this.updateUi()
    })
  }

  private initAutoplay() {
    // 1. 尝试直接自动起播
    const startPlay = () => {
      this.audio.play().then(() => {
        this.isPlaying = true
        this.updateUi()
      }).catch(() => {
        // 2. 浏览器受策略拦截时，绑定首次任意用户交互（点击、滚动、触摸、按键）即刻无缝起播
        const triggerOnFirstInteraction = () => {
          if (this.userInteracted) return
          this.userInteracted = true

          this.audio.play().then(() => {
            this.isPlaying = true
            this.updateUi()
          }).catch(() => {})

          window.removeEventListener('pointerdown', triggerOnFirstInteraction)
          window.removeEventListener('keydown', triggerOnFirstInteraction)
          window.removeEventListener('scroll', triggerOnFirstInteraction)
          window.removeEventListener('touchstart', triggerOnFirstInteraction)
        }

        window.addEventListener('pointerdown', triggerOnFirstInteraction, { once: true })
        window.addEventListener('keydown', triggerOnFirstInteraction, { once: true })
        window.addEventListener('scroll', triggerOnFirstInteraction, { once: true })
        window.addEventListener('touchstart', triggerOnFirstInteraction, { once: true })
      })
    }

    // 延迟 200ms 等待 DOM 与渲染稳定后自动起播
    setTimeout(startPlay, 200)
  }

  public toggle() {
    if (this.audio.paused) {
      this.audio.play().then(() => {
        this.isPlaying = true
        this.updateUi()
      }).catch(() => {})
    } else {
      this.audio.pause()
      this.isPlaying = false
      this.updateUi()
    }
  }

  public pause() {
    this.audio.pause()
    this.isPlaying = false
    this.updateUi()
  }

  private updateUi() {
    if (this.capsuleEl) {
      this.capsuleEl.classList.toggle('playing', this.isPlaying)
    }
    const btn = document.getElementById('ambient-play-toggle-btn')
    if (btn) {
      btn.innerHTML = this.isPlaying ? '❚❚' : '▶'
      btn.setAttribute('aria-label', this.isPlaying ? '暂停晚安背景音' : '播放晚安背景音')
    }
  }

  public destroy() {
    this.audio.pause()
    this.audio.src = ''
  }
}
