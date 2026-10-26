-- APLICADO en producción (kryarzipdpvceocidgyw) el 26-10-2026. No volver a ejecutar.
-- Asistencia editable en cualquier día pasado.
-- Pegar entero en SQL Editor. Es una transacción: si algo falla, no cambia nada.
-- Contiene 20261026160000_asistencia_sin_limite.sql.

begin;

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

commit;

-- Comprobación: las dos políticas deben decir "between '2020-01-01'::date and madrid_today()".
select policyname, coalesce(with_check, qual) as regla from pg_policies
where tablename = 'attendance' and policyname in ('attendance_insert', 'attendance_delete');
