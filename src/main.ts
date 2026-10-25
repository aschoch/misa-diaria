import '@fontsource-variable/fraunces/wght.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './styles.css'
import { borrarComentario, borrarIntencion, configured, editarComentario, editarIntencion, enviarFeedback, estado, guardarCelebraciones, guardarPreferencias, marcarAsistencia, marcarCompromiso, ponerReaccion, publicarComentario, publicarIntencion, quitarReaccion, salir, supabase, suscribirPush } from './api'
import { elegir, hideCelebration, showCelebration } from './celebrate'
import { celebrationLine, deviceLocale, rememberLocale, savedLocale, setLocale, tx, type Locale } from './i18n'
import type { Estado } from './types'
import { emojiGrid, href, intentionFromPath, renderApp, renderDenied, renderLogin, renderSetup, routeFromPath, type Route, type StreakMode } from './view'

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
let gesture: { x: number; y: number; scroll: number; sheet: boolean; id: number; row: HTMLElement | null } | null = null
let streakMode: StreakMode = ''
let monthsBefore = 1
let monthsAfter = 1
let streakAlign = false
let historyDate = ''
let editing: { kind: 'intention' | 'comment'; id: string } | null = null
let emojiQuery = ''
let passwordSaved = false
let feedbackSaved = false

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
  if (openIntention && !current.intentions.some((item) => item.id === openIntention)) openIntention = ''
  const intention = intentionFromPath(location.pathname) || openIntention
  if (emojiFor && !current.intentions.some((item) => item.id === emojiFor)) emojiFor = ''
  app.innerHTML = renderApp(route, current, selected, locked, offline, intention, locale, emojiFor, pulling, {
    streak: streakMode,
    monthsBefore,
    monthsAfter,
    historyDate,
    editing,
    emojiQuery,
    passwordSaved,
    feedbackSaved,
  })
  document.title = tx().brand
  if (streakAlign) alignStreak()
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

app.addEventListener('pointerdown', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  const button = target.closest<HTMLElement>('.days button')
  if (button) button.dataset.pointer = '1'
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return
  const row = target.closest('.days li.swipeable')
  gesture = {
    x: event.clientX,
    y: event.clientY,
    scroll: window.scrollY,
    sheet: Boolean(target.closest('.sheet')),
    id: event.pointerId,
    row: row instanceof HTMLElement ? row : null,
  }
})

app.addEventListener('pointermove', (event) => {
  if (!gesture || gesture.id !== event.pointerId || !gesture.row || gesture.x <= 36) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  const row = gesture.row
  const face = row.querySelector<HTMLElement>('.swipe-face')
  if (!face) return
  if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
    face.style.transform = ''
    row.classList.remove('swiping-right', 'swiping-left', 'swiping-muted')
    gesture.row = null
    return
  }
  if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy) * 1.5) return
  const committed = row.dataset.committed === 'true'
  row.classList.remove('swiping-right', 'swiping-left', 'swiping-muted')
  if (dx > 0) {
    row.classList.add('swiping-right')
    face.style.transform = `translateX(${Math.min(dx, 148)}px)`
    return
  }
  if (committed) {
    row.classList.add('swiping-left')
    face.style.transform = `translateX(${Math.max(dx, -168)}px)`
    return
  }
  row.classList.add('swiping-muted')
  face.style.transform = `translateX(${dx * 0.25}px)`
})

app.addEventListener('pointerup', (event) => {
  if (!gesture || gesture.id !== event.pointerId) return
  const start = gesture
  gesture = null
  const dx = event.clientX - start.x
  const dy = event.clientY - start.y
  if (start.row && start.x > 36) {
    const face = start.row.querySelector<HTMLElement>('.swipe-face')
    if (face) face.style.transform = ''
    start.row.classList.remove('swiping-right', 'swiping-left', 'swiping-muted')
    const across = Math.abs(dx) > Math.abs(dy) * 1.5
    if (across) {
      const date = start.row.dataset.date ?? ''
      const committed = start.row.dataset.committed === 'true'
      if (dx >= 64 && !committed) void setCommitment(date, true)
      else if (dx <= -64 && committed) void setCommitment(date, false)
      return
    }
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
  gesture = null
  const face = row?.querySelector<HTMLElement>('.swipe-face')
  if (face) face.style.transform = ''
  row?.classList.remove('swiping-right', 'swiping-left', 'swiping-muted')
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

function bump(id: string) {
  if (!current) return
  const index = current.intentions.findIndex((item) => item.id === id)
  if (index <= 0) return
  const [item] = current.intentions.splice(index, 1)
  current.intentions.unshift(item)
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

async function setCommitment(date: string, on: boolean) {
  if (!current || locked || busy || !date) return
  const day = current.calendar.find((item) => item.date === date)
  if (!day || day.mine_commitment === on) return
  busy = true
  try {
    if (demo) {
      day.mine_commitment = on
      selected = date
      paint()
      return
    }
    await marcarCompromiso(current.me.id, date, on)
    selected = date
    await refresh(false)
  } catch {
    offline = tx().saveFail
    paint()
  } finally {
    busy = false
  }
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
    document.querySelector<HTMLInputElement>('#emoji-search')?.focus()
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
    streakMode = ''
    historyDate = ''
    paint()
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
      go('hoy')
      return
    }
    await salir()
    current = null
    denied = false
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
      if (demo) {
        if (day) day.mine_commitment = !day.mine_commitment
        selected = date
        paint()
        return
      }
      await marcarCompromiso(current.me.id, date, !day?.mine_commitment)
      selected = date
      await refresh(false)
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
          bump(intentionId)
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
        bump(intentionId)
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

void boot()
