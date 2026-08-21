import type {
  StoryScene,
  StorySceneEmotion,
  StorySceneType,
} from './contracts'

export const FIXED_NARRATION_SETTINGS = Object.freeze({
  speed: 0.80,
  pitch: 0,
  emotion: 'happy' as const,
})

export interface StorySceneDraft {
  text: string
  sceneType: StorySceneType
  emotion?: StorySceneEmotion
  id?: string
  audioAsset?: string
  audioFingerprint?: string
}

const HAN_PATTERN = /\p{Script=Han}/u

const sceneTypeSet = new Set<StorySceneType>([
  'peaceful', 'adventure', 'playful', 'tense', 'climax', 'warm', 'reflective', 'goodnight',
])

const emotionSet = new Set<StorySceneEmotion>([
  'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm',
])

export function isStorySceneType(value: unknown): value is StorySceneType {
  return typeof value === 'string' && sceneTypeSet.has(value as StorySceneType)
}

export function isStorySceneEmotion(value: unknown): value is StorySceneEmotion {
  return typeof value === 'string' && emotionSet.has(value as StorySceneEmotion)
}

/**
 * Convert an LLM scene plan into a stable, safe persisted scene list.
 * The chapter text remains authoritative: a plan is accepted only when all
 * scene text concatenates byte-for-byte to the chapter text.
 */
export function hydrateStoryScenes(
  chapterId: string,
  chapterText: string,
  drafts: Array<Partial<StorySceneDraft>> | undefined,
): StoryScene[] {
  const acceptedDrafts = drafts && drafts.length > 0 && drafts.every(isUsableDraft)
    && drafts.map((draft) => draft.text!).join('') === chapterText
    ? drafts as Array<StorySceneDraft>
    : fallbackSceneDrafts(chapterText)

  return acceptedDrafts.map((draft, offset) => {
    const sceneType = isStorySceneType(draft.sceneType) ? draft.sceneType : inferSceneType(draft.text, offset, acceptedDrafts.length)
    const hasPersistedId = typeof draft.id === 'string' && isUuid(draft.id)
    const id = hasPersistedId ? draft.id! : stableStorySceneId(chapterId, offset + 1)
    return {
      id,
      index: offset + 1,
      text: draft.text,
      sceneType,
      emotion: FIXED_NARRATION_SETTINGS.emotion,
      pitch: FIXED_NARRATION_SETTINGS.pitch,
      speed: FIXED_NARRATION_SETTINGS.speed,
      ...(hasPersistedId && draft.audioAsset ? { audioAsset: draft.audioAsset } : {}),
      ...(hasPersistedId && draft.audioFingerprint ? { audioFingerprint: draft.audioFingerprint } : {}),
    }
  })
}

export function sceneSettings(_sceneType?: StorySceneType): { speed: number; pitch: number; emotion: 'happy' } {
  return { ...FIXED_NARRATION_SETTINGS }
}

export function transitionPauseMs(previous: StorySceneType | undefined, current: StorySceneType): number {
  if (current === 'goodnight') return 1_000
  if (current === 'climax') return 220
  if (previous === 'tense' && current === 'warm') return 650
  if (previous === 'tense' && current === 'peaceful') return 650
  if (previous === 'peaceful' && current === 'tense') return 320
  if (previous === 'tense' && current === 'tense') return 420
  if (previous === 'playful' && current === 'peaceful') return 500
  if (previous === 'peaceful' && current === 'peaceful') return 750
  return 560
}

export function splitNarrativeText(text: string): string[] {
  if (!text.trim()) return []
  const sentences: string[] = []
  const sentenceEnd = /[。！？!?…]+[”’"'》）】」』)]*/gu
  let sentenceCursor = 0
  for (let match = sentenceEnd.exec(text); match; match = sentenceEnd.exec(text)) {
    const end = match.index + match[0].length
    sentences.push(text.slice(sentenceCursor, end))
    sentenceCursor = end
  }
  if (sentenceCursor < text.length) sentences.push(text.slice(sentenceCursor))
  if (sentences.length <= 1) return [text]

  const hanCount = countHan(text)
  const targetScenes = Math.min(4, Math.max(1, Math.round(hanCount / 105)))
  if (targetScenes <= 1 || sentences.length <= targetScenes) return sentences

  const groups: string[] = []
  let cursor = 0
  for (let groupIndex = 0; groupIndex < targetScenes; groupIndex += 1) {
    const remainingGroups = targetScenes - groupIndex
    const remainingSentences = sentences.length - cursor
    const desired = Math.max(1, Math.ceil(remainingSentences / remainingGroups))
    groups.push(sentences.slice(cursor, cursor + desired).join(''))
    cursor += desired
  }
  if (cursor < sentences.length) groups[groups.length - 1] += sentences.slice(cursor).join('')
  return groups.filter(Boolean)
}

export function stableStorySceneId(chapterId: string, index: number): string {
  const input = `${chapterId}:${index}`
  const seeds = [2166136261, 2246822519, 3266489917, 668265263]
  const words = seeds.map((seed, word) => fnv1a32(`${word}:${input}`, seed))
  const hex = words.map((word) => word.toString(16).padStart(8, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${hex.slice(18, 20)}-${hex.slice(20, 32)}`
}

function fnv1a32(value: string, seed: number): number {
  let hash = seed >>> 0
  for (let offset = 0; offset < value.length; offset += 1) {
    hash ^= value.charCodeAt(offset)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function isUsableDraft(value: Partial<StorySceneDraft>): value is StorySceneDraft {
  return typeof value.text === 'string' && value.text.length > 0 && isStorySceneType(value.sceneType)
}

function fallbackSceneDrafts(text: string): StorySceneDraft[] {
  const parts = splitNarrativeText(text)
  return parts.map((part, index) => {
    const sceneType = inferSceneType(part, index, parts.length)
    return { text: part, sceneType, emotion: defaultEmotion(sceneType) }
  })
}

function inferSceneType(text: string, index: number, total: number): StorySceneType {
  if (index === total - 1 && /晚安|睡着|入睡|关灯|梦乡|月光渐渐安静/u.test(text)) return 'goodnight'
  if (/害怕|担心|迷路|黑暗|紧张|不安/u.test(text)) return 'tense'
  if (/突然|发现|好奇|闪闪|出现|秘密/u.test(text)) return 'adventure'
  if (/笑|哈哈|打趣|调皮|逗/u.test(text)) return 'playful'
  if (/帮助|拥抱|回家|朋友|安心|温暖/u.test(text)) return 'warm'
  if (/想起|想了想|明白|原来|回想|记得/u.test(text)) return 'reflective'
  if (index === 0) return 'peaceful'
  return 'adventure'
}

function defaultEmotion(sceneType: StorySceneType): StorySceneEmotion {
  if (sceneType === 'playful') return 'happy'
  if (sceneType === 'adventure' || sceneType === 'climax') return 'surprised'
  if (sceneType === 'tense') return 'fearful'
  return 'calm'
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function countHan(value: string): number {
  return Array.from(value).filter((character) => HAN_PATTERN.test(character)).length
}
