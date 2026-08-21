const { app, BrowserWindow } = require('electron')
const { copyFile, mkdir, stat, writeFile } = require('node:fs/promises')
const { resolve } = require('node:path')
const { pathToFileURL } = require('node:url')

const projectRoot = resolve(__dirname, '..')
const sourcePath = resolve(projectRoot, 'resources/icon.svg')
const pngPath = resolve(projectRoot, 'resources/icon.png')
const icoPath = resolve(projectRoot, 'resources/icon.ico')
const rendererPublic = resolve(projectRoot, 'src/renderer/public')
const sizes = [16, 24, 32, 48, 64, 128, 256]

app.disableHardwareAcceleration()
app.setPath('userData', resolve(projectRoot, 'node_modules/.cache/icon-renderer'))

function createIco(frames) {
  const headerSize = 6 + frames.length * 16
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)

  let offset = headerSize
  frames.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16
    header.writeUInt8(size === 256 ? 0 : size, entry)
    header.writeUInt8(size === 256 ? 0 : size, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })

  return Buffer.concat([header, ...frames.map(({ png }) => png)])
}

app.whenReady().then(async () => {
  const renderer = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true, sandbox: true },
  })
  await renderer.loadURL(pathToFileURL(sourcePath).toString())
  const source = await renderer.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  if (source.isEmpty()) throw new Error(`Unable to render ${sourcePath}`)

  const appPng = source.resize({ width: 1024, height: 1024, quality: 'best' }).toPNG()
  const frames = sizes.map((size) => ({
    size,
    png: source.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }))

  await mkdir(rendererPublic, { recursive: true })
  await writeFile(pngPath, appPng)
  await writeFile(icoPath, createIco(frames))
  await copyFile(sourcePath, resolve(rendererPublic, 'app-icon.svg'))
  await writeFile(resolve(rendererPublic, 'app-icon.png'), appPng)

  const outputs = [
    pngPath,
    icoPath,
    resolve(rendererPublic, 'app-icon.svg'),
    resolve(rendererPublic, 'app-icon.png'),
  ]
  const savedFiles = await Promise.all(outputs.map(async (output) => ({ output, size: (await stat(output)).size })))
  if (savedFiles.some(({ size }) => size === 0)) throw new Error('Generated icon is empty')
  console.log(savedFiles.map(({ output, size }) => `${output} (${size} bytes)`).join('\n'))
  renderer.destroy()
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
