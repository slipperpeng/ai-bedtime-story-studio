export interface MiniMaxSystemVoice {
  readonly id: string
  readonly provider: 'minimax-system'
  readonly name: string
  readonly language: 'zh' | 'en'
  readonly locale: 'zh-CN' | 'zh-HK' | 'en-US' | 'en-GB'
  readonly remoteVoiceId: string
  readonly languageBoost: 'Chinese' | 'Chinese,Yue' | 'English'
  readonly bedtimeRecommendationRank?: number
  readonly bedtimeRecommendationReason?: string
}

// These IDs are persisted by the application. Never renumber or reuse them.
const catalog = [
  { id: 'minimax-zh-cn-001', provider: 'minimax-system', name: '青涩青年音色', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'male-qn-qingse', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-002', provider: 'minimax-system', name: '精英青年音色', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'male-qn-jingying', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-003', provider: 'minimax-system', name: '霸道青年音色', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'male-qn-badao', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-004', provider: 'minimax-system', name: '青年大学生音色', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'male-qn-daxuesheng', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-005', provider: 'minimax-system', name: '少女音色', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'female-shaonv', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-006', provider: 'minimax-system', name: '御姐音色', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'female-yujie', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-007', provider: 'minimax-system', name: '成熟女性音色', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'female-chengshu', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-008', provider: 'minimax-system', name: '甜美女性音色', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'female-tianmei', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-009', provider: 'minimax-system', name: '青涩青年音色-beta', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'male-qn-qingse-jingpin', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-010', provider: 'minimax-system', name: '精英青年音色-beta', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'male-qn-jingying-jingpin', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-011', provider: 'minimax-system', name: '霸道青年音色-beta', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'male-qn-badao-jingpin', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-012', provider: 'minimax-system', name: '青年大学生音色-beta', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'male-qn-daxuesheng-jingpin', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-013', provider: 'minimax-system', name: '少女音色-beta', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'female-shaonv-jingpin', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-014', provider: 'minimax-system', name: '御姐音色-beta', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'female-yujie-jingpin', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-015', provider: 'minimax-system', name: '成熟女性音色-beta', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'female-chengshu-jingpin', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-016', provider: 'minimax-system', name: '甜美女性音色-beta', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'female-tianmei-jingpin', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-017', provider: 'minimax-system', name: '聪明男童', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'clever_boy', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-018', provider: 'minimax-system', name: '可爱男童', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'cute_boy', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-019', provider: 'minimax-system', name: '萌萌女童', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'lovely_girl', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-020', provider: 'minimax-system', name: '卡通猪小琪', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'cartoon_pig', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-021', provider: 'minimax-system', name: '病娇弟弟', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'bingjiao_didi', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-022', provider: 'minimax-system', name: '俊朗男友', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'junlang_nanyou', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-023', provider: 'minimax-system', name: '纯真学弟', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'chunzhen_xuedi', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-024', provider: 'minimax-system', name: '冷淡学长', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'lengdan_xiongzhang', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-025', provider: 'minimax-system', name: '霸道少爷', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'badao_shaoye', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-026', provider: 'minimax-system', name: '甜心小玲', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'tianxin_xiaoling', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-027', provider: 'minimax-system', name: '俏皮萌妹', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'qiaopi_mengmei', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-028', provider: 'minimax-system', name: '妩媚御姐', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'wumei_yujie', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-029', provider: 'minimax-system', name: '嗲嗲学妹', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'diadia_xuemei', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-030', provider: 'minimax-system', name: '淡雅学姐', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'danya_xuejie', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-031', provider: 'minimax-system', name: '沉稳高管', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Reliable_Executive', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-032', provider: 'minimax-system', name: '新闻女声', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_News_Anchor', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-033', provider: 'minimax-system', name: '傲娇御姐', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Mature_Woman', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-034', provider: 'minimax-system', name: '不羁青年', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Unrestrained_Young_Man', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-035', provider: 'minimax-system', name: '嚣张小姐', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Arrogant_Miss', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-036', provider: 'minimax-system', name: '机械战甲', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Robot_Armor', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-037', provider: 'minimax-system', name: '热心大婶', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Kind-hearted_Antie', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-038', provider: 'minimax-system', name: '港普空姐', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_HK_Flight_Attendant', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-039', provider: 'minimax-system', name: '搞笑大爷', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Humorous_Elder', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-040', provider: 'minimax-system', name: '温润男声', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Gentleman', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-041', provider: 'minimax-system', name: '温暖闺蜜', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Warm_Bestie', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-042', provider: 'minimax-system', name: '播报男声', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Male_Announcer', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-043', provider: 'minimax-system', name: '甜美女声', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Sweet_Lady', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-044', provider: 'minimax-system', name: '南方小哥', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Southern_Young_Man', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-045', provider: 'minimax-system', name: '阅历姐姐', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Wise_Women', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-046', provider: 'minimax-system', name: '温润青年', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Gentle_Youth', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-047', provider: 'minimax-system', name: '温暖少女', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Warm_Girl', languageBoost: 'Chinese', bedtimeRecommendationRank: 1, bedtimeRecommendationReason: '温暖明亮、带自然微笑，最适合儿童童话朗读' },
  { id: 'minimax-zh-cn-048', provider: 'minimax-system', name: '花甲奶奶', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Kind-hearted_Elder', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-049', provider: 'minimax-system', name: '憨憨萌兽', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Cute_Spirit', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-050', provider: 'minimax-system', name: '电台男主播', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Radio_Host', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-051', provider: 'minimax-system', name: '抒情男声', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Lyrical_Voice', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-052', provider: 'minimax-system', name: '率真弟弟', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Straightforward_Boy', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-053', provider: 'minimax-system', name: '真诚青年', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Sincere_Adult', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-054', provider: 'minimax-system', name: '温柔学姐', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Gentle_Senior', languageBoost: 'Chinese', bedtimeRecommendationRank: 2, bedtimeRecommendationReason: '温柔亲切，适合舒缓的日常晚安故事' },
  { id: 'minimax-zh-cn-055', provider: 'minimax-system', name: '嘴硬竹马', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Stubborn_Friend', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-056', provider: 'minimax-system', name: '清脆少女', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Crisp_Girl', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-057', provider: 'minimax-system', name: '清澈邻家弟弟', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Pure-hearted_Boy', languageBoost: 'Chinese' },
  { id: 'minimax-zh-cn-058', provider: 'minimax-system', name: '柔和少女', language: 'zh', locale: 'zh-CN', remoteVoiceId: 'Chinese (Mandarin)_Soft_Girl', languageBoost: 'Chinese' },
  { id: 'minimax-zh-hk-001', provider: 'minimax-system', name: '专业女主持', language: 'zh', locale: 'zh-HK', remoteVoiceId: 'Cantonese_ProfessionalHost（F)', languageBoost: 'Chinese,Yue' },
  { id: 'minimax-zh-hk-002', provider: 'minimax-system', name: '温柔女声', language: 'zh', locale: 'zh-HK', remoteVoiceId: 'Cantonese_GentleLady', languageBoost: 'Chinese,Yue' },
  { id: 'minimax-zh-hk-003', provider: 'minimax-system', name: '专业男主持', language: 'zh', locale: 'zh-HK', remoteVoiceId: 'Cantonese_ProfessionalHost（M)', languageBoost: 'Chinese,Yue' },
  { id: 'minimax-zh-hk-004', provider: 'minimax-system', name: '活泼男声', language: 'zh', locale: 'zh-HK', remoteVoiceId: 'Cantonese_PlayfulMan', languageBoost: 'Chinese,Yue' },
  { id: 'minimax-zh-hk-005', provider: 'minimax-system', name: '可爱女孩', language: 'zh', locale: 'zh-HK', remoteVoiceId: 'Cantonese_CuteGirl', languageBoost: 'Chinese,Yue' },
  { id: 'minimax-zh-hk-006', provider: 'minimax-system', name: '善良女声', language: 'zh', locale: 'zh-HK', remoteVoiceId: 'Cantonese_KindWoman', languageBoost: 'Chinese,Yue' },
  { id: 'minimax-en-us-001', provider: 'minimax-system', name: 'Warm English Lady', language: 'en', locale: 'en-US', remoteVoiceId: 'English_Graceful_Lady', languageBoost: 'English', bedtimeRecommendationRank: 1, bedtimeRecommendationReason: 'Soft and clear for a child-friendly bedtime story' },
  { id: 'minimax-en-us-002', provider: 'minimax-system', name: 'Gentle English Woman', language: 'en', locale: 'en-US', remoteVoiceId: 'Serene_Woman', languageBoost: 'English', bedtimeRecommendationRank: 2, bedtimeRecommendationReason: 'Quiet and soothing for goodnight narration' },
  { id: 'minimax-en-us-003', provider: 'minimax-system', name: 'Friendly English Man', language: 'en', locale: 'en-US', remoteVoiceId: 'English_Trustworthy_Man', languageBoost: 'English', bedtimeRecommendationReason: 'Warm and reassuring for shared reading' },
  { id: 'minimax-en-us-004', provider: 'minimax-system', name: 'Gentle English Storyteller', language: 'en', locale: 'en-US', remoteVoiceId: 'English_Gentle-voiced_man', languageBoost: 'English', bedtimeRecommendationReason: 'Gentle, clear, and audible for quiet fairy-tale adventures' },
] as const satisfies readonly MiniMaxSystemVoice[]

export type MiniMaxSystemVoiceId = (typeof catalog)[number]['id']
export type MiniMaxChineseSystemRemoteVoiceId = (typeof catalog)[number]['remoteVoiceId']
export type MiniMaxSystemRemoteVoiceId = (typeof catalog)[number]['remoteVoiceId']

export const MINIMAX_CHINESE_SYSTEM_VOICES: readonly MiniMaxSystemVoice[] = Object.freeze(
  catalog.filter((voice) => voice.language === 'zh').map((voice) => Object.freeze({ ...voice })),
)

export const MINIMAX_SYSTEM_VOICES: readonly MiniMaxSystemVoice[] = Object.freeze(
  catalog.map((voice) => Object.freeze({ ...voice })),
)

const voicesById = new Map(MINIMAX_SYSTEM_VOICES.map((voice) => [voice.id, voice] as const))
const voicesByRemoteId = new Map(MINIMAX_SYSTEM_VOICES.map((voice) => [voice.remoteVoiceId, voice] as const))
const chineseVoicesByRemoteId = new Map(MINIMAX_CHINESE_SYSTEM_VOICES.map((voice) => [voice.remoteVoiceId, voice] as const))

export function findMiniMaxSystemVoice(id: string): MiniMaxSystemVoice | undefined {
  return voicesById.get(id)
}

export function orderMiniMaxSystemVoicesForBedtime(voices: readonly MiniMaxSystemVoice[]): MiniMaxSystemVoice[] {
  return [...voices].sort((left, right) => {
    const leftRank = left.bedtimeRecommendationRank ?? Number.POSITIVE_INFINITY
    const rightRank = right.bedtimeRecommendationRank ?? Number.POSITIVE_INFINITY
    return leftRank - rightRank
  })
}

export function isMiniMaxSystemVoiceId(id: unknown): id is MiniMaxSystemVoiceId {
  return typeof id === 'string' && voicesById.has(id)
}

export function isMiniMaxChineseSystemRemoteVoiceId(
  remoteVoiceId: unknown,
): remoteVoiceId is MiniMaxChineseSystemRemoteVoiceId {
  return typeof remoteVoiceId === 'string' && chineseVoicesByRemoteId.has(remoteVoiceId)
}

export function isMiniMaxSystemRemoteVoiceId(
  remoteVoiceId: unknown,
): remoteVoiceId is MiniMaxSystemRemoteVoiceId {
  return typeof remoteVoiceId === 'string' && voicesByRemoteId.has(remoteVoiceId)
}
