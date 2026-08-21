import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoryProject } from '../src/shared/contracts'
import { countChineseCharacters } from '../src/shared/story-text'
import { MiniMaxImageProvider } from '../src/main/providers/image-provider'
import { MiniMaxStoryProvider, OpenAiCompatibleStoryProvider } from '../src/main/providers/story-provider'

const project: StoryProject = {
  id: '00000000-0000-4000-8000-000000000001',
  title: '星光晚安信',
  childName: '小禾',
  childAge: 6,
  theme: '勇气与分享',
  tone: '温柔舒缓',
  sourceMode: 'ai',
  sourceText: '',
  chapterCount: 2,
  chapterCharMin: 180,
  chapterCharMax: 260,
  illustrationStyle: 'paper-cut-collage',
  storyProvider: 'minimax',
  storyModel: 'MiniMax-M3',
  imageModel: 'image-01',
  voiceProfileId: '00000000-0000-4000-8000-000000000002',
  backgroundMusicEnabled: false,
  chapters: [],
  status: 'draft',
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
}

const context = () => ({ signal: new AbortController().signal, report: vi.fn() })

const validChapterText = (opening: string) => `${opening}${'月光轻轻落在森林小路上伙伴们认真倾听彼此心里的愿望'.repeat(8)}`

const storyPayload = {
  title: '星光晚安信',
  summary: '小禾沿着星光小路学会勇敢与分享。',
  styleBible: {
    visualStyle: '现代儿童水彩绘本',
    palette: '薄荷绿、珊瑚粉和月光黄',
    characterDescriptions: ['小禾穿绿色睡衣，系黄色围巾'],
    negativePrompt: '文字、水印、恐怖画面',
  },
  chapters: [
    { title: '第一章', text: validChapterText('小禾在月光下发现了一封会发光的晚安信。'), imagePrompt: '月光花园里的发光信封', imageAlt: '小禾发现发光信封' },
    { title: '第二章', text: validChapterText('小禾把温柔的星光分享给森林里的每一位朋友。'), imagePrompt: '森林朋友分享柔和星光', imageAlt: '大家分享星光' },
  ],
}

const completionResponse = (content: unknown) => new Response(JSON.stringify({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
  base_resp: { status_code: 0, status_msg: 'success' },
}), { status: 200 })

const completionTextResponse = (content: string) => new Response(JSON.stringify({
  choices: [{ finish_reason: 'stop', message: { content } }],
  base_resp: { status_code: 0, status_msg: 'success' },
}), { status: 200 })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MiniMax story provider', () => {
  it('uses the current OpenAI-compatible contract and parses JSON after thinking text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { content: `<think>先规划 {"chapters":2}</think>\n\`\`\`json\n${JSON.stringify(storyPayload)}\n\`\`\`` },
      }],
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })
    const runContext = context()
    const result = await provider.generate(project, runContext)

    expect(result.chapters).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.minimaxi.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-only-key')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: 'MiniMax-M3',
      max_completion_tokens: 16_000,
      reasoning_split: true,
      thinking: { type: 'disabled' },
    })
    expect(body).not.toHaveProperty('max_tokens')
    expect(body).not.toHaveProperty('response_format')
    expect(body.messages[0].content).toContain('每章 scenes 按情绪转折拆成 1–4 个连续场景')
    expect(body.messages[0].content).toContain('sceneType 只能是 peaceful、adventure、playful、tense、climax、warm、reflective、goodnight')
    expect(body.messages[0].content).toContain('所有场景 text 按顺序直接拼接后必须与本章 text 完全一致')
    expect(body.messages[0].content).toContain('不要输出 voiceId、音色名称')
    expect(body.messages[1].content).not.toContain('叙事语气')
    expect(body.messages[1].content).not.toContain(project.tone)
    expect(body.messages[1].content).toContain('长短句交替')
    expect(body.messages[1].content).toContain('所有人物对白统一使用中文全角引号“……”')
    expect(body.messages[1].content).toContain('限制重复叠词和副词')
    expect(body.messages[1].content).toContain('同一个叠词或副词每章原则上不超过 2 次')
    expect(body.messages[1].content).toContain('具体动作、自然对白、环境变化和角色反应呈现情绪')
    expect(body.messages[1].content).toContain('正文要像家长面对孩子自然讲述')
    expect(body.messages[1].content).toContain('不要让整章从头到尾维持同一种情绪')
    expect(body.messages[1].content).toContain('每个自然段只聚焦一个叙事或情绪重点')
    expect(body.messages[1].content).toContain('避免使用相同句首或相同句尾')
    expect(body.messages[1].content).toContain('贯穿故事的核心小主角')
    expect(body.messages[1].content).toContain('5–7 岁 · 想象探索')
    expect(body.messages[1].content).toContain('每章正文 text 必须独立满足 180–260 个中文字符')
    expect(body.messages[1].content).toContain('优先把每章写到约 224 个汉字')
    expect(body.messages[1].content).toContain('用于控制每一页绘本的文字密度')
    expect(body.messages[1].content).toContain('孩子年龄只控制词汇、句式、情绪安全和情节复杂度')
    expect(body.messages[1].content).toContain('不允许用后续章节补偿当前章节')
    expect(body.messages[1].content).toContain('绘图风格必须采用“纸艺拼贴”')
    expect(body.messages[1].content).toContain('手工彩纸剪贴儿童绘本')
    expect(body.messages[1].content).not.toContain('每章约 90–140 字')
    expect(result.styleBible.visualStyle).toContain('手工彩纸剪贴儿童绘本')
    expect(result.styleBible.palette).toContain('深森林绿')
    expect(result.styleBible.negativePrompt).toContain('透明水彩晕染')
    expect(result.chapters.every((chapter) => chapter.scenes?.length)).toBeTruthy()
    expect(result.chapters.every((chapter) => chapter.scenes?.map((scene) => scene.text).join('') === chapter.text)).toBe(true)
  })

  it('automatically repairs malformed story JSON and validates the repaired structure', async () => {
    const malformed = '{"title":"星光晚安信" "summary":"缺少字段分隔逗号"}'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(completionTextResponse(malformed))
      .mockResolvedValueOnce(completionResponse(storyPayload))
    vi.stubGlobal('fetch', fetchMock)
    const runContext = context()
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    const result = await provider.generate(project, runContext)

    expect(result.title).toBe(storyPayload.title)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const repairBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(repairBody.temperature).toBe(0.35)
    expect(repairBody.messages[0].content).toContain('严格的 JSON 结构校正器')
    expect(repairBody.messages[1].content).toContain('invalidOutput')
    expect(repairBody.messages[1].content).toContain('缺少字段分隔逗号')
    expect(runContext.report).toHaveBeenCalledWith(76, '在线返回的故事格式有误，正在自动修复（1/2）…')
  })

  it('stops with a friendly message only after two malformed structure repairs fail', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => (
      completionTextResponse('{"title":"一直缺少逗号" "chapters":[]}')
    ))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    await expect(provider.generate(project, context())).rejects.toThrow(
      'MiniMax 返回的故事结构无效：在线服务连续 2 次自动修复后，仍未返回完整的故事结构。',
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('repairs only chapters outside the selected Chinese-character range before returning', async () => {
    const shortPayload = {
      ...storyPayload,
      chapters: [
        { ...storyPayload.chapters[0], text: '这一章现在仍然明显太短了。' },
        storyPayload.chapters[1],
      ],
    }
    const repairedChapters = [{ index: 1, ...storyPayload.chapters[0] }]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(shortPayload) } }],
        base_resp: { status_code: 0, status_msg: 'success' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ chapters: repairedChapters }) } }],
        base_resp: { status_code: 0, status_msg: 'success' },
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const runContext = context()
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    const result = await provider.generate(project, runContext)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.chapters.every((chapter) => {
      const count = countChineseCharacters(chapter.text)
      return count >= project.chapterCharMin && count <= project.chapterCharMax
    })).toBe(true)
    const repairBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(repairBody.temperature).toBe(0.35)
    expect(repairBody.messages[0].content).toContain('文字长度校对编辑')
    expect(repairBody.messages[1].content).toContain('只修正“待修正章节”')
    expect(repairBody.messages[1].content).toContain('程序只统计汉字')
    expect(repairBody.messages[1].content).toContain('优先把每个待修正章节写到约 224 个汉字')
    expect(repairBody.messages[1].content).toContain('长短句交替')
    expect(repairBody.messages[1].content).toContain('所有人物对白统一使用中文全角引号“……”')
    expect(repairBody.messages[1].content).toContain('同一个叠词或副词每章原则上不超过 2 次')
    expect(repairBody.messages[1].content).toContain('正文要像家长面对孩子自然讲述')
    expect(repairBody.messages[1].content).toContain('不要让整章从头到尾维持同一种情绪')
    expect(repairBody.messages[1].content).toContain('每个自然段只聚焦一个叙事或情绪重点')
    expect(repairBody.messages[1].content).not.toContain(storyPayload.chapters[1].text)
    expect(runContext.report).toHaveBeenCalledWith(82, expect.stringContaining('第 1/4 轮自动调整'))
    expect(runContext.report).toHaveBeenCalledWith(95, expect.stringContaining('章节字数检查通过'))
  })

  it('finishes locally when repeated repair rounds still miss the selected range', async () => {
    const fallbackProject = { ...project, chapterCharMin: 500, chapterCharMax: 500 }
    const shortPayload = {
      ...storyPayload,
      chapters: storyPayload.chapters.map((chapter) => ({ ...chapter, text: '这一章经过调整以后仍然太短了。' })),
    }
    const shortRepairs = shortPayload.chapters.map((chapter, index) => ({ index: index + 1, ...chapter }))
    const responses = [
      shortPayload,
      { chapters: shortRepairs },
      { chapters: shortRepairs },
      { chapters: shortRepairs },
      { chapters: shortRepairs },
    ].map((content) => new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200 }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responses[0])
      .mockResolvedValueOnce(responses[1])
      .mockResolvedValueOnce(responses[2])
      .mockResolvedValueOnce(responses[3])
      .mockResolvedValueOnce(responses[4])
    vi.stubGlobal('fetch', fetchMock)
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    const runContext = context()
    const result = await provider.generate(fallbackProject, runContext)
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(result.chapters.every((chapter) => {
      const count = countChineseCharacters(chapter.text)
      return count === fallbackProject.chapterCharMin
    })).toBe(true)
    expect(result.chapters.every((chapter) => !/温柔|慢慢|轻轻|暖暖|柔柔|甜甜/u.test(chapter.text))).toBe(true)
    expect(result.chapters.every((chapter) => !/伙伴|大家|有人|他们|每个人|另一位/u.test(chapter.text))).toBe(true)
    expect(result.chapters.every((chapter) => !/[。！？][。！？]$/u.test(chapter.text))).toBe(true)
    expect(runContext.report).toHaveBeenCalledWith(96, expect.stringContaining('最后整理'))
  })

  it('uses the smallest complete protagonist-only addition for a small remaining gap', async () => {
    const nearMinimumText = `${'甲'.repeat(178)}。`
    const fallbackProject = { ...project, chapterCharMin: 180, chapterCharMax: 260 }
    const shortPayload = {
      ...storyPayload,
      chapters: [
        { ...storyPayload.chapters[0], text: nearMinimumText },
        storyPayload.chapters[1],
      ],
    }
    const shortRepairs = [{ index: 1, ...shortPayload.chapters[0] }]
    const responses = [
      shortPayload,
      { chapters: shortRepairs },
      { chapters: shortRepairs },
      { chapters: shortRepairs },
      { chapters: shortRepairs },
    ]
    let responseIndex = 0
    const fetchMock = vi.fn().mockImplementation(async () => completionResponse(responses[responseIndex++]))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    const result = await provider.generate(fallbackProject, context())

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(countChineseCharacters(result.chapters[0].text)).toBe(183)
    expect(result.chapters[0].text).toBe(`${nearMinimumText}小禾安心了。`)
    expect(result.chapters[0].text).not.toMatch(/伙伴|大家|有人|他们|每个人|另一位/u)
    expect(result.chapters[0].text).not.toMatch(/[。！？][。！？]$/u)
  })

  it.each([
    [1, '好。'],
    [2, '真好。'],
  ] as const)('fills an exact range that is short by %i character without truncating a sentence', async (gap, ending) => {
    const exactLength = 180
    const nearExactText = `${'甲'.repeat(exactLength - gap)}。`
    const fallbackProject = { ...project, chapterCharMin: exactLength, chapterCharMax: exactLength }
    const shortPayload = {
      ...storyPayload,
      chapters: [
        { ...storyPayload.chapters[0], text: nearExactText },
        { ...storyPayload.chapters[1], text: `${'月'.repeat(exactLength)}。` },
      ],
    }
    const shortRepairs = [{ index: 1, ...shortPayload.chapters[0] }]
    const responses = [
      shortPayload,
      { chapters: shortRepairs },
      { chapters: shortRepairs },
      { chapters: shortRepairs },
      { chapters: shortRepairs },
    ]
    let responseIndex = 0
    const fetchMock = vi.fn().mockImplementation(async () => completionResponse(responses[responseIndex++]))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    const result = await provider.generate(fallbackProject, context())

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(countChineseCharacters(result.chapters[0].text)).toBe(exactLength)
    expect(result.chapters[0].text).toBe(`${nearExactText}${ending}`)
    expect(result.chapters[0].text).not.toMatch(/[，、；：]。/u)
    expect(result.chapters[0].text).not.toMatch(/[。！？][。！？]$/u)
  })

  it('trims an overlong fallback at the last complete sentence within the selected range', async () => {
    const firstSentence = `第一段${'甲'.repeat(35)}。`
    const secondSentence = `第二段${'乙'.repeat(35)}。`
    const thirdSentence = `第三段${'丙'.repeat(35)}。`
    const fallbackProject = { ...project, chapterCharMin: 60, chapterCharMax: 80 }
    const overlongPayload = {
      ...storyPayload,
      chapters: [
        { ...storyPayload.chapters[0], text: `${firstSentence}${secondSentence}${thirdSentence}` },
        { ...storyPayload.chapters[1], text: `${'月'.repeat(70)}。` },
      ],
    }
    const overlongRepairs = [{ index: 1, ...overlongPayload.chapters[0] }]
    const responses = [
      overlongPayload,
      { chapters: overlongRepairs },
      { chapters: overlongRepairs },
      { chapters: overlongRepairs },
      { chapters: overlongRepairs },
    ]
    let responseIndex = 0
    const fetchMock = vi.fn().mockImplementation(async () => completionResponse(responses[responseIndex++]))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    const result = await provider.generate(fallbackProject, context())

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(result.chapters[0].text).toBe(`${firstSentence}${secondSentence}`)
    expect(countChineseCharacters(result.chapters[0].text)).toBe(76)
    expect(result.chapters[0].text).not.toContain(thirdSentence)
    expect(result.chapters[0].text).not.toMatch(/[。！？][。！？]$/u)
  })

  it('turns a successful-HTTP MiniMax business error into an actionable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      base_resp: { status_code: 1008, status_msg: 'insufficient balance' },
    }), { status: 200 })))
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    await expect(provider.generate(project, context())).rejects.toThrow('账户余额不足')
  })

  it('retries transient MiniMax business errors returned with HTTP 200', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        base_resp: { status_code: 1002, status_msg: 'rate limited' },
      }), { status: 200, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(storyPayload) } }],
        base_resp: { status_code: 0, status_msg: 'success' },
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    await expect(provider.generate(project, context())).resolves.toMatchObject({ title: storyPayload.title })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('normalizes a non-empty characterDescriptions string into one array item', async () => {
    const singleDescription = '小禾穿绿色睡衣，系黄色围巾'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            ...storyPayload,
            styleBible: { ...storyPayload.styleBible, characterDescriptions: singleDescription },
          }),
        },
      }],
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200 })))
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    const result = await provider.generate(project, context())

    expect(result.styleBible.characterDescriptions).toEqual([singleDescription])
  })

  it('fills a missing summary while preserving strict chapter validation', async () => {
    const { summary: _summary, ...payloadWithoutSummary } = storyPayload
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { content: JSON.stringify(payloadWithoutSummary) },
      }],
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200 })))
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    const result = await provider.generate(project, context())

    expect(result.summary).toBe('《星光晚安信》讲述了小禾围绕“勇气与分享”展开的一段温柔睡前旅程。')
    expect(result.chapters).toHaveLength(2)
  })

  it('still rejects invalid non-string, non-array characterDescriptions values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            ...storyPayload,
            styleBible: { ...storyPayload.styleBible, characterDescriptions: { primary: '小禾' } },
          }),
        },
      }],
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200 })))
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    await expect(provider.generate(project, context())).rejects.toThrow('MiniMax 返回的故事结构无效')
  })

  it('normalizes MiniMax style objects before enforcing the selected preset', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            ...storyPayload,
            styleBible: {
              ...storyPayload.styleBible,
              palette: { 主色: ['薄荷绿', '月光黄'], 点缀色: '珊瑚粉' },
              negativePrompt: ['文字', '水印', '恐怖画面'],
            },
          }),
        },
      }],
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200 })))
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    const result = await provider.generate(project, context())

    expect(result.styleBible.palette).toContain('深森林绿')
    expect(result.styleBible.negativePrompt).toContain('文字、水印、恐怖画面')
    expect(result.styleBible.negativePrompt).toContain('透明水彩晕染')
  })

  it('rejects nested palette objects instead of stringifying unknown structures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            ...storyPayload,
            styleBible: { ...storyPayload.styleBible, palette: { 主色: { 名称: '薄荷绿' } } },
          }),
        },
      }],
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200 })))
    const provider = new MiniMaxStoryProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/chat/completions', model: 'MiniMax-M3', apiKey: 'test-only-key',
    })

    await expect(provider.generate(project, context())).rejects.toThrow('MiniMax 返回的故事结构无效')
  })
})

describe('OpenAI-compatible story provider', () => {
  it('uses the same automatic structure repair flow', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(completionTextResponse('{"title":"缺少逗号" "chapters":[]}'))
      .mockResolvedValueOnce(completionResponse(storyPayload))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new OpenAiCompatibleStoryProvider({
      baseUrl: 'https://example.com/v1', model: 'example-story-model', apiKey: 'test-only-key',
    })

    const result = await provider.generate({ ...project, storyProvider: 'openai-compatible' }, context())

    expect(result.title).toBe(storyPayload.title)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://example.com/v1/chat/completions')
    const repairBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(repairBody.response_format).toEqual({ type: 'json_object' })
    expect(repairBody.messages[0].content).toContain('严格的 JSON 结构校正器')
  })
})

describe('MiniMax image provider', () => {
  const input = {
    title: '第一章',
    prompt: '月光花园里的发光信封',
    alt: '小禾发现发光信封',
    styleBible: storyPayload.styleBible,
    chapterIndex: 1,
  }

  it('uses the documented synchronous base64 request and validates the returned image signature', async () => {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { image_base64: [pngSignature.toString('base64')] },
      metadata: { success_count: 1, failed_count: 0 },
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new MiniMaxImageProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/image_generation', model: 'image-01', apiKey: 'test-only-key',
    })

    const result = await provider.generate(input, context())

    expect(result.mimeType).toBe('image/png')
    expect(result.extension).toBe('png')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.minimaxi.com/v1/image_generation')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: 'image-01', aspect_ratio: '3:2', response_format: 'base64', n: 1,
      prompt_optimizer: false, aigc_watermark: false,
    })
    expect(body).not.toHaveProperty('negative_prompt')
    expect(body.prompt).toContain('需要避免：文字、水印、恐怖画面')
  })

  it('downloads URL responses and determines the format from bytes instead of trusting headers', async () => {
    const jpegSignature = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { image_urls: ['https://filecdn.minimax.chat/story.jpg'] },
        base_resp: { status_code: 0, status_msg: 'success' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(jpegSignature, {
        status: 200, headers: { 'content-type': 'application/octet-stream' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new MiniMaxImageProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/image_generation', model: 'image-01', apiKey: 'test-only-key',
    })

    const result = await provider.generate(input, context())

    expect(result.mimeType).toBe('image/jpeg')
    expect(result.extension).toBe('jpg')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports content-safety failures returned with HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      base_resp: { status_code: 1026, status_msg: 'sensitive content' },
    }), { status: 200 })))
    const provider = new MiniMaxImageProvider({
      baseUrl: 'https://api.minimaxi.com/v1', path: '/image_generation', model: 'image-01', apiKey: 'test-only-key',
    })

    await expect(provider.generate(input, context())).rejects.toThrow('内容安全检查未通过')
  })
})
