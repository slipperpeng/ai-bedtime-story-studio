/* ==========================================================================
   20首治愈轻音乐留声机组件 (Bedtime Music Vinyl Player Component)
   ========================================================================== */

export interface MusicTrack {
  id: string
  label: string
  mood: string
  description: string
  duration: string
  fileName: string
}

export const MUSIC_TRACKS_DATA: MusicTrack[] = [
  { id: 'moonlight-lullaby', label: '月光摇篮', mood: '温柔宁静', description: '月光、卧室与安稳入睡', duration: '3:01', fileName: 'moonlight-lullaby.mp3' },
  { id: 'twinkling-stars', label: '星星眨眼', mood: '梦幻明亮', description: '清澈星光与轻盈童话感', duration: '2:56', fileName: 'twinkling-stars.mp3' },
  { id: 'cloud-boat', label: '云朵小船', mood: '轻盈舒展', description: '在云海中缓慢漂流的奇遇', duration: '2:55', fileName: 'cloud-boat.mp3' },
  { id: 'forest-goodnight', label: '森林晚安', mood: '自然安心', description: '小动物回到树洞准备睡觉', duration: '2:59', fileName: 'forest-goodnight.mp3' },
  { id: 'firefly-garden', label: '萤火虫花园', mood: '童趣温暖', description: '夜晚花园里的微光与秘密', duration: '2:56', fileName: 'firefly-garden.mp3' },
  { id: 'rainy-cottage', label: '雨夜小屋', mood: '舒适治愈', description: '窗外细雨与屋内柔软灯光', duration: '2:55', fileName: 'rainy-cottage.mp3' },
  { id: 'fireside-story', label: '壁炉边的故事', mood: '亲密温暖', description: '家人围坐、分享与陪伴', duration: '2:55', fileName: 'fireside-story.mp3' },
  { id: 'ocean-embrace', label: '海浪抱抱', mood: '安静辽阔', description: '海边、沙滩与温柔潮汐', duration: '2:53', fileName: 'ocean-embrace.mp3' },
  { id: 'little-whale-dream', label: '小鲸鱼之梦', mood: '空灵深邃', description: '深蓝海底与梦幻鲸歌', duration: '2:54', fileName: 'little-whale-dream.mp3' },
  { id: 'meadow-breeze', label: '原野微风', mood: '清新舒缓', description: '青草香气与晚风轻拂', duration: '2:58', fileName: 'meadow-breeze.mp3' },
  { id: 'falling-snow', label: '落雪轻语', mood: '纯净安详', description: '窗外无声落雪与厚厚棉被', duration: '3:04', fileName: 'falling-snow.mp3' },
  { id: 'spring-flowers', label: '初春繁花', mood: '温暖生机', description: '嫩芽破土与甜甜花香', duration: '2:57', fileName: 'spring-flowers.mp3' },
  { id: 'bamboo-moonlight', label: '竹影月色', mood: '东方雅致', description: '清风竹林与皎洁明月', duration: '3:02', fileName: 'bamboo-moonlight.mp3' },
  { id: 'little-train-home', label: '回家小火车', mood: '轻快安心', description: '缓缓行驶的梦境列车', duration: '2:52', fileName: 'little-train-home.mp3' },
  { id: 'magic-library', label: '魔法藏书阁', mood: '奇幻静谧', description: '古老羊皮卷与闪光书页', duration: '3:00', fileName: 'magic-library.mp3' },
  { id: 'moon-walk', label: '漫步月球', mood: '太空好奇', description: '低重力漂浮与蓝色地球', duration: '2:55', fileName: 'moon-walk.mp3' },
  { id: 'rainbow-friends', label: '彩虹伙伴', mood: '纯真友谊', description: '七彩虹桥与伙伴欢笑', duration: '2:56', fileName: 'rainbow-friends.mp3' },
  { id: 'brave-lantern', label: '勇气小灯笼', mood: '微光守护', description: '黑夜里不灭的暖心明灯', duration: '2:58', fileName: 'brave-lantern.mp3' },
  { id: 'mothers-embrace', label: '妈妈的怀抱', mood: '深情依偎', description: '无条件的爱与安全港湾', duration: '3:05', fileName: 'mothers-embrace.mp3' },
  { id: 'sweet-dreamland', label: '甜甜梦境', mood: '香甜入眠', description: '糖果云朵与晚安告白', duration: '2:59', fileName: 'sweet-dreamland.mp3' },
]

export class MusicPlayer {
  private currentTrackIndex = 0
  private isDucking = false
  private audio: HTMLAudioElement

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'

    this.renderTrackList()
    this.bindEvents()
    this.loadTrack(0, false)
  }

  private renderTrackList() {
    const listContainer = document.getElementById('music-track-list')
    if (!listContainer) return

    const isPlaying = !this.audio.paused && !this.audio.ended

    listContainer.innerHTML = MUSIC_TRACKS_DATA.map((t, i) => {
      const isCurrent = i === this.currentTrackIndex
      return `
        <div class="track-item-row ${isCurrent ? 'active' : ''}" data-track-index="${i}">
          <div class="track-left">
            <span class="track-number">${isCurrent && isPlaying ? '🎵' : String(i + 1).padStart(2, '0')}</span>
            <div class="track-name-box">
              <strong>${t.label}</strong>
              <span>${t.description}</span>
            </div>
          </div>
          <span class="track-mood-tag">${t.mood}</span>
        </div>
      `
    }).join('')
  }

  private bindEvents() {
    // 监听曲目点击
    const listContainer = document.getElementById('music-track-list')
    if (listContainer) {
      listContainer.addEventListener('click', (e) => {
        const row = (e.target as HTMLElement).closest('.track-item-row') as HTMLElement
        if (!row) return
        const idx = parseInt(row.dataset.trackIndex || '0', 10)
        if (idx === this.currentTrackIndex) {
          this.togglePlay()
        } else {
          this.selectTrack(idx)
        }
      })
    }

    // 播放/暂停按钮
    const vinylBtn = document.getElementById('vinyl-play-btn')
    if (vinylBtn) {
      vinylBtn.addEventListener('click', () => {
        this.togglePlay()
      })
    }

    // 避让模式切换
    const duckingToggle = document.getElementById('ducking-demo-toggle') as HTMLInputElement
    if (duckingToggle) {
      duckingToggle.addEventListener('change', (e) => {
        this.isDucking = (e.target as HTMLInputElement).checked
        this.applyVolume()
      })
    }

    // 原生音频事件监听（确保界面与实际播放状态 100% 一致）
    this.audio.addEventListener('play', () => {
      this.updatePlayState(true)
    })

    this.audio.addEventListener('pause', () => {
      this.updatePlayState(false)
    })

    this.audio.addEventListener('ended', () => {
      this.nextTrack()
    })

    this.audio.addEventListener('error', (e) => {
      console.warn('Audio playback notice:', e)
      this.updatePlayState(false)
    })
  }

  public selectTrack(index: number) {
    this.currentTrackIndex = index
    this.loadTrack(index, true)
  }

  private loadTrack(index: number, autoPlay: boolean) {
    const track = MUSIC_TRACKS_DATA[index]
    const relativeUrl = `./audio/music/${track.fileName}`
    
    this.audio.src = relativeUrl
    this.applyVolume()

    const labelEl = document.getElementById('vinyl-current-title')
    const moodEl = document.getElementById('vinyl-current-mood')

    if (labelEl) labelEl.textContent = track.label
    if (moodEl) moodEl.textContent = track.mood

    if (autoPlay) {
      this.audio.play().catch((err) => {
        console.warn('Playback deferred:', err)
      })
    } else {
      this.updatePlayState(false)
    }
  }

  public togglePlay() {
    if (this.audio.paused) {
      this.audio.play().catch((err) => {
        console.warn('Play was prevented:', err)
      })
    } else {
      this.audio.pause()
    }
  }

  private updatePlayState(isPlaying: boolean) {
    const vinylDisc = document.getElementById('vinyl-disc-el')
    if (vinylDisc) {
      if (isPlaying) {
        vinylDisc.classList.add('playing')
      } else {
        vinylDisc.classList.remove('playing')
      }
    }

    const playBtn = document.getElementById('vinyl-play-btn')
    if (playBtn) {
      playBtn.innerHTML = isPlaying
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> <span>暂停播放</span>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg> <span>播放此曲目</span>`
      
      if (isPlaying) {
        playBtn.classList.add('btn-glow-gold')
      } else {
        playBtn.classList.remove('btn-glow-gold')
      }
    }

    this.renderTrackList()
  }

  private applyVolume() {
    // 朗读避让：音量平滑降低至 22%
    const targetVol = this.isDucking ? 0.22 : 0.85
    this.audio.volume = targetVol

    const duckStatusEl = document.getElementById('ducking-status-badge')
    if (duckStatusEl) {
      duckStatusEl.textContent = this.isDucking ? '朗读压低中 (22% 音量)' : '正常播放 (85% 音量)'
      duckStatusEl.style.color = this.isDucking ? '#f59e0b' : '#75c6a8'
    }
  }

  private nextTrack() {
    this.currentTrackIndex = (this.currentTrackIndex + 1) % MUSIC_TRACKS_DATA.length
    this.selectTrack(this.currentTrackIndex)
  }

  public destroy() {
    this.audio.pause()
    this.audio.src = ''
  }
}
