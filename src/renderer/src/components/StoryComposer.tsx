import { BookOpenText, CakeSlice, Check, ChevronDown, Compass, Minus, Music2, Pause, PenLine, Play, Plus, Sparkles, UserRound, VolumeX, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CreateStorySourceMode,
  GenerationJob,
  ProviderSettings,
  StoryLanguage,
  StoryProject,
  VoiceProfile,
} from '../../../shared/contracts'
import { BACKGROUND_MUSIC_FEATURE_ENABLED } from '../../../shared/features'
import {
  orderMiniMaxSystemVoicesForBedtime,
  type MiniMaxSystemVoice,
} from '../../../shared/minimax-system-voices'
import {
  DEFAULT_ILLUSTRATION_STYLE,
  ILLUSTRATION_STYLES,
  illustrationStyles,
  type IllustrationStyleId,
} from '../../../shared/illustration-styles'
import {
  CHAPTER_CHAR_LIMITS,
  CHAPTER_LENGTH_PRESETS,
  childAgeProfile,
  childRoleExplanation,
  type ChapterLengthPresetId,
} from '../../../shared/child-story-profile'
import { localizedUserFacingFailure, neutralizeProviderBrand } from '../lib/user-facing-errors'
import {
  BACKGROUND_MUSIC_TRACKS,
  DEFAULT_BACKGROUND_MUSIC_TRACK_ID,
  backgroundMusicTrack,
  backgroundMusicTracks,
  type BackgroundMusicTrackId,
} from '../../../shared/background-music'
import { STORY_TEMPLATES, storyTemplates, type StoryTemplatePreset } from '../../../shared/story-templates'
import { useLanguage } from '../lib/i18n'

interface StoryComposerProps {
  settings: ProviderSettings
  voices: VoiceProfile[]
  systemVoices: MiniMaxSystemVoice[]
  initialVoiceId?: string
  onVoiceChanged(voiceId: string): void
  onOpenSettings(): void
  onStarted(project: StoryProject, job: GenerationJob): void
}

export function StoryComposer({ settings, voices, systemVoices, initialVoiceId, onVoiceChanged, onOpenSettings, onStarted }: StoryComposerProps) {
  const { language, t } = useLanguage()
  const [title, setTitle] = useState('')
  const [childName, setChildName] = useState('')
  const [childAge, setChildAge] = useState(6)
  const [theme, setTheme] = useState('')
  const [storyLanguage, setStoryLanguage] = useState<StoryLanguage>(language)
  const [sourceMode, setSourceMode] = useState<CreateStorySourceMode>('ai')
  const [sourceText, setSourceText] = useState('')
  const [chapterCount, setChapterCount] = useState(5)
  const [chapterLengthPreset, setChapterLengthPreset] = useState<ChapterLengthPresetId>('recommended')
  const [customChapterCharMin, setCustomChapterCharMin] = useState(120)
  const [customChapterCharMax, setCustomChapterCharMax] = useState(180)
  const [illustrationStyle, setIllustrationStyle] = useState<IllustrationStyleId>(DEFAULT_ILLUSTRATION_STYLE)
  const [backgroundMusicEnabled, setBackgroundMusicEnabled] = useState(false)
  const [backgroundMusicTrackId, setBackgroundMusicTrackId] = useState<BackgroundMusicTrackId>(DEFAULT_BACKGROUND_MUSIC_TRACK_ID)
  const [previewingMusicId, setPreviewingMusicId] = useState<BackgroundMusicTrackId>()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>()
  const musicPreviewRef = useRef<HTMLAudioElement | null>(null)
  const [voiceId, setVoiceId] = useState(initialVoiceId || voices[0]?.id || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selectedSystemVoice = useMemo(
    () => systemVoices.find((voice) => voice.id === voiceId),
    [systemVoices, voiceId],
  )
  const mandarinSystemVoices = useMemo(
    () => orderMiniMaxSystemVoicesForBedtime(systemVoices.filter((voice) => voice.locale === 'zh-CN')),
    [systemVoices],
  )
  const cantoneseSystemVoices = useMemo(
    () => orderMiniMaxSystemVoicesForBedtime(systemVoices.filter((voice) => voice.locale === 'zh-HK')),
    [systemVoices],
  )
  const englishSystemVoices = useMemo(
    () => orderMiniMaxSystemVoicesForBedtime(systemVoices.filter((voice) => voice.language === 'en')),
    [systemVoices],
  )
  const selectedAgeProfile = childAgeProfile(childAge)
  const selectedLengthPreset = CHAPTER_LENGTH_PRESETS.find((option) => option.id === chapterLengthPreset)
  const chapterCharRange = chapterLengthPreset === 'recommended'
    ? selectedAgeProfile.recommendedChapterChars
    : chapterLengthPreset === 'custom'
      ? { min: customChapterCharMin, max: customChapterCharMax }
      : selectedLengthPreset!.range
  const chapterCharRangeValid = Number.isInteger(chapterCharRange.min)
    && Number.isInteger(chapterCharRange.max)
    && chapterCharRange.min >= CHAPTER_CHAR_LIMITS.min
    && chapterCharRange.max <= CHAPTER_CHAR_LIMITS.max
    && chapterCharRange.min <= chapterCharRange.max
  const provider = 'minimax' as const
  const model = settings.miniMaxTextModel
  const selectedBackgroundMusicTrack = backgroundMusicTrack(backgroundMusicTrackId, language)

  useEffect(() => {
    setStoryLanguage(language)
  }, [language])

  useEffect(() => {
    const eligibleVoices = voices.filter((voice) => voice.language === storyLanguage)
    const eligibleSystemVoices = systemVoices.filter((voice) => voice.language === storyLanguage)
    const voiceExists = eligibleVoices.some((voice) => voice.id === voiceId)
      || eligibleSystemVoices.some((voice) => voice.id === voiceId)
    if (voiceExists) return
    const preferred = initialVoiceId && eligibleSystemVoices.some((voice) => voice.id === initialVoiceId)
      ? initialVoiceId
      : eligibleVoices[0]?.id || eligibleSystemVoices[0]?.id
    setVoiceId(preferred || '')
  }, [initialVoiceId, storyLanguage, systemVoices, voiceId, voices])

  useEffect(() => () => {
    musicPreviewRef.current?.pause()
    musicPreviewRef.current = null
  }, [])

  const stopMusicPreview = () => {
    if (musicPreviewRef.current) {
      musicPreviewRef.current.pause()
      musicPreviewRef.current.currentTime = 0
      musicPreviewRef.current = null
    }
    setPreviewingMusicId(undefined)
  }

  const toggleMusicPreview = async (trackId: BackgroundMusicTrackId) => {
    if (previewingMusicId === trackId) {
      stopMusicPreview()
      return
    }
    stopMusicPreview()
    const track = backgroundMusicTrack(trackId, language)
    if (!track) return
    const audio = new Audio(window.bedtime.assets.toUrl(track.assetPath))
    audio.volume = 0.28
    audio.onended = () => {
      musicPreviewRef.current = null
      setPreviewingMusicId(undefined)
    }
    audio.onerror = () => {
      musicPreviewRef.current = null
      setPreviewingMusicId(undefined)
      setError(language === 'en' ? `${track.label} could not be previewed. Reopen the app and try again.` : `《${track.label}》试听失败，请重新打开软件后再试。`)
    }
    musicPreviewRef.current = audio
    setPreviewingMusicId(trackId)
    try {
      await audio.play()
    } catch {
      if (musicPreviewRef.current === audio) musicPreviewRef.current = null
      setPreviewingMusicId(undefined)
      setError(language === 'en' ? `${track.label} is temporarily unavailable.` : `《${track.label}》暂时无法播放。`)
    }
  }

  const applyStoryTemplate = (template: StoryTemplatePreset) => {
    setSelectedTemplateId(template.id)
    setTitle(template.title)
    setTheme(template.theme)
    setSourceMode('ai')
    setSourceText(template.storySeed)
    setChapterCount(template.chapterCount)
    setChapterLengthPreset(template.chapterLengthPreset)
    setIllustrationStyle(template.illustrationStyle)
    setBackgroundMusicEnabled(true)
    setBackgroundMusicTrackId(template.backgroundMusicTrackId)
    setError('')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!voiceId) return setError(language === 'en' ? 'Choose a narration voice first.' : '请先选择一个朗读音色。')
    if (selectedSystemVoice && !settings.hasMiniMaxKey) {
      return setError(language === 'en' ? 'Configure the online service before using a built-in English voice.' : '使用内置中文音色前，请先在生成设置中配置在线服务。')
    }
    if (!chapterCharRangeValid) return setError(language === 'en' ? 'Enter a valid per-chapter length. The minimum cannot exceed the maximum.' : '请设置有效的每章字数范围，最少字数不能大于最多字数。')
    setBusy(true)
    setError('')
    try {
      const project = await window.bedtime.stories.create({
        title, childName, childAge, theme, language: storyLanguage, sourceMode, sourceText, chapterCount,
        chapterCharMin: chapterCharRange.min, chapterCharMax: chapterCharRange.max,
        illustrationStyle,
        storyProvider: provider, storyModel: model, voiceProfileId: voiceId,
        backgroundMusicEnabled: BACKGROUND_MUSIC_FEATURE_ENABLED && backgroundMusicEnabled,
        backgroundMusicTrackId: BACKGROUND_MUSIC_FEATURE_ENABLED && backgroundMusicEnabled
          ? backgroundMusicTrackId
          : undefined,
      })
      const job = await window.bedtime.jobs.start(project.id)
      onStarted(project, job)
    } catch (reason) {
      setError(localizedUserFacingFailure(reason, 'story', language))
    } finally {
      setBusy(false)
    }
  }

  if (language === 'en') {
    return <EnglishStoryComposerForm
      title={title}
      childName={childName}
      childAge={childAge}
      theme={theme}
      sourceMode={sourceMode}
      sourceText={sourceText}
      chapterCount={chapterCount}
      chapterLengthPreset={chapterLengthPreset}
      customChapterCharMin={customChapterCharMin}
      customChapterCharMax={customChapterCharMax}
      chapterCharRange={chapterCharRange}
      chapterCharRangeValid={chapterCharRangeValid}
      illustrationStyle={illustrationStyle}
      selectedTemplateId={selectedTemplateId}
      backgroundMusicEnabled={backgroundMusicEnabled}
      backgroundMusicTrackId={backgroundMusicTrackId}
      previewingMusicId={previewingMusicId}
      voiceId={voiceId}
      voices={voices.filter((voice) => voice.language === 'en')}
      systemVoices={englishSystemVoices}
      busy={busy}
      error={error}
      settings={settings}
      onTitle={setTitle}
      onChildName={setChildName}
      onChildAge={setChildAge}
      onTheme={setTheme}
      onSourceMode={setSourceMode}
      onSourceText={setSourceText}
      onChapterCount={setChapterCount}
      onChapterLengthPreset={setChapterLengthPreset}
      onCustomMin={setCustomChapterCharMin}
      onCustomMax={setCustomChapterCharMax}
      onIllustrationStyle={setIllustrationStyle}
      onApplyTemplate={applyStoryTemplate}
      onBackgroundMusicEnabled={setBackgroundMusicEnabled}
      onBackgroundMusicTrack={setBackgroundMusicTrackId}
      onStopMusicPreview={stopMusicPreview}
      onToggleMusicPreview={toggleMusicPreview}
      onVoice={(next) => { setVoiceId(next); onVoiceChanged(next) }}
      onOpenSettings={onOpenSettings}
      onSubmit={submit}
    />
  }

  return <form className="composer" onSubmit={submit} aria-busy={busy}>
    <header className="section-head"><div><p className="eyebrow">步骤 2</p><h1>定制今晚的故事</h1><p>孩子信息会发送给所选文本模型；建议使用昵称，不填写学校、住址等信息。</p></div><BookOpenText size={28} /></header>

    <section className="story-template-band" aria-labelledby="story-template-title">
      <div className="story-template-heading">
        <div><span className="template-kicker"><Sparkles size={14} />今晚从一个灵感开始</span><h2 id="story-template-title">故事模板</h2><p>一键填好主题、情节、章节、画风与配乐；孩子昵称和年龄不会被覆盖，所有内容都能继续修改。</p></div>
        <span className="template-count">10 个温柔灵感</span>
      </div>
      <div className="story-template-grid">
        {STORY_TEMPLATES.map((template) => {
          const track = backgroundMusicTrack(template.backgroundMusicTrackId)
          return <button
            className={`story-template-card ${selectedTemplateId === template.id ? 'active' : ''}`}
            type="button"
            key={template.id}
            aria-pressed={selectedTemplateId === template.id}
            onClick={() => applyStoryTemplate(template)}
          >
            <span className="template-icon" aria-hidden="true">{template.icon}</span>
            <span className="template-copy"><strong>{template.label}{selectedTemplateId === template.id && <Check size={14} />}</strong><small>{template.tagline}</small><em><Music2 size={12} />{track?.label}</em></span>
          </button>
        })}
      </div>
    </section>

    <section className="form-band">
      <div className="band-title"><span>01</span><div><h2>故事主角</h2><p>用于称呼与内容适龄控制</p></div></div>
      <div className="form-grid three">
        <label className="field"><span>故事标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：小禾与月亮邮局" required maxLength={80} /></label>
        <label className="field"><span>孩子昵称</span><input value={childName} onChange={(event) => setChildName(event.target.value)} placeholder="例如：小禾" required maxLength={30} /></label>
        <label className="field"><span>年龄</span><input type="number" min={2} max={14} value={childAge} onChange={(event) => setChildAge(Number(event.target.value))} required /></label>
        <div className="child-impact span-three" aria-live="polite">
          <div><UserRound size={17} aria-hidden="true" /><p><strong>昵称怎样进入故事</strong><span>{childRoleExplanation(childName)}</span></p></div>
          <div><CakeSlice size={17} aria-hidden="true" /><p><strong>{selectedAgeProfile.ageRange} · {selectedAgeProfile.label}</strong><span>{selectedAgeProfile.vocabulary}；{selectedAgeProfile.plot}；{selectedAgeProfile.emotionalSafety}；适龄建议{selectedAgeProfile.chapterLength}，可在下方按需要调整。</span></p></div>
        </div>
        <label className="field span-three"><span>故事主题</span><input value={theme} onChange={(event) => setTheme(event.target.value)} placeholder="例如：学会面对黑暗，感受朋友的陪伴" required maxLength={120} /></label>
        <div className="theme-impact span-three">
          <Compass size={19} aria-hidden="true" />
          <div>
            <strong>主题会决定整个故事往哪里走</strong>
            <p>它会成为全书的创作主线，影响故事发生的场景、主角要面对的问题、整体情绪和结尾想传达的感受。这里写希望孩子今晚体验或理解的内容即可，不需要写完整剧情。</p>
            <p className="theme-example"><b>例如：</b>填写“学会面对黑暗”，故事可能让主角在夜晚森林寻找星光，在朋友陪伴下慢慢克服害怕，最后回到安心；改成“分享的快乐”，场景、冲突和结尾也会随之改变。</p>
          </div>
        </div>
      </div>
    </section>

    <section className="form-band">
      <div className="band-title"><span>02</span><div><h2>故事来源</h2><p>AI 原创或根据原稿改编</p></div></div>
      <fieldset className="story-source-controls">
        <div className="segmented" role="radiogroup" aria-label="故事来源">
          <button type="button" aria-pressed={sourceMode === 'ai'} className={sourceMode === 'ai' ? 'active' : ''} onClick={() => setSourceMode('ai')}><Sparkles size={17} />AI 原创</button>
          <button type="button" aria-pressed={sourceMode === 'written'} className={sourceMode === 'written' ? 'active' : ''} onClick={() => setSourceMode('written')}><PenLine size={17} />自己编写</button>
        </div>
        {sourceMode === 'ai' && <label className="field"><span>想加入的角色或情节（可选）</span><textarea rows={5} value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="例如：一只怕黑的小狐狸，在朋友陪伴下找到回家的星光。" maxLength={20_000} /></label>}
        {sourceMode === 'written' && <label className="field"><span>故事原稿</span><textarea rows={8} value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="写下完整故事或主要情节，AI 会忠实整理为章节。" required minLength={20} maxLength={20_000} /></label>}
      </fieldset>
    </section>

    <section className="form-band illustration-style-band">
      <div className="band-title"><span>03</span><div><h2>绘图风格</h2><p>用同一场景预览不同画材与气质</p></div></div>
      <fieldset className="illustration-style-picker">
        <legend className="sr-only">选择绘图风格</legend>
        <div className="illustration-style-options" role="radiogroup" aria-label="绘图风格">
          {ILLUSTRATION_STYLES.map((style) => <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={illustrationStyle === style.id}
            className={illustrationStyle === style.id ? 'active' : ''}
            onClick={() => setIllustrationStyle(style.id)}
          >
            <span className="illustration-style-preview"><img src={style.previewAsset} alt={`${style.label}风格：月光森林里的晚安旅程`} /></span>
            <span className="illustration-style-copy"><strong>{illustrationStyle === style.id && <Check size={15} />}{style.label}</strong><small>{style.description}</small></span>
          </button>)}
        </div>
        <p className="illustration-style-note">预览使用同一明亮场景真实生成，便于比较画材和质感；正式插图会按照故事角色与每章情节重新绘制。</p>
      </fieldset>
    </section>

    <section className="form-band compact-band">
      <div className="band-title"><span>04</span><div><h2>章节与朗读</h2><p>设置篇幅，并为每章选择朗读音色</p></div></div>
      <div className="production-options">
        <div className="chapter-stepper"><span>章节数量</span><div><button className="icon-button" type="button" title="减少章节" aria-label="减少章节" disabled={chapterCount <= 2} onClick={() => setChapterCount((value) => Math.max(2, value - 1))}><Minus size={18} /></button><strong aria-live="polite">{chapterCount}</strong><button className="icon-button" type="button" title="增加章节" aria-label="增加章节" disabled={chapterCount >= 12} onClick={() => setChapterCount((value) => Math.min(12, value + 1))}><Plus size={18} /></button></div><small>2–12 章</small></div>
        <div className="chapter-length-picker">
          <div className="chapter-length-heading"><span>每章文字字数</span><small>当前：每章 {chapterCharRange.min}–{chapterCharRange.max} 字</small></div>
          <div className="chapter-length-options" role="radiogroup" aria-label="每章文字字数">
            <button type="button" role="radio" aria-checked={chapterLengthPreset === 'recommended'} className={chapterLengthPreset === 'recommended' ? 'active' : ''} onClick={() => setChapterLengthPreset('recommended')}>
              <span>{chapterLengthPreset === 'recommended' && <Check size={14} />}适龄推荐</span>
              <strong>{selectedAgeProfile.recommendedChapterChars.min}–{selectedAgeProfile.recommendedChapterChars.max} 字</strong>
              <small>随孩子年龄自动调整</small>
            </button>
            {CHAPTER_LENGTH_PRESETS.map((option) => <button type="button" role="radio" aria-checked={chapterLengthPreset === option.id} className={chapterLengthPreset === option.id ? 'active' : ''} key={option.id} onClick={() => setChapterLengthPreset(option.id)}>
              <span>{chapterLengthPreset === option.id && <Check size={14} />}{option.label}</span>
              <strong>{option.range.min}–{option.range.max} 字</strong>
              <small>{option.description}</small>
            </button>)}
            <button type="button" role="radio" aria-checked={chapterLengthPreset === 'custom'} className={chapterLengthPreset === 'custom' ? 'active' : ''} onClick={() => setChapterLengthPreset('custom')}>
              <span>{chapterLengthPreset === 'custom' && <Check size={14} />}自定义</span>
              <strong>60–500 字</strong>
              <small>自行控制每章篇幅</small>
            </button>
          </div>
          {chapterLengthPreset === 'custom' && <div className="chapter-length-custom">
            <label className="field"><span>最少字数</span><input type="number" min={CHAPTER_CHAR_LIMITS.min} max={CHAPTER_CHAR_LIMITS.max} value={customChapterCharMin} onChange={(event) => setCustomChapterCharMin(Number(event.target.value))} required aria-invalid={!chapterCharRangeValid} /></label>
            <span aria-hidden="true">至</span>
            <label className="field"><span>最多字数</span><input type="number" min={CHAPTER_CHAR_LIMITS.min} max={CHAPTER_CHAR_LIMITS.max} value={customChapterCharMax} onChange={(event) => setCustomChapterCharMax(Number(event.target.value))} required aria-invalid={!chapterCharRangeValid} /></label>
            {!chapterCharRangeValid && <small role="alert">请输入 60–500 之间的整数，且最少字数不能大于最多字数。</small>}
          </div>}
        </div>
        {BACKGROUND_MUSIC_FEATURE_ENABLED && <fieldset className="music-library">
          <legend className="sr-only">选择背景音乐</legend>
          <div className="music-library-head">
            <div><span><Music2 size={16} />背景音乐</span><p>20 首轻音乐已内置在软件中，可离线试听和使用，不消耗在线额度。成品里可以关闭或调整音量。</p></div>
            {backgroundMusicEnabled && selectedBackgroundMusicTrack && <span className="music-current">已选 · {selectedBackgroundMusicTrack.label}</span>}
          </div>
          <div className="music-track-grid" role="radiogroup" aria-label="背景音乐">
            <div className={`music-track-card none ${!backgroundMusicEnabled ? 'active' : ''}`}>
              <button className="music-track-select" type="button" role="radio" aria-checked={!backgroundMusicEnabled} onClick={() => { setBackgroundMusicEnabled(false); stopMusicPreview() }}>
                <span className="music-track-symbol"><VolumeX size={19} /></span><span><strong>不使用背景音乐</strong><small>只保留故事朗读</small></span>{!backgroundMusicEnabled && <Check size={15} />}
              </button>
            </div>
            {BACKGROUND_MUSIC_TRACKS.map((track) => <div className={`music-track-card ${backgroundMusicEnabled && backgroundMusicTrackId === track.id ? 'active' : ''}`} key={track.id}>
              <button className="music-track-select" type="button" role="radio" aria-checked={backgroundMusicEnabled && backgroundMusicTrackId === track.id} onClick={() => { setBackgroundMusicEnabled(true); setBackgroundMusicTrackId(track.id) }}>
                <span className="music-track-symbol">♫</span>
                <span><strong>{track.label}</strong><small>{track.mood} · {track.description}</small></span>
                {backgroundMusicEnabled && backgroundMusicTrackId === track.id && <Check size={15} />}
              </button>
              <button className={`music-track-preview ${previewingMusicId === track.id ? 'playing' : ''}`} type="button" aria-label={`${previewingMusicId === track.id ? '停止' : '试听'}${track.label}`} title={`${previewingMusicId === track.id ? '停止' : '试听'}《${track.label}》`} onClick={() => void toggleMusicPreview(track.id)}>
                {previewingMusicId === track.id ? <Pause size={15} /> : <Play size={15} />}
              </button>
            </div>)}
          </div>
        </fieldset>}
        <label className="field"><span>朗读音色</span>
          <CustomVoiceSelect value={voiceId} onChange={(val: string) => { setVoiceId(val); onVoiceChanged(val) }} voices={voices} mandarinSystemVoices={mandarinSystemVoices} cantoneseSystemVoices={cantoneseSystemVoices} />
        </label>
      </div>
    </section>
    {error && <div className="inline-alert error" role="alert"><span>{neutralizeProviderBrand(error)}</span></div>}
    <div className="composer-submit"><div><strong>预计产物</strong><span>{chapterCount} 章文字（每章 {chapterCharRange.min}–{chapterCharRange.max} 字） · {chapterCount} 张插图 · {chapterCount} 段朗读{backgroundMusicEnabled && selectedBackgroundMusicTrack ? ` · 《${selectedBackgroundMusicTrack.label}》配乐` : ''} · 1 个 HTML</span></div><button className="button primary large" type="submit" disabled={busy || !voiceId || !chapterCharRangeValid || Boolean(!settings.hasMiniMaxKey && selectedSystemVoice)}><WandSparkles size={19} />{busy ? '正在创建任务…' : '开始制作故事'}</button></div>
  </form>
}

interface EnglishStoryComposerFormProps {
  title: string
  childName: string
  childAge: number
  theme: string
  sourceMode: CreateStorySourceMode
  sourceText: string
  chapterCount: number
  chapterLengthPreset: ChapterLengthPresetId
  customChapterCharMin: number
  customChapterCharMax: number
  chapterCharRange: { min: number; max: number }
  chapterCharRangeValid: boolean
  illustrationStyle: IllustrationStyleId
  selectedTemplateId?: string
  backgroundMusicEnabled: boolean
  backgroundMusicTrackId: BackgroundMusicTrackId
  previewingMusicId?: BackgroundMusicTrackId
  voiceId: string
  voices: VoiceProfile[]
  systemVoices: MiniMaxSystemVoice[]
  busy: boolean
  error: string
  settings: ProviderSettings
  onTitle(value: string): void
  onChildName(value: string): void
  onChildAge(value: number): void
  onTheme(value: string): void
  onSourceMode(value: CreateStorySourceMode): void
  onSourceText(value: string): void
  onChapterCount(value: number): void
  onChapterLengthPreset(value: ChapterLengthPresetId): void
  onCustomMin(value: number): void
  onCustomMax(value: number): void
  onIllustrationStyle(value: IllustrationStyleId): void
  onApplyTemplate(template: StoryTemplatePreset): void
  onBackgroundMusicEnabled(value: boolean): void
  onBackgroundMusicTrack(value: BackgroundMusicTrackId): void
  onStopMusicPreview(): void
  onToggleMusicPreview(trackId: BackgroundMusicTrackId): Promise<void>
  onVoice(value: string): void
  onOpenSettings(): void
  onSubmit(event: React.FormEvent): void
}

function EnglishStoryComposerForm(props: EnglishStoryComposerFormProps) {
  const { t } = useLanguage()
  const selectedAgeProfile = childAgeProfile(props.childAge)
  const templates = storyTemplates('en')
  const styles = illustrationStyles('en')
  const musicTracks = backgroundMusicTracks('en')
  const selectedMusicTrack = backgroundMusicTrack(props.backgroundMusicTrackId, 'en')
  return <form className="composer" onSubmit={props.onSubmit} aria-busy={props.busy}>
    <header className="section-head"><div><p className="eyebrow">Step 2</p><h1>Customize tonight's story</h1><p>Use a nickname and a simple theme. Avoid private details such as school or address.</p></div><BookOpenText size={28} /></header>
    <section className="story-template-band" aria-labelledby="english-story-template-title">
      <div className="story-template-heading"><div><span className="template-kicker"><Sparkles size={14} />Start with a gentle idea</span><h2 id="english-story-template-title">Story templates</h2><p>Fill in the theme, plot, chapter count, art style, and music in one click. The child's name and age remain unchanged.</p></div><span className="template-count">10 bedtime ideas</span></div>
      <div className="story-template-grid">{templates.map((template) => {
        const track = backgroundMusicTrack(template.backgroundMusicTrackId, 'en')
        return <button className={`story-template-card ${props.selectedTemplateId === template.id ? 'active' : ''}`} type="button" key={template.id} aria-pressed={props.selectedTemplateId === template.id} onClick={() => props.onApplyTemplate(template)}><span className="template-icon" aria-hidden="true">{template.icon}</span><span className="template-copy"><strong>{template.label}{props.selectedTemplateId === template.id && <Check size={14} />}</strong><small>{template.tagline}</small><em><Music2 size={12} />{track?.label}</em></span></button>
      })}</div>
    </section>
    <section className="form-band language-band"><div className="band-title"><span>00</span><div><h2>{t('storyLanguage')}</h2><p>{t('storyLanguageHint')}</p></div></div><div className="segmented" role="group" aria-label={t('storyLanguage')}><button type="button" className="active" aria-pressed="true">English</button></div></section>
    <section className="form-band"><div className="band-title"><span>01</span><div><h2>Story characters</h2><p>The nickname becomes the story's main character.</p></div></div><div className="form-grid three">
      <label className="field"><span>Story title</span><input value={props.title} onChange={(event) => props.onTitle(event.target.value)} placeholder="e.g. The Little Moon Post Office" required maxLength={80} /></label>
      <label className="field"><span>Child nickname</span><input value={props.childName} onChange={(event) => props.onChildName(event.target.value)} placeholder="e.g. Sunny" required maxLength={30} /></label>
      <label className="field"><span>Age</span><input type="number" min={2} max={14} value={props.childAge} onChange={(event) => props.onChildAge(Number(event.target.value))} required /></label>
      <div className="child-impact span-three"><div><UserRound size={17} aria-hidden="true" /><p><strong>How the nickname is used</strong><span>{props.childName || 'The nickname'} becomes the central protagonist, participates in choices and dialogue, and keeps a consistent look in each illustration.</span></p></div><div><CakeSlice size={17} aria-hidden="true" /><p><strong>{selectedAgeProfile.ageRange.replace('岁', ' years')} · Age guidance</strong><span>Vocabulary and plot complexity adapt to this age while keeping the selected chapter length.</span></p></div></div>
      <label className="field span-three"><span>Story theme</span><input value={props.theme} onChange={(event) => props.onTheme(event.target.value)} placeholder="e.g. learning to face the dark with a friend" required maxLength={120} /></label>
      <div className="theme-impact span-three"><Compass size={19} aria-hidden="true" /><div><strong>Your theme guides the whole story</strong><p>It shapes the setting, challenge, mood, and ending. Write what you hope the child experiences or understands, rather than a complete plot.</p><p className="theme-example"><b>Example:</b> “learning to face the dark” may become a moonlit forest journey where a friend helps the child find courage and return home feeling safe.</p></div></div>
    </div></section>
    <section className="form-band"><div className="band-title"><span>02</span><div><h2>Story source</h2><p>Start with an original idea or adapt your own draft.</p></div></div><fieldset className="story-source-controls"><div className="segmented" role="radiogroup" aria-label="Story source"><button type="button" aria-pressed={props.sourceMode === 'ai'} className={props.sourceMode === 'ai' ? 'active' : ''} onClick={() => props.onSourceMode('ai')}><Sparkles size={17} />AI original</button><button type="button" aria-pressed={props.sourceMode === 'written'} className={props.sourceMode === 'written' ? 'active' : ''} onClick={() => props.onSourceMode('written')}><PenLine size={17} />My draft</button></div>{props.sourceMode === 'ai' ? <label className="field"><span>Characters or plot to include (optional)</span><textarea rows={5} value={props.sourceText} onChange={(event) => props.onSourceText(event.target.value)} placeholder="e.g. a fox who is afraid of the dark finds the way home with a friend." maxLength={20_000} /></label> : <label className="field"><span>Story draft</span><textarea rows={8} value={props.sourceText} onChange={(event) => props.onSourceText(event.target.value)} placeholder="Write the story or its main plot. The AI will organize it into chapters." required minLength={20} maxLength={20_000} /></label>}</fieldset></section>
    <section className="form-band illustration-style-band"><div className="band-title"><span>03</span><div><h2>Art style</h2><p>Choose the visual feeling of the picture book.</p></div></div><fieldset className="illustration-style-picker"><div className="illustration-style-options" role="radiogroup" aria-label="Art style">{styles.map((style) => <button key={style.id} type="button" role="radio" aria-checked={props.illustrationStyle === style.id} className={props.illustrationStyle === style.id ? 'active' : ''} onClick={() => props.onIllustrationStyle(style.id)}><span className="illustration-style-preview"><img src={style.previewAsset} alt={`${style.label} preview`} /></span><span className="illustration-style-copy"><strong>{props.illustrationStyle === style.id && <Check size={15} />}{style.label}</strong><small>{style.description}</small></span></button>)}</div></fieldset></section>
    <section className="form-band compact-band"><div className="band-title"><span>04</span><div><h2>Chapters and narration</h2><p>Set the reading length and choose an English voice.</p></div></div><div className="production-options"><div className="chapter-stepper"><span>Number of chapters</span><div><button className="icon-button" type="button" title="Decrease chapters" aria-label="Decrease chapters" disabled={props.chapterCount <= 2} onClick={() => props.onChapterCount(Math.max(2, props.chapterCount - 1))}><Minus size={18} /></button><strong>{props.chapterCount}</strong><button className="icon-button" type="button" title="Increase chapters" aria-label="Increase chapters" disabled={props.chapterCount >= 12} onClick={() => props.onChapterCount(Math.min(12, props.chapterCount + 1))}><Plus size={18} /></button></div><small>2–12 chapters</small></div><div className="chapter-length-picker"><div className="chapter-length-heading"><span>Characters per chapter</span><small>Current: {props.chapterCharRange.min}–{props.chapterCharRange.max}</small></div><div className="chapter-length-options" role="radiogroup" aria-label="Characters per chapter"><button type="button" role="radio" aria-checked={props.chapterLengthPreset === 'recommended'} className={props.chapterLengthPreset === 'recommended' ? 'active' : ''} onClick={() => props.onChapterLengthPreset('recommended')}><span>{props.chapterLengthPreset === 'recommended' && <Check size={14} />}Age-based</span><strong>{selectedAgeProfile.recommendedChapterChars.min}–{selectedAgeProfile.recommendedChapterChars.max}</strong><small>Adjusts to the child's age</small></button>{CHAPTER_LENGTH_PRESETS.map((option) => <button type="button" role="radio" aria-checked={props.chapterLengthPreset === option.id} className={props.chapterLengthPreset === option.id ? 'active' : ''} key={option.id} onClick={() => props.onChapterLengthPreset(option.id)}><span>{props.chapterLengthPreset === option.id && <Check size={14} />}{option.id === 'short' ? 'Short' : option.id === 'standard' ? 'Standard' : 'Rich'}</span><strong>{option.range.min}–{option.range.max}</strong><small>{option.id === 'short' ? 'A quick bedtime read' : option.id === 'standard' ? 'Balanced detail' : 'More immersive detail'}</small></button>)}<button type="button" role="radio" aria-checked={props.chapterLengthPreset === 'custom'} className={props.chapterLengthPreset === 'custom' ? 'active' : ''} onClick={() => props.onChapterLengthPreset('custom')}><span>{props.chapterLengthPreset === 'custom' && <Check size={14} />}Custom</span><strong>60–500</strong><small>Choose your own length</small></button></div>{props.chapterLengthPreset === 'custom' && <div className="chapter-length-custom"><label className="field"><span>Minimum</span><input type="number" min={CHAPTER_CHAR_LIMITS.min} max={CHAPTER_CHAR_LIMITS.max} value={props.customChapterCharMin} onChange={(event) => props.onCustomMin(Number(event.target.value))} required /></label><span>to</span><label className="field"><span>Maximum</span><input type="number" min={CHAPTER_CHAR_LIMITS.min} max={CHAPTER_CHAR_LIMITS.max} value={props.customChapterCharMax} onChange={(event) => props.onCustomMax(Number(event.target.value))} required /></label></div>}</div>{BACKGROUND_MUSIC_FEATURE_ENABLED && <fieldset className="music-library"><legend className="sr-only">Choose background music</legend><div className="music-library-head"><div><span><Music2 size={16} />Background music</span><p>Twenty instrumental tracks are built in, work offline, and use no online quota. Readers can turn music off or adjust its volume.</p></div>{props.backgroundMusicEnabled && selectedMusicTrack && <span className="music-current">Selected · {selectedMusicTrack.label}</span>}</div><div className="music-track-grid" role="radiogroup" aria-label="Background music"><div className={`music-track-card none ${!props.backgroundMusicEnabled ? 'active' : ''}`}><button className="music-track-select" type="button" role="radio" aria-checked={!props.backgroundMusicEnabled} onClick={() => { props.onBackgroundMusicEnabled(false); props.onStopMusicPreview() }}><span className="music-track-symbol"><VolumeX size={19} /></span><span><strong>No background music</strong><small>Keep narration only</small></span>{!props.backgroundMusicEnabled && <Check size={15} />}</button></div>{musicTracks.map((track) => <div className={`music-track-card ${props.backgroundMusicEnabled && props.backgroundMusicTrackId === track.id ? 'active' : ''}`} key={track.id}><button className="music-track-select" type="button" role="radio" aria-checked={props.backgroundMusicEnabled && props.backgroundMusicTrackId === track.id} onClick={() => { props.onBackgroundMusicEnabled(true); props.onBackgroundMusicTrack(track.id) }}><span className="music-track-symbol">♫</span><span><strong>{track.label}</strong><small>{track.mood} · {track.description}</small></span>{props.backgroundMusicEnabled && props.backgroundMusicTrackId === track.id && <Check size={15} />}</button><button className={`music-track-preview ${props.previewingMusicId === track.id ? 'playing' : ''}`} type="button" aria-label={`${props.previewingMusicId === track.id ? 'Stop' : 'Preview'} ${track.label}`} title={`${props.previewingMusicId === track.id ? 'Stop' : 'Preview'} ${track.label}`} onClick={() => void props.onToggleMusicPreview(track.id)}>{props.previewingMusicId === track.id ? <Pause size={15} /> : <Play size={15} />}</button></div>)}</div></fieldset>}<label className="field"><span>English narration voice</span><CustomVoiceSelect value={props.voiceId} onChange={props.onVoice} voices={props.voices} mandarinSystemVoices={[]} cantoneseSystemVoices={[]} englishSystemVoices={props.systemVoices} language="en" /></label></div></section>
    {props.error && <div className="inline-alert error" role="alert"><span>{neutralizeProviderBrand(props.error)}</span></div>}
    <div className="composer-submit"><div><strong>Ready to create</strong><span>{props.chapterCount} chapters · {props.chapterCharRange.min}–{props.chapterCharRange.max} characters each · {props.chapterCount} illustrations · {props.chapterCount} narrated chapters{props.backgroundMusicEnabled && selectedMusicTrack ? ` · ${selectedMusicTrack.label}` : ''} · 1 HTML book</span></div><button className="button primary large" type="submit" disabled={props.busy || !props.voiceId || !props.chapterCharRangeValid || Boolean(!props.settings.hasMiniMaxKey)}><WandSparkles size={19} />{props.busy ? 'Creating…' : 'Create story'}</button></div>
  </form>
}

function CustomVoiceSelect({ value, onChange, voices, mandarinSystemVoices, cantoneseSystemVoices, englishSystemVoices = [], language = 'zh' }: any) {
  const [open, setOpen] = useState(false)
  const isEn = language === 'en'
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedVoice = [...voices, ...mandarinSystemVoices, ...cantoneseSystemVoices, ...englishSystemVoices].find(v => v.id === value)

  const handleSelect = (id: string) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div className="custom-voice-select" ref={containerRef}>
      <button type="button" className="voice-select-trigger" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={selectedVoice ? '' : 'placeholder'}>{selectedVoice ? selectedVoice.name : (isEn ? 'Choose a voice' : '选择音色')}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="voice-select-dropdown">
          {voices.length > 0 && (
            <div className="voice-select-group">
              <div className="voice-select-group-label">{isEn ? 'My personal voices' : '我的专属音色'}</div>
              {voices.map((voice: any) => (
                <button type="button" key={voice.id} className={`voice-select-option ${value === voice.id ? 'active' : ''}`} onClick={() => handleSelect(voice.id)}>
                  {voice.name} <small>{isEn ? `· Online clone${voice.status !== 'ready' ? ' (will be prepared first)' : ''}` : `· 在线复刻${voice.status !== 'ready' ? '（将先准备）' : ''}`}</small>
                  {value === voice.id && <Check size={14} className="check-icon" />}
                </button>
              ))}
            </div>
          )}
          {!isEn && mandarinSystemVoices.length > 0 && <div className="voice-select-group">
            <div className="voice-select-group-label">内置中文 · 普通话</div>
            {mandarinSystemVoices.map((voice: any) => (
              <button type="button" key={voice.id} className={`voice-select-option ${value === voice.id ? 'active' : ''}`} onClick={() => handleSelect(voice.id)}>
                {voice.bedtimeRecommendationRank ? <strong>★ 推荐 · {voice.name}</strong> : voice.name}
                {value === voice.id && <Check size={14} className="check-icon" />}
              </button>
            ))}
          </div>}
          {isEn && englishSystemVoices.length > 0 && <div className="voice-select-group">
            <div className="voice-select-group-label">Built-in English</div>
            {englishSystemVoices.map((voice: any) => (
              <button type="button" key={voice.id} className={`voice-select-option ${value === voice.id ? 'active' : ''}`} onClick={() => handleSelect(voice.id)}>
                {voice.bedtimeRecommendationRank ? <strong>Recommended · {voice.name}</strong> : voice.name}
                {value === voice.id && <Check size={14} className="check-icon" />}
              </button>
            ))}
          </div>}
          {!isEn && cantoneseSystemVoices.length > 0 && <div className="voice-select-group">
            <div className="voice-select-group-label">内置中文 · 粤语</div>
            {cantoneseSystemVoices.map((voice: any) => (
              <button type="button" key={voice.id} className={`voice-select-option ${value === voice.id ? 'active' : ''}`} onClick={() => handleSelect(voice.id)}>
                {voice.bedtimeRecommendationRank ? <strong>★ 推荐 · {voice.name}</strong> : voice.name}
                {value === voice.id && <Check size={14} className="check-icon" />}
              </button>
            ))}
          </div>}
        </div>
      )}
    </div>
  )
}
