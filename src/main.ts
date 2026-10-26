import '@fontsource-variable/fraunces/wght.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './styles.css'
import { borrarComentario, borrarIntencion, configured, editarComentario, editarIntencion, enviarFeedback, estado, guardarCelebraciones, guardarNombre, guardarPreferencias, marcarAsistencia, marcarCompromiso, ponerReaccion, publicarComentario, publicarIntencion, quitarReaccion, registrarEvento, salir, supabase, suscribirPush, updatePassword } from './api'
import { elegir, hideCelebration, showCelebration } from './celebrate'
import { loadEmojis } from './emoji'
import { placeSwitch, resetSwitch, setSwipeSwitch, startMomentum, stopMomentum, swipeSwitchOn } from './haptics'
import { esc } from './format'
import { celebrationLine, deviceLocale, rememberLocale, savedLocale, setLocale, tx, type Locale } from './i18n'
import type { Estado } from './types'
import { appendCalendarDays, blankDay, dayMarks, emojiGrid, historyDetail, href, intentionFromPath, monthSpan, renderApp, renderDenied, renderLogin, renderResetPassword, renderSetup, renderSplash, routeFromPath, type LoginMode, type Route, type StreakMode } from './view'

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
let attendanceEpoch = 0
let attendChain: Promise<void> = Promise.resolve()
let appOpened = false
let installOpen = false
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
  haptic: HTMLLabelElement | null
  hapticInput: HTMLInputElement | null
  rowSwitch: HTMLInputElement | null
  scrolling: { lastY: number; samples: { t: number; y: number }[] } | null
  ticks: number
  detents: number
} | null = null
const SWIPE_CONFIRM_PX = 88
// Dos topes suaves antes del umbral: el dedo nota que la fila avanza.
const SWIPE_DETENTS = [32, 60]
type SwitchRelease = { input: HTMLInputElement; kind: 'commit' | 'silent' | 'tap'; x: number; y: number; run?: () => void; done: boolean }
let switchRelease: SwitchRelease | null = null
// Diagnóstico del swipe con vibración (solo con la opción encendida): un registro por gesto
// en usage_events para ver en el iPhone real qué eventos llegan y en qué orden.
let swipeTrace: { t0: number; log: string[]; pm: number; tm: number; ticks: number; data: Record<string, unknown> } | null = null
let swipeTraceSent = 0

function traceSwipe(step: string) {
  if (!swipeTrace || swipeTrace.log.length > 40) return
  swipeTrace.log.push(`${step}@${Math.round(performance.now() - swipeTrace.t0)}`)
}

function sendSwipeTrace() {
  const trace = swipeTrace
  swipeTrace = null
  if (!trace || !current || demo || swipeTraceSent >= 40) return
  swipeTraceSent += 1
  registrarEvento(current.me.id, 'swipe_debug', 'calendario', {
    ...trace.data,
    pm: trace.pm,
    tm: trace.tm,
    ticks: trace.ticks,
    log: trace.log.join(' ').slice(0, 900),
  })
}
let suppressRowClick = false
let rowCommitClick = false
let streakClosing = false
let streakMode: StreakMode = ''
let streakScroll = 0
let monthsBefore = 1
let monthsAfter = 1
let streakAlign = false
let growingMonths = false
let passwordScreen = false
let audioCtx: AudioContext | null = null
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
let commitEpoch = 0
// Hasta saber si hay sesión se pinta la marca, no el formulario de entrada.
let booting = false
let loadedOnce = false
let loadedDay = ''
let lastLoad = 0
let resetMessage = ''
let lastRouteKey = ''
let popupEnter = false
let pulseDate = ''
let expectFresh: Set<string> | null = null
let notifyNote = ''
let pushRenewed = false
let skipNextPop = false
let updateReady = false
const drafts = new Map<string, string>()
const hiddenIds = new Set<string>()
let pendingDelete: { kind: 'intention' | 'comment'; id: string; timer: number } | null = null
const SNAPSHOT_KEY = 'misa-estado'
let authRetry = false

function madridDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// El día del teléfono en Madrid cambió desde la última carga: lo que se ve es de ayer.
function staleDay() {
  return Boolean(loadedDay) && loadedDay !== madridDay()
}

function readSnapshot(): { at: string; day: string; data: Estado } | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: string; day?: string; data?: Estado }
    if (!parsed?.data?.me?.id || !parsed.data.today) return null
    return { at: parsed.at ?? '', day: parsed.day ?? '', data: parsed.data }
  } catch {
    return null
  }
}

function writeSnapshot(state: Estado) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ at: state.clock, day: madridDay(), data: state }))
  } catch { /* sin espacio: la próxima apertura irá a la red */ }
}

function clearSnapshot() {
  try { localStorage.removeItem(SNAPSHOT_KEY) } catch { /* nada guardado */ }
  try { sessionStorage.removeItem(SNAPSHOT_KEY) } catch { /* nada guardado */ }
}

function hasStoredSession() {
  try {
    return Object.keys(localStorage).some((key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
  } catch {
    return false
  }
}

function networkError(error: unknown) {
  if (!error || typeof error !== 'object') return !navigator.onLine
  const item = error as { status?: number; name?: string; message?: string }
  return !navigator.onLine
    || item.status === 0
    || item.name === 'AuthRetryableFetchError'
    || /failed to fetch|network|load failed/i.test(item.message ?? '')
}

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

function captureDrafts() {
  const active = document.activeElement
  const focused = active instanceof HTMLElement ? active.dataset.draft ?? '' : ''
  for (const node of document.querySelectorAll<HTMLTextAreaElement>('[data-draft]')) {
    const key = node.dataset.draft ?? ''
    if (!key) continue
    if (node.value.trim()) drafts.set(key, node.value)
    else drafts.delete(key)
  }
  return focused
}

function restoreDrafts(focused: string) {
  for (const node of document.querySelectorAll<HTMLTextAreaElement>('[data-draft]')) {
    const value = drafts.get(node.dataset.draft ?? '')
    if (value != null) node.value = value
    if (focused && node.dataset.draft === focused && !node.disabled) {
      node.focus({ preventScroll: true })
      node.setSelectionRange(node.value.length, node.value.length)
    }
  }
  updateNeedsText()
}

function clearDraft(key: string) {
  drafts.delete(key)
  const node = document.querySelector<HTMLTextAreaElement>(`[data-draft="${key}"]`)
  if (node) node.value = ''
}

function updateNeedsText(scope: ParentNode = document) {
  for (const button of scope.querySelectorAll<HTMLButtonElement>('button[data-needs-text]')) {
    const field = button.closest('form')?.querySelector<HTMLTextAreaElement>('textarea')
    button.disabled = locked || !field || field.disabled || !field.value.trim()
  }
}

function knownIds(state: Estado) {
  const ids = new Set<string>()
  for (const item of state.intentions) {
    ids.add(item.id)
    for (const comment of item.comments) ids.add(comment.id)
  }
  return ids
}

function visibleState(state: Estado): Estado {
  if (!hiddenIds.size) return state
  return {
    ...state,
    intentions: state.intentions
      .filter((item) => !hiddenIds.has(item.id))
      .map((item) => ({ ...item, comments: item.comments.filter((comment) => !hiddenIds.has(comment.id)) })),
  }
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
    app.innerHTML = renderResetPassword(resetMessage, rememberedEmail())
    document.title = tx().brand
    return
  }
  if (!current && booting) {
    app.innerHTML = renderSplash()
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
  const monthScroll = document.querySelector<HTMLElement>('[data-testid="month-scroll"]')
  const savedMonthTop = monthScroll && !streakAlign ? monthScroll.scrollTop : null
  const focusedDraft = captureDrafts()
  const routeKey = `${route}:${intention}:${passwordScreen ? 'pw' : ''}`
  const enter = Boolean(lastRouteKey) && routeKey !== lastRouteKey
  lastRouteKey = routeKey
  let fresh: Set<string> | undefined
  if (expectFresh) {
    const before = expectFresh
    fresh = new Set([...knownIds(current)].filter((id) => !before.has(id)))
    expectFresh = null
  }
  const opening = popupEnter
  app.innerHTML = renderApp(route, visibleState(current), selected, locked, offline, intention, locale, emojiFor, pulling, {
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
    installOpen,
    passwordScreen,
    enter,
    popupEnter: opening,
    pulseDate,
    fresh,
    notifyNote,
  })
  popupEnter = false
  pulseDate = ''
  if (opening) {
    for (const node of document.querySelectorAll<HTMLElement>('.entering')) {
      node.addEventListener('animationend', () => node.classList.remove('entering'), { once: true })
    }
  }
  restoreDrafts(focusedDraft)
  if (opening) focusDialog()
  if (keepScroll) window.scrollTo(0, y)
  document.title = tx().brand
  const popup = Boolean(streakMode)
  document.documentElement.classList.toggle('modal-open', popup)
  document.body.classList.toggle('modal-open', popup)
  if (streakAlign) alignStreak()
  else if (savedMonthTop != null) {
    const scroller = document.querySelector<HTMLElement>('[data-testid="month-scroll"]')
    if (scroller) {
      growingMonths = true
      scroller.scrollTop = savedMonthTop
      requestAnimationFrame(() => { growingMonths = false })
    }
  }
  settleGlass()
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
  const epoch = localeEpoch
  const attEpoch = attendanceEpoch
  const comEpoch = commitEpoch
  try {
    const next = await estado()
    if (attEpoch !== attendanceEpoch || comEpoch !== commitEpoch) return
    const localeBefore = locale
    const prev = current
    const wasLocked = locked
    current = next
    denied = false
    offline = ''
    locked = false
    booting = false
    loadedOnce = true
    loadedDay = madridDay()
    lastLoad = Date.now()
    if (epoch === localeEpoch) {
      const saved = current.prefs.locale
      if (saved === 'es' || saved === 'pt') locale = saved
      else locale = savedLocale() ?? deviceLocale()
      rememberLocale(locale)
      if (!saved) {
        current.prefs.locale = locale
        // Si no se guarda ahora, se guardará en la próxima apertura; no es un fallo de conexión.
        void guardarPreferencias(current.me.id, current.prefs).catch(() => undefined)
      }
    }
    if (epoch !== localeEpoch) current.prefs.locale = locale
    writeSnapshot(current)
    if (!appOpened && !demo) {
      appOpened = true
      registrarEvento(current.me.id, 'app_open', routeFromPath(location.pathname), {})
    }
    renewPush(current)
    const idle = (window as Window & { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1500))
    idle(() => void loadEmojis())
    const shapeChanged = !prev
      || prev.today !== current.today
      || prev.risk !== current.risk
      || Boolean(prev.monday) !== Boolean(current.monday)
      || prev.me.id !== current.me.id
      || wasLocked
    if (selected && prev && prev.today !== current.today && selected < current.today) selected = current.today
    if (locale !== localeBefore || shapeChanged || !patchHoyAttendance(current, locked)) paint()
    else document.querySelector('.offline')?.remove()
    if (celebrate) await celebratePending(current)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : ''
    if ((code === 'PGRST301' || code === 'PGRST303') && supabase && !authRetry) {
      // Sesión caducada (el teléfono durmió días): se renueva una vez y se reintenta.
      authRetry = true
      try {
        const { error: renewError } = await supabase.auth.refreshSession()
        if (!renewError) {
          await refresh(celebrate)
          return
        }
        if (!networkError(renewError)) {
          await supabase.auth.signOut({ scope: 'local' })
          return
        }
      } finally {
        authRetry = false
      }
    }
    if (code === '42501' || /no eres del (grupo|curso)/i.test(String(error))) {
      current = null
      denied = true
      booting = false
      clearSnapshot()
      paint()
      return
    }
    const saved = current ? null : readSnapshot()
    if (current || saved) {
      if (!current && saved) current = saved.data
      offline = tx().offline(saved?.at || current?.clock || '')
      locked = true
      booting = false
      paint()
      return
    }
    booting = false
    loadedOnce = false
    loginMessage = tx().openFail
    current = null
    paint()
  }
}

function renewPush(state: Estado) {
  if (pushRenewed || demo || !state.prefs.empty_day) return
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  pushRenewed = true
  // iOS caduca la suscripción sin avisar: al abrir se vuelve a dejar escrita.
  void suscribirPush(state.me.id).catch(() => { pushRenewed = false })
}

function maybeRefresh(force = false) {
  if (!current || demo || !configured || !loadedOnce) return
  if (busy || pulling || gesture || tabScrub || mustResetPassword) return
  if (force || staleDay() || Date.now() - lastLoad > 60_000) void refresh(false)
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
  if (configured && supabase && hasStoredSession()) {
    // Abre al instante con lo último que se vio; estado() lo pone al día detrás.
    const snap = readSnapshot()
    if (snap) {
      current = snap.data
      selected = current.today
      loadedDay = snap.day
      const saved = current.prefs.locale
      if (saved === 'es' || saved === 'pt') locale = saved
    } else {
      booting = true
    }
  }
  paint()
  if (!configured || !supabase) return
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session) {
      if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        const hadSomething = Boolean(current) || booting
        current = null
        denied = false
        booting = false
        loadedOnce = false
        clearSnapshot()
        if (event === 'SIGNED_OUT' || hadSomething) paint()
      }
      return
    }
    if (mustResetPassword || recoverySignIn) return
    if (!loadedOnce && !signingIn) window.setTimeout(() => void refresh(true), 0)
  })
  refreshServiceWorker()
}

function refreshServiceWorker() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  const hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((reg) => {
    void reg.update()
  }).catch(() => undefined)
  if (hadController && !refreshServiceWorker.watching) {
    refreshServiceWorker.watching = true
    navigator.serviceWorker.addEventListener('controllerchange', () => { updateReady = true })
  }
}
refreshServiceWorker.watching = false

// Una versión nueva se carga al volver a la app, nunca en mitad de un gesto o de un texto.
function reloadIfUpdated() {
  if (!updateReady || gesture || tabScrub || drafts.size || pendingDelete) return
  if (document.querySelector<HTMLTextAreaElement>('[data-draft]')?.value.trim()) return
  location.reload()
}

function syncRoute() {
  openIntention = intentionFromPath(location.pathname)
  emojiFor = ''
  if (!(routeFromPath(location.pathname) === 'ajustes' && history.state?.passwordScreen)) {
    passwordScreen = false
  }
}

function pushModal(kind: 'streak' | 'emoji') {
  history.pushState({ ...(history.state ?? {}), modal: kind }, '', `${location.pathname}${location.search}`)
  depth += 1
}

function popModal(kind: 'streak' | 'emoji') {
  if (history.state?.modal !== kind) return
  skipNextPop = true
  history.back()
}

function closeSheet() {
  if (!emojiFor) return
  emojiFor = ''
  emojiQuery = ''
  popModal('emoji')
  paint()
}

function dialogNode() {
  if (streakMode) return document.querySelector<HTMLElement>('.streak-pop')
  if (emojiFor) return document.querySelector<HTMLElement>('.sheet')
  return null
}

function focusDialog() {
  const dialog = dialogNode()
  dialog?.querySelector<HTMLElement>('.pop-close')?.focus({ preventScroll: true })
}

function trapFocus(event: KeyboardEvent) {
  const dialog = dialogNode()
  if (!dialog) return
  const items = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([type="checkbox"]):not([disabled]), [tabindex="0"]')]
    .filter((node) => node.offsetParent !== null)
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

function openPasswordScreen() {
  passwordScreen = true
  history.pushState({ passwordScreen: true }, '', `${href('ajustes')}${location.search}`)
  depth += 1
  paint()
}

function closePasswordScreen() {
  passwordScreen = false
  passwordSaved = false
  passwordError = ''
  if (history.state?.passwordScreen) {
    history.replaceState({}, '', `${href('ajustes')}${location.search}`)
  }
  paint()
}

function pushRoute(pathname: string) {
  stopMomentum()
  const next = `${pathname}${location.search}`
  if (`${location.pathname}${location.search}` === next) return
  history.pushState({}, '', next)
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
}

// iOS no tiene vibrate: un switch oculto que recibe un clic dentro de un gesto
// del dedo hace que Safari dispare su vibración nativa.
function switchHaptic() {
  const label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  label.style.display = 'none'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  label.appendChild(input)
  document.head.appendChild(label)
  label.click()
  label.remove()
}

function swipeCommits(row: HTMLElement, armed: 'right' | 'left' | '') {
  const committed = row.dataset.committed === 'true'
  return (armed === 'right' && !committed) || (armed === 'left' && committed)
}

function tickIfRunning() {
  const ctx = audioCtx
  if (!ctx || ctx.state !== 'running') return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = 660
  gain.gain.setValueAtTime(0.03, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.05)
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
  hideCelebration()
  if (current && !demo) {
    const via = from && 'px' in from ? 'drag' : 'tap'
    const to = link.dataset.nav === 'intenciones' ? 'muro' : (link.dataset.nav || 'hoy')
    registrarEvento(current.me.id, 'tab_view', to, { to, via })
  }
  const navKey = link.dataset.nav ?? ''
  const target: Route = navKey === 'intenciones' ? 'muro' : navKey === 'calendario' || navKey === 'ajustes' ? navKey : 'hoy'
  // Solo el toque en la pestaña en la que ya estás sube con animación; cambiar de pestaña llega arriba al instante.
  const sameTab = target === routeFromPath(location.pathname) && !intentionFromPath(location.pathname) && !passwordScreen
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
  if (!navKey) return
  if (sameTab) scrollPageTop()
  else jumpPageTop()
}

function jumpPageTop() {
  scrollGen += 1
  stopScrollAnim()
  lastProgrammaticY = 0
  applyingScroll = true
  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
  applyingScroll = false
}

function beginTabScrub(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Element) || event.button !== 0) return
  const nav = target.closest<HTMLElement>('nav.tabs')
  const pill = nav?.querySelector<HTMLElement>('.tab-glass-pill')
  if (!nav || !pill) return
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
  resetSwitch(row.querySelector<HTMLInputElement>('input[data-row-switch]'))
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
      if (gesture.rowSwitch) traceSwipe('lockx')
      const cap = gesture.rowSwitch ?? gesture.hapticInput ?? gesture.haptic
      if (cap) {
        try { cap.setPointerCapture(event.pointerId) } catch { /* el dedo sigue sobre la etiqueta */ }
      }
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
  if (dx >= SWIPE_CONFIRM_PX) gesture.armed = 'right'
  else if (dx <= -SWIPE_CONFIRM_PX) gesture.armed = 'left'
  else gesture.armed = ''
  const committed = row.dataset.committed === 'true'
  const willCommit = swipeCommits(row, gesture.armed)
  const wasArmed = row.classList.contains('swipe-armed')
  row.classList.toggle('swipe-armed', willCommit)
  // Avance en la dirección que cambia algo: derecha si no te has apuntado, izquierda si sí.
  const progress = committed ? -dx : dx
  let ticks = 0
  for (const [index, at] of SWIPE_DETENTS.entries()) {
    if (progress >= at && gesture.detents <= index) {
      gesture.detents = index + 1
      ticks += 1
      navigator.vibrate?.(6)
    }
  }
  if (willCommit !== wasArmed) ticks += 1
  if (willCommit && !wasArmed) {
    triggerHaptic()
    tickIfRunning()
  } else if (!willCommit && wasArmed) {
    navigator.vibrate?.(8)
  }
  gesture.ticks += ticks
  if (swipeTrace && gesture.rowSwitch) {
    swipeTrace.ticks = gesture.ticks
    if (ticks) traceSwipe(`tick${gesture.ticks}:${Math.round(progress)}`)
  }
  // Cada tope cambia de lado el switch bajo el dedo: WebKit vibra en ese cruce.
  if (gesture.rowSwitch) placeSwitch(gesture.rowSwitch, row, event.clientX, gesture.ticks % 2 === 1)
  for (const cue of row.querySelectorAll<HTMLElement>('.swipe-cue')) {
    const side = cue.closest('.swipe-under.left') ? 'left' : 'right'
    if (gesture.armed === 'right' && side === 'right') cue.textContent = '✓'
    else if (gesture.armed === 'left' && side === 'left') cue.textContent = '✕'
    else cue.textContent = cue.dataset.cue ?? ''
  }
  row.classList.toggle('swiping-right', dx > 8)
  row.classList.toggle('swiping-left', dx < -8 && committed)
  row.classList.toggle('swiping-muted', dx < -8 && !committed)
  const shown = Math.max(-176, Math.min(dx, 168))
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

function closeStreakPopupWithAnimation(fromHistory = false) {
  if (!streakMode || streakClosing) return
  streakClosing = true
  if (!fromHistory) popModal('streak')
  const pop = document.querySelector<HTMLElement>('.streak-pop')
  const back = document.querySelector<HTMLElement>('.streak-back')
  pop?.classList.remove('entering')
  back?.classList.remove('entering')
  const finish = () => {
    if (!streakClosing && !streakMode) return
    streakClosing = false
    streakMode = ''
    historyDate = ''
    unlockStreakScroll()
    paint()
    window.scrollTo(0, streakScroll)
    document.querySelector<HTMLElement>('[data-testid="open-past-cal"]')?.focus({ preventScroll: true })
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
  stopMomentum()
  if (target.closest('input:not([data-haptic-switch]):not([data-row-haptic]):not([data-row-switch]), textarea, select, [contenteditable="true"]')) return
  const rowSwitch = target instanceof HTMLInputElement && target.hasAttribute('data-row-switch') ? target : null
  if (rowSwitch) {
    if (swipeTrace) sendSwipeTrace()
    const style = getComputedStyle(rowSwitch)
    swipeTrace = {
      t0: performance.now(),
      log: [],
      pm: 0,
      tm: 0,
      ticks: 0,
      data: {
        ios: /OS (\d+[_\d]*)/.exec(navigator.userAgent)?.[1] ?? '',
        standalone: Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
        attr: rowSwitch.hasAttribute('switch'),
        prop: (rowSwitch as HTMLInputElement & { switch?: boolean }).switch ?? null,
        appearance: style.appearance || style.getPropertyValue('-webkit-appearance'),
        w: Math.round(rowSwitch.getBoundingClientRect().width),
        type: event.pointerType,
      },
    }
    traceSwipe('pd')
  }
  const month = Boolean(target.closest('.month-scroll'))
  const rowNode = target.closest('.days li.swipeable')
  const row = rowNode instanceof HTMLElement && event.clientX > 36 ? rowNode : null
  const popNode = streakMode && !month ? target.closest<HTMLElement>('.streak-pop, .streak-back') : null
  const pop = Boolean(popNode)
  if (popNode && !target.closest('button.pop-close, .history-seg button')) popNode.setPointerCapture?.(event.pointerId)
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
    haptic: (() => {
      const label = target.closest('label[data-haptic-trigger]')
      return label instanceof HTMLLabelElement ? label : null
    })(),
    hapticInput: (() => {
      if (rowSwitch) return null
      if (target instanceof HTMLInputElement && target.hasAttribute('data-row-haptic')) return target
      const found = row?.querySelector('input[data-row-haptic]')
      return found instanceof HTMLInputElement ? found : null
    })(),
    rowSwitch,
    scrolling: null,
    ticks: 0,
    detents: 0,
  }
})

// Qué hará el switch de la fila al levantar el dedo: vibrar al apuntarte o quitarte,
// vibrar y tocar lo que hay debajo en un toque quieto, o callar tras un scroll.
function classifySwitch(start: NonNullable<typeof gesture>, x: number, y: number): SwitchRelease['kind'] {
  if (start.row && start.lockedAxis === 'x') return swipeCommits(start.row, start.armed) ? 'commit' : 'silent'
  if (start.lockedAxis === 'y' || start.scrolling) return 'silent'
  return Math.hypot(x - start.x, y - start.y) <= 10 ? 'tap' : 'silent'
}

let lastTouchEnd = 0
// Tras un deslizamiento o un scroll, el clic simulado del switch no es un toque.
let ignoreSwitchClickUntil = 0

function releaseSwitch(release: Omit<SwitchRelease, 'done'>, touch: boolean) {
  switchRelease = { ...release, done: false }
  // Sin dedo no hay touchend; y si el touchend ya pasó (llegó antes que pointerup), no se espera.
  if (!touch || performance.now() - lastTouchEnd < 150) {
    finishRelease()
    return
  }
  // Si el touchend no llega (cancelado), no se queda nada colgado.
  window.setTimeout(finishRelease, 400)
}

function finishRelease() {
  const release = switchRelease
  if (!release || release.done) return
  release.done = true
  release.input.setAttribute('switch', '')
  if (release.kind === 'commit') release.run?.()
  if (release.kind !== 'tap') switchRelease = null
  else window.setTimeout(() => { if (switchRelease === release) switchRelease = null }, 600)
}

function routeRowTap(input: HTMLInputElement, x: number, y: number) {
  input.style.pointerEvents = 'none'
  const under = document.elementFromPoint(x, y)
  input.style.pointerEvents = ''
  const row = input.closest<HTMLElement>('li')
  const acted = under?.closest<HTMLElement>('[data-act]')
  const node = acted && row?.contains(acted) ? acted : row?.querySelector<HTMLElement>('[data-act="select"]')
  if (!node) return
  node.dataset.pointer = '1'
  void actOn(node.dataset.act ?? '', node)
}

// El scroll de un toque que empieza en el switch de una fila lo hace la app.
function driveSwitchScroll(event: PointerEvent) {
  if (!gesture?.rowSwitch) return false
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  if (gesture.lockedAxis === '' && !gesture.row && Math.abs(dy) >= 10 && Math.abs(dy) > Math.abs(dx)) gesture.lockedAxis = 'y'
  if (gesture.lockedAxis !== 'y') return false
  const scrolling = gesture.scrolling ?? (gesture.scrolling = { lastY: gesture.y, samples: [] })
  const step = event.clientY - scrolling.lastY
  scrolling.lastY = event.clientY
  window.scrollBy(0, -step)
  scrolling.samples.push({ t: event.timeStamp, y: event.clientY })
  if (scrolling.samples.length > 12) scrolling.samples.shift()
  return true
}

let rowTouch: { x: number; y: number } | null = null
let swipeHaptic = false
document.addEventListener('touchstart', (event) => {
  const target = event.target
  if (swipeTrace && target instanceof HTMLInputElement && target.hasAttribute('data-row-switch')) {
    traceSwipe(`ts${event.targetTouches.length}${target.hasAttribute('switch') ? 's' : ''}`)
  }
}, { capture: true, passive: true })
document.addEventListener('touchmove', () => {
  if (swipeTrace) swipeTrace.tm += 1
}, { capture: true, passive: true })

app.addEventListener('touchstart', (event) => {
  const touch = event.changedTouches?.[0]
  rowTouch = touch ? { x: touch.clientX, y: touch.clientY } : null
}, { capture: true, passive: true })

// El touchend es gesto del usuario en Safari: ahí vibra el swipe que confirma
// (marcado en pointerup, que en iOS llega antes) y el toque quieto en el día.
// Desde iOS 26.5 el clic por código ya no vibra: solo sirve en iPhone anteriores.
// «Voy a ir» vibra con su capa tocable (hapticOverlay), como el resto de botones.
// Va antes que el manejo nativo del switch: quitar el atributo aquí evita el clic
// simulado (y su vibración) cuando el gesto fue un scroll o un deslizamiento que no cambia nada.
app.addEventListener('touchend', (event) => {
  lastTouchEnd = performance.now()
  const touch = event.changedTouches?.[0]
  const pending = switchRelease && !switchRelease.done ? switchRelease : null
  const kind = pending?.kind ?? (gesture?.rowSwitch && touch ? classifySwitch(gesture, touch.clientX, touch.clientY) : null)
  const input = pending?.input ?? gesture?.rowSwitch ?? null
  if (kind && input) {
    traceSwipe(`te:${kind}${pending ? '' : ':first'}`)
    if (kind !== 'tap') ignoreSwitchClickUntil = performance.now() + 400
    if (kind === 'silent') input.removeAttribute('switch')
    window.setTimeout(finishRelease, 0)
    if (!pending) window.setTimeout(() => input.setAttribute('switch', ''), 0)
    return
  }
}, true)

app.addEventListener('touchend', (event) => {
  const live = gesture?.row && gesture.lockedAxis === 'x' && !gesture.rowSwitch ? swipeCommits(gesture.row, gesture.armed) : false
  const committing = swipeHaptic || live
  swipeHaptic = false
  if (committing) {
    switchHaptic()
    return
  }
  const target = event.target
  if (!(target instanceof Element) || !target.closest('.days .select-day')) return
  if (gesture && gesture.lockedAxis !== '') return
  const touch = event.changedTouches?.[0]
  if (!rowTouch || !touch || Math.hypot(touch.clientX - rowTouch.x, touch.clientY - rowTouch.y) > 10) return
  switchHaptic()
}, true)

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
  if (swipeTrace && gesture.rowSwitch) swipeTrace.pm += 1
  trackRow(event)
  driveSwitchScroll(event)
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
  const touch = event.pointerType === 'touch'
  if (start.rowSwitch) {
    const kind = classifySwitch(start, event.clientX, event.clientY)
    traceSwipe(`pu:${kind}:${Math.round(dx)}:${start.lockedAxis || '-'}`)
    window.setTimeout(sendSwipeTrace, 900)
    if (start.row && start.lockedAxis === 'x') {
      const date = start.row.dataset.date ?? ''
      suppressRowClick = true
      window.setTimeout(() => { suppressRowClick = false; rowCommitClick = false }, 350)
      resetRow(start.row)
      if (kind === 'commit') navigator.vibrate?.([12, 40, 24])
      releaseSwitch({ input: start.rowSwitch, kind, x: event.clientX, y: event.clientY, run: () => void setCommitment(date, start.armed === 'right', 'swipe') }, touch)
      return
    }
    releaseSwitch({ input: start.rowSwitch, kind, x: event.clientX, y: event.clientY }, touch)
    if (start.scrolling) {
      startMomentum(start.scrolling.samples)
      if (start.scroll <= 4 && dy > 80 && dy > Math.abs(dx) * 1.5) void pullRefresh()
      return
    }
    if (kind === 'tap') return
  }
  if (start.row && start.lockedAxis === 'x') {
    const date = start.row.dataset.date ?? ''
    const willCommit = swipeCommits(start.row, start.armed)
    rowCommitClick = willCommit
    suppressRowClick = true
    window.setTimeout(() => { suppressRowClick = false; rowCommitClick = false }, 350)
    resetRow(start.row)
    if (willCommit && touch) {
      swipeHaptic = true
      navigator.vibrate?.([12, 40, 24])
      window.setTimeout(() => { swipeHaptic = false }, 300)
    }
    if (willCommit) window.setTimeout(() => void setCommitment(date, start.armed === 'right', 'swipe'), 0)
    return
  }
  const horizontal = dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5
  const downDetail = dy > 70 && dy > Math.abs(dx) * 1.5
  const downRefresh = dy > 80 && dy > Math.abs(dx) * 1.5
  const onDetail = Boolean(intentionFromPath(location.pathname))
  if (start.sheet && emojiFor && downDetail) {
    closeSheet()
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
  const passwordSwipe = Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5
  if (passwordScreen && (passwordSwipe || (start.scroll <= 8 && downDetail))) {
    closePasswordScreen()
    return
  }
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
  if (gesture.rowSwitch) {
    traceSwipe('pcancel')
    window.setTimeout(sendSwipeTrace, 900)
  }
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
  if (!(scroller instanceof HTMLElement) || scroller.dataset.testid !== 'month-scroll' || !streakMode || !current || growingMonths) return
  const nearTop = scroller.scrollTop < 360
  const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 360
  if (nearTop && monthsBefore < 36) {
    const add = Math.min(3, 36 - monthsBefore)
    const from = -(monthsBefore + add)
    const to = -(monthsBefore + 1)
    monthsBefore += add
    growingMonths = true
    const before = scroller.scrollHeight
    const top = scroller.scrollTop
    scroller.insertAdjacentHTML('afterbegin', monthSpan(current, streakMode, from, to, historyDate))
    scroller.scrollTop = top + (scroller.scrollHeight - before)
    growingMonths = false
    return
  }
  if (nearBottom && monthsAfter < 24) {
    const add = Math.min(3, 24 - monthsAfter)
    const from = monthsAfter + 1
    const to = monthsAfter + add
    monthsAfter += add
    growingMonths = true
    scroller.insertAdjacentHTML('beforeend', monthSpan(current, streakMode, from, to, historyDate))
    growingMonths = false
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

app.addEventListener('change', (event) => {
  const node = event.target
  if (node instanceof HTMLInputElement && node.hasAttribute('data-row-switch')) traceSwipe(`change:${node.checked ? 'on' : 'off'}`)
})

app.addEventListener('input', (event) => {
  const node = event.target
  if (node instanceof HTMLTextAreaElement) {
    const key = node.dataset.draft
    if (key) {
      if (node.value.trim()) drafts.set(key, node.value)
      else drafts.delete(key)
    }
    const form = node.closest('form')
    if (form) updateNeedsText(form)
    return
  }
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

app.addEventListener('toggle', (event) => {
  const node = event.target
  if (!(node instanceof HTMLDetailsElement) || !node.classList.contains('install-details')) return
  installOpen = node.open
}, true)

app.addEventListener('click', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.hasAttribute('data-row-switch')) {
    // El switch ya ha vibrado; se queda sin marcar y el toque va a lo que hay debajo.
    event.preventDefault()
    event.stopPropagation()
    const input = event.target
    traceSwipe(`click:${input.checked ? 'on' : 'off'}:${event.isTrusted ? 't' : 'u'}`)
    const release = switchRelease
    if (release?.kind === 'tap' && release.input === input) {
      switchRelease = null
      routeRowTap(input, release.x, release.y)
    } else if (!release && !suppressRowClick && performance.now() > ignoreSwitchClickUntil) {
      // El touchend llegó antes que pointerup: se usa el punto donde empezó el toque.
      routeRowTap(input, rowTouch?.x ?? event.clientX, rowTouch?.y ?? event.clientY)
    }
    return
  }
  if (event.target instanceof HTMLInputElement && event.target.hasAttribute('data-haptic-switch')) {
    event.stopPropagation()
    // Con el diagnóstico encendido, cada toque deja si el switch cambió de verdad (isTrusted).
    if (swipeSwitchOn() && current && !demo && swipeTraceSent < 40) {
      swipeTraceSent += 1
      const owner = event.target.closest<HTMLElement>('[data-act]')
      registrarEvento(current.me.id, 'tap_debug', routeFromPath(location.pathname), {
        act: owner?.dataset.act ?? '',
        trusted: event.isTrusted,
        checked: event.target.checked,
        ios: /OS (\d+[_\d]*)/.exec(navigator.userAgent)?.[1] ?? '',
      })
    }
    return
  }
  if (event.target instanceof HTMLInputElement && event.target.hasAttribute('data-row-haptic')) {
    const input = event.target
    if (suppressRowClick) {
      suppressRowClick = false
      rowCommitClick = false
      event.stopPropagation()
      return
    }
    if (input.hasAttribute('data-face-haptic') && !input.closest('button[data-act]')) {
      const select = input.closest('li')?.querySelector<HTMLElement>('[data-act="select"]')
      if (select) void actOn(select.dataset.act ?? 'select', select)
      event.stopPropagation()
      return
    }
  }
  const hapticTarget = event.target
  if (
    hapticTarget instanceof Element
    && !suppressNavClick
    && !suppressRowClick
    && hapticTarget.closest('[data-testid="go"], .check, .switch, nav.tabs a, [data-act="commit"]')
  ) triggerHaptic()
  if (suppressNavClick) {
    suppressNavClick = false
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if (suppressRowClick) {
    suppressRowClick = false
    const target = event.target
    const hapticLabel = target instanceof Element && Boolean(target.closest('label[data-haptic-trigger]'))
    const hapticSwitch = target instanceof HTMLInputElement && target.hasAttribute('data-haptic-switch')
    if (rowCommitClick && (hapticLabel || hapticSwitch)) {
      rowCommitClick = false
      return
    }
    rowCommitClick = false
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
    const opened = intentionFromPath(link.pathname)
    if (opened && current && !demo) registrarEvento(current.me.id, 'intention_open', 'muro', { id: opened })
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
  if (act === 'login-submit') {
    const mode = form.dataset.mode
    void actOn(mode === 'forgot' ? 'send-code' : mode === 'code' ? 'verify' : 'login-password', form)
    return
  }
  if (act === 'set-new-password') {
    void actOn(act, form)
    return
  }
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
  if (skipNextPop) {
    skipNextPop = false
    return
  }
  // Atrás en Android cierra primero lo que esté abierto encima.
  if (streakMode && history.state?.modal !== 'streak') {
    closeStreakPopupWithAnimation(true)
    return
  }
  if (emojiFor && history.state?.modal !== 'emoji' && routeFromPath(location.pathname) === 'muro') {
    emojiFor = ''
    emojiQuery = ''
    paint()
    return
  }
  syncRoute()
  if (routeFromPath(location.pathname) === 'ajustes') {
    passwordScreen = Boolean(history.state?.passwordScreen)
  }
  paint()
})
window.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && (streakMode || emojiFor)) {
    trapFocus(event)
    return
  }
  if (event.key !== 'Escape') return
  hideCelebration()
  if (streakMode) closeStreakPopupWithAnimation()
  else if (emojiFor) closeSheet()
  else if (editing) {
    clearDraft(`edit-${editing.kind}-${editing.id}`)
    editing = null
    paint()
  } else if (passwordScreen) closePasswordScreen()
})

function plain(value: string, max: number) {
  const text = value.trim()
  if (!text || text.length > max) return ''
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

async function setCommitment(date: string, on: boolean, source: 'button' | 'swipe' = 'button') {
  if (!current || locked || !date || date < current.today) return
  if (!demo && staleDay()) {
    void refresh(false)
    return
  }
  const day = ensureCommitmentDay(date)
  if (!day || day.mine_commitment === on) return
  const before = { mine_commitment: day.mine_commitment, committed: day.committed, covered: day.covered, risk: current.risk }
  day.mine_commitment = on
  if (!day.mine_attendance) day.covered = Math.max(0, day.covered + (on ? 1 : -1))
  day.committed = day.covered > 0
  if (date === current.today) current.risk = day.covered > 0 || day.sunday ? null : 'empty'
  selected = date
  if (on) pulseDate = date
  const epoch = ++commitEpoch
  paint()
  if (!demo) registrarEvento(current.me.id, 'commitment_toggle', routeFromPath(location.pathname), { date, on, source })
  if (demo) return
  const member = current.me.id
  const run = commitChain.then(async () => {
    try {
      await marcarCompromiso(member, date, on)
      // Solo el último toque refresca: los anteriores no pisan lo que aún está en cola.
      if (epoch === commitEpoch) await refresh(false)
    } catch {
      const currentDay = current?.calendar.find((item) => item.date === date)
      if (currentDay && current && currentDay.mine_commitment === on) {
        currentDay.mine_commitment = before.mine_commitment
        currentDay.committed = before.committed
        currentDay.covered = before.covered
        if (date === current.today) current.risk = before.risk
      }
      offline = tx().saveFail
      paint()
    }
  })
  commitChain = run.then(() => undefined, () => undefined)
  await run
}

function attendanceRows(date: string) {
  if (!current) return []
  const rows: { mine_attendance: boolean; went: number }[] = []
  if (date === current.today) {
    const today = current.calendar[0]
    if (today) rows.push(today)
  } else {
    const past = current.past.find((day) => day.date === date)
    if (past) rows.push(past)
  }
  let history = current.history.find((day) => day.date === date)
  // Un día viejo en el que no fue nadie no viene en el historial: se crea al marcarlo.
  if (!history && !rows.length && date < current.today) {
    history = { date, went: 0, couples_went: 0, mine_attendance: false, couple_attendance: false }
    current.history.push(history)
    current.history.sort((a, b) => a.date.localeCompare(b.date))
  }
  if (history) rows.push(history)
  return rows
}

type AttendanceSnap = { rows: { mine_attendance: boolean; went: number }[]; total: number; covered: number | null; risk: Estado['risk'] }

function flipAttendance(date: string) {
  if (!current) return null
  const rows = attendanceRows(date)
  if (!rows.length) return null
  const today = date === current.today ? current.calendar[0] : null
  const snaps: AttendanceSnap = {
    rows: rows.map((row) => ({ mine_attendance: row.mine_attendance, went: row.went })),
    total: current.streaks.total,
    covered: today ? today.covered : null,
    risk: current.risk,
  }
  const on = !rows[0].mine_attendance
  const delta = on ? 1 : -1
  for (const row of rows) {
    row.mine_attendance = on
    row.went = Math.max(0, row.went + delta)
  }
  current.streaks.total = Math.max(0, current.streaks.total + delta)
  if (today && !today.mine_commitment) {
    today.covered = Math.max(0, today.covered + delta)
    current.risk = today.covered > 0 || today.sunday ? null : 'empty'
  }
  return { on, snaps }
}

function restoreAttendance(date: string, snaps: AttendanceSnap) {
  if (!current) return
  attendanceRows(date).forEach((row, index) => {
    const snap = snaps.rows[index]
    if (!snap) return
    row.mine_attendance = snap.mine_attendance
    row.went = snap.went
  })
  current.streaks.total = snaps.total
  if (snaps.covered != null && current.calendar[0]?.date === date) current.calendar[0].covered = snaps.covered
  current.risk = snaps.risk
}

function streakTotal(state: Estado) {
  if (streakMode === 'individual') return state.streaks.individual
  if (streakMode === 'couple') return state.streaks.couple
  if (streakMode === 'group') return state.streaks.group
  if (streakMode === 'six') return state.streaks.six
  return state.streaks.total
}

function marksFor(state: Estado, date: string) {
  const row = state.history.find((day) => day.date === date)
    ?? state.past.find((day) => day.date === date)
    ?? state.calendar.find((day) => day.date === date)
  return row ? dayMarks(row) : ''
}

function patchStreakPopup(state: Estado, isLocked: boolean) {
  const scroller = document.querySelector<HTMLElement>('[data-testid="month-scroll"]')
  const pop = document.querySelector('.streak-pop')
  if (!scroller || !pop || !streakMode) return false
  for (const cell of scroller.querySelectorAll<HTMLButtonElement>('[data-act="history-day"]')) {
    const on = cell.dataset.date === historyDate
    cell.classList.toggle('picked', on)
    if (on) cell.setAttribute('aria-pressed', 'true')
    else cell.removeAttribute('aria-pressed')
  }
  const html = historyDetail(state, historyDate, isLocked)
  const existing = pop.querySelector('.history-detail')
  if (!html) existing?.remove()
  else if (existing) existing.outerHTML = html
  else pop.insertAdjacentHTML('beforeend', html)
  return true
}

function patchOpenStreak(state: Estado, isLocked: boolean) {
  const scroller = document.querySelector<HTMLElement>('[data-testid="month-scroll"]')
  if (!scroller) return false
  for (const cell of scroller.querySelectorAll<HTMLElement>('[data-date]')) {
    const marks = marksFor(state, cell.dataset.date ?? '')
    const dots = cell.querySelector('.dots')
    if (marks) {
      if (dots) dots.outerHTML = marks
      else cell.insertAdjacentHTML('beforeend', marks)
    } else {
      dots?.remove()
    }
  }
  const count = document.querySelector('.streak-pop header b')
  if (count) count.textContent = String(streakTotal(state))
  if (historyDate) {
    const pop = document.querySelector('.streak-pop')
    const html = historyDetail(state, historyDate, isLocked)
    const existing = pop?.querySelector('.history-detail')
    if (existing) existing.outerHTML = html
    else pop?.insertAdjacentHTML('beforeend', html)
  }
  return true
}

function patchHoyAttendance(state: Estado, isLocked: boolean) {
  if (streakMode) return patchOpenStreak(state, isLocked)
  if (routeFromPath(location.pathname) !== 'hoy') return false
  const hero = document.querySelector<HTMLElement>('[data-testid="hoy-hero"]')
  if (!hero) return false
  const copy = tx()
  const gone = Boolean(state.calendar[0]?.mine_attendance)
  hero.classList.toggle('on', gone)
  const status = hero.querySelector<HTMLElement>('[data-testid="hoy-status"]')
  if (status) status.textContent = gone ? copy.attendedLine : copy.pendingLine
  const button = hero.querySelector<HTMLButtonElement>('button.go')
  if (button) {
    button.classList.toggle('on', gone)
    button.classList.toggle('go-secondary', gone)
    button.setAttribute('aria-pressed', gone ? 'true' : 'false')
    button.disabled = isLocked
    const label = button.querySelector('.go-label')
    if (label) label.textContent = gone ? copy.unmark : copy.go
    let hidden = button.querySelector('.visually-hidden')
    if (gone) {
      if (!hidden) {
        hidden = document.createElement('span')
        hidden.className = 'visually-hidden'
        button.appendChild(hidden)
      }
      hidden.textContent = copy.gone
    } else {
      hidden?.remove()
    }
  }
  const total = document.querySelector<HTMLElement>('[data-testid="total-num"]')
  if (total) countTo(total, state.streaks.total)
  const list = document.querySelector('[data-testid="past"]')
  if (list) {
    for (const day of state.past) {
      const row = list.querySelector<HTMLElement>(`li[data-date="${day.date}"]`)
      if (!row) continue
      const count = row.querySelector('.past-count')
      if (count) count.textContent = copy.of12(day.went)
      const marks = dayMarks(day)
      const dots = row.querySelector('.dots')
      if (marks) {
        if (dots) dots.outerHTML = marks
        else count?.insertAdjacentHTML('afterend', marks)
      } else {
        dots?.remove()
      }
      const check = row.querySelector<HTMLButtonElement>('.check')
      if (!check) continue
      check.classList.toggle('on', day.mine_attendance)
      check.setAttribute('aria-pressed', day.mine_attendance ? 'true' : 'false')
      check.disabled = isLocked
    }
  }
  return true
}

// La cifra rueda hasta el valor nuevo en vez de cambiar de golpe.
function countTo(node: HTMLElement, target: number) {
  const from = Number(node.textContent) || 0
  if (from === target) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce || Math.abs(target - from) > 40) {
    node.textContent = String(target)
    return
  }
  node.classList.remove('bump')
  void node.offsetWidth
  node.classList.add(target > from ? 'bump' : 'dip')
  const t0 = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / 420)
    node.textContent = String(Math.round(from + (target - from) * (1 - (1 - t) ** 3)))
    if (t < 1) requestAnimationFrame(step)
    else window.setTimeout(() => node.classList.remove('bump', 'dip'), 200)
  }
  requestAnimationFrame(step)
}

function celebrateMark(on: boolean) {
  const hero = document.querySelector<HTMLElement>('[data-testid="hoy-hero"]')
  if (!hero || !on || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  hero.classList.remove('just-on')
  void hero.offsetWidth
  hero.classList.add('just-on')
  window.setTimeout(() => hero.classList.remove('just-on'), 900)
}

function attendanceSource(node: HTMLElement) {
  if (node.dataset.testid === 'go') return 'hoy_main'
  if (node.closest('[data-testid="past"]')) return 'hoy_past'
  if (node.closest('.streak-pop, .history-detail')) return 'popup_day'
  return 'calendar_detail'
}

function queueAttendance(node: HTMLElement) {
  if (!current || locked) return
  if (!demo && staleDay()) {
    // Lo que se ve es de ayer: primero se pone al día y no se marca el día equivocado.
    void refresh(false)
    return
  }
  const date = node.dataset.date ?? current.today
  const riskBefore = current.risk
  const flipped = flipAttendance(date)
  if (!flipped) return
  const epoch = ++attendanceEpoch
  if (riskBefore !== current.risk || !patchHoyAttendance(current, locked)) paint()
  if (date === current.today) celebrateMark(flipped.on)
  const source = attendanceSource(node)
  if (!demo) registrarEvento(current.me.id, 'attendance_toggle', routeFromPath(location.pathname), { date, on: flipped.on, source })
  if (demo) return
  const member = current.me.id
  const on = flipped.on
  const snaps = flipped.snaps
  const run = attendChain.then(async () => {
    try {
      await marcarAsistencia(member, date, on)
      await refresh(true)
    } catch {
      if (epoch !== attendanceEpoch) return
      const riskBefore = current?.risk
      restoreAttendance(date, snaps)
      offline = tx().saveFail
      if (current) paint()
      void riskBefore
    }
  })
  attendChain = run.then(() => undefined, () => undefined)
}

async function actOn(act: string, node: HTMLElement, body = '') {
  if (act === 'back-wall') {
    backToWall()
    return
  }
  if (act === 'swipe-haptic') {
    setSwipeSwitch(!swipeSwitchOn())
    paint()
    return
  }
  if (act === 'locale') {
    if (!current || locked) return
    const next = node.dataset.locale === 'pt' ? 'pt' : 'es'
    localeEpoch += 1
    locale = next
    rememberLocale(next)
    current.prefs.locale = next
    if (!demo) registrarEvento(current.me.id, 'settings_action', 'ajustes', { action: 'language', locale: next })
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
    popupEnter = true
    pushModal('emoji')
    paint()
    void loadEmojis().then(() => {
      const grid = document.querySelector('.sheet-grid')
      if (grid && emojiFor) grid.innerHTML = emojiGrid(emojiFor, emojiQuery)
    })
    const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
    if (!touch) document.querySelector<HTMLInputElement>('#emoji-search')?.focus()
    return
  }
  if (act === 'emoji-close') {
    closeSheet()
    return
  }
  if (act === 'streak' || act === 'open-past-cal') {
    if (act === 'open-past-cal' && current && !demo) registrarEvento(current.me.id, 'past_calendar_open', 'hoy', {})
    const key = act === 'open-past-cal' ? 'all' : node.dataset.key
    streakMode = key === 'couple' || key === 'group' || key === 'six' || key === 'all' || key === 'individual' ? key : ''
    if (streakMode) {
      lockStreakScroll()
      popupEnter = true
      pushModal('streak')
    }
    monthsBefore = 6
    monthsAfter = 6
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
    if (current && patchStreakPopup(current, locked)) return
    paint()
    return
  }
  if (act === 'open-password-screen') {
    openPasswordScreen()
    return
  }
  if (act === 'close-password-screen') {
    closePasswordScreen()
    return
  }
  if (act === 'cancel-edit') {
    if (editing) clearDraft(`edit-${editing.kind}-${editing.id}`)
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
  if (act === 'attend') {
    queueAttendance(node)
    return
  }
  if (act === 'commit') {
    if (!current || locked) return
    const date = node.dataset.date ?? ''
    const day = current.calendar.find((item) => item.date === date)
    await setCommitment(date, day ? !day.mine_commitment : true)
    return
  }
  if (act === 'undo-delete') {
    undoDelete()
    return
  }
  if (act === 'skip-password') {
    mustResetPassword = false
    recoverySignIn = false
    resetMessage = ''
    booting = true
    paint()
    await refresh(true)
    return
  }
  if (act === 'logout') {
    hideCelebration()
    await flushDelete()
    drafts.clear()
    hiddenIds.clear()
    notifyNote = ''
    pushRenewed = false
    pendingCode = ''
    loginMessage = ''
    loginMode = 'password'
    mustResetPassword = false
    recoverySignIn = false
    busy = false
    loadedOnce = false
    if (demo) {
      current = null
      demo = false
      calendarDays = 28
      go('hoy')
      return
    }
    try { await salir() } catch { /* sin conexión: la sesión local se cierra igual */ }
    clearSnapshot()
    current = null
    denied = false
    calendarDays = 28
    go('hoy')
    return
  }
  if (act === 'attend-set') {
    if (!current || locked) return
    const date = node.dataset.date ?? ''
    const wantOn = node.dataset.on === 'true'
    const currentOn = attendanceRows(date)[0]?.mine_attendance ?? false
    if (wantOn !== currentOn) queueAttendance(node)
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
    const field = document.querySelector<HTMLInputElement>('#password')
    const password = field?.value ?? ''
    if (!next) {
      loginMessage = tx().needEmail
      paint()
      return
    }
    if (!supabase) return
    if (!password) {
      field?.focus()
      return
    }
    if (password.length < 6) {
      loginMessage = tx().shortPassword
      paint()
      document.querySelector<HTMLInputElement>('#password')?.focus()
      return
    }
    signingIn = true
    busy = true
    try {
      let error: unknown = null
      try {
        ({ error } = await supabase.auth.signInWithPassword({ email: next, password }))
      } catch (thrown) {
        error = thrown
      }
      if (error) {
        loginMessage = networkError(error) ? tx().netFail : tx().badPassword
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
      let error: unknown = null
      try {
        ({ error } = await supabase.auth.verifyOtp({ email: next, token, type: 'email' }))
      } catch (thrown) {
        error = thrown
      }
      if (error) {
        loginMessage = networkError(error) ? tx().netFail : tx().badCode
        paint()
        return
      }
      pendingCode = ''
      resetMessage = ''
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
    if (!supabase) return
    if (password.length < 6) {
      resetMessage = tx().shortPassword
      paint()
      document.querySelector<HTMLInputElement>('#reset-password')?.focus()
      return
    }
    busy = true
    try {
      await updatePassword(password)
      mustResetPassword = false
      recoverySignIn = false
      resetMessage = ''
      booting = true
      paint()
      await refresh(true)
    } catch (error) {
      resetMessage = networkError(error) ? tx().netFail : tx().saveFail
      paint()
    } finally {
      busy = false
    }
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
      if (!demo) registrarEvento(current.me.id, 'settings_action', 'ajustes', { action: 'name' })
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
      if (!demo) registrarEvento(current.me.id, 'settings_action', 'ajustes', { action: 'password' })
      paint()
      return
    }
    if (act === 'feedback') {
      const text = plain(body, 1000)
      if (!text) return
      if (!demo) registrarEvento(current.me.id, 'settings_action', 'ajustes', { action: 'feedback' })
      if (demo) {
        feedbackSaved = true
        paint()
        return
      }
      await enviarFeedback(current.me.id, text)
      clearDraft('feedback')
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
      clearDraft(`edit-${act === 'save-intention' ? 'intention' : 'comment'}-${id}`)
      editing = null
      await refresh(false)
      return
    }
    if (act === 'publish') {
      const text = plain(body, 280)
      if (!text) return
      if (!demo) registrarEvento(current.me.id, 'intention_publish', 'muro', {})
      if (demo) {
        clearDraft('intention')
        expectFresh = knownIds(current)
        current.intentions.unshift({ id: crypto.randomUUID(), body: text, display_name: current.me.display_name, mine: true, created_at: new Date().toISOString(), comments: [], reactions: [] })
        paint()
        return
      }
      await publicarIntencion(current.me.id, text)
      clearDraft('intention')
      expectFresh = knownIds(current)
      await refresh(false)
      return
    }
    if (act === 'delete') {
      const id = node.dataset.id ?? ''
      if (!id) return
      const open = intentionFromPath(location.pathname) === id || openIntention === id
      if (open) {
        openIntention = ''
        emojiFor = ''
        pushRoute(href('muro'))
      }
      scheduleDelete('intention', id)
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
      if (!demo) registrarEvento(current.me.id, 'comment_publish', 'muro', { intention_id: intentionId })
      if (demo) {
        const item = current.intentions.find((intention) => intention.id === intentionId)
        if (item) {
          clearDraft(`comment-${intentionId}`)
          expectFresh = knownIds(current)
          item.comments.push({ id: crypto.randomUUID(), body: text, display_name: current.me.display_name, mine: true, created_at: new Date().toISOString() })
        }
        openIntention = intentionId
        paint()
        return
      }
      await publicarComentario(current.me.id, intentionId, text)
      clearDraft(`comment-${intentionId}`)
      openIntention = intentionId
      expectFresh = knownIds(current)
      await refresh(false)
      return
    }
    if (act === 'delete-comment') {
      const id = node.dataset.id ?? ''
      if (id) scheduleDelete('comment', id)
      return
    }
    if (act === 'react') {
      const intentionId = node.dataset.id ?? ''
      const emoji = isEmoji(node.dataset.emoji || body)
      if (!emoji) return
      if (emojiFor) {
        emojiFor = ''
        emojiQuery = ''
        popModal('emoji')
      }
      const item = current.intentions.find((intention) => intention.id === intentionId)
      const mine = item?.reactions.some((reaction) => reaction.emoji === emoji && reaction.mine) ?? false
      if (!demo) registrarEvento(current.me.id, 'reaction_toggle', 'muro', { emoji, on: !mine })
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
      notifyNote = ''
      if (next && !demo) {
        const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
        if (!supported) {
          notifyNote = tx().pushNeedsInstall
          paint()
          return
        }
        if (Notification.permission === 'default') await Notification.requestPermission()
        if (Notification.permission !== 'granted') {
          notifyNote = tx().pushBlocked
          paint()
          return
        }
      }
      if (!demo) registrarEvento(current.me.id, 'settings_action', 'ajustes', { action: 'alert', key, on: next })
      if (demo) {
        current.prefs[key] = next
        paint()
        return
      }
      if (next) await suscribirPush(current.me.id)
      await guardarPreferencias(current.me.id, { ...current.prefs, [key]: next })
      pushRenewed = next
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
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    reloadIfUpdated()
    refreshServiceWorker()
    maybeRefresh()
  } else {
    void flushDelete()
  }
})
window.addEventListener('pageshow', (event) => {
  if (event.persisted) maybeRefresh()
})
window.addEventListener('pagehide', () => { void flushDelete() })
window.addEventListener('online', () => maybeRefresh(true))
// Si la app sigue abierta a medianoche, el día cambia sin esperar a un toque.
window.setInterval(() => {
  if (document.visibilityState === 'visible' && staleDay()) maybeRefresh(true)
}, 30_000)

function toastNode() {
  let node = document.querySelector<HTMLElement>('#toast')
  if (!node) {
    node = document.createElement('div')
    node.id = 'toast'
    node.setAttribute('role', 'status')
    node.setAttribute('aria-live', 'polite')
    node.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('[data-act="undo-delete"]')) undoDelete()
    })
    document.body.appendChild(node)
  }
  return node
}

function showToast(text: string) {
  const node = toastNode()
  node.innerHTML = `<div class="toast-inner" data-testid="toast"><span>${esc(text)}</span><button type="button" data-act="undo-delete">${esc(tx().undo)}</button></div>`
  node.classList.remove('show')
  void node.offsetWidth
  node.classList.add('show')
}

function hideToast() {
  const node = document.querySelector<HTMLElement>('#toast')
  if (!node) return
  node.classList.remove('show')
  window.setTimeout(() => {
    if (!node.classList.contains('show')) node.innerHTML = ''
  }, 240)
}

// Borrar espera cinco segundos con "Deshacer" a mano antes de ir a la base.
function scheduleDelete(kind: 'intention' | 'comment', id: string) {
  void flushDelete()
  hiddenIds.add(id)
  editing = null
  pendingDelete = { kind, id, timer: window.setTimeout(() => void flushDelete(), 5000) }
  paint()
  showToast(kind === 'intention' ? tx().deletedIntention : tx().deletedComment)
}

function undoDelete() {
  const item = pendingDelete
  if (!item) return
  pendingDelete = null
  window.clearTimeout(item.timer)
  hiddenIds.delete(item.id)
  hideToast()
  paint()
}

async function flushDelete() {
  const item = pendingDelete
  if (!item) return
  pendingDelete = null
  window.clearTimeout(item.timer)
  hideToast()
  if (demo || !current) {
    if (current) {
      if (item.kind === 'intention') current.intentions = current.intentions.filter((entry) => entry.id !== item.id)
      else for (const entry of current.intentions) entry.comments = entry.comments.filter((comment) => comment.id !== item.id)
    }
    hiddenIds.delete(item.id)
    return
  }
  try {
    if (item.kind === 'intention') await borrarIntencion(item.id)
    else await borrarComentario(item.id)
    await refresh(false)
    hiddenIds.delete(item.id)
  } catch {
    hiddenIds.delete(item.id)
    offline = tx().saveFail
    paint()
  }
}

void boot()
