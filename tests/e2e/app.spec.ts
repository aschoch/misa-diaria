import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const gate = 'http://127.0.0.1:54321'
const storeShots = '/cursor/stores/bc-fef1ad98-c19e-5bc7-b9ff-40b2959a5f47/media/app'
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
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  await page.getByLabel('Código').fill(await codeFor(email))
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
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

test.beforeEach(async ({ page }) => {
  await reset()
  await page.context().clearCookies()
})

test('un miembro entra con el código y ve el curso', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/misa-diaria/')
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover')
  await page.getByLabel('Tu correo').fill('nadie@example.com')
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toBeVisible()

  await page.goto('/misa-diaria/')
  await login(page, 'persona1@example.com')
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  await expect(page.getByTestId('total')).toContainText('Total de Misas del curso')
  await expect(page.getByRole('heading', { name: 'Rachas' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Últimos días' })).toBeVisible()
  const navPad = await page.locator('nav').evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingBottom))
  expect(navPad).toBeGreaterThanOrEqual(14)
  const tab = await page.locator('nav a').first().boundingBox()
  expect(tab?.height ?? 0).toBeGreaterThanOrEqual(58)
  const mainPad = await page.locator('main').evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingBottom))
  expect(mainPad).toBeGreaterThanOrEqual(128)
  await expect(page.getByTestId('streak-individual')).toContainText('Persona 1')
  await expect(page.getByTestId('streak-individual')).toContainText('días seguidos que has ido a Misa')
  await expect(page.getByTestId('streak-couple')).toContainText('Tu matrimonio')
  await expect(page.getByTestId('streak-group')).toContainText('El curso')
  await expect(page.getByTestId('streak-six')).toContainText('Cada matrimonio')
  await expect(page.getByTestId('streak-ten')).toHaveCount(0)
  await expect(page.locator('.streaks li')).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Ver todo' })).toBeVisible()
  await expect(page.getByTestId('past').locator('li').first()).toContainText('11 de 12 · 6 de 6 matrimonios')
  await expect(page.getByTestId('past').locator('li').first()).toContainText('Alguien de cada matrimonio')
  await expect(page.getByTestId('past').locator('li').first()).toContainText('10 misas')
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
  await expect(page.getByRole('button', { name: 'Entrar con contraseña' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enviar enlace' })).toBeVisible()
  await expect(page.getByLabel('Código')).toBeVisible()
  await page.getByLabel('Tu correo').fill('Persona1@Example.com')
  await page.getByLabel('Tu correo').press('Enter')
  await expect(page.getByLabel('Tu correo')).toHaveValue('persona1@example.com')
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toBeVisible()
  const code = await codeFor('persona1@example.com')
  await page.reload()
  await expect(page.getByLabel('Tu correo')).toHaveValue('persona1@example.com')
  await expect(page.getByLabel('Código')).toBeVisible()
  await page.getByLabel('Código').fill(code)
  await page.getByLabel('Código').press('Enter')
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  expect(errors).toEqual([])
})

test('un segundo envío no dice que salió y deja entrar el código', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/misa-diaria/')
  await page.getByLabel('Tu correo').fill('persona2@example.com')
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toBeVisible()
  const code = await codeFor('persona2@example.com')
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  await expect(page.getByText('Acabamos de enviar un código. Escríbelo abajo.')).toBeVisible()
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toHaveCount(0)
  await expect(page.getByLabel('Tu correo')).toHaveValue('persona2@example.com')
  await page.getByLabel('Código').fill(code)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
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
  const days = page.getByTestId('calendar').locator('li')
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
  await page.getByTestId('go').click()
  await expect(page.getByTestId('go')).toHaveText('He ido a Misa')
  await page.getByTestId('go').click()
  await expect(page.getByTestId('go')).toHaveText('Has ido a Misa')
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
    return target?.getAttribute('data-testid')
  })
  expect(hit).toBe('go')
  expect(errors).toEqual([])
})

test('en oscuro el botón de vela lleva tinta oscura', async ({ page }) => {
  const errors = watchConsole(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await login(page, 'persona12@example.com')
  const go = page.getByTestId('go')
  await expect(go).toHaveCSS('color', 'rgb(42, 33, 24)')
  await expect(go).toHaveCSS('background-color', 'rgb(240, 160, 106)')
  expect(errors).toEqual([])
})

test('el calendario dice el motivo y no tapa la lista', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  const friday = page.getByTestId('calendar').locator('li').nth(0)
  await expect(friday).toContainText('9 de 12')
  await expect(friday).toContainText('5 de 6 matrimonios')
  await expect(friday.getByTestId('risk-why')).toHaveCount(0)
  await expect(friday).not.toHaveClass(/risk/)
  await expect(friday).not.toContainText(/Falta/)
  const saturday = page.locator('[data-testid="calendar"] li:has([data-date="2026-10-24"])')
  await expect(saturday).toContainText('Alguien se ha apuntado')
  await expect(saturday).not.toHaveClass(/risk/)
  const narrow = (page.viewportSize()?.width ?? 0) < 800
  if (narrow) await expect(page.locator('.day')).toBeHidden()
  else await expect(page.locator('.day')).toBeVisible()
  await page.locator('[data-act="select"][data-date="2026-10-27"]').click()
  const empty = page.locator('[data-testid="calendar"] li:has([data-date="2026-10-27"])')
  await expect(empty).toHaveClass(/risk/)
  await expect(empty.getByTestId('risk-why')).toHaveText('Nadie se ha apuntado')
  const open = await empty.evaluate((node) => {
    const why = node.querySelector('.why')
    const count = node.querySelector('.count')
    const commit = node.querySelector('.row-commit')
    const bar = getComputedStyle(node, '::before')
    const box = commit?.getBoundingClientRect()
    return {
      whySize: why ? getComputedStyle(why).fontSize : '',
      countSize: count ? getComputedStyle(count).fontSize : '',
      whyColor: why ? getComputedStyle(why).color : '',
      barWidth: bar.width,
      commit: commit && box ? {
        display: getComputedStyle(commit).display,
        whiteSpace: getComputedStyle(commit).whiteSpace,
        height: box.height,
        width: box.width,
      } : null,
    }
  })
  expect(open.whySize).toBe(open.countSize)
  expect(open.whySize).toBe('16px')
  expect(open.whyColor).toBe('rgb(122, 62, 12)')
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
  await expect(row('2026-10-26')).toContainText('6 de 6 matrimonios')
  await expect(page.getByTestId('risk-why')).toHaveCount(0)
  await expect(page.getByText(/Falta/)).toHaveCount(0)

  await page.locator('[data-act="select"][data-date="2026-10-25"]').click()
  await expect(row('2026-10-25')).not.toHaveClass(/risk/)
  await expect(row('2026-10-25')).toContainText('Domingo')
  await expect(row('2026-10-25')).not.toContainText(/en riesgo/i)
  await expect(page.getByTestId('risk-why')).toHaveCount(0)

  await page.locator('[data-act="select"][data-date="2026-10-27"]').click()
  await expect(row('2026-10-27')).toHaveClass(/risk/)
  await expect(page.getByTestId('risk-why')).toHaveText('Nadie se ha apuntado')
  expect(errors).toEqual([])
})

test('capturas del teléfono', async ({ page, browserName, viewport }) => {
  test.setTimeout(90_000)
  test.skip(browserName !== 'webkit' || viewport?.width !== 390)
  const errors = watchConsole(page)
  ensureShots()
  await login(page, 'persona12@example.com')
  await page.getByTestId('go').waitFor()
  await save(page, 'hoy.png')
  await save(page, 'nav-es.png')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByTestId('calendar').waitFor()
  await page.evaluate(() => {
    const node = document.activeElement
    if (node instanceof HTMLElement) node.blur()
  })
  await save(page, 'calendario.png')
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
  await page.getByRole('link', { name: 'Hoy' }).click()
  await page.getByTestId('streak-individual').click()
  await page.getByTestId('streak-calendar').waitFor()
  await save(page, 'racha-calendario-es.png')
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.getByRole('button', { name: 'Ver todo' }).click()
  await page.getByTestId('legend').waitFor()
  await save(page, 'ver-todo-es.png')
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await page.getByTestId('ajustes').waitFor()
  await save(page, 'ajustes-es.png')
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
  await expect(page.getByRole('heading', { name: 'Sequências' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Últimos dias' })).toBeVisible()
  await expect(page.getByTestId('total')).toContainText('Total de Missas do curso')
  await expect(page.getByTestId('go')).toHaveText('Fui à Missa')
  await expect(page.getByTestId('risk')).toHaveCount(0)
  await expect(page.getByTestId('streak-individual')).toContainText('Persona 12')
  await expect(page.getByTestId('streak-individual')).toContainText('dias seguidos em que foste à Missa')
  await expect(page.getByTestId('streak-couple')).toContainText('O teu casal')
  await expect(page.getByTestId('streak-couple')).toContainText('dias seguidos em que algum dos dois foi à Missa')
  await expect(page.getByTestId('streak-group')).toContainText('O curso')
  await expect(page.getByTestId('streak-six')).toContainText('Cada casal')
  await expect(page.getByTestId('streak-six')).toContainText('dias seguidos em que foi alguém de cada casal')
  await expect(page.getByTestId('streak-ten')).toHaveCount(0)
  await expect(page.locator('.streaks li')).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Ver tudo' })).toBeVisible()
  await expect(page.getByTestId('past').locator('li').first()).toContainText('11 de 12 · 6 de 6 casais')
  await expect(page.getByTestId('past').locator('li').first()).toContainText('Alguém de cada casal')
  await expect(page.getByTestId('past').locator('li').first()).toContainText('10 missas')
  await expect(page.getByText(/matrimónio|matrimónio|Falta/)).toHaveCount(0)
  if (shoot) await save(page, 'hoy-pt.png')
  await page.getByRole('link', { name: 'Calendário' }).click()
  await expect(page.getByTestId('calendar')).toContainText('de 6 casais')
  await expect(page.getByText(/Falta|matrimónio/)).toHaveCount(0)
  if (shoot) await save(page, 'calendario-pt.png')
  await page.getByRole('link', { name: 'Definições' }).click()
  await expect(page.getByRole('button', { name: 'Português' })).toHaveAttribute('aria-pressed', 'true')
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
  await expect(page.getByText('hace 2 h')).toBeVisible()
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
  await expect(page.getByText('há 2 h')).toBeVisible()
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
  await page.locator('#new-password').fill('secreto')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByTestId('password-saved')).toHaveText('Contraseña guardada.')
  await page.locator('#feedback').fill('Una nota breve.')
  await page.getByRole('button', { name: 'Enviar comentario' }).click()
  await expect(page.getByTestId('feedback-thanks')).toHaveText('¡Gracias! Se ha enviado.')
  expect(errors).toEqual([])
})

test('un gesto en el calendario apunta y quita el voy', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'persona1@example.com')
  await page.getByRole('link', { name: 'Calendario' }).click()
  const day = (date: string) => page.locator(`[data-act="select"][data-date="${date}"] .num`)
  const drag = async (date: string, dx: number, dy = 6) => {
    const box = await page.locator(`[data-act="select"][data-date="${date}"]`).boundingBox()
    if (!box) throw new Error('sin día')
    const startX = dx < 0 ? box.x + box.width - 36 : box.x + 72
    await page.mouse.move(startX, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(startX + dx, box.y + box.height / 2 + dy, { steps: 8 })
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

async function save(page: Page, name: string) {
  const path = `${shots}/${name}`
  await page.screenshot({ path, animations: 'disabled' })
  const bytes = readFileSync(path)
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(bytes.length).toBeGreaterThan(8_000)
  const view = page.viewportSize()
  if (view?.width === 390 && view.height === 844) {
    expect(bytes.readUInt32BE(16)).toBe(390)
    expect(bytes.readUInt32BE(20)).toBe(844)
  }
}
