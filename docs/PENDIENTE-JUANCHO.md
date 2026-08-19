# Pendiente de Juancho

Cola de lo que **no puedo resolver yo** porque depende de una decisión suya o de
un dato real de su negocio. Cada entrada trae el contexto suficiente para
responder de una sentada, sin reconstruir nada.

Ordenado por **lo que más desbloquea**, no por lo que más urgente parezca.

Mientras algo esté aquí, el trabajo **sigue**: se anota y se pasa a lo siguiente.
Esa es la norma (`docs/METODO.md`).

Para responder basta con el número de la entrada y una línea. Lo que sean cifras
puede ir pegado desde una hoja de cálculo: el hub tiene carga por pegado.

---

## P-1 · Los lotes de compra reales de las cinco familias

**Bloquea a:** M1.1 y, con él, el coste de ventas de Rentabilidad, el capital
inmovilizado de Inventario y el beneficio por mercado. Es lo que más desbloquea
de toda esta lista: el motor de costes está construido y probado, y trabajando
en seco.

**Qué necesito**, una fila por compra:

| SKU | fecha de recepción | unidades | coste de fábrica/ud | flete |
|---|---|---|---|---|

Dos avisos que valen dinero:

- La fecha es la de **recepción**, no la del pedido. Un contenedor que sigue en
  un barco no ha surtido ninguna venta; fecharlo por el pedido subía un 61 % el
  coste de ventas ya servidas.
- El **flete**: al pegar hay que decir si es *por unidad* o *total del lote*.
  Confundirlas mete un factor de cientos en el margen y el número sigue
  pareciendo creíble.

---

## P-2 · El informe de vista previa de tarifas (*Fee Preview*)

**Bloquea a:** la exactitud de todos los márgenes a la vez.

Esto **ha cambiado desde la última vez**: ya no necesito que me digas el
porcentaje. El hub ya lee ese informe y saca de él la comisión y la tarifa de
logística reales **por SKU**, y manda sobre cualquier porcentaje puesto a mano.
Antes se importaba y no llegaba a ningún número.

**Qué necesito:** que lo descargues y lo importes.
*Informes › Logística de Amazon › Pagos › Vista previa de tarifas.*

**Mientras tanto:** se usa el porcentaje que tengas en cada producto, y si no
hay ninguno, el 15 % por defecto. La pantalla enseña el tipo efectivo calculado
para que se vea de dónde sale. En joyería el 15 % se queda corto y son unos seis
puntos de margen.

---

## P-3 · El hábito semanal de importar pedidos **e inventario**

**Bloquea a:** M0 (histórico), M1.1 (cuadre de unidades), M2 (velocidad real).

Desde M1.1 el informe de **inventario ya no es opcional**: sin el stock no se
puede cuadrar cuántas unidades había.

Y hay un efecto que conviene ver medido, porque decide cuánto repones:

| foto de inventario cada… | velocidad real que sale | error |
|---|---|---|
| 1 día | 6,00 ud/día | exacta |
| 3 días | 6,00 ud/día | exacta |
| 7 días | 4,62 ud/día | −23 % |
| 14 días | 4,00 ud/día | −33 % |
| ninguna | 4,00 ud/día | −33 %, y no se detecta ninguna rotura |

Con una foto semanal, la velocidad real se queda un 23 % por debajo de la
verdadera, y una velocidad baja hace reponer corto y repetir la rotura. La
pantalla ya lo dice cuando le faltan fotos, pero decirlo no lo arregla.

**Qué necesito:** confirmar con qué frecuencia vas a importar **de verdad**, no
lo que te gustaría hacer. Con ese dato ajusto lo que la pantalla promete.

---

## P-4 · Lista de gastos fijos mensuales

**Bloquea a:** M1.3 y, con él, el beneficio neto del P&L. Sin esto solo puedo
dar margen de contribución, que es verdad pero no es lo que acaba en el banco.

**Qué necesito:** concepto e importe mensual. Gestoría, almacenamiento,
software, cuota de Amazon, lo que haya. Si algo es anual, dímelo anual y lo
reparto yo.

---

## P-5 · Plazos y condiciones de los dos proveedores

**Bloquea a:** M3 (compras y caja) — cuándo hay que lanzar un pedido para no
romper stock, y cuándo sale el dinero.

**Qué necesito, por proveedor:** días de fabricación, días de tránsito, y
condiciones de pago (qué % por adelantado y cuándo el resto).

---

## P-6 · Tu saldo de partida y tu colchón real

**Bloquea a:** la proyección de caja a 90 días, que es el número con el que se
decide si cabe un pedido.

La curva ya descuenta la reposición de lo que vendes —antes proyectaba un
negocio que vende noventa días y no vuelve a comprar género— así que ahora el
saldo de partida manda de verdad sobre el resultado.

**Qué necesito:** el saldo con el que arrancas, el colchón por debajo del cual
no quieres bajar, y si sigues liquidando cada 14 días.

---

## P-7 · La base de la comisión: ¿sobre el precio con IVA o sin IVA?

**Bloquea a:** la exactitud de los márgenes. Son **más de tres puntos**.

El contrato europeo de Amazon la define sobre el precio **con impuestos**, y así
está implementada. Hay fuentes que sostienen lo contrario cuando el servicio de
cálculo de IVA está activado. No lo puedo resolver leyendo código.

**Qué necesito:** una consulta escrita a Seller Support, y su respuesta. Escrita,
no de teléfono. Mientras tanto mantengo *con impuestos*, que da el margen más
bajo de las dos lecturas: prefiero equivocarme por abajo.

*Nota: si importas el informe de vista previa de tarifas (P-2), esta pregunta
pierde casi toda su importancia, porque entonces la comisión sale medida y no
calculada.*

---

## P-8 · La fase de tu ciclo de cobro de Amazon

**Bloquea a:** el «caja mínima a 90 días», que es el que dispara la alerta roja.

El hub sitúa el primer cobro a un ciclo completo desde hoy, que es el supuesto
más prudente. Pero la fase real es desconocida y mueve mucho: con los datos de
ejemplo, el mínimo va de **1.424 € a 5.501 €**, casi cuatro veces, sin que
cambie ningún dato.

**Qué necesito:** la fecha de tu **último** desembolso de Amazon. Con eso el
mínimo deja de ser un supuesto.

---

## P-9 · ¿Te cobra Amazon tasa de procesamiento de devolución?

**Bloquea a:** la exactitud del coste de las devoluciones en el P&L.

Ya está dentro la mecánica que sí sé: se devuelve el ingreso, Amazon reintegra
la comisión menos la tasa de gestión del reembolso, y la tarifa de logística no
vuelve. Lo que **no** está es la tasa de procesamiento de devolución, porque
depende de la categoría y del porcentaje de devoluciones de cada referencia.
Si te la cobran, tu beneficio real es algo menor que el que enseña la pantalla,
y ahora mismo lo digo en pantalla en vez de inventarme el importe.

**Qué necesito:** una liquidación donde se vea si aparece ese concepto, o
confirmación de que en tu categoría no se aplica.

---

## P-10 · Decisión: ¿cableo los tres informes que hoy se guardan y no se usan?

**Bloquea a:** nada ahora mismo. Es una decisión de prioridad, tuya.

Tres informes se importan bien, se guardan enteros y **todavía no alimentan
ningún cálculo**. La pantalla de Datos ya lo dice en vez de lucir un tick:

| Informe | Qué daría | A qué módulo pertenece |
|---|---|---|
| Libro mayor de inventario | movimientos de stock por país, y detectar pérdidas en almacén | M5, detectores de reembolso |
| Tarifas mensuales de almacenamiento | coste real de almacenaje, hoy estimado en 0 € | M1.3, gastos indirectos |
| Transacciones sujetas a IVA | IVA realmente liquidado por país | M1.4 e M6 |

**Qué necesito:** si alguno de los tres te corre más prisa que el orden previsto
(M1.2 → M1.3 → M1.4 → M2 → M3 → M4 → M5 → M6), dímelo y lo adelanto.

---

## P-11 · PPWR / EPR — no es un problema de software

**Bloquea a:** nada del código. Pero es el único riesgo real de **bloqueo de
listados**, y programar no lo arregla.

La fecha del 12 de agosto de 2026 ya pasó y hay mercados activos sin registro de
EPR completo. Queda anotado aquí para que no se pierda entre cosas técnicas.

---

## Índice

| # | Bloquea a | Asunto | Estado |
|---|---|---|---|
| P-1 | M1.1 y todo el coste de ventas | lotes de compra reales | abierto |
| P-2 | todos los márgenes | importar la vista previa de tarifas | abierto |
| P-3 | M0, M1.1, M2 | frecuencia real de importación | abierto |
| P-4 | M1.3 y el beneficio neto | gastos fijos mensuales | abierto |
| P-5 | M3 | plazos y pago de proveedores | abierto |
| P-6 | la proyección de caja | saldo de partida y colchón | abierto |
| P-7 | exactitud de los márgenes | base de la comisión, ¿con IVA o sin? | abierto |
| P-8 | la caja mínima a 90 días | fecha del último desembolso de Amazon | abierto |
| P-9 | coste de las devoluciones | ¿hay tasa de procesamiento? | abierto |
| P-10 | prioridad, no cálculo | ¿cableo los tres informes parados? | abierto |
| P-11 | nada del código | EPR/PPWR, riesgo de bloqueo de listados | abierto |
