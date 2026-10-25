import { createServer } from 'node:http'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const anonKey = 'sb_test_anon_misa'
const outsider = '00000000-0000-4000-8000-0000000000ff'
const P = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

const adminUrl = process.env.DATABASE_URL ?? 'postgres://misa:misa@127.0.0.1:5432/postgres'
const dbUrl = adminUrl.replace(/\/[^/]*$/, '/misa_e2e')

let clock = '2026-10-23T10:00:00Z'
const inbox = new Map()
const otpTries = new Map()
const DEFAULT_PASSWORD = 'misa-2026'
const passwords = new Map()

function passwordFor(email) {
  return passwords.get(email) ?? DEFAULT_PASSWORD
}

function json(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function empty(res, status) {
  res.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  })
  res.end()
}

function userFromAuth(header) {
  if (!header) return null
  const token = header.replace(/^Bearer\s+/i, '')
  if (!token || token === anonKey) return null
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString())
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

function sign(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  })).toString('base64url')
  return `${header}.${payload}.e2e`
}

function session(user) {
  return {
    access_token: sign(user),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${user.id}`,
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
    },
  }
}

async function admin(fn) {
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function asRole(header, fn) {
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('app.now', $1, true)`, [clock])
    const userId = userFromAuth(header)
    if (userId) {
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
      await client.query('set local role authenticated')
    } else {
      await client.query('set local role anon')
    }
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    try { await client.query('rollback') } catch { /* ya cerrada */ }
    throw error
  } finally {
    await client.end()
  }
}

function pgError(res, error) {
  const code = error.code ?? 'P0001'
  const status = code === '42501' ? 403 : code === '23505' ? 409 : 400
  json(res, status, {
    code,
    message: error.message,
    details: error.detail ?? null,
    hint: error.hint ?? null,
  })
}

function filters(url) {
  const out = {}
  for (const [key, value] of url.searchParams) {
    if (key === 'on_conflict' || key === 'select') continue
    const match = /^eq\.(.*)$/.exec(value)
    if (!match) continue
    out[key] = match[1]
  }
  return out
}

async function wallCopy(client, portuguese) {
  const first = portuguese ? 'Por quem não pode sair de casa.' : 'Por quienes no pueden salir de casa.'
  const second = portuguese ? 'Pela paz em casa.' : 'Por la paz en casa.'
  const older = portuguese ? 'Rezamos por eles.' : 'Rezamos por ellos.'
  const newer = portuguese ? 'Eu também.' : 'Yo también.'
  await client.query('truncate public.intention_comments, public.intention_reactions, public.intentions')
  const inserted = await client.query(
    `insert into public.intentions (member_id, body, created_at) values ($1, $2, now()) returning id`,
    [P(1), first],
  )
  await client.query(
    `insert into public.intentions (member_id, body, created_at) values ($1, $2, ((now() at time zone 'Europe/Madrid') - interval '1 day') at time zone 'Europe/Madrid')`,
    [P(4), second],
  )
  const id = inserted.rows[0].id
  await client.query(`
    insert into public.intention_comments (intention_id, member_id, body, created_at) values
      ($1, $2, $3, now() - interval '2 hours'),
      ($1, $4, $5, now() - interval '25 minutes')
  `, [id, P(4), older, P(1), newer])
  await client.query(`
    insert into public.intention_reactions (intention_id, member_id, emoji) values
      ($1, $2, '🙏'),
      ($1, $3, '🙏'),
      ($1, $3, '💛')
  `, [id, P(1), P(4)])
}

async function seedActivity(client) {
  await client.query(`select set_config('app.now', $1, false)`, [clock])
  await client.query(`
    update public.members
    set display_name = 'Persona ' || n
    from generate_series(1, 12) as n
    where id = ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
  `)
  await client.query(`
    truncate public.intention_comments, public.intention_reactions,
      public.attendance, public.commitments, public.intentions,
      public.celebrations, public.notification_prefs, public.notification_log,
      public.push_subscriptions, public.feedback
  `)
  await client.query(`
    insert into public.attendance (member_id, mass_date)
    select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
           public.madrid_today() - offs
    from generate_series(1, 11) as n
    cross join generate_series(1, 3) as offs;

    insert into public.attendance (member_id, mass_date)
    select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
           public.madrid_today()
    from generate_series(1, 9) as n;

    insert into public.intentions (member_id, body, created_at) values
      (('00000000-0000-4000-8000-' || lpad(to_hex(1), 12, '0'))::uuid, 'Por quienes no pueden salir de casa.', now()),
      (('00000000-0000-4000-8000-' || lpad(to_hex(4), 12, '0'))::uuid, 'Por la paz en casa.', ((now() at time zone 'Europe/Madrid') - interval '1 day') at time zone 'Europe/Madrid');

    insert into public.commitments (member_id, mass_date)
    select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
           public.madrid_today() + 1
    from generate_series(1, 10) as n;

    insert into public.celebrations (member_id, event_key)
    select m.id, 'celeb:diez:' || d::text
    from public.members m
    cross join (
      select mass_date as d from public.attendance
      group by mass_date having count(distinct member_id) >= 10
    ) days
    on conflict do nothing;

    insert into public.celebrations (member_id, event_key)
    select m.id, 'celeb:parejas:' || d::text
    from public.members m
    cross join (
      select a.mass_date as d
      from public.attendance a
      join public.members mm on mm.id = a.member_id
      group by a.mass_date
      having count(distinct mm.couple_id) = 6
    ) days
    on conflict do nothing;
  `)
}

export async function prepareDatabase() {
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query('drop database if exists misa_e2e with (force)')
  await admin.query('create database misa_e2e')
  await admin.end()

  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  await client.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    grant anon, authenticated, service_role to current_user;
  `)
  await client.query(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id uuid primary key,
      email text unique not null
    );
    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `)
  await client.query(`select set_config('app.now', $1, false)`, [clock])
  const migrations = readdirSync(join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()
  for (const name of migrations) {
    const sql = readFileSync(join(root, 'supabase/migrations', name), 'utf8')
    try {
      await client.query(sql)
    } catch (err) {
      const missing = name === '20261024002113_activar_cron_net.sql'
        && /pg_cron|pg_net/.test(err.message)
        && /not available|could not open extension control file/.test(err.message)
      if (!missing) throw err
      console.error(`${name} no se aplica en esta base (${err.message}). Es para producción.`)
    }
  }
  await client.query(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'))
  await client.query(
    `insert into auth.users (id, email) values ($1, 'fuera@example.com') on conflict do nothing`,
    [outsider],
  )
  await seedActivity(client)
  await client.end()
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return null
  const text = Buffer.concat(chunks).toString()
  return text ? JSON.parse(text) : null
}

async function handleRest(req, res, url) {
  const header = req.headers.authorization
  try {
    if (url.pathname === '/rest/v1/rpc/estado' && req.method === 'POST') {
      const data = await asRole(header, async (client) => {
        const row = await client.query('select public.estado() as e')
        return row.rows[0].e
      })
      json(res, 200, data)
      return
    }

    if (url.pathname === '/rest/v1/attendance' && req.method === 'POST') {
      const body = await readBody(req)
      await asRole(header, (client) => client.query(
        'insert into public.attendance (member_id, mass_date) values ($1, $2)',
        [body.member_id, body.mass_date],
      ))
      empty(res, 201)
      return
    }

    if (url.pathname === '/rest/v1/attendance' && req.method === 'DELETE') {
      const query = filters(url)
      await asRole(header, (client) => client.query(
        'delete from public.attendance where member_id = $1 and mass_date = $2',
        [query.member_id, query.mass_date],
      ))
      empty(res, 204)
      return
    }

    if (url.pathname === '/rest/v1/attendance' && req.method === 'GET') {
      const rows = await asRole(header, async (client) => (await client.query(
        'select member_id, mass_date from public.attendance',
      )).rows)
      json(res, 200, rows)
      return
    }

    if (url.pathname === '/rest/v1/commitments' && req.method === 'POST') {
      const body = await readBody(req)
      await asRole(header, (client) => client.query(
        'insert into public.commitments (member_id, mass_date) values ($1, $2)',
        [body.member_id, body.mass_date],
      ))
      empty(res, 201)
      return
    }

    if (url.pathname === '/rest/v1/members' && req.method === 'PATCH') {
      const body = await readBody(req)
      const query = filters(url)
      const name = String(body.display_name ?? '').trim()
      if (name.length < 1 || name.length > 40) {
        json(res, 400, { message: 'nombre' })
        return
      }
      await asRole(header, (client) => client.query(
        'update public.members set display_name = $2 where id = $1',
        [query.id, name],
      ))
      empty(res, 204)
      return
    }

    if (url.pathname === '/rest/v1/commitments' && req.method === 'DELETE') {
      const query = filters(url)
      await asRole(header, (client) => client.query(
        'delete from public.commitments where member_id = $1 and mass_date = $2',
        [query.member_id, query.mass_date],
      ))
      empty(res, 204)
      return
    }

    if (url.pathname === '/rest/v1/intentions' && req.method === 'POST') {
      const body = await readBody(req)
      await asRole(header, (client) => client.query(
        'insert into public.intentions (member_id, body) values ($1, $2)',
        [body.member_id, String(body.body ?? '').slice(0, 280)],
      ))
      empty(res, 201)
      return
    }

    if (url.pathname === '/rest/v1/intentions' && req.method === 'PATCH') {
      const body = await readBody(req)
      const query = filters(url)
      await asRole(header, (client) => client.query(
        'update public.intentions set body = $2 where id = $1',
        [query.id, body.body],
      ))
      empty(res, 204)
      return
    }

    if (url.pathname === '/rest/v1/intentions' && req.method === 'DELETE') {
      const query = filters(url)
      await asRole(header, (client) => client.query(
        'delete from public.intentions where id = $1',
        [query.id],
      ))
      empty(res, 204)
      return
    }

    if (url.pathname === '/rest/v1/intention_comments' && req.method === 'POST') {
      const body = await readBody(req)
      await asRole(header, (client) => client.query(
        'insert into public.intention_comments (member_id, intention_id, body) values ($1, $2, $3)',
        [body.member_id, body.intention_id, body.body],
      ))
      empty(res, 201)
      return
    }

    if (url.pathname === '/rest/v1/intention_comments' && req.method === 'PATCH') {
      const body = await readBody(req)
      const query = filters(url)
      await asRole(header, (client) => client.query(
        'update public.intention_comments set body = $2 where id = $1',
        [query.id, body.body],
      ))
      empty(res, 204)
      return
    }

    if (url.pathname === '/rest/v1/intention_comments' && req.method === 'DELETE') {
      const query = filters(url)
      await asRole(header, (client) => client.query(
        'delete from public.intention_comments where id = $1',
        [query.id],
      ))
      empty(res, 204)
      return
    }

    if (url.pathname === '/rest/v1/intention_reactions' && req.method === 'POST') {
      const body = await readBody(req)
      await asRole(header, (client) => client.query(
        'insert into public.intention_reactions (member_id, intention_id, emoji) values ($1, $2, $3)',
        [body.member_id, body.intention_id, body.emoji],
      ))
      empty(res, 201)
      return
    }

    if (url.pathname === '/rest/v1/intention_reactions' && req.method === 'DELETE') {
      const query = filters(url)
      await asRole(header, (client) => client.query(
        'delete from public.intention_reactions where member_id = $1 and intention_id = $2 and emoji = $3',
        [query.member_id, query.intention_id, query.emoji],
      ))
      empty(res, 204)
      return
    }

    if (url.pathname === '/rest/v1/notification_prefs' && req.method === 'POST') {
      const body = await readBody(req)
      await asRole(header, (client) => client.query(`
        insert into public.notification_prefs (member_id, empty_day, couple, locale, updated_at)
        values ($1, $2, $3, $4, coalesce($5::timestamptz, now()))
        on conflict (member_id) do update
          set empty_day = excluded.empty_day,
              couple = excluded.couple,
              locale = excluded.locale,
              updated_at = excluded.updated_at
      `, [
        body.member_id,
        body.empty_day,
        body.couple,
        body.locale === 'pt' || body.locale === 'es' ? body.locale : null,
        body.updated_at ?? null,
      ]))
      empty(res, 201)
      return
    }

    if (url.pathname === '/rest/v1/celebrations' && req.method === 'POST') {
      const body = await readBody(req)
      const rows = Array.isArray(body) ? body : [body]
      const inserted = await asRole(header, async (client) => {
        const keys = []
        for (const row of rows) {
          const result = await client.query(`
            insert into public.celebrations (member_id, event_key)
            values ($1, $2)
            on conflict (member_id, event_key) do nothing
            returning event_key
          `, [row.member_id, row.event_key])
          if (result.rows[0]) keys.push(result.rows[0])
        }
        return keys
      })
      json(res, 201, inserted)
      return
    }

    if (url.pathname === '/rest/v1/feedback' && req.method === 'POST') {
      const body = await readBody(req)
      await asRole(header, (client) => client.query(
        'insert into public.feedback (member_id, body) values ($1, $2)',
        [body.member_id, body.body],
      ))
      empty(res, 201)
      return
    }

    if (url.pathname === '/rest/v1/push_subscriptions' && req.method === 'POST') {
      const body = await readBody(req)
      await asRole(header, (client) => client.query(`
        insert into public.push_subscriptions (member_id, endpoint, p256dh, auth_secret)
        values ($1, $2, $3, $4)
        on conflict (endpoint) do update
          set member_id = excluded.member_id,
              p256dh = excluded.p256dh,
              auth_secret = excluded.auth_secret
      `, [body.member_id, body.endpoint, body.p256dh, body.auth_secret]))
      empty(res, 201)
      return
    }

    if (url.pathname === '/rest/v1/push_subscriptions' && req.method === 'DELETE') {
      const query = filters(url)
      await asRole(header, (client) => client.query(
        'delete from public.push_subscriptions where endpoint = $1',
        [query.endpoint],
      ))
      empty(res, 204)
      return
    }

    json(res, 404, { code: 'PGRST204', message: 'No está', details: url.pathname, hint: null })
  } catch (error) {
    pgError(res, error)
  }
}

async function handleAuth(req, res, url) {
  if (url.pathname === '/auth/v1/otp' && req.method === 'POST') {
    const body = await readBody(req)
    const email = String(body?.email ?? '').trim().toLowerCase()
    const tries = (otpTries.get(email) ?? 0) + 1
    otpTries.set(email, tries)
    if (tries > 1) {
      json(res, 429, { error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' })
      return
    }
    const user = await admin(async (client) => (await client.query(
      'select id::text, email from auth.users where email = $1',
      [email],
    )).rows[0])
    if (user) inbox.set(email, String(Math.floor(100000 + Math.random() * 900000)))
    json(res, 200, {})
    return
  }

  if (url.pathname === '/auth/v1/verify' && req.method === 'POST') {
    const body = await readBody(req)
    const email = String(body?.email ?? '').trim().toLowerCase()
    const user = await admin(async (client) => (await client.query(
      'select id::text, email from auth.users where email = $1',
      [email],
    )).rows[0])
    if (!user || inbox.get(email) !== String(body?.token ?? '')) {
      json(res, 400, { msg: 'Token has expired or is invalid', error_code: 'otp_expired' })
      return
    }
    inbox.delete(email)
    json(res, 200, session(user))
    return
  }

  if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
    const body = await readBody(req)
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    const user = await admin(async (client) => (await client.query(
      'select id::text, email from auth.users where email = $1',
      [email],
    )).rows[0])
    if (!user || password.length < 6 || password !== passwordFor(email)) {
      json(res, 400, { msg: 'Invalid login credentials', error_code: 'invalid_credentials' })
      return
    }
    json(res, 200, session(user))
    return
  }

  if (url.pathname === '/auth/v1/user' && req.method === 'PUT') {
    const id = userFromAuth(req.headers.authorization)
    const body = await readBody(req)
    if (!id || String(body?.password ?? '').length < 6) {
      json(res, 422, { msg: 'Password should be at least 6 characters', error_code: 'weak_password' })
      return
    }
    const user = await admin(async (client) => (await client.query(
      'select id::text, email from auth.users where id = $1',
      [id],
    )).rows[0])
    if (user) passwords.set(user.email, String(body.password))
    json(res, 200, user ? session(user).user : {})
    return
  }

  if (url.pathname === '/auth/v1/logout' && req.method === 'POST') {
    empty(res, 204)
    return
  }

  if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
    const id = userFromAuth(req.headers.authorization)
    if (!id) {
      json(res, 401, { msg: 'No autorizado', error_code: 'no_authorization' })
      return
    }
    const user = await admin(async (client) => (await client.query(
      'select id::text, email from auth.users where id = $1',
      [id],
    )).rows[0])
    json(res, 200, user ? session(user).user : {})
    return
  }

  json(res, 404, { msg: 'No está', error_code: 'not_found' })
}

export function startGateway(port = 54321) {
  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      empty(res, 204)
      return
    }
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    try {
      if (url.pathname === '/test/inbox' && req.method === 'GET') {
        const email = url.searchParams.get('email')?.toLowerCase() ?? ''
        const code = inbox.get(email)
        if (!code) {
          json(res, 404, { error: 'sin código' })
          return
        }
        json(res, 200, { code })
        return
      }
      if (url.pathname === '/test/clock' && req.method === 'POST') {
        const body = await readBody(req)
        if (!/^\d{4}-\d{2}-\d{2}T/.test(body?.at ?? '')) {
          json(res, 400, { error: 'reloj' })
          return
        }
        clock = body.at
        json(res, 200, { at: clock })
        return
      }
      if (url.pathname === '/test/reset' && req.method === 'POST') {
        const body = await readBody(req)
        clock = body?.at ?? '2026-10-23T10:00:00Z'
        inbox.clear()
        otpTries.clear()
        passwords.clear()
        await admin(seedActivity)
        json(res, 200, { at: clock })
        return
      }
      if (url.pathname === '/test/scene' && req.method === 'POST') {
        const body = await readBody(req)
        if (body?.name === 'muro-es' || body?.name === 'muro-pt') {
          await admin((client) => wallCopy(client, body.name === 'muro-pt'))
          json(res, 200, { name: body.name, at: clock })
          return
        }
        if (body?.name === 'cubiertas') {
          await admin(async (client) => {
            await client.query(`select set_config('app.now', $1, false)`, [clock])
            await client.query(`delete from public.commitments where mass_date = '2026-10-26'`)
            await client.query(`delete from public.attendance where mass_date = '2026-10-26'`)
            await client.query(`
              insert into public.commitments (member_id, mass_date)
              select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid, '2026-10-26'
              from generate_series(1, 12) as n
              where n % 2 = 1
            `)
          })
          json(res, 200, { name: body.name, at: clock })
          return
        }
        clock = '2026-10-23T10:00:00Z'
        await admin(async (client) => {
          await client.query(`select set_config('app.now', $1, false)`, [clock])
          await client.query('truncate public.attendance, public.celebrations, public.notification_log')
          if (body?.name === 'diez') {
            await client.query(`
              insert into public.attendance (member_id, mass_date)
              select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid, '2026-10-23'
              from generate_series(1, 9) as n
            `)
          }
        })
        json(res, 200, { name: body?.name, at: clock })
        return
      }
      if (req.headers.apikey !== anonKey && !url.pathname.startsWith('/auth/')) {
        json(res, 401, { message: 'Falta la clave', code: '401' })
        return
      }
      if (url.pathname.startsWith('/auth/')) {
        await handleAuth(req, res, url)
        return
      }
      if (url.pathname.startsWith('/rest/')) {
        await handleRest(req, res, url)
        return
      }
      json(res, 404, { message: 'No está' })
    } catch (error) {
      json(res, 500, { message: error.message })
    }
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

export { anonKey, P, outsider }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await prepareDatabase()
  await startGateway()
  console.log('puerta de prueba en http://127.0.0.1:54321')
}
