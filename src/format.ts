import { dates } from './i18n'

export function fecha(iso: string) {
  const pack = dates()
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return { y, m, d, dow, corto: pack.cortos[dow], largo: pack.largos[dow], mes: pack.meses[m - 1] }
}

export function esc(value: string) {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
  ))
}
