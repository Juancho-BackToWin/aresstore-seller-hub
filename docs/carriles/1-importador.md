# Carril 1 · Importador

Rama `carril/1-importador` · desde `base/2026-09` · PR en borrador contra la base.

## Qué pregunta responde

**¿Cuántas ventas hay de verdad en los informes que he descargado, y cuáles de
esos números están medidos y cuáles se los está inventando el hub?**

Antes, si Amazon partía un informe en tres ficheros —lo hace en cuanto pides un
rango largo— el hub se quedaba con el último y enseñaba «✓ reconocido». Ahora los
ficheros de un mismo informe se fusionan, cada uno declara cuántas filas trajo de
nuevas y cuántas ya estaban, se puede quitar uno concreto, y volver a soltar el
mismo fichero no mueve ningún número.

Y donde el hub no puede saber algo, lo dice en vez de rellenarlo: un informe con
las cabeceras en un idioma que no reconoce ya no entra en silencio, un informe de
tarifas sin columna de precio ya no pasa por «comisión medida», y `countryOf`
devuelve «no lo sé» en vez de acertar por casualidad.

## Qué NO hace

- **No lee `.xlsx`.** Se sigue rechazando, y a propósito: el libro que exporta el
  gestor de campañas declara en su cabecera un rango de una sola celda teniendo
  más de mil filas, así que un lector que se fiara de ese dato importaría una
  celda y no daría ningún error. Lo que ha cambiado es el mensaje: ahora dice
  dónde pedir el CSV y cómo convertirlo si solo se tiene el libro.
- **No toca `vatReport()`, `iso()`, `stockCruce()`, `captureStock()`, `go()`,
  `refreshAll()` ni `loadDemo()`**, que están congeladas. Donde el IVA salía mal
  no se ha cambiado el cálculo: se le ha dado **la columna correcta**, que era lo
  que estaba mal (ver «La jurisdicción», abajo).
- **No decide por el usuario cuando no puede saberlo.** Un informe cuyo importe o
  cuya cantidad se han elegido solo por la forma del contenido se PARA y se pide
  confirmación. Es más fricción, a cambio de no cruzar columnas.
- **No fusiona por clave cuando la clave no identifica nada.** Si el
  identificador de línea viene vacío o a cero, esa fila se identifica por su
  contenido entero y se cuenta aparte. Deduplicar por una clave degenerada
  fusiona pedidos distintos y el total baja sin que nadie lo vea.
- **No inventa el país.** `countryOf('United Kingdom')` ahora es `null`, no `IT`.
  Añadir esos mercados es de quien tenga `MKT_MAP`, no de este carril.
- **No cambia el histórico.** `captureHistory()` sigue recibiendo lo que se ha
  guardado; lo único que cambia es que ahora recibe el recuento FUSIONADO.

## Cómo funciona, en tres piezas

1. **Identidad de fila.** Se calcula sobre la fila ya parseada, nunca sobre el
   texto crudo. Es lo que hace que un fichero con marca de orden de bytes y otro
   sin ella se reconozcan como el mismo informe: `normHdr` se come el BOM al
   normalizar la cabecera, así que las dos filas producen las mismas claves y la
   misma huella. Comparando texto crudo, la primera columna de uno de los dos no
   casaría nunca y todas sus filas entrarían por duplicado.
2. **Clave de fusión por informe** (`IMP_CLAVES`), con la regla de que un valor
   degenerado —vacío, `0`, `--`, `N/A`— no vale como clave. A igualdad de clave
   con contenido distinto, gana la fecha de última actualización, y la perdedora
   se conserva para poder quitar un fichero sin perder información.
3. **Preproceso declarado.** El preámbulo anterior a la cabecera se busca —no se
   supone un número de líneas— y se recorta con `registrarPreproceso`, que deja
   una nota visible en Datos: *«me he saltado N líneas de preámbulo antes de la
   cabecera»*. Un fichero al que se le han quitado líneas por el camino sin
   decirlo es un número sin trazabilidad.

### La jurisdicción, que es donde estaba el dinero

El informe de IVA trae DOS columnas de país: `TAXABLE_JURISDICTION`, con el
nombre en inglés, y `SALE_ARRIVAL_COUNTRY`, con el código ISO. `vatReport()` se
queda con las dos primeras letras de lo que recibe. Con la columna del nombre
delante, España era «SP», Alemania «GE», Austria «AU» y **Portugal y Polonia las
dos «PO»**: ninguno de esos códigos está en `VAT_GENERAL`, así que el detector de
tipo reducido no comparaba nada en esos países y la diferencia se quedaba a cero
sin un solo aviso — y «PO» además sumaba dos países distintos en el mismo cajón.
Se ha reordenado el alias `_juris` para que el código ISO vaya primero. La
función congelada no se ha tocado.

## Pruebas, y en qué dirección se vieron fallar

`tests/importador.test.js` · 59 comprobaciones · fixtures en
`tests/fixtures-importador/`, generadas por `tests/mkfixtures-importador.js` con
el formato literal de cada fichero (BOM sí/no, CRLF/LF, con y sin salto final,
`\t` y `;`, coma decimal, espacios al final de la cabecera).

**Toda la suite se ha ejecutado contra el árbol sin los arreglos: 39
comprobaciones rojas, cada una con un mensaje que dice qué falta, y la suite
llega hasta el final en vez de abortar con un stack.**

| Prueba | Qué demuestra | Mensaje en rojo, sin el arreglo |
|---|---|---|
| IMP-A · dos trozos de pedidos | dos ficheros del mismo informe se fusionan, no se pisan | `0 fichero(s) registrado(s) · sin la fusión el segundo borra al primero y quedan 4 filas` · `4 filas · esperadas 6` |
| IMP-A · reparto por fichero | cada fichero declara lo que aportó | `solo hay 0 aportación(es): el segundo fichero ha borrado al primero` |
| IMP-B · clave «0» | dos líneas con identificador `0` son dos pedidos, no uno | `1 fila(s) · 1 pedido(s) distinto(s) · fundirlas se come una venta real` |
| IMP-B · se declara | el hub dice cuántas claves venían degeneradas | `undefined declaradas · esperadas 2` |
| IMP-C · gana la más reciente | con la misma clave manda `last-updated-date` | (verde también sin el arreglo: el informe solo tenía un fichero) |
| IMP-D · sin salto final | la última línea de un fichero que no acaba en `\n` entra igual | (verde también sin el arreglo) |
| IMP-E · BOM | un fichero con BOM y otro sin él no duplican filas | `4 filas · con el BOM rompiendo la primera columna saldrían 8` |
| IMP-F · reimportar | volver a soltar el mismo fichero no cambia nada y se dice | `Todos los pedidos · reconocido por cabeceras en inglés · histórico: 1 día` (fingía haber importado) |
| IMP-G · quitar un fichero | se quitan solo sus filas | `no existe quitarFicheroImportado(): no se puede quitar un fichero suelto` |
| IMP-H · devoluciones | 5 líneas en dos ficheros dejan 4 matrículas | `3 · esperadas 4` · `LPN-B,LPN-C,LPN-D` (faltaban las del primer fichero) |
| IMP-I · IVA fusionado | 7 líneas dejan 5 transacciones y `vatReport()` las ve | `null` (no había recuento de fusión) |
| IMP-I · la jurisdicción | los países son ES/IT/PL/PT y la diferencia sale 43,00 € | `IT,PO,SP · con TAXABLE_JURISDICTION salen SP/IT/PO y PO tapa a dos países distintos` · `0 € · sin el código ISO no hay tipo general con el que comparar y el detector se queda mudo` |
| IMP-J · preámbulo | se salta el preámbulo y se DECLARA cuántas líneas | `[]` (ninguna nota) · `Archivo desalineado: 4 de 10 filas no tienen las mismas celdas que la cabecera` |
| IMP-J · en pantalla | la nota sale en Datos, no solo en la consola | `(no existe el panel de ficheros en Datos)` |
| IMP-K · `;` y coma decimal | 1,50 + 2,25 + 1.234,56 = 1.238,31 € | (verde también sin el arreglo: ya se leía bien) |
| IMP-K · espacio final | un alias `^…$` sigue casando con `sku ` | (verde también sin el arreglo: `normHdr` ya recortaba) |
| IMP-L · cabeceras en italiano | no entra en verde y se dice QUÉ columna no se entiende | `ok · 8 filas importadas` — y con el importe leído de `spese-di-spedizione` |
| IMP-L2 · ya confirmado | con la asignación guardada no se vuelve a preguntar | `0 filas · Todos los pedidos, pero no me fío de 2 columnas…` (regresión de este mismo carril) |
| IMP-M · tarifas sin precio | no se da por bueno en verde y se dice que la comisión no está medida | `ok · un ✓ aquí es la comisión al 15 % disfrazada de medida` |
| IMP-N · tarifa a 0,00 | se avisa de las filas con la tarifa de logística a cero literal | `Vista previa de tarifas… · tarifas de 3 SKU` (sin aviso ninguno) |
| IMP-O · `.xlsx` | el rechazo explica dónde pedir el CSV y cómo convertirlo | `Excel no soportado. Descarga el informe en .txt o .csv desde Amazon.` |
| IMP-P · `countryOf` | «United Kingdom» no es Italia | `IT · «unITed» llevaba dentro la clave «it»` · `DE · «DEnmark»…` · `ES · «EStonia»…` |
| IMP-Q · API | `imp(id)` sigue devolviendo las filas fusionadas | `{"esArray":true,"n":4,…}` (solo el último fichero) |
| IMP-R · base antigua | una base guardada con la forma vieja se migra sola | `el informe no guarda de qué fichero viene cada fila` |
| IMP-S · pantalla vacía | Datos sin nada cargado no enseña una tabla de nada, y cero errores de JS | — |

`npm run test:all`: **17 suites · 520 comprobaciones OK · 0 FALLO**. La base
estaba en 16 suites / 462. El recuento de `es.test.js` baja de 11 a 10 porque su
comprobación condicional *«y las cifras cuadran con la referencia»* solo se
ejecuta si el fichero hostil se importa solo; ahora se ofrece el asignador, que
es la otra rama que esa misma suite acepta por escrito (`h[0].ok || h[0].btn`).

## Costuras que pide a otros carriles

| Marca en el código | Carril destino | Qué hay que unificar al integrar |
|---|---|---|
| `// COSTURA → carril de integración` en `src/20-importador.js` §6 | integración | `handleFiles` no es de ningún carril y el mensaje de `.xlsx` vive dentro. Se ha **envuelto**, no editado: la envoltura aparta los libros de Excel y pasa el resto intacto a la función original. Al integrar, o se mueve el bloque dentro de `handleFiles` o se deja la envoltura; las dos cosas a la vez duplicarían el mensaje. |
| `renderDatosFicheros()` en `src/20-importador.js` §8, llamada desde `renderDatos` | quien tenga `src/02-views.html` | El panel «Qué fichero ha traído cada fila» se crea desde el render porque `02-views.html` lo comparten los diez carriles. Si algún día se le da un hueco fijo en la vista, basta con dejar un `<div id="impFicheros">` dentro del panel de «Datos cargados» y esta función lo reutiliza. |
| `impAvisos()` para la tarifa de logística a `0,00` | carril 5 · rentabilidad | El aviso se da **al importar**. Quien consume el dato es `pnl()`: `hayNumero("0.00")` es verdadero, así que un cero literal pasa por medido y luego el cálculo lo descarta igualmente por no ser `> 0` y usa la tarifa por defecto del producto — sin contarlo en `feeSinFba`. Lo suyo es que `feeSinFba` cuente también los ceros literales. No se toca desde aquí porque `pnl()` es del carril 5. |
| `_price` ausente en el informe de tarifas | carril 5 · rentabilidad | Mismo caso: aquí se avisa; allí, `refPctOf()` se cae al 15 % y el margen sale con etiqueta de estimado. Convendría que `pnl()` declarara «comisión no medida» cuando el informe de tarifas está cargado pero sin precio. |
| Mercados fuera de `MKT_MAP` | carril 8 · cumplimiento | `countryOf` ya no acierta por casualidad, así que Reino Unido, Dinamarca, Estonia y compañía devuelven `null` en vez de un país equivocado. Si el negocio vende allí, las entradas se AÑADEN a `MKT_MAP`, que es del carril 8. |

## Qué queda por medir

- **Por qué casi todas las ventas del informe de IVA llevan un tipo reducido.**
  Medido sobre el fichero real (cifras en el informe al orquestador, no aquí):
  el tipo aplicado está sistemáticamente por debajo del general del país, con
  `TAX_REPORTING_SCHEME` en `REGULAR` y `UNION-OSS` y
  `TAX_COLLECTION_RESPONSIBILITY` en `SELLER`. O el catálogo está clasificado en
  una categoría reducida que no le toca, o hay una exención que hay que
  documentar. El detector está haciendo su trabajo; lo que falta es la decisión
  fiscal, y esa es de Juancho. Desbloquea saber si la diferencia es una deuda.
- **El informe de transacciones personalizadas** (27 columnas, preámbulo de 7
  líneas) se lee bien y ya no se rechaza como desalineado, pero **no es ninguno
  de los doce informes del catálogo**: se ofrece el asignador manual. Decidir si
  merece una definición propia en `REPORTS` es del carril 3.
- **El informe de listings activos** tampoco tiene definición propia. Con la
  guarda nueva ya no entra disfrazado de inventario; sin ella se importaba en
  verde con la cantidad leída de la columna de *tipo de identificador*.
- **Cuánto ocupa la fusión en el almacenamiento del navegador.** Se guardan las
  filas fusionadas más las que perdieron un empate de clave con contenido
  distinto. En las fixtures no llega a una fila; en un informe de varios miles
  habría que mirarlo contra el límite de 5 MB que ya vigila el histórico.

### Medido contra ficheros reales

> **Las cifras reales no van aquí.** Este fichero está en el repositorio, y el
> repositorio es público. Lo medido sobre los ficheros de `/root/aresstore-reales/`
> —recuentos antes y después de fusionar de pedidos, devoluciones e IVA, y lo que
> da `vatReport()` con ellos— se ha entregado al orquestador en el informe final
> de este carril.

Lo que sí se puede decir aquí, porque es una conclusión y no una cifra del
negocio: **el objetivo heredado de filas únicas de pedidos estaba mal**, y estaba
mal precisamente por deduplicar por `order-item-id` sin mirar el valor. Las
líneas que Amazon exporta con ese campo a `0` no son la misma línea repetida:
son pedidos distintos, cada uno con su `amazon-order-id`. Fundirlas da un número
más bajo, redondo y creíble. Es exactamente el fallo que este proyecto existe
para no cometer, y la cifra heredada era su resultado.
