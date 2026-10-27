# Puesta en marcha

Esta guía es para ti, Alfredo. No hace falta saber programar. El código ya está en GitHub. Aquí solo están los pasos que nadie más puede hacer, porque usan tu cuenta.

La página será `https://aschoch.github.io/misa-diaria/`. El código es público. Los nombres, los correos y quién ha ido a Misa no lo son.

Cuando un paso diga «no lo pegues en GitHub», es en serio. Si se cuela en el repositorio, está a la vista de cualquiera.

## 1. El proyecto ya existe

El proyecto de Supabase ya está creado:

`https://kryarzipdpvceocidgyw.supabase.co`

La URL y la clave publicable ya están en `.env.production` y en `src/api.ts`. El build de GitHub Pages las lee de ahí. No hace falta copiarlas a mano. No son una clave anónima antigua: la biblioteca usa la clave publicable `sb_publishable_…`.

Lo que sí tienes que hacer tú es aplicar las migraciones, en el orden de sus nombres, y desplegar la función del aviso. Los nombres y los correos reales se cargan aparte, en el panel. No van a Git.

## 2. Qué no copiar

No copies, no pegues en un chat y no metas en GitHub:

- **service_role** (clave de servicio). Abre toda la base. Supabase se la inyecta a la función.
- La contraseña de la base.
- La clave privada VAPID (paso 6).
- `CRON_SECRET`.

La clave publicable y la URL sí pueden verse: no abren los datos por sí solas.

## 3. El acceso por correo

En **Authentication → Providers → Email**:

- Email: encendido.
- **Allow new users to sign up: apagado.** Si está encendido, cualquiera puede crearse una cuenta.

En **Authentication → URL Configuration**:

- Site URL: `https://aschoch.github.io/misa-diaria/`
- Redirect URLs, una línea exacta, sin asteriscos: `https://aschoch.github.io/misa-diaria/`

En **Authentication → SMTP**, pon un correo tuyo (el de Supabase de prueba se queda corto en cuanto entráis varios). Host, usuario y contraseña se quedan en ese panel. No van al repositorio.

La plantilla del correo no elige idioma sola. Pégala tú en **Authentication → Email Templates → Magic Link**, corta, en español primero y en portugués de Portugal después. El cliente manda el idioma en `options.data.locale` (`es` o `pt`); si más adelante la plantilla puede ramificar, usa `{{ .Data.locale }}`.

Solo el código, sin enlace. El enlace solo sirve en el mismo navegador donde se pidió el código. En el iPhone se abre en Safari, no en el icono, y ahí no entra. Además, abrirlo (o que lo abra el filtro del correo del trabajo) gasta el código y luego la app dice «Ese código no vale». La plantilla que trae Supabase por defecto solo lleva enlace: cámbiala.

```text
Misa diaria

Tu código para entrar: {{ .Token }}
Escríbelo en la app. Si pides otro, vale solo el último.

Missa diária

O teu código para entrar: {{ .Token }}
Escreve-o na app. Se pedires outro, só vale o último.
```

En **Authentication → Providers → Email**, la longitud del código (Email OTP Length) tiene que ser 6: la casilla de la app no admite más. En **Authentication → Rate Limits**, sube los correos por hora si vais a entrar los doce la misma tarde.

## 4. Las doce personas

En el proyecto, abre **SQL Editor**. Pega una consulta como esta y cambia los correos y los nombres. No guardes ese texto en GitHub.

Los huecos son los tuyos. Aquí no hay personas reales.

```sql
-- Cámbialo en el editor. No lo subas.
update public.members m
set display_name = v.nombre
from (values
  ('persona1@example.com', 'Nombre 1'),
  ('persona2@example.com', 'Nombre 2')
  -- … hasta las doce
) as v(correo, nombre)
join auth.users u on u.email = v.correo
where m.id = u.id;
```

La semilla del repositorio crea `persona1@example.com` … `persona12@example.com`. Para que el enlace llegue al correo de verdad, en **Authentication → Users** cambia cada correo de prueba por el correo real de esa persona, o bórralos y créalos tú con **Add user**, sin invitar a nadie de fuera. Tienen que seguir siendo doce, en los mismos matrimonios que `members`. Si te lías, pide ayuda con la pantalla delante: van juntos Persona 1 con 2 (Matrimonio 1), 3 con 4 (Matrimonio 2), y así hasta 11 con 12.

Quien no esté en esa lista no entra. La página le dice lo mismo que a los demás: si el correo está en la lista, llegará un mensaje. No dice si el correo existe.

### Antes de invitar

Si en producción se cargó alguna vez la semilla antigua, sus doce cuentas tenían la contraseña `no-se-usa`, que está en este repositorio público. Pega en **SQL Editor**, por partes, `supabase/snippets/produccion-2026-10-27-antes-de-invitar.sql`: dice qué cuentas la tienen todavía, se la cambia por una que nadie sabe, busca datos de prueba que hayan quedado y enseña los doce con su matrimonio para que lo revises.

### Invitar al curso

No hace falta mandar invitaciones de Supabase ni enlaces mágicos. Con los doce correos ya en **Authentication → Users** (sin contraseña) y en `members`:

1. Manda a cada matrimonio, por el canal de siempre, el enlace `https://aschoch.github.io/misa-diaria/` y el correo exacto con el que lo apuntaste. Con otro correo no llega nada y la app no dice por qué.
2. En el iPhone, primero la instala (Safari → Compartir → **Añadir a pantalla de inicio**) y entra desde el icono. Safari y el icono no comparten la sesión: si entra en Safari, en el icono tiene que volver a entrar.
3. Escribe su correo y pulsa *¿Primera vez u olvidaste la contraseña?* → **Enviar código**. Le llega un código de 6 dígitos (mira en spam). Si al volver del correo la app ha vuelto al principio, *¿Primera vez…?* → **Enviar código** otra vez: si no ha pasado un minuto, no manda otro y le deja escribir el que tiene.
4. Justo después la app le ofrece crear una contraseña. Si la crea, la próxima vez entra con correo y contraseña y el Llavero del iPhone la recuerda. Si pulsa *Ahora no*, sigue entrando con código siempre (y si quiere poner contraseña más tarde, entra otra vez con código y se la ofrece).
5. En Ajustes, que active el aviso de la tarde.

Así nadie recibe una contraseña por mensaje y quien la olvide usa el mismo botón.

## 5. GitHub Pages

1. En el repositorio `aschoch/misa-diaria`, **Settings → Pages**.
2. Build and deployment: **GitHub Actions**, cuando el flujo de publicación esté en `main`.
3. **Settings → Secrets and variables → Actions**. La URL y la clave publicable ya van en el código. Si quieres sustituirlas al publicar, crea:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_VAPID_PUBLIC_KEY` (la pública del paso 6; puede esperar si aún no hay avisos)
4. La dirección pública será `https://aschoch.github.io/misa-diaria/`. Que sea pública no abre la base.

## 6. Avisos al móvil (VAPID)

En tu ordenador, en una carpeta que no sea el repositorio:

```bash
npx web-push generate-vapid-keys
```

Salen dos claves.

- La **pública** puede ir al secreto `VITE_VAPID_PUBLIC_KEY` de GitHub.
- La **privada** va solo a Supabase: **Edge Functions → Secrets** (o Project Settings → Edge Functions).
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT` con un `mailto:` tuyo, por ejemplo `mailto:tu-correo@ejemplo.com`
  - `CRON_SECRET`: una frase larga que inventes. También va al SQL del reloj, no a GitHub.

Tú despliegas la función `send-evening-reminder`. El reloj está en `supabase/snippets/evening-cron.sql`: se llama `misa-aviso-tarde` y corre cada hora, en el minuto 5 (`5 * * * *`). La función solo envía entre las 20:00 y las 21:59, hora de Madrid, y nunca en domingo. Ábrelo, pon la URL `https://kryarzipdpvceocidgyw.supabase.co` y el `CRON_SECRET` que hayas inventado, y ejecútalo en el SQL Editor. No guardes esa versión rellena. El secreto viaja en la cabecera `x-cron-secret`. La función también necesita `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase; no los copies.

Los avisos nacen apagados. Cada persona los enciende en Ajustes.

## 7. Instalarla en el móvil

El aviso al móvil solo llega si la aplicación está instalada, no si solo está abierta una pestaña.

**iPhone** (hace falta iOS 16.4 o posterior):

1. Abre Safari (no Chrome) en `https://aschoch.github.io/misa-diaria/`.
2. Compartir → **Añadir a pantalla de inicio**.
3. Ábrela desde el icono, no desde el correo.
4. Escribe tu correo y pulsa **¿Primera vez u olvidaste la contraseña?** → **Enviar código**.
5. El correo trae un código de seis cifras. Escríbelo dentro del icono.
6. En Ajustes, enciende el aviso que quieras. El iPhone pregunta entonces si puede enviar notificaciones. Si dices que no, la app sigue funcionando.

**Android:**

1. Abre Chrome en la misma dirección.
2. Menú → **Instalar aplicación** (o «Añadir a pantalla de inicio»).
3. Ábrela desde el icono, entra con el código y, si quieres avisos, enciéndelos en Ajustes.

## 8. Si el proyecto gratuito se duerme

Supabase puede pausar un proyecto gratuito que lleve una semana en silencio. Te llega un correo. Entra en el panel o abre la aplicación. Si ya se pausó: el proyecto → **Resume**. Los datos siguen. Los avisos de esos días no se reenvían solos.

## Lo que solo puedes hacer tú

1. Guardar la contraseña de la base del proyecto que ya existe.
2. Aplicar las migraciones y desplegar la función. No copiar la clave de servicio.
3. Apagar el registro de gente nueva, poner la URL del sitio, el SMTP y la plantilla bilingüe del enlace.
4. Cargar los doce correos reales y los nombres, en el panel, sin subirlos a GitHub.
5. Generar las claves VAPID y guardar la privada solo en los secretos de Supabase, junto con `CRON_SECRET` y el `mailto:`.
6. Activar GitHub Pages.
7. Instalar la aplicación en tu iPhone desde Safari y en un Android desde Chrome, entrar con el código y probar un aviso.
8. Si llega el aviso de pausa, pulsar **Resume**.
