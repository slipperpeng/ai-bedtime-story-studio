/* ==========================================================================
   声线魔法馆展示体验台 (Voice Magic Studio Component)
   ========================================================================== */

import { getWebsiteLanguage, type WebsiteLanguage } from '../i18n'

export interface VoicePreset {
  id: string
  name: string
  type: string
  lang: string
  avatar: string
  quote: string
  tagline: string
  highlight: string
}

export const VOICES_DATA: VoicePreset[] = [
  {
    id: 'warm-girl',
    name: '温暖少女',
    type: '编辑推荐 #1',
    lang: '普通话',
    avatar: '🌸',
    quote: '“宝贝闭上眼睛，今晚月亮小船要带我们去一个很远很温柔的星星小岛哦……”',
    tagline: '温暖明亮、带自然微笑，最适合儿童童话朗读',
    highlight: '64 款精选音色 · 温暖纯净',
  },
  {
    id: 'gentle-sister',
    name: '温柔学姐',
    type: '编辑推荐 #2',
    lang: '普通话',
    avatar: '🌙',
    quote: '“森林里的小动物们都盖好了落叶被子，晚安小松鼠，晚安小刺猬……”',
    tagline: '温柔亲切，适合舒缓的日常晚安故事',
    highlight: '舒缓入眠 · 睡前最佳伴读',
  },
  {
    id: 'parent-clone',
    name: '妈妈的声音 (专属在线复刻)',
    type: '10秒专属克隆',
    lang: '自录音色',
    avatar: '💖',
    quote: '“无论妈妈今天走得多远，只要闭上眼睛，妈妈的抱抱就一直陪在宝贝枕边。”',
    tagline: '10秒自然录音在线复刻，保留独一无二的亲切与爱意',
    highlight: '10秒快速复刻 · 亲切爱意保留',
  },
  {
    id: 'cantonese-story',
    name: '粤语童话故事音',
    type: '方言特色',
    lang: '粤语',
    avatar: '🍵',
    quote: '“今晚月光光，照地堂，等我哋一齐去睇下星空有咩神奇嘅秘密啦……”',
    tagline: '地道温和粤语，6大粤语音色随心选择',
    highlight: '地道方言 · 6大粤语音色',
  },
]

export const ENGLISH_VOICES_DATA: VoicePreset[] = [
  {
    id: 'warm-english-lady',
    name: 'Warm English Lady',
    type: 'Editor pick #1',
    lang: 'English (US)',
    avatar: '🌸',
    quote: '“Close your eyes, little one. Tonight, our moonlit boat is sailing to a quiet island among the stars.”',
    tagline: 'Soft, clear, and naturally warm for bedtime fairy tales',
    highlight: 'English story voice · Warm and clear',
  },
  {
    id: 'gentle-english-woman',
    name: 'Gentle English Woman',
    type: 'Editor pick #2',
    lang: 'English (US)',
    avatar: '🌙',
    quote: '“The forest friends tucked themselves beneath their leafy blankets, while the moon watched over every little home.”',
    tagline: 'Quiet and soothing for slow, reassuring goodnight stories',
    highlight: 'Soothing rhythm · Made for winding down',
  },
  {
    id: 'friendly-english-man',
    name: 'Friendly English Man',
    type: 'Family reading',
    lang: 'English (US)',
    avatar: '✨',
    quote: '“We may be far from home, but one small lantern and one good friend can always help us find the way.”',
    tagline: 'Warm and reassuring for adventures shared with a parent',
    highlight: 'Friendly narration · Calm confidence',
  },
  {
    id: 'parent-clone-en',
    name: "A parent's voice (online clone)",
    type: '10-second voice clone',
    lang: 'Authorized recording',
    avatar: '💖',
    quote: '“Wherever I am tonight, close your eyes and remember that my hug is right here beside your pillow.”',
    tagline: 'Create a familiar voice from a short, explicitly authorized adult recording',
    highlight: 'Personal voice · Adult consent required',
  },
]

export class VoiceStudio {
  private readonly language: WebsiteLanguage
  private readonly voices: VoicePreset[]
  private currentVoiceIndex = 0
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private animationFrameId: number | null = null
  private phase = 0

  constructor() {
    this.language = getWebsiteLanguage()
    this.voices = this.language === 'en' ? ENGLISH_VOICES_DATA : VOICES_DATA
    this.canvas = document.getElementById('voice-wave-canvas') as HTMLCanvasElement
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d')
      this.resizeCanvas()
      window.addEventListener('resize', this.resizeCanvas)
    }

    this.selectVoice(0)
    this.bindEvents()
    this.startWaveAnimation()
  }

  private resizeCanvas = () => {
    if (!this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = rect.width || 400
    this.canvas.height = rect.height || 140
  }

  private renderVoiceList() {
    const listContainer = document.getElementById('voice-list-container')
    if (!listContainer) return

    listContainer.innerHTML = this.voices.map((v, i) => `
      <div class="voice-card-item ${i === this.currentVoiceIndex ? 'active' : ''}" data-voice-index="${i}">
        <div class="voice-info">
          <div class="voice-avatar">${v.avatar}</div>
          <div class="voice-meta">
            <strong>${v.name}</strong>
            <span>${v.lang} · ${v.type}</span>
          </div>
        </div>
        <div class="voice-select-badge">
          ${i === this.currentVoiceIndex
            ? `<span>${this.language === 'en' ? 'Selected' : '已选择'}</span>`
            : `<span>${this.language === 'en' ? 'View' : '查看'}</span>`}
        </div>
      </div>
    `).join('')
  }

  private bindEvents() {
    const listContainer = document.getElementById('voice-list-container')
    if (!listContainer) return

    listContainer.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest('.voice-card-item') as HTMLElement
      if (!card) return
      const idx = parseInt(card.dataset.voiceIndex || '0', 10)
      this.selectVoice(idx)
    })
  }

  private selectVoice(index: number) {
    this.currentVoiceIndex = index
    this.renderVoiceList()

    const voice = this.voices[index]
    const quoteEl = document.getElementById('voice-visualizer-quote')
    const tagEl = document.getElementById('voice-visualizer-tag')
    const nameEl = document.getElementById('voice-visualizer-name')
    const highlightEl = document.getElementById('voice-visualizer-highlight')

    if (quoteEl) quoteEl.textContent = voice.quote
    if (tagEl) tagEl.textContent = `${voice.lang} · ${voice.tagline}`
    if (nameEl) nameEl.textContent = voice.name
    if (highlightEl) highlightEl.textContent = voice.highlight
  }

  private startWaveAnimation = () => {
    if (!this.ctx || !this.canvas) return

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    const w = this.canvas.width
    const h = this.canvas.height
    const centerY = h / 2
    const amplitude = 15
    this.phase += 0.035

    // 绘制多层流动声波线条
    const layers = [
      { color: 'rgba(117, 198, 168, 0.75)', speed: 1.0, freq: 0.015, amp: 1.0 },
      { color: 'rgba(253, 224, 71, 0.6)', speed: 0.75, freq: 0.02, amp: 0.75 },
      { color: 'rgba(192, 132, 252, 0.45)', speed: 1.25, freq: 0.012, amp: 0.55 },
    ]

    for (const l of layers) {
      this.ctx.beginPath()
      this.ctx.strokeStyle = l.color
      this.ctx.lineWidth = 2.5

      for (let x = 0; x < w; x++) {
        const y = centerY + Math.sin(x * l.freq + this.phase * l.speed) * amplitude * l.amp * Math.sin((x / w) * Math.PI)
        if (x === 0) {
          this.ctx.moveTo(x, y)
        } else {
          this.ctx.lineTo(x, y)
        }
      }
      this.ctx.stroke()
    }

    this.animationFrameId = requestAnimationFrame(this.startWaveAnimation)
  }

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
    }
  }
}
