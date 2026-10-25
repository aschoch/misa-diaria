import { dates, tx, type Locale } from './i18n'

const esMonths = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const ptMonths = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function madridKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function formatTimestamp(lang: Locale, iso: string | undefined) {
  if (!iso) return ''
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const key = madridKey(date)
  const today = madridKey(new Date())
  const [year, month, day] = today.split('-').map(Number)
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
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
