-- Idioma de cada persona, y el hilo del muro: comentarios y reacciones.
-- La actividad nueva sube la intención. El comentario más viejo va primero.

alter table public.notification_prefs
  add column locale text check (locale in ('es', 'pt'));

alter table public.intentions
  add column activity_at timestamptz not null default now();

update public.intentions set activity_at = created_at;

update public.couples
set label = regexp_replace(label, '^Pareja ', 'Matrimonio ')
where label ~ '^Pareja ';

create table public.intention_comments (
  id uuid primary key default gen_random_uuid(),
  intention_id uuid not null references public.intentions (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 200 and body !~ '[<>]'),
  created_at timestamptz not null default now()
);

create table public.intention_reactions (
  intention_id uuid not null references public.intentions (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  emoji text not null check (emoji in ('🙏', '💛', '🕯️')),
  created_at timestamptz not null default now(),
  primary key (intention_id, member_id, emoji)
);

create or replace function public.tocar_intencion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.intentions
  set activity_at = now()
  where id = coalesce(new.intention_id, old.intention_id);
  return coalesce(new, old);
end;
$$;

create trigger comments_activity
after insert or delete on public.intention_comments
for each row execute function public.tocar_intencion();

create trigger reactions_activity
after insert or delete on public.intention_reactions
for each row execute function public.tocar_intencion();

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
  lang text;
begin
  select coalesce(p.locale, 'es') into lang
  from public.notification_prefs p
  where p.member_id = p_member;
  lang := coalesce(lang, 'es');

  ind := public.racha_individual(p_member, p_as_of);
  pare := public.racha_pareja(p_member, p_as_of);
  grp := public.racha_grupo(p_as_of);
  diez := public.racha_diez(p_as_of);

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
      'line', case when lang = 'pt' then 'Matrimónio · 30 dias seguidos' else 'Matrimonio · 30 días seguidos' end,
      'motif', 'hito', 'rank', 11, 'date', p_as_of
    ));
  end if;
  if grp >= 30 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:grupo:30',
      'line', case when lang = 'pt' then 'Grupo · 30 dias seguidos' else 'Grupo · 30 días seguidos' end,
      'motif', 'hito', 'rank', 12, 'date', p_as_of
    ));
  end if;
  if diez >= 30 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:diez:30',
      'line', case when lang = 'pt' then '10 missas · 30 dias seguidos' else '10 misas · 30 días seguidos' end,
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
      'line', case when lang = 'pt' then 'Matrimónio · 7 dias seguidos' else 'Matrimonio · 7 días seguidos' end,
      'motif', 'hito', 'rank', 21, 'date', p_as_of
    ));
  end if;
  if grp >= 7 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:grupo:7',
      'line', case when lang = 'pt' then 'Grupo · 7 dias seguidos' else 'Grupo · 7 días seguidos' end,
      'motif', 'hito', 'rank', 22, 'date', p_as_of
    ));
  end if;
  if diez >= 7 then
    items := items || jsonb_build_array(jsonb_build_object(
      'key', 'celeb:hito:diez:7',
      'line', case when lang = 'pt' then '10 missas · 7 dias seguidos' else '10 misas · 7 días seguidos' end,
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
        'line', case when lang = 'pt' then 'Todos os matrimónios foram hoje!' else '¡Todos los matrimonios han ido hoy!' end,
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

drop function if exists public.aviso_tarde(timestamptz);

create or replace function public.aviso_tarde(p_now timestamptz default public.app_now())
returns table (member_id uuid, body text, title text)
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
      select m.id,
        case when p.locale = 'pt'
          then 'Amanhã ninguém disse que vai à Missa.'
          else 'Mañana nadie ha dicho que va a Misa.'
        end,
        case when p.locale = 'pt' then 'Missa diária' else 'Misa diaria' end
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
    select m.id,
      case when p.locale = 'pt'
        then 'Amanhã o teu matrimónio não se apontou.'
        else 'Mañana tu matrimonio no se ha apuntado.'
      end,
      case when p.locale = 'pt' then 'Missa diária' else 'Misa diaria' end
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
      'gaps', coalesce((
        select jsonb_agg(cp.label order by cp.label)
        from public.couples cp
        where not exists (
          select 1 from public.members m
          where m.couple_id = cp.id and m.active and public.persona_cubre(m.id, d)
        )
      ), '[]'::jsonb),
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
        'mine', i.member_id = me,
        'comments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', c.id,
            'body', c.body,
            'display_name', cm.display_name,
            'mine', c.member_id = me
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

alter table public.intention_comments enable row level security;
alter table public.intention_reactions enable row level security;
alter table public.intention_comments force row level security;
alter table public.intention_reactions force row level security;

create policy comments_read on public.intention_comments
  for select to authenticated using (public.es_miembro());

create policy comments_insert on public.intention_comments
  for insert to authenticated
  with check (
    public.es_miembro()
    and member_id = auth.uid()
    and exists (select 1 from public.intentions i where i.id = intention_id)
  );

create policy comments_delete on public.intention_comments
  for delete to authenticated
  using (public.es_miembro() and member_id = auth.uid());

create policy reactions_read on public.intention_reactions
  for select to authenticated using (public.es_miembro());

create policy reactions_insert on public.intention_reactions
  for insert to authenticated
  with check (
    public.es_miembro()
    and member_id = auth.uid()
    and exists (select 1 from public.intentions i where i.id = intention_id)
  );

create policy reactions_delete on public.intention_reactions
  for delete to authenticated
  using (public.es_miembro() and member_id = auth.uid());

grant select, insert, delete on public.intention_comments, public.intention_reactions to authenticated;
grant select, insert, delete, update on public.intention_comments, public.intention_reactions to service_role;

revoke all on function public.tocar_intencion() from public;
revoke all on function public.aviso_tarde(timestamptz) from public;
grant execute on function public.aviso_tarde(timestamptz) to service_role;
