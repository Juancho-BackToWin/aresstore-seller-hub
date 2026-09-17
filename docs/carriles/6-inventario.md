# Carril 6 · Fechas, inventario y reposición

Rama `carril/6-inventario` · desde `base/2026-09` (`e18ef86`) · PR en borrador
contra la base.

## Qué pregunta responde

**¿Cuántas unidades hay que pedir de cada referencia, cuándo, y con qué
confianza?** Antes de este carril el hub contestaba a la primera mitad con un
número siempre disponible y a veces inventado: si el informe de pedidos no
llegaba hasta hoy, la velocidad salía diluida; si una referencia no aparecía en
el informe de inventario, su stock valía cero y se mandaba reponer a ciegas; si
una referencia no había vendido nada, la pantalla la declaraba sobrestock.
Ahora cada cifra viene con su base de medición, y lo que no se ha medido se dice
en vez de rellenarse con un cero.

La segunda pregunta —**¿esto me va a costar la tarifa por bajo inventario?**— se
contesta por primera vez con la regla que Amazon tiene escrita, no con la que el
hub venía usando.

## Lo que había, medido el 17 de septiembre de 2026

Antes de tocar nada: `npm run test:all` → **16 suites · 462 comprobaciones OK ·
0 FALLO**. Los ocho fallos heredados se comprobaron uno a uno contra esta base
compilando `index.html` desde `e18ef86` y corriendo contra él la suite nueva
(`HUB_INDEX=… node tests/fechas.test.js`, 42 comprobaciones en rojo). **Los ocho
seguían abiertos.** Ninguna cifra de este documento viene heredada del encargo:
todas se han vuelto a medir aquí, y donde se cita una del laboratorio anterior
se dice que es del laboratorio.

Dos hallazgos que no estaban en el encargo y que cambian cómo se trabaja:

- **`stockSnapshotDate()` no existe en esta base.** El encargo la da por
  congelada y dice «la llamas, no la cambias». `grep -rn "stockSnapshotDate"
  src/` no devuelve nada, igual que pasaba con `paisDeJuris()` según
  `PROPIEDAD.md`. No se puede llamar a lo que no está: se ha definido en
  `src/26-reposicion.js`, marcada como costura, con la firma mínima que D5
  necesita.
- **`stockCruce()`, también en la lista de congelados, tampoco existe.** No hay
  nada que congelar ni nada que llamar.

## Qué hace

### Fechas (`src/12-datos.js`)

- **`parseDate()`** rechaza lo que no es un día del calendario. `'2027-13-45'`
  entraba como 2028-02-14 porque `new Date(2027,12,45)` desborda en vez de
  fallar; `'45000'` —un serial de hoja de cálculo— entraba como el 1 de enero
  del año 45000. Los dos devuelven `null` ahora. El tope por arriba es hoy + 5
  años, generoso a propósito: la misma función la usan las fechas previstas de
  los pedidos de compra y los vencimientos de pago del carril 7, que son futuras
  por definición.
- **`parseDate()` respeta la hora y el huso** cuando la cadena los declara.
  `2026-09-14T23:30:00+00:00` es el 15 en Madrid, y eso es lo que ve el vendedor
  en Seller Central. Una cadena con hora pero sin huso no se toca: no hay nada
  que convertir.
- **`salesSpan()`** corta el extremo derecho en la última fecha que cubre el
  informe, no en hoy. La mitad que ya estaba —un SKU que dejó de venderse
  arrastra sus días a cero— se conserva: el corte se mide sobre el informe
  ENTERO, así que si cualquier SKU vendió ayer, el informe cubre hasta ayer.
- **`salesRows()`** descarta las ventas con fecha futura o ilegible, las cuenta
  en `meta.fechas` y la pantalla de Inventario las enseña.

### Inventario (`invStats`, `renderInv`, `exportInventario`)

- **D1 · ventana propia para el SKU nuevo.** Empieza en su primera venta. Para
  no confundir «nuevo» con «callado» —que es el error caro en el otro
  sentido— se consulta el histórico: si ya vendía antes de esta ventana, se usa
  la ventana completa. Sin histórico se aplica la ventana corta y la fila sale
  marcada como estimada.
- **D3 · stock desconocido.** Un SKU que no aparece en ningún informe de stock
  tiene `qty === null`, `need === null` y riesgo `nd`. No entra en las sumas ni
  en la cobertura de la cartera, y el CSV lleva la celda vacía, no un cero.
- **D4 · el centinela 999 deja de ser sobrestock.** Riesgo `sinventa`, con su
  propio recuento en el KPI.
- **E5 · el aviso de pocos datos no lo apaga ningún botón.** Se compara los días
  medidos contra los días que el punto de pedido proyecta hacia delante, no los
  días cubiertos contra los días pedidos (que con «Todo» coinciden por
  construcción y apagan el aviso solos).
- Los **seis parámetros de reposición** se editan desde el botón de cada fila de
  Inventario. Catálogo no se ha tocado: es del carril 2.

### Histórico (`src/12b-historico.js`)

- **Ninguna reescritura en silencio.** `captureOrders()` anota en `H.rev` cada
  día ya archivado cuyo total cambia, con su antes y su después, y la pantalla
  del Histórico lo enseña. Sobrescribir el rango que cubre el informe sigue
  siendo deliberado —si no, reimportar un mes duplicaría las ventas—, pero deja
  rastro. Esto es lo que hace visible el arreglo de B3, que mueve pedidos de un
  día al siguiente.
- **Una foto de stock archivada no se pisa nunca.** Amazon no guarda el stock de
  días pasados: la que está es la única medición que existe de ese día. El
  choque se anota y gana la que estaba.
- **D5 · `rebuildHistory()` fecha la foto con `stockSnapshotDate()`**, que es el
  día en que se importó el informe. Si no consta la fecha, **no se archiva
  ninguna foto**: nada entra en el histórico sin saber de qué día es.

### Reposición · M2 (`src/26-reposicion.js`, vista nueva)

- **Velocidad excluyendo los días sin stock.** No se ha rehecho: `velocityStats`
  (M0) ya la calculaba. La reposición la usa cuando hay histórico y dice en la
  columna «Base» cuál está usando.
- **Seis parámetros por producto** —fabricación, tránsito, recepción, colchón,
  rango objetivo y frecuencia— guardados con `registrarClaveDB('reposicion')`.
  El valor por defecto de fabricación sale del plazo del proveedor si lo hay.
- **Aritmética** (comprobada a mano en la prueba FECHA-L, cifras de fixture):

  ```
  plazo         = fabricación + tránsito + recepción
  puntoPedido   = velocidad × (plazo + colchón)
  nivelObjetivo = velocidad × (plazo + colchón + frecuencia)
  techo         = velocidad × objetivoMáximo
  pedir         = disponible ≤ puntoPedido
                  ? máx(0, ⌈mín(nivelObjetivo, techo)⌉ − disponible)
                  : 0
  ```

  El techo es lo que evita que una frecuencia larga con un plazo largo mande
  comprar un año de stock. El disparo por punto de pedido es lo que evita pedir
  cada vez que se abre la pantalla.
- **Cobertura por país**, con la columna de tarifa rellenada solo donde Amazon
  la cobra.

## La tarifa por bajo inventario · qué dice Amazon

**Fuente primaria, consultada el 17 de septiembre de 2026:** «Tarifas —
Fulfilment by Amazon (FBA). Tarifas europeas. En vigor a partir del 1 de julio
de 2026», tarifario oficial de Amazon España, páginas 10-11 y pregunta
frecuente P6 (página 31).
<https://m.media-amazon.com/images/G/02/sell/images/260630-FBA-Rate-Card-ES1.pdf>

Literal, de P6:

> «Solo cargaremos la tarifa por cobertura de coste por nivel bajo de inventario
> (Programa Paneuropeo) cuando tanto los días históricos de suministro a largo
> plazo (últimos 90 días) como los días históricos de suministro a corto plazo
> (últimos 30 días) sean inferiores a 28 días (4 semanas); de lo contrario, los
> vendedores no incurrirán en la tarifa.»

Y de la página 10:

> «Calcularemos la cantidad histórica de días de suministro del FNSKU del
> vendedor en función de la media diaria de unidades disponibles, dividida entre
> la media diaria de unidades enviadas en las tiendas del Programa paneuropeo,
> tanto a largo plazo (últimos 90 días) como a corto plazo (últimos 30 días).»
>
> «No se aplica a Países Bajos, Polonia, Suecia, Bélgica e Irlanda.»

Importes verificados en el mismo tarifario (€/unidad, DE/IT/ES/FR):

| Categoría | 0–14 d | 14–21 d | 21–28 d |
|---|---|---|---|
| Sobre ligero (≤100 g) | 0,27 | 0,18 | 0,16 |
| Sobre estándar (≤460 g) | 0,41 | 0,25 | 0,18 |
| Sobre grande / paquete pequeño | 0,46 | 0,27 | 0,18 |
| Paquete estándar (≤11,9 kg) | 0,67 | 0,35 | 0,21 |
| Tamaño grande, voluminoso, pesado | — | — | — |

**Consecuencia para el hub.** La pantalla de Inventario marcaba «tarifa bajo
inv.» con una cobertura instantánea: stock de hoy entre venta media del periodo.
Amazon no usa eso. Usa dos medias históricas y cobra solo si las dos bajan de 28.
El criterio instantáneo marca igual a una referencia que acaba de vaciarse tras
tres meses sobrada que a una que lleva tres meses justa. El veredicto correcto
se calcula ahora en Reposición, y en Inventario se dice que esa columna es la
instantánea.

**El rango «0,16 – 0,67 €/ud» que la pantalla ya decía es correcto.** Estaba
heredado; ahora está comprobado.

**Lo que NO he podido confirmar, y por tanto no se aplica:** varias fuentes
secundarias hablan de una exención de 180 días para ASIN nuevos. Esa exención
aparece en material del mercado estadounidense; en el tarifario europeo vigente
no está. El hub sigue avisando también para las referencias recientes y lo dice
en pantalla.

**Lo que es aproximación y se declara como tal:** Amazon calcula los días de
suministro por FNSKU y solo con las unidades enviadas en las tiendas paneuropeas
(DE/FR/IT/ES). Este hub los calcula por SKU y con todas las unidades del informe
de pedidos, y el stock de los días sin foto lo arrastra de la última que haya.
Sin ninguna foto de inventario en la ventana, el veredicto es «no se puede
calcular», nunca «no se cobra».

## Qué NO hace

- **No cambia `reorderPoint` ni `need` de Inventario.** Siguen siendo velocidad
  × (plazo del proveedor + colchón objetivo). La aritmética de los seis
  parámetros vive en Reposición, en su propia pantalla. Mezclarlas habría
  cambiado en silencio un número que ya se estaba usando.
- **No modela el importe exacto de la tarifa por unidad.** El hub no conoce las
  medidas de los productos y el importe depende del nivel de tamaño. Se enseña
  el rango del tarifario.
- **No toca `renderRent`.** El aviso de pocos datos de Rentabilidad se apaga con
  «Todo» por la misma razón, y `pnl()` es del carril 5. Ver costuras.
- **No corrige `captureStock()`**, que sigue fechando la foto hoy. Está
  congelada. `rebuildHistory()` corrige la fecha después, sin tocarla.
- **No deduplica el informe de pedidos.** Dos importaciones solapadas o un
  fichero con la misma línea dos veces doblan las unidades y con ellas la
  velocidad y el pedido. La deduplicación es del carril 1 (`normalizeRows`,
  `saveImport`); aquí no se ha tocado para no hacer dos veces el mismo trabajo
  con dos criterios distintos.
- **No detecta la venta en ráfaga.** Un pedido B2B de 500 unidades en un solo
  día dispara la velocidad de ese SKU igual que antes. La ventana corta queda
  marcada como estimada, que es lo que se puede decir sin inventar una regla de
  atípicos que nadie ha pedido.

## Pruebas, y en qué dirección se vieron fallar

`tests/fechas.test.js`, **69 comprobaciones, todas en verde** con los arreglos.
Sin ellos —compilando `index.html` desde `e18ef86` y corriendo
`HUB_INDEX=… node tests/fechas.test.js`— la suite se queda en 48 comprobaciones,
porque los bloques que dependen de una función que no existe se reducen a una
sola que dice qué falta, y **42 de esas 48 salen en rojo**. Ninguna escupe un
stack: las que dependen de algo ausente devuelven `{falta:'…'}` y se convierten
en un mensaje. Ninguna depende de una fecha absoluta.

| Prueba | Qué demuestra | Mensaje en rojo, sin el arreglo |
|---|---|---|
| FECHA-A · informe cortado | B1 · el extremo derecho es la última fecha cubierta | `16 días · con el fallo eran 30` → `30 días`; `10.00 ud/día · con el fallo: 160 / 30 = 5.33` → `5.33 ud/día`; `30 d · con el fallo: 300 / 5,33 = 56 d` → `56 d` |
| FECHA-A · pantalla | B1 se ve, no solo se calcula | `Todo el catálogo está dentro de la banda razonable…` (no dice que el informe se corta) |
| FECHA-B · mes 13 | B2 · `new Date(2027,12,45)` desborda | `entró como 2028-02-14` |
| FECHA-B · serial | B2 · `new Date('45000')` da el año 45000 | `entró como fecha` |
| FECHA-B · futuro | B2 · nada acota por arriba | `hay ventas con fecha posterior a hoy` |
| FECHA-B · recuento | B2 · se cuentan, no se tragan | `33 filas y 1800 ud · deberían ser 30 y 300`; `undefined · total undefined` |
| FECHA-C · 23:30 UTC | B3 · huso y hora deciden el día | `2026-09-14 · esperado 2026-09-15` |
| FECHA-D · histórico | B3 toca el histórico y no lo reescribe en silencio | `falta logRevision() / H.rev en 12b-historico.js` |
| FECHA-E · foto archivada | una medición irrepetible no se pisa | `falta refecharFotoStock() en 12b-historico.js` |
| FECHA-F · reconstrucción | D5 · la foto lleva la fecha en que se midió | `falta stockSnapshotDate()` |
| FECHA-G · SKU nuevo | D1 · la ventana empieza en su primera venta | `3.33 ud/día · con el fallo: 100 / 30 = 3.33`; `60 d · con el fallo: 200 / 3,33 = 60 d` |
| FECHA-H · SKU callado | revisión adversarial de D1 | `velocidadEstimada=undefined`; `0.167 ud/día sobre ? (invStats() no lo dice)` |
| FECHA-I · sin foto | D3 · desconocido no es cero | `qty=0 · stockDesconocido=undefined`; `pedir=65 · mandaba pedir 65 unidades de algo que no ha mirado` |
| FECHA-J · sin ventas | D4 · 999 no es sobrestock | `riesgo=over · porque el centinela 999 pasaba el filtro de cover>154`; `1 en sobrestock` |
| FECHA-K · «Todo» | E5 · el aviso no lo apaga el botón | `estimada=undefined`; `Todo el catálogo está dentro de la banda razonable…` |
| FECHA-L · seis parámetros | M2 · la aritmética, a mano | `falta repoPlan() en src/26-reposicion.js` |
| FECHA-M · velocidad real | M2 usa `velocityStats`, no la rehace | `falta repoPlan()` |
| FECHA-N · tarifa | la regla es la de Amazon | `falta riesgoTarifaBajoInv() en src/26-reposicion.js` |
| FECHA-O · pantallas | vacía, a medias y llena, sin errores de JS | `no hay tabla #repoTable: falta registrarVista de reposición` |
| FECHA-P · exportación | el CSV deja la celda vacía donde no se ha medido | `falta exportReposicion()` |

Las 16 suites de la base, verdes antes y después: `16 suites · 462
comprobaciones OK · 0 FALLO` antes, y con la suite nueva **17 suites · 509
comprobaciones**. `test:pnl`, `test:m0`, `test:inv` y `test:iva` en verde en
todas las iteraciones, que es la frontera de este carril (`test:coherencia` y
`test:sesionb` **no existen** en esta base, como dice `PROPIEDAD.md`).

Tres regresiones que introduje y corregí por el camino, porque explican una
parte del diseño:

1. `historyStats()` devolvía **dos claves `rev`** y la segunda pisaba el ingreso
   archivado. `test:m0` salió roja con `0 vs 70152`. La mía se llama ahora
   `revisiones`.
2. `invStats()` marcaba como «no medido» el stock que venía del respaldo de
   `planning`, y `test:informes` declaró `planning` decorativo. El criterio de
   «medido» es ahora el conjunto de SKU vistos en cualquiera de los tres
   informes, incluido el respaldo.
3. El botón de la vista nueva decía «Exportar a CSV» y `test:salida` cuenta
   exactamente siete. Se llama «Exportar reposición (CSV)»: antes que relajar
   una prueba existente, se cambia el texto.

## Costuras que pide a otros carriles

| Marca en el código | Carril destino | Qué hay que unificar al integrar |
|---|---|---|
| `// COSTURA → congelados: stockSnapshotDate()` en `src/26-reposicion.js` | Integración / dueño de los congelados | La función figura como congelada pero **no existe** en `e18ef86`. Aquí está definida con la firma mínima (`() → Date|null`, día de `loadedAt` del informe de inventario). Si aparece la original, se borra esta y `rebuildHistory()` sigue funcionando: solo depende de la firma. |
| `captureStock()` sigue fechando hoy | Congelada · dueño de los congelados | Lo correcto sería que `captureStock()` aceptara la fecha de la medición. Como está congelada, `rebuildHistory()` mueve la foto después con `refecharFotoStock()`. Al integrar conviene meter la fecha dentro de `captureStock()` y quitar el refechado. |
| Aviso de pocos datos de Rentabilidad | **Carril 5** | `renderRent` avisa con `P.dataDays < P.periodDaysReal`. Con el botón «Todo», `daysInPeriod()` devuelve los días cubiertos, así que los dos valen lo mismo y el aviso se apaga solo — es la segunda mitad de E5. El aviso equivalente está puesto en Inventario, que es mío. En Rentabilidad hace falta comparar los días medidos contra el horizonte que se está proyectando, no contra el periodo pedido. No he tocado `renderRent` ni `pnl()`. |
| Campos nuevos de `invStats()` | **Carriles 5 y 7**, que leen `invStats()` | `qty` y `need` pueden valer `null` (stock no medido) y `cover`/`coverTransito` también. `risk` tiene dos valores nuevos: `nd` y `sinventa`. Cualquier consumidor que haga `r.qty > 0` sigue funcionando; el que haga `a + r.qty` suma `null` como 0 y debería filtrar por `stockDesconocido`. |

## Qué queda por medir

- **La métrica de Amazon es por FNSKU; el hub no tiene FNSKU.** El informe de
  pedidos trae SKU y ASIN. Mientras un SKU tenga un solo FNSKU la aproximación
  coincide; con varios (reetiquetados, mezcla de lotes) no. Lo desbloquearía el
  informe de inventario FBA completo, que sí trae la columna, o la ingesta
  SP-API del carril 9.
- **La exención de 180 días para ASIN nuevos** no está confirmada para Europa.
  Lo desbloquearía encontrarla en una página de ayuda de Seller Central europea:
  las que salen en búsqueda requieren sesión y devuelven el shell de la SPA.
- **El importe por unidad** exige el nivel de tamaño de cada producto, que el
  hub no guarda. Lo desbloquearía un campo de dimensiones y peso en el catálogo
  (carril 2) o la vista previa de tarifas de FBA con esa columna.
- **La venta en ráfaga.** No hay regla de atípicos y no se ha inventado ninguna.
  Lo desbloquearía una decisión de Juancho sobre qué considerar un pedido B2B.
- **Cuál es la costumbre real de importación.** La precisión de los días de
  suministro depende de cuántas fotos de inventario haya en la ventana. El hub
  ya dice cuántas hay; cuál es el ritmo sostenible es una decisión, no una
  medida.

### Medido contra ficheros reales

**Nada.** Este carril no ha tenido acceso a ningún informe real de Seller
Central: todos los casos son fixtures sintéticas construidas en la propia
prueba, con la aritmética escrita a mano en el comentario. Las únicas cifras de
este documento que no son de fixture son las del tarifario público de Amazon,
citadas con su URL y su fecha de consulta.

> **Las cifras reales no van aquí.** Este fichero está en el repositorio, y el
> repositorio es público. Si alguien mide este carril contra ficheros reales,
> eso va a `seller-hub/carriles-2026-09/6-inventario.md` o de vuelta al
> orquestador.
