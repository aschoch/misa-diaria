# Misa diaria — identidad

Doce personas, seis matrimonios, una Misa al día. La interfaz es mínima, cálida y alegre: lino, vela, olivo y un poco de rosa. No es un panel ni una red. El arco del encabezado es una puerta; el punto verde, alguien que ya ha entrado.

Si la simplicidad deja un solo interruptor y un solo número, la app se enfría y esconde las tres metas. Si el movimiento se recorta «para ir más rápido», o el permiso del móvil salta al abrir, se pierde el cuidado. Esta pieza defiende las dos cosas.

La copia va en español de España, de tú, y en portugués de Portugal, de tu. Cada persona lo elige en Ajustes. Si el idioma del teléfono empieza por `pt`, se abre en pt-PT. El título de las rachas es «Rachas» o «Sequências». En los mockups los nombres son de pega (Ana y Luis, y el resto). Cuando lleguen los reales, el tono no cambia. No hay una piel más fría para «Persona 1».

Cuatro pantallas, y ninguna más: Hoy, Calendario, Muro, Ajustes. La celebración no es una quinta: ocurre sobre Hoy.

## Paleta

El modo oscuro sigue al sistema. No hay un interruptor más en Ajustes.

### Luz

| Token | Hex | Uso |
| --- | --- | --- |
| Lienzo | `#F3EBDD` | Fondo |
| Papel | `#FFF9F2` | Listas, notas, nav |
| Tinta | `#2A2118` | Texto principal |
| Suave | `#5C4F42` | Secundario |
| Vela | `#9C3F1C` | Botón principal |
| Miel | `#F6E3C0` | Domingo |
| Miel fuerte | `#F0C56A` | Flash y pétalos |
| Miel tinta | `#5E4818` | «Todos» y «Domingo» |
| Olivo | `#1E5C38` | «Has ido» |
| Rosa | `#8E3A4A` | Matrimonios completos |
| Arcilla | `#7A3E0C` | Texto en riesgo |
| Barra | `#8C3E1E` | Barra de 4 px |
| Arcilla suave | `#F8E4C8` | Banda de Hoy |
| Línea | `#E6D9C8` | Filetes |
| Foco | `#2A2118` | Anillo de foco |

Contraste medido, texto sobre su fondo: tinta sobre lino 13,4:1; suave sobre lino 6,7:1; papel sobre vela 6,4:1; arcilla sobre arcilla suave 6,7:1; miel tinta sobre miel 6,9:1; rosa sobre papel 7,0:1. El foco sobre lino pasa de largo el 3:1 de un contorno.

### Oscuro

| Token | Hex | Uso |
| --- | --- | --- |
| Lienzo | `#14110E` | Fondo |
| Papel | `#221C17` | Superficies |
| Tinta | `#F6EFE4` | Texto |
| Suave | `#D2C4B2` | Secundario |
| Vela | `#F0A06A` | Botón, con tinta `#2A2118` encima |
| Olivo | `#9ED4AE` | He ido |
| Rosa | `#F0A8B4` | Matrimonios |
| Arcilla | `#F2C48A` | Riesgo |
| Miel tinta | `#F0D7A4` | Domingo y todos |
| Foco | `#F0A06A` | Anillo |

Tinta oscura sobre la vela `#F0A06A` da 7,5:1. Blanco sobre esa vela se queda en 2,1:1 y no se usa. El ámbar de un pétalo no es color de texto.

## Tipo

- Fraunces, peso 560, para el título de pantalla, la cifra grande de «Misas del grupo» y las cuatro cifras de racha. Números en cifra moderna, no elzeviriana.
- Atkinson Hyperlegible, 400 y 700, para todo lo demás. Lleva las tildes y la eñe.
- Escala: 13 px secundario, 15–16 px cuerpo, 12 px la etiqueta de un día, 28 px la cifra, 32 px el título.
- Interlineado 1,35 en el cuerpo. Mayúsculas de frase. Nada de versalitas.

## Espacio

Escala de 4: 4, 8, 12, 16, 20, 24, 32. Margen de pantalla 20 px. Radio 14 px en botones, 16 px en notas. El botón principal mide 48 px de alto. Toda diana mide al menos 44 px: fila de día, fila editable, interruptor, Borrar, nav, la cruz de saltar. Si los 14 días no caben, la lista se desplaza. No se encoge la fila.

## Las cuatro pantallas

![Hoy: el botón, las cuatro rachas y el viernes en riesgo](/cursor/stores/bc-fef1ad98-c19e-5bc7-b9ff-40b2959a5f47/media/mockups/hoy.png)

**Hoy** abre con la línea de riesgo, si la hay, y el botón «He ido a Misa» («Fui à Missa» en portugués). Debajo, la cifra grande del grupo, en Fraunces, con «Misas del grupo» o «Missas do grupo». Luego el título «Rachas» o «Sequências» y una sola lista: la tuya, tu matrimonio, el grupo, 10 o más. No es una quinta racha. Luego, los seis días anteriores, para corregir. El domingo 18 se puede apuntar y no lleva ámbar.

![Calendario de 14 días: compromiso, cobertura, matrimonios y un domingo que no está en riesgo](/cursor/stores/bc-fef1ad98-c19e-5bc7-b9ff-40b2959a5f47/media/mockups/calendario.png)

**Calendario** son los próximos 14 días, no un mes. Pulsas el día y dices que vas a ir, o te quitas. El anillo discontinuo es el tuyo.

![Muro de intenciones](/cursor/stores/bc-fef1ad98-c19e-5bc7-b9ff-40b2959a5f47/media/mockups/muro-de-intenciones.png)

**Muro**: una lista. Una o dos frases, con tu nombre. Tú borras la tuya. Al pulsarla se abre el hilo en la misma pantalla: 🙏 💛 🕯️, cada cual la suya, y comentarios cortos de hasta 200 caracteres, sin HTML. Lo nuevo sube la intención. En el hilo, lo antiguo va primero.

![Ajustes, con los dos avisos apagados](/cursor/stores/bc-fef1ad98-c19e-5bc7-b9ff-40b2959a5f47/media/mockups/ajustes-de-avisos.png)

**Ajustes** son el idioma (Español o Português) y dos interruptores, los dos apagados.

![El mismo calendario en el ordenador](/cursor/stores/bc-fef1ad98-c19e-5bc7-b9ff-40b2959a5f47/media/mockups/calendario-escritorio.png)

En el ordenador es la misma lista, con el domingo 25 abierto al lado. No aparece una retícula de mes ni un panel de cifras.

## Cómo se distingue un día

Una persona cubre el día si ha marcado «Voy a ir» o «He ido». Las rachas solo cuentan «He ido».

El predicado, y no solo el color:

`en riesgo = no es domingo y (no hay nadie cubierto, o algún matrimonio no tiene a ninguno de los dos)`

| Estado | Qué se ve | Qué no se ve |
| --- | --- | --- |
| Alguien, sin más | La cifra en tinta | Sin barra |
| Todos los matrimonios, no los doce | «6 de 6» en rosa, dos puntos, etiqueta «Matrimonios» | Sin barra |
| Los doce | «12 de 12» en miel, un disco, etiqueta «Todos» | Sin barra |
| En riesgo | Barra de arcilla de 4 px y las palabras «En riesgo». La fila sigue en papel | No se rellena el día de ámbar |
| Domingo | Fila de miel, un sol, la palabra «Domingo» | Nunca «En riesgo», aunque sea 0 de 12 |

El sábado 24 está a 0 de 12 y en riesgo. El domingo 1 de noviembre también está a 0 y no lo está. El domingo 25 tiene a una persona, cuenta para las rachas, y la frase es «No está en riesgo». El martes 27, con los doce comprometidos, dice «Todos». El miércoles 28, con los seis matrimonios y no los doce, dice «Matrimonios».

La barra es estrecha a propósito. Dentro de 14 días muchos días pueden estar vacíos: si cada uno se rellena de ámbar, el horizonte grita y el aviso deja de verse.

## Rachas

En Hoy, en este orden, una sola lista:

1. **La tuya.** ¿Has ido tú cada día? Meta 1.
2. **Tu matrimonio.** ¿Ha ido al menos uno de los dos? Puede ser más larga que la de cada uno si os releváis. Meta 2.
3. **El grupo.** ¿Ha ido alguien? Meta 3.
4. **10 o más.** ¿Ese día hay al menos 10 «he ido»? Se rompe con 9 o menos. El domingo cuenta igual: si hay menos de 10, la racha se rompe, y aun así no avisamos.

No hay una lista de las doce rachas personales. Las dos primeras líneas ya son la tuya y la de tu matrimonio. Un ranking sería la pantalla de estadísticas que no entra.

Hitos: 7 y 30, en las cuatro, una vez cada uno. Ni el 8 ni el 31.

Hoy y los seis días anteriores recomponen las cuatro rachas.

## Celebración

Sobre Hoy, sin cambiar de pantalla. Una sola pieza para todos los motivos: el tiro de papel y **una línea corta** que dice por qué. La línea va en Fraunces, tinta sobre lino, el mismo tono que el título de Hoy. No es un cartel, ni otra tipografía, ni una segunda animación. Sin la línea, el papel no dice qué ha pasado. El mockup es la cresta, a los 480 ms, con el botón «He ido a Misa» libre.

![Celebración: «¡Hoy habéis ido los doce!», con el papel al aire y el botón libre](/cursor/stores/bc-fef1ad98-c19e-5bc7-b9ff-40b2959a5f47/media/mockups/celebracion.png)

La línea, una sola, según el motivo que manda:

| Motivo | Línea |
| --- | --- |
| Cada matrimonio cubierto | ¡Todos los matrimonios han ido hoy! |
| Todos han ido | ¡Hoy habéis ido los doce! |
| Hito de 7 | 7 días seguidos |
| Hito de 30 | 30 días seguidos |
| Día con al menos 10 misas | 10 misas hoy |

Si el hito puede ser el tuyo, el de tu matrimonio, el del grupo o el de 10 misas, se añaden como mucho dos palabras para que no sean iguales: «Tú», «Matrimonio», «Grupo» o «10 misas». Por ejemplo, «Tú · 7 días seguidos» o «Grupo · 30 días seguidos». No más texto.

Si coinciden varios, hay **una** animación y **una** línea, en este orden: hito, todos, el día de las 10, los matrimonios. Las otras claves se guardan y no salen después.

Dura **1,2 s**. Curva `cubic-bezier(0.16, 0.84, 0.24, 1)`. Sin rebote, sin bucle, sin sonido, sin librería.

1. Hoy sigue debajo. El velo no baja hasta el botón.
2. Un flash de miel nace junto a la línea, llega hacia los 200 ms y se apaga con la pieza.
3. El motivo entra en opacidad hasta los 240 ms, se queda quieto y se va con el papel. No viaja. Matrimonios: seis pares, más rosa. Todos: doce semillas, paleta completa (es el mockup). Hito: un anillo, unas tiras más. Día de 10: diez semillas en arco, miel y olivo.
4. Unos 32 papeles. Nacen como si salieran de la mano, por encima del botón, nunca encima de él. A los 480 ms están en lo alto. Caen y se desvanecen. El arranque se escalona hasta 180 ms.
5. La línea entra con el motivo y se va con él. Pétalo, rectángulo y tira, solo de la paleta. Menos de 40 piezas.

Se dispara una vez por suceso y por persona. La fila se inserta antes de animar. Apuntar un día normal no la lanza: el botón solo se rellena en 200 ms, y se puede pulsar mientras el papel está en el aire.

Claves, por persona:

- `celeb:parejas:{fecha}` al cubrirse el último matrimonio
- `celeb:todos:{fecha}` cuando la persona 12 marca «he ido»
- `celeb:hito:{tuya|pareja|grupo|diez}:{7|30}`
- `celeb:diez:{fecha}` cuando se apunta la misa número 10 y la racha de esos días sigue

Abrir la app no la repite.

**Saltar**, desde el primer fotograma: pulsar fuera del botón, Escape, o la cruz de 44 px. Se va en 120 ms. La cruz se llama «Saltar la celebración».

### Movimiento reducido

Quien lo pide en el sistema no ve el recorrido ni el giro. Ve este mismo fotograma, ya en la cresta, con el flash quieto **y la misma línea**. No es una frase en lugar de la cresta, ni una cresta sin frase. El resto de la app pierde el desplazamiento: el relleno de «He ido» es instantáneo.

## Accesibilidad

- El estado no va solo en el color: barra y palabras para el riesgo, miel y «Domingo» y el sol, disco para los doce, dos puntos para los matrimonios, anillo para «voy a ir», disco de olivo para «has ido».
- Contraste de texto al menos AA, con los pares de arriba. En oscuro, la vela no lleva blanco.
- Dianas de 44 px. Foco visible: 3 px de tinta, 3 px fuera del control. En el mockup de Ajustes el primer interruptor lo enseña.
- La línea de la fiesta es la misma que oye el lector de pantalla. La cruz se llama «Saltar la celebración».

## Avisos

Dentro de la app el riesgo no se apaga: es la línea de Hoy y el día marcado en el calendario.

En el móvil, solo si tú enciendes uno de los dos, y vienen apagados. El sistema no pregunta al abrir. Pregunta cuando un interruptor pasa de no a sí. Como mucho un aviso al día, la tarde anterior, de lunes a sábado:

- mañana no hay nadie cubierto;
- mañana tu matrimonio no está cubierto, y solo a vosotros dos.

Si no hay nadie, ese es el único: no se manda también el del matrimonio. El domingo no se avisa. La línea de hoy no añade un aviso de buena mañana.

**Resumen del lunes: sí, una línea.** Solo el lunes, debajo del contador y encima de los seis días, en color suave. Tres cifras, sin tarjeta y sin correo: «La semana: 9 de 12 · 5 de 6 matrimonios · 0 días en cero.»

**Aviso de buena mañana: no.** El útil es el de la tarde anterior, cuando aún se puede apuntar alguien. Un aviso cada mañana enseña a ignorar el móvil. Quien abre la app ve la línea.

## Retos

### A producto

- La celebración lleva una línea, no un cartel. Si se pide un párrafo, un segundo pase o una frase distinta de la tabla, se esconde el papel. La línea es la de la tabla, en Fraunces, y se va con la pieza.
- La línea de riesgo va arriba, delante del botón. Si se deja bajo los seis días, Hoy no enseña el día al abrir.
- No ampliar el ámbar al domingo ni a la racha de 10. El domingo puede romper «10 o más» y sigue sin ser un día en riesgo.
- No listar las doce rachas. La tuya y la de tu matrimonio, en ese orden, ya están. Un ranking es otra pantalla.
- No soltar confeti al marcar un «he ido» cualquiera. Ese toque es un relleno breve. La fiesta es escasa: matrimonios, todos, hito, día de 10.
- No rellenar de ámbar el día entero. En 14 días vacíos, una barra de 4 px se lee; una celda roja grita.
- No nombrar al matrimonio de otro en el aviso del móvil. En Hoy la línea dice «Falta un matrimonio.», sin nombres. El calendario enseña el recuento y, si falta uno, «Falta el Matrimonio 6», sin punto.

### A ingeniería

- No disparar la pieza en el render porque el estado ya es verdad. Hace falta la clave, por persona y suceso. Si coinciden varios, un solo play, en el orden hito, todos, día de 10, matrimonios. Las otras claves se escriben aunque no se vean.
- 1,2 s, menos de 40 papeles, colores de esta paleta, sin rebote y sin librería genérica. Un confeti de arcoíris con otra duración no es esta pieza. Un parpadeo de 300 ms tampoco.
- `prefers-reduced-motion`: el mismo fotograma, con la misma línea. No una frase sola, ni un `animation: none` que borre el motivo o el texto. Hay que probarlo como criterio, no como ajuste final. El botón de Hoy sigue recibiendo el toque.
- El permiso del sistema llega al encender un interruptor, nunca en el primer render, y no se reintenta en bucle. Los dos nacen en no. Un envío al día. El domingo se excluye en la consulta, no solo en la copia.
- Cobertura y riesgo usan «voy a ir» o «he ido». Las rachas usan solo «he ido». Mezclarlos en la misma pregunta rompe el sábado y la racha a la vez.
- Dianas de 44 px. Si el día 14 no cabe, scroll. No se baja la fila.
- En oscuro, el botón de vela lleva tinta `#2A2118`. Blanco encima no llega a 3:1.
- Doce personas: una app y una base. La fiesta no necesita un servicio. El aviso no necesita una cola ni un motor de reglas.
