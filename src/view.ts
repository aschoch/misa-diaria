import type { Day, Estado } from './types'
import { esc, fecha } from './format'

export type Route = 'hoy' | 'calendario' | 'muro' | 'ajustes'

const titles: Record<Route, string> = {
  hoy: 'Hoy',
  calendario: 'Calendario',
  muro: 'Muro',
  ajustes: 'Ajustes',
}

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
  return `
    <header class="top">
      <div class="arch" aria-hidden="true"></div>
      <p class="mark">Misa diaria</p>
      <h1>${titles[route]}</h1>
    </header>
    ${offline}
    <main>${body}</main>
    ${nav(route)}
  `
}

function nav(route: Route) {
  const item = (key: Route, label: string, icon: string) => `
    <a href="${href(key)}" class="${route === key ? 'on' : ''}" ${route === key ? 'aria-current="page"' : ''}>
      ${icon}<span>${label}</span>
    </a>`
  return `<nav>${item('hoy', 'Hoy', door)}${item('calendario', 'Calendario', cal)}${item('muro', 'Muro', note)}${item('ajustes', 'Ajustes', gear)}</nav>`
}

const sun = '<svg class="sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M13 3l-1.4 1.4M4.4 11.6 3 13"/></svg>'
const door = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V9a6 6 0 0 1 12 0v11"/><circle cx="12" cy="14" r="1.2"/></svg>'
const cal = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>'
const note = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4"/></svg>'
const gear = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/></svg>'

function riskLine(risk: Estado['risk']) {
  if (risk === 'empty') return '<p class="risk" data-testid="risk">Nadie se ha apuntado.</p>'
  if (risk === 'couple') return '<p class="risk" data-testid="risk">Falta una pareja.</p>'
  return ''
}

function streaks(state: Estado) {
  const rows = [
    ['individual', 'La tuya', '¿Has ido tú cada día?', state.streaks.individual],
    ['couple', 'Tu pareja', '¿Ha ido al menos uno de los dos?', state.streaks.couple],
    ['group', 'El grupo', '¿Ha ido alguien?', state.streaks.group],
    ['ten', '10 o más', '¿Hay al menos diez?', state.streaks.ten],
  ] as const
  return `<ol class="streaks">${rows.map(([key, title, ask, value]) => `
    <li data-testid="streak-${key}">
      <span><strong>${title}</strong><small>${ask}</small></span>
      <b>${value}</b>
    </li>`).join('')}</ol>`
}

function monday(state: Estado) {
  if (!state.monday) return ''
  const line = `La semana: ${state.monday.people} de 12 · ${state.monday.couples} de 6 parejas · ${state.monday.empty_days} días en cero.`
  return `<p class="monday" data-testid="monday">${esc(line)}</p>`
}

export function renderHoy(state: Estado, locked: boolean) {
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
      ${gone ? 'Has ido a Misa' : 'He ido a Misa'}
    </button>
    ${streaks(state)}
    <p class="total" data-testid="total">${state.streaks.total} misas apuntadas</p>
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
  if (gaps.length === 0) return 'Falta una pareja.'
  if (gaps.length === 1) return `Falta ${gaps[0]}.`
  const last = gaps[gaps.length - 1]
  return `Faltan ${gaps.slice(0, -1).join(', ')} y ${last}.`
}

function dayWhy(day: Day) {
  if (day.sunday) return 'Domingo.'
  if (!atRisk(day)) {
    if (day.covered === 12) return 'Están los doce.'
    if (day.couples === 6) return 'Las parejas están cubiertas.'
    return 'El día está cubierto.'
  }
  if (day.covered === 0) return 'Nadie se ha apuntado.'
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
  return `<span class="count"><em>${day.covered} de 12</em><small>${day.couples} de 6 parejas</small></span>`
}

function dayMeta(day: Day, open: boolean) {
  const why = open && !day.sunday
    ? `<small class="why" data-testid="risk-why">${esc(dayWhy(day))}</small>`
    : ''
  if (day.sunday) return `<em>Domingo</em>${counts(day)}`
  if (atRisk(day)) {
    return `${counts(day)}${open ? why : '<em class="flag">En riesgo</em>'}`
  }
  if (day.covered === 12) return `<em class="all"><i class="disk" aria-hidden="true"></i>Todos</em>${counts(day)}${why}`
  if (day.couples === 6) {
    return `<em class="pairs"><span class="dots" aria-hidden="true"><i></i><i></i></span>${day.couples} de 6</em><small>Parejas</small>${counts(day)}${why}`
  }
  return `${counts(day)}${why}`
}

export function renderCalendario(state: Estado, selected: string, locked: boolean) {
  const rows = state.calendar.map((day) => {
    const f = fecha(day.date)
    const mine = day.mine_attendance ? 'gone' : day.mine_commitment ? 'planned' : ''
    const open = day.date === selected
    const commit = open
      ? `<button type="button" class="row-commit" data-act="commit" data-date="${day.date}" ${locked ? 'disabled' : ''}>${day.mine_commitment ? 'Quitar «voy a ir»' : 'Voy a ir'}</button>`
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
      <p class="count">${day.covered} de 12 · ${day.couples} de 6 parejas</p>
      <p class="why ${tone}">${esc(why)}</p>
      <button type="button" class="texty" data-act="commit" data-date="${day.date}" ${locked ? 'disabled' : ''}>
        ${day.mine_commitment ? 'Quitar «voy a ir»' : 'Voy a ir'}
      </button>
    </aside>`
  return `<div class="split"><ol class="days" data-testid="calendar">${rows}</ol>${side}</div>`
}

export function renderMuro(state: Estado, locked: boolean) {
  const notes = state.intentions.map((item) => `
    <article>
      <header><strong>${esc(item.display_name)}</strong>${item.mine ? `<button type="button" data-act="delete" data-id="${item.id}">Borrar</button>` : ''}</header>
      <p>${esc(item.body)}</p>
    </article>`).join('')
  return `
    <form class="composer" data-testid="muro">
      <label for="intention">Una intención</label>
      <textarea id="intention" name="body" maxlength="280" rows="3" placeholder="Una o dos frases." ${locked ? 'disabled' : ''}></textarea>
      <button type="submit" data-act="publish" ${locked ? 'disabled' : ''}>Publicar</button>
    </form>
    <div class="notes">${notes || '<p class="empty">El muro está en blanco.</p>'}</div>
  `
}

export function renderAjustes(state: Estado) {
  const sw = (key: 'empty_day' | 'couple', label: string) => `
    <button type="button" class="switch" role="switch" aria-checked="${state.prefs[key]}" data-act="pref" data-key="${key}">
      <span>${label}</span><i></i>
    </button>`
  return `
    <section class="settings" data-testid="ajustes">
      <h2>Avisos</h2>
      <div class="switches">
        ${sw('empty_day', 'Si mañana no hay nadie')}
        ${sw('couple', 'Si mañana tu pareja no está cubierta')}
      </div>
      <button type="button" class="quiet" data-act="logout">Cerrar sesión</button>
    </section>`
}

export function renderApp(route: Route, state: Estado, selected: string, locked: boolean, offline: string) {
  const body = route === 'calendario'
    ? renderCalendario(state, selected, locked)
    : route === 'muro'
      ? renderMuro(state, locked)
      : route === 'ajustes'
        ? renderAjustes(state)
        : renderHoy(state, locked)
  const banner = offline ? `<p class="offline">${esc(offline)}</p>` : ''
  return shell(route, body, banner)
}

export function renderLogin(message: string, codeAsked: boolean) {
  return `
    <header class="top">
      <div class="arch" aria-hidden="true"></div>
      <h1>Misa diaria</h1>
    </header>
    <main class="login" data-testid="login">
      <label for="email">Tu correo</label>
      <input id="email" name="email" type="email" autocomplete="username" inputmode="email" />
      <button type="button" data-act="send-link">Enviar enlace</button>
      <p class="hint">${esc(message)}</p>
      ${codeAsked ? `
        <label for="code">Código</label>
        <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" />
        <button type="button" data-act="verify">Entrar</button>
      ` : ''}
    </main>`
}

export function renderSetup() {
  return `
    <header class="top"><div class="arch" aria-hidden="true"></div><h1>Misa diaria</h1></header>
    <main class="login"><p>Esta copia todavía no tiene proyecto. Los pasos están en la guía de puesta en marcha.</p></main>`
}

export function renderDenied() {
  return `
    <header class="top"><div class="arch" aria-hidden="true"></div><h1>Misa diaria</h1></header>
    <main class="login" data-testid="denied"><p>Esta cuenta no está en el grupo.</p>
      <button type="button" data-act="logout">Cerrar sesión</button></main>`
}
