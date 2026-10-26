type EmojiRow = { e: string; g: number; o: number; q: string }

// La tabla completa pesa ~370 kB: se carga aparte para que la app abra sin esperarla.
let data: EmojiRow[] = []
let loading: Promise<void> | null = null
const starter = ['🙏', '💛', '🕯️', '✝️', '⛪', '❤️', '🤍', '🌹', '🌿', '✨', '😊', '🥹', '💪', '👏', '🫶', '😢']

export function loadEmojis() {
  loading ??= import('./emojis.json').then((module) => {
    data = (module.default ?? module) as unknown as EmojiRow[]
  }).catch(() => {
    loading = null
  })
  return loading
}

const church = /\b(iglesia|church|chapel|capilla|capela|igreja|rezar|pray|prayer|oracion|orar|oracao|adoracion|worship)\b/

export function fold(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function emojiChoices(query: string) {
  const words = fold(query).trim().split(/\s+/).filter(Boolean)
  if (!data.length) return words.length ? [] : starter
  if (!words.length) {
    const first: string[] = []
    const rest: string[] = []
    for (const row of data) (church.test(row.q) ? first : rest).push(row.e)
    return first.concat(rest)
  }
  return data.filter((row) => words.every((word) => row.q.includes(word))).map((row) => row.e)
}
