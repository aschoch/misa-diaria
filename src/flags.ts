// Pruebas que cada uno enciende en Ajustes. Se guardan solo en este móvil.

const UNIFIED = 'misa-calendario-unico'
let unified: boolean | null = null

// Calendario con los días pasados: arriba lo que ya pasó (¿fuiste?), abajo lo que viene.
export function unifiedCalendar() {
  if (unified == null) {
    try { unified = localStorage.getItem(UNIFIED) === 'on' } catch { unified = false }
  }
  return unified
}

export function setUnifiedCalendar(on: boolean) {
  try {
    if (on) localStorage.setItem(UNIFIED, 'on')
    else localStorage.removeItem(UNIFIED)
  } catch { /* sin almacenamiento: dura hasta cerrar la app */ }
  unified = on
}
