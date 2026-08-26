import { z } from 'zod'
import type { StoryLanguage, StoryProject } from '../../shared/contracts'
import { childProfilePrompt } from '../../shared/child-story-profile'
import { illustrationStylePreset } from '../../shared/illustration-styles'
import { StoryPackageSchema, type StoryPackage } from '../../shared/schemas'
import { countChineseCharacters } from '../../shared/story-text'
import { hydrateStoryScenes, type StorySceneDraft } from '../../shared/story-scenes'
import type { ProviderRunContext, StoryProvider } from './contracts'
import { fetchWithRetry, readErrorResponse } from './http'
import { assertMiniMaxSuccess, isRetryableMiniMaxResponse } from './minimax-response'

const englishSystemPrompt = `You are a professional children's bedtime story writer and picture-book storyboard artist. Output exactly one JSON object and no Markdown. The JSON must contain title, summary, styleBible, and chapters. summary must be a non-empty English string. styleBible must contain visualStyle, palette, characterDescriptions, and negativePrompt; characterDescriptions is always a JSON string array. Every chapter must contain title, text, imagePrompt, imageAlt, and scenes. Keep the story gentle, safe, age-appropriate, and free of violence, frightening imagery, brands, or real child likenesses. Preserve the same characters, clothing, colors, and proportions in every imagePrompt. Escape double quotes inside JSON strings. Split scenes at natural emotional turns. Each scene contains text, sceneType, and emotion. sceneType must be one of peaceful, adventure, playful, tense, climax, warm, reflective, goodnight; emotion must be one of happy, sad, angry, fearful, disgusted, surprised, calm. Joining scene text in order must exactly reproduce the chapter text. Do not output voice IDs, voice names, audio paths, pause tags, or stage directions.`

const englishReadAloudRequirements = `Narration requirements: write as a parent naturally telling a child a story, not as a broadcast script. Alternate short and long sentences, vary sentence openings and endings, and avoid repetitive filler. Use concrete actions, natural dialogue, sensory details, and character reactions to show emotions. Use punctuation as gentle reading cues, but never output emotion labels, speed labels, pause tags, or stage directions. Each paragraph should focus on one narrative or emotional beat, and each chapter should gradually return to calm.`

function storySystemPrompt(language: StoryLanguage): string {
  return language === 'en' ? englishSystemPrompt : systemPrompt
}

function readAloudRequirements(language: StoryLanguage): string {
  return language === 'en' ? englishReadAloudRequirements : readAloudProseRequirements
}

interface MiniMaxConfig {
  baseUrl: string
  path: string
  model: string
  apiKey: string
}

interface OpenAiConfig {
  baseUrl: string
  model: string
  apiKey: string
}

const systemPrompt = `你是专业的儿童睡前故事作家和绘本分镜师。只输出一个 JSON 对象，不要 Markdown。
JSON 必须包含 title、summary、styleBible 和 chapters，四个顶层字段均不可省略；summary 必须是一段非空中文摘要字符串。styleBible 必须包含 visualStyle、palette、characterDescriptions、negativePrompt；visualStyle、palette、negativePrompt 必须是字符串，characterDescriptions 必须是 JSON 字符串数组，即使只有一个角色也要使用数组。每章必须包含 title、text、imagePrompt、imageAlt 和 scenes。内容温柔、安全、无暴力惊吓，不包含品牌或真实儿童肖像。每章都要有可独立生图的完整场景描述，并保持角色服饰、发型、颜色和比例一致。最终输出必须能被标准 JSON.parse 直接解析；字段之间不得漏逗号，字符串内部不得出现未转义的英文双引号，人物对白使用中文全角引号“……”。
每章 scenes 按情绪转折拆成 1–4 个连续场景；每个场景包含 text、sceneType、emotion。sceneType 只能是 peaceful、adventure、playful、tense、climax、warm、reflective、goodnight；emotion 只能是 happy、sad、angry、fearful、disgusted、surprised、calm。所有场景 text 按顺序直接拼接后必须与本章 text 完全一致，不得增删字词，不要输出 voiceId、音色名称、音频路径或停顿标签。场景边界优先放在自然段、对白转换和情绪转折处；结尾尽量使用 goodnight 或 warm，但不要为了标签改写正文。`

const chapterRepairSystemPrompt = `你是儿童故事文字长度校对编辑。只输出一个 JSON 对象，不要 Markdown。
JSON 只能包含 chapters 数组。数组中的每项必须包含 index、title、text、imagePrompt、imageAlt 和 scenes，并且只返回用户列出的待修正章节。scenes 的 text 按顺序拼接后必须与该章 text 完全一致；不要输出 voiceId、音色名称、音频路径或停顿标签。`

const englishChapterRepairSystemPrompt = `You are a children's story length editor. Output exactly one JSON object and no Markdown.
The JSON may contain only a chapters array. Each item must contain index, title, text, imagePrompt, imageAlt, and scenes, and you must return only the chapters listed for repair. Joining scenes.text in order must exactly reproduce that chapter's text. Do not output voice IDs, voice names, audio paths, or pause tags.`

const jsonStructureRepairSystemPrompt = `你是严格的 JSON 结构校正器。用户会提供一个 JSON 包装对象，其中 invalidOutput 字段保存另一模型返回的原始文本，validationError 字段保存校验错误。
只输出修复后的一个 JSON 对象，不要 Markdown、解释、思考过程或代码围栏。优先只修复缺失逗号、错误引号、非法换行、截断符号、字段类型和缺失必填字段；保留原故事标题、正文、章节顺序、插图描述和分镜文字，不得缩写、总结或重新创作正文。JSON 字符串内部若需要英文双引号必须使用反斜杠转义，人物对白优先保留中文全角引号“……”。修复后必须满足用户给出的目标结构。`

const readAloudProseRequirements = `口述表达要求：正文要像家长面对孩子自然讲述，而不是播音稿或配音指令。长短句交替，避免连续句子的长度和结构过于一致；所有人物对白统一使用中文全角引号“……”；限制重复叠词和副词，同一个叠词或副词每章原则上不超过 2 次，相邻句不得反复使用；优先用孩子能听懂的具体动作、自然对白、环境变化和角色反应呈现情绪，让好奇、回应、安心等感受跟随事件自然变化，不要让整章从头到尾维持同一种情绪。用符合语义的问号、叹号和省略号提供朗读线索；“咦、嗯、呀”等语气词只在人物确实会这样说时少量使用，不得固定次数添加。不要在正文中输出括号式情绪标签、语速标签、停顿标记、舞台说明或“开心地说、温柔地说”等配音提示。每个自然段只聚焦一个叙事或情绪重点，在场景、说话者或情绪发生自然变化时再换段，不要每句话都换段；正文达到 90 个汉字时使用 2–4 个自然段。对白前后用简短动作或回应交代语境，不同句子和自然段避免使用相同句首或相同句尾；每章结尾让情绪逐步回到平静。`

const losslessNarrativeText = (min: number, max: number) => z.string().max(max).refine(
  (value) => value.trim().length >= min,
  `文字内容去除首尾空白后不能少于 ${min} 个字符。`,
)

const ChapterRepairSchema = z.object({
  chapters: z.array(z.object({
    index: z.number().int().min(1).max(12),
    title: z.string().trim().min(1).max(80),
    text: losslessNarrativeText(10, 2_500),
    imagePrompt: z.string().trim().min(5).max(1_500),
    imageAlt: z.string().trim().min(2).max(200),
    scenes: z.array(z.object({
      text: losslessNarrativeText(1, 2_500),
      sceneType: z.enum(['peaceful', 'adventure', 'playful', 'tense', 'climax', 'warm', 'reflective', 'goodnight']),
      emotion: z.enum(['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm']).optional(),
    }).strict()).min(1).max(8).optional(),
  })).min(1).max(12),
})

const MAX_CHAPTER_REPAIR_ATTEMPTS = 4
const MAX_JSON_STRUCTURE_REPAIR_ATTEMPTS = 2

interface ChapterLengthIssue {
  index: number
  count: number
}

type CompletionRequest = (messages: Array<{ role: 'system' | 'user'; content: string }>, operation: string) => Promise<string>

interface StructuredResponseRepairInput<T> {
  responseText: string
  structureName: string
  structureRequirements: string
  parse: (text: string) => T
  context: ProviderRunContext
  requestCompletion: CompletionRequest
}

function buildUserPrompt(project: StoryProject): string {
  const language = project.language || 'zh'
  const illustrationStyle = illustrationStylePreset(project.illustrationStyle)
  const preferredLength = preferredChapterCharacterCount(project)
  if (language === 'en') {
    const source = project.sourceMode === 'ai'
      ? `Create an original story. Parent's extra idea: ${project.sourceText || 'none'}`
      : `Adapt the parent's story faithfully without changing its core plot:\n${project.sourceText}`
    return `Create an English bedtime story for ${project.childName}, a ${project.childAge}-year-old child, around the theme “${project.theme}”.
${childProfilePrompt(project.childName, project.childAge, 'en')}
${readAloudRequirements('en')}
Reference title: ${project.title}
Use exactly ${project.chapterCount} chapters. Each chapter text must independently contain ${project.chapterCharMin}–${project.chapterCharMax} letters, numbers, or meaningful spaces; do not average across chapters.
The selected range controls the text density on each picture-book page and narration length. Do not shorten it because of age. If a draft is too short, add meaningful actions, natural dialogue, sensory details, and plot progress; if too long, remove repetition without deleting key events.
Use the selected illustration style: ${illustrationStyle.label}. Visual direction: ${illustrationStyle.visualStyle}. Palette: ${illustrationStyle.palette}.
${source}`
  }
  const source = project.sourceMode === 'ai'
    ? `请原创故事。家长的补充想法：${project.sourceText || '无'}`
    : `请忠实改编下面的家长故事，不改变核心情节：\n${project.sourceText}`
  return `为 ${project.childAge} 岁孩子“${project.childName}”创作一个“${project.theme}”主题的中文睡前故事。
${childProfilePrompt(project.childName, project.childAge)}
${readAloudProseRequirements}
故事名参考：${project.title}
严格分成 ${project.chapterCount} 章，chapters 数组必须恰好有 ${project.chapterCount} 项。
每章正文 text 必须独立满足 ${project.chapterCharMin}–${project.chapterCharMax} 个中文字符，不是所有章节的平均值；中文字符只统计汉字，不统计标点、空格、数字或英文字母。
为避免少于最低字数，请优先把每章写到约 ${preferredLength} 个汉字，并在输出前重新数一遍汉字；只要少于 ${project.chapterCharMin} 个汉字就算不合格。
这个范围由家长选择，用于控制每一页绘本的文字密度、单章朗读时长、整个睡前故事的总时长，以及插图与文字之间的叙事完整度。
孩子年龄只控制词汇、句式、情绪安全和情节复杂度，不能缩短家长选择的篇幅，也不能改用年龄档位的默认字数。
如果初稿不足 ${project.chapterCharMin} 字，请在同一章补充角色动作、符合年龄的自然对话、环境感受和有意义的情节推进；如果超过 ${project.chapterCharMax} 字，请删减重复表达，但不要删除关键情节。不要重复句子、堆砌形容词或加入无关内容来凑字数。
输出 JSON 前逐章检查 text：每一章都必须在 ${project.chapterCharMin}–${project.chapterCharMax} 字范围内；不允许用后续章节补偿当前章节，不允许返回低于最低字数或高于最高字数的章节。
绘图风格必须采用“${illustrationStyle.label}”：${illustrationStyle.visualStyle}。固定配色方向：${illustrationStyle.palette}。styleBible 和每章 imagePrompt 都必须服从该风格，不要自行改成其他画材或渲染方式。
${source}`
}

function chapterLengthIssues(project: StoryProject, story: StoryPackage): ChapterLengthIssue[] {
  return story.chapters.flatMap((chapter, offset) => {
    const count = countStoryCharacters(chapter.text, project.language || 'zh')
    return count < project.chapterCharMin || count > project.chapterCharMax
      ? [{ index: offset + 1, count }]
      : []
  })
}

function countStoryCharacters(value: string, language: StoryLanguage): number {
  if (language === 'zh') return countChineseCharacters(value)
  return Array.from(value).filter((character) => /[\p{L}\p{N}]/u.test(character)).length
}

function preferredChapterCharacterCount(project: StoryProject): number {
  const span = project.chapterCharMax - project.chapterCharMin
  if (span >= 40) return Math.min(project.chapterCharMax, project.chapterCharMin + Math.round(span * 0.55))
  return Math.round((project.chapterCharMin + project.chapterCharMax) / 2)
}

function buildChapterRepairPrompt(
  project: StoryProject,
  story: StoryPackage,
  issues: ChapterLengthIssue[],
  attempt: number,
): string {
  const issueIndexes = new Set(issues.map((issue) => issue.index))
  const preferredLength = preferredChapterCharacterCount(project)
  const chapters = story.chapters
    .map((chapter, offset) => ({
      index: offset + 1,
      ...chapter,
      actualChineseCharacters: countStoryCharacters(chapter.text, project.language || 'zh'),
    }))
  if (project.language === 'en') {
    return `This is length-repair pass ${attempt}/${MAX_CHAPTER_REPAIR_ATTEMPTS}. Repair only the listed chapters; do not return or rewrite any other chapter.
Each chapter text must independently contain ${project.chapterCharMin}–${project.chapterCharMax} letters or numbers. The program counts letters and numbers, not punctuation or spaces.
Aim for about ${preferredLength} counted characters in each repaired chapter, leaving at least 20 characters above the minimum. Anything below ${project.chapterCharMin} is invalid. Count every chapter again before returning.
This range controls the amount of text on each picture-book page, narration length, and narrative completeness. Age controls language and safety only; it must not shorten the chapter.
When short, add meaningful actions, natural dialogue, sensory details, and plot progress. When long, remove repetition without deleting key events or introducing a new storyline.
${readAloudRequirements('en')}
After changing text, update that chapter's title, imagePrompt, and imageAlt so the illustration still matches the story and keeps the established character design and art style.
Return only the requested chapters and verify every count. Do not compensate with another chapter.
Story settings: ${JSON.stringify({
      title: story.title,
      summary: story.summary,
      styleBible: story.styleBible,
      childName: project.childName,
      childAge: project.childAge,
      theme: project.theme,
      chapterCharMin: project.chapterCharMin,
      chapterCharMax: project.chapterCharMax,
      issues,
      chapters,
    })}`
  }
  return `这是第 ${attempt}/${MAX_CHAPTER_REPAIR_ATTEMPTS} 轮长度校对。只修正“待修正章节”，不要返回或改写其他章节。
每章 text 必须独立满足 ${project.chapterCharMin}–${project.chapterCharMax} 个中文字符；程序只统计汉字，不统计标点、空格、数字或英文字母。
本轮请优先把每个待修正章节写到约 ${preferredLength} 个汉字，至少比最低字数多留 20 个汉字余量；少于 ${project.chapterCharMin} 个汉字绝对不合格。完成后必须重新逐章计数。
这个范围用于控制绘本每页文字密度、单章与全书朗读时长，以及插图和正文的叙事完整度。孩子年龄只控制表达难度与安全尺度，不能缩短篇幅。
不足时补充有意义的动作、自然对话、环境感受和情节推进；超出时删减重复表达。不得机械重复、堆砌词句或引入新主线。
${readAloudRequirements('zh')}
修正 text 后同步更新该章 title、imagePrompt 和 imageAlt，使插图描述继续准确对应正文；保持既定人物造型和画风。
输出前逐项计数并检查，不允许用其他章节补偿。

故事设定：${JSON.stringify({
    title: story.title,
    summary: story.summary,
    childName: project.childName,
    childAge: project.childAge,
    theme: project.theme,
    styleBible: story.styleBible,
  })}
全书衔接参考（只提供章节顺序与标题）：${JSON.stringify(chapters.map(({ index, title }) => ({ index, title })))}
待修正章节：${JSON.stringify(chapters.filter((chapter) => issueIndexes.has(chapter.index)))}`
}

function parseJsonObject(text: string): unknown {
  const normalized = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const objectStart = normalized.indexOf('{')
  const objectEnd = normalized.lastIndexOf('}')
  if (objectStart < 0 || objectEnd <= objectStart) throw new Error('响应中没有 JSON 对象。')
  return JSON.parse(normalized.slice(objectStart, objectEnd + 1))
}

async function parseWithAutomaticStructureRepair<T>(input: StructuredResponseRepairInput<T>): Promise<T> {
  let candidate = input.responseText
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_JSON_STRUCTURE_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      return input.parse(candidate)
    } catch (error) {
      lastError = error
      if (attempt === MAX_JSON_STRUCTURE_REPAIR_ATTEMPTS) break
      input.context.report(
        76,
        `在线返回的${input.structureName}格式有误，正在自动修复（${attempt + 1}/${MAX_JSON_STRUCTURE_REPAIR_ATTEMPTS}）…`,
      )
      const repairEnvelope = JSON.stringify({
        validationError: error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000),
        invalidOutput: candidate,
      })
      candidate = await input.requestCompletion([
        { role: 'system', content: jsonStructureRepairSystemPrompt },
        {
          role: 'user',
          content: `目标结构：\n${input.structureRequirements}\n\n请修复下面包装对象中 invalidOutput 保存的原始响应：\n${repairEnvelope}`,
        },
      ], `${input.structureName}结构自动修复第 ${attempt + 1} 轮`)
    }
  }
  throw new Error(`在线服务连续 ${MAX_JSON_STRUCTURE_REPAIR_ATTEMPTS} 次自动修复后，仍未返回完整的${input.structureName}结构。`, {
    cause: lastError,
  })
}

function applySelectedIllustrationStyle(project: StoryProject, story: StoryPackage): StoryPackage {
  const preset = illustrationStylePreset(project.illustrationStyle)
  return {
    ...story,
    styleBible: {
      ...story.styleBible,
      visualStyle: preset.visualStyle,
      palette: preset.palette,
      negativePrompt: [story.styleBible.negativePrompt, preset.negativePrompt]
        .filter(Boolean)
        .join('、'),
    },
  }
}

function extractText(payload: unknown): string {
  const value = payload as {
    choices?: Array<{ message?: { content?: string }; text?: string }>
    reply?: string
    output_text?: string
  }
  return value.choices?.[0]?.message?.content
    || value.choices?.[0]?.text
    || value.reply
    || value.output_text
    || ''
}

function parseJsonText(text: string, project: StoryProject): StoryPackage {
  const raw = parseJsonObject(text)
  const parsed = StoryPackageSchema.parse(normalizeStoryPackageShape(raw, project))
  if (parsed.chapters.length !== project.chapterCount) {
    throw new Error(`模型返回了 ${parsed.chapters.length} 章，要求为 ${project.chapterCount} 章。`)
  }
  return withStoryScenes(parsed, project)
}

function withStoryScenes(story: StoryPackage, project: StoryProject): StoryPackage {
  return {
    ...story,
    chapters: story.chapters.map((chapter, offset) => ({
      ...chapter,
      scenes: hydrateStoryScenes(
        `story-package-${project.id}-${offset + 1}`,
        chapter.text,
        chapter.scenes as Array<Partial<StorySceneDraft>> | undefined,
      ).map(({ text, sceneType, emotion }) => ({ text, sceneType, emotion })),
    })),
  }
}

async function ensureChapterLengths(
  project: StoryProject,
  initialStory: StoryPackage,
  context: ProviderRunContext,
  requestCompletion: CompletionRequest,
): Promise<StoryPackage> {
  let story = initialStory
  let issues = chapterLengthIssues(project, story)
  if (!issues.length) {
    context.report(95, '章节字数检查通过。')
    return story
  }

  for (let attempt = 1; attempt <= MAX_CHAPTER_REPAIR_ATTEMPTS; attempt += 1) {
    context.report(
      attempt === 1 ? 82 : 90,
      `检测到 ${issues.length} 章字数不符合要求，正在进行第 ${attempt}/${MAX_CHAPTER_REPAIR_ATTEMPTS} 轮自动调整…`,
    )
    const expectedIndexes = new Set(issues.map((issue) => issue.index))
    const responseText = await requestCompletion([
      { role: 'system', content: project.language === 'en' ? englishChapterRepairSystemPrompt : chapterRepairSystemPrompt },
      { role: 'user', content: buildChapterRepairPrompt(project, story, issues, attempt) },
    ], `故事章节长度第 ${attempt} 轮自动调整`)
    let repaired: z.infer<typeof ChapterRepairSchema>
    try {
      repaired = ChapterRepairSchema.parse(parseJsonObject(responseText))
    } catch (error) {
      context.report(92, `第 ${attempt}/${MAX_CHAPTER_REPAIR_ATTEMPTS} 轮返回格式不完整，正在自动重试…`)
      continue
    }
    const returnedIndexes = repaired.chapters.map((chapter) => chapter.index)
    if (new Set(returnedIndexes).size !== returnedIndexes.length
      || returnedIndexes.length !== expectedIndexes.size
      || returnedIndexes.some((index) => !expectedIndexes.has(index))) {
      context.report(92, `第 ${attempt}/${MAX_CHAPTER_REPAIR_ATTEMPTS} 轮章节编号不完整，正在自动重试…`)
      continue
    }
    const repairs = new Map(repaired.chapters.map((chapter) => [chapter.index, chapter]))
    try {
      story = withStoryScenes(StoryPackageSchema.parse({
        ...story,
        chapters: story.chapters.map((chapter, offset) => {
          const replacement = repairs.get(offset + 1)
          if (!replacement) return chapter
          const { index: _index, ...content } = replacement
          return content
        }),
      }), project)
    } catch (error) {
      context.report(92, `第 ${attempt}/${MAX_CHAPTER_REPAIR_ATTEMPTS} 轮内容不完整，正在自动重试…`)
      continue
    }
    issues = chapterLengthIssues(project, story)
    if (!issues.length) {
      context.report(95, `章节字数检查通过；已自动调整 ${returnedIndexes.length} 章。`)
      return story
    }
  }

  context.report(96, `模型校对后仍有少量篇幅偏差，正在自动完成最后整理（${issues.length} 章）…`)
  story = withStoryScenes({
    ...story,
    chapters: story.chapters.map((chapter, offset) => {
      if (!issues.some((issue) => issue.index === offset + 1)) return chapter
      return { ...chapter, text: fitChapterTextLength(chapter.text, project, offset + 1) }
    }),
  }, project)
  const remainingIssues = chapterLengthIssues(project, story)
  if (remainingIssues.length) {
    throw new Error(`章节正文无法整理到 ${project.chapterCharMin}–${project.chapterCharMax} 个中文字符。`)
  }
  context.report(98, '章节字数已自动整理完成。')
  return story
}

function fitChapterTextLength(value: string, project: StoryProject, chapterNumber: number): string {
  return fitNarrativeTextLength(
    value,
    project.chapterCharMin,
    project.chapterCharMax,
    chapterNumber,
    project.childName,
  )
}

function takeChinesePrefix(value: string, limit: number): string {
  let count = 0
  let result = ''
  for (const character of value) {
    if (/\p{Script=Han}/u.test(character)) {
      if (count >= limit) break
      count += 1
    }
    result += character
  }
  return result
}

function takeCompleteSentencePrefix(value: string, limit: number): string {
  let completePrefix = ''
  for (const match of value.matchAll(/[。！？!?…]+[”’"'》）】」』)]*/gu)) {
    const candidate = value.slice(0, match.index + match[0].length).trim()
    if (countChineseCharacters(candidate) > limit) break
    completePrefix = candidate
  }
  return completePrefix || takeChinesePrefix(value, limit)
}

function withTerminalSentencePunctuation(value: string): string {
  const result = value.trim()
  if (!result || /[。！？!?…][”’"'》）】」』)]*$/u.test(result)) return result

  const closingMarks = result.match(/[”’"'》）】」』)]+$/u)?.[0] || ''
  const stem = (closingMarks ? result.slice(0, -closingMarks.length) : result)
    .replace(/[，、；：,;:\s]+$/u, '')
  if (!stem) return result
  if (/[。！？!?…]$/u.test(stem)) return `${stem}${closingMarks}`
  return `${stem}。${closingMarks}`
}

function narrativeLengthAdditions(childName: string): string[] {
  return [
    `${childName}安心了。`,
    `${childName}停下来想了想。`,
    `${childName}看看眼前的变化，也留意自己的呼吸。`,
    `${childName}回想刚才发生的事，把重要的细节重新理清。`,
    `${childName}把看到的、听到的和想到的在心里连了起来。`,
    `${childName}没有急着往前，先确认自己真正想做的事。`,
    `${childName}记起刚才的选择，也明白了当时为什么那样做。`,
    `${childName}又观察了一会儿，发现自己的担心已经有了变化。`,
    `${childName}把这一刻记在心里，对眼前发生的事有了新的理解。`,
    `${childName}从头想了一遍刚才的经过，确认没有漏掉重要的感受。`,
    `${childName}听见自己的呼吸渐渐平稳，思路也比刚才更清楚。`,
    `${childName}看看来时的方向，再看看眼前，终于明白自己最在意什么。`,
    `${childName}没有催促自己，只把已经知道的事情一件件想清楚。`,
    `${childName}想起最初的愿望，确认现在的选择仍然朝着那个方向。`,
    `${childName}把心里的疑问逐一整理，知道哪些已经明白，哪些还要继续观察。`,
    `${childName}回顾一路上的变化，发现自己的想法和出发时已经有些不同。`,
    `${childName}把眼前的线索按先后顺序想了一遍，对发生的事情更有把握。`,
    `${childName}记住这次经历带来的感受，也记住自己是怎样作出选择的。`,
    `${childName}比较刚才和现在的心情，发现不安已经少了一些。`,
    `${childName}重新观察周围的变化，把确定的事情和猜想分开。`,
    `${childName}想清楚事情的前后顺序，心里的疑问也有了答案。`,
    `${childName}把最重要的发现记牢，也没有忽略自己真实的感受。`,
    `${childName}确认自己已经理解刚才的经历，心里变得更加踏实。`,
    `${childName}回想每一次停顿和选择，终于看清自己真正关心的事情。`,
  ]
}

function exactCompactNarrativeAdditions(target: number): string[] {
  const candidates = [
    '到了这一刻，心里安定了。',
    '到了此刻，心里安定了。',
    '这一刻心里安定了。',
    '此刻心里安定了。',
    '此刻心里安定。',
    '此刻心安了。',
    '此刻心安。',
    '心安了。',
    '真好。',
    '好。',
  ]
  const plans: Array<string[] | undefined> = Array.from({ length: target + 1 })
  plans[0] = []
  for (const candidate of candidates) {
    const count = countChineseCharacters(candidate)
    for (let total = target; total >= count; total -= 1) {
      const previous = plans[total - count]
      if (!previous) continue
      const next = [...previous, candidate]
      if (!plans[total] || next.length < plans[total]!.length) plans[total] = next
    }
  }
  return plans[target] || []
}

function fitNarrativeTextLength(
  value: string,
  min: number,
  max: number,
  chapterNumber: number,
  childName: string,
): string {
  let result = value.trim()
  if (countChineseCharacters(result) > max) {
    result = takeCompleteSentencePrefix(result, max)
  }

  const additions = narrativeLengthAdditions(childName)
  let additionIndex = Math.max(0, chapterNumber - 1) % additions.length
  while (countChineseCharacters(result) < min) {
    const currentCount = countChineseCharacters(result)
    const needed = min - currentCount
    const room = max - currentCount
    if (room <= 0) break

    const candidates = Array.from({ length: additions.length }, (_, offset) => {
      const index = (additionIndex + offset) % additions.length
      const text = additions[index]
      return { index, offset, text, count: countChineseCharacters(text) }
    })
    const completeAddition = candidates
      .filter((candidate) => candidate.count >= needed && candidate.count <= room)
      .sort((left, right) => left.count - right.count || left.offset - right.offset)[0]
    if (completeAddition) {
      result += completeAddition.text
      break
    }

    const fittingAddition = candidates.find((candidate) => candidate.count <= needed && candidate.count <= room)
    if (fittingAddition) {
      result += fittingAddition.text
      additionIndex = (fittingAddition.index + 1) % additions.length
      continue
    }

    const exactAdditions = exactCompactNarrativeAdditions(needed)
    if (!exactAdditions.length) {
      throw new Error(`章节正文还缺少 ${needed} 个中文字符，无法用完整句子补齐。`)
    }
    result += exactAdditions.join('')
    break
  }
  return withTerminalSentencePunctuation(result)
}

function fitEnglishChapterText(value: string, min: number, max: number, chapterNumber: number, childName: string): string {
  let result = value.trim()
  const count = () => countStoryCharacters(result, 'en')
  if (count() > max) {
    result = result.split(/\s+/u).reduce((current, word) => {
      const candidate = current ? `${current} ${word}` : word
      return countStoryCharacters(candidate, 'en') <= max ? candidate : current
    }, '')
  }
  const additions = [
    `${childName} took a calm breath and looked around.`,
    'A friendly light appeared nearby, making the path feel safe.',
    `${childName} listened carefully, then chose one small brave step.`,
    'The two friends smiled when they noticed the quiet stars above.',
  ]
  let index = Math.max(0, chapterNumber - 1) % additions.length
  while (count() < min && count() < max) {
    const candidate = `${result} ${additions[index % additions.length]}`.trim()
    if (countStoryCharacters(candidate, 'en') > max) break
    result = candidate
    index += 1
  }
  return result || 'A gentle goodnight story begins.'
}

function fitDemoChapterText(value: string, min: number, max: number, chapterNumber: number, childName: string, language: StoryLanguage = 'zh'): string {
  return language === 'en' ? fitEnglishChapterText(value, min, max, chapterNumber, childName) : fitNarrativeTextLength(value, min, max, chapterNumber, childName)
}

function normalizeStoryPackageShape(value: unknown, project: StoryProject): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const story = value as Record<string, unknown>
  const normalizedStory = { ...story }
  let changed = false
  if (typeof story.summary !== 'string' || !story.summary.trim()) {
    const returnedTitle = typeof story.title === 'string' && story.title.trim()
      ? story.title.trim()
      : project.title
    normalizedStory.summary = project.language === 'en'
      ? `${returnedTitle} follows ${project.childName} through a gentle bedtime journey about ${project.theme}.`
      : `《${returnedTitle}》讲述了${project.childName}围绕“${project.theme}”展开的一段温柔睡前旅程。`
    changed = true
  }
  const styleBible = story.styleBible
  if (!styleBible || typeof styleBible !== 'object' || Array.isArray(styleBible)) {
    return changed ? normalizedStory : value
  }
  const style = styleBible as Record<string, unknown>
  const normalizedStyle = { ...style }
  let styleChanged = false
  if (typeof style.characterDescriptions === 'string' && style.characterDescriptions.trim()) {
    normalizedStyle.characterDescriptions = [style.characterDescriptions]
    styleChanged = true
  }
  const palette = normalizeFlatText(style.palette)
  if (typeof style.palette !== 'string' && palette !== undefined) {
    normalizedStyle.palette = palette
    styleChanged = true
  }
  const negativePrompt = normalizeStringList(style.negativePrompt)
  if (Array.isArray(style.negativePrompt) && negativePrompt !== undefined) {
    normalizedStyle.negativePrompt = negativePrompt
    styleChanged = true
  }
  if (!changed && !styleChanged) return value
  return {
    ...normalizedStory,
    styleBible: styleChanged ? normalizedStyle : styleBible,
  }
}

function normalizeFlatText(value: unknown): string | undefined {
  const list = normalizeStringList(value)
  if (list !== undefined) return list
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
  if (!entries.length) return undefined
  const parts: string[] = []
  for (const [label, item] of entries) {
    const normalized = normalizeStringOrList(item)
    if (!label.trim() || normalized === undefined) return undefined
    parts.push(`${label.trim()}：${normalized}`)
  }
  return parts.join('；')
}

function normalizeStringOrList(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  return normalizeStringList(value)
}

function normalizeStringList(value: unknown): string | undefined {
  if (!Array.isArray(value) || !value.length) return undefined
  const items = value.map((item) => typeof item === 'string' ? item.trim() : '')
  if (items.some((item) => !item)) return undefined
  return items.join('、')
}

export class MiniMaxStoryProvider implements StoryProvider {
  constructor(private readonly config: MiniMaxConfig) {}

  private async requestCompletion(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    operation: string,
    signal: AbortSignal,
  ): Promise<string> {
    const url = new URL(`${this.config.baseUrl.replace(/\/$/, '')}${this.config.path}`)
    const response = await fetchWithRetry(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: operation === '故事生成' ? 0.8 : 0.35,
        max_completion_tokens: 16_000,
        reasoning_split: true,
        ...(this.config.model === 'MiniMax-M3' ? { thinking: { type: 'disabled' } } : {}),
      }),
    }, { signal, timeoutMs: 180_000, retryResponse: isRetryableMiniMaxResponse })
    if (!response.ok) throw new Error(`MiniMax ${operation}失败：${await readErrorResponse(response)}`)
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error(`MiniMax ${operation}失败：服务返回了无法解析的 JSON。`)
    }
    assertMiniMaxSuccess(payload, `MiniMax ${operation}`)
    const finishReason = (payload as { choices?: Array<{ finish_reason?: unknown }> }).choices?.[0]?.finish_reason
    if (finishReason === 'length') throw new Error(`MiniMax ${operation}未完成：输出达到长度上限，请减少章节数或每章字数后重试。`)
    if (finishReason === 'content_filter') throw new Error(`MiniMax ${operation}未完成：内容安全检查未通过，请调整故事设定。`)
    return extractText(payload)
  }

  async generate(project: StoryProject, context: ProviderRunContext): Promise<StoryPackage> {
    context.report(12, '正在向 MiniMax 提交故事设定…')
    const responseText = await this.requestCompletion([
      { role: 'system', content: storySystemPrompt(project.language || 'zh') },
      { role: 'user', content: buildUserPrompt(project) },
    ], '故事生成', context.signal)
    context.report(75, '正在整理章节和绘本分镜…')
    let story: StoryPackage
    try {
      story = applySelectedIllustrationStyle(project, await parseWithAutomaticStructureRepair({
        responseText,
        structureName: '故事',
        structureRequirements: storySystemPrompt(project.language || 'zh'),
        parse: (candidate) => parseJsonText(candidate, project),
        context,
        requestCompletion: (messages, operation) => this.requestCompletion(messages, operation, context.signal),
      }))
    } catch (error) {
      throw new Error(`MiniMax 返回的故事结构无效：${error instanceof Error ? error.message : String(error)}`)
    }
    return ensureChapterLengths(project, story, context, (messages, operation) => (
      this.requestCompletion(messages, operation, context.signal)
    ))
  }
}

export class OpenAiCompatibleStoryProvider implements StoryProvider {
  constructor(private readonly config: OpenAiConfig) {}

  private async requestCompletion(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    operation: string,
    signal: AbortSignal,
  ): Promise<string> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: operation === '故事生成' ? 0.8 : 0.35,
        response_format: { type: 'json_object' },
      }),
    }, { signal })
    if (!response.ok) throw new Error(`${operation}请求失败：${await readErrorResponse(response)}`)
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error(`${operation}失败：服务返回了无法解析的 JSON。`)
    }
    return extractText(payload)
  }

  async generate(project: StoryProject, context: ProviderRunContext): Promise<StoryPackage> {
    context.report(12, '正在向兼容模型提交故事设定…')
    const responseText = await this.requestCompletion([
      { role: 'system', content: storySystemPrompt(project.language || 'zh') },
      { role: 'user', content: buildUserPrompt(project) },
    ], '故事生成', context.signal)
    context.report(75, '正在整理章节和绘本分镜…')
    let story: StoryPackage
    try {
      story = applySelectedIllustrationStyle(project, await parseWithAutomaticStructureRepair({
        responseText,
        structureName: '故事',
        structureRequirements: storySystemPrompt(project.language || 'zh'),
        parse: (candidate) => parseJsonText(candidate, project),
        context,
        requestCompletion: (messages, operation) => this.requestCompletion(messages, operation, context.signal),
      }))
    } catch (error) {
      throw new Error(`故事模型返回的结构无效：${error instanceof Error ? error.message : String(error)}`)
    }
    return ensureChapterLengths(project, story, context, (messages, operation) => (
      this.requestCompletion(messages, operation, context.signal)
    ))
  }
}

export class DemoStoryProvider implements StoryProvider {
  async generate(project: StoryProject, context: ProviderRunContext): Promise<StoryPackage> {
    const language = project.language || 'zh'
    const illustrationStyle = illustrationStylePreset(project.illustrationStyle)
    context.report(20, '正在生成本地演示故事…')
    const sourceSentences = project.sourceText
      .split(/(?<=[。！？!?])\s*/u)
      .map((item) => item.trim())
      .filter(Boolean)
    const chapters = Array.from({ length: project.chapterCount }, (_, index) => {
      const number = index + 1
      const supplied = sourceSentences[index % Math.max(1, sourceSentences.length)]
      const fallback = language === 'en'
        ? `${project.childName} found a singing leaf on a starlit path. Its clear little song reminded ${project.childName} that courage can be as quiet as taking one small step forward.`
        : `${project.childName}在星光照亮的小路上，找到了第${number}枚会唱歌的叶子。叶子发出清亮的声音，告诉${project.childName}，勇气不一定很响亮，有时只是愿意再向前走一小步。`
      const text = supplied
        ? supplied.length >= 10 ? supplied : `${supplied}夜色笼着小路，新的线索在前方出现。`
        : fallback
      return {
        title: language === 'en' ? `Chapter ${number} · A Gift of Starlight` : `第${number}章 · 星光的礼物`,
        text: fitDemoChapterText(text, project.chapterCharMin, project.chapterCharMax, number, project.childName, language),
        imagePrompt: language === 'en'
          ? `${project.childName} discovers a glowing leaf in a peaceful moonlit fairy-tale scene, chapter ${number}, gentle storytelling, clear subject`
          : `${project.childName}在安静的夜色童话场景中发现一枚发光的叶子，第${number}个场景，温柔叙事，清晰主体`,
        imageAlt: language === 'en' ? `${project.childName} discovers a glowing leaf at night` : `${project.childName}在夜色中发现发光叶子的插画`,
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 250))
    context.report(90, '本地演示故事已分章。')
    return withStoryScenes(StoryPackageSchema.parse({
      title: project.title,
      summary: language === 'en' ? `${project.childName} learns about courage and sharing during a gentle nighttime journey.` : `${project.childName}在一段温柔的夜间旅程中学会勇敢与分享。`,
      styleBible: {
        visualStyle: illustrationStyle.visualStyle,
        palette: illustrationStyle.palette,
        characterDescriptions: [language === 'en' ? `${project.childName}, a round and friendly picture-book child wearing dark pajamas and a yellow scarf, consistent in every page` : `${project.childName}，圆润友善的绘本人物，深色睡衣，黄色小围巾，每页造型一致`],
        negativePrompt: language === 'en' ? `text, watermark, logo, scary imagery, realistic child portrait, extra fingers, changing clothes, ${illustrationStyle.negativePrompt}` : `文字、水印、标志、恐怖画面、写实儿童肖像、额外手指、角色服装变化、${illustrationStyle.negativePrompt}`,
      },
      chapters,
    }), project)
  }
}
