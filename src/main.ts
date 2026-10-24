import '@fontsource-variable/fraunces/wght.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './styles.css'
import { borrarComentario, borrarIntencion, configured, estado, guardarCelebraciones, guardarPreferencias, marcarAsistencia, marcarCompromiso, ponerReaccion, publicarComentario, publicarIntencion, quitarReaccion, salir, supabase, suscribirPush } from './api'
import { elegir, hideCelebration, showCelebration } from './celebrate'
import { celebrationLine, deviceLocale, rememberLocale, savedLocale, setLocale, tx, type Locale } from './i18n'
import type { Estado } from './types'
import { href, renderApp, renderDenied, renderLogin, renderSetup, routeFromPath, type Route } from './view'

const app = document.querySelector<HTMLElement>('#app')!
let current: Estado | null = null
let selected = ''
let offline = ''
let locked = false
let email = ''
let codeAsked = false
let loginMessage = ''
let denied = false
let demo = false
let busy = false
let locale: Locale = savedLocale() ?? deviceLocale()
let openIntention = ''

function paint() {
  setLocale(locale)
  document.documentElement.lang = locale === 'pt' ? 'pt-PT' : 'es'
  const route = routeFromPath(location.pathname)
  if (!configured && !demo) {
    app.innerHTML = renderSetup()
    return
  }
  if (!current) {
    app.innerHTML = denied ? renderDenied() : renderLogin(loginMessage, codeAsked)
    return
  }
  if (!selected) selected = current.today
  if (openIntention && !current.intentions.some((item) => item.id === openIntention)) openIntention = ''
  app.innerHTML = renderApp(route, current, selected, locked, offline, openIntention, locale)
  document.title = tx().brand
}

async function refresh(celebrate = false) {
  const snapshot = sessionStorage.getItem('misa-estado')
  try {
    current = await estado()
    denied = false
    offline = ''
    locked = false
    const saved = current.prefs.locale
    if (saved === 'es' || saved === 'pt') locale = saved
    else locale = savedLocale() ?? deviceLocale()
    rememberLocale(locale)
    if (!saved) {
      current.prefs.locale = locale
      await guardarPreferencias(current.me.id, current.prefs)
    }
    sessionStorage.setItem('misa-estado', JSON.stringify({ at: current.clock, data: current }))
    paint()
    if (celebrate) await celebratePending(current)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : ''
    if (code === '42501' || /no eres del grupo/i.test(String(error))) {
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
    if (!current) window.setTimeout(() => void refresh(true), 0)
  })
  if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  }
}

function go(route: Route) {
  const next = href(route)
  if (location.pathname !== next) history.pushState({}, '', next)
  paint()
}

app.addEventListener('pointerdown', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('.days button')
  if (button) button.dataset.pointer = '1'
})

app.addEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest('a[href]')
  if (link instanceof HTMLAnchorElement && link.origin === location.origin) {
    event.preventDefault()
    hideCelebration()
    history.pushState({}, '', link.pathname)
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
  void actOn(form.dataset.act === 'comment' ? 'comment' : 'publish', form, body)
})

document.querySelector('#celeb')?.addEventListener('click', (event) => {
  const node = (event.target as HTMLElement).closest<HTMLElement>('[data-act="skip"]')
  if (node) hideCelebration()
})

window.addEventListener('popstate', () => paint())
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

function isEmoji(value: string): value is '🙏' | '💛' | '🕯️' {
  return value === '🙏' || value === '💛' || value === '🕯️'
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
  if (busy && act !== 'select') return
  if (act === 'send-link') {
    email = (document.querySelector<HTMLInputElement>('#email')?.value ?? '').trim()
    codeAsked = true
    loginMessage = tx().loginHint
    paint()
    if (!email || !supabase) return
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}`,
        data: { locale },
      },
    })
    if (error) loginMessage = tx().loginHint
    paint()
    return
  }
  if (act === 'verify') {
    const token = document.querySelector<HTMLInputElement>('#code')?.value.trim() ?? ''
    if (!supabase || !email || token.length < 6) return
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) {
      loginMessage = tx().badCode
      paint()
      return
    }
    await refresh(true)
    return
  }
  if (act === 'logout') {
    hideCelebration()
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
      if (demo) {
        current.intentions = current.intentions.filter((item) => item.id !== id)
        paint()
        return
      }
      await borrarIntencion(id)
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
      const emoji = node.dataset.emoji ?? ''
      if (!isEmoji(emoji)) return
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
      openIntention = openIntention || intentionId
      await refresh(false)
      return
    }
    if (act === 'locale') {
      const next = node.dataset.locale === 'pt' ? 'pt' : 'es'
      locale = next
      rememberLocale(next)
      if (demo) {
        current.prefs.locale = next
        paint()
        return
      }
      await guardarPreferencias(current.me.id, { ...current.prefs, locale: next })
      current.prefs.locale = next
      paint()
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
