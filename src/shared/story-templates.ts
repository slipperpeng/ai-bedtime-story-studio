import type { ChapterLengthPresetId } from './child-story-profile'
import type { IllustrationStyleId } from './illustration-styles'
import type { BackgroundMusicTrackId } from './background-music'

export interface StoryTemplatePreset {
  id: string
  icon: string
  label: string
  tagline: string
  title: string
  theme: string
  storySeed: string
  chapterCount: number
  chapterLengthPreset: Exclude<ChapterLengthPresetId, 'custom'>
  illustrationStyle: IllustrationStyleId
  backgroundMusicTrackId: BackgroundMusicTrackId
}

export const STORY_TEMPLATES: readonly StoryTemplatePreset[] = [
  {
    id: 'brave-night-forest', icon: '🏮', label: '勇气小灯笼', tagline: '温柔面对黑暗',
    title: '月光森林里的小灯笼', theme: '在朋友的陪伴下学会面对黑暗，发现勇气并不是不害怕，而是愿意慢慢向前。',
    storySeed: '主角在停电的夜晚得到一盏会说话的小灯笼，与森林朋友一起寻找丢失的星光。旅途中保持安全、温暖，没有惊吓场面，最后回到家人的怀抱。',
    chapterCount: 5, chapterLengthPreset: 'recommended', illustrationStyle: 'moonlight-watercolor', backgroundMusicTrackId: 'brave-lantern',
  },
  {
    id: 'star-friendship', icon: '⭐', label: '星星邮局', tagline: '友谊与守信',
    title: '寄给星星的晚安信', theme: '感受友谊、守信和互相帮助带来的快乐。',
    storySeed: '主角发现一家只在夜晚出现的星星邮局，要和新朋友一起把一封重要的晚安信送到天空。故事充满轻柔奇遇，以伙伴互相帮助完成约定作为结尾。',
    chapterCount: 5, chapterLengthPreset: 'recommended', illustrationStyle: 'colored-pencil', backgroundMusicTrackId: 'twinkling-stars',
  },
  {
    id: 'cloud-voyage', icon: '☁️', label: '云朵航行', tagline: '想象力与探索',
    title: '云朵小船的秘密航线', theme: '鼓励好奇心和想象力，在探索未知时学会观察与思考。',
    storySeed: '一艘柔软的云朵小船停在窗边，邀请主角前往天空花园。途中经过会唱歌的风、彩虹桥和云朵鲸鱼，所有冒险轻松安全。',
    chapterCount: 6, chapterLengthPreset: 'standard', illustrationStyle: 'soft-clay', backgroundMusicTrackId: 'cloud-boat',
  },
  {
    id: 'forest-goodnight', icon: '🌲', label: '森林晚安会', tagline: '规律作息与互助',
    title: '森林里的最后一盏灯', theme: '认识规律作息的重要，也学会在朋友需要时给予温柔帮助。',
    storySeed: '森林里的小动物都准备睡觉，只有一只小刺猬找不到自己的晚安毯。主角陪它沿着月光小路寻找，并向不同动物学习各自的睡前习惯。',
    chapterCount: 5, chapterLengthPreset: 'recommended', illustrationStyle: 'paper-cut-collage', backgroundMusicTrackId: 'forest-goodnight',
  },
  {
    id: 'whale-kindness', icon: '🐋', label: '小鲸鱼的梦', tagline: '善意与倾听',
    title: '会收藏歌声的小鲸鱼', theme: '学会倾听别人的感受，用善意帮助孤单的朋友。',
    storySeed: '主角在海边遇到一只只能在梦里唱歌的小鲸鱼，于是乘上贝壳小船前往蓝色海底，帮助它找回愿意倾听歌声的朋友。',
    chapterCount: 5, chapterLengthPreset: 'standard', illustrationStyle: 'moonlight-watercolor', backgroundMusicTrackId: 'little-whale-dream',
  },
  {
    id: 'rainy-day-comfort', icon: '🌧️', label: '雨夜小屋', tagline: '接纳情绪与安心',
    title: '雨滴敲门的晚上', theme: '接纳偶尔出现的不安与难过，学习用呼吸、表达和陪伴让自己平静下来。',
    storySeed: '一个下雨的夜晚，主角听见窗外的小雨滴来敲门。每一颗雨滴都带着一种小情绪，主角和家人一起帮助它们找到舒服的安放方式。',
    chapterCount: 4, chapterLengthPreset: 'recommended', illustrationStyle: 'colored-pencil', backgroundMusicTrackId: 'rainy-cottage',
  },
  {
    id: 'magic-library', icon: '📚', label: '魔法图书馆', tagline: '阅读与知识',
    title: '午夜开放的魔法图书馆', theme: '感受阅读和知识带来的力量，懂得问题可以通过观察、提问和查找答案解决。',
    storySeed: '主角发现书架后藏着一座夜间图书馆，每本书都通向一个温柔的小世界。为了帮助迷路的故事角色回家，主角需要读懂三条线索。',
    chapterCount: 6, chapterLengthPreset: 'standard', illustrationStyle: 'paper-cut-collage', backgroundMusicTrackId: 'magic-library',
  },
  {
    id: 'moon-adventure', icon: '🌙', label: '月球漫步', tagline: '科学好奇心',
    title: '今晚，我们去月球散步', theme: '激发对太空和科学的好奇，同时认识准备、合作和安全规则的重要。',
    storySeed: '主角收到月亮兔的邀请，乘坐安静的梦境飞船前往月球。一路认识重力、环形山和遥远的地球，科学内容要准确但表达简单有趣。',
    chapterCount: 6, chapterLengthPreset: 'standard', illustrationStyle: 'soft-clay', backgroundMusicTrackId: 'moon-walk',
  },
  {
    id: 'rainbow-sharing', icon: '🌈', label: '彩虹好朋友', tagline: '分享与合作',
    title: '彩虹桥上的礼物', theme: '体验分享、合作和轮流带来的快乐。',
    storySeed: '雨后出现了一座彩虹桥，桥上的七种颜色各自缺少一样东西。主角和朋友们必须分享手中的小礼物、轮流完成任务，才能让彩虹重新发光。',
    chapterCount: 5, chapterLengthPreset: 'recommended', illustrationStyle: 'crayon-doodle', backgroundMusicTrackId: 'rainbow-friends',
  },
  {
    id: 'family-embrace', icon: '🏠', label: '家的抱抱', tagline: '亲情与安全感',
    title: '装满抱抱的小口袋', theme: '感受家人的爱与陪伴，知道短暂分开时爱依然会留在身边。',
    storySeed: '主角第一次要独自在自己的小床上入睡，家人送来一个看不见却装满拥抱的小口袋。主角带着它帮助几位想家的小动物，最后安心回到被窝。',
    chapterCount: 4, chapterLengthPreset: 'recommended', illustrationStyle: 'colored-pencil', backgroundMusicTrackId: 'mothers-embrace',
  },
]

const ENGLISH_TEMPLATE_COPY: Record<string, Pick<StoryTemplatePreset, 'label' | 'tagline' | 'title' | 'theme' | 'storySeed'>> = {
  'brave-night-forest': { label: 'Brave Little Lantern', tagline: 'Gently facing the dark', title: 'The Little Lantern in Moonlight Forest', theme: 'Discover that courage does not mean never feeling afraid; it means taking the next small step with a friend beside you.', storySeed: 'During a power cut, the main character meets a talking lantern and joins forest friends in searching for a lost piece of starlight. The journey stays safe and comforting and ends back in a loving home.' },
  'star-friendship': { label: 'The Star Post Office', tagline: 'Friendship and keeping promises', title: 'A Goodnight Letter for the Stars', theme: 'Explore the joy of friendship, keeping promises, and helping one another.', storySeed: 'A post office that appears only at night asks the main character and a new friend to deliver an important goodnight letter to the sky. They keep their promise by working together.' },
  'cloud-voyage': { label: 'Cloud Voyage', tagline: 'Imagination and discovery', title: "The Cloud Boat's Secret Route", theme: 'Encourage curiosity and imagination while learning to observe and think during a new adventure.', storySeed: 'A soft cloud boat stops by the window and carries the main character to a sky garden, past a singing wind, a rainbow bridge, and a cloud whale. Every adventure is gentle and safe.' },
  'forest-goodnight': { label: 'Forest Goodnight', tagline: 'Bedtime routines and helping', title: 'The Last Light in the Forest', theme: 'Learn why a steady bedtime routine matters and how a small act of help can comfort a friend.', storySeed: "Every forest friend is ready for bed except a little hedgehog whose goodnight blanket is missing. The main character follows a moonlit trail and learns each animal's bedtime ritual along the way." },
  'whale-kindness': { label: "Little Whale's Dream", tagline: 'Kindness and listening', title: 'The Little Whale Who Collected Songs', theme: 'Practice listening to feelings and offering kindness to someone who feels alone.', storySeed: 'On the shore, the main character meets a whale who can sing only in dreams. A shell boat carries them into the blue sea to find friends who will truly listen.' },
  'rainy-day-comfort': { label: 'The Rainy Cottage', tagline: 'Welcoming every feeling', title: 'The Night the Raindrops Knocked', theme: 'Accept moments of worry or sadness and learn how breathing, naming a feeling, and a caring hug can help.', storySeed: 'On a rainy night, tiny raindrops knock at the window. Each carries a different feeling, and the main character and family help every one of them find a comfortable place to rest.' },
  'magic-library': { label: 'The Magic Library', tagline: 'Reading and discovery', title: 'The Magic Library at Midnight', theme: 'Discover how reading and knowledge help us solve problems by observing, asking questions, and looking for answers.', storySeed: 'Behind a bookshelf is a library that opens only at night. Each book leads to a gentle world, and three written clues can guide a lost story character home.' },
  'moon-adventure': { label: 'Moon Walk', tagline: 'Curiosity about science', title: "Tonight, We're Walking on the Moon", theme: 'Spark curiosity about space while showing why preparation, teamwork, and safety rules matter.', storySeed: 'A moon rabbit invites the main character aboard a quiet dream ship. Along the way they learn about gravity, craters, and the distant Earth in simple, accurate language.' },
  'rainbow-sharing': { label: 'Rainbow Friends', tagline: 'Sharing and teamwork', title: 'The Gift on Rainbow Bridge', theme: 'Experience the joy of sharing, cooperating, and taking turns.', storySeed: 'After the rain, a rainbow bridge appears, but each color is missing something. Friends share small gifts and take turns completing the tasks that make the rainbow shine again.' },
  'family-embrace': { label: "Home's Big Hug", tagline: 'Family love and security', title: 'The Little Pocket Full of Hugs', theme: 'Feel the steadiness of family love and know that it remains close even during a short separation.', storySeed: 'Before sleeping alone for the first time, the main character receives an invisible pocket full of family hugs, then uses it to comfort several homesick woodland friends.' },
}

export const ENGLISH_STORY_TEMPLATES: readonly StoryTemplatePreset[] = STORY_TEMPLATES.map((template) => ({
  ...template,
  ...ENGLISH_TEMPLATE_COPY[template.id],
}))

export function storyTemplates(language: 'zh' | 'en'): readonly StoryTemplatePreset[] {
  return language === 'en' ? ENGLISH_STORY_TEMPLATES : STORY_TEMPLATES
}
