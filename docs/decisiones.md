# Decisiones

23 de octubre de 2026. Producto, Diseño e Ingeniería. El breve, la pieza de diseño y la nota de arquitectura siguen valiendo. Aquí solo lo que se discutió. Si una frase antigua de esos documentos dice lo contrario, manda este archivo.

## Cerrado por Alfredo

No se reabre:

- Cuatro rachas: la tuya, la de tu pareja, la del grupo y los días con al menos 10 misas.
- Celebración animada, con una línea corta que dice el motivo: cada pareja cubierta, los doce, los hitos de racha, y el día en que se apunta la misa número 10.
- Día en riesgo, de lunes a sábado: nadie cubierto, o tu pareja descubierta. El domingo nunca.
- La racha individual y la de pareja, las dos.

## Resumen del lunes: sí, una línea

Ingeniería lo propuso como tres cifras, solo el lunes, sin correo y sin tarea programada. Producto y Diseño lo aceptaron. Ingeniería, al leer el no inicial de los otros, prefirió quitarlo para no apretar Hoy ni abrir la puerta a un correo. Esa objeción queda contestada: no hay tarjeta, ni correo, ni cron, ni pantalla. Si algún día los pide, la línea se quita.

Solo el lunes, en hora de Madrid, en Hoy, debajo del contador y encima de los seis días. Texto pequeño, color suave. La semana es la de lunes a domingo recién cerrada:

- personas con los siete días, de 12;
- parejas que cubrieron los siete, de 6;
- días de lunes a sábado que quedaron en cero, de 6.

El domingo entra en las dos primeras y no en la tercera. Ejemplo: «La semana: 9 de 12 · 5 de 6 parejas · 0 días en cero.»

## Celebración

Corrección del 23 de octubre, después de ver los mockups. El fotograma tiene que decir el motivo. La decisión anterior de no pintar una frase queda sustituida por esta línea.

Una pieza de Diseño: tiro de papel, 1,2 segundos, sin sonido y sin librería. Colores de la paleta. Con el papel va una sola línea, corta y cálida. No basta el confeti sobre Hoy borroso.

La línea, según el motivo:

- «¡Todas las parejas han ido hoy!»
- «¡Hoy habéis ido los doce!»
- «7 días seguidos» o «30 días seguidos». Si hace falta decir de quién es la racha, como mucho dos palabras más («Tú», «Pareja», «Grupo» o «10 misas»).
- «10 misas hoy»

Si coinciden varios, un solo pase y una sola línea, en este orden: hito, luego todos, el día de las 10, las parejas. Las otras claves se guardan y no se reproducen después.

Una vez por suceso y por persona. La fila se inserta antes de animar. Recargar no la repite. Saltar, desde el primer fotograma, no la reprograma. El botón «He ido a Misa» sigue visible y se puede pulsar. El papel no lo tapa.

Con poco movimiento se ve el mismo fotograma, ya en la cresta, quieto, con la misma línea. El lector de pantalla oye esa línea.

En oscuro, el texto del botón vela es `#2A2118` sobre `#F0A06A`. La línea de la celebración se lee igual en claro y en oscuro.

## Seis días

Siguen en Hoy, no en otra pantalla. Orden al abrir: riesgo, botón, cuatro rachas, contador, la línea del lunes si toca, y debajo los seis días. Si no caben, se desplaza. El servidor autoriza hoy y los seis días civiles anteriores en Europe/Madrid. El domingo dentro de esa ventana se puede corregir y no se pinta en riesgo.

## Aviso de la mañana: no

Los tres coinciden. El aviso útil es el de la tarde anterior, cuando aún se puede apuntar alguien. Por la mañana basta la línea de Hoy.

## Ya acordado, y no rediscutido

Cuatro pantallas: Hoy, Calendario, Muro, Ajustes. Los doce y las parejas viven en un SQL de semilla, sin pantalla de administración. El aviso del móvil nace apagado, con dos interruptores, y como mucho sale uno al día. Se entra con un enlace al correo y un código de seis cifras. La clave anónima puede ir en el repositorio. La clave de servicio y la VAPID privada, no.
