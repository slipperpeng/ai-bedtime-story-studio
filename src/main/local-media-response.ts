import { open, readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'

const mimeByExtension: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
}

interface ByteRange {
  start: number
  end: number
}

export async function createLocalMediaResponse(
  filePath: string,
  request: Pick<Request, 'headers' | 'method'>,
): Promise<Response> {
  const file = await stat(filePath)
  if (!file.isFile()) return new Response('Not found', { status: 404 })

  const size = file.size
  const contentType = mimeByExtension[extname(filePath).toLowerCase()] || 'application/octet-stream'
  const commonHeaders = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  }
  const rangeHeader = request.headers.get('range')

  if (!rangeHeader) {
    const headers = { ...commonHeaders, 'Content-Length': String(size) }
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
    return new Response(Uint8Array.from(await readFile(filePath)), { status: 200, headers })
  }

  const range = parseSingleByteRange(rangeHeader, size)
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { ...commonHeaders, 'Content-Range': `bytes */${size}` },
    })
  }

  const length = range.end - range.start + 1
  const headers = {
    ...commonHeaders,
    'Content-Length': String(length),
    'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
  }
  if (request.method === 'HEAD') return new Response(null, { status: 206, headers })

  const handle = await open(filePath, 'r')
  try {
    const bytes = Buffer.allocUnsafe(length)
    const { bytesRead } = await handle.read(bytes, 0, length, range.start)
    return new Response(Uint8Array.from(bytes.subarray(0, bytesRead)), { status: 206, headers })
  } finally {
    await handle.close()
  }
}

export function parseSingleByteRange(value: string, size: number): ByteRange | undefined {
  if (!Number.isSafeInteger(size) || size <= 0 || value.includes(',')) return undefined
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim())
  if (!match || (!match[1] && !match[2])) return undefined

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return undefined
    return { start: Math.max(0, size - suffixLength), end: size - 1 }
  }

  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) {
    return undefined
  }
  return { start, end: Math.min(requestedEnd, size - 1) }
}
