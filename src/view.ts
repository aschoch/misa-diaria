import type { Day, Estado, HistoryDay, Intention, PastDay, Reaction } from './types'
import { emojiChoices } from './emoji'
import { esc, fecha, formatTimestamp, fullDate } from './format'
import { swipeSwitchOn } from './haptics'
import { dates, locale, monthTitle, tx, type Locale } from './i18n'

export type StreakMode = '' | 'individual' | 'couple' | 'group' | 'six' | 'all'
export type EditTarget = { kind: 'intention' | 'comment'; id: string } | null

export type UiState = {
  streak?: StreakMode
  monthsBefore?: number
  monthsAfter?: number
  historyDate?: string
  editing?: EditTarget
  emojiQuery?: string
  passwordSaved?: boolean
  passwordError?: string
  nameSaved?: boolean
  feedbackSaved?: boolean
  calendarDays?: number
  installOpen?: boolean
  passwordScreen?: boolean
  enter?: boolean
  popupEnter?: boolean
  pulseDate?: string
  fresh?: Set<string>
  notifyNote?: string
}

export type Route = 'hoy' | 'calendario' | 'muro' | 'ajustes'

export function hapticOverlay(id?: string) {
  const attr = id ? ` id="${id}"` : ''
  return `<label class="haptic-overlay" data-haptic-trigger aria-hidden="true"><input${attr} type="checkbox" switch data-haptic-switch tabindex="-1" aria-hidden="true" /></label>`
}

export function swipeHapticInput(extraAttr = '') {
  return `<input type="checkbox" class="row-swipe-haptic" data-row-haptic${extraAttr ? ` ${extraAttr}` : ''} ontouchstart="" tabindex="-1" aria-hidden="true" />`
}

const titles = {
  hoy: 'hoy',
  calendario: 'calendario',
  muro: 'muro',
  ajustes: 'ajustes',
} as const

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

function shell(route: Route, body: string, offline = '', refreshing = false, enter = false) {
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
    <main class="${enter ? 'route-enter' : ''}">${body}</main>
    ${nav(route)}
  `
}

function nav(route: Route) {
  const copy = tx()
  const tabs = [
    ['hoy', 'hoy', copy.hoy, brandMark()],
    ['calendario', 'calendario', copy.calendario, cal],
    ['muro', 'intenciones', copy.muro, note],
    ['ajustes', 'ajustes', copy.ajustes, gear],
  ] as const
  const index = Math.max(0, tabs.findIndex(([key]) => key === route))
  const links = tabs.map(([key, navKey, label, icon]) => `
    <a href="${href(key)}" data-nav="${navKey}" draggable="false" class="${route === key ? 'on' : ''}" ${route === key ? 'aria-current="page"' : ''}>
      ${icon}<span>${label}</span>${hapticOverlay()}
    </a>`).join('')
  return `<nav class="tabs" data-tab="${index}" style="--tab: ${index}"><span class="tab-glass-pill" aria-hidden="true"><span class="tab-glass-lens"></span></span>${links}</nav>`
}

const sun = '<svg class="sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M13 3l-1.4 1.4M4.4 11.6 3 13"/></svg>'
const cal = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>'
const note = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4"/></svg>'
const gear = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/></svg>'

function riskLine(state: Estado, locked: boolean) {
  if (state.risk !== 'empty') return ''
  const copy = tx()
  return `<p class="risk" data-testid="risk"><span>${copy.riskEmpty}</span><button type="button" class="risk-cta" data-act="commit" data-date="${state.today}" data-testid="risk-commit" ${locked ? 'disabled' : ''}>${copy.riskCta}${hapticOverlay()}</button></p>`
}

export function dayMarks(day: { went: number; mine_attendance: boolean; couples_went: number }) {
  const copy = tx()
  const items = [
    day.went >= 1 ? `<i class="dot course" title="${esc(copy.markCourse)}"></i>` : '',
    day.mine_attendance ? `<i class="dot mine" title="${esc(copy.markMine)}"></i>` : '',
    day.couples_went >= 6 ? `<i class="dot couples" title="${esc(copy.markCouples)}"></i>` : '',
    day.went >= 12 ? `<i class="dot star" aria-label="${esc(copy.markAll)}">★</i>` : '',
  ].filter(Boolean)
  if (!items.length) return ''
  return `<span class="dots">${items.join('')}</span>`
}

function badges(day: { went: number }) {
  const copy = tx()
  const items = [
    day.went >= 10 ? `<i class="badge ten">${copy.badgeTen}</i>` : '',
    day.went >= 12 ? `<i class="badge all">${copy.badgeAll}</i>` : '',
  ].filter(Boolean)
  if (!items.length) return ''
  return `<span class="badges">${items.join('')}</span>`
}

function goButton(state: Estado, gone: boolean, locked: boolean, label: string) {
  const copy = tx()
  const hidden = gone ? `<span class="visually-hidden">${copy.gone}</span>` : ''
  const classes = ['go', gone ? 'on go-secondary' : ''].filter(Boolean).join(' ')
  return `<button type="button" class="${classes}" data-testid="go" data-act="attend" data-date="${state.today}" aria-pressed="${gone ? 'true' : 'false'}" ${locked ? 'disabled' : ''}>
      <span class="go-label">${label}</span>${hidden}${hapticOverlay('haptic-switch')}
    </button>`
}

function hoyHero(state: Estado, gone: boolean, locked: boolean) {
  const copy = tx()
  return `<section class="hoy-hero estado-a ${gone ? 'on' : ''}" data-testid="hoy-hero">
    <p class="hoy-status" data-testid="hoy-status">${gone ? copy.attendedLine : copy.pendingLine}</p>
    ${goButton(state, gone, locked, gone ? copy.unmark : copy.go)}
  </section>`
}

export function renderHoy(state: Estado, locked: boolean, ui: UiState = {}) {
  const copy = tx()
  const today = state.calendar[0]
  const gone = Boolean(today?.mine_attendance)
  const past = state.past.map((day) => {
    const f = fecha(day.date)
    return `<li class="${day.sunday ? 'sunday' : ''}" data-date="${day.date}">
      <span class="past-main"><span>${f.corto} ${f.d}</span><small class="past-count">${copy.of12(day.went)}</small>${dayMarks(day)}</span>
      <button type="button" class="check ${day.mine_attendance ? 'on' : ''}" data-act="attend" data-date="${day.date}" aria-pressed="${day.mine_attendance}" aria-label="${f.largo} ${f.d}" ${locked ? 'disabled' : ''}>${hapticOverlay()}</button>
    </li>`
  }).join('')
  return `
    ${riskLine(state, locked)}
    <p class="hoy-date" data-testid="hoy-date">${esc(fullDate(state.today))}</p>
    ${hoyHero(state, gone, locked)}
    ${totalBlock(state)}
    <section class="past" data-testid="past" aria-label="${esc(copy.recentDays)}">
      <h2 class="streak-title">${copy.recentDays}</h2>
      <div class="month-legend past-legend" data-testid="past-legend">
        <span><i class="dot course" aria-hidden="true"></i>${copy.legendCourse}</span>
        <span><i class="dot mine" aria-hidden="true"></i>${copy.legendMine}</span>
        <span><i class="dot couples" aria-hidden="true"></i>${copy.legendCouples}</span>
        <span><i class="dot star" aria-hidden="true">★</i>${copy.legendAll}</span>
      </div>
      <ol class="past-list">${past}</ol>
      <button type="button" class="past-more" data-act="open-past-cal" data-testid="open-past-cal">${copy.seeAllDays}</button>
    </section>
    ${ui.streak ? streakPopup(state, ui.streak, ui.monthsBefore ?? 1, ui.monthsAfter ?? 1, ui.historyDate ?? '', locked, Boolean(ui.popupEnter)) : ''}
  `
}

export function totalBlock(state: Estado) {
  const copy = tx()
  return `<section class="total" data-testid="total">
      <b class="total-num" data-testid="total-num">${state.streaks.total}</b>
      <span class="total-label">${copy.totalLabel}</span>
    </section>`
}

function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function addMonth(year: number, month: number, delta: number) {
  const next = new Date(Date.UTC(year, month + delta, 1))
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() }
}

function meets(day: HistoryDay | undefined, mode: StreakMode) {
  if (!day || mode === '' || mode === 'all') return false
  if (mode === 'individual') return day.mine_attendance
  if (mode === 'couple') return day.couple_attendance
  if (mode === 'group') return day.went >= 1
  return day.couples_went >= 6
}

function runDates(state: Estado, mode: StreakMode) {
  const map = new Map((state.history ?? []).map((day) => [day.date, day]))
  const dates = new Set<string>()
  if (mode === '' || mode === 'all') return dates
  let date = state.today
  if (!meets(map.get(date), mode)) date = shiftDate(date, -1)
  while (meets(map.get(date), mode) && dates.size < 5000) {
    dates.add(date)
    date = shiftDate(date, -1)
  }
  return dates
}

function streakTitle(state: Estado, mode: StreakMode) {
  const copy = tx()
  if (mode === 'individual') return state.me.display_name
  if (mode === 'couple') return copy.couple
  if (mode === 'group') return copy.group
  if (mode === 'six') return copy.six
  return copy.recentDays
}

function streakCount(state: Estado, mode: StreakMode) {
  if (mode === 'individual') return state.streaks.individual
  if (mode === 'couple') return state.streaks.couple
  if (mode === 'group') return state.streaks.group
  if (mode === 'six') return state.streaks.six
  return state.streaks.total
}

// Cualquier día pasado (y hoy) se puede corregir; el futuro no.
function inWindow(today: string, date: string) {
  return date <= today
}

function monthBlock(state: Estado, year: number, month: number, mode: StreakMode, run: Set<string>, current: boolean, selected = '') {
  const pack = dates()
  const history = new Map((state.history ?? []).map((day) => [day.date, day]))
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const lead = (first + 6) % 7
  const blanks = Array.from({ length: lead }, () => '<span class="cell empty"></span>').join('')
  const weekdays = [...pack.cortos.slice(1), pack.cortos[0]]
  const cells = Array.from({ length: total }, (_, index) => {
    const day = index + 1
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const row = history.get(iso)
    const hit = meets(row, mode)
    const classes = ['cell', hit ? 'hit' : '', run.has(iso) ? 'run' : '', iso === state.today ? 'today' : ''].filter(Boolean).join(' ')
    const mark = row ? dayMarks(row) : ''
    if (mode === 'all' && iso > state.today) {
      return `<span class="${classes} future" aria-disabled="true">${day}</span>`
    }
    if (mode === 'all') {
      const picked = iso === selected
      return `<button type="button" class="${classes}${picked ? ' picked' : ''}" data-act="history-day" data-date="${iso}" ${picked ? 'aria-pressed="true"' : ''}>${day}${mark}${hapticOverlay()}</button>`
    }
    return `<span class="${classes}">${day}${mark}</span>`
  }).join('')
  return `<section class="month" data-month="${year}-${month}" ${current ? 'data-current="true"' : ''}>
    <h3>${pack.meses[month]} ${year}</h3>
    <div class="weekdays">${weekdays.map((name) => `<span>${name}</span>`).join('')}</div>
    <div class="month-grid">${blanks}${cells}</div>
  </section>`
}

export function historyDetail(state: Estado, date: string, locked: boolean) {
  if (!date) return ''
  const copy = tx()
  const row = (state.history ?? []).find((day) => day.date === date)
  const past = state.past.find((day) => day.date === date)
  const today = state.calendar.find((day) => day.date === date)
  const went = row?.went ?? past?.went ?? today?.went ?? 0
  const couples = row?.couples_went ?? past?.couples_went ?? today?.couples_went ?? 0
  const mine = row?.mine_attendance ?? past?.mine_attendance ?? today?.mine_attendance ?? false
  const f = fecha(date)
  const heading = `${f.largo.charAt(0).toUpperCase()}${f.largo.slice(1)}, ${f.d} de ${f.mes}`
  const marks = dayMarks({ went, mine_attendance: mine, couples_went: couples })
  const control = inWindow(state.today, date)
    ? `<div class="history-seg" role="group">
        <button type="button" class="${mine ? '' : 'on absent'}" data-act="attend-set" data-date="${date}" data-on="false" aria-pressed="${mine ? 'false' : 'true'}" ${locked ? 'disabled' : ''}>${copy.absentChoice}${hapticOverlay()}</button>
        <button type="button" class="${mine ? 'on attended' : ''}" data-act="attend-set" data-date="${date}" data-on="true" aria-pressed="${mine ? 'true' : 'false'}" ${locked ? 'disabled' : ''}>${copy.attendedChoice}${hapticOverlay()}</button>
      </div>`
    : `<p class="history-status ${mine ? 'on' : ''}">${mine ? `✓ ${copy.wentLabel}` : copy.absentLabel}</p>`
  return `<aside class="history-detail" data-testid="history-detail">
    <div class="history-detail-head">
      <h3>${heading}</h3>
      <div class="history-detail-meta"><span>${copy.of12(went)}</span>${marks}</div>
    </div>
    ${control}
  </aside>`
}

export function monthSpan(state: Estado, mode: StreakMode, fromDelta: number, toDelta: number, selected = '') {
  const [year, month] = state.today.split('-').map(Number)
  const run = runDates(state, mode)
  const html: string[] = []
  const step = fromDelta <= toDelta ? 1 : -1
  for (let delta = fromDelta; step > 0 ? delta <= toDelta : delta >= toDelta; delta += step) {
    const part = addMonth(year, month - 1, delta)
    html.push(monthBlock(state, part.y, part.m, mode, run, delta === 0, selected))
  }
  return html.join('')
}

function streakPopup(state: Estado, mode: StreakMode, before: number, after: number, historyDate: string, locked: boolean, enter = false) {
  if (!mode) return ''
  const copy = tx()
  const months = monthSpan(state, mode, -before, after, historyDate)
  const legend = mode === 'all' ? `<ul class="legend" data-testid="legend">
    <li><i class="dot course"></i>${copy.legendCourse}</li>
    <li><i class="dot mine"></i>${copy.legendMine}</li>
    <li><i class="dot couples"></i>${copy.legendCouples}</li>
    <li><i class="dot star" aria-label="${esc(copy.legendAll)}">★</i>${copy.legendAll}</li>
  </ul>` : ''
  return `<div class="streak-back${enter ? ' entering' : ''}" data-act="streak-close"></div>
    <section class="streak-pop${enter ? ' entering' : ''}" data-testid="streak-calendar" role="dialog" aria-modal="true" aria-label="${esc(streakTitle(state, mode))}">
      <header>
        <h2>${esc(streakTitle(state, mode))}</h2>
        <b title="${esc(tx().totalLabel)}">${streakCount(state, mode)}</b>
        <button type="button" class="pop-close" data-act="streak-close" aria-label="${copy.close}"><span aria-hidden="true">×</span></button>
      </header>
      ${legend}
      <div class="month-scroll" data-testid="month-scroll">${months}</div>
      <div class="pop-foot"></div>
      ${mode === 'all' ? historyDetail(state, historyDate, locked) : ''}
    </section>`
}

function atRisk(day: Day) {
  return !day.sunday && day.covered === 0
}

function counts(day: Day) {
  const copy = tx()
  return `<span class="count"><em>${copy.of12(day.covered)}</em></span>`
}

function dayMeta(day: Day) {
  const copy = tx()
  const notes: string[] = []
  if (day.sunday) notes.push(copy.sunday)
  if (!atRisk(day) && day.committed) notes.push(copy.committed)
  const hidden = notes.length ? `<span class="visually-hidden">${notes.join(' · ')}</span>` : ''
  const flag = atRisk(day) ? `<em class="flag">${copy.riskFlag}</em>` : ''
  return `${counts(day)}${flag}${badges(day)}${hidden}`
}

export function blankDay(date: string): Day {
  const [y, m, d] = date.split('-').map(Number)
  const sunday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0
  return {
    date,
    covered: 0,
    couples: 0,
    went: 0,
    couples_went: 0,
    committed: false,
    at_risk: !sunday,
    sunday,
    mine_commitment: false,
    mine_attendance: false,
  }
}

export function getCalendarDays(state: Estado, count: number): Day[] {
  const known = new Map(state.calendar.map((day) => [day.date, day]))
  const days: Day[] = []
  for (let i = 0; i < count; i += 1) {
    const date = shiftDate(state.today, i)
    days.push(known.get(date) ?? blankDay(date))
  }
  return days
}

function dayClass(day: Day) {
  if (day.sunday) return 'sunday'
  if (atRisk(day)) return 'risk'
  return ''
}

function dayRow(day: Day, selected: string, locked: boolean, pulse = '') {
  const copy = tx()
  const f = fecha(day.date)
  const mine = day.mine_attendance ? 'gone' : day.mine_commitment ? 'planned' : ''
  const open = day.date === selected
  const visible = day.mine_commitment ? copy.commitOn : copy.commit
  const name = day.mine_commitment ? copy.uncommit : copy.commit
  return `<li class="${dayClass(day)} ${open ? 'selected' : ''} swipeable" data-date="${day.date}" data-committed="${day.mine_commitment}">
      <span class="swipe-under right"><span class="swipe-cue" data-cue="→" aria-hidden="true">→</span></span>
      <span class="swipe-under left"><span class="swipe-cue" data-cue="←" aria-hidden="true">←</span></span>
      <div class="swipe-face">
        ${swipeHapticInput('data-face-haptic')}
        <button type="button" class="select-day" data-act="select" data-date="${day.date}" ${open ? 'aria-current="true"' : ''} ${locked ? 'disabled' : ''}>
          <span class="num ${mine}${pulse === day.date ? ' pulse' : ''}">${f.d}</span>
          <span class="when">${day.sunday ? sun : ''}${f.corto}</span>
          ${swipeHapticInput()}
        </button>
        <button type="button" class="row-commit ${day.mine_commitment ? 'on' : ''}" data-act="commit" data-date="${day.date}" aria-pressed="${day.mine_commitment}" aria-label="${esc(name)}" ${locked ? 'disabled' : ''}>${visible}${hapticOverlay()}</button>
        <span class="meta">${dayMeta(day)}${swipeHapticInput()}</span>
      </div>
      ${swipeSwitchOn() ? '<input type="checkbox" switch class="row-drag-switch" data-row-switch tabindex="-1" aria-hidden="true" />' : ''}
    </li>`
}

export function renderCalendario(state: Estado, selected: string, locked: boolean, locale: Locale, daysAhead = 28, pulse = '') {
  const copy = tx()
  const days = getCalendarDays(state, daysAhead)
  const groups: { key: string; days: Day[] }[] = []
  for (const day of days) {
    const key = day.date.slice(0, 7)
    const last = groups[groups.length - 1]
    if (!last || last.key !== key) groups.push({ key, days: [day] })
    else last.days.push(day)
  }
  const sections = groups.map((group) => monthSection(group.key, locale, group.days.map((day) => dayRow(day, selected, locked, pulse)).join(''))).join('')
  const day = days.find((item) => item.date === selected) ?? days[0]
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
      <p class="count">${copy.of12(day.covered)}</p>
      ${note ? `<p class="why ${tone}">${esc(note)}</p>` : ''}
      ${badges(day)}
      <button type="button" class="texty" data-act="commit" data-date="${day.date}" ${locked ? 'disabled' : ''}>
        ${day.mine_commitment ? copy.uncommit : copy.commit}
      </button>
    </aside>`
  return `<div class="split"><div class="cal-stream" data-testid="calendar">${sections}</div>${side}</div>`
}

function monthSection(key: string, locale: Locale, rows: string) {
  const [year, month] = key.split('-').map(Number)
  return `<section class="cal-month" data-month="${key}">
      <h2 class="cal-month-head" data-testid="cal-month-head">${esc(monthTitle(locale, year, month))}</h2>
      <ol class="days">${rows}</ol>
    </section>`
}

export function appendCalendarDays(stream: HTMLElement, state: Estado, selected: string, locked: boolean, locale: Locale, from: number, to: number) {
  if (to <= from) return
  const seen = new Set([...stream.querySelectorAll<HTMLElement>('li[data-date]')].map((li) => li.dataset.date))
  const incoming = getCalendarDays(state, to).slice(from).filter((day) => !seen.has(day.date))
  const groups: { key: string; days: Day[] }[] = []
  for (const day of incoming) {
    const key = day.date.slice(0, 7)
    const last = groups[groups.length - 1]
    if (!last || last.key !== key) groups.push({ key, days: [day] })
    else last.days.push(day)
  }
  for (const group of groups) {
    const rows = group.days.map((day) => dayRow(day, selected, locked)).join('')
    const list = stream.querySelector<HTMLElement>(`.cal-month[data-month="${group.key}"] ol.days`)
    if (list) list.insertAdjacentHTML('beforeend', rows)
    else stream.insertAdjacentHTML('beforeend', monthSection(group.key, locale, rows))
  }
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
      <button type="button" class="react add" data-act="emoji-open" data-id="${item.id}" aria-label="${copy.addReaction}" ${locked ? 'disabled' : ''}>
        <svg class="add-emoji-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16.5 10.5a6.5 6.5 0 1 1-7-6.48" />
          <circle cx="7.5" cy="9" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="12.5" cy="9" r="0.9" fill="currentColor" stroke="none" />
          <path d="M7.3 12.2c.7.9 1.6 1.3 2.7 1.3s2-.4 2.7-1.3" />
          <path d="M15.5 2.5v4M13.5 4.5h4" />
        </svg>
      </button>
    </div>`
}

function whenLine(iso: string | undefined) {
  const text = formatTimestamp(locale(), iso)
  if (!text) return ''
  return `<time class="wall-time" datetime="${esc(iso ?? '')}">${esc(text)}</time>`
}

function card(item: Intention, locked: boolean, fresh?: Set<string>) {
  const copy = tx()
  const href = hrefIntention(item.id)
  return `
    <article class="${fresh?.has(item.id) ? 'fresh' : ''}">
      <a class="card-open wall-open" href="${href}">
        <span class="who"><strong>${esc(item.display_name)}</strong>${whenLine(item.created_at)}</span>
        <p>${esc(item.body)}</p>
      </a>
      ${pills(item, locked)}
      <a class="count-link" href="${href}">${copy.commentsCount(item.comments.length)}</a>
    </article>`
}

function editor(kind: 'intention' | 'comment', id: string, body: string, max: number, locked: boolean) {
  const copy = tx()
  const act = kind === 'intention' ? 'save-intention' : 'save-comment'
  return `<form class="editor" data-act="${act}" data-id="${id}">
    <textarea name="body" maxlength="${max}" rows="3" data-draft="edit-${kind}-${id}" ${locked ? 'disabled' : ''}>${esc(body)}</textarea>
    <span class="editor-actions">
      <button type="submit" ${locked ? 'disabled' : ''}>${copy.save}</button>
      <button type="button" class="text-link" data-act="cancel-edit">${copy.cancel}</button>
    </span>
  </form>`
}

function detail(item: Intention, locked: boolean, editing: EditTarget, fresh?: Set<string>) {
  const copy = tx()
  const editingIntention = editing?.kind === 'intention' && editing.id === item.id
  const comments = item.comments.map((comment) => {
    const editingComment = editing?.kind === 'comment' && editing.id === comment.id
    return `
    <li class="${fresh?.has(comment.id) ? 'fresh' : ''}">
      <div class="comment-line">
        <strong>${esc(comment.display_name)}</strong>
        ${whenLine(comment.created_at)}
        ${comment.mine ? `<span class="mine-actions"><button type="button" class="text-link" data-act="edit" data-kind="comment" data-id="${comment.id}">${copy.edit}</button><button type="button" class="text-link" data-act="delete-comment" data-id="${comment.id}">${copy.delete}</button></span>` : ''}
      </div>
      ${editingComment ? editor('comment', comment.id, comment.body, 200, locked) : `<p>${esc(comment.body)}</p>`}
    </li>`
  }).join('')
  return `
    <a class="back" data-act="back-wall" href="${href('muro')}"><span aria-hidden="true">←</span>${copy.backWall}</a>
    <article data-testid="thread">
      <header>
        <span class="who"><strong>${esc(item.display_name)}</strong>${whenLine(item.created_at)}</span>
        ${item.mine ? `<span class="mine-actions"><button type="button" class="text-link" data-act="edit" data-kind="intention" data-id="${item.id}">${copy.edit}</button><button type="button" class="text-link" data-act="delete" data-id="${item.id}">${copy.delete}</button></span>` : ''}
      </header>
      ${editingIntention ? editor('intention', item.id, item.body, 280, locked) : `<p>${esc(item.body)}</p>`}
      ${pills(item, locked)}
      <ol class="comments">${comments}</ol>
      <form class="reply" data-act="comment" data-id="${item.id}">
        <label for="comment-${item.id}">${copy.comment}</label>
        <textarea id="comment-${item.id}" name="body" maxlength="200" rows="2" placeholder="${copy.commentHint}" data-draft="comment-${item.id}" ${locked ? 'disabled' : ''}></textarea>
        <button type="submit" data-needs-text ${locked ? 'disabled' : ''}>${copy.publish}</button>
      </form>
    </article>`
}

export function emojiGrid(intentionId: string, query: string) {
  return emojiChoices(query).map((emoji) => `
    <button type="button" data-act="react" data-id="${intentionId}" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('')
}

function sheet(intentionId: string, query: string, enter = false) {
  const copy = tx()
  return `
    <div class="sheet-back${enter ? ' entering' : ''}" data-act="emoji-close"></div>
    <section class="sheet${enter ? ' entering' : ''}" data-testid="emoji-sheet" role="dialog" aria-modal="true" aria-label="${copy.reactionSheet}">
      <div class="sheet-head">
        <h2>${copy.reactionSheet}</h2>
        <button type="button" class="pop-close" data-act="emoji-close" aria-label="${copy.close}"><span aria-hidden="true">×</span></button>
      </div>
      <label class="visually-hidden" for="emoji-search">${copy.emojiSearch}</label>
      <input id="emoji-search" data-act="emoji-search" data-id="${intentionId}" type="text" value="${esc(query)}" placeholder="${esc(copy.emojiSearch)}" autocomplete="off" enterkeyhint="search" />
      <div class="sheet-grid">${emojiGrid(intentionId, query)}</div>
    </section>`
}

export function renderMuro(state: Estado, locked: boolean, openId: string, emojiFor: string, ui: UiState = {}) {
  const copy = tx()
  const open = openId ? state.intentions.find((item) => item.id === openId) : undefined
  if (open) {
    return `${detail(open, locked, ui.editing ?? null, ui.fresh)}${emojiFor === open.id ? sheet(open.id, ui.emojiQuery ?? '', Boolean(ui.popupEnter)) : ''}`
  }
  const notes = state.intentions.map((item) => card(item, locked, ui.fresh)).join('')
  const composer = `
    <form class="composer" data-testid="muro" data-act="publish">
      <label for="intention">${copy.oneIntention}</label>
      <textarea id="intention" name="body" maxlength="280" rows="2" placeholder="${copy.intentionHint}" data-draft="intention" ${locked ? 'disabled' : ''}></textarea>
      <button type="submit" data-needs-text ${locked ? 'disabled' : ''}>${copy.publish}</button>
    </form>`
  return `
    ${composer}
    <div class="notes">${notes || `<p class="empty">${copy.emptyWall}</p>`}</div>
    ${emojiFor ? sheet(emojiFor, ui.emojiQuery ?? '', Boolean(ui.popupEnter)) : ''}
  `
}

const shareIcon = `<svg class="share-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8.2 7.2 12 3.4l3.8 3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const menuIcon = `<svg class="menu-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="18.5" r="1.7"/></svg>`

function installPlatform(): 'ios' | 'android' | 'desktop' {
  const query = new URLSearchParams(location.search).get('plataforma')
  if (query === 'ios' || query === 'android') return query
  const ua = navigator.userAgent || ''
  const apple = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (apple) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'desktop'
}

function installShot(n: 1 | 2 | 3, alt: string) {
  return `<img class="install-shot" src="${import.meta.env.BASE_URL}instalar-ios-${n}.jpg" alt="${esc(alt)}" loading="lazy" />`
}

function installSteps(kind: 'ios' | 'android') {
  const copy = tx()
  if (kind === 'ios') {
    return `<ol class="install-steps" data-platform="ios">
      <li>
        <span class="install-line"><span class="install-num">1</span>${shareIcon}<span class="visually-hidden">Safari</span></span>
        ${installShot(1, copy.installAltShare)}
      </li>
      <li>
        <span class="install-line"><span class="install-num">2</span>${copy.installIosAdd}</span>
        ${installShot(2, copy.installAltAdd)}
      </li>
      <li>
        <span class="install-line"><span class="install-num">3</span>${copy.installIosConfirm}</span>
        ${installShot(3, copy.installAltConfirm)}
      </li>
    </ol>`
  }
  return `<ol class="install-steps" data-platform="android">
    <li>${menuIcon}<span class="visually-hidden">Chrome</span></li>
    <li>${copy.installAndroidChoice}</li>
    <li>${copy.installAndroidConfirm}</li>
  </ol>`
}

function installGuide(open = false) {
  const copy = tx()
  const platform = installPlatform()
  const body = platform === 'desktop'
    ? `<div class="install-both">${installSteps('ios')}${installSteps('android')}</div>`
    : installSteps(platform)
  return `<section class="install-guide" data-testid="install-guide" data-platform="${platform}">
    <details class="install-details" ${open ? 'open' : ''}>
      <summary class="install-summary"><span>${copy.installToggle}</span><i class="install-chevron" aria-hidden="true"></i></summary>
      <div class="install-body">
        <h2>${copy.installTitle}</h2>
        ${body}
      </div>
    </details>
  </section>`
}

function passwordForm(ui: UiState) {
  const copy = tx()
  return `
    <form class="stack" data-form="password" data-act="save-password">
      <label for="current-password">${copy.currentPassword}</label>
      <input id="current-password" name="current_password" type="password" autocomplete="current-password" required />
      <label for="new-password">${copy.newPassword}</label>
      <input id="new-password" name="password" type="password" minlength="6" autocomplete="new-password" required />
      <button type="submit">${copy.savePassword}</button>
    </form>
    ${ui.passwordError ? `<p class="hint" data-testid="password-error">${esc(ui.passwordError)}</p>` : ''}
    ${ui.passwordSaved ? `<p class="hint" data-testid="password-saved">${copy.passwordSaved}</p>` : ''}`
}

export function renderAjustes(state: Estado, locale: Locale, ui: UiState = {}) {
  const copy = tx()
  const lang = (value: Locale, label: string) => `
    <button type="button" data-act="locale" data-locale="${value}" aria-pressed="${locale === value}">${label}${hapticOverlay()}</button>`
  if (ui.passwordScreen) {
    return `
      <section class="password-screen" data-testid="password-screen">
        <button type="button" class="back" data-act="close-password-screen"><span aria-hidden="true">←</span>${copy.ajustes}${hapticOverlay()}</button>
        <h2 id="password-title">${copy.changePassword}</h2>
        ${passwordForm(ui)}
      </section>`
  }
  return `
    <section class="settings" data-testid="ajustes">
      ${installGuide(Boolean(ui.installOpen))}
      <section class="settings-card">
        <h2>${copy.accountSection}</h2>
        <form class="stack" data-act="save-name">
          <label for="display-name">${copy.yourName}</label>
          <input id="display-name" name="display_name" maxlength="40" autocomplete="nickname" required value="${esc(state.me.display_name)}" />
          <button type="submit">${copy.saveName}</button>
        </form>
        ${ui.nameSaved ? `<p class="hint" data-testid="name-saved">${copy.nameSaved}</p>` : ''}
        <button type="button" class="settings-row" data-act="open-password-screen" data-testid="open-password-screen">
          <span>${copy.changePassword}</span><i class="settings-chevron" aria-hidden="true"></i>${hapticOverlay()}
        </button>
      </section>
      <section class="settings-card">
        <h2>${copy.alerts}</h2>
        <p class="notify-note">${copy.notifyNote}</p>
        ${ui.notifyNote ? `<p class="hint notify-warn" data-testid="notify-warn" role="status">${esc(ui.notifyNote)}</p>` : ''}
        <div class="switches">
          <button type="button" class="switch" role="switch" aria-checked="${state.prefs.empty_day}" data-act="pref" data-key="empty_day">
            <span>${copy.alertEmpty}</span><i></i>${hapticOverlay()}
          </button>
        </div>
      </section>
      <section class="settings-card">
        <h2>${copy.language}</h2>
        <div class="lang">
          ${lang('es', copy.spanish)}
          ${lang('pt', copy.portuguese)}
        </div>
      </section>
      <section class="settings-card">
        <form class="stack" data-act="feedback">
          <h2 id="feedback-title">${copy.feedbackTitle}</h2>
          <textarea id="feedback" name="body" maxlength="1000" rows="4" aria-labelledby="feedback-title" data-draft="feedback"></textarea>
          <button type="submit" data-needs-text>${copy.sendFeedback}</button>
        </form>
        ${ui.feedbackSaved ? `<p class="hint" data-testid="feedback-thanks">${copy.feedbackThanks}</p>` : ''}
      </section>
      <button type="button" class="quiet" data-act="logout">${copy.logout}</button>
    </section>`
}

export function renderApp(route: Route, state: Estado, selected: string, locked: boolean, offline: string, openId: string, locale: Locale, emojiFor = '', refreshing = false, ui: UiState = {}) {
  const body = route === 'calendario'
    ? renderCalendario(state, selected, locked, locale, ui.calendarDays ?? 28, ui.pulseDate ?? '')
    : route === 'muro'
      ? renderMuro(state, locked, openId, emojiFor, ui)
      : route === 'ajustes'
        ? renderAjustes(state, locale, ui)
        : renderHoy(state, locked, ui)
  const banner = offline ? `<p class="offline">${esc(offline)}</p>` : ''
  return shell(route, body, banner, refreshing, Boolean(ui.enter))
}

export type LoginMode = 'password' | 'forgot' | 'code'

export function renderLogin(message: string, email: string, code: string, mode: LoginMode = 'password', sending = false) {
  const copy = tx()
  const hint = message ? `<p class="hint" role="status">${esc(message)}</p>` : ''
  const emailField = `
      <label for="email">${copy.email}</label>
      <input id="email" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" value="${esc(email)}" />`
  let fields = ''
  if (mode === 'password') {
    fields = `
      ${emailField}
      <label for="password">${copy.password}</label>
      <input id="password" name="password" type="password" autocomplete="current-password" minlength="6" />
      <button type="submit" data-act="login-password">${copy.enter}</button>
      ${hint}
      <button type="button" class="secondary" data-act="forgot-start">${copy.forgotPassword}</button>`
  } else if (mode === 'forgot') {
    fields = `
      ${emailField}
      <button type="submit" data-act="send-code" ${sending ? 'disabled aria-busy="true"' : ''}>${sending ? `<span class="send-wait" aria-hidden="true"><i></i><i></i><i></i></span><span class="visually-hidden">${copy.sendCode}</span>` : copy.sendCode}</button>
      <button type="button" class="secondary" data-act="login-back">${copy.back}</button>
      ${hint}`
  } else {
    fields = `
      ${emailField}
      <label for="code">${copy.code}</label>
      <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" value="${esc(code)}" />
      <button type="submit" data-act="verify">${copy.enterCode}</button>
      <button type="button" class="secondary" data-act="login-back">${copy.back}</button>
      ${hint}`
  }
  return `
    <header class="top">
      ${brandMark()}
      <h1>${copy.brand}</h1>
    </header>
    <main class="login" data-testid="login">
      <form class="login-form" data-act="login-submit" data-mode="${mode}" novalidate>
        ${fields}
      </form>
    </main>`
}

export function renderResetPassword(message = '', email = '') {
  const copy = tx()
  return `
    <header class="top">
      ${brandMark()}
      <h1>${copy.setPasswordTitle}</h1>
    </header>
    <main class="login" data-testid="reset-password">
      <form class="login-form" data-act="set-new-password" novalidate>
        <p class="login-note">${copy.setPasswordNote}</p>
        <input type="email" name="email" autocomplete="username" value="${esc(email)}" hidden />
        <label for="reset-password">${copy.newPassword}</label>
        <input id="reset-password" name="password" type="password" minlength="6" autocomplete="new-password" />
        <button type="submit">${copy.savePassword}</button>
        <button type="button" class="secondary" data-act="skip-password">${copy.skipPassword}</button>
        ${message ? `<p class="hint" role="status">${esc(message)}</p>` : ''}
      </form>
    </main>`
}

export function renderSplash() {
  const copy = tx()
  return `
    <header class="top splash" aria-busy="true">
      ${brandMark()}
      <p class="mark">${copy.brand}</p>
      <span class="visually-hidden">${copy.loading}</span>
    </header>`
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
