-- OPCIONAL. Borra los eventos de diagnóstico swipe_debug y tap_debug
-- de public.usage_events. No cambia la aplicación: el cliente ya no los escribe.
-- En el análisis del 26-31 oct 2026 eran 390 filas, todas del desarrollador.
-- Pégalo en el SQL Editor solo si quieres limpiar ese histórico.
-- Es una transacción: si algo falla, no cambia nada.

begin;

-- Vista previa (no borra): descomenta y ejecuta sola si quieres ver el recuento antes.
-- select event_name, count(*)
-- from public.usage_events
-- where event_name in ('swipe_debug', 'tap_debug')
-- group by event_name;

delete from public.usage_events
where event_name in ('swipe_debug', 'tap_debug');

commit;
