import { describe, expect, it } from 'vitest'
import {
  CHAPTER_CHAR_LIMITS,
  CHAPTER_LENGTH_PRESETS,
  CHILD_AGE_PROFILES,
  childAgeProfile,
  childProfilePrompt,
  childRoleExplanation,
} from '../src/shared/child-story-profile'

describe('child story profile', () => {
  it('maps every supported age to a clear development profile', () => {
    expect(CHILD_AGE_PROFILES).toHaveLength(4)
    expect(childAgeProfile(2).label).toBe('启蒙陪伴')
    expect(childAgeProfile(5).label).toBe('想象探索')
    expect(childAgeProfile(8).label).toBe('成长冒险')
    expect(childAgeProfile(11).label).toBe('少年共鸣')
    expect(childAgeProfile(14).chapterLength).toContain('130–190')
    expect(childAgeProfile(3).recommendedChapterChars).toEqual({ min: 70, max: 110 })
    expect(childAgeProfile(9).recommendedChapterChars).toEqual({ min: 110, max: 170 })
  })

  it('provides the fixed length presets and custom input limits', () => {
    expect(CHAPTER_LENGTH_PRESETS.map(({ id, range }) => ({ id, ...range }))).toEqual([
      { id: 'short', min: 80, max: 120 },
      { id: 'standard', min: 120, max: 180 },
      { id: 'rich', min: 180, max: 260 },
    ])
    expect(CHAPTER_CHAR_LIMITS).toEqual({ min: 60, max: 500 })
  })

  it('explains and enforces the nickname as an active story character', () => {
    expect(childRoleExplanation('小禾')).toContain('核心小主角')
    expect(childRoleExplanation('小禾')).toContain('参与行动和选择')
    expect(childProfilePrompt('小禾', 6)).toContain('贯穿故事的核心小主角')
    expect(childProfilePrompt('小禾', 6)).toContain('5–7 岁 · 想象探索')
    expect(childProfilePrompt('小禾', 6)).not.toContain('每章约 90–140 字')
  })
})
