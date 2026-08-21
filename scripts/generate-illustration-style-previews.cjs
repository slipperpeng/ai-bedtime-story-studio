const { app, nativeImage, safeStorage } = require('electron')
const { mkdir, readFile, stat, writeFile } = require('node:fs/promises')
const { resolve } = require('node:path')

const projectRoot = resolve(__dirname, '..')
const outputRoot = resolve(projectRoot, 'src/renderer/public/illustration-styles')
const appDataFolder = 'ai-bedtime-story-studio'
const sharedSeed = 20260818

const sharedScene = [
  '用途：儿童睡前故事应用中的绘图风格预览卡片。',
  '场景：明亮清新的童话森林空地，浅蓝天空、奶油色晨光、远处柔和的小山、圆润树木、少量小花和蘑菇；明确是温暖清晨，不是夜晚。',
  '主体：同一位六岁左右的虚构绘本小朋友，黑色短发、珊瑚红睡衣、黄色小围巾，坐在奶油色圆形野餐垫上，微笑着给一只小巧圆润的白兔看打开的无字绘本；人物和白兔都要完整可见。',
  '构图：横版 3:2，中景平视，小朋友位于画面中央偏左，白兔位于中央偏右，太阳在右上方，两侧树木形成自然边框，主体占画面约一半，留有舒展呼吸感。',
  '光线：高明度、通透明亮的柔和晨光，阴影轻浅，面部清晰温暖，不出现大片深色或压暗滤镜。',
  '一致性要求：保持上述人物、服装、白兔、物件、机位和位置关系，不新增角色，不改变时间和天气。',
  '禁止：任何文字、字母、数字、水印、标志、边框、照片写实儿童、恐怖元素、阴暗夜景、强烈黑影、脏灰色滤镜。',
]

const previews = [
  {
    file: 'moonlight-watercolor.png',
    label: '月光水彩',
    style: '透明水彩儿童绘本，湿画法柔和晕染，细腻手工纸颗粒，边缘自然松弛，轻盈留白，虚构非写实人物。',
    palette: '雾蓝、月光黄、鼠尾草绿与少量珊瑚粉；整体低饱和但必须保持明亮、清透。',
    avoid: '厚重油彩、硬朗矢量块、塑料质感、照片写实。',
  },
  {
    file: 'paper-cut-collage.png',
    label: '纸艺拼贴',
    seed: 20260827,
    crop: { x: 110, y: 40, width: 840, height: 560 },
    lock: '媒介和角色数量锁定：画面必须是可触摸的分层彩纸剪贴；全画面只能出现两个角色——一个小朋友和一只白兔。除这两个角色外，不出现第二只兔子、其他动物、动物玩具或拟人物体。',
    style: '纯手工彩纸剪贴儿童绘本：天空、树木、山丘、人物、衣服、书本和白兔都必须由清晰可见的独立彩纸片剪裁并分层粘贴；强调纸张纤维、圆润剪裁边缘、纸层厚度和轻柔投影，不能画成普通数字插画。',
    palette: '森林绿、湖水蓝、奶油白、番茄红与暖黄色；层次清楚、明亮活泼但不刺眼。',
    avoid: '照片写实、透明水彩晕染、金属高光、复杂细碎背景；只能有一只白兔，不能出现第二只兔子；右下角和所有角落都只能是自然场景，绝不出现圆形图标、印章、签名或装饰性标记。',
  },
  {
    file: 'crayon-doodle.png',
    label: '蜡笔童画',
    lock: '媒介锁定：只能呈现孩子用粗蜡笔在纸上亲手画出的效果。必须满画面看见粗短蜡笔线、蜡质颗粒、重叠涂痕、露白和涂出轮廓的小瑕疵；宁可朴拙天真，也不要精致光滑。',
    style: '真实粗蜡笔和油画棒手绘儿童画：整张画都画在可见的暖白绘画纸上，每一处颜色都由粗糙、不均匀、反复叠加的蜡笔笔触构成，明显看到蜡质颗粒、纸纹、断续擦痕和稍微画出轮廓的色块；线条粗、朴拙、童真，绝不能像光滑数字插画。',
    palette: '天空蓝、草地绿、向日葵黄、莓果红与暖白纸色；明快、童真且不过度艳丽。',
    avoid: '精密写实、光滑渐变、数字喷枪、三维材质、动漫渲染、锐利描边、印刷矢量感。',
  },
  {
    file: 'colored-pencil.png',
    label: '彩铅童话',
    lock: '媒介锁定：只能呈现传统彩色铅笔在素描纸上逐笔排线的效果。人物、树木、草地和天空内部都必须清楚看见细线排线、交叉排线、笔压深浅和纸张留白，不能使用平滑数字色块。',
    style: '传统彩色铅笔手绘儿童绘本：整张画保留象牙白素描纸底，每个物体内部都有清晰细密的单向排线、交叉排线和多层叠色，轮廓带轻柔石墨铅笔线，局部留有未完全涂满的纸纹；细腻安静但必须一眼看出是彩铅手绘，不能像数字厚涂。',
    palette: '松针绿、晴空灰蓝、琥珀黄、砖红与象牙白；温暖明亮、细节丰富，不要压暗。',
    avoid: '照片写实、霓虹色、扁平矢量、数字喷枪、光滑渐变、油画笔触、大面积塑料高光。',
  },
  {
    file: 'soft-clay.png',
    label: '软陶梦境',
    style: '手工软陶定格动画风儿童绘本，圆润微缩角色，细微指纹与黏土纹理，柔软体积光，玩具舞台般的浅景深，虚构非写实人物。',
    palette: '薄荷绿、薰衣草蓝、蜂蜜黄、桃粉与浅天蓝；粉彩、高明度、低对比。',
    avoid: '真人照片、坚硬塑料、玻璃质感、尖锐结构、恐怖玩偶。',
  },
]

function buildPrompt(preview) {
  return [
    preview.lock || `媒介锁定：必须一眼看出是“${preview.label}”，不能退化成通用数字插画。`,
    ...sharedScene,
    `指定风格：${preview.label}。${preview.style}`,
    `配色：${preview.palette}`,
    `额外避免：${preview.avoid}`,
    '最终效果：温柔、明亮、富有童话感的儿童绘本插图，第一眼就能分辨指定画材。',
    preview.lock || `再次强调：画材只能是“${preview.label}”。`,
  ].join('\n')
}

function apiOrigin(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('MiniMax 服务地址必须是安全的 HTTPS 地址。')
  return url.origin
}

async function loadConfig() {
  const dataRoot = resolve(app.getPath('appData'), appDataFolder, 'data')
  const state = JSON.parse(await readFile(resolve(dataRoot, 'state.json'), 'utf8'))
  const encrypted = await readFile(resolve(dataRoot, 'provider-secrets.bin'))
  if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法读取应用加密保存的 MiniMax API Key。')
  const secrets = JSON.parse(safeStorage.decryptString(encrypted))
  const baseUrl = String(state.settings?.miniMaxBaseUrl || 'https://api.minimaxi.com/v1')
  if (!secrets.miniMaxApiKey) throw new Error('应用设置中没有 MiniMax API Key。')
  if (secrets.miniMaxOrigin && secrets.miniMaxOrigin !== apiOrigin(baseUrl)) {
    throw new Error('MiniMax API Key 与当前服务地址不匹配。')
  }
  return {
    apiKey: secrets.miniMaxApiKey,
    url: new URL(`${baseUrl.replace(/\/$/, '')}${state.settings?.miniMaxImagePath || '/image_generation'}`).toString(),
    model: state.settings?.miniMaxImageModel || 'image-01',
  }
}

function decodeBase64(value) {
  const match = /^data:image\/[a-z+.-]+;base64,(.+)$/s.exec(value)
  return Buffer.from((match?.[1] || value).replace(/\s/g, ''), 'base64')
}

async function extractImage(payload) {
  const data = payload.data || payload
  for (const candidate of [data.image_base64, data.base64, data.images]) {
    const first = Array.isArray(candidate) ? candidate[0] : candidate
    if (typeof first === 'string' && !first.startsWith('http')) return decodeBase64(first)
    if (first && typeof first === 'object') {
      const encoded = first.b64_json || first.base64
      if (typeof encoded === 'string') return decodeBase64(encoded)
    }
  }
  const urls = data.image_urls || data.urls
  const first = Array.isArray(urls) ? urls[0] : urls
  const imageUrl = first && typeof first === 'object' ? first.url : first
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) throw new Error('MiniMax 响应中没有可用图片。')
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error(`下载图片失败：HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function generatePreview(config, preview, index, total) {
  const prompt = buildPrompt(preview)
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      aspect_ratio: '3:2',
      response_format: 'base64',
      n: 1,
      seed: preview.seed || sharedSeed,
      prompt_optimizer: false,
      aigc_watermark: false,
    }),
    signal: AbortSignal.timeout(240_000),
  })
  if (!response.ok) throw new Error(`${preview.label}生成失败：HTTP ${response.status} ${await response.text()}`)
  const payload = await response.json()
  if (payload.base_resp?.status_code && payload.base_resp.status_code !== 0) {
    throw new Error(`${preview.label}生成失败：${payload.base_resp.status_msg || payload.base_resp.status_code}`)
  }
  const source = await extractImage(payload)
  const image = nativeImage.createFromBuffer(source)
  if (image.isEmpty()) throw new Error(`${preview.label}返回了无法识别的图片。`)
  const fullFrame = image.resize({ width: 960, height: 640, quality: 'best' })
  const framed = preview.crop ? fullFrame.crop(preview.crop) : fullFrame
  const normalized = framed.resize({ width: 960, height: 640, quality: 'best' }).toPNG()
  const output = resolve(outputRoot, preview.file)
  await writeFile(output, normalized)
  const size = (await stat(output)).size
  console.log(`[${index + 1}/${total}] ${preview.label}: ${output} (${size} bytes)`)
}

app.setName(appDataFolder)
app.whenReady().then(async () => {
  await mkdir(outputRoot, { recursive: true })
  const config = await loadConfig()
  const requestedIds = new Set(process.argv.slice(2))
  const selected = requestedIds.size
    ? previews.filter((preview) => requestedIds.has(preview.file.replace(/\.png$/, '')))
    : previews
  if (!selected.length) throw new Error('没有匹配到需要生成的绘图风格。')
  for (let index = 0; index < selected.length; index += 1) {
    await generatePreview(config, selected[index], index, selected.length)
  }
  app.quit()
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  app.exit(1)
})
