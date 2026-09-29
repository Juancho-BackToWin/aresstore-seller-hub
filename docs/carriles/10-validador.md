# Carril 10 · Validador de producto y comparador PanEU

Rama `carril/10-validador` · desde `base/2026-09` (`e18ef86`) · PR en borrador
contra la base.

## Qué pregunta responde

**¿Este producto da el mismo margen mires la pantalla que mires?** Hasta ahora
no: Validar producto modelaba una mecánica de devolución y la cuenta de
resultados modelaba otra, así que el mismo producto con la misma tasa de
devolución daba dos márgenes distintos según por dónde se entrase. Ahora la
mecánica existe una sola vez, en `costeDevolucion()` (`src/29-mecanica-devoluciones.js`),
con sus cuatro reglas contrastadas una a una contra documentación de Amazon y la
fuente citada en el propio módulo. Y una prueba de propiedad fija que el
beneficio por unidad del validador y el que sale de `pnl()` coinciden **al
céntimo**, con lo que incluye cada lado dicho en voz alta.

De paso responde una segunda pregunta que el comparador PanEU estaba contestando
mal: **¿cuánto aportan al año los mercados que tengo abiertos?** Sumaba zlotys y
coronas como si fueran euros.

## Lo que se re-midió, y lo que salió de verdad

El traspaso anterior daba el validador y el comparador por «construidos,
pendientes de re-medir» y decía que **antes sumaban divisas distintas como si
fueran euros**. Es una cifra heredada, así que se volvió a medir contra esta
base, con Playwright sobre el compilado y con los valores por defecto de la
aplicación.

**La cifra heredada era cierta, y era peor de lo que decía.** `COUNTRIES`
declara la divisa de cada mercado (`cur`) desde siempre — PL en PLN, SE en SEK —
y **nadie la leía en ninguna parte del validador ni del comparador**. Medido
antes del arreglo, con los nueve mercados en su estado por defecto y PL y SE
activados:

- el total anunciado era **4525,14 €/año**, de los que **374,22 eran PLN y
  1688,92 SEK**: el **45,6 %** del titular no eran euros;
- y el ranking: *«el que más aporta es Suecia con 1688,92 €»*. A un cambio de
  ~11 SEK/€ esas coronas son ~150 €, o sea que Suecia no era el primero de la
  lista sino el último. **La tabla coronaba el mercado equivocado**, que es la
  única cosa que esa tabla existe para decidir;
- la vista no mencionaba «PLN», «SEK» ni «divisa» **en ningún sitio**
  (comprobado con una búsqueda de texto sobre la sección entera).

En la calculadora de un solo mercado pasaba lo mismo un piso más abajo: los ocho
campos de dinero rotulaban «€» fijo, así que un PVP tecleado con Polonia
seleccionada eran zlotys presentados como euros.

**Un segundo hallazgo, no heredado, que salió de la revisión adversarial propia.**
`breakevenPrice()` tenía su propia fórmula cerrada de la mecánica de
devoluciones, y le faltaba el tope de 5 € de la tasa de gestión. El tope solo
muerde cuando la comisión pasa de 25 €, así que con el producto de ejemplo
(24,99 €) los números coincidían y el fallo era invisible: aparecía justo en los
productos caros, que son los que más capital comprometen. Con una fixture de PVP
400 €, coste puesto en almacén 200 €, comisión 15 %, 30 % de devoluciones y nada
revendible, la tarjeta «Precio mínimo viable» decía **447,78 €** cuando el
equilibrio real del propio motor son **442,44 €** — y el motor daba **+2,53 €/ud
de beneficio** al precio que la tarjeta llamaba mínimo. No daba error: daba un
número creíble y falso.

**Y un tercero.** Con «Ventas estimadas / mes» a 0, `vatUnit` se pone a 0 y los
1.500 €/año de gestoría de IVA **desaparecen del cálculo en silencio**. En la
fixture por defecto eso sube el margen neto de 14,36 % a 17,55 % sin que nada en
pantalla lo dijera.

## Qué hace

- **`src/29-mecanica-devoluciones.js`** (nuevo). `costeDevolucion(u)` y
  `tasaGestionDevolucion(comision)`, con `DEV_TASA_TOPE`, `DEV_TASA_PCT` y
  `DEV_REGLAS`. Sin estado, sin DOM, sin tasas de devolución: entra lo que se
  sabe de una unidad devuelta y sale el desglose y el coste. La cabecera del
  fichero lleva las cuatro reglas, qué dice la documentación oficial de Amazon
  sobre cada una, la URL y la fecha de consulta.
- **`unitEconomics()`** ya no tiene mecánica propia: llama a `costeDevolucion()`
  y deriva de ella las cuatro líneas de la cascada. La identidad
  `beneficio = beneficio sin devoluciones − tasa × coste de una devolución` está
  fijada por prueba.
- **`breakevenPrice()` y `breakevenLanded()`** se resuelven por bisección sobre
  `unitEconomics()` en vez de tener cada uno su fórmula cerrada. Ya no pueden
  desincronizarse del margen que enseñan las tarjetas de arriba.
- **Divisas.** `divisaDe()`, `money()`, `esBase()`. El comparador PanEU tiene
  columna «Divisa», pinta cada celda en la suya, **suma solo los mercados en
  euros**, corona al mejor **solo entre ellos** y declara aparte los que quedan
  fuera con su importe y su código ISO. La calculadora cambia el símbolo de sus
  ocho campos de dinero según el mercado.
- **Avisos** (`avisosValidador()`): divisa distinta del euro, gestoría sin
  repartir, «Moda: 50 % FBA» con el canal en FBM, y tasa de devolución por
  encima del tope del motor.

## Qué NO hace

- **No convierte divisas.** El hub no tiene tipo de cambio y no se lo inventa;
  es la misma doctrina que ya aplica `pnl()` con las tarifas en otra divisa.
  Declarar y no sumar es peor experiencia y mejor número. Traer un tipo de
  cambio es una decisión de producto (¿de qué fuente? ¿de qué fecha? ¿el del
  día de la venta o el del cierre?) que no es de este carril.
- **No toca `pnl()`.** Es del carril 5. La mecánica compartida existe y está
  probada, pero quien la enchufa es el 5. Ver la costura de abajo.
- **No arregla que `COUNTRIES` traiga `vatCost: 1500` para Polonia en euros.**
  `src/10-const.js` es del carril 8. El validador lo avisa en pantalla.
- **No añade `test:devoluciones` a `package.json`.** `run-all.js` descubre las
  suites solo, y esa línea es justo la que se pelearían diez carriles.

## Pruebas, y en qué dirección se vieron fallar

`tests/devoluciones.test.js` · **74 comprobaciones**. Suite completa en verde, y
cada bloque que persigue un fallo visto rojo quitando el arreglo. Ninguno sale
con un stack: todos salen con el número.

| Prueba | Qué demuestra | Mensaje en rojo, sin el arreglo |
|---|---|---|
| DEV-C · `MISMO PRODUCTO, MISMA TASA → MISMO BENEFICIO POR UNIDAD, AL CÉNTIMO` | Validador y `pnl()` dan el mismo €/ud para el mismo producto | Con el validador reembolsándose la tarifa FBA por su cuenta: `validador 28.194099 €/ud · P&L 27.788099 €/ud · diferencia 0.40600000 €` |
| DEV-B · `beneficio = beneficio sin devoluciones − tasa × coste de una devolución` | El validador no tiene mecánica propia | `28.194099 vs 27.788099` |
| DEV-D · `la diferencia es exactamente la tarifa por procesamiento` | El único hueco que queda está medido y nombrado | `hueco -0.062000 €/ud · esperado 0.344000 €/ud` |
| DEV-A · `comisión 90 € → 5,00 € (manda el tope)` | El tope de 5 € de la regla 2 | Sin el tope: `→ 18` |
| DEV-A · `reproduce el ejemplo publicado por Amazon (10 € al 15 % → 0,30 €)` | La regla 2 contra el ejemplo oficial | Si la tasa deja de cobrarse: `→ 0.0000 €` |
| DEV-A · `REGLA 1 · la tarifa de logística no se resta` | Quitar los 4 € del dato no mueve el coste | Si alguien la resta: `con 4 € de FBA: 33.3868 · con 0 €: 37.3868` |
| DEV-A · `REGLA 4 · sin dato de estado, NO se recupera nada` | El supuesto prudente de la disposición | Si el valor por defecto pasa a «vendible»: `recuperado 5` |
| DEV-E · `el umbral es 442,44 €, no los 447,78 € de la fórmula sin tope` | El umbral de precio usa la mecánica única | Con la fórmula cerrada de vuelta: `→ 447.7814 €` |
| DEV-E · `en el «precio mínimo viable» el beneficio es exactamente cero` | El mínimo es un mínimo de verdad | `2.53e+0 € a 447.78 €` |
| DEV-F · `el total anunciado suma SOLO los mercados en euros` | El total del comparador no mezcla divisas | `pintado €17286.32 · euros €8467.48 · sumándolo todo saldría €17286.32` |
| DEV-F · `el «que más aporta» se corona solo entre los que cobran en euros` | El ranking no compara coronas con euros | `pintado: Suecia · mejor en euros: Países Bajos` |
| DEV-F · `la celda de Polonia lleva zlotys, no €` | Ninguna cifra en PLN lleva un € delante | `→ €374.22` |
| DEV-G · `…y la pantalla lo dice en vez de callárselo` | El agujero de la gestoría se declara | `→ ninguno` |
| DEV-G · `con Polonia seleccionada se avisa de la divisa` | El aviso de divisa existe | `→ ninguno` |
| DEV-H · `a medias · sin volumen la cobertura y el payback dicen «—»` | Nada escribe «Infinity» en pantalla | — (no regresión) |

Además, y a propósito: `MISMO PRODUCTO…` salió roja la primera vez por
**0,06 €/ud** — `pnl()` aplica siempre el recargo de combustible (×1,015) a la
tarifa FBA que estima y la fixture del validador lo tenía apagado. Seis céntimos
por unidad, 6 € en cien unidades, invisibles a ojo. Está anotado en la fixture
como lo que es: el ejemplo de por qué esta comparación merece existir.

**Frontera.** `npm run test:all`: **17 suites · 536 comprobaciones · 0 fallos**.
Las 16 suites previas siguen exactamente en sus cifras (462), incluidas `m11`
(86), `pnl` (60) e `ivafiscal` (16). Ninguna prueba existente se ha tocado,
debilitado ni quitado.

## Costuras que pide a otros carriles

| Marca en el código | Carril destino | Qué hay que unificar al integrar |
|---|---|---|
| `// COSTURA → carril 5` en `src/29-mecanica-devoluciones.js` | 5 · Rentabilidad | `pnl()` tiene que llamar a `costeDevolucion()` en vez de repetir la mecánica dentro de su bucle `retRows.forEach(...)`. Hoy las tres primeras reglas coinciden al céntimo y la cuarta no existe en `pnl()`: **no cobra nunca la tarifa por procesamiento de devoluciones**, y esa es la diferencia entera entre las dos pantallas — medida en la fixture, 0,344 €/ud. El dato de esa tarifa no viene en el informe de devoluciones (Amazon lo cobra en la liquidación), así que el orden de preferencia es: (a) sacarlo de `settlementFees()` si algún día separa el concepto de `other`, (b) dejarlo en 0 **y decirlo en pantalla**. Lo que no vale es volver a escribir `Math.min(5, 0.20*comUd)` dentro de `pnl()`. |
| Aviso en pantalla, `avisosValidador()` | 8 · Cumplimiento | `COUNTRIES` da `vatCost: 1500` para Polonia, que es una cifra en euros en un mercado que cobra en PLN. `src/10-const.js` es del carril 8; el validador lo avisa y no lo toca. |

## Qué queda por medir

- **Regla 1 (la tarifa de logística no vuelve): confirmada por omisión, no con
  cita literal.** `https://sell.amazon.es/precios` dice qué SE reembolsa —la
  tarifa por referencia menos la tasa de gestión— y no menciona la logística; el
  rate card europeo tampoco la lista como reembolsable. No se ha localizado una
  página de Amazon accesible con la frase literal. Las páginas de Seller Central
  (`GDC3U6FWF4JJJJC7`, `GZGEQLTM3RZXUV6T`, `G201112630`) se sirven como cáscara
  de JavaScript y no devuelven texto a un `fetch`. **Desbloquea**: una captura
  de esa página desde una sesión con Seller Central abierta cerraría la cita.
- **La tarifa por procesamiento de devoluciones de ropa y calzado (50 % de la
  tarifa de gestión logística) no se ha podido leer del PDF del rate card
  vigente**: sus tablas de alta tasa de devolución excluyen explícitamente ropa,
  accesorios y calzado, y las cifras del PDF vienen con fuentes de subconjunto
  que no se dejan extraer con las herramientas disponibles aquí. El 50 % aparece
  en la misma familia de rate cards de Amazon según búsqueda; el modelo lo trata
  como parámetro, no como constante, así que un valor distinto no rompe nada.
- **El tipo de cambio.** Mientras no haya una fuente y una fecha decididas, el
  comparador declara y no suma. Decisión de Juancho.
- **La cobertura de `settlementFees()` sobre el concepto «Return processing
  fee»** no se ha mirado: es del carril 3.

### Medido contra ficheros reales

**Nada.** Este carril no ha tocado ningún fichero real de Seller Central. Todo lo
medido sale de fixtures sintéticas con la aritmética a mano en el comentario y de
los valores por defecto de la aplicación compilada.

> Las cifras de este documento son **todas de fixture o de los valores por
> defecto de la aplicación**. No hay ningún número de negocio real, y el
> repositorio es público.
