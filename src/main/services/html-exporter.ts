import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname } from 'node:path'
import type { StoryProject } from '../../shared/contracts'
import { BACKGROUND_MUSIC_FEATURE_ENABLED } from '../../shared/features'
import { AppStore } from '../storage/store'

const mimeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
}

const playerScript = `(() => {
  const ICONS = {
    play: '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>',
    pause: '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>',
    volume2: '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>',
    volumeX: '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>',
    repeat: '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>',
    music: '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
    sliders: '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>',
    audioLines: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10v4"></path><path d="M6 7v10"></path><path d="M10 4v16"></path><path d="M14 7v10"></path><path d="M18 10v4"></path><path d="M22 11v2"></path></svg>',
    gauge: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 14 4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path></svg>'
  };
  const pages = Array.from(document.querySelectorAll('[data-page]'));
  const book = document.querySelector('[data-book]');
  const counter = document.querySelector('[data-counter]');
  const prev = document.querySelector('[data-prev]');
  const next = document.querySelector('[data-next]');
  const continuous = document.querySelector('[data-continuous]');
  const backgroundMusic = document.querySelector('[data-background-music]');
  const backgroundToggle = document.querySelector('[data-background-toggle]');
  const audioToggle = document.querySelector('[data-audio-toggle]');
  const speedControls = Array.from(document.querySelectorAll('[data-speed-value]'));
  const playbackRateLabels = Array.from(document.querySelectorAll('[data-playback-rate-label]'));
  const narrationVolumeControl = document.querySelector('[data-narration-volume]');
  const narrationVolumeOutput = document.querySelector('[data-narration-volume-output]');
  const narrationVolumeTool = document.querySelector('[data-narration-volume-tool]');
  const backgroundVolumeControl = document.querySelector('[data-background-volume]');
  const backgroundVolumeOutput = document.querySelector('[data-background-volume-output]');
  const popoverToggles = Array.from(document.querySelectorAll('[data-popover-toggle]'));
  const popovers = Array.from(document.querySelectorAll('[data-popover]'));
  const coverArt = document.querySelector('[data-cover-art]');
  const firstIllustration = document.querySelector('.chapter-page img');
  const deviceUserAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  const devicePlatform = typeof navigator === 'undefined' ? '' : navigator.platform || '';
  const deviceTouchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints || 0;
  const isIOSDevice = /iPad|iPhone|iPod/.test(deviceUserAgent)
    || (devicePlatform === 'MacIntel' && deviceTouchPoints > 1);
  const motionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  const animationDuration = 620;
  let index = 0;
  let playThrough = false;
  let locked = false;
  let navigationTimer = 0;
  let touchStart = null;
  let playbackRate = 1;
  let narrationVolume = 1;
  let backgroundVolume = 0.18;
  let backgroundMusicEnabled = Boolean(backgroundMusic);
  let audioContext = null;
  let backgroundGain = null;
  let audioGraphReady = false;
  const duckFactor = 0.22;
  const safeOutputGain = 0.85;
  const mediaBlobUrls = [];

  const audioFor = (pageIndex) => pages[pageIndex] && pages[pageIndex].querySelector('audio');
  const narrationAudios = () => pages.map((_, pageIndex) => audioFor(pageIndex)).filter(Boolean);
  const dataAudioToBlobUrl = (audio) => {
    if (!audio || typeof Blob === 'undefined' || typeof atob !== 'function'
      || !window.URL || typeof window.URL.createObjectURL !== 'function') return;
    const source = audio.querySelector && audio.querySelector('source');
    const sourceValue = source && source.getAttribute('src');
    const match = sourceValue && sourceValue.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) return;
    try {
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let byteIndex = 0; byteIndex < binary.length; byteIndex += 1) bytes[byteIndex] = binary.charCodeAt(byteIndex);
      const blobUrl = window.URL.createObjectURL(new Blob([bytes], { type: match[1] }));
      mediaBlobUrls.push(blobUrl);
      audio.src = blobUrl;
      if (typeof source.remove === 'function') source.remove();
      audio.load();
    } catch {}
  };
  narrationAudios().forEach(dataAudioToBlobUrl);
  dataAudioToBlobUrl(backgroundMusic);

  const setGain = (gainNode, value) => {
    if (!gainNode || !audioContext) return;
    const now = audioContext.currentTime || 0;
    if (typeof gainNode.gain.cancelAndHoldAtTime === 'function') gainNode.gain.cancelAndHoldAtTime(now);
    else {
      const currentValue = gainNode.gain.value;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(currentValue, now);
    }
    gainNode.gain.linearRampToValueAtTime(value, now + 0.06);
  };
  const narrationIsPlaying = () => narrationAudios().some((audio) => !audio.paused);
  const updateAudioMix = () => {
    const musicLevel = backgroundMusicEnabled
      ? backgroundVolume * (narrationIsPlaying() || playThrough ? duckFactor : 1)
      : 0;
    narrationAudios().forEach((audio) => { audio.volume = isIOSDevice ? 1 : narrationVolume; });
    if (audioGraphReady) {
      setGain(backgroundGain, musicLevel * safeOutputGain);
      return;
    }
    if (backgroundMusic) backgroundMusic.volume = musicLevel * safeOutputGain;
  };
  const ensureAudioGraph = () => {
    if (audioGraphReady) return true;
    if (!backgroundMusic) {
      updateAudioMix();
      return false;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      updateAudioMix();
      return false;
    }
    try {
      audioContext = new AudioContextClass();
      backgroundGain = audioContext.createGain();
      backgroundGain.gain.value = 0;
      backgroundGain.connect(audioContext.destination);
      backgroundMusic.volume = 1;
      audioContext.createMediaElementSource(backgroundMusic).connect(backgroundGain);
      audioGraphReady = true;
      updateAudioMix();
      return true;
    } catch {
      updateAudioMix();
      return false;
    }
  };
  const resumeAudioGraph = () => {
    ensureAudioGraph();
    if (audioContext && audioContext.state === 'suspended') {
      const resumed = audioContext.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    }
  };
  const syncAudioControls = () => {
    const audio = audioFor(index);
    const playing = Boolean(audio && !audio.paused);
    audioToggle.disabled = locked || !audio;
    audioToggle.setAttribute('aria-pressed', String(playing));
    audioToggle.setAttribute('aria-label', playing ? '暂停本章朗读' : '播放本章朗读');
    audioToggle.setAttribute('title', playing ? '暂停本章朗读' : '播放本章朗读');
    audioToggle.innerHTML = playing ? ICONS.pause : ICONS.play;
    speedControls.forEach((control) => control.setAttribute('aria-pressed', String(Number(control.getAttribute('data-speed-value')) === playbackRate)));
    playbackRateLabels.forEach((label) => { label.textContent = playbackRate.toFixed(1) + '×'; });
    if (narrationVolumeOutput) narrationVolumeOutput.textContent = Math.round(narrationVolume * 100) + '%';
    if (backgroundVolumeOutput) backgroundVolumeOutput.textContent = Math.round(backgroundVolume * 100) + '%';
  };
  const syncBackgroundMusic = () => {
    if (!backgroundToggle) return;
    backgroundToggle.setAttribute('aria-pressed', String(backgroundMusicEnabled));
    backgroundToggle.setAttribute('aria-label', backgroundMusicEnabled ? '关闭背景音乐' : '开启背景音乐');
    backgroundToggle.setAttribute('title', backgroundMusicEnabled ? '关闭背景音乐' : '开启背景音乐');
    backgroundToggle.innerHTML = backgroundMusicEnabled ? ICONS.music : ICONS.volumeX;
  };
  const updateBackgroundVolume = () => {
    updateAudioMix();
  };
  const startBackgroundMusic = () => {
    if (!backgroundMusic || !backgroundMusicEnabled || !backgroundMusic.paused) return;
    resumeAudioGraph();
    updateBackgroundVolume();
    const playback = backgroundMusic.play();
    if (playback && typeof playback.catch === 'function') playback.catch(() => {});
  };
  const setPlaybackRate = (rate) => {
    if (![0.8, 0.9, 1, 1.2].includes(rate)) return;
    playbackRate = rate;
    pages.forEach((_, pageIndex) => {
      const audio = audioFor(pageIndex);
      if (audio) audio.playbackRate = playbackRate;
    });
    syncAudioControls();
  };
  const setNarrationVolume = (value) => {
    narrationVolume = Math.max(0, Math.min(1, value));
    updateAudioMix();
    syncAudioControls();
  };
  const setBackgroundVolume = (value) => {
    backgroundVolume = Math.max(0, Math.min(0.6, value));
    updateAudioMix();
    syncAudioControls();
  };
  const closePopovers = (exceptName) => {
    popovers.forEach((popover) => { popover.hidden = popover.getAttribute('data-popover') !== exceptName; });
    popoverToggles.forEach((toggle) => toggle.setAttribute('aria-expanded', String(toggle.getAttribute('data-popover-toggle') === exceptName)));
  };
  const pageLabel = (pageIndex) => pages[pageIndex].getAttribute('data-label') || '第 ' + (pageIndex + 1) + ' 页';
  const isInteractive = (target) => {
    if (!target) return false;
    if (typeof target.closest === 'function' && target.closest('audio,button,a,input,textarea,select')) return true;
    return ['AUDIO', 'BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  };
  const syncControls = () => {
    counter.textContent = pageLabel(index) + ' · ' + (index + 1) + ' / ' + pages.length;
    prev.disabled = locked || index === 0;
    next.disabled = locked || index === pages.length - 1;
    continuous.disabled = locked;
    book.setAttribute('aria-busy', String(locked));
    syncAudioControls();
    syncBackgroundMusic();
  };
  const setPlayThrough = (enabled) => {
    playThrough = enabled;
    continuous.setAttribute('aria-pressed', String(playThrough));
    continuous.setAttribute('aria-label', playThrough ? '停止连续朗读' : '开启连续朗读');
    continuous.setAttribute('title', playThrough ? '停止连续朗读' : '开启连续朗读');
    continuous.innerHTML = ICONS.repeat;
    syncControls();
  };
  const pausePage = (pageIndex) => {
    const audio = audioFor(pageIndex);
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  };
  const playPage = (pageIndex) => {
    const audio = audioFor(pageIndex);
    if (!audio) {
      setPlayThrough(false);
      return;
    }
    const expectedIndex = pageIndex;
    resumeAudioGraph();
    audio.playbackRate = playbackRate;
    const playback = audio.play();
    if (playback && typeof playback.catch === 'function') {
      playback.catch(() => {
        if (index === expectedIndex) setPlayThrough(false);
      });
    }
  };
  const findNextAudioPage = (fromIndex) => {
    for (let pageIndex = fromIndex + 1; pageIndex < pages.length; pageIndex += 1) {
      if (audioFor(pageIndex)) return pageIndex;
    }
    return -1;
  };
  const cleanAnimation = () => {
    book.classList.remove('turning-forward', 'turning-backward');
    pages.forEach((page) => page.classList.remove(
      'is-entering-forward', 'is-entering-backward', 'is-leaving-forward', 'is-leaving-backward',
    ));
  };
  const finishNavigation = (targetIndex, shouldPlay, shouldFocus) => {
    cleanAnimation();
    index = targetIndex;
    pages.forEach((page, pageIndex) => {
      const isCurrent = pageIndex === index;
      page.hidden = !isCurrent;
      page.setAttribute('aria-hidden', String(!isCurrent));
    });
    const scrollRegion = pages[index].querySelector('[data-scroll]');
    if (scrollRegion) scrollRegion.scrollTop = 0;
    locked = false;
    navigationTimer = 0;
    syncControls();
    if (shouldFocus && typeof pages[index].focus === 'function') pages[index].focus({ preventScroll: true });
    if (shouldPlay) playPage(index);
  };
  const show = (nextIndex, shouldPlay = false, shouldFocus = true) => {
    if (locked) return false;
    closePopovers();
    const targetIndex = Math.max(0, Math.min(pages.length - 1, nextIndex));
    if (targetIndex === index) {
      if (shouldPlay) playPage(index);
      return false;
    }
    pausePage(index);
    const outgoing = pages[index];
    const incoming = pages[targetIndex];
    const direction = targetIndex > index ? 'forward' : 'backward';
    locked = true;
    incoming.hidden = false;
    incoming.setAttribute('aria-hidden', 'false');
    outgoing.setAttribute('aria-hidden', 'true');
    syncControls();
    if (motionQuery.matches) {
      finishNavigation(targetIndex, shouldPlay, shouldFocus);
      return true;
    }
    book.classList.add('turning-' + direction);
    outgoing.classList.add('is-leaving-' + direction);
    incoming.classList.add('is-entering-' + direction);
    navigationTimer = window.setTimeout(
      () => finishNavigation(targetIndex, shouldPlay, shouldFocus),
      animationDuration,
    );
    return true;
  };

  prev.addEventListener('click', () => show(index - 1, playThrough));
  next.addEventListener('click', () => show(index + 1, playThrough));
  continuous.addEventListener('click', () => {
    if (locked) return;
    if (playThrough) {
      pausePage(index);
      setPlayThrough(false);
      return;
    }
    setPlayThrough(true);
    if (audioFor(index)) {
      playPage(index);
      return;
    }
    const firstAudioPage = findNextAudioPage(index);
    if (firstAudioPage === -1) {
      setPlayThrough(false);
      return;
    }
    show(firstAudioPage, true, false);
  });
  if (backgroundToggle && backgroundMusic) {
    backgroundToggle.addEventListener('click', () => {
      backgroundMusicEnabled = !backgroundMusicEnabled;
      if (backgroundMusicEnabled) startBackgroundMusic();
      updateAudioMix();
      if (!backgroundMusicEnabled && !audioGraphReady) backgroundMusic.pause();
      syncBackgroundMusic();
    });
  }
  audioToggle.addEventListener('click', () => {
    if (locked) return;
    const audio = audioFor(index);
    if (!audio) return;
    if (audio.paused) {
      playPage(index);
    } else {
      audio.pause();
      setPlayThrough(false);
    }
    syncAudioControls();
  });
  speedControls.forEach((control) => control.addEventListener('click', () => {
    setPlaybackRate(Number(control.getAttribute('data-speed-value')));
    closePopovers();
  }));
  if (narrationVolumeControl) narrationVolumeControl.addEventListener('input', () => setNarrationVolume(Number(narrationVolumeControl.value) / 100));
  if (backgroundVolumeControl) backgroundVolumeControl.addEventListener('input', () => setBackgroundVolume(Number(backgroundVolumeControl.value) / 100));
  popoverToggles.forEach((toggle) => toggle.addEventListener('click', () => {
    const name = toggle.getAttribute('data-popover-toggle');
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    closePopovers(isOpen ? undefined : name);
  }));
  pages.forEach((page, pageIndex) => {
    const audio = audioFor(pageIndex);
    if (!audio) return;
    audio.addEventListener('play', () => { syncAudioControls(); updateBackgroundVolume(); });
    audio.addEventListener('pause', () => { syncAudioControls(); updateBackgroundVolume(); });
    audio.addEventListener('ended', () => {
      syncAudioControls();
      updateBackgroundVolume();
      if (!playThrough || pageIndex !== index || locked) return;
      const nextAudioPage = findNextAudioPage(pageIndex);
      if (nextAudioPage !== -1) {
        show(nextAudioPage, true, false);
        return;
      }
      setPlayThrough(false);
      if (index < pages.length - 1) show(pages.length - 1, false, false);
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePopovers();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || isInteractive(event.target) || locked) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(index - 1, playThrough);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + 1, playThrough);
    } else if (event.key === 'Home') {
      event.preventDefault();
      show(0, playThrough);
    } else if (event.key === 'End') {
      event.preventDefault();
      show(pages.length - 1, playThrough);
    }
  });
  book.addEventListener('touchstart', (event) => {
    if (locked || isInteractive(event.target) || !event.touches || event.touches.length !== 1) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  book.addEventListener('touchend', (event) => {
    if (!touchStart || locked || !event.changedTouches || event.changedTouches.length !== 1) {
      touchStart = null;
      return;
    }
    const deltaX = event.changedTouches[0].clientX - touchStart.x;
    const deltaY = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    show(index + (deltaX < 0 ? 1 : -1), playThrough);
  }, { passive: true });
  book.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
  document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (event) => {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  }, { passive: false });
  const beginAudioAfterInteraction = (event) => {
    resumeAudioGraph();
    const clickedMusicToggle = event && event.target && typeof event.target.closest === 'function'
      && event.target.closest('[data-background-toggle]');
    if (!clickedMusicToggle) startBackgroundMusic();
    document.removeEventListener('pointerdown', beginAudioAfterInteraction, true);
    document.removeEventListener('touchstart', beginAudioAfterInteraction, true);
    document.removeEventListener('keydown', beginAudioAfterInteraction, true);
  };
  document.addEventListener('pointerdown', beginAudioAfterInteraction, true);
  document.addEventListener('touchstart', beginAudioAfterInteraction, true);
  document.addEventListener('keydown', beginAudioAfterInteraction, true);
  document.addEventListener('pointerdown', (event) => {
    if (!event.target || typeof event.target.closest !== 'function' || !event.target.closest('[data-audio-dock]')) closePopovers();
  });
  window.addEventListener('beforeunload', () => {
    if (!window.URL || typeof window.URL.revokeObjectURL !== 'function') return;
    mediaBlobUrls.forEach((url) => window.URL.revokeObjectURL(url));
  });

  if (coverArt && firstIllustration) {
    const coverSource = firstIllustration.getAttribute('src');
    if (coverSource) coverArt.setAttribute('src', coverSource);
  }
  if (isIOSDevice) {
    if (narrationVolumeTool) narrationVolumeTool.hidden = true;
  }
  pages.forEach((page, pageIndex) => {
    const isCurrent = pageIndex === 0;
    page.hidden = !isCurrent;
    page.setAttribute('aria-hidden', String(!isCurrent));
  });
  if (navigationTimer) window.clearTimeout(navigationTimer);
  closePopovers();
  setPlaybackRate(1);
  setNarrationVolume(1);
  setBackgroundVolume(0.18);
  syncBackgroundMusic();
  syncControls();
})();`

export class HtmlExporter {
  constructor(private readonly store: AppStore) {}

  async build(project: StoryProject): Promise<string> {
    const html = await buildStandaloneHtml(project, async (asset) => {
      this.assertPublishableAsset(project, asset)
      return readFile(this.store.resolveAsset(asset))
    })
    const outputAsset = `projects/${project.id}/output/${safeFileName(project.title)}.html`
    const outputPath = this.store.resolveAsset(outputAsset)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, html, 'utf8')
    return outputAsset
  }

  private assertPublishableAsset(project: StoryProject, asset: string): void {
    const normalized = asset.replaceAll('\\', '/')
    if (!normalized.startsWith(`projects/${project.id}/`) || normalized.includes('/private/')) {
      throw new Error('分享文件拒绝内联私有或跨项目资源。')
    }
  }
}

export async function buildStandaloneHtml(
  project: StoryProject,
  loadAsset: (asset: string) => Promise<Buffer>,
): Promise<string> {
  if (!project.chapters.length) throw new Error('故事还没有章节。')
  const chapters = await Promise.all(project.chapters.map(async (chapter) => {
    if (!chapter.imageAsset || !chapter.audioAsset) {
      throw new Error(`第 ${chapter.index} 章缺少插图或音频，不能导出。`)
    }
    const [image, audio] = await Promise.all([loadAsset(chapter.imageAsset), loadAsset(chapter.audioAsset)])
    const imageMime = mimeByExtension[extname(chapter.imageAsset).toLowerCase()]
    const audioMime = mimeByExtension[extname(chapter.audioAsset).toLowerCase()]
    if (!imageMime?.startsWith('image/') || !audioMime?.startsWith('audio/')) {
      throw new Error(`第 ${chapter.index} 章包含不受支持的媒体格式。`)
    }
    return {
      ...chapter,
      imageSource: `data:${imageMime};base64,${image.toString('base64')}`,
      audioSource: `data:${audioMime};base64,${audio.toString('base64')}`,
      audioMime,
    }
  }))
  let backgroundMusicSource = ''
  let backgroundMusicMime = ''
  if (BACKGROUND_MUSIC_FEATURE_ENABLED && project.backgroundMusicEnabled && project.backgroundMusicAsset) {
    const music = await loadAsset(project.backgroundMusicAsset)
    backgroundMusicMime = mimeByExtension[extname(project.backgroundMusicAsset).toLowerCase()]
    if (!backgroundMusicMime?.startsWith('audio/')) throw new Error('背景音乐格式不受支持。')
    backgroundMusicSource = `data:${backgroundMusicMime};base64,${music.toString('base64')}`
  }
  const chapterPages = chapters.map((chapter) => `<article class="page chapter-page" data-page data-label="第 ${chapter.index} 章" hidden tabindex="-1" role="group" aria-roledescription="绘本页面" aria-label="第 ${chapter.index} 章：${escapeHtml(chapter.title)}">
      <figure class="illustration-sheet">
        <img src="${chapter.imageSource}" alt="${escapeHtml(chapter.imageAlt)}">
        <figcaption>第 ${chapter.index} 章</figcaption>
      </figure>
      <section class="text-sheet">
        <div class="chapter-mark"><span>第 ${chapter.index} 章</span><span aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg></span></div>
        <header class="chapter-heading"><h2>${escapeHtml(chapter.title)}</h2></header>
        <div class="story-scroll" data-scroll tabindex="0" aria-label="第 ${chapter.index} 章正文"><p class="story">${escapeHtml(chapter.text)}</p></div>
        <audio data-narration preload="metadata"><source src="${chapter.audioSource}" type="${chapter.audioMime}"></audio>
      </section>
    </article>`)
  const pages = [
    `<article class="page cover-page" data-page data-label="封面" hidden tabindex="-1" role="group" aria-roledescription="绘本页面" aria-label="《${escapeHtml(project.title)}》封面">
      <img class="cover-art" data-cover-art alt="">
      <div class="cover-tint" aria-hidden="true"></div>
      <header class="cover-title"><p>专属睡前绘本</p><h1>${escapeHtml(project.title)}</h1><span>献给 ${escapeHtml(project.childName)}</span></header>
    </article>`,
    ...chapterPages,
    `<article class="page back-page" data-page data-label="封底" hidden tabindex="-1" role="group" aria-roledescription="绘本页面" aria-label="封底">
      <div class="back-content">
        <p class="goodnight">晚安，${escapeHtml(project.childName)}</p>
        <h2>愿今晚的故事，陪你走进甜甜的梦乡。</h2>
        <div class="book-mark" aria-hidden="true"></div>
      </div>
    </article>`,
  ]
  const backgroundControls = backgroundMusicSource ? `<button class="dock-button music-button" data-background-toggle type="button" aria-pressed="true" aria-label="关闭背景音乐" title="关闭背景音乐"><span aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg></span></button>
          <div class="dock-tool music-volume-tool"><button class="dock-button" data-popover-toggle="music-volume" type="button" aria-expanded="false" aria-label="调节背景音乐音量" title="调节背景音乐音量"><span aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg></span></button><div class="control-popover" data-popover="music-volume" role="group" aria-label="背景音乐音量" hidden><div class="popover-head"><strong><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg> 背景音乐</strong><output data-background-volume-output>18%</output></div><input data-background-volume type="range" min="0" max="60" step="2" value="18" aria-label="背景音乐音量"><p>朗读时会自动轻柔降低</p></div></div>` : ''
  const scriptHash = createHash('sha256').update(playerScript).digest('base64')
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#184A4B"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}';">
<title>${escapeHtml(project.title)}</title><style>
:root{color-scheme:light;--teal:#184A4B;--green:#3C8D72;--green-dark:#286A56;--green-soft:#E2F3EB;--mint:#75C6A8;--sky:#86BBD0;--leaf:#3C8D72;--paper:#FFF9ED;--ink:#213D3C;--muted:#607776;--line:rgba(24,74,75,.18);--page-shadow:0 18px 52px rgba(24,74,75,.2)}
*{box-sizing:border-box;letter-spacing:0}html,body{margin:0;min-height:100%;background:#DDEBE6;color:var(--ink)}body{font-family:"Microsoft YaHei UI","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",system-ui,sans-serif}.shell{width:100%;min-width:0;min-height:100svh;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;overflow:hidden}.reader{position:relative;width:min(1288px,100%);min-width:0;min-height:0;margin:auto;padding:24px;display:grid;grid-template-columns:52px minmax(0,1160px) 52px;align-items:center;justify-content:center;gap:12px}.book-stage{position:relative;width:100%;aspect-ratio:1.62;max-height:calc(100svh - 150px);overflow:hidden;border:1px solid rgba(24,74,75,.2);border-radius:8px;background:var(--paper);box-shadow:var(--page-shadow);perspective:1600px;isolation:isolate}.page{position:absolute;inset:0;overflow:hidden;background:var(--paper);transform-style:preserve-3d;backface-visibility:hidden}.page[hidden]{display:none}.page:focus{outline:none}.chapter-page{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.chapter-page::after{content:"";position:absolute;z-index:4;top:0;bottom:0;left:50%;width:1px;background:rgba(24,74,75,.18);box-shadow:-8px 0 16px rgba(24,74,75,.12),8px 0 16px rgba(24,74,75,.08);pointer-events:none}.illustration-sheet{position:relative;min-width:0;min-height:0;margin:0;padding:28px;background:var(--sky);overflow:hidden}.illustration-sheet img{display:block;width:100%;height:100%;object-fit:contain;background:var(--paper);border:6px solid var(--paper);border-radius:4px;box-shadow:0 8px 24px rgba(24,74,75,.16)}.illustration-sheet figcaption{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.text-sheet{min-width:0;min-height:0;padding:clamp(28px,4vh,54px) clamp(30px,4vw,58px) 28px;display:grid;grid-template-rows:auto auto minmax(0,1fr);background:var(--paper)}.chapter-mark{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:12px;color:var(--green);border-bottom:2px solid var(--green)}.chapter-mark span{font-size:11px;font-weight:900}.chapter-heading{padding-bottom:0;margin-top:16px}.chapter-heading h2{max-width:100%;margin:0;color:var(--teal);font-size:30px;line-height:1.3;overflow-wrap:anywhere}.story-scroll{min-height:0;margin:18px -8px 12px 0;padding-right:12px;overflow:auto;overscroll-behavior:contain;scrollbar-color:rgba(95,146,121,.25) transparent;scrollbar-width:thin}.story-scroll::-webkit-scrollbar{width:4px}.story-scroll::-webkit-scrollbar-track{background:transparent}.story-scroll::-webkit-scrollbar-thumb{background:rgba(95,146,121,.24);border-radius:4px}.story-scroll:focus-visible{outline:3px solid rgba(60,141,114,.3);outline-offset:3px}.story{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#274544;font-family:"Kaiti SC","STKaiti","KaiTi","STSong","SimSun",serif;font-size:20px;line-height:1.9}.narration-strip{padding:12px 14px;background:#E6F1F0;border-left:5px solid var(--leaf)}.narration-label{display:block;margin-bottom:7px;color:var(--teal);font-size:12px;font-weight:800}.narration-strip audio{display:block;width:100%;height:44px}.cover-page{background:var(--teal)}.cover-art{display:block;width:100%;height:100%;object-fit:cover}.cover-tint{position:absolute;inset:0;background:rgba(24,74,75,.24)}.cover-title{position:absolute;left:0;right:0;bottom:8%;padding:24px 8%;background:rgba(24,74,75,.92);border-top:4px solid var(--green)}.cover-title p{margin:0 0 7px;color:var(--green);font-size:11px;font-weight:800}.cover-title h1{max-width:820px;margin:0 0 9px;color:#fff9ed;font-size:48px;line-height:1.18;overflow-wrap:anywhere}.cover-title span{color:#dbe9df;font-family:"Kaiti SC","STKaiti","KaiTi",serif;font-size:18px;font-weight:700}.back-page{display:grid;place-items:center;padding:8%;background:var(--teal);border:10px solid #5F9279;color:var(--paper);text-align:center}.back-content{width:min(680px,100%)}.goodnight{margin:0 0 12px;color:var(--sky);font-family:"Kaiti SC","STKaiti","KaiTi",serif;font-size:21px;font-weight:700}.back-content>h2{margin:0 auto;color:var(--paper);font-family:"Kaiti SC","STKaiti","KaiTi",serif;font-size:32px;line-height:1.55}.book-mark{width:72px;height:5px;margin:28px auto;background:var(--green);border-radius:3px}.edge-turn{display:grid;place-items:center;width:48px;height:48px;min-width:48px;min-height:48px;padding:0;border:1px solid rgba(24,74,75,.18);border-radius:50%;background:#fff;color:var(--teal);box-shadow:0 6px 18px rgba(24,74,75,.14);font:700 24px/1 system-ui,sans-serif;cursor:pointer}.edge-turn:hover:not(:disabled){background:var(--green-soft);color:var(--green-dark);border-color:var(--green);transform:translateY(-1px)}button{transition:background-color .18s ease,color .18s ease,transform .18s ease,opacity .18s ease}button:disabled{opacity:.32;cursor:not-allowed}button:focus-visible,a:focus-visible,audio:focus-visible{outline:3px solid rgba(60,141,114,.3);outline-offset:3px}.reader-controls{min-width:0;display:flex;align-items:center;justify-content:center;gap:14px;min-height:74px;padding:10px max(18px,env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom));background:#DDEBE6;border-top:1px solid var(--line)}.counter{min-width:112px;color:var(--muted);text-align:center;font-size:14px;font-variant-numeric:tabular-nums}.continuous-button{min-width:126px;min-height:46px;padding:0 18px;border:1px solid var(--green);border-radius:6px;background:var(--green);color:#fff;font:700 14px/1 "Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;cursor:pointer}.continuous-button[aria-pressed="true"]{border-color:var(--green-dark);background:var(--green-dark)}.is-entering-forward{animation:page-in-forward 390ms cubic-bezier(.22,.7,.24,1) both}.is-leaving-forward{z-index:2;animation:page-out-forward 390ms cubic-bezier(.22,.7,.24,1) both}.is-entering-backward{animation:page-in-backward 390ms cubic-bezier(.22,.7,.24,1) both}.is-leaving-backward{z-index:2;animation:page-out-backward 390ms cubic-bezier(.22,.7,.24,1) both}@keyframes page-in-forward{from{opacity:.72;transform:translateX(1.5%) rotateY(5deg)}to{opacity:1;transform:translateX(0) rotateY(0)}}@keyframes page-out-forward{from{opacity:1;transform:translateX(0) rotateY(0)}to{opacity:0;transform:translateX(-1.5%) rotateY(-5deg)}}@keyframes page-in-backward{from{opacity:.72;transform:translateX(-1.5%) rotateY(-5deg)}to{opacity:1;transform:translateX(0) rotateY(0)}}@keyframes page-out-backward{from{opacity:1;transform:translateX(0) rotateY(0)}to{opacity:0;transform:translateX(1.5%) rotateY(5deg)}}
@media(max-width:899px){.shell{grid-template-rows:minmax(0,1fr) auto}.reader{width:100%;padding:10px;display:block}.book-stage{width:100%;height:calc(100svh - 102px);min-height:510px;max-height:none;aspect-ratio:auto}.chapter-page{grid-template-columns:1fr;grid-template-rows:minmax(210px,43%) minmax(0,57%)}.chapter-page::after{display:none}.illustration-sheet{padding:12px}.illustration-sheet img{border-width:4px}.illustration-sheet figcaption{left:24px;bottom:24px}.text-sheet{padding:18px 18px 14px}.chapter-mark{padding-bottom:8px;margin-bottom:10px}.chapter-heading h2{font-size:24px}.story-scroll{margin-top:10px;margin-bottom:8px}.story{font-size:18px;line-height:1.78}.narration-strip{padding:8px 10px}.narration-label{margin-bottom:4px}.cover-title{bottom:7%;padding:20px 7%;border-top-width:4px}.cover-title h1{font-size:32px}.cover-title span{font-size:18px}.back-page{padding:10%;border-width:8px}.back-content>h2{font-size:27px}.edge-turn{position:fixed;z-index:8;top:auto;bottom:calc(12px + env(safe-area-inset-bottom));width:44px;height:44px;min-width:44px;min-height:44px;background:#fff;font-size:22px}.edge-prev{left:10px}.edge-next{right:10px}.reader-controls{min-height:82px;gap:10px;padding-right:64px;padding-left:64px}.counter{min-width:90px;font-size:13px}.continuous-button{min-width:118px;padding:0 14px}}
@media(max-width:420px){.book-stage{height:calc(100svh - 94px);min-height:480px}.chapter-page{grid-template-rows:minmax(190px,40%) minmax(0,60%)}.illustration-sheet{padding:8px}.text-sheet{padding:14px 14px 10px}.chapter-heading h2{font-size:22px}.story{font-size:17px}.narration-strip audio{height:40px}.reader-controls{min-height:74px;padding-left:60px;padding-right:60px}.counter{min-width:76px}.continuous-button{min-width:112px}.cover-title h1{font-size:29px}}
.book-stage{perspective:1800px}.page{will-change:transform,opacity,filter}.is-entering-forward,.is-entering-backward{z-index:1}.is-entering-forward{animation:page-reveal-forward 620ms cubic-bezier(.2,.72,.2,1) both}.is-entering-backward{animation:page-reveal-backward 620ms cubic-bezier(.2,.72,.2,1) both}.is-leaving-forward,.is-leaving-backward{z-index:3;pointer-events:none;box-shadow:0 22px 42px rgba(24,74,75,.28)}.is-leaving-forward{transform-origin:left center;animation:page-turn-forward 620ms cubic-bezier(.34,.02,.22,1) both}.is-leaving-backward{transform-origin:right center;animation:page-turn-backward 620ms cubic-bezier(.34,.02,.22,1) both}.is-leaving-forward::before,.is-leaving-backward::before{position:absolute;z-index:20;inset:0;content:"";pointer-events:none;animation:page-paper-shade 620ms ease-in-out both}.is-leaving-forward::before{background:linear-gradient(90deg,rgba(24,74,75,.02) 34%,rgba(24,74,75,.28) 88%,rgba(255,255,255,.52))}.is-leaving-backward::before{background:linear-gradient(270deg,rgba(24,74,75,.02) 34%,rgba(24,74,75,.28) 88%,rgba(255,255,255,.52))}@keyframes page-reveal-forward{from{opacity:.48;filter:brightness(.82);transform:translateX(2.4%) scale(.985)}to{opacity:1;filter:brightness(1);transform:translateX(0) scale(1)}}@keyframes page-reveal-backward{from{opacity:.48;filter:brightness(.82);transform:translateX(-2.4%) scale(.985)}to{opacity:1;filter:brightness(1);transform:translateX(0) scale(1)}}@keyframes page-turn-forward{0%{opacity:1;filter:brightness(1);transform:translateX(0) rotateY(0) scale(1)}58%{opacity:.98}100%{opacity:0;filter:brightness(.76);transform:translateX(-4%) rotateY(-78deg) scale(.985)}}@keyframes page-turn-backward{0%{opacity:1;filter:brightness(1);transform:translateX(0) rotateY(0) scale(1)}58%{opacity:.98}100%{opacity:0;filter:brightness(.76);transform:translateX(4%) rotateY(78deg) scale(.985)}}@keyframes page-paper-shade{0%{opacity:0}48%{opacity:.78}100%{opacity:.24}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}.is-entering-forward,.is-leaving-forward,.is-entering-backward,.is-leaving-backward{transform:none!important}}
.shell{height:100vh;height:100svh}.reader-controls{flex-wrap:wrap}.playback-controls{display:flex;align-items:center;justify-content:center;gap:10px}
@media(max-width:899px){.reader{height:100%;min-height:0}.book-stage{height:100%;min-height:0}.reader-controls{min-height:0;flex-direction:column;gap:0;padding:4px 12px calc(4px + env(safe-area-inset-bottom))}.edge-turn{display:none!important}.playback-controls{min-height:48px}}
@media(max-width:899px) and (orientation:landscape) and (max-height:600px){.shell{grid-template-rows:minmax(0,1fr) 58px}.reader{padding:8px 58px}.chapter-page{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:1fr}.chapter-page::after{display:block}.illustration-sheet{padding:10px}.illustration-sheet figcaption{left:22px;bottom:22px}.text-sheet{padding:12px 16px 9px}.chapter-mark{padding-bottom:6px;margin-bottom:8px}.chapter-heading h2{font-size:20px}.story-scroll{margin:7px -5px 6px 0;padding-right:7px}.story{font-size:15px;line-height:1.6}.narration-strip{padding:5px 8px}.narration-label{margin-bottom:2px;font-size:10px}.narration-strip audio{height:34px}.back-page{padding:12px 8%;border-width:8px;overflow:auto}.goodnight{margin-bottom:4px;font-size:15px}.back-content>h2{font-size:20px;line-height:1.35}.book-mark{width:52px;height:4px;margin:10px auto}.edge-turn{top:50%;transform:translateY(-50%)}.edge-prev{left:8px}.edge-next{right:8px}.reader-controls{min-height:58px;flex-flow:row nowrap;gap:8px;padding:4px 10px}.playback-controls{min-height:48px;flex:0 0 auto}}
.narration-strip audio{display:none}.narration-actions{display:flex;align-items:center;gap:10px}.narration-toggle{min-width:92px;min-height:42px;padding:0 16px;border:1px solid var(--leaf);border-radius:7px;background:var(--leaf);color:#fff;font:800 14px/1 "Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;cursor:pointer}.narration-toggle[aria-pressed="true"]{background:var(--green-dark);border-color:var(--green-dark)}.narration-speed{display:inline-flex;min-height:42px;align-items:center;gap:8px;padding:0 8px 0 12px;color:var(--teal);font-size:13px;font-weight:800;white-space:nowrap;background:#fff;border:1px solid var(--line);border-radius:7px}.narration-speed select{height:34px;padding:0 25px 0 8px;color:var(--teal);font:700 13px/1 "Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;background:#F4F8F6;border:0;border-radius:5px}.narration-speed select:focus-visible{outline:3px solid rgba(60,141,114,.3);outline-offset:2px}@media(max-width:420px){.narration-actions{gap:7px;flex-wrap:wrap}.narration-toggle{min-width:84px;min-height:40px;padding:0 12px;font-size:13px}.narration-speed{min-height:40px;padding-left:9px;font-size:12px}.narration-speed select{height:32px;font-size:12px}}
.background-music-button{min-height:46px;padding:0 14px;border:1px solid var(--leaf);border-radius:6px;background:#fff;color:var(--teal);font:700 13px/1 "Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;cursor:pointer;white-space:nowrap}.background-music-button[aria-pressed="true"]{background:#E6F1F0;border-color:var(--leaf)}[data-background-music]{display:none}@media(max-width:420px){.background-music-button{min-height:42px;padding:0 10px;font-size:12px}}
[data-narration],[data-background-music]{display:none}.text-sheet{grid-template-rows:auto auto minmax(0,1fr)}
.reader-controls{position:relative;display:flex;min-width:0;min-height:72px;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:7px max(12px,env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom));overflow:visible;background:rgba(221,235,230,.96);border-top:1px solid var(--line);backdrop-filter:blur(14px)}
.audio-dock{position:relative;z-index:20;display:flex;width:min(680px,100%);min-width:0;min-height:54px;align-items:center;gap:8px;padding:6px 8px;background:#fff;border:1px solid rgba(95,146,121,.4);border-radius:8px;box-shadow:0 10px 28px rgba(24,74,75,.14)}
.counter{display:block;flex:1 1 124px;min-width:96px;max-width:142px;overflow:visible;padding:0 8px;color:var(--muted);font-size:12px;line-height:1.35;text-align:center;white-space:nowrap;text-overflow:clip;font-variant-numeric:tabular-nums;border-right:1px solid rgba(95,146,121,.2)}
.dock-actions{display:flex;flex:0 1 auto;min-width:0;align-items:center;justify-content:center;gap:5px}.dock-tool{position:relative;flex:0 0 auto}
.dock-button{position:relative;display:grid;width:42px;height:42px;min-width:42px;padding:0;place-items:center;color:#466159;background:#F6FAF8;border:1px solid #D3E2DB;border-radius:7px;font:900 17px/1 "Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;cursor:pointer;transition:color .16s ease,background-color .16s ease,border-color .16s ease,transform .16s ease,box-shadow .16s ease}
.dock-button:hover:not(:disabled),.dock-button[aria-expanded="true"]{color:#206E58;background:#E6F3ED;border-color:#9AC9B5;transform:translateY(-1px);box-shadow:0 5px 12px rgba(60,141,114,.14)}.dock-button[aria-pressed="true"]{color:#17654F;background:#DFF1E8;border-color:#80BEA3}.dock-button:disabled{color:#AEBDB6;background:#F2F5F3;border-color:#E1E8E4;opacity:.72}
.play-button{color:#fff;background:var(--green);border-color:var(--green)}.play-button:hover:not(:disabled),.play-button[aria-pressed="true"]{color:#fff;background:var(--green-dark);border-color:var(--green-dark)}
.music-button[aria-pressed="true"]{color:var(--green-dark);background:var(--green-soft);border-color:var(--green)}
.speed-button{display:inline-flex;width:auto;min-width:58px;padding:0 10px;align-items:center;justify-content:center}
.speed-button small{color:inherit;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1;letter-spacing:-0.2px}
.control-popover{position:absolute;z-index:30;bottom:calc(100% + 12px);left:50%;width:218px;max-width:calc(100vw - 28px);padding:13px;color:#315F50;background:#fff;border:1px solid #BCD7CA;border-radius:8px;box-shadow:0 16px 38px rgba(24,74,75,.22);transform:translateX(-50%);animation:control-popover-in .16s ease-out}.control-popover::after{position:absolute;top:100%;left:50%;width:10px;height:10px;content:"";background:#fff;border-right:1px solid #BCD7CA;border-bottom:1px solid #BCD7CA;transform:translate(-50%,-5px) rotate(45deg)}.music-volume-tool .control-popover{right:-2px;left:auto;transform:none;animation-name:control-popover-right-in}.music-volume-tool .control-popover::after{right:16px;left:auto;transform:translateY(-5px) rotate(45deg)}
.popover-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.popover-head strong{color:var(--teal);font-size:12px}.popover-head output{color:var(--green);font-size:12px;font-weight:900;font-variant-numeric:tabular-nums}.control-popover input[type="range"]{display:block;width:100%;height:26px;margin:0;accent-color:var(--green);cursor:pointer}.control-popover p{margin:6px 0 0;color:#7A8D84;font-size:10px;text-align:center}
.speed-popover{width:250px}.speed-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.speed-options button{display:grid;min-width:0;min-height:52px;padding:6px 3px;place-items:center;align-content:center;gap:3px;color:#52665D;background:#F7FBF9;border:1px solid #D5E4DD;border-radius:6px;cursor:pointer}.speed-options button strong{font-size:11px}.speed-options button span{font-size:9px}.speed-options button[aria-pressed="true"]{color:#fff;background:var(--green);border-color:var(--green)}
@keyframes control-popover-in{from{opacity:0;transform:translate(-50%,6px) scale(.97)}to{opacity:1;transform:translate(-50%,0) scale(1)}}@keyframes control-popover-right-in{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@media(max-width:899px){.reader-controls{min-height:62px;gap:0;padding:4px 8px calc(4px + env(safe-area-inset-bottom))}.audio-dock{width:100%;min-height:54px;gap:5px;padding:5px 6px}.counter{flex:1 1 112px;min-width:96px;max-width:140px;padding:0 5px;font-size:10px}.dock-actions{flex:0 0 auto;gap:4px}.dock-button{width:40px;height:40px;min-width:40px}.speed-button{min-width:48px;padding:0 6px}.speed-button small{font-size:12px}.edge-turn{display:none!important}.control-popover{position:fixed;right:12px;bottom:calc(70px + env(safe-area-inset-bottom));left:12px;width:auto;max-width:none;transform:none}.control-popover::after{display:none}.music-volume-tool .control-popover{right:12px;left:12px}.control-popover,.music-volume-tool .control-popover{animation-name:control-popover-mobile-in}@keyframes control-popover-mobile-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}}
@media(max-width:360px){.counter{display:block;flex-basis:88px;min-width:84px;max-width:104px;padding-inline:3px;font-size:9px}.dock-actions{justify-content:center}.dock-button{width:38px;height:38px;min-width:38px}.speed-button{min-width:44px;padding:0 4px}}
@media(max-width:350px){.counter{flex-basis:82px;min-width:78px;max-width:96px;font-size:9px}.dock-actions{gap:3px}.dock-button{width:36px;height:36px;min-width:36px}.speed-button{min-width:44px;padding:0 4px}}
@media(prefers-reduced-motion:reduce){.dock-button{transition:none}.control-popover{animation:none}}
</style></head><body><div class="shell"><main class="reader" aria-label="《${escapeHtml(project.title)}》互动绘本"><button class="edge-turn edge-prev" data-prev type="button" aria-label="上一页" title="上一页" aria-keyshortcuts="ArrowLeft">←</button><div class="book-stage" data-book aria-busy="false">${pages.join('')}</div><button class="edge-turn edge-next" data-next type="button" aria-label="下一页" title="下一页" aria-keyshortcuts="ArrowRight">→</button></main>
<footer class="reader-controls"><div class="audio-dock" data-audio-dock><span class="counter" data-counter aria-live="polite" aria-atomic="true"></span><div class="dock-actions"><button class="dock-button play-button" data-audio-toggle type="button" aria-pressed="false" aria-label="播放本章朗读" title="播放本章朗读" disabled><span aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg></span></button><div class="dock-tool" data-narration-volume-tool><button class="dock-button" data-popover-toggle="voice-volume" type="button" aria-expanded="false" aria-label="调节人声音量" title="调节人声音量"><span aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg></span></button><div class="control-popover" data-popover="voice-volume" role="group" aria-label="人声音量" hidden><div class="popover-head"><strong><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10v4"></path><path d="M6 7v10"></path><path d="M10 4v16"></path><path d="M14 7v10"></path><path d="M18 10v4"></path><path d="M22 11v2"></path></svg> 人声音量</strong><output data-narration-volume-output>100%</output></div><input data-narration-volume type="range" min="0" max="100" step="5" value="100" aria-label="人声音量"></div></div><div class="dock-tool"><button class="dock-button speed-button" data-popover-toggle="speed" type="button" aria-expanded="false" aria-label="调节朗读语速" title="调节朗读语速"><small data-playback-rate-label aria-hidden="true">1.0×</small></button><div class="control-popover speed-popover" data-popover="speed" role="group" aria-label="朗读语速" hidden><div class="popover-head"><strong>朗读语速</strong><output data-playback-rate-label>1.0×</output></div><div class="speed-options"><button data-speed-value="0.8" type="button" aria-pressed="false"><strong>0.8×</strong><span>慢速</span></button><button data-speed-value="0.9" type="button" aria-pressed="false"><strong>0.9×</strong><span>睡前</span></button><button data-speed-value="1" type="button" aria-pressed="true"><strong>1.0×</strong><span>原速</span></button><button data-speed-value="1.2" type="button" aria-pressed="false"><strong>1.2×</strong><span>快速</span></button></div></div></div><button class="dock-button" data-continuous type="button" aria-pressed="false" aria-label="开启连续朗读" title="开启连续朗读"><span aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg></span></button>${backgroundControls}</div></div></footer>${backgroundMusicSource ? `<audio data-background-music loop preload="auto"><source src="${backgroundMusicSource}" type="${backgroundMusicMime}"></audio>` : ''}</div><script>${playerScript}</script></body></html>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!)
}

export function safeFileName(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80)
  const candidate = normalized || '睡前故事'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(candidate)
    ? `_${candidate}`
    : candidate
}
