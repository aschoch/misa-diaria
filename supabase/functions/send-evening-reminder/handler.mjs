// La clave privada y CRON_SECRET llegan por el entorno. Este módulo no los guarda.

export async function handleReminder(request, deps) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (request.method !== 'POST') {
    return Response.json({ error: 'Método no permitido' }, { status: 405 })
  }
  const provided = request.headers.get('x-cron-secret')
  if (!deps.cronSecret || provided !== deps.cronSecret) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const due = await deps.due()
  const massDate = await deps.tomorrow()
  let sent = 0
  for (const row of due) {
    const claimed = await deps.claim(row.member_id, massDate)
    if (!claimed) continue
    deps.log?.({ member_id: row.member_id, slot: 'evening' })
    const subs = await deps.subscriptions(row.member_id)
    if (!subs.length) continue
    let failures = 0
    for (const sub of subs) {
      const result = await deps.send(sub, row.body)
      if (result.status === 404 || result.status === 410) await deps.dropSubscription(sub.endpoint)
      if (result.status >= 400) failures += 1
      else sent += 1
    }
    if (failures === subs.length) await deps.release(row.member_id, massDate)
  }
  return Response.json({ sent })
}

export function liveDeps(env, send) {
  const headers = {
    apikey: env.serviceRole,
    Authorization: `Bearer ${env.serviceRole}`,
    'Content-Type': 'application/json',
  }

  async function rest(path, init = {}) {
    const response = await fetch(`${env.url}/rest/v1/${path}`, {
      method: init.method ?? 'GET',
      headers: { ...headers, ...(init.headers ?? {}) },
      body: init.body,
    })
    const text = await response.text()
    if (!response.ok) throw new Error('La base no aceptó el aviso')
    return text ? JSON.parse(text) : null
  }

  return {
    cronSecret: env.cronSecret,
    log: (entry) => console.log(JSON.stringify(entry)),
    due: async () => (await rest('rpc/aviso_tarde', { method: 'POST', body: '{}' })) ?? [],
    tomorrow: async () => {
      const today = await rest('rpc/madrid_today', { method: 'POST', body: '{}' })
      const [year, month, day] = String(today).slice(0, 10).split('-').map(Number)
      const next = new Date(Date.UTC(year, month - 1, day + 1))
      return next.toISOString().slice(0, 10)
    },
    claim: async (memberId, massDate) => {
      const rows = await rest('notification_log?on_conflict=member_id,mass_date,slot', {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
        body: JSON.stringify({ member_id: memberId, mass_date: massDate, slot: 'evening' }),
      })
      return Array.isArray(rows) && rows.length > 0
    },
    release: async (memberId, massDate) => {
      const query = new URLSearchParams({
        member_id: `eq.${memberId}`,
        mass_date: `eq.${massDate}`,
        slot: 'eq.evening',
      })
      await rest(`notification_log?${query}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    },
    subscriptions: async (memberId) => {
      const query = new URLSearchParams({
        select: 'endpoint,p256dh,auth_secret',
        member_id: `eq.${memberId}`,
      })
      return (await rest(`push_subscriptions?${query}`)) ?? []
    },
    dropSubscription: async (endpoint) => {
      const query = new URLSearchParams({ endpoint: `eq.${endpoint}` })
      await rest(`push_subscriptions?${query}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    },
    send,
  }
}
