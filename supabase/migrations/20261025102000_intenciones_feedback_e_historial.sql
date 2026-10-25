-- Intenciones, feedback, edición propia e historial de misas.
-- La racha de diez deja de celebrarse; el día de diez se queda.

create or replace function public.celebraciones_pendientes(p_member uuid, p_as_of date default public.madrid_today())
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  items jsonb := '[]'::jsonb;
  d date;
  ind integer;
  pare integer;
  grp integer;
  seis integer;
  parejas integer;
  personas integer;
  activas integer;
  lang text;
begin
  select coalesce(p.locale, 'es') into lang
  from public.notification_prefs p
  where p.member_id = p_member;
  lang := coalesce(lang, 'es');

  ind := public.racha_individual(p_member, p_as_of);
  pare := public.racha_pareja(p_member, p_as_of);
  grp := public.racha_grupo(p_as_of);
  seis := public.racha_seis(p_as_of);

  if ind >= 30 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:tuya:30',
      'line', case when lang = 'pt' then 'Tu · 30 dias seguidos' else 'Tú · 30 días seguidos' end,
      'motif', 'hito', 'rank', 10, 'date', p_as_of
    ));
  end if;
  if pare >= 30 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:pareja:30',
      'line', case when lang = 'pt' then 'O teu casal · 30 dias seguidos' else 'Tu matrimonio · 30 días seguidos' end,
      'motif', 'hito', 'rank', 11, 'date', p_as_of
    ));
  end if;
  if grp >= 30 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:grupo:30',
      'line', case when lang = 'pt' then 'O curso · 30 dias seguidos' else 'El curso · 30 días seguidos' end,
      'motif', 'hito', 'rank', 12, 'date', p_as_of
    ));
  end if;
  if seis >= 30 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:seis:30',
      'line', case when lang = 'pt' then 'Cada casal · 30 dias seguidos' else 'Cada matrimonio · 30 días seguidos' end,
      'motif', 'hito', 'rank', 13, 'date', p_as_of
    ));
  end if;
  if ind >= 7 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:tuya:7',
      'line', case when lang = 'pt' then 'Tu · 7 dias seguidos' else 'Tú · 7 días seguidos' end,
      'motif', 'hito', 'rank', 20, 'date', p_as_of
    ));
  end if;
  if pare >= 7 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:pareja:7',
      'line', case when lang = 'pt' then 'O teu casal · 7 dias seguidos' else 'Tu matrimonio · 7 días seguidos' end,
      'motif', 'hito', 'rank', 21, 'date', p_as_of
    ));
  end if;
  if grp >= 7 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:grupo:7',
      'line', case when lang = 'pt' then 'O curso · 7 dias seguidos' else 'El curso · 7 días seguidos' end,
      'motif', 'hito', 'rank', 22, 'date', p_as_of
    ));
  end if;
  if seis >= 7 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:seis:7',
      'line', case when lang = 'pt' then 'Cada casal · 7 dias seguidos' else 'Cada matrimonio · 7 días seguidos' end,
      'motif', 'hito', 'rank', 23, 'date', p_as_of
    ));
  end if;

  d := p_as_of - 6;
  while d <= p_as_of loop
    select count(*) into parejas
    from public.couples cp
    where exists (
      select 1
      from public.members m
      join public.attendance a on a.member_id = m.id and a.mass_date = d
      where m.couple_id = cp.id
        and m.active
    );

    select count(*) into activas from public.members m where m.active;
    select count(*) into personas
    from public.members m
    where m.active
      and exists (
        select 1 from public.attendance a
        where a.member_id = m.id and a.mass_date = d
      );

    if personas = 12 and activas = 12 then
      items := items || jsonb_build_array(jsonb_build_object(
        'key', 'celeb:todos:' || d,
        'line', case when lang = 'pt' then 'Hoje foram vocês os doze!' else '¡Hoy habéis ido los doce!' end,
        'motif', 'todos', 'rank', 30, 'date', d
      ));
    end if;

    if (
      select count(distinct a.member_id) from public.attendance a where a.mass_date = d
    ) >= 10 then
      items := items || jsonb_build_array(jsonb_build_object(
        'key', 'celeb:diez:' || d,
        'line', case when lang = 'pt' then '10 missas hoje' else '10 misas hoy' end,
        'motif', 'diez', 'rank', 40, 'date', d
      ));
    end if;

    if parejas = 6 then
      items := items || jsonb_build_array(jsonb_build_object(
        'key', 'celeb:parejas:' || d,
        'line', case when lang = 'pt' then 'Os 6 casais' else 'Los 6 matrimonios' end,
        'motif', 'parejas', 'rank', 50, 'date', d
      ));
    end if;

    d := d + 1;
  end loop;

  return coalesce((
    select jsonb_agg(x order by (x->>'rank')::int, (x->>'date') desc)
    from jsonb_array_elements(items) x
    where not exists (
      select 1
      from public.celebrations c
      where c.member_id = p_member
        and c.event_key = x->>'key'
    )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.estado()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  me uuid := auth.uid();
  today date := public.madrid_today();
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
    'clock', to_char(public.app_now() at time zone 'Europe/Madrid', 'HH24:MI'),
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
      ) order by i.activity_at desc, i.created_at desc)
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

revoke all on function public.celebraciones_pendientes(uuid, date) from public, anon, authenticated;
revoke all on function public.estado() from public, anon, authenticated;
grant execute on function public.celebraciones_pendientes(uuid, date) to authenticated, service_role;
grant execute on function public.estado() to authenticated, service_role;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
alter table public.feedback force row level security;
create policy feedback_insert on public.feedback for insert to authenticated with check (public.es_miembro() and member_id = auth.uid());
create policy feedback_select on public.feedback for select to authenticated using (public.es_miembro());
revoke all on table public.feedback from public, anon;
grant select, insert on public.feedback to authenticated;
grant all on public.feedback to service_role;

create policy intentions_update on public.intentions
  for update to authenticated
  using (public.es_miembro() and member_id = auth.uid())
  with check (public.es_miembro() and member_id = auth.uid());
create policy comments_update on public.intention_comments
  for update to authenticated
  using (public.es_miembro() and member_id = auth.uid())
  with check (public.es_miembro() and member_id = auth.uid());
grant update (body) on public.intentions, public.intention_comments to authenticated;
