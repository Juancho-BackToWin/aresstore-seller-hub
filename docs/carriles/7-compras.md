# Carril 7 · Compras y caja

Rama `carril/7-compras` · desde `base/2026-09` (`e18ef86`) · PR en borrador
contra la base.

## Qué pregunta responde

Cuánto cuesta de verdad cada unidad que entra en el almacén —con el flete
repartido por un criterio que se puede leer en pantalla— y qué día exacto sale
de la cuenta el dinero de pagarla. Antes de esto el hub sabía el importe de un
pedido; ahora sabe **cuánta mercancía de ese pedido ha llegado, cuándo llegó
cada parte, qué le toca de flete a cada una y qué trozo del pedido todavía no
tiene ni fecha ni vencimiento**.

## Qué NO hace

- **No consulta ningún tipo de cambio.** La divisa de compra es solo registro:
  divisa y tipo se escriben a mano, con su fecha, y la pantalla los marca como
  introducidos a mano. La multidivisa está despriorizada con dato — un 1,19 %
  de las ventas, **cifra heredada del traspaso del 6 de septiembre que no se ha
  podido confirmar contra esta base**, dicha aquí como lo que es. Sin tipo
  escrito el hub no convierte, no crea lote y avisa; no inventa un 1.
- **No parte el flete por entrega.** El flete es una factura del pedido
  completo, así que el €/ud se calcula sobre el pedido y cada entrega carga su
  parte proporcional. Partir el envío no puede cambiar el coste unitario.
- **No coloca en la curva de caja el importe de un pedido sin vencimiento
  escrito.** Se mide y se avisa, pero no se le inventa una fecha: inventar la
  fecha es inventar el número.
- **No toca las devoluciones.** El encargo hablaba de «la parte B5 de
  `cashProjection`». Medido el 17-09-2026 sobre esta base: `cashProjection()`
  **no tiene ninguna sección de devoluciones**; las devoluciones viven en
  `pnl()` (`returnsCost`, `retIngreso`, `retComision`, `retCoste`), que es del
  carril 5. Aquí no se ha abierto. Lo nuevo se ha construido alrededor.
- **No cambia el criterio de cobertura de un pedido sin entregas declaradas.**
  Un pedido en estado «recibido» y sin entregas sigue cubriendo cero días,
  exactamente como antes. Cambiarlo sin dato haría más optimista la curva de
  todo el mundo de golpe.
- **No toca el estado «borrador».** Un borrador sigue sin cubrir días de
  reposición y sus vencimientos sí entran en la curva. Es asimétrico a
  propósito —prudente por los dos lados— pero está **sin decidir**, ver «Qué
  queda por medir».
- No hay vista nueva: la tabla de propiedad no le da ninguna a este carril. El
  panel de categorías de Tesorería lo cuelga `renderTesoreria()` de la sección
  ya existente, sin abrir `src/02-views.html`.

## Pruebas, y en qué dirección se vieron fallar

`tests/compras.test.js` · 54 comprobaciones. Cada sabotaje se aplicó sobre el
árbol commiteado, se recompiló y se ejecutó la suite; los mensajes de abajo son
**copia literal de la salida en rojo**, no una paráfrasis.

| Prueba | Qué demuestra | Mensaje en rojo, sin el arreglo |
|---|---|---|
| COM-A · un lote por entrega | Un pedido de 1.500 ud recibido en 600 + 500 crea dos lotes, no uno de 1.500 | `el pedido crea un lote por entrega, no uno por pedido → 1 lotes` |
| COM-A · unidades reales | Solo entra el stock que ha llegado | `y solo cuenta las unidades que han llegado de verdad → 1500 ud de las 1.500 pedidas · las otras 400 siguen en el barco` |
| COM-A · fecha por entrega | Cada lote lleva la fecha de SU recepción | `cada lote lleva la fecha de SU recepción → 2026-08-08 · esperadas 2026-08-08 · 2026-09-07` |
| COM-A · flete proporcional | El flete cargado es 3.000 × 1.100/1.500 | `el flete cargado es el del pedido en la proporción recibida → 3000.00 € = 3.000 × 1.100/1.500` |
| COM-B · entrega sin fecha | `poLotDate()` sigue mandando: sin fecha no hay lote | `y NO se le pega la fecha de «Recibido el» → 2026-09-12 · caer en 2026-09-12 fecharía ese stock semanas después de existir` |
| COM-C · reparto por peso | El mismo flete da 12, 15 o 18 €/ud según el criterio | `por peso: se invierte, el voluminoso paga (8,00 el barato) → A-1 15 € · B-2 45 € · sin el reparto por peso salía 15 y 45 como si fuera por unidades` |
| COM-C · base declarada | La base dice sobre qué total reparte | `la base del reparto por peso dice sobre qué total reparte → por unidades · 200 unidades · 5,0000 €/ud` |
| COM-D · degradación visible | Peso sin pesos no cae a unidades en silencio | `y la pantalla lo declara en vez de callarlo → por unidades · 200 unidades · 5,0000 €/ud` |
| COM-E · base en pantalla | La ficha del pedido enseña criterio y total | `la ficha del pedido enseña el criterio y el total de la base → ` (vacío) |
| COM-E · base en el CSV | El CSV lleva reparto pedido, aplicado, total y unidad | `el CSV lleva columnas de reparto pedido, aplicado, total y unidad → Pedido;Proveedor;…;Flete del p` |
| COM-F · cinco categorías | Cada día trae su desglose | `cada día trae sus cinco categorías → 90 de 90 días vienen sin desglose` |
| COM-F · cuadre | Las cinco suman la variación del saldo | `y las cinco suman exactamente la variación del saldo, los 90 días → no se ha podido comprobar: 90 días sin categorías` |
| COM-G · depósitos, con y sin | El depósito cae el día del pedido y el saldo al cerrar producción | `el depósito de producción cae el día del pedido y el saldo al cerrar fabricación → [] · esperado [{k:10,po:12000},{k:40,po:28000}]` |
| COM-G · dirección inversa | Quitarlos sube la caja final exactamente 40.000 € y nada más | `quitar los depósitos sube la caja final exactamente los 40.000 del pedido → 0.00 € de diferencia` |
| COM-G · plazo real | Alargar fabricación de 30 a 45 d mueve el pago del día 40 al 55 | `alargar la fabricación de 30 a 45 días mueve el saldo del día 40 al 55 → [] · esperado [10,55]` |
| COM-H · ancla sin resolver | Un depósito sin plazo declarado se cuenta aparte, no desaparece | (verde con el arreglo; el `return` mudo anterior lo hacía desaparecer de la curva mientras «Pagos comprometidos» lo seguía contando) |
| COM-I · calendario incompleto | 35.000 € de un pedido de 50.000 que la curva no gasta | `el hueco se mide en euros, no se deja para que alguien lo note → 0.00 € · sin la medición el hub enseña 35.000 € de caja que no tiene` |
| COM-I · aviso en pantalla | Tesorería y Compras lo cantan | `y Compras lo lleva en un KPI propio, con el importe dentro → «Sin calendario de pago€0todos los pedidos cuadran al 100%»` |
| COM-J · divisa sin tipo | Sin tipo no hay lote y la curva lo cuenta aparte | `sin tipo, el pedido NO crea ningún lote → 1 lotes · meter 45 USD en el catálogo como 45 € es un coste un 8% bajo que nadie ve` |
| COM-J · lote en euros | El lote entra convertido: (45 + 5) × 0,92 | `y el lote entra en euros, no en dólares: (45 + 5) × 0,92 → 50 € puestos` |
| COM-K · cobertura a medias | Con 600 de 1.500 recibidas, las 900 que faltan cubren 90 días | `con 600 de 1.500 recibidas, las 900 que faltan sí cubren 90 días → 0 d cubiertos · 9000 € de reposición frente a 9000 €` |
| COM-M · CSV de caja | Las categorías cuadran con la curva fila a fila | `y las categorías cuadran con la curva y con su columna de control, fila a fila → descuadre máximo 12750.0000 €` |

Las siete sabotajes usadas: entregas parciales, reparto por peso, base visible,
categorías, anclas de pago, medición del calendario y conversión de divisa.
Ninguna sale con un stack: todas salen con el número que aparece y el que se
esperaba.

`tests/caja.test.js` sigue verde sin tocar una línea (18 comprobaciones), igual
que `tests/m11.test.js` (86), que es la que fija que un pedido sin entregas siga
creando un lote por línea y que reaplicarlo no duplique.

**`npm run test:all`: 17 suites · 516 comprobaciones OK · 0 FALLO.** Antes de
empezar eran 16 suites y 462, medido sobre el mismo árbol el 17-09-2026.

## Revisión adversarial propia

*¿Qué pedido real haría que Tesorería enseñara una curva de caja plausible y
equivocada?* Seis candidatos; los cinco primeros están arreglados y probados.

1. **El pedido con el calendario a medias.** Un contenedor de 50.000 € en el
   que solo se teclea el anticipo del 30 % porque el saldo «ya lo pondré cuando
   salga el barco». La curva gasta 15.000 €, los otros 35.000 no aparecen en
   ninguna pantalla, y el veredicto de Tesorería llega a recomendar un pedido
   adicional que no cabe. Es el peor de todos porque el pedido está bien
   introducido: nada está vacío, nada da error. → `poSinCalendario()`, KPI en
   Compras y aviso en el veredicto.
2. **El pedido a medio recibir marcado «recibido».** Llegan 600 de 1.500, se
   marca el estado y se cierra la ficha. Antes: el lote entraba con 1.500
   unidades (stock y valor inventados) y a la vez el pedido dejaba de cubrir
   días de reposición, así que la curva restaba otra vez la mercancía que ya
   estaba pagando en los vencimientos. Los dos errores a la vez y en sentidos
   opuestos, que es lo que hace que el total parezca razonable.
3. **El flete «por peso» sin pesos.** Se elige el criterio correcto, no se
   rellena la columna de kilos, y la pantalla sigue diciendo «por peso»
   mientras reparte por unidades. En la fixture son 18 € frente a 15 € de coste
   puesto: un 20 % de diferencia en el SKU barato, que es justo donde el margen
   es estrecho.
4. **El pedido en dólares sin tipo.** 50.000 USD leídos como 50.000 €: 4.000 €
   de error en la curva con un número perfectamente creíble.
5. **El depósito anclado a producción sin plazo de fabricación declarado.**
   Antes el `parseDate` fallido hacía un `return` mudo y el importe se evaporaba
   de la proyección mientras el KPI «Pagos comprometidos» lo seguía contando:
   dos pantallas y dos verdades sobre el mismo dinero.
6. **El borrador que paga pero no cubre.** Sigue vivo y a propósito: un pedido
   en borrador no cubre días de reposición (no hay nada viajando) pero sus
   vencimientos sí entran en la curva. Es prudente por los dos lados, pero es
   una asimetría sin decidir. No se ha cambiado porque cualquiera de las dos
   salidas mueve la curva de todos los usuarios y esto no es una corrección de
   fallo: es una decisión.

## Costuras que pide a otros carriles

| Marca en el código | Carril destino | Qué hay que unificar al integrar |
|---|---|---|
| `// COSTURA → carril 2` en `src/27-compras.js` | 2 · Catálogo y costes | Los lotes creados por entregas llevan `poId = "<pedido>·<línea>·<entrega>"`. La pantalla de Lotes (`renderLotes`, `lotSummary`, `lotEditModal`) los enseña como lotes sueltos y deja editar las unidades a mano; el siguiente `applyPOCosts` las machaca sin avisar. Hace falta que la ficha diga de qué entrega de qué pedido viene y que las unidades salgan en solo lectura con enlace al pedido. |
| `// COSTURA → carril 6` en `src/27-compras.js` | 6 · Inventario y reposición | `invStats()` calcula `enCamino` filtrando por estado del pedido. Con entregas parciales, un pedido «recibido» puede tener unidades navegando: Tesorería ya las cuenta y el punto de pedido de Inventario no, así que las dos pantallas discrepan sobre la misma mercancía. Sustituir el filtro por `poEnCursoUnits(po, sku)`, que ya está escrito aquí. |

Ninguna de las dos se ha implementado editando fichero ajeno. `poEnCursoUnits`
vive en `src/27-compras.js` y solo la usa `cashProjection()`, que sí es de este
carril.

## Qué queda por medir

- **La asimetría del borrador** (punto 6 de la revisión adversarial). Desbloquea
  una decisión de Juancho: ¿un pedido en borrador gasta en la curva o no gasta?
  Hoy gasta y no cubre. Medirlo requiere saber cuántos borradores vivos suele
  haber en la base real.
- **El 1,19 % de ventas en divisa.** Cifra heredada del traspaso del 6 de
  septiembre, que **no está en este remoto** y no se ha podido confirmar. Se usa
  aquí solo para justificar que la multidivisa siga despriorizada, y se dice
  como heredada cada vez que aparece. Desbloquea: decidir si algún día el hub
  necesita tipos automáticos. Con un informe real de liquidaciones se podría
  medir de verdad.
- **El sobre-recibo.** Cuando una entrega trae más unidades de las pedidas, el
  hub avisa y **no recorta**, porque recortar en silencio es inventar. La
  consecuencia es que el flete repartido se pasa del total del pedido. Falta
  decidir qué es lo correcto en la práctica del negocio: ¿se sube lo pedido, o
  se abre una línea nueva? Desbloquea: una regla de reconciliación de packing
  list.
- **Los pesos reales de las referencias.** El reparto por peso está construido y
  probado con fixture, pero el catálogo no tiene columna de peso: los kilos se
  escriben hoy en la línea del pedido. Con los pesos del catálogo el reparto
  sería automático. Es del carril 2.
- **El ciclo de liquidación real de Amazon.** La curva sigue suponiendo ciclos
  regulares desde hoy. No se ha tocado, y no se ha medido contra ninguna
  liquidación real.

### Medido contra ficheros reales

**Nada.** Este carril no ha abierto ningún fichero real: todas las fixtures son
sintéticas, con la aritmética escrita a mano en el comentario de cada bloque
(`tests/compras.test.js`). Las únicas cifras de este documento son de fixture y
están dichas como tales.

> El repositorio es público. Si en algún momento se mide contra ficheros reales,
> el resultado va al documento del proyecto
> `seller-hub/carriles-2026-09/7-compras.md`, nunca aquí.
