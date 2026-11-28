# Estado de los datos · el Hub con datos de Supabase

*Documento vivo del frente «el Hub enseña los datos reales» (prompt maestro del
ARRANQUE §5). Se actualiza al cerrar cada fase: qué se hizo, qué se verificó y
qué queda. Fases 1 y 2 cerradas el 28-nov-2026.*

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

---

## Fase 2 · Acceso seguro (28-nov-2026)

### Qué se hizo

- **Migración `servidor/sql/004_panel_lectura.sql`** (aplicada como
  `amz_004_panel_lectura` y corregida con `amz_004b_panel_inventario_ambiguo`).
  - El titular se guarda en `amz_config` (`titular_uid`), tomado de
    `auth.users` por el correo `juancho@grupoarestora.com`. No está en el código.
  - `amz_es_titular()` y `amz_exigir_titular()`: comprueban que la sesión es la
    del titular. Otra sesión válida del proyecto (la otra aplicación comparte
    Auth) no basta.
  - Funciones de lectura, todas `SECURITY DEFINER` con `search_path` vacío, que
    devuelven solo agregados, sin `order_id`, `order_item_id`, `ref_linea` ni
    nombre de documento: `amz_panel_ventas_dia(desde)`,
    `amz_panel_pedidos_dia(desde)` (día en hora de Madrid),
    `amz_panel_inventario()`, `amz_panel_recomendaciones(limite)`,
    `amz_panel_ingestas()`, `amz_panel_costes()`, `amz_panel_gastos_fijos()`.
  - `anon` no puede ejecutarlas; `authenticated` sí, pero salta `42501` si no
    es el titular. **Las tablas siguen cerradas**: no se ha creado ninguna
    política.
- **Supabase Auth · Redirect URLs:** añadida
  `https://aresstore-seller-hub.vercel.app/**` con OK de Juancho (28-nov). Las
  dos de `control.grupoarestora.com` siguen igual; la Site URL no se ha tocado.
- En el navegador irá la clave **publicable** (`sb_publishable_…`), pensada para
  ser pública; nunca `service_role`.

### Qué se verificó (en la base, simulando cada sesión)

| Caso | Esperado | Resultado |
|---|---|---|
| `anon` llama a `amz_panel_inventario()` | denegado | `42501` |
| Sesión de otro usuario real del proyecto | denegado | `42501` |
| Sesión con un uid inventado | denegado | denegado |
| Sesión de Juancho lee `amz_ventas_linea` directamente | denegado | `42501` |
| Sesión de Juancho, inventario | 101 SKU, 649 disp. (consulta directa) | 101 SKU, 649 |
| Sesión de Juancho, ventas ES tipo venta | 24.932,23 € (consulta directa) | 24.932,23 € |
| Sesión de Juancho, pedidos desde 1-nov sin cancelados | 64 uds (consulta directa) | 64 |
| Sesión de Juancho, recomendaciones | 49 | 49 |

**La prueba se vio fallar:** la primera versión de `amz_panel_inventario()`
daba `42702` (columna `fecha_foto` ambigua) en la llamada como titular. Se
corrigió y se repitió la tabla entera.

### Qué queda

**Fase 3 · lectura en el Hub:** inicio de sesión por enlace mágico desde la
web, cliente de esas funciones sin librerías (el Hub es un solo archivo), y una
pantalla «En vivo» que diga en cada cifra si es medida o estimada y de qué
fecha. Después, enganchar los módulos existentes sin quitar la importación
manual.

---

## Fase 3 · El Hub lee Supabase: vista «En vivo» (28-nov-2026)

### Qué se hizo

- `src/29-vivo.js`: vista **En vivo** en «Visión general». Inicio de sesión por
  enlace mágico (`/auth/v1/otp` con `create_user:false`, vuelta a la URL del Hub),
  renovación del token, y lectura de las cinco funciones `amz_panel_*` con
  `fetch`, sin librerías. Sesión en `localStorage` (`aresstore_sb_sesion`),
  aparte de la base del Hub; «Cerrar sesión» la borra.
- Qué enseña, con la etiqueta «medido» y su fecha: stock de la última foto
  (pool UE), FBA0500 y FBA0103, pedidos de España a 7 y 30 días, dinero por mes
  y país hasta la fecha de corte del informe de transacciones, la bandeja de
  decisiones y la frescura de cada fuente.
- Qué NO hace, dicho en pantalla: no resta coste de producto («neto antes de
  coste», no beneficio); no calcula cobertura mezclando stock UE con pedidos
  solo de ES; no inventa el dinero posterior al corte; no toca los módulos que
  leen ficheros importados.

### Qué se verificó

- `tests/vivo.test.js` (33 comprobaciones) con la aritmética a mano en la
  cabecera: neto por mes y país con la publicidad separada, bordes de 7 y 30
  días, cancelados fuera, frescura, sin llamadas sin sesión, clave publicable y
  token correctos, escapado del texto de la bandeja, permiso denegado.
- **Vista en rojo:** metiendo la publicidad dentro de «Amazon» y moviendo el
  borde de 7 días, la suite da 4 fallos con el motivo; quitado el fallo, verde.
- Suite completa: **40 suites · 1.578 comprobaciones · 0 fallos**.

### Qué queda

- Comprobación en la URL servida con la sesión de Juancho y contraste de tres
  cifras por bloque con Supabase y Seller Central (paso 6 del prompt maestro).
- Fase 4 (panel de portada con nota por indicador) y fase 5 (ingesta: Finances
  API, cron de `amz-informes`, SQP semanal, cerrar `amz-informes`).
