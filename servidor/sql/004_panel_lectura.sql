-- 004 · Lectura del Hub desde el navegador (fase 2 de docs/ESTADO-DATOS.md)
--
-- Qué hace: deja leer al Hub las cifras de Amazon que ya están en Supabase,
-- SOLO con la sesión de Juancho y SOLO en forma agregada.
--
-- Cómo:
--   * Las tablas amz_* siguen cerradas (RLS sin políticas). No se abre ninguna.
--   * Se exponen funciones `amz_panel_*` SECURITY DEFINER que comprueban
--     primero `amz_es_titular()` y devuelven filas agregadas: sin order_id,
--     sin order_item_id, sin ref_linea ni nombre de documento.
--   * El titular se guarda en amz_config ('titular_uid'), no en el código.
--     El proyecto comparte Auth con otra aplicación: una sesión válida de otro
--     usuario NO basta.
--   * `anon` no puede ejecutar nada; `authenticated` puede llamar, pero la
--     función devuelve error si no es el titular.
--
-- Se aplica con el conector de Supabase (migración) y queda aquí como copia.

-- 1 · el titular
insert into public.amz_config (clave, valor, actualizado)
select 'titular_uid', u.id::text, now()
from auth.users u
where lower(u.email) = 'juancho@grupoarestora.com'
on conflict (clave) do update set valor = excluded.valor, actualizado = now();

create or replace function public.amz_es_titular()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and auth.uid()::text = (select valor from public.amz_config where clave = 'titular_uid');
$$;

create or replace function public.amz_exigir_titular()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.amz_es_titular() then
    raise exception 'acceso denegado' using errcode = '42501';
  end if;
end;
$$;

-- 2 · ventas por día, país, SKU y tipo (desde amz_ventas_linea, ficheros)
create or replace function public.amz_panel_ventas_dia(p_desde date default null)
returns table (dia date, pais text, sku text, tipo text, unidades bigint,
               ingreso numeric, iva numeric, comision numeric, logistica numeric,
               otros numeric, divisa text, lineas bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.amz_exigir_titular();
  return query
    select v.dia, v.pais, v.sku, v.tipo, sum(v.unidades)::bigint,
           sum(v.ingreso), sum(v.iva), sum(v.comision), sum(v.logistica),
           sum(v.otros), v.divisa, count(*)::bigint
    from public.amz_ventas_linea v
    where p_desde is null or v.dia >= p_desde
    group by v.dia, v.pais, v.sku, v.tipo, v.divisa
    order by v.dia, v.pais, v.sku, v.tipo;
end;
$$;

-- 3 · pedidos por día (hora de Madrid), país, SKU y estado (SP-API, solo ES hoy)
create or replace function public.amz_panel_pedidos_dia(p_desde date default null)
returns table (dia date, pais text, sku text, estado text, pedidos bigint,
               unidades bigint, importe numeric, iva numeric, divisa text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.amz_exigir_titular();
  return query
    select (p.fecha_compra at time zone 'Europe/Madrid')::date, p.pais, p.sku,
           p.estado, count(distinct p.order_id)::bigint, sum(p.unidades)::bigint,
           sum(p.precio), sum(p.iva), p.divisa
    from public.amz_pedidos_api p
    where p_desde is null or (p.fecha_compra at time zone 'Europe/Madrid')::date >= p_desde
    group by 1, p.pais, p.sku, p.estado, p.divisa
    order by 1, p.pais, p.sku, p.estado;
end;
$$;

-- 4 · última foto de inventario (pool europeo, recogida de ES)
create or replace function public.amz_panel_inventario()
returns table (fecha_foto date, sku text, asin text, disponibles integer,
               reservadas integer, entrantes integer, no_vendibles integer,
               almacenaje_estimado numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.amz_exigir_titular();
  return query
    select i.fecha_foto, i.sku, i.edad->>'asin', i.disponibles, i.reservadas,
           i.entrantes, i.no_vendibles, i.almacenaje_estimado
    from public.amz_inventario_foto i
    where i.documento like 'spapi/inventario/ES/%'
      and i.fecha_foto = (select max(x.fecha_foto) from public.amz_inventario_foto x
                          where x.documento like 'spapi/inventario/ES/%')
    order by i.sku;
end;
$$;

-- 5 · bandeja de decisiones
create or replace function public.amz_panel_recomendaciones(p_limite integer default 200)
returns table (id bigint, creada timestamptz, modulo text, sku text, pais text,
               accion text, motivo text, impacto_eur_mes numeric, confianza text,
               estado text, decidido_en timestamptz, nota_decision text, datos jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.amz_exigir_titular();
  return query
    select r.id, r.creada, r.modulo, r.sku, r.pais, r.accion, r.motivo,
           r.impacto_eur_mes, r.confianza, r.estado, r.decidido_en,
           r.nota_decision, r.datos
    from public.amz_recomendaciones r
    order by r.id desc
    limit greatest(1, least(coalesce(p_limite, 200), 1000));
end;
$$;

-- 6 · frescura: última ingesta por tipo
create or replace function public.amz_panel_ingestas()
returns table (id_hub text, estado text, cuando timestamptz, mercados text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.amz_exigir_titular();
  return query
    select distinct on (g.id_hub) g.id_hub, g.estado, g.cuando, g.mercados
    from public.amz_ingestas g
    order by g.id_hub, g.cuando desc;
end;
$$;

-- 7 · costes y gastos fijos (para el margen)
create or replace function public.amz_panel_costes()
returns table (sku text, es_familia boolean, coste_unidad numeric, desde date,
               hasta date, origen text, confirmado boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.amz_exigir_titular();
  return query
    select c.sku, c.es_familia, c.coste_unidad, c.desde, c.hasta, c.origen, c.confirmado
    from public.amz_costes c order by c.sku, c.desde;
end;
$$;

create or replace function public.amz_panel_gastos_fijos()
returns table (concepto text, pais text, importe_mes numeric, desde date,
               hasta date, origen text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.amz_exigir_titular();
  return query
    select g.concepto, g.pais, g.importe_mes, g.desde, g.hasta, g.origen
    from public.amz_gastos_fijos g order by g.desde;
end;
$$;

-- 8 · permisos: nadie salvo usuarios con sesión; dentro, solo el titular
do $$
declare f text;
begin
  foreach f in array array[
    'amz_es_titular()', 'amz_exigir_titular()',
    'amz_panel_ventas_dia(date)', 'amz_panel_pedidos_dia(date)',
    'amz_panel_inventario()', 'amz_panel_recomendaciones(integer)',
    'amz_panel_ingestas()', 'amz_panel_costes()', 'amz_panel_gastos_fijos()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
