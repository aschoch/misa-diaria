# Uso

Doce personas. No hay analítica de terceros. El cliente escribe en `public.usage_events` y cada miembro solo lee lo suyo (`member_id = auth.uid()`). Alfredo lee el conjunto con la clave de servicio, en el SQL Editor. No se guarda correo, código, contraseña ni el texto de una intención, un comentario o un error.

La columna `dev` en `props` vale `true` en `localhost` / `127.0.0.1` y cuando el teléfono tiene `localStorage.setItem('misa-dev', '1')`. Las consultas de abajo lo dejan fuera. En el teléfono de Alfredo, en la app publicada, esa línea se ejecuta una vez en la consola.

El tope sigue en 1000 eventos por miembro y día de Madrid. No hace falta subirlo: un error se anota como mucho 12 veces por carga y no se repite el mismo en 30 segundos, y el resto son gestos, no trazas.

## Embudo de entrada

`usage_events` no acepta anónimos: hace falta sesión y ser del curso. Pedir el código y equivocarse pasan antes de eso. Esos pasos se guardan en el teléfono (`misa-login-pendiente`) y se vacían al entrar. Si nadie entra, no salen del aparato. `props.at` es el momento del paso; `created_at` es el momento en que se vació la cola (al entrar). No se deja al cliente poner `created_at`, para no saltarse el tope del día.

## Eventos

En todos puede ir `dev: true`. La columna `route` es `hoy`, `calendario`, `muro`, `ajustes` o `entrar`. `platform` es `ios`, `android` u `other`. `standalone` dice si está instalada.

| Evento | Cuándo | `props` |
| --- | --- | --- |
| `app_open` | La primera carga con sesión, por apertura de la página | — |
| `tab_view` | Cambio de pestaña | `to` (`hoy`, `calendario`, `muro`, `ajustes`), `via` (`tap` o `drag`) |
| `attendance_toggle` | «He ido» puesto o quitado | `on`, `mass_date` (`YYYY-MM-DD`), `surface` |
| `commitment_toggle` | «Voy a ir» puesto o quitado | `on`, `mass_date`, `surface` |
| `intention_open` | Se abre una intención | `id` (uuid) |
| `intention_publish` | Se publica una intención | — |
| `comment_publish` | Se publica un comentario | `intention_id` |
| `reaction_toggle` | Se pone o se quita un emoji | `emoji`, `on` |
| `settings_action` | Ajustes | `action`: `language` (+ `locale` `es`/`pt`), `name`, `password`, `feedback`, `alert` (+ `key`, `on`) |
| `login_code_requested` | Se pidió el código (se vacía al entrar) | `ok`, `kind` si falló (`network`, `rate_limit`, `invalid`, `other`), `at` |
| `login_code_submitted` | Se envió un código de 6 cifras | `at` |
| `login_verify_ok` | El código valió | `at` |
| `login_verify_error` | El código no valió | `kind` (`network`, `rate_limit`, `invalid`, `other`), `at`. Supabase no separa caducado de incorrecto: los dos son `invalid` |
| `push_open` | Se abrió desde el aviso | — |
| `install_viewed` | Se abrió «Ver cómo instalar como app» / «Ver como instalar como aplicação» | — |
| `notify_permission` | Permiso de avisos | `result`: `requested`, `granted`, `denied`, `dismissed` |
| `app_installed` | `appinstalled`, o la primera apertura en pantalla de inicio | `via`: `appinstalled` o `standalone` |
| `session_end` | La página pasa a segundo plano o se cierra | `seconds` (tiempo en primer plano, tope 12 h). Sale con `fetch` y `keepalive` |
| `client_error` | Un guardado falló, la red falló, o un error no capturado | `kind` (`save`, `network`, `uncaught`), `where` (ficha corta: `attendance`, `commitment`, `refresh`, `window`…) |

`swipe_debug` y `tap_debug` ya no se escriben. El histórico se puede borrar con `supabase/snippets/borrar-eventos-debug-uso.sql`.

Hasta el 31 de octubre de 2026, `attendance_toggle` y `commitment_toggle` solo llevaban `source` (`hoy_main`, `hoy_week`, `calendar_past`, `calendar_detail`, `button`, `swipe`), sin `on` ni `mass_date`. Las filas nuevas usan `surface`.

### `surface`

| Valor | Dónde |
| --- | --- |
| `hoy` | Botón grande de Hoy / Hoje |
| `estos_dias` | Franja «Estos días» / «Estes dias» |
| `calendario_fila` | Botón de la fila del calendario («He ido» / «Fui» o «Voy a ir» / «Vou») |
| `swipe` | Deslizar la fila |
| `dia` | Panel del día en el calendario ancho |
| `proximo_vacio` | «Me apunto» del próximo día vacío |
| `riesgo` | Botón de la línea «Nadie se ha apuntado.» / «Ninguém se apontou.» |

No hay un popup de mes. El panel del día en escritorio es `dia`.

## Aviso de la tarde

`notification_log` sigue siendo el candado: una fila por persona y fecha, y se borra si el envío falla del todo para que la hora siguiente pueda repetir. Cada intento deja otra fila en `notification_sends` (`outcome` `sent` o `failed`, `status_code`). `0` quiere decir que no quedaba ningún dispositivo. Los miembros no leen esa tabla. Hay que pegar `supabase/snippets/produccion-2026-10-31-envios-aviso.sql` y volver a desplegar `send-evening-reminder`. Si la tabla aún no está, el aviso se envía igual.

El aviso lleva `from: 'push'`. El service worker abre `calendario?from=push` o, si la app ya estaba abierta, avisa a la página sin recargarla. La página anota `push_open` y quita la marca de la URL.

## Consultas

Día a día, sin el desarrollador:

```sql
select (created_at at time zone 'Europe/Madrid')::date as dia,
       count(distinct member_id) as personas
from public.usage_events
where event_name = 'app_open'
  and coalesce(props->>'dev', '') <> 'true'
group by 1
order by 1;
```

«He ido» puesto o quitado, por superficie:

```sql
select props->>'surface' as surface,
       props->>'on' as puesto,
       count(*) as veces
from public.usage_events
where event_name = 'attendance_toggle'
  and coalesce(props->>'dev', '') <> 'true'
group by 1, 2
order by 3 desc;
```

Embudo del código. `created_at` es cuando entraron y se vació la cola; `props.at` es cuando ocurrió el paso:

```sql
select event_name,
       count(*) as veces,
       count(*) filter (where props->>'kind' = 'invalid') as codigo_invalido,
       count(*) filter (where props->>'kind' = 'network') as red
from public.usage_events
where event_name in (
  'login_code_requested',
  'login_code_submitted',
  'login_verify_ok',
  'login_verify_error'
)
  and coalesce(props->>'dev', '') <> 'true'
group by 1
order by 1;
```
