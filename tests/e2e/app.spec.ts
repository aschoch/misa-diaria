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
  await page.locator('#password').fill('misa-2026')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

async function setRecoveryPassword(page: Page) {
  await expect(page.getByRole('heading', { name: 'Fija tu nueva contraseña' })).toBeVisible()
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

test.beforeEach(async ({ page }) => {
  await reset()
  await page.context().clearCookies()
})

test('un miembro entra con el código y ve el curso', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/misa-diaria/')
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover')
  await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click()
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
  await expect(page.getByTestId('total')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Últimos días' })).toBeVisible()
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
  const past = page.getByTestId('past')
  await expect(past.locator('.past-list li').last()).toBeVisible()
  await expect(past.getByTestId('open-past-cal')).toHaveText('Ver más')
  expect(await past.evaluate((section) => {
    const last = section.querySelector('li:last-child')
    const more = section.querySelector('[data-testid="open-past-cal"]')
    if (!last || !more) return false
    return more.getBoundingClientRect().top >= last.getBoundingClientRect().bottom - 1
  })).toBe(true)
  await expect(page.getByTestId('past').locator('li').first()).toContainText('11 de 12')
  await expect(page.getByTestId('past').locator('li').first()).not.toContainText('de 6')
  await expect(page.getByTestId('past').locator('li').first()).not.toContainText('Alguien de cada matrimonio')
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
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Olvidé mi contraseña' })).toBeVisible()
  await expect(page.getByLabel('Código')).toHaveCount(0)
  await page.getByLabel('Tu correo').fill('Persona1@Example.com')
  await page.getByLabel('Tu correo').press('Enter')
  await expect(page.getByLabel('Tu correo')).toHaveValue('Persona1@Example.com')
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click()
  await expect(page.getByLabel('Tu correo')).toHaveValue('persona1@example.com')
  await page.getByRole('button', { name: 'Enviar código' }).click()
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toBeVisible()
  const code = await codeFor('persona1@example.com')
  await page.reload()
  await expect(page.getByLabel('Tu correo')).toHaveValue('persona1@example.com')
  await expect(page.getByLabel('Código')).toHaveCount(0)
  await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click()
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
  await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click()
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
  await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click()
  await page.getByRole('button', { name: 'Enviar código' }).click()
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toBeVisible()
  const code = await codeFor('persona2@example.com')
  await page.getByRole('button', { name: 'Volver' }).click()
  await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click()
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
  await expect(page.getByTestId('go').locator('.vence, .piece')).toHaveCount(0)
  await page.getByTestId('go').click()
  await expect(page.getByTestId('go')).toHaveText('He ido a Misa')
  await page.getByTestId('go').click()
  await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
  await expect(page.getByTestId('go')).toContainText('Has ido a Misa')
  await expect(page.getByTestId('go')).toHaveClass(/just-tapped/)
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
    return target?.getAttribute('data-testid')
  })
  expect(hit).toBe('go')
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
  const friday = page.getByTestId('calendar').locator('li').nth(0)
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
  await expect(page.locator('[data-act="select"][data-date="2026-10-23"]')).toContainText('vie')
  const select = page.locator('.days li button[data-act="select"]').first()
  await expect(select).toHaveCSS('appearance', 'none')
  await expect(page.locator('.days li.swipeable').first()).toHaveCSS('min-height', '64px')
  const bar = await page.locator('.days li.risk').first().evaluate((node) => getComputedStyle(node, '::before').zIndex)
  expect(bar).toBe('2')

  await page.getByRole('link', { name: 'Hoy' }).click()
  await page.getByTestId('open-past-cal').click()
  const week = page.locator('[data-testid="streak-calendar"] [data-current="true"] .weekdays span')
  await expect(week).toHaveText(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'])
  const cells = page.locator('[data-testid="streak-calendar"] [data-current="true"] .month-grid > *')
  await expect(cells.nth(2)).toHaveClass(/empty/)
  await expect(cells.nth(3)).toHaveText('1')
  await expect(page.locator('.streak-back')).toHaveCSS('z-index', '60')
  await expect(page.locator('.streak-pop header b')).toHaveCSS('color', 'rgb(156, 63, 28)')
  const dotColors = await page.evaluate(() => {
    const color = (selector: string) => {
      const node = document.querySelector(selector)
      return node ? getComputedStyle(node).backgroundColor : ''
    }
    return {
      mineGrid: color('.month-grid .dot.mine'),
      mineLegend: color('.legend .dot.mine'),
      tenGrid: color('.month-grid .dot.ten'),
      tenLegend: color('.legend .dot.ten'),
      allGrid: color('.month-grid .dot.all'),
      allLegend: color('.legend .dot.all'),
      couples: document.querySelectorAll('.dot.couples').length,
    }
  })
  expect(dotColors.couples).toBe(0)
  expect(dotColors.mineGrid).toBeTruthy()
  expect(dotColors.mineGrid).toBe(dotColors.mineLegend)
  if (dotColors.tenGrid) expect(dotColors.tenGrid).toBe(dotColors.tenLegend)
  if (dotColors.allGrid) expect(dotColors.allGrid).toBe(dotColors.allLegend)
  await page.getByRole('button', { name: 'Cerrar' }).click()

  await page.getByRole('link', { name: 'Ajustes' }).click()
  await expect(page.getByRole('heading', { name: 'Contraseña' })).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Notificaciones' })).toBeVisible()
  await expect(page.getByText('Si mañana nadie se ha comprometido')).toBeVisible()
  await expect(page.locator('.notify-note')).toHaveText('Notificación push en este dispositivo a las 20:05 (requiere tener la app añadida a la pantalla de inicio)')
  await expect(page.getByText(/de lunes a sábado|sobre las 20:00/)).toHaveCount(0)
  await expect(page.getByLabel('Contraseña actual')).toHaveAttribute('name', 'current_password')
  await expect(page.getByLabel('Nueva contraseña')).toHaveAttribute('id', 'new-password')

  await page.getByRole('button', { name: 'Português' }).click()
  await page.getByRole('link', { name: 'Hoje' }).click()
  await page.getByTestId('open-past-cal').click()
  await expect(page.locator('[data-current="true"] .weekdays span')).toHaveText(['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'])
  expect(errors).toEqual([])
})

test('el calendario sigue, el deslizamiento avisa y el popup no mueve el fondo', async ({ page, viewport }) => {
  test.setTimeout(60_000)
  const errors = watchConsole(page)
  const phone = viewport?.width === 390
  await login(page, 'persona1@example.com')
  await clearOfBar(page, page.getByTestId('open-past-cal'))
  const scrolled = await page.evaluate(() => window.scrollY)
  await page.getByTestId('open-past-cal').click()
  await expect(page.locator('body')).toHaveClass(/modal-open/)
  const header = await page.locator('.streak-pop header').boundingBox()
  if (!header) throw new Error('sin cabecera')
  await page.mouse.move(header.x + 40, header.y + 18)
  await page.mouse.down()
  await page.mouse.move(header.x + 44, header.y + 120, { steps: 8 })
  await page.mouse.up()
  const closing = await page.locator('.streak-pop').evaluate((node) => ({
    opacity: getComputedStyle(node).opacity,
    transform: (node as HTMLElement).style.transform,
    transition: (node as HTMLElement).style.transition,
  }))
  expect(closing.opacity).toBe('1')
  expect(closing.transform).toContain('105vh')
  expect(closing.transition).toContain('480ms')
  await expect(page.getByTestId('streak-calendar')).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)

  await clearOfBar(page, page.getByRole('button', { name: 'Ver más' }))
  const parked = await page.evaluate(() => window.scrollY)
  await page.getByRole('button', { name: 'Ver más' }).click()
  await expect(page.getByTestId('month-scroll')).toBeVisible()
  const foot = await page.locator('.pop-foot').boundingBox()
  if (!foot) throw new Error('sin borde')
  await page.mouse.move(foot.x + 40, foot.y + 8)
  await page.mouse.down()
  await page.mouse.move(foot.x + 44, foot.y + 90, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('streak-calendar')).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(parked)

  await page.getByRole('link', { name: 'Calendario' }).click()
  await expect(page.getByTestId('cal-month-head').first()).toHaveText('Octubre 2026')
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
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + 36, y + 4, { steps: 6 })
  await expect(row).toHaveClass(/swiping-right/)
  await expect(row).not.toHaveClass(/swipe-armed/)
  await page.mouse.move(startX + 64, y + 4, { steps: 6 })
  await expect(row).toHaveClass(/swipe-armed/)
  await expect(row.locator('.swipe-under.right .swipe-cue')).toHaveText('✓')
  await expect(row.locator('.swipe-under.left .swipe-cue')).toHaveText('←')
  expect(await row.locator('.swipe-face').evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none')
  await page.mouse.move(startX + 20, y + 4, { steps: 6 })
  await expect(row).not.toHaveClass(/swipe-armed/)
  await page.mouse.up()
  await expect(row.locator('.num')).not.toHaveClass(/planned/)
  const quit = page.locator('[data-testid="calendar"] li[data-date="2026-10-24"]')
  await quit.scrollIntoViewIfNeeded()
  const quitBox = await quit.boundingBox()
  if (!quitBox) throw new Error('sin fila comprometida')
  const quitX = quitBox.x + quitBox.width - 36
  const quitY = quitBox.y + quitBox.height / 2
  await page.mouse.move(quitX, quitY)
  await page.mouse.down()
  await page.mouse.move(quitX - 70, quitY, { steps: 8 })
  await expect(quit).toHaveClass(/swipe-armed/)
  await expect(quit.locator('.swipe-under.left .swipe-cue')).toHaveText('✕')
  await expect(quit.locator('.swipe-under.right .swipe-cue')).toHaveText('→')
  expect(await quit.locator('.swipe-face').evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none')
  const armedFace = await quit.locator('.swipe-face').evaluate((node) => getComputedStyle(node).backgroundColor)
  const refreshed = page.waitForResponse((response) => response.url().includes('/rpc/estado') && response.ok())
  await page.mouse.up()
  const drawn = await quit.locator('.swipe-face').elementHandle()
  await refreshed
  if (drawn) await expect.poll(() => drawn.evaluate((node) => node.isConnected).catch(() => false)).toBe(false)
  await expect(quit.locator('.num')).not.toHaveClass(/planned/)
  const afterFace = await quit.locator('.swipe-face').evaluate((node) => getComputedStyle(node).backgroundColor)
  const plainFace = await page.locator('[data-testid="calendar"] li:not(.selected) .swipe-face').first().evaluate((node) => getComputedStyle(node).backgroundColor)
  const selectedFace = await page.locator('[data-testid="calendar"] li.selected .swipe-face').evaluate((node) => getComputedStyle(node).backgroundColor)
  expect(armedFace).toBe(plainFace)
  expect(afterFace).toBe(plainFace)
  expect(selectedFace).toBe(plainFace)
  await page.evaluate(() => window.scrollTo(0, 0))
  const gap = await page.locator('.select-day').first().evaluate((node) => {
    const num = node.querySelector('.num')?.getBoundingClientRect()
    const when = node.querySelector('.when')?.getBoundingClientRect()
    const style = getComputedStyle(node)
    const plain = document.querySelector('.num:not(.gone)')
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
  await page.evaluate(() => window.scrollTo(0, 480))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  await page.locator('nav.tabs a[data-nav="calendario"]').click()
  await expect(page.getByTestId('calendar')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1200 }).toBe(0)
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

test('marcar es inmediato, el resorte queda y el mes arranca largo', async ({ page }) => {
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
    const row = page.getByTestId('past').locator('li').first()
    await expect(row.locator('.past-count')).toHaveText('11 de 12')
    await row.getByRole('button').click()
    await expect(row.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    await expect(row.locator('.past-count')).toHaveText('12 de 12')
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
    await go.click()
    await expect(go).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
    await expect(page.locator('.hoy-hero')).toHaveClass(/\bon\b/)
    await expect(go).toHaveClass(/just-tapped/)
    expect(await go.evaluate((node) => getComputedStyle(node).animationName)).toContain('go-spring')
    await expect.poll(() => seen).toBe(2)
    const settled = page.waitForResponse((response) => response.url().includes('/rpc/estado') && response.ok())
    release()
    await settled
    const skipNow = page.getByRole('button', { name: 'Saltar la celebración' })
    if (await skipNow.isVisible()) await skipNow.click()
  } finally {
    release()
    await page.unroute('**/rest/v1/attendance**').catch(() => undefined)
  }

  await page.getByTestId('open-past-cal').click()
  const scroller = page.getByTestId('month-scroll')
  await expect(scroller).toBeVisible()
  const handle = await scroller.elementHandle()
  const before = await scroller.locator('.month').count()
  expect(before).toBeGreaterThan(3)
  await scroller.evaluate((node) => { node.scrollTop = 0 })
  await expect.poll(() => scroller.locator('.month').count()).toBeGreaterThan(before)
  expect(await handle?.evaluate((node) => node.isConnected)).toBe(true)
  await page.getByRole('button', { name: 'Cerrar' }).click()

  await page.getByRole('link', { name: 'Calendario' }).click()
  const lienzo = await page.getByTestId('cal-month-head').first().evaluate((node) => getComputedStyle(node).backgroundColor)
  expect(lienzo).toBe('rgb(243, 235, 221)')
  expect(errors).toEqual([])
})

async function showHero(page: Page, hero: 'a' | 'b' | 'c') {
  await page.evaluate((value) => {
    if (value === 'a') delete document.documentElement.dataset.estado
    else document.documentElement.dataset.estado = value
  }, hero)
  await page.locator('nav.tabs a[data-nav="calendario"]').click()
  await page.locator('nav.tabs a[data-nav="hoy"]').click()
  await expect(page.locator('.hoy-hero')).toHaveClass(new RegExp(`estado-${hero}`))
}

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
  await save(page, 'hoy.png')
  await save(page, 'estado-a-off.png')
  await showHero(page, 'b')
  await save(page, 'estado-b-off.png')
  await showHero(page, 'c')
  await save(page, 'estado-c-off.png')
  await showHero(page, 'a')
  await page.getByTestId('go').click()
  await expect(page.getByTestId('go')).toHaveClass(/just-tapped/)
  await page.waitForTimeout(160)
  await saveLive(page, 'hoy-glow.png')
  const skip = page.getByRole('button', { name: 'Saltar la celebración' })
  if (await skip.isVisible()) await skip.click()
  await expect(page.getByTestId('go')).toHaveClass(/\bon\b/)
  await expect(page.getByTestId('go')).toContainText('Has ido a Misa')
  await expect(page.getByTestId('hoy-status')).toHaveText('✓ Has ido a Misa hoy')
  await expect(page.getByTestId('go').locator('.vence, .piece')).toHaveCount(0)
  await page.waitForTimeout(560)
  await save(page, 'hoy-on.png')
  await save(page, 'estado-a-on.png')
  await showHero(page, 'b')
  await save(page, 'estado-b-on.png')
  await showHero(page, 'c')
  await save(page, 'estado-c-on.png')
  await showHero(page, 'a')
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
  const suave = page.locator('[data-testid="calendar"] li').nth(1)
  await suave.scrollIntoViewIfNeeded()
  const suaveBox = await suave.boundingBox()
  if (!suaveBox) throw new Error('sin fila')
  const startX = Math.max(suaveBox.x + 48, 48)
  const y = suaveBox.y + suaveBox.height / 2
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + 36, y, { steps: 6 })
  await save(page, 'swipe-suave.png')
  await page.mouse.move(startX + 70, y, { steps: 6 })
  await save(page, 'swipe-armado.png')
  const committed = await page.locator('[data-testid="calendar"] li').nth(1).getAttribute('data-committed')
  const settled = committed === 'true'
    ? Promise.resolve()
    : page.waitForResponse((response) => response.url().includes('/rpc/estado'))
  await page.mouse.up()
  await settled
  await expect(page.locator('[data-testid="calendar"] li').nth(1).locator('.num')).toHaveClass(/planned/)
  const quitar = page.locator('[data-testid="calendar"] li').nth(1)
  const quitarBox = await quitar.boundingBox()
  if (!quitarBox) throw new Error('sin fila para quitar')
  const quitarX = quitarBox.x + quitarBox.width - 28
  const quitarY = quitarBox.y + quitarBox.height / 2
  await page.mouse.move(quitarX, quitarY)
  await page.mouse.down()
  await page.mouse.move(quitarX - 80, quitarY, { steps: 8 })
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
  await page.getByRole('link', { name: 'Hoy', exact: true }).click()
  await page.getByTestId('open-past-cal').click()
  await page.getByTestId('streak-calendar').waitFor()
  await save(page, 'racha-calendario-es.png')
  await page.getByRole('button', { name: 'Cerrar' }).click()
  await page.getByRole('button', { name: 'Ver más' }).click()
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
  await expect(page.getByTestId('hoy-date')).toHaveText('Sexta, 23 de outubro de 2026')
  await expect(page.getByRole('heading', { name: 'Sequências' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Últimos dias' })).toBeVisible()
  await expect(page.getByTestId('total')).toHaveCount(0)
  await expect(page.getByTestId('go')).toContainText('Fui à Missa')
  await expect(page.getByTestId('risk')).toHaveCount(0)
  await expect(page.locator('.streaks li')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ver mais' })).toBeVisible()
  await expect(page.getByTestId('past').locator('li').first()).toContainText('11 de 12')
  await expect(page.getByTestId('past').locator('li').first()).not.toContainText('de 6')
  await expect(page.getByTestId('past').locator('li').first()).toContainText('10 missas')
  await expect(page.getByText(/matrimónio|matrimónio|Falta/)).toHaveCount(0)
  if (shoot) await save(page, 'hoy-pt.png')
  await page.getByRole('link', { name: 'Calendário' }).click()
  await expect(page.getByTestId('calendar')).toContainText('de 12')
  await expect(page.getByTestId('calendar')).not.toContainText('de 6')
  await expect(page.getByTestId('cal-month-head').first()).toHaveText('Outubro 2026')
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
  await page.locator('#current-password').fill('erronea')
  await page.locator('#new-password').fill('secreto')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByTestId('password-error')).toHaveText('La contraseña actual no es correcta')
  await page.locator('#current-password').fill('misa-2026')
  await page.locator('#new-password').fill('secreto')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByTestId('password-saved')).toHaveText('Contraseña guardada.')
  await page.locator('#feedback').fill('Una nota breve.')
  await page.getByRole('button', { name: 'Enviar comentario' }).click()
  await expect(page.getByTestId('feedback-thanks')).toHaveText('¡Gracias! Se ha enviado.')
  const unexpected = errors.filter((error) => !/status of 400/i.test(error))
  expect(unexpected).toEqual([])
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
