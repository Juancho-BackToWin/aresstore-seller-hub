# Carril 4 · Publicidad

Rama `carril/4-publicidad` · desde `base/2026-09` · PR en borrador contra la base.

## Qué pregunta responde

**Cuánto me ha costado la publicidad en el periodo que estoy mirando, y hasta qué
ACOS me sale a cuenta cada término.** Antes el hub no sabía ninguna de las dos
cosas: el gasto de publicidad salía casi igual mirando siete días que mirando un
año, y la única recomendación que daba —«negativizar»— no miraba el margen del
producto que había detrás del término.

Lo que el hub sabe ahora y antes no:

- **El gasto fechado fila a fila.** El informe de términos de búsqueda trae
  `Fecha de inicio` y `Fecha de finalización` por fila, y no todas las filas son
  de un día: muchas son agregados de un tramo. Cada fila se reparte entre sus
  días naturales y se corta con el periodo elegido.
- **Que ese reparto es una suposición.** Se dice en la pantalla, en el veredicto
  y en la propia fila de la tabla. Un prorrateo presentado como medición es el
  número creíble y falso que este proyecto prohíbe.
- **El ACOS de equilibrio por término**, con el margen real del SKU sacado de
  `skuStats()` (solo lectura), más la **puja de equilibrio** con la conversión
  observada del término, y **ACOS y TACOS separando lo pagado de lo orgánico**.
- **Cuándo se cambió cada puja**, con la **regla de las 72 horas**: si se anota
  un cambio antes de tres días del anterior, el hub avisa de que lo que se mida
  hasta entonces es ruido.

## Qué NO hace

- **No automatiza pujas ni escribe nada en Amazon.** No hay `fetch`, ni XHR, ni
  credenciales: `PUB-M` lo comprueba sobre el código fuente del módulo, no sobre
  lo que diga la pantalla. El hub recomienda; decide una persona, y lo anota.
- **No inventa el casamiento término → SKU.** El informe no trae SKU. Si el
  nombre de la campaña no lleva el código del SKU ni una palabra que apunte a un
  único producto, la fila dice «sin casar» y se queda **sin** ACOS de equilibrio
  y **sin** puja de equilibrio. Un umbral calculado con el margen del producto
  equivocado es exactamente lo que hace bajar una puja rentable.
- **No suma divisas.** Las filas cuya columna «Divisa» no es la divisa declarada
  del hub se quedan fuera de todas las cifras, y se dice cuántas y cuáles: un
  gasto en libras metido en un total en euros sube el ACOS de esos términos sin
  tocar sus ventas, que es otra forma de mandar bajar una puja rentable.
- **No estira un informe más allá de lo que mide.** Los días del periodo que el
  informe no cubre se rellenan al ritmo diario medio, pero como mucho tantos días
  como el propio informe abarca. El resto se declara **sin dato** en pantalla, en
  vez de multiplicar lo que el informe sabe.
- **No toca `pnl()`, `skuStats()` ni `parseDate()`.** Son de otros carriles: se
  leen. Lo que faltaba se ha resuelto en `src/24-publicidad.js` y está apuntado
  abajo como costura.
- **No abre `src/02-views.html`.** Los paneles nuevos de la pantalla de
  Publicidad se insertan por DOM desde el propio módulo.
- **No rechaza el `.xlsx`**: el hub ya lo rechaza y debe seguir haciéndolo. El
  mismo informe en Excel declara `<dimension ref="A1"/>` teniendo 1.223 `<row>`
  y `sharedStrings` con `uniqueCount="0"`: un lector que se fíe de `dimension`
  ve **una celda y no da ningún error**. Ese es el peor fallo posible aquí.

## Qué es de este carril

| Dónde | Qué |
|---|---|
| `src/24-publicidad.js` | módulo nuevo: todo el motor y la pantalla del carril |
| `src/12-datos.js` | la definición `searchterm` (se le añaden `_from` y `_to`) y el cuerpo de `adStats()`, que delega |
| `src/13-render.js` | los cuerpos de `renderPub()` y `exportPublicidad()`, que delegan |
| `tests/publicidad.test.js` · `tests/mkfixtures-publicidad.js` | la suite y su generador de fixtures |

## Pruebas, y en qué dirección se vieron fallar

`node tests/publicidad.test.js` · **61 comprobaciones**. Vistas en las dos
direcciones el 17-09-2026: con el módulo puesto, 61 en verde; retirando
`src/24-publicidad.js` y devolviendo `12-datos.js` y `13-render.js` a `e18ef86`,
**50 en rojo, todas con mensaje** y ninguna con un stack. Las 11 que siguen
verdes sin el arreglo son guardas de lo que ya funcionaba —que el informe se
reconozca, que un informe sin fechas se declare como tal— y están ahí para que
este carril no las rompa.

| Prueba | Qué demuestra | Mensaje en rojo, sin el arreglo |
|---|---|---|
| PUB-B · «ago 20, 2026» es agosto | `parseDate()` da por inválidos `ene`, `abr`, `ago` y `dic`: cuatro meses de doce, y el informe de agosto es uno | `sin el arreglo del carril 4: page.evaluate: ReferenceError: pubFecha is not defined` |
| PUB-C · una fila agregada se reparte y se corta | fila de 10 días con 100,00 € de la que solo 5 caen en el periodo → 50,00 € | `100.00 € · 100,00 × 5/10 = 50,00` |
| PUB-C · días medidos | un día tocado por dos filas cuenta una vez: 20 de 30, no 30 | `undefined días medidos · undefined extrapolados` |
| PUB-D · el gasto depende del periodo | a 7 días entran solo las filas de esa semana: 30,00 € observados | `— €` |
| PUB-D · tope de la extrapolación | un informe de 34 días no habla de 365: el resto, sin dato | `undefined días extrapolados y undefined sin dato` |
| PUB-E · se prorratean también las ventas | si solo se prorratea el gasto, el ACOS del término se dispara y la pantalla manda bajar una puja al 26 % | `40.00 € de gasto · 150.00 € de ventas` (sin recortar) |
| PUB-F · cuatro decimales con coma | `toNum('0,4356')` devuelve 4356: el término de 0,44 € se coloca el primero de la lista de desperdicio | `sin el arreglo del carril 4: page.evaluate: ReferenceError: pubNum is not defined`; y el informe entero declaraba **veintidós veces** su gasto real |
| PUB-G · espacio final en la cabecera | un alias `^…$` aplicado al nombre sin normalizar no casaría nunca y el prorrateo se apagaría en silencio | `spanUnknown=false · rodillo barato = 100.00 €` |
| PUB-I · sin SKU no hay ACOS de equilibrio | casa por código, por nombre, o no casa; con dos candidatos se queda sin veredicto | `sin el arreglo del carril 4: page.evaluate: ReferenceError: pubTerminos is not defined` |
| PUB-I · el margen es del SKU | dos productos con 20 puntos de margen de diferencia dan 20 puntos de ACOS de equilibrio de diferencia; si salieran iguales, el umbral no sería del SKU | ídem |
| PUB-J · el dato de ayer no baja una puja | ACOS del 90 % de ayer → «esperar»; el mismo 90 % de hace dos semanas → «bajar puja» | ídem |
| PUB-J · tres clics no demuestran nada | 3 clics sin venta → «esperar»; 60 clics sin venta y por encima de lo que aporta un pedido → «negativizar» | ídem |
| PUB-K · regla de las 72 horas | un cambio 10 h después del anterior avisa; a las 85 h ya no; la regla es por puja, no por cuenta | `sin el arreglo del carril 4: page.evaluate: ReferenceError: pubAnotarPuja is not defined` |
| PUB-L · el prorrateo se dice en pantalla | el veredicto lleva las palabras «es un prorrateo, no una medición» y cuenta las filas de varios días | `€8970 gastados en 4 términos que no han vendido nada…` (la pantalla vieja, sin una palabra del reparto) |
| PUB-M · ni una escritura en Amazon | sin `fetch`, sin XHR, sin credenciales, y dicho por escrito en la pantalla | `falta src/24-publicidad.js` |
| PUB-N · la exportación lleva la trazabilidad | cómo se casó el SKU, el gasto prorrateado y el motivo de cada recomendación | `9 filas · 8 columnas` (la exportación vieja) |
| PUB-P · un informe que no toca el periodo | la tabla no se queda en blanco con los KPI llenos de euros: enseña las cifras completas del informe, marcadas | `marcado=undefined` |
| PUB-Q · una libra no es un euro | un informe multimercado con filas en GBP: sumarlas sube el ACOS sin subir las ventas y manda bajar una puja rentable | `200.00 € sumados · undefined fila fuera` |
| PUB-O · vacía, parcial y completa | las tres, sin un solo error de JS | `10 filas` sin la marca de «sin casar» |

Fronteras que siguen en verde: `test:pnl`, `test:informes`, `test:hub` y
`npm run test:all` completo — **17 suites · 523 comprobaciones · 0 fallos**.

Las tres comprobaciones de `pnl()` que tocan publicidad —PNL-L, PNL-M y PNL-P—
no se han relajado ni un euro: siguen dando 600,00 / 1.200,00 / 1.800,00 €, 0 %
de solape con un informe viejo, y el mismo gasto a 30 y a 365 días cuando el
informe no trae fechas.

## Costuras que pide a otros carriles

| Marca en el código | Carril destino | Qué hay que unificar al integrar |
|---|---|---|
| `// COSTURA → carril 6` en `pubFecha()` | 6 · Fechas | Que `parseDate()` entienda los meses abreviados en español (`ene`, `abr`, `ago`, `dic` son inválidos para `new Date()`). Mientras tanto, `pubFecha()` los resuelve antes de delegar en `parseDate()`. |
| `// COSTURA → carril 1` en `pubNum()` | 1 · Importador | Que `toNum()` acepte de 1 a 4 decimales tras la coma cuando no hay ningún punto: hoy `toNum('0,4356')` devuelve 4356. Mientras tanto, `pubNum()`. |

No ha hecho falta `registrarPreproceso()`: `parseDelimited()` ya detecta el punto
y coma por su cuenta, comprobado contra el fichero real.

Sí se usan dos costuras de `19-registro.js`: `registrarClaveDB('pujas', [])` para
el registro de cambios de puja y `registrarExportacion('pujas', …)` para poder
sacarlo a CSV, más `registrarEstilo()` para no abrir `01-head.html`.

## Qué queda por medir

- **El casamiento término → SKU depende de cómo se llamen las campañas.** Con las
  campañas del informe real, el hub no puede casar ninguna: ninguna lleva el
  código del SKU ni el nombre de un producto del catálogo, que además está vacío
  para esas referencias. Desbloquea: renombrar las campañas incluyendo el SKU, o
  un informe de publicidad a nivel de anuncio (`Advertised product report`), que
  sí trae SKU y ASIN. Es la vía limpia y no está pedida en este carril.
- **Las ventas atribuidas son a 7 días** en este informe, mientras el P&L mide el
  periodo entero. Para el ACOS del término da igual —numerador y denominador
  salen del mismo informe— pero para comparar lo pagado con lo total (TACOS) hay
  un desfase de ventana que hoy se avisa cuando lo pagado supera a lo total.
- **`daysInPeriod()` cuenta 30 días donde `periodStart()` deja 31.** Aquí se usa
  la ventana de `daysInPeriod()` días que termina hoy, para que el gasto de un
  informe que cubre el periodo entero no salga un día más caro que el declarado.
  Los dos criterios deberían ser uno solo; es del carril 6.

### Medido contra ficheros reales

Medido el 17-09-2026 cargando el informe real en un `index.html` compilado en
local, fuera del repositorio. **La forma del fichero, sin una sola cifra del
negocio:**

| Qué | Cuánto |
|---|---|
| Filas de datos | 1.222, ninguna malformada |
| Filas que NO son de un día | **205** |
| Tramo más largo de una fila | **64 días** de diferencia entre inicio y fin, o sea **65 días naturales** |
| Filas sin fecha | 0 |
| Días que cubre el informe | 65 |
| Términos agrupados dentro de un periodo de 30 días | 104 |
| Términos agrupados mirando 12 meses | 1.189, en 18 campañas |
| Términos que NO casan con ningún SKU (12 meses) | **695 de 1.189** |
| Términos que casan, y por qué | 494, **todos por el nombre de la campaña**; ninguno por el código del SKU; ninguno ambiguo |

Los importes y los términos de búsqueda de ese informe **no se escriben aquí**:
este fichero está en el repositorio y el repositorio es público. Van de vuelta al
orquestador.

Dos cosas que solo se ven con el fichero real delante:

0. **El casamiento con el catálogo real depende entero de cómo se llaman las
   campañas.** Cargando como catálogo las 39 referencias del informe de listings
   activos, ningún nombre de campaña lleva el código del SKU: los 494 que casan
   lo hacen por una palabra del nombre del producto, que es el nivel débil. Los
   otros 695 se quedan sin ACOS de equilibrio y la pantalla lo dice.
1. **Sin el arreglo, el rango del informe salía de 2026-06-19 a 2026-07-31**
   —43 días— cuando llega hasta **2026-08-22**: 65. Porque `parseDate()` entiende
   «jun» y «jul» (son abreviaturas inglesas) y no entiende «ago». El gasto
   imputado a un periodo de 30 días salía un **51 % más alto** de lo que tocaba,
   con la etiqueta «medido» puesta.
2. **El 61,8 % del gasto del informe está en filas agregadas de varios días.** No
   es un caso raro del formato: es la mayor parte del fichero. Sin repartirlas por
   día, la tabla con la que se decide qué puja se toca estaba llena de cifras que
   no eran del periodo que se estaba mirando.
