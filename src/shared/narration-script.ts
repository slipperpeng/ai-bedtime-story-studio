export const MINIMAX_NARRATION_RULES_VERSION = 'minimax-zh-bedtime-v4'

interface PauseProfile {
  readonly paragraphSeconds: number
  readonly sentenceSeconds: number
  readonly clauseSeconds: number
  readonly semicolonSeconds: number
  readonly sentenceMinimumCharacters: number
  readonly clauseMinimumCharacters: number
}

const DEFAULT_PROFILE: PauseProfile = {
  paragraphSeconds: 0.75,
  sentenceSeconds: 0.42,
  clauseSeconds: 0.18,
  semicolonSeconds: 0.32,
  sentenceMinimumCharacters: 12,
  clauseMinimumCharacters: 14,
}

const PAUSE_PROFILES: Readonly<Record<string, PauseProfile>> = Object.freeze({
  '温柔舒缓': DEFAULT_PROFILE,
  '轻松有趣': {
    paragraphSeconds: 0.65,
    sentenceSeconds: 0.34,
    clauseSeconds: 0.14,
    semicolonSeconds: 0.26,
    sentenceMinimumCharacters: 14,
    clauseMinimumCharacters: 16,
  },
  '梦幻诗意': {
    paragraphSeconds: 0.8,
    sentenceSeconds: 0.5,
    clauseSeconds: 0.2,
    semicolonSeconds: 0.38,
    sentenceMinimumCharacters: 10,
    clauseMinimumCharacters: 12,
  },
  '安静治愈': {
    paragraphSeconds: 0.9,
    sentenceSeconds: 0.56,
    clauseSeconds: 0.22,
    semicolonSeconds: 0.42,
    sentenceMinimumCharacters: 9,
    clauseMinimumCharacters: 11,
  },
})

const SCENE_PROFILE_ADJUSTMENTS: Readonly<Record<string, Partial<PauseProfile>>> = Object.freeze({
  peaceful: { sentenceSeconds: 0.46, clauseSeconds: 0.2 },
  adventure: { sentenceSeconds: 0.34, clauseSeconds: 0.14 },
  playful: { sentenceSeconds: 0.3, clauseSeconds: 0.12 },
  tense: { sentenceSeconds: 0.28, clauseSeconds: 0.1, sentenceMinimumCharacters: 16 },
  climax: { sentenceSeconds: 0.25, clauseSeconds: 0.1, sentenceMinimumCharacters: 16 },
  warm: { sentenceSeconds: 0.44, clauseSeconds: 0.18 },
  reflective: { sentenceSeconds: 0.52, clauseSeconds: 0.22, sentenceMinimumCharacters: 8 },
  goodnight: {
    paragraphSeconds: 1.05,
    sentenceSeconds: 0.62,
    clauseSeconds: 0.24,
    sentenceMinimumCharacters: 8,
    clauseMinimumCharacters: 10,
  },
})

const PAUSE_MARKER_PATTERN = /<#[^#<>\r\n]*#>/gi
const PAUSE_VALUE_PATTERN = /<#([0-9]+(?:\.[0-9]{1,2})?)#>/gi
const PARENTHESIZED_CONTROL_PATTERN = /\(([^()\r\n]{1,80})\)/g
const NEWLINE_PATTERN = /\n+/g
const MARKER_WITHOUT_SPEECH_AFTER_PATTERN = /<#[^#<>\r\n]+#>\s*$/i
const MARKER_WITHOUT_SPEECH_BEFORE_PATTERN = /^\s*<#[^#<>\r\n]+#>/i
const CONSECUTIVE_MARKERS_PATTERN = /<#[^#<>\r\n]+#>\s*<#[^#<>\r\n]+#>/i

// These are the non-verbal controls documented for Speech-2.8. Unknown
// parenthesized notes are removed so stage directions are never spoken aloud.
const SPEECH_28_NONVERBAL_TAGS = new Set([
  'laughs',
  'chuckle',
  'coughs',
  'clear-throat',
  'groans',
  'breath',
  'pant',
  'inhale',
  'exhale',
  'gasps',
  'sniffs',
  'snorts',
  'burps',
  'lip-smacking',
  'humming',
  'hissing',
  'emm',
  'sneezes',
  'sighs',
])

const STRONG_PUNCTUATION = new Set(['。', '！', '？', '!', '?'])
const CLAUSE_PUNCTUATION = new Set(['，', ',', '、'])
const CLOSING_QUOTE_PATTERN = /[”’"'》）】」』)]/u

export function prepareMiniMaxNarrationText(
  sourceText: string,
  tone: string,
  sceneType?: string,
): string {
  const normalized = normalizeNarrationText(sourceText)
  if (!normalized) return ''

  const profile = profileFor(tone, sceneType)
  const withSemanticPauses = insertSemanticPauses(normalized, profile)
  const prepared = withSemanticPauses.replace(NEWLINE_PATTERN, (newlines, offset, fullText) => {
    const before = fullText.slice(0, offset)
    const after = fullText.slice(offset + newlines.length)
    if (!hasSpeakableText(before) || !hasSpeakableText(after)) return newlines
    return `<#${formatSeconds(profile.paragraphSeconds)}#>${newlines}`
  })

  validatePauseMarkers(prepared)
  return prepared
}

function normalizeNarrationText(sourceText: string): string {
  return sourceText
    .replace(/\r\n?/g, '\n')
    .replace(PAUSE_MARKER_PATTERN, ' ')
    .replace(PARENTHESIZED_CONTROL_PATTERN, (_, rawTag: string) => {
      const tag = rawTag.trim().toLowerCase()
      return SPEECH_28_NONVERBAL_TAGS.has(tag) ? `(${tag})` : ' '
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +([，。！？；：、,.!?;:])/g, '$1')
    .replace(/\s+(?=\([a-z-]+\))/gi, '')
    .replace(/(\([a-z-]+\))\s+/gi, '$1')
    .replace(/([，。！？；：、,.!?;:]) +(?=[\p{Script=Han}])/gu, '$1')
    .trim()
}

function profileFor(tone: string, sceneType?: string): PauseProfile {
  const base = PAUSE_PROFILES[tone] || DEFAULT_PROFILE
  const adjustment = sceneType ? SCENE_PROFILE_ADJUSTMENTS[sceneType] : undefined
  return adjustment ? { ...base, ...adjustment } : base
}

function insertSemanticPauses(text: string, profile: PauseProfile): string {
  const output: string[] = []
  let spokenCharactersSinceBoundary = 0
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index]

    if (current === '(') {
      const closingIndex = text.indexOf(')', index + 1)
      if (closingIndex >= 0) {
        output.push(text.slice(index, closingIndex + 1))
        index = closingIndex
        continue
      }
    }

    output.push(current)
    if (current === '\n' || /\s/.test(current)) continue

    if (STRONG_PUNCTUATION.has(current)) {
      let boundaryEnd = index + 1
      while (boundaryEnd < text.length && CLOSING_QUOTE_PATTERN.test(text[boundaryEnd])) {
        output.push(text[boundaryEnd])
        boundaryEnd += 1
      }
      if (
        spokenCharactersSinceBoundary >= profile.sentenceMinimumCharacters &&
        hasSpeechAfter(text, boundaryEnd)
      ) {
        output.push(`<#${formatSeconds(profile.sentenceSeconds)}#>`)
        spokenCharactersSinceBoundary = 0
      } else {
        spokenCharactersSinceBoundary += 1
      }
      index = boundaryEnd - 1
      continue
    }

    if (current === '；' || current === ';') {
      if (
        spokenCharactersSinceBoundary >= profile.clauseMinimumCharacters &&
        hasSpeechAfter(text, index + 1)
      ) {
        output.push(`<#${formatSeconds(profile.semicolonSeconds)}#>`)
        spokenCharactersSinceBoundary = 0
      } else {
        spokenCharactersSinceBoundary += 1
      }
      continue
    }

    if (CLAUSE_PUNCTUATION.has(current)) {
      if (
        spokenCharactersSinceBoundary >= profile.clauseMinimumCharacters &&
        hasSpeechAfter(text, index + 1)
      ) {
        output.push(`<#${formatSeconds(profile.clauseSeconds)}#>`)
        spokenCharactersSinceBoundary = 0
      } else {
        spokenCharactersSinceBoundary += 1
      }
      continue
    }

    if (!/[\p{P}\p{S}]/u.test(current)) spokenCharactersSinceBoundary += 1
  }

  return output.join('')
}

function hasSpeechAfter(text: string, start: number): boolean {
  for (let index = start; index < text.length; index += 1) {
    const current = text[index]
    if (current === '\n') return false
    if (/\s/.test(current)) continue
    if (current === '(') {
      const closingIndex = text.indexOf(')', index + 1)
      if (closingIndex >= 0) {
        index = closingIndex
        continue
      }
    }
    return !/[\p{P}\p{S}]/u.test(current)
  }
  return false
}

function hasSpeakableText(text: string): boolean {
  return /[^\s()<>#]/u.test(text.replace(PAUSE_MARKER_PATTERN, '').replace(/\([a-z-]+\)/gi, ''))
}

function formatSeconds(seconds: number): string {
  return seconds.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function validatePauseMarkers(text: string): void {
  if (CONSECUTIVE_MARKERS_PATTERN.test(text)) {
    throw new Error('朗读脚本停顿标记不能连续使用。')
  }
  if (MARKER_WITHOUT_SPEECH_BEFORE_PATTERN.test(text) || MARKER_WITHOUT_SPEECH_AFTER_PATTERN.test(text)) {
    throw new Error('朗读脚本停顿标记必须位于可发音文本之间。')
  }

  PAUSE_VALUE_PATTERN.lastIndex = 0
  for (let match = PAUSE_VALUE_PATTERN.exec(text); match; match = PAUSE_VALUE_PATTERN.exec(text)) {
    const value = Number(match[1])
    if (!Number.isFinite(value) || value < 0.01 || value > 99.99 || !/^\d+(?:\.\d{1,2})?$/.test(match[1])) {
      throw new Error('朗读脚本停顿时长必须在 0.01 到 99.99 秒之间。')
    }
  }
}
