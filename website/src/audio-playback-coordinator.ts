export type AudioPlaybackSource = 'ambient' | 'music-library' | 'reader'

type ActivePlayback = {
  source: AudioPlaybackSource
  pause: () => void
}

class AudioPlaybackCoordinator {
  private active: ActivePlayback | undefined

  activate(source: AudioPlaybackSource, pause: () => void): void {
    if (this.active?.source === source) {
      this.active.pause = pause
      return
    }

    const previous = this.active
    this.active = { source, pause }
    previous?.pause()
  }

  release(source: AudioPlaybackSource): void {
    if (this.active?.source === source) this.active = undefined
  }
}

export const audioPlaybackCoordinator = new AudioPlaybackCoordinator()
