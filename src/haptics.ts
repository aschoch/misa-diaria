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

export function swipeSwitchSupported() {
  try {
    const native = 'switch' in document.createElement('input') || /iP(hone|ad|od)/.test(navigator.userAgent)
    return native && window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

export function swipeSwitchOn() {
  if (cached != null) return cached
  let value = ''
  try { value = localStorage.getItem(FLAG) ?? '' } catch { /* sin almacenamiento: apagado */ }
  // "force" solo existe para las pruebas en navegadores sin switch nativo.
  cached = value === 'force' || (value === 'on' && swipeSwitchSupported())
  return cached
}

export function setSwipeSwitch(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, 'on')
    else localStorage.removeItem(FLAG)
  } catch { /* se queda como estaba */ }
  cached = null
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

// La inercia solo sigue a un gesto rápido que aún se movía al soltar: si el dedo
// se paró antes de levantarse, la lista se queda donde está.
export function startMomentum(samples: { t: number; y: number }[], releasedAt: number) {
  stopMomentum()
  const last = samples[samples.length - 1]
  if (!last || releasedAt - last.t > 40) return
  const recent = samples.filter((sample) => releasedAt - sample.t <= 80)
  const first = recent[0]
  if (!first || recent.length < 3 || last.t - first.t < 16) return
  let velocity = -(last.y - first.y) / (releasedAt - first.t)
  if (Math.abs(velocity) < 0.35) return
  velocity = Math.max(-4, Math.min(4, velocity))
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
}
