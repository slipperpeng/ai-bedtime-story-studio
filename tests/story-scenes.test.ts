import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  hydrateStoryScenes,
  sceneSettings,
  splitNarrativeText,
  stableStorySceneId,
  transitionPauseMs,
} from '../src/shared/story-scenes'

describe('story emotion scenes', () => {
  it('accepts only a lossless scene plan and assigns stable persisted metadata', () => {
    const chapterId = randomUUID()
    const text = '月亮照进窗台。\n小禾发现了一封信。晚安。'
    const scenes = hydrateStoryScenes(chapterId, text, [
      { text: '月亮照进窗台。\n', sceneType: 'peaceful', emotion: 'calm' },
      { text: '小禾发现了一封信。', sceneType: 'adventure', emotion: 'surprised' },
      { text: '晚安。', sceneType: 'goodnight', emotion: 'calm' },
    ])

    expect(scenes.map((scene) => scene.text).join('')).toBe(text)
    expect(scenes.map((scene) => scene.index)).toEqual([1, 2, 3])
    expect(scenes.map((scene) => scene.id)).toEqual([
      stableStorySceneId(chapterId, 1),
      stableStorySceneId(chapterId, 2),
      stableStorySceneId(chapterId, 3),
    ])
    expect(scenes.every((scene) => /^[0-9a-f-]{36}$/i.test(scene.id))).toBe(true)
    expect(scenes[2]).toMatchObject({ sceneType: 'goodnight', emotion: 'happy', pitch: 0, speed: 0.8 })
  })

  it('falls back without losing whitespace when a model scene plan changes the chapter text', () => {
    const text = '第一句。\r\n\r\n“第二句？”  小禾点点头。'
    const parts = splitNarrativeText(text)
    const scenes = hydrateStoryScenes(randomUUID(), text, [
      { text: '模型擅自改写了正文。', sceneType: 'peaceful' },
    ])

    expect(parts.join('')).toBe(text)
    expect(scenes.map((scene) => scene.text).join('')).toBe(text)
    expect(scenes).toHaveLength(Math.min(4, parts.length))
  })

  it('uses the fixed warm-smile settings for every scene type', () => {
    for (const sceneType of ['peaceful', 'adventure', 'playful', 'tense', 'climax', 'warm', 'reflective', 'goodnight'] as const) {
      expect(sceneSettings(sceneType)).toEqual({ speed: 0.8, pitch: 0, emotion: 'happy' })
    }
  })

  it('ignores model-proposed emotion settings during hydration', () => {
    const scenes = hydrateStoryScenes(randomUUID(), '小禾笑了。', [
      { text: '小禾笑了。', sceneType: 'playful', emotion: 'surprised' },
    ])
    expect(scenes[0]).toMatchObject({ emotion: 'happy', speed: 0.8, pitch: 0 })
  })

  it('derives deterministic but distinct UUIDs for scene positions', () => {
    const chapterId = randomUUID()
    const ids = Array.from({ length: 8 }, (_, index) => stableStorySceneId(chapterId, index + 1))

    expect(new Set(ids)).toHaveLength(ids.length)
    expect(ids.map((id) => stableStorySceneId(chapterId, ids.indexOf(id) + 1))).toEqual(ids)
    expect(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))).toBe(true)
  })

  it('uses longer release pauses before calm and goodnight scenes', () => {
    expect(transitionPauseMs('tense', 'peaceful')).toBeGreaterThan(transitionPauseMs('peaceful', 'tense'))
    expect(transitionPauseMs('warm', 'goodnight')).toBe(1_000)
    expect(transitionPauseMs('adventure', 'climax')).toBe(220)
  })
})
