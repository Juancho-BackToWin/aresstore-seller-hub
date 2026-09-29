# Propiedad · quién puede tocar qué

Diez carriles trabajando a la vez sobre un código que vive casi entero en dos
ficheros (`src/12-datos.js`, 1.490 líneas; `src/13-render.js`, 1.760) se pisan
seguro si no hay una regla escrita. Esta es la regla.

Cada carril trabaja en su worktree, en la rama `carril/<n>-<nombre>` creada
desde `base/2026-09`, y **solo puede editar lo que es suyo**:

- los ficheros nuevos que cree (`src/2x-*.js`, `tests/<carril>*.test.js`,
  `tests/fixtures-<carril>/`, `docs/carriles/<carril>.md`);
- las funciones existentes que le asigna la tabla, y nada fuera del cuerpo de
  esas funciones;
- su propio bloque `<section id="view-...">` en `src/02-views.html`, si la tabla
  le da esa vista.

Si necesita cambiar algo que no es suyo: **no espera y no lo edita**. Lo
implementa en mínimo en su propio fichero, marcado
`// COSTURA → carril N: <qué y por qué>`, y lo apunta en su documento. La
integración lo unificará.

## Congelado para todos

`iso()` · `vatReport()` · `stockCruce()` · `stockSnapshotDate()` ·
`captureStock()` · `go()` · `refreshAll()` · `loadDemo()` ·
`src/01-head.html` · `build.sh` · `src/19-registro.js`

Solo se tocan con una prueba roja escrita antes y documentada, y aun así se
prefiere la costura. **Ninguna prueba existente se debilita**: se pueden añadir
casos, nunca quitar ni relajar uno.

> `paisDeJuris()` aparecía en la lista de congelados del encargo, pero **no
> existe en esta base** (ver «Lo que no está», abajo). No hay nada que congelar.

## La tabla

| Carril | Rama | Funciones existentes que son suyas | Ficheros nuevos |
|---|---|---|---|
| 1 · Importador | `carril/1-importador` | `readSmart`, `parseDelimited`, `sheetSig`, `sheetProfile`, `colProfile`, `scoreReport`, `detectReport`, `resolveFields`, `normalizeRows`, `saveImport`, `openMapper`, `wipeImports`, `forgetMappings`, `imp`, `hasImp`, `gv`, `normHdr`, `fold`, `toNum`, `hayNumero`, `countryOf`; las definiciones `orders`, `returns`, `fees`, `vat` y `multicountry` de `REPORTS`; `renderDatos` | `src/20-importador.js` |
| 2 · Catálogo y costes | `carril/2-catalogo` | `renderCatalogo`, `addProduct`, `editProduct`, `exportCatalogo`, `renderLotes`, `lotFields`, `lotAddModal`, `lotEditModal`, `lotPasteModal`, `lotSummary`; en `12c-lotes.js`, todo salvo `poLotDate` y `lotFromPO` | `src/21-catalogo.js` |
| 3 · Transacciones y reclamaciones | `carril/3-reclamaciones` | `settlementFees`; definiciones `settlement`, `reimb` y `ledger` | `src/22-transacciones.js`, `src/23-reclamaciones.js`, vista nueva |
| 4 · Publicidad | `carril/4-publicidad` | `adStats`, `renderPub`, `exportPublicidad`; definición `searchterm` | `src/24-publicidad.js` |
| 5 · Rentabilidad | `carril/5-rentabilidad` | `taxBasis`, `pnl`, `pnlAll`, `skuStats`, `countryStats`, `renderPanel`, `renderRent`, `exportRentabilidad`, `kpi`, `tbl`, `noData`, `freshness` | `src/25-metricas.js` |
| 6 · Fechas, inventario y reposición | `carril/6-inventario` | `parseDate`, `today`, `addDays`, `startOfDay`, `daysBetween`, `periodStart`, `daysInPeriod`, `salesSpan`, `salesRows`, `setPeriod`, `invStats`, `renderInv`, `exportInventario`, `renderHistorico`, `exportHistorico`; en `12b-historico.js`, todo salvo lo congelado; definiciones `inventory`, `planning` y `storage` | `src/26-reposicion.js` |
| 7 · Compras y caja | `carril/7-compras` | `cashProjection`, `poAmount`, `poUnits`, `poUnitCostOf`, `poUnitCost`, `applyPOCosts`, `poLotDate`, `lotFromPO`, `renderCompras`, `addSupplier`, `editSupplier`, `addPO`, `editPO`, `renderTesoreria`, `saveCash`, `addExpense`, `updExpense`, `delExpense`, `exportCompras`, `exportTesoreria` | `src/27-compras.js` |
| 8 · Cumplimiento | `carril/8-cumplimiento` | `renderComp`, `setComp`; en `src/10-const.js`, `COUNTRIES` y `VAT_GENERAL` (y **añadir** entradas a `MKT_MAP`, sin cambiar las existentes) | `src/28-cumplimiento.js` |
| 9 · Ingesta SP-API | `carril/9-spapi` | ninguna | `servidor/` entero, `tests/spapi.test.js` |
| 10 · Validador y comparador | `carril/10-validador` | `src/11-motor-validacion.js` entero, `src/03-calculadora.html`, `saveProduct`, `renderSaved`, `loadProduct`, `delProduct`, `currentSnapshot` | `src/29-mecanica-devoluciones.js` |

## Las costuras · cómo añadir sin abrir un fichero compartido

`src/19-registro.js` (congelado) da seis funciones. Están probadas una a una en
`tests/costuras.test.js`, cada una vista fallar antes de darla por buena.

| Función | Para qué | Dónde aparece |
|---|---|---|
| `registrarInforme(def)` | un informe nuevo con la misma forma que los de `REPORTS` | Datos, detección, `imp(id)` |
| `registrarVista({id, etiqueta, icono, grupo, crumb, html, render})` | una pantalla nueva | sección, botón en su grupo, miga de pan, `refreshAll()` |
| `registrarClaveDB(nombre, inicial)` | un sitio nuevo donde guardar | `blankDB()`, migración en `loadDB()`, copia y restauración |
| `registrarPreproceso(fn, etiqueta)` | transformar el texto antes de `parseDelimited` | `readSmart`, y la nota se enseña en Datos |
| `registrarEstilo(css)` | CSS sin abrir `01-head.html` | `<style data-registro>` |
| `registrarExportacion(id, etiqueta, fn)` | un botón de salida | Datos › Salida |

Registrar dos veces el mismo id **lanza un error con el nombre del choque**. Es
a propósito: descubrir que dos carriles usan el mismo id al integrar cuesta diez
veces más que descubrirlo al arrancar la aplicación.

`build.sh` recoge `src/2[0-9]-*.js` por orden alfabético él solo, y la
comprobación de sintaxis del final usa **la misma lista**. Añadir un módulo no
obliga a editar `build.sh`, que era la única línea que habrían tocado los diez
carriles.

## Las pruebas

`npm run test:all` ejecuta `tests/run-all.js`, que:

1. **Regenera las fixtures antes de nada.** No es cosmético. `mkfixtures.js`
   genera las fechas relativas a hoy (`ago(k)`), pero las fixtures están
   commiteadas con las fechas del día en que se generaron, y `pnl()` filtra por
   `periodStart()`, que por defecto son 30 días. Unas fixtures de hace más de un
   mes se salen del periodo y suites verdes salen rojas sin que nadie haya
   tocado código. Pasó: la PR #4 quedó verde el 24 de agosto con «431 OK · 0
   FALLO» y el 17 de septiembre daba dos fallos en un árbol idéntico. No era una
   regresión: era el calendario.
2. **Descubre las suites solas** leyendo `tests/*.test.js`, así que añadir una no
   obliga a tocar `package.json`.
3. **Las corre todas**, en vez de parar en la primera roja como hacía la cadena
   de `&&`. Un carril necesita saber si ha roto una cosa o cinco.

`privacidad.test.js` corre siempre la primera: el repositorio es **público**.

**No commitees las fixtures regeneradas.** Correr las pruebas deja
`tests/fixtures/` y `tests/fixtures-es/` modificadas, porque se han vuelto a
generar con las fechas de hoy. Eso es normal y no hay que subirlo: si diez
carriles commitean su propia regeneración, esos ficheros se pelean en todos los
merges y no aportan nada, porque `run-all.js` los rehace igualmente. Antes de
cada commit: `git checkout -- tests/fixtures tests/fixtures-es`.

Si corres **una suite suelta** (`node tests/pnl.test.js`) en vez de `test:all`,
lánzale antes `npm run fixtures`, o te comerás el problema del calendario que se
explica arriba.

## Lo que no está en esta base, y hay que saberlo

Esta base sale de `claude/tarifas-reales` (PR #4, `05165a6`), **no** de `main` +
la entrega del 6 de septiembre. Comprobado el 17 de septiembre de 2026 contra el
remoto:

- `main` está en `fecc1d9`, que es la base de la PR #4, y **no** contiene la
  entrega del 6 de septiembre.
- Ninguna de las seis ramas remotas la contiene: todas son del 19 al 24 de
  agosto, y en ninguna aparecen `tests/coherencia.test.js`,
  `tests/sesionb.test.js` ni `paisDeJuris(`.
- El diff que debía aplicarla (`seller-hub/CODIGO-ENTREGA-2026-09-06.diff`) no
  está accesible desde esta sesión, igual que el resto de documentos del
  proyecto (`METODO.md` de septiembre, `TRASPASO-2026-09-06.md`,
  `M1.2-ESPEC.md`, `PIVOTE-AUTOMATIZACION.md`).

Por el METODO, lo que no está en el remoto no existe. Consecuencias prácticas:

- **No hay `test:coherencia` ni `test:sesionb`.** Donde el encargo los pone como
  frontera de un carril, la frontera son las suites que sí existen, y muy en
  especial `test:pnl`, `test:iva` y `test:ivafiscal`.
- `test:ivafiscal` **sí existe**: vino con la PR #4, no con la entrega de
  septiembre. Verificado en las dos direcciones el 17 de septiembre: sin el
  arreglo del motor sale roja con mensaje («0 €», «de 3393.57 € a 3393.57 €»),
  no con un stack.
- Las cifras del traspaso del 6 de septiembre (la diferencia de IVA de A7, el
  recuento de inventario, la fecha de la foto) **son heredadas y no se
  han podido confirmar** contra esta base. Nadie las use como criterio sin
  volver a medirlas.
