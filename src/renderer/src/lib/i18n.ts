import { createContext, useContext } from 'react'

export type AppLanguage = 'zh' | 'en'

type TranslationValue = string | ((...args: string[]) => string)

const translations: Record<string, { zh: TranslationValue; en: TranslationValue }> = {
  appName: { zh: '枕边造梦', en: 'Dreamweaver' },
  appTagline: { zh: 'AI 睡前故事工坊', en: 'AI Bedtime Story Studio' },
  language: { zh: '语言', en: 'Language' },
  chinese: { zh: '中文', en: '中文' },
  english: { zh: 'English', en: 'English' },
  workspace: { zh: '工作区', en: 'Workspace' },
  newStory: { zh: '今晚的新故事', en: "Tonight's new story" },
  currentStory: { zh: '当前故事', en: 'Current story' },
  settings: { zh: '生成设置', en: 'Generation settings' },
  workflow: { zh: '制作流程', en: 'Workflow' },
  voices: { zh: '音色', en: 'Voice' },
  voiceDescription: { zh: '选择或录制', en: 'Choose or record' },
  story: { zh: '故事', en: 'Story' },
  storyDescription: { zh: '内容与章节', en: 'Content and chapters' },
  production: { zh: '制作', en: 'Production' },
  productionDescription: { zh: '插图与朗读', en: 'Art and narration' },
  library: { zh: '成品', en: 'Library' },
  libraryDescription: { zh: '预览与导出', en: 'Preview and export' },
  step: { zh: (n) => `步骤 ${n}`, en: (n) => `Step ${n}` },
  chooseVoiceTitle: { zh: '选择或建立朗读音色', en: 'Choose or create a narration voice' },
  chooseVoiceDescription: { zh: '直接使用内置中文音色，或录制已授权的成年人声音建立专属音色。', en: 'Use a built-in voice or record an authorized adult sample for a personal voice.' },
  builtInVoices: { zh: '内置音色', en: 'Built-in voices' },
  myVoices: { zh: '我的音色', en: 'My voices' },
  builtIn: { zh: '内置', en: 'Built-in' },
  onlineClone: { zh: '在线复刻', en: 'Online clone' },
  cloudBuiltIn: { zh: '云端内置音色', en: 'Cloud built-in voices' },
  configureOnline: { zh: '配置在线服务', en: 'Configure online service' },
  searchVoice: { zh: '搜索音色名称', en: 'Search voice names' },
  all: { zh: '全部', en: 'All' },
  mandarin: { zh: '普通话', en: 'Mandarin' },
  cantonese: { zh: '粤语', en: 'Cantonese' },
  preview: { zh: '试听', en: 'Preview' },
  stop: { zh: '停止', en: 'Stop' },
  generating: { zh: '生成中', en: 'Generating' },
  useVoice: { zh: '选用', en: 'Use' },
  noVoiceFound: { zh: '没有找到匹配的音色。', en: 'No matching voices found.' },
  showAll: { zh: (n) => `查看全部 ${n} 个`, en: (n) => `Show all ${n}` },
  collapse: { zh: '收起音色', en: 'Show fewer voices' },
  storyTitle: { zh: '定制今晚的故事', en: "Customize tonight's story" },
  storyDescriptionLong: { zh: '孩子信息会发送给所选文本模型；建议使用昵称，不填写学校、住址等信息。', en: 'Child details are sent to the selected text model. Use a nickname and avoid school, address, or other sensitive details.' },
  storyTemplates: { zh: '故事模板', en: 'Story templates' },
  storyTemplateHint: { zh: '一键填好主题、情节、章节、画风与配乐；孩子昵称和年龄不会被覆盖，所有内容都能继续修改。', en: 'Fill in a theme, plot, chapters, art style, and music in one click. The child name and age stay editable.' },
  storyLanguage: { zh: '故事语言', en: 'Story language' },
  storyLanguageHint: { zh: '选择后，故事正文、章节标题和朗读会使用对应语言。', en: 'The story text, chapter titles, and narration will use the selected language.' },
  chineseStory: { zh: '中文故事', en: 'Chinese story' },
  englishStory: { zh: 'English story', en: 'English story' },
  protagonist: { zh: '故事主角', en: 'Story characters' },
  protagonistHint: { zh: '用于称呼与内容适龄控制', en: 'Used for addressing and age-appropriate writing' },
  title: { zh: '故事标题', en: 'Story title' },
  childNickname: { zh: '孩子昵称', en: 'Child nickname' },
  age: { zh: '年龄', en: 'Age' },
  theme: { zh: '故事主题', en: 'Story theme' },
  source: { zh: '故事来源', en: 'Story source' },
  aiOriginal: { zh: 'AI 原创', en: 'AI original' },
  writeYourOwn: { zh: '自己编写', en: 'Write your own' },
  optionalPlot: { zh: '想加入的角色或情节（可选）', en: 'Characters or plot to include (optional)' },
  originalDraft: { zh: '故事原稿', en: 'Story draft' },
  artStyle: { zh: '绘图风格', en: 'Art style' },
  chaptersAndNarration: { zh: '章节与朗读', en: 'Chapters and narration' },
  chapterCount: { zh: '章节数量', en: 'Number of chapters' },
  chapterRange: { zh: '2–12 章', en: '2–12 chapters' },
  chapterLength: { zh: '每章文字字数', en: 'Characters per chapter' },
  ageRecommended: { zh: '适龄推荐', en: 'Age-based' },
  short: { zh: '简短', en: 'Short' },
  standard: { zh: '标准', en: 'Standard' },
  rich: { zh: '丰富', en: 'Rich' },
  custom: { zh: '自定义', en: 'Custom' },
  minCharacters: { zh: '最少字数', en: 'Minimum' },
  maxCharacters: { zh: '最多字数', en: 'Maximum' },
  createStory: { zh: '开始制作故事', en: 'Create story' },
  saveSettings: { zh: '保存设置', en: 'Save settings' },
  cancel: { zh: '取消', en: 'Cancel' },
  saving: { zh: '保存中…', en: 'Saving…' },
  myRecordedVoices: { zh: '录制的专属音色', en: 'Recorded voices' },
  noRecordedVoices: { zh: '还没有录制专属音色，也可以直接选用左侧的内置音色。', en: 'No recorded voices yet. You can use a built-in voice on the left.' },
  remove: { zh: '删除', en: 'Delete' },
  retry: { zh: '重试', en: 'Retry' },
  export: { zh: '导出', en: 'Export' },
  deleteStory: { zh: '删除故事', en: 'Delete story' },
  productionTitle: { zh: '制作图文与朗读', en: 'Create art and narration' },
  selectOrCreateTask: { zh: '选择或创建一个故事任务', en: 'Select or create a story task' },
  previewAndExport: { zh: '预览与导出故事', en: 'Preview and export stories' },
  settingsSaved: { zh: '设置已安全保存。', en: 'Settings saved securely.' },
  loading: { zh: '正在打开故事工坊…', en: 'Opening the story studio…' },
}

export type TranslationKey = keyof typeof translations

export function translate(language: AppLanguage, key: TranslationKey, ...args: string[]): string {
  const value = translations[key][language]
  return typeof value === 'function' ? value(...args) : value
}

export interface LanguageContextValue {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  t: (key: TranslationKey, ...args: string[]) => string
}

export const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage must be used inside LanguageContext.Provider')
  return value
}

export function detectLanguage(): AppLanguage {
  try {
    const saved = window.localStorage.getItem('bedtime-story-language')
    if (saved === 'en' || saved === 'zh') return saved
  } catch {
    // Storage can be unavailable in a restricted renderer; Chinese remains the safe default.
  }
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

export function persistLanguage(language: AppLanguage): void {
  try {
    window.localStorage.setItem('bedtime-story-language', language)
  } catch {
    // Keep the current session usable when storage is unavailable.
  }
}
