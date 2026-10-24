import { dates, tx } from './i18n'

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
