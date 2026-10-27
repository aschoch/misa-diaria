// Vibración al deslizar una fila del calendario en iPhone.
// Desde iOS 26.5 solo vibra un switch que el dedo toca de verdad: el clic por código
// ya no suena. Un switch nativo que está bajo el dedo desde el touchstart sí vibra
// cada vez que su estado visual cambia de lado mientras se arrastra (WebKit,
// CheckboxInputType: SwitchTrigger::PointerTracking) y otra vez al soltar si queda
// en el otro lado. La app mueve ese switch invisible para decidir cuándo suena.
// A cambio, el scroll que empieza en una fila lo hace la app (WebKit no deja hacer
// scroll nativo a un toque que empieza en un switch).

const FLAG = 'misa-vibrar-deslizar'
let cached: boolean | null = null

// Solo en iPhone y iPad con switch nativo (iOS 17.4 o más): en el resto no vibraría.
export function swipeSwitchSupported() {
  try {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    return ios && 'switch' in document.createElement('input')
  } catch {
    return false
  }
}

function flag() {
  try { return localStorage.getItem(FLAG) ?? '' } catch { return '' }
}

// Siempre encendido donde funciona. "force" solo existe para las pruebas en
// navegadores sin switch nativo.
export function swipeSwitchOn() {
  if (cached == null) cached = flag() === 'force' || swipeSwitchSupported()
  return cached
}

// El registro técnico de cada gesto (swipe_debug, tap_debug) solo sale en los
// móviles que encendieron la antigua opción de prueba.
// El registro técnico de los gestos ya no sale en ningún móvil (la antigua opción
// de prueba, 'on', queda apagada). Solo lo enciende 'force', que ponen los tests.
export function swipeDiagnostics() {
  return flag() === 'force'
}

// Posición del switch para que el dedo quede en el lado "apagado" (on = false)
// o "encendido" (on = true). Mide 1000 (igual que en reposo): el umbral de WebKit es
// la mitad (500). Si el punto donde empezó el toque cae más allá del tramo sin pulgar
// (ancho - alto), WebKit exige el primer cruce mucho más lejos y ese toque no suena:
// pasaba al deslizar a la izquierda. Con 1000 de ancho el inicio queda siempre dentro.
const WIDTH = 1000
const OFF_AT = 40
const ON_AT = 560

export function placeSwitch(input: HTMLInputElement, row: HTMLElement, fingerX: number, on: boolean) {
  const box = row.getBoundingClientRect()
  input.style.right = 'auto'
  input.style.width = `${WIDTH}px`
  input.style.left = `${Math.round(fingerX - box.left - (on ? ON_AT : OFF_AT))}px`
  void input.offsetWidth
}

export function resetSwitch(input: HTMLInputElement | null | undefined) {
  if (!input) return
  input.style.removeProperty('left')
  input.style.removeProperty('right')
  input.style.removeProperty('width')
}

// Inercia del scroll hecho a mano: deceleración "normal" de iOS (0.998 por ms).
let frame = 0

export function stopMomentum() {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
}

// Inercia como la de iOS. Solo si el dedo aún se movía al soltar: si se paró
// antes de levantarse, la lista se queda donde está.
export function startMomentum(samples: { t: number; y: number }[], releasedAt: number): number {
  stopMomentum()
  const last = samples[samples.length - 1]
  if (!last || releasedAt - last.t > 60) return 0
  const recent = samples.filter((sample) => last.t - sample.t <= 100)
  const first = recent[0]
  if (!first || recent.length < 2 || last.t === first.t) return 0
  // iOS a veces junta dos movimientos casi en el mismo milisegundo: dividir por un
  // tramo tan corto daba velocidades enormes y la lista pegaba un salto al soltar.
  let velocity = -(last.y - first.y) / Math.max(last.t - first.t, 32)
  if (Math.abs(velocity) < 0.15) return 0
  velocity = Math.max(-5, Math.min(5, velocity))
  let prev = performance.now()
  const step = (now: number) => {
    const dt = Math.min(32, Math.max(1, now - prev))
    prev = now
    window.scrollBy(0, velocity * dt)
    velocity *= Math.pow(0.998, dt)
    const max = document.documentElement.scrollHeight - window.innerHeight
    const stuck = (velocity < 0 && window.scrollY <= 0) || (velocity > 0 && window.scrollY >= max - 1)
    if (Math.abs(velocity) < 0.02 || stuck) {
      frame = 0
      return
    }
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
  return velocity
}
