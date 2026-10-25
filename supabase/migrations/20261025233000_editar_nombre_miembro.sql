-- El miembro puede cambiar su propio nombre.
-- Ya aplicada en producción. Este archivo solo la deja registrada; no volver a ejecutarla allí.

grant update (display_name) on table public.members to authenticated;

create policy members_update_self on public.members
  for update
  to authenticated
  using (
    public.es_miembro()
    and id = (select auth.uid())
  )
  with check (
    public.es_miembro()
    and id = (select auth.uid())
    and char_length(btrim(display_name)) between 1 and 40
  );
