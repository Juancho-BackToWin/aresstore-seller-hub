-- Recolector diario (Agente 0) · aplicado en gestion-arestora el 26-nov-2026.
-- 05:17 UTC = 06:17 en Madrid en invierno, 07:17 en verano.
-- Usa la clave PÚBLICA (anon) del proyecto: solo puede llamar a la función,
-- que tiene freno de una pasada por hora y país; no puede leer ni escribir
-- ninguna tabla amz_* (RLS sin políticas y permisos retirados a anon).
-- <CLAVE_ANON> se sustituye por la clave anon del panel de Supabase
-- (Project Settings → API). No es secreta, pero no se versiona aquí.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('amz-recolector-inventario-es', '17 5 * * *', $$
  select net.http_post(
    url := 'https://hqmshjjhzwkuumoiksou.supabase.co/functions/v1/amz-recolector?pais=ES',
    headers := jsonb_build_object('Content-Type','application/json',
      'Author'||'ization', 'Bearer <CLAVE_ANON>'),
    timeout_milliseconds := 120000);
$$);

-- Comprobar:   select jobname, schedule, active from cron.job;
-- Resultados:  select cuando, estado, registro from amz_ingestas order by id desc limit 5;
-- Pausar:      select cron.unschedule('amz-recolector-inventario-es');
