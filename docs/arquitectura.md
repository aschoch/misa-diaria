# Arquitectura

## Para Alfredo

La aplicación es una página web. El código puede ser público. Los datos, no. Quien no sea de las doce personas no puede leer ni escribir nada, aunque copie la clave que va dentro de la página.

Se entra con un enlace que llega al correo. No hay contraseñas ni página para darse de alta. Los doce correos los pondrás tú cuando toque, fuera de GitHub. Hasta entonces solo existen Persona 1 … Persona 12 y Pareja 1 … Pareja 6.

No hace falta crear el proyecto de Supabase ni activar GitHub Pages ahora. La guía de clics se escribirá al construir, en `docs/puesta-en-marcha.md`. Al final de esta nota está lo que solo puedes hacer tú.

Los avisos al móvil nacen apagados. Hay dos, y cada persona enciende los que quiera: uno si mañana no hay nadie, otro si mañana su pareja no está cubierta. Como mucho sale uno, la tarde de antes, y nunca en domingo ni a propósito del domingo. Hoy lo dice siempre, sin nombres y sin intenciones en la pantalla de bloqueo.

Las rachas van en hora de Madrid. En Hoy van las cuatro, en una lista: la tuya, la de tu pareja, la del grupo y la de días con al menos diez personas. El contador del grupo es una línea pequeña debajo. El domingo cuenta. Si ese día la racha falla, se rompe. Lo que no hacemos el domingo es avisar.

Las celebraciones las dibuja Diseño: un tiro de papel de 1,2 segundos y una línea corta que dice el motivo. Se guardan, así que recargar la página no las repite. El día en que se apunta la décima misa se celebra una vez; si ese día habéis ido los doce, es el mismo papel y la misma línea, no otro. Si el móvil pide poco movimiento, se queda la cresta quieta con esa línea.

El grupo vive en un fichero de datos de prueba. No hay pantalla de administración. Para doce personas sería otra cosa que cuidar y que no ibas a usar.

## Decisiones

### Dónde vive

Una sola aplicación estática, Vite y TypeScript, publicada en GitHub Pages. La base es `/misa-diaria/` hasta que exista un dominio. Pages no reescribe rutas: `404.html` es una copia de `index.html`, para que recargar no deje la pantalla en blanco.

La base de datos, el acceso y el aviso salen de Supabase (Postgres, Auth y una Edge Function), en el plan gratuito, cuando el proyecto exista. Ahora se trabaja con la CLI y Docker en local. No se crea proyecto en la nube en este paso.

En el repositorio entran las migraciones, las reglas de acceso (RLS), la función del aviso y la semilla de prueba. No entran volcados, correos reales, la clave de servicio (service role) ni la clave privada VAPID. La clave anónima (anon key) sí puede ir en el repositorio y en el JavaScript: no abre ningún dato. La URL del proyecto, cuando exista, también puede ir. Hoy no existen, y no se inventan.

El plan gratuito puede pausar el proyecto tras una semana con poca actividad. Los datos siguen ahí y se recuperan desde el panel, durante un año. El aviso diario mantiene actividad mientras el proyecto está despierto. Si se pausa, el reloj interno se para con él: no hay un segundo servicio externo para despertarlo. Son doce personas y otra cuenta sería otra cosa que mantener.

### Quién entra

Altas cerradas (`enable_signup` en falso, y el cliente pide el enlace con `shouldCreateUser: false`). Auth solo tiene las doce cuentas de la semilla. Un correo que no esté ahí no crea usuario.

El correo lleva el enlace y, en el mismo mensaje, un código de seis cifras que Supabase ya genera. El enlace usa PKCE y hay que abrirlo en el mismo navegador que lo pidió. En un iPhone, el correo suele abrirse en Safari y la aplicación instalada no ve esa sesión. El código se escribe dentro de la aplicación instalada y la sesión queda ahí. Misma caducidad (una hora) y mismo límite (un envío por minuto). La pantalla siempre responde lo mismo: si el correo está en la lista, llegará el mensaje. No decimos si el correo existe.

La lista de redirecciones es exacta: el origen de Pages y el de local. Sin comodines en producción.

RLS está activo en todas las tablas, también forzado. Hay una función `es_miembro()`: el `auth.uid()` corresponde a un miembro activo. El rol anónimo no tiene políticas. Un usuario autenticado que no esté en `members` tampoco. Los dos fallan al leer y al escribir. Borrar a alguien es desactivarlo en `members` y quitarle la cuenta: un token que aún no haya caducado sigue sin poder leer.

Cada miembro ve al grupo (nombres visibles, parejas, compromisos, asistencias e intenciones). No ve correos, ni suscripciones push de otros, ni el registro de envíos. Solo escribe lo suyo: su «voy a ir», su «he ido», sus intenciones, su dispositivo y sus dos interruptores. Nadie cambia nombres ni parejas desde la aplicación. Un tope en la base rechaza un decimotercer miembro activo.

Las intenciones se guardan y se pintan como texto, con un máximo de 280 caracteres y de 30 por persona. No hay HTML. El aviso nunca incluye ese texto: la pantalla de bloqueo la ve cualquiera que tenga el teléfono.

### Datos

| Tabla | Qué guarda | Quién escribe |
| --- | --- | --- |
| `couples` | Pareja 1 … Pareja 6 | Solo la semilla |
| `members` | Id de Auth, pareja, nombre visible, activo | Solo la semilla |
| `commitments` | «Voy a ir», una fila por persona y fecha | La propia persona, hoy y 13 días más |
| `attendance` | «He ido a Misa», una fila por persona y fecha | La propia persona, hoy y los 6 días anteriores |
| `intentions` | Texto corto y autor | El autor crea y borra lo suyo |
| `push_subscriptions` | Endpoint y claves del dispositivo | Solo las suyas |
| `notification_prefs` | Dos síes o noes, los dos en no: día vacío y pareja propia | Solo las suyas |
| `notification_log` | Persona, fecha y franja ya enviada | Solo la función del aviso |
| `celebrations` | Persona y clave del evento | La propia persona, solo insertar |

Una persona y un día son una asistencia. «Cualquier Misa» quiere decir que no pedimos hora ni parroquia. Un segundo toque no suma otra misa. Así «diez» significa diez personas, y el contador del grupo es el número de filas.

Fechas de tipo `date`, siempre el día civil de Europe/Madrid. La función de lectura se llama `estado(p_as_of date)` y devuelve un solo JSON: el día de Madrid, las cuatro rachas, el contador, los 14 días, la ventana de asistencia, las intenciones, los dos interruptores, las celebraciones pendientes y, en lunes, el resumen de la semana. El cliente no reimplementa las reglas. El reloj del servidor autoriza; el del teléfono solo pinta. Un reloj mal puesto no alarga los 7 días ni marca el futuro.

Al cerrar sesión se borra la suscripción push de ese aparato. Si no, un iPad compartido seguiría recibiendo avisos.

### Semilla, no pantalla de administración

La semilla SQL es la opción. Doce personas estables no justifican una pantalla con permiso para cambiar el grupo. Esa pantalla sería la pieza más sensible y la que menos se usa. Cambiar un nombre es editar el fichero en local, o, en producción, una frase SQL que ejecutas tú en el panel y que no se sube a GitHub.

`supabase/seed.sql` lleva solo los nombres de prueba y correos `persona1@example.com` … `persona12@example.com`, emparejados en Pareja 1 … Pareja 6. Una prueba falla si aparece otro dominio. Los correos reales no tienen migración ni sitio en el repositorio.

### Rachas, medianoche y el pasado

El día empieza a las 00:00 y termina a las 00:00 siguientes en Europe/Madrid, con el horario de verano que trae la base de tiempos. No usamos la zona del teléfono ni un corte fijo en UTC. En el cambio de hora sigue habiendo un solo día civil. Todas las funciones escriben la zona en la consulta, `(now() at time zone 'Europe/Madrid')::date`, y aceptan una fecha de prueba para no depender del calendario real.

Hoy todavía no rompe nada. Si hoy ya cumples, la racha lo incluye. Si aún no, la racha sigue siendo la de ayer hasta medianoche. Se rompe un día ya cerrado en el que la meta falla. El domingo entra en esa regla: cuenta si la meta se cumple y rompe si falla. Lo que el domingo no tiene es estado de riesgo ni aviso.

| Racha | Sigue el día en que… | Se rompe si, en un día ya cerrado… |
| --- | --- | --- |
| Tuya | tú tienes asistencia | tú no fuiste |
| De tu pareja | al menos uno de los dos tiene asistencia | no fue ninguno de los dos |
| Del grupo | al menos una persona tiene asistencia | no fue nadie |
| De diez | hay asistencia de al menos diez personas distintas | hay menos de diez |

El contador del grupo es la suma de asistencias, no una racha. En Hoy las cuatro rachas van en una sola lista, en ese orden: la tuya, la de tu pareja, la del grupo y la de diez. El contador es una línea pequeña debajo. No hay pantalla de estadísticas.

La ventana de corrección es hoy y los seis días anteriores, medida en el servidor. Dentro, poner o quitar tu asistencia recompone las rachas al momento. El día 8 y el futuro los rechaza la base. «Voy a ir» solo para hoy y los trece días siguientes, y se puede quitar. Una pareja con un miembro inactivo deja de tener racha de pareja; el histórico de asistencias se queda.

### Celebraciones

El confeti es de Diseño. Ingeniería guarda el evento y le dice cuándo puede salir.

La tabla `celebrations` tiene clave única `(member_id, event_key)`. El cliente inserta y, si la fila es nueva, hay celebración. Si la fila ya estaba, no pasa nada. Se inserta antes de animar: un cierre a medias no la vuelve a disparar. Varias claves nuevas en la misma apertura cuentan como un solo confeti, y todas quedan guardadas. No hay cola de tres festejos, ni realtime para lanzarlo a la vez en doce teléfonos. Quien no tiene la aplicación abierta lo ve la próxima vez que entre, una vez.

Disparadores, todos con el día de Madrid en la clave:

- **Parejas cubiertas.** Las seis parejas tienen al menos una asistencia ese día. Clave `celeb:parejas:<fecha>`, una por persona. La línea es «¡Todas las parejas han ido hoy!».
- **Todos han ido.** Las doce personas activas tienen asistencia ese día. Clave `celeb:todos:<fecha>`, una por persona. La línea es «¡Hoy habéis ido los doce!». Sale de «He ido»: un plan que luego se quita no deja un festejo pegado.
- **Hitos.** La racha tuya, la de pareja, la del grupo o la de diez llega a 7 o a 30. Clave `celeb:hito:<tipo>:<umbral>`, con tipo `tuya`, `pareja`, `grupo` o `diez`, sin fecha: el 7 y el 30 salen una vez por persona y por racha. La línea es «7 días seguidos» o «30 días seguidos», y «Tú», «Pareja», «Grupo» o «10 misas» si hace falta el nombre.
- **Día con al menos diez.** El día de Madrid en que las asistencias distintas llegan a diez, también si la racha de diez no va por el 7 ni por el 30. Clave `celeb:diez:<fecha>`, una por persona. La línea es «10 misas hoy». Si ese mismo día también se cumple «todos han ido», se guardan las dos claves y hay un solo pase: la línea es la de los doce, salvo que haya un hito, que manda. Si no se llega a doce, el día de la décima misa se celebra igual, una vez.

Si en la misma apertura hay varias claves nuevas, sigue siendo un confeti. El motivo que se enseña es el hito; si no hay hito, «todos»; si no, el día de diez; si no, las parejas. Diseño distingue el motivo dentro de la misma pieza.

Corregir un día de la ventana puede cruzar un hito nuevo, o hacer que ese día llegue a diez: se celebra una vez. Quitar una asistencia no borra la celebración. Volver a cumplirla tampoco la repite. Una migración posterior que añada celebraciones tiene que marcar como ya vistos los hitos y los días de diez ya cumplidos, para no festejar historia antigua.

Contrato con Diseño: se puede saltar desde el primer instante, dura alrededor de un segundo, no bloquea el botón de hoy y no lleva sonido. Con `prefers-reduced-motion: reduce` la fila se guarda igual, el papel se queda en la cresta y la línea sigue visible. No es una segunda animación ni una frase en lugar del papel.

### En riesgo y el aviso de la tarde

Una pareja está sin cubrir si ninguno de los dos tiene «Voy a ir» ni «He ido» ese día. Un día que no es domingo está en riesgo si nadie tiene ninguno de los dos, o si alguna pareja está sin cubrir. La asistencia cuenta como cobertura: si no, un día ya cumplido seguiría en riesgo por no haber pulsado el otro botón.

El domingo nunca está en riesgo. Tampoco se envía nada en domingo, ni siquiera para avisar del lunes. El sábado por la tarde no se avisa del domingo. El aviso del lunes es la línea de dentro de la aplicación, que el domingo ya se puede leer.

Dentro de la aplicación hay una línea en Hoy y en el día del calendario, de lunes a sábado, sin ventana modal. Si el día está vacío: «Nadie se ha apuntado.» Si el hueco es de alguna pareja, Hoy dice «Falta una pareja.», sin nombres. El calendario enseña el recuento y, si falta alguna, cuál: «Falta Pareja 6.» El domingo no se marca, y un día con las seis parejas cubiertas tampoco. No hace falta tener el aviso del móvil encendido para verla.

Al móvil, una sola Edge Function, `send-evening-reminder`, llamada por `pg_cron` y `pg_net` cada hora en el minuto 5. La función mira la hora de Madrid y solo envía entre las 20:00 y las 21:59, para que el cambio de hora no desplace el aviso y un fallo de una hora no lo borre. La URL es pública: rechaza la clave anónima y los tokens de usuario, y solo acepta un secreto propio del reloj (`CRON_SECRET`), distinto de la clave de servicio. Esa clave de servicio la inyecta Supabase en la función y no se copia al repositorio ni al SQL del reloj.

Como mucho un envío por persona y fecha, anotado en `notification_log` antes de enviar. Si el envío falla, no hay reintentos en ráfaga: a las doce personas les basta el siguiente paso de la hora, y a la noche siguiente ya es otro día. Un 404 o un 410 del servicio push borra esa suscripción.

A quién, solo si mañana es de lunes a sábado y está en riesgo, y solo el interruptor que toca. Los dos nacen apagados. Como mucho sale uno por persona:

- Si mañana no hay nadie apuntado ni nadie ha ido, un aviso a quien tenga encendido el del día vacío: «Mañana nadie ha dicho que va a Misa.» Ese aviso ya incluye a todas las parejas. No se manda otro a la pareja, aunque su otro interruptor esté encendido.
- Si el hueco es de alguna pareja y el día no está vacío, un aviso solo a quien esté en una de esas parejas y tenga encendido el de la pareja: «Mañana tu pareja no se ha apuntado.» Uno, aunque falten varias. Las demás lo ven al abrir la aplicación.

El texto no lleva nombres, rachas ni intenciones. Caduca a las cuatro horas, para que no aparezca a la mañana siguiente como si fuera nuevo. iPhone: PWA instalada en la pantalla de inicio, iOS 16.4 o posterior. Android: PWA instalada. El permiso del sistema se pide al encender un interruptor en Ajustes, nunca al abrir la aplicación. Sin permiso, la preferencia se guarda y no se envía nada. La aplicación se usa igual con los avisos apagados.

VAPID: la clave pública puede ir en el build; la privada y el `mailto:` del subject, solo en los secretos de la función. Los registros de la función anotan el id de la persona y la franja. No anotan correos, endpoints ni intenciones.

### Resumen de la semana, y no el aviso de la mañana

Quedó acordado. El lunes, una línea en Hoy, debajo del contador y encima de los seis días, con tres cifras de la semana de lunes a domingo que acaba de terminar: personas con los siete días (de 12), parejas que cubrieron los siete días (de 6), y días de lunes a sábado que quedaron en cero (de 6). El domingo entra en las dos primeras y no entra en la tercera. No hay correo, ni función programada, ni pantalla nueva. La cuenta vive en `resumen_semana(fecha)`. No medimos aperturas ni tiempo dentro. Si la línea pide una pantalla, un correo o un cron, se quita.

El aviso de la mañana no entra. En eso coincido con el breve. Repetiría, a las ocho, el mismo hueco que la tarde anterior ya puede haber dicho. La tarde de antes es el momento en que todavía se puede apuntar. Quien abre por la mañana ve la línea de Hoy.

### Peso, offline y sesión

Un año de asistencia son unos pocos miles de filas. No hay caché de pagos, ni realtime, ni analítica, ni fuentes de terceros, ni fotos. La fuente es la del sistema. Una sola llamada, `estado`, al abrir y al volver a la pestaña.

La PWA guarda el cascarón (HTML, CSS, JS) para que el icono abra sin red. Los datos enseñan la última respuesta con la hora de esa respuesta, y los botones quedan desactivados. No hay cola de cambios sin conexión: un «he ido» a medias duplicaría rachas y celebraciones. Al volver la red, se carga de nuevo.

GitHub Pages no puede guardar la sesión en una cookie que el JavaScript no pueda leer. La sesión de Supabase va en `localStorage` de ese origen, con PKCE, refresco automático y intercambio del código al volver del enlace. Después se limpia la URL. No hay contraseñas que robar. El riesgo que queda es un script inyectado, así que no hay JavaScript de terceros, las intenciones no se interpretan como HTML, y una política de contenido en el HTML limita de dónde puede cargarse la página. Cerrar sesión borra la sesión local y la suscripción de ese aparato.

Modo oscuro y poco movimiento salen del sistema. Ajustes tiene dos interruptores, el del día vacío y el de tu pareja, los dos apagados. No hay otro para el tema.

### Pruebas

Playwright en WebKit y en Chromium, a 390×844 y a 1280×800. La suite falla si hay un error de consola.

- **Acceso.** Con la semilla local (el correo de prueba lo recoge Inbucket) un miembro entra con el código y ve el grupo. Un correo de fuera ve el mismo mensaje y ninguna fila.
- **RLS, la prueba que manda.** Con la clave anónima, y con un usuario de Auth que no está en `members`, leer y escribir asistencia, intenciones y suscripciones falla. El miembro no lee suscripciones de otros ni el registro de envíos, y no escribe la asistencia de otra persona. Esto corre contra Postgres local, además de lo que se vea en el navegador.
- **Rachas.** Domingo que falla y rompe. Domingo con asistencia y sigue. Hoy sin marca y la racha de ayer sigue en pie. Cruce de medianoche en Madrid, incluido el cambio de hora. Corregir dentro de los 7 días recompone. El día 8 y el futuro se rechazan. Pareja con uno solo. Grupo con una persona. Diez personas distintas, y un segundo toque de la misma persona que no suma. El contador coincide con las filas.
- **Celebraciones.** La primera inserción es la única que anima. Recargar no repite. Un día con diez personas y no doce guarda `celeb:diez:<fecha>` y muestra «10 misas hoy» una vez. Un día con doce guarda también `celeb:todos:<fecha>` y una sola línea. Poco movimiento guarda la fila y deja la cresta quieta con la misma línea. Saltarla no la reprograma. Quitar la asistencia no la borra.
- **Aviso.** La función pura de «mañana en riesgo», con reloj fijo: domingo no envía, sábado no envía, pareja ajena no recibe el hueco de otra, cada interruptor apagado no recibe el suyo, el día vacío no manda además el de pareja, y un segundo paso de la hora no duplica. Sin enviar a un servicio push real en la suite. El push de verdad se comprueba al instalar, en un iPhone y en un Android.
- **Apariencia.** `prefers-color-scheme: dark` y `prefers-reduced-motion: reduce` en los dos motores y los dos tamaños. El botón de hoy se puede pulsar mientras la celebración está fuera.

La semilla de prueba solo usa `@example.com`.

### Lo que solo Alfredo puede hacer después

La guía larga irá en `docs/puesta-en-marcha.md`. Aquí solo la lista. Nada de esto se hace ahora.

1. Crear el proyecto gratuito de Supabase en tu cuenta. Nadie más tiene ese acceso.
2. Copiar al build la URL del proyecto y la clave anónima. Pueden acabar en el repositorio: la página es pública y esa clave no abre datos. La clave de servicio no se copia, no se pega en un chat y no se mete en GitHub.
3. En Auth: altas cerradas, URL del sitio y redirección exacta de GitHub Pages, y un SMTP tuyo en el panel. El correo que trae Supabase de prueba no da para el uso seguido del grupo. Esas claves se quedan en el panel.
4. Ejecutar en el editor SQL la lista real de doce correos, nombres y parejas, sustituyendo a Persona 1 … Persona 12. Ese texto no se sube a GitHub.
5. Generar el par VAPID. La clave privada, el subject y `CRON_SECRET` van a los secretos de la función. La clave pública puede ir al build. El reloj (`pg_cron`) usa `CRON_SECRET`, no la clave de servicio.
6. Activar GitHub Pages en el sitio estático, con HTTPS. La dirección será pública. Lo privado es la base, no la dirección.
7. Instalar la aplicación en tu iPhone (Safari, Añadir a pantalla de inicio, iOS 16.4 o posterior) y en un Android, abrirla desde el icono, entrar con el código del correo y encender el aviso una vez. Sin ese icono, el iPhone no recibe push.
8. Si llega el correo de que el proyecto gratuito se va a pausar, entrar en el panel o abrir la aplicación. Si ya se pausó, pulsar Resume. Los avisos de esos días no se recuperan solos.

## Retos

### A Producto

El breve ya incluye la racha de diez, el aviso cuando una pareja queda descubierta y el confeti. La arquitectura va con eso: las cuatro rachas en Hoy, el aviso de pareja solo a esa pareja, y una sola animación.

El resumen del lunes quedó en una línea, sin correo y sin tarea. Si pide una pantalla, un correo o un cron, sobra.

El aviso de la mañana no entra. Coincido con el breve: la tarde anterior es el aviso, y por la mañana basta la línea de Hoy.

Coincido en que no hay pantalla de administración, en que el domingo rompe la racha y no se avisa, y en que los dos interruptores nacen apagados. El aviso de dentro de la aplicación no se apaga.

«Diez misas» son diez personas, una por día. Un contador libre de «cuántas misas he oído hoy» se infla con un toque de más y la racha de diez deja de significar nada.

«Parejas cubiertas» y «todos han ido» miran «He ido». Celebrar «Voy a ir» festeja un plan que se puede quitar, y la celebración no se puede deshacer. El día de la décima misa se celebra una vez aunque no hayáis ido los doce. Si ese día sí habéis ido los doce, es el mismo confeti, no dos.

El hueco de una pareja avisa a esa pareja, no a las otras diez. El día vacío avisa una vez a quien tenga ese interruptor, y no manda además el de pareja. Un aviso por cada pareja, o un aviso al grupo entero porque una pareja no ha pulsado, es el ruido que hace que se apaguen todos.

### A Diseño

El confeti es vuestro. El contrato es este: uno solo aunque coincidan varios motivos, saltable desde el primer momento, alrededor de un segundo, sin sonido, sin tapar el botón de hoy, y sin movimiento si el sistema pide poco. Recargar no lo repite. No hay pantalla de celebraciones ni medallero. Si el día llega a diez y también a doce, se ve una vez. Si llega a diez y no a doce, también se ve, una vez.

Hoy enseña las cuatro rachas en una lista. El contador va debajo, en una línea pequeña. El lunes, la línea de tres cifras que recomiendo arriba, no una quinta pantalla. Una pantalla de estadísticas, de pareja, de perfil o de resumen es un sitio donde no está el botón.

Ajustes son los dos interruptores de avisos. El tema y el movimiento vienen del sistema, y los dos esquemas tienen que leerse. El permiso del móvil sale al encender uno de ellos, no de un cartel al entrar, y no se vuelve a pedir en cada visita.

Sin red, los botones se ven apagados y se dice que no hay conexión. Un interruptor que parece guardado y no lo está rompe la racha en silencio.

La pantalla de bloqueo no lleva nombres ni el texto del muro. El manifiesto y el título de la página dicen «Misa diaria» y ningún nombre del grupo. El repositorio es público.

El icono del iPhone hay que explicarlo una vez, en corto: sin él no llegan los avisos, y el código del correo se escribe dentro de la aplicación, no en Safari.
