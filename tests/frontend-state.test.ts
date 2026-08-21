import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import type { GenerationJob } from '../src/shared/contracts'
import { focusWrapTarget } from '../src/renderer/src/lib/focus'
import { collectNewCompletionMoments, initializeCompletionTracking, rememberCompletedSteps } from '../src/renderer/src/lib/completion-moments'
import { findActiveStoryJob, findRecentVoiceJob, mergeBufferedJobs } from '../src/renderer/src/lib/jobs'
import { RequestGate } from '../src/renderer/src/lib/request-gate'
import { neutralizeProviderBrand, userFacingFailure } from '../src/renderer/src/lib/user-facing-errors'

function job(id: string, kind: GenerationJob['kind'], projectId?: string): GenerationJob {
  return {
    id,
    kind,
    projectId,
    status: 'running',
    overallProgress: 20,
    steps: [],
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  }
}

describe('frontend state helpers', () => {
  it('never selects a voice job for the story production page', () => {
    const voice = job('voice-job', 'voice')
    const olderStory = job('older-story', 'story', 'project-a')
    const newerStory = job('newer-story', 'story', 'project-b')
    const jobs = [voice, newerStory, olderStory]

    expect(findActiveStoryJob(jobs, voice.id)).toBeUndefined()
    expect(findActiveStoryJob(jobs, voice.id, 'project-a')).toBe(olderStory)
    expect(findActiveStoryJob(jobs, newerStory.id, 'project-a')).toBe(newerStory)
  })

  it('prevents concurrent requests and invalidates a response after cancellation', () => {
    const gate = new RequestGate()
    const first = gate.begin()!

    expect(gate.active).toBe(true)
    expect(gate.begin()).toBeUndefined()
    gate.cancel()
    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.finish(first)).toBe(false)

    const second = gate.begin()!
    expect(second).not.toBe(first)
    expect(gate.finish(second)).toBe(true)
    expect(gate.active).toBe(false)
  })

  it('wraps focus only at the beginning, end, or outside the dialog', () => {
    const items = ['first', 'middle', 'last']

    expect(focusWrapTarget(items, 'first', true)).toBe('last')
    expect(focusWrapTarget(items, 'last', false)).toBe('first')
    expect(focusWrapTarget(items, null, false)).toBe('first')
    expect(focusWrapTarget(items, null, true)).toBe('last')
    expect(focusWrapTarget(items, 'middle', false)).toBeUndefined()
  })

  it('hides the complete picture-book paginator on mobile', async () => {
    const css = await readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8')

    expect(css).toMatch(/\.chapter-dots\s*\{[^}]*flex-wrap:\s*nowrap;/)
    expect(css).toMatch(/\.chapter-dots\s*\{[^}]*overflow-x:\s*auto;/)
    expect(css).toMatch(/\.chapter-dots button\s*\{[^}]*flex:\s*0 0 44px;[^}]*width:\s*44px;[^}]*height:\s*44px;/)
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.preview-controls\s*\{\s*display:\s*none;/)
  })

  it('renders finished stories as an accessible responsive picture book', async () => {
    const [preview, css] = await Promise.all([
      readFile(new URL('../src/renderer/src/components/StoryPreview.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8'),
    ])

    expect(preview).toContain('storybook-cover')
    expect(preview).toContain('storybook-spread')
    expect(preview).toContain('storybook-back-cover')
    expect(preview).toContain("event.key === 'ArrowLeft'")
    expect(preview).toContain("event.key === 'Home'")
    expect(preview).toContain('onPointerDown={handlePointerDown}')
    expect(preview).toContain('autoplayNextRef.current = true')
    expect(preview).toContain('if (!autoplayNextRef.current || isTurning) return')
    expect(preview).toMatch(/if \(!enabled\) \{\s+autoplayNextRef\.current = false\s+audioRef\.current\?\.pause\(\)/)
    expect(preview).toContain('goToPage(pageCount - 1)')
    expect(preview).toContain('role="status" aria-live="polite"')
    expect(preview).not.toContain('onUpdateNarration')
    expect(preview).not.toContain('更新故事朗读')
    expect(css).toMatch(/\.storybook-image-page img\s*\{[^}]*object-fit:\s*contain;/)
    expect(css).toMatch(/\.storybook-spread\s*\{[^}]*grid-template-columns:\s*repeat\(2,/)
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.storybook-spread\s*\{[^}]*grid-template-columns:\s*1fr;/)
    expect(css).toMatch(/\.storybook-copy-scroll\s*\{[^}]*overflow:\s*auto;/)
  })

  it('keeps narrow layouts bounded and respects reduced-motion preferences', async () => {
    const css = await readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8')
    const reducedMotion = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))

    expect(css).toMatch(/\.app-shell\s*\{[^}]*width:\s*100%;/)
    expect(css).toMatch(/\.sample-actions audio\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/)
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.step-celebration\s*\{\s*top:\s*142px;/)
    expect(css).toMatch(/\.step-celebration\s*\{[^}]*left:\s*14px;[^}]*width:\s*auto;/)
    expect(css).toMatch(/\.voice-provider-options\.segmented\s*\{[^}]*grid-template-columns:\s*repeat\(2,/)
    expect(css).toMatch(/\.system-voice-grid\s*\{[^}]*grid-template-columns:\s*1fr;/)
    expect(reducedMotion).toContain('.step-celebration, .celebration-icon, .celebration-sparkle, .toast, .confirmation-backdrop, .confirmation-dialog { animation: none; }')
    expect(reducedMotion).toContain('.guided-progress > span, .level-track span { transition: none; }')
    expect(reducedMotion).not.toContain('.spin { animation: none; }')
    expect(css).toMatch(/\.spin\s*\{[^}]*animation:\s*spin \.9s linear infinite;[^}]*transform-origin:\s*center;/)
  })

  it('uses three complementary Chinese voice-cloning samples instead of one repeated mood', async () => {
    const recorder = await readFile(new URL('../src/renderer/src/components/AudioRecorder.tsx', import.meta.url), 'utf8')

    expect(recorder).toContain("title: '自然讲述'")
    expect(recorder).toContain("title: '问答与回应'")
    expect(recorder).toContain('树叶为什么笑？')
    expect(recorder).toContain("title: '安静收束'")
    expect(recorder).not.toContain("title: '温柔与停顿'")
    expect(recorder).toContain('echoCancellation: false')
    expect(recorder).toContain('noiseSuppression: false')
    expect(recorder).toContain('autoGainControl: false')
  })

  it('keeps MiniMax settings paired after removing Group ID', async () => {
    const dialog = await readFile(new URL('../src/renderer/src/components/SettingsDialog.tsx', import.meta.url), 'utf8')

    expect(dialog).not.toContain('Group ID')
    expect(dialog).toMatch(/className="field span-two"><span>API Key<\/span>/)
  })

  it('keeps one locked MiniMax configuration in settings instead of the story form', async () => {
    const [dialog, composer] = await Promise.all([
      readFile(new URL('../src/renderer/src/components/SettingsDialog.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/StoryComposer.tsx', import.meta.url), 'utf8'),
    ])

    expect(dialog).toContain('<strong>故事与插图</strong>')
    expect(dialog).toContain('<span>故事模型 ID</span>')
    expect(dialog).toContain('<span>插图模型 ID</span>')
    expect(dialog).toContain('高级配置已锁定')
    expect(dialog).toContain('解锁编辑')
    expect(dialog).not.toContain('OpenAI 兼容基础地址')
    expect(dialog).not.toContain('可切换文本模型')
    expect(composer).toContain("const provider = 'minimax' as const")
    expect(composer).toContain('<h2>章节与朗读</h2>')
    expect(composer).not.toContain('<span>故事模型</span>')
    expect(composer).not.toContain('<span>模型 ID</span>')
    expect(composer).not.toContain('插图模型</span>')
  })

  it('removes narrative-tone controls from story creation', async () => {
    const [composer, css] = await Promise.all([
      readFile(new URL('../src/renderer/src/components/StoryComposer.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8'),
    ])

    expect(composer).not.toContain('NARRATIVE_TONES')
    expect(composer).not.toContain('叙事语气')
    expect(composer).not.toContain('文字效果预览')
    expect(composer).not.toMatch(/\btone\b/)
    expect(css).not.toContain('.tone-picker')
    expect(css).not.toContain('.tone-options')
    expect(css).not.toContain('.tone-example')
  })

  it('shows real previews for every selectable illustration style', async () => {
    const [composer, styles, css, ...previews] = await Promise.all([
      readFile(new URL('../src/renderer/src/components/StoryComposer.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/shared/illustration-styles.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8'),
      ...['moonlight-watercolor', 'paper-cut-collage', 'crayon-doodle', 'colored-pencil', 'soft-clay']
        .map((name) => readFile(new URL(`../src/renderer/public/illustration-styles/${name}.png`, import.meta.url))),
    ])

    expect(composer).toContain('ILLUSTRATION_STYLES.map')
    expect(composer).toContain('role="radiogroup" aria-label="绘图风格"')
    expect(composer).toContain('预览使用同一明亮场景真实生成')
    expect(composer).not.toContain('预览由 MiniMax image-01')
    expect(composer).toContain('illustrationStyle,')
    expect(styles).toContain("label: '月光水彩'")
    expect(styles).toContain("label: '纸艺拼贴'")
    expect(styles).toContain("label: '蜡笔童画'")
    expect(styles).toContain("label: '彩铅童话'")
    expect(styles).toContain("label: '软陶梦境'")
    expect(previews.every((preview) => preview.byteLength > 500_000)).toBe(true)
    expect(previews.every((preview) => preview.readUInt32BE(16) === 960 && preview.readUInt32BE(20) === 640)).toBe(true)
    expect(css).toMatch(/\.illustration-style-options\s*\{[^}]*grid-template-columns:\s*repeat\(5,/)
    expect(css).toContain('aspect-ratio: 3 / 2')
  })

  it('uses a unified story control dock with popover audio adjustments', async () => {
    const [preview, css] = await Promise.all([
      readFile(new URL('../src/renderer/src/components/StoryPreview.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8'),
    ])

    expect(preview).toContain("{ value: 0.8, label: '慢速' }")
    expect(preview).toContain("{ value: 0.9, label: '睡前' }")
    expect(preview).toContain("{ value: 1, label: '原速' }")
    expect(preview).toContain("{ value: 1.2, label: '快速' }")
    expect(preview).toContain('useState(1)')
    expect(preview).toContain('useState(0.18)')
    expect(preview).toContain('audio.currentTime = 0')
    expect(preview).toContain('className="storybook-audio-dock"')
    expect(preview).toContain("'voice-volume'")
    expect(preview).toContain("'music-volume'")
    expect(preview).toContain('aria-label="人声音量"')
    expect(preview).toContain('BACKGROUND_MUSIC_FEATURE_ENABLED && project.backgroundMusicAsset')
    expect(preview).toContain('SAFE_OUTPUT_GAIN = 0.85')
    expect(preview).toContain('music.volume = 0')
    expect(preview).not.toMatch(/<audio[^>]*\scontrols/)
    expect(css).toContain('.storybook-chapter-audio { display: none; }')
    expect(css).toContain('.audio-dock-popover')
    expect(css).toContain('.speed-preset-grid')
    expect(css).toMatch(/\.audio-dock-button\s*\{[^}]*width:\s*42px;[^}]*height:\s*42px;/)
    expect(css).toMatch(/@media \(max-width: 420px\)[\s\S]*?\.audio-dock-popover\s*\{\s*position:\s*fixed;/)
    expect(css).toMatch(/@media \(max-width: 340px\)[\s\S]*?\.audio-dock-page\s*\{\s*display:\s*none;/)
  })

  it('shows online plan usage in the lower sidebar without exposing provider credentials', async () => {
    const [app, meter, preload, css] = await Promise.all([
      readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/OnlineUsageMeter.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/preload/index.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8'),
    ])

    expect(app).toContain('<OnlineUsageMeter')
    expect(app).toContain('5 * 60_000')
    expect(app).not.toContain('provider-chip')
    expect(meter).toContain('尚未配置')
    expect(meter).toContain('请先填写在线服务 API Key')
    expect(meter).toContain('onConfigure')
    expect(meter).toContain('在线套餐')
    expect(meter).toContain('role="progressbar"')
    expect(meter).toContain('请先填写在线服务 API Key')
    expect(preload).toContain("ipcRenderer.invoke('bedtime:usage:get')")
    expect(css).toContain('.online-usage-track')
  })

  it('shows how the nickname and age change the generated story', async () => {
    const [composer, profiles, css] = await Promise.all([
      readFile(new URL('../src/renderer/src/components/StoryComposer.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/shared/child-story-profile.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8'),
    ])

    expect(composer).toContain('昵称怎样进入故事')
    expect(composer).toContain('childRoleExplanation(childName)')
    expect(composer).toContain('selectedAgeProfile.ageRange')
    expect(profiles).toContain('核心小主角')
    expect(profiles).toContain('启蒙陪伴')
    expect(profiles).toContain('想象探索')
    expect(profiles).toContain('成长冒险')
    expect(profiles).toContain('少年共鸣')
    expect(css).toMatch(/\.child-impact\s*\{[^}]*grid-template-columns:\s*repeat\(2,/)
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.child-impact\s*\{\s*grid-template-columns:\s*1fr;/)
  })

  it('leaves the story theme empty and explains how it changes the whole story', async () => {
    const [composer, css] = await Promise.all([
      readFile(new URL('../src/renderer/src/components/StoryComposer.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8'),
    ])

    expect(composer).toContain("const [theme, setTheme] = useState('')")
    expect(composer).not.toContain("useState('星空下的勇气与友谊')")
    expect(composer).toContain('placeholder="例如：学会面对黑暗，感受朋友的陪伴"')
    expect(composer).toContain('主题会决定整个故事往哪里走')
    expect(composer).toContain('影响故事发生的场景、主角要面对的问题、整体情绪和结尾想传达的感受')
    expect(composer).toContain('填写“学会面对黑暗”')
    expect(css).toContain('.theme-impact')
    expect(css).toContain('.theme-impact .theme-example')
  })

  it('lets parents choose an age-aware or custom per-chapter character range', async () => {
    const [composer, profiles, css] = await Promise.all([
      readFile(new URL('../src/renderer/src/components/StoryComposer.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/shared/child-story-profile.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8'),
    ])

    expect(composer).toContain('CHAPTER_LENGTH_PRESETS.map')
    expect(composer).toContain('role="radiogroup" aria-label="每章文字字数"')
    expect(composer).toContain('selectedAgeProfile.recommendedChapterChars')
    expect(composer).toContain('chapterCharMin: chapterCharRange.min')
    expect(composer).toContain('chapterCharMax: chapterCharRange.max')
    expect(profiles).toContain("{ id: 'short', label: '简短'")
    expect(profiles).toContain("{ id: 'standard', label: '标准'")
    expect(profiles).toContain("{ id: 'rich', label: '丰富'")
    expect(profiles).toContain('CHAPTER_CHAR_LIMITS: ChapterCharRange = { min: 60, max: 500 }')
    expect(css).toMatch(/\.chapter-length-options\s*\{[^}]*grid-template-columns:\s*repeat\(5,/)
  })

  it('offers an offline built-in music library and story templates without calling the paused music API', async () => {
    const [features, composer, preview, pipeline, exporter, musicRegistry, templates, builder] = await Promise.all([
      readFile(new URL('../src/shared/features.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/StoryComposer.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/StoryPreview.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/main/services/pipeline.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/main/services/html-exporter.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/shared/background-music.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/shared/story-templates.ts', import.meta.url), 'utf8'),
      readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8'),
    ])

    expect(features).toContain('BACKGROUND_MUSIC_FEATURE_ENABLED = true')
    expect(composer).toContain('BACKGROUND_MUSIC_FEATURE_ENABLED && <fieldset className="music-library">')
    expect(composer).toContain('STORY_TEMPLATES.map')
    expect(composer).toContain('BACKGROUND_MUSIC_TRACKS.map')
    expect(composer).toContain('toggleMusicPreview')
    expect(composer).toContain('backgroundMusicEnabled: BACKGROUND_MUSIC_FEATURE_ENABLED && backgroundMusicEnabled')
    expect(composer).toContain('backgroundMusicTrackId: BACKGROUND_MUSIC_FEATURE_ENABLED && backgroundMusicEnabled')
    expect(preview).toContain('BACKGROUND_MUSIC_FEATURE_ENABLED && project.backgroundMusicAsset')
    expect(preview).toContain('backgroundAudioRef')
    expect(preview).toContain('BACKGROUND_DUCK_FACTOR = 0.22')
    expect(preview).toContain('backgroundMusicVolume * (isPlaying || continuousPlay ? BACKGROUND_DUCK_FACTOR : 1) * SAFE_OUTPUT_GAIN')
    expect(pipeline).toContain("['music_generate', '创作故事背景音乐']")
    expect(pipeline).toContain("BACKGROUND_MUSIC_FEATURE_ENABLED || id !== 'music_generate'")
    expect(pipeline).toContain("target.backgroundMusicModel = 'builtin-library-v1'")
    expect(pipeline).not.toContain('MiniMaxMusicProvider')
    expect(exporter).toContain('BACKGROUND_MUSIC_FEATURE_ENABLED && project.backgroundMusicEnabled')
    expect(musicRegistry.match(/track\('/g)).toHaveLength(20)
    expect(templates.match(/backgroundMusicTrackId:/g)).toHaveLength(11)
    expect(builder).toContain('from: resources/background-music')
  })

  it('keeps internal chapter-length validation out of the finished reading view', async () => {
    const [preview, counter, css] = await Promise.all([
      readFile(new URL('../src/renderer/src/components/StoryPreview.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/shared/story-text.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8'),
    ])

    expect(preview).not.toContain('本章 {chapterCharacterCount} 个中文字符 · 设定 {project.chapterCharMin}–{project.chapterCharMax}')
    expect(preview).toContain('<p>{chapter.text}</p>')
    expect(css).toContain('.storybook-copy-scroll')
  })

  it('offers Chinese system voices alongside confirmation-gated online cloning', async () => {
    const [app, library, composer, settings] = await Promise.all([
      readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/VoiceLibrary.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/StoryComposer.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/SettingsDialog.tsx', import.meta.url), 'utf8'),
    ])

    expect(library).toContain("useState<VoiceMode>('minimax-system')")
    expect(library).toContain('内置中文')
    expect(library).toContain('普通话')
    expect(library).toContain('粤语')
    expect(library).toContain('搜索音色名称')
    expect(library).toContain('disabled={!settings.hasMiniMaxKey}')
    expect(library).toContain("provider === 'minimax-online'")
    expect(library).toContain('onlineUploadConfirmed')
    expect(library).toContain('settings.hasMiniMaxKey')
    expect(library).toContain('录音样本和每章正文会发送到在线语音服务')
    expect(library).toContain('无需录音和复刻')
    expect(library).toContain("title: '确认保存并在线复刻？'")
    expect(library).toContain("confirmLabel: '确认并开始复刻'")
    expect(library).toContain('consentConfirmed: true, speakerIsAdult: true')
    expect(library).toContain('onlineUploadConfirmed: true')
    expect(library).not.toContain('className="consent-box"')
    expect(library).not.toContain('type="checkbox"')
    expect(library).toContain('可能再次按在线服务规则收取音色启用费')
    expect(library).toContain('window.bedtime.voices.previewSystem(voice.id)')
    expect(library).toContain('首次试听会合成一段短句并按字符计费')
    expect(library).toContain("playingSystemVoiceId === voice.id")
    expect(library).toContain('生成中')
    expect(composer).toContain('内置中文 · 普通话')
    expect(composer).toContain('内置中文 · 粤语')
    expect(composer).not.toContain('内置中文音色需要在线服务 API Key、网络、语音权限和可用余额')
    expect(composer).toContain('onVoiceChanged')
    expect(composer).toContain('预计产物')
    expect(app).toContain('onVoiceChanged={setPreferredVoiceId}')
    expect(app).toContain('complete: Boolean(preferredVoiceId || currentProject?.voiceProfileId)')
    expect(app).toContain("complete: Boolean(currentProject)")
    expect(app).toContain("complete: currentProject?.status === 'ready'")
    expect(app).not.toContain('complete: snapshot.projects.length > 0')
    expect(app).not.toContain('complete: readyProjects.length > 0')
    expect(settings).toContain('miniMaxSpeechModel')
    expect(settings).toContain('https://platform.minimaxi.com/user-center/basic-information/interface-key')
    expect(library).not.toContain('本机克隆')
    expect(composer).not.toContain('录制故事')
    expect(settings).not.toContain('本机克隆方案')
    expect(app).not.toContain('完整离线套装')
  })

  it('keeps provider branding in settings while using neutral copy in the workflow', async () => {
    const [app, composer, library, panel, settings] = await Promise.all([
      readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/StoryComposer.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/VoiceLibrary.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/ProgressPanel.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/SettingsDialog.tsx', import.meta.url), 'utf8'),
    ])

    expect(app).not.toContain('在线服务 {snapshot.settings.hasMiniMaxKey')
    expect(app).toContain("'在线生成'")
    expect(composer).not.toContain('MiniMax image-01')
    expect(composer).not.toContain('MiniMax 内置 ·')
    expect(library).toContain('云端内置中文音色')
    expect(library).not.toContain('MiniMax 云端内置音色')
    expect(panel).toContain('neutralizeProviderBrand(step.message)')
    expect(panel).toContain('className="spin progress-spinner"')
    expect(settings).toContain('<strong>MiniMax</strong>')
    expect(settings).toContain('输入 MiniMax API Key')
  })

  it('places only the two selected bedtime voices first and marks them as recommendations', async () => {
    const [library, composer, voices, css] = await Promise.all([
      readFile(new URL('../src/renderer/src/components/VoiceLibrary.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/StoryComposer.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/shared/minimax-system-voices.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8'),
    ])

    expect(library).toContain('orderMiniMaxSystemVoicesForBedtime')
    expect(library).toContain('voice-recommendation-badge">推荐')
    expect(library).toContain('voice.bedtimeRecommendationReason')
    expect(composer).toContain('★ 推荐 · {voice.name}')
    expect(voices).toContain("name: '温暖少女'")
    expect(voices).toContain("bedtimeRecommendationRank: 1, bedtimeRecommendationReason: '温暖明亮、带自然微笑，最适合儿童童话朗读'")
    expect(voices).toContain("bedtimeRecommendationRank: 2, bedtimeRecommendationReason: '温柔亲切，适合舒缓的日常晚安故事'")
    expect((voices.match(/bedtimeRecommendationRank:/g) || [])).toHaveLength(2)
    expect(css).toContain('.system-voice-card.recommended')
    expect(css).toContain('.voice-recommendation-badge')
  })

  it('uses an accessible in-app confirmation dialog instead of plain browser or Electron message boxes', async () => {
    const [app, library, dialog, ipc, css] = await Promise.all([
      readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/VoiceLibrary.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/ConfirmationDialog.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/main/ipc.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/styles.css', import.meta.url), 'utf8'),
    ])

    expect(app).toContain('askForConfirmation')
    expect(app).toContain('<ConfirmationDialog options={confirmation} onResolve={resolveConfirmation} />')
    expect(app).toContain('继续导出')
    expect(app).not.toContain('更新故事朗读')
    expect(app).not.toContain('onUpdateNarration')
    expect(app).toContain('删除故事')
    expect(library).toContain('await onConfirm')
    expect(dialog).toContain('role="alertdialog"')
    expect(dialog).toContain("event.key === 'Escape'")
    expect(dialog).toContain('focusWrapTarget')
    expect(app).not.toContain('window.confirm')
    expect(library).not.toContain('window.confirm')
    expect(ipc).not.toContain('showMessageBox')
    expect(css).toContain('.confirmation-backdrop')
    expect(css).toContain('backdrop-filter: blur(7px)')
    expect(css).toContain('.confirmation-dialog.danger')
    expect(css).not.toContain('.confirmation-dialog::before')
    expect(css).not.toContain('.confirmation-dialog.danger::before')
  })

  it('removes local-model and offline-bundle product surfaces', async () => {
    const [app, settings, contracts] = await Promise.all([
      readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/SettingsDialog.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/shared/contracts.ts', import.meta.url), 'utf8'),
    ])

    expect(app).not.toContain('完整离线套装')
    expect(app).not.toContain('localModels')
    expect(settings).not.toContain('本地语音服务')
    expect(settings).not.toContain('Qwen3-TTS')
    expect(contracts).not.toContain('ModelBundleStatus')
  })

  it('does not expose the removed recent-story-task shortcut', async () => {
    const [app, jobs] = await Promise.all([
      readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/lib/jobs.ts', import.meta.url), 'utf8'),
    ])

    expect(app).not.toContain('查看最近故事任务')
    expect(app).not.toContain('recentStoryJob')
    expect(jobs).not.toContain('findRecentStoryJob')
  })

  it('shows non-technical story details for each finished story', async () => {
    const preview = await readFile(new URL('../src/renderer/src/components/StoryPreview.tsx', import.meta.url), 'utf8')

    expect(preview).toContain('故事详情')
    expect(preview).toContain('朗读音色')
    expect(preview).toContain('绘画风格')
    expect(preview).toContain('故事来源')
    expect(preview).toContain('<dt>背景音乐</dt>')
    expect(preview).not.toContain('<dt>故事模型</dt>')
    expect(preview).not.toContain('<dt>插图模型</dt>')
    expect(preview).toContain('历史本机音色（已停止支持）')
  })

  it('celebrates each newly completed pipeline step only once', () => {
    const seen = new Set<string>()
    const story = job('story-job', 'story', 'project-a')
    story.steps = [
      { id: 'story_generate', label: '生成故事', status: 'succeeded', progress: 100, message: '完成' },
      { id: 'image_generate', label: '生成插图', status: 'running', progress: 40, message: '进行中' },
    ]

    expect(collectNewCompletionMoments(story, seen).map((moment) => moment.key)).toEqual(['story-job:story_generate'])
    expect(collectNewCompletionMoments(story, seen)).toEqual([])

    story.steps[1] = { ...story.steps[1], status: 'succeeded', progress: 100 }
    expect(collectNewCompletionMoments(story, seen).map((moment) => moment.key)).toEqual(['story-job:image_generate'])
    expect(collectNewCompletionMoments(story, seen)).toEqual([])
  })

  it('does not replay completed steps restored from disk', () => {
    const persisted = job('persisted-job', 'voice')
    persisted.steps = [{ id: 'voice_prepare', label: '提取音色', status: 'succeeded', progress: 100, message: '完成' }]
    const seen = new Set<string>()

    rememberCompletedSteps([persisted], seen)

    expect(collectNewCompletionMoments(persisted, seen)).toEqual([])
  })

  it('celebrates a completion buffered while the initial snapshot is loading exactly once', () => {
    const seen = new Set<string>()
    const baseline = job('story-job', 'story', 'project-a')
    baseline.steps = [{ id: 'story_generate', label: '生成故事', status: 'running', progress: 90, message: '进行中' }]
    const buffered = {
      ...baseline,
      updatedAt: '2026-08-16T00:00:01.000Z',
      steps: [{ ...baseline.steps[0], status: 'succeeded' as const, progress: 100, message: '完成' }],
    }

    const moments = initializeCompletionTracking([baseline], [buffered, buffered], seen)

    expect(moments.map((moment) => moment.key)).toEqual(['story-job:story_generate'])
    expect(collectNewCompletionMoments(buffered, seen)).toEqual([])
  })

  it('merges only newer buffered progress over the initial snapshot', () => {
    const baseline = job('story-job', 'story', 'project-a')
    baseline.updatedAt = '2026-08-16T00:00:02.000Z'
    const stale = { ...baseline, updatedAt: '2026-08-16T00:00:01.000Z', overallProgress: 20 }
    const latest = { ...baseline, updatedAt: '2026-08-16T00:00:03.000Z', overallProgress: 80 }

    expect(mergeBufferedJobs([baseline], [stale])).toEqual([baseline])
    expect(mergeBufferedJobs([baseline], [stale, latest])).toEqual([latest])
  })

  it('merges only progress received during refresh and leaves deleted jobs out', async () => {
    const app = await readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
    const retained = job('retained-job', 'story', 'project-a')
    const deleted = job('deleted-job', 'story', 'project-deleted')
    const buffered = {
      ...retained,
      status: 'failed' as const,
      updatedAt: '2026-08-16T00:00:01.000Z',
    }

    const merged = mergeBufferedJobs([retained], [buffered])

    expect(merged).toEqual([buffered])
    expect(merged).not.toContainEqual(deleted)
    expect(app).toContain('refreshBufferedJobsRef.current.forEach((jobs) => jobs.push(job))')
    expect(app).toContain('jobs: mergeBufferedJobs(next.jobs, refreshBufferedJobs)')
    expect(app).not.toContain('mergeBufferedJobs(next.jobs, current.jobs)')
  })

  it('never lets a running voice snapshot replace a terminal failure', () => {
    const running = job('voice-job', 'voice')
    running.overallProgress = 18
    running.updatedAt = '2026-08-16T00:00:03.000Z'
    const failed = {
      ...running,
      status: 'failed' as const,
      updatedAt: '2026-08-16T00:00:02.000Z',
      error: '[WinError 1314] A required privilege is not held by the client',
    }

    expect(mergeBufferedJobs([failed], [running])).toEqual([failed])
    expect(mergeBufferedJobs([running], [failed])).toEqual([failed])
  })

  it('selects the freshest voice job without depending on array order', () => {
    const older = job('older-voice', 'voice')
    older.status = 'failed'
    const newer = job('newer-voice', 'voice')
    newer.updatedAt = '2026-08-16T00:00:05.000Z'

    expect(findRecentVoiceJob([older, newer])).toBe(newer)
  })

  it('turns the Windows cache-link failure into safe retry guidance', () => {
    const raw = 'Traceback: File "C:\\Users\\child\\cache.py", line 10: [WinError 1314] A required privilege is not held by the client'
    const message = userFacingFailure(raw, 'local-voice')

    expect(message).toContain('先完全退出应用')
    expect(message).toContain('已经下载的内容会保留')
    expect(message).toContain('如果仍出现相同错误')
    expect(message).toContain('Windows“设置 > 系统 > 开发者选项”')
    expect(message).toContain('导入离线模型套装')
    expect(message).not.toContain('模型文件已经下载')
    expect(message).not.toContain('C:\\Users')
    expect(message).not.toContain('Traceback')
  })

  it('does not expose raw Python paths for an unknown local voice failure', () => {
    const message = userFacingFailure('RuntimeError in C:\\models\\qwen.py', 'local-voice')

    expect(message).toContain('本机音色准备失败')
    expect(message).toContain('模型缓存会保留')
    expect(message).not.toContain('C:\\models')
  })

  it('removes provider branding from progress and failure copy outside settings', () => {
    expect(neutralizeProviderBrand('正在向 MiniMax 提交故事设定…')).toBe('正在向在线服务提交故事设定…')
    expect(neutralizeProviderBrand('MiniMax 在线音色已经准备好。')).toBe('在线音色已经准备好。')
    expect(neutralizeProviderBrand('MiniMax 在线语音合成失败：请求过于频繁。')).toBe('在线语音合成失败：请求过于频繁。')
    expect(neutralizeProviderBrand('MiniMax API Key 不能为空。')).toBe('在线服务 API Key 不能为空。')
    expect(neutralizeProviderBrand('MiniMax-M3 当前不可用。')).toBe('在线模型 当前不可用。')
    expect(userFacingFailure('MiniMax 返回的故事结构无效。', 'story')).toBe('在线服务返回的故事结构无效。')
  })

  it('uses assertive announcements only after a task fails', async () => {
    const panel = await readFile(new URL('../src/renderer/src/components/ProgressPanel.tsx', import.meta.url), 'utf8')

    expect(panel).toContain("aria-live={isFailed ? 'assertive' : 'polite'}")
    expect(panel).toContain("context === 'online-voice' ? '重新在线复刻' : '保留已下载内容并重试'")
    expect(panel).toContain('formatProgressCount(step.current, step.total)')
    expect(panel).toContain(".toFixed(2)} GB")
  })

  it('keeps the local voice retry available after an interrupted app restart', async () => {
    const [app, library, panel] = await Promise.all([
      readFile(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/VoiceLibrary.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/renderer/src/components/ProgressPanel.tsx', import.meta.url), 'utf8'),
    ])

    expect(library).toContain("latestVoiceJob.status === 'failed' || latestVoiceJob.status === 'paused' || latestVoiceJob.status === 'cancelled'")
    expect(library).toContain('onCancel={onCancel}')
    expect(app).toContain('onCancel={(jobId) => void cancelJob(jobId)}')
    expect(panel).toContain("job.status === 'paused' || job.status === 'cancelled'")
  })
})
