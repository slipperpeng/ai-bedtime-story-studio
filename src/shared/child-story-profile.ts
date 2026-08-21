export interface ChildAgeProfile {
  readonly label: string
  readonly ageRange: string
  readonly vocabulary: string
  readonly plot: string
  readonly emotionalSafety: string
  readonly chapterLength: string
  readonly recommendedChapterChars: ChapterCharRange
}

export interface ChapterCharRange {
  readonly min: number
  readonly max: number
}

export type ChapterLengthPresetId = 'recommended' | 'short' | 'standard' | 'rich' | 'custom'

export const CHAPTER_CHAR_LIMITS: ChapterCharRange = { min: 60, max: 500 }
export const LEGACY_CHAPTER_CHAR_RANGE: ChapterCharRange = { min: 90, max: 180 }

export const CHAPTER_LENGTH_PRESETS: ReadonlyArray<{
  id: Exclude<ChapterLengthPresetId, 'recommended' | 'custom'>
  label: string
  description: string
  range: ChapterCharRange
}> = [
  { id: 'short', label: '简短', description: '节奏轻快，适合临睡前快速讲完', range: { min: 80, max: 120 } },
  { id: 'standard', label: '标准', description: '情节与细节均衡，适合日常阅读', range: { min: 120, max: 180 } },
  { id: 'rich', label: '丰富', description: '描写与对话更多，适合沉浸阅读', range: { min: 180, max: 260 } },
] as const

export const CHILD_AGE_PROFILES: readonly ChildAgeProfile[] = [
  {
    label: '启蒙陪伴',
    ageRange: '2–4 岁',
    vocabulary: '常用具体词、短句和适度重复',
    plot: '单线情节、一个明确目标，因果直接',
    emotionalSafety: '不制造危险感，快速回到熟悉与安心',
    chapterLength: '每章约 70–110 字',
    recommendedChapterChars: { min: 70, max: 110 },
  },
  {
    label: '想象探索',
    ageRange: '5–7 岁',
    vocabulary: '清楚易懂，可自然带入少量新词',
    plot: '清晰起伏、温和挑战和一至两位伙伴',
    emotionalSafety: '允许小困难，但及时获得陪伴和解决',
    chapterLength: '每章约 90–140 字',
    recommendedChapterChars: { min: 90, max: 140 },
  },
  {
    label: '成长冒险',
    ageRange: '8–10 岁',
    vocabulary: '更丰富的描述、对话和比喻',
    plot: '多一步因果、选择与合作，保留适度悬念',
    emotionalSafety: '可以面对挫折，重点呈现应对和成长',
    chapterLength: '每章约 110–170 字',
    recommendedChapterChars: { min: 110, max: 170 },
  },
  {
    label: '少年共鸣',
    ageRange: '11–14 岁',
    vocabulary: '自然细腻，避免幼稚口吻和直接说教',
    plot: '人物动机、关系变化和更有层次的主题',
    emotionalSafety: '允许复杂情绪，以理解、选择和希望收束',
    chapterLength: '每章约 130–190 字',
    recommendedChapterChars: { min: 130, max: 190 },
  },
] as const

export function childAgeProfile(age: number): ChildAgeProfile {
  if (age <= 4) return CHILD_AGE_PROFILES[0]
  if (age <= 7) return CHILD_AGE_PROFILES[1]
  if (age <= 10) return CHILD_AGE_PROFILES[2]
  return CHILD_AGE_PROFILES[3]
}

export function childRoleExplanation(name: string): string {
  const nickname = name.trim() || '孩子的昵称'
  return `${nickname}默认是故事里的核心小主角，不只是标题或落款；会被直接称呼、参与行动和选择，并在每章插图中保持同一角色形象。若补充情节明确指定了其他主角，${nickname}会作为同行伙伴自然参与。`
}

export function childProfilePrompt(name: string, age: number): string {
  const profile = childAgeProfile(age)
  return `孩子昵称的角色：将“${name}”默认写成贯穿故事的核心小主角，而不是只在标题、开头或结尾提到；让其参与行动、对话、选择与情绪成长，并在各章角色描述和插图提示中保持形象一致。如果家长补充内容明确指定其他主角，则让“${name}”成为重要同行伙伴，不要生硬替换原主角。
年龄适配要求（${profile.ageRange} · ${profile.label}）：词汇使用${profile.vocabulary}；情节采用${profile.plot}；情绪与安全尺度为${profile.emotionalSafety}。避免超出该年龄理解能力的抽象说教。`
}
