import {
  AudioLines,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Info,
  Library,
  Music2,
  MoonStar,
  Pause,
  Play,
  Repeat2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StoryProject, VoiceProfile } from '../../../shared/contracts'
import { BACKGROUND_MUSIC_FEATURE_ENABLED } from '../../../shared/features'
import { illustrationStylePreset } from '../../../shared/illustration-styles'
import { findMiniMaxSystemVoice } from '../../../shared/minimax-system-voices'
import { backgroundMusicTrack } from '../../../shared/background-music'

interface StoryPreviewProps {
  projects: StoryProject[]
  voices: VoiceProfile[]
  selectedId?: string
  onSelect(projectId: string): void
  onExport(projectId: string): Promise<void>
  onRemove(projectId: string): Promise<void>
}

type TurnDirection = 'forward' | 'backward'
type AudioTool = 'voice-volume' | 'speed' | 'music-volume'

const BACKGROUND_DUCK_FACTOR = 0.22
const SAFE_OUTPUT_GAIN = 0.85

interface PointerStart {
  x: number
  y: number
}

export function StoryPreview({ projects, voices, selectedId, onSelect, onExport, onRemove }: StoryPreviewProps) {
  const project = projects.find((item) => item.id === selectedId) || projects[0]
  const [pageIndex, setPageIndex] = useState(0)
  const [turnDirection, setTurnDirection] = useState<TurnDirection>('forward')
  const [isTurning, setIsTurning] = useState(false)
  const [continuousPlay, setContinuousPlay] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [narrationVolume, setNarrationVolume] = useState(1)
  const [backgroundMusicOn, setBackgroundMusicOn] = useState(false)
  const [backgroundMusicVolume, setBackgroundMusicVolume] = useState(0.18)
  const [openAudioTool, setOpenAudioTool] = useState<AudioTool>()
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const backgroundAudioRef = useRef<HTMLAudioElement>(null)
  const turnTimerRef = useRef<number | undefined>(undefined)
  const pointerStartRef = useRef<PointerStart | undefined>(undefined)
  const autoplayNextRef = useRef(false)
  const audioDockRef = useRef<HTMLDivElement>(null)

  const pageCount = (project?.chapters.length || 0) + 2

  const stopAudio = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setIsPlaying(false)
  }, [])

  const goToPage = useCallback((nextIndex: number) => {
    if (!project || isTurning || nextIndex === pageIndex || nextIndex < 0 || nextIndex >= pageCount) return
    if (continuousPlay) {
      const nextHasNarration = nextIndex > 0 && nextIndex <= project.chapters.length
      autoplayNextRef.current = nextHasNarration
      if (!nextHasNarration) setContinuousPlay(false)
    }
    stopAudio()
    setOpenAudioTool(undefined)
    setTurnDirection(nextIndex > pageIndex ? 'forward' : 'backward')
    setPageIndex(nextIndex)

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 900
    if (turnTimerRef.current !== undefined) window.clearTimeout(turnTimerRef.current)
    if (isMobile && !reduceMotion) {
      setIsTurning(true)
      turnTimerRef.current = window.setTimeout(() => {
        setIsTurning(false)
        turnTimerRef.current = undefined
      }, 500)
    } else {
      setIsTurning(false)
    }
  }, [continuousPlay, isTurning, pageCount, pageIndex, project, stopAudio])

  useEffect(() => {
    stopAudio()
    backgroundAudioRef.current?.pause()
    autoplayNextRef.current = false
    setPageIndex(0)
    setIsTurning(false)
    setContinuousPlay(false)
    setOpenAudioTool(undefined)
    setBackgroundMusicOn(BACKGROUND_MUSIC_FEATURE_ENABLED && Boolean(project?.backgroundMusicAsset))
  }, [project?.id, stopAudio])

  useEffect(() => {
    const music = backgroundAudioRef.current
    if (music) music.volume = backgroundMusicOn ? backgroundMusicVolume * (isPlaying || continuousPlay ? BACKGROUND_DUCK_FACTOR : 1) * SAFE_OUTPUT_GAIN : 0
  }, [backgroundMusicOn, backgroundMusicVolume, continuousPlay, isPlaying, project?.id])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = narrationVolume * SAFE_OUTPUT_GAIN
  }, [narrationVolume, pageIndex, project?.id])

  useEffect(() => {
    if (!openAudioTool) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !audioDockRef.current?.contains(event.target)) setOpenAudioTool(undefined)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenAudioTool(undefined)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [openAudioTool])

  useEffect(() => {
    if (!autoplayNextRef.current || isTurning) return
    autoplayNextRef.current = false
    const nextAudio = audioRef.current
    if (!nextAudio) {
      setContinuousPlay(false)
      return
    }
    nextAudio.playbackRate = playbackRate
    nextAudio.volume = narrationVolume * SAFE_OUTPUT_GAIN
    void nextAudio.play().catch(() => setContinuousPlay(false))
  }, [isTurning, narrationVolume, pageIndex, playbackRate])

  useEffect(() => () => {
    stopAudio()
    backgroundAudioRef.current?.pause()
    if (turnTimerRef.current !== undefined) window.clearTimeout(turnTimerRef.current)
  }, [stopAudio])

  const startBackgroundMusic = useCallback(() => {
    const music = backgroundAudioRef.current
    if (!music || !backgroundMusicOn || !music.paused) return
    music.volume = backgroundMusicVolume * (isPlaying || continuousPlay ? BACKGROUND_DUCK_FACTOR : 1) * SAFE_OUTPUT_GAIN
    void music.play().catch(() => undefined)
  }, [backgroundMusicOn, backgroundMusicVolume, continuousPlay, isPlaying])

  const pageLabels = useMemo(() => {
    if (!project) return []
    return ['封面', ...project.chapters.map((chapter) => `第 ${chapter.index} 章：${chapter.title}`), '封底']
  }, [project])

  if (!project) {
    return <div className="empty-state large-empty"><Library size={36} /><h2>还没有完成的故事</h2><p>故事制作完成后，图文和章节朗读会出现在这里。</p></div>
  }

  const chapter = pageIndex > 0 && pageIndex <= project.chapters.length ? project.chapters[pageIndex - 1] : undefined
  const firstChapter = project.chapters[0]
  const currentPageLabel = pageLabels[pageIndex]
  const systemVoice = findMiniMaxSystemVoice(project.voiceProfileId)
  const savedVoice = voices.find((voice) => voice.id === project.voiceProfileId)
  const narratorName = systemVoice?.name || savedVoice?.name || '已删除或不可用的音色'
  const narratorSource = systemVoice
    ? '内置中文'
    : savedVoice?.provider === 'minimax-online'
      ? '在线复刻'
      : savedVoice?.provider === 'local-qwen3'
        ? '历史本机音色（已停止支持）'
        : '来源不可用'
  const sourceLabel = project.sourceMode === 'ai' ? 'AI 原创' : project.sourceMode === 'written' ? '自己编写' : '历史录音转写'
  const styleLabel = illustrationStylePreset(project.illustrationStyle).label
  const selectedMusicTrack = backgroundMusicTrack(project.backgroundMusicTrackId)

  const exportStory = async () => {
    setExporting(true)
    try { await onExport(project.id) } finally { setExporting(false) }
  }

  const removeStory = async () => {
    setDeleting(true)
    try { await onRemove(project.id) } finally { setDeleting(false) }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('audio, button, input, label, select')) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goToPage(pageIndex - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      goToPage(pageIndex + 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      goToPage(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      goToPage(pageCount - 1)
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('audio, button, input, label')) return
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const start = pointerStartRef.current
    pointerStartRef.current = undefined
    if (!start) return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return
    goToPage(deltaX < 0 ? pageIndex + 1 : pageIndex - 1)
  }

  const handleAudioEnded = () => {
    setIsPlaying(false)
    if (continuousPlay && pageIndex < project.chapters.length) {
      autoplayNextRef.current = true
      goToPage(pageIndex + 1)
    } else if (continuousPlay) {
      setContinuousPlay(false)
      goToPage(pageCount - 1)
    }
  }

  const handleContinuousPlayChange = (enabled: boolean) => {
    setContinuousPlay(enabled)
    if (!enabled) {
      autoplayNextRef.current = false
      audioRef.current?.pause()
      return
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
      audioRef.current.volume = narrationVolume * SAFE_OUTPUT_GAIN
      void audioRef.current.play().catch(() => setContinuousPlay(false))
      return
    }
    if (pageIndex === 0 && project.chapters.length > 0) {
      autoplayNextRef.current = true
      goToPage(1)
      return
    }
    setContinuousPlay(false)
  }

  const handleAudioToggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.playbackRate = playbackRate
      audio.volume = narrationVolume * SAFE_OUTPUT_GAIN
      void audio.play().catch(() => setIsPlaying(false))
    } else {
      audio.pause()
      setContinuousPlay(false)
    }
  }

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate)
    if (audioRef.current) audioRef.current.playbackRate = rate
    setOpenAudioTool(undefined)
  }

  const handleNarrationVolumeChange = (volume: number) => {
    setNarrationVolume(volume)
    if (audioRef.current) audioRef.current.volume = volume * SAFE_OUTPUT_GAIN
  }

  const handleBackgroundVolumeChange = (volume: number) => {
    setBackgroundMusicVolume(volume)
    const music = backgroundAudioRef.current
    if (music) music.volume = backgroundMusicOn ? volume * (isPlaying || continuousPlay ? BACKGROUND_DUCK_FACTOR : 1) * SAFE_OUTPUT_GAIN : 0
  }

  const handleBackgroundMusicToggle = () => {
    const music = backgroundAudioRef.current
    if (!music) return
    if (backgroundMusicOn) {
      music.volume = 0
      setBackgroundMusicOn(false)
      return
    }
    music.volume = backgroundMusicVolume * (isPlaying || continuousPlay ? BACKGROUND_DUCK_FACTOR : 1) * SAFE_OUTPUT_GAIN
    setBackgroundMusicOn(true)
    void music.play().catch(() => setBackgroundMusicOn(false))
  }

  return <div className="preview-layout">
    <aside className="finished-library">
      <header className="aside-head"><div><p className="eyebrow">成品库</p><h2>{projects.length} 个故事</h2></div><Library size={20} /></header>
      <div className="project-list">{projects.map((item) => <button type="button" key={item.id} className={item.id === project.id ? 'active' : ''} onClick={() => onSelect(item.id)}><strong>{item.title}</strong><span>{item.chapters.length} 章 · {item.childName}</span></button>)}</div>
      <details className="production-config">
        <summary><Info size={16} />故事详情</summary>
        <dl>
          <div><dt>朗读音色</dt><dd>{narratorName}<small>{narratorSource}</small></dd></div>
          <div><dt>绘画风格</dt><dd>{styleLabel}</dd></div>
          <div><dt>故事来源</dt><dd>{sourceLabel}</dd></div>
          <div><dt>故事篇幅</dt><dd>{project.chapterCount} 章 · 每章 {project.chapterCharMin}–{project.chapterCharMax} 字</dd></div>
          {BACKGROUND_MUSIC_FEATURE_ENABLED && <div><dt>背景音乐</dt><dd>{project.backgroundMusicAsset ? <>{selectedMusicTrack?.label || project.backgroundMusicPrompt || '内置轻音乐'}<small>内置轻音乐 · 成品中可关闭</small></> : '未使用'}</dd></div>}
          <div><dt>制作时间</dt><dd>{new Date(project.createdAt).toLocaleString('zh-CN')}</dd></div>
        </dl>
      </details>
      <div className="library-actions"><button className="button primary full" type="button" onClick={() => void exportStory()} disabled={exporting || deleting}><Download size={18} />{exporting ? '正在导出…' : '导出绘本 HTML'}</button><button className="button secondary full" type="button" onClick={() => void removeStory()} disabled={exporting || deleting}><Trash2 size={17} />{deleting ? '正在删除…' : '删除本地故事'}</button></div>
    </aside>
    <main className="story-preview" onKeyDown={handleKeyDown} onPointerDownCapture={(event) => {
      if (BACKGROUND_MUSIC_FEATURE_ENABLED) {
        if (event.target instanceof Element && event.target.closest('.music-action')) return
        startBackgroundMusic()
      }
    }}>
      <header className="preview-head"><div><p className="eyebrow">步骤 4 · 绘本预览</p><h1>{project.title}</h1><p>献给 {project.childName} · {project.chapters.length} 章</p></div>{project.storyProvider === 'demo' && <span className="status-badge sampled">演示产物</span>}</header>

      <section
        className="storybook-stage"
        aria-label={`${project.title}绘本阅读器`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStartRef.current = undefined }}
      >
        <div className={`storybook-book ${isTurning ? `is-turning turn-${turnDirection}` : ''}`} key={`${project.id}-${pageIndex}`}>
          {pageIndex === 0 && <article className="storybook-cover">
            {firstChapter?.imageAsset
              ? <img src={window.bedtime.assets.toUrl(firstChapter.imageAsset)} alt="" />
              : <div className="storybook-cover-fallback"><MoonStar size={56} /></div>}
            <div className="storybook-cover-copy">
              <span><Sparkles size={16} /> 枕边造梦绘本</span>
              <h2>{project.title}</h2>
              <p>献给 {project.childName}</p>
            </div>
          </article>}

          {chapter && <article className="storybook-spread">
            <figure className="storybook-image-page">
              {chapter.imageAsset
                ? <img src={window.bedtime.assets.toUrl(chapter.imageAsset)} alt={chapter.imageAlt} />
                : <div className="missing-asset"><ImageIcon size={30} /><span>插图暂时缺席</span></div>}
              <figcaption>{chapter.imageAlt}</figcaption>
            </figure>
            <section className="storybook-text-page">
              <div className="storybook-chapter-mark"><span>第 {chapter.index} 章</span><BookOpenText size={18} /></div>
              <div className="storybook-copy-scroll">
                <h2>{chapter.title}</h2>
                <p>{chapter.text}</p>
              </div>
              {chapter.audioAsset && <audio className="storybook-chapter-audio" ref={audioRef} key={chapter.audioAsset} preload="auto" src={window.bedtime.assets.toUrl(chapter.audioAsset)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={handleAudioEnded} />}
              <span className="storybook-page-number">{chapter.index}</span>
            </section>
          </article>}

          {pageIndex === pageCount - 1 && <article className="storybook-back-cover">
            <div className="storybook-back-symbol"><MoonStar size={42} /></div>
            <p className="storybook-ending">晚安，{project.childName}</p>
            <h2>愿今晚的故事，陪你走进甜甜的梦乡。</h2>
          </article>}
        </div>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">当前页面：{currentPageLabel}</p>
      </section>

      <nav className="preview-controls" aria-label="绘本翻页">
        <button className="icon-button book-turn-button" type="button" title="上一页" aria-label="上一页" disabled={pageIndex === 0 || isTurning} onClick={() => goToPage(pageIndex - 1)}><ChevronLeft size={22} /></button>
        <div className="chapter-dots" role="group" aria-label="选择绘本页面">{pageLabels.map((label, index) => <button type="button" key={`${label}-${index}`} className={index === pageIndex ? 'active' : ''} aria-label={label} aria-current={index === pageIndex ? 'page' : undefined} disabled={isTurning} onClick={() => goToPage(index)} />)}</div>
        <button className="icon-button book-turn-button" type="button" title="下一页" aria-label="下一页" disabled={pageIndex === pageCount - 1 || isTurning} onClick={() => goToPage(pageIndex + 1)}><ChevronRight size={22} /></button>
      </nav>
      <div className="storybook-audio-dock" ref={audioDockRef}>
        <span className="audio-dock-page" title={currentPageLabel}><strong>{currentPageLabel}</strong><small className="tabular">{pageIndex + 1} / {pageCount}</small></span>
        <div className="audio-dock-actions">
          <button className="audio-dock-button primary-action" type="button" title={isPlaying ? '暂停本章朗读' : '播放本章朗读'} aria-label={isPlaying ? '暂停本章朗读' : '播放本章朗读'} aria-pressed={isPlaying} disabled={!chapter?.audioAsset} onClick={handleAudioToggle}>{isPlaying ? <Pause size={19} /> : <Play size={19} />}</button>
          <div className="audio-dock-tool">
            <button className={`audio-dock-button ${openAudioTool === 'voice-volume' ? 'is-open' : ''}`} type="button" title="调节人声音量" aria-label="调节人声音量" aria-expanded={openAudioTool === 'voice-volume'} onClick={() => setOpenAudioTool(openAudioTool === 'voice-volume' ? undefined : 'voice-volume')}>{narrationVolume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
            {openAudioTool === 'voice-volume' && <div className="audio-dock-popover" role="group" aria-label="人声音量">
              <div className="audio-popover-head"><span><AudioLines size={16} />人声音量</span><output>{Math.round(narrationVolume * 100)}%</output></div>
              <input type="range" min="0" max="100" step="5" value={Math.round(narrationVolume * 100)} aria-label="人声音量" onChange={(event) => handleNarrationVolumeChange(Number(event.target.value) / 100)} />
            </div>}
          </div>
          <div className="audio-dock-tool">
            <button className={`audio-dock-button speed-action ${openAudioTool === 'speed' ? 'is-open' : ''}`} type="button" title="调节朗读语速" aria-label={`调节朗读语速，当前 ${playbackRate.toFixed(1)} 倍`} aria-expanded={openAudioTool === 'speed'} onClick={() => setOpenAudioTool(openAudioTool === 'speed' ? undefined : 'speed')}><small>{playbackRate.toFixed(1)}×</small></button>
            {openAudioTool === 'speed' && <div className="audio-dock-popover speed-popover" role="group" aria-label="朗读语速">
              <div className="audio-popover-head"><span>朗读语速</span><output>{playbackRate.toFixed(1)}×</output></div>
              <div className="speed-preset-grid">{[{ value: 0.8, label: '慢速' }, { value: 0.9, label: '睡前' }, { value: 1, label: '原速' }, { value: 1.2, label: '快速' }].map((option) => <button type="button" key={option.value} className={playbackRate === option.value ? 'active' : ''} aria-pressed={playbackRate === option.value} onClick={() => handlePlaybackRateChange(option.value)}><strong>{option.value.toFixed(1)}×</strong><span>{option.label}</span></button>)}</div>
            </div>}
          </div>
          <button className="audio-dock-button" type="button" title={continuousPlay ? '停止连续朗读' : '开启连续朗读'} aria-label={continuousPlay ? '停止连续朗读' : '开启连续朗读'} aria-pressed={continuousPlay} onClick={() => handleContinuousPlayChange(!continuousPlay)}><Repeat2 size={19} /></button>
          {BACKGROUND_MUSIC_FEATURE_ENABLED && project.backgroundMusicAsset && <button className="audio-dock-button music-action" type="button" title={backgroundMusicOn ? '关闭背景音乐' : '开启背景音乐'} aria-label={backgroundMusicOn ? '关闭背景音乐' : '开启背景音乐'} aria-pressed={backgroundMusicOn} onClick={handleBackgroundMusicToggle}>{backgroundMusicOn ? <Music2 size={19} /> : <VolumeX size={19} />}</button>}
          {BACKGROUND_MUSIC_FEATURE_ENABLED && project.backgroundMusicAsset && <div className="audio-dock-tool music-volume-tool">
            <button className={`audio-dock-button ${openAudioTool === 'music-volume' ? 'is-open' : ''}`} type="button" title="调节背景音乐音量" aria-label="调节背景音乐音量" aria-expanded={openAudioTool === 'music-volume'} onClick={() => setOpenAudioTool(openAudioTool === 'music-volume' ? undefined : 'music-volume')}><SlidersHorizontal size={19} /></button>
            {openAudioTool === 'music-volume' && <div className="audio-dock-popover" role="group" aria-label="背景音乐音量">
              <div className="audio-popover-head"><span><Music2 size={16} />背景音乐</span><output>{Math.round(backgroundMusicVolume * 100)}%</output></div>
              <input type="range" min="0" max="60" step="2" value={Math.round(backgroundMusicVolume * 100)} aria-label="背景音乐音量" onChange={(event) => handleBackgroundVolumeChange(Number(event.target.value) / 100)} />
              <p>朗读时会自动轻柔降低</p>
            </div>}
          </div>}
        </div>
      </div>
      {BACKGROUND_MUSIC_FEATURE_ENABLED && project.backgroundMusicAsset && <audio ref={backgroundAudioRef} src={window.bedtime.assets.toUrl(project.backgroundMusicAsset)} loop preload="auto" />}
    </main>
  </div>
}
