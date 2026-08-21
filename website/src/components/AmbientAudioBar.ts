/* ==========================================================================
   悬浮全局晚安轻音乐控制器 (Ambient Bedtime Audio Bar Component)
   ========================================================================== */

import { audioPlaybackCoordinator } from '../audio-playback-coordinator'

export class AmbientAudioBar {
  private isPlaying = false
  private audio: HTMLAudioElement
  private capsuleEl: HTMLElement | null = null

  constructor() {
    this.audio = new Audio('./audio/music/forest-goodnight.mp3')
    this.audio.loop = true
    this.audio.volume = 0.32
    this.audio.preload = 'metadata'

    this.capsuleEl = document.getElementById('ambient-audio-capsule')
    this.bindEvents()
    this.updateUi()
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

    this.audio.addEventListener('play', () => {
      audioPlaybackCoordinator.activate('ambient', () => this.pause())
      this.isPlaying = true
      this.updateUi()
    })

    this.audio.addEventListener('pause', () => {
      audioPlaybackCoordinator.release('ambient')
      this.isPlaying = false
      this.updateUi()
    })

    this.audio.addEventListener('error', () => {
      audioPlaybackCoordinator.release('ambient')
      this.isPlaying = false
      this.updateUi()
    })
  }

  public toggle() {
    if (this.audio.paused) {
      audioPlaybackCoordinator.activate('ambient', () => this.pause())
      this.audio.play().catch(() => {
        audioPlaybackCoordinator.release('ambient')
        this.isPlaying = false
        this.updateUi()
      })
    } else {
      this.audio.pause()
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
    const status = document.querySelector<HTMLElement>('[data-ambient-status]')
    if (status) {
      status.textContent = this.isPlaying ? '背景音乐正在播放中' : '背景音乐已暂停'
    }
  }

  public destroy() {
    this.audio.pause()
    this.audio.src = ''
    audioPlaybackCoordinator.release('ambient')
  }
}
