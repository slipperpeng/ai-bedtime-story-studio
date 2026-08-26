export const ILLUSTRATION_STYLE_IDS = [
  'moonlight-watercolor',
  'paper-cut-collage',
  'crayon-doodle',
  'colored-pencil',
  'soft-clay',
] as const

export type IllustrationStyleId = typeof ILLUSTRATION_STYLE_IDS[number]

export interface IllustrationStylePreset {
  id: IllustrationStyleId
  label: string
  description: string
  visualStyle: string
  palette: string
  negativePrompt: string
  previewAsset: string
}

export const DEFAULT_ILLUSTRATION_STYLE: IllustrationStyleId = 'moonlight-watercolor'

export const ILLUSTRATION_STYLES: readonly IllustrationStylePreset[] = [
  {
    id: 'moonlight-watercolor',
    label: '月光水彩',
    description: '水色轻轻晕开，留白柔和，像睡前翻开的手绘绘本。',
    visualStyle: '透明水彩儿童绘本，湿画法柔和晕染，细腻手工纸颗粒，边缘自然松弛，轻盈留白，非写实人物',
    palette: '雾蓝、月光黄、鼠尾草绿与少量珊瑚粉，低饱和、明亮柔和',
    negativePrompt: '厚重油彩、硬朗矢量块、塑料质感、照片写实',
    previewAsset: './illustration-styles/moonlight-watercolor.png',
  },
  {
    id: 'paper-cut-collage',
    label: '纸艺拼贴',
    description: '彩纸一层层叠出森林，轮廓简洁，画面像亲手做的小剧场。',
    visualStyle: '手工彩纸剪贴儿童绘本，清晰纸张纤维，圆润剪裁边缘，多层纸片与柔和投影，简洁几何造型，非写实人物',
    palette: '深森林绿、湖水蓝、奶油白、番茄红与暖黄色，层次分明但不刺眼',
    negativePrompt: '照片写实、透明水彩晕染、金属高光、复杂细碎背景',
    previewAsset: './illustration-styles/paper-cut-collage.png',
  },
  {
    id: 'crayon-doodle',
    label: '蜡笔童画',
    description: '粗粗的蜡笔线条和颗粒色块，活泼亲切，保留孩子画画的温度。',
    visualStyle: '蜡笔与油画棒儿童插画，明显手绘颗粒，略带不规则的粗线条，朴拙圆润造型，色块保留纸面擦痕，非写实人物',
    palette: '天空蓝、草地绿、向日葵黄、莓果红与暖白纸色，活泼但控制饱和度',
    negativePrompt: '精密写实、光滑三维材质、锐利描边、印刷矢量感',
    previewAsset: './illustration-styles/crayon-doodle.png',
  },
  {
    id: 'colored-pencil',
    label: '彩铅童话',
    description: '细密排线描出树叶和星光，温暖安静，适合有更多细节的故事。',
    visualStyle: '细腻彩色铅笔儿童绘本，可见柔和排线与叠色，纸张纹理自然，轮廓精致但不过度锐利，温暖叙事感，非写实人物',
    palette: '松针绿、灰蓝、琥珀黄、砖红与象牙白，温暖克制、细节丰富',
    negativePrompt: '照片写实、霓虹色、扁平矢量、大面积塑料高光',
    previewAsset: './illustration-styles/colored-pencil.png',
  },
  {
    id: 'soft-clay',
    label: '软陶梦境',
    description: '圆润的软陶角色像定格动画，柔软立体，带一点可以触摸的梦幻感。',
    visualStyle: '手工软陶定格动画风儿童绘本，圆润微缩角色，细微指纹与黏土纹理，柔软体积光，玩具舞台般的景深，非写实人物',
    palette: '薄荷绿、薰衣草蓝、蜂蜜黄、桃粉与柔和夜空蓝，粉彩低对比',
    negativePrompt: '真人照片、坚硬塑料、玻璃质感、尖锐结构、恐怖玩偶',
    previewAsset: './illustration-styles/soft-clay.png',
  },
]

const ENGLISH_STYLE_COPY: Record<IllustrationStyleId, Pick<IllustrationStylePreset, 'label' | 'description'>> = {
  'moonlight-watercolor': { label: 'Moonlight watercolor', description: 'Soft washes, gentle paper texture, and breathing room for a quiet hand-painted bedtime book.' },
  'paper-cut-collage': { label: 'Paper-cut collage', description: 'Layered paper shapes turn each forest into a small stage made by hand.' },
  'crayon-doodle': { label: 'Crayon doodle', description: "Chunky crayon lines and textured color blocks keep the warmth of a child's drawing." },
  'colored-pencil': { label: 'Colored-pencil fairy tale', description: 'Fine pencil strokes reveal leaves and starlight in stories that invite a closer look.' },
  'soft-clay': { label: 'Soft-clay dream', description: 'Rounded handmade clay figures bring a cozy, tactile dimension to a fairy-tale world.' },
}

export const ENGLISH_ILLUSTRATION_STYLES: readonly IllustrationStylePreset[] = ILLUSTRATION_STYLES.map((style) => ({
  ...style,
  ...ENGLISH_STYLE_COPY[style.id],
}))

export function illustrationStyles(language: 'zh' | 'en' = 'zh'): readonly IllustrationStylePreset[] {
  return language === 'en' ? ENGLISH_ILLUSTRATION_STYLES : ILLUSTRATION_STYLES
}

export function illustrationStylePreset(id: IllustrationStyleId): IllustrationStylePreset {
  return ILLUSTRATION_STYLES.find((style) => style.id === id) || ILLUSTRATION_STYLES[0]
}
