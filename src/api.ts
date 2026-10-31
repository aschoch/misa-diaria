import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Estado } from './types'
import { phoneZone } from './format'

const PRODUCTION_URL = 'https://kryarzipdpvceocidgyw.supabase.co'
const PRODUCTION_KEY = 'sb_publishable_C-xlRIF09NLWIi9Sf-7kdA__ZTp6f_z'

// En pruebas nunca se cae a producción por olvidar una variable.
const e2e = import.meta.env.VITE_E2E === 'true'
const url = import.meta.env.VITE_SUPABASE_URL || (e2e ? '' : PRODUCTION_URL)
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || (e2e ? '' : PRODUCTION_KEY)

export const configured = Boolean(url && key)

export const supabase: SupabaseClient | null = configured
  ? createClient(url, key, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: import.meta.env.VITE_E2E !== 'true',
        storage: localStorage,
      },
    })
  : null

export async function estado(): Promise<Estado> {
  // «Hoy» es el día donde está el teléfono (Madrid o Lisboa).
  let { data, error } = await supabase!.rpc('estado', { p_tz: phoneZone() })
  // Una base aún sin estado(p_tz): el de siempre, con el día de Madrid.
  if (error?.code === 'PGRST202') ({ data, error } = await supabase!.rpc('estado'))
  if (error) throw error
  return data as Estado
}

// Ya estaba (otro dispositivo, otro toque): para quien toca, eso es éxito.
function duplicate(error: { code?: string } | null) {
  return error?.code === '23505'
}

export async function marcarAsistencia(memberId: string, date: string, on: boolean) {
  if (on) {
    const { error } = await supabase!.from('attendance').insert({ member_id: memberId, mass_date: date })
    if (error && !duplicate(error)) throw error
    return
  }
  const { error } = await supabase!.from('attendance').delete().eq('member_id', memberId).eq('mass_date', date)
  if (error) throw error
}

export async function marcarCompromiso(memberId: string, date: string, on: boolean) {
  if (on) {
    const { error } = await supabase!.from('commitments').insert({ member_id: memberId, mass_date: date })
    if (error && !duplicate(error)) throw error
    return
  }
  const { error } = await supabase!.from('commitments').delete().eq('member_id', memberId).eq('mass_date', date)
  if (error) throw error
}

export async function publicarIntencion(memberId: string, body: string) {
  const { error } = await supabase!.from('intentions').insert({ member_id: memberId, body })
  if (error) throw error
}

export async function editarIntencion(id: string, body: string) {
  const { error } = await supabase!.from('intentions').update({ body }).eq('id', id)
  if (error) throw error
}

export async function editarComentario(id: string, body: string) {
  const { error } = await supabase!.from('intention_comments').update({ body }).eq('id', id)
  if (error) throw error
}

export async function enviarFeedback(memberId: string, body: string) {
  const { error } = await supabase!.from('feedback').insert({ member_id: memberId, body })
  if (error) throw error
}

export async function borrarIntencion(id: string) {
  const { error } = await supabase!.from('intentions').delete().eq('id', id)
  if (error) throw error
}

export async function publicarComentario(memberId: string, intentionId: string, body: string) {
  const { error } = await supabase!.from('intention_comments').insert({
    member_id: memberId,
    intention_id: intentionId,
    body,
  })
  if (error) throw error
}

export async function borrarComentario(id: string) {
  const { error } = await supabase!.from('intention_comments').delete().eq('id', id)
  if (error) throw error
}

export async function ponerReaccion(memberId: string, intentionId: string, emoji: string) {
  const { error } = await supabase!.from('intention_reactions').insert({
    member_id: memberId,
    intention_id: intentionId,
    emoji,
  })
  if (error && !duplicate(error)) throw error
}

export async function quitarReaccion(memberId: string, intentionId: string, emoji: string) {
  const { error } = await supabase!.from('intention_reactions').delete()
    .eq('member_id', memberId)
    .eq('intention_id', intentionId)
    .eq('emoji', emoji)
  if (error) throw error
}

export async function guardarPreferencias(memberId: string, prefs: { empty_day: boolean; couple: boolean; locale: 'es' | 'pt' | null }) {
  const { error } = await supabase!.from('notification_prefs').upsert({
    member_id: memberId,
    empty_day: prefs.empty_day,
    couple: prefs.couple,
    locale: prefs.locale,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function guardarCelebraciones(memberId: string, keys: string[]) {
  if (!keys.length) return []
  const rows = keys.map((event_key) => ({ member_id: memberId, event_key }))
  const { data, error } = await supabase!.from('celebrations').upsert(rows, {
    onConflict: 'member_id,event_key',
    ignoreDuplicates: true,
  }).select('event_key')
  if (error) throw error
  return (data ?? []).map((row) => row.event_key as string)
}

function clavePush(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export async function suscribirPush(memberId: string) {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!key || !('serviceWorker' in navigator) || !('PushManager' in window) || !supabase) return
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: clavePush(key),
  })
  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!p256dh || !auth) return
  const { error } = await supabase.from('push_subscriptions').upsert({
    member_id: memberId,
    endpoint: subscription.endpoint,
    p256dh,
    auth_secret: auth,
  }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function guardarNombre(memberId: string, displayName: string) {
  const { error } = await supabase!.from('members').update({ display_name: displayName.trim() }).eq('id', memberId)
  if (error) throw error
}

export async function updatePassword(password: string) {
  const { data, error } = await supabase!.auth.updateUser({ password })
  if (error) throw error
  return data
}

function usagePlatform(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent || ''
  const apple = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (apple) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

function standaloneApp() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone)
}

const DEV_FLAG = 'misa-dev'
const LOGIN_QUEUE = 'misa-login-pendiente'
const LOGIN_EVENTS = new Set([
  'login_code_requested',
  'login_code_submitted',
  'login_verify_ok',
  'login_verify_error',
])

let accessToken = ''
const errorSeen = new Map<string, number>()
let errorBudget = 12

export function recordarToken(token: string) {
  accessToken = token
}

export function enPantallaInicio() {
  return standaloneApp()
}

function devSession() {
  try {
    const host = location.hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true
    return localStorage.getItem(DEV_FLAG) === '1'
  } catch {
    return false
  }
}

// Solo booleanos, números y fichas cortas. Un correo o una frase no entran.
function cleanProps(input: Record<string, unknown>) {
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!/^[a-z_]{1,24}$/.test(key) || key === 'dev') continue
    if (typeof value === 'boolean') props[key] = value
    else if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1_000_000) props[key] = Math.round(value)
    else if (typeof value === 'string') {
      const text = value.trim()
      if (!text || text.length > 64 || /@|\s/.test(text)) continue
      props[key] = text
    }
  }
  if (devSession()) props.dev = true
  return props
}

function usageRow(memberId: string, eventName: string, route: string, props: Record<string, unknown>) {
  return {
    member_id: memberId,
    event_name: eventName.slice(0, 80),
    route: route.slice(0, 40),
    platform: usagePlatform(),
    standalone: standaloneApp(),
    props: cleanProps(props),
  }
}

function readStoredToken() {
  if (accessToken) return accessToken
  try {
    for (const [name, value] of Object.entries(localStorage)) {
      if (!name.startsWith('sb-') || !name.endsWith('-auth-token')) continue
      const parsed = JSON.parse(value) as { access_token?: string }
      if (parsed.access_token) return parsed.access_token
    }
  } catch { /* sin sesión guardada */ }
  return ''
}

export function registrarEvento(memberId: string, eventName: string, route: string, props: Record<string, unknown> = {}) {
  if (!supabase || !memberId || !eventName) return
  void supabase.from('usage_events').insert(usageRow(memberId, eventName, route, props)).then(() => undefined, () => undefined)
}

// Al ocultar la página el insert normal puede no salir. keepalive sí manda la
// cabecera de sesión; sendBeacon no puede.
export function registrarAlOcultar(memberId: string, eventName: string, route: string, props: Record<string, unknown> = {}) {
  if (!memberId || !eventName || !url || !key) return
  const token = readStoredToken()
  if (!token) return
  try {
    void fetch(`${url}/rest/v1/usage_events`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(usageRow(memberId, eventName, route, props)),
    }).then(() => undefined, () => undefined)
  } catch { /* el cierre no puede esperar */ }
}

// El insert exige sesión. Lo pedido antes de entrar se guarda aquí y se vacía
// al tener usuario. Si nadie entra, no sale del teléfono.
export function anotarAntesDeEntrar(eventName: string, props: Record<string, unknown> = {}) {
  if (!LOGIN_EVENTS.has(eventName)) return
  try {
    const raw = localStorage.getItem(LOGIN_QUEUE)
    const parsed = raw ? JSON.parse(raw) as unknown : []
    const next = Array.isArray(parsed) ? parsed.slice(-11) : []
    next.push({ name: eventName, props: cleanProps(props), at: new Date().toISOString() })
    localStorage.setItem(LOGIN_QUEUE, JSON.stringify(next))
  } catch { /* sin espacio: este paso del embudo no se guarda */ }
}

export function vaciarAntesDeEntrar(memberId: string, route: string) {
  if (!memberId) return
  let list: { name?: string; props?: Record<string, unknown>; at?: string }[] = []
  try {
    const raw = localStorage.getItem(LOGIN_QUEUE)
    if (!raw) return
    localStorage.removeItem(LOGIN_QUEUE)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return
    list = parsed
  } catch {
    try { localStorage.removeItem(LOGIN_QUEUE) } catch { /* nada que vaciar */ }
    return
  }
  for (const item of list) {
    if (!item || typeof item.name !== 'string' || !LOGIN_EVENTS.has(item.name)) continue
    const props = item.props && typeof item.props === 'object' ? { ...item.props } : {}
    if (typeof item.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(item.at)) props.at = item.at
    registrarEvento(memberId, item.name, route, props)
  }
}

export function registrarFallo(memberId: string, where: string, kind: 'save' | 'network' | 'uncaught', route: string) {
  if (!memberId || errorBudget <= 0 || !/^[a-z-]{1,24}$/.test(where)) return
  const bucket = `${kind}:${where}`
  const now = Date.now()
  if (now - (errorSeen.get(bucket) ?? 0) < 30_000) return
  errorSeen.set(bucket, now)
  errorBudget -= 1
  registrarEvento(memberId, 'client_error', route, { kind, where })
}

export async function salir() {
  try {
    const { data } = await supabase!.auth.getSession()
    const userId = data.session?.user.id
    if (userId && 'serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager?.getSubscription()
      if (subscription) {
        await supabase!.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
        await subscription.unsubscribe()
      }
    }
  } catch { /* sin conexión: el aviso de este teléfono se limpiará cuando falle el envío */ }
  try { localStorage.removeItem('misa-estado') } catch { /* nada guardado */ }
  try { sessionStorage.removeItem('misa-estado') } catch { /* nada guardado */ }
  const { error } = await supabase!.auth.signOut()
  if (error) await supabase!.auth.signOut({ scope: 'local' })
}
