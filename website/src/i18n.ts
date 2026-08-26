export type WebsiteLanguage = 'zh' | 'en'

const STORAGE_KEY = 'dreamweaver-website-language'

const englishText = new Map<string, string>([
  ['枕边造梦', 'Dreamweaver'],
  ['声线魔法', 'Voices'],
  ['艺术画风', 'Art styles'],
  ['治愈配乐', 'Music'],
  ['故事模板', 'Story templates'],
  ['独立绘本', 'Picture book'],
  ['隐私安全', 'Privacy'],
  ['立即下载', 'Download'],
  ['🎙️ 声线魔法', '🎙️ Voices'],
  ['🎨 艺术画风', '🎨 Art styles'],
  ['🎵 治愈配乐', '🎵 Music'],
  ['✨ 故事模板', '✨ Story templates'],
  ['📖 独立绘本', '📖 Picture book'],
  ['🛡️ 隐私安全', '🛡️ Privacy'],
  ['GitHub 开源项目', 'Open-source on GitHub'],
  ['免费下载 Windows / Mac 版', 'Download for Windows / Mac'],
  ['V1.1 中英双语版 · 内置 20 首轻音乐与 10 大故事模板', 'V1.1 bilingual release · 20 music tracks and 10 story templates'],
  ['今晚，让爸爸妈妈的声音', "Tonight, let a parent's voice"],
  ['带宝贝温暖入梦', 'guide your child into a gentle dream'],
  ['面向家长的 AI 睡前绘本工坊。支持', 'An AI bedtime picture-book studio for families, with'],
  ['64 款中文温暖音色', 'Chinese and English story voices'],
  ['与', ','],
  ['10 秒父母声音在线复刻', '10-second authorized voice cloning'],
  ['，量身定制适龄情节，生成', ', age-aware stories,'],
  ['5 大艺术级插画', 'five curated illustration styles'],
  ['与', 'and'],
  ['20 首沉浸治愈轻音乐', '20 calming music tracks'],
  ['，一键导出无需网络的独立 HTML 翻页绘本。', ', all exported as a self-contained HTML picture book that works offline.'],
  ['体验 620ms 翻页绘本', 'Try the animated picture book'],
  ['离线随身带', 'Portable offline book'],
  ['本地凭据加密', 'Encrypted credentials'],
  ['适龄安全防护', 'Age-aware safeguards'],
  ['月光森林里的小灯笼', 'The Little Lantern in Moonlight Forest'],
  ['献给每一个勇敢而温柔的孩子', 'For every brave and gentle child'],
  ['妈妈的声音 · 朗读中', "Mom's voice · Reading"],
  ['5 章节 · 完本', '5 chapters · Complete'],
  ['64 款中文音色 + 父母专属复刻', 'Chinese + English voices and voice cloning'],
  ['5 大艺术级绘本画风', '5 curated picture-book styles'],
  ['20 首内置轻音乐 · 自动避让', '20 music tracks · Smart ducking'],
  ['声线魔法馆 · 听见陪伴的温度', 'Voice studio · Familiar voices feel closer'],
  ['用最熟悉的声音，', 'Tell a warm bedtime story '],
  ['讲最暖心的睡前故事', 'in a voice your child knows'],
  ['出差加班不用担心缺席孩子的睡前时刻。录制 10 秒成年人授权样本即可完成在线专属声线复刻；更有 64 款内置中文精选音色随心挑选。', 'Create an authorized online voice clone from a 10-second adult recording, or choose from built-in Chinese and English voices selected for bedtime listening.'],
  ['艺术级视觉盛宴 · 逐章插画', 'A new illustration for every chapter'],
  ['五大经典艺术画风，', 'Five timeless art styles, '],
  ['把梦境画在纸上', 'made for storybook dreams'],
  ['精心调校的提示词与色彩控制，远离泛滥的塑料三维感。每一张插图都严格契合章节情绪与适龄审美。', 'Carefully tuned visual direction keeps every illustration consistent with the chapter mood, characters, and age group.'],
  ['20 首内置轻音乐 · 离线随身享', '20 built-in instrumental tracks · Available offline'],
  ['纯器乐晚安旋律，', 'Gentle bedtime music '],
  ['更有智能人声自动避让', 'that makes room for narration'],
  ['随安装包内置 20 首高品质轻音乐，不消耗在线额度、无需额外 Key。朗读时背景音乐自动柔和压低，纯净人声与悠扬旋律完美融合。', 'Twenty instrumental tracks are included with the app and use no online quota. Music automatically softens during narration so every word stays clear.'],
  ['播放此曲目', 'Play track'],
  ['智能人声避让 (Ducking)', 'Smart narration ducking'],
  ['正常播放 (85% 音量)', 'Normal playback (85% volume)'],
  ['内置晚安曲库 (20 首)', 'Built-in bedtime collection (20 tracks)'],
  ['点击即可实时试听', 'Select a track to preview it'],
  ['10 大暖心故事模板', '10 thoughtful story templates'],
  ['涵盖成长、勇气与爱，', 'Stories about courage, kindness, and growing up, '],
  ['一键注入童话梦境', 'ready to personalize'],
  ['一键自动填入故事标题、主题、情节种子、章节篇幅、匹配画风与推荐配乐，孩子昵称与年龄无缝融入。', "Choose a template to fill in the title, theme, plot seed, chapter count, art style, and music, then personalize it with your child's name and age."],
  ['独立单文件 HTML · 620ms 拟真纸张翻折', 'Self-contained HTML · Smooth page-turn animation'],
  ['零依赖导出，', 'Export once, '],
  ['随心分享给微信与平板', 'share on phones and tablets'],
  ['导出产物为极简单文件 HTML，内嵌全部图文、朗读与背景音乐。旧页围绕书脊 620ms 旋转并产生纸张光影，无需安装任何客户端即可全平台流畅阅读。', 'Each export is one HTML file containing the story, illustrations, narration, and optional music. It opens in a modern browser without installing the desktop app.'],
  ['雨滴敲门的晚上 · 独立 HTML 互动演示', 'The Night the Raindrops Knocked · Interactive HTML demo'],
  ['上一页', 'Previous'],
  ['下一页', 'Next'],
  ['伴读朗读', 'Read aloud'],
  ['极简创作流程', 'A focused creative flow'],
  ['只需 4 步，', 'Four steps '],
  ['把想象变成枕边绘本', 'from an idea to a bedtime book'],
  ['清晰透明的制作流水线，实时进度反馈与错误恢复。', 'Clear progress, useful status updates, and recovery when an online step needs another try.'],
  ['选定声音', 'Choose a voice'],
  ['从 64 款中文系统音色中挑选，或通过 10 秒麦克风录音在线复刻父母专属声线。', 'Pick a built-in Chinese or English voice, or create an authorized online clone from a short adult recording.'],
  ['定制故事', 'Personalize the story'],
  ['输入孩子昵称、年龄，套用 10 大主题模板或输入原创构思，设定章节与画风。', "Add the child's name and age, choose a template or write an idea, then set the chapter length and art style."],
  ['AI 逐章造梦', 'Create every chapter'],
  ['在线模型根据设定创作适龄故事，逐章生成高画质艺术插图，并合成连贯、有感情的朗读音频。', 'Generate age-aware writing, a matching illustration for each chapter, and expressive narration.'],
  ['导出与分享', 'Export and share'],
  ['一键导出包含图文、配乐与纸张翻页特效的独立 HTML，离线随时畅听阅读。', 'Export one portable HTML picture book with text, images, narration, music, and animated page turns.'],
  ['隐私与安全底线', 'Privacy and safety'],
  ['为儿童与家庭，', 'Built for children and families, '],
  ['筑牢每一道安全防线', 'with clear safety boundaries'],
  ['技术服务于爱，更恪守责任边界。', 'Creative technology should support families responsibly.'],
  ['系统凭据加密存储', 'Encrypted credential storage'],
  ['API Key 仅在 Electron 主进程中读取并存入系统凭据存储，不写入故事项目、日志或导出的 HTML。', 'Your API Key is read only by the Electron main process and stored with system credential protection. It is never written to stories, logs, or exported HTML files.'],
  ['严格成年人声纹授权', 'Adult consent for voice cloning'],
  ['在线复刻严格限制为成年人授权声音，不采集未成年人或公众人物声音，杜绝声纹滥用。', 'Online cloning is restricted to explicitly authorized adult voices. Do not clone children or public figures.'],
  ['适龄内容安全边界', 'Age-aware content boundaries'],
  ['根据孩子年龄动态调整词汇复杂度与情绪深度，内置严格的内容安全过滤，无惊吓与暴力元素。', 'Vocabulary and emotional complexity adapt to the selected age, with strict instructions against frightening or violent content.'],
  ['离线独立单文件便携', 'Portable, self-contained output'],
  ['导出的 HTML 绘本不包含任何 API Key、草稿或原始声音样本，完全离线运行，安全无虞。', 'Exported HTML books contain no API Key, draft, or original voice recording and can run completely offline.'],
  ['客户端发布 · V1.1', 'Desktop release · V1.1'],
  ['开启全家的', 'Start a new'],
  ['睡前造梦奇旅', 'family bedtime ritual'],
  ['支持 Windows 10/11 x64 与 macOS 12+ (Apple Silicon)。免去复杂配置，开箱即用。', 'Available for Windows 10/11 x64 and macOS 12+ on Apple Silicon. Add your API Key once, then start creating.'],
  ['x64 架构', 'x64'],
  ['Windows 客户端', 'Windows app'],
  ['Windows 安装包准备中', 'Windows installer coming soon'],
  ['macOS 客户端', 'macOS app'],
  ['macOS 安装包准备中', 'macOS installer coming soon'],
  ['建议配置：现代 4 核处理器 · 8 GB 或更多内存 · SSD · 稳定宽带连接', 'Recommended: modern 4-core processor · 8 GB RAM or more · SSD · stable broadband connection'],
  ['枕边造梦 · AI 睡前故事工坊', 'Dreamweaver · AI Bedtime Story Studio'],
  ['GitHub 项目仓库', 'GitHub repository'],
  ['森林晚安曲 ·', 'Forest Goodnight ·'],
  ['背景音乐已暂停', 'Music paused'],
])

const englishAttributes = new Map<string, string>([
  ['切换网站语言', 'Switch website language'],
  ['查看枕边造梦 GitHub 开源项目', 'Open the Dreamweaver GitHub repository'],
  ['打开菜单', 'Open menu'],
  ['月光水彩绘本封面', 'Moonlight watercolor picture-book cover'],
  ['画风展示图', 'Illustration style preview'],
  ['播放晚安背景音', 'Play bedtime music'],
  ['枕边造梦 Logo', 'Dreamweaver Logo'],
])

export function getWebsiteLanguage(): WebsiteLanguage {
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'zh' || saved === 'en') return saved
  return window.navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function setWebsiteLanguage(language: WebsiteLanguage): void {
  window.localStorage.setItem(STORAGE_KEY, language)
}

export function translateStaticPage(language: WebsiteLanguage): void {
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'
  if (language === 'zh') return

  document.title = 'Dreamweaver · AI Bedtime Story Studio for Families'
  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (description) {
    description.content = 'Create bilingual bedtime stories with Chinese and English voices, chapter illustrations, narration, and a self-contained HTML picture book.'
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const value = node.textContent || ''
    const normalized = value.trim().replace(/\s+/g, ' ')
    const translated = englishText.get(normalized)
    if (translated) {
      const leading = value.match(/^\s*/)?.[0] || ''
      const trailing = value.match(/\s*$/)?.[0] || ''
      node.textContent = `${leading}${translated}${trailing}`
    }
    node = walker.nextNode()
  }

  document.querySelectorAll<HTMLElement>('[aria-label], [alt], [title]').forEach((element) => {
    for (const attribute of ['aria-label', 'alt', 'title']) {
      const value = element.getAttribute(attribute)
      const translated = value ? englishAttributes.get(value) : undefined
      if (translated) element.setAttribute(attribute, translated)
    }
  })
}

export function initializeWebsiteLanguageToggle(language: WebsiteLanguage): void {
  const button = document.getElementById('website-language-toggle')
  if (!button) return
  const nextLanguage: WebsiteLanguage = language === 'zh' ? 'en' : 'zh'
  button.textContent = nextLanguage === 'en' ? 'EN' : '中文'
  button.setAttribute('aria-label', language === 'en' ? '切换到中文' : 'Switch to English')
  button.addEventListener('click', () => {
    setWebsiteLanguage(nextLanguage)
    window.location.reload()
  })
}
