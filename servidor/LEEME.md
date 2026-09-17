# `servidor/` · ingesta automática por SP-API, construida y apagada

Este directorio prepara la ingesta automática de los informes de Amazon por
SP-API. **No se ejecuta solo, no está desplegado y no hay credenciales en
ninguna parte del repositorio.** Hoy el hub sigue alimentándose de ficheros que
una persona descarga a mano de Seller Central; esto es lo que permitirá dejar de
hacerlo el día que se decida dónde alojarlo.

El razonamiento entero, las fuentes de cada decisión y las opciones de
alojamiento con su coste están en **`docs/carriles/9-spapi.md`**.

## Por qué NO se llama `api/`

Vercel convierte una carpeta `api/` en funciones serverless en el siguiente
despliegue. Este proyecto se sirve como HTML estático (`vercel.json`:
`outputDirectory: "."`, sin compilación). Una carpeta con el nombre equivocado
habría cambiado cómo se sirve la aplicación entera sin que nadie lo pidiera.

## Los módulos

| Fichero | Qué hace |
|---|---|
| `entorno.js` | Los **nombres** de las variables de entorno, las regiones y las tiendas. Y `tapar()`, que impide escribir una ficha en el registro. |
| `reintentos.js` | Espera exponencial con azar, y la cabecera `x-amzn-RateLimit-Limit` cuando viene. |
| `lwa.js` | La ficha de acceso de Login with Amazon, con caché y renovación. |
| `cliente.js` | Una llamada a SP-API: cabecera `x-amz-access-token`, errores tipados, reintentos. |
| `informes.js` | `createReport` → `getReport` → `getReportDocument`, descarga, GZIP, y `getReports` paginado. |
| `catalogo.js` | Qué informe del hub pide qué `reportType`, y cuál se descarta por llevar datos de comprador. |
| `validador.js` | Compara las cabeceras recibidas con los alias de `REPORTS` (`src/12-datos.js`) y declara qué no casa. |
| `almacen.js` | La interfaz de almacenamiento (seis métodos) y el adaptador **en memoria**. Ningún adaptador real. |
| `ingesta.js` | La orquestación: qué se archiva, qué se rechaza y qué no se archiva nunca. |
| `index.js` | `montar(env)`, que es lo único que enciende algo. |

## Variables de entorno

Solo los **nombres**. Los valores viven en el entorno de ejecución del
alojamiento que se elija, nunca en un fichero de este repositorio, que es
público.

| Nombre | Para qué |
|---|---|
| `SPAPI_LWA_CLIENT_ID` | Identificador de la aplicación en Login with Amazon. |
| `SPAPI_LWA_CLIENT_SECRET` | Clave de la aplicación en LWA. |
| `SPAPI_LWA_REFRESH_TOKEN` | Ficha de renovación que otorga el vendedor al autorizar. |
| `SPAPI_REGION` | `eu`, `na` o `fe`. Para Aresstore, `eu`. |
| `SPAPI_MARKETPLACE_IDS` | Identificadores de tienda separados por comas. |

Sin las tres primeras, `montar()` no arranca y dice **cuáles** faltan. Es a
propósito: un fallo de configuración tiene que leerse como un fallo de
configuración, no como un 403 de Amazon a las tres de la mañana.

## Pruebas

```
node tests/spapi.test.js      # 64 comprobaciones, sin red y sin esperas reales
npm run test:all              # las 17 suites
```

Todo el `fetch` está simulado y `dormir` se inyecta: la suite tarda décimas de
segundo y no sale a internet.
