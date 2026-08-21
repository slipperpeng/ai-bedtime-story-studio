import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { buildStandaloneHtml, safeFileName } from '../src/main/services/html-exporter'
import type { StoryProject } from '../src/shared/contracts'

function fixture(chapterCount = 2): StoryProject {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    title: '晚安 <script>alert(1)</script>',
    childName: '小禾 & 小雨',
    childAge: 6,
    theme: '星空',
    tone: '温柔',
    sourceMode: 'ai',
    sourceText: 'private draft that must not be published',
    chapterCount,
    chapterCharMin: 120,
    chapterCharMax: 180,
    illustrationStyle: 'moonlight-watercolor',
    storyProvider: 'demo',
    storyModel: 'local-demo',
    imageModel: 'local-demo',
    voiceProfileId: '00000000-0000-4000-8000-000000000011',
    backgroundMusicEnabled: false,
    summary: 'summary',
    styleBible: {
      visualStyle: 'style', palette: 'palette', characterDescriptions: ['character'], negativePrompt: 'negative',
    },
    chapters: Array.from({ length: chapterCount }, (_, chapterIndex) => chapterIndex + 1).map((index) => ({
      id: `00000000-0000-4000-8000-00000000001${index + 1}`,
      index,
      title: `章节 ${index} "<童话>"`,
      text: `这是第 ${index} 章。`,
      imagePrompt: 'private generation prompt',
      imageAlt: `第 ${index} 章插图`,
      imageAsset: `projects/00000000-0000-4000-8000-000000000010/images/${index}.png`,
      audioAsset: `projects/00000000-0000-4000-8000-000000000010/audio/${index}.wav`,
    })),
    status: 'ready',
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  }
}

describe('standalone HTML exporter', () => {
  it('builds a self-contained, escaped picture book with a cover, chapter spreads, and back cover', async () => {
    const html = await buildStandaloneHtml(fixture(), async (asset) => Buffer.from(asset.endsWith('.png') ? 'png' : 'wav'))
    const script = extractPlayerScript(html)
    const scriptHash = createHash('sha256').update(script).digest('base64')

    expect(html.match(/data:image\/png;base64/g)).toHaveLength(2)
    expect(html.match(/data:audio\/wav;base64/g)).toHaveLength(2)
    expect(html.match(/<article class="page/g)).toHaveLength(4)
    expect(html).not.toContain('data-page-dot')
    expect(html).not.toContain('class="page-dots"')
    expect(html).toContain('class="page cover-page"')
    expect(html).toContain('class="cover-art" data-cover-art')
    expect(html).toContain('class="page chapter-page"')
    expect(html).toContain('class="page back-page"')
    expect(html).toContain('maximum-scale=1,user-scalable=no')
    expect(html).toContain("document.addEventListener('gesturestart'")
    expect(html).toContain('event.touches.length > 1')
    expect(html).toContain("book.addEventListener('touchstart'")
    expect(html).not.toContain("event.ctrlKey &&")
    expect(html).toContain('class="audio-dock" data-audio-dock')
    expect(html).toContain('data-audio-toggle type="button"')
    expect(html).toContain('data-narration-volume-tool')
    expect(html).toContain('data-popover-toggle="voice-volume"')
    expect(html).toContain('data-narration-volume type="range"')
    expect(html).toContain('data-speed-value="0.8"')
    expect(html).toContain('<strong>0.8×</strong><span>慢速</span>')
    expect(html).toContain('<strong>0.9×</strong><span>睡前</span>')
    expect(html).toContain('@media(max-width:360px){.counter{display:block;')
    expect(html).toContain('min-width:84px;max-width:104px')
    expect(html).not.toContain('text-overflow:ellipsis')
    expect(html).not.toContain('<audio controls')
    expect(html).toContain('晚安 &lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('章节 1 &quot;&lt;童话&gt;&quot;')
    expect(html).not.toContain('private draft')
    expect(html).not.toContain('private generation prompt')
    expect(html).not.toContain('00000000-0000-4000-8000-000000000011')
    expect(html).toContain(`script-src 'sha256-${scriptHash}'`)
    expect(html).not.toContain('关于这本绘本')
    expect(html).not.toContain('分享文件不包含 API 密钥、创作草稿或原始声音样本')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toMatch(/(?:src|href)="https?:/)
    expect(html).not.toContain('使用方向键或左右滑动翻页')
  })

  it('uses the picture-book palette, responsive spreads, scrollable prose, and reduced-motion fallback', async () => {
    const html = await buildStandaloneHtml(fixture(), async (asset) => Buffer.from(asset.endsWith('.png') ? 'png' : 'wav'))

    for (const color of ['#184A4B', '#3C8D72', '#86BBD0', '#FFF9ED']) {
      expect(html).toContain(color)
    }
    expect(html).toContain('grid-template-columns:minmax(0,1fr) minmax(0,1fr)')
    expect(html).toContain('.shell{width:100%;min-width:0;')
    expect(html).toContain('grid-template-columns:minmax(0,1fr);grid-template-rows:')
    expect(html).toContain('.reader-controls{min-width:0;')
    expect(html).not.toContain('.page-dot')
    expect(html).not.toContain("querySelectorAll('[data-page-dot]')")
    expect(html).toContain('@media(max-width:899px)')
    expect(html).toContain('.edge-turn{display:none!important}')
    expect(html).toContain('grid-template-columns:1fr;grid-template-rows:')
    expect(html).toContain('object-fit:contain')
    expect(html).toContain('position:fixed')
    expect(html).toContain('(orientation:landscape) and (max-height:600px)')
    expect(html).toContain('.back-page{padding:12px 8%;border-width:8px;overflow:auto}')
    expect(html).toContain('@media(prefers-reduced-motion:reduce)')
    expect(html).toContain('animation:page-turn-forward 620ms')
    expect(html).toContain('rotateY(-78deg)')
    expect(html).toContain('animation:page-paper-shade 620ms')
    expect(html).toContain('class="story-scroll" data-scroll tabindex="0"')
    expect(html).toContain('overflow:auto')
    expect(html).toContain('min-width:48px;min-height:48px')
    expect(html).toContain('min-width:44px;min-height:44px')
  })

  it('refuses to export a story when any page lacks audio', async () => {
    const project = fixture()
    delete project.chapters[1].audioAsset
    await expect(buildStandaloneHtml(project, async () => Buffer.from('asset'))).rejects.toThrow('缺少插图或音频')
  })

  it('embeds selected background music and provides music playback controls', async () => {
    const project = fixture()
    project.backgroundMusicEnabled = true
    project.backgroundMusicTrackId = 'moonlight-lullaby'
    project.backgroundMusicAsset = `projects/${project.id}/music/moonlight-lullaby.mp3`
    project.backgroundMusicPrompt = '月光摇篮'
    project.backgroundMusicModel = 'builtin-library-v1'
    const html = await buildStandaloneHtml(project, async (asset) => Buffer.from(asset.endsWith('.mp3') ? 'ID3music' : asset.endsWith('.png') ? 'png' : 'wav'))

    expect(html).toContain('data:audio/mpeg;base64,')
    expect(html).toContain('data-background-music loop preload="auto"')
    expect(html).toContain('<button class="dock-button music-button" data-background-toggle')
    expect(html).toContain('data-popover-toggle="music-volume"')
    expect(html).toContain('data-background-volume type="range"')
    expect(html).toContain('media-src data: blob:')
    expect(html).toContain('window.URL.createObjectURL')
    expect(html).toContain('audioContext.createMediaElementSource(backgroundMusic)')
    expect(html).not.toContain('createMediaElementSource(audio)')
    expect(html).toContain('const duckFactor = 0.22')
    expect(html).toContain('const safeOutputGain = 0.85')
    expect(html).toContain('linearRampToValueAtTime(value, now + 0.06)')
    expect(html).toContain("event.target.closest('[data-background-toggle]')")
    expect(html).toContain("document.addEventListener('touchstart', beginAudioAfterInteraction, true)")
    expect(html).not.toContain('月光摇篮')
    expect(html).not.toContain('builtin-library-v1')
  })

  it('exports voice-only HTML when a legacy project selected music but has no music asset', async () => {
    const project = fixture()
    project.backgroundMusicEnabled = true
    await expect(buildStandaloneHtml(project, async () => Buffer.from('asset'))).resolves.toContain('data-narration')
  })

  it('creates Windows-safe output names', () => {
    expect(safeFileName('CON')).toBe('_CON')
    expect(safeFileName('月亮故事... ')).toBe('月亮故事')
    expect(safeFileName('  ')).toBe('睡前故事')
  })

  it('pauses the previous narration on page changes and leaves audio keyboard controls alone', async () => {
    const player = await createPlayerHarness()

    expect(player.counter.textContent).toBe('封面 · 1 / 5')
    expect(player.pages.map((page) => page.hidden)).toEqual([false, true, true, true, true])
    expect(player.coverArt.attributes.get('src')).toBe('data:image/png;base64,cG5n')

    player.next.emit('click')
    expect(player.counter.textContent).toBe('第 1 章 · 2 / 5')

    player.audios[0].currentTime = 12.5
    player.next.emit('click')
    expect(player.audios[0].pauseCalls).toBe(1)
    expect(player.audios[0].currentTime).toBe(0)
    expect(player.counter.textContent).toBe('第 2 章 · 3 / 5')

    let prevented = false
    player.document.emit('keydown', {
      key: 'ArrowRight',
      target: player.audios[1],
      preventDefault: () => { prevented = true },
    })
    expect(player.counter.textContent).toBe('第 2 章 · 3 / 5')
    expect(prevented).toBe(false)

    player.document.emit('keydown', {
      key: 'ArrowRight',
      target: new FakeTarget('BODY'),
      preventDefault: () => { prevented = true },
    })
    expect(player.audios[1].pauseCalls).toBe(1)
    expect(player.counter.textContent).toBe('第 3 章 · 4 / 5')
    expect(prevented).toBe(true)
    expect(player.pages[3].focusCalls).toBe(1)
  })

  it('plays chapters continuously from the cover and lands on the back cover when narration ends', async () => {
    const player = await createPlayerHarness()

    player.continuous.emit('click')
    expect(player.continuous.attributes.get('aria-pressed')).toBe('true')
    expect(player.counter.textContent).toBe('第 1 章 · 2 / 5')
    expect(player.audios[0].playCalls).toBe(1)

    player.next.emit('click')
    expect(player.audios[0].pauseCalls).toBe(1)
    expect(player.audios[1].playCalls).toBe(1)

    player.audios[0].emit('ended')
    expect(player.counter.textContent).toBe('第 2 章 · 3 / 5')
    expect(player.audios[1].playCalls).toBe(1)

    player.audios[1].emit('ended')
    expect(player.counter.textContent).toBe('第 3 章 · 4 / 5')
    expect(player.audios[2].playCalls).toBe(1)

    player.audios[2].emit('ended')
    expect(player.counter.textContent).toBe('封底 · 5 / 5')
    expect(player.continuous.attributes.get('aria-pressed')).toBe('false')
    expect(player.continuous.innerHTML).toContain('<svg')
  })

  it('uses one compact play button and applies one speed choice across every chapter', async () => {
    const player = await createPlayerHarness()

    player.next.emit('click')
    player.audioToggle.emit('click')
    expect(player.audios[0].playCalls).toBe(1)
    expect(player.audioToggle.innerHTML).toContain('<svg')
    expect(player.audioToggle.attributes.get('aria-pressed')).toBe('true')

    player.speedControls[0].emit('click')
    expect(player.audios.map((audio) => audio.playbackRate)).toEqual([0.8, 0.8, 0.8])
    expect(player.speedControls.map((control) => control.attributes.get('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    expect(player.playbackRateLabels.map((label) => label.textContent)).toEqual(['0.8×', '0.8×'])

    player.audioToggle.emit('click')
    expect(player.audios[0].pauseCalls).toBe(1)
    expect(player.audioToggle.innerHTML).toContain('<svg')
  })

  it('keeps narration native while controlling only background music through Web Audio', async () => {
    const player = await createPlayerHarness({ backgroundMusic: true, webAudio: true })

    player.document.emit('pointerdown', { target: player.book })
    expect(player.audioContexts).toHaveLength(1)
    expect(player.backgroundAudio?.playCalls).toBe(1)

    player.next.emit('click')
    player.audioToggle.emit('click')
    const [backgroundGain] = player.audioContexts[0].gains
    expect(player.audioContexts[0].gains).toHaveLength(1)
    expect(player.audios[0].volume).toBe(1)
    expect(backgroundGain.gain.targets.at(-1)).toBeCloseTo(0.18 * 0.22 * 0.85)

    player.narrationVolumeControl.value = '70'
    player.narrationVolumeControl.emit('input')
    expect(player.audios.every((audio) => audio.volume === 0.7)).toBe(true)

    if (player.backgroundVolumeControl) player.backgroundVolumeControl.value = '30'
    player.backgroundVolumeControl?.emit('input')
    expect(backgroundGain.gain.targets.at(-1)).toBeCloseTo(0.3 * 0.22 * 0.85)

    player.backgroundToggle?.emit('click')
    expect(backgroundGain.gain.targets.at(-1)).toBe(0)
    expect(player.backgroundAudio?.pauseCalls).toBe(0)
  })

  it('hides the narration volume tool on iPhone and iPadOS and uses native device volume', async () => {
    for (const device of ['iphone', 'ipad'] as const) {
      const player = await createPlayerHarness({ iosDevice: device })

      expect(player.narrationVolumeTool.hidden).toBe(true)
      expect(player.audios.every((audio) => audio.volume === 1)).toBe(true)
    }
  })

  it('does not start then immediately pause music when its switch is the first iPhone interaction', async () => {
    const player = await createPlayerHarness({ backgroundMusic: true, webAudio: true })

    player.document.emit('pointerdown', { target: player.backgroundToggle })
    expect(player.backgroundAudio?.playCalls).toBe(0)

    player.backgroundToggle?.emit('click')
    expect(player.backgroundAudio?.playCalls).toBe(0)
    expect(player.backgroundAudio?.pauseCalls).toBe(0)

    player.backgroundToggle?.emit('click')
    expect(player.backgroundAudio?.playCalls).toBe(1)
  })

  it('starts exported stories at the original playback speed', async () => {
    const html = await buildStandaloneHtml(fixture(), async (asset) => Buffer.from(asset.endsWith('.png') ? 'png' : 'wav'))
    const script = extractPlayerScript(html)

    expect(script).toContain('let playbackRate = 1;')
    expect(script).toContain("[0.8, 0.9, 1, 1.2].includes(rate)")
    expect(html.match(/data-speed-value="1"/g)).toHaveLength(1)
    expect(html.match(/data-playback-rate-label(?: aria-hidden|>)/g)).toHaveLength(2)
    expect(script).toContain("label.textContent = playbackRate.toFixed(1) + '×'")
  })

  it('locks repeated navigation until the 620ms page turn finishes', async () => {
    const player = await createPlayerHarness({ reducedMotion: false })

    player.next.emit('click')
    player.next.emit('click')

    expect(player.counter.textContent).toBe('封面 · 1 / 5')
    expect(player.next.disabled).toBe(true)
    expect(player.book.attributes.get('aria-busy')).toBe('true')
    expect(player.pages.map((page) => page.hidden)).toEqual([false, false, true, true, true])
    expect(player.pages[0].classList.contains('is-leaving-forward')).toBe(true)
    expect(player.pages[1].classList.contains('is-entering-forward')).toBe(true)
    expect(player.clock.durations).toEqual([620])

    player.clock.flushNext()
    expect(player.counter.textContent).toBe('第 1 章 · 2 / 5')
    expect(player.book.attributes.get('aria-busy')).toBe('false')
    expect(player.pages[0].classList.contains('is-leaving-forward')).toBe(false)
    expect(player.pages[1].classList.contains('is-entering-forward')).toBe(false)

    player.next.emit('click')
    player.clock.flushNext()
    expect(player.counter.textContent).toBe('第 2 章 · 3 / 5')
  })

  it('changes pages immediately when reduced motion is requested', async () => {
    const player = await createPlayerHarness({ reducedMotion: true })

    player.next.emit('click')

    expect(player.clock.durations).toEqual([])
    expect(player.counter.textContent).toBe('第 1 章 · 2 / 5')
    expect(player.pages.map((page) => page.hidden)).toEqual([true, false, true, true, true])
    expect(player.book.attributes.get('aria-busy')).toBe('false')
  })

  it('supports swipe gestures plus Home and End keyboard navigation', async () => {
    const player = await createPlayerHarness()

    player.book.emit('touchstart', { touches: [{ clientX: 260, clientY: 120 }], target: player.pages[0] })
    player.book.emit('touchend', { changedTouches: [{ clientX: 150, clientY: 126 }], target: player.pages[0] })
    expect(player.counter.textContent).toBe('第 1 章 · 2 / 5')

    player.book.emit('touchstart', { touches: [{ clientX: 160, clientY: 120 }], target: player.pages[1] })
    player.book.emit('touchend', { changedTouches: [{ clientX: 270, clientY: 124 }], target: player.pages[1] })
    expect(player.counter.textContent).toBe('封面 · 1 / 5')

    player.document.emit('keydown', {
      key: 'End', target: new FakeTarget('BODY'), preventDefault: () => undefined,
    })
    expect(player.counter.textContent).toBe('封底 · 5 / 5')

    player.document.emit('keydown', {
      key: 'Home', target: new FakeTarget('BODY'), preventDefault: () => undefined,
    })
    expect(player.counter.textContent).toBe('封面 · 1 / 5')
  })
})

type Listener = (event: Record<string, any>) => void

class FakeClassList {
  private readonly values = new Set<string>()

  add(...tokens: string[]): void {
    tokens.forEach((token) => this.values.add(token))
  }

  remove(...tokens: string[]): void {
    tokens.forEach((token) => this.values.delete(token))
  }

  contains(token: string): boolean {
    return this.values.has(token)
  }
}

class FakeTarget {
  readonly attributes = new Map<string, string>()
  innerHTML = ''
  readonly classList = new FakeClassList()
  private readonly listeners = new Map<string, Listener[]>()
  textContent = ''
  disabled = false
  hidden = false
  value = ''

  constructor(readonly tagName = 'BUTTON') {}

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener])
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((candidate) => candidate !== listener))
  }

  emit(type: string, event: Record<string, any> = {}): void {
    this.listeners.get(type)?.forEach((listener) => listener({ target: this, ...event }))
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  closest(selector: string): FakeTarget | null {
    if (selector === '[data-background-toggle]' && this.attributes.has('data-background-toggle')) return this
    const tags = selector.split(',').map((tag) => tag.trim().toUpperCase())
    return tags.includes(this.tagName) ? this : null
  }
}

class FakeAudio extends FakeTarget {
  playCalls = 0
  pauseCalls = 0
  paused = true
  playbackRate = 1
  currentTime = 0
  volume = 1

  constructor() {
    super('AUDIO')
  }

  play(): Promise<void> {
    this.playCalls += 1
    this.paused = false
    this.emit('play')
    return Promise.resolve()
  }

  pause(): void {
    this.pauseCalls += 1
    this.paused = true
    this.emit('pause')
  }

  load(): void {}
}

class FakePage extends FakeTarget {
  hidden = true
  focusCalls = 0
  readonly scrollRegion = { scrollTop: 99 }

  constructor(label: string, readonly audio?: FakeAudio) {
    super('ARTICLE')
    this.setAttribute('data-label', label)
  }

  querySelector(selector: string): FakeAudio | { scrollTop: number } | null {
    if (selector === 'audio') return this.audio ?? null
    if (selector === '[data-scroll]' && this.audio) return this.scrollRegion
    return null
  }

  focus(): void {
    this.focusCalls += 1
  }
}

class FakeClock {
  readonly durations: number[] = []
  private readonly callbacks: Array<() => void> = []

  setTimeout = (callback: () => void, duration: number): number => {
    this.callbacks.push(callback)
    this.durations.push(duration)
    return this.callbacks.length
  }

  clearTimeout = (): void => undefined

  flushNext(): void {
    const callback = this.callbacks.shift()
    if (!callback) throw new Error('No pending navigation timer.')
    callback()
  }
}

class FakeAudioParam {
  readonly targets: number[] = []
  value = 1

  cancelScheduledValues(): void {}

  cancelAndHoldAtTime(): void {}

  setValueAtTime(value: number): void {
    this.value = value
  }

  linearRampToValueAtTime(value: number): void {
    this.value = value
    this.targets.push(value)
  }
}

class FakeGain {
  readonly gain = new FakeAudioParam()

  connect(): void {}
}

class FakeAudioContext {
  readonly gains: FakeGain[] = []
  readonly destination = {}
  currentTime = 0
  state = 'suspended'

  createGain(): FakeGain {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain
  }

  createMediaElementSource(): { connect(): void } {
    return { connect: () => undefined }
  }

  resume(): Promise<void> {
    this.state = 'running'
    return Promise.resolve()
  }
}

function extractPlayerScript(html: string): string {
  const script = html.match(/<script>([\s\S]*?)<\/script><\/body>/)?.[1]
  if (!script) throw new Error('Standalone player script was not found.')
  return script
}

async function createPlayerHarness(options: {
  reducedMotion?: boolean
  backgroundMusic?: boolean
  webAudio?: boolean
  iosDevice?: 'iphone' | 'ipad'
} = {}) {
  const project = fixture(3)
  if (options.backgroundMusic) {
    project.backgroundMusicEnabled = true
    project.backgroundMusicAsset = `projects/${project.id}/music/background.mp3`
  }
  const html = await buildStandaloneHtml(project, async (asset) => Buffer.from(asset.endsWith('.mp3') ? 'ID3music' : asset.endsWith('.png') ? 'png' : 'wav'))
  const script = extractPlayerScript(html)
  const audios = Array.from({ length: 3 }, () => new FakeAudio())
  const pages = [
    new FakePage('封面'),
    ...audios.map((audio, index) => new FakePage(`第 ${index + 1} 章`, audio)),
    new FakePage('封底'),
  ]
  const prev = new FakeTarget()
  const next = new FakeTarget()
  const continuous = new FakeTarget()
  const counter = new FakeTarget('SPAN')
  const book = new FakeTarget('DIV')
  const audioToggle = new FakeTarget()
  const speedControls = [0.8, 0.9, 1, 1.2].map((value) => {
    const control = new FakeTarget()
    control.setAttribute('data-speed-value', String(value))
    return control
  })
  const playbackRateLabels = [new FakeTarget('SPAN'), new FakeTarget('OUTPUT')]
  const narrationVolumeControl = new FakeTarget('INPUT')
  narrationVolumeControl.value = '100'
  const narrationVolumeOutput = new FakeTarget('OUTPUT')
  const narrationVolumeTool = new FakeTarget('DIV')
  const backgroundAudio = options.backgroundMusic ? new FakeAudio() : undefined
  const backgroundToggle = options.backgroundMusic ? new FakeTarget() : undefined
  if (backgroundToggle) backgroundToggle.setAttribute('data-background-toggle', '')
  const backgroundVolumeControl = options.backgroundMusic ? new FakeTarget('INPUT') : undefined
  if (backgroundVolumeControl) backgroundVolumeControl.value = '18'
  const backgroundVolumeOutput = options.backgroundMusic ? new FakeTarget('OUTPUT') : undefined
  const popoverToggles = ['voice-volume', 'speed', ...(options.backgroundMusic ? ['music-volume'] : [])].map((name) => {
    const toggle = new FakeTarget()
    toggle.setAttribute('data-popover-toggle', name)
    toggle.setAttribute('aria-expanded', 'false')
    return toggle
  })
  const popovers = popoverToggles.map((toggle) => {
    const popover = new FakeTarget('DIV')
    popover.setAttribute('data-popover', toggle.getAttribute('data-popover-toggle') || '')
    popover.hidden = true
    return popover
  })
  const voiceVolumeToggle = popoverToggles[0]
  const coverArt = new FakeTarget('IMG')
  const firstIllustration = new FakeTarget('IMG')
  firstIllustration.setAttribute('src', 'data:image/png;base64,cG5n')
  const document = new FakeTarget('DOCUMENT') as FakeTarget & {
    querySelectorAll(selector: string): FakeTarget[]
    querySelector(selector: string): FakeTarget | undefined
  }
  document.querySelectorAll = (selector) => {
    if (selector === '[data-page]') return pages
    if (selector === '[data-speed-value]') return speedControls
    if (selector === '[data-playback-rate-label]') return playbackRateLabels
    if (selector === '[data-popover-toggle]') return popoverToggles
    if (selector === '[data-popover]') return popovers
    return []
  }
  document.querySelector = (selector) => ({
    '[data-book]': book,
    '[data-counter]': counter,
    '[data-prev]': prev,
    '[data-next]': next,
    '[data-continuous]': continuous,
    '[data-audio-toggle]': audioToggle,
    '[data-narration-volume]': narrationVolumeControl,
    '[data-narration-volume-output]': narrationVolumeOutput,
    '[data-narration-volume-tool]': narrationVolumeTool,
    '[data-popover-toggle="voice-volume"]': voiceVolumeToggle,
    '[data-background-music]': backgroundAudio,
    '[data-background-toggle]': backgroundToggle,
    '[data-background-volume]': backgroundVolumeControl,
    '[data-background-volume-output]': backgroundVolumeOutput,
    '[data-cover-art]': coverArt,
    '.chapter-page img': firstIllustration,
  })[selector]
  const clock = new FakeClock()
  const reducedMotion = options.reducedMotion ?? true
  const audioContexts: FakeAudioContext[] = []
  const window: Record<string, any> = {
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    addEventListener: () => undefined,
  }
  if (options.webAudio) {
    window.AudioContext = class extends FakeAudioContext {
      constructor() {
        super()
        audioContexts.push(this)
      }
    }
  }
  const navigator = options.iosDevice === 'iphone'
    ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }
    : options.iosDevice === 'ipad'
      ? { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }
      : { userAgent: 'test', platform: 'Win32', maxTouchPoints: 0 }

  runInNewContext(script, { document, window, navigator })
  return {
    audios, pages, prev, next, continuous, counter, book, audioToggle, speedControls, playbackRateLabels,
    narrationVolumeControl, narrationVolumeOutput, narrationVolumeTool, voiceVolumeToggle,
    backgroundAudio, backgroundToggle, backgroundVolumeControl, coverArt, document, clock, audioContexts,
  }
}
