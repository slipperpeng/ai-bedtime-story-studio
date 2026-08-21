import { describe, expect, it } from 'vitest'
import { DemoStoryProvider } from '../src/main/providers/story-provider'
import type { StoryProject } from '../src/shared/contracts'
import { countChineseCharacters } from '../src/shared/story-text'

const project: StoryProject = {
  id: '00000000-0000-4000-8000-000000000001',
  title: '小禾与月亮邮局',
  childName: '小禾',
  childAge: 6,
  theme: '勇气与友谊',
  tone: '温柔舒缓',
  sourceMode: 'ai',
  sourceText: '',
  chapterCount: 7,
  chapterCharMin: 120,
  chapterCharMax: 180,
  illustrationStyle: 'moonlight-watercolor',
  storyProvider: 'demo',
  storyModel: 'local-demo',
  imageModel: 'local-demo',
  voiceProfileId: '00000000-0000-4000-8000-000000000002',
  backgroundMusicEnabled: false,
  chapters: [],
  status: 'draft',
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
}

describe('DemoStoryProvider', () => {
  it('always returns exactly the requested chapter count with an image prompt per chapter', async () => {
    const progress: number[] = []
    const result = await new DemoStoryProvider().generate(project, {
      signal: new AbortController().signal,
      report(value) { progress.push(value) },
    })

    expect(result.chapters).toHaveLength(7)
    expect(result.chapters.every((chapter) => chapter.imagePrompt.length > 0)).toBe(true)
    expect(result.chapters.every((chapter) => {
      const count = countChineseCharacters(chapter.text)
      return count >= project.chapterCharMin && count <= project.chapterCharMax
    })).toBe(true)
    expect(result.styleBible.characterDescriptions[0]).toContain('小禾')
    expect(result.styleBible.visualStyle).toContain('透明水彩儿童绘本')
    expect(progress.at(-1)).toBe(90)
  })

  it('expands short supplied sentences into valid chapter text', async () => {
    const expandedProject = {
      ...project,
      sourceMode: 'written',
      sourceText: '走。停。',
      chapterCount: 2,
      chapterCharMin: 500,
      chapterCharMax: 500,
    } as const
    const result = await new DemoStoryProvider().generate(expandedProject, {
      signal: new AbortController().signal,
      report() {},
    })

    expect(result.chapters).toHaveLength(2)
    expect(result.chapters.every((chapter) => {
      const count = countChineseCharacters(chapter.text)
      return count === expandedProject.chapterCharMin
    })).toBe(true)
    expect(result.chapters.every((chapter) => !/温柔|慢慢|轻轻|暖暖|柔柔|甜甜/u.test(chapter.text))).toBe(true)
  })
})
