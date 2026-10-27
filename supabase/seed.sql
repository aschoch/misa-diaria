-- Semilla de prueba. Solo Persona 1 … Persona 12 y correos @example.com.
-- Los nombres reales no se guardan en este fichero.

do $seed$
declare
  n int;
  uid uuid;
  mail text;
  full_auth boolean;
begin
  full_auth := exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'aud'
  );
  for n in 1..12 loop
    uid := ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid;
    mail := 'persona' || n || '@example.com';
    if full_auth then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change,
        email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000',
        uid, 'authenticated', 'authenticated', mail,
        -- Sin contraseña que se pueda saber: se entra con el código del correo.
        extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        now(), now(), '', '', '', ''
      );
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, created_at, updated_at, last_sign_in_at
      ) values (
        gen_random_uuid(),
        uid,
        jsonb_build_object('sub', uid::text, 'email', mail),
        'email',
        uid::text,
        now(), now(), now()
      );
    else
      insert into auth.users (id, email) values (uid, mail);
    end if;
  end loop;
end
$seed$;

insert into public.couples (id, label)
select ('00000000-0000-4000-8001-' || lpad(to_hex(n), 12, '0'))::uuid, 'Matrimonio ' || n
from generate_series(1, 6) as n;

insert into public.members (id, couple_id, display_name)
select
  ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
  ('00000000-0000-4000-8001-' || lpad(to_hex(((n - 1) / 2) + 1), 12, '0'))::uuid,
  'Persona ' || n
from generate_series(1, 12) as n;

insert into public.attendance (member_id, mass_date)
select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
       public.madrid_today() - offs
from generate_series(1, 11) as n
cross join generate_series(1, 3) as offs;

insert into public.attendance (member_id, mass_date)
select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
       public.madrid_today()
from generate_series(1, 9) as n;

insert into public.intentions (member_id, body) values
  (('00000000-0000-4000-8000-' || lpad(to_hex(1), 12, '0'))::uuid, 'Por quienes no pueden salir de casa.'),
  (('00000000-0000-4000-8000-' || lpad(to_hex(4), 12, '0'))::uuid, 'Por la paz en casa.');

insert into public.commitments (member_id, mass_date)
select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
       public.madrid_today() + 1
from generate_series(1, 10) as n;
