-- «Hoy» en la zona del teléfono (27-10-2026). Pegar entero en SQL Editor: es una
-- transacción; si algo falla, no cambia nada. Es la migración
-- 20261027170000_hoy_en_el_telefono.sql, más comprobaciones al final.

begin;

-- «Hoy» es el día donde está el teléfono. Medio curso vive en Portugal: entre las
-- 23:00 y las 24:00 de Lisboa, Madrid ya es mañana y la app marcaba «He ido» en el
-- día siguiente.
--
-- estado(p_tz) calcula hoy en la zona del teléfono. Solo acepta ese día o el
-- anterior al de Madrid (Lisboa, Canarias, Londres); con cualquier otra zona, o una
-- que no exista, se queda en Madrid. estado() sin zona sigue igual, para la app que
-- aún no se haya actualizado.
--
-- El cuerpo de antes pasa sin cambios a estado_en(día, zona), que solo llaman estas
-- dos y que ningún miembro puede llamar directamente.

create or replace function public.estado_en(p_today date, p_tz text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  me uuid := auth.uid();
  today date := p_today;
  cal jsonb := '[]'::jsonb;
  past jsonb := '[]'::jsonb;
  history jsonb := '[]'::jsonb;
  d date;
  i integer;
  marcas jsonb;
  covered integer;
  risk text;
begin
  if not public.es_miembro() then
    raise exception 'No eres del curso' using errcode = '42501';
  end if;

  for i in 0..13 loop
    d := today + i;
    marcas := public.marcas_dia(d);
    cal := cal || jsonb_build_array(jsonb_build_object(
      'date', d,
      'covered', (
        select count(*) from public.members m
        where m.active and public.persona_cubre(m.id, d)
      ),
      'couples', (
        select count(*) from public.couples cp
        where exists (
          select 1 from public.members m
          where m.couple_id = cp.id and m.active and public.persona_cubre(m.id, d)
        )
      ),
      'went', (marcas->>'went')::int,
      'couples_went', (marcas->>'couples_went')::int,
      'committed', (marcas->>'committed')::boolean,
      'at_risk', public.dia_en_riesgo(d),
      'sunday', extract(dow from d) = 0,
      'mine_commitment', exists (
        select 1 from public.commitments c where c.member_id = me and c.mass_date = d
      ),
      'mine_attendance', exists (
        select 1 from public.attendance a where a.member_id = me and a.mass_date = d
      )
    ));
  end loop;

  for d in
    select distinct c.mass_date
    from public.commitments c
    where c.mass_date > today + 13
    order by 1
  loop
    marcas := public.marcas_dia(d);
    cal := cal || jsonb_build_array(jsonb_build_object(
      'date', d,
      'covered', (
        select count(*) from public.members m
        where m.active and public.persona_cubre(m.id, d)
      ),
      'couples', (
        select count(*) from public.couples cp
        where exists (
          select 1 from public.members m
          where m.couple_id = cp.id and m.active and public.persona_cubre(m.id, d)
        )
      ),
      'went', (marcas->>'went')::int,
      'couples_went', (marcas->>'couples_went')::int,
      'committed', (marcas->>'committed')::boolean,
      'at_risk', public.dia_en_riesgo(d),
      'sunday', extract(dow from d) = 0,
      'mine_commitment', exists (
        select 1 from public.commitments c where c.member_id = me and c.mass_date = d
      ),
      'mine_attendance', exists (
        select 1 from public.attendance a where a.member_id = me and a.mass_date = d
      )
    ));
  end loop;

  for i in 1..6 loop
    d := today - i;
    marcas := public.marcas_dia(d);
    past := past || jsonb_build_array(jsonb_build_object(
      'date', d,
      'sunday', extract(dow from d) = 0,
      'mine_attendance', exists (
        select 1 from public.attendance a where a.member_id = me and a.mass_date = d
      ),
      'went', (marcas->>'went')::int,
      'couples_went', (marcas->>'couples_went')::int
    ));
  end loop;

  select count(*) into covered
  from public.members m
  where m.active and public.persona_cubre(m.id, today);

  history := coalesce((
    select jsonb_agg(jsonb_build_object(
      'date', days.mass_date,
      'went', (
        select count(distinct a2.member_id)
        from public.attendance a2
        join public.members m2 on m2.id = a2.member_id
        where m2.active and a2.mass_date = days.mass_date
      ),
      'couples_went', (
        select count(*)
        from public.couples cp
        where exists (
          select 1
          from public.members m3
          join public.attendance a3 on a3.member_id = m3.id and a3.mass_date = days.mass_date
          where m3.couple_id = cp.id and m3.active
        )
      ),
      'mine_attendance', exists (
        select 1 from public.attendance mine
        where mine.member_id = me and mine.mass_date = days.mass_date
      ),
      'couple_attendance', exists (
        select 1
        from public.attendance ca
        join public.members cm on cm.id = ca.member_id
        where ca.mass_date = days.mass_date
          and cm.couple_id = (select couple_id from public.members where id = me)
      )
    ) order by days.mass_date)
    from (select distinct mass_date from public.attendance) days
  ), '[]'::jsonb);

  risk := case
    when public.dia_en_riesgo(today) and covered = 0 then 'empty'
    else null
  end;

  return jsonb_build_object(
    'today', today,
    'clock', to_char(public.app_now() at time zone p_tz, 'HH24:MI'),
    'me', (
      select jsonb_build_object(
        'id', m.id,
        'display_name', m.display_name,
        'couple_id', m.couple_id,
        'couple_label', c.label
      )
      from public.members m
      join public.couples c on c.id = m.couple_id
      where m.id = me
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'display_name', m.display_name, 'couple_id', m.couple_id
      ) order by m.display_name)
      from public.members m where m.active
    ), '[]'::jsonb),
    'streaks', jsonb_build_object(
      'individual', public.racha_individual(me, today),
      'couple', public.racha_pareja(me, today),
      'group', public.racha_grupo(today),
      'six', public.racha_seis(today),
      'ten', public.racha_diez(today),
      'total', (select count(*) from public.attendance)
    ),
    'history', history,
    'risk', risk,
    'calendar', cal,
    'past', past,
    'intentions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'body', i.body,
        'display_name', m.display_name,
        'mine', i.member_id = me,
        'created_at', i.created_at,
        'comments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', c.id,
            'body', c.body,
            'display_name', cm.display_name,
            'mine', c.member_id = me,
            'created_at', c.created_at
          ) order by c.created_at asc)
          from public.intention_comments c
          join public.members cm on cm.id = c.member_id
          where c.intention_id = i.id
        ), '[]'::jsonb),
        'reactions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'emoji', r.emoji,
            'mine', r.member_id = me
          ) order by r.created_at)
          from public.intention_reactions r
          where r.intention_id = i.id
        ), '[]'::jsonb)
      ) order by i.created_at desc, i.id desc)
      from public.intentions i
      join public.members m on m.id = i.member_id
    ), '[]'::jsonb),
    'prefs', coalesce((
      select jsonb_build_object('empty_day', p.empty_day, 'couple', p.couple, 'locale', p.locale)
      from public.notification_prefs p where p.member_id = me
    ), jsonb_build_object('empty_day', false, 'couple', false, 'locale', null)),
    'pending', public.celebraciones_pendientes(me, today),
    'monday', public.resumen_semana(today)
  );
end;
$$;

revoke all on function public.estado_en(date, text) from public, anon, authenticated;

create or replace function public.estado()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.estado_en(public.madrid_today(), 'Europe/Madrid')
$$;

create or replace function public.estado(p_tz text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  base date := public.madrid_today();
  d date;
begin
  begin
    d := (public.app_now() at time zone p_tz)::date;
  exception when others then
    d := null;
  end;
  if d is null or d not between base - 1 and base then
    return public.estado_en(base, 'Europe/Madrid');
  end if;
  return public.estado_en(d, p_tz);
end;
$$;

revoke all on function public.estado() from public, anon;
revoke all on function public.estado(text) from public, anon;
grant execute on function public.estado() to authenticated;
grant execute on function public.estado(text) to authenticated;

-- «Voy a ir» también para hoy en Lisboa cuando en Madrid ya es mañana: el primer día
-- que se acepta es el de Lisboa (el mismo que Madrid salvo de 0:00 a 1:00 de Madrid).
drop policy if exists commitments_insert on public.commitments;
create policy commitments_insert on public.commitments
  for insert to authenticated
  with check (
    public.es_miembro()
    and member_id = (select auth.uid())
    and mass_date between (public.app_now() at time zone 'Europe/Lisbon')::date and public.madrid_today() + 366
  );

drop policy if exists commitments_delete on public.commitments;
create policy commitments_delete on public.commitments
  for delete to authenticated
  using (
    public.es_miembro()
    and member_id = (select auth.uid())
    and mass_date >= (public.app_now() at time zone 'Europe/Lisbon')::date
  );


-- Las tres funciones, del mismo dueño que es_miembro() y con permiso para saltarse
-- RLS (si no, estado contaría solo lo de quien pregunta). Si el dueño sale distinto,
-- alter function ... owner to <el dueño de es_miembro>.
select p.oid::regprocedure as funcion, r.rolname as dueno, r.rolbypassrls or r.rolsuper as salta_rls, p.prosecdef as definer
from pg_proc p
join pg_roles r on r.oid = p.proowner
where p.proname in ('estado', 'estado_en', 'es_miembro')
order by 1;

-- Quién puede llamarlas: authenticated solo estado() y estado(text); estado_en, nadie.
select p.oid::regprocedure as funcion,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute') as anon
from pg_proc p
where p.proname in ('estado', 'estado_en')
order by 1;

commit;

notify pgrst, 'reload schema';
