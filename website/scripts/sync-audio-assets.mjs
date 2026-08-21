import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const websiteDirectory = path.resolve(scriptDirectory, '..')
const sourceDirectory = path.resolve(websiteDirectory, '..', 'resources', 'background-music')
const targetDirectory = path.resolve(websiteDirectory, 'public', 'audio', 'music')

const sourceEntries = await readdir(sourceDirectory, { withFileTypes: true })
const musicFiles = sourceEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.mp3'))
  .map((entry) => entry.name)
  .sort()

if (musicFiles.length === 0) {
  throw new Error(`没有在 ${sourceDirectory} 中找到 MP3 音频`)
}

await mkdir(targetDirectory, { recursive: true })

const targetEntries = await readdir(targetDirectory, { withFileTypes: true })
await Promise.all(targetEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.mp3') && !musicFiles.includes(entry.name))
  .map((entry) => rm(path.join(targetDirectory, entry.name))))

await Promise.all(musicFiles.map((fileName) => copyFile(
  path.join(sourceDirectory, fileName),
  path.join(targetDirectory, fileName),
)))

console.log(`已同步 ${musicFiles.length} 首官网试听音乐`)
