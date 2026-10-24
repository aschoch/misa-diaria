-- Misa diaria. Doce personas. La clave de servicio no vive aquí.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create or replace function public.app_now()
returns timestamptz
language sql
stable
as $$
  select case
    when coalesce(current_setting('app.now', true), '') = '' then now()
    else current_setting('app.now', true)::timestamptz
  end
$$;

create or replace function public.madrid_today()
returns date
language sql
stable
as $$
  select (public.app_now() at time zone 'Europe/Madrid')::date
$$;

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  label text not null unique
);

create table public.members (
  id uuid primary key references auth.users (id) on delete cascade,
  couple_id uuid not null references public.couples (id),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.commitments (
  member_id uuid not null references public.members (id) on delete cascade,
  mass_date date not null,
  created_at timestamptz not null default now(),
  primary key (member_id, mass_date)
);

create table public.attendance (
  member_id uuid not null references public.members (id) on delete cascade,
  mass_date date not null,
  created_at timestamptz not null default now(),
  primary key (member_id, mass_date)
);

create table public.intentions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now()
);

create table public.notification_prefs (
  member_id uuid primary key references public.members (id) on delete cascade,
  empty_day boolean not null default false,
  couple boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.notification_log (
  member_id uuid not null references public.members (id) on delete cascade,
  mass_date date not null,
  slot text not null check (slot = 'evening'),
  sent_at timestamptz not null default now(),
  primary key (member_id, mass_date, slot)
);

create table public.celebrations (
  member_id uuid not null references public.members (id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now(),
  primary key (member_id, event_key)
);

create index attendance_date_idx on public.attendance (mass_date);
create index commitments_date_idx on public.commitments (mass_date);

create or replace function public.es_miembro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.id = auth.uid()
      and m.active
  );
$$;

create or replace function public.limitar_miembros()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.members where active) > 12 then
    raise exception 'Solo caben 12 miembros activos';
  end if;
  return null;
end;
$$;

create trigger members_cap
after insert or update of active on public.members
for each statement
execute function public.limitar_miembros();

create or replace function public.limitar_intenciones()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.intentions where member_id = new.member_id) >= 30 then
    raise exception 'Demasiadas intenciones';
  end if;
  return new;
end;
$$;

create trigger intentions_cap
before insert on public.intentions
for each row
execute function public.limitar_intenciones();

-- Una racha cuenta hoy si ya se cumple. Si hoy aún no, sigue la de ayer
-- hasta medianoche. El domingo rompe igual que cualquier día cerrado.
create or replace function public.racha_de(p_dates date[], p_as_of date)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  d date;
  n integer := 0;
begin
  if p_as_of is null then
    return 0;
  end if;
  d := p_as_of;
  if not (d = any (coalesce(p_dates, '{}'::date[]))) then
    d := d - 1;
  end if;
  while d = any (coalesce(p_dates, '{}'::date[])) loop
    n := n + 1;
    d := d - 1;
    exit when n > 5000;
  end loop;
  return n;
end;
$$;

create or replace function public.racha_individual(p_member uuid, p_as_of date default public.madrid_today())
returns integer
language sql
stable
set search_path = public
as $$
  select public.racha_de(
    array(select a.mass_date from public.attendance a where a.member_id = p_member),
    p_as_of
  );
$$;

create or replace function public.racha_pareja(p_member uuid, p_as_of date default public.madrid_today())
returns integer
language sql
stable
set search_path = public
as $$
  select public.racha_de(
    array(
      select distinct a.mass_date
      from public.attendance a
      join public.members m on m.id = a.member_id
      where m.couple_id = (select couple_id from public.members where id = p_member)
    ),
    p_as_of
  );
$$;

create or replace function public.racha_grupo(p_as_of date default public.madrid_today())
returns integer
language sql
stable
set search_path = public
as $$
  select public.racha_de(
    array(select distinct a.mass_date from public.attendance a),
    p_as_of
  );
$$;

create or replace function public.racha_diez(p_as_of date default public.madrid_today())
returns integer
language sql
stable
set search_path = public
as $$
  select public.racha_de(
    array(
      select a.mass_date
      from public.attendance a
      group by a.mass_date
      having count(distinct a.member_id) >= 10
    ),
    p_as_of
  );
$$;

create or replace function public.persona_cubre(p_member uuid, p_date date)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.commitments c
    where c.member_id = p_member and c.mass_date = p_date
  ) or exists (
    select 1 from public.attendance a
    where a.member_id = p_member and a.mass_date = p_date
  );
$$;

create or replace function public.dia_en_riesgo(p_date date)
returns boolean
language sql
stable
set search_path = public
as $$
  select extract(dow from p_date) <> 0
    and (
      not exists (
        select 1
        from public.members m
        where m.active
          and public.persona_cubre(m.id, p_date)
      )
      or exists (
        select 1
        from public.couples cp
        where not exists (
          select 1
          from public.members m
          where m.couple_id = cp.id
            and m.active
            and public.persona_cubre(m.id, p_date)
        )
      )
    );
$$;

create or replace function public.resumen_semana(p_as_of date default public.madrid_today())
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  inicio date;
  fin date;
begin
  if extract(dow from p_as_of) <> 1 then
    return null;
  end if;
  fin := p_as_of - 1;
  inicio := p_as_of - 7;
  return jsonb_build_object(
    'people', (
      select count(*)
      from public.members m
      where m.active
        and (
          select count(distinct a.mass_date)
          from public.attendance a
          where a.member_id = m.id
            and a.mass_date between inicio and fin
        ) = 7
    ),
    'couples', (
      select count(*)
      from public.couples cp
      where (
        select count(distinct a.mass_date)
        from public.attendance a
        join public.members m on m.id = a.member_id
        where m.couple_id = cp.id
          and a.mass_date between inicio and fin
      ) = 7
    ),
    'empty_days', (
      select count(*)
      from generate_series(inicio, fin - 1, interval '1 day') as dia
      where not exists (
        select 1 from public.attendance a where a.mass_date = dia::date
      )
    )
  );
end;
$$;

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
  diez integer;
  parejas integer;
  personas integer;
  activas integer;
begin
  ind := public.racha_individual(p_member, p_as_of);
  pare := public.racha_pareja(p_member, p_as_of);
  grp := public.racha_grupo(p_as_of);
  diez := public.racha_diez(p_as_of);

  if ind >= 30 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:tuya:30', 'line', 'Tú · 30 días seguidos', 'motif', 'hito', 'rank', 10, 'date', p_as_of
    ));
  end if;
  if pare >= 30 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:pareja:30', 'line', 'Pareja · 30 días seguidos', 'motif', 'hito', 'rank', 11, 'date', p_as_of
    ));
  end if;
  if grp >= 30 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:grupo:30', 'line', 'Grupo · 30 días seguidos', 'motif', 'hito', 'rank', 12, 'date', p_as_of
    ));
  end if;
  if diez >= 30 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:diez:30', 'line', '10 misas · 30 días seguidos', 'motif', 'hito', 'rank', 13, 'date', p_as_of
    ));
  end if;
  if ind >= 7 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:tuya:7', 'line', 'Tú · 7 días seguidos', 'motif', 'hito', 'rank', 20, 'date', p_as_of
    ));
  end if;
  if pare >= 7 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:pareja:7', 'line', 'Pareja · 7 días seguidos', 'motif', 'hito', 'rank', 21, 'date', p_as_of
    ));
  end if;
  if grp >= 7 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:grupo:7', 'line', 'Grupo · 7 días seguidos', 'motif', 'hito', 'rank', 22, 'date', p_as_of
    ));
  end if;
  if diez >= 7 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:diez:7', 'line', '10 misas · 7 días seguidos', 'motif', 'hito', 'rank', 23, 'date', p_as_of
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
        'key', 'celeb:todos:' || d, 'line', '¡Hoy habéis ido los doce!', 'motif', 'todos', 'rank', 30, 'date', d
      ));
    end if;

    if (
      select count(distinct a.member_id) from public.attendance a where a.mass_date = d
    ) >= 10 then
      items := items || jsonb_build_array(jsonb_build_object(
        'key', 'celeb:diez:' || d, 'line', '10 misas hoy', 'motif', 'diez', 'rank', 40, 'date', d
      ));
    end if;

    if parejas = 6 then
      items := items || jsonb_build_array(jsonb_build_object(
        'key', 'celeb:parejas:' || d, 'line', '¡Todas las parejas han ido hoy!', 'motif', 'parejas', 'rank', 50, 'date', d
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

create or replace function public.aviso_tarde(p_now timestamptz default public.app_now())
returns table (member_id uuid, body text)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  hoy date;
  manana date;
  hora integer;
begin
  hoy := (p_now at time zone 'Europe/Madrid')::date;
  manana := hoy + 1;
  hora := extract(hour from (p_now at time zone 'Europe/Madrid'))::int;

  if extract(dow from hoy) = 0 or extract(dow from manana) = 0 then
    return;
  end if;
  if hora <> 20 and hora <> 21 then
    return;
  end if;
  if not public.dia_en_riesgo(manana) then
    return;
  end if;

  if not exists (
    select 1 from public.members m
    where m.active and public.persona_cubre(m.id, manana)
  ) then
    return query
      select m.id, 'Mañana nadie ha dicho que va a Misa.'::text
      from public.members m
      join public.notification_prefs p on p.member_id = m.id
      where m.active
        and p.empty_day
        and not exists (
          select 1 from public.notification_log l
          where l.member_id = m.id and l.mass_date = manana and l.slot = 'evening'
        );
    return;
  end if;

  return query
    select m.id, 'Mañana tu pareja no se ha apuntado.'::text
    from public.members m
    join public.notification_prefs p on p.member_id = m.id
    where m.active
      and p.couple
      and not exists (
        select 1
        from public.members otro
        where otro.couple_id = m.couple_id
          and otro.active
          and public.persona_cubre(otro.id, manana)
      )
      and not exists (
        select 1 from public.notification_log l
        where l.member_id = m.id and l.mass_date = manana and l.slot = 'evening'
      );
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
  d date;
  i integer;
  covered integer;
  risk text;
begin
  if not public.es_miembro() then
    raise exception 'No eres del grupo' using errcode = '42501';
  end if;

  for i in 0..13 loop
    d := today + i;
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
    past := past || jsonb_build_array(jsonb_build_object(
      'date', d,
      'sunday', extract(dow from d) = 0,
      'mine_attendance', exists (
        select 1 from public.attendance a where a.member_id = me and a.mass_date = d
      )
    ));
  end loop;

  select count(*) into covered
  from public.members m
  where m.active and public.persona_cubre(m.id, today);

  risk := case
    when not public.dia_en_riesgo(today) then null
    when covered = 0 then 'empty'
    else 'couple'
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
      'ten', public.racha_diez(today),
      'total', (select count(*) from public.attendance)
    ),
    'risk', risk,
    'calendar', cal,
    'past', past,
    'intentions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'body', i.body,
        'display_name', m.display_name,
        'mine', i.member_id = me
      ) order by i.created_at desc)
      from public.intentions i
      join public.members m on m.id = i.member_id
    ), '[]'::jsonb),
    'prefs', coalesce((
      select jsonb_build_object('empty_day', p.empty_day, 'couple', p.couple)
      from public.notification_prefs p where p.member_id = me
    ), jsonb_build_object('empty_day', false, 'couple', false)),
    'pending', public.celebraciones_pendientes(me, today),
    'monday', public.resumen_semana(today)
  );
end;
$$;

alter table public.couples enable row level security;
alter table public.members enable row level security;
alter table public.commitments enable row level security;
alter table public.attendance enable row level security;
alter table public.intentions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_log enable row level security;
alter table public.celebrations enable row level security;

alter table public.couples force row level security;
alter table public.members force row level security;
alter table public.commitments force row level security;
alter table public.attendance force row level security;
alter table public.intentions force row level security;
alter table public.push_subscriptions force row level security;
alter table public.notification_prefs force row level security;
alter table public.notification_log force row level security;
alter table public.celebrations force row level security;

create policy couples_read on public.couples
  for select to authenticated using (public.es_miembro());

create policy members_read on public.members
  for select to authenticated using (public.es_miembro());

create policy attendance_read on public.attendance
  for select to authenticated using (public.es_miembro());

create policy attendance_insert on public.attendance
  for insert to authenticated
  with check (
    public.es_miembro()
    and member_id = auth.uid()
    and mass_date between public.madrid_today() - 6 and public.madrid_today()
  );

create policy attendance_delete on public.attendance
  for delete to authenticated
  using (
    public.es_miembro()
    and member_id = auth.uid()
    and mass_date between public.madrid_today() - 6 and public.madrid_today()
  );

create policy commitments_read on public.commitments
  for select to authenticated using (public.es_miembro());

create policy commitments_insert on public.commitments
  for insert to authenticated
  with check (
    public.es_miembro()
    and member_id = auth.uid()
    and mass_date between public.madrid_today() and public.madrid_today() + 13
  );

create policy commitments_delete on public.commitments
  for delete to authenticated
  using (
    public.es_miembro()
    and member_id = auth.uid()
    and mass_date between public.madrid_today() and public.madrid_today() + 13
  );

create policy intentions_read on public.intentions
  for select to authenticated using (public.es_miembro());

create policy intentions_insert on public.intentions
  for insert to authenticated
  with check (public.es_miembro() and member_id = auth.uid());

create policy intentions_delete on public.intentions
  for delete to authenticated
  using (public.es_miembro() and member_id = auth.uid());

create policy push_all on public.push_subscriptions
  for all to authenticated
  using (public.es_miembro() and member_id = auth.uid())
  with check (public.es_miembro() and member_id = auth.uid());

create policy prefs_all on public.notification_prefs
  for all to authenticated
  using (public.es_miembro() and member_id = auth.uid())
  with check (public.es_miembro() and member_id = auth.uid());

create policy celebrations_read on public.celebrations
  for select to authenticated
  using (public.es_miembro() and member_id = auth.uid());

create policy celebrations_insert on public.celebrations
  for insert to authenticated
  with check (public.es_miembro() and member_id = auth.uid());

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant select on public.couples, public.members, public.attendance, public.commitments, public.intentions to authenticated;
grant insert, delete on public.attendance, public.commitments, public.intentions to authenticated;
grant select, insert, update, delete on public.push_subscriptions, public.notification_prefs to authenticated;
grant select, insert on public.celebrations to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

revoke all on public.notification_log from anon, authenticated;

revoke all on function public.app_now() from public;
revoke all on function public.madrid_today() from public;
revoke all on function public.es_miembro() from public;
revoke all on function public.racha_de(date[], date) from public;
revoke all on function public.racha_individual(uuid, date) from public;
revoke all on function public.racha_pareja(uuid, date) from public;
revoke all on function public.racha_grupo(date) from public;
revoke all on function public.racha_diez(date) from public;
revoke all on function public.persona_cubre(uuid, date) from public;
revoke all on function public.dia_en_riesgo(date) from public;
revoke all on function public.resumen_semana(date) from public;
revoke all on function public.celebraciones_pendientes(uuid, date) from public;
revoke all on function public.aviso_tarde(timestamptz) from public;
revoke all on function public.estado() from public;

grant execute on function public.app_now() to authenticated, service_role;
grant execute on function public.madrid_today() to authenticated, service_role;
grant execute on function public.es_miembro() to authenticated, service_role;
grant execute on function public.racha_de(date[], date) to authenticated, service_role;
grant execute on function public.racha_individual(uuid, date) to authenticated, service_role;
grant execute on function public.racha_pareja(uuid, date) to authenticated, service_role;
grant execute on function public.racha_grupo(date) to authenticated, service_role;
grant execute on function public.racha_diez(date) to authenticated, service_role;
grant execute on function public.dia_en_riesgo(date) to authenticated, service_role;
grant execute on function public.resumen_semana(date) to authenticated, service_role;
grant execute on function public.celebraciones_pendientes(uuid, date) to authenticated, service_role;
grant execute on function public.estado() to authenticated;
grant execute on function public.aviso_tarde(timestamptz) to service_role;
grant execute on function public.persona_cubre(uuid, date) to authenticated, service_role;
