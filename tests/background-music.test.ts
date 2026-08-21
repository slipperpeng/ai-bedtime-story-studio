import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_MUSIC_TRACKS,
  backgroundMusicTrack,
} from '../src/shared/background-music'
import { illustrationStylePreset } from '../src/shared/illustration-styles'
import { STORY_TEMPLATES } from '../src/shared/story-templates'

const musicRoot = fileURLToPath(new URL('../resources/background-music/', import.meta.url))

describe('built-in background music', () => {
  it('packages exactly 20 unique, non-empty MP3 tracks', async () => {
    expect(BACKGROUND_MUSIC_TRACKS).toHaveLength(20)
    expect(new Set(BACKGROUND_MUSIC_TRACKS.map((track) => track.id)).size).toBe(20)
    expect(new Set(BACKGROUND_MUSIC_TRACKS.map((track) => track.resourceFile)).size).toBe(20)

    for (const track of BACKGROUND_MUSIC_TRACKS) {
      expect(track.assetPath).toBe(`builtin-music/${track.id}.mp3`)
      const info = await stat(join(musicRoot, track.resourceFile))
      expect(info.isFile()).toBe(true)
      expect(info.size).toBeGreaterThan(1_000_000)
    }
  })

  it('keeps every story template connected to a valid track and illustration style', () => {
    expect(STORY_TEMPLATES).toHaveLength(10)
    for (const template of STORY_TEMPLATES) {
      expect(backgroundMusicTrack(template.backgroundMusicTrackId)).toBeDefined()
      expect(() => illustrationStylePreset(template.illustrationStyle)).not.toThrow()
      expect(template.storySeed.length).toBeGreaterThan(20)
    }
  })
})
