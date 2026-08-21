const { app, safeStorage } = require('electron')
const { createHash } = require('node:crypto')
const { mkdir, readFile, writeFile } = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const ts = require('typescript')

const projectRoot = resolve(__dirname, '..')
const defaultDataRoot = resolve(projectRoot, '.local-data')
const sourceText = '傍晚的阳光斜斜落在窗台上，聪聪蹲在书桌前，小心翼翼地捧着一个圆圆的玻璃缸。缸里住着一条小金鱼，鳞片一闪一闪，好像穿了一件琥珀黄的薄衣裳。聪聪轻轻敲了敲缸壁，笑着和它打招呼：“你好呀，我叫聪聪，从今天起起我们就是朋友啦，我给你起个名字叫小闪，好不好？”小金鱼甩了甩尾巴，好像点头一样。聪聪把一小撮鱼食轻轻撒进水里，眼睛弯成了两道小月牙。'
const tone = '温暖微笑'
const sceneType = 'warm'
const emotion = 'happy'
const speed = 0.80
const pitch = 0

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

function safeApiOrigin(value) {
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
  if (secrets.miniMaxOrigin && secrets.miniMaxOrigin !== safeApiOrigin(baseUrl)) {
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

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function playerHtml(manifest) {
  const items = manifest.files.map((item) => `
    <article>
      <p class="rank">推荐 ${item.rank} · ${item.locale === 'zh-CN' ? '普通话' : '粤语'}</p>
      <h2>${escapeHtml(item.name)}</h2>
      <p>${escapeHtml(item.reason)}</p>
      <audio controls preload="metadata" src="${encodeURI(item.file)}"></audio>
    </article>`).join('')
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>推荐音色对比试听</title><style>
body{margin:0;background:#f5faf7;color:#24342c;font:16px/1.6 system-ui,"Microsoft YaHei",sans-serif}main{width:min(860px,calc(100% - 32px));margin:32px auto 64px}h1{font-size:28px}header p{color:#596a61}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}article{background:#fff;border:1px solid #dce9e1;border-radius:8px;padding:18px;box-shadow:0 8px 24px rgba(41,73,56,.06)}h2{font-size:20px;margin:2px 0}.rank{color:#3e7a5a;font-weight:700;margin:0}audio{width:100%;margin-top:8px}.notice{padding:12px 14px;background:#fff8df;border-left:4px solid #e6b84b}
</style></head><body><main><header><h1>推荐音色对比试听</h1><p>模型：${escapeHtml(manifest.model)} · 语气：${escapeHtml(manifest.tone)} · 速度：${manifest.speed} · 情绪：${manifest.emotion}</p><p class="notice">原文保留了“从今天起起我们就是朋友啦”的两个“起”。粤语音色按粤语参数朗读普通话原文，只用于横向参考。</p></header><section>${items}</section></main></body></html>`
}

app.setName('ai-bedtime-story-studio')
app.whenReady().then(async () => {
  registerProjectTypeScript()
  const { MiniMaxSpeechProvider } = require('../src/main/providers/speech-provider.ts')
  const {
    MINIMAX_CHINESE_SYSTEM_VOICES,
    orderMiniMaxSystemVoicesForBedtime,
  } = require('../src/shared/minimax-system-voices.ts')

  const dataRoot = process.env.BEDTIME_DATA_ROOT
    ? resolve(process.env.BEDTIME_DATA_ROOT)
    : defaultDataRoot
  const outputRoot = resolve(dataRoot, 'recommended-voice-comparison', runId())
  const config = await loadConfig(dataRoot)
  const provider = new MiniMaxSpeechProvider(config)
  const voices = orderMiniMaxSystemVoicesForBedtime(MINIMAX_CHINESE_SYSTEM_VOICES)
    .filter((voice) => Number.isInteger(voice.bedtimeRecommendationRank))
  if (voices.length !== 2) throw new Error(`推荐音色数量异常：预期 2 个，实际 ${voices.length} 个。`)

  const preparedText = sourceText
  const manifest = {
    generatedAt: new Date().toISOString(),
    textSha256: createHash('sha256').update(sourceText).digest('hex'),
    sourceText,
    preparedText,
    model: config.model,
    tone,
    sceneType,
    emotion,
    speed,
    pitch,
    format: 'mp3',
    sampleRate: 44_100,
    bitrate: 128_000,
    channel: 1,
    files: [],
  }
  await mkdir(outputRoot, { recursive: true })

  for (let index = 0; index < voices.length; index += 1) {
    const voice = voices[index]
    const language = voice.locale === 'zh-CN' ? '普通话' : '粤语'
    const file = `${String(voice.bedtimeRecommendationRank).padStart(2, '0')}-${language}-${voice.name}.mp3`
    console.log(`[${index + 1}/${voices.length}] 正在生成：${language} · ${voice.name}`)
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
    await writeFile(resolve(outputRoot, file), audio.bytes)
    manifest.files.push({
      rank: voice.bedtimeRecommendationRank,
      id: voice.id,
      name: voice.name,
      locale: voice.locale,
      reason: voice.bedtimeRecommendationReason,
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
