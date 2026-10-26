-- Ya está en producción (kryarzipdpvceocidgyw). Este archivo la deja escrita; no se vuelve a aplicar allí.

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  event_name text not null check (char_length(event_name) between 1 and 80),
  route text not null default '' check (char_length(route) <= 40),
  platform text not null default 'other' check (char_length(platform) <= 24),
  standalone boolean not null default false,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index usage_events_member_created_idx on public.usage_events (member_id, created_at desc);
create index usage_events_event_idx on public.usage_events (event_name);

alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;

create policy usage_events_insert on public.usage_events
  for insert to authenticated
  with check (public.es_miembro() and member_id = auth.uid());

create policy usage_events_select on public.usage_events
  for select to authenticated
  using (public.es_miembro() and member_id = auth.uid());

revoke all on table public.usage_events from public, anon;
grant select, insert on public.usage_events to authenticated;
grant all on public.usage_events to service_role;
