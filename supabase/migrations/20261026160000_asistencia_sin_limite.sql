-- «He ido a Misa» se puede poner o quitar en cualquier día pasado, no solo en
-- los últimos 7. El futuro sigue cerrado. El suelo de 2020 solo evita fechas
-- absurdas por error. Las celebraciones siguen mirando los últimos 7 días, así
-- que corregir un día viejo no lanza fiestas antiguas.
-- Todavía no está aplicada en producción. Lo aplicará quien lleva la base.

drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance
  for insert to authenticated
  with check (
    public.es_miembro()
    and member_id = (select auth.uid())
    and mass_date between date '2020-01-01' and public.madrid_today()
  );

drop policy if exists attendance_delete on public.attendance;
create policy attendance_delete on public.attendance
  for delete to authenticated
  using (
    public.es_miembro()
    and member_id = (select auth.uid())
    and mass_date between date '2020-01-01' and public.madrid_today()
  );
