const { createHash } = require('node:crypto')
const { app, safeStorage } = require('electron')
const { mkdir, readFile, writeFile } = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const ts = require('typescript')

const projectRoot = resolve(__dirname, '..')
const outputRoot = resolve(projectRoot, 'website', 'public', 'story-demo')
const tone = '温柔舒缓'
const sceneType = 'warm'
const speed = 0.80
const pitch = 0
const emotion = 'calm'

function registerProjectTypeScript() {
  require.extensions['.ts'] = (module, filename) => {
    const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText
    module._compile(output, filename)
  }
}

function apiOrigin(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('在线语音服务地址必须是无凭据的 HTTPS 地址。')
  }
  return url.origin
}

async function loadConfig(dataRoot) {
  const state = JSON.parse(await readFile(resolve(dataRoot, 'state.json'), 'utf8'))
  const encrypted = await readFile(resolve(dataRoot, 'provider-secrets.bin'))
  if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法读取应用加密保存的 API Key。')
  const secrets = JSON.parse(safeStorage.decryptString(encrypted))
  const baseUrl = String(state.settings?.miniMaxBaseUrl || 'https://api.minimaxi.com/v1')
  if (!secrets.miniMaxApiKey) throw new Error('应用设置中没有保存 MiniMax API Key。')
  if (secrets.miniMaxOrigin && secrets.miniMaxOrigin !== apiOrigin(baseUrl)) {
    throw new Error('加密保存的 API Key 与当前在线服务地址不匹配。')
  }
  return {
    baseUrl,
    apiKey: secrets.miniMaxApiKey,
    model: String(state.settings?.miniMaxSpeechModel || 'speech-2.8-hd'),
  }
}

app.setName('ai-bedtime-story-studio')
app.whenReady().then(async () => {
  registerProjectTypeScript()
  const { MiniMaxSpeechProvider } = require('../src/main/providers/speech-provider.ts')
  const { MINIMAX_CHINESE_SYSTEM_VOICES } = require('../src/shared/minimax-system-voices.ts')
  const { prepareMiniMaxNarrationText } = require('../src/shared/narration-script.ts')
  const { DEMO_STORY_PAGES } = require('../website/src/components/LiveReaderSimulator.ts')

  const dataRoot = process.env.BEDTIME_DATA_ROOT
    ? resolve(process.env.BEDTIME_DATA_ROOT)
    : resolve(app.getPath('userData'), 'data')
  const config = await loadConfig(dataRoot)
  const provider = new MiniMaxSpeechProvider(config)
  const voice = MINIMAX_CHINESE_SYSTEM_VOICES.find((candidate) => candidate.id === 'minimax-zh-cn-047')
  if (!voice || voice.name !== '温暖少女') throw new Error('共享音色目录中找不到“温暖少女”。')

  await mkdir(outputRoot, { recursive: true })
  const manifest = {
    generatedAt: new Date().toISOString(),
    voice: { id: voice.id, name: voice.name, remoteVoiceId: voice.remoteVoiceId },
    model: config.model,
    settings: { format: 'mp3', sampleRate: 44_100, bitrate: 128_000, channel: 1, speed, pitch, emotion },
    chapters: [],
  }

  for (let index = 0; index < DEMO_STORY_PAGES.length; index += 1) {
    const chapter = DEMO_STORY_PAGES[index]
    const fileName = `narration-${index + 1}.mp3`
    const preparedText = prepareMiniMaxNarrationText(chapter.body, tone, sceneType)
    console.log(`[${index + 1}/${DEMO_STORY_PAGES.length}] 正在生成：${chapter.title}`)
    const audio = await provider.synthesize({
      voiceId: voice.remoteVoiceId,
      text: preparedText,
      model: config.model,
      format: 'mp3',
      sampleRate: 44_100,
      bitrate: 128_000,
      channel: 1,
      speed,
      pitch,
      emotion,
      languageBoost: voice.languageBoost,
    }, {
      signal: new AbortController().signal,
      report: (_progress, message) => {
        if (message.includes('等待服务恢复')) console.log(`  ${message}`)
      },
    })
    await writeFile(resolve(outputRoot, fileName), audio.bytes)
    manifest.chapters.push({
      index: chapter.chapterIndex,
      title: chapter.title,
      fileName,
      sourceTextSha256: createHash('sha256').update(chapter.body).digest('hex'),
      bytes: audio.bytes.byteLength,
    })
  }

  await writeFile(
    resolve(outputRoot, 'narration-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  console.log(`官网温暖少女旁白生成完成：${outputRoot}`)
  app.quit()
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  app.exit(1)
})
