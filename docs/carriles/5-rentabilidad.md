# Carril 5 · Rentabilidad · M1.2

Rama `carril/5-rentabilidad` · desde `base/2026-09` (`e18ef86`) · PR en borrador
contra la base.

## Qué pregunta responde

Antes de esto el hub decía **cuánto** ganas. Ahora dice **cuánto de eso sabe de
verdad**: cada línea de la cuenta de resultados lleva escrito si está leída de un
informe, deducida de un supuesto o directamente fuera de su alcance, y un total
nunca puede rotularse mejor que el peor de sus sumandos. La consecuencia
práctica: un margen del 33 % con la publicidad sin cargar deja de parecerse a un
margen del 33 % medido.

Y responde una segunda pregunta que la base no podía responder: **si el desglose
cuadra con el total**. Por SKU, por mercado y por mes, al céntimo, con lo que no
se puede imputar declarado aparte en vez de repartido con una proporción
inventada.

## Qué se ha construido

- **`src/25-metricas.js`** · la cascada (`cascada()`), el vocabulario de calidad
  con herencia de la peor (`peorCalidad()`), el porcentaje con umbral de muestra
  (`pctSeguro()`, `umbralUnidades()`), los tres cortes (`cortePorSku()`,
  `cortePorPais()`, `cortePorMes()`), la frontera de compactación
  (`fronteraM0()`), la pantalla **Cascada** (registrada con `registrarVista`, sin
  abrir ningún fichero compartido) y su salida a CSV (`registrarExportacion`).
- **`taxBasis()`** publica ahora el reparto del IVA abierto **por SKU, por país y
  por mes**, con la calidad de cada grupo. Es el mismo reparto que usa el total.
- **`skuStats()` y `countryStats()`** dejan de calcular el IVA por su cuenta y lo
  toman de ahí.
- **`renderRent()`** pinta la cuenta de resultados **desde `cascada()`**, no con
  una lista de líneas escrita a mano en paralelo.
- **`renderPanel()`** marca la procedencia de cada mercado y arregla los rótulos
  de devoluciones.
- **`tests/m12.test.js`** · 124 comprobaciones.

Estado: `npm run test:all` → **17 suites · 586 comprobaciones OK · 0 FALLO**
(la base traía 16 suites y 462; ninguna se ha tocado, quitado ni relajado).

## Qué NO hace, a propósito

- **No reparte lo no imputable.** Gastos fijos, devoluciones, IVA no repercutido
  y reembolsos no se atribuyen a un SKU ni a un mercado. Repartirlos por ingreso
  daría un beneficio por fila que suma el total y que es falso en cada fila.
  Salen en su propio bloque, con su importe y con el motivo.
- **No recorta la tasa de devoluciones que pasa del 100 %.** Puede ser un dato
  cierto (devoluciones de ventas anteriores al periodo, que el informe fecha por
  la devolución). Se explica, no se maquilla.
- **No corrige el coste de cumplimiento por mercado.** La tabla por mercado resta
  la gestoría del alta de IVA de cada país y la cuenta de resultados no la tiene
  en ninguna línea. Son dos preguntas distintas y las dos son legítimas; lo que
  no podía ser es que la diferencia fuera invisible. Ahora viene declarada con su
  importe. Unificarlas es una decisión de producto, no de este carril.
- **No toca `pnl().profit`.** Ni un céntimo. La cascada descompone, no recalcula.
  Lo único que cambia de valor en la base son el ingreso neto por SKU y por
  mercado (que estaban sin deducir el IVA) y la tasa de devoluciones (que contaba
  unas unidades distintas de las que cobraba).
- **No hay comparador entre periodos.** El corte por mes deja los meses puestos
  uno al lado del otro y avisa de cuáles no son comparables; sacar de ahí una
  variación mes a mes es M1.3 y necesita decidir antes qué se hace con los meses
  compactados.

## Lo que he tenido que interpretar · para contrastar con `M1.2-ESPEC.md`

La especificación **no es accesible desde esta sesión** (lo mismo que dice
`PROPIEDAD.md` del resto de documentos del proyecto). Esto es lo que he decidido
yo, y por dónde puede chocar con la real:

1. **Qué líneas tiene la cascada.** He puesto dieciséis más el resultado, con
   cuatro subtotales: *ingreso neto*, *margen de canal* (después de lo que cobra
   Amazon), *margen de producto* (después del coste) y el resultado. La
   especificación puede nombrarlos de otra forma o querer otros cortes
   intermedios; la aritmética no cambiaría.
2. **El alcance de la regla del cero.** La especificación nombra la publicidad.
   He aplicado el mismo criterio al **almacenaje, otras tarifas de Amazon,
   devoluciones, IVA no repercutido, reembolsos y gastos fijos**: sin informe que
   lo diga, un cero es «desconocido». Es la lectura que no infla, pero hace que
   la cascada salga «desconocida» hasta que están casi todos los informes. Si la
   especificación quería la regla solo para publicidad, hay que estrecharla aquí.
3. **Qué importe entra en la aritmética de una línea desconocida.** El que usa
   `pnl()`, que es cero. Si no, el desglose dejaría de sumar el total, que es la
   otra norma y pesa más. En pantalla se pinta «—», nunca «0 €», y el subtotal
   hereda «desconocido»: el número está, y está dicho que le falta algo.
4. **Dónde se aplica el umbral de 10 unidades.** A los porcentajes de los tres
   cortes, a la columna de margen por SKU, a la de margen por mercado **y al
   margen neto del titular**, en Panel y en Rentabilidad. Lo último es
   interpretación mía: es el número que más se mira y con nueve ventas no
   significa nada. También he aplicado el umbral a la tasa de devoluciones.
5. **Qué es «cruzar la frontera de compactación».** Que el periodo mirado empiece
   en una fecha igual o anterior a `historyStats().cut`. En el corte por mes se
   marca además cada mes afectado uno a uno, porque el aviso general no dice
   *cuál* de los meses no es comparable.
6. **`vatShortfall`.** La especificación es anterior a esa línea. Manda la base:
   es una línea más de la cascada, con su etiqueta propia, medida solo si hay
   informe fiscal cargado.
7. **El desglose por SKU.** También es posterior a la especificación. Manda la
   base: el corte por SKU sale de `skuStats()` tal y como está, con su ABC.

## Hallazgos heredados · cuáles seguían abiertos

Comprobados uno a uno contra esta base **antes** de tocar nada, con fixtures
sintéticas y la aritmética hecha a mano.

### A2 · confirmado, y peor de lo que decía

Fixture: 10 ud a 100 € por un canal que el hub no reconoce → 1.000 € sin país.

- El IVA no se deduce (no se sabe de qué país es): cierto, y es inevitable.
- **El Panel pintaba esa fila sin marca ninguna, en verde**, con «margen 82,0 %»
  y «aporta al año 9.971 €».
- Y algo que el hallazgo no decía: **su coste de producto tampoco llegaba a la
  fila**. `costOfSales().byCountry` solo indexa las filas con país, así que los
  50 € de coste de esas 10 unidades estaban en el total del P&L y valían 0 € en
  la tabla de mercados.
- Y algo más ancho todavía: `countryStats()` hacía `rev − tax` con la columna en
  crudo, así que con un informe sin columna de impuesto **ningún** mercado
  deducía IVA, no solo el grupo sin país.

Arreglado: el IVA de cada mercado sale del reparto de `taxBasis()`, el coste sin
país se reconstruye por diferencia y la fila lleva su procedencia y una nota.

### E2 · confirmado

Fixture: 4 ud vendidas en el periodo y 9 devoluciones fechadas dentro de él. El
Panel imprimía `devoluciones 225,0%` a secas, sin una palabra en ninguna
pantalla. Arreglado: se explica en la misma frase, y sin informe de devoluciones
la tasa pasa a ser «—», no «0 %».

### E4 · confirmado

Fixture: mismo SKU, 10 ud en ES y 10 en DE, 4 devoluciones sin país. Con el
filtro en España, `retRate` decía **40,0 %** y `returnsCost` cobraba 2 unidades,
o sea un **20,0 %**. Arreglado: la tasa cuenta las mismas unidades que el coste
(20,0 %) y va etiquetada «estimado», porque repartir por cuota es suponer.

## Hallazgos nuevos, de la revisión adversarial propia

| # | Qué entrada lo dispara | Qué enseñaba | Arreglado |
|---|---|---|---|
| N1 | Informe de pedidos **sin columna de impuesto** (el caso que ya avisa Datos) | `skuStats()` daba el ingreso CON IVA como ingreso neto: con la fixture de 10.000 €, 10.000 € en vez de 8.264,46 €. El margen por SKU —la pantalla con la que se decide qué producto se empuja— salía inflado en todo el IVA del periodo | Sí · M12-O |
| N2 | Lo mismo, en `countryStats()` | El desglose por mercado no sumaba el ingreso neto del P&L | Sí · M12-H3 |
| N3 | Tres mercados con el IVA dado de alta | La tabla por mercado resta la gestoría de cada país y el P&L no la tiene: con 1.500 €/año y 30 días, 369,86 € de diferencia invisible entre las dos pantallas | Declarado · M12-H6 |
| N4 | Un SKU vendido en dos países en dos meses | Prorratear el IVA del SKU entre sus meses por ingreso daba el total bien y los dos meses mal (1.666,09 € a cada uno donde son 1.735,54 € y 1.596,64 €). Es la peor manera de fallar: la que cuadra | Sí · M12-R |
| N5 | Borrar `src/25-metricas.js` | `taxBasis()` reventaba con un ReferenceError y dejaba el hub entero sin números, y las suites con un stack en vez de un mensaje | Sí · degrada a «desconocido», que es el lado que no infla |

## Pruebas, y en qué dirección se vieron fallar

`tests/m12.test.js`, 124 comprobaciones. Todas se han visto **rojas quitando el
arreglo**, con mensaje y sin stack. Los siete reversos se hicieron uno a uno
sobre el árbol y se deshicieron después.

| Prueba | Qué demuestra | Mensaje en rojo, sin el arreglo |
|---|---|---|
| A1–A6 | El módulo existe de verdad, con motor y pantalla | `falta la función que abre la cuenta de resultados línea a línea` · `sku=false país=false mes=false` · `sección=false · botón de navegación=false` |
| B1–B18 | Un caso por tramo, con la aritmética a mano, y que la suma de las líneas **es** `pnl().profit` | `no se ha podido calcular · cascada is not defined` (con el módulo fuera) |
| C1–C8 | Herencia de la peor, incluida en los subtotales | `medido + estimado` dando `medido`: *«si diera "medido" bastaría un sumando bueno para sellar una suma mala»* |
| D1–D4 | Publicidad sin informe es «desconocido» y se pinta «—» | `la línea dice «estimado» con 0 €: un cero etiquetado medido o estimado infla el beneficio y parece dato` · `"Publicidad…estimado€0,00"` |
| E1–E6 | Umbral de 10 unidades, en el motor y en la tabla | `— · «solo 9 ud…»` pasa a `38,0% · «»` · `POCO="72,1%" · TEST-1="72,1%"` |
| F1–F4 | «—» con cero ventas, no «0 %» | `0,0% · «»` · `"…Sobre ingreso neto0,0%de €0 de ingreso neto"` |
| G1–G8 | **Cuadre 1/3 · SKU** · ventas, IVA, ingreso neto, coste, unidades y la identidad `Σ filas + no imputable = beneficio` | `0,0000 € vs 449,4972 € · si no cuadra es que el desglose deduce el IVA de otra manera que el total` |
| H1–H7 | **Cuadre 2/3 · mercado**, con el grupo sin país y el mercado de fuera de la UE dentro | `300,00 € vs 375,00 € · byCountry no indexa las filas sin país` · `4.526,31 € vs 4.451,31 €` |
| I1–I8 | **Cuadre 3/3 · mes**, con el mismo libro de lotes | `0,0000 € vs 1.735,5372 €` |
| J1–J6 | La frontera de compactación se detecta, se marca mes a mes y se dice con su fecha | `marcados 0 de 3` · `la tabla de meses NO lleva la marca «compactado»: el aviso general no dice CUÁL de los meses no es comparable` |
| K1–K7 | «Beneficio» solo con gastos fijos cargados | `se llama «Beneficio neto» · llamarlo beneficio hace creer que el negocio gana eso` |
| L1–L6 | **A2** · el grupo sin país lleva su coste y su marca, y la marca llega a la pantalla | `0,00 € de coste en la fila, 50,00 € en el P&L` · `calidad=medido · sinPais=true` |
| M1–M4 | **E2** · el 150 % se explica; sin informe, «—» | `150.0 % · marcada como excedida: false` · `calidad=medido · un 0 % ahí hace creer que no te devuelven nada` |
| N1–N5 | **E4** · tasa y coste cuentan las mismas unidades | `tasa=40.0 % · el coste imputa 2 ud de 10, que son el 20.0 %` |
| O1–O4 | El ingreso neto por SKU no puede ser el ingreso con IVA | `0,00 € imputados al SKU frente a 1.735,54 € del P&L` |
| P1–P9 | La pantalla vacía, a medias y completa, sin un solo error de JS | `activa=false` / `"…Sobre ingreso neto0,0%…"` |
| Q1–Q4 | La salida a CSV lleva la etiqueta de calidad de cada línea | `registrarExportacion no lo ha enganchado` |
| R1–R5 | El IVA de un mes es el de sus ventas, no el promedio del SKU | `1666.09 € · prorrateando por ingreso saldrían 1.666,09 €` · `se diferencian en 0.00 €` |
| S1–S4 | El margen del titular también necesita muestra, y las dos pantallas dicen el mismo número | `"72,1%" · «objetivo ≥15%»` con nueve ventas |

### Cómo se navega en las pruebas

Con `page.evaluate(()=>go('metricas'))`, nunca con `page.click('.nav-item…')`: a
1440 px la barra lateral va plegada y **todos** los botones de navegación miden
0×0, también los que ya existían. Un `click` fallaría por la barra y no por el
código.

## Costuras que pide a otros carriles

| Marca en el código | Carril destino | Qué hay que unificar al integrar |
|---|---|---|
| `// COSTURA → carril 2` en `countryStats()` (`src/12-datos.js`) | 2 · Catálogo y costes | `costOfSales().byCountry` (en `src/12c-lotes.js`) solo indexa las filas con país. Aquí el coste de las ventas sin mercado se reconstruye por diferencia: exacto, pero indirecto. Lo que toca es que `byCountry` tenga su grupo `'??'`, como ya lo tiene el reparto del IVA en `taxBasis()` |
| `// COSTURA → carril 3` en `cascada()` (`src/25-metricas.js`) | 3 · Transacciones | `settlementFees()` devuelve `storage` y `other` a cero tanto si la liquidación dice que no hubo como si el fichero no trae esas líneas. No es el mismo caso: el segundo vale beneficio de más. Aquí se deduce de si hay liquidación casada, que es una aproximación por fuera. Lo que toca es que diga qué **conceptos** venían en el fichero, igual que ya distingue `rows` de `matched` |
| `// COSTURA → integración` en `renderPanel()` (`src/13-render.js`) | integración | El hueco de la nota de mercados no existe en `src/02-views.html`, que no es de este carril, así que el nodo se crea desde el render. Al integrar, un `<div id="panelCountriesNote">` bajo la tabla y esto sobra |

### Y una prueba ajena que este carril ha rodeado sin tocar

`tests/salida.test.js` cuenta **exactamente siete** botones con el texto
«Exportar a CSV», uno por módulo de la base. Un botón más en la pantalla nueva la
habría puesto roja sin que nada estuviera mal, y una prueba existente no se
relaja ni se reescribe desde un carril. El botón de la Cascada se llama
**«Descargar la cascada»** y su salida se comprueba en `tests/m12.test.js`
(Q1–Q4), leyendo el CSV que produce y no solo que el botón esté. Al integrar, o
se renombra el botón y se sube el recuento a ocho, o se deja como está; lo que no
puede quedar es la pantalla nueva sin nadie que le mire la salida.

## Qué queda por medir

- **La especificación real.** Los siete puntos de interpretación de arriba están
  sin contrastar porque `M1.2-ESPEC.md` no es accesible desde esta sesión. Es lo
  primero que debería hacer la siguiente. Desbloquea saber si la regla del cero
  va solo para publicidad o para todo, y si los subtotales son estos.
- **El umbral de diez unidades.** Es una decisión de producto que he tomado yo
  porque había que tomarla. Está en una sola función (`umbralUnidades()`) para
  que cambiarlo sea una línea. Desbloquea: una palabra de Juancho.
- **Si los meses compactados deberían poder compararse.** Hoy se marcan y se dice
  que no son comparables. El resumen mensual del histórico **sí** conserva
  unidades, ingreso e impuesto por SKU y por mercado, así que una comparación
  limitada sería posible. No se ha hecho porque mezclar dos niveles de detalle
  sin decirlo es exactamente lo que este módulo existe para impedir, y decirlo
  bien es diseño, no código.
- **El coste de cumplimiento por mercado.** Está declarado como diferencia entre
  las dos pantallas. Decidir si debe entrar en la cuenta de resultados como una
  línea más es una decisión de producto.

### Medido contra ficheros reales

**Nada.** Este carril no ha tenido acceso a ningún informe real de la cuenta, y
tampoco lo ha buscado: todas las cifras de este documento y de las pruebas salen
de fixtures sintéticas construidas para que la aritmética se pueda hacer a mano
(un producto a 100 € con IVA español, coste 5 €, comisión al 15 %).

> El repositorio es **público**. Aquí no hay ni una cifra real del negocio. Lo
> que haya que medir contra ficheros reales va al documento del proyecto
> `seller-hub/carriles-2026-09/5-rentabilidad.md`, o de vuelta al orquestador.
