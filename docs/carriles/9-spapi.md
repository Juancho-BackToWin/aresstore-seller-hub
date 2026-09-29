# Carril 9 · Ingesta automática por SP-API

Rama `carril/9-spapi` · desde `base/2026-09` · PR en borrador contra la base.

## Qué pregunta responde

Cuando alguien decida dónde alojarlo, el hub podrá contestar «¿qué ha pasado en
Amazon desde la última vez?» sin que nadie descargue un fichero a mano — y, lo
que más urge, podrá **archivar las liquidaciones antes de que Amazon las borre a
los 90 días**, que es el único dato de todo el proyecto que se pierde para
siempre si nadie llega a tiempo.

Hoy no contesta nada todavía: el carril entrega la ingesta **construida y
apagada**. Sin credenciales, sin despliegue, sin tarea programada y sin escribir
nada en Amazon.

## Qué NO hace

- **No se ejecuta.** No hay cron, no hay endpoint, no hay despliegue. `montar()`
  es lo único que enciende algo y falla si le falta una variable de entorno.
- **No trae ningún adaptador de almacenamiento real.** Solo la interfaz y uno en
  memoria para las pruebas. Escribir el de Supabase o el de Vercel antes de que
  Juancho decida es trabajo que se tira y, peor, ata la decisión.
- **No usa una carpeta `api/`.** Vercel la convertiría en funciones serverless
  en el siguiente despliegue y este proyecto se sirve como HTML estático.
- **No toca `src/`.** Ni una línea. El validador *lee* `src/12-datos.js`, no lo
  modifica.
- **No pide el informe de IVA ni el de términos de búsqueda.** El primero es
  restringido (lleva PII y exige RDT); el segundo no está en SP-API. Ver abajo.
- **No escribe en Amazon.** Todas las llamadas son de lectura. `createReport` es
  un POST, pero lo que crea es un informe para nosotros: no toca catálogo, ni
  precios, ni pedidos.

## Lo que la documentación oficial CONFIRMÓ y lo que DESMINTIÓ

Los cinco puntos del encargo, verificados uno a uno contra la documentación
vigente el **17 de septiembre de 2026**. Cada uno está citado también en el
comentario del módulo que lo implementa.

| Punto del encargo | Veredicto | Lo que dice la fuente |
|---|---|---|
| La URL de descarga caduca a los 5 minutos | **Confirmado**, literal | «A presigned URL for the report document. […] This URL expires after 5 minutes.» — modelo oficial `reports_2021-06-30.json`, definición `ReportDocument` ([amzn/selling-partner-api-models](https://github.com/amzn/selling-partner-api-models/blob/main/models/reports-api-model/reports_2021-06-30.json)) y [Retrieve a report](https://developer-docs.amazon.com/sp-api/docs/retrieve-a-report) |
| Un informe sin datos vuelve `CANCELLED`, y no es un error ni se reintenta | **Confirmado y ampliado** | El enum dice dos causas: «an explicit cancellation request before the report starts processing, or an automatic cancellation if there is no data to return». Pero las [preguntas frecuentes](https://developer-docs.amazon.com/sp-api/docs/reports-faq) dan **tres**: «The report was manually cancelled […] No data can be found for the report. You can request some reports (for example, FBA reports) only once within a specified time period.» **Eso cambia el diseño**: `CANCELLED` NO significa «no hay datos», así que tampoco se puede archivar un cero |
| La vista previa de tarifas, una vez al día | **Confirmado**, y con una condición que no estaba en el encargo | «This report can only be requested once per day per seller» y «To successfully generate a report, specify the `dataStartTime` parameter for a minimum 72 hours prior to NOW» — [Report Type Values (FBA)](https://developer-docs.amazon.com/sp-api/docs/report-type-values-fba) |
| Las liquidaciones se listan y se archivan, no se piden, y solo 90 días atrás | **Confirmado**, en dos sitios distintos | «Settlement reports cannot be requested or scheduled. They are automatically scheduled by Amazon. You can search for these reports using the `getReports` operation» ([Settlement Reports](https://developer-docs.amazon.com/sp-api/docs/report-type-values-settlement)); y en `getReports`, parámetro `createdSince`: «The default is 90 days ago. **Reports are retained for a maximum of 90 days**» |
| Reintentos con espera ante límite de ritmo | **Confirmado a medias — y el matiz importa** | «A 429 is a retry-able status code […] repeated throttled requests require a back-off strategy». Pero la cabecera que dice cuánto esperar **no está garantizada justo en el 429**: «The `x-amzn-RateLimit-Limit` response header is for HTTP status codes 20x, 400 and 404» ([Usage Plans and Rate Limits](https://developer-docs.amazon.com/sp-api/docs/usage-plans-and-rate-limits)). Un cliente que espere a esa cabecera para reintentar no reintenta nunca: aquí se usa **si viene**, y si no, exponencial |

Y tres cosas más que no estaban en el encargo y han cambiado el resultado:

1. **`nextToken` va solo.** «Specifying `nextToken` with any other parameters
   will cause the request to fail.» Una paginación que arrastre los filtros
   falla en la página 2 — y si alguien se traga ese error, se archiva la primera
   página de liquidaciones y se cree completa.
2. **El informe de IVA es restringido.** `GET_VAT_TRANSACTION_DATA` está marcado
   «This is a restricted report type» y exige RDT
   ([Tax Reports](https://developer-docs.amazon.com/sp-api/docs/report-type-values-tax)).
   **No tiene variante sin restricción**, así que la regla del carril lo deja
   fuera: se sigue arrastrando a mano.
3. **El informe de términos de búsqueda no existe en SP-API.** Es de la Amazon
   Ads API. Lo más parecido, `GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT`, exige
   Brand Registry y **no trae el gasto de las campañas propias**, que es justo lo
   que calcula `adStats`. Prometerlo aquí habría sido prometer un dato que esta
   API no da.

**Desmentido de paso:** SP-API ya no exige firma AWS Signature V4 ni credenciales
de IAM. En `servidor/` no hay ninguna, y no es un olvido.

## Solo variantes no restringidas

| Informe del hub | `reportType` elegido | Variante descartada, y por qué |
|---|---|---|
| `orders` | `GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL` | `GET_ORDER_REPORT_DATA_SHIPPING` / `_INVOICING` / `_TAX` y `GET_FLAT_FILE_ORDER_REPORT_DATA_SHIPPING`: restringidas, llevan la dirección del comprador. La `_GENERAL` trae unidades, importe, impuesto, país y divisa, que es todo lo que el hub calcula |
| `orders` | `BY_ORDER_DATE`, no `BY_LAST_UPDATE` | `BY_LAST_UPDATE_GENERAL` recogería el mismo pedido otra vez al cambiar de estado, y duplicaría ventas |
| `vat` | **ninguno** | `GET_VAT_TRANSACTION_DATA` es restringido y no tiene pareja sin PII |
| `settlement` | `GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2` | Los `_FLAT_FILE` y `_XML` sin `_V2` están marcados obsoletos |

Los ocho restantes (`inventory`, `multicountry`, `fees`, `returns`, `ledger`,
`storage`, `planning`, `reimb`) no tienen variante restringida.

## La revisión adversarial · qué respuesta de Amazon haría archivar un hueco

La pregunta era cuál es el fallo más caro, y la respuesta es siempre la misma
forma: **una respuesta que se parece a «no hay nada» sin serlo**. Cinco, y su
freno:

1. **`CANCELLED` leído como «no hay datos».** Es el más caro de todos porque es
   el que parece correcto. Si la vista previa de tarifas se pide dos veces el
   mismo día, la segunda vuelve `CANCELLED` — y archivarlo como «este SKU no
   tiene tarifas» pone a cero un coste real. *Freno:* estado propio `CANCELADO`,
   sin documento y sin cobertura; y el límite diario se comprueba **antes** de
   gastarlo, mirando si ya se pidió hoy.
2. **Columnas cambiadas.** Amazon avisa de que los informes de la API «do not
   contain the same attributes or data». Sin validar, el importador no encuentra
   el alias, deja el campo sin mapear y calcula con ceros: ya pasó en este
   proyecto con la tarifa de logística. *Freno:* `RECHAZADO_COLUMNAS`, y el
   documento se guarda aparte para poder mirarlo, fuera del camino del hub.
3. **Cero filas dadas por buenas.** Cabecera correcta y ninguna fila puede ser un
   mes sin devoluciones o una descarga cortada, y **desde el servidor no se
   distingue**. *Freno:* estado `ARCHIVADO_SIN_FILAS`, que no cuenta como periodo
   cubierto.
4. **Una descarga cortada.** Un corte de conexión da un fichero **más corto**, no
   un error: se leería como un informe con menos filas y esas filas no se echan
   de menos en ningún sitio. *Frenos:* se compara el tamaño con el `Content-Length`
   declarado, y un GZIP truncado **falla** en vez de descomprimirse «como se
   pueda». `DONE` sin `reportDocumentId` tampoco se toma por vacío.
5. **La primera página de liquidaciones tomada por la lista entera.** Éste no se
   arregla después: a los 90 días, lo que no se archivó ya no está.
   *Frenos:* se recorren **todas** las páginas (`nextToken` solo); se pide
   siempre la ventana **entera** de 90 días y no «desde la última vez», porque un
   informe puede aparecer en la lista más tarde de lo que se creó; `completo`
   solo es cierto si no ha fallado **ninguna** descarga; y si el último archivo
   es de hace más de 90 días, se avisa por escrito de que ese hueco es
   irrecuperable.

## Opciones de alojamiento · coste y consecuencias

Nada del código depende de esto: la ingesta habla con una interfaz de seis
métodos y con nada más. Precios consultados el **17 de septiembre de 2026**, en
dólares y sin impuestos.

### A · Vercel Pro — **$20/mes** (cuota de plataforma, incluye 1 asiento y $20 de crédito de uso)

- **A favor:** el hub ya se despliega en Vercel. Cron con precisión de minuto y
  hasta 100 tareas por proyecto.
- **En contra, y es serio:** un cron de Vercel **invoca una función**, así que
  obliga a crear la carpeta `api/` — exactamente lo que este proyecto evita
  porque se sirve como HTML estático. El día que exista `api/`, el despliegue deja
  de ser puramente estático.
- **El plan gratuito no vale:** Hobby permite cron **una vez al día** y con
  precisión de hora («±59 min»), pero además «the Hobby plan restricts users to
  non-commercial, personal use only». Aresstore es un negocio.
- **Y falta el almacén:** Vercel Blob se cobra aparte del crédito de $20.

### B · Supabase — **$0** (Free) o **$25/mes** (Pro)

- **Free:** 500 MB de base de datos, 1 GB de ficheros. **«Free projects are
  paused after 1 week of inactivity»**: un proyecto pausado es una ventana de 90
  días corriendo en silencio. Sirve para probar, no para esto.
- **Pro:** 8 GB de disco por proyecto y 100 GB de ficheros — de sobra para años
  de informes de Amazon.
- **A favor:** es la única opción que trae **base de datos de verdad**, que es
  lo que quiere el registro de ingestas (qué se archivó, cuándo, con qué huella),
  y `pg_cron` programa desde dentro. El hub sigue siendo estático en Vercel y esto
  vive aparte.
- **En contra:** un proveedor más que mantener, y las Edge Functions corren en
  Deno: estos módulos son CommonJS y necesitan una envoltura ESM. Es un rato, no
  un rediseño.

### C · GitHub Actions programado — **$0** para este repositorio

- «GitHub Actions usage is free for […] public repositories that use standard
  GitHub-hosted runners», y este repositorio es público. Intervalo mínimo, 5
  minutos.
- **En contra, y es el que descalifica:** «In a public repository, scheduled
  workflows are automatically disabled when **no repository activity has occurred
  in 60 days**». Un verano tranquilo sin commits apaga la tarea sin avisar, y
  cuando alguien se dé cuenta, 60 de los 90 días de liquidaciones se han ido.
- **Además:** los datos **no pueden** guardarse en este repositorio, que es
  público. Harían falta un repositorio privado o un almacén aparte, y con
  repositorio privado el plan Free da 2.000 minutos al mes.

### Lo que yo pondría sobre la mesa

**B con el plan Pro, $25/mes**, si esto tiene que sostener la ventana de 90 días
sin que nadie la vigile: es el único de los tres cuyo modo de fallo no es
silencioso, y el único que trae dónde guardar el registro. **A** cuesta $5 menos
pero obliga a `api/` y deja el almacén sin resolver. **C** es gratis y se apaga
solo a los 60 días, que es justo lo que este carril existe para evitar.

Decisión de Juancho. El código no cambia con ninguna de las tres.

## Pruebas, y en qué dirección se vieron fallar

`tests/spapi.test.js` · **64 comprobaciones**, sin red (todo el `fetch` está
simulado) y sin esperas reales (`dormir` se inyecta y solo apunta cuánto se
habría esperado). Tarda décimas de segundo.

Cada línea de esta tabla se ha visto **roja quitando el arreglo**, y el mensaje
es el que imprimió la suite. Ninguna falla con un stack.

| Prueba | Qué demuestra | Mensaje en rojo, sin el arreglo |
|---|---|---|
| CANCELLED devuelve estado CANCELADO | Que un informe sin datos no se toma por un informe vacío | `FALLO CANCELLED devuelve estado CANCELADO en vez de lanzar → LISTO` |
| CANCELLED no guarda documento | Que un cero no llega al almacén | `FALLO un CANCELLED no guarda ningún documento → RECHAZADO_COLUMNAS · 1 documentos` |
| La URL caducada no se intenta | Que a los 6 minutos no se gasta una descarga muerta | `FALLO pasados 6 minutos no se intenta la descarga siquiera → no ha fallado` |
| El 403 pide URL nueva | Que se repite `getReportDocument`, no la descarga | `FALLO ante un 403 de la URL caducada se pide una URL NUEVA y se descarga → ha lanzado DESCARGA_FALLIDA en vez de pedir otra URL` |
| La espera respeta la cabecera de ritmo | Que 0,5 req/s son 2.000 ms de espera | `FALLO la espera respeta la cabecera de ritmo: 0,5 req/s son 2000 ms → [500]` |
| Un 400 no se reintenta | Que solo se reintenta lo reintentable | `FALLO un 400 NO se reintenta: reintentarlo es un bucle que no arregla nada → 400 · 3 esperas` |
| El validador declara la columna que no casa | Que `units-shipped` en vez de `quantity-shipped` se detecta | `FALLO una cabecera que no casa se DECLARA, no se calla → _qty` |
| El informe con columna mala se rechaza | Que no se archiva un informe que daría ceros | `FALLO un informe con una columna obligatoria que no casa se RECHAZA → ARCHIVADO` |
| Tamaño declarado vs recibido | Que una descarga cortada se ve | `FALLO una descarga más corta de lo declarado se detecta, no se archiva a medias → no ha fallado` |
| GZIP cortado | Que no se descomprime «como se pueda» | `FALLO un GZIP cortado por la mitad NO se lee «como se pueda»: falla → no ha fallado` |
| DONE sin documento | Que una respuesta rara no es un informe vacío | `FALLO DONE sin reportDocumentId no se toma por «informe vacío» → no ha fallado` |
| Cero filas | Que no cuenta como periodo cubierto | `FALLO cabeceras sin ninguna fila NO se archivan como periodo cubierto → ARCHIVADO` |
| Una vez al día | Que la segunda petición del día no se gasta | `FALLO la segunda del mismo día NO se pide: se omite con motivo → ARCHIVADO` |
| Paginación con `nextToken` solo | Que la página 2 no se pierde | `FALLO se recorren TODAS las páginas: 3 liquidaciones en 2 páginas → 0 en 0 páginas` |
| `completo` mira las fallidas | Que una descarga fallida impide decir «completo» | `FALLO si falla UNA descarga, el resumen NO dice «completo» → 2 archivadas · 1 fallidas · completo=true` |
| Aviso de los 90 días | Que un hueco irrecuperable se dice | `FALLO 120 días sin archivar se avisan como pérdida irrecuperable → sin aviso` |
| Informe restringido frenado | Que el informe de IVA no se pide nunca | `FALLO pedir el informe de IVA (restringido, RDT) se niega con motivo → no se ha negado` |
| Almacén incompleto | Que un adaptador a medias se ve al arrancar | `FALLO un adaptador incompleto se detecta al arrancar, no al primer fallo → no ha fallado` |
| Sin credenciales no arranca | Que no hay valores por defecto inventados | `FALLO sin variables de entorno no arranca, y dice CUÁLES faltan → ha arrancado sin credenciales` |

`npm run test:all`: **17 suites · 526 comprobaciones OK · 0 FALLO**. Las 16
suites anteriores siguen en verde con sus 462 comprobaciones; las 64 nuevas son
las de este carril.

## Costuras que pide a otros carriles

| Marca en el código | Carril destino | Qué hay que unificar al integrar |
|---|---|---|
| `// COSTURA → carril 1` en `servidor/informes.js` (`decodificar`) | 1 · Importador | La detección de codificación (UTF-16 con marca de orden de bytes, Latin-1) está dos veces: en `readSmart`, que recibe un `File` del navegador, y aquí, que recibe bytes. Una sola función que tome bytes |
| `// COSTURA → carril 1` en `servidor/validador.js` (cabecera del módulo) | 1 · Importador | `REPORTS` vive en un fichero de navegador sin exportaciones y aquí se extrae el literal del array. Si `12-datos.js` exportara `REPORTS` al correr en Node, esta extracción sobra |

Ninguna de las dos toca `src/`. Este carril no ha modificado ni una línea de
código existente.

## Dependencias nuevas

**Ninguna.** El proyecto sigue sin una sola dependencia de producción y
`package.json` no se ha tocado. Todo lo que hace falta lo trae Node: `fetch`
(nativo desde Node 18), `zlib` para GZIP, `crypto` para la huella y `vm` para
leer `REPORTS`. `tests/run-all.js` descubre `spapi.test.js` solo.

## Qué queda por medir

| Sin resolver | Qué desbloquea |
|---|---|
| **Dónde se aloja.** Las tres opciones están arriba con su coste | El adaptador de almacenamiento real y la tarea programada. Hasta entonces, solo el de memoria |
| **Ninguna llamada real a Amazon.** No hay credenciales y no se ha pedido ni un informe de verdad | Confirmar que las cabeceras que sirve la API son las que declara `REPORTS`. El validador está hecho justamente porque **no lo sabemos**: Amazon dice por escrito que los informes de la API pueden traer otros atributos. La primera ejecución real dirá cuáles, y saldrá como `RECHAZADO_COLUMNAS` en vez de como ceros |
| **Cuántos días caben en `orders`.** Se pide una ventana de 30 días por defecto; si Amazon la limita, se verá al primer intento real | Ajustar la ventana y el troceado |
| **Cuántas liquidaciones hay ahora mismo dentro de los 90 días** | Saber cuánto se ha perdido ya. Es lo primero que habría que mirar el día que esto se encienda |
| **La autorización del vendedor.** La aplicación tiene que estar dada de alta en Seller Central y autorizada | Todo lo demás |

### Medido contra ficheros reales

**Nada.** Este carril no ha tocado ningún fichero real de Amazon: no tenía
ninguno y no le hacía falta. Los informes de las pruebas están **sintetizados** a
partir de las cabeceras que declara `REPORTS`, con dos filas inventadas y sin una
sola columna de comprador. Los números que aparecen en la suite (2 filas, 3
liquidaciones, 2 páginas) son de fixture y se dicen como tales.
