import { dates, tx, type Locale } from './i18n'

const esMonths = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const ptMonths = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// La zona del teléfono: medio curso vive en Portugal.
export function phoneZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid'
  } catch {
    return 'Europe/Madrid'
  }
}

// Minutos que la zona va por delante de UTC ahora mismo.
function zoneOffset(zone: string, now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now).map((part) => [part.type, part.value]))
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
  return (wall - Math.floor(now.getTime() / 60000) * 60000) / 60000
}

// El aviso sale a las 20:05 de Madrid: en Portugal llega a las 19:05.
export function eveningTime(now = new Date()) {
  const minutes = (((20 * 60 + 5 + zoneOffset(phoneZone(), now) - zoneOffset('Europe/Madrid', now)) % 1440) + 1440) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function phoneDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: phoneZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function formatTimestamp(lang: Locale, iso: string | undefined) {
  if (!iso) return ''
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const key = phoneDay(date)
  const today = phoneDay()
  const [year, month, day] = today.split('-').map(Number)
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: phoneZone(),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  if (key === today) return lang === 'pt' ? `Hoje · ${time}` : `Hoy · ${time}`
  if (key === yesterday) return lang === 'pt' ? `Ontem · ${time}` : `Ayer · ${time}`
  const monthName = (lang === 'pt' ? ptMonths : esMonths)[Number(key.slice(5, 7)) - 1] ?? ''
  return `${Number(key.slice(8, 10))} ${monthName.slice(0, 3)} · ${time}`
}

export function fecha(iso: string) {
  const pack = dates()
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return { y, m, d, dow, corto: pack.cortos[dow], largo: pack.largos[dow], mes: pack.meses[m - 1] }
}

export function fullDate(iso: string) {
  const f = fecha(iso)
  const weekday = `${f.largo.charAt(0).toLocaleUpperCase()}${f.largo.slice(1)}`
  return `${weekday}, ${f.d} de ${f.mes} de ${f.y}`
}

export function hace(iso: string | undefined) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60000)
  const copy = tx()
  if (mins < 1) return copy.justNow
  if (mins < 60) return copy.agoMin(mins)
  const hours = Math.floor(mins / 60)
  if (hours < 24) return copy.agoHour(hours)
  return copy.agoDay(Math.floor(hours / 24))
}

export function esc(value: string) {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
  ))
}
