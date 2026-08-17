# Plan para igualar Sellerboard — Aresstore Seller Hub
**17 de agosto de 2026 · sobre la v0.4 ya desplegada**

---

## 1 · Lo que he averiguado y por qué cambia el plan

Sellerboard cuesta 19–39 $/mes, es alemán, lleva desde 2017 y tiene unos 20.000 vendedores. Su nota es 4,7/5 en G2 con 57 reseñas. No es un rival de pega: en lo financiero está bien hecho.

Pero al desmontarlo módulo a módulo aparecen tres cosas que definen nuestra estrategia.

**Primera: el 75% de su valor no depende de la API de Amazon.** Todo el motor de costes por lotes, todo el P&L y sus agregaciones, los gastos indirectos, la caja, el planificador de inventario, los pedidos de compra, el análisis completo de PPC —incluido el ACOS de equilibrio, que es su mejor idea— y los diez informes exportables salen de informes que tú puedes descargar a mano. Lo que sí exige API es lo accesorio (autoresponder, etiquetas, automatizar pujas) más una cosa genuinamente valiosa e insustituible: **las alertas de listado y Buy Box**, que necesitan consultar a Amazon cada pocos minutos.

**Segunda: tiene siete huecos que a ti te afectan de lleno.** No los cubre nadie y son precisamente europeos.

| Hueco de Sellerboard | Por qué te importa |
|---|---|
| Multidivisa con **una sola tasa**, la del último día del periodo | Compras en USD o CNY y vendes en EUR, PLN y SEK. Su método distorsiona márgenes |
| IVA reducido a **tres casillas** | Tú tienes PanEU con registros locales y OSS |
| **Cero** funcionalidad de EPR | El PPWR ya está en vigor y es tu único riesgo de apagón |
| Borra los datos a los **18 meses** | Sin histórico no hay estacionalidad, y la joyería la tiene brutal |
| Previsión de caja que solo **extrapola el pasado** a 3 periodos | No modela depósitos de producción ni plazos de fabricación |
| Reparto de flete **no documentado** | No puedes auditar tu propio coste unitario |
| Lentitud — es su queja número uno | Tú trabajas con 5 familias de producto, no con 30.000 |

**Tercera, y es la más urgente: hay un dato que se pierde para siempre cada día que pasa.** Su planificador de inventario funciona porque guarda una foto del stock cada día. Nosotros no guardamos nada: cada importación reemplaza la anterior. Cada día sin capturar es un día de historia irrecuperable. Esto tiene que ser lo primero, antes que cualquier módulo bonito.

---

## 2 · Dónde estamos hoy

| Área | Sellerboard | Nosotros (v0.4) | Distancia |
|---|---|---|---|
| Métricas del P&L | 21 | 11 | Faltan 10 |
| Coste de producto | Lotes con FIFO, ponderado y por periodo | Un coste constante por SKU | **Crítica** |
| Fees | Reales, a nivel de línea de pedido | Reales solo con liquidación en inglés; si no, estimados | Media |
| Histórico | 18 meses | Ninguno | **Crítica** |
| Velocidad de ventas | Excluye días sin stock | Media simple del periodo | Alta |
| Planificador | 6 parámetros por producto | Plazo + colchón | Media |
| Gastos indirectos | Amortización diaria y asignación por producto | Total mensual prorrateado | Media |
| Caja | Por ciclo de cobro, 5 categorías | Por ciclo de cobro, con vencimientos de pedidos | **Ya vamos por delante** |
| Pedidos de compra | Estados, entregas parciales, crean lote de coste | Estados y reparto de flete | Media |
| PPC | ACOS de equilibrio por keyword, ACOS real | Desperdicio y TACOS | Alta |
| Reembolsos | 4 detectores | Ninguno | Alta |
| IVA / EPR | Casi nada / nada | Registro por país | **Ya vamos por delante** |
| Alertas de listado | Sí | No | Solo con API |

---

## 3 · El plan, por módulos

Ocho módulos. El orden no es negociable en los dos primeros, y sí lo es a partir del tercero.

---

### M0 · Empezar a guardar historia — *primero, y hoy*

**Por qué ahora:** el dato que no captures hoy no lo vas a poder reconstruir nunca. Este módulo no se ve en pantalla y es el que más valor genera a doce meses.

**Qué construyo**
1. Cada importación se archiva con su fecha en lugar de reemplazar a la anterior.
2. Una foto diaria de: stock por SKU y por país, precio de venta, tarifa FBA vigente, comisión aplicada.
3. Registro de días sin stock por SKU — es lo que permitirá calcular la velocidad de ventas de verdad.
4. Compactación: el detalle línea a línea se resume a partir de los 90 días para que el navegador no se ahogue.
5. Copia de seguridad automática recordada cada semana, con aviso si llevas más de siete días sin descargarla.

**Qué necesito de ti:** importar el informe de pedidos y el de inventario **una vez por semana**, sin fallar. Es el único hábito que sostiene todo lo demás.

---

### M1 · El motor financiero — *el corazón, y lo siguiente*

**Qué construyo**

**1.1 · Costes por lotes.** Hoy cada SKU tiene un coste único. Pasará a tener lotes con fecha, cantidad y coste unitario, y tres métodos a elegir: **por periodo** (el coste vigente en la fecha de la venta), **FIFO** (consume el lote más antiguo) y **promedio ponderado**. Con precios de proveedor y flete moviéndose, un coste constante falsea el margen exactamente donde decides si escalar.

**1.2 · Las diez métricas que faltan.** Para igualar su panel: `Promo`, `Coste de devoluciones`, `Devoluciones revendibles`, `Cobro estimado`, `ACOS real`, `% de devoluciones`, `Sesiones`, `% de sesión por unidad`, `Beneficio bruto` separado de `Beneficio neto`, y `Suscripciones activas`.

**1.3 · Gastos indirectos como es debido.** Amortización diaria en lugar de prorrateo mensual, y asignación opcional a un producto o a un mercado concreto. Un gasto de 1.200 € anual de gestoría alemana debe caer sobre Alemania, no repartirse entre todo.

**1.4 · El IVA como línea propia del P&L**, restada del beneficio bruto. En Europa no es opcional y Sellerboard lo trata de pasada.

**1.5 · Vistas del panel.** Sus cinco: tarjetas comparando periodos, gráfica temporal, tabla P&L con meses en columnas, por producto y por mercado. Y comparación con el periodo anterior.

**1.6 · Exportación con columnas fijas.** Aprendiendo de su fallo documentado: sus exportaciones cambian de columnas según el periodo, lo que rompe cualquier hoja de cálculo que las consuma. Las nuestras serán estables.

**Qué necesito de ti:** cargar los lotes de compra reales de tus cinco familias —fecha, cantidad, coste de fábrica y flete— y la lista de gastos fijos mensuales. Es la tarde de trabajo que hace creíble todo lo demás.

---

### M2 · Inventario que decide de verdad

**Qué construyo**
1. **Velocidad de ventas excluyendo los días sin stock.** Es el detalle técnico que más valor aporta de todo su planificador: si vendiste 60 unidades en 30 días pero estuviste 12 días roto, tu velocidad no es 2/día, es 3,3/día. Decidir con 2 te vuelve a romper.
2. **Seis parámetros por producto:** tiempo de fabricación del proveedor, tránsito, recepción en Amazon, colchón en días, rango de stock objetivo tras reponer, y frecuencia de pedido deseada.
3. **Stock en tránsito y reservado** contados aparte del disponible.
4. **Cobertura por país** con el aviso de tarifa por bajo inventario donde aplica.
5. **Estacionalidad**, en cuanto M0 tenga suficientes meses.

---

### M3 · Compras y caja

**Qué construyo**
1. **El pedido de compra crea el lote de coste al recibirse.** Eso cierra el círculo compra → coste → margen sin que toques nada.
2. **Entregas parciales:** un pedido se puede recibir en dos veces y generar dos lotes.
3. **Reparto de flete auditable:** por unidades, por valor o por peso, con la base a la vista. El suyo no está documentado y no puedes comprobarlo.
4. **Caja mejorada:** sus cinco categorías —cobros, inversiones, gastos, compra de mercancía, dividendos— más lo que él no tiene: los **depósitos de producción programados** y los plazos de fabricación reales.
5. **Multidivisa con tasa diaria** en lugar de una tasa única por periodo.

---

### M4 · Publicidad con criterio

Su mejor idea, y es replicable entera porque las fórmulas están publicadas.

**Qué construyo**
1. **ACOS de equilibrio por palabra clave**, calculado con tu margen real de ese SKU. Es el techo de gasto que puedes sostener, y ninguna herramienta de Amazon te lo da.
2. **Puja de equilibrio**, derivada del ACOS de equilibrio y tu tasa de conversión.
3. **ACOS real** y TACOS, separando lo orgánico de lo pagado.
4. **Términos de búsqueda en tres capas** como los suyos, con histórico propio.
5. **Registro de cambios de puja** con la regla de las 72 horas incorporada: si intentas tocar una puja antes de tres días, te avisa.

**Lo que NO construyo:** automatizar las pujas. Eso exige la API de publicidad en escritura, y sus propias reseñas de la competencia están llenas de gente a la que la automatización se le fue de las manos.

---

### M5 · Dinero que Amazon te debe

Cuatro detectores. Los dos primeros son fáciles y ya pagan el esfuerzo.

1. **Devoluciones fantasma** — hay reembolso al cliente, no hay devolución registrada y Amazon no te compensó. Ventana de 105 días.
2. **Diferencia de reembolso** — Amazon te reembolsó menos que tu coste real del producto. Ventana de 60 días. Depende de que M1 esté hecho.
3. **Inventario perdido o dañado** no compensado. Ventana de 60 días.
4. **Cambios de tarifa FBA** — detecta cuando Amazon empieza a cobrarte una tarifa distinta por el mismo ASIN. Requiere el histórico de M0.

Cada caso con su importe estimado y la plantilla del mensaje para abrir la reclamación.

---

### M6 · Donde le pasamos por encima

Nada de esto existe en Sellerboard y todo es crítico para ti.

1. **IVA por país y OSS** de verdad, con el coste amortizado entrando en el margen unitario.
2. **EPR y PPWR** con vencimientos y documentación adjunta.
3. **Histórico sin límite** — él borra a los 18 meses.
4. **Multidivisa con tasas diarias.**
5. **Caja con plazos de fabricación y depósitos**, que él no modela.
6. **Reparto de flete auditable.**

---

### M7 · Lo que exige API — decidir, no construir todavía

Alertas de listado, hijacking, Buy Box y supresiones. Es lo único verdaderamente valioso que no se puede replicar descargando informes, porque necesita consultar a Amazon continuamente.

**Mi recomendación:** no lo construyas. Cuando lo necesites, o pagas los 19 $/mes de Sellerboard solo por eso, o registras la aplicación privada de SP-API. Pero eso convierte esto en software que hay que mantener, y ese día llega cuando el hábito ya está asentado, no antes.

---

## 4 · Orden de ejecución

| Paso | Módulo | Qué desbloquea |
|---|---|---|
| **1** | **M0** · Historia y snapshots | Todo lo demás. Y cada día de retraso es historia perdida |
| **2** | **M1.1** · Costes por lotes | Que el margen deje de ser aproximado |
| **3** | **M1.2–1.4** · Métricas, gastos, IVA | El P&L completo |
| **4** | **M2** · Velocidad e inventario | Dejar de romper stock y de sobrecomprar |
| **5** | **M5.1–5.2** · Dos detectores de reembolso | Dinero recuperado, con esfuerzo bajo |
| **6** | **M3** · Compras y caja | Cerrar el círculo del coste |
| **7** | **M4** · ACOS de equilibrio | Decidir presupuesto de PPC con criterio |
| **8** | **M6** · Diferenciales europeos | Lo que nadie te vende |
| **9** | **M1.5–1.6** · Vistas y exportación | Comodidad, al final |

Los pasos 1 y 2 son los que cambian los números que ves. Del 3 en adelante podemos reordenar según lo que te vaya pidiendo el uso.

---

## 5 · Lo que necesito de ti, por orden

1. **Importar cada semana** el informe de pedidos y el de inventario. Sin este hábito, nada de esto sirve.
2. **Los lotes de compra reales** de tus cinco familias: fecha, cantidad, coste de fábrica, flete.
3. **La lista de gastos fijos** mensuales con su importe.
4. **La comisión real** que te cobra Amazon: sale del informe de vista previa de tarifas. Si vendes joyería y estamos calculando al 15%, ese es el número que más te distorsiona el margen ahora mismo.
5. **Los plazos reales** de tus dos proveedores: fabricación, tránsito y condiciones de pago.

---

## 6 · Lo que no vamos a construir, y por qué

**Autoresponder de reseñas.** Amazon ya tiene su botón nativo. La versión personalizada añade riesgo de suspensión y su plan básico solo permite 150 al mes, lo que lo hace casi simbólico.

**Flujo de revendedor.** Está diseñado para arbitraje y compra al mayor. Tú eres marca propia.

**Automatización de pujas, etiquetas FNSKU, asistente de envíos, escáner móvil, aplicación móvil nativa, multiusuario con permisos.** Comodidad que Seller Central ya cubre o que no necesitas con cinco familias de producto.

---

## 7 · Aviso honesto

Sellerboard cuesta 19 $ al mes y está bien hecho. Si lo único que quieres es tu beneficio neto diario calculado solo y sin mantener nada, cómpralo.

Lo que estamos construyendo tiene sentido por otra razón: **conecta compras, proveedores, caja, IVA y EPR con el mismo dato**, cosa que él no hace, y lo hace pensado para PanEU europeo en lugar de para Estados Unidos. El coste es que el dato entra cuando tú lo metes.

Y una limitación que no desaparece con ningún módulo: **el beneficio proyectado seguirá siendo lineal**, porque el coste de publicidad por unidad sube al escalar y modelarlo bien exige una curva que solo se construye con tu propio histórico. Trátalo siempre como techo, no como previsión.

---

*Tarifas contrastadas contra el rate card europeo de Amazon vigente el 1-jul-2026. Datos de Sellerboard consultados en su base de conocimiento oficial en agosto de 2026. Esto no es asesoramiento fiscal ni contable.*
