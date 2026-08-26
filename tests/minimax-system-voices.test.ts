import { describe, expect, it } from 'vitest'
import {
  findMiniMaxSystemVoice,
  isMiniMaxChineseSystemRemoteVoiceId,
  isMiniMaxSystemRemoteVoiceId,
  isMiniMaxSystemVoiceId,
  MINIMAX_CHINESE_SYSTEM_VOICES,
  MINIMAX_SYSTEM_VOICES,
  orderMiniMaxSystemVoicesForBedtime,
} from '../src/shared/minimax-system-voices'

describe('MiniMax Chinese system voice catalog', () => {
  it('contains exactly the 58 Mandarin and 6 Cantonese voices from the official FAQ', () => {
    const mandarin = MINIMAX_CHINESE_SYSTEM_VOICES.filter((voice) => voice.locale === 'zh-CN')
    const cantonese = MINIMAX_CHINESE_SYSTEM_VOICES.filter((voice) => voice.locale === 'zh-HK')

    expect(MINIMAX_CHINESE_SYSTEM_VOICES).toHaveLength(64)
    expect(mandarin).toHaveLength(58)
    expect(cantonese).toHaveLength(6)
  })

  it('uses unique stable ids and unique official remote voice ids', () => {
    const ids = MINIMAX_CHINESE_SYSTEM_VOICES.map((voice) => voice.id)
    const remoteVoiceIds = MINIMAX_CHINESE_SYSTEM_VOICES.map((voice) => voice.remoteVoiceId)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(remoteVoiceIds).size).toBe(remoteVoiceIds.length)
  })

  it('contains only Chinese voices with the matching language boost', () => {
    for (const voice of MINIMAX_CHINESE_SYSTEM_VOICES) {
      expect(voice.provider).toBe('minimax-system')
      expect(voice.language).toBe('zh')
      expect(voice.name.trim()).not.toBe('')
      expect(voice.remoteVoiceId.trim()).toBe(voice.remoteVoiceId)
      expect(voice.languageBoost).toBe(voice.locale === 'zh-HK' ? 'Chinese,Yue' : 'Chinese')
    }
  })

  it('preserves all six documented Cantonese ids and their exact synthesis parameters', () => {
    expect(MINIMAX_CHINESE_SYSTEM_VOICES
      .filter((voice) => voice.locale === 'zh-HK')
      .map(({ id, name, remoteVoiceId, locale, languageBoost }) => ({ id, name, remoteVoiceId, locale, languageBoost })))
      .toEqual([
        { id: 'minimax-zh-hk-001', name: '专业女主持', remoteVoiceId: 'Cantonese_ProfessionalHost（F)', locale: 'zh-HK', languageBoost: 'Chinese,Yue' },
        { id: 'minimax-zh-hk-002', name: '温柔女声', remoteVoiceId: 'Cantonese_GentleLady', locale: 'zh-HK', languageBoost: 'Chinese,Yue' },
        { id: 'minimax-zh-hk-003', name: '专业男主持', remoteVoiceId: 'Cantonese_ProfessionalHost（M)', locale: 'zh-HK', languageBoost: 'Chinese,Yue' },
        { id: 'minimax-zh-hk-004', name: '活泼男声', remoteVoiceId: 'Cantonese_PlayfulMan', locale: 'zh-HK', languageBoost: 'Chinese,Yue' },
        { id: 'minimax-zh-hk-005', name: '可爱女孩', remoteVoiceId: 'Cantonese_CuteGirl', locale: 'zh-HK', languageBoost: 'Chinese,Yue' },
        { id: 'minimax-zh-hk-006', name: '善良女声', remoteVoiceId: 'Cantonese_KindWoman', locale: 'zh-HK', languageBoost: 'Chinese,Yue' },
      ])
  })

  it('looks up only known stable and remote ids without normalizing official ids', () => {
    const voice = findMiniMaxSystemVoice('minimax-zh-cn-041')

    expect(voice).toMatchObject({
      name: '温暖闺蜜',
      remoteVoiceId: 'Chinese (Mandarin)_Warm_Bestie',
    })
    expect(isMiniMaxSystemVoiceId('minimax-zh-cn-041')).toBe(true)
    expect(isMiniMaxSystemVoiceId('minimax-zh-cn-999')).toBe(false)
    expect(isMiniMaxChineseSystemRemoteVoiceId('Chinese (Mandarin)_Warm_Bestie')).toBe(true)
    expect(isMiniMaxChineseSystemRemoteVoiceId('chinese (mandarin)_warm_bestie')).toBe(false)
    expect(isMiniMaxChineseSystemRemoteVoiceId('English_Graceful_Lady')).toBe(false)
  })

  it('exports an immutable catalog and immutable entries', () => {
    expect(Object.isFrozen(MINIMAX_CHINESE_SYSTEM_VOICES)).toBe(true)
    expect(MINIMAX_CHINESE_SYSTEM_VOICES.every((voice) => Object.isFrozen(voice))).toBe(true)
  })

  it('puts only the two selected bedtime recommendations first in a stable order', () => {
    const ordered = orderMiniMaxSystemVoicesForBedtime(MINIMAX_CHINESE_SYSTEM_VOICES)
    const recommended = ordered.filter((voice) => voice.bedtimeRecommendationRank)

    expect(recommended.map((voice) => voice.name)).toEqual(['温暖少女', '温柔学姐'])
    expect(recommended.map((voice) => voice.bedtimeRecommendationRank)).toEqual([1, 2])
    expect(recommended.every((voice) => Boolean(voice.bedtimeRecommendationReason))).toBe(true)
    expect(ordered[2].id).toBe('minimax-zh-cn-001')
    expect(MINIMAX_CHINESE_SYSTEM_VOICES[0].id).toBe('minimax-zh-cn-001')
  })
})

describe('MiniMax bilingual system voice catalog', () => {
  it('adds four English voices without changing the 64-voice Chinese catalog', () => {
    const english = MINIMAX_SYSTEM_VOICES.filter((voice) => voice.language === 'en')

    expect(MINIMAX_SYSTEM_VOICES).toHaveLength(68)
    expect(MINIMAX_CHINESE_SYSTEM_VOICES).toHaveLength(64)
    expect(english.map((voice) => voice.locale)).toEqual(['en-US', 'en-US', 'en-US', 'en-GB'])
    expect(english.every((voice) => voice.languageBoost === 'English')).toBe(true)
    expect(english.every((voice) => isMiniMaxSystemRemoteVoiceId(voice.remoteVoiceId))).toBe(true)
    expect(isMiniMaxChineseSystemRemoteVoiceId(english[0].remoteVoiceId)).toBe(false)
  })

  it('keeps exactly two recommendations at the front of the English list', () => {
    const ordered = orderMiniMaxSystemVoicesForBedtime(MINIMAX_SYSTEM_VOICES.filter((voice) => voice.language === 'en'))

    expect(ordered.slice(0, 2).map((voice) => voice.name)).toEqual(['Warm English Lady', 'Gentle English Woman'])
    expect(ordered.filter((voice) => voice.bedtimeRecommendationRank)).toHaveLength(2)
  })
})
