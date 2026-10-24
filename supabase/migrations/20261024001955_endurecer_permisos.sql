-- Endurece permisos tras get_advisors. No cambia lo que la app puede hacer.
-- Supabase da por defecto ALL en tablas y EXECUTE en funciones de public a anon
-- y authenticated. Aquí se deja solo lo que declaran las migraciones anteriores.

-- 1. search_path fijo (lint 0011).
alter function public.app_now() set search_path = '';
alter function public.madrid_today() set search_path = '';

-- 2. Tablas: anon no toca nada; authenticated solo lo declarado (sin TRUNCATE,
--    que se salta RLS, ni UPDATE donde no hace falta).
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on public.couples, public.members, public.attendance, public.commitments, public.intentions to authenticated;
grant insert, delete on public.attendance, public.commitments, public.intentions to authenticated;
grant select, insert, update, delete on public.push_subscriptions, public.notification_prefs to authenticated;
grant select, insert on public.celebrations to authenticated;
grant select, insert, delete on public.intention_comments, public.intention_reactions to authenticated;

-- 3. Funciones: anon no ejecuta ninguna (lints 0028). authenticated no ejecuta
--    las de disparador ni aviso_tarde (solo service_role).
revoke execute on all functions in schema public from anon;
revoke execute on function public.aviso_tarde(timestamptz) from authenticated;
revoke execute on function public.tocar_intencion() from authenticated;
revoke execute on function public.limitar_miembros() from authenticated;
revoke execute on function public.limitar_intenciones() from authenticated;
grant execute on function public.aviso_tarde(timestamptz) to service_role;
