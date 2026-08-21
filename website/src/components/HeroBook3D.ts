/* ==========================================================================
   Hero 3D 拟真立体书本交互 (Hero 3D Book Controller)
   ========================================================================== */

export class HeroBook3D {
  private bookWrapper: HTMLElement | null = null
  private stage: HTMLElement | null = null

  constructor() {
    this.bookWrapper = document.querySelector('.hero-book-wrapper')
    this.stage = document.querySelector('.hero-book-stage')

    if (this.bookWrapper && this.stage) {
      this.bindMouseTilt()
    }
  }

  private bindMouseTilt() {
    if (!this.stage || !this.bookWrapper) return

    this.stage.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = this.stage!.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2

      const rotateY = (x / rect.width) * 24 - 10
      const rotateX = -(y / rect.height) * 24 + 8

      this.bookWrapper!.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg) translateY(-8px) scale(1.02)`
    })

    this.stage.addEventListener('mouseleave', () => {
      this.bookWrapper!.style.transform = 'rotateY(-18deg) rotateX(10deg) rotateZ(-2deg)'
    })
  }
}
