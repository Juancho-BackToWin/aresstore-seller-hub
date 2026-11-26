-- Recolector diario (Agente 0) · gestion-arestora.
-- Primera versión aplicada el 26-nov-2026 (PR #24). Sustituida esa misma noche
-- por esta (jobid 1), que llama a la v3 de amz-recolector: inventario + pedidos.
-- 05:17 UTC = 06:17 en Madrid en invierno, 07:17 en verano.
--
-- Acceso: la función tiene verify_jwt = false y exige la cabecera
-- x-recolector-key igual a public.amz_config.recolector_key. La clave NO se
-- escribe aquí: la tarea la lee de la tabla en cada pasada. amz_config tiene
-- RLS sin políticas: anon y authenticated no la pueden leer.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('amz-recolector-inventario-es', '17 5 * * *', $$
  select net.http_post(
    url := 'https://hqmshjjhzwkuumoiksou.supabase.co/functions/v1/amz-recolector?mercados=ES&dias=3',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-recolector-key', (select valor from public.amz_config where clave='recolector_key')),
    timeout_milliseconds := 140000);
$$);

-- Comprobar:   select jobid, jobname, schedule, active, command from cron.job;
-- Resultados:  select id_hub, estado, cuando, registro from amz_ingestas order by cuando desc limit 5;
-- Pausar:      select cron.unschedule('amz-recolector-inventario-es');
