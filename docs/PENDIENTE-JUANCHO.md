# Pendiente de Juancho

Cola de lo que **no puedo resolver yo** porque depende de una decisión suya o de un
dato real de su negocio. Cada entrada trae el contexto suficiente para responder de
una sentada, sin reconstruir nada.

Ordenado por **lo que más desbloquea**, no por lo que más urgente parezca.

Mientras algo esté aquí, el trabajo **sigue**: se anota y se pasa a lo siguiente.
Esa es la norma (`docs/METODO.md`).

Para responder basta con el número de la entrada y una línea. Lo que sean cifras
puede ir pegado desde una hoja de cálculo: el hub tiene carga por pegado.

---

## P-1 · La comisión real de Amazon en joyería

**Bloquea a:** Rentabilidad, Catálogo, Validador de producto, Comparador PanEU —
es decir, **todos los márgenes del hub a la vez**.

Ahora mismo el hub calcula con un **15 % por defecto**. En joyería/bisutería casi
seguro no es ese número. Es la variable que más distorsiona el margen hoy: un
punto de comisión mal puesto mueve el margen de contribución un punto entero, y
el margen es lo que decide qué producto se escala.

**Qué necesito:** el porcentaje de comisión por referencia que Amazon te cobra de
verdad, por categoría o por familia de producto. Sale del **informe de vista
previa de tarifas** (*Fee Preview*) de Seller Central, columna de comisión por
referencia. Con una fila por familia me vale.

**Mientras tanto:** dejo el 15 % y la pantalla dirá que es un supuesto, no una
medición.

---

## P-2 · Los lotes de compra reales de las cinco familias

**Bloquea a:** M1.1 (costes por lotes) — construido y probado, pero trabajando en
seco. Y con él, el coste de ventas de Rentabilidad, el capital inmovilizado de
Inventario y el beneficio por mercado.

**Qué necesito**, una fila por compra:

| SKU | fecha de recepción | unidades | coste de fábrica/ud | flete |
|---|---|---|---|---|

Dos avisos que valen dinero:

- La fecha es la de **recepción**, no la del pedido. Un contenedor que sigue en un
  barco no ha surtido ninguna venta; fecharlo por el pedido subía un 61 % el coste
  de ventas ya servidas.
- El **flete**: al pegar hay que decir si es *por unidad* o *total del lote*.
  Confundirlas mete un factor de cientos en el margen y el número sigue pareciendo
  creíble.

---

## P-3 · El hábito semanal de importar pedidos **e inventario**

**Bloquea a:** M0 (histórico), M1.1 (cuadre de unidades), M2 (velocidad real).

Desde M1.1 el informe de **inventario ya no es opcional**: sin el stock no se
puede cuadrar cuántas unidades había, y sin ese cuadre el módulo de costes trabaja
a ciegas — lo dice en pantalla, pero trabajar a ciegas sigue siendo trabajar a
ciegas.

Además, **la resolución del histórico de stock es la de la costumbre de importar**.
Importando una vez por semana se conoce el stock de un día de cada siete; los otros
seis son interpolación conservadora, no medición.

**Qué necesito:** confirmar con qué frecuencia vas a importar de verdad, para
ajustar lo que la pantalla promete. No lo que te gustaría hacer: lo que vas a hacer.

---

## P-4 · Lista de gastos fijos mensuales

**Bloquea a:** M1.3 (gastos indirectos con amortización diaria) y, con él, el
beneficio neto del P&L. Sin esto solo puedo dar margen de contribución, que es
verdad pero no es lo que acaba en el banco.

**Qué necesito:** concepto e importe mensual. Gestoría, almacenamiento, software,
cuota de Amazon, lo que haya. Si algo es anual, dímelo anual y lo reparto yo.

---

## P-5 · Plazos y condiciones de los dos proveedores

**Bloquea a:** M3 (compras y caja) — cuándo hay que lanzar un pedido para no
romper stock, y cuándo sale el dinero.

**Qué necesito, por proveedor:** días de fabricación, días de tránsito, y
condiciones de pago (qué % por adelantado y cuándo el resto).

---

## P-6 · La base de la comisión: ¿sobre el precio con IVA o sin IVA?

**Bloquea a:** la exactitud de todos los márgenes. Son **más de tres puntos**.

El contrato europeo de Amazon la define sobre el precio **con impuestos**, y así
está implementada. Pero hay fuentes que sostienen lo contrario cuando el servicio
de cálculo de IVA está activado. No es algo que yo pueda resolver leyendo código.

**Qué necesito:** una consulta escrita a Seller Support, y su respuesta. Escrita,
no de teléfono. Mientras tanto mantengo *con impuestos*, que es la lectura
conservadora: da el margen más bajo de las dos, y prefiero equivocarme por abajo.

---

## P-7 · PPWR / EPR — no es un problema de software

**Bloquea a:** nada del código. Pero es el único riesgo real de **bloqueo de
listados**, y programar no lo arregla.

La fecha del 12 de agosto de 2026 ya pasó y hay mercados activos sin registro de
EPR completo. Lo dejo anotado aquí para que no se pierda entre cosas técnicas.

---

## Índice

| # | Bloquea a | Asunto | Estado |
|---|---|---|---|
| P-1 | todos los márgenes | comisión real de Amazon en joyería | abierto |
| P-2 | M1.1 y todo el coste de ventas | lotes de compra reales | abierto |
| P-3 | M0, M1.1, M2 | hábito de importar pedidos **e inventario** | abierto |
| P-4 | M1.3 y el beneficio neto | gastos fijos mensuales | abierto |
| P-5 | M3 | plazos y pago de proveedores | abierto |
| P-6 | exactitud de los márgenes | base de la comisión, ¿con IVA o sin? | abierto |
| P-7 | nada del código | EPR/PPWR, riesgo de bloqueo de listados | abierto |
