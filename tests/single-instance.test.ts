import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('desktop single-instance guard', () => {
  it('prevents a second app process from racing shared model state', async () => {
    const source = await readFile(resolve('src/main/index.ts'), 'utf8')

    expect(source).toContain('app.requestSingleInstanceLock()')
    expect(source).toContain("app.on('second-instance'")
    expect(source).toContain('app.quit()')
    expect(source).toContain('mainWindow.focus()')
  })
})
