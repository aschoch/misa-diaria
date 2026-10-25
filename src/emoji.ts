import rows from './emojis.json'

type EmojiRow = { e: string; g: number; o: number; q: string }

const data = rows as EmojiRow[]

const church = /\b(iglesia|church|chapel|capilla|capela|igreja|rezar|pray|prayer|oracion|orar|oracao|adoracion|worship)\b/

export function fold(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function emojiChoices(query: string) {
  const words = fold(query).trim().split(/\s+/).filter(Boolean)
  if (!words.length) {
    const first: string[] = []
    const rest: string[] = []
    for (const row of data) (church.test(row.q) ? first : rest).push(row.e)
    return first.concat(rest)
  }
  return data.filter((row) => words.every((word) => row.q.includes(word))).map((row) => row.e)
}
