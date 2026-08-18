# Aresstore Seller Hub — traspaso a sesión nueva

Estado a 18 de agosto de 2026, **con la v0.7 ya desplegada y verificada en
producción**. Este documento
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
tests/                cinco suites Playwright + generadores de fixtures
```

`./build.sh` ensambla, sella `v{VER} · {BUILD} UTC` en el pie, escribe un `sw.js`
con identificador de caché nuevo (que es lo que dispara la actualización en los
dispositivos) y valida la sintaxis. **Nunca editar `index.html` a mano**: se
sobrescribe en cada compilación.

---

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

### 3.5 · La cola de trabajo, en orden

Con el despliegue resuelto, el trabajo va en tres fases. Las dos primeras son
transversales; la tercera va herramienta a herramienta, y de cada una se hacen los
pasos 1 a 3 del método antes de pasar a la siguiente.

**Fase A · Inventario funcional honesto.** Recorrer cada pantalla y clasificarla
por lo que se haya comprobado *ejecutándola*: funciona / funciona a medias /
maqueta. El resultado va a la tabla de estado de `docs/METODO.md`. Lo que más
importa es lo que aparenta funcionar y no funciona.

**Fase B · Fontanería.** Entrada y salida de verdad:

- los doce informes del importador, verificados uno a uno en español y en inglés
  con fixtures realistas;
- copia de seguridad y restauración, ida y vuelta sin pérdida;
- las exportaciones de cada módulo;
- los accesos: app instalable con el icono correcto, autoactualización y
  funcionamiento sin conexión — incluido el manifest incrustado como `data:` URL
  que hace fallar `pwa.test.js` (§6). Cuidado ahí: **hay una app ya instalada en
  móvil y PC**, y los datos viven en el navegador.

**Fase C · Herramienta a herramienta**, en este orden:

| # | Herramienta | Trabajo pendiente |
|---|---|---|
| 1 | Datos · importador | verificar los doce informes uno a uno |
| 2 | Catálogo | verificar |
| 3 | Rentabilidad / P&L | M1.2 métricas que faltan (10 de 21) · M1.3 gastos indirectos con amortización diaria · M1.4 IVA como línea del P&L |
| 4 | Histórico (M0) | verificar |
| 5 | Inventario | M2 velocidad, cobertura y reposición |
| 6 | Compras y Tesorería | M3 caja y pedidos |
| 7 | Publicidad | M4 ACOS de equilibrio |
| 8 | Reembolsos | M5.1 y M5.2 detectores — no construido |
| 9 | Cumplimiento | M6 diferenciales europeos |

Queda además M1.5 (vistas y exportación de Rentabilidad), que se resuelve dentro
de la Fase B en lo que toca a exportar.

**Los pasos 4 y 5 del método —cargar datos reales y verificar contra la realidad—
son de Juancho y van al final, de una sola vez.** Lo que aparezca por el camino y
dependa de él se anota en `docs/PENDIENTE-JUANCHO.md` y se sigue.

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
- **El manifest y el apple-touch-icon van incrustados como `data:` URL** en
  `src/01-head.html`, mientras `build.sh` genera un `manifest.webmanifest` real y
  `vercel.json` le pone cabeceras de caché. Nadie enlaza ese archivo. `pwa.test.js`
  falla por esto (dos comprobaciones) y es un fallo anterior a M0, no una
  regresión. Consecuencia práctica: iOS Safari históricamente ignora los
  `apple-touch-icon` en `data:`, así que el icono de la pantalla de inicio en
  iPhone puede no ser el bueno. No se ha tocado a propósito: cambiar la URL del
  manifest en una app ya instalada en móvil y PC merece hacerse a conciencia y
  con una copia de seguridad descargada antes.
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
npm run fixtures     # informes de Amazon simulados, en inglés y en español
npm run test         # suite general
npm run test:es      # los informes en español dan las mismas cifras que en inglés
npm run test:m0      # el histórico no duplica, no pierde y detecta rotura
npm run test:m11     # los tres métodos de coste contra la cuenta hecha a mano
npm run test:all     # las cuatro de una vez
```

`tests/m11.test.js` está escrito con la aritmética de cada caso **en el comentario**
a propósito: si alguien cambia el motor y la prueba falla, tiene ahí la cuenta para
saber quién de los dos está equivocado. `M11-S` abre un contexto de navegador en
`Europe/Madrid`, porque el fallo de zona horaria era invisible corriendo en UTC.

`tests/pwa.test.js` es aparte: necesita la app servida en `http://localhost:8899`
(`python3 -m http.server 8899`) porque comprueba el service worker y el modo sin
conexión, que no funcionan sobre `file://`. Falla dos comprobaciones por lo del
manifest, y es anterior a M0.

---

## 8. Mensaje para arrancar la sesión nueva

> Retomamos el Aresstore Seller Hub. Lee primero `docs/METODO.md` —es la norma del
> proyecto, no una preferencia de estilo— y después `docs/TRASPASO.md` para el
> estado técnico. La cola de trabajo está en §3.5; lo que depende de mí, en
> `docs/PENDIENTE-JUANCHO.md`. No te pares a esperarme: anota y sigue.
