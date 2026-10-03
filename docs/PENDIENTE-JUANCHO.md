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

## P-12 · Los cuatro informes reales, cargados por ti (paso 4 del método)

**Bloquea a:** nada del código. Bloquea el paso a **apta** de todo el hub.

Me pediste verificar el importador con ficheros reales de Seller Central para
pedidos, inventario, devoluciones y vista previa de tarifas. **No lo he hecho, y
por dos razones, las dos importantes.**

**La primera es tuya:** `docs/METODO.md` lo prohíbe explícitamente. «Jamás
cargues datos reales de mi negocio. Sintéticos siempre», y entre lo que la norma
prohíbe está «cargar datos reales para *ir probando* mientras se construye». Los
datos reales son el paso 4 y van al final, contigo delante. Lo escribiste
precisamente porque un número creíble y falso con datos reales encima se
convierte en una decisión tomada.

**La segunda es material:** esos ficheros no existen en mi entorno. Solo tú
puedes descargarlos, y en cuanto los descargues dejan de ser sintéticos.

Lo que sí he hecho mientras tanto, que es lo que se puede hacer sin ellos:
endurecer el importador contra lo que de verdad rompe a los importadores con
ficheros reales — codificaciones, saltos de línea, comillas, separadores de
miles, columnas vacías y celdas con el separador dentro.

**Qué necesito de ti, cuando quieras hacer el paso 4:** descarga los cuatro y
súbelos. Los abro contigo delante, uno a uno, y comparamos lo que sale en
pantalla con lo que tú sabes de tu negocio. Es una sola tanda:

| Informe | Dónde | Qué miramos al cargarlo |
|---|---|---|
| Todos los pedidos | Informes › Logística de Amazon | que traiga la **columna de impuestos** (ver P-13) |
| Gestión de inventario FBA | Informes › Logística de Amazon › Inventario | que el stock cuadre con lo que tienes |
| Devoluciones FBA | Informes › Logística de Amazon › Concesiones al cliente | la tasa real de devolución |
| Vista previa de tarifas | Informes › Logística de Amazon › Pagos | la comisión real por SKU (esto cierra P-2) |

---

## P-13 · ¿Tu informe de pedidos trae la columna de impuestos?

**Bloquea a:** que el margen esté medido en vez de deducido.

El impuesto es una columna **opcional** del informe «Todos los pedidos». Cuando
no viene, el hub deduce el IVA del tipo del país y **lo dice**, pero deducir no
es leer: con la base deducida el margen no puede sellarse como medido por muy
reales que sean las comisiones.

Esto no era menor. Sin la columna, el margen salía 4,5 puntos alto y —peor— se
invertía el orden entre mercados: el país de tipo más alto es genuinamente el
peor, porque Amazon cobra la comisión sobre el precio con IVA, y sin la columna
aparecía como el mejor.

**Qué necesito:** abre tu «Todos los pedidos» y mira si hay una columna
`item-tax` o «Impuesto del artículo». Si no está, hay que volver a descargarlo
pidiéndola. La pantalla de Datos te dice cuántas líneas y qué porcentaje de tu
ingreso vienen sin ella.

---

## P-12b · Activar el *secret scanning* de GitHub — dos clics tuyos

**Bloquea a:** nada del código. Es la parte del encargo del 23 de agosto que yo
no puedo ejecutar.

**Confirmado:** el repositorio es **público** (`visibility: public`) y
`security_and_analysis` viene a `null`, es decir, sin nada activado.

**No puedo activarlo desde aquí.** El proxy de este entorno bloquea las
escrituras de ajustes del repositorio:
`{"message":"Repository settings writes are not permitted through this proxy."}`,
HTTP 403. Es la misma pared que impide borrar ramas (P-14).

**Qué necesito:** en
`github.com/Juancho-BackToWin/aresstore-seller-hub/settings/security_analysis`,
activar **Secret scanning** y **Push protection**. La segunda es la que importa:
impide el `git push` que llevaría un secreto dentro, en vez de avisarte después.
Un secreto en un repositorio público está comprometido desde el segundo en que
se empuja, y rotarlo no lo borra del historial.

**Mientras tanto**, `tests/privacidad.test.js` corre **el primero** de
`npm run test:all` y revisa el árbol entero en cada ejecución: ocho patrones de
credencial, que las columnas de comprador de los fixtures estén vacías, y que no
se haya colado ningún fichero con nombre de descarga de Seller Central. No
sustituye a la protección de GitHub —yo solo veo lo que ya está en disco— pero
cubre el descuido más probable.

---

## P-14 · Borrar dos ramas en GitHub — un clic tuyo

**Bloquea a:** nada. Es limpieza.

Me pediste borrar `parche-margen-honesto` y `claude/verify-git-environment-nbjq49`.
Siguen ahí, y se han sumado `claude/margen-honesto` y `claude/traspaso-al-dia`,
las dos ya mergeadas y sin un solo commit fuera de `main`.
**No puedo desde aquí:** el proxy de este entorno bloquea el borrado de ramas,
por `git push --delete` y por la API REST, las dos con 403
(«Write access to this GitHub API path is not permitted through this proxy»).
No es un permiso que yo pueda darme.

**Qué necesito:** bórralas tú en
`github.com/Juancho-BackToWin/aresstore-seller-hub/branches`. Las dos están
mergeadas en `main`; `claude/verify-git-environment-nbjq49` no tiene ni un commit
fuera. Un aviso: `parche-margen-honesto` sí tiene uno fuera, el que añadió el
fichero `seller-hub-5-commits.patch`. Su **contenido** está en `main` como los
cinco commits, pero el fichero `.patch` en sí desaparece al borrar la rama. Si lo
quieres conservar como archivo histórico, dímelo antes.


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
| P-12 | el paso a «apta» de todo | los cuatro informes reales, cargados por ti | **hecho el 23-ago** |
| P-12b | seguridad del repositorio público | activar secret scanning y push protection | abierto |
| P-13 | margen medido vs deducido | ¿tu informe de pedidos trae la columna de impuestos? | abierto |
| P-14 | nada, es limpieza | borrar dos ramas en GitHub (no puedo desde aquí) | abierto |

---

## P-19 · Fusionar la PR #18, que bloquea el paso 5 de Publicidad

**Bloquea a:** el bloque 1 del plan maestro del 3-oct —comprobar sobre
producción las cifras del §1 del traspaso— y, con él, lo único que queda para
que Publicidad pueda llegar a **apta**.

La #18 («Noche del 2-10: .xlsx, solapes, cruce EPR, IVA por cobertura, filas
gemelas y PPC por SKU») sigue **abierta** sobre `main`. Mientras no entre,
`aresstore-seller-hub.vercel.app` sirve una versión anterior y no tiene sentido
cargar los quince .xlsx contra producción: se medirían cifras del código viejo.

**Qué necesito:** fusionarla en el editor web de GitHub. Después, la de esta
sesión.

---

## P-20 · El contenedor de las sesiones no trae Pillow, y eso rompe `build.sh`

**Bloquea a:** nada de fondo, pero **cuesta media hora de cada sesión nueva** y
la primera impresión es tres suites en rojo.

`build.sh:99` genera los iconos de la PWA con Pillow. El contenedor no lo trae,
así que `build.sh` sale con código 1 y `costuras.test.js` da **3 fallos** que no
tienen nada que ver con el código. Se arregla con `pip install Pillow`, pero hay
que saberlo.

**Qué necesito, una de las dos:**

1. Declararlo en un `SessionStart` hook del repositorio, que es lo limpio: cada
   sesión nueva lo instala sola y nadie vuelve a tropezar. Lo puedo escribir yo
   si me dices que sí.
2. O que `build.sh` detecte que falta y lo diga con esas palabras —«falta
   Pillow: `pip install Pillow`»— en vez de salir 1 a secas.

Mi recomendación es la 1, y de paso deja el entorno reproducible para cualquier
dependencia que haga falta mañana.

---

## P-21 · Los informes de Amazon posteriores al 23 de agosto

**Bloquea a:** el bloque 3 (medir los detectores de reclamación con informes más
largos), el bloque 5 (inventario y las diez `FBASPB`) y el paso 5 de medio hub.

En la sesión del 3-oct **la carpeta de Descargas no estaba conectada**, así que
no pude ni enumerar qué hay. Lo que hace falta, por orden de lo que más
desbloquea:

| informe | para qué | por qué ahora no se puede |
|---|---|---|
| **Devoluciones**, de más de 45 días | el detector de devolución reembolsada y no devuelta | con menos de 45 días la ventana no se ha abierto para ninguna: cero casos, y no por un fallo |
| **Libro mayor de inventario** | el detector de extraviado o dañado en el centro logístico | se importa y se queda parado |
| **Tarifas**, una segunda vista previa | el detector de tarifa cobrada de más | hace falta un antes y un después para ver el cambio |
| **Gestión de inventario** | cobertura por país y previsión (M2) | — |
| **Pedidos**, sobre todo mayo de 2026 | el histórico y la velocidad real | — |
| **Términos de búsqueda** | ya hay quince; sirven para el bloque 1 | — |
| **Transacciones** | el P&L y Tesorería | — |

**Qué necesito:** conectar la carpeta de Descargas a la sesión, o subirlos.

---

## P-22 · A qué SKU se aplica cada familia de coste (las diez `FBASPB`)

**Bloquea a:** el bloque 5 del plan maestro, y el coste de ventas de cualquier
referencia que use una familia.

Esto **no lo desbloquea un informe**, y conviene decirlo porque el plan del 3-oct
lo pedía junto al informe de inventario. Los nombres (`FBASPB0100`, `FBA100`…)
*parecen* prefijos de los SKU reales, pero **la regla de correspondencia no está
escrita en ningún sitio** y aquí no se ha adivinado: la familia solo rellena el
importe cuando alguien elige a mano a qué productos aplicarla. Inventar la regla
sería costear veinte referencias con una suposición.

Las seis familias siguen además **«deducidas, sin confirmar»**, y ese adjetivo
viaja hasta el CSV exportado.

**Qué necesito:** una factura delante y dos líneas — qué familia se aplica a qué
prefijo de SKU, y si los importes deducidos son los buenos.

---

## P-23 · Una fixture que llegue a dos guardas del detector de renombradas

**Bloquea a:** nada del negocio. Es deuda de prueba, y la apunto porque si no se
apunta desaparece.

La revisión adversarial del 3-10 encontró cinco números falsos en los bloques 2
y 4. **Cuatro están arreglados y con su prueba roja.** De los dos arreglos que
quedan —H1, un caso por par de nombres en vez de por par de ficheros; y H5, dos
nombres vivos en los dos informes son un duplicado y no un renombrado— **el
código está puesto y es correcto, pero no tengo el rojo**: deshaciendo cada uno
por separado, la suite sigue verde. El candidato se descarta antes de llegar a
esas dos guardas, en la comprobación de `suelo > 0`.

Hacen falta dos informes en los que **cada uno gane parte de la ventana común**
(hoy el desempate se la lleva entera uno de los dos), y entonces sí se puede
demostrar la multiplicación del suelo y el falso positivo del duplicado.

**No necesito nada tuyo para esto.** Lo dejo anotado porque un arreglo sin rojo
es exactamente lo que esta norma llama «construido, sin probar», y quien lo lea
dentro de un mes tiene derecho a saberlo.
