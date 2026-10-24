-- Ejecutar una vez en el SQL Editor, con tus valores.
-- No guardes esta versión rellena en el repositorio.
-- La URL del proyecto es https://kryarzipdpvceocidgyw.supabase.co
-- Sustituye TU-PROYECTO y TU-CRON-SECRET. No guardes el secreto.

select vault.create_secret('https://TU-PROYECTO.supabase.co', 'project_url');
select vault.create_secret('TU-CRON-SECRET', 'cron_secret');

select cron.schedule(
  'misa-aviso-tarde',
  '5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/send-evening-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
