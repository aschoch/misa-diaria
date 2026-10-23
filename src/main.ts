import '@fontsource-variable/fraunces/wght.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './styles.css'
import { borrarIntencion, configured, estado, guardarCelebraciones, guardarPreferencias, marcarAsistencia, marcarCompromiso, publicarIntencion, salir, supabase, suscribirPush } from './api'
import { elegir, hideCelebration, showCelebration } from './celebrate'
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

function paint() {
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
  app.innerHTML = renderApp(route, current, selected, locked, offline)
  document.title = 'Misa diaria'
}

async function refresh(celebrate = false) {
  const snapshot = sessionStorage.getItem('misa-estado')
  try {
    current = await estado()
    denied = false
    offline = ''
    locked = false
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
      offline = `Sin conexión. Datos de las ${saved.at}.`
      locked = true
      paint()
      return
    }
    loginMessage = 'No hemos podido abrir el grupo.'
    current = null
    paint()
  }
}

async function celebratePending(state: Estado) {
  if (!state.pending.length) return
  const inserted = await guardarCelebraciones(state.me.id, state.pending.map((item) => item.key))
  const winner = elegir(state.pending, inserted)
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
  if (!node) return
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
  void actOn('publish', form, body)
})

document.querySelector('#celeb')?.addEventListener('click', (event) => {
  const node = (event.target as HTMLElement).closest<HTMLElement>('[data-act="skip"]')
  if (node) hideCelebration()
})

window.addEventListener('popstate', () => paint())
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideCelebration()
})

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
    loginMessage = 'Si tu correo está en la lista, te llegará un mensaje.'
    paint()
    if (!email || !supabase) return
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${location.origin}${import.meta.env.BASE_URL}`,
      },
    })
    if (error) loginMessage = 'Si tu correo está en la lista, te llegará un mensaje.'
    paint()
    return
  }
  if (act === 'verify') {
    const token = document.querySelector<HTMLInputElement>('#code')?.value.trim() ?? ''
    if (!supabase || !email || token.length < 6) return
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) {
      loginMessage = 'Ese código no vale. Pide otro.'
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
      const text = body.trim()
      if (!text) return
      if (demo) {
        current.intentions.unshift({ id: crypto.randomUUID(), body: text, display_name: current.me.display_name, mine: true })
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
    offline = 'No se ha guardado. Prueba otra vez.'
    paint()
  } finally {
    busy = false
  }
}

void boot()
