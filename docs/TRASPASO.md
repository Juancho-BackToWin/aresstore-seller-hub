# Aresstore Seller Hub — traspaso a sesión nueva

Estado a 19 de agosto de 2026, **con la v0.7 desplegada, la fontanería cerrada y
treinta y dos números creíbles y falsos corregidos con prueba** (§5). Este documento
es lo único que hace falta leer para retomar el proyecto desde cero. Todo lo demás
está en el repositorio.

---

## 1. Qué es esto

Herramienta propia de gestión del negocio de Amazon de Juancho (Grupo Arestora,
marcas **18KOra** y **VEHILEX**, joyería/pulseras, PanEU, ~3-10 k€/mes).
Sustituye a un Sellerboard en lo esencial sin depender de la API de Amazon: se
alimenta de los informes que se descargan a mano de Seller Central, **en español o
en inglés indistintamente**. Es una PWA de un solo archivo, instalable en móvil y
PC, que funciona sin conexión.

**Decisión de fondo del proyecto:** el 75 % del valor de Sellerboard no necesita
API. Se construye el núcleo financiero y de inventario; se compra lo fiscal
(Vendorati); se importa lo de investigación (Helium 10, ya pagado); no se toca
la automatización de pujas ni el autoresponder.

El razonamiento completo está en `docs/Aresstore-Seller-Hub-Plan.docx` (9 páginas,
regenerable con `node docs/plan-docx.js`) y el detalle técnico módulo a módulo en
`docs/PLAN-sellerboard.md`.

---

## 2. Dónde vive

| | |
|---|---|
| Repositorio | `github.com/Juancho-BackToWin/aresstore-seller-hub` (privado) |
| GitHub | creado. **No confundir con `arestora-hub`**, que es el proyecto Next.js de DeporteSeguro/EducaSeguro y no tiene nada que ver |
| Vercel | proyecto `aresstore-seller-hub`, cuenta *Juancho Back To Win's projects* |
| URL de producción | `aresstore-seller-hub.vercel.app` — el dominio limpio responde; el problema del `-nu` está resuelto |
| Despliegue | automático: cada commit en `main` se despliega solo |
| Versión en producción | **v0.7 (M0 + M1.1), desplegada y verificada el 18 de agosto de 2026** |

### Estructura

```
src/01-head.html      cabecera, CSS completo, lanzador de apps, barra lateral
src/02-views.html     Panel, Datos, Rentabilidad, Tesorería, Catálogo,
                      Inventario, Compras, Publicidad, Cumplimiento
src/03-calculadora.html  validador de producto (FBA/FBM) + comparador PanEU
src/04..07            Acerca de, auditoría, guía, cierre
src/10-const.js       países, tarifas, constantes fiscales
src/11-motor-validacion.js  motor de márgenes
src/12-datos.js       estado, persistencia e IMPORTADOR (lo más delicado)
src/12b-historico.js  M0 · archivo diario, rotura de stock, velocidad real
src/12c-lotes.js      M1.1 · lotes de coste, libro de unidades, tres métodos
src/13-render.js      navegación, render, modales, arranque, autoactualización
build.sh              ensambla index.html, sella versión, regenera sw.js
tests/                diez suites Playwright + generadores de fixtures (§7)
```

`./build.sh` ensambla, sella `v{VER} · {BUILD} UTC` en el pie, escribe un `sw.js`
con identificador de caché nuevo (que es lo que dispara la actualización en los
dispositivos) y valida la sintaxis. **Nunca editar `index.html` a mano**: se
sobrescribe en cada compilación.

---

## 2 bis. Estado del despliegue

**Lo que hay en producción es exactamente lo que hay en `main`.** Comprobado
sobre la URL servida, no sobre el repositorio: el `index.html` que devuelve
`aresstore-seller-hub.vercel.app` tiene el mismo SHA-256 que el de `main`
(`8218788…`), y `sw.js` responde con el identificador de caché de la última
compilación. Esa comprobación es la que cierra un despliegue; que el merge
aparezca en GitHub no dice nada de lo que se está sirviendo.

| | |
|---|---|
| PR #1 · `claude/verify-git-environment-nbjq49` | 15 commits · **mergeada** |
| PR #2 · `claude/margen-honesto` | 6 commits · **mergeada** |
| Suites | **11**, todas dentro de `npm run test:all` |
| Comprobaciones | **373**, `exit 0`, cero fallos |

### La trampa que costó el sexto commit de la PR #2

La serie de cinco commits del parche tocaba `src/` y **no** `index.html`. Aquí
Vercel no compila: sirve el `index.html` del repositorio tal cual (§3.0). Sin
recompilar y commitear el resultado, el merge habría desplegado producción con
el código anterior y el arreglo no habría llegado a la pantalla, con la PR en
verde y todo el mundo convencido.

No es una hipótesis: con el `index.html` que dejaba el parche, `tests/iva.test.js`
—la suite que traía el propio parche— fallaba con nueve fallos.

**Regla que se saca de ahí:** un cambio en `src/` no está terminado hasta que
`npm run build` está commiteado con él. Y `npm run build`, nunca `./build.sh`:
GitHub guarda sin bit de ejecución lo que se sube por la web.


## 3. Lo pendiente, en orden

### 3.0 · Despliegue — resuelto el 18 de agosto de 2026

La v0.7 (M0 + M1.1) **está desplegada y verificada en producción** en
`aresstore-seller-hub.vercel.app`. El histórico ya se está capturando.

Como M0 no llegó a correr nunca sobre la v0.6, **no hay ningún histórico guardado
con el fallo de zona horaria** que se arregló en la v0.7 (ver §5): no hay nada que
migrar. Si en algún momento apareciera un dispositivo con capturas de la v0.6, sus
claves de día anteriores al arreglo estarían un día por detrás y habría que
desplazarlas.

#### Cómo se despliega, y por qué no se toca

**Vercel no compila nada en este proyecto, y no debe.** `index.html` se genera en
local con `bash build.sh` y se sube ya compilado. Por eso `vercel.json` lleva:

```json
"installCommand": "echo sin dependencias",
"buildCommand":   "echo sin compilacion, index.html ya viene compilado",
"outputDirectory": "."
```

Esos tres valores no se tocan. Sin ellos el despliegue se rompe, y ya se rompió
dos veces por ahí:

1. `./build.sh: Permission denied` (exit 126). GitHub guarda **sin bit de
   ejecución** todo lo que se sube por la web, así que el script no era
   ejecutable en el contenedor de Vercel.
2. Aunque lo fuera, `build.sh` rasteriza los iconos con **Pillow**, que no existe
   en el contenedor de Vercel. La compilación no puede vivir allí.

Por el mismo bit de ejecución perdido, el script de npm es **`"build": "bash
build.sh"`**, no `"./build.sh"`. Corregido el 18 de agosto de 2026.

**`vercel.json` no admite claves libres.** Un `"//"` puesto como comentario tumba
el despliegue con `should NOT have additional property`. Lo que haya que
documentar va en el mensaje del commit o aquí, nunca dentro del JSON.

### 3.1 · Dominio — resuelto

El dominio limpio `aresstore-seller-hub.vercel.app` responde. El proyecto viejo
estaba borrado y Vercel tardó en reasignar la dirección; ya está hecho. Importaba
porque el icono del móvil y el marcador del PC apuntan a esa dirección, y porque
**los datos guardados están atados a ella** (viven en el navegador, no en el
servidor): un cambio de dominio equivale a empezar de cero.

### 3.2 · GitHub — resuelto

Repositorio privado `Juancho-BackToWin/aresstore-seller-hub`, conectado a Vercel.
Cada commit en `main` se despliega solo y la app se autoactualiza en los
dispositivos (lo dispara el identificador de caché nuevo que `build.sh` escribe en
`sw.js` en cada compilación). Ya no hay zips subidos a mano.

### 3.3 · M0 — hecho en v0.6

Lo que hace, y en qué se diferencia de lo que decía el plan:

- **No archiva los informes, archiva hechos diarios.** Guardar cada fichero entero
  reventaría el almacenamiento del navegador (unos 5 MB) en semanas, y el fallo
  llegaría en forma de «ya no puedo guardar». Se guarda por día y SKU: unidades,
  ingreso, impuesto, stock por país, precio y tarifas. Dos órdenes de magnitud
  menos de espacio y responde a las mismas preguntas.
- **La primera importación rellena hacia atrás.** El informe de pedidos trae su
  propio pasado (30–120 días), así que el histórico no empieza hoy. El rango que
  cubre el informe se sobrescribe en lugar de sumarse: reimportar no duplica.
  Está cubierto por prueba (`M0-D`), porque duplicar ventas en silencio es el
  fallo más caro que puede tener este módulo.
- **Días sin stock.** Se arrastra hacia delante la última foto de inventario y un
  día cuenta como roto solo si esa foto estaba a cero *y* además no se vendió
  nada. Las dos condiciones juntas. Con eso sale la **velocidad real** (unidades
  entre días con stock), que es lo que M2 necesitaba y ya está calculada.
- **Compactación a los 90 días** a resumen mensual, congelando antes el recuento
  de rotura porque después no se puede recalcular. Y si el navegador se queda sin
  sitio, `saveDB()` compacta a 30 días y reintenta antes de degradar a memoria.
- **Copia de seguridad**: aviso a los 7 días, alerta en el Panel si nunca se ha
  descargado, y `wipeImports()` ya no se lleva el histórico por delante.

Límite honesto que conviene no olvidar: **la resolución del histórico de stock es
la de la costumbre de importar**. Con una importación semanal se conoce el stock
de un día de cada siete; los otros seis son interpolación conservadora, no
medición. La interfaz lo dice en lugar de disimularlo.

### 3.4 · M1.1 — hecho en v0.7

Cada SKU pasa de tener un coste eterno a tener **lotes de compra**: fecha,
unidades, coste de fábrica y flete repartido. Vive en `src/12c-lotes.js` y se ve
en Catálogo, bajo la tabla de productos.

**Tres métodos de costeo**, elegibles con un botón:

- **Por periodo** (por defecto) — cada venta se costea con el lote vigente en su
  fecha. No necesita saber cuántas unidades quedaban, así que aguanta un registro
  de compras incompleto.
- **FIFO** — cada unidad consume el lote más antiguo disponible. Es el que refleja
  lo que pagaste por lo que vendiste, y el que más exige del registro.
- **Promedio ponderado** — media de las compras hasta la fecha de la venta,
  ponderada por unidades. El más estable y el que más tarda en enseñar un lote caro.

Cambiar de método cambia el beneficio del periodo sin que se haya vendido nada
distinto: es un cambio de criterio contable, no un dato nuevo. La pantalla lo dice.

**Lo que de verdad distingue este módulo no son los tres métodos, es el libro de
unidades.** El coste sale del método elegido; el **recuento** sale siempre del
mismo sitio, para los tres. Es lo que separa «existe un lote con fecha anterior a
esta venta» de «había unidades», que son cosas distintas y confundirlas era el
fallo más caro que tuvo este módulo mientras se construía. Cada unidad vendida
queda clasificada:

| origen | qué significa |
|---|---|
| `lot` | respaldada por una compra registrada **con unidades suficientes**. La única que cuenta como medida |
| `open` | anterior a toda compra registrada: stock de apertura, se costea al **coste base** del producto |
| `tail` | tienes la compra, pero está fechada **después** de la venta: tenías el papel, no la mercancía |
| `stale` | consumió un lote anterior al informe sin poder cuadrar cantidades (falta el stock de ese SKU) |
| `base` | el producto no tiene ningún lote |

**El cuadre de unidades**, que es la cuenta que lo sostiene todo:

```
sobra = comprado − vendido neto de devoluciones − stock de hoy
falta = vendido neto + stock de hoy − comprado
```

Si **sobra**, esas unidades se vendieron antes de que empezara tu informe de
pedidos, y se descuentan de la **cabeza** de la cola. Sin esto, un contenedor
barato de hace un año seguía entero en la cola y FIFO lo volvía a gastar: el coste
salía hasta un 44 % por debajo y el semáforo en verde.

Si **falta**, se antepone un **lote de apertura** por esa cantidad al coste base.
Sin esto la cola tenía unidades, pero eran del lote equivocado: el recuento decía
98 % medido mientras el coste se iba un 33 % arriba.

Las dos correcciones son simétricas, una por cada extremo de la cola, y las dos
corrigen **el número**, no solo la etiqueta.

**Lo demás que trae M1.1:**

- Editor de lotes y **carga por pegado** desde una hoja de cálculo (SKU, fecha,
  unidades, coste de fábrica, flete), con vista previa y con la pregunta explícita
  de si el flete es por unidad o total del lote — confundirlas mete un factor de
  cientos en el margen y el número sigue pareciendo creíble.
- **El pedido de compra crea el lote**, con el flete repartido y **fechado el día
  de recepción**. Sin fecha de recepción no crea nada y lo dice: la mercancía que
  sigue en un barco no puede haber surtido ninguna venta.
- El coste base del producto **ya no se sobrescribe** al recibir un pedido. Antes
  sí, y eso reescribía hacia atrás el margen de todo lo vendido con el lote
  anterior.
- El **capital inmovilizado** de Inventario se valora al coste del último lote
  comprado, que es el coste de reposición.
- El **beneficio por mercado** imputa a cada país el coste de lo que ese país
  vende, en vez de repartir el coste medio entre todas las unidades. Antes el
  mercado que vendía el producto caro salía igual de rentable que el que vendía el
  barato, o mejor, que es justo al revés.

**Lo que necesita de Juancho:** los lotes reales de sus cinco familias, y el hábito
de importar **también el informe de inventario**. Sin el stock no se puede hacer el
cuadre, y sin el cuadre el módulo trabaja a ciegas — y lo dice en pantalla.

### 3.5 · La cola de trabajo, y dónde va

**Fase A · inventario funcional honesto — hecha.** Cada pantalla recorrida
ejecutándola, no leyéndola, y clasificada en la tabla de estado de
`docs/METODO.md`. Resultado corto: ninguna pantalla es una maqueta, pero
**Cumplimiento es un registro manual** (rellenas tú, no lee ningún informe) y el
**Validar producto / Comparador PanEU es una calculadora independiente** que no
usa los datos importados.

**Fase B · fontanería — hecha.**

- Los **doce informes**, uno a uno, en inglés, y los siete traducibles también en
  español (`tests/informes.test.js`). Faltaban fixtures de liquidación, salud del
  inventario, reembolsos e IVA en inglés y del libro de inventario en español, así
  que cinco caminos de detección no los probaba nadie. Se importan **de uno en
  uno** a propósito: en lote, un informe identificado como otro queda tapado.
- La prueba pregunta además si lo reconocido **alimenta algo**. Tres se guardan
  enteros y no llegan a ningún número: libro de inventario, tarifas de
  almacenamiento e IVA por país. La pantalla de Datos lo dice en vez de lucir un
  tick, y la prueba se rompe si esa lista cambia (ver P-10).
- **Copia de seguridad y restauración**: ida y vuelta sin pérdida, comparando los
  números calculados y no el JSON (`tests/salida.test.js`).
- **Exportaciones**: siete, una por módulo, que no existían.
- **Accesos**: `pwa.test.js` en verde y dentro de `test:all`, con servidor propio.

**Fase C · herramienta a herramienta.** Pasos 1 a 3 del método cerrados en todas
las que ya existen; lo que queda por construir es esto, en este orden:

| # | Módulo | Qué es | Necesita de Juancho |
|---|---|---|---|
| 1 | **M1.2** | las 10 métricas que faltan de las 21 de Rentabilidad | — |
| 2 | **M1.3** | gastos indirectos con amortización diaria | P-4 |
| 3 | **M1.4** | IVA como línea propia del P&L | — |
| 4 | **M2** | velocidad, cobertura por país y previsión de reposición | P-3 |
| 5 | **M3** | compras y caja: cuándo lanzar el pedido | P-5, P-6 |
| 6 | **M4** | ACOS de equilibrio | — |
| 7 | **M5** | detectores de reembolso (5.1 y 5.2) | — |
| 8 | **M6** | diferenciales europeos de cumplimiento | — |

Los pasos 4 y 5 del método —cargar los datos reales y contrastarlos con el
negocio— son de Juancho y van al final, de una sola vez.

## 4. Lo que hace falta de Juancho (datos, no decisiones)

La lista viva, con el contexto de cada punto y ordenada por lo que más desbloquea,
está en **`docs/PENDIENTE-JUANCHO.md`**. Resumen:

1. La **comisión real** de Amazon en joyería (P-1) — lo que más distorsiona el
   margen ahora mismo: estamos calculando al 15 % por defecto.
2. Los **lotes de compra reales** de sus cinco familias (P-2).
3. El **hábito semanal** de importar pedidos **e inventario** (P-3). Desde M1.1 el
   inventario ya no es opcional: es lo que permite cuadrar cantidades.
4. La **lista de gastos fijos** mensuales (P-4).
5. **Plazos y condiciones de pago** de sus dos proveedores (P-5).
6. La consulta escrita a Seller Support sobre la **base de la comisión** (P-6).

## 5. Errores ya corregidos — no reintroducir

Cada uno costó una iteración. Están documentados aquí para que nadie los repita.

### Del modelo financiero (v0.4–v0.5)

- **Margen bruto que solo restaba el coste de producto.** Daba 72 % y estaba
  siempre en verde. Sustituido por *margen de contribución* (precio − coste −
  comisión − tarifa FBA), que da 33,5 %.
- **Devoluciones modeladas como un 3 % del PVP.** Falso y optimista justo en
  categorías de devolución alta. Ahora se modela la mecánica real: la tarifa FBA
  no se devuelve, la tasa de gestión del reembolso es `mín(5 €, 20 % de la
  comisión)`, hay tasa de procesamiento de devolución, y solo las unidades
  revendibles recuperan coste de producto.
- **Comparador de países determinista.** Alemania ganaba siempre porque solo
  variaba el IVA. Ahora cada país tiene PVP, tarifa, unidades y gestoría
  editables, y un mercado puede salir con margen unitario positivo y contribución
  anual negativa.

### Del importador

- **`normHdr` eliminaba los acentos en vez de plegarlos.** Este único fallo hacía
  imposible reconocer la mitad de las cabeceras en español. La función `fold()`
  es intocable.
- **Huella de contenido usada como filtro excluyente.** Descartaba informes en
  español. Ahora la identificación es por puntuación aditiva (`scoreReport`), con
  evidencia negativa (`forbid`) y campos obligatorios.
- **Alias laxos que casaban con columnas vacías.** La vista previa de tarifas se
  identificaba como pedidos. Se exige `orderId` en pedidos y devoluciones y se
  descartan columnas sin valores.
- **CSV español desalineado** (decimales con coma y separador coma): desplazaba
  todas las columnas dos posiciones y «Gasto» leía otra cosa. Ahora `parseDelimited`
  detecta el desajuste de recuento de celdas y **rechaza la importación**. Es la
  protección más importante del importador: el peor fallo posible no es un error
  visible, son números creíbles y falsos.

### De la construcción

- **Parche aplicado a un archivo intermedio que nunca llegaba al compilado.** De
  ahí que el código fuente esté separado en `src/` y solo se toque ahí.
- **`salesRows()` aplicaba el filtro de periodo y de país de la interfaz.** El
  histórico lo llamaba y archivaba solo lo que estuvieras mirando en pantalla.
  Ahora acepta `{from:null, country:'ALL'}` y por defecto se comporta igual que
  antes.

### Del despliegue (v0.7)

- **Vercel intentando compilar.** `./build.sh: Permission denied`, exit 126:
  GitHub guarda sin bit de ejecución lo que se sube por la web. Y aunque lo
  tuviera, `build.sh` necesita **Pillow** para rasterizar los iconos y en el
  contenedor de Vercel no está. La compilación se hace en local y se sube el
  `index.html` ya compilado; `vercel.json` neutraliza `installCommand` y
  `buildCommand` (§3.0).
- **Mismo bit de ejecución, en npm.** `"build": "./build.sh"` fallaba por lo
  mismo. Ahora es `"build": "bash build.sh"`, que no depende del permiso.
- **Una clave `"//"` de comentario en `vercel.json`.** El esquema de Vercel no
  admite claves libres: tumba el despliegue con `should NOT have additional
  property`. Lo que haya que explicar va en el commit o en este documento.

### De M1.1 — todos encontrados en revisión adversarial, todos con prueba

Cada uno de estos daba un número **creíble y falso**, que es el único fallo que
importa en un motor de costes: un error visible se arregla, un margen equivocado
hace que se escale un producto que pierde dinero.

- **`iso()` serializaba en UTC fechas construidas en local.** En España toda fecha
  volvía como el día anterior: una venta del 15 se archivaba como del 14 y, el día
  en que cambiaba un lote, el margen salía con el precio equivocado (44 % de error
  en ese día). No se veía en las pruebas porque el navegador de pruebas corre en
  UTC. Ahora `iso()` formatea en hora local y **`M11-S` corre en `Europe/Madrid`**.
  La usan a la vez M0 y M1.1: tiene que seguir siendo una sola función.
- **FIFO regastaba el contenedor viejo.** La cola arrancaba con todo lo comprado
  nunca, pero solo se consumía con las ventas del informe. Corregido con el
  recorte del sobrante (§3.4).
- **El coste base dejaba de usarse en cuanto había un lote.** Las ventas anteriores
  al primer lote se costeaban con el precio de ese lote, que es reescribir el
  pasado con un precio que en ese momento no existía. Ahora van al coste base y se
  cuentan como `open`.
- **`applyPOCosts` machacaba `p.cogs`.** Recibir un contenedor en agosto subía el
  coste de una venta de marzo. Ya no lo toca.
- **El lote se fechaba con la llegada prevista o con la fecha del pedido.** Un
  pedido cursado hace 45 días y todavía en un barco subía un 61 % el coste de
  ventas ya servidas con stock viejo. Ahora solo la fecha de recepción, y sin ella
  no crea lote.
- **Un pedido con el mismo SKU en dos líneas** perdía la mitad de las unidades y
  escribía un flete negativo. La clave del lote lleva el índice de línea y el
  flete se resuelve por línea (`poUnitCostOf`).
- **Dos lotes con la misma fecha** daban hasta el triple de coste según el orden en
  que se hubieran tecleado. Ahora se funden (`mergedLots`) antes de cualquier
  cálculo, en los tres métodos.
- **`costNow` pasaba por FIFO** y el valor del inventario cambiaba tres veces según
  si el informe traía o no una venta de hoy. Valorar existencias es siempre
  «cuánto cuesta reponerlo».
- **El stock se daba por conocido globalmente.** Bastaba una fila de cualquier SKU
  para que el hub diera por conocido el stock de todo el catálogo y asignara cero a
  los demás, con lo que el recorte se comía el almacén: unidades en la estantería
  contadas como vendidas y un coste un 111 % más alto. Ahora `seen` es por SKU.
- **El informe multipaís se leía y se tiraba.** Ahora suma
  `quantityforlocalfulfillment`, pero solo para los SKU que no vengan en el de
  inventario: sumar los dos contaría el mismo stock dos veces.
- **El reparto de orígenes en FIFO se prorrateaba sobre el mix global**, con lo que
  contaba dos veces los productos sin lotes. Ahora el libro devuelve el reparto por
  SKU y día y se prorratea dentro del día.
- **Las devoluciones se colaban en el cuadre.** El libro cuenta ventas brutas y el
  stock del informe viene neto, así que la tasa de devolución inventaba un lote de
  apertura de ese tamaño. Ahora se restan.
- **`period` y `avg` decían «van al coste base» y no lo hacían.** El origen salía
  del libro y el coste de otro sitio, así que las unidades de apertura se cobraban
  al precio del lote: 34 % de coste de más en el hueco de registro más común.
  Ahora se mezcla dentro del día.

---

### De la revisión adversarial del 18 de agosto de 2026 — veinte, todos con prueba

Tres pasadas adversariales sobre Rentabilidad y Panel, Inventario e Histórico, y
Tesorería y Compras, buscando **el número creíble y falso** y demostrándolo
ejecutando, no razonando. Salieron veinte. Ninguno daba error en pantalla.

**Los que sellaban como medido lo que no lo estaba:**

- **`measured = sf.rows > 0`.** Bastaba que hubiera filas de liquidación en el
  periodo. El fichero plano de Amazon tiene **dos esquemas** y este lector solo
  entiende el viejo, con `item-related-fee-type`; el que Amazon sirve hoy trae
  `amount-type`. Con ese, las filas entraban, ninguna columna de tarifa se
  reconocía, y la comisión salía **0 € declarada medida**: +23,4 % de beneficio.
  Ahora `matched` cuenta solo las filas cuyas columnas se entienden.
- **Una liquidación de 14 días midiendo 90.** Amazon liquida cada dos semanas, así
  que mirar un trimestre con una liquidación cargada es lo normal: se restaban 14
  días de comisiones a 90 de ingresos. +20,4 %. Ahora la liquidación aporta su
  rango: lo que cubre va medido y el resto estimado.
- **Una categoría de tarifa ausente contada como cero.** Cobrar 0 € de comisión
  sobre ventas reales no le pasa a nadie: es que el concepto no venía en el
  fichero. Se estima y se deja de llamar medida.
- **«No se ha detectado ningún día de rotura»** dicho sin una sola foto de
  inventario dentro de la ventana. Una ausencia de medición presentada como
  medición.

**Los que dependían de dónde estabas mirando, no de los datos:**

- **`periodDays || 30`.** «Todo» es `periodDays = 0`, y ser cero lo hacía falsy:
  todo lo que dividía por él caía al literal 30. Cuatro meses de ventas contra un
  mes de gastos fijos (+10,9 puntos de margen), «Aporta al año» ×12,17 sobre lo
  que ya eran cuatro meses (66.635 € donde eran 4.100 €), y la velocidad de venta
  ×4: Inventario mandaba pedir 2.156 unidades donde tocaban 311.
- **La velocidad dividida por el periodo pedido y no por el observado.** Pedir
  «12 meses» con un informe de cuatro hundía la velocidad a un tercio y hacía
  desaparecer de la pantalla la única referencia en rotura.
- **El filtro de país dividía las ventas y dejaba el stock entero.** El stock de
  FBA es europeo y no se puede trocear: con España seleccionada, una referencia
  que se agota en 30 días aparecía con 60 de cobertura.
- **El gasto de publicidad se cargaba entero a cualquier periodo.** Con ventas
  idénticas día a día, el margen iba de −58,6 % a −13,6 % según el botón.

**Los que invertían un ranking, que es lo que dirige la atención al sitio equivocado:**

- **Tres bases distintas para el mismo «ingreso neto»**: el P&L con el IVA real,
  la ABC dividiendo entre 1,21 clavado y la tabla de mercados con el IVA nominal
  del país. Dos SKU económicamente idénticos, uno alemán y otro español, salían
  con un 85 % de diferencia de beneficio y el alemán —el mejor de los dos— se
  llevaba la «C».
- **La clase ABC se decidía por el acumulado DESPUÉS** de sumar el producto, así
  que el que cruzaba el 80 % nunca entraba en A. Con un solo producto rentable
  salía «C» y el veredicto remitía a una categoría A vacía.
- **La comisión al 15 % para todo el catálogo**, ignorando el campo por producto
  que es editable en Catálogo, y también el informe de vista previa de tarifas,
  que se importaba y no llegaba a ningún número. En joyería son seis puntos.

**Los que hacían parecer sana la caja:**

- **`dayCogsFlow = 0`.** La curva proyectaba un negocio que vende noventa días y
  no vuelve a comprar género. El ejemplo pasaba de «mínimo 1.424 €, aguanta» a
  −232 € y descubierto, y encima recomendaba un pedido adicional de 7.000 €.
- **`daysBetween` restaba milisegundos entre un instante y una medianoche.** A
  partir de las 12:00 locales el vencimiento de HOY salía en −1 y el filtro `k>=0`
  lo tiraba: 2.500 € de 10.000 desaparecidos, y por la mañana un número y por la
  tarde otro. Misma familia que el fallo de `iso()`.
- **Lo vencido y sin pagar no entraba en la curva** mientras el KPI seguía
  contándolo: una deuda que la proyección no gastaba nunca.
- **El gráfico dibujaba la altura por valor absoluto**: −6.000 € idéntico a
  +6.000 €, y cuanto más hondo el agujero más alta la barra.
- **El aviso rojo estaba detrás de «no hay pedidos ni gastos»**, que es el estado
  de quien acaba de empezar: noventa días en negativo sin una línea roja aquí,
  mientras el Panel sí avisaba con los mismos datos.

**Los que contaban dos veces, o ninguna:**

- **Las devoluciones se contaban y no restaban nada.** Un producto con el 100 % de
  devoluciones daba el mismo beneficio que uno con cero.
- **El cuadre de Catálogo se recalculaba en la pantalla con las ventas brutas**
  mientras el motor recortaba con las netas: la columna decía «+1812» junto a la
  frase «1824 se vendieron antes», y un SKU que cuadraba exacto llegaba a mostrar
  «−5» pegado a «cuadra exactamente».
- **Un SKU que solo venía en el informe multipaís valía cero unidades** en
  Inventario y en el histórico, mientras la tabla de al lado enseñaba sus 1.400.
- **«Pedir» ignoraba lo que ya estaba en un barco**: 753 unidades de sobrecompra
  y una alarma de rotura falsa.
- **«Capital en mercancía · pedidos en curso»** contaba los ya recibidos, que
  Inventario ya valora.
- **Las ventas a mercados fuera de `COUNTRIES`** —el Reino Unido— se evaporaban de
  la tabla de mercados: un 33 % de la facturación.

**Los de etiqueta, que también engañan:**

- **«Cobertura media 119 d»** era la media aritmética de coberturas por SKU, con
  tope 365 y el centinela de venta cero colándose como 365 días. Ahora es la
  cobertura de la cartera: totales entre totales, sin promediar ratios.
- **«Plazo medio»** era la media de las fichas de proveedor: crear la ficha de uno
  rápido al que no le compras nada bajaba tu plazo de 33 a 23 días.
- **«Margen neto 0,0 %»** con 900 € de pérdidas y cero ventas.
- **La historia acumulada se inventaba hasta 30 días**, tomando el día 1 del mes
  compactado más antiguo, y la rotura compactada se apilaba entera en el primer
  mes: 110 días de rotura dentro de un mes con 2 días archivados.

**Y uno que no era un número, sino una pérdida:**

- **Restaurar aceptaba cualquier JSON.** Un objeto cualquiera pasaba el filtro,
  reemplazaba la base entera y `saveDB()` lo dejaba escrito sin preguntar. El
  histórico —lo único que no se puede reconstruir descargando informes otra vez—
  desaparecía por soltar el fichero equivocado.

### De la PR #2 — doce más, y ninguno de aritmética

La revisión anterior dejó el motor limpio de cuentas mal hechas. Estos doce son
de otra clase, y por eso sobrevivieron: **de rótulo y de premisa**. Un número
equivocado se corrige; una etiqueta de máxima confianza puesta sobre un número
frágil es la que hace que alguien decida con él.

**La base del IVA, que invertía el orden entre mercados**

- **El impuesto es una columna OPCIONAL del informe de pedidos.** Sin ella,
  `tax` valía 0, el «ingreso neto» pasaba a ser el bruto y no se decía nada. No
  solo inflaba el margen 4,5 puntos: **invertía el ranking de mercados**. Amazon
  cobra la comisión sobre el precio con IVA, así que el país de tipo más alto es
  genuinamente el peor; sin la columna salía el mejor. Medido con tres mercados:
  `DE > ES > SE` se convertía en `SE > ES > DE`.
- **La suite era estructuralmente incapaz de verlo**: `tests/pnl.test.js` fija
  `itemtax:'0'` en su laboratorio, así que cuatrocientas y pico comprobaciones de
  rentabilidad corrían sobre un negocio sin IVA. Por eso el arreglo empieza por
  `tests/iva.test.js`, con el IVA como eje de prueba y no como constante.
- **Dónde se arregla de verdad no es Rentabilidad, es Datos.** Deducir el IVA
  salva el número, pero deducir no es leer: se arregla volviendo a descargar el
  informe con la columna. Un aviso puesto solo junto al margen está puesto donde
  ya no se puede hacer nada.

**«Medido», que se regalaba de tres formas distintas**

- **El Panel decía «medido» a secas** con una liquidación que cubría el 15,6 %
  del periodo, mientras Rentabilidad decía «16 % reales». La pantalla que más se
  mira era la que menos matizaba.
- **Una cobertura del 99,97 % se redondeaba a 100** y la insignia saltaba a
  «medido». El redondeo es para enseñar, no para decidir.
- **La salvedad de la tarifa FBA colgaba de la cobertura de COMISIÓN.** Una
  liquidación con solo líneas de comisión presentaba como medida una tarifa FBA
  íntegramente estimada. Son dos conceptos y ahora se dicen por separado.

Principio que queda escrito: **la etiqueta la fija el eslabón más débil.** La
insignia exige base de IVA leída, publicidad con duración conocida y comisión
medida; si falla uno, no hay «medido».

**Los que movían dinero**

- **La caja daba crédito de días a cualquier pedido no cerrado.** Un pedido ya
  RECIBIDO está en la estantería y su coste ya viajó al lote: contarlo otra vez
  es contarlo dos veces. Un BORRADOR no es un pedido. Y 600 unidades de un SKU no
  reponen las ventas de otro. Medido: la salida de 90 días pasaba de 36.000 € a
  12.000 € con un pedido recibido **de otro producto**.
- **Publicidad sin rango de fechas era muda por partida doble**: el aviso vivía
  detrás de `adDays>0` y la etiqueta decía «estimado a diario», que describe otro
  camino. El gasto entero se cargaba al periodo que miraras, de una semana o de
  un año.
- **Las devoluciones no tienen país en el informe**, así que con el desplegable
  en España se restaban las de los nueve mercados contra las ventas de uno. Ahora
  se reparten por cuota de ventas y la pantalla dice que es un reparto.
- **La venta se cobraba al tipo del informe de tarifas y la devolución
  reintegraba al 15 % por defecto.** Con una categoría al 8 %, cada devolución
  devolvía un 15 % que nunca se pagó. Dos copias de la misma regla siempre
  divergen: ahora hay una sola función.

**Inventario contradiciéndose consigo mismo, y una copia vacía**

- **`enCamino` entraba en «Pedir» pero no en la cobertura ni en el riesgo**: una
  referencia con 900 unidades llegando seguía pintada «tarifa bajo inv.» mientras
  la columna de al lado decía que no había que pedir nada. Son dos preguntas
  distintas — la tarifa la cobra Amazon por lo que hay **en el almacén**, y la
  mercancía que navega no cuenta — y ahora se responden por separado.
- **El histórico archivaba stock CERO** para el SKU que solo viene en el informe
  multipaís, guardando a la vez sus 1.400 unidades por país en el mismo registro.
  En el histórico un cero significa rotura, así que la referencia quedaba en
  rotura permanente y su velocidad real salía inflada — justo el número que M2 va
  a usar para reponer. `invStats` ya hacía el respaldo; `captureStock` se había
  quedado fuera.
- **`{"products":[],"settings":{},"imports":{}}` tiene la forma de una copia**,
  así que pasaba el filtro, borraba el histórico y dejaba `DB.settings` sin
  `cash`. Tesorería y el P&L reventaban **después**, lejos de donde se causó el
  daño.

Y una lección de método que vale más que cualquiera de los doce: **una suite que
fija una variable como constante es ciega a los fallos de esa variable.** El IVA
llevaba cuatrocientas comprobaciones puesto a cero.

## 6. Riesgos abiertos y límites honestos

- **La base de la comisión no está cerrada.** El contrato europeo la define sobre
  el precio con impuestos, y así está implementada, pero hay fuentes que sostienen
  lo contrario con el servicio de cálculo de IVA activado. Son más de tres puntos
  de margen. Merece consulta escrita a Seller Support.
- **El recorte del sobrante empuja hacia los lotes más nuevos, no hacia arriba.**
  Como no cuenta el stock en tránsito ni el reservado, si hay mercancía en un
  barco recorta de más. Con precios subiendo eso sale prudente; con precios
  bajando sale optimista. No es un fallo, es el sesgo del método, y conviene
  tenerlo presente antes de decidir con el margen de un mes concreto.
- **FIFO ignora las devoluciones en el consumo de la cola.** Se restan del cuadre,
  pero una unidad devuelta ya consumió lote: la cola avanza algo más rápido de lo
  que corresponde. Con un 5 % de devoluciones el sesgo es pequeño pero sistemático.
- **El beneficio proyectado es lineal.** Multiplicar margen por unidades asume que
  el coste publicitario por unidad no sube al escalar, y sube. Tratarlo como techo,
  nunca como previsión.
- **PPWR: la fecha del 12 de agosto de 2026 ya ha pasado** y hay mercados activos
  sin registro de EPR completo. Es el único riesgo real de bloqueo de listados, y
  no es un problema de software: no se arregla programando.
- **No están modeladas** las sobretasas de utilización de almacenamiento ni de
  inventario añejo.
- **La fase del ciclo de cobro de Amazon se asume.** La proyección sitúa el
  primer cobro a un ciclo completo desde hoy, que es lo más prudente, pero la
  fase real es desconocida y con los datos de ejemplo mueve la caja mínima entre
  1.424 € y 5.501 € sin que cambie ningún dato. Está dicho en «Supuestos» y es
  P-8 en la lista de Juancho.
- **La tasa de procesamiento de devolución no está modelada.** Depende de la
  categoría y del porcentaje de devoluciones de cada referencia. Si Amazon la
  cobra, el beneficio real es menor que el que enseña la pantalla; la pantalla lo
  dice en vez de inventarse el importe. Es P-9.
- **El gasto de publicidad se prorratea.** El informe de términos de búsqueda no
  trae fecha por fila, solo su rango, así que el gasto se reparte suponiendo que
  se invierte parejo. Es una cifra ajustada, no medida, y la pantalla lo dice con
  el porcentaje de solape. Tampoco trae país: con un mercado filtrado, el gasto
  que se ve es el de todos.
- **Tres informes se importan y no alimentan nada**: libro de inventario, tarifas
  de almacenamiento e IVA por país. Sus módulos no existen todavía. La pantalla de
  Datos lo dice y `informes.test.js` se rompe si la lista cambia sin que nadie
  actualice lo que se promete. Es P-10.
- **Con «365 días» y un informe más corto, el margen sale por debajo del real**:
  las ventas son las que hay y los gastos fijos se cuentan por los 365 días
  completos. Se dice en pantalla. Es conservador a propósito.
- **El histórico solo mide la rotura los días que tienen foto de inventario.** Con
  una foto semanal, la velocidad real se queda un 23 % por debajo de la verdadera;
  sin ninguna, colapsa a la media simple (−33 %) y la pantalla dice que no puede
  saberlo en vez de afirmar que no hubo rotura. Es P-3.
- **`localStorage` sigue siendo el único sitio donde vive el histórico.** M0
  reduce mucho el riesgo de llenarlo, pero no elimina el de que el navegador
  libere espacio o alguien borre datos de navegación. La copia de seguridad
  semanal no es una recomendación, es parte del diseño.
- Los datos son tan frescos como la última importación. Un panel que se actualiza
  solo cambia el comportamiento; uno que depende de acordarse, no.

---

## 7. Pruebas

```bash
npm install                    # playwright (los navegadores ya están en el entorno)
pip3 install Pillow            # solo para build.sh: rasteriza los iconos
bash build.sh                  # ensambla index.html · nunca editarlo a mano
npm run fixtures               # informes de Amazon simulados, en inglés y en español
npm run test:all               # las once suites de una vez · 373 comprobaciones
```

| Suite | Qué sujeta |
|---|---|
| `test` (`hub.test.js`) | navegación, importación en lote, panel, rentabilidad, persistencia |
| `test:es` | los informes en español dan las mismas cifras que en inglés |
| `test:m0` | el histórico no duplica, no pierde y detecta rotura |
| `test:m11` | los tres métodos de coste contra la cuenta hecha a mano |
| `test:pnl` | tarifas, comisión, base del ingreso neto, periodo, publicidad, devoluciones |
| `test:iva` | el IVA como eje de prueba: base leída, base deducida, y el orden entre mercados |
| `test:caja` | la proyección de caja a 90 días, incluido el gráfico medido en píxeles |
| `test:inv` | cobertura, velocidad, reposición y honestidad del histórico |
| `test:informes` | los doce informes uno a uno, y **qué alimenta cada uno** |
| `test:salida` | copia de seguridad, restauración y las siete exportaciones |
| `test:pwa` | instalable, iconos, autoactualización y sin conexión. Levanta su propio servidor |

Las pruebas llevan **la aritmética del caso en el comentario** a propósito: si
alguien cambia el motor y una falla, tiene ahí la cuenta para saber quién de los
dos está equivocado. Varias corren en `Europe/Madrid`, porque el fallo de zona
horaria era invisible en UTC.

Tres cosas que estas suites hacen a propósito y conviene no deshacer:

- **`informes.test.js` importa de uno en uno.** En lote, un informe identificado
  como otro queda tapado porque el segundo pisa al primero y las cuentas siguen
  saliendo.
- **`salida.test.js` lee el CSV que se habría descargado**, interceptando el
  Blob. Comprobar que el botón existe no dice nada: un botón que produce un
  fichero vacío pasa esa prueba. Así salió que los lotes se exportaban a coste 0.
- **`caja.test.js` mide el gráfico en píxeles del DOM**, no leyendo el CSS. El
  fallo era que una barra negativa se dibujaba igual que una positiva.
- **`iva.test.js` no fija el impuesto como constante.** El resto de suites de
  rentabilidad usan `itemtax:'0'` para que las cuentas salgan redondas, y eso las
  hacía estructuralmente incapaces de ver un fallo en la base del IVA. Si alguien
  «simplifica» esta suite poniendo el impuesto a cero, deja de servir para nada.
- **`salida.test.js` suelta el fichero en el input de verdad** en vez de
  reimplementar el filtro de restauración dentro de la prueba. Una prueba que
  reimplementa lo que comprueba solo se comprueba a sí misma.

## 8. Mensaje para arrancar la sesión nueva

> Retomamos el Aresstore Seller Hub. Lee primero `docs/METODO.md` —es la norma del
> proyecto, no una preferencia de estilo— y después `docs/TRASPASO.md` para el
> estado técnico. La cola de trabajo está en §3.5; lo que depende de mí, en
> `docs/PENDIENTE-JUANCHO.md`. No te pares a esperarme: anota y sigue.
