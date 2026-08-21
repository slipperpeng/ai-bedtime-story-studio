/* ==========================================================================
   五大艺术画风画廊组件 (Illustration Style Gallery Component)
   ========================================================================== */

export interface StylePreset {
  id: string
  label: string
  description: string
  visualStyle: string
  palette: string[]
  previewAsset: string
  tags: string[]
}

export const STYLES_DATA: StylePreset[] = [
  {
    id: 'moonlight-watercolor',
    label: '月光水彩',
    description: '水色轻轻晕开，留白柔和，像睡前翻开的手绘绘本。',
    visualStyle: '透明水彩儿童绘本，湿画法柔和晕染，细腻手工纸颗粒，边缘自然松弛，轻盈留白，非写实人物',
    palette: ['#5b8296', '#fae19c', '#98b4aa', '#f4a59e'],
    previewAsset: '/illustration-styles/moonlight-watercolor.png',
    tags: ['低饱和度', '柔和留白', '水彩手绘感', '极佳睡前适配'],
  },
  {
    id: 'paper-cut-collage',
    label: '纸艺拼贴',
    description: '彩纸一层层叠出森林，轮廓简洁，画面像亲手做的小剧场。',
    visualStyle: '手工彩纸剪贴儿童绘本，清晰纸张纤维，圆润剪裁边缘，多层纸片与柔和投影，简洁几何造型',
    palette: ['#285943', '#4a8bad', '#fff2d6', '#de5d4e'],
    previewAsset: '/illustration-styles/paper-cut-collage.png',
    tags: ['立体纸感', '几何圆角', '光影层次', '童心小剧场'],
  },
  {
    id: 'crayon-doodle',
    label: '蜡笔童画',
    description: '粗粗的蜡笔线条和颗粒色块，活泼亲切，保留孩子画画的温度。',
    visualStyle: '蜡笔与油画棒儿童插画，明显手绘颗粒，略带不规则的粗线条，朴拙圆润造型，色块保留纸面擦痕',
    palette: ['#4aa3df', '#72b043', '#f9c631', '#e8505b'],
    previewAsset: '/illustration-styles/crayon-doodle.png',
    tags: ['油画棒质感', '朴拙线条', '孩子画画温度', '鲜活趣味'],
  },
  {
    id: 'colored-pencil',
    label: '彩铅童话',
    description: '细密排线描出树叶和星光，温暖安静，适合有更多细节的故事。',
    visualStyle: '细腻彩色铅笔儿童绘本，可见柔和排线与叠色，纸张纹理自然，轮廓精致但不过度锐利，温暖叙事感',
    palette: ['#3b6e56', '#7fa9c6', '#e5a93b', '#b84a39'],
    previewAsset: '/illustration-styles/colored-pencil.png',
    tags: ['细腻排线', '柔和叠色', '故事叙事感', '沉静温暖'],
  },
  {
    id: 'soft-clay',
    label: '软陶梦境',
    description: '圆滚滚的黏土手工捏塑，指尖压痕微露，带着憨态可掬的三维梦境。',
    visualStyle: '手工超轻粘土软陶儿童绘本，圆润饱满造型，柔和微光漫反射，微小手工指纹肌理，立体雕塑感',
    palette: ['#e28743', '#87c0cd', '#ee6f57', '#f6f5f5'],
    previewAsset: '/illustration-styles/soft-clay.png',
    tags: ['3D黏土捏塑', '憨态可掬', '指纹温润', '三维童话'],
  },
]

export class StyleGallery {
  private currentStyleIndex = 0
  private tabsContainer: HTMLElement | null = null
  private imgLayer1: HTMLImageElement | null = null
  private imgLayer2: HTMLImageElement | null = null
  private isLayer1Active = true

  constructor() {
    this.tabsContainer = document.getElementById('style-tabs-container')
    this.imgLayer1 = document.getElementById('style-img-layer-1') as HTMLImageElement
    this.imgLayer2 = document.getElementById('style-img-layer-2') as HTMLImageElement

    this.renderTabs()
    this.bindEvents()
    this.selectStyle(0)
  }

  private renderTabs() {
    if (!this.tabsContainer) return

    this.tabsContainer.innerHTML = STYLES_DATA.map((s, i) => `
      <div class="style-tab-card ${i === this.currentStyleIndex ? 'active' : ''}" data-style-index="${i}">
        <div class="style-tab-header">
          <span class="style-tab-title">${s.label}</span>
          <div class="style-palette-dots">
            ${s.palette.map(c => `<span class="color-dot" style="background-color: ${c}" title="${c}"></span>`).join('')}
          </div>
        </div>
        <p class="style-tab-desc">${s.description}</p>
      </div>
    `).join('')
  }

  private bindEvents() {
    if (!this.tabsContainer) return

    this.tabsContainer.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest('.style-tab-card') as HTMLElement
      if (!card) return
      const idx = parseInt(card.dataset.styleIndex || '0', 10)
      this.selectStyle(idx)
    })
  }

  public selectStyle(index: number) {
    this.currentStyleIndex = index
    this.renderTabs()

    const style = STYLES_DATA[index]
    const titleEl = document.getElementById('style-detail-title')
    const promptEl = document.getElementById('style-detail-prompt')
    const tagsEl = document.getElementById('style-detail-tags')

    if (titleEl) titleEl.textContent = style.label
    if (promptEl) promptEl.textContent = style.visualStyle
    if (tagsEl) {
      tagsEl.innerHTML = style.tags.map(t => `<span class="section-badge" style="margin-bottom:0; font-size:11px;"># ${t}</span>`).join(' ')
    }

    // 双层平滑渐变交替图片
    if (this.imgLayer1 && this.imgLayer2) {
      const incomingImg = this.isLayer1Active ? this.imgLayer2 : this.imgLayer1
      const outgoingImg = this.isLayer1Active ? this.imgLayer1 : this.imgLayer2

      incomingImg.src = style.previewAsset
      incomingImg.classList.remove('hidden-layer')
      outgoingImg.classList.add('hidden-layer')

      this.isLayer1Active = !this.isLayer1Active
    }
  }
}
