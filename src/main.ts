import '@fontsource-variable/fraunces/wght.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './styles.css'
import { borrarComentario, borrarIntencion, configured, editarComentario, editarIntencion, enviarFeedback, estado, guardarCelebraciones, guardarPreferencias, marcarAsistencia, marcarCompromiso, ponerReaccion, publicarComentario, publicarIntencion, quitarReaccion, salir, supabase, suscribirPush } from './api'
import { elegir, hideCelebration, showCelebration } from './celebrate'
import { celebrationLine, deviceLocale, rememberLocale, savedLocale, setLocale, tx, type Locale } from './i18n'
import type { Estado } from './types'
import { appendCalendarDays, blankDay, emojiGrid, href, intentionFromPath, renderApp, renderDenied, renderLogin, renderSetup, routeFromPath, type Route, type StreakMode } from './view'

const app = document.querySelector<HTMLElement>('#app')!
let current: Estado | null = null
let selected = ''
let offline = ''
let locked = false
let loginMessage = ''
let pendingCode = ''
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
let monthsBefore = 1
let monthsAfter = 1
let streakAlign = false
let historyDate = ''
let editing: { kind: 'intention' | 'comment'; id: string } | null = null
let emojiQuery = ''
let passwordSaved = false
let feedbackSaved = false
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

function rateLimited(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const item = error as { status?: number; code?: string; message?: string }
  const text = `${item.code ?? ''} ${item.message ?? ''}`.toLowerCase()
  return item.status === 429 || text.includes('rate limit') || text.includes('rate_limit') || text.includes('too many')
}

function paint() {
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
  if (!current) {
    if (!denied) keepLoginDraft()
    app.innerHTML = denied ? renderDenied() : renderLogin(loginMessage, rememberedEmail(), pendingCode)
    return
  }
  if (!selected) selected = current.today
  const lastDate = current.calendar.reduce((max, day) => (day.date > max ? day.date : max), current.today)
  const span = daysBetween(current.today, lastDate) + 1
  if (span > calendarDays) calendarDays = span
  if (openIntention && !current.intentions.some((item) => item.id === openIntention)) openIntention = ''
  const intention = intentionFromPath(location.pathname) || openIntention
  if (emojiFor && !current.intentions.some((item) => item.id === emojiFor)) emojiFor = ''
  const keepScroll = route === 'calendario' && Boolean(document.querySelector('[data-testid="calendar"]'))
  const y = window.scrollY
  app.innerHTML = renderApp(route, current, selected, locked, offline, intention, locale, emojiFor, pulling, {
    streak: streakMode,
    monthsBefore,
    monthsAfter,
    historyDate,
    editing,
    emojiQuery,
    passwordSaved,
    feedbackSaved,
    calendarDays,
  })
  if (keepScroll) window.scrollTo(0, y)
  document.title = tx().brand
  const popup = Boolean(streakMode)
  document.documentElement.classList.toggle('modal-open', popup)
  document.body.classList.toggle('modal-open', popup)
  if (streakAlign) alignStreak()
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

function backToWall() {
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

function resetRow(row: HTMLElement | null) {
  if (!row) return
  row.classList.remove('dragging', 'swiping-right', 'swiping-left', 'swiping-muted', 'swipe-armed')
  for (const cue of row.querySelectorAll<HTMLElement>('.swipe-cue')) cue.textContent = cue.dataset.cue ?? ''
  const face = row.querySelector<HTMLElement>('.swipe-face')
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
  if (dx >= 52) gesture.armed = 'right'
  else if (dx <= -52) gesture.armed = 'left'
  else gesture.armed = ''
  row.classList.toggle('swipe-armed', gesture.armed !== '')
  for (const cue of row.querySelectorAll<HTMLElement>('.swipe-cue')) {
    cue.textContent = gesture.armed ? '✓' : (cue.dataset.cue ?? '')
  }
  const committed = row.dataset.committed === 'true'
  row.classList.toggle('swiping-right', dx > 8)
  row.classList.toggle('swiping-left', dx < -8 && committed)
  row.classList.toggle('swiping-muted', dx < -8 && !committed)
  const shown = Math.max(-168, Math.min(dx, 148))
  face.style.transform = `translateX(${shown}px)`
}

function closeStreakPopupWithAnimation() {
  if (!streakMode || streakClosing) return
  streakClosing = true
  const pop = document.querySelector<HTMLElement>('.streak-pop')
  const back = document.querySelector<HTMLElement>('.streak-back')
  if (pop) {
    pop.style.transition = ''
    pop.style.transform = ''
    pop.classList.add('closing')
  }
  back?.classList.add('closing')
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.setTimeout(() => {
    streakClosing = false
    streakMode = ''
    historyDate = ''
    paint()
  }, reduce ? 0 : 200)
}

function followPopup(dy: number) {
  const pop = document.querySelector<HTMLElement>('.streak-pop')
  if (!pop || dy <= 0) return
  pop.style.transition = 'none'
  pop.style.transform = `translate(-50%, ${dy}px)`
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

app.addEventListener('pointermove', (event) => {
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
  if (target.id !== 'email' && target.id !== 'code') return
  event.preventDefault()
  const code = document.querySelector<HTMLInputElement>('#code')?.value.trim() ?? ''
  void actOn(target.id === 'code' || code.length >= 6 ? 'verify' : 'send-link', target)
})

app.addEventListener('click', (event) => {
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
    hideCelebration()
    pushRoute(link.pathname)
    syncRoute()
    paint()
    return
  }
  const node = (event.target as HTMLElement).closest<HTMLElement>('[data-act]')
  if (!node || node instanceof HTMLFormElement) return
  const act = node.dataset.act
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
  if (act === 'comment' || act === 'save-intention' || act === 'save-comment' || act === 'feedback' || act === 'save-password') {
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
  if (act === 'streak') {
    const key = node.dataset.key
    streakMode = key === 'couple' || key === 'group' || key === 'six' || key === 'all' || key === 'individual' ? key : ''
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
  if (act === 'send-link') {
    const next = loginEmail()
    if (!next) {
      loginMessage = tx().needEmail
      paint()
      return
    }
    if (!supabase) return
    busy = true
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: next,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}`,
          data: { locale },
        },
      })
      loginMessage = error ? (rateLimited(error) ? tx().rateLimit : tx().sendFail) : tx().loginHint
      paint()
    } finally {
      busy = false
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
      await refresh(true)
    } finally {
      busy = false
      signingIn = false
    }
    return
  }
  if (act === 'logout') {
    hideCelebration()
    pendingCode = ''
    loginMessage = ''
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
    if (act === 'save-password') {
      const password = node.querySelector<HTMLInputElement>('#new-password')?.value ?? ''
      if (password.length < 6) return
      if (demo || !supabase) {
        passwordSaved = true
        paint()
        return
      }
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
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
        current.intentions.unshift({ id: crypto.randomUUID(), body: text, display_name: current.me.display_name, mine: true, comments: [], reactions: [] })
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
