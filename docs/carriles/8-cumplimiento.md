# Carril 8 · Cumplimiento

Rama `carril/8-cumplimiento` · desde `base/2026-09` (`e18ef86`) · PR en borrador
contra la base.

## Qué pregunta responde

**«¿En qué países estoy expuesto ahora mismo, y qué de todo esto está realmente
comprobado?»** Antes la pantalla contestaba a la primera mitad con una lista de
nueve países que no incluía tres en los que sí hay actividad, y a la segunda no
contestaba: bastaba marcar cuatro casillas para que dijera «todos tus mercados
activos constan registrados» y bajara el aviso de rojo a azul. Ahora la pantalla
distingue **lo que tú afirmas** de **lo que el hub puede verificar**, y no tiene
ningún estado que signifique «cumples».

## Qué NO hace, a propósito

- **No dice que cumplas. Nunca.** El estado más fuerte es *«declarado por ti ·
  sin verificar»*, y solo cuando hay un **número de registro escrito**. Una
  casilla marcada no cuenta: se marca sin levantarse de la silla. El hub no
  consulta LUCID, ni SYDEREP, ni el RPP, ni el EDM, y lo dice en pantalla.
- **No valida ningún número de registro** contra ningún organismo. No puede.
- **No presenta declaraciones ni es asesoramiento fiscal.** El dossier lleva el
  aviso dentro del CSV, no solo en la pantalla: un CSV se reenvía por correo y
  llega sin la pantalla detrás.
- **No toca `vatReport()`**, que está congelada. El dossier la llama y copia sus
  cifras sin retocarlas; la suite compara una a una.
- **No mete el Reino Unido en `COUNTRIES`.** Aparece en los informes, pero solo
  como dos facturas de Amazon en libras. Dos facturas no son un mercado, y
  pintarle una columna de cumplimiento sería inventarle obligaciones. Se mapea
  en `MKT_MAP` para que `countryStats()` lo agrupe en «Otros mercados».
- **No confirma que los marketplaces estén obligados a verificar el registro EPR
  desde el 12-ago-2026**, ni que «Pay on Behalf» haya dejado de valer como
  cumplimiento. El hub lo afirmaba en tres pantallas como hecho. No se ha podido
  confirmar contra el texto del Reglamento y ahora sale marcado *SIN CONFIRMAR*
  en la tabla de fuentes y en el propio banner de riesgo.

## Los tres mercados que faltaban, y cómo se dedujeron

No de memoria: cruzando `COUNTRIES` con las columnas de país de los once
informes reales de `/root/aresstore-reales/`, con `cut` y `awk`.

| Código | Dónde aparece de verdad | Qué es |
|---|---|---|
| **AT** Austria | `TAXABLE_JURISDICTION = AUSTRIA` en los **dos** informes de IVA, con `TAX_REPORTING_SCHEME = UNION-OSS`; `ship-country AT` en pedidos | mercado de venta, sin stock |
| **PT** Portugal | `TAXABLE_JURISDICTION = PORTUGAL` en los dos informes de IVA; `ship-country PT` en pedidos, servido desde `amazon.es` | mercado de venta, sin stock |
| **SK** Eslovaquia | `DEPARTURE_COUNTRY = SK` en filas `FC_TRANSFER` de los **dos** informes de IVA (SK→IT y SK→DE) | **país de almacén**, sin ventas |

Eslovaquia es el hallazgo que no estaba en ningún documento: no hay ni una fila
con jurisdicción SK, así que por ventas es invisible. Pero un traslado entre
centros logísticos que **sale** de Eslovaquia solo puede salir de mercancía que
estaba allí, y para IVA el almacén es justo lo que obliga a registrarse.

Además se añade **CZ Chequia**, que el encargo da como país de almacenaje PanEU.
`grep -w CZ` sobre los once ficheros devuelve **cero coincidencias en todos**.
Entra en la lista marcada `origen:'heredado'` y la pantalla la etiqueta *«sin
confirmar»*: no se puede afirmar que haya stock allí.

Lo que **no** se ha añadido y por qué: **GB** (solo dos filas `AMAZON_FEE /
INVOICE` en GBP, sin jurisdicción), **SA** (20 SKU con estimación de tarifa en
el informe de tarifas; fuera de la UE y sin una sola venta) y **MX** (un envío
suelto desde `amazon.es`).

Sobre «la pantalla dice doce mercados activos»: **no lo dice**. `grep` sobre
`src/` no encuentra esa afirmación en ninguna parte; la pantalla listaba nueve,
que son los de `COUNTRIES`. Ahora lista trece.

## Las fuentes, y qué se pudo confirmar

Todas consultadas el **17-09-2026**. La pantalla enseña esta misma tabla, con la
URL y la fecha, y marca en rojo lo que no se pudo confirmar.

| Afirmación | Estado | Fuente |
|---|---|---|
| PPWR = Reglamento (UE) 2025/40, en vigor 11-02-2025, **aplicable desde el 12-08-2026** | confirmado | [Comisión Europea · DG ENV](https://environment.ec.europa.eu/topics/waste-and-recycling/packaging-waste_en) |
| Desde el 12-08-2026 no puede ponerse en el mercado envase alimentario con PFAS sobre los límites | confirmado | [CE, nota de 11-ago-2026](https://environment.ec.europa.eu/news/new-eu-rules-packaging-enter-application-2026-08-11_en) |
| Fases siguientes: etiquetado de clasificación en 2028; reutilización, contenido reciclado y reciclabilidad en 2030 | confirmado | misma nota |
| Ómnibus ambiental (dic-2025): propuesta de **suspender** el representante autorizado | **solo propuesta** | [CE · DG ENV](https://environment.ec.europa.eu/topics/waste-and-recycling/packaging-waste_en) |
| Los marketplaces obligados a verificar el registro EPR; «Pay on Behalf» deja de valer | **SIN CONFIRMAR** | solo fuentes secundarias, que además discrepan del artículo (44 o 45). [EUR-Lex](https://eur-lex.europa.eu/eli/reg/2025/40/oj/eng) devuelve un reto de AWS WAF (HTTP 202 con JavaScript) en vez del texto |
| El OSS no elimina por sí solo el registro local donde hay mercancía almacenada | confirmado | [CE · portal OSS](https://vat-one-stop-shop.ec.europa.eu/one-stop-shop/declare-and-pay-oss_en) |
| Tipos generales AT 20 %, PT 23 %, CZ 21 % | confirmado (serie publicada hasta 2021) | [DG TAXUD · Table 2](https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en) |
| Eslovaquia: 23 % desde el 1-1-2025 | confirmado | [CE · Access2Markets](https://trade.ec.europa.eu/access-to-markets/en/news/recent-vat-changes-certain-eu-member-states) |

### Los organismos EPR, país a país

Seis verificados contra la web oficial del registro o el texto legal; **siete
no**, y la pantalla los pinta como no verificados en vez de suponer que se
parecen a sus vecinos.

| País | Registro (lo obligatorio) | Estado | Fuente |
|---|---|---|---|
| DE | **LUCID**, operado por la ZSVR | confirmado | [verpackungsregister.org](https://www.verpackungsregister.org/en/) |
| FR | **Identifiant Unique (IDU)** emitido por **ADEME** vía SYDEREP, art. L541-10-13; filière EMPAP. Eco-organismos acreditados 2025-2029: **CITEO, ADELPHE y LEKO** | confirmado | [ADEME · IDU](https://filieres-rep.ademe.fr/en/identifiant-unique) · [filière EMPAP](https://filieres-rep.ademe.fr/en/filieres-REP/filiere-EMPAP) |
| ES | **RPP del MITECO, sección envases**, art. 15 del RD 1055/2022; declaración antes del 31 de marzo | confirmado | [MITECO](https://www.miteco.gob.es/en/calidad-y-evaluacion-ambiental/temas/prevencion-y-gestion-residuos/prevencion-y-gestion-residuos/registro-productores-producto-seccion-envases.html) |
| IT | Adhesión al **CONAI**, art. 224 del D.lgs. 152/2006 | confirmado sobre el texto legal | [texto en camera.it](https://leg14.camera.it/parlam/leggi/deleghe/06152dl4.htm) — `conai.org` devolvió **HTTP 403** |
| AT | Registro en el **portal EDM** (eVerpackung); declaración del Anexo 3 antes del 31 de marzo | confirmado | [edm.gv.at](https://www.edm.gv.at/edm_portal/cms.do?get=%2Fportal%2Finformationen%2Fanwendungenthemen%2Fverpackung.main) |
| PT | **Registo de Produtores de Produtos** en SILiAmb (APA), art. 19 del DL 152-D/2017 | confirmado | [apambiente.pt](https://apambiente.pt/residuos/registo-de-produtores-de-produtos) |
| PL, NL, BE, IE, SE, CZ, SK | — | **SIN VERIFICAR** | no consultados en esta sesión |

**La distinción que el hub tenía mal en tres sitios:** el *registro* y el
*sistema colectivo* no son lo mismo. En España inscribirse es en el RPP del
MITECO; Ecoembes es un SCRAP al que además te adhieres. En Francia el número que
prueba la inscripción lo da ADEME, no Citeo, y hay **tres** eco-organismos
acreditados. Confundirlos hace creer que pagando a un sistema colectivo ya estás
inscrito, y no lo estás.

## El informe de EPR · lo que hay y lo que no

La cabecera del informe real (`273303020688.txt`) está **medida** con Bash el
17-09-2026: **33.845 bytes · BOM UTF-8 · CRLF · separador TAB · cabecera en la
línea 1 · 34 columnas · decimales con punto y 3 dígitos · sin espacios finales
en las cabeceras**.

**El fichero NO está en disco**: un clasificador de permisos impidió persistirlo
por proveniencia sensible, y no se ha pedido saltárselo. Consecuencia práctica,
sin disimularla: **la fixture reproduce el formato exacto, pero nada de este
carril se ha medido contra el informe real.** El **número de filas del informe
real NO está medido**: se mencionaron 66 y queda **SIN CONFIRMAR**.

La fixture `tests/fixtures-cumplimiento/epr-sintetico.txt` tiene **14 filas**
porque son las que hacen falta para los casos, no porque se parezca al original.
Es determinista (sin fechas relativas a hoy), así que no ensucia el árbol al
regenerarse. Datos inventados de cabo a rabo: el repositorio es público.

Un hallazgo del camino: **sin la definición del informe, el hub detectaba el
fichero de EPR como el informe de inventario** (`→ inventory`). No fallaba: lo
guardaba como otra cosa.

## Pruebas, y en qué dirección se vieron fallar

`tests/cumplimiento.test.js` · **62 comprobaciones**. Contra la base sin los
cambios de este carril (`e18ef86`, módulo retirado y `src/` revertido): **49 en
rojo (y 13 en verde, casi todas porque miden la fixture y no el código), todas con mensaje, ninguna con un stack**. Todas las llamadas a la página
llevan guarda `typeof X==='function'` para que así sea.

| Prueba | Qué demuestra | Mensaje en rojo, sin el arreglo |
|---|---|---|
| CUMP-A · los tres que faltaban | AT, PT y SK están en `COUNTRIES` | `COUNTRIES incluye Austria… → DE,FR,IT,ES,PL,NL,BE,IE,SE` |
| CUMP-A · SK es almacén | SK entra con `storage:true` y AT no | `SK storage=undefined · AT storage=undefined` |
| CUMP-A · origen del dato | los tres van marcados «medido» y CZ «heredado» | `AT=undefined PT=undefined SK=undefined` |
| CUMP-A · `countryOf` | lee `AUSTRIA`/`PORTUGAL`, como vienen en `TAXABLE_JURISDICTION` | `AUSTRIA→null PORTUGAL→null` |
| CUMP-A · Reino Unido | `amazon.co.uk` se identifica pero GB no entra en `COUNTRIES` | `amazon.co.uk→null` |
| CUMP-A · guardas de subcadena | Croacia, Letonia y Egipto **no** acaban en AT ni PT | (verde en base; rojo **sin las guardas**: `Croatia→AT Latvia→AT Egypt→PT`) |
| CUMP-A · no romper nada | ninguna clave vieja de `MKT_MAP` cambia de destino | verde en las dos direcciones, a propósito |
| CUMP-B · pantalla vacía | sin mercados marcados, la pantalla dice que no puede opinar | `no existe #cumplExtra: el módulo del carril no está` |
| CUMP-C · PPWR | el hub sabe cuántos días lleva en vigor | `cumplDiasPPWR() no existe` |
| CUMP-C · incertidumbre | el banner rojo reconoce lo que él mismo no ha confirmado | `…comprueba en Seller Central si ya te han pedido documentación…` |
| **CUMP-D · adversarial** | **con TODAS las casillas marcadas y sin un número, no da nada por registrado** | `Todos tus mercados activos constan registrados` |
| CUMP-D · sin estado de cumplimiento | ningún país pasa a un estado que signifique cumplir | `cumplEstados() no existe` |
| CUMP-E · con número anotado | lo más fuerte sigue siendo «declarado por ti · sin verificar» | `(etiqueta vacía)` |
| CUMP-E · recorte | un número con espacios no es el mismo número | `«   CON-ESPACIOS   »` |
| CUMP-F · fuentes | fecha de consulta en pantalla y URL en cada afirmación | `CUMPL_FUENTES no existe` |
| CUMP-F · lo no confirmado | sale marcado, no omitido | `(sin marca SIN CONFIRMAR)` |
| CUMP-G · formato literal | BOM, CRLF, TAB, 34 columnas, 3 decimales con punto | verde siempre: mide la fixture, no el código |
| CUMP-G · detección | el informe de EPR se reconoce como tal | `el hub reconoce el informe de EPR… → inventory` |
| CUMP-G · reparto por país | usa el código de envío, no el nombre del fichero | `eprPorPais() no existe` |
| CUMP-G · fila sin país | se queda fuera, no se reparte entre los demás | `filas sin país: null` |
| CUMP-G · sin registro | IT sale marcada: hay ventas y ninguna fila con número | `IT sinRegistro=null` |
| CUMP-H · dossier | cada cifra es la de `vatReport()`, sin retocar | `coinciden en 0 países` |
| CUMP-H · solo lectura | generarlo no escribe una letra en la base | `la DB HA CAMBIADO` |
| CUMP-H · aviso | «NO ES ASESORAMIENTO FISCAL», dentro del CSV | `(no existe)` |
| CUMP-H · costura | la exportación va por `registrarExportacion` | `(ninguna)` |
| CUMP-I · repintado | tres `refreshAll()` seguidos no duplican paneles | `contenedores=0 filas=0` |
| CUMP-I · contador | el badge cuenta países en riesgo, no casillas | `badge «2» · en riesgo: cumplEstados() no existe` |
| CUMP-I · sin errores | ni un `pageerror` ni un `console.error` | verde en las dos direcciones |

### Una prueba existente que se ha tenido que tocar

`tests/hub.test.js` comprobaba `lista los 9 mercados` con el número **10** a
mano (9 países + cabecera). Al añadir cuatro países salía en rojo: `→ 14 filas`.

No se ha relajado: se ha **atado a `COUNTRIES`** (`compRows === COUNTRIES.length
+ 1`) y se le ha **añadido** una comprobación nueva de que AT, PT, SK y CZ están
entre los códigos listados. Así deja de romperse cuando se añade un mercado
legítimo y, a cambio, caza lo que el número fijo no cazaba: un país que se cae
de `COUNTRIES` y desaparece de la pantalla sin que nadie se entere.

## Costuras que pide a otros carriles

| Marca en el código | Carril destino | Qué hay que unificar al integrar |
|---|---|---|
| `src/10-const.js`, junto a las claves nuevas de `MKT_MAP` | **1 · Importador** | `countryOf()` busca la clave exacta y, si falla, recorre `MKT_MAP` buscando **subcadenas**. Con claves de dos letras eso da falsos positivos: `'Croatia'` contiene `at`, `'Egypt'` contiene `pt`. Aquí se ha tapado añadiendo `croatia`, `latvia` y `egypt` como claves exactas, que es un parche. El arreglo de verdad es casar por palabra completa en esa segunda pasada. **No se ha tocado `countryOf()`.** |
| `src/28-cumplimiento.js`, sobre `cumplDiasPPWR()` | **5 · Rentabilidad** | `renderPanel()` levanta la alerta de EPR mirando la **casilla** `epr`, no el número de registro. Quien marca la casilla para quitarse el aviso deja de ver la alerta del panel mientras sigue sin registro: el mismo «cumples» sin comprobar, un piso más arriba. Debería preguntar `cumplEstadoPais(code).estado === 'riesgo'`. |
| `src/28-cumplimiento.js`, sobre `cumplDiasPPWR()` | **integración** | `renderPanel()`, `src/05-auditoria.html`, `src/06-guia.html` y el bloque fijo de `src/02-views.html` afirman **como hecho** que los marketplaces están obligados a verificar el registro EPR y que «Pay on Behalf» deja de valer. Esta pantalla lo marca *SIN CONFIRMAR*. Hasta que alguien lea el articulado, el hub se contradice a sí mismo en cuatro sitios. Ninguno de los cuatro es de este carril. |

Todo lo demás entra por las costuras que ya existen: `registrarInforme` (informe
de EPR), `registrarExportacion` (dossier) y `registrarEstilo` (CSS). No se ha
abierto `src/01-head.html`, ni `build.sh`, ni `src/19-registro.js`, ni
`src/02-views.html`: los paneles nuevos los inserta el propio módulo dentro de
la sección que ya existía, de forma idempotente.

## Qué queda por medir

- **El informe de EPR real.** No está en disco. Desbloquea: el número de filas,
  el reparto real por país y —lo importante— **en qué países viene vacío
  `REGISTRATION_NUMBER`**, que es la señal más temprana antes de un bloqueo de
  listados. Hoy eso solo está probado sobre fixture.
- **El articulado del PPWR.** EUR-Lex no es accesible desde este entorno (reto
  de AWS WAF). Desbloquea: confirmar o desmentir la obligación de verificación
  de los marketplaces y el fin de «Pay on Behalf» como cumplimiento. Mientras
  tanto, el hub lo trata como riesgo probable, no como hecho.
- **Los siete esquemas EPR sin verificar** (PL, NL, BE, IE, SE, CZ, SK). SK es
  el más urgente de los siete: es el único donde **sí consta mercancía**.
- **Si de verdad hay stock en Chequia.** No aparece en ningún informe. Una foto
  del inventario multipaís o el propio Seller Central lo resolvería en un
  minuto, y decidiría si CZ se queda o se va de `COUNTRIES`.
- **El coste de gestoría por país.** Los 1.500 €/año que trae `COUNTRIES` por
  defecto son un valor de partida heredado, no una cifra medida. La pantalla lo
  deja editar; nadie ha confirmado ninguno.

### El árbol entero, en verde

`npm run test:all` · **17 suites · 525 comprobaciones OK · 0 FALLO**. Las 16 que
ya existían siguen intactas; la nueva es `cumplimiento`. Ni `test:iva`, ni
`test:ivafiscal`, ni `test:pnl` se han movido al añadir cuatro países a
`COUNTRIES`, que era el riesgo que tenía este carril por delante.

### Medido contra ficheros reales

Sobre los once ficheros de `/root/aresstore-reales/`, con `cut`, `awk` y `grep`:
qué **códigos de país** aparecen en cada columna de país y cuáles de ellos no
estaban en `COUNTRIES`. El resultado, en la tabla de arriba.

> **Las cifras reales del negocio no van aquí.** Este fichero está en un
> repositorio público. Los recuentos por país que sirvieron para la deducción
> (número de filas y de pedidos por mercado) van al documento del proyecto
> `seller-hub/carriles-2026-09/8-cumplimiento.md`, o de vuelta al orquestador.
> Lo único que se nombra aquí son **códigos de país y columnas**, que no son
> cifras del negocio.
