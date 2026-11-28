# Estado de los datos · el Hub con datos de Supabase

*Documento vivo del frente «el Hub enseña los datos reales» (prompt maestro del
ARRANQUE §5). Se actualiza al cerrar cada fase: qué se hizo, qué se verificó y
qué queda. Fase 1 cerrada el 28-nov-2026.*

---

## Fase 1 · Inventario de lo que hay (28-nov-2026)

### Proyecto Supabase

`gestion-arestora` (`hqmshjjhzwkuumoiksou`). **Lo comparte con otra aplicación
de Grupo Arestora** (tablas `usuarios`, `acuerdos`, `financial_operations`,
`treasury_records`…). Consecuencias:

- Supabase Auth es común: un usuario creado para el Hub existe también para esa
  aplicación. El acceso del Hub se tiene que cerrar con RLS sobre las tablas
  `amz_*`, no con la mera existencia de una sesión.
- Los avisos de seguridad del proyecto (más abajo) afectan también a la otra
  aplicación; tocarlos es un ajuste de seguridad y necesita el OK de Juancho.

### Tablas `amz_*` (recuento exacto del 28-nov, ~11:05)

| Tabla | Filas | Rango | Qué guarda | Quién escribe |
|---|---:|---|---|---|
| `amz_ventas_linea` | 3.423 | 01-oct-2025 → 23-nov-2026 | Transacciones línea a línea (venta, reembolso, tarifa, ajuste, publicidad, liquidación, retrocargo) con ingreso, IVA, comisión, logística, otros, por país | Carga desde ficheros (PR #23). **No se actualiza sola** |
| `amz_pedidos_api` | 81 | 21-jun-2025 → hoy (casi todo oct-nov 2026) | Líneas de pedido de **España** por SP-API, sin comprador, con pendientes y cancelados | `amz-recolector`, diario |
| `amz_inventario_foto` | 303 | 26 → 28-nov | Foto diaria del stock FBA (pool europeo, recogido solo de ES) | `amz-recolector`, diario |
| `amz_ingestas` | 16 | 26 → 28-nov | Registro de cada ingesta | Las dos funciones |
| `amz_documentos` | 14 | 25 → 28-nov | Informes en bruto: transacciones por país, planificación de inventario, listings, SQP W47 | Funciones y sesión única |
| `amz_recomendaciones` | 49 | 25 → 28-nov | La bandeja del Hub: decisiones y acciones con su partida | Agentes y sesión única |
| `amz_costes` | 4 | desde 17-dic-2023 | Coste de producto por SKU o familia | A mano |
| `amz_gastos_fijos` | 1 | desde 01-oct-2025 | Gastos fijos mensuales | A mano |
| `amz_config` | 1 | — | Clave del cron del recolector | A mano |
| `amz_playbook` | **0** | — | Manual de jugadas del Investigador | Investigador (primera pasada 1-dic) |
| `amz_publicidad_dia` | **0** | — | Publicidad diaria por término | Nadie todavía (falta Ads API) |
| `amz_ventas_agregado_copia_20261125` | 442 | oct-2025 → nov-2026 | Copia de seguridad del agregado anterior a la PR #23 | — (candidata a borrar con OK) |

Todas tienen **RLS activado y ninguna política**: hoy solo las lee la clave
`service_role` (funciones y conector). Es lo correcto mientras no haya acceso
del Hub; la fase 2 añade la política de lectura para Juancho.

### Huecos de datos que condicionan las pantallas

1. **El dinero se corta el 23-nov.** Desde el 24-nov solo hay pedidos (precio e
   IVA), no comisiones, logística ni reembolsos. Hasta que entre la Finances API
   (fase 5), cualquier margen posterior al 23-nov es **estimado** y la pantalla
   tiene que decirlo.
2. **Los pedidos por API son solo de España.** IT, FR y DE venden (en los paños,
   Italia vende tanto como España), pero solo aparecen en `amz_ventas_linea`
   hasta el 23-nov.
3. **Costes:** 4 filas. Faltan flete y arancel y las familias sin coste
   confirmado (REGISTRO-CAMBIOS, «Límites de la carga de costes»). Margen neto =
   **estimado** mientras tanto.
4. **Publicidad vacía en Supabase.** El gasto solo está en la consola de
   anuncios y en las líneas `publicidad` de transacciones (cargos de factura, no
   gasto diario por campaña).
5. **Stock por país:** la SP-API da el pool europeo. El desglose sale del libro
   mayor por país (pantalla de Seller Central); no está en Supabase.

### `pg_cron`

| jobid | Nombre | Cuándo | Qué hace |
|---|---|---|---|
| 1 | `amz-recolector-inventario-es` | 05:17 UTC diario | `amz-recolector?mercados=ES&dias=3` (inventario + pedidos de 3 días) |

No hay cron para `amz-informes`: se ha lanzado a mano.

### Funciones desplegadas

| Función | Versión | `verify_jwt` | En el repositorio |
|---|---:|---|---|
| `amz-recolector` | 4 | no (protegida con `x-recolector-key`) | sí, `servidor/supabase/functions/amz-recolector` |
| `amz-informes` | 1 | **no** | sí, `servidor/supabase/functions/amz-informes` |
| `amz-spapi-ping` | 2 | sí | no (prueba del 26-nov; candidata a borrar con OK) |

### El Hub (web)

- `index.html` compilado con `bash build.sh` desde `src/` (16.054 líneas).
- Guarda todo en `localStorage` (`aresstore_hub_v3`, `src/12-datos.js`):
  catálogo, histórico (M0), lotes de coste, compras, cumplimiento. **No lee
  Supabase.**
- Suites: **39 suites, 1.545 comprobaciones, 0 fallos** (`npm run test:all`,
  28-nov, sobre `main` en `970f199`).

### Avisos de seguridad del proyecto (28-nov)

- `rls_enabled_no_policy` en 38 tablas (las 12 `amz_*` y las de la otra
  aplicación): informativo; con RLS y sin políticas la tabla queda cerrada.
- `pg_net` instalado en el esquema `public` (aviso).
- Protección de contraseñas filtradas desactivada en Auth (aviso). Afecta a las
  dos aplicaciones; **ajuste de seguridad: necesita OK de Juancho**.
- `amz-informes` acepta llamadas sin JWT ni clave propia: cualquiera con la URL
  puede pedir informes (no devuelve datos de comprador, pero gasta cuota de
  SP-API y escribe en `amz_documentos`). Se cierra en la fase 5.

### Qué se verificó

- Recuentos y rangos con consultas directas a la base (no estimados).
- El cron, las funciones y los avisos, leídos del proyecto, no del repositorio.
- La suite completa, ejecutada.

### Qué queda (siguiente fase)

**Fase 2 · acceso seguro:** usuario de Juancho (`juancho@grupoarestora.com`) por
enlace mágico, políticas RLS de solo lectura limitadas a ese usuario sobre
**vistas agregadas** (sin `order_id` ni datos de comprador), y clave publicable
en el navegador, nunca `service_role`.

**Pendiente de OK de Juancho (🔔):** borrar `amz_ventas_agregado_copia_20261125`
y `amz-spapi-ping`; activar la protección de contraseñas filtradas.
