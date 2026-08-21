import type { ImageProvider, GeneratedImage, ProviderRunContext } from './contracts'
import { fetchWithRetry, readErrorResponse } from './http'
import { assertMiniMaxSuccess, isRetryableMiniMaxResponse } from './minimax-response'

interface MiniMaxImageConfig {
  baseUrl: string
  path: string
  model: string
  apiKey: string
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024

const imageTypes: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export class MiniMaxImageProvider implements ImageProvider {
  constructor(private readonly config: MiniMaxImageConfig) {}

  async generate(input: Parameters<ImageProvider['generate']>[0], context: ProviderRunContext): Promise<GeneratedImage> {
    context.report(15, `正在生成《${input.title}》插图…`)
    const url = new URL(`${this.config.baseUrl.replace(/\/$/, '')}${this.config.path}`)
    const prompt = [
      input.styleBible.visualStyle,
      `固定配色：${input.styleBible.palette}`,
      `固定角色：${input.styleBible.characterDescriptions.join('；')}`,
      `本章场景：${input.prompt}`,
      `需要避免：${input.styleBible.negativePrompt}`,
      '儿童绘本横版插画，3:2 构图，主体完整，画面中不出现任何文字。',
    ].join('\n')
    const response = await fetchWithRetry(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        aspect_ratio: '3:2',
        response_format: 'base64',
        n: 1,
        seed: 20_260_000 + input.chapterIndex,
        prompt_optimizer: false,
        aigc_watermark: false,
      }),
    }, { signal: context.signal, timeoutMs: 240_000, retryResponse: isRetryableMiniMaxResponse })
    if (!response.ok) throw new Error(`MiniMax 插图生成失败：${await readErrorResponse(response)}`)
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error('MiniMax 插图生成失败：服务返回了无法解析的 JSON。')
    }
    assertMiniMaxSuccess(payload, 'MiniMax 插图生成')
    context.report(80, '正在下载并校验插图…')
    return this.extractImage(payload, context.signal)
  }

  private async extractImage(payload: Record<string, unknown>, signal: AbortSignal): Promise<GeneratedImage> {
    const data = (payload.data || payload) as Record<string, unknown>
    const base64Candidates = [data.image_base64, data.base64, data.images]
    for (const candidate of base64Candidates) {
      const first = Array.isArray(candidate) ? candidate[0] : candidate
      if (typeof first === 'string' && !first.startsWith('http')) {
        const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/s.exec(first)
        const encoded = match?.[2] || first
        return decodeImageBase64(encoded, match?.[1])
      }
      if (first && typeof first === 'object') {
        const record = first as Record<string, unknown>
        const encoded = record.b64_json || record.base64
        if (typeof encoded === 'string') {
          return decodeImageBase64(encoded, typeof record.mime_type === 'string' ? record.mime_type : undefined)
        }
      }
    }
    const urls = data.image_urls || data.urls
    const firstUrlValue = Array.isArray(urls) ? urls[0] : urls
    const firstUrl = firstUrlValue && typeof firstUrlValue === 'object'
      ? (firstUrlValue as Record<string, unknown>).url
      : firstUrlValue
    if (typeof firstUrl !== 'string' || !isSafeImageUrl(firstUrl)) {
      const metadata = payload.metadata as Record<string, unknown> | undefined
      if (Number(metadata?.failed_count) > 0) {
        throw new Error('MiniMax 插图生成失败：内容安全检查未通过，请调整本章插图描述。')
      }
      throw new Error('MiniMax 响应中没有可用插图。')
    }
    const response = await fetchWithRetry(firstUrl, { method: 'GET' }, { signal, attempts: 2, timeoutMs: 60_000 })
    if (!response.ok) throw new Error(`插图下载失败：HTTP ${response.status}`)
    if (response.url && !isSafeImageUrl(response.url)) throw new Error('插图下载被重定向到了不安全地址。')
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) throw new Error('下载的插图超过 25 MB。')
    const bytes = await readLimitedImageBody(response)
    return validatedImage(bytes, (response.headers.get('content-type') || '').split(';')[0])
  }
}

function isSafeImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function decodeImageBase64(value: string, hintedMimeType?: string): GeneratedImage {
  const encoded = value.replace(/\s/g, '')
  if (!encoded || encoded.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('MiniMax 返回的插图编码无效。')
  }
  return validatedImage(Buffer.from(encoded, 'base64'), hintedMimeType)
}

async function readLimitedImageBody(response: Response): Promise<Buffer> {
  if (!response.body) return validatedImageSize(Buffer.from(await response.arrayBuffer()))
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_IMAGE_BYTES) {
        await reader.cancel()
        throw new Error('下载的插图超过 25 MB。')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return validatedImageSize(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length))
}

function validatedImageSize(bytes: Buffer): Buffer {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('下载的插图大小无效。')
  return bytes
}

function validatedImage(bytes: Buffer, hintedMimeType?: string): GeneratedImage {
  validatedImageSize(bytes)
  const mimeType = detectImageMimeType(bytes)
  if (!mimeType) throw new Error(`插图格式不受支持：${hintedMimeType || 'unknown'}`)
  return { bytes, mimeType, extension: imageTypes[mimeType] }
}

function detectImageMimeType(bytes: Buffer): keyof typeof imageTypes | undefined {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return undefined
}

export class DemoImageProvider implements ImageProvider {
  async generate(input: Parameters<ImageProvider['generate']>[0], context: ProviderRunContext): Promise<GeneratedImage> {
    context.report(30, '正在绘制本地演示插图…')
    const title = escapeXml(input.title)
    const alt = escapeXml(input.alt)
    const moonX = 860 - ((input.chapterIndex * 47) % 180)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="${alt}">
<rect width="1200" height="800" fill="#dce8e2"/><rect y="550" width="1200" height="250" fill="#2f6f59"/>
<circle cx="${moonX}" cy="170" r="92" fill="#f2c94c"/><circle cx="${moonX + 34}" cy="140" r="92" fill="#dce8e2"/>
<path d="M0 590 C210 470 390 640 610 530 C800 440 980 590 1200 500 V800 H0Z" fill="#204d40"/>
<path d="M490 610 C520 480 600 440 660 610Z" fill="#e7654b"/><circle cx="575" cy="430" r="55" fill="#f3c9a8"/>
<path d="M520 420 Q575 350 630 420" fill="#2b2c30"/><path d="M380 620 Q465 520 535 630" fill="#3d7ea6"/>
<g fill="#f7f3dd"><circle cx="130" cy="130" r="7"/><circle cx="260" cy="210" r="5"/><circle cx="400" cy="105" r="6"/><circle cx="1030" cy="260" r="7"/></g>
<rect x="70" y="62" width="520" height="92" rx="8" fill="#ffffff" opacity=".88"/><text x="105" y="120" fill="#17231f" font-size="36" font-family="system-ui, sans-serif">${title}</text>
</svg>`
    await new Promise((resolve) => setTimeout(resolve, 180))
    context.report(90, '演示插图已完成。')
    return { bytes: Buffer.from(svg), mimeType: 'image/svg+xml', extension: 'svg' }
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[character]!)
}
