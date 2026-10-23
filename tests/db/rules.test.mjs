import pg from 'pg'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const adminUrl = process.env.DATABASE_URL ?? 'postgres://misa:misa@127.0.0.1:5432/postgres'
const P = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const outsider = '00000000-0000-4000-8000-0000000000ff'

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

async function main() {
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query('drop database if exists misa_test with (force)')
  await admin.query('create database misa_test')
  await admin.end()

  const dbUrl = adminUrl.replace(/\/[^/]*$/, '/misa_test')
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()

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
  await client.query(readFileSync(join(root, 'supabase/migrations/20261023180000_init.sql'), 'utf8'))
  await client.query(readFileSync(join(root, 'supabase/seed.sql'), 'utf8'))

  const q = (text, params) => client.query(text, params)
  const one = async (text, params) => (await q(text, params)).rows[0]

  await client.query('begin')
  try {
    const emails = await q(`select email from auth.users`)
    assert(emails.rows.length === 12, 'hay 12 cuentas')
    assert(emails.rows.every((row) => row.email.endsWith('@example.com')), 'solo @example.com')
    const names = await q(`select display_name from public.members`)
    const got = names.rows.map((row) => row.display_name).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)))
    assert(got.join(',') === Array.from({ length: 12 }, (_, i) => `Persona ${i + 1}`).join(','), 'nombres de prueba')
    const couples = await q(`select label from public.couples order by label`)
    assert(couples.rows.length === 6, 'seis parejas')

    await q('delete from public.celebrations')
    await q('delete from public.attendance')
    await q('delete from public.commitments')
    await q('delete from public.intentions')
    await q('delete from public.notification_prefs')
    await q('delete from public.notification_log')

    async function at(iso, fn) {
      await q('savepoint caso')
      await q(`select set_config('app.now', $1, true)`, [iso])
      try {
        await fn()
      } finally {
        await q('rollback to savepoint caso')
      }
    }

    const madrid = async (iso) => (await one(
      `select ($1::timestamptz at time zone 'Europe/Madrid')::date::text as d`,
      [iso],
    )).d

    assert(await madrid('2026-01-10T22:30:00Z') === '2026-01-10', 'antes de medianoche en Madrid')
    assert(await madrid('2026-01-10T23:30:00Z') === '2026-01-11', 'después de medianoche en Madrid')
    await at('2026-01-10T22:30:00Z', async () => {
      assert((await one(`select public.madrid_today()::text as d`)).d === '2026-01-10', 'reloj 22:30 UTC')
    })
    await at('2026-01-10T23:30:00Z', async () => {
      assert((await one(`select public.madrid_today()::text as d`)).d === '2026-01-11', 'reloj 23:30 UTC')
    })

    async function attend(member, date) {
      await q(
        `insert into public.attendance (member_id, mass_date) values ($1, $2) on conflict do nothing`,
        [member, date],
      )
    }

    await at('2026-10-21T10:00:00Z', async () => {
      for (const date of ['2026-10-19', '2026-10-20', '2026-10-21']) await attend(P(1), date)
      assert((await one(`select public.racha_individual($1, '2026-10-21') as n`, [P(1)])).n === 3, 'tres días seguidos')
    })

    await at('2026-10-21T10:00:00Z', async () => {
      await attend(P(1), '2026-10-19')
      await attend(P(1), '2026-10-20')
      assert((await one(`select public.racha_individual($1, '2026-10-21') as n`, [P(1)])).n === 2, 'hoy abierto no rompe')
    })

    await at('2026-10-19T10:00:00Z', async () => {
      await attend(P(1), '2026-10-17')
      assert((await one(`select public.racha_individual($1, '2026-10-19') as n`, [P(1)])).n === 0, 'el domingo cerrado rompe')
    })

    await at('2026-10-19T10:00:00Z', async () => {
      await attend(P(1), '2026-10-17')
      await attend(P(1), '2026-10-18')
      assert((await one(`select public.racha_individual($1, '2026-10-19') as n`, [P(1)])).n === 2, 'el domingo con misa cuenta')
    })

    await at('2026-10-18T10:00:00Z', async () => {
      await attend(P(1), '2026-10-17')
      assert((await one(`select public.racha_individual($1, '2026-10-18') as n`, [P(1)])).n === 1, 'el domingo aún abierto no rompe')
    })

    await at('2026-10-20T10:00:00Z', async () => {
      await attend(P(2), '2026-10-20')
      assert((await one(`select public.racha_pareja($1, '2026-10-20') as n`, [P(1)])).n === 1, 'la pareja cuenta con uno')
      assert((await one(`select public.racha_individual($1, '2026-10-20') as n`, [P(1)])).n === 0, 'la individual no hereda')
      assert((await one(`select public.racha_grupo('2026-10-20') as n`)).n === 1, 'el grupo cuenta con una persona')
    })

    await at('2026-10-20T10:00:00Z', async () => {
      for (let n = 1; n <= 9; n += 1) await attend(P(n), '2026-10-20')
      assert((await one(`select public.racha_diez('2026-10-20') as n`)).n === 0, 'nueve no llegan a diez')
      await attend(P(10), '2026-10-20')
      await attend(P(10), '2026-10-20')
      assert((await one(`select public.racha_diez('2026-10-20') as n`)).n === 1, 'diez personas, un toque no suma')
      assert((await one(`select count(*)::int as n from public.attendance where mass_date = '2026-10-20'`)).n === 10, 'el contador es de filas')
    })

    const pendingLine = async (member, asOf) => {
      const row = await one(`select public.celebraciones_pendientes($1, $2) as p`, [member, asOf])
      return row.p
    }

    await at('2026-10-20T10:00:00Z', async () => {
      for (let n = 1; n <= 10; n += 1) await attend(P(n), '2026-10-20')
      const pending = await pendingLine(P(1), '2026-10-20')
      assert(pending[0].line === '10 misas hoy', 'el día de diez tiene línea')
      assert(pending[0].key === 'celeb:diez:2026-10-20', 'clave del día de diez')
      await q(
        `insert into public.celebrations (member_id, event_key) values ($1, 'celeb:diez:2026-10-20')`,
        [P(1)],
      )
      const again = await pendingLine(P(1), '2026-10-20')
      assert(!again.some((item) => item.key === 'celeb:diez:2026-10-20'), 'no se repite')
    })

    await at('2026-10-20T10:00:00Z', async () => {
      for (let n = 1; n <= 12; n += 1) await attend(P(n), '2026-10-20')
      const pending = await pendingLine(P(1), '2026-10-20')
      assert(pending[0].line === '¡Hoy habéis ido los doce!', 'si coinciden, manda todos')
      assert(pending.some((item) => item.key === 'celeb:diez:2026-10-20'), 'la clave de diez se guarda')
    })

    await at('2026-10-25T10:00:00Z', async () => {
      for (let day = 19; day <= 25; day += 1) await attend(P(1), `2026-10-${day}`)
      const pending = await pendingLine(P(1), '2026-10-25')
      assert(pending.some((item) => item.key === 'celeb:hito:tuya:7' && item.line === 'Tú · 7 días seguidos'), 'hito 7')
      assert(!pending.some((item) => item.key === 'celeb:hito:tuya:8'), 'el día 8 no es hito')
    })

    assert((await one(`select public.dia_en_riesgo('2026-10-18') as r`)).r === false, 'el domingo no está en riesgo')
    assert((await one(`select public.dia_en_riesgo('2026-10-17') as r`)).r === true, 'el sábado vacío está en riesgo')

    await q('savepoint parejas')
    for (const n of [1, 3, 5, 7, 9, 11]) {
      await q(`insert into public.commitments (member_id, mass_date) values ($1, '2026-10-23')`, [P(n)])
    }
    assert((await one(`select public.dia_en_riesgo('2026-10-23') as r`)).r === false, 'con las seis parejas no está en riesgo')
    await q('rollback to savepoint parejas')

    await q('savepoint hueco')
    for (const n of [1, 3, 5, 7, 9]) {
      await q(`insert into public.commitments (member_id, mass_date) values ($1, '2026-10-23')`, [P(n)])
    }
    assert((await one(`select public.dia_en_riesgo('2026-10-23') as r`)).r === true, 'falta una pareja')
    await q(`select set_config('request.jwt.claim.sub', $1, true)`, [P(1)])
    await q(`select set_config('app.now', '2026-10-23T10:00:00Z', true)`)
    const hueco = await one(`select public.estado() as e`)
    const viernes = hueco.e.calendar.find((day) => day.date === '2026-10-23')
    assert(viernes.at_risk === true && viernes.gaps.length === 1 && viernes.gaps[0] === 'Pareja 6', 'el calendario nombra a Pareja 6')
    const domingo = hueco.e.calendar.find((day) => day.date === '2026-10-25')
    assert(domingo.sunday === true && domingo.at_risk === false, 'el domingo del calendario no está en riesgo')
    await q('rollback to savepoint hueco')

    const friday = '2026-10-23T18:30:00Z'
    const rows = async (when) => (await q(`select member_id::text, body from public.aviso_tarde($1::timestamptz)`, [when])).rows
    assert((await rows('2026-10-18T18:30:00Z')).length === 0, 'el domingo no se avisa')
    assert((await rows('2026-10-17T18:30:00Z')).length === 0, 'el sábado no avisa del domingo')
    assert((await rows('2026-10-23T17:30:00Z')).length === 0, 'antes de las 20 no sale')

    await q(`insert into public.notification_prefs (member_id, empty_day, couple) values ($1, true, true), ($2, false, true)`, [P(1), P(11)])
    const evening = await rows(friday)
    assert(evening.length === 1 && evening[0].member_id === P(1), 'el día vacío avisa a quien lo pidió')
    assert(!evening.some((row) => row.body.includes('pareja')), 'el día vacío no manda también el de pareja')

    await q('delete from public.notification_prefs')
    for (const n of [1, 3, 5, 7, 9]) {
      await q(`insert into public.commitments (member_id, mass_date) values ($1, '2026-10-24')`, [P(n)])
    }
    await q(
      `insert into public.notification_prefs (member_id, empty_day, couple) values ($1, true, false), ($2, false, true), ($3, false, true)`,
      [P(1), P(11), P(12)],
    )
    const couple = await rows(friday)
    const ids = couple.map((row) => row.member_id).sort()
    assert(ids.length === 2 && ids[0] === P(11) && ids[1] === P(12), 'solo la pareja descubierta')
    assert(couple.every((row) => row.body.includes('pareja')), 'el texto es el de la pareja')

    async function asUser(id, fn) {
      await q('savepoint rol')
      await q(`select set_config('request.jwt.claim.sub', $1, true)`, [id])
      await q(`select set_config('app.now', '2026-10-23T11:00:00Z', true)`)
      await q('set local role authenticated')
      try {
        await fn()
      } finally {
        await q('rollback to savepoint rol')
      }
    }

    async function expectFail(fn) {
      await q('savepoint fallo')
      try {
        await fn()
        throw new Error('tenía que fallar')
      } catch (error) {
        await q('rollback to savepoint fallo')
        if (error.message === 'tenía que fallar') throw error
      }
    }

    await q(`insert into auth.users (id, email) values ($1, 'fuera@example.com')`, [outsider])

    await asUser(outsider, async () => {
      assert((await one(`select count(*)::int as n from public.attendance`)).n === 0, 'quien no es miembro no lee')
      await expectFail(() => q(
        `insert into public.attendance (member_id, mass_date) values ($1, '2026-10-23')`,
        [outsider],
      ))
      await expectFail(() => q(`select public.estado()`))
    })

    await q('savepoint anon')
    await q('set local role anon')
    await expectFail(() => q(`select * from public.attendance`))
    await expectFail(() => q(
      `insert into public.attendance (member_id, mass_date) values ($1, '2026-10-23')`,
      [P(1)],
    ))
    await q('rollback to savepoint anon')

    await asUser(P(1), async () => {
      await q(`insert into public.attendance (member_id, mass_date) values ($1, '2026-10-23')`, [P(1)])
      await q(`insert into public.attendance (member_id, mass_date) values ($1, '2026-10-17')`, [P(1)])
      await expectFail(() => q(
        `insert into public.attendance (member_id, mass_date) values ($1, '2026-10-16')`,
        [P(1)],
      ))
      await expectFail(() => q(
        `insert into public.attendance (member_id, mass_date) values ($1, '2026-10-24')`,
        [P(1)],
      ))
      await expectFail(() => q(
        `insert into public.attendance (member_id, mass_date) values ($1, '2026-10-23')`,
        [P(2)],
      ))
      const state = await one(`select public.estado() as e`)
      assert(state.e.me.display_name === 'Persona 1', 'estado devuelve a la persona')
      assert(!JSON.stringify(state.e).includes('@example.com'), 'el estado no lleva correos')
      assert(state.e.past.length === 6, 'seis días')
    })

    const monday = await one(`select public.resumen_semana('2026-10-26') as r`)
    assert(monday.r && 'people' in monday.r && 'empty_days' in monday.r, 'el lunes tiene tres cifras')
    const tuesday = await one(`select public.resumen_semana('2026-10-27') as r`)
    assert(tuesday.r === null, 'otro día no hay resumen')

    await client.query('rollback')
    console.log('pruebas de base: ok')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
