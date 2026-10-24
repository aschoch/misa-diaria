import type { Day, Estado, Intention, PastDay, Reaction } from './types'
import { esc, fecha, hace } from './format'
import { tx, type Locale } from './i18n'

export type Route = 'hoy' | 'calendario' | 'muro' | 'ajustes'

const titles = {
  hoy: 'hoy',
  calendario: 'calendario',
  muro: 'muro',
  ajustes: 'ajustes',
} as const

const curated = ['🙏', '💛', '🕯️', '✨', '🤍', '🌿', '🕊️', '☀️', '🌙', '🍞', '🍷', '🌸', '⭐', '💚', '🤲', '🌾']

function basePath() {
  return import.meta.env.BASE_URL.replace(/\/$/, '')
}

function bare(pathname: string) {
  const base = basePath()
  return pathname.startsWith(base) ? pathname.slice(base.length) : pathname
}

export function routeFromPath(pathname: string): Route {
  const path = bare(pathname)
  if (path.startsWith('/calendario')) return 'calendario'
  if (path.startsWith('/muro')) return 'muro'
  if (path.startsWith('/ajustes')) return 'ajustes'
  return 'hoy'
}

export function intentionFromPath(pathname: string) {
  const match = /^\/muro\/([0-9a-f-]{36})$/i.exec(bare(pathname))
  return match?.[1] ?? ''
}

export function href(route: Route) {
  const base = basePath()
  return `${base}/${route === 'hoy' ? '' : route}`.replace(/\/$/, '') || `${base}/`
}

export function hrefIntention(id: string) {
  return `${basePath()}/muro/${id}`
}

// La marca del encabezado y de Hoy. Se sustituye entera; public/icono.svg es el mismo emblema enmarcado.
export function brandMark() {
  return `<svg class="brand-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path fill="#9C3F1C" d="M9.6 41.05h28.8c.4 1.85-5.6 3.45-14.4 3.45S9.2 42.9 9.6 41.05z"/><path fill="#2A2118" d="M12.2 37.7h23.6l2.5 3.6H9.7z"/><path fill="#2A2118" d="M20.9 35.9h6.2l.5 2.2h-7.2z"/><circle cx="24" cy="34.35" r="4.05" fill="#2A2118"/><path fill="#9C3F1C" d="M20.05 33.25h7.9v2.45h-7.9z"/><path fill="#2A2118" d="M8.7 19.6c-.55 7 4.3 12 15.3 12.8 11-.8 15.85-5.8 15.3-12.8-5 2-10.1 2.9-15.3 2.9s-10.3-.9-15.3-2.9z"/><path fill="#9C3F1C" d="M12.8 20.7c-.15 5 3.3 8.6 11.2 9.2 7.9-.6 11.35-4.2 11.2-9.2-3.6 1.45-7.3 2.1-11.2 2.1s-7.6-.65-11.2-2.1z"/><path fill="#FFF9F2" d="M14.2 23.6c.2 2.4 1.5 4.3 2.2 4.6-.9-.2-2.5-2.3-2.7-4.8.15-.1.35.05.5.2z"/><path fill="#2A2118" d="M7.70 17.55C7.70 15.81 15.00 14.40 24.00 14.40C33.00 14.40 40.30 15.81 40.30 17.55C40.30 19.29 33.00 20.70 24.00 20.70C15.00 20.70 7.70 19.29 7.70 17.55Z"/><path fill="#9C3F1C" d="M12.50 17.70C12.50 16.90 17.65 16.25 24.00 16.25C30.35 16.25 35.50 16.90 35.50 17.70C35.50 18.50 30.35 19.15 24.00 19.15C17.65 19.15 12.50 18.50 12.50 17.70Z"/><ellipse cx="14.4" cy="15.85" rx="2.9" ry="1.15" fill="#FFF9F2"/><circle cx="24" cy="6.85" r="4.85" fill="#F0C56A"/><circle cx="24" cy="6.85" r="4.85" fill="none" stroke="#9C3F1C" stroke-width="2.45"/></svg>`
}

function shell(route: Route, body: string, offline = '', refreshing = false) {
  const copy = tx()
  const pull = refreshing ? '<span class="pull" data-testid="refreshing"></span>' : ''
  return `
    <header class="top">
      ${pull}
      ${brandMark()}
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
  return `<nav>${item('hoy', copy.hoy, brandMark())}${item('calendario', copy.calendario, cal)}${item('muro', copy.muro, note)}${item('ajustes', copy.ajustes, gear)}</nav>`
}

const sun = '<svg class="sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M13 3l-1.4 1.4M4.4 11.6 3 13"/></svg>'
const cal = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>'
const note = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4"/></svg>'
const gear = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/></svg>'

function riskLine(risk: Estado['risk']) {
  if (risk !== 'empty') return ''
  return `<p class="risk" data-testid="risk">${tx().riskEmpty}</p>`
}

function streaks(state: Estado) {
  const copy = tx()
  const rows = [
    ['individual', state.me.display_name, copy.yoursAsk, state.streaks.individual],
    ['couple', copy.couple, copy.coupleAsk, state.streaks.couple],
    ['group', copy.group, copy.groupAsk, state.streaks.group],
    ['six', copy.six, copy.sixAsk, state.streaks.six],
    ['ten', copy.ten, copy.tenAsk, state.streaks.ten],
  ] as const
  return `<h2 class="streak-title">${copy.streaks}</h2><ol class="streaks">${rows.map(([key, title, ask, value]) => `
    <li data-testid="streak-${key}">
      <span><strong>${esc(title)}</strong><small>${ask}</small></span>
      <b>${value}</b>
    </li>`).join('')}</ol>`
}

function monday(state: Estado) {
  if (!state.monday) return ''
  const line = tx().week(state.monday.people, state.monday.couples, state.monday.empty_days)
  return `<p class="monday" data-testid="monday">${esc(line)}</p>`
}

function badges(day: { went: number; couples_went: number }) {
  const copy = tx()
  const items = [
    day.couples_went >= 6 ? `<i class="badge couples">${copy.badgeCouples}</i>` : '',
    day.went >= 10 ? `<i class="badge ten">${copy.badgeTen}</i>` : '',
    day.went >= 12 ? `<i class="badge all">${copy.badgeAll}</i>` : '',
  ].filter(Boolean)
  if (!items.length) return ''
  return `<span class="badges">${items.join('')}</span>`
}

export function renderHoy(state: Estado, locked: boolean) {
  const copy = tx()
  const today = state.calendar[0]
  const gone = today?.mine_attendance
  const past = state.past.map((day) => {
    const f = fecha(day.date)
    return `<li class="${day.sunday ? 'sunday' : ''}" data-date="${day.date}">
      <span class="past-main"><span>${f.corto} ${f.d}</span>${badges(day)}</span>
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
    <h2 class="streak-title">${copy.recentDays}</h2>
    <ul class="past" data-testid="past">${past}</ul>
  `
}

function atRisk(day: Day) {
  return !day.sunday && day.covered === 0
}

function counts(day: Day) {
  const copy = tx()
  return `<span class="count"><em>${copy.of12(day.covered)}</em><small>${copy.of6(day.couples)}</small></span>`
}

function dayMeta(day: Day, open: boolean) {
  const copy = tx()
  if (day.sunday) return `<em>${copy.sunday}</em>${counts(day)}${badges(day)}`
  const status = atRisk(day)
    ? (open
      ? `<span class="why" data-testid="risk-why">${esc(copy.nobody)}</span>`
      : `<em class="flag">${copy.riskFlag}</em>`)
    : (day.committed ? `<em class="committed">${copy.committed}</em>` : '')
  return `${counts(day)}${status}${badges(day)}`
}

function dayClass(day: Day) {
  if (day.sunday) return 'sunday'
  if (atRisk(day)) return 'risk'
  return ''
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
  const tone = day.sunday ? 'sunday' : atRisk(day) ? 'risk' : ''
  const note = day.sunday
    ? copy.sunday
    : atRisk(day)
      ? copy.nobody
      : day.committed
        ? copy.committed
        : ''
  const side = `
    <aside class="day" data-testid="day">
      <h2>${heading}</h2>
      <p class="count">${copy.of12(day.covered)} · ${copy.of6(day.couples)}</p>
      ${note ? `<p class="why ${tone}">${esc(note)}</p>` : ''}
      ${badges(day)}
      <button type="button" class="texty" data-act="commit" data-date="${day.date}" ${locked ? 'disabled' : ''}>
        ${day.mine_commitment ? copy.uncommit : copy.commit}
      </button>
    </aside>`
  return `<div class="split"><ol class="days" data-testid="calendar">${rows}</ol>${side}</div>`
}

function grouped(reactions: Reaction[]) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>()
  for (const reaction of reactions) {
    const row = map.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false }
    row.count += 1
    row.mine = row.mine || reaction.mine
    map.set(reaction.emoji, row)
  }
  return [...map.values()].filter((row) => row.count > 0)
}

function pills(item: Intention, locked: boolean) {
  const copy = tx()
  const buttons = grouped(item.reactions).map((row) => `
    <button type="button" class="react ${row.mine ? 'on' : ''}" data-act="react" data-id="${item.id}" data-emoji="${esc(row.emoji)}" aria-pressed="${row.mine}" aria-label="${esc(row.emoji)}, ${row.count}" ${locked ? 'disabled' : ''}>
      <span aria-hidden="true">${esc(row.emoji)}</span><b>${row.count}</b>
    </button>`).join('')
  return `
    <div class="reacts">
      ${buttons}
      <button type="button" class="react add" data-act="emoji-open" data-id="${item.id}" aria-label="${copy.addReaction}" ${locked ? 'disabled' : ''}>+</button>
    </div>`
}

function card(item: Intention, locked: boolean) {
  const copy = tx()
  const href = hrefIntention(item.id)
  return `
    <article>
      <a class="card-open" href="${href}">
        <strong>${esc(item.display_name)}</strong>
        <p>${esc(item.body)}</p>
      </a>
      ${pills(item, locked)}
      <a class="count-link" href="${href}">${copy.commentsCount(item.comments.length)}</a>
    </article>`
}

function detail(item: Intention, locked: boolean) {
  const copy = tx()
  const comments = item.comments.map((comment) => `
    <li>
      <div class="comment-line">
        <strong>${esc(comment.display_name)}</strong>
        <span class="ago">${esc(hace(comment.created_at))}</span>
        ${comment.mine ? `<button type="button" class="text-link" data-act="delete-comment" data-id="${comment.id}">${copy.delete}</button>` : ''}
      </div>
      <p>${esc(comment.body)}</p>
    </li>`).join('')
  return `
    <a class="back" data-act="back-wall" href="${href('muro')}"><span aria-hidden="true">←</span>${copy.backWall}</a>
    <article data-testid="thread">
      <header>
        <strong>${esc(item.display_name)}</strong>
        ${item.mine ? `<button type="button" class="text-link" data-act="delete" data-id="${item.id}">${copy.delete}</button>` : ''}
      </header>
      <p>${esc(item.body)}</p>
      ${pills(item, locked)}
      <ol class="comments">${comments}</ol>
      <form class="reply" data-act="comment" data-id="${item.id}">
        <label for="comment-${item.id}">${copy.comment}</label>
        <textarea id="comment-${item.id}" name="body" maxlength="200" rows="2" placeholder="${copy.commentHint}" ${locked ? 'disabled' : ''}></textarea>
        <button type="submit" ${locked ? 'disabled' : ''}>${copy.publish}</button>
      </form>
    </article>`
}

function sheet(intentionId: string) {
  const copy = tx()
  const grid = curated.map((emoji) => `
    <button type="button" data-act="react" data-id="${intentionId}" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('')
  return `
    <div class="sheet-back" data-act="emoji-close"></div>
    <section class="sheet" data-testid="emoji-sheet" role="dialog" aria-label="${copy.reactionSheet}">
      <h2>${copy.reactionSheet}</h2>
      <div class="sheet-grid">${grid}</div>
      <label for="emoji-field">${copy.emojiField}</label>
      <input id="emoji-field" data-act="emoji-input" data-id="${intentionId}" type="text" maxlength="16" autocomplete="off" enterkeyhint="done" />
    </section>`
}

export function renderMuro(state: Estado, locked: boolean, openId: string, emojiFor: string) {
  const copy = tx()
  const open = openId ? state.intentions.find((item) => item.id === openId) : undefined
  if (open) {
    return `${detail(open, locked)}${emojiFor === open.id ? sheet(open.id) : ''}`
  }
  const notes = state.intentions.map((item) => card(item, locked)).join('')
  const composer = `
    <form class="composer" data-testid="muro" data-act="publish">
      <label for="intention">${copy.intention}</label>
      <textarea id="intention" name="body" maxlength="280" rows="3" placeholder="${copy.intentionHint}" ${locked ? 'disabled' : ''}></textarea>
      <button type="submit" ${locked ? 'disabled' : ''}>${copy.publish}</button>
    </form>`
  return `
    ${composer}
    <div class="notes">${notes || `<p class="empty">${copy.emptyWall}</p>`}</div>
    ${emojiFor ? sheet(emojiFor) : ''}
  `
}

export function renderAjustes(state: Estado, locale: Locale) {
  const copy = tx()
  const lang = (value: Locale, label: string) => `
    <button type="button" data-act="locale" data-locale="${value}" aria-pressed="${locale === value}">${label}</button>`
  return `
    <section class="settings" data-testid="ajustes">
      <h2>${copy.alerts}</h2>
      <div class="switches">
        <button type="button" class="switch" role="switch" aria-checked="${state.prefs.empty_day}" data-act="pref" data-key="empty_day">
          <span>${copy.alertEmpty}</span><i></i>
        </button>
      </div>
      <h2>${copy.language}</h2>
      <div class="lang">
        ${lang('es', copy.spanish)}
        ${lang('pt', copy.portuguese)}
      </div>
      <button type="button" class="quiet" data-act="logout">${copy.logout}</button>
    </section>`
}

export function renderApp(route: Route, state: Estado, selected: string, locked: boolean, offline: string, openId: string, locale: Locale, emojiFor = '', refreshing = false) {
  const body = route === 'calendario'
    ? renderCalendario(state, selected, locked)
    : route === 'muro'
      ? renderMuro(state, locked, openId, emojiFor)
      : route === 'ajustes'
        ? renderAjustes(state, locale)
        : renderHoy(state, locked)
  const banner = offline ? `<p class="offline">${esc(offline)}</p>` : ''
  return shell(route, body, banner, refreshing)
}

export function renderLogin(message: string, email: string, code: string) {
  const copy = tx()
  return `
    <header class="top">
      ${brandMark()}
      <h1>${copy.brand}</h1>
    </header>
    <main class="login" data-testid="login">
      <label for="email">${copy.email}</label>
      <input id="email" name="email" type="email" autocomplete="username" inputmode="email" value="${esc(email)}" />
      <button type="button" data-act="send-link">${copy.sendLink}</button>
      ${message ? `<p class="hint">${esc(message)}</p>` : ''}
      <label for="code">${copy.code}</label>
      <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${esc(code)}" />
      <button type="button" data-act="verify">${copy.enter}</button>
    </main>`
}

export function renderSetup() {
  const copy = tx()
  return `
    <header class="top">${brandMark()}<h1>${copy.brand}</h1></header>
    <main class="login"><p>${copy.setup}</p></main>`
}

export function renderDenied() {
  const copy = tx()
  return `
    <header class="top">${brandMark()}<h1>${copy.brand}</h1></header>
    <main class="login" data-testid="denied"><p>${copy.denied}</p>
      <button type="button" data-act="logout">${copy.logout}</button></main>`
}
