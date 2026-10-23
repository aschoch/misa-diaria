import type { Pending } from './types'
import { esc } from './format'

const root = () => document.querySelector<HTMLElement>('#celeb')!

let timer = 0
let closing = false

export function elegir(pending: Pending[], inserted: string[]) {
  const fresh = new Set(inserted)
  return [...pending]
    .filter((item) => fresh.has(item.key))
    .sort((a, b) => a.rank - b.rank || b.date.localeCompare(a.date))[0]
}

function papers(motif: Pending['motif'], rand: () => number) {
  const count = motif === 'parejas' ? 28 : 32
  const nodes: string[] = []
  for (let i = 0; i < count; i += 1) {
    const x = Math.round((rand() - 0.5) * 260)
    const rot = Math.round((rand() - 0.5) * 220)
    const delay = Math.round(rand() * 180)
    const shape = motif === 'hito' && i % 4 === 0
      ? 'strip'
      : ['petal', 'rect', 'strip'][i % 3]
    const tone = motif === 'parejas'
      ? (i % 2 === 0 ? 'rosa' : 'miel')
      : motif === 'diez'
        ? (i % 2 === 0 ? 'miel' : 'olivo')
        : ['miel', 'vela', 'olivo', 'rosa', 'papel'][i % 5]
    nodes.push(
      `<span class="paper ${shape} ${tone}" style="--x:${x}px;--r:${rot}deg;--delay:${delay}ms"></span>`,
    )
  }
  return nodes.join('')
}

function seeds(motif: Pending['motif']) {
  const total = motif === 'diez' ? 10 : 12
  const dots: string[] = []
  for (let i = 0; i < total; i += 1) {
    const turn = motif === 'diez' ? -70 + (140 * i) / 9 : (360 * i) / total
    const radius = motif === 'hito' ? 34 : motif === 'diez' ? 46 : 28 + (i % 3) * 8
    dots.push(`<i style="--turn:${turn}deg;--radius:${radius}px"></i>`)
  }
  return `<div class="seeds ${motif}" aria-hidden="true">${dots.join('')}</div>`
}

export function hideCelebration() {
  const node = root()
  if (node.hidden || closing) return
  closing = true
  node.classList.add('leaving')
  window.clearTimeout(timer)
  const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 120
  timer = window.setTimeout(() => {
    node.hidden = true
    node.innerHTML = ''
    node.classList.remove('leaving')
    closing = false
  }, delay)
}

export function showCelebration(item: Pending) {
  const node = root()
  window.clearTimeout(timer)
  closing = false
  node.classList.remove('leaving')
  const rand = mulberry32(item.key.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0))
  node.hidden = false
  node.innerHTML = `
    <div class="veil" data-act="skip"></div>
    <div class="toss" aria-hidden="true">${papers(item.motif, rand)}</div>
    <div class="crest">
      <div class="flash" aria-hidden="true"></div>
      <p class="celeb-line" data-testid="celeb-line" role="status">${esc(item.line)}</p>
      ${seeds(item.motif)}
    </div>
    <button type="button" class="skip" data-act="skip" aria-label="Saltar la celebración">×</button>
  `
  requestAnimationFrame(() => punchButtonHole(node))
  timer = window.setTimeout(hideCelebration, 1200)
}

function punchButtonHole(node: HTMLElement) {
  const button = document.querySelector<HTMLElement>('[data-testid="go"]')
  const veil = node.querySelector<HTMLElement>('.veil')
  if (!button || !veil) return
  const rect = button.getBoundingClientRect()
  node.style.setProperty('--origin', `${Math.max(88, rect.top - 6)}px`)
  const x = Math.max(0, rect.left - 8)
  const y = Math.max(0, rect.top - 8)
  const right = rect.right + 8
  const bottom = rect.bottom + 8
  veil.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x}px ${y}px, ${right}px ${y}px, ${right}px ${bottom}px, ${x}px ${bottom}px, ${x}px ${y}px)`
}

function mulberry32(seed: number) {
  let value = seed || 1
  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
