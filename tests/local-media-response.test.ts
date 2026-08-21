import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalMediaResponse, parseSingleByteRange } from '../src/main/local-media-response'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('local media responses', () => {
  it('parses open, bounded, and suffix byte ranges', () => {
    expect(parseSingleByteRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 })
    expect(parseSingleByteRange('bytes=7-', 10)).toEqual({ start: 7, end: 9 })
    expect(parseSingleByteRange('bytes=-4', 10)).toEqual({ start: 6, end: 9 })
    expect(parseSingleByteRange('bytes=9-20', 10)).toEqual({ start: 9, end: 9 })
  })

  it('rejects malformed, multiple, and unsatisfiable byte ranges', () => {
    expect(parseSingleByteRange('bytes=0-1,4-5', 10)).toBeUndefined()
    expect(parseSingleByteRange('items=0-1', 10)).toBeUndefined()
    expect(parseSingleByteRange('bytes=10-', 10)).toBeUndefined()
    expect(parseSingleByteRange('bytes=5-4', 10)).toBeUndefined()
  })

  it('returns partial audio bytes with browser media range headers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bedtime-media-'))
    temporaryDirectories.push(directory)
    const audioPath = join(directory, 'chapter.wav')
    await writeFile(audioPath, Buffer.from('0123456789'))

    const response = await createLocalMediaResponse(audioPath, {
      method: 'GET',
      headers: new Headers({ Range: 'bytes=2-5' }),
    })

    expect(response.status).toBe(206)
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(response.headers.get('content-length')).toBe('4')
    expect(response.headers.get('content-type')).toBe('audio/wav')
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('2345')
  })

  it('returns 416 with the complete size for an invalid range', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bedtime-media-'))
    temporaryDirectories.push(directory)
    const audioPath = join(directory, 'chapter.mp3')
    await writeFile(audioPath, Buffer.from('audio'))

    const response = await createLocalMediaResponse(audioPath, {
      method: 'GET',
      headers: new Headers({ Range: 'bytes=99-' }),
    })

    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */5')
  })
})
