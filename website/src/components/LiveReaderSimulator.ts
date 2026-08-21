/* ==========================================================================
   独立 HTML 绘本交互阅读模拟器 (Live Reader Simulator with 620ms Page Flip)
   采用真实作品《雨滴敲门的晚上》图文与音频
   ========================================================================== */

export interface StoryChapter {
  chapterIndex: number
  title: string
  body: string
  image: string
  audio: string
}

export const DEMO_STORY_PAGES: StoryChapter[] = [
  {
    chapterIndex: 1,
    title: '第一章 · 雨滴来敲门',
    body: '雨夜，小王抱着米白色毛绒兔子，靠在窗边听外面的歌。嗒嗒嗒，小雨滴轻轻敲起窗玻璃，好像在说，能让我们进来坐一坐吗？小王眨眨眼，伸出小手摸了摸窗。奶奶披着雾蓝色棉布长衫走过来，弯下腰轻声问：“听见了吗，小王？”小王点点头，嗯，它们好像有点不安。奶奶笑了笑，那我们一起开门吧。',
    image: '/story-demo/chapter-1.jpg',
    audio: '/story-demo/narration-1.wav',
  },
  {
    chapterIndex: 2,
    title: '第二章 · 每颗雨滴都有小情绪',
    body: '窗缝里飘进三颗小小的雨滴精灵。小小蓝抖了抖浅月光黄的小雨衣，细声说：“我怕打雷，怕得想躲起来。”嗯嗯抱着雨滴妈妈，眼角挂着一颗小泪珠：“我有点难过，今天的花被风刮倒了。”叮叮扑扇着翅膀转了一圈：“我只是一点点想家。”小王轻轻摸了摸兔子的耳朵，心里也觉得酸酸的。',
    image: '/story-demo/chapter-2.jpg',
    audio: '/story-demo/narration-2.wav',
  },
  {
    chapterIndex: 3,
    title: '第三章 · 一起想办法',
    body: '奶奶端来一盏月光黄的小灯，笑着坐到地毯上。她轻轻牵起小王的手：“吸气像闻花香，慢慢鼓起来；呼气像吹蒲公英，轻轻放掉。”小小的胸膛一起一落，雨滴精灵也跟着安静下来。奶奶又说，难过的时候，把它说出来。小王抱着兔子点点头：“我也曾在夜里想妈妈，可是说出来就好一点。”雨滴们眨眨眼睛，好像第一次听到这样做也管用。',
    image: '/story-demo/chapter-3.jpg',
    audio: '/story-demo/narration-3.wav',
  },
  {
    chapterIndex: 4,
    title: '第四章 · 晚安，雨滴',
    body: '奶奶给每颗雨滴找了一个舒舒服服的位置：小小蓝躲进了毛绒兔子的耳朵里，嗯嗯偎在月光黄的小灯旁，叮叮被小王捧在手心，盖上一层薄薄的棉手帕。她们不再发抖，眼角的小水珠也悄悄不见了。窗外的雨变小了，敲窗的声音成了轻轻的摇篮曲。奶奶拍拍小王的背：“心里不安的时候，记得呼吸、说话、抱一抱。”小王闭上眼睛，慢慢睡着了。',
    image: '/story-demo/chapter-4.jpg',
    audio: '/story-demo/narration-4.wav',
  },
]

export class LiveReaderSimulator {
  private currentPage = 0
  private isPlaying = false
  private narrationAudio: HTMLAudioElement
  private bgmAudio: HTMLAudioElement
  private pageSheets: HTMLElement[] = []
  private indicatorEl: HTMLElement | null = null
  private playBtn: HTMLElement | null = null

  constructor() {
    this.narrationAudio = new Audio()
    this.narrationAudio.preload = 'auto'

    this.bgmAudio = new Audio('/story-demo/narration-5.mp3')
    this.bgmAudio.preload = 'auto'
    this.bgmAudio.loop = true
    this.bgmAudio.volume = 0.2

    this.indicatorEl = document.getElementById('reader-page-indicator')
    this.playBtn = document.getElementById('reader-play-audio-btn')

    this.renderPages()
    this.bindEvents()
    this.updatePageState()
  }

  private renderPages() {
    const stage = document.getElementById('reader-pages-stage')
    if (!stage) return

    stage.innerHTML = DEMO_STORY_PAGES.map((p, i) => `
      <div class="book-page-sheet ${i === 0 ? 'active' : ''}" data-page-idx="${i}">
        <div class="page-illustration-col">
          <img src="${p.image}" alt="${p.title}" loading="lazy" />
        </div>
        <div class="page-text-col">
          <span class="page-chapter-badge">适龄绘本 · 章节 ${p.chapterIndex}</span>
          <h3 class="page-chapter-title">${p.title}</h3>
          <p class="page-chapter-body">${p.body}</p>
        </div>
      </div>
    `).join('')

    this.pageSheets = Array.from(stage.querySelectorAll('.book-page-sheet'))
  }

  private bindEvents() {
    const prevBtn = document.getElementById('reader-prev-page-btn')
    const nextBtn = document.getElementById('reader-next-page-btn')

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.prevPage())
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextPage())
    }
    if (this.playBtn) {
      this.playBtn.addEventListener('click', () => this.toggleNarration())
    }

    // 移动端左右滑动翻页支持
    const stage = document.getElementById('reader-pages-stage')
    if (stage) {
      let touchStartX = 0
      let touchStartY = 0

      stage.addEventListener('touchstart', (e: TouchEvent) => {
        touchStartX = e.touches[0].clientX
        touchStartY = e.touches[0].clientY
      }, { passive: true })

      stage.addEventListener('touchend', (e: TouchEvent) => {
        const deltaX = e.changedTouches[0].clientX - touchStartX
        const deltaY = e.changedTouches[0].clientY - touchStartY

        // 仅水平滑动距离大于 40px 且垂直滑动较小时触发翻页
        if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX < 0) {
            this.nextPage()
          } else {
            this.prevPage()
          }
        }
      }, { passive: true })
    }

    // 朗读音频结束时逻辑
    this.narrationAudio.addEventListener('ended', () => {
      this.isPlaying = false
      this.bgmAudio.pause()
      this.updatePlayBtn()
    })

    this.narrationAudio.addEventListener('pause', () => {
      if (!this.isPlaying) {
        this.bgmAudio.pause()
      }
      this.updatePlayBtn()
    })
  }

  public prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--
      this.updatePageState()
    }
  }

  public nextPage() {
    if (this.currentPage < DEMO_STORY_PAGES.length - 1) {
      this.currentPage++
      this.updatePageState()
    }
  }

  private updatePageState() {
    this.pageSheets.forEach((sheet, idx) => {
      if (idx < this.currentPage) {
        sheet.className = 'book-page-sheet flipped'
      } else if (idx === this.currentPage) {
        sheet.className = 'book-page-sheet active'
      } else {
        sheet.className = 'book-page-sheet'
      }
    })

    if (this.indicatorEl) {
      this.indicatorEl.textContent = `第 ${this.currentPage + 1} 章 / 共 ${DEMO_STORY_PAGES.length} 章`
    }

    if (this.isPlaying) {
      this.playChapterAudio()
    }
  }

  private toggleNarration() {
    this.isPlaying = !this.isPlaying
    if (this.isPlaying) {
      this.playChapterAudio()
    } else {
      this.narrationAudio.pause()
      this.bgmAudio.pause()
    }
    this.updatePlayBtn()
  }

  private playChapterAudio() {
    const chapter = DEMO_STORY_PAGES[this.currentPage]
    this.narrationAudio.src = chapter.audio
    this.narrationAudio.currentTime = 0

    // 播放背景轻音乐与真实人声
    this.bgmAudio.play().catch(() => {})
    this.narrationAudio.play().then(() => {
      this.isPlaying = true
      this.updatePlayBtn()
    }).catch((err) => {
      console.warn('Playback error:', err)
      this.isPlaying = false
      this.updatePlayBtn()
    })
  }

  private updatePlayBtn() {
    if (!this.playBtn) return
    this.playBtn.innerHTML = this.isPlaying
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> <span>暂停朗读</span>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg> <span>伴读朗读</span>`
    
    this.playBtn.classList.toggle('active', this.isPlaying)
  }

  public destroy() {
    this.narrationAudio.pause()
    this.bgmAudio.pause()
  }
}
