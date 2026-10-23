import { mkdirSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const gate = 'http://127.0.0.1:54321'
const shots = '/cursor/stores/bc-fef1ad98-c19e-5bc7-b9ff-40b2959a5f47/media/app'
const outsider = '00000000-0000-4000-8000-0000000000ff'

function reason(text: string) {
  return text === '¡Todas las parejas han ido hoy!'
    || text === '¡Hoy habéis ido los doce!'
    || text === '10 misas hoy'
    || /^(Tú|Pareja|Grupo|10 misas) · (7|30) días seguidos$/.test(text)
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
  await page.getByRole('button', { name: 'Entrar' }).click()
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

test('un miembro entra con el código y ve el grupo', async ({ page }) => {
  const errors = watchConsole(page)
  await page.goto('/misa-diaria/')
  await page.getByLabel('Tu correo').fill('nadie@example.com')
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  await expect(page.getByText('Si tu correo está en la lista, te llegará un mensaje.')).toBeVisible()

  await page.goto('/misa-diaria/')
  await login(page, 'persona1@example.com')
  await expect(page.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  await expect(page.getByTestId('go')).toBeVisible()
  await page.getByRole('link', { name: 'Muro' }).click()
  await expect(page.getByText('Por quienes no pueden salir de casa.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Borrar' })).toBeVisible()
  expect(errors).toEqual([])
})

test('quien no es del grupo no lee ni escribe', async ({ page }) => {
  const errors = watchConsole(page)
  await login(page, 'fuera@example.com')
  await expect(page.getByTestId('denied')).toContainText('Esta cuenta no está en el grupo.')

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
  await expect(days.nth(1)).toContainText('No está en riesgo')
  await expect(days.nth(1)).not.toHaveClass(/risk/)

  await clock('2026-01-10T22:30:00Z')
  await page.reload()
  await expect(days.nth(0).locator('.num')).toHaveText('10')
  await expect(days.nth(0)).toHaveClass(/risk/)

  await clock('2026-01-10T23:30:00Z')
  await page.reload()
  await expect(days.nth(0).locator('.num')).toHaveText('11')
  await expect(days.nth(0)).toContainText('Domingo')
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
  const colors = await page.getByTestId('go').evaluate((node) => {
    const style = getComputedStyle(node)
    return { color: style.color, background: style.backgroundColor }
  })
  expect(colors).toEqual({ color: 'rgb(42, 33, 24)', background: 'rgb(240, 160, 106)' })
  expect(errors).toEqual([])
})

test('capturas del teléfono', async ({ page, browserName, viewport }) => {
  test.skip(browserName !== 'chromium' || viewport?.width !== 390)
  const errors = watchConsole(page)
  mkdirSync(shots, { recursive: true })
  await login(page, 'persona12@example.com')
  await page.getByTestId('go').waitFor()
  await save(page, 'hoy.png')
  await page.getByRole('link', { name: 'Calendario' }).click()
  await page.getByTestId('calendar').waitFor()
  await save(page, 'calendario.png')
  await page.getByRole('link', { name: 'Muro' }).click()
  await page.getByText('Por quienes no pueden salir de casa.').waitFor()
  await save(page, 'muro.png')
  await page.getByRole('link', { name: 'Ajustes' }).click()
  await page.getByTestId('ajustes').waitFor()
  await save(page, 'ajustes.png')
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await scene('diez')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await login(page, 'persona10@example.com')
  await page.getByTestId('go').click()
  await expect(page.getByTestId('celeb-line')).toHaveText('10 misas hoy')
  await save(page, 'celebracion.png')
  expect(errors).toEqual([])
})

test('captura del calendario en el escritorio', async ({ page, browserName, viewport }) => {
  test.skip(browserName !== 'chromium' || viewport?.width !== 1280)
  mkdirSync(shots, { recursive: true })
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
}
