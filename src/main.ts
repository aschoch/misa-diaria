import '@fontsource-variable/fraunces/wght.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './styles.css'
import { borrarComentario, borrarIntencion, configured, editarComentario, editarIntencion, enviarFeedback, estado, guardarCelebraciones, guardarNombre, guardarPreferencias, marcarAsistencia, marcarCompromiso, ponerReaccion, publicarComentario, publicarIntencion, quitarReaccion, salir, supabase, suscribirPush, updatePassword } from './api'
import { elegir, hideCelebration, showCelebration } from './celebrate'
import { celebrationLine, deviceLocale, rememberLocale, savedLocale, setLocale, tx, type Locale } from './i18n'
import type { Estado } from './types'
import { appendCalendarDays, blankDay, emojiGrid, href, intentionFromPath, renderApp, renderDenied, renderLogin, renderResetPassword, renderSetup, routeFromPath, type LoginMode, type Route, type StreakMode } from './view'

const app = document.querySelector<HTMLElement>('#app')!
let current: Estado | null = null
let selected = ''
let offline = ''
let locked = false
let loginMessage = ''
let pendingCode = ''
let loginMode: LoginMode = 'password'
let mustResetPassword = false
let recoverySignIn = false
let passwordError = ''
let resetCalendarScroll = false
let glassFrom: { index: number } | { px: number } | null = null
let glowGo = false
let glowFrame = 0
let suppressNavClick = false
let tabScrub: {
  id: number
  nav: HTMLElement
  pill: HTMLElement
  startX: number
  startY: number
  origin: number
  last: number
  slot: number
  mode: 'pending' | 'x' | 'y'
  lastY: number
  pressed: HTMLAnchorElement | null
} | null = null
const EMAIL_KEY = 'misa-email'
let denied = false
let demo = false
let busy = false
let signingIn = false
let localeEpoch = 0
let locale: Locale = savedLocale() ?? deviceLocale()
let openIntention = ''
let emojiFor = ''
let depth = 0
let pulling = false
let gesture: {
  x: number
  y: number
  scroll: number
  sheet: boolean
  id: number
  row: HTMLElement | null
  lockedAxis: '' | 'x' | 'y'
  armed: 'right' | 'left' | ''
  peakX: number
  pop: boolean
  month: boolean
} | null = null
let suppressRowClick = false
let streakClosing = false
let streakMode: StreakMode = ''
let streakScroll = 0
let monthsBefore = 1
let monthsAfter = 1
let streakAlign = false
let historyDate = ''
let editing: { kind: 'intention' | 'comment'; id: string } | null = null
let emojiQuery = ''
let passwordSaved = false
let nameSaved = false
let feedbackSaved = false
let codeSending = false
let scrollFrame = 0
let scrollGen = 0
let scrollSeen = 0
let lastProgrammaticY = Number.NaN
let applyingScroll = false
let calendarDays = 28
let commitChain: Promise<void> = Promise.resolve()

function rememberedEmail() {
  try {
    return (localStorage.getItem(EMAIL_KEY) ?? '').trim().toLowerCase()
  } catch {
    return ''
  }
}

function rememberEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (!email) return rememberedEmail()
  try { localStorage.setItem(EMAIL_KEY, email) } catch { /* el correo sigue en el campo */ }
  return email
}

function loginEmail() {
  const typed = document.querySelector<HTMLInputElement>('#email')?.value ?? ''
  return rememberEmail(typed)
}

function keepLoginDraft() {
  const emailInput = document.querySelector<HTMLInputElement>('#email')
  const codeInput = document.querySelector<HTMLInputElement>('#code')
  if (emailInput?.value.trim()) rememberEmail(emailInput.value)
  if (codeInput?.value) pendingCode = codeInput.value
}

async function requestEmailCode(email: string) {
  const { error } = await supabase!.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}`,
      data: { locale },
    },
  })
  return error
}

function rateLimited(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const item = error as { status?: number; code?: string; message?: string }
  const text = `${item.code ?? ''} ${item.message ?? ''}`.toLowerCase()
  return item.status === 429 || text.includes('rate limit') || text.includes('rate_limit') || text.includes('too many')
}

function paint() {
  stopScrollAnim()
  setLocale(locale)
  document.documentElement.lang = locale === 'pt' ? 'pt-PT' : 'es'
  const route = routeFromPath(location.pathname)
  if (route !== 'hoy') {
    streakMode = ''
    historyDate = ''
  }
  if (!configured && !demo) {
    app.innerHTML = renderSetup()
    return
  }
  if (mustResetPassword) {
    app.innerHTML = renderResetPassword()
    document.title = tx().brand
    return
  }
  if (!current) {
    if (!denied) keepLoginDraft()
    app.innerHTML = denied ? renderDenied() : renderLogin(loginMessage, rememberedEmail(), pendingCode, loginMode, codeSending)
    return
  }
  if (!selected) selected = current.today
  const lastDate = current.calendar.reduce((max, day) => (day.date > max ? day.date : max), current.today)
  const span = daysBetween(current.today, lastDate) + 1
  if (span > calendarDays) calendarDays = span
  if (openIntention && !current.intentions.some((item) => item.id === openIntention)) openIntention = ''
  const intention = intentionFromPath(location.pathname) || openIntention
  if (emojiFor && !current.intentions.some((item) => item.id === emojiFor)) emojiFor = ''
  const keepScroll = route === 'calendario' && !resetCalendarScroll && Boolean(document.querySelector('[data-testid="calendar"]'))
  resetCalendarScroll = false
  const y = window.scrollY
  app.innerHTML = renderApp(route, current, selected, locked, offline, intention, locale, emojiFor, pulling, {
    streak: streakMode,
    monthsBefore,
    monthsAfter,
    historyDate,
    editing,
    emojiQuery,
    passwordSaved,
    passwordError,
    nameSaved,
    feedbackSaved,
    calendarDays,
  })
  if (keepScroll) window.scrollTo(0, y)
  document.title = tx().brand
  const popup = Boolean(streakMode)
  document.documentElement.classList.toggle('modal-open', popup)
  document.body.classList.toggle('modal-open', popup)
  if (streakAlign) alignStreak()
  settleGlass()
  settleGoGlow()
}

function daysBetween(from: string, to: string) {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

function alignStreak() {
  const scroller = document.querySelector<HTMLElement>('[data-testid="month-scroll"]')
  const currentMonth = scroller?.querySelector<HTMLElement>('[data-current="true"]')
  if (!scroller || !currentMonth) return
  scroller.scrollTop = currentMonth.offsetTop
  streakAlign = false
}

async function refresh(celebrate = false) {
  const snapshot = sessionStorage.getItem('misa-estado')
  const epoch = localeEpoch
  try {
    current = await estado()
    denied = false
    offline = ''
    locked = false
    if (epoch === localeEpoch) {
      const saved = current.prefs.locale
      if (saved === 'es' || saved === 'pt') locale = saved
      else locale = savedLocale() ?? deviceLocale()
      rememberLocale(locale)
      if (!saved) {
        current.prefs.locale = locale
        await guardarPreferencias(current.me.id, current.prefs)
      }
    }
    if (epoch !== localeEpoch) current.prefs.locale = locale
    sessionStorage.setItem('misa-estado', JSON.stringify({ at: current.clock, data: current }))
    paint()
    if (celebrate) await celebratePending(current)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : ''
    if (code === '42501' || /no eres del (grupo|curso)/i.test(String(error))) {
      current = null
      denied = true
      paint()
      return
    }
    if (snapshot) {
      const saved = JSON.parse(snapshot) as { at: string; data: Estado }
      current = saved.data
      offline = tx().offline(saved.at)
      locked = true
      paint()
      return
    }
    loginMessage = tx().openFail
    current = null
    paint()
  }
}

async function celebratePending(state: Estado) {
  if (!state.pending.length) return
  const pending = state.pending.map((item) => ({ ...item, line: celebrationLine(item) }))
  const inserted = await guardarCelebraciones(state.me.id, pending.map((item) => item.key))
  const winner = elegir(pending, inserted)
  if (winner) showCelebration(winner)
}

async function boot() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('muestra')) {
    const { sampleEstado } = await import('./sample')
    demo = true
    current = sampleEstado()
    selected = current.today
    const monday = new URLSearchParams(location.search).has('lunes')
    if (monday) current.monday = { people: 9, couples: 5, empty_days: 0 }
    paint()
    const fiesta = new URLSearchParams(location.search).get('fiesta')
    const item = fiesta ? current.pending.find((pending) => pending.motif === fiesta) : undefined
    if (item) showCelebration(item)
    return
  }
  paint()
  if (!configured || !supabase) return
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session) {
      if (event === 'SIGNED_OUT') {
        current = null
        denied = false
        paint()
      }
      return
    }
    if (mustResetPassword || recoverySignIn) return
    if (!current && !signingIn) window.setTimeout(() => void refresh(true), 0)
  })
  if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  }
}

function syncRoute() {
  openIntention = intentionFromPath(location.pathname)
  emojiFor = ''
}

function pushRoute(pathname: string) {
  if (location.pathname === pathname) return
  history.pushState({}, '', pathname)
  depth += 1
}

function blurFocus() {
  const node = document.activeElement
  if (node instanceof HTMLElement) node.blur()
}

function stopScrollAnim() {
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  scrollFrame = 0
}

function scrollPageTop() {
  const gen = ++scrollGen
  stopScrollAnim()
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const start = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop
  scrollSeen = start
  const apply = (y: number) => {
    lastProgrammaticY = y
    applyingScroll = true
    window.scrollTo(0, y)
    document.documentElement.scrollTop = y
    document.body.scrollTop = y
    applyingScroll = false
  }
  if (reduce || start <= 0) {
    apply(0)
    return
  }
  const duration = 280
  const t0 = performance.now()
  const step = (now: number) => {
    if (gen !== scrollGen) return
    const t = Math.min(1, (now - t0) / duration)
    const eased = 1 - (1 - t) ** 3
    apply(t >= 1 ? 0 : Math.round(start * (1 - eased)))
    if (t < 1) scrollFrame = requestAnimationFrame(step)
    else {
      scrollFrame = 0
      requestAnimationFrame(() => {
        if (gen !== scrollGen || window.scrollY <= 1) return
        apply(0)
      })
    }
  }
  scrollFrame = requestAnimationFrame(step)
}

function readGlassX(pill: HTMLElement) {
  const transform = getComputedStyle(pill).transform
  const match = transform && transform !== 'none' ? /matrix(?:3d)?\(([^)]+)\)/.exec(transform) : null
  if (match) {
    const parts = match[1].split(',').map((part) => Number(part))
    const tx = parts.length === 6 ? parts[4] : parts[12]
    if (Number.isFinite(tx)) return tx
  }
  const nav = pill.closest<HTMLElement>('nav.tabs')
  return Number(nav?.dataset.tab ?? '0') * (pill.getBoundingClientRect().width || 0)
}

function triggerHaptic() {
  navigator.vibrate?.(12)
  const input = document.querySelector<HTMLInputElement>('#haptic-switch')
  if (!input) return
  input.click()
  input.blur()
}

function settleGoGlow() {
  if (!glowGo) return
  if (glowFrame) cancelAnimationFrame(glowFrame)
  glowFrame = 0
  const button = document.querySelector<HTMLButtonElement>('button.go')
  if (!button) return
  glowFrame = requestAnimationFrame(() => {
    glowFrame = 0
    if (!button.isConnected) {
      settleGoGlow()
      return
    }
    button.classList.remove('just-tapped')
    void button.offsetWidth
    button.classList.add('just-tapped')
    glowGo = false
  })
}

function settleGlass() {
  const pill = document.querySelector<HTMLElement>('.tab-glass-pill')
  const nav = document.querySelector<HTMLElement>('nav.tabs')
  const from = glassFrom
  glassFrom = null
  if (!pill || !nav || !from) return
  const to = Number(nav.dataset.tab ?? '0')
  const slot = pill.getBoundingClientRect().width || 1
  const startPx = 'px' in from ? from.px : from.index * slot
  if (Math.abs(startPx - to * slot) < 0.5) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) {
    pill.style.transition = 'none'
    pill.style.transform = `translateX(${to * 100}%)`
    return
  }
  pill.style.transition = 'none'
  pill.style.transform = `translateX(${startPx}px)`
  pill.getBoundingClientRect()
  pill.classList.add('pulse')
  pill.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)'
  pill.style.transform = `translateX(${to * slot}px)`
}

function openNav(link: HTMLAnchorElement, from: { index: number } | { px: number } | null) {
  triggerHaptic()
  hideCelebration()
  const navKey = link.dataset.nav ?? ''
  if (navKey === 'calendario') resetCalendarScroll = true
  if (navKey === 'intenciones') {
    openIntention = ''
    emojiFor = ''
    editing = null
  }
  blurFocus()
  glassFrom = from
  pushRoute(navKey === 'intenciones' ? href('muro') : link.pathname)
  syncRoute()
  paint()
  if (navKey) scrollPageTop()
}

function beginTabScrub(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Element) || event.button !== 0) return
  const nav = target.closest<HTMLElement>('nav.tabs')
  const pill = nav?.querySelector<HTMLElement>('.tab-glass-pill')
  if (!nav || !pill) return
  if (event.cancelable) event.preventDefault()
  gesture = null
  const slot = pill.getBoundingClientRect().width || 1
  const origin = readGlassX(pill)
  tabScrub = {
    id: event.pointerId,
    nav,
    pill,
    startX: event.clientX,
    startY: event.clientY,
    origin,
    last: origin,
    slot,
    mode: 'pending',
    lastY: event.clientY,
    pressed: target.closest<HTMLAnchorElement>('a[data-nav]'),
  }
}

function moveTabScrub(event: PointerEvent) {
  if (!tabScrub || tabScrub.id !== event.pointerId) return
  const dx = event.clientX - tabScrub.startX
  const dy = event.clientY - tabScrub.startY
  if (tabScrub.mode === 'pending') {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      tabScrub.mode = 'y'
    } else if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) {
      return
    } else {
      tabScrub.mode = 'x'
    }
  }
  if (tabScrub.mode === 'y') {
    const step = event.clientY - tabScrub.lastY
    tabScrub.lastY = event.clientY
    window.scrollBy(0, -step)
    return
  }
  const max = tabScrub.slot * 3
  const next = Math.min(max, Math.max(0, tabScrub.origin + dx))
  tabScrub.last = next
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  tabScrub.pill.style.transition = 'none'
  tabScrub.pill.style.transform = `translateX(${next}px)`
  tabScrub.pill.classList.toggle('bulge', !reduce)
  const index = Math.min(3, Math.max(0, Math.round(next / tabScrub.slot)))
  tabScrub.nav.querySelectorAll<HTMLAnchorElement>('a[data-nav]').forEach((link, i) => {
    link.classList.toggle('on', i === index)
  })
}

function endTabScrub(event: PointerEvent, cancel: boolean) {
  if (!tabScrub || tabScrub.id !== event.pointerId) return
  const done = tabScrub
  tabScrub = null
  done.pill.classList.remove('bulge')
  suppressNavClick = true
  window.setTimeout(() => { suppressNavClick = false }, 0)
  if (cancel || done.mode === 'y') {
    done.pill.style.transition = ''
    done.pill.style.transform = ''
    const current = Number(done.nav.dataset.tab ?? '0')
    done.nav.querySelectorAll<HTMLAnchorElement>('a[data-nav]').forEach((link, i) => {
      link.classList.toggle('on', i === current)
    })
    return
  }
  if (done.mode === 'pending') {
    if (done.pressed) openNav(done.pressed, { index: Number(done.nav.dataset.tab ?? '0') })
    return
  }
  const index = Math.min(3, Math.max(0, Math.round(done.last / done.slot)))
  const link = done.nav.querySelectorAll<HTMLAnchorElement>('a[data-nav]')[index]
  if (!link) return
  openNav(link, { px: done.last })
}

function backToWall() {
  blurFocus()
  hideCelebration()
  openIntention = ''
  emojiFor = ''
  pushRoute(href('muro'))
  paint()
}

function go(route: Route) {
  pushRoute(href(route))
  syncRoute()
  paint()
}

async function pullRefresh() {
  if (pulling || busy || demo || !current) return
  pulling = true
  paint()
  try {
    await refresh(false)
  } finally {
    pulling = false
    paint()
  }
}

function blurRow(row: HTMLElement | null) {
  row?.querySelectorAll<HTMLElement>('button').forEach((button) => button.blur())
}

function resetRow(row: HTMLElement | null) {
  if (!row) return
  row.classList.remove('dragging', 'swiping-right', 'swiping-left', 'swiping-muted', 'swipe-armed')
  for (const cue of row.querySelectorAll<HTMLElement>('.swipe-cue')) cue.textContent = cue.dataset.cue ?? ''
  const face = row.querySelector<HTMLElement>('.swipe-face')
  blurRow(row)
  if (!face) return
  face.style.transition = ''
  face.style.transform = 'translateX(0)'
}

function trackRow(event: PointerEvent) {
  if (!gesture?.row || gesture.lockedAxis === 'y') return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  const row = gesture.row
  const face = row.querySelector<HTMLElement>('.swipe-face')
  if (!face) return
  if (gesture.lockedAxis !== 'x') {
    if (Math.abs(dx) >= 12 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      gesture.lockedAxis = 'x'
      try { row.setPointerCapture?.(event.pointerId) } catch { /* Safari suelta el gesto si la captura falla */ }
      row.classList.add('dragging')
      face.style.transition = 'none'
    } else if (Math.abs(dy) >= 14 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      gesture.lockedAxis = 'y'
      gesture.row = null
      resetRow(row)
      return
    } else {
      return
    }
  }
  if (dx >= 0) {
    if (gesture.peakX < 0) gesture.peakX = 0
    gesture.peakX = Math.max(gesture.peakX, dx)
  } else {
    if (gesture.peakX > 0) gesture.peakX = 0
    gesture.peakX = Math.min(gesture.peakX, dx)
  }
  const wasArmed = gesture.armed
  if (dx >= 52) gesture.armed = 'right'
  else if (dx <= -52) gesture.armed = 'left'
  else gesture.armed = ''
  if (gesture.armed && gesture.armed !== wasArmed) triggerHaptic()
  row.classList.toggle('swipe-armed', gesture.armed !== '')
  for (const cue of row.querySelectorAll<HTMLElement>('.swipe-cue')) {
    const side = cue.closest('.swipe-under.left') ? 'left' : 'right'
    if (gesture.armed === 'right' && side === 'right') cue.textContent = '✓'
    else if (gesture.armed === 'left' && side === 'left') cue.textContent = '✕'
    else cue.textContent = cue.dataset.cue ?? ''
  }
  const committed = row.dataset.committed === 'true'
  row.classList.toggle('swiping-right', dx > 8)
  row.classList.toggle('swiping-left', dx < -8 && committed)
  row.classList.toggle('swiping-muted', dx < -8 && !committed)
  const shown = Math.max(-168, Math.min(dx, 148))
  face.style.transform = `translateX(${shown}px)`
}

function lockStreakScroll() {
  streakScroll = window.scrollY
  const body = document.body
  body.style.position = 'fixed'
  body.style.top = `-${streakScroll}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.width = '100%'
}

function unlockStreakScroll() {
  const body = document.body
  if (body.style.position !== 'fixed') {
    window.scrollTo(0, streakScroll)
    return
  }
  body.style.position = ''
  body.style.top = ''
  body.style.left = ''
  body.style.right = ''
  body.style.width = ''
  window.scrollTo(0, streakScroll)
}

function closeStreakPopupWithAnimation() {
  if (!streakMode || streakClosing) return
  streakClosing = true
  const pop = document.querySelector<HTMLElement>('.streak-pop')
  const back = document.querySelector<HTMLElement>('.streak-back')
  const finish = () => {
    if (!streakClosing && !streakMode) return
    streakClosing = false
    streakMode = ''
    historyDate = ''
    unlockStreakScroll()
    paint()
    window.scrollTo(0, streakScroll)
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce || !pop) {
    finish()
    return
  }
  if (!pop.style.transform) pop.style.transform = 'translate(-50%, 0px)'
  pop.style.opacity = '1'
  pop.style.transition = 'transform 480ms cubic-bezier(0.32, 0.72, 0, 1)'
  if (back) {
    back.style.transition = 'opacity 480ms ease'
    back.getBoundingClientRect()
    back.style.opacity = '0'
  }
  pop.getBoundingClientRect()
  pop.style.transform = 'translate(-50%, 105vh)'
  let done = false
  const end = () => {
    if (done) return
    done = true
    finish()
  }
  pop.addEventListener('transitionend', (event) => {
    if (event.propertyName === 'transform') end()
  })
  window.setTimeout(end, 480)
}

function followPopup(dy: number) {
  const pop = document.querySelector<HTMLElement>('.streak-pop')
  if (!pop || dy <= 0) return
  pop.style.transition = 'none'
  pop.style.transform = `translate(-50%, ${dy}px)`
  if (window.scrollY !== streakScroll) window.scrollTo(0, streakScroll)
}

function armPopupDismiss(pointerId: number) {
  if (!gesture || gesture.pop) return
  const scroller = document.querySelector<HTMLElement>('.month-scroll')
  if (!scroller || scroller.scrollTop > 0) return
  gesture.pop = true
  gesture.month = false
  try { document.querySelector<HTMLElement>('.streak-pop')?.setPointerCapture?.(pointerId) } catch { /* sigue el gesto */ }
}

app.addEventListener('pointerdown', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('nav.tabs')) {
    beginTabScrub(event)
    return
  }
  const button = target.closest<HTMLElement>('.days button')
  if (button) button.dataset.pointer = '1'
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return
  const month = Boolean(target.closest('.month-scroll'))
  const rowNode = target.closest('.days li.swipeable')
  const row = rowNode instanceof HTMLElement && event.clientX > 36 ? rowNode : null
  const popNode = streakMode && !month ? target.closest<HTMLElement>('.streak-pop, .streak-back') : null
  const pop = Boolean(popNode)
  if (popNode && !target.closest('button.pop-close')) popNode.setPointerCapture?.(event.pointerId)
  gesture = {
    x: event.clientX,
    y: event.clientY,
    scroll: window.scrollY,
    sheet: Boolean(target.closest('.sheet')),
    id: event.pointerId,
    row,
    lockedAxis: '',
    armed: '',
    peakX: 0,
    pop,
    month,
  }
})

window.addEventListener('pointermove', (event) => {
  if (tabScrub?.id === event.pointerId) moveTabScrub(event)
}, true)
window.addEventListener('pointerup', (event) => {
  if (tabScrub?.id === event.pointerId) endTabScrub(event, false)
}, true)
window.addEventListener('pointercancel', (event) => {
  if (tabScrub?.id === event.pointerId) endTabScrub(event, true)
}, true)

app.addEventListener('pointermove', (event) => {
  if (tabScrub?.id === event.pointerId) return
  if (!gesture || gesture.id !== event.pointerId) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  if (gesture.month && !gesture.pop) {
    if (dy > 0 && dy > Math.abs(dx)) armPopupDismiss(event.pointerId)
    if (!gesture.pop) return
  }
  if (gesture.pop) {
    followPopup(dy)
    return
  }
  trackRow(event)
})

document.addEventListener('touchmove', (event) => {
  if (!gesture) return
  const touch = event.touches[0]
  if (!touch) return
  const dy = touch.clientY - gesture.y
  const dx = touch.clientX - gesture.x
  if (gesture.month && !gesture.pop && dy > 0 && dy > Math.abs(dx)) armPopupDismiss(gesture.id)
  if (gesture.pop && dy > 0) event.preventDefault()
}, { passive: false })

app.addEventListener('pointerup', (event) => {
  if (tabScrub?.id === event.pointerId) {
    endTabScrub(event, false)
    return
  }
  if (!gesture || gesture.id !== event.pointerId) return
  const start = gesture
  gesture = null
  const dx = event.clientX - start.x
  const dy = event.clientY - start.y
  if (start.month) return
  if (start.pop) {
    const pop = document.querySelector<HTMLElement>('.streak-pop')
    if (dy > 56) closeStreakPopupWithAnimation()
    else if (pop) {
      pop.style.transition = ''
      pop.style.transform = ''
    }
    return
  }
  if (start.row) blurRow(start.row)
  if (start.row && start.lockedAxis === 'x') {
    suppressRowClick = true
    window.setTimeout(() => { suppressRowClick = false }, 350)
    const date = start.row.dataset.date ?? ''
    const committed = start.row.dataset.committed === 'true'
    resetRow(start.row)
    if (start.armed === 'right' && !committed) void setCommitment(date, true)
    else if (start.armed === 'left' && committed) void setCommitment(date, false)
    return
  }
  const horizontal = dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5
  const downDetail = dy > 70 && dy > Math.abs(dx) * 1.5
  const downRefresh = dy > 80 && dy > Math.abs(dx) * 1.5
  const onDetail = Boolean(intentionFromPath(location.pathname))
  if (start.sheet && emojiFor && downDetail) {
    emojiFor = ''
    paint()
    return
  }
  if (onDetail && horizontal) {
    backToWall()
    return
  }
  if (onDetail && start.scroll <= 8 && downDetail) {
    backToWall()
    return
  }
  const route = routeFromPath(location.pathname)
  const top = route === 'calendario' || route === 'muro' || route === 'ajustes'
  if (!onDetail && top && start.x <= 36 && horizontal) {
    if (depth > 0) history.back()
    else go('hoy')
    return
  }
  if (!onDetail && !emojiFor && !start.sheet && start.scroll <= 4 && downRefresh) void pullRefresh()
})

app.addEventListener('pointercancel', (event) => {
  if (tabScrub?.id === event.pointerId) {
    endTabScrub(event, true)
    return
  }
  if (gesture?.id !== event.pointerId) return
  const row = gesture.row
  const pop = gesture.pop
  gesture = null
  resetRow(row)
  if (pop) {
    const node = document.querySelector<HTMLElement>('.streak-pop')
    if (node) {
      node.style.transition = ''
      node.style.transform = ''
    }
  }
})

app.addEventListener('scroll', (event) => {
  const scroller = event.target
  if (!(scroller instanceof HTMLElement) || scroller.dataset.testid !== 'month-scroll' || !streakMode) return
  const nearTop = scroller.scrollTop < 48
  const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48
  if (nearTop && monthsBefore < 36) {
    const before = scroller.scrollHeight
    const top = scroller.scrollTop
    monthsBefore += 1
    paint()
    const next = document.querySelector<HTMLElement>('[data-testid="month-scroll"]')
    if (next) next.scrollTop = top + (next.scrollHeight - before)
    return
  }
  if (nearBottom && monthsAfter < 24) {
    const top = scroller.scrollTop
    monthsAfter += 1
    paint()
    const next = document.querySelector<HTMLElement>('[data-testid="month-scroll"]')
    if (next) next.scrollTop = top
  }
}, true)

let extendingCalendar = false
let extendQueued = false
window.addEventListener('scroll', () => {
  if (!applyingScroll && scrollFrame) {
    const y = window.scrollY
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    const atProgram = Math.abs(y - lastProgrammaticY) <= 1
    const clampedHigh = lastProgrammaticY > max + 1 && y >= max - 1
    const unchanged = Math.abs(y - scrollSeen) <= 1
    if (!atProgram && !clampedHigh && !unchanged) {
      scrollGen += 1
      stopScrollAnim()
    } else {
      scrollSeen = y
    }
  }
  if (extendQueued || extendingCalendar) return
  extendQueued = true
  requestAnimationFrame(() => {
    extendQueued = false
    if (extendingCalendar || streakMode || !current) return
    if (routeFromPath(location.pathname) !== 'calendario') return
    const remain = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
    if (remain > 320) return
    const stream = document.querySelector<HTMLElement>('[data-testid="calendar"]')
    if (!stream) return
    extendingCalendar = true
    const from = calendarDays
    calendarDays += 21
    appendCalendarDays(stream, current, selected, locked, locale, from, calendarDays)
    extendingCalendar = false
  })
}, { passive: true })

app.addEventListener('input', (event) => {
  const node = event.target
  if (!(node instanceof HTMLInputElement)) return
  if (node.dataset.act === 'emoji-search') {
    const emoji = isEmoji(node.value)
    if (emoji) {
      emojiQuery = ''
      void actOn('react', node, emoji)
      return
    }
    emojiQuery = node.value
    const grid = document.querySelector('.sheet-grid')
    if (grid) grid.innerHTML = emojiGrid(node.dataset.id ?? '', emojiQuery)
    return
  }
  if (node.dataset.act !== 'emoji-input') return
  const emoji = isEmoji(node.value)
  if (!emoji) return
  node.value = ''
  void actOn('react', node, emoji)
})

app.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  if (target.id === 'password') {
    event.preventDefault()
    void actOn('login-password', target)
    return
  }
  if (target.id === 'reset-password') {
    event.preventDefault()
    void actOn('set-new-password', target)
    return
  }
  if (target.id === 'email') {
    if (loginMode !== 'forgot') return
    event.preventDefault()
    void actOn('send-code', target)
    return
  }
  if (target.id === 'code') {
    event.preventDefault()
    void actOn('verify', target)
  }
})

app.addEventListener('click', (event) => {
  if (suppressNavClick) {
    suppressNavClick = false
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if (suppressRowClick) {
    suppressRowClick = false
    event.preventDefault()
    event.stopPropagation()
    return
  }
  const acted = (event.target as HTMLElement).closest<HTMLElement>('[data-act]')
  if (acted?.dataset.act === 'back-wall') {
    event.preventDefault()
    backToWall()
    return
  }
  const link = (event.target as HTMLElement).closest('a[href]')
  if (link instanceof HTMLAnchorElement && link.origin === location.origin) {
    event.preventDefault()
    if (link.dataset.nav) {
      const nav = link.closest<HTMLElement>('nav.tabs')
      openNav(link, { index: Number(nav?.dataset.tab ?? '0') })
      return
    }
    hideCelebration()
    blurFocus()
    pushRoute(link.pathname)
    syncRoute()
    paint()
    return
  }
  const node = (event.target as HTMLElement).closest<HTMLElement>('[data-act]')
  if (!node || node instanceof HTMLFormElement) return
  const act = node.dataset.act
  if (act === 'attend' && node.dataset.testid === 'go') {
    glowGo = true
    triggerHaptic()
  }
  if (act === 'skip') {
    hideCelebration()
    return
  }
  void actOn(act ?? '', node)
})

app.addEventListener('submit', (event) => {
  const form = event.target
  if (!(form instanceof HTMLFormElement)) return
  event.preventDefault()
  const body = (form.elements.namedItem('body') as HTMLTextAreaElement | null)?.value ?? ''
  const act = form.dataset.act ?? ''
  if (act === 'comment' || act === 'save-intention' || act === 'save-comment' || act === 'feedback' || act === 'save-password' || act === 'save-name') {
    void actOn(act, form, body)
    return
  }
  void actOn('publish', form, body)
})

document.querySelector('#celeb')?.addEventListener('click', (event) => {
  const node = (event.target as HTMLElement).closest<HTMLElement>('[data-act="skip"]')
  if (node) hideCelebration()
})

window.addEventListener('popstate', () => {
  depth = Math.max(0, depth - 1)
  syncRoute()
  paint()
})
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideCelebration()
})

function plain(value: string, max: number) {
  const text = value.trim()
  if (!text || text.length > max || /[<>]/.test(text)) return ''
  return text
}

function isEmoji(value: string) {
  const text = value.trim()
  if (!text || text.length > 16 || /[<>]/.test(text)) return ''
  const parts = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((part) => part.segment)
    : [...text]
  if (parts.length !== 1 || !/\p{Extended_Pictographic}/u.test(parts[0])) return ''
  return parts[0]
}

function ensureCommitmentDay(date: string) {
  if (!current || date < current.today) return null
  let day = current.calendar.find((item) => item.date === date)
  if (!day) {
    day = blankDay(date)
    current.calendar.push(day)
    current.calendar.sort((a, b) => a.date.localeCompare(b.date))
  }
  const span = daysBetween(current.today, date) + 1
  if (span > calendarDays) calendarDays = span
  return day
}

async function setCommitment(date: string, on: boolean) {
  if (!current || locked || !date || date < current.today) return
  const day = ensureCommitmentDay(date)
  if (!day || day.mine_commitment === on) return
  day.mine_commitment = on
  day.committed = on ? true : day.covered > 0
  selected = date
  paint()
  if (demo) return
  const member = current.me.id
  const run = commitChain.then(async () => {
    busy = true
    try {
      await marcarCompromiso(member, date, on)
      await refresh(false)
    } catch {
      const currentDay = current?.calendar.find((item) => item.date === date)
      if (currentDay) currentDay.mine_commitment = !on
      offline = tx().saveFail
      paint()
    } finally {
      busy = false
    }
  })
  commitChain = run.then(() => undefined, () => undefined)
  await run
}

function toggleDemoAttendance(date: string) {
  if (!current) return
  if (date === current.today) {
    const today = current.calendar[0]
    if (today) today.mine_attendance = !today.mine_attendance
    return
  }
  const past = current.past.find((day) => day.date === date)
  if (past) past.mine_attendance = !past.mine_attendance
}

async function actOn(act: string, node: HTMLElement, body = '') {
  if (act === 'back-wall') {
    backToWall()
    return
  }
  if (act === 'locale') {
    if (!current || locked) return
    const next = node.dataset.locale === 'pt' ? 'pt' : 'es'
    localeEpoch += 1
    locale = next
    rememberLocale(next)
    current.prefs.locale = next
    paint()
    if (demo) return
    try {
      await guardarPreferencias(current.me.id, { ...current.prefs, locale: next })
    } catch {
      offline = tx().saveFail
      paint()
    }
    return
  }
  if (act === 'emoji-open') {
    emojiFor = node.dataset.id ?? ''
    emojiQuery = ''
    paint()
    const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
    if (!touch) document.querySelector<HTMLInputElement>('#emoji-search')?.focus()
    return
  }
  if (act === 'emoji-close') {
    emojiFor = ''
    emojiQuery = ''
    paint()
    return
  }
  if (act === 'streak' || act === 'open-past-cal') {
    const key = act === 'open-past-cal' ? 'all' : node.dataset.key
    streakMode = key === 'couple' || key === 'group' || key === 'six' || key === 'all' || key === 'individual' ? key : ''
    if (streakMode) lockStreakScroll()
    monthsBefore = 1
    monthsAfter = 1
    historyDate = ''
    streakAlign = Boolean(streakMode)
    paint()
    return
  }
  if (act === 'streak-close') {
    closeStreakPopupWithAnimation()
    return
  }
  if (act === 'history-day') {
    historyDate = node.dataset.date ?? ''
    paint()
    return
  }
  if (act === 'cancel-edit') {
    editing = null
    paint()
    return
  }
  if (act === 'edit') {
    const kind = node.dataset.kind === 'comment' ? 'comment' : 'intention'
    editing = { kind, id: node.dataset.id ?? '' }
    paint()
    return
  }
  if (busy && act !== 'select') return
  if (act === 'forgot-start') {
    loginEmail()
    loginMode = 'forgot'
    loginMessage = ''
    paint()
    return
  }
  if (act === 'have-code') {
    loginEmail()
    loginMode = 'code'
    loginMessage = ''
    paint()
    return
  }
  if (act === 'login-back') {
    loginEmail()
    loginMode = 'password'
    loginMessage = ''
    paint()
    return
  }
  if (act === 'send-code' || act === 'send-link') {
    const next = loginEmail()
    if (!next) {
      loginMessage = tx().needEmail
      paint()
      return
    }
    if (!supabase) return
    busy = true
    codeSending = true
    paint()
    try {
      const error = await requestEmailCode(next)
      loginMessage = error ? (rateLimited(error) ? tx().rateLimit : tx().sendFail) : tx().loginHint
      if (!error || rateLimited(error)) loginMode = 'code'
    } finally {
      busy = false
      codeSending = false
      paint()
    }
    return
  }
  if (act === 'login-password') {
    const next = loginEmail()
    const password = document.querySelector<HTMLInputElement>('#password')?.value ?? ''
    if (!next) {
      loginMessage = tx().needEmail
      paint()
      return
    }
    if (!supabase || password.length < 6) return
    signingIn = true
    busy = true
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: next, password })
      if (error) {
        loginMessage = tx().badCode
        paint()
        return
      }
      pendingCode = ''
      mustResetPassword = false
      await refresh(true)
    } finally {
      busy = false
      signingIn = false
    }
    return
  }
  if (act === 'verify') {
    const token = (document.querySelector<HTMLInputElement>('#code')?.value ?? '').trim()
    const next = loginEmail()
    if (!next) {
      loginMessage = tx().needEmail
      paint()
      return
    }
    if (!supabase || token.length < 6) return
    recoverySignIn = true
    signingIn = true
    busy = true
    try {
      const { error } = await supabase.auth.verifyOtp({ email: next, token, type: 'email' })
      if (error) {
        loginMessage = tx().badCode
        paint()
        return
      }
      pendingCode = ''
      mustResetPassword = true
      loginMode = 'password'
      paint()
    } finally {
      busy = false
      signingIn = false
      if (!mustResetPassword) recoverySignIn = false
    }
    return
  }
  if (act === 'set-new-password') {
    const password = document.querySelector<HTMLInputElement>('#reset-password')?.value ?? ''
    if (!supabase || password.length < 6) return
    busy = true
    try {
      await updatePassword(password)
      mustResetPassword = false
      recoverySignIn = false
      await refresh(true)
    } catch {
      loginMessage = tx().saveFail
      paint()
    } finally {
      busy = false
    }
    return
  }
  if (act === 'logout') {
    hideCelebration()
    pendingCode = ''
    loginMessage = ''
    loginMode = 'password'
    mustResetPassword = false
    recoverySignIn = false
    if (demo) {
      current = null
      demo = false
      calendarDays = 28
      go('hoy')
      return
    }
    await salir()
    current = null
    denied = false
    calendarDays = 28
    go('hoy')
    return
  }
  if (!current || locked) return
  if (act === 'select') {
    const pointer = node.dataset.pointer === '1'
    if (pointer) blurFocus()
    selected = node.dataset.date ?? selected
    paint()
    if (!pointer) {
      document.querySelector<HTMLButtonElement>(`[data-act="select"][data-date="${selected}"]`)?.focus()
    }
    return
  }
  busy = true
  try {
    if (act === 'attend') {
      const date = node.dataset.date ?? current.today
      if (demo) {
        toggleDemoAttendance(date)
        paint()
        return
      }
      const on = date === current.today
        ? !current.calendar[0]?.mine_attendance
        : !current.past.find((day) => day.date === date)?.mine_attendance
      await marcarAsistencia(current.me.id, date, on)
      await refresh(true)
      return
    }
    if (act === 'commit') {
      const date = node.dataset.date ?? ''
      const day = current.calendar.find((item) => item.date === date)
      busy = false
      await setCommitment(date, day ? !day.mine_commitment : true)
      return
    }
    if (act === 'save-name') {
      if (!current || locked) return
      const form = node instanceof HTMLFormElement ? node : node.closest('form')
      const name = form?.querySelector<HTMLInputElement>('[name="display_name"]')?.value.trim() ?? ''
      nameSaved = false
      if (name.length < 1 || name.length > 40) {
        offline = tx().saveFail
        paint()
        return
      }
      if (!(demo || !supabase)) await guardarNombre(current.me.id, name)
      current.me.display_name = name
      for (const item of current.intentions) {
        if (item.mine) item.display_name = name
        for (const comment of item.comments) if (comment.mine) comment.display_name = name
      }
      nameSaved = true
      paint()
      return
    }
    if (act === 'save-password') {
      const form = node instanceof HTMLFormElement ? node : node.closest('form')
      const currentPassword = form?.querySelector<HTMLInputElement>('[name="current_password"]')?.value ?? ''
      const password = form?.querySelector<HTMLInputElement>('[name="password"]')?.value ?? ''
      if (password.length < 6 || !currentPassword) return
      passwordSaved = false
      passwordError = ''
      if (demo || !supabase) {
        let stored = ''
        try { stored = localStorage.getItem('misa-demo-password') ?? '' } catch { /* sigue en memoria */ }
        if (stored && stored !== currentPassword) {
          passwordError = tx().badCurrent
          paint()
          return
        }
        try { localStorage.setItem('misa-demo-password', password) } catch { /* la copia de muestra no guarda */ }
        passwordSaved = true
        paint()
        return
      }
      const { data, error: userError } = await supabase.auth.getUser()
      const email = data.user?.email
      if (userError || !email) throw userError ?? new Error('sin correo')
      const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
      if (error) {
        passwordError = tx().badCurrent
        paint()
        return
      }
      await updatePassword(password)
      passwordSaved = true
      paint()
      return
    }
    if (act === 'feedback') {
      const text = plain(body, 1000)
      if (!text) return
      if (demo) {
        feedbackSaved = true
        paint()
        return
      }
      await enviarFeedback(current.me.id, text)
      feedbackSaved = true
      paint()
      return
    }
    if (act === 'save-intention' || act === 'save-comment') {
      const text = plain(body, act === 'save-intention' ? 280 : 200)
      const id = node.dataset.id ?? ''
      if (!text || !id) return
      if (demo) {
        if (act === 'save-intention') {
          const item = current.intentions.find((intention) => intention.id === id)
          if (item) item.body = text
        } else {
          for (const item of current.intentions) {
            const comment = item.comments.find((entry) => entry.id === id)
            if (comment) comment.body = text
          }
        }
        editing = null
        paint()
        return
      }
      if (act === 'save-intention') await editarIntencion(id, text)
      else await editarComentario(id, text)
      editing = null
      await refresh(false)
      return
    }
    if (act === 'publish') {
      const text = plain(body, 280)
      if (!text) return
      if (demo) {
        current.intentions.unshift({ id: crypto.randomUUID(), body: text, display_name: current.me.display_name, mine: true, created_at: new Date().toISOString(), comments: [], reactions: [] })
        paint()
        return
      }
      await publicarIntencion(current.me.id, text)
      await refresh(false)
      return
    }
    if (act === 'delete') {
      const id = node.dataset.id ?? ''
      const open = intentionFromPath(location.pathname) === id || openIntention === id
      if (demo) {
        current.intentions = current.intentions.filter((item) => item.id !== id)
        if (open) backToWall()
        else paint()
        return
      }
      await borrarIntencion(id)
      if (open) {
        openIntention = ''
        emojiFor = ''
        pushRoute(href('muro'))
      }
      await refresh(false)
      return
    }
    if (act === 'thread') {
      const id = node.dataset.id ?? ''
      openIntention = openIntention === id ? '' : id
      paint()
      return
    }
    if (act === 'comment') {
      const text = plain(body, 200)
      const intentionId = node.dataset.id ?? ''
      if (!text || !intentionId) return
      if (demo) {
        const item = current.intentions.find((intention) => intention.id === intentionId)
        if (item) {
          item.comments.push({ id: crypto.randomUUID(), body: text, display_name: current.me.display_name, mine: true, created_at: new Date().toISOString() })
        }
        openIntention = intentionId
        paint()
        return
      }
      await publicarComentario(current.me.id, intentionId, text)
      openIntention = intentionId
      await refresh(false)
      return
    }
    if (act === 'delete-comment') {
      const id = node.dataset.id ?? ''
      if (demo) {
        for (const item of current.intentions) item.comments = item.comments.filter((comment) => comment.id !== id)
        paint()
        return
      }
      await borrarComentario(id)
      await refresh(false)
      return
    }
    if (act === 'react') {
      const intentionId = node.dataset.id ?? ''
      const emoji = isEmoji(node.dataset.emoji || body)
      if (!emoji) return
      emojiFor = ''
      const item = current.intentions.find((intention) => intention.id === intentionId)
      const mine = item?.reactions.some((reaction) => reaction.emoji === emoji && reaction.mine) ?? false
      if (demo && item) {
        item.reactions = mine
          ? item.reactions.filter((reaction) => !(reaction.emoji === emoji && reaction.mine))
          : [...item.reactions, { emoji, mine: true }]
        paint()
        return
      }
      if (mine) await quitarReaccion(current.me.id, intentionId, emoji)
      else await ponerReaccion(current.me.id, intentionId, emoji)
      await refresh(false)
      return
    }
    if (act === 'pref') {
      const key = node.dataset.key as 'empty_day' | 'couple'
      const next = !current.prefs[key]
      if (next && 'Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      if (demo) {
        current.prefs[key] = next
        paint()
        return
      }
      await guardarPreferencias(current.me.id, { ...current.prefs, [key]: next })
      if (next && 'Notification' in window && Notification.permission === 'granted') {
        try { await suscribirPush(current.me.id) } catch { /* la preferencia queda aunque el aviso no se registre */ }
      }
      await refresh(false)
    }
  } catch {
    offline = tx().saveFail
    paint()
  } finally {
    busy = false
  }
}

function syncViewport() {
  const view = window.visualViewport
  if (!view) return
  document.documentElement.style.setProperty('--vvh', `${view.height}px`)
  if (emojiFor && window.scrollY !== 0) window.scrollTo(0, 0)
}
window.visualViewport?.addEventListener('resize', syncViewport)
window.visualViewport?.addEventListener('scroll', syncViewport)
syncViewport()

void boot()
