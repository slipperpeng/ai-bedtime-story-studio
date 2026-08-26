export const BACKGROUND_MUSIC_TRACK_IDS = [
  'moonlight-lullaby',
  'twinkling-stars',
  'cloud-boat',
  'forest-goodnight',
  'firefly-garden',
  'rainy-cottage',
  'fireside-story',
  'ocean-embrace',
  'little-whale-dream',
  'meadow-breeze',
  'falling-snow',
  'spring-flowers',
  'bamboo-moonlight',
  'little-train-home',
  'magic-library',
  'moon-walk',
  'rainbow-friends',
  'brave-lantern',
  'mothers-embrace',
  'sweet-dreamland',
] as const

export type BackgroundMusicTrackId = typeof BACKGROUND_MUSIC_TRACK_IDS[number]

export interface BackgroundMusicTrack {
  id: BackgroundMusicTrackId
  label: string
  description: string
  mood: string
  duration: string
  resourceFile: string
  assetPath: string
}

const track = (
  id: BackgroundMusicTrackId,
  label: string,
  description: string,
  mood: string,
  duration: string,
): BackgroundMusicTrack => ({
  id,
  label,
  description,
  mood,
  duration,
  resourceFile: `${id}.mp3`,
  assetPath: `builtin-music/${id}.mp3`,
})

export const BACKGROUND_MUSIC_TRACKS: readonly BackgroundMusicTrack[] = [
  track('moonlight-lullaby', '月光摇篮', '月光、卧室与安稳入睡', '温柔宁静', '3:01'),
  track('twinkling-stars', '星星眨眼', '清澈星光与轻盈童话感', '梦幻明亮', '2:56'),
  track('cloud-boat', '云朵小船', '在云海中缓慢漂流的奇遇', '轻盈舒展', '2:55'),
  track('forest-goodnight', '森林晚安', '小动物回到树洞准备睡觉', '自然安心', '2:59'),
  track('firefly-garden', '萤火虫花园', '夜晚花园里的微光与秘密', '童趣温暖', '2:56'),
  track('rainy-cottage', '雨夜小屋', '窗外细雨与屋内柔软灯光', '舒适治愈', '2:55'),
  track('fireside-story', '壁炉边的故事', '家人围坐、分享与陪伴', '亲密温暖', '2:55'),
  track('ocean-embrace', '海浪抱抱', '海边、沙滩与温柔潮汐', '安静辽阔', '2:53'),
  track('little-whale-dream', '小鲸鱼的梦', '蓝色海底与善良的小鲸鱼', '梦幻柔和', '2:56'),
  track('meadow-breeze', '草地上的微风', '傍晚草地、花朵与小动物', '清新舒缓', '2:55'),
  track('falling-snow', '雪花慢慢落下', '冬夜窗边与纯净雪景', '安静纯净', '2:58'),
  track('spring-flowers', '春日花朵', '花园苏醒与轻快成长', '清新明亮', '2:32'),
  track('bamboo-moonlight', '竹林月色', '东方月夜、竹林与含蓄诗意', '东方静谧', '2:56'),
  track('little-train-home', '小火车回家', '夜色旅程与温暖归家', '平稳期待', '2:58'),
  track('magic-library', '魔法图书馆', '会发光的书页与知识冒险', '神奇温暖', '2:53'),
  track('moon-walk', '月球漫步', '月球、星空与温柔探索', '辽阔好奇', '2:54'),
  track('rainbow-friends', '彩虹后的朋友', '友谊、分享与雨后彩虹', '明亮友爱', '2:58'),
  track('brave-lantern', '勇气的小灯笼', '在陪伴中慢慢面对害怕', '勇敢安心', '2:37'),
  track('mothers-embrace', '妈妈的怀抱', '依偎、家庭与无条件的爱', '亲密安稳', '2:29'),
  track('sweet-dreamland', '甜甜的梦乡', '故事结束后慢慢进入梦乡', '困倦柔软', '2:54'),
]

const ENGLISH_TRACK_COPY: Record<BackgroundMusicTrackId, Pick<BackgroundMusicTrack, 'label' | 'description' | 'mood'>> = {
  'moonlight-lullaby': { label: 'Moonlight Lullaby', description: 'Moonlight, a quiet bedroom, and restful sleep', mood: 'Gentle and still' },
  'twinkling-stars': { label: 'Twinkling Stars', description: 'Clear starlight with a weightless fairy-tale feeling', mood: 'Bright and dreamy' },
  'cloud-boat': { label: 'Cloud Boat', description: 'A slow journey across a sea of clouds', mood: 'Light and floating' },
  'forest-goodnight': { label: 'Forest Goodnight', description: 'Woodland friends settling into their little homes', mood: 'Natural and safe' },
  'firefly-garden': { label: 'Firefly Garden', description: 'Tiny lights and secrets in a nighttime garden', mood: 'Playful and warm' },
  'rainy-cottage': { label: 'Rainy Cottage', description: 'Soft rain outside and warm lamplight within', mood: 'Cozy and healing' },
  'fireside-story': { label: 'Fireside Story', description: 'Family, sharing, and time together by the fire', mood: 'Close and warm' },
  'ocean-embrace': { label: 'Ocean Embrace', description: 'A gentle tide along a peaceful shore', mood: 'Quiet and spacious' },
  'little-whale-dream': { label: "Little Whale's Dream", description: 'A blue ocean dream with a kind little whale', mood: 'Soft and dreamy' },
  'meadow-breeze': { label: 'Meadow Breeze', description: 'Evening grass, flowers, and small animals', mood: 'Fresh and soothing' },
  'falling-snow': { label: 'Falling Snow', description: 'A winter window and a quiet blanket of snow', mood: 'Pure and peaceful' },
  'spring-flowers': { label: 'First Spring Flowers', description: 'A waking garden and gentle new growth', mood: 'Fresh and bright' },
  'bamboo-moonlight': { label: 'Bamboo Moonlight', description: 'A clear moon above a softly moving bamboo grove', mood: 'Graceful and calm' },
  'little-train-home': { label: 'Little Train Home', description: 'A nighttime journey toward a warm home', mood: 'Steady and hopeful' },
  'magic-library': { label: 'The Magic Library', description: 'Glowing pages and a gentle quest for knowledge', mood: 'Wonderfully warm' },
  'moon-walk': { label: 'Moon Walk', description: 'The moon, the stars, and a gentle discovery', mood: 'Curious and cosmic' },
  'rainbow-friends': { label: 'Rainbow Friends', description: 'Friendship, sharing, and a rainbow after rain', mood: 'Bright friendship' },
  'brave-lantern': { label: 'The Brave Lantern', description: 'Learning to face fear with someone beside you', mood: 'Brave and safe' },
  'mothers-embrace': { label: "A Mother's Embrace", description: 'Family closeness and unconditional love', mood: 'Loving and secure' },
  'sweet-dreamland': { label: 'Sweet Dreamland', description: 'Drifting gently to sleep after the story ends', mood: 'Soft and sleepy' },
}

export const ENGLISH_BACKGROUND_MUSIC_TRACKS: readonly BackgroundMusicTrack[] = BACKGROUND_MUSIC_TRACKS.map((item) => ({
  ...item,
  ...ENGLISH_TRACK_COPY[item.id],
}))

export const DEFAULT_BACKGROUND_MUSIC_TRACK_ID: BackgroundMusicTrackId = 'moonlight-lullaby'

export function backgroundMusicTracks(language: 'zh' | 'en' = 'zh'): readonly BackgroundMusicTrack[] {
  return language === 'en' ? ENGLISH_BACKGROUND_MUSIC_TRACKS : BACKGROUND_MUSIC_TRACKS
}

export function backgroundMusicTrack(id?: string, language: 'zh' | 'en' = 'zh'): BackgroundMusicTrack | undefined {
  return backgroundMusicTracks(language).find((item) => item.id === id)
}

export function isBackgroundMusicTrackId(value: string): value is BackgroundMusicTrackId {
  return BACKGROUND_MUSIC_TRACK_IDS.includes(value as BackgroundMusicTrackId)
}
