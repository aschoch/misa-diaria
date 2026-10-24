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
    denied: 'Esta cuenta no está en el curso.',
    logout: 'Cerrar sesión',
    setup: 'Esta copia todavía no tiene proyecto. Los pasos están en la guía de puesta en marcha.',
    offline: (at: string) => `Sin conexión. Datos de las ${at}.`,
    openFail: 'No hemos podido abrir el curso.',
    saveFail: 'No se ha guardado. Prueba otra vez.',
    riskEmpty: 'Nadie se ha apuntado.',
    gone: 'Has ido a Misa',
    go: 'He ido a Misa',
    yoursAsk: 'días seguidos que has ido a Misa',
    couple: 'Tu matrimonio',
    coupleAsk: 'días seguidos que alguno de los dos ha ido a Misa',
    group: 'El curso',
    groupAsk: 'días seguidos que ha ido al menos uno del curso',
    six: 'Cada matrimonio',
    sixAsk: 'días seguidos que ha ido alguien de cada matrimonio',
    ten: '10 o más',
    tenAsk: 'días seguidos que han ido al menos 10 del curso',
    totalLabel: 'Misas del curso',
    streaks: 'Rachas',
    recentDays: 'Últimos días',
    week: (people: number, couples: number, empty: number) => `La semana: ${people} de 12 · ${couples} de 6 matrimonios · ${empty} días en cero.`,
    of12: (n: number) => `${n} de 12`,
    of6: (n: number) => `${n} de 6 matrimonios`,
    sunday: 'Domingo',
    riskFlag: 'En riesgo',
    commit: 'Voy a ir',
    uncommit: 'Quitar «voy a ir»',
    nobody: 'Nadie se ha apuntado',
    committed: 'Alguien se ha apuntado',
    badgeCouples: 'Alguien de cada matrimonio',
    badgeTen: '10 misas',
    badgeAll: 'Todos',
    backWall: 'Volver al muro',
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
    language: 'Idioma',
    spanish: 'Español',
    portuguese: 'Português',
    addReaction: 'Añadir reacción',
    reactionSheet: 'Una reacción',
    emojiField: 'Un emoji',
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
    denied: 'Esta conta não está no curso.',
    logout: 'Fechar sessão',
    setup: 'Esta cópia ainda não tem projeto. Os passos estão no guia de arranque.',
    offline: (at: string) => `Sem ligação. Dados das ${at}.`,
    openFail: 'Não conseguimos abrir o curso.',
    saveFail: 'Não ficou guardado. Tenta outra vez.',
    riskEmpty: 'Ninguém se apontou.',
    gone: 'Foste à Missa',
    go: 'Fui à Missa',
    yoursAsk: 'dias seguidos em que foste à Missa',
    couple: 'O teu casal',
    coupleAsk: 'dias seguidos em que algum dos dois foi à Missa',
    group: 'O curso',
    groupAsk: 'dias seguidos em que foi pelo menos um do curso',
    six: 'Cada casal',
    sixAsk: 'dias seguidos em que foi alguém de cada casal',
    ten: '10 ou mais',
    tenAsk: 'dias seguidos em que foram pelo menos 10 do curso',
    totalLabel: 'Missas do curso',
    streaks: 'Sequências',
    recentDays: 'Últimos dias',
    week: (people: number, couples: number, empty: number) => `A semana: ${people} de 12 · ${couples} de 6 casais · ${empty} dias a zero.`,
    of12: (n: number) => `${n} de 12`,
    of6: (n: number) => `${n} de 6 casais`,
    sunday: 'Domingo',
    riskFlag: 'Em risco',
    commit: 'Vou',
    uncommit: 'Tirar o «vou»',
    nobody: 'Ninguém se apontou',
    committed: 'Alguém se apontou',
    badgeCouples: 'Alguém de cada casal',
    badgeTen: '10 missas',
    badgeAll: 'Todos',
    backWall: 'Voltar ao mural',
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
    language: 'Idioma',
    spanish: 'Español',
    portuguese: 'Português',
    addReaction: 'Adicionar reação',
    reactionSheet: 'Uma reação',
    emojiField: 'Um emoji',
  },
} as const

export function tx(): (typeof copy)[Locale] {
  return copy[current]
}

export function celebrationLine(item: Pending) {
  const hito = /^celeb:hito:(tuya|pareja|grupo|seis|diez):(7|30)$/.exec(item.key)
  if (hito) {
    const who = hito[1] as 'tuya' | 'pareja' | 'grupo' | 'seis' | 'diez'
    const days = hito[2]
    const name = current === 'pt'
      ? { tuya: 'Tu', pareja: 'O teu casal', grupo: 'O curso', seis: 'Cada casal', diez: '10 missas' }[who]
      : { tuya: 'Tú', pareja: 'Tu matrimonio', grupo: 'El curso', seis: 'Cada matrimonio', diez: '10 misas' }[who]
    const tail = current === 'pt' ? 'dias seguidos' : 'días seguidos'
    return `${name} · ${days} ${tail}`
  }
  if (item.motif === 'todos') return current === 'pt' ? 'Hoje foram vocês os doze!' : '¡Hoy habéis ido los doce!'
  if (item.motif === 'diez') return current === 'pt' ? '10 missas hoje' : '10 misas hoy'
  if (item.motif === 'parejas') return current === 'pt' ? 'Os 6 casais' : 'Los 6 matrimonios'
  return item.line
}
