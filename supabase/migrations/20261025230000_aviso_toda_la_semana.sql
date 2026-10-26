-- El aviso de la tarde sale cualquier día, también sábado y domingo.
-- Ya aplicada en producción el 26-10-2026. Este archivo solo la deja registrada; no volver a ejecutarla allí.
-- No cambia dia_en_riesgo: el domingo del calendario sigue sin estar en riesgo.

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

  if hora <> 20 and hora <> 21 then
    return;
  end if;
  if exists (
    select 1
    from public.members m
    where m.active
      and (
        exists (
          select 1 from public.commitments c
          where c.member_id = m.id and c.mass_date = manana
        )
        or exists (
          select 1 from public.attendance a
          where a.member_id = m.id and a.mass_date = manana
        )
      )
  ) then
    return;
  end if;

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
end;
$$;

revoke all on function public.aviso_tarde(timestamptz) from public, anon, authenticated;
grant execute on function public.aviso_tarde(timestamptz) to service_role;
