-- Nadie del curso puede saber quién ha ido ni quién se ha apuntado.
-- Cada miembro lee solo sus filas de asistencia y compromisos. estado() pasa a
-- security definer para seguir contando a los doce, y las funciones internas
-- que reciben el id de un miembro dejan de estar abiertas a los miembros.
-- También pone topes a lo que un miembro puede escribir.
-- Ya aplicada en producción el 26-10-2026 (con supabase/snippets/produccion-2026-10-26.sql).
-- Este archivo solo la deja registrada; no volver a ejecutarla allí.

-- 1. Asistencia y compromisos: solo lo propio.
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance
  for select to authenticated
  using (public.es_miembro() and member_id = (select auth.uid()));

drop policy if exists commitments_read on public.commitments;
create policy commitments_read on public.commitments
  for select to authenticated
  using (public.es_miembro() and member_id = (select auth.uid()));

-- 2. El feedback lo lee quien lo escribe; Alfredo lo lee con la clave de servicio.
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback
  for select to authenticated
  using (public.es_miembro() and member_id = (select auth.uid()));

-- 3. estado() cuenta a todos aunque el miembro solo lea lo suyo.
--    Comprueba es_miembro() dentro y solo devuelve agregados y lo propio.
alter function public.estado() security definer;
alter function public.estado() set search_path = public;

-- 4. Funciones: los miembros solo ejecutan estado() y lo que usan las políticas.
--    persona_cubre, racha_individual, racha_pareja, celebraciones_pendientes,
--    marcas_dia y el resto solo los llama estado().
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.estado() to authenticated;
grant execute on function public.es_miembro() to authenticated;
grant execute on function public.madrid_today() to authenticated, service_role;
grant execute on function public.app_now() to authenticated, service_role;
grant execute on function public.aviso_tarde(timestamptz) to service_role;

-- Lo que se cree después en public no queda abierto por defecto.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

revoke all on public.feedback, public.usage_events from authenticated;
grant select, insert on public.feedback, public.usage_events to authenticated;

-- 5. Compromisos: como mucho un año por delante.
drop policy if exists commitments_insert on public.commitments;
create policy commitments_insert on public.commitments
  for insert to authenticated
  with check (
    public.es_miembro()
    and member_id = (select auth.uid())
    and mass_date between public.madrid_today() and public.madrid_today() + 366
  );

-- 6. Textos y tamaños. "not valid" respeta las filas que ya existen.
--    Los comentarios aceptan < y > como las intenciones ("<3"); la app escapa todo.
alter table public.intention_comments drop constraint if exists intention_comments_body_check;
alter table public.intention_comments
  add constraint intention_comments_body_check
  check (char_length(btrim(body)) between 1 and 200);

alter table public.intention_reactions drop constraint if exists intention_reactions_emoji_check;
alter table public.intention_reactions
  add constraint intention_reactions_emoji_check
  check (
    char_length(btrim(emoji)) between 1 and 16
    and emoji !~ '[<>]'
    and emoji ~ '[^\x01-\x7e]'
  ) not valid;

alter table public.celebrations
  add constraint celebrations_event_key_check
  check (char_length(event_key) between 1 and 120) not valid;

alter table public.usage_events
  add constraint usage_events_props_check
  check (pg_column_size(props) <= 2048) not valid;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_check
  check (
    char_length(endpoint) < 1024
    and endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
    and char_length(p256dh) < 256
    and char_length(auth_secret) < 128
  ) not valid;

-- 7. Cuotas por día de Madrid. Las intenciones dejan el tope de 30 para siempre,
--    que tarde o temprano bloqueaba a quien más escribe.
create or replace function public.limitar_por_dia()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tope integer := tg_argv[0]::integer;
  hechos integer;
begin
  execute format(
    'select count(*) from %I.%I where member_id = $1 and created_at >= ((public.madrid_today())::timestamp at time zone ''Europe/Madrid'')',
    tg_table_schema, tg_table_name
  ) into hechos using new.member_id;
  if hechos >= tope then
    raise exception 'Demasiadas filas hoy' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.limitar_por_dia() from public, anon, authenticated;

drop trigger if exists intentions_cap on public.intentions;
create trigger intentions_cap
before insert on public.intentions
for each row execute function public.limitar_por_dia('20');

drop function if exists public.limitar_intenciones();

drop trigger if exists comments_cap on public.intention_comments;
create trigger comments_cap
before insert on public.intention_comments
for each row execute function public.limitar_por_dia('100');

drop trigger if exists feedback_cap on public.feedback;
create trigger feedback_cap
before insert on public.feedback
for each row execute function public.limitar_por_dia('20');

drop trigger if exists usage_events_cap on public.usage_events;
create trigger usage_events_cap
before insert on public.usage_events
for each row execute function public.limitar_por_dia('1000');

-- Como mucho seis emojis distintos de cada miembro en cada intención.
create or replace function public.limitar_reacciones()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*) from public.intention_reactions
    where intention_id = new.intention_id and member_id = new.member_id
  ) >= 6 then
    raise exception 'Demasiadas reacciones' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.limitar_reacciones() from public, anon, authenticated;

drop trigger if exists reactions_cap on public.intention_reactions;
create trigger reactions_cap
before insert on public.intention_reactions
for each row execute function public.limitar_reacciones();

-- 8. El tope de 12 miembros no se salta con dos altas a la vez.
create or replace function public.limitar_miembros()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(4212);
  if (select count(*) from public.members where active) > 12 then
    raise exception 'Solo caben 12 miembros activos';
  end if;
  return null;
end;
$$;

revoke execute on function public.limitar_miembros() from public, anon, authenticated;

create index if not exists feedback_member_idx on public.feedback (member_id);
