/* ==========================================================================
   GSAP 滚动与时间轴动效编排 (GSAP ScrollTrigger & Timeline Orchestration)
   ========================================================================== */

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import confetti from 'canvas-confetti'

gsap.registerPlugin(ScrollTrigger)

export function initScrollAnimations() {
  // 1. 顶部导航栏滚动背景变化
  const header = document.querySelector('.site-header')
  if (header) {
    ScrollTrigger.create({
      start: 'top -50',
      end: 99999,
      toggleClass: { className: 'scrolled', targets: header },
    })
  }

  // 2. Hero 元素初次载入动效
  const heroTl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.9 } })
  heroTl
    .fromTo('.hero-badge', { y: 20, opacity: 0 }, { y: 0, opacity: 1, delay: 0.1 })
    .fromTo('.hero-main-title', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 1 }, '-=0.7')
    .fromTo('.hero-sub-desc', { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, '-=0.7')
    .fromTo('.hero-cta-group', { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, '-=0.6')
    .fromTo('.hero-book-wrapper', { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.1 }, '-=0.8')
    .fromTo('.floating-badge', { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, stagger: 0.12 }, '-=0.7')

  // 3. 通用 Section 标题进入动效
  gsap.utils.toArray('.section-header').forEach((headerEl: any) => {
    gsap.fromTo(
      headerEl,
      { y: 30, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: headerEl,
          start: 'top 88%',
          toggleActions: 'play none none none',
          once: true,
        },
      }
    )
  })

  // 4. 工作流 4 步卡片交错进入
  gsap.fromTo(
    '.workflow-card',
    { y: 40, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      stagger: 0.12,
      duration: 0.75,
      ease: 'back.out(1.2)',
      scrollTrigger: {
        trigger: '.workflow-step-cards',
        start: 'top 85%',
        once: true,
      },
    }
  )

  // 5. 模板卡片平滑进入（确保默认完全可见）
  gsap.fromTo(
    '.template-card',
    { y: 30, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      stagger: 0.06,
      duration: 0.6,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '#templates-grid-container',
        start: 'top 88%',
        once: true,
      },
    }
  )

  // 6. 下载主卡片彩带特效绑定
  const dlButtons = document.querySelectorAll('.trigger-confetti-btn')
  dlButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const x = (rect.left + rect.width / 2) / window.innerWidth
      const y = (rect.top + rect.height / 2) / window.innerHeight

      confetti({
        particleCount: 70,
        spread: 60,
        origin: { x, y },
        colors: ['#3c8d72', '#75c6a8', '#fde047', '#f472b6', '#ffffff'],
      })
    })
  })

  // 刷新触发器位置
  setTimeout(() => {
    ScrollTrigger.refresh()
  }, 300)
}
