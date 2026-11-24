-- ═══════════════════════════════════════════════════════════════════════════
-- servidor/sql/001_esquema.sql · la base de datos del Seller Hub
--
-- Vive en el proyecto de Supabase `gestion-arestora` (decisión de Juancho del
-- 24-nov: reaprovechar en vez de pagar uno nuevo). Por eso TODAS las tablas
-- llevan el prefijo `amz_`: se ve de quién son y no chocan con las de gestión.
-- NO se instala en el proyecto de Deporte Seguro, que guarda datos de menores.
--
-- REGLA DE ACCESO. Todas las tablas tienen RLS activado y NINGUNA política para
-- `anon` ni `authenticated`. Solo la clave de servicio (que vive en el entorno
-- de ejecución, nunca en el repositorio) lee y escribe. El Hub en Vercel no
-- habla con la base de datos desde el navegador: pide a una función del
-- servidor. Así, si algún día la clave pública acaba en el HTML, no abre nada.
--
-- QUÉ HAY Y PARA QUÉ:
--   documentos       · cada informe tal como llegó (archivo; las liquidaciones
--                      solo se ven 90 días en Amazon y aquí no caducan)
--   ingestas         · el rastro: qué se pidió, qué llegó, qué se rechazó
--   ventas_linea     · una fila por línea de pedido o movimiento, por día/SKU/país
--   publicidad_dia   · gasto y ventas atribuidas por día/país/campaña/término
--   inventario_foto  · existencias por SKU y país en la fecha de la foto
--   costes           · coste puesto en almacén por SKU, con vigencia
--   gastos_fijos     · gestoría, IVA por país, EPR, suscripciones
--   recomendaciones  · lo que el Hub aconseja, y lo que Juancho decide
--
-- Cada fila de datos lleva `documento` (la clave del informe del que salió):
-- ningún número del Hub existe sin poder decir de qué fichero viene.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.amz_documentos (
  clave       text primary key,
  texto       text not null,
  meta        jsonb not null default '{}'::jsonb,
  huella      text not null,               -- sha256 del texto, para no duplicar
  bytes       integer not null,
  creado      timestamptz not null default now()
);
create index if not exists amz_documentos_huella on public.amz_documentos (huella);

create table if not exists public.amz_ingestas (
  id          bigint generated always as identity primary key,
  id_hub      text not null,                -- 'orders', 'settlement', 'ads'…
  estado      text not null,
  cuando      timestamptz not null default now(),
  mercados    text[] not null default '{}',
  clave       text references public.amz_documentos(clave),
  registro    jsonb not null default '{}'::jsonb   -- el registro entero, tal cual
);
create index if not exists amz_ingestas_hub_cuando on public.amz_ingestas (id_hub, cuando desc);

create table if not exists public.amz_ventas_linea (
  id            bigint generated always as identity primary key,
  dia           date not null,
  sku           text not null,
  pais          text,                       -- ISO-2; null si el informe no lo dice
  tipo          text not null,              -- 'venta','reembolso','tarifa','ajuste'…
  unidades      integer not null default 0,
  ingreso       numeric(12,2) not null default 0,   -- sin IVA
  iva           numeric(12,2) not null default 0,
  comision      numeric(12,2) not null default 0,
  logistica     numeric(12,2) not null default 0,
  otros         numeric(12,2) not null default 0,
  divisa        text not null default 'EUR',
  ref_linea     text,                       -- order-item-id o equivalente
  documento     text not null references public.amz_documentos(clave),
  unique (documento, ref_linea, tipo, sku, dia)
);
create index if not exists amz_ventas_dia_sku_pais on public.amz_ventas_linea (dia, sku, pais);

create table if not exists public.amz_publicidad_dia (
  id            bigint generated always as identity primary key,
  dia           date not null,
  pais          text,
  campana       text not null,
  grupo         text,
  termino       text,
  sku           text,
  impresiones   integer not null default 0,
  clics         integer not null default 0,
  gasto         numeric(12,2) not null default 0,
  ventas        numeric(12,2) not null default 0,
  pedidos       integer not null default 0,
  divisa        text not null default 'EUR',
  documento     text not null references public.amz_documentos(clave)
);
create index if not exists amz_publicidad_dia_pais on public.amz_publicidad_dia (dia, pais, campana);

create table if not exists public.amz_inventario_foto (
  id            bigint generated always as identity primary key,
  fecha_foto    date not null,              -- la del informe, no la de importar
  sku           text not null,
  pais          text,
  disponibles   integer not null default 0,
  no_vendibles  integer not null default 0,
  reservadas    integer not null default 0,
  entrantes     integer not null default 0,
  edad          jsonb not null default '{}'::jsonb,  -- unidades por tramo de antigüedad
  almacenaje_estimado numeric(12,2),
  documento     text not null references public.amz_documentos(clave),
  unique (fecha_foto, sku, pais, documento)
);

create table if not exists public.amz_costes (
  id            bigint generated always as identity primary key,
  sku           text not null,              -- SKU o prefijo de familia
  es_familia    boolean not null default false,
  coste_unidad  numeric(10,4) not null,     -- puesto en almacén, sin IVA de importación
  desde         date not null,
  hasta         date,
  origen        text not null,              -- 'juancho 24-nov', 'factura X'…
  confirmado    boolean not null default false
);

create table if not exists public.amz_gastos_fijos (
  id            bigint generated always as identity primary key,
  concepto      text not null,
  pais          text,
  importe_mes   numeric(10,2) not null,
  desde         date not null,
  hasta         date,
  origen        text not null
);

-- Lo que el Hub aconseja. El Hub PROPONE; ejecutar algo en Amazon exige el OK
-- de Juancho, y queda escrito aquí quién lo dio y cuándo.
create table if not exists public.amz_recomendaciones (
  id            bigint generated always as identity primary key,
  creada        timestamptz not null default now(),
  modulo        text not null,              -- 'rentabilidad','ppc','precios','inventario'…
  sku           text,
  pais          text,
  accion        text not null,              -- qué hacer, en una frase
  motivo        text not null,              -- por qué, con los números
  impacto_eur_mes numeric(10,2),            -- estimado; se dice como estimado
  confianza     text not null check (confianza in ('alta','media','baja')),
  estado        text not null default 'propuesta'
                check (estado in ('propuesta','aprobada','rechazada','ejecutada','caducada')),
  decidido_en   timestamptz,
  nota_decision text,
  datos         jsonb not null default '{}'::jsonb
);
create index if not exists amz_recomendaciones_estado on public.amz_recomendaciones (estado, creada desc);

-- RLS en todo, sin políticas: solo la clave de servicio entra.
alter table public.amz_documentos      enable row level security;
alter table public.amz_ingestas        enable row level security;
alter table public.amz_ventas_linea    enable row level security;
alter table public.amz_publicidad_dia  enable row level security;
alter table public.amz_inventario_foto enable row level security;
alter table public.amz_costes          enable row level security;
alter table public.amz_gastos_fijos    enable row level security;
alter table public.amz_recomendaciones enable row level security;

-- Y además se retiran los permisos de tabla a los roles públicos, para que una
-- política creada por error en el futuro no abra nada por sí sola.
revoke all on public.amz_documentos, public.amz_ingestas, public.amz_ventas_linea,
              public.amz_publicidad_dia, public.amz_inventario_foto, public.amz_costes,
              public.amz_gastos_fijos, public.amz_recomendaciones
  from anon, authenticated;
