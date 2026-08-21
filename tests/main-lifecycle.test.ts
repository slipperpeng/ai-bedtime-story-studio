import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('main-process lifecycle', () => {
  it('disables Chromium input-volume adjustment before Electron becomes ready', async () => {
    const source = await readFile(resolve('src/main/index.ts'), 'utf8')
    const disableVolumeAdjustment = source.indexOf("app.commandLine.appendSwitch('disable-features', 'WebRtcAllowInputVolumeAdjustment')")
    const ready = source.indexOf('app.whenReady()')

    expect(disableVolumeAdjustment).toBeGreaterThan(-1)
    expect(ready).toBeGreaterThan(disableVolumeAdjustment)
  })

  it('arms the packaged screenshot exit after the renderer loads', async () => {
    const source = await readFile(resolve('src/main/index.ts'), 'utf8')
    const rendererLoaded = source.indexOf('await mainWindow.loadURL(rendererEntryUrl)')
    const screenshotScheduled = source.indexOf('if (screenshotPath) scheduleScreenshot(screenshotPath)')

    expect(rendererLoaded).toBeGreaterThan(-1)
    expect(screenshotScheduled).toBeGreaterThan(rendererLoaded)
    expect(source).toContain('BEDTIME_SCREENSHOT_SECTION')
    expect(source).toContain('BEDTIME_SCREENSHOT_SELECT_SYSTEM_VOICE')
    expect(source).toContain('BEDTIME_SCREENSHOT_STYLE_PREVIEWS')
    expect(source).toContain('.then(() => captureScreenshot(screenshotPath))')
  })

  it('quits instead of leaving a failed startup promise unhandled', async () => {
    const source = await readFile(resolve('src/main/index.ts'), 'utf8')

    expect(source).toContain("console.error('Unable to start application:', error)")
    expect(source).toMatch(/Unable to start application:[\s\S]*app\.quit\(\)/)
  })
})
