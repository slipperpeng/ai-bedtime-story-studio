import { describe, expect, it } from 'vitest'
import { createApplicationMenuTemplate } from '../src/main/application-menu'

describe('application menu', () => {
  it('removes the default menu on Windows and Linux', () => {
    expect(createApplicationMenuTemplate('win32')).toBeNull()
    expect(createApplicationMenuTemplate('linux')).toBeNull()
  })

  it('provides the standard macOS commands with Chinese labels', () => {
    const template = createApplicationMenuTemplate('darwin')
    expect(template?.map((item) => item.label)).toEqual(['枕边造梦', '编辑', '窗口'])

    const labels = template
      ?.flatMap((item) => Array.isArray(item.submenu) ? item.submenu : [])
      .map((item) => item.label)
      .filter(Boolean)
    expect(labels).toContain('退出枕边造梦')
    expect(labels).toContain('复制')
    expect(labels).toContain('进入或退出全屏幕')
  })
})
