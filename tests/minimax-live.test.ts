import { describe, expect, it } from 'vitest'
import type { StoryProject } from '../src/shared/contracts'
import { MiniMaxImageProvider } from '../src/main/providers/image-provider'
import { MiniMaxStoryProvider } from '../src/main/providers/story-provider'

const apiKey = process.env.MINIMAX_API_KEY
const runLive = process.env.RUN_MINIMAX_LIVE === '1' && Boolean(apiKey)

describe.skipIf(!runLive)('MiniMax live provider flow', () => {
  it('generates a two-chapter story and one valid image for every chapter', async () => {
    const timestamp = new Date().toISOString()
    const project: StoryProject = {
      id: '11111111-1111-4111-8111-111111111111',
      title: '会收集晚安的云朵',
      childName: '小星',
      childAge: 6,
      theme: '学会耐心与分享',
      tone: '温柔、轻快、不说教',
      sourceMode: 'ai',
      sourceText: '故事发生在安静的山谷里，结尾要自然入睡。',
      chapterCount: 2,
      chapterCharMin: 120,
      chapterCharMax: 180,
      illustrationStyle: 'moonlight-watercolor',
      storyProvider: 'minimax',
      storyModel: 'MiniMax-M3',
      imageModel: 'image-01',
      voiceProfileId: '22222222-2222-4222-8222-222222222222',
      backgroundMusicEnabled: false,
      chapters: [],
      status: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const context = { signal: AbortSignal.timeout(300_000), report: () => undefined }
    const story = await new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1',
      path: '/chat/completions',
      model: 'MiniMax-M3',
      apiKey: apiKey!,
    }).generate(project, context)

    expect(story.chapters).toHaveLength(2)
    expect(story.styleBible.characterDescriptions.length).toBeGreaterThan(0)

    const imageProvider = new MiniMaxImageProvider({
      baseUrl: 'https://api.minimaxi.com/v1',
      path: '/image_generation',
      model: 'image-01',
      apiKey: apiKey!,
    })
    const images = await Promise.all(story.chapters.map((chapter, index) => imageProvider.generate({
      title: chapter.title,
      prompt: chapter.imagePrompt,
      alt: chapter.imageAlt,
      styleBible: story.styleBible,
      chapterIndex: index + 1,
    }, context)))

    expect(images).toHaveLength(2)
    images.forEach((image) => {
      expect(['png', 'jpg', 'webp']).toContain(image.extension)
      expect(image.bytes.byteLength).toBeGreaterThan(10_000)
    })
  }, 300_000)
})
