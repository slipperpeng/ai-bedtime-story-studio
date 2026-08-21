export interface NarrativeTone {
  readonly id: string
  readonly label: string
  readonly summary: string
  readonly prompt: string
  readonly example: string
  readonly speechSpeed: number
  readonly speechTempo: string
}

export const NARRATIVE_TONES = [
  {
    id: '温柔舒缓',
    label: '温柔舒缓',
    summary: '慢节奏 · 柔和陪伴',
    prompt: '句子舒缓、停顿自然，多用轻柔的感官描写和陪伴式表达，避免强烈冲突或突然转折',
    example: '小猫轻轻踏上月光小桥。晚风贴着它的耳朵吹过，像一句小小的“别担心”，陪它慢慢走向桥的另一边。',
    speechSpeed: 0.66,
    speechTempo: '偏慢 · 适合睡前',
  },
  {
    id: '轻松有趣',
    label: '轻松有趣',
    summary: '俏皮对话 · 小小笑点',
    prompt: '节奏轻快，加入适量俏皮对白和无伤害的小笑点，保持温暖并避免让孩子睡前过度兴奋',
    example: '小猫刚迈上月光小桥，尾巴就紧张得打了个小卷。“别急，”桥下的青蛙笑着说，“你的尾巴只是先替你系好了安全带！”',
    speechSpeed: 0.72,
    speechTempo: '偏慢 · 保留俏皮感',
  },
  {
    id: '梦幻诗意',
    label: '梦幻诗意',
    summary: '奇妙意象 · 画面轻盈',
    prompt: '使用有节制的比喻和奇妙意象，语言富有画面感，梦幻但情节清楚、适合儿童理解',
    example: '月光从云朵的口袋里流下来，织成一座银色小桥。小猫踩着一粒粒发亮的脚印，仿佛正走进星星悄悄写下的梦。',
    speechSpeed: 0.65,
    speechTempo: '偏慢 · 画面感停顿',
  },
  {
    id: '安静治愈',
    label: '安静治愈',
    summary: '克制留白 · 安心接纳',
    prompt: '叙述安静克制，适当留白，关注理解、接纳与安全感，不催促、不评判，也不直接说教',
    example: '小猫在桥边停了一会儿。朋友没有催它，只是安静地坐在身旁。等呼吸慢下来，小猫点点头，和朋友一起走进了月光里。',
    speechSpeed: 0.60,
    speechTempo: '慢速 · 最安静',
  },
] as const satisfies readonly NarrativeTone[]

export type NarrativeToneId = (typeof NARRATIVE_TONES)[number]['id']

const tonesById = new Map<string, NarrativeTone>(NARRATIVE_TONES.map((tone) => [tone.id, tone]))

export function findNarrativeTone(id: string): NarrativeTone | undefined {
  return tonesById.get(id)
}

export function narrativeTonePrompt(id: string): string {
  return findNarrativeTone(id)?.prompt || id
}

export function narrativeSpeechSpeed(id: string): number {
  return findNarrativeTone(id)?.speechSpeed ?? 0.66
}
