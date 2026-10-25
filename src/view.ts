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

// Recortes y cáliz de public/icono.svg, sin los filtros. Se sustituye entera.
export function brandMark() {
  return `<svg class="brand-icon" viewBox="80 120 864 820" aria-hidden="true">
    <path d="M 118 220 C 230 165, 395 190, 428 310 C 455 415, 390 595, 430 740 C 310 785, 165 735, 125 605 C 92 495, 85 310, 118 220 Z" fill="#1B3E70"/>
    <path d="M 480 455 C 640 430, 845 470, 892 615 C 925 725, 845 875, 675 905 C 510 925, 360 885, 345 775 C 332 675, 395 470, 480 455 Z" fill="#C64B27"/>
    <path d="M 538 142 C 675 132, 795 225, 798 355 C 802 482, 685 572, 545 568 C 402 564, 312 465, 318 338 C 324 218, 415 150, 538 142 Z" fill="#E8A229"/>
    <path d="M 516 208 C 608 204, 678 272, 676 360 C 674 448, 602 512, 512 510 C 422 508, 354 440, 358 352 C 362 268, 430 212, 516 208 Z" fill="#FAF4E8"/>
    <path d="M 245 360 C 265 320, 265 280, 245 240 C 285 260, 325 260, 365 240 C 345 280, 345 320, 365 360 C 325 340, 285 340, 245 360 Z" fill="#FAF4E8" transform="translate(-45, 25) scale(0.82)"/>
    <path d="M 760 280 C 775 245, 775 210, 760 175 C 795 190, 830 190, 865 175 C 850 210, 850 245, 865 280 C 830 265, 795 265, 760 280 Z" fill="#1B3E70"/>
    <path d="M 503 265 C 512 262, 524 265, 523 278 C 521 318, 520 392, 522 442 C 522 454, 502 455, 501 440 C 500 390, 501 318, 503 265 Z" fill="#17120E"/>
    <path d="M 426 346 C 472 342, 554 340, 600 345 C 612 347, 611 367, 596 367 C 550 364, 474 365, 426 368 C 414 368, 414 348, 426 346 Z" fill="#17120E"/>
    <path d="M 278 492 C 296 485, 315 496, 320 515 C 346 624, 422 686, 514 685 C 606 684, 682 618, 704 506 C 708 486, 734 488, 732 512 C 708 646, 618 718, 514 720 C 408 722, 314 652, 278 514 C 274 500, 272 495, 278 492 Z" fill="#17120E"/>
    <path d="M 274 495 C 392 508, 618 506, 732 492 C 745 490, 748 512, 730 515 C 614 530, 392 532, 276 518 C 260 515, 262 493, 274 495 Z" fill="#17120E"/>
    <path d="M 498 705 C 506 705, 526 705, 526 715 C 525 758, 526 815, 528 855 C 528 868, 498 868, 498 855 C 499 815, 499 758, 498 705 Z" fill="#17120E"/>
    <path d="M 446 768 C 485 758, 542 758, 578 768 C 592 772, 588 795, 572 794 C 538 786, 488 786, 448 794 C 432 796, 432 772, 446 768 Z" fill="#17120E"/>
    <path d="M 338 868 C 425 842, 602 842, 688 868 C 706 874, 700 900, 678 896 C 594 874, 432 874, 346 896 C 325 900, 320 874, 338 868 Z" fill="#17120E"/>
  </svg>`
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
