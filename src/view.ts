import type { Day, Estado, Intention } from './types'
import { esc, fecha, hace } from './format'
import { matrimonio, tx, type Locale } from './i18n'

export type Route = 'hoy' | 'calendario' | 'muro' | 'ajustes'

const titles = {
  hoy: 'hoy',
  calendario: 'calendario',
  muro: 'muro',
  ajustes: 'ajustes',
} as const

export function routeFromPath(pathname: string): Route {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname
  if (path.startsWith('/calendario')) return 'calendario'
  if (path.startsWith('/muro')) return 'muro'
  if (path.startsWith('/ajustes')) return 'ajustes'
  return 'hoy'
}

export function href(route: Route) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}/${route === 'hoy' ? '' : route}`.replace(/\/$/, '') || `${base}/`
}

function shell(route: Route, body: string, offline = '') {
  const copy = tx()
  return `
    <header class="top">
      <div class="arch" aria-hidden="true"></div>
      <p class="mark">${copy.brand}</p>
      <h1>${copy[titles[route]]}</h1>
    </header>
    ${offline}
    <main>${body}</main>
    ${nav(route)}
  `
}

function nav(route: Route) {
  const copy = tx()
  const item = (key: Route, label: string, icon: string) => `
    <a href="${href(key)}" class="${route === key ? 'on' : ''}" ${route === key ? 'aria-current="page"' : ''}>
      ${icon}<span>${label}</span>
    </a>`
  return `<nav>${item('hoy', copy.hoy, door)}${item('calendario', copy.calendario, cal)}${item('muro', copy.muro, note)}${item('ajustes', copy.ajustes, gear)}</nav>`
}

const sun = '<svg class="sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M13 3l-1.4 1.4M4.4 11.6 3 13"/></svg>'
const door = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V9a6 6 0 0 1 12 0v11"/><circle cx="12" cy="14" r="1.2"/></svg>'
const cal = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>'
const note = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4"/></svg>'
const gear = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/></svg>'

function riskLine(risk: Estado['risk']) {
  const copy = tx()
  if (risk === 'empty') return `<p class="risk" data-testid="risk">${copy.riskEmpty}</p>`
  if (risk === 'couple') return `<p class="risk" data-testid="risk">${copy.riskCouple}</p>`
  return ''
}

function streaks(state: Estado) {
  const copy = tx()
  const rows = [
    ['individual', copy.yours, copy.yoursAsk, state.streaks.individual],
    ['couple', copy.couple, copy.coupleAsk, state.streaks.couple],
    ['group', copy.group, copy.groupAsk, state.streaks.group],
    ['ten', copy.ten, copy.tenAsk, state.streaks.ten],
  ] as const
  return `<h2 class="streak-title">${copy.streaks}</h2><ol class="streaks">${rows.map(([key, title, ask, value]) => `
    <li data-testid="streak-${key}">
      <span><strong>${title}</strong><small>${ask}</small></span>
      <b>${value}</b>
    </li>`).join('')}</ol>`
}

function monday(state: Estado) {
  if (!state.monday) return ''
  const line = tx().week(state.monday.people, state.monday.couples, state.monday.empty_days)
  return `<p class="monday" data-testid="monday">${esc(line)}</p>`
}

export function renderHoy(state: Estado, locked: boolean) {
  const copy = tx()
  const today = state.calendar[0]
  const gone = today?.mine_attendance
  const past = state.past.map((day) => {
    const f = fecha(day.date)
    return `<li class="${day.sunday ? 'sunday' : ''}">
      <span>${f.corto} ${f.d}</span>
      <button type="button" class="check ${day.mine_attendance ? 'on' : ''}" data-act="attend" data-date="${day.date}" aria-pressed="${day.mine_attendance}" aria-label="${f.largo} ${f.d}" ${locked ? 'disabled' : ''}></button>
    </li>`
  }).join('')
  return `
    ${riskLine(state.risk)}
    <button type="button" class="go ${gone ? 'on' : ''}" data-testid="go" data-act="attend" data-date="${state.today}" aria-pressed="${gone ? 'true' : 'false'}" ${locked ? 'disabled' : ''}>
      ${gone ? copy.gone : copy.go}
    </button>
    <p class="group-total" data-testid="total"><b>${state.streaks.total}</b><span>${copy.totalLabel}</span></p>
    ${streaks(state)}
    ${monday(state)}
    <ul class="past" data-testid="past">${past}</ul>
  `
}

function atRisk(day: Day) {
  if (day.sunday || day.couples >= 6) return false
  if (day.covered === 0) return true
  return day.at_risk || (day.gaps?.length ?? 0) > 0
}

function falta(gaps: string[]) {
  const copy = tx()
  const labels = gaps.map((gap) => matrimonio(gap))
  if (labels.length === 0) return copy.faltaOne
  if (labels.length === 1) return copy.faltaNamed(labels[0])
  return copy.faltaSome(labels)
}

function dayWhy(day: Day) {
  const copy = tx()
  if (day.sunday) return copy.sundayWhy
  if (!atRisk(day)) {
    if (day.covered === 12) return copy.coveredTwelve
    if (day.couples === 6) return copy.coveredCouples
    return copy.coveredDay
  }
  if (day.covered === 0) return copy.nobody
  return falta(day.gaps ?? [])
}

function dayClass(day: Day) {
  if (day.sunday) return 'sunday'
  if (atRisk(day)) return 'risk'
  if (day.covered === 12) return 'all'
  if (day.couples === 6) return 'pairs'
  return ''
}

function counts(day: Day) {
  const copy = tx()
  return `<span class="count"><em>${copy.of12(day.covered)}</em><small>${copy.of6(day.couples)}</small></span>`
}

function dayMeta(day: Day, open: boolean) {
  const copy = tx()
  const why = open && !day.sunday
    ? `<span class="why" data-testid="risk-why">${esc(dayWhy(day))}</span>`
    : ''
  if (day.sunday) return `<em>${copy.sunday}</em>${counts(day)}`
  if (atRisk(day)) {
    return `${counts(day)}${open ? why : `<em class="flag">${copy.riskFlag}</em>`}`
  }
  if (day.covered === 12) return `<em class="all"><i class="disk" aria-hidden="true"></i>${copy.all}</em>${counts(day)}${why}`
  if (day.couples === 6) {
    return `<em class="pairs"><span class="dots" aria-hidden="true"><i></i><i></i></span>${day.couples} de 6</em><small>${copy.couples}</small>${counts(day)}${why}`
  }
  return `${counts(day)}${why}`
}

export function renderCalendario(state: Estado, selected: string, locked: boolean) {
  const copy = tx()
  const rows = state.calendar.map((day) => {
    const f = fecha(day.date)
    const mine = day.mine_attendance ? 'gone' : day.mine_commitment ? 'planned' : ''
    const open = day.date === selected
    const commit = open
      ? `<button type="button" class="row-commit" data-act="commit" data-date="${day.date}" ${locked ? 'disabled' : ''}>${day.mine_commitment ? copy.uncommit : copy.commit}</button>`
      : ''
    return `<li class="${dayClass(day)} ${open ? 'selected' : ''}">
      <button type="button" data-act="select" data-date="${day.date}" ${open ? 'aria-current="true"' : ''} ${locked ? 'disabled' : ''}>
        <span class="num ${mine}">${f.d}</span>
        <span class="when">${day.sunday ? sun : ''}${f.corto}${f.d === 1 ? ` ${f.mes}` : ''}</span>
        <span class="meta">${dayMeta(day, open)}</span>
      </button>
      ${commit}
    </li>`
  }).join('')
  const day = state.calendar.find((item) => item.date === selected) ?? state.calendar[0]
  const f = fecha(day.date)
  const heading = `${f.largo.charAt(0).toUpperCase()}${f.largo.slice(1)}, ${f.d} de ${f.mes}`
  const why = dayWhy(day)
  const tone = day.sunday ? 'sunday' : atRisk(day) ? 'risk' : ''
  const side = `
    <aside class="day" data-testid="day">
      <h2>${heading}</h2>
      <p class="count">${copy.of12(day.covered)} · ${copy.of6(day.couples)}</p>
      <p class="why ${tone}">${esc(why)}</p>
      <button type="button" class="texty" data-act="commit" data-date="${day.date}" ${locked ? 'disabled' : ''}>
        ${day.mine_commitment ? copy.uncommit : copy.commit}
      </button>
    </aside>`
  return `<div class="split"><ol class="days" data-testid="calendar">${rows}</ol>${side}</div>`
}

const emojis = ['🙏', '💛', '🕯️'] as const

function reactionName(emoji: typeof emojis[number]) {
  const copy = tx()
  if (emoji === '🙏') return copy.pray
  if (emoji === '💛') return copy.heart
  return copy.candle
}

function thread(item: Intention, open: boolean, locked: boolean) {
  const copy = tx()
  const counts = emojis.map((emoji) => {
    const rows = item.reactions.filter((reaction) => reaction.emoji === emoji)
    const mine = rows.some((reaction) => reaction.mine)
    return `<button type="button" class="react ${mine ? 'on' : ''}" data-act="react" data-id="${item.id}" data-emoji="${emoji}" aria-pressed="${mine}" aria-label="${reactionName(emoji)}, ${rows.length}" ${locked ? 'disabled' : ''}><span aria-hidden="true">${emoji}</span><b>${rows.length}</b></button>`
  }).join('')
  const comments = item.comments.map((comment) => `
    <li>
      <div class="comment-line">
        <strong>${esc(comment.display_name)}</strong>
        <span class="ago">${esc(hace(comment.created_at))}</span>
        ${comment.mine ? `<button type="button" class="text-link" data-act="delete-comment" data-id="${comment.id}">${copy.delete}</button>` : ''}
      </div>
      <p>${esc(comment.body)}</p>
    </li>`).join('')
  const foot = open ? '' : `
    <p class="thread-foot">
      <button type="button" class="text-link" data-act="thread" data-id="${item.id}">${copy.commentsCount(item.comments.length)}</button>
      <button type="button" class="text-link" data-act="thread" data-id="${item.id}">${copy.commentIn}</button>
    </p>`
  return `
    <article class="${open ? 'open' : ''}" ${open ? 'data-testid="thread"' : ''}>
      <header>
        <button type="button" class="thread" data-act="thread" data-id="${item.id}" aria-expanded="${open}"><strong>${esc(item.display_name)}</strong></button>
        ${item.mine ? `<button type="button" class="text-link" data-act="delete" data-id="${item.id}">${copy.delete}</button>` : ''}
      </header>
      <p>${esc(item.body)}</p>
      <div class="reacts">${counts}</div>
      ${foot}
      ${open ? `
        <ol class="comments">${comments}</ol>
        <form class="reply" data-act="comment" data-id="${item.id}">
          <label for="comment-${item.id}">${copy.comment}</label>
          <textarea id="comment-${item.id}" name="body" maxlength="200" rows="2" placeholder="${copy.commentHint}" ${locked ? 'disabled' : ''}></textarea>
          <button type="submit" ${locked ? 'disabled' : ''}>${copy.publish}</button>
        </form>` : ''}
    </article>`
}

export function renderMuro(state: Estado, locked: boolean, openId: string) {
  const copy = tx()
  const notes = state.intentions.map((item) => thread(item, item.id === openId, locked)).join('')
  return `
    <form class="composer" data-testid="muro" data-act="publish">
      <label for="intention">${copy.intention}</label>
      <textarea id="intention" name="body" maxlength="280" rows="3" placeholder="${copy.intentionHint}" ${locked ? 'disabled' : ''}></textarea>
      <button type="submit" ${locked ? 'disabled' : ''}>${copy.publish}</button>
    </form>
    <div class="notes">${notes || `<p class="empty">${copy.emptyWall}</p>`}</div>
  `
}

export function renderAjustes(state: Estado, locale: Locale) {
  const copy = tx()
  const sw = (key: 'empty_day' | 'couple', label: string) => `
    <button type="button" class="switch" role="switch" aria-checked="${state.prefs[key]}" data-act="pref" data-key="${key}">
      <span>${label}</span><i></i>
    </button>`
  const lang = (value: Locale, label: string) => `
    <button type="button" data-act="locale" data-locale="${value}" aria-pressed="${locale === value}">${label}</button>`
  return `
    <section class="settings" data-testid="ajustes">
      <h2>${copy.alerts}</h2>
      <div class="switches">
        ${sw('empty_day', copy.alertEmpty)}
        ${sw('couple', copy.alertCouple)}
      </div>
      <h2>${copy.language}</h2>
      <div class="lang">
        ${lang('es', copy.spanish)}
        ${lang('pt', copy.portuguese)}
      </div>
      <button type="button" class="quiet" data-act="logout">${copy.logout}</button>
    </section>`
}

export function renderApp(route: Route, state: Estado, selected: string, locked: boolean, offline: string, openId: string, locale: Locale) {
  const body = route === 'calendario'
    ? renderCalendario(state, selected, locked)
    : route === 'muro'
      ? renderMuro(state, locked, openId)
      : route === 'ajustes'
        ? renderAjustes(state, locale)
        : renderHoy(state, locked)
  const banner = offline ? `<p class="offline">${esc(offline)}</p>` : ''
  return shell(route, body, banner)
}

export function renderLogin(message: string, codeAsked: boolean) {
  const copy = tx()
  return `
    <header class="top">
      <div class="arch" aria-hidden="true"></div>
      <h1>${copy.brand}</h1>
    </header>
    <main class="login" data-testid="login">
      <label for="email">${copy.email}</label>
      <input id="email" name="email" type="email" autocomplete="username" inputmode="email" />
      <button type="button" data-act="send-link">${copy.sendLink}</button>
      <p class="hint">${esc(message)}</p>
      ${codeAsked ? `
        <label for="code">${copy.code}</label>
        <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" />
        <button type="button" data-act="verify">${copy.enter}</button>
      ` : ''}
    </main>`
}

export function renderSetup() {
  const copy = tx()
  return `
    <header class="top"><div class="arch" aria-hidden="true"></div><h1>${copy.brand}</h1></header>
    <main class="login"><p>${copy.setup}</p></main>`
}

export function renderDenied() {
  const copy = tx()
  return `
    <header class="top"><div class="arch" aria-hidden="true"></div><h1>${copy.brand}</h1></header>
    <main class="login" data-testid="denied"><p>${copy.denied}</p>
      <button type="button" data-act="logout">${copy.logout}</button></main>`
}
