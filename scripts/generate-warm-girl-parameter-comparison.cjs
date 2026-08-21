const { app, safeStorage } = require('electron')
const { mkdir, readFile, writeFile } = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const ts = require('typescript')

const projectRoot = resolve(__dirname, '..')
const defaultDataRoot = resolve(projectRoot, '.local-data')
const sourceText = '傍晚的阳光斜斜落在窗台上，聪聪蹲在书桌前，小心翼翼地捧着一个圆圆的玻璃缸。缸里住着一条小金鱼，鳞片一闪一闪，好像穿了一件琥珀黄的薄衣裳。聪聪轻轻敲了敲缸壁，笑着和它打招呼：“你好呀，我叫聪聪，从今天起我们就是朋友啦，我给你起个名字叫小闪，好不好？”小金鱼甩了甩尾巴，好像点头一样。聪聪把一小撮鱼食轻轻撒进水里，眼睛弯成了两道小月牙。'
const tone = '温柔舒缓'
const sceneType = 'warm'

const variants = [
  {
    id: 'faster-existing-pauses',
    name: '提速 · 保留现有停顿',
    description: '只把速度提高到 0.76，保留现有 calm、低音调和全部停顿，用来判断是否主要是速度问题。',
    speed: 0.76,
    pitch: -2,
    emotion: 'calm',
    textMode: 'full-pauses',
  },
  {
    id: 'balanced-original-pitch',
    name: '平衡 · 恢复原音高',
    description: '速度 0.80、音调恢复 0，仍保留完整停顿，判断压低音调是否让少女声变得沉闷。',
    speed: 0.80,
    pitch: 0,
    emotion: 'calm',
    textMode: 'full-pauses',
  },
  {
    id: 'gentle-light-pauses',
    name: '推荐 A · 轻停顿舒缓',
    description: '速度 0.82、原音高、calm；移除逗号人工停顿，只在长句之间保留 0.20 秒轻停顿。',
    speed: 0.82,
    pitch: 0,
    emotion: 'calm',
    textMode: 'light-pauses',
  },
  {
    id: 'gentle-natural-punctuation',
    name: '推荐 B · 自然标点舒缓',
    description: '速度 0.82、原音高、calm；不插人工停顿，完全交给模型按中文标点组织呼吸。',
    speed: 0.82,
    pitch: 0,
    emotion: 'calm',
    textMode: 'raw',
  },
  {
    id: 'natural-model-default',
    name: '自然基线 · 不指定情绪',
    description: '速度 0.82、原音高、不发送 emotion，也不插人工停顿，用来判断 calm 是否导致平淡。',
    speed: 0.82,
    pitch: 0,
    textMode: 'raw',
  },
  {
    id: 'warm-smile',
    name: '推荐 C · 温暖微笑',
    description: '速度 0.80、原音高、happy；不插人工停顿，适合有互动和微笑的温暖童话段落。',
    speed: 0.80,
    pitch: 0,
    emotion: 'happy',
    textMode: 'raw',
  },
  {
    id: 'bright-fairy-tale',
    name: '明亮童话 · 稍快稍高',
    description: '速度 0.84、音调 +1、happy；更明亮活泼，观察是否过于兴奋或更像自然讲故事。',
    speed: 0.84,
    pitch: 1,
    emotion: 'happy',
    textMode: 'raw',
  },
  {
    id: 'curious-discovery',
    name: '好奇发现 · 惊喜感',
    description: '速度 0.82、音调 +1、surprised；只适合发现新事物的片段，用来确认动态情绪的上限。',
    speed: 0.82,
    pitch: 1,
    emotion: 'surprised',
    textMode: 'raw',
  },
]

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
  if (!secrets.miniMaxApiKey) throw new Error('项目配置中没有在线服务 API Key。')
  if (secrets.miniMaxOrigin && secrets.miniMaxOrigin !== apiOrigin(baseUrl)) {
    throw new Error('加密保存的 API Key 与当前在线服务地址不匹配。')
  }
  return {
    baseUrl,
    apiKey: secrets.miniMaxApiKey,
    model: String(state.settings?.miniMaxSpeechModel || 'speech-2.8-hd'),
  }
}

function runId() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function lighterPauses(text) {
  return text.replace(/<#([0-9]+(?:\.[0-9]+)?)#>/g, (_marker, rawSeconds) => (
    Number(rawSeconds) > 0.25 ? '<#0.2#>' : ''
  ))
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function playerHtml(manifest) {
  const cards = manifest.files.map((item) => `
  <article${item.recommended ? ' class="recommended"' : ''}>
    <p class="number">${String(item.index).padStart(2, '0')}${item.recommended ? ' · 优先试听' : ''}</p>
    <h2>${escapeHtml(item.name)}</h2>
    <p>${escapeHtml(item.description)}</p>
    <dl><div><dt>速度</dt><dd>${item.speed}</dd></div><div><dt>音调</dt><dd>${item.pitch}</dd></div><div><dt>情绪</dt><dd>${escapeHtml(item.emotion || '未指定')}</dd></div><div><dt>停顿</dt><dd>${escapeHtml(item.textModeLabel)}</dd></div></dl>
    <audio controls preload="metadata" src="${encodeURI(item.file)}"></audio>
  </article>`).join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>温暖少女参数对比</title><style>
body{margin:0;background:#f5faf7;color:#24342c;font:15px/1.6 system-ui,"Microsoft YaHei",sans-serif}main{width:min(920px,calc(100% - 32px));margin:32px auto 64px}h1{font-size:28px;margin-bottom:4px}header>p{color:#5c6d64}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}article{background:#fff;border:1px solid #dbe8e0;border-radius:8px;padding:18px}article.recommended{border-color:#67a77f;box-shadow:0 8px 24px rgba(45,105,72,.1)}h2{font-size:19px;margin:2px 0}.number{color:#367651;font-weight:700;margin:0}dl{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0}dl div{display:flex;gap:6px}dt{color:#718078}dd{margin:0;font-weight:600}audio{width:100%;margin-top:6px}
</style></head><body><main><header><h1>温暖少女 · 参数对比</h1><p>同一音色、同一段修正后的正文、同一模型和编码。建议先听 03、04、06，再用其他版本定位差异。</p></header><section>${cards}</section></main></body></html>`
}

app.setName('ai-bedtime-story-studio')
app.whenReady().then(async () => {
  registerProjectTypeScript()
  const { MiniMaxSpeechProvider } = require('../src/main/providers/speech-provider.ts')
  const { MINIMAX_CHINESE_SYSTEM_VOICES } = require('../src/shared/minimax-system-voices.ts')
  const { prepareMiniMaxNarrationText } = require('../src/shared/narration-script.ts')

  const dataRoot = process.env.BEDTIME_DATA_ROOT
    ? resolve(process.env.BEDTIME_DATA_ROOT)
    : defaultDataRoot
  const outputRoot = resolve(dataRoot, 'warm-girl-parameter-comparison', runId())
  const config = await loadConfig(dataRoot)
  const voice = MINIMAX_CHINESE_SYSTEM_VOICES.find((candidate) => candidate.id === 'minimax-zh-cn-047')
  if (!voice || voice.name !== '温暖少女') throw new Error('共享音色目录中找不到“温暖少女”。')
  const provider = new MiniMaxSpeechProvider(config)
  const fullPauses = prepareMiniMaxNarrationText(sourceText, tone, sceneType)
  const textModes = {
    'full-pauses': { label: '现有完整停顿', text: fullPauses },
    'light-pauses': { label: '只保留 0.20 秒轻停顿', text: lighterPauses(fullPauses) },
    raw: { label: '仅原文标点', text: sourceText },
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    voice: { id: voice.id, name: voice.name, remoteVoiceId: voice.remoteVoiceId },
    model: config.model,
    sourceText,
    files: [],
  }
  await mkdir(outputRoot, { recursive: true })

  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index]
    const textMode = textModes[variant.textMode]
    if (!textMode) throw new Error(`未知文本处理模式：${variant.textMode}`)
    const file = `${String(index + 1).padStart(2, '0')}-${variant.id}.mp3`
    console.log(`[${index + 1}/${variants.length}] 正在生成：${variant.name}`)
    const audio = await provider.synthesize({
      voiceId: voice.remoteVoiceId,
      text: textMode.text,
      model: config.model,
      format: 'mp3',
      sampleRate: 44_100,
      bitrate: 128_000,
      channel: 1,
      speed: variant.speed,
      pitch: variant.pitch,
      ...(variant.emotion ? { emotion: variant.emotion } : {}),
      languageBoost: voice.languageBoost,
    }, {
      signal: new AbortController().signal,
      report: (_progress, message) => {
        if (message.includes('等待服务恢复')) console.log(`  ${message}`)
      },
    })
    await writeFile(resolve(outputRoot, file), audio.bytes)
    manifest.files.push({
      index: index + 1,
      id: variant.id,
      name: variant.name,
      description: variant.description,
      speed: variant.speed,
      pitch: variant.pitch,
      emotion: variant.emotion,
      textMode: variant.textMode,
      textModeLabel: textMode.label,
      preparedText: textMode.text,
      recommended: [3, 4, 6].includes(index + 1),
      file,
      bytes: audio.bytes.byteLength,
    })
  }

  await writeFile(resolve(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(resolve(outputRoot, '试听.html'), playerHtml(manifest), 'utf8')
  console.log(`生成完成：${outputRoot}`)
  app.quit()
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  app.exit(1)
})
