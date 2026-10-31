-- PENDIENTE de aplicar en producción (kryarzipdpvceocidgyw).
-- Tabla notification_sends: cada envío del aviso (persona, enviado o fallido, código).
-- Pegar entero en SQL Editor. Es una transacción: si algo falla, no cambia nada.
-- Contiene 20261031095248_registro_envios_aviso.sql.
-- Después hay que volver a desplegar la función send-evening-reminder.
-- No borra eventos. Eso, si lo quieres, es supabase/snippets/borrar-eventos-debug-uso.sql.

begin;

create table public.notification_sends (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  mass_date date not null,
  slot text not null default 'evening' check (slot = 'evening'),
  outcome text not null check (outcome in ('sent', 'failed')),
  status_code integer not null check (status_code between 0 and 599),
  created_at timestamptz not null default now()
);

create index notification_sends_member_idx
  on public.notification_sends (member_id, created_at desc);

alter table public.notification_sends enable row level security;
alter table public.notification_sends force row level security;

revoke all on public.notification_sends from public, anon, authenticated;
grant select, insert on public.notification_sends to service_role;

commit;

-- Comprobación: una fila, sin políticas para los miembros, e insert solo para service_role.
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'notification_sends';

select policyname from pg_policies
where schemaname = 'public' and tablename = 'notification_sends';
