import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const gate = 'http://127.0.0.1:54321'
const storeShots = process.env.MISA_SHOTS ?? join(tmpdir(), 'misa-shots')
let shots = storeShots

function ensureShots() {
  try {
    mkdirSync(shots, { recursive: true })
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
    if (code !== 'EACCES' && code !== 'EPERM') throw err
    shots = join(tmpdir(), 'misa-shots')
    mkdirSync(shots, { recursive: true })
  }
}

const outsider = '00000000-0000-4000-8000-0000000000ff'

function reason(text: string) {
  return text === 'Los 6 matrimonios'
    || text === '¡Hoy habéis ido los doce!'
    || text === '10 misas hoy'
    || /^(Tú|Tu matrimonio|El curso|Cada matrimonio|10 misas) · (7|30) días seguidos$/.test(text)
}

function shotHere(browserName: string, viewport: { width: number; height: number } | null) {
  return browserName === 'webkit' && viewport?.width === 390
}

async function reset(at?: string) {
  const response = await fetch(`${gate}/test/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(at ? { at } : {}),
  })
  if (!response.ok) throw new Error('no se ha podido preparar la base')
}

async function clock(at: string) {
  const response = await fetch(`${gate}/test/clock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ at }),
  })
  if (!response.ok) throw new Error('reloj')
}

async function scene(name: string) {
  const response = await fetch(`${gate}/test/scene`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error('escena')
}

async function codeFor(email: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${gate}/test/inbox?email=${encodeURIComponent(email)}`)
    if (response.ok) return (await response.json()).code as string
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`sin código para ${email}`)
}

function watchConsole(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function login(page: Page, email: string) {
  await page.goto('/misa-diaria/')
  await page.getByLabel('Tu correo').fill(email)
  await page.locator('#password').fill('misa-2026')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

async function setRecoveryPassword(page: Page) {
  await expect(page.getByRole('heading', { name: 'Crea tu contraseña' })).toBeVisible()
  await page.getByLabel('Nueva contraseña').fill('misa-2026')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
}

async function tokenOf(page: Page) {
  return page.evaluate(() => {
    for (const [key, value] of Object.entries(localStorage)) {
      if (!key.endsWith('auth-token')) continue
      const parsed = JSON.parse(value) as { access_token?: string }
      if (parsed.access_token) return parsed.access_token
    }
    return ''
  })
}

async function usageRows(page: Page) {
  const token = await tokenOf(page)
  const response = await fetch(`${gate}/rest/v1/usage_events?select=event_name,route,props`, {
    headers: { apikey: 'sb_test_anon_misa', Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<Array<{ event_name: string; route: string; props: { on?: boolean; source?: string; to?: string } }>>
}

test.beforeEach(async ({ page }) => {
  await reset()
  await page.context().clearCookies()
})

test('un miembro entra con el código y ve el curso', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/misa-diaria/')
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover')
  await page.getByRole('button', { name: /olvidaste la contraseña/ }).click()
  await page.getByLabel('Tu correo').fill('nadie@example.com')
  await page.getByRole('button', { name: 'Enviar código' }).click()
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toBeVisible()

  await page.goto('/misa-diaria/')
  await login(page, 'persona1@example.com')
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  await expect(page.getByTestId('hoy-date')).toHaveText('Viernes, 23 de octubre de 2026')
  await expect(page.locator('.hoy-hero')).toHaveClass(/estado-a/)
  await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
  await expect(page.getByTestId('go')).toContainText('Has ido a Misa')
  await expect(page.getByTestId('go')).toContainText('Desmarcar')
  await expect(page.getByRole('heading', { name: 'Rachas' })).toHaveCount(0)
  await expect(page.getByTestId('total')).toContainText('Total de Misas del curso')
  expect(Number(await page.getByTestId('total-num').textContent())).toBeGreaterThan(0)
  expect(await page.evaluate(() => {
    const hero = document.querySelector('[data-testid="hoy-hero"]')?.getBoundingClientRect()
    const total = document.querySelector('[data-testid="total"]')?.getBoundingClientRect()
    const week = document.querySelector('[data-testid="week"]')?.getBoundingClientRect()
    return Boolean(hero && total && week && week.top >= hero.bottom && total.top >= week.bottom)
  })).toBe(true)
  // Sin «Últimos días»: los días pasados viven en el calendario.
  await expect(page.getByTestId('past')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Estos días' })).toBeVisible()
  const navBox = await page.locator('nav.tabs').evaluate((node) => {
    const box = node.getBoundingClientRect()
    const radius = Number.parseFloat(getComputedStyle(node).borderRadius)
    return { lift: window.innerHeight - box.bottom, gap: window.innerWidth - box.width, radius, height: box.height }
  })
  expect(navBox.lift).toBeGreaterThanOrEqual(8)
  expect(navBox.gap).toBeGreaterThanOrEqual(28)
  expect(navBox.radius).toBeGreaterThanOrEqual(navBox.height / 2 - 1)
  const tab = await page.locator('nav a').first().boundingBox()
  expect(tab?.height ?? 0).toBeGreaterThanOrEqual(58)
  const mainPad = await page.locator('main').evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingBottom))
  expect(mainPad).toBeGreaterThanOrEqual(128)
  await expect(page.getByTestId('streak-individual')).toHaveCount(0)
  await expect(page.locator('.streaks li')).toHaveCount(0)
  // Ayer en «Estos días»: cuántos del curso fueron.
  await expect(page.getByTestId('week').locator('.week-day[data-date="2026-10-22"] small')).toHaveText('11')
  await expect(page.getByTestId('go')).toBeVisible()
  await expect(page.locator('nav a')).toHaveCount(4)
  await page.getByRole('link', { name: 'Intenciones' }).click()
  await expect(page.getByText('Por quienes no pueden salir de casa.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0)
  await page.getByRole('link', { name: /Por quienes no pueden salir de casa/ }).click()
  await expect(page.getByRole('button', { name: 'Eliminar' })).toBeVisible()
  await expect(page.locator('nav a')).toHaveCount(4)
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByTestId('muro')).toBeVisible()
  await expect(page.locator('.reply')).toHaveCount(0)
  await expect(page).toHaveURL(/\/muro\/?$/)
  expect(errors).toEqual([])
})

test('el correo sigue ahí al volver y el código pedido entra sin pedir otro', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/misa-diaria/')
  await expect(page.locator('#password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /olvidaste la contraseña/ })).toBeVisible()
  await expect(page.getByLabel('Código')).toHaveCount(0)
  await page.getByLabel('Tu correo').fill('Persona1@Example.com')
  await page.getByLabel('Tu correo').press('Enter')
  await expect(page.getByLabel('Tu correo')).toHaveValue('Persona1@Example.com')
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toHaveCount(0)
  await page.getByRole('button', { name: /olvidaste la contraseña/ }).click()
  await expect(page.getByLabel('Tu correo')).toHaveValue('persona1@example.com')
  await page.getByRole('button', { name: 'Enviar código' }).click()
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toBeVisible()
  const code = await codeFor('persona1@example.com')
  await page.reload()
  await expect(page.getByLabel('Tu correo')).toHaveValue('persona1@example.com')
  await expect(page.getByLabel('Código')).toHaveCount(0)
  await page.getByRole('button', { name: /olvidaste la contraseña/ }).click()
  await expect(page.getByRole('button', { name: 'Ya tengo un código' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enviar código' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Volver' })).toBeVisible()
  await page.getByRole('button', { name: 'Volver' }).click()
  await page.locator('#password').fill('misa-2026')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  expect(code).toMatch(/^\d{6}$/)
  expect(errors).toEqual([])
})

test('enviar código muestra que está en camino', async ({ page }) => {
  const errors = watchConsole(page)
  let release = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/auth/v1/otp**', async (route) => {
    await held
    await route.continue()
  })
  await page.goto('/misa-diaria/')
  await page.getByLabel('Tu correo').fill('persona3@example.com')
  await page.getByRole('button', { name: /olvidaste la contraseña/ }).click()
  await page.getByRole('button', { name: 'Enviar código' }).click()
  await expect(page.locator('[data-act="send-code"]')).toBeDisabled()
  await expect(page.locator('.send-wait')).toBeVisible()
  release()
  await expect(page.getByLabel('Código')).toBeVisible()
  expect(errors).toEqual([])
})

test('un segundo envío no dice que salió y deja entrar el código', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/misa-diaria/')
  await page.getByLabel('Tu correo').fill('persona2@example.com')
  await page.getByRole('button', { name: /olvidaste la contraseña/ }).click()
  await page.getByRole('button', { name: 'Enviar código' }).click()
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toBeVisible()
  const code = await codeFor('persona2@example.com')
  await page.getByRole('button', { name: 'Volver' }).click()
  await page.getByRole('button', { name: /olvidaste la contraseña/ }).click()
  await page.getByRole('button', { name: 'Enviar código' }).click()
  await expect(page.getByText('Acabamos de enviar un código. Escríbelo abajo.')).toBeVisible()
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toHaveCount(0)
  await expect(page.getByLabel('Tu correo')).toHaveValue('persona2@example.com')
  await page.getByLabel('Código').fill(code)
  await page.getByRole('button', { name: 'Entrar con código' }).click()
  await setRecoveryPassword(page)
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  const unexpected = errors.filter((error) => !/failed to load resource|429/i.test(error))
  expect(unexpected).toEqual([])
})

test('quien no es del curso no lee ni escribe', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'fuera@example.com')
  await expect(page.getByTestId('denied')).toContainText('Esta cuenta no está en el curso.')

  const token = await tokenOf(page)
  const result = await page.evaluate(async ({ gate, token, outsider }) => {
    const headers = {
      apikey: 'sb_test_anon_misa',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    const read = await fetch(`${gate}/rest/v1/attendance`, { headers })
    const write = await fetch(`${gate}/rest/v1/attendance`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ member_id: outsider, mass_date: '2026-10-23' }),
    })
    const state = await fetch(`${gate}/rest/v1/rpc/estado`, { method: 'POST', headers, body: '{}' })
    const anon = await fetch(`${gate}/rest/v1/attendance`, {
      headers: { apikey: 'sb_test_anon_misa', Authorization: 'Bearer sb_test_anon_misa' },
    })
    return {
      rows: await read.json(),
      write: write.status,
      state: state.status,
      anon: anon.status,
    }
  }, { gate, token, outsider })

  expect(result.rows).toEqual([])
  expect(result.write).toBeGreaterThanOrEqual(400)
  expect(result.state).toBeGreaterThanOrEqual(400)
  expect(result.anon).toBeGreaterThanOrEqual(400)
  const unexpected = errors.filter((error) => !/failed to load resource|403|401/i.test(error))
  expect(unexpected).toEqual([])
})

test('el domingo no está en riesgo y la fecha es la de Madrid', async ({ page }) => {
  const errors = watchConsole(page)
  await clock('2026-10-31T10:00:00Z')
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  const days = page.getByTestId('calendar').locator('li:not([data-kind="past"])')
  await expect(days.nth(0)).toHaveClass(/risk/)
  await expect(days.nth(1)).toContainText('Domingo')
  await expect(days.nth(1)).not.toContainText(/en riesgo/i)
  await expect(days.nth(1)).not.toHaveClass(/risk/)

  await clock('2026-01-10T22:30:00Z')
  await page.reload()
  await expect(days.nth(0).locator('.num')).toHaveText('10')
  await expect(days.nth(0)).toHaveClass(/risk/)

  await clock('2026-01-10T23:30:00Z')
  await page.reload()
  await expect(days.nth(0).locator('.num')).toHaveText('11')
  await expect(days.nth(0)).toContainText('Domingo')
  await expect(days.nth(0)).not.toContainText(/en riesgo/i)
  await expect(days.nth(0)).not.toHaveClass(/risk/)
  expect(errors).toEqual([])
})

test('la celebración sale una vez y dice el motivo', async ({ page }) => {
  const errors = watchConsole(page)
  await scene('diez')
  await login(page, 'persona10@example.com')
  await expect(page.getByTestId('celeb-line')).toHaveCount(0)
  await page.getByTestId('go').click()
  const line = page.getByTestId('celeb-line')
  await expect(line).toBeVisible()
  expect(reason((await line.textContent()) ?? '')).toBe(true)
  await expect(line).toHaveText('10 misas hoy')
  await page.getByRole('button', { name: 'Saltar la celebración' }).click()
  await expect(line).toHaveCount(0)
  await page.waitForTimeout(400)
  await expect(page.getByTestId('celeb-line')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('celeb-line')).toHaveCount(0)
  await expect(page.getByTestId('go').locator('.vence, .piece')).toHaveCount(0)
  await page.getByTestId('go').click()
  await expect(page.getByTestId('go')).toHaveText('He ido a Misa')
  await page.getByTestId('go').click()
  await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
  await expect(page.getByTestId('go')).toContainText('Has ido a Misa')
  await expect(page.getByTestId('go')).toContainText('Desmarcar')
  await expect(page.getByTestId('go')).toHaveClass(/go-secondary/)
  await expect(page.getByTestId('go').locator('.vence, .piece')).toHaveCount(0)
  await expect(page.getByTestId('celeb-line')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('con poco movimiento se queda la cresta y la línea', async ({ page }) => {
  const errors = watchConsole(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await scene('diez')
  await login(page, 'persona10@example.com')
  await page.getByTestId('go').click()
  const line = page.getByTestId('celeb-line')
  await expect(line).toHaveText('10 misas hoy')
  const paper = page.locator('.paper').first()
  await expect(paper).toBeVisible()
  const style = await paper.evaluate((node) => {
    const computed = getComputedStyle(node)
    return { animation: computed.animationName, opacity: computed.opacity }
  })
  expect(style.animation).toBe('none')
  expect(style.opacity).toBe('1')
  const layout = await page.evaluate(() => {
    const line = document.querySelector('[data-testid="celeb-line"]')!.getBoundingClientRect()
    const header = document.querySelector('.top')!
    const button = document.querySelector('[data-testid="go"]')!.getBoundingClientRect()
    const papers = [...document.querySelectorAll('.paper')].map((node) => node.getBoundingClientRect())
    const ys = papers.map((rect) => rect.top + rect.height / 2)
    const xs = papers.map((rect) => rect.left + rect.width / 2)
    const lineMidY = line.top + line.height / 2
    const lineMidX = line.left + line.width / 2
    return {
      headerOpacity: getComputedStyle(header).opacity,
      lineTop: line.top,
      lineBottom: line.bottom,
      buttonTop: button.top,
      spreadY: Math.max(...ys) - Math.min(...ys),
      spreadX: Math.max(...xs) - Math.min(...xs),
      around: papers.filter((rect) => {
        const y = rect.top + rect.height / 2
        const x = rect.left + rect.width / 2
        return Math.abs(y - lineMidY) < 110 && Math.abs(x - lineMidX) < 180
      }).length,
      stuck: papers.filter((rect) => rect.bottom < 24).length,
      count: papers.length,
    }
  })
  expect(Number(layout.headerOpacity)).toBe(0)
  expect(layout.lineTop).toBeGreaterThan(48)
  expect(layout.lineBottom).toBeLessThan(layout.buttonTop - 4)
  expect(layout.spreadY).toBeGreaterThan(60)
  expect(layout.spreadX).toBeGreaterThan(140)
  expect(layout.around).toBeGreaterThan(10)
  expect(layout.stuck).toBeLessThan(layout.count / 5)
  const hit = await page.getByTestId('go').evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return Boolean(target && node.contains(target) && target.classList.contains('haptic-overlay'))
  })
  expect(hit).toBe(true)
  expect(errors).toEqual([])
})

test('guardar el nombre lo deja en ajustes', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await expect(page.getByLabel('Tu nombre')).toHaveValue('Persona 1')
  await page.getByLabel('Tu nombre').fill('Ana')
  await page.getByRole('button', { name: 'Guardar nombre' }).click()
  await expect(page.getByTestId('name-saved')).toHaveText('Nombre guardado.')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  await expect(page.getByLabel('Tu nombre')).toHaveValue('Ana')
  expect(errors).toEqual([])
})

test('en oscuro el botón de vela lleva tinta oscura', async ({ page }) => {
  const errors = watchConsole(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await login(page, 'persona12@example.com')
  await expect(page.getByTestId('go').locator('.vence, .piece')).toHaveCount(0)
  const ink = await page.getByTestId('go').evaluate((node) => getComputedStyle(node).color)
  expect(ink).toBe('rgb(42, 33, 24)')
  const mark = await page.locator('.top .brand-icon path').first().evaluate((node) => getComputedStyle(node).fill)
  expect(mark).toBe('rgb(27, 62, 112)')
  expect(errors).toEqual([])
})

test('el calendario dice el motivo y no tapa la lista', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  const friday = page.getByTestId('calendar').locator('li:not([data-kind="past"])').nth(0)
  await expect(friday).toContainText('9 de 12')
  await expect(friday).not.toContainText('de 6')
  await expect(friday.getByTestId('risk-why')).toHaveCount(0)
  await expect(friday).not.toHaveClass(/risk/)
  await expect(friday).not.toContainText(/Falta/)
  const saturday = page.locator('[data-testid="calendar"] li:has([data-date="2026-10-24"])')
  await expect(saturday).toContainText('Alguien se ha apuntado')
  await expect(saturday).not.toHaveClass(/risk/)
  const narrow = (page.viewportSize()?.width ?? 0) < 800
  if (narrow) await expect(page.locator('.day')).toBeHidden()
  else await expect(page.locator('.day')).toBeVisible()
  const empty = page.locator('[data-testid="calendar"] li:has([data-date="2026-10-27"])')
  const before = await empty.evaluate((node) => node.getBoundingClientRect().height)
  await page.locator('[data-act="select"][data-date="2026-10-27"]').click()
  const after = await empty.evaluate((node) => node.getBoundingClientRect().height)
  expect(Math.abs(after - before)).toBeLessThan(1)
  expect(before).toBeGreaterThanOrEqual(60)
  await expect(empty).toHaveClass(/risk/)
  await expect(empty.locator('.flag')).toHaveText('En riesgo')
  await expect(empty.getByTestId('risk-why')).toHaveCount(0)
  const open = await empty.evaluate((node) => {
    const flag = node.querySelector('.flag')
    const count = node.querySelector('.count')
    const commit = node.querySelector('.row-commit')
    const bar = getComputedStyle(node, '::before')
    const box = commit?.getBoundingClientRect()
    return {
      flagSize: flag ? getComputedStyle(flag).fontSize : '',
      countSize: count ? getComputedStyle(count).fontSize : '',
      flagColor: flag ? getComputedStyle(flag).color : '',
      barWidth: bar.width,
      commit: commit && box ? {
        display: getComputedStyle(commit).display,
        whiteSpace: getComputedStyle(commit).whiteSpace,
        height: box.height,
        width: box.width,
      } : null,
    }
  })
  expect(open.flagSize).toBe(open.countSize)
  expect(open.flagSize).toBe('13px')
  expect(open.flagColor).toBe('rgb(122, 62, 12)')
  expect(open.barWidth).toBe('4px')
  if (open.commit && open.commit.display !== 'none') {
    expect(open.commit.whiteSpace).toBe('nowrap')
    expect(open.commit.height).toBeLessThan(52)
    expect(open.commit.width).toBeLessThan(160)
  }
  const bars = await page.locator('.days li').evaluateAll((nodes) => nodes.map((node) => ({
    risk: node.classList.contains('risk'),
    sunday: node.classList.contains('sunday'),
    width: getComputedStyle(node, '::before').width,
    content: getComputedStyle(node, '::before').content,
  })))
  for (const row of bars) {
    if (row.risk && !row.sunday) expect(row.width).toBe('4px')
    else expect(row.content).toBe('none')
  }
  const overlaps = await page.evaluate(async () => {
    const lis = [...document.querySelectorAll<HTMLElement>('.days li')]
    const bad: number[] = []
    for (const li of lis) {
      li.scrollIntoView({ block: 'center' })
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      for (let i = 1; i < lis.length; i++) {
        const above = lis[i - 1].getBoundingClientRect()
        const below = lis[i].getBoundingClientRect()
        const overlap = above.bottom - below.top
        if (overlap > 1) bad.push(overlap)
      }
    }
    return bad
  })
  expect(overlaps).toEqual([])

  await friday.locator('[data-act="select"]').click()
  const ring = await friday.locator('[data-act="select"]').evaluate((node) => {
    const style = getComputedStyle(node)
    return { outline: style.outlineStyle, shadow: style.boxShadow }
  })
  expect(ring.outline).toBe('none')
  expect(ring.shadow).toBe('none')

  await scene('cubiertas')
  await page.reload()
  const row = (date: string) => page.locator(`[data-testid="calendar"] li:has([data-date="${date}"])`)
  await page.locator('[data-act="select"][data-date="2026-10-26"]').click()
  await expect(row('2026-10-26')).not.toHaveClass(/risk/)
  await expect(row('2026-10-26')).toContainText('de 12')
  await expect(row('2026-10-26')).not.toContainText('de 6')
  await expect(page.getByTestId('risk-why')).toHaveCount(0)
  await expect(page.getByText(/Falta/)).toHaveCount(0)

  await page.locator('[data-act="select"][data-date="2026-10-25"]').click()
  await expect(row('2026-10-25')).not.toHaveClass(/risk/)
  await expect(row('2026-10-25')).toContainText('Domingo')
  await expect(row('2026-10-25')).not.toContainText(/en riesgo/i)
  await expect(page.getByTestId('risk-why')).toHaveCount(0)

  await page.locator('[data-act="select"][data-date="2026-10-27"]').click()
  await expect(row('2026-10-27')).toHaveClass(/risk/)
  await expect(row('2026-10-27').locator('.flag')).toHaveText('En riesgo')
  await expect(page.getByTestId('risk-why')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('el mes empieza en lunes y la contraseña no se repite', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await expect(page.locator('[data-act="select"][data-date="2026-10-24"]')).toContainText('sáb')
  await expect(page.locator('[data-act="select"][data-date="2026-10-23"]')).toContainText('Hoy')
  const select = page.locator('.days li button[data-act="select"]').first()
  await expect(select).toHaveCSS('appearance', 'none')
  await expect(page.locator('.days li.swipeable').first()).toHaveCSS('min-height', '64px')
  const bar = await page.locator('.days li.risk').first().evaluate((node) => getComputedStyle(node, '::before').zIndex)
  expect(bar).toBe('2')

  await page.getByRole('link', { name: 'Ajustes' }).click()
  await expect(page.getByRole('heading', { name: 'Tu cuenta' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Notificaciones' })).toBeVisible()
  await expect(page.getByText('Si mañana nadie se ha comprometido')).toBeVisible()
  await expect(page.locator('.notify-note')).toHaveText('Notificación push en este dispositivo a las 20:05 (requiere tener la app añadida a la pantalla de inicio)')
  await expect(page.getByText(/de lunes a sábado|sobre las 20:00/)).toHaveCount(0)
  await expect(page.locator('#current-password')).toHaveCount(0)
  await expect(page.locator('#new-password')).toHaveCount(0)
  await expect(page.getByTestId('open-password-screen')).toBeVisible()
  await page.getByTestId('open-password-screen').click()
  await expect(page.getByTestId('password-screen')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajustes' })).toBeVisible()
  await expect(page.getByLabel('Contraseña actual')).toHaveAttribute('name', 'current_password')
  await expect(page.getByLabel('Nueva contraseña')).toHaveAttribute('id', 'new-password')
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByTestId('ajustes')).toBeVisible()
  await expect(page.locator('#current-password')).toHaveCount(0)

  await page.getByRole('button', { name: 'Português' }).click()
  await page.getByRole('link', { name: 'Calendário' }).click()
  await expect(page.locator('[data-act="select"][data-date="2026-10-24"]')).toContainText('sáb')
  await expect(page.locator('[data-act="select"][data-date="2026-10-23"]')).toContainText('Hoje')
  expect(errors).toEqual([])
})

test('el calendario sigue y el deslizamiento avisa', async ({ page, viewport }) => {
  test.setTimeout(60_000)
  const errors = watchConsole(page)
  const phone = viewport?.width === 390
  await login(page, 'persona1@example.com')

  await page.getByRole('link', { name: 'Calendario' }).click()
  // Arriba quedan los 30 días anteriores: el primer mes es septiembre.
  await expect(page.getByTestId('cal-month-head').first()).toHaveText('Septiembre 2026')
  await expect(page.getByTestId('cal-month-head').first()).toHaveCSS('position', 'sticky')
  const first = page.locator('[data-testid="calendar"] li[data-date="2026-11-01"] .when')
  await expect(first).toContainText('dom')
  await expect(first).not.toContainText(/noviembre|octubre/)
  if (phone) {
    const layout = await page.evaluate(() => {
      const bad: string[] = []
      const check = () => {
        for (const li of document.querySelectorAll<HTMLElement>('[data-testid="calendar"] li')) {
          const row = li.getBoundingClientRect()
          if (row.width < 1 || row.top < 48 || row.bottom > window.innerHeight - 72) continue
          const num = li.querySelector('.num')?.getBoundingClientRect()
          const when = li.querySelector('.when')?.getBoundingClientRect()
          const commit = li.querySelector('.row-commit')?.getBoundingClientRect()
          const meta = li.querySelector('.meta')?.getBoundingClientRect()
          if (!num || !when || !commit || !meta) {
            bad.push(li.dataset.date ?? 'falta')
            continue
          }
          const left = Math.max(num.right, when.right)
          if (left > commit.left + 1 || commit.right > meta.left + 1) bad.push(li.dataset.date ?? '')
          const mid = (commit.left + commit.right) / 2
          if (mid < row.left + row.width * 0.28 || mid > row.left + row.width * 0.72) bad.push(`centro ${li.dataset.date}`)
        }
      }
      check()
      window.scrollBy(0, 280)
      check()
      return bad
    })
    expect(layout).toEqual([])
  }
  await page.evaluate(() => {
    const node = document.querySelector('.cal-month[data-month="2026-11"]')
    if (!node) return
    window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY)
  })
  await expect.poll(async () => page.evaluate(() => {
    const heads = [...document.querySelectorAll<HTMLElement>('.cal-month-head')]
    return heads.find((head) => {
      const rect = head.getBoundingClientRect()
      return rect.top >= -2 && rect.bottom > 0 && rect.top < 40
    })?.textContent ?? ''
  })).toBe('Noviembre 2026')
  const before = await page.locator('[data-testid="calendar"] li').count()
  expect(before).toBeGreaterThan(14)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const anchored = await page.evaluate(() => window.scrollY)
  expect(anchored).toBeGreaterThan(200)
  await expect.poll(() => page.locator('[data-testid="calendar"] li').count()).toBeGreaterThan(before)
  const stayed = await page.evaluate(() => window.scrollY)
  expect(stayed).toBeGreaterThan(anchored - 8)

  await page.evaluate(() => window.scrollTo(0, 0))
  const row = page.locator('[data-testid="calendar"] li[data-date="2026-10-26"]')
  await row.scrollIntoViewIfNeeded()
  const box = await row.boundingBox()
  if (!box) throw new Error('sin fila')
  const startX = Math.max(box.x + 48, 48)
  const y = box.y + box.height / 2
  await page.evaluate(() => {
    const mark = window as unknown as { __hapticDefault?: boolean | null; __switchHaptics?: number }
    mark.__hapticDefault = null
    mark.__switchHaptics = 0
    const click = HTMLLabelElement.prototype.click
    HTMLLabelElement.prototype.click = function () {
      if (this.parentNode === document.head && this.querySelector('input[switch]')) mark.__switchHaptics = (mark.__switchHaptics ?? 0) + 1
      return click.call(this)
    }
    document.querySelector('#app')?.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest('input[data-row-haptic]')) return
      mark.__hapticDefault = event.defaultPrevented
    })
  })
  // Safari da la vibración en el touchend: lo simulamos sobre la fila a mitad de gesto.
  const lift = (li: typeof row) => li.locator('input[data-row-haptic]').first().evaluate((node) => {
    node.dispatchEvent(new Event('touchend', { bubbles: true }))
  })
  const switchHaptics = () => page.evaluate(() => (window as unknown as { __switchHaptics?: number }).__switchHaptics ?? 0)
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + 36, y + 4, { steps: 6 })
  await expect(row).toHaveClass(/swiping-right/)
  await expect(row).not.toHaveClass(/swipe-armed/)
  await page.mouse.move(startX + 60, y + 4, { steps: 6 })
  await expect(row).not.toHaveClass(/swipe-armed/)
  await lift(row)
  expect(await switchHaptics()).toBe(0)
  await page.mouse.move(startX + 100, y + 4, { steps: 6 })
  await expect(row).toHaveClass(/swipe-armed/)
  await lift(row)
  expect(await switchHaptics()).toBe(1)
  await expect(row.locator('.swipe-under.right .swipe-cue')).toHaveText('✓')
  await expect(row.locator('.swipe-under.left .swipe-cue')).toHaveText('←')
  expect(await row.locator('.swipe-face').evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none')
  await page.mouse.move(startX + 20, y + 4, { steps: 6 })
  await expect(row).not.toHaveClass(/swipe-armed/)
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __hapticDefault?: boolean | null }).__hapticDefault)).toBe(false)
  await expect(row.locator('.num')).not.toHaveClass(/planned/)
  expect(await switchHaptics()).toBe(1)
  const quit = page.locator('[data-testid="calendar"] li[data-date="2026-10-24"]')
  await quit.scrollIntoViewIfNeeded()
  const quitBox = await quit.boundingBox()
  if (!quitBox) throw new Error('sin fila comprometida')
  const quitX = quitBox.x + quitBox.width - 36
  const quitY = quitBox.y + quitBox.height / 2
  await page.mouse.move(quitX, quitY)
  await page.mouse.down()
  await page.mouse.move(quitX - 60, quitY, { steps: 8 })
  await expect(quit).not.toHaveClass(/swipe-armed/)
  await page.mouse.move(quitX - 100, quitY, { steps: 6 })
  await expect(quit).toHaveClass(/swipe-armed/)
  await lift(quit)
  expect(await switchHaptics()).toBe(2)
  await expect(quit.locator('.swipe-under.left .swipe-cue')).toHaveText('✕')
  await expect(quit.locator('.swipe-under.right .swipe-cue')).toHaveText('→')
  expect(await quit.locator('.swipe-face').evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none')
  const armedFace = await quit.locator('.swipe-face').evaluate((node) => getComputedStyle(node).backgroundColor)
  const refreshed = page.waitForResponse((response) => response.url().includes('/rpc/estado') && response.ok())
  await page.evaluate(() => { (window as unknown as { __hapticDefault?: boolean | null }).__hapticDefault = null })
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __hapticDefault?: boolean | null }).__hapticDefault)).toBe(false)
  const drawn = await quit.locator('.swipe-face').elementHandle()
  await refreshed
  if (drawn) await expect.poll(() => drawn.evaluate((node) => node.isConnected).catch(() => false)).toBe(false)
  await expect(quit.locator('.num')).not.toHaveClass(/planned/)
  const afterFace = await quit.locator('.swipe-face').evaluate((node) => getComputedStyle(node).backgroundColor)
  const plainFace = await page.locator('[data-testid="calendar"] li:not(.selected):not(.is-today):not([data-kind="past"]) .swipe-face').first().evaluate((node) => getComputedStyle(node).backgroundColor)
  expect(armedFace).toBe(plainFace)
  expect(afterFace).toBe(plainFace)
  await page.evaluate(() => window.scrollTo(0, 0))
  const gap = await page.locator('.select-day').first().evaluate((node) => {
    const num = node.querySelector('.num')?.getBoundingClientRect()
    const when = node.querySelector('.when')?.getBoundingClientRect()
    const style = getComputedStyle(node)
    const plain = document.querySelector('.num:not(.gone):not(.past)')
    return { gap: style.gap, space: num && when ? when.left - num.right : 0, dashed: plain ? getComputedStyle(plain).borderTopStyle : '' }
  })
  expect(gap.gap).toBe('12px')
  expect(gap.space).toBeGreaterThanOrEqual(10)
  expect(gap.dashed).toBe('dashed')
  const headStyle = await page.getByTestId('cal-month-head').first().evaluate((node) => {
    const style = getComputedStyle(node) as CSSStyleDeclaration & { webkitBackdropFilter?: string }
    return {
      top: style.top,
      filter: style.backdropFilter || style.webkitBackdropFilter || '',
      padding: style.padding,
      border: style.borderBottomWidth,
      background: style.backgroundColor,
    }
  })
  expect(headStyle.top).toBe('0px')
  expect(headStyle.filter).not.toContain('blur')
  expect(headStyle.background).toBe('rgb(243, 235, 221)')
  expect(headStyle.padding).toBe('10px 4px 8px')
  expect(headStyle.border).toBe('0px')
  const mark = await page.evaluate(() => {
    window.scrollTo(0, 0)
    const node = document.querySelector('.top .brand-icon')
    if (!(node instanceof Element)) return { height: 0, top: 0, pad: '' }
    const box = node.getBoundingClientRect()
    const pad = getComputedStyle(node.parentElement as Element).paddingTop
    return { height: box.height, top: box.top, pad }
  })
  expect(mark.height).toBe(40)
  expect(mark.pad).toBe('20px')
  expect(mark.top).toBeGreaterThanOrEqual(20)
  expect(errors).toEqual([])
})

async function expectLens(page: Page, navKey: string) {
  await expect.poll(async () => page.evaluate((key) => {
    const link = document.querySelector(`nav.tabs a[data-nav="${key}"]`)
    const pill = document.querySelector('.tab-glass-pill')
    if (!(link instanceof Element) || !(pill instanceof Element)) return 1000
    const a = link.getBoundingClientRect()
    const b = pill.getBoundingClientRect()
    return Math.abs(a.left + a.width / 2 - (b.left + b.width / 2))
  }, navKey)).toBeLessThan(10)
}

test('la barra inferior vuelve arriba', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona1@example.com')
  await page.locator('nav.tabs a[data-nav="calendario"]').click()
  await expect(page.getByTestId('calendar')).toBeVisible()
  await expectLens(page, 'calendario')
  await page.evaluate(() => window.scrollTo(0, 520))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  await page.locator('nav.tabs a[data-nav="hoy"]').click()
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1200 }).toBe(0)
  await expectLens(page, 'hoy')
  await page.locator('nav.tabs a[data-nav="calendario"]').click()
  // En el calendario, el inicio es hoy: volver a tocar la pestaña lleva a hoy.
  const today = page.locator('[data-testid="calendar"] li.is-today')
  await expect(today).toBeInViewport()
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(today).not.toBeInViewport()
  await page.locator('nav.tabs a[data-nav="calendario"]').click()
  await expect(page.getByTestId('calendar')).toBeVisible()
  await expect(today).toBeInViewport()
  await expectLens(page, 'calendario')
  await page.locator('nav.tabs a[data-nav="intenciones"]').click()
  await page.getByRole('link', { name: /Por quienes no pueden salir de casa/ }).click()
  await expect(page.getByTestId('thread')).toBeVisible()
  await page.evaluate(() => { document.body.style.minHeight = '1800px' })
  await page.evaluate(() => window.scrollTo(0, 360))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  await page.locator('nav.tabs a[data-nav="intenciones"]').click()
  await expect(page.getByTestId('muro')).toBeVisible()
  await expect(page.getByTestId('thread')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1200 }).toBe(0)
  await expectLens(page, 'intenciones')
  expect(errors).toEqual([])
})

test('la lente sigue el dedo por la barra', async ({ page, browserName, viewport }) => {
  const errors = watchConsole(page)
  const shoot = shotHere(browserName, viewport)
  if (shoot) ensureShots()
  await login(page, 'persona1@example.com')
  await expectLens(page, 'hoy')
  if (shoot) await save(page, 'nav-cristal.png')
  await page.locator('nav.tabs a[data-nav="calendario"]').click()
  await expect(page.getByTestId('calendar')).toBeVisible()
  await expectLens(page, 'calendario')
  await page.evaluate(() => window.scrollTo(0, 640))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  const behind = await page.evaluate(() => {
    const bar = document.querySelector('nav.tabs')
    if (!(bar instanceof Element)) return false
    const nav = bar.getBoundingClientRect()
    return [...document.querySelectorAll('[data-testid="calendar"] li')].some((node) => {
      const row = node.getBoundingClientRect()
      return row.bottom > nav.top + 6 && row.top < nav.bottom - 6 && row.left < nav.right && row.right > nav.left
    })
  })
  expect(behind).toBe(true)
  if (shoot) await save(page, 'nav-cristal-scroll.png')
  const link = page.locator('nav.tabs a[data-nav="calendario"]')
  const linkBox = await link.boundingBox()
  const slot = await page.locator('.tab-glass-pill').evaluate((node) => node.getBoundingClientRect().width)
  if (!linkBox) throw new Error('sin barra')
  const startX = linkBox.x + linkBox.width / 2
  const y = linkBox.y + linkBox.height / 2
  const before = await page.locator('.tab-glass-pill').evaluate((node) => node.getBoundingClientRect().left)
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + slot * 1.2, y, { steps: 12 })
  const mid = await page.evaluate(() => {
    const pill = document.querySelector('.tab-glass-pill')
    const preview = document.querySelector('nav.tabs a.on')
    if (!(pill instanceof Element) || !(preview instanceof HTMLElement)) return { shift: 0, preview: '' }
    return { shift: pill.getBoundingClientRect().left, preview: preview.dataset.nav ?? '' }
  })
  expect(mid.shift - before).toBeGreaterThan(slot * 0.7)
  expect(mid.preview).toBe('intenciones')
  await page.mouse.up()
  await expect(page.getByTestId('muro')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1200 }).toBe(0)
  await expectLens(page, 'intenciones')
  await expect(page.locator('nav.tabs a[data-nav="intenciones"]')).toHaveAttribute('aria-current', 'page')
  expect(errors).toEqual([])
})

test('el toque no vuelve atrás, el botón es olivo y el uso queda escrito', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona12@example.com')
  const go = page.getByTestId('go')
  await expect(go).toBeVisible()
  expect(await go.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(30, 92, 56)')
  await page.evaluate(() => {
    ;(window as unknown as { __hero?: Element | null }).__hero = document.querySelector('[data-testid="hoy-hero"]')
  })
  const settled = page.waitForResponse((response) => response.url().includes('/rpc/estado') && response.ok())
  await expect(page.locator('#haptic-switch')).not.toBeChecked()
  await go.click()
  await expect(page.locator('#haptic-switch')).toBeChecked()
  await settled
  await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
  const same = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="hoy-hero"]')
    const held = (window as unknown as { __hero?: Element | null }).__hero
    return Boolean(node && held && node.isSameNode(held) && node.classList.contains('on'))
  })
  expect(same).toBe(true)
  const skip = page.getByRole('button', { name: 'Saltar la celebración' })
  if (await skip.isVisible()) await skip.click()
  await page.waitForTimeout(320)
  await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
  const still = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="hoy-hero"]')
    const held = (window as unknown as { __hero?: Element | null }).__hero
    return Boolean(node && held && node.isSameNode(held))
  })
  expect(still).toBe(true)

  await page.getByRole('link', { name: 'Calendario' }).click()
  await expect(page.getByTestId('calendar')).toBeVisible()
  await expect.poll(async () => {
    const rows = await usageRows(page)
    const names = rows.map((row) => row.event_name)
    const attend = rows.find((row) => row.event_name === 'attendance_toggle')
    const tab = rows.find((row) => row.event_name === 'tab_view' && row.props?.to === 'calendario')
    // Sin día ni si se marcó: el registro de uso no dice quién fue cuándo.
    return names.includes('app_open') && Boolean(tab) && attend?.props?.source === 'hoy_main' && !('date' in attend.props) && !('on' in attend.props)
  }).toBe(true)

  await page.goto('/misa-diaria/ajustes?plataforma=ios')
  const ios = page.getByTestId('install-guide')
  await expect(ios).toHaveAttribute('data-platform', 'ios')
  await expect(ios.locator('details.install-details')).not.toHaveAttribute('open')
  await expect(ios.getByText('Ver cómo instalar como app')).toBeVisible()
  const shots = ios.locator('img.install-shot')
  await expect(shots).toHaveCount(3)
  await expect(shots.first()).toBeHidden()
  await ios.getByText('Ver cómo instalar como app').click()
  await expect(ios.locator('details.install-details')).toHaveJSProperty('open', true)
  await expect(ios).toContainText('Añadir a pantalla de inicio')
  await expect(ios).toContainText('Añadir')
  await expect(ios).not.toContainText('Instalar aplicación')
  await expect(shots.first()).toBeVisible()
  await expect(shots.nth(0)).toHaveAttribute('src', /instalar-ios-1\.jpg$/)
  await expect(shots.nth(0)).toHaveAttribute('alt', 'Botón de compartir de Safari')
  await expect(shots.nth(1)).toHaveAttribute('src', /instalar-ios-2\.jpg$/)
  await expect(shots.nth(1)).toHaveAttribute('alt', 'Añadir a pantalla de inicio')
  await expect(shots.nth(2)).toHaveAttribute('src', /instalar-ios-3\.jpg$/)
  await expect(shots.nth(2)).toHaveAttribute('alt', 'Botón Añadir')
  await page.goto('/misa-diaria/ajustes?plataforma=android')
  const android = page.getByTestId('install-guide')
  await expect(android).toHaveAttribute('data-platform', 'android')
  await expect(android.locator('details.install-details')).not.toHaveAttribute('open')
  await android.getByText('Ver cómo instalar como app').click()
  await expect(android.locator('details.install-details')).toHaveJSProperty('open', true)
  await expect(android).toContainText('Instalar aplicación')
  await expect(android).toContainText('Añadir a pantalla de inicio')
  await expect(android).toContainText('Instalar')
  expect(errors).toEqual([])
})

test('sin cobertura, cada «He ido» que no se guarda vuelve atrás aunque se toque otro día', async ({ page }) => {
  await login(page, 'persona12@example.com')
  let seen = 0
  await page.route('**/rest/v1/attendance**', async (route) => {
    const method = route.request().method()
    if (method !== 'POST' && method !== 'DELETE') {
      await route.continue()
      return
    }
    seen += 1
    await new Promise((resolve) => setTimeout(resolve, 300))
    await route.abort()
  })
  try {
    const week = page.getByTestId('week')
    const first = week.locator('.week-day[data-date="2026-10-21"]')
    const second = week.locator('.week-day[data-date="2026-10-22"]')
    await expect(first.locator('small')).toHaveText('11')
    await expect(second.locator('small')).toHaveText('11')
    await first.click()
    await second.click()
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await expect(second).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => seen).toBe(2)
    // Los dos fallan: los dos vuelven a como estaban, con su cuenta.
    await expect(week.locator('.week-day[data-date="2026-10-21"]')).toHaveAttribute('aria-pressed', 'false')
    await expect(week.locator('.week-day[data-date="2026-10-22"]')).toHaveAttribute('aria-pressed', 'false')
    await expect(week.locator('.week-day[data-date="2026-10-21"] small')).toHaveText('11')
    await expect(week.locator('.week-day[data-date="2026-10-22"] small')).toHaveText('11')
    await expect(page.getByText('No se ha guardado. Prueba otra vez.')).toBeVisible()
  } finally {
    await page.unroute('**/rest/v1/attendance**').catch(() => undefined)
  }
})

test('marcar es inmediato y el resorte queda', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona12@example.com')
  let release: () => void = () => {}
  let gate = new Promise<void>((resolve) => { release = resolve })
  let seen = 0
  await page.route('**/rest/v1/attendance**', async (route) => {
    const method = route.request().method()
    if (method !== 'POST' && method !== 'DELETE') {
      await route.continue()
      return
    }
    seen += 1
    await gate
    await route.continue()
  })
  try {
    // Ayer en «Estos días»: se marca al momento, antes de que responda el servidor.
    const yesterday = page.getByTestId('week').locator('.week-day[data-date="2026-10-22"]')
    await expect(yesterday.locator('small')).toHaveText('11')
    await yesterday.click()
    await expect(yesterday).toHaveAttribute('aria-pressed', 'true')
    await expect(yesterday.locator('small')).toHaveText('12')
    await expect.poll(() => seen).toBe(1)
    const letGo = release
    gate = new Promise<void>((resolve) => { release = resolve })
    const refreshed = page.waitForResponse((response) => response.url().includes('/rpc/estado') && response.ok())
    letGo()
    await refreshed
    const skipPast = page.getByRole('button', { name: 'Saltar la celebración' })
    if (await skipPast.isVisible()) await skipPast.click()

    const go = page.getByTestId('go')
    await expect(go).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('hoy-status')).toHaveText('Hoy · Pendiente de marcar')
    expect(await go.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(30, 92, 56)')
    await page.evaluate(() => {
      const held = document.querySelector('[data-testid="hoy-hero"]')
      ;(window as unknown as { __hero?: Element | null }).__hero = held
    })
    await go.click()
    await expect(go).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
    await expect(page.locator('.hoy-hero')).toHaveClass(/\bon\b/)
    await expect.poll(() => seen).toBe(2)
    const settled = page.waitForResponse((response) => response.url().includes('/rpc/estado') && response.ok())
    release()
    await settled
    const skipNow = page.getByRole('button', { name: 'Saltar la celebración' })
    if (await skipNow.isVisible()) await skipNow.click()
    const sameHero = await page.evaluate(() => {
      const node = document.querySelector('[data-testid="hoy-hero"]')
      const held = (window as unknown as { __hero?: Element | null }).__hero
      return Boolean(node && held && node.isSameNode(held) && node.classList.contains('on'))
    })
    expect(sameHero).toBe(true)
    await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
  } finally {
    release()
    await page.unroute('**/rest/v1/attendance**').catch(() => undefined)
  }

  await page.getByRole('link', { name: 'Calendario' }).click()
  const lienzo = await page.getByTestId('cal-month-head').first().evaluate((node) => getComputedStyle(node).backgroundColor)
  expect(lienzo).toBe('rgb(243, 235, 221)')
  expect(errors).toEqual([])
})

test('capturas del teléfono', async ({ page, browserName, viewport }) => {
  test.setTimeout(120_000)
  test.skip(browserName !== 'webkit' || viewport?.width !== 390)
  const errors = watchConsole(page)
  ensureShots()
  await page.goto('/misa-diaria/')
  await page.getByLabel('Tu correo').waitFor()
  await save(page, 'login-es.png')
  await login(page, 'persona12@example.com')
  await page.getByTestId('go').waitFor()
  await expect(page.getByTestId('go').locator('.vence, .piece')).toHaveCount(0)
  await expect(page.getByTestId('go')).not.toHaveClass(/\bon\b/)
  await expect(page.locator('.hoy-hero')).toHaveClass(/estado-a/)
  await expect(page.getByTestId('hoy-status')).toHaveText('Hoy · Pendiente de marcar')
  expect(await page.getByTestId('go').evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(30, 92, 56)')
  const weekInView = await page.getByTestId('week').evaluate((node) => {
    const bar = document.querySelector('nav.tabs')?.getBoundingClientRect().top ?? window.innerHeight
    const box = node.getBoundingClientRect()
    return box.top >= 0 && box.bottom <= bar && box.height > 40
  })
  expect(weekInView).toBe(true)
  await save(page, 'hoy.png')
  await page.evaluate(() => window.scrollTo(0, 0))
  await save(page, 'estado-a-off.png')
  await page.getByTestId('go').click()
  await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
  const skip = page.getByRole('button', { name: 'Saltar la celebración' })
  if (await skip.isVisible()) await skip.click()
  await expect(page.getByTestId('go')).toHaveClass(/\bon\b/)
  await expect(page.getByTestId('go')).toHaveClass(/go-secondary/)
  await expect(page.getByTestId('go')).toContainText('Desmarcar')
  await expect(page.getByTestId('go')).toContainText('Has ido a Misa')
  await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
  await expect(page.getByTestId('go').locator('.vence, .piece')).toHaveCount(0)
  await page.waitForTimeout(280)
  await save(page, 'hoy-on.png')
  await save(page, 'estado-a-on.png')
  await save(page, 'nav-es.png')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByTestId('calendar').waitFor()
  await page.evaluate(() => {
    const node = document.activeElement
    if (node instanceof HTMLElement) node.blur()
  })
  await save(page, 'calendario.png')
  await page.evaluate(() => {
    const node = document.querySelector('.cal-month[data-month="2026-11"]')
    if (!node) return
    window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY)
  })
  await expect(page.getByTestId('cal-month-head').nth(1)).toBeVisible()
  await save(page, 'calendario-noviembre.png')
  await page.evaluate(() => window.scrollTo(0, 0))
  const suave = page.locator('[data-testid="calendar"] li:not([data-kind="past"])').nth(1)
  await suave.scrollIntoViewIfNeeded()
  const suaveBox = await suave.boundingBox()
  if (!suaveBox) throw new Error('sin fila')
  const startX = Math.max(suaveBox.x + 48, 48)
  const y = suaveBox.y + suaveBox.height / 2
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + 60, y, { steps: 6 })
  await expect(suave).not.toHaveClass(/swipe-armed/)
  await save(page, 'swipe-suave.png')
  await page.mouse.move(startX + 100, y, { steps: 6 })
  await save(page, 'swipe-armado.png')
  const committed = await page.locator('[data-testid="calendar"] li:not([data-kind="past"])').nth(1).getAttribute('data-committed')
  const settled = committed === 'true'
    ? Promise.resolve()
    : page.waitForResponse((response) => response.url().includes('/rpc/estado'))
  await page.mouse.up()
  await settled
  await expect(page.locator('[data-testid="calendar"] li:not([data-kind="past"])').nth(1).locator('.num')).toHaveClass(/planned/)
  const quitar = page.locator('[data-testid="calendar"] li:not([data-kind="past"])').nth(1)
  const quitarBox = await quitar.boundingBox()
  if (!quitarBox) throw new Error('sin fila para quitar')
  const quitarX = quitarBox.x + quitarBox.width - 28
  const quitarY = quitarBox.y + quitarBox.height / 2
  await page.mouse.move(quitarX, quitarY)
  await page.mouse.down()
  await page.mouse.move(quitarX - 100, quitarY, { steps: 8 })
  await expect(quitar.locator('.swipe-under.left .swipe-cue')).toHaveText('✕')
  await save(page, 'swipe-quitar.png')
  await page.mouse.up()
  const laterDate = '2026-11-08'
  await expect.poll(async () => page.evaluate((iso) => {
    const node = document.querySelector(`[data-testid="calendar"] li[data-date="${iso}"]`)
    if (!(node instanceof HTMLElement)) {
      window.scrollBy(0, Math.round(window.innerHeight * 0.7))
      return false
    }
    const rect = node.getBoundingClientRect()
    const topLimit = 48
    const bottomLimit = window.innerHeight - 72
    if (rect.height > 0 && rect.top >= topLimit - 2 && rect.bottom <= bottomLimit + 2) return true
    const delta = rect.top < topLimit ? rect.top - topLimit : rect.bottom - bottomLimit
    window.scrollBy(0, Math.abs(delta) < 1 ? Math.sign(delta) || 1 : delta)
    return false
  }, laterDate)).toBe(true)
  const later = page.locator(`[data-testid="calendar"] li[data-date="${laterDate}"]`)
  await expect(later).toBeVisible()
  const pastFortnight = await page.evaluate((iso) => {
    const dates = [...document.querySelectorAll('[data-testid="calendar"] li')].map((li) => li.getAttribute('data-date') ?? '')
    return dates.length > 14 && dates.indexOf(iso) >= 14
  }, laterDate)
  expect(pastFortnight).toBe(true)
  await save(page, 'calendario-mas-dias.png')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.locator('[data-act="select"][data-date="2026-10-24"]').click()
  await page.evaluate(() => {
    const node = document.activeElement
    if (node instanceof HTMLElement) node.blur()
    document.querySelector('[data-date="2026-10-24"]')?.closest('li')?.scrollIntoView({ block: 'center' })
  })
  await save(page, 'calendario-dia.png')
  await page.getByRole('link', { name: 'Intenciones' }).click()
  await page.getByText('Por quienes no pueden salir de casa.').waitFor()
  await save(page, 'intenciones-es.png')
  await page.getByRole('link', { name: /Por quienes no pueden salir de casa/ }).click()
  await page.getByTestId('thread').waitFor()
  await save(page, 'intencion-detalle-es.png')
  await page.getByRole('link', { name: 'Volver a intenciones' }).click()
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await page.getByTestId('ajustes').waitFor()
  await expect(page.locator('#current-password')).toHaveCount(0)
  await expect(page.getByTestId('open-password-screen')).toBeVisible()
  await save(page, 'ajustes-es.png')
  await page.getByTestId('open-password-screen').click()
  await expect(page.getByTestId('password-screen')).toBeVisible()
  await expect(page.locator('#current-password')).toBeVisible()
  await save(page, 'ajustes-contrasena.png')
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.goto('/misa-diaria/ajustes?plataforma=ios')
  const guide = page.getByTestId('install-guide')
  await expect(guide.locator('details.install-details')).not.toHaveAttribute('open')
  await expect(guide.getByText('Ver cómo instalar como app')).toBeVisible()
  await guide.locator('summary').evaluate((node) => node.scrollIntoView({ block: 'center' }))
  await save(page, 'ajustes-instalar-plegado.png')
  await guide.getByText('Ver cómo instalar como app').click()
  await expect(guide.locator('details.install-details')).toHaveJSProperty('open', true)
  await expect(guide).toContainText('Añadir a pantalla de inicio')
  await expect(guide).not.toContainText('Instalar aplicación')
  await expect(guide.locator('img.install-shot')).toHaveCount(3)
  await expect.poll(() => guide.locator('img.install-shot').evaluateAll((nodes) => nodes.every((node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0))).toBe(true)
  await guide.evaluate((node) => {
    const top = node.getBoundingClientRect().top + window.scrollY
    window.scrollTo(0, Math.max(0, top - 4))
  })
  const shotsInView = await guide.locator('img.install-shot').evaluateAll((nodes) => {
    const bar = document.querySelector('nav.tabs')?.getBoundingClientRect().top ?? window.innerHeight
    return nodes.every((node) => {
      const box = node.getBoundingClientRect()
      return box.height > 40 && box.top >= 0 && box.bottom <= bar + 1
    })
  })
  expect(shotsInView).toBe(true)
  await save(page, 'ajustes-instalar-ios.png')
  await page.goto('/misa-diaria/ajustes?plataforma=android')
  const androidGuide = page.getByTestId('install-guide')
  await androidGuide.getByText('Ver cómo instalar como app').click()
  await expect(androidGuide.locator('details.install-details')).toHaveJSProperty('open', true)
  await expect(androidGuide).toContainText('Instalar aplicación')
  await expect(androidGuide).toContainText('Añadir a pantalla de inicio')
  await androidGuide.evaluate((node) => node.scrollIntoView({ block: 'start' }))
  await save(page, 'ajustes-instalar-android.png')
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByLabel('Tu correo')).toBeVisible()
  await scene('diez')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await login(page, 'persona10@example.com')
  const go = page.getByTestId('go')
  await expect(go).toHaveText('He ido a Misa')
  await page.evaluate(() => {
    const original = window.setTimeout
    window.setTimeout = ((handler, timeout, ...args) => {
      return original(handler, timeout === 1200 ? 60_000 : timeout, ...args)
    }) as typeof window.setTimeout
  })
  await go.dispatchEvent('click')
  await expect(page.getByTestId('celeb-line')).toHaveText('10 misas hoy', { timeout: 20_000 })
  await save(page, 'celebracion.png')
  expect(errors).toEqual([])
})

test('en portugués se ven las sequências y el calendario', async ({ page, browserName, viewport }) => {
  const errors = watchConsole(page)
  const shoot = shotHere(browserName, viewport)
  if (shoot) ensureShots()
  await login(page, 'persona12@example.com')
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: 'Português' }).click()
  await expect(page.getByRole('heading', { name: 'Definições' })).toBeVisible()
  await page.getByRole('link', { name: 'Hoje' }).click()
  await expect(page.getByTestId('hoy-date')).toHaveText('Sexta-feira, 23 de outubro de 2026')
  await expect(page.getByRole('heading', { name: 'Sequências' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Estes dias' })).toBeVisible()
  await expect(page.getByTestId('week-calendar')).toHaveText('Ver calendário →')
  await expect(page.getByTestId('total')).toContainText('Total de Missas do curso')
  await expect(page.getByTestId('go')).toContainText('Fui à Missa')
  await expect(page.getByTestId('risk')).toHaveCount(0)
  await expect(page.locator('.streaks li')).toHaveCount(0)
  await expect(page.getByText(/matrimónio|matrimónio|Falta/)).toHaveCount(0)
  if (shoot) await save(page, 'hoy-pt.png')
  await page.getByRole('link', { name: 'Calendário' }).click()
  await expect(page.getByTestId('calendar')).toContainText('de 12')
  await expect(page.getByTestId('calendar')).not.toContainText('de 6')
  await expect(page.getByTestId('cal-month-head').first()).toHaveText('Setembro 2026')
  await expect(page.getByTestId('earlier-days')).toHaveText('Dias anteriores')
  await expect(page.getByText(/Falta|matrimónio/)).toHaveCount(0)
  if (shoot) await save(page, 'calendario-pt.png')
  await page.getByRole('link', { name: 'Definições' }).click()
  await expect(page.getByRole('button', { name: 'Português' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: 'Notificações' })).toBeVisible()
  await expect(page.getByText('Se amanhã ninguém se tiver comprometido')).toBeVisible()
  await expect(page.locator('.notify-note')).toHaveText('Notificação push neste dispositivo às 20:05 (requer a aplicação adicionada ao ecrã principal)')
  if (shoot) await save(page, 'ajustes-pt.png')
  expect(errors).toEqual([])
})

test('el muro abre la intención y las reacciones', async ({ page, browserName, viewport }) => {
  test.setTimeout(60_000)
  const errors = watchConsole(page)
  const shoot = shotHere(browserName, viewport)
  if (shoot) ensureShots()
  await scene('muro-es')
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Intenciones' }).click()
  await expect(page.getByLabel('Comparte aquí tu intención')).toBeVisible()
  await expect(page.locator('.notes .wall-time').nth(0)).toHaveText(/Hoy · \d{1,2}:\d{2}/)
  await expect(page.locator('.notes .wall-time').nth(1)).toHaveText(/Ayer · \d{1,2}:\d{2}/)
  expect(await page.locator('.wall-open').first().evaluate((node) => {
    if (node instanceof HTMLElement) node.focus()
    return getComputedStyle(node).backgroundColor
  })).toBe('rgba(0, 0, 0, 0)')
  await expect(page.locator('nav a')).toHaveCount(4)
  await expect(page.getByRole('link', { name: '2 comentarios' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Comentar' })).toHaveCount(0)
  await expect(page.locator('.reply')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '🕯️' })).toHaveCount(0)
  const react = page.getByRole('button', { name: '🙏, 2' })
  await expect(react).toHaveClass(/on/)
  const box = await react.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
  if (shoot) await save(page, 'intenciones-es.png')
  await page.getByRole('link', { name: '2 comentarios' }).click()
  await expect(page).toHaveURL(/\/muro\/[0-9a-f-]{36}$/i)
  await expect(page.getByTestId('thread')).toBeVisible()
  await expect(page.locator('.reply')).toBeVisible()
  await expect(page.locator('.comments .wall-time').first()).toHaveText(/Hoy · \d{1,2}:\d{2}/)
  await expect(page.locator('nav a')).toHaveCount(4)
  const link = page.getByTestId('thread').locator('.comments .text-link').first()
  const paint = await link.evaluate((node) => {
    const style = getComputedStyle(node)
    return { background: style.backgroundColor, size: style.fontSize, border: style.borderTopStyle }
  })
  expect(paint.size).toBe('13px')
  expect(paint.background).toBe('rgba(0, 0, 0, 0)')
  expect(paint.border).toBe('none')
  const gap = await page.getByTestId('thread').locator('.comments li').evaluateAll((nodes) => {
    if (nodes.length < 2) return 0
    return nodes[1].getBoundingClientRect().top - nodes[0].getBoundingClientRect().bottom
  })
  expect(gap).toBeGreaterThanOrEqual(16)
  if (shoot) await save(page, 'intencion-detalle-es.png')
  await page.getByRole('link', { name: 'Volver a intenciones' }).click()
  await expect(page.locator('.reply')).toHaveCount(0)
  await page.getByRole('button', { name: 'Añadir reacción' }).first().click()
  await expect(page.getByTestId('emoji-sheet')).toBeVisible()
  await expect(page.getByRole('button', { name: '🙏', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '⛪', exact: true })).toBeVisible()
  const search = page.locator('#emoji-search')
  await expect(search).toHaveAttribute('placeholder', 'Buscar emoji (rezar, pray, coração, fuego…)')
  await search.fill('rezar')
  await expect(page.getByRole('button', { name: '🙏', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '😀', exact: true })).toHaveCount(0)
  if (shoot) await save(page, 'emoji-buscar-es.png')
  await search.fill('🌿')
  await expect(page.getByRole('button', { name: '🌿, 1' })).toBeVisible()
  await expect(page.getByTestId('emoji-sheet')).toHaveCount(0)

  await scene('muro-pt')
  await page.goto('/misa-diaria/')
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: 'Português' }).click()
  await page.getByRole('link', { name: 'Intenções' }).click()
  await expect(page.getByText('Por quem não pode sair de casa.')).toBeVisible()
  await expect(page.getByText('Por quienes no pueden salir de casa.')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '2 comentários' })).toBeVisible()
  await expect(page.locator('.reply')).toHaveCount(0)
  if (shoot) await save(page, 'muro-pt.png')
  await page.getByRole('link', { name: '2 comentários' }).click()
  await expect(page.locator('.comments .wall-time').first()).toHaveText(/Hoje · \d{1,2}:\d{2}/)
  await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Apagar' })).toHaveCount(2)
  if (shoot) await save(page, 'muro-detalle-pt.png')
  await page.getByRole('button', { name: 'Adicionar reação' }).first().click()
  await expect(page.getByTestId('emoji-sheet')).toBeVisible()
  if (shoot) await save(page, 'muro-emoji-pt.png')
  expect(errors).toEqual([])
})

test('volver al muro cierra la intención después de comentar', async ({ page }) => {
  const errors = watchConsole(page)
  await scene('muro-es')
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Intenciones' }).click()
  await page.getByRole('link', { name: '2 comentarios' }).click()
  await page.getByLabel('Un comentario').fill('Una línea más.')
  await page.getByRole('button', { name: 'Publicar' }).click()
  await expect(page.getByText('Una línea más.')).toBeVisible()
  const back = page.getByRole('link', { name: 'Volver a intenciones' })
  const box = await back.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await back.evaluate((node) => getComputedStyle(node).display)).toBe('inline-flex')
  await back.click()
  await expect(page.getByTestId('muro')).toBeVisible()
  await expect(page.locator('.reply')).toHaveCount(0)
  await expect(page.getByText('Por quienes no pueden salir de casa.')).toBeVisible()
  await expect(page).toHaveURL(/\/muro\/?$/)
  expect(errors).toEqual([])
})

test('un gesto vuelve atrás sin robar el escrito', async ({ page }) => {
  const errors = watchConsole(page)
  await scene('muro-es')
  await login(page, 'persona1@example.com')
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  await page.getByRole('link', { name: 'Intenciones' }).click()
  await page.getByRole('link', { name: '2 comentarios' }).click()
  await expect(page.getByTestId('thread')).toBeVisible()
  const thread = await page.getByTestId('thread').boundingBox()
  if (!thread) throw new Error('sin hilo')
  const y = thread.y + 36
  await page.mouse.move(thread.x + 24, y)
  await page.mouse.down()
  await page.mouse.move(thread.x + 200, y + 8, { steps: 12 })
  await page.mouse.up()
  await expect(page.getByTestId('muro')).toBeVisible()
  await expect(page.locator('.reply')).toHaveCount(0)

  await page.getByRole('link', { name: '2 comentarios' }).click()
  const field = page.getByLabel('Un comentario')
  await field.fill('Sigue escrito')
  const fieldBox = await field.boundingBox()
  if (!fieldBox) throw new Error('sin campo')
  await page.mouse.move(fieldBox.x + 16, fieldBox.y + 16)
  await page.mouse.down()
  await page.mouse.move(fieldBox.x + 140, fieldBox.y + 18, { steps: 8 })
  await page.mouse.up()
  await expect(field).toHaveValue('Sigue escrito')
  await expect(page.getByTestId('thread')).toBeVisible()

  const body = await page.getByTestId('thread').boundingBox()
  if (!body) throw new Error('sin hilo')
  await page.mouse.move(body.x + 80, body.y + 28)
  await page.mouse.down()
  await page.mouse.move(body.x + 88, body.y + 150, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByTestId('muro')).toBeVisible()

  await page.getByRole('button', { name: 'Añadir reacción' }).first().click()
  const sheet = await page.getByTestId('emoji-sheet').boundingBox()
  if (!sheet) throw new Error('sin hoja')
  await page.mouse.move(sheet.x + 36, sheet.y + 150)
  await page.mouse.down()
  await page.mouse.move(sheet.x + 42, sheet.y + 250, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('emoji-sheet')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('el borde derecho vuelve y un tirón recarga', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona1@example.com')
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  await page.getByRole('link', { name: 'Calendario' }).click()
  await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()
  await page.mouse.move(16, 180)
  await page.mouse.down()
  await page.mouse.move(170, 188, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()

  await page.route('**/rest/v1/rpc/estado', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.continue()
  })
  await page.mouse.move(200, 160)
  await page.mouse.down()
  await page.mouse.move(206, 280, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByTestId('refreshing')).toBeVisible()
  await expect(page.getByTestId('refreshing')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('se edita la intención propia y el comentario propio', async ({ page }) => {
  const errors = watchConsole(page)
  await scene('muro-es')
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Intenciones' }).click()
  await page.getByRole('link', { name: '2 comentarios' }).click()
  await page.getByRole('button', { name: 'Editar' }).first().click()
  const field = page.locator('.editor textarea')
  await expect(field).toHaveValue('Por quienes no pueden salir de casa.')
  await field.fill('Una intención revisada.')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Una intención revisada.')).toBeVisible()
  await expect(page.locator('.editor')).toHaveCount(0)
  const commentEdit = page.getByTestId('thread').locator('.comments .mine-actions').getByRole('button', { name: 'Editar' })
  await commentEdit.click()
  const comment = page.locator('.comments .editor textarea')
  await expect(comment).toHaveValue('Yo también.')
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByText('Yo también.')).toBeVisible()
  expect(errors).toEqual([])
})

test('la contraseña se guarda y el comentario de feedback entra', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await expect(page.locator('#current-password')).toHaveCount(0)
  await page.getByTestId('open-password-screen').click()
  await expect(page.getByTestId('password-screen')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajustes' })).toBeVisible()
  await page.locator('#current-password').fill('erronea')
  await page.locator('#new-password').fill('secreto')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByTestId('password-error')).toHaveText('La contraseña actual no es correcta')
  await page.locator('#current-password').fill('misa-2026')
  await page.locator('#new-password').fill('secreto')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByTestId('password-saved')).toHaveText('Contraseña guardada.')
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByTestId('ajustes')).toBeVisible()
  await page.locator('#feedback').fill('Una nota breve.')
  await page.getByRole('button', { name: 'Enviar comentario' }).click()
  await expect(page.getByTestId('feedback-thanks')).toHaveText('¡Gracias! Se ha enviado.')
  const unexpected = errors.filter((error) => !/status of 400/i.test(error))
  expect(unexpected).toEqual([])
})

test('deslizar en cambiar contraseña vuelve a ajustes y no a intenciones', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona1@example.com')
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  const swipe = async (fromX: number, toX: number) => {
    await page.getByRole('link', { name: 'Intenciones' }).click()
    await expect(page.getByTestId('muro')).toBeVisible()
    await page.getByRole('link', { name: 'Ajustes' }).click()
    await expect(page.getByTestId('ajustes')).toBeVisible()
    await page.getByTestId('open-password-screen').click()
    await expect(page.getByTestId('password-screen')).toBeVisible()
    await expect(page).toHaveURL(/\/ajustes/)
    await page.mouse.move(fromX, 240)
    await page.mouse.down()
    await page.mouse.move(toX, 246, { steps: 10 })
    await page.mouse.up()
    await expect(page.getByTestId('password-screen')).toHaveCount(0)
    await expect(page.getByTestId('ajustes')).toBeVisible()
    await expect(page.getByTestId('muro')).toHaveCount(0)
    await expect(page).toHaveURL(/\/ajustes/)
  }
  await swipe(240, 140)
  await swipe(20, 120)
  expect(errors).toEqual([])
})

test('un comentario no sube la intención vieja', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Intenciones' }).click()
  const bodies = page.locator('.notes article p')
  await expect(bodies.nth(0)).toHaveText('Por quienes no pueden salir de casa.')
  await expect(bodies.nth(1)).toHaveText('Por la paz en casa.')
  await page.getByRole('link', { name: /Por la paz en casa/ }).click()
  await page.getByLabel('Un comentario').fill('Sigue abajo.')
  await page.getByRole('button', { name: 'Publicar' }).click()
  await expect(page.getByText('Sigue abajo.')).toBeVisible()
  await page.getByRole('link', { name: 'Volver a intenciones' }).click()
  await expect(page.locator('.notes article p').nth(0)).toHaveText('Por quienes no pueden salir de casa.')
  await expect(page.locator('.notes article p').nth(1)).toHaveText('Por la paz en casa.')
  expect(errors).toEqual([])
})

test('un gesto en el calendario apunta y quita el voy', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  const day = (date: string) => page.locator(`[data-act="select"][data-date="${date}"] .num`)
  const drag = async (date: string, dx: number, dy = 6) => {
    const button = page.locator(`[data-act="select"][data-date="${date}"]`)
    const row = page.locator(`[data-testid="calendar"] li[data-date="${date}"]`)
    let box: { x: number; y: number; width: number; height: number } | null = null
    let host: { x: number; y: number; width: number; height: number } | null = null
    // Un refresco sustituye la fila entre dos lecturas. Guardamos la caja
    // solo cuando dos lecturas seguidas coinciden.
    await expect.poll(async () => {
      const next = await button.boundingBox()
      const rowBox = await row.boundingBox()
      const stable = Boolean(box && next && Math.abs(box.y - next.y) < 1 && next.width > 20 && rowBox)
      box = next
      host = rowBox
      return stable && next ? next.width : 0
    }).toBeGreaterThan(20)
    if (!box) throw new Error('sin día')
    const startX = dx < 0 && host ? host.x + host.width - 40 : Math.max(box.x + 24, 48)
    const y = box.y + box.height / 2
    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(startX + dx, y + dy, { steps: 12 })
    await page.mouse.up()
  }
  await expect(day('2026-10-26')).not.toHaveClass(/planned/)
  await drag('2026-10-26', 40)
  await expect(day('2026-10-26')).not.toHaveClass(/planned/)
  await drag('2026-10-26', 120)
  await expect(day('2026-10-26')).toHaveClass(/planned/)
  await expect(day('2026-10-24')).toHaveClass(/planned/)
  await drag('2026-10-24', -120)
  await expect(day('2026-10-24')).not.toHaveClass(/planned/)
  await drag('2026-10-27', -120)
  await expect(day('2026-10-27')).not.toHaveClass(/planned/)
  await drag('2026-10-27', 8, 40)
  await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible()
  await expect(day('2026-10-27')).not.toHaveClass(/planned/)
  expect(errors).toEqual([])
})

test('captura del calendario en el escritorio', async ({ page, browserName, viewport }) => {
  test.skip(browserName !== 'chromium' || viewport?.width !== 1280)
  ensureShots()
  await login(page, 'persona12@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByTestId('day').waitFor()
  await save(page, 'calendario-escritorio.png')
})

async function clearOfBar(page: Page, locator: ReturnType<Page['locator']>) {
  await locator.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }))
}

async function save(page: Page, name: string) {
  await writeShot(page, name, 'disabled')
}

async function saveLive(page: Page, name: string) {
  await writeShot(page, name, 'allow')
}

async function writeShot(page: Page, name: string, animations: 'disabled' | 'allow') {
  const path = `${shots}/${name}`
  await page.screenshot({ path, animations })
  const bytes = readFileSync(path)
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(bytes.length).toBeGreaterThan(8_000)
  const view = page.viewportSize()
  if (view?.width === 390 && view.height === 844) {
    expect(bytes.readUInt32BE(16)).toBe(390)
    expect(bytes.readUInt32BE(20)).toBe(844)
  }
}

test('una contraseña mal escrita lo dice claro', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/misa-diaria/')
  await page.getByLabel('Tu correo').fill('persona1@example.com')
  await page.locator('#password').fill('otra-cosa')
  await page.locator('#password').press('Enter')
  await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible()
  await expect(page.getByText('Ese código no vale. Pide otro.')).toHaveCount(0)
  await page.locator('#password').fill('abc')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByText('La contraseña tiene al menos 6 caracteres.')).toBeVisible()
  expect(errors.filter((error) => !/failed to load resource|400/i.test(error))).toEqual([])
})

test('entrar con código ofrece crear contraseña y deja seguir sin ella', async ({ page }) => {
  await page.goto('/misa-diaria/')
  await page.getByLabel('Tu correo').fill('persona3@example.com')
  await page.getByRole('button', { name: /olvidaste la contraseña/ }).click()
  await page.getByRole('button', { name: 'Enviar código' }).click()
  const code = await codeFor('persona3@example.com')
  await page.getByLabel('Código').fill(code)
  await page.getByLabel('Código').press('Enter')
  await expect(page.getByRole('heading', { name: 'Crea tu contraseña' })).toBeVisible()
  await page.getByRole('button', { name: 'Ahora no' }).click()
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  await expect(page.getByTestId('go')).toBeVisible()
})

test('marcar hoy sube el total del curso al momento y se queda al volver', async ({ page }) => {
  await login(page, 'persona12@example.com')
  const total = page.getByTestId('total-num')
  await expect(page.getByTestId('hoy-status')).toHaveText('Hoy · Pendiente de marcar')
  const before = Number(await total.textContent())
  await page.getByTestId('go').click()
  await expect(total).toHaveText(String(before + 1))
  await page.reload()
  await expect(page.getByTestId('total-num')).toHaveText(String(before + 1))
  await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
})

test('dos «Voy a ir» seguidos quedan los dos', async ({ page }) => {
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByTestId('calendar').waitFor()
  const dates = await page.locator('.row-commit[data-act="commit"][aria-pressed="false"]').evaluateAll((nodes) => nodes.slice(1, 3).map((node) => (node as HTMLElement).dataset.date ?? ''))
  expect(dates.length).toBe(2)
  await page.route('**/rest/v1/commitments**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    await route.continue()
  })
  await page.locator(`.row-commit[data-date="${dates[0]}"]`).click()
  await page.locator(`.row-commit[data-date="${dates[1]}"]`).click()
  for (const date of dates) await expect(page.locator(`.row-commit[data-date="${date}"]`)).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(900)
  await page.unroute('**/rest/v1/commitments**')
  await page.reload()
  await page.getByTestId('calendar').waitFor()
  for (const date of dates) await expect(page.locator(`.row-commit[data-date="${date}"]`)).toHaveAttribute('aria-pressed', 'true')
})

test('borrar una intención se puede deshacer', async ({ page }) => {
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Intenciones' }).click()
  const text = 'Por quienes no pueden salir de casa.'
  await page.getByRole('link', { name: /Por quienes no pueden salir de casa/ }).click()
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByTestId('toast')).toContainText('Intención eliminada')
  await expect(page.getByText(text)).toHaveCount(0)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByText(text)).toBeVisible()
  await page.reload()
  await expect(page.getByText(text)).toBeVisible()
  await page.getByRole('link', { name: /Por quienes no pueden salir de casa/ }).click()
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 9000 })
  await page.reload()
  await expect(page.getByTestId('muro')).toBeVisible()
  await expect(page.getByText(text)).toHaveCount(0)
})

test('si publicar falla, lo escrito sigue ahí', async ({ page }) => {
  await login(page, 'persona2@example.com')
  await page.getByRole('link', { name: 'Intenciones' }).click()
  const publish = page.getByTestId('muro').getByRole('button', { name: 'Publicar' })
  await expect(publish).toBeDisabled()
  await page.route('**/rest/v1/intentions', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()))
  await page.locator('#intention').fill('Por la salud de mi madre <3')
  await publish.click()
  await expect(page.getByText('No se ha guardado. Prueba otra vez.')).toBeVisible()
  await expect(page.locator('#intention')).toHaveValue('Por la salud de mi madre <3')
  await page.unroute('**/rest/v1/intentions')
  await page.getByTestId('muro').getByRole('button', { name: 'Publicar' }).click()
  await expect(page.locator('.notes').getByText('Por la salud de mi madre <3')).toBeVisible()
  await expect(page.locator('#intention')).toHaveValue('')
})

test('al día siguiente la app se pone al día sola', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-23T20:00:00Z') })
  await reset('2026-10-23T20:00:00Z')
  await login(page, 'persona12@example.com')
  await expect(page.getByTestId('hoy-date')).toHaveText('Viernes, 23 de octubre de 2026')
  await clock('2026-10-24T07:30:00Z')
  await page.clock.fastForward('11:30:00')
  await expect(page.getByTestId('hoy-date')).toHaveText('Sábado, 24 de octubre de 2026')
  await expect(page.getByTestId('hoy-status')).toHaveText('Hoy · Pendiente de marcar')
})

test.describe('en Portugal', () => {
  test.use({ timezoneId: 'Europe/Lisbon' })

  test('a las 23:30 de Lisboa «Hoy» sigue siendo hoy y el aviso llega a las 19:05', async ({ page }) => {
    // En Madrid ya es sábado 24 a las 0:30; en Lisboa sigue siendo viernes 23.
    await page.clock.install({ time: new Date('2026-10-23T22:30:00Z') })
    await reset('2026-10-23T22:30:00Z')
    await login(page, 'persona12@example.com')
    await expect(page.getByTestId('hoy-date')).toHaveText('Viernes, 23 de octubre de 2026')
    await page.getByTestId('go').click()
    const skip = page.getByRole('button', { name: 'Saltar la celebración' })
    if (await skip.isVisible()) await skip.click()
    await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
    await page.reload()
    await expect(page.getByTestId('hoy-date')).toHaveText('Viernes, 23 de octubre de 2026')
    await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
    const marked = page.getByTestId('week').locator('.week-day[data-date="2026-10-23"]')
    await expect(marked).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('link', { name: 'Ajustes' }).click()
    await expect(page.locator('.notify-note')).toContainText('a las 19:05')
  })
})

test('el lunes no sale el resumen de la semana', async ({ page }) => {
  await reset('2026-10-26T10:00:00Z')
  await login(page, 'persona1@example.com')
  await expect(page.getByTestId('total')).toBeVisible()
  await expect(page.getByTestId('monday')).toHaveCount(0)
  await expect(page.getByText(/La semana pasada/)).toHaveCount(0)
})

test('cambiar de pestaña llega arriba al instante; la misma pestaña sube con animación', async ({ page }) => {
  await login(page, 'persona1@example.com')
  await page.evaluate(() => { document.body.style.minHeight = '2400px' })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200)
  await page.locator('nav.tabs a[data-nav="calendario"]').click()
  // El calendario llega al instante a su inicio, que es hoy.
  const home = await page.evaluate(() => window.scrollY)
  expect(home).toBeGreaterThan(200)
  await expect(page.locator('[data-testid="calendar"] li.is-today')).toBeInViewport()
  await page.evaluate((y) => window.scrollTo(0, y + 600), home)
  const start = await page.evaluate(() => window.scrollY)
  expect(start).toBeGreaterThan(home + 200)
  const samples = await page.evaluate(() => new Promise<number[]>((resolve) => {
    const seen: number[] = []
    document.querySelector<HTMLElement>('nav.tabs a[data-nav="calendario"]')!.click()
    const tick = () => {
      seen.push(window.scrollY)
      if (seen.length < 30) requestAnimationFrame(tick)
      else resolve(seen)
    }
    requestAnimationFrame(tick)
  }))
  expect(samples.some((y) => y > home && y < start)).toBe(true)
  expect(Math.abs((samples.at(-1) ?? 0) - home)).toBeLessThan(2)
})

test('en pantalla pequeña nada se sale de lado', async ({ page }) => {
  await login(page, 'persona1@example.com')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  for (const route of ['Calendario', 'Intenciones', 'Ajustes']) {
    await page.getByRole('link', { name: route }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('«Voy a ir» vibra con un toque real: lleva su capa con switch y apunta una sola vez', async ({ page }) => {
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByTestId('calendar').waitFor()
  const date = await page.locator('.row-commit[data-act="commit"][aria-pressed="false"]').nth(1).evaluate((node) => (node as HTMLElement).dataset.date ?? '')
  const pill = page.locator(`.row-commit[data-date="${date}"]`)
  const overlay = pill.locator('label.haptic-overlay[data-haptic-trigger] input[type="checkbox"][switch]')
  await expect(overlay).toHaveCount(1)
  // El dedo cae sobre la etiqueta, no sobre el texto: así iOS 26.5 cuenta el toque como real.
  const hit = await pill.evaluate((node) => {
    const box = node.getBoundingClientRect()
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return top?.classList.contains('haptic-overlay') ?? false
  })
  expect(hit).toBe(true)
  await pill.click()
  await expect(pill).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(400)
  await expect(page.locator(`.row-commit[data-date="${date}"]`)).toHaveAttribute('aria-pressed', 'true')
})

test('con la vibración al deslizar, el switch marca los topes, el toque llega al botón y el scroll sigue', async ({ page, viewport }) => {
  // Solo existe en teléfonos (iPhone); en escritorio no se pinta el switch.
  test.skip((viewport?.width ?? 0) > 600)
  await page.addInitScript(() => localStorage.setItem('misa-vibrar-deslizar', 'force'))
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByTestId('calendar').waitFor()
  await expect(page.locator('[data-testid="calendar"] li input[data-row-switch]').first()).toBeAttached()

  // Un toque quieto sobre «Voy a ir» cae en el switch y se reenvía al botón.
  const dates = await page.locator('.row-commit[data-act="commit"][aria-pressed="false"]').evaluateAll((nodes) => nodes.slice(1, 3).map((node) => (node as HTMLElement).dataset.date ?? ''))
  const tapPill = page.locator(`.row-commit[data-date="${dates[0]}"]`)
  const pillBox = await tapPill.boundingBox()
  if (!pillBox) throw new Error('sin píldora')
  await page.mouse.click(pillBox.x + pillBox.width / 2, pillBox.y + pillBox.height / 2)
  await expect(tapPill).toHaveAttribute('aria-pressed', 'true')
  // Deja que llegue el estado del servidor antes de arrastrar (la lista se repinta).
  await page.waitForTimeout(600)

  // Arrastrar: el switch salta de lado en cada tope (32, 60) y al cruzar el umbral (88).
  const row = page.locator(`[data-testid="calendar"] li[data-date="${dates[1]}"]`)
  await row.scrollIntoViewIfNeeded()
  const box = await row.boundingBox()
  if (!box) throw new Error('sin fila')
  const startX = box.x + 60
  const y = box.y + box.height / 2
  const side = (fingerX: number) => row.evaluate((li, finger) => {
    const input = li.querySelector<HTMLInputElement>('input[data-row-switch]')!
    const rect = input.getBoundingClientRect()
    return finger - rect.left > rect.width / 2 ? 'on' : 'off'
  }, fingerX)
  await page.mouse.move(startX, y)
  await page.mouse.down()
  // Los topes suaves solo suenan cuando WebKit ya sigue el dedo (tras ~200 ms).
  await page.waitForTimeout(250)
  await page.mouse.move(startX + 20, y, { steps: 4 })
  expect(await side(startX + 20)).toBe('off')
  await page.mouse.move(startX + 40, y, { steps: 3 })
  expect(await side(startX + 40)).toBe('on')
  await page.mouse.move(startX + 70, y, { steps: 3 })
  expect(await side(startX + 70)).toBe('off')
  await page.mouse.move(startX + 100, y, { steps: 3 })
  await expect(row).toHaveClass(/swipe-armed/)
  expect(await side(startX + 100)).toBe('on')
  // El umbral suena dos veces: el segundo toque llega con el siguiente movimiento.
  await page.waitForTimeout(100)
  await page.mouse.move(startX + 104, y)
  expect(await side(startX + 104)).toBe('off')
  await page.mouse.move(startX + 70, y, { steps: 3 })
  await expect(row).not.toHaveClass(/swipe-armed/)
  expect(await side(startX + 70)).toBe('on')
  await page.mouse.move(startX + 110, y, { steps: 3 })
  expect(await side(startX + 110)).toBe('off')
  await page.mouse.up()
  await expect(page.locator(`.row-commit[data-date="${dates[1]}"]`)).toHaveAttribute('aria-pressed', 'true')

  // Arrastrar en vertical sobre una fila mueve la lista (scroll hecho por la app).
  await expect(page.locator(`.row-commit[data-date="${dates[1]}"]`)).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(700)
  await page.evaluate(() => window.scrollTo(0, 0))
  const fifth = page.locator('[data-testid="calendar"] li').nth(4)
  await expect.poll(async () => Boolean(await fifth.boundingBox())).toBe(true)
  const list = await fifth.boundingBox()
  if (!list) throw new Error('sin lista')
  await page.mouse.move(list.x + 200, list.y + 30)
  await page.mouse.down()
  await page.mouse.move(list.x + 200, list.y - 170, { steps: 10 })
  await page.mouse.up()
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(120)

  // Si el dedo se para antes de soltar, la lista no sigue moviéndose sola.
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.scrollTo(0, 0))
  const again = await fifth.boundingBox()
  if (!again) throw new Error('sin lista')
  await page.mouse.move(again.x + 200, again.y + 30)
  await page.mouse.down()
  await page.mouse.move(again.x + 200, again.y - 120, { steps: 6 })
  await page.waitForTimeout(150)
  await page.mouse.up()
  const held = await page.evaluate(() => window.scrollY)
  expect(held).toBeGreaterThan(80)
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.scrollY)).toBe(held)
  // Cada gesto deja su rastro técnico para diagnosticar en el iPhone real.
  await expect.poll(async () => (await usageRows(page)).filter((row) => row.event_name === 'swipe_debug').length, { timeout: 5000 }).toBeGreaterThanOrEqual(2)
})

test('si iOS cancela un deslizamiento corto, el clic del switch no apunta ni abre el día', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) > 600)
  await page.addInitScript(() => localStorage.setItem('misa-vibrar-deslizar', 'force'))
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByTestId('calendar').waitFor()
  const date = await page.locator('.row-commit[data-act="commit"][aria-pressed="false"]').nth(1).evaluate((node) => (node as HTMLElement).dataset.date ?? '')
  const pill = page.locator(`.row-commit[data-date="${date}"]`)
  await pill.scrollIntoViewIfNeeded()
  const box = await pill.boundingBox()
  if (!box) throw new Error('sin píldora')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 20, y, { steps: 3 })
  // Lo que hace iOS: pointercancel, luego touchend y el clic simulado del switch.
  await page.evaluate(({ x, y }) => {
    const input = document.elementFromPoint(x + 20, y) as HTMLInputElement
    input.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }))
    input.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }))
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
  }, { x, y })
  await page.mouse.up()
  await page.waitForTimeout(400)
  await expect(pill).toHaveAttribute('aria-pressed', 'false')
})

test('un swipe muy rápido que iOS cancela cuenta si al soltar pasó el umbral', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) > 600)
  await page.addInitScript(() => localStorage.setItem('misa-vibrar-deslizar', 'force'))
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByTestId('calendar').waitFor()
  const date = await page.locator('.row-commit[data-act="commit"][aria-pressed="false"]').nth(1).evaluate((node) => (node as HTMLElement).dataset.date ?? '')
  const row = page.locator(`[data-testid="calendar"] li[data-date="${date}"]`)
  await row.scrollIntoViewIfNeeded()
  const box = await row.boundingBox()
  if (!box) throw new Error('sin fila')
  const x = box.x + 60
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 20, y, { steps: 3 })
  // iOS cancela el puntero; el dedo sigue y se levanta 130 px a la derecha.
  await page.evaluate(({ x, y }) => {
    const input = document.elementFromPoint(x + 20, y) as HTMLInputElement
    input.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }))
    // Safari no deja crear un Touch: basta con un touchend que diga dónde se levantó el dedo.
    const end = new Event('touchend', { bubbles: true, cancelable: true })
    Object.defineProperty(end, 'changedTouches', { value: [{ clientX: x + 130, clientY: y }] })
    input.dispatchEvent(end)
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x + 130, clientY: y }))
  }, { x, y })
  await page.mouse.up()
  await expect(page.locator(`.row-commit[data-date="${date}"]`)).toHaveAttribute('aria-pressed', 'true')
})

test('los días pasados viven en el calendario y Hoy enseña estos días', async ({ page }) => {
  const errors = watchConsole(page)
  await reset('2026-10-26T10:00:00Z')
  await login(page, 'persona1@example.com')
  // Ya no hay interruptor en Ajustes: es la única versión.
  await expect(page.getByTestId('hoy-date')).toBeVisible()
  await expect(page.getByTestId('past')).toHaveCount(0)
  // Hoy se rellena con la semana, el próximo día sin nadie y la última intención.
  await expect(page.getByTestId('week').locator('.week-day')).toHaveCount(7)
  await expect(page.getByTestId('week').locator('.week-day.is-today')).toHaveAttribute('data-date', '2026-10-26')
  await expect(page.getByTestId('hoy-intention')).toBeVisible()
  // «Rezamos por» lleva al muro (con el cuadro para escribir una intención), no a una intención.
  await page.getByTestId('hoy-intention').click()
  await expect(page).toHaveURL(/\/muro$/)
  await expect(page.getByTestId('muro')).toBeVisible()
  await page.getByRole('link', { name: 'Hoy', exact: true }).click()
  await expect(page.getByTestId('week').locator('.week-day').first()).toHaveAttribute('data-date', '2026-10-23')
  await page.waitForTimeout(600)
  if (process.env.MISA_UNIFIED_SHOTS) {
    await page.screenshot({ path: `${process.env.MISA_UNIFIED_SHOTS}/unico-pantalla-hoy.png` })
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${process.env.MISA_UNIFIED_SHOTS}/unico-pantalla-hoy-abajo.png` })
    await page.evaluate(() => window.scrollTo(0, 0))
  }
  // En «Estos días», tocar un día pasado marca «He ido» y uno que viene, «Voy a ir».
  const week = page.getByTestId('week')
  const pastDay = week.locator('.week-day[data-date="2026-10-24"]')
  const pastWas = (await pastDay.getAttribute('aria-pressed')) === 'true'
  await pastDay.click()
  await expect(week.locator('.week-day[data-date="2026-10-24"]')).toHaveAttribute('aria-pressed', String(!pastWas))
  await expect(week.locator('.week-day[data-date="2026-10-24"] .num')).toHaveClass(pastWas ? /past/ : /gone/)
  const nextDay = week.locator('.week-day[data-date="2026-10-28"]')
  const nextWas = (await nextDay.getAttribute('aria-pressed')) === 'true'
  await nextDay.click()
  await expect(week.locator('.week-day[data-date="2026-10-28"]')).toHaveAttribute('aria-pressed', String(!nextWas))
  await page.waitForTimeout(800)
  await expect(week.locator('.week-day[data-date="2026-10-24"]')).toHaveAttribute('aria-pressed', String(!pastWas))
  await expect(week.locator('.week-day[data-date="2026-10-28"]')).toHaveAttribute('aria-pressed', String(!nextWas))
  // El título y «Ver calendario» llevan al calendario, abierto en hoy.
  await page.getByTestId('week-calendar').click()
  await expect(page.getByTestId('calendar').locator('li[data-date="2026-10-26"]')).toBeInViewport()
  await page.getByRole('link', { name: 'Hoy' }).click()

  // El calendario se abre en hoy, con los días pasados encima.
  await page.getByRole('link', { name: 'Calendario' }).click()
  const calendar = page.getByTestId('calendar')
  const today = calendar.locator('li[data-date="2026-10-26"]')
  await expect(today).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200)
  const past = calendar.locator('li[data-kind="past"]')
  await expect(past).toHaveCount(30)
  await expect(past.first()).toHaveAttribute('data-date', '2026-09-26')
  await expect(past.last()).toHaveAttribute('data-date', '2026-10-25')
  if (process.env.MISA_UNIFIED_SHOTS) await page.screenshot({ path: `${process.env.MISA_UNIFIED_SHOTS}/unico-hoy.png` })

  // «He ido» en un día pasado marca la asistencia y suma uno al curso.
  const row = calendar.locator('li[data-date="2026-10-21"]')
  const went = row.locator('[data-act="attend"]')
  const was = (await went.getAttribute('aria-pressed')) === 'true'
  const count = Number((await row.locator('.meta .count em').textContent())?.split(' ')[0])
  await went.click()
  await expect(went).toHaveAttribute('aria-pressed', String(!was))
  await expect(row.locator('.meta .count em')).toHaveText(`${count + (was ? -1 : 1)} de 12`)
  await expect(row.locator('.num')).toHaveClass(was ? /past/ : /gone/)
  await page.waitForTimeout(600)
  await expect(went).toHaveAttribute('aria-pressed', String(!was))

  // Deslizar a la derecha un día pasado también marca que fuiste; a la izquierda lo quita.
  const swiped = calendar.locator('li[data-kind="past"]:has([data-act="attend"][aria-pressed="false"])').last()
  const swipedDate = await swiped.getAttribute('data-date')
  const target = calendar.locator(`li[data-date="${swipedDate}"]`)
  await target.scrollIntoViewIfNeeded()
  const drag = async (dx: number) => {
    const box = await target.boundingBox()
    if (!box) throw new Error('sin fila')
    const x = dx > 0 ? box.x + 60 : box.x + box.width - 40
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y, { steps: 10 })
    await page.mouse.up()
  }
  await drag(130)
  await expect(target.locator('[data-act="attend"]')).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(500)
  await drag(-130)
  await expect(target.locator('[data-act="attend"]')).toHaveAttribute('aria-pressed', 'false')
  await page.waitForTimeout(500)

  // «Días anteriores» añade un mes por arriba sin mover lo que se ve.
  await page.evaluate(() => window.scrollTo(0, 0))
  const first = past.first()
  const before = (await first.boundingBox())?.y ?? 0
  await page.getByTestId('earlier-days').click()
  await expect(past).toHaveCount(60)
  const moved = (await calendar.locator('li[data-date="2026-09-26"]').boundingBox())?.y ?? 0
  expect(Math.abs(moved - before)).toBeLessThan(4)
  if (process.env.MISA_UNIFIED_SHOTS) await page.screenshot({ path: `${process.env.MISA_UNIFIED_SHOTS}/unico-arriba.png` })

  // Lejos de hoy sale «Hoy» con la flecha hacia hoy, y lleva de vuelta.
  const back = page.getByTestId('to-today')
  await expect(back).toBeVisible()
  await expect(back).toHaveAttribute('data-dir', 'down')
  await expect(back).toHaveText('↓Hoy')
  await back.click()
  await expect(today).toBeInViewport()
  await expect(back).toBeHidden()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(back).toBeVisible()
  await expect(back).toHaveAttribute('data-dir', 'up')
  if (process.env.MISA_UNIFIED_SHOTS) await page.screenshot({ path: `${process.env.MISA_UNIFIED_SHOTS}/unico-abajo.png` })
  await back.click()
  await expect(today).toBeInViewport()
  await expect(today).toHaveClass(/is-today/)
  // Con la lista aún moviéndose iOS no manda el clic: el botón responde al touchend.
  // Y queda a la derecha, sin tapar «He ido» ni «Voy a ir».
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(back).toBeVisible()
  const pill = await calendar.locator('li[data-kind="past"] .row-commit').first().boundingBox()
  const button = await back.boundingBox()
  expect((button?.x ?? 0) - 12).toBeGreaterThan((pill?.x ?? 0) + (pill?.width ?? 0))
  await back.evaluate((node) => node.dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true })))
  await expect(today).toBeInViewport()
  // Los días pasados no llevan puntos (no hay leyenda): lo dicen con palabras.
  await expect(calendar.locator('li[data-kind="past"] .dots')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('el scroll de la app desde una fila no mueve la página hasta soltar: el dedo no se mezcla con el scroll', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) > 600)
  await page.addInitScript(() => localStorage.setItem('misa-vibrar-deslizar', 'force'))
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByTestId('calendar').waitFor()
  await expect(page.locator('[data-testid="calendar"] li input[data-row-switch]').first()).toBeAttached()
  await page.waitForTimeout(400)
  // En el iPhone la posición del dedo llega mezclada con el scroll de la página. Aquí se
  // imita: el clientY lleva sumado lo que se haya movido la página desde el principio.
  const result = await page.evaluate(() => {
    const input = [...document.querySelectorAll<HTMLInputElement>('[data-testid="calendar"] li:not([data-kind="past"]) input[data-row-switch]')]
      .find((node) => { const rect = node.getBoundingClientRect(); return rect.top > 150 && rect.bottom < innerHeight - 150 })!
    const rect = input.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const start = window.scrollY
    const fire = (type: string, finger: number, timeStamp: number) => {
      const clientY = finger + (window.scrollY - start)
      const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY, screenX: x, screenY: clientY + 1000 })
      Object.defineProperty(event, 'timeStamp', { value: timeStamp })
      input.dispatchEvent(event)
    }
    const t0 = performance.now()
    fire('pointerdown', y, t0)
    let moving = 0
    for (let i = 1; i <= 22; i++) {
      fire('pointermove', y - i * 10, t0 + i * 16)
      moving = Math.max(moving, Math.abs(window.scrollY - start))
    }
    const list = document.querySelector<HTMLElement>('[data-testid="calendar"]')!.style.transform
    fire('pointerup', y - 220, t0 + 23 * 16)
    return { moving, list, moved: window.scrollY - start, after: document.querySelector<HTMLElement>('[data-testid="calendar"]')!.style.transform }
  })
  // Mientras dura, la página no se mueve: se desplaza la lista.
  expect(result.moving).toBe(0)
  expect(result.list).toContain('translate3d')
  // Al soltar, la página queda donde llevó el dedo (sin los primeros 24 px, que eran
  // del iPhone si se quedaba el gesto) y la lista sin transform.
  expect(result.moved).toBeGreaterThan(180)
  expect(result.moved).toBeLessThan(210)
  expect(result.after).toBe('')
})

test('un scroll que empieza en una fila lo hace el iPhone; si lo hace la app, el iPhone no se suma', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) > 600)
  await page.addInitScript(() => localStorage.setItem('misa-vibrar-deslizar', 'force'))
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByTestId('calendar').waitFor()
  const row = page.locator('[data-testid="calendar"] li[data-date]:not([data-kind="past"])').nth(3)
  const box = await row.boundingBox()
  if (!box) throw new Error('sin fila')
  const x = box.x + 200
  const y = box.y + box.height / 2
  const touchMove = (dx: number, dy: number) => page.evaluate(({ x, y, dx, dy }) => {
    const input = document.elementFromPoint(x, y) as HTMLInputElement
    const move = new Event('touchmove', { bubbles: true, cancelable: true })
    Object.defineProperty(move, 'touches', { value: [{ clientX: x + dx, clientY: y + dy }] })
    input.dispatchEvent(move)
    return move.defaultPrevented
  }, { x, y, dx, dy })
  // Empieza en vertical: el touchmove no se bloquea y el scroll es el del iPhone.
  await page.mouse.move(x, y)
  await page.mouse.down()
  expect(await touchMove(0, -30)).toBe(false)
  await page.mouse.up()
  await page.waitForTimeout(500)
  // Si la app ya mueve la lista (aquí, con ratón), el touchmove sale bloqueado.
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 40, { steps: 4 })
  expect(await touchMove(0, -50)).toBe(true)
  await page.mouse.up()
})
