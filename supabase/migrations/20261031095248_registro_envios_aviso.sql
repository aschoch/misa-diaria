-- Resultado de cada envío del aviso de la tarde.
-- notification_log sigue siendo el candado (una fila por persona y fecha): si el
-- envío falla del todo, la función la borra para que la hora siguiente pueda
-- repetir. Esta tabla no se borra: deja si salió o falló y el código HTTP.
-- El tope de usage_events (1000 al día) no cambia: los eventos nuevos son pocos
-- y el cliente ya limita los errores.
-- No aplicada en producción. El texto para pegar está en
-- supabase/snippets/produccion-2026-10-31-envios-aviso.sql.

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
