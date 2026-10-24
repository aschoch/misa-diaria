import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Estado } from './types'

const PRODUCTION_URL = 'https://kryarzipdpvceocidgyw.supabase.co'
const PRODUCTION_KEY = 'sb_publishable_C-xlRIF09NLWIi9Sf-7kdA__ZTp6f_z'

const url = import.meta.env.VITE_SUPABASE_URL || PRODUCTION_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || PRODUCTION_KEY

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
  const { data, error } = await supabase!.rpc('estado')
  if (error) throw error
  return data as Estado
}

export async function marcarAsistencia(memberId: string, date: string, on: boolean) {
  if (on) {
    const { error } = await supabase!.from('attendance').insert({ member_id: memberId, mass_date: date })
    if (error) throw error
    return
  }
  const { error } = await supabase!.from('attendance').delete().eq('member_id', memberId).eq('mass_date', date)
  if (error) throw error
}

export async function marcarCompromiso(memberId: string, date: string, on: boolean) {
  if (on) {
    const { error } = await supabase!.from('commitments').insert({ member_id: memberId, mass_date: date })
    if (error) throw error
    return
  }
  const { error } = await supabase!.from('commitments').delete().eq('member_id', memberId).eq('mass_date', date)
  if (error) throw error
}

export async function publicarIntencion(memberId: string, body: string) {
  const { error } = await supabase!.from('intentions').insert({ member_id: memberId, body })
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
  if (error) throw error
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

export async function salir() {
  const { data } = await supabase!.auth.getSession()
  const userId = data.session?.user.id
  if (userId && 'serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await supabase!.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
      await subscription.unsubscribe()
    }
  }
  sessionStorage.removeItem('misa-estado')
  await supabase!.auth.signOut()
}
