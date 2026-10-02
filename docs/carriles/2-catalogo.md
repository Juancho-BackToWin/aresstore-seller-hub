# Carril 2 · Catálogo y costes

Rama `carril/2-catalogo` · desde `base/2026-09` (`e18ef86`) · PR en borrador contra la base.

## Qué pregunta responde

Después de esto el hub sabe **qué está publicado en Amazon y qué le cuesta a
Juancho cada cosa — y, sobre todo, qué NO sabe que le cuesta**. Antes, un SKU
sin coste cargado se costeaba a cero euros: la pantalla imprimía «0,00 € base»,
que se lee como un coste medido de cero, y cada unidad de ese SKU aportaba al
beneficio su precio de venta entero menos comisiones. Ese era el número creíble
y falso de este carril, y era el que más engordaba el margen.

Tres cosas nuevas que no existían:

1. **El informe de listings activos se puede cargar.** Nunca se había podido:
   no había definición para él. Ahora se registra por la costura
   (`registrarInforme`) y ofrece **crear los productos que faltan sin tocar los
   que ya están**, diciendo cuáles crea y cuáles ya estaban.
2. **Coste base en bloque** sobre una selección múltiple, con familias de coste
   editables para no teclear el mismo importe veinte veces.
3. **«Coste desconocido»** allí donde antes salía un cero, y un panel que cuenta
   cuántas unidades vendidas se están costeando a cero y qué parte de la
   cobertura está medida de verdad.

## Qué NO hace, a propósito

- **No hereda el coste de un `amzn.gr.*` a su SKU base.** La hipótesis era que
  esos SKU son unidades del programa de reventa de devoluciones ligadas a un SKU
  propio. Se ha buscado en la documentación oficial y **solo está confirmada a
  medias**:
  - *Confirmado.* Seller Central, «FBA Grade and Resell» (`UA6RV6UA4DR2MFK`,
    <https://sellercentral.amazon.com/gp/help/external/UA6RV6UA4DR2MFK>,
    consultada el **17 de septiembre de 2026**): «All SKUs in FBA Grade and
    Resell begin with `amzn.gr`…», Amazon genera un SKU nuevo por unidad
    calificada y la publica bajo el ASIN padre, con el vendedor como vendedor
    registrado. El prefijo identifica el programa, sin ambigüedad.
  - *No confirmado.* Que el texto que va **detrás** del prefijo sea el SKU
    propio del vendedor. Amazon no publica la gramática del SKU. El formato
    `amzn.gr.[seller-msku]-[defecto]-[condición]` solo aparece en blogs de
    terceros (kwickmetrics, consultado el 17-09-2026), sin fuente de Amazon. Y
    cuando el SKU propio lleva guiones, la partición es además **ambigua**.
  - *Consecuencia.* No se hereda nada. Los `amzn.gr.*` siguen como «coste
    desconocido». Lo que sí se hace es **enseñar** la base aparente, marcada
    como deducida, para saber a qué mirar; no entra en ningún número. Los grados
    que Amazon documenta son `LN`, `VG`, `GD` y `AC`; cualquier otro se marca
    como no reconocido en vez de traducirlo a ojo.
- **No escribe lotes.** El coste en bloque va al **coste base**, nunca a un
  lote. Un lote afirma «compré N unidades este día a este precio», y
  `lotCoverage()` lo contaría como unidad **medida**: un lote inventado sellaría
  el margen como medido, que es exactamente lo contrario de lo que persigue este
  proyecto. Hay una prueba que lo vigila.
- **No toca los productos que ya existen** al crear desde el informe. Un informe
  de listings no sabe nada del coste, así que «actualizar» con él solo puede
  quitar información que alguien cargó a mano.
- **No borra** productos que el informe ya no trae (el informe lista solo lo
  activo). Los cuenta y los señala.
- **No convierte la hora** de `open-date`. MET es UTC+1 y MEST es UTC+2, los
  mismos desplazamientos que CET y CEST, el huso civil de Europe/Madrid: la
  fecha del calendario que Amazon imprime ya es la de Madrid. Convertir movería
  algunas altas un día sin que nada lo justifique. El desplazamiento se guarda
  para que quede auditable.
- **No edita `pnl()`.** Ver «Costuras».

## Lo que se midió del fichero real antes de escribir la fixture

Medido con Bash sobre `Informe+de+listings+activos_08-22-2026.txt` el
**17-09-2026**, no supuesto:

| Qué | Medida |
|---|---|
| Tamaño | 80.098 bytes |
| BOM UTF-8 | **sí** (`ef bb bf`) |
| Fin de línea | **LF puro**, ni un `\r` en todo el fichero |
| Termina en salto de línea | sí (últimos bytes `09 09 09 0a`: tres columnas finales vacías) |
| Separador | TAB |
| Cabecera | línea 1 |
| Columnas | **49**, y las 40 líneas tienen las 49 |
| Filas de datos | **39** |
| `quantity` | **vacía en las 39** (son AFN/FBA) |
| `open-date` | `DD/MM/YYYY HH:MM:SS MET` o `MEST`, las dos formas aparecen |

`new Date('22/08/2024 18:29:56 MEST')` devuelve **Invalid Date**: pasarlo tal
cual dejaba la fecha de alta a nulo sin decirlo. `listingOpenDate()` lo parte a
mano y, si no reconoce el formato o el huso, **lo dice** en vez de tragárselo.

Las fixtures de `tests/fixtures-catalogo/` reproducen ese formato **literal**
(BOM, LF, TAB, 49 columnas, `quantity` vacía, los dos sufijos) con datos
**inventados**: ni un SKU, ni un ASIN, ni un título real. El repositorio es
público. `tests/catalogo.test.js` lo comprueba en positivo: todo lo que tenga
forma de ASIN tiene que empezar por `B0DEMO`.

## Pruebas, y en qué dirección se vieron fallar

`tests/catalogo.test.js` · **105 comprobaciones**. Cada una de las que persigue
un fallo se ha visto roja revirtiendo el arreglo de verdad en `src/` y volviendo
a compilar; los mensajes de abajo son los que imprimió.

| Prueba | Qué demuestra | Mensaje en rojo, sin el arreglo |
|---|---|---|
| CAT-C · `open-date` con MEST | que el sufijo de huso no se traga en silencio | `CON el arreglo, MEST da la fecha impresa sin moverla → (vacío)` |
| CAT-C · `open-date` con MET | idem, y que el orden es europeo | `CON el arreglo, MET da 2024-12-10 → ` |
| CAT-C · huso desconocido | que un `XYZ` se dice, no se supone | `un huso desconocido conserva la fecha pero LO DICE → (sin motivo: se lo está tragando en silencio)` |
| CAT-C · fecha ilegible | que no se convierte en nada | `una fecha ilegible NO se convierte en nada → (sin motivo)` |
| CAT-E · fecha del producto creado | que el alta llega al catálogo | `el producto creado trae la fecha de alta ya resuelta → ` |
| CAT-F · la celda del coste | **el fallo estrella**: que un SKU sin coste no imprime un cero | `CON el arreglo, la celda pone «coste desconocido» → «€0,00 base»` |
| CAT-F · el cero explícito | idem, dicho al revés | `y NO pone un cero, que se lee como «cuesta cero euros» → «€0,00 base»` |
| CAT-K · pantalla parcial | que se marcan todas las que faltan, no una | `PARCIAL · uno con coste y el resto como «coste desconocido» → 0 celdas de 6 esperadas` |
| CAT-H · ni un lote | que el coste en bloque no fabrica compras | `NO se ha creado NI UN LOTE → 0 → 2 lotes` |
| CAT-H · cobertura | **por qué importa**: un lote inventado sella el margen como medido | `la cobertura MEDIDA sigue en 0 % → 1.0 %` |
| CAT-H2 · fábrica vs puesto | que el importe dice qué es, y el flete no se suma dos veces ni falta | `«puesto en almacén» pone el transporte a cero: 4,00, no 4,70 → 4 + 0.7 = 4.7` |
| CAT-H3 · veredicto | que «ningún SKU sin coste» no se lea como «medido» | `la pantalla lo dice en vez de dejar que se lea «ya está» → NO lo dice` |
| CAT-H4 · selección | que un `refreshAll()` no aplique el coste a otros productos | `las dos casillas siguen marcadas después de refreshAll() → 0 de 2` |

Además, en verde permanente y sin reversión posible porque comprueban una
ausencia: CAT-J vigila que **nadie herede** el coste de un `amzn.gr.*`, que la
pantalla **cite la fuente y la fecha** y que diga «NO documenta»; CAT-A vigila
el formato literal de la fixture; CAT-B vigila que no entre un dato real.

### Frontera

`npm run test:all` · **17 suites · 567 comprobaciones · 0 fallo**. Las 462 de la
base siguen verdes una a una; las 105 nuevas son de este carril. `test:m11`,
`test:pnl`, `test:hub` y `test:salida` en verde. `test:coherencia` y
`test:sesionb` **no existen** en esta base.

> Correr las pruebas deja `tests/fixtures/`, `tests/fixtures-es/` y
> `tests/fixtures-catalogo/` regeneradas. No se commitean:
> `git checkout -- tests/fixtures tests/fixtures-es tests/fixtures-catalogo`.
> `index.html` y `sw.js` tampoco.

## Costuras que pide a otros carriles

| Marca en el código | Carril destino | Qué hay que unificar al integrar |
|---|---|---|
| `COSTURA → carril 5` en `src/21-catalogo.js` (`catCostePnlFiable`) | 5 · Rentabilidad | `pnl()` marca el periodo como medido con `sf.matched>0 && tb.known && !ads.spanUnknown`: **el coste no entra**. Un periodo con el 40 % de las unidades a coste cero sale con la insignia de «medido». Se pide añadir `&& cost.units>0 && cost.known >= cost.units`. Es una línea, `cost` ya está calculado justo encima y `cost.known` ya excluye las unidades a coste cero. Mientras tanto, `catCostePnlFiable()` calcula el mismo hecho aparte y lo enseña en Catálogo; al aplicar la línea, se puede borrar. |

**Al carril 1 no se le pide nada.** Se comprobó antes de escribir la definición:
`readSmart` ya quita el BOM, `parseDelimited` ya elige TAB por mayoría en la
primera línea, `KIND.date` ya reconoce `DD/MM/YYYY` y `resolveFields` ya resuelve
las siete columnas que hacen falta. El informe entra por `registrarInforme` sin
abrir `src/12-datos.js`. Lo único que había que vigilar era que la definición
nueva **no le robara la detección** a los informes que ya había: por eso
`_opendate` va como obligatorio (es la única columna que no comparte con ningún
otro informe del catálogo) y por eso `forbid:['orderId']`. CAT-D lo comprueba en
las dos direcciones: el de listings se reconoce **y** el de pedidos sigue
reconociéndose como pedidos.

## Qué queda por medir

- **Las seis familias de coste están «deducidas, sin confirmar por Juancho»** y
  la pantalla lo dice con esas palabras. Vienen heredadas de una entrega
  anterior y **no se han podido comprobar contra ninguna factura** en esta base.
  Hay un botón para marcarlas confirmadas, que fecha la confirmación; hasta que
  alguien lo pulse, cualquier coste que salga de ellas arrastra el adjetivo
  hasta el CSV exportado. **Lo desbloquea Juancho, con una factura delante.**
- **A qué SKU se aplica cada familia.** Los nombres (`FBASPB0100`, `FBA100`…)
  parecen prefijos de los SKU reales, pero la regla de correspondencia no está
  escrita en ningún sitio. **Aquí no se ha adivinado**: la familia solo rellena
  el importe cuando alguien elige a mano a qué productos aplicarla. Inventar la
  regla sería costear veinte referencias con una suposición.
- **La gramática del SKU de reventa de devoluciones.** Ver arriba. Lo
  desbloquearía una página de ayuda de Amazon que la publique, o una respuesta
  de Seller Support por escrito.
- **El coste de los `amzn.gr.*` en sí.** Una unidad calificada no cuesta lo
  mismo que una nueva: ya se vendió una vez, ya devengó logística y ya generó un
  reembolso. Aunque se confirmara la gramática, heredar el coste del SKU base
  **tal cual** sería una segunda suposición encima de la primera.
- **Tarifa FBA y comisión de los productos creados desde el informe.** Nacen con
  los valores por defecto del hub (3,20 € y 15 %), los mismos que pone
  `editProduct` a un producto nuevo hecho a mano. Son **supuestos**, y la
  pantalla lo dice al terminar. Dejarlos a cero habría sido peor: abarata el
  coste y engorda el margen sin avisar. Se corrigen solos al importar «Vista
  previa de tarifas de Logística de Amazon».

### Medido contra ficheros reales

Sí, y con el fichero real de `/root/aresstore-reales/` cargado en un
`index.html` compilado de esta rama, sin errores de JS. **Las cifras no van
aquí: el repositorio es público.** Van en el informe al orquestador.

Lo que sí se puede decir aquí, porque es del formato y no del negocio: el
fichero entró entero, se reconoció por cabeceras en inglés, las fechas de alta
se resolvieron **todas** (ninguna quedó ilegible) y aparecieron los dos sufijos
de huso. Volver a pulsar «crear los que faltan» no duplicó nada.
