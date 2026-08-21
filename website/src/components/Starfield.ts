/* ==========================================================================
   动态交互星空与星尘画布 (Interactive Starfield Canvas)
   ========================================================================== */

interface Star {
  x: number
  y: number
  radius: number
  alpha: number
  baseAlpha: number
  twinkleSpeed: number
  twinklePhase: number
  layer: number
}

interface Meteor {
  x: number
  y: number
  length: number
  speed: number
  angle: number
  alpha: number
  color: string
}

export class Starfield {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private stars: Star[] = []
  private meteors: Meteor[] = []
  private mouseX = 0
  private mouseY = 0
  private targetMouseX = 0
  private targetMouseY = 0
  private animationFrameId: number | null = null

  constructor(canvasId: string) {
    const el = document.getElementById(canvasId) as HTMLCanvasElement
    if (!el) throw new Error(`Canvas with id ${canvasId} not found`)
    this.canvas = el
    this.ctx = el.getContext('2d')!

    this.resize()
    this.initStars(180)
    this.bindEvents()
    this.render()
  }

  private resize = () => {
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
  }

  private initStars(count: number) {
    this.stars = []
    const width = this.canvas.width
    const height = this.canvas.height

    for (let i = 0; i < count; i++) {
      const layer = Math.random() < 0.2 ? 3 : Math.random() < 0.5 ? 2 : 1
      const baseAlpha = layer === 3 ? 0.85 : layer === 2 ? 0.55 : 0.25
      const radius = layer === 3 ? Math.random() * 1.5 + 1.2 : layer === 2 ? Math.random() * 1.0 + 0.8 : Math.random() * 0.7 + 0.4

      this.stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius,
        alpha: baseAlpha,
        baseAlpha,
        twinkleSpeed: Math.random() * 0.03 + 0.01,
        twinklePhase: Math.random() * Math.PI * 2,
        layer,
      })
    }
  }

  private bindEvents() {
    window.addEventListener('resize', () => {
      this.resize()
      this.initStars(180)
    })

    window.addEventListener('mousemove', (e) => {
      this.targetMouseX = (e.clientX - window.innerWidth / 2) * 0.05
      this.targetMouseY = (e.clientY - window.innerHeight / 2) * 0.05
    })

    // 定期生成流星
    setInterval(() => {
      if (Math.random() < 0.45 && this.meteors.length < 3) {
        this.spawnMeteor()
      }
    }, 3800)
  }

  private spawnMeteor() {
    const angle = (Math.PI / 4) + (Math.random() * 0.2 - 0.1) // 约 45 度下划
    const colors = ['#fde047', '#75c6a8', '#ffffff', '#c084fc']
    const color = colors[Math.floor(Math.random() * colors.length)]

    this.meteors.push({
      x: Math.random() * (this.canvas.width * 0.8),
      y: Math.random() * (this.canvas.height * 0.4),
      length: Math.random() * 120 + 80,
      speed: Math.random() * 9 + 12,
      angle,
      alpha: 1,
      color,
    })
  }

  private render = () => {
    // 平滑鼠标视差
    this.mouseX += (this.targetMouseX - this.mouseX) * 0.05
    this.mouseY += (this.targetMouseY - this.mouseY) * 0.05

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // 绘制星星
    for (const star of this.stars) {
      star.twinklePhase += star.twinkleSpeed
      star.alpha = star.baseAlpha + Math.sin(star.twinklePhase) * 0.35
      if (star.alpha < 0.1) star.alpha = 0.1

      const parallaxFactor = star.layer * 0.35
      const drawX = star.x + this.mouseX * parallaxFactor
      const drawY = star.y + this.mouseY * parallaxFactor

      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.arc(drawX, drawY, star.radius, 0, Math.PI * 2)

      if (star.layer === 3) {
        this.ctx.fillStyle = `rgba(253, 224, 71, ${star.alpha})`
        this.ctx.shadowColor = 'rgba(253, 224, 71, 0.8)'
        this.ctx.shadowBlur = 8
      } else if (star.layer === 2) {
        this.ctx.fillStyle = `rgba(226, 243, 235, ${star.alpha})`
        this.ctx.shadowColor = 'rgba(117, 198, 168, 0.5)'
        this.ctx.shadowBlur = 4
      } else {
        this.ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`
      }

      this.ctx.fill()
      this.ctx.restore()
    }

    // 绘制流星
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i]
      m.x += Math.cos(m.angle) * m.speed
      m.y += Math.sin(m.angle) * m.speed
      m.alpha -= 0.015

      if (m.alpha <= 0 || m.x > this.canvas.width || m.y > this.canvas.height) {
        this.meteors.splice(i, 1)
        continue
      }

      this.ctx.save()
      const grad = this.ctx.createLinearGradient(
        m.x, m.y,
        m.x - Math.cos(m.angle) * m.length,
        m.y - Math.sin(m.angle) * m.length
      )
      grad.addColorStop(0, m.color)
      grad.addColorStop(1, 'transparent')

      this.ctx.strokeStyle = grad
      this.ctx.lineWidth = 2
      this.ctx.lineCap = 'round'
      this.ctx.globalAlpha = m.alpha
      this.ctx.shadowColor = m.color
      this.ctx.shadowBlur = 10

      this.ctx.beginPath()
      this.ctx.moveTo(m.x, m.y)
      this.ctx.lineTo(
        m.x - Math.cos(m.angle) * m.length,
        m.y - Math.sin(m.angle) * m.length
      )
      this.ctx.stroke()
      this.ctx.restore()
    }

    this.animationFrameId = requestAnimationFrame(this.render)
  }

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
    }
  }
}
