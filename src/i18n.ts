import type { Pending } from './types'

export type Locale = 'es' | 'pt'

const STORAGE = 'misa-locale'

export function deviceLocale(): Locale {
  const list = typeof navigator === 'undefined' ? [] : navigator.languages
  const lang = (list?.[0] || (typeof navigator === 'undefined' ? 'es' : navigator.language) || 'es').toLowerCase()
  return lang.startsWith('pt') ? 'pt' : 'es'
}

export function savedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE)
    return value === 'es' || value === 'pt' ? value : null
  } catch {
    return null
  }
}

export function rememberLocale(locale: Locale) {
  try { localStorage.setItem(STORAGE, locale) } catch { /* el idioma sigue en la base */ }
}

let current: Locale = 'es'

export function setLocale(locale: Locale) {
  current = locale
}

export function locale(): Locale {
  return current
}

const esDates = {
  cortos: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  largos: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  meses: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
}

const ptDates = {
  cortos: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  largos: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'],
  meses: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
}

export function dates() {
  return current === 'pt' ? ptDates : esDates
}

const copy = {
  es: {
    brand: 'Misa diaria',
    hoy: 'Hoy',
    calendario: 'Calendario',
    muro: 'Muro',
    ajustes: 'Ajustes',
    email: 'Tu correo',
    sendLink: 'Enviar enlace',
    code: 'Código',
    enter: 'Entrar',
    loginHint: 'Si tu correo está en la lista, te llegará un mensaje.',
    rateLimit: 'Acabamos de enviar un código. Escríbelo abajo.',
    sendFail: 'No se ha podido enviar. Prueba otra vez.',
    needEmail: 'Escribe tu correo.',
    badCode: 'Ese código no vale. Pide otro.',
    denied: 'Esta cuenta no está en el grupo.',
    logout: 'Cerrar sesión',
    setup: 'Esta copia todavía no tiene proyecto. Los pasos están en la guía de puesta en marcha.',
    offline: (at: string) => `Sin conexión. Datos de las ${at}.`,
    openFail: 'No hemos podido abrir el grupo.',
    saveFail: 'No se ha guardado. Prueba otra vez.',
    riskEmpty: 'Nadie se ha apuntado.',
    riskCouple: 'Falta un matrimonio.',
    gone: 'Has ido a Misa',
    go: 'He ido a Misa',
    yours: 'La tuya',
    yoursAsk: '¿Has ido tú cada día?',
    couple: 'Tu matrimonio',
    coupleAsk: '¿Ha ido al menos uno de los dos?',
    group: 'El grupo',
    groupAsk: '¿Ha ido alguien?',
    ten: '10 o más',
    tenAsk: '¿Hay al menos diez?',
    totalLabel: 'Misas del grupo',
    streaks: 'Rachas',
    week: (people: number, couples: number, empty: number) => `La semana: ${people} de 12 · ${couples} de 6 matrimonios · ${empty} días en cero.`,
    of12: (n: number) => `${n} de 12`,
    of6: (n: number) => `${n} de 6 matrimonios`,
    sunday: 'Domingo',
    sundayWhy: 'Domingo.',
    riskFlag: 'En riesgo',
    all: 'Todos',
    couples: 'Matrimonios',
    commit: 'Voy a ir',
    uncommit: 'Quitar «voy a ir»',
    nobody: 'Nadie se ha apuntado',
    coveredCouples: 'Los matrimonios están cubiertos.',
    coveredTwelve: 'Están los doce.',
    coveredDay: 'El día está cubierto.',
    faltaNamed: (label: string) => `Falta el ${label}`,
    faltaSome: (labels: string[]) => `Faltan ${labels.map((label) => `el ${label}`).join(', ').replace(/, el ([^,]+)$/, ' y el $1')}`,
    faltaOne: 'Falta un matrimonio',
    intention: 'Una intención',
    intentionHint: 'Una o dos frases.',
    publish: 'Publicar',
    delete: 'Eliminar',
    emptyWall: 'El muro está en blanco.',
    comment: 'Un comentario',
    commentHint: 'Una frase.',
    commentsCount: (n: number) => (n === 1 ? '1 comentario' : `${n} comentarios`),
    commentIn: 'Comentar',
    justNow: 'ahora',
    agoMin: (n: number) => `hace ${n} min`,
    agoHour: (n: number) => `hace ${n} h`,
    agoDay: (n: number) => `hace ${n} d`,
    alerts: 'Avisos',
    alertEmpty: 'Si mañana no hay nadie',
    alertCouple: 'Si mañana tu matrimonio no está cubierto',
    language: 'Idioma',
    spanish: 'Español',
    portuguese: 'Português',
    pray: 'Rezar',
    heart: 'Corazón',
    candle: 'Vela',
  },
  pt: {
    brand: 'Missa diária',
    hoy: 'Hoje',
    calendario: 'Calendário',
    muro: 'Mural',
    ajustes: 'Definições',
    email: 'O teu correio',
    sendLink: 'Enviar ligação',
    code: 'Código',
    enter: 'Entrar',
    loginHint: 'Se o teu correio está na lista, chega-te uma mensagem.',
    rateLimit: 'Acabámos de enviar um código. Escreve-o em baixo.',
    sendFail: 'Não foi possível enviar. Tenta outra vez.',
    needEmail: 'Escreve o teu correio.',
    badCode: 'Esse código não serve. Pede outro.',
    denied: 'Esta conta não está no grupo.',
    logout: 'Fechar sessão',
    setup: 'Esta cópia ainda não tem projeto. Os passos estão no guia de arranque.',
    offline: (at: string) => `Sem ligação. Dados das ${at}.`,
    openFail: 'Não conseguimos abrir o grupo.',
    saveFail: 'Não ficou guardado. Tenta outra vez.',
    riskEmpty: 'Ninguém se apontou.',
    riskCouple: 'Falta um matrimónio.',
    gone: 'Foste à Missa',
    go: 'Fui à Missa',
    yours: 'A tua',
    yoursAsk: 'Foste tu todos os dias?',
    couple: 'O teu matrimónio',
    coupleAsk: 'Foi pelo menos um dos dois?',
    group: 'O grupo',
    groupAsk: 'Foi alguém?',
    ten: '10 ou mais',
    tenAsk: 'Há pelo menos dez?',
    totalLabel: 'Missas do grupo',
    streaks: 'Sequências',
    week: (people: number, couples: number, empty: number) => `A semana: ${people} de 12 · ${couples} de 6 matrimónios · ${empty} dias a zero.`,
    of12: (n: number) => `${n} de 12`,
    of6: (n: number) => `${n} de 6 matrimónios`,
    sunday: 'Domingo',
    sundayWhy: 'Domingo.',
    riskFlag: 'Em risco',
    all: 'Todos',
    couples: 'Matrimónios',
    commit: 'Vou',
    uncommit: 'Tirar o «vou»',
    nobody: 'Ninguém se apontou',
    coveredCouples: 'Os matrimónios estão cobertos.',
    coveredTwelve: 'Estão os doze.',
    coveredDay: 'O dia está coberto.',
    faltaNamed: (label: string) => `Falta o ${label}`,
    faltaSome: (labels: string[]) => `Faltam ${labels.map((label) => `o ${label}`).join(', ').replace(/, o ([^,]+)$/, ' e o $1')}`,
    faltaOne: 'Falta um matrimónio',
    intention: 'Uma intenção',
    intentionHint: 'Uma ou duas frases.',
    publish: 'Publicar',
    delete: 'Apagar',
    emptyWall: 'O mural está em branco.',
    comment: 'Um comentário',
    commentHint: 'Uma frase.',
    commentsCount: (n: number) => (n === 1 ? '1 comentário' : `${n} comentários`),
    commentIn: 'Comentar',
    justNow: 'agora',
    agoMin: (n: number) => `há ${n} min`,
    agoHour: (n: number) => `há ${n} h`,
    agoDay: (n: number) => `há ${n} d`,
    alerts: 'Avisos',
    alertEmpty: 'Se amanhã não há ninguém',
    alertCouple: 'Se amanhã o teu matrimónio não estiver coberto',
    language: 'Idioma',
    spanish: 'Español',
    portuguese: 'Português',
    pray: 'Rezar',
    heart: 'Coração',
    candle: 'Vela',
  },
} as const

export function tx(): (typeof copy)[Locale] {
  return copy[current]
}

export function matrimonio(label: string) {
  if (current === 'pt') return label.replace(/^Matrimonio\b/, 'Matrimónio')
  return label
}

export function celebrationLine(item: Pending) {
  const hito = /^celeb:hito:(tuya|pareja|grupo|diez):(7|30)$/.exec(item.key)
  if (hito) {
    const who = hito[1]
    const days = hito[2]
    const name = current === 'pt'
      ? { tuya: 'Tu', pareja: 'Matrimónio', grupo: 'Grupo', diez: '10 missas' }[who]
      : { tuya: 'Tú', pareja: 'Matrimonio', grupo: 'Grupo', diez: '10 misas' }[who]
    const tail = current === 'pt' ? 'dias seguidos' : 'días seguidos'
    return `${name} · ${days} ${tail}`
  }
  if (item.motif === 'todos') return current === 'pt' ? 'Hoje foram vocês os doze!' : '¡Hoy habéis ido los doce!'
  if (item.motif === 'diez') return current === 'pt' ? '10 missas hoje' : '10 misas hoy'
  if (item.motif === 'parejas') return current === 'pt' ? 'Todos os matrimónios foram hoje!' : '¡Todos los matrimonios han ido hoy!'
  return item.line
}
