import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleReminder, liveDeps } from '../../supabase/functions/send-evening-reminder/handler.mjs'

const sub = { endpoint: 'https://push.example.test/dispositivo', p256dh: 'p', auth_secret: 'a' }

function deps(over = {}) {
  const calls = []
  const base = {
    cronSecret: 'reloj-de-prueba',
    due: async () => [{ member_id: 'm1', body: 'Mañana nadie ha dicho que va a Misa.' }],
    tomorrow: async () => '2026-10-24',
    claim: async () => true,
    release: async () => { calls.push('release') },
    subscriptions: async () => [sub],
    dropSubscription: async (endpoint) => { calls.push(['drop', endpoint]) },
    send: async (item, body) => { calls.push(['send', item.endpoint, body]); return { status: 201 } },
    log: (entry) => { calls.push(['log', entry]) },
    calls,
  }
  return { ...base, ...over, calls }
}

function post(secret = 'reloj-de-prueba', extra = {}) {
  return new Request('http://local/functions/v1/send-evening-reminder', {
    method: 'POST',
    headers: { 'x-cron-secret': secret, ...extra },
  })
}

test('rechaza anónimo, usuario y un secreto vacío', async () => {
  for (const request of [
    post(''),
    post('otro'),
    new Request('http://local/functions/v1/send-evening-reminder', {
      method: 'POST',
      headers: { Authorization: 'Bearer anon-key' },
    }),
    new Request('http://local/functions/v1/send-evening-reminder', {
      method: 'POST',
      headers: { Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c3IifQ.e2e' },
    }),
  ]) {
    const box = deps()
    const response = await handleReminder(request, box)
    assert.equal(response.status, 401)
    assert.equal(box.calls.length, 0)
  }
})

test('anota antes de enviar y no llama a un servicio push de verdad', async () => {
  const box = deps()
  const response = await handleReminder(post(), box)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { sent: 1 })
  assert.deepEqual(box.calls[0], ['log', { member_id: 'm1', slot: 'evening' }])
  assert.deepEqual(box.calls[1], ['send', sub.endpoint, 'Mañana nadie ha dicho que va a Misa.'])
  assert.equal(box.calls.filter((call) => call[0] === 'send').length, 1)
})

test('si ya estaba anotado, no envía', async () => {
  const box = deps({ claim: async () => false })
  await handleReminder(post(), box)
  assert.equal(box.calls.length, 0)
})

test('404 y 410 borran la suscripción', async () => {
  for (const status of [404, 410]) {
    const box = deps({ send: async () => ({ status }) })
    await handleReminder(post(), box)
    assert.deepEqual(box.calls.find((call) => call[0] === 'drop')[1], sub.endpoint)
    assert.ok(box.calls.includes('release'))
  }
})

test('un fallo se deja para la hora siguiente, sin ráfaga', async () => {
  let sends = 0
  const box = deps({
    send: async () => { sends += 1; return { status: 500 } },
  })
  await handleReminder(post(), box)
  assert.equal(sends, 1)
  assert.ok(box.calls.includes('release'))
})

test('si un dispositivo recibió el aviso, no se suelta la anotación', async () => {
  const box = deps({
    subscriptions: async () => [sub, { ...sub, endpoint: 'https://push.example.test/otro' }],
    send: async (item) => ({ status: item.endpoint.endsWith('/otro') ? 500 : 201 }),
  })
  const response = await handleReminder(post(), box)
  assert.equal((await response.json()).sent, 1)
  assert.equal(box.calls.includes('release'), false)
})

test('el registro no lleva correo, endpoint ni intención', async () => {
  const seen = []
  const box = deps({
    due: async () => [{ member_id: 'm1', body: 'Mañana nadie ha dicho que va a Misa.', title: 'Misa diaria' }],
    send: async (item, body, title) => {
      seen.push([item.endpoint, body, title])
      return { status: 201 }
    },
  })
  await handleReminder(post(), box)
  const logged = JSON.stringify(box.calls.find((call) => call[0] === 'log'))
  assert.equal(logged.includes('@'), false)
  assert.equal(logged.includes('push.example'), false)
  assert.equal(logged.includes('intenc'), false)
  assert.deepEqual(seen, [[sub.endpoint, 'Mañana nadie ha dicho que va a Misa.', 'Misa diaria']])
})

test('la función publicada no trae secretos', () => {
  const source = readFileSync(new URL('../../supabase/functions/send-evening-reminder/index.ts', import.meta.url), 'utf8')
  assert.equal(source.includes('BEGIN PRIVATE'), false)
  assert.equal(source.includes('BEGIN EC PRIVATE'), false)
  assert.equal(/CRON_SECRET\s*=\s*['"][^'"]+['"]/.test(source), false)
  assert.equal(/VAPID_PRIVATE_KEY\s*=\s*['"][^'"]+['"]/.test(source), false)
  assert.match(source, /Deno\.env\.get\('CRON_SECRET'\)/)
  assert.match(source, /Deno\.env\.get\('VAPID_PRIVATE_KEY'\)/)
  assert.match(source, /TTL: 60 \* 60 \* 4/)
})

test('el cliente vivo solo habla con la base, no con un push real', async () => {
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push([url, init.method])
    if (String(url).includes('rpc/aviso_tarde')) return new Response('[]', { status: 200 })
    if (String(url).includes('rpc/madrid_today')) return new Response('"2026-10-23"', { status: 200 })
    return new Response('[]', { status: 200 })
  }
  const original = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    const live = liveDeps({
      url: 'http://127.0.0.1:54321',
      serviceRole: 'service-role-de-prueba',
      cronSecret: 'reloj-de-prueba',
    }, async () => ({ status: 201 }))
    assert.equal(live.cronSecret, 'reloj-de-prueba')
    assert.deepEqual(await live.due(), [])
    assert.equal(await live.tomorrow(), '2026-10-24')
    assert.ok(seen.every(([url]) => String(url).startsWith('http://127.0.0.1:54321/rest/v1/')))
  } finally {
    globalThis.fetch = original
  }
})
