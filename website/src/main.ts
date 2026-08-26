/* ==========================================================================
   应用程序主入口 (Main TypeScript Entry)
   ========================================================================== */

import './styles/main.css'
import './styles/book-3d.css'
import './styles/components.css'

import { createIcons, icons } from 'lucide'
import { Starfield } from './components/Starfield'
import { HeroBook3D } from './components/HeroBook3D'
import { VoiceStudio } from './components/VoiceStudio'
import { StyleGallery } from './components/StyleGallery'
import { MusicPlayer } from './components/MusicPlayer'
import { TemplateCarousel } from './components/TemplateCarousel'
import { LiveReaderSimulator } from './components/LiveReaderSimulator'
import { AmbientAudioBar } from './components/AmbientAudioBar'
import { initScrollAnimations } from './animations/scroll-choreography'
import { getWebsiteLanguage, initializeWebsiteLanguageToggle, translateStaticPage } from './i18n'

type DownloadEntry = {
  fileName: string
  versionUrl: string
}

type DownloadConfig = {
  version: string
  windows: DownloadEntry
  macos: DownloadEntry
}

async function applyDownloadConfig(language = getWebsiteLanguage()) {
  try {
    const response = await fetch('./downloads.json', { cache: 'no-store' })
    if (!response.ok) return
    const config = await response.json() as DownloadConfig

    const versionLabel = document.querySelector<HTMLElement>('[data-download-version]')
    if (versionLabel) versionLabel.textContent = language === 'en' ? `Desktop release · V${config.version}` : `客户端发布 · V${config.version}`

    const downloads = {
      windows: { entry: config.windows, label: 'Windows' },
      macos: { entry: config.macos, label: 'macOS' },
    }
    for (const [platform, { entry, label }] of Object.entries(downloads)) {
      const downloadLink = document.querySelector<HTMLAnchorElement>(`[data-download-platform="${platform}"]`)
      const fileName = document.querySelector<HTMLElement>(`[data-download-filename="${platform}"]`)
      const downloadLabel = document.querySelector<HTMLElement>(`[data-download-label="${platform}"]`)
      if (downloadLink && entry.versionUrl) {
        downloadLink.href = entry.versionUrl
        downloadLink.target = '_blank'
        downloadLink.removeAttribute('aria-disabled')
        if (downloadLabel) downloadLabel.textContent = language === 'en' ? `Download for ${label}` : `下载 ${label} 版`
      } else if (downloadLink) {
        downloadLink.removeAttribute('href')
        downloadLink.removeAttribute('target')
        downloadLink.setAttribute('aria-disabled', 'true')
        if (downloadLabel) downloadLabel.textContent = language === 'en' ? `${label} installer coming soon` : `${label} 安装包准备中`
      }
      if (fileName) fileName.textContent = entry.fileName
    }
  } catch {
    // The fallback links in index.html keep the website usable if the config is unavailable.
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const language = getWebsiteLanguage()
  translateStaticPage(language)
  initializeWebsiteLanguageToggle(language)

  // 1. 初始化 Lucide 图标
  createIcons({ icons })

  // 2. 初始化星空粒子画布
  new Starfield('star-canvas')

  // 3. 初始化 Hero 3D 书本
  new HeroBook3D()

  // 4. 初始化声音工坊
  new VoiceStudio()

  // 5. 初始化五大画风画廊
  new StyleGallery()

  // 6. 初始化 20 首轻音乐留声机
  new MusicPlayer()

  // 7. 初始化 10 大故事模板宇宙
  new TemplateCarousel()

  // 8. 初始化独立 HTML 绘本交互阅读模拟器
  new LiveReaderSimulator()

  // 9. 初始化悬浮晚安音乐胶囊
  new AmbientAudioBar()

  // 10. 初始化 GSAP 滚动时间轴动画
  initScrollAnimations()

  // 11. 移动端抽屉菜单交互绑定
  const menuToggle = document.getElementById('mobile-menu-toggle')
  const navDrawer = document.getElementById('mobile-nav-drawer')

  if (menuToggle && navDrawer) {
    menuToggle.addEventListener('click', () => {
      navDrawer.classList.toggle('open')
    })

    // 点击链接后自动收起抽屉
    navDrawer.querySelectorAll('.mobile-nav-link, .mobile-drawer-btn').forEach((link) => {
      link.addEventListener('click', () => {
        navDrawer.classList.remove('open')
      })
    })
  }

  // 12. 重新渲染动态插入的图标
  createIcons({ icons })

  void applyDownloadConfig(language)
})
