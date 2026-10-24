-- Índices de las seis claves foráneas que no cubría ya una clave primaria,
-- y auth.uid() una sola vez en las políticas (initplan).
-- No crea tablas ni funciones, así que no hay un GRANT nuevo.

create index if not exists intention_comments_intention_id_idx
  on public.intention_comments (intention_id);

create index if not exists intention_comments_member_id_idx
  on public.intention_comments (member_id);

create index if not exists intention_reactions_member_id_idx
  on public.intention_reactions (member_id);

create index if not exists intentions_member_id_idx
  on public.intentions (member_id);

create index if not exists members_couple_id_idx
  on public.members (couple_id);

create index if not exists push_subscriptions_member_id_idx
  on public.push_subscriptions (member_id);

drop policy attendance_insert on public.attendance;
create policy attendance_insert on public.attendance
  for insert to authenticated
  with check (
    public.es_miembro()
    and member_id = (select auth.uid())
    and mass_date between public.madrid_today() - 6 and public.madrid_today()
  );

drop policy attendance_delete on public.attendance;
create policy attendance_delete on public.attendance
  for delete to authenticated
  using (
    public.es_miembro()
    and member_id = (select auth.uid())
    and mass_date between public.madrid_today() - 6 and public.madrid_today()
  );

drop policy commitments_insert on public.commitments;
create policy commitments_insert on public.commitments
  for insert to authenticated
  with check (
    public.es_miembro()
    and member_id = (select auth.uid())
    and mass_date between public.madrid_today() and public.madrid_today() + 13
  );

drop policy commitments_delete on public.commitments;
create policy commitments_delete on public.commitments
  for delete to authenticated
  using (
    public.es_miembro()
    and member_id = (select auth.uid())
    and mass_date between public.madrid_today() and public.madrid_today() + 13
  );

drop policy intentions_insert on public.intentions;
create policy intentions_insert on public.intentions
  for insert to authenticated
  with check (public.es_miembro() and member_id = (select auth.uid()));

drop policy intentions_delete on public.intentions;
create policy intentions_delete on public.intentions
  for delete to authenticated
  using (public.es_miembro() and member_id = (select auth.uid()));

drop policy push_all on public.push_subscriptions;
create policy push_all on public.push_subscriptions
  for all to authenticated
  using (public.es_miembro() and member_id = (select auth.uid()))
  with check (public.es_miembro() and member_id = (select auth.uid()));

drop policy prefs_all on public.notification_prefs;
create policy prefs_all on public.notification_prefs
  for all to authenticated
  using (public.es_miembro() and member_id = (select auth.uid()))
  with check (public.es_miembro() and member_id = (select auth.uid()));

drop policy celebrations_read on public.celebrations;
create policy celebrations_read on public.celebrations
  for select to authenticated
  using (public.es_miembro() and member_id = (select auth.uid()));

drop policy celebrations_insert on public.celebrations;
create policy celebrations_insert on public.celebrations
  for insert to authenticated
  with check (public.es_miembro() and member_id = (select auth.uid()));

drop policy comments_insert on public.intention_comments;
create policy comments_insert on public.intention_comments
  for insert to authenticated
  with check (
    public.es_miembro()
    and member_id = (select auth.uid())
    and exists (select 1 from public.intentions i where i.id = intention_id)
  );

drop policy comments_delete on public.intention_comments;
create policy comments_delete on public.intention_comments
  for delete to authenticated
  using (public.es_miembro() and member_id = (select auth.uid()));

drop policy reactions_insert on public.intention_reactions;
create policy reactions_insert on public.intention_reactions
  for insert to authenticated
  with check (
    public.es_miembro()
    and member_id = (select auth.uid())
    and exists (select 1 from public.intentions i where i.id = intention_id)
  );

drop policy reactions_delete on public.intention_reactions;
create policy reactions_delete on public.intention_reactions
  for delete to authenticated
  using (public.es_miembro() and member_id = (select auth.uid()));
