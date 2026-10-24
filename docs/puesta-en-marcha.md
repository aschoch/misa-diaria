# Puesta en marcha

Esta guía es para ti, Alfredo. No hace falta saber programar. El código ya está en GitHub. Aquí solo están los pasos que nadie más puede hacer, porque usan tu cuenta.

La página será `https://aschoch.github.io/misa-diaria/`. El código es público. Los nombres, los correos y quién ha ido a Misa no lo son.

Cuando un paso diga «no lo pegues en GitHub», es en serio. Si se cuela en el repositorio, está a la vista de cualquiera.

## 1. Crear el proyecto de Supabase

1. Entra en [supabase.com](https://supabase.com) con tu cuenta.
2. Pulsa **New project**. Organización: la tuya. Nombre: `misa-diaria`. Región: una de Europa, la que te quede cerca. Contraseña de la base: invéntala y guárdala en tu gestor de contraseñas. Plan gratuito.
3. Espera a que el proyecto pase a estar en verde.

Ese proyecto es la base de datos. Sin él, la página abre pero no guarda nada.

## 2. Qué copiar, y qué no

En el proyecto, abre **Project Settings → API**.

Copia estos dos y dáselos a quien vaya a publicar la página (o guárdalos como secretos de GitHub, paso 5):

| Dónde está | Cómo se llama al publicarla | ¿Puede verse? |
| --- | --- | --- |
| Project URL | `VITE_SUPABASE_URL` | Sí. Sale en la página. |
| anon / public key | `VITE_SUPABASE_ANON_KEY` | Sí. No abre los datos por sí sola. |

No copies, no pegues en un chat y no metas en GitHub:

- **service_role** (clave de servicio). Abre toda la base.
- La contraseña de la base.
- La clave privada VAPID (paso 6).

## 3. El acceso por correo

En **Authentication → Providers → Email**:

- Email: encendido.
- **Allow new users to sign up: apagado.** Si está encendido, cualquiera puede crearse una cuenta.

En **Authentication → URL Configuration**:

- Site URL: `https://aschoch.github.io/misa-diaria/`
- Redirect URLs, una línea exacta, sin asteriscos: `https://aschoch.github.io/misa-diaria/`

En **Authentication → SMTP**, pon un correo tuyo (el de Supabase de prueba se queda corto en cuanto entráis varios). Host, usuario y contraseña se quedan en ese panel. No van al repositorio.

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

La semilla del repositorio crea `persona1@example.com` … `persona12@example.com`. Para que el enlace llegue al correo de verdad, en **Authentication → Users** cambia cada correo de prueba por el correo real de esa persona, o bórralos y créalos tú con **Add user**, sin invitar a nadie de fuera. Tienen que seguir siendo doce, emparejados como en `members`. Si te lías, pide ayuda con la pantalla delante: el emparejamiento es Persona 1 con 2 (Pareja 1), 3 con 4 (Pareja 2), y así hasta 11 con 12.

Quien no esté en esa lista no entra. La página le dice lo mismo que a los demás: si el correo está en la lista, llegará un mensaje. No dice si el correo existe.

## 5. GitHub Pages

1. En el repositorio `aschoch/misa-diaria`, **Settings → Pages**.
2. Build and deployment: **GitHub Actions**, cuando el flujo de publicación esté en `main`.
3. **Settings → Secrets and variables → Actions**. Crea:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
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

Quien publique la función `send-evening-reminder` la deja en el proyecto. El reloj de cada tarde está en `supabase/snippets/evening-cron.sql`. Ábrelo, sustituye la URL del proyecto y el `CRON_SECRET`, y ejecútalo en el SQL Editor. No guardes esa versión rellena.

Los avisos nacen apagados. Cada persona los enciende en Ajustes.

## 7. Instalarla en el móvil

El aviso al móvil solo llega si la aplicación está instalada, no si solo está abierta una pestaña.

**iPhone** (hace falta iOS 16.4 o posterior):

1. Abre Safari (no Chrome) en `https://aschoch.github.io/misa-diaria/`.
2. Compartir → **Añadir a pantalla de inicio**.
3. Ábrela desde el icono, no desde el correo.
4. Escribe tu correo y pulsa **Enviar enlace**.
5. El correo trae un enlace y un código de seis cifras. El enlace suele abrirse en Safari y ahí no entra. Escribe el código dentro del icono.
6. En Ajustes, enciende el aviso que quieras. El iPhone pregunta entonces si puede enviar notificaciones. Si dices que no, la app sigue funcionando.

**Android:**

1. Abre Chrome en la misma dirección.
2. Menú → **Instalar aplicación** (o «Añadir a pantalla de inicio»).
3. Ábrela desde el icono, entra con el código y, si quieres avisos, enciéndelos en Ajustes.

## 8. Si el proyecto gratuito se duerme

Supabase puede pausar un proyecto gratuito que lleve una semana en silencio. Te llega un correo. Entra en el panel o abre la aplicación. Si ya se pausó: el proyecto → **Resume**. Los datos siguen. Los avisos de esos días no se reenvían solos.

## Lo que solo puedes hacer tú

1. Crear el proyecto de Supabase en tu cuenta y guardar la contraseña de la base.
2. Copiar la URL y la clave anónima a los secretos de GitHub. No copiar la clave de servicio.
3. Apagar el registro de gente nueva, poner la URL del sitio y el SMTP.
4. Sustituir los doce correos de prueba y los nombres, en el panel, sin subirlos a GitHub.
5. Generar las claves VAPID y guardar la privada solo en los secretos de Supabase, junto con `CRON_SECRET` y el `mailto:`.
6. Activar GitHub Pages.
7. Instalar la aplicación en tu iPhone desde Safari y en un Android desde Chrome, entrar con el código y probar un aviso.
8. Si llega el aviso de pausa, pulsar **Resume**.
