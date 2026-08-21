/* ==========================================================================
   10大故事模板宇宙组件 (Story Templates Grid Component)
   ========================================================================== */

export interface StoryTemplate {
  id: string
  icon: string
  label: string
  tagline: string
  title: string
  theme: string
  storySeed: string
  chapterCount: number
  styleLabel: string
  musicLabel: string
  previewImg: string
}

export const TEMPLATES_DATA: StoryTemplate[] = [
  {
    id: 'brave-night-forest',
    icon: '🏮',
    label: '勇气小灯笼',
    tagline: '温柔面对黑暗',
    title: '月光森林里的小灯笼',
    theme: '在朋友的陪伴下学会面对黑暗，发现勇气并不是不害怕，而是愿意慢慢向前。',
    storySeed: '主角在停电的夜晚得到一盏会说话的小灯笼，与森林朋友一起寻找丢失的星光。旅途中保持安全、温暖，没有惊吓场面，最后回到家人的怀抱。',
    chapterCount: 5,
    styleLabel: '月光水彩',
    musicLabel: '勇气小灯笼',
    previewImg: '/illustration-styles/moonlight-watercolor.png',
  },
  {
    id: 'star-friendship',
    icon: '⭐',
    label: '星星邮局',
    tagline: '友谊与守信',
    title: '寄给星星的晚安信',
    theme: '感受友谊、守信和互相帮助带来的快乐。',
    storySeed: '主角发现一家只在夜晚出现的星星邮局，要和新朋友一起把一封重要的晚安信送到天空。故事充满轻柔奇遇，以伙伴互相帮助完成约定作为结尾。',
    chapterCount: 5,
    styleLabel: '彩铅童话',
    musicLabel: '星星眨眼',
    previewImg: '/illustration-styles/colored-pencil.png',
  },
  {
    id: 'cloud-voyage',
    icon: '☁️',
    label: '云朵航行',
    tagline: '想象力与探索',
    title: '云朵小船的秘密航线',
    theme: '鼓励好奇心和想象力，在探索未知时学会观察与思考。',
    storySeed: '一艘柔软的云朵小船停在窗边，邀请主角前往天空花园。途中经过会唱歌的风、彩虹桥和云朵鲸鱼，所有冒险轻松安全。',
    chapterCount: 6,
    styleLabel: '软陶梦境',
    musicLabel: '云朵小船',
    previewImg: '/illustration-styles/soft-clay.png',
  },
  {
    id: 'forest-goodnight',
    icon: '🌲',
    label: '森林晚安会',
    tagline: '规律作息与互助',
    title: '森林里的最后一盏灯',
    theme: '认识规律作息的重要，也学会在朋友需要时给予温柔帮助。',
    storySeed: '森林里的小动物都准备睡觉，只有一只小刺猬找不到自己的晚安毯。主角陪它沿着月光小路寻找，并向不同动物学习各自的睡前习惯。',
    chapterCount: 5,
    styleLabel: '纸艺拼贴',
    musicLabel: '森林晚安',
    previewImg: '/illustration-styles/paper-cut-collage.png',
  },
  {
    id: 'whale-kindness',
    icon: '🐋',
    label: '小鲸鱼的梦',
    tagline: '善意与倾听',
    title: '会收藏歌声的小鲸鱼',
    theme: '学会倾听别人的感受，用善意帮助孤单的朋友。',
    storySeed: '主角在海边遇到一只只能在梦里唱歌的小鲸鱼，于是乘上贝壳小船前往蓝色海底，帮助它找回愿意倾听歌声的朋友。',
    chapterCount: 5,
    styleLabel: '月光水彩',
    musicLabel: '小鲸鱼之梦',
    previewImg: '/illustration-styles/moonlight-watercolor.png',
  },
  {
    id: 'rainy-day-comfort',
    icon: '🌧️',
    label: '雨夜小屋',
    tagline: '接纳情绪与安心',
    title: '雨滴敲门的晚上',
    theme: '接纳偶尔出现的不安与难过，学习用呼吸、表达和陪伴让自己平静下来。',
    storySeed: '一个下雨的夜晚，主角听见窗外的小雨滴来敲门。每一颗雨滴都带着一种小情绪，主角和家人一起帮助它们找到舒服的安放方式。',
    chapterCount: 4,
    styleLabel: '彩铅童话',
    musicLabel: '雨夜小屋',
    previewImg: '/illustration-styles/colored-pencil.png',
  },
  {
    id: 'magic-library',
    icon: '📚',
    label: '魔法图书馆',
    tagline: '阅读与知识',
    title: '午夜开放的魔法图书馆',
    theme: '感受阅读和知识带来的力量，懂得问题可以通过观察、提问和查找答案解决。',
    storySeed: '主角发现书架后藏着一座夜间图书馆，每本书都通向一个温柔的小世界。为了帮助迷路的故事角色回家，主角需要读懂三条线索。',
    chapterCount: 6,
    styleLabel: '纸艺拼贴',
    musicLabel: '魔法藏书阁',
    previewImg: '/illustration-styles/paper-cut-collage.png',
  },
  {
    id: 'moon-adventure',
    icon: '🌙',
    label: '月球漫步',
    tagline: '科学好奇心',
    title: '今晚，我们去月球散步',
    theme: '激发对太空和科学的好奇，同时认识准备、合作和安全规则的重要。',
    storySeed: '主角收到月亮兔的邀请，乘坐安静的梦境飞船前往月球。一路认识重力、环形山和遥远的地球，科学内容准确但表达简单有趣。',
    chapterCount: 6,
    styleLabel: '软陶梦境',
    musicLabel: '漫步月球',
    previewImg: '/illustration-styles/soft-clay.png',
  },
  {
    id: 'rainbow-sharing',
    icon: '🌈',
    label: '彩虹好朋友',
    tagline: '分享与合作',
    title: '彩虹桥上的礼物',
    theme: '体验分享、合作和轮流带来的快乐。',
    storySeed: '雨后出现了一座彩虹桥，桥上的七种颜色各自缺少一样东西。主角和朋友们必须分享手中的小礼物、轮流完成任务，才能让彩虹重新发光。',
    chapterCount: 5,
    styleLabel: '蜡笔童画',
    musicLabel: '彩虹伙伴',
    previewImg: '/illustration-styles/crayon-doodle.png',
  },
  {
    id: 'family-embrace',
    icon: '🏠',
    label: '家的抱抱',
    tagline: '亲情与安全感',
    title: '装满抱抱的小口袋',
    theme: '感受家人的爱与陪伴，知道短暂分开时爱依然会留在身边。',
    storySeed: '主角第一次要独自在自己的小床上入睡，家人送来一个看不见却装满拥抱的小口袋。主角带着它帮助几位想家的小动物，最后安心回到被窝。',
    chapterCount: 4,
    styleLabel: '彩铅童话',
    musicLabel: '妈妈的怀抱',
    previewImg: '/illustration-styles/colored-pencil.png',
  },
]

export class TemplateCarousel {
  private container: HTMLElement | null = null
  private selectedTemplateId: string | undefined

  constructor() {
    this.container = document.getElementById('templates-grid-container')
    this.render()
  }

  private render() {
    if (!this.container) return

    this.container.innerHTML = TEMPLATES_DATA.map((t) => `
      <div class="template-card glass-card ${t.id === this.selectedTemplateId ? 'selected' : ''}" data-template-id="${t.id}" role="button" tabindex="0" aria-pressed="${t.id === this.selectedTemplateId}">
        <div class="template-top">
          <div class="template-icon-circle">${t.icon}</div>
          <span class="template-tagline">${t.tagline}</span>
        </div>
        <h4 class="template-title">${t.title}</h4>
        <p class="template-theme">${t.theme}</p>
        <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 10px; margin: 12px 0; font-size: 12px; color: var(--text-body); line-height: 1.5;">
          <strong style="color: var(--moon-gold); display: block; margin-bottom: 2px;">情节种子：</strong>
          ${t.storySeed}
        </div>
        <div class="template-footer-meta">
          <span>${t.chapterCount} 章节 · ${t.styleLabel}</span>
          <span>🎵 ${t.musicLabel}</span>
        </div>
      </div>
    `).join('')

    this.container.querySelectorAll<HTMLElement>('.template-card').forEach((card) => {
      const select = () => {
        this.selectedTemplateId = card.dataset.templateId
        this.render()
      }
      card.addEventListener('click', select)
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          select()
        }
      })
    })
  }
}
