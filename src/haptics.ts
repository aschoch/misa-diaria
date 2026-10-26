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
// o "encendido" (on = true). Ancho 440: el umbral de WebKit es la mitad (220).
// En reposo mide 1000 (CSS): así el punto donde empieza el toque nunca pasa del
// tramo sin pulgar y WebKit usa siempre la mitad como umbral, también en el primer cruce.
const WIDTH = 440
const OFF_AT = 40
const ON_AT = 400

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

export function startMomentum(samples: { t: number; y: number }[]) {
  stopMomentum()
  const last = samples[samples.length - 1]
  if (!last) return
  const recent = samples.filter((sample) => last.t - sample.t <= 100)
  const first = recent[0]
  if (!first || recent.length < 2 || last.t === first.t) return
  let velocity = -(last.y - first.y) / (last.t - first.t)
  if (Math.abs(velocity) < 0.15) return
  velocity = Math.max(-6, Math.min(6, velocity))
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
