-- Antes de invitar al curso (27-10-2026). Pegar por partes en SQL Editor.
-- La semilla antigua daba a las doce cuentas la contraseña 'no-se-usa', que está en
-- el repositorio público. Quien sepa el correo de alguien podría entrar como él.

-- 1. Comprobar: qué cuentas siguen con esa contraseña (true = hay que arreglarla).
select u.email, m.display_name,
       -- Solo se compara con un hash bcrypt: crypt() falla con la contraseña vacía.
       coalesce(u.encrypted_password ~ '^\$2[abxy]\$' and u.encrypted_password = extensions.crypt('no-se-usa', u.encrypted_password), false) as clave_de_la_semilla
from auth.users u
left join public.members m on m.id = u.id
order by u.email;

-- 2. Arreglar: a esas cuentas se les pone una contraseña que nadie sabe. Siguen
--    entrando con el código del correo y, después, la app les deja crear la suya.
update auth.users
set encrypted_password = extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
    updated_at = now()
where encrypted_password ~ '^\$2[abxy]\$'
  and encrypted_password = extensions.crypt('no-se-usa', encrypted_password);

-- 3. Comprobar que no quedan datos de prueba de la semilla.
select 'intención de prueba' as que, i.body as detalle
from public.intentions i
where i.body in ('Por quienes no pueden salir de casa.', 'Por la paz en casa.')
union all
select 'nombre de prueba', m.display_name
from public.members m
where m.display_name ~ '^Persona [0-9]+$'
union all
select 'correo de prueba', u.email
from auth.users u
where u.email like '%@example.com';

-- 4. Comprobar el curso: doce filas, cada matrimonio con su pareja y su nombre.
select c.label, u.email, m.display_name, m.active
from public.members m
join auth.users u on u.id = m.id
join public.couples c on c.id = m.couple_id
order by c.label, u.email;
