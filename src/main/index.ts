import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { app, BrowserWindow, Menu, nativeImage, protocol, shell, Tray } from 'electron'
import { createApplicationMenuTemplate } from './application-menu'
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc'
import { createLocalMediaResponse } from './local-media-response'
import { clearProtocolHandlerIfRegistered } from './protocol-registration'
import { createRendererUrlPolicy } from './security/navigation'
import { SecretStore } from './security/secret-store'
import { HtmlExporter } from './services/html-exporter'
import { PipelineRunner } from './services/pipeline'
import { AppStore } from './storage/store'
import { backgroundMusicTrack } from '../shared/background-music'

app.commandLine.appendSwitch('disable-features', 'WebRtcAllowInputVolumeAdjustment')

protocol.registerSchemesAsPrivileged([
  { scheme: 'story-asset', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } },
])

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let createWindowPromise: Promise<void> | undefined
const hasSingleInstanceLock = app.requestSingleInstanceLock()

function ensureWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) return Promise.resolve()
  if (createWindowPromise) return createWindowPromise
  createWindowPromise = createWindow().finally(() => {
    createWindowPromise = undefined
  })
  return createWindowPromise
}

async function createWindow(): Promise<void> {
  const dataRoot = process.env.BEDTIME_DATA_ROOT
    ? resolve(process.env.BEDTIME_DATA_ROOT)
    : app.isPackaged
      ? resolve(app.getPath('userData'), 'data')
      : resolve(process.cwd(), '.local-data')
  const store = new AppStore(dataRoot)
  const secrets = new SecretStore(dataRoot, () => store.getSettings())
  await store.initialize()
  await secrets.initialize()

  const rendererEntryUrl = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).toString()
    : pathToFileURL(resolve(__dirname, '../renderer/index.html')).toString()
  const isTrustedRendererUrl = createRendererUrlPolicy(rendererEntryUrl)
  const builtInMusicRoot = app.isPackaged
    ? resolve(process.resourcesPath, 'background-music')
    : resolve(process.cwd(), 'resources/background-music')

  clearProtocolHandlerIfRegistered(protocol, 'story-asset')
  protocol.handle('story-asset', async (request) => {
    try {
      const url = new URL(request.url)
      if (url.host !== 'local') return new Response('Forbidden', { status: 403 })
      const asset = decodeURIComponent(url.pathname.slice(1))
      if (!isRendererAsset(asset)) return new Response('Forbidden', { status: 403 })
      if (asset.startsWith('builtin-music/')) {
        const track = backgroundMusicTrack(asset.slice('builtin-music/'.length, -'.mp3'.length))
        if (!track || track.assetPath !== asset) return new Response('Forbidden', { status: 403 })
        return await createLocalMediaResponse(resolve(builtInMusicRoot, track.resourceFile), request)
      }
      return await createLocalMediaResponse(store.resolveAsset(asset), request)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#f7faf8',
    icon: app.isPackaged
      ? resolve(process.resourcesPath, 'icon.png')
      : resolve(process.cwd(), 'resources/icon.png'),
    title: '枕边造梦',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (!tray) {
    const trayIconPath = app.isPackaged
      ? resolve(process.resourcesPath, 'icon.png')
      : resolve(process.cwd(), 'resources/icon.png')
    tray = new Tray(nativeImage.createFromPath(trayIconPath))
    tray.setToolTip('枕边造梦 · AI 睡前故事工坊')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开枕边造梦', click: () => { mainWindow?.show(); mainWindow?.focus() } },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]))
    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        void ensureWindow()
        return
      }
      mainWindow.show()
      mainWindow.focus()
    })
  }

  const rendererSession = mainWindow.webContents.session
  rendererSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const requestingUrl = details.requestingUrl || webContents?.getURL() || requestingOrigin
    return webContents === mainWindow?.webContents
      && permission === 'media'
      && details.isMainFrame
      && details.mediaType === 'audio'
      && isTrustedRendererUrl(requestingUrl)
  })
  rendererSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const media = details as Electron.MediaAccessPermissionRequest
    const mediaTypes = media.mediaTypes || []
    callback(
      webContents === mainWindow?.webContents
      && permission === 'media'
      && mediaTypes.length > 0
      && mediaTypes.every((type) => type === 'audio')
      && isTrustedRendererUrl(webContents.getURL()),
    )
  })

  const exporter = new HtmlExporter(store)
  const runner = new PipelineRunner(store, secrets, exporter, (job) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('bedtime:job-progress', job)
  }, builtInMusicRoot)
  registerIpcHandlers({ window: mainWindow, store, secrets, runner, exporter, isTrustedRendererUrl })

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`Preload failed (${preloadPath}):`, error)
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`Renderer failed to load ${url}: ${code} ${description}`)
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })
  mainWindow.on('closed', () => {
    mainWindow = undefined
    unregisterIpcHandlers()
  })

  await mainWindow.loadURL(rendererEntryUrl)
  const screenshotPath = process.env.BEDTIME_SCREENSHOT_PATH
  if (screenshotPath) scheduleScreenshot(screenshotPath)
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      void ensureWindow().catch((error) => console.error('Unable to reopen application window:', error))
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  void app.whenReady()
    .then(async () => {
      const menuTemplate = createApplicationMenuTemplate(process.platform)
      Menu.setApplicationMenu(menuTemplate ? Menu.buildFromTemplate(menuTemplate) : null)
      await ensureWindow()
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void ensureWindow().catch((error) => console.error('Unable to reopen application window:', error))
        }
      })
    })
    .catch((error) => {
      console.error('Unable to start application:', error)
      app.quit()
    })
}

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  tray?.destroy()
  tray = undefined
})

function isRendererAsset(asset: string): boolean {
  const normalized = asset.replaceAll('\\', '/')
  const extension = extname(normalized).toLowerCase()
  if (normalized.startsWith('builtin-music/') && normalized.endsWith('.mp3')) {
    const track = backgroundMusicTrack(normalized.slice('builtin-music/'.length, -'.mp3'.length))
    return track?.assetPath === normalized
  }
  if (normalized.startsWith('voices/')) return normalized.endsWith('/reference.wav')
  if (/^previews\/system-voices\/[0-9a-f]{64}\.mp3$/.test(normalized)) return true
  if (!normalized.startsWith('projects/')) return false
  return ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.wav', '.mp3', '.m4a', '.ogg'].includes(extension)
}

function scheduleScreenshot(screenshotPath: string): void {
  setTimeout(() => {
    void selectScreenshotSection()
      .then(() => captureScreenshot(screenshotPath))
      .catch((error) => console.error('Unable to capture application screenshot:', error))
      .finally(() => {
        if (process.env.BEDTIME_SCREENSHOT_QUIT === '1') app.quit()
      })
  }, 2_500)
}

async function selectScreenshotSection(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const sectionIndex = {
    voices: 0,
    story: 1,
    production: 2,
    library: 3,
  }[process.env.BEDTIME_SCREENSHOT_SECTION || '']
  if (sectionIndex === undefined) return
  await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('nav[aria-label="制作流程"] button')[${sectionIndex}]?.click()`)
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  if (process.env.BEDTIME_SCREENSHOT_SELECT_SYSTEM_VOICE === '1') {
    await mainWindow.webContents.executeJavaScript(`(() => {
      const selects = Array.from(document.querySelectorAll('select'))
      const narrator = selects.find((select) => Array.from(select.options).some((option) => option.value.startsWith('minimax-zh-')))
      const systemOption = narrator && Array.from(narrator.options).find((option) => option.value.startsWith('minimax-zh-'))
      if (narrator && systemOption) {
        narrator.value = systemOption.value
        narrator.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })()`)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  if (process.env.BEDTIME_SCREENSHOT_STYLE_PREVIEWS === '1') {
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.illustration-style-band')?.scrollIntoView({ block: 'start' })`)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  if (process.env.BEDTIME_SCREENSHOT_MUSIC_LIBRARY === '1') {
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.music-library')?.scrollIntoView({ block: 'start' })`)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
}

async function captureScreenshot(screenshotPath: string): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const width = screenshotDimension(process.env.BEDTIME_SCREENSHOT_WIDTH)
  const height = screenshotDimension(process.env.BEDTIME_SCREENSHOT_HEIGHT)
  if (!width || !height) {
    const image = await mainWindow.webContents.capturePage()
    await writeFile(resolve(screenshotPath), image.toPNG())
    return
  }

  const debuggerApi = mainWindow.webContents.debugger
  const attachedHere = !debuggerApi.isAttached()
  if (attachedHere) debuggerApi.attach('1.3')
  try {
    await debuggerApi.sendCommand('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: height,
    })
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    if (process.env.BEDTIME_SCREENSHOT_STYLE_PREVIEWS === '1') {
      await mainWindow.webContents.executeJavaScript(`document.querySelector('.illustration-style-band')?.scrollIntoView({ block: 'start' })`)
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    }
    const result = await debuggerApi.sendCommand('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    }) as { data?: string }
    if (!result.data) throw new Error('Chromium did not return screenshot data.')
    await writeFile(resolve(screenshotPath), Buffer.from(result.data, 'base64'))
  } finally {
    if (attachedHere && debuggerApi.isAttached()) debuggerApi.detach()
  }
}

function screenshotDimension(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isInteger(value) && value >= 240 && value <= 4_096 ? value : undefined
}
