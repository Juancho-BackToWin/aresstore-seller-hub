# Carril 3 · Transacciones y reclamaciones

Rama `carril/3-reclamaciones` · desde `base/2026-09` (`e18ef86`) · PR en borrador
contra la base.

## Qué pregunta responde

**¿Cuánto dinero te debe Amazon ahora mismo, por qué te lo debe y hasta cuándo
puedes pedirlo?** Y, por debajo, la que hacía falta para poder contestar la
primera: **¿cuánto te ha cobrado Amazon de verdad en los últimos cuatro años?**,
que hasta ahora solo se sabía para la quincena que cubriera un fichero plano de
liquidación —el que Amazon retira el 11 de noviembre de 2026—.

El hub **no envía nada a Amazon**. Detecta, estima, enseña las filas que lo
sostienen y redacta el texto. Presentar la reclamación es un acto humano.

## Qué hace

1. **Lee el informe de transacciones** (Pagos › Transacciones › rango
   personalizado) y lo mete en `settlementFees()`, deduplicando contra la
   liquidación plana por **identificador de pago**, que es el `settlement-id`.
2. **Arregla E6**: el crédito de comisión de un reembolso ya no se cuenta dos
   veces.
3. **Cuatro detectores** con importe estimado, evidencia y plantilla de texto:
   devoluciones fantasma · reembolso por debajo del coste · inventario perdido o
   dañado sin compensar · cambio de tarifa de Logística.
4. **Las ventanas de reclamación**, buscadas en la documentación oficial y
   citadas en pantalla con su enlace y su fecha de consulta.
5. **Vista «Reclamaciones»**, registrada con `registrarVista(...)`, más una
   exportación a CSV.

## Qué NO hace, a propósito

- **No envía, no abre casos y no rellena formularios.** Ni siquiera enlaza a un
  formulario de Seller Central: escribe el texto y lo enseña.
- **No reclama una tarifa cobrada de más.** El detector 4 existe, pero sale
  marcado «revisión, no reclamación» y **no suma al total reclamable**: Amazon
  sube tarifas por calendario todos los años y eso no es dinero debido. Además,
  el plazo para disputar un cobro de tarifa **no se ha podido confirmar** en
  ninguna página oficial (ver abajo).
- **No inventa un importe cuando no conoce el coste.** Una pérdida de inventario
  de un SKU que no está en el catálogo sale con «coste desconocido» y no suma.
- **No toca `pnl()`.** Es del carril 5. Lo que hacía falta allí está marcado como
  costura.
- **No recalcula el coste del producto.** Lee `costNow()`, que es del carril 2.
- **No arregla `readSmart()`.** Es del carril 1. Lo que hace falta allí está
  marcado como costura y, mientras tanto, reparado desde un preproceso propio.

## El formato del informe de transacciones, medido

Medido con Bash el 17-09-2026 sobre el fichero real (fuera del repositorio):
BOM UTF-8 · fin de línea LF · termina en salto de línea · separador **coma** ·
entrecomillado completo · **decimales con coma** · **27 columnas** ·
**5.650 líneas** · **5.642 filas de datos** · **siete líneas de preámbulo, con
la cabecera en la línea 8** · fechas tipo «17 dic 2023 22:37:41 UTC», con el mes
abreviado en español, que `parseDate()` no sabe leer.

Los documentos del proyecto decían «una línea de aviso» en un sitio y «ocho
líneas, cabecera en la 9» en otro. **Ninguno acertaba.** El encargo hablaba de
5.649 filas; son 5.642.

## Las ventanas de reclamación · fuentes y fecha de consulta

Consultadas el **17 de septiembre de 2026**. El plan antiguo del proyecto decía
«105 y 60 días». La realidad es más fina: **el plazo de las devoluciones de
cliente no es el mismo en amazon.es que en amazon.com**, y el 60 de amazon.es no
es el máximo, es el mínimo… que en realidad son 45.

| Concepto | Plazo | Fuente |
|---|---|---|
| Devolución de cliente FBA reembolsada y no devuelta | **entre 45 y 105 días** desde el reembolso al cliente | [Seller Central España · plazos de reclamación de reembolsos, en vigor el 9-ene-2025](https://sellercentral.amazon.es/seller-forums/discussions/t/8bc6ce8b-d765-411d-942a-fadca01873c2) |
| Inventario extraviado o dañado en el centro logístico | **hasta 60 días** desde que la unidad se marca como extraviada o dañada | la misma |
| Desacuerdo con el importe de un reembolso ya recibido | **hasta 60 días** desde que Amazon emitió el reembolso | [FBA inventory reimbursement policy, PDF alojado por Amazon](https://m.media-amazon.com/images/G/01/rainier/help./Redlined_FBA_Reimbursement_policy_US.pdf) |
| Tarifa de Logística cobrada de más | **NO CONFIRMADA** | ninguna página oficial localizada |

Contraste deliberado, y por eso está en pantalla: el anuncio equivalente de
amazon.com ([23-oct-2024](https://sellercentral.amazon.com/seller-forums/discussions/t/81c3235d-4c44-47ba-96c5-883cecab3244))
dice **60–120 días** para el mismo concepto. Son mercados distintos. El hub vende
en amazon.es, así que manda el anuncio español, y el americano se enseña al lado
para que nadie los mezcle.

La cita literal del PDF oficial para el tercer caso: *«If you don't agree with
our valuation of a unit, you can file a claim on Contact Us in Seller Central
within 60 days after we have issued the reimbursement.»* Y la valoración se hace
sobre el **sourcing cost**, que *«excludes costs such as shipping, handling,
customs duties, or other costs»* — por eso cada caso del detector 2 enseña cuánto
de la diferencia es flete que Amazon no reconoce.

Sobre la cuarta: circula «90 días» en blogs de terceros. **No se usa.** Una
ventana inventada hace dos daños: presentar fuera de plazo es trabajo tirado, y
dejar pasar lo que todavía se podía reclamar es dinero perdido.

## E6 · el crédito de comisión contado dos veces

**Seguía abierto en esta base.** Comprobado antes de tocar nada el 17-09-2026.

En la liquidación, la comisión de una venta viene negativa y la del reembolso de
esa venta viene positiva. Sumadas en el mismo saco, `sf.referral` salía ya neta
de reembolsos; y `pnl()`, por su cuenta, vuelve a acreditar esa misma comisión en
su línea de devoluciones (`retComision`).

Medido con 10 ventas de 100 €, comisión liquidada −150,00 €, crédito del
reembolso +12,00 € y una devolución: **sin liquidación, beneficio 507,996 €; con
ella, 519,996 €.** Doce euros justos de más sobre 1.000 € de venta (+2,4 %) por
cargar un fichero que solo añade información.

Arreglado del lado de `settlementFees()`: `referral` pasa a ser lo que Amazon
**cobra** y el crédito sale aparte en `refCredito`. Si el informe de devoluciones
no está cargado, el crédito no se aplica y la comisión sale alta: el beneficio
queda corto, que es el lado por el que equivocarse no cuesta dinero.

## Pruebas, y en qué dirección se vieron fallar

`tests/reclamaciones.test.js` · 79 comprobaciones. Cada una de las que persigue
un fallo se ha visto roja revirtiendo el arreglo, compilando y volviendo a
correr. Ninguna saca un stack: todas dicen qué número daba antes.

| Prueba | Qué demuestra | Mensaje en rojo, sin el arreglo |
|---|---|---|
| REC-B · comisión cobrada | `sf.referral` es lo cobrado, no lo neto | `138.00 € · con el fallo salía 138,00 €, ya neta del reembolso` |
| REC-B · crédito aparte | existe `refCredito` | `refCredito no existe: el arreglo de E6 no está` |
| REC-B · el beneficio no se mueve | E6 | `519.996 € frente a 507.996 € · con el fallo subía a 519,996 € (+12,00 €…)` |
| REC-C · preámbulo | la cabecera está en la línea 8 | `0 filas · con el preámbulo sin quitar, la cabecera era la línea 1 y el fichero entraba como UNA columna` |
| REC-C · decimales con coma | «-15,00» no es −1500 ni 0 | `ventas undefined · tarifas de venta undefined` |
| REC-C2 · un U+FFFD dentro | mojibake por un carácter | `0.00 € · con el fallo: 0,00 €` (tarifa de logística) |
| REC-C2 · publicidad | el PPC no se cuenta dos veces | `otras tarifas 24.00 € · 3 filas fuera · con el fallo, 20,00 € de PPC contados dos veces` |
| REC-C2 · número de pedido | el detector 1 se queda ciego | `0 pedidos · sin esta columna el detector de devoluciones fantasma se queda ciego` |
| REC-E · deduplicación | la misma comisión, una vez | `90.00 € · sin deduplicar saldrían 90.00 €` |
| REC-E2 · contraste de fuentes | no medir lo que no cuadra | `45.00 € · sin este guardarraíl se restaban 45,00 € de tarifas a 100 € de venta` |
| REC-F · sin informe de devoluciones | no reclamar a ciegas | `6 casos · sin ese informe TODO reembolso parecería fantasma` |
| REC-F · cobertura del informe | el informe no llega hasta ahí | `0 casos · contra ficheros reales esto daba 459 falsos positivos` |
| REC-F · gestión propia | Amazon no debe nada en FBM | `{"fbm":0,…}` |
| REC-F · ya compensado | no reclamar lo cobrado | `{"compensados":0,…}` |
| REC-H · dañado por el cliente | no es de Amazon | `{"noEsDeAmazon":0,…}` |
| REC-H · sin coste | no inventar un importe | caso con `importe` inventado |

## Costuras que pide a otros carriles

| Marca en el código | Carril | Qué hay que unificar al integrar |
|---|---|---|
| `src/22-transacciones.js` · `txArreglaMojibake` | **1 · importador** | `readSmart()` usa la aparición de U+FFFD como señal de «esto era windows-1252». El informe de transacciones es UTF-8 **válido** y **contiene** un U+FFFD escrito por Amazon (bytes `EF BF BD`, en el byte 867.186 de 2.015.117). Un solo carácter vuelve mojibake el fichero entero. La condición correcta no es «aparece U+FFFD», sino «la decodificación UTF-8 ha fallado». Mientras tanto se repara desde un preproceso, con tres guardarraíles. |
| `src/22-transacciones.js` · `txQuitaPreambulo` | **1 · importador** | `parseDelimited` busca la cabecera entre las seis primeras filas. Este informe la tiene en la octava. El carril 1 está haciendo la detección genérica de preámbulos; cuando esté, este preproceso sobra. |
| `src/12-datos.js` · `settlementFees()`, comentario de E6 | **5 · rentabilidad** | `pnl()` debería preferir `sf.refCredito` —medido, viene de la liquidación— sobre `retComision` —estimado desde el informe de devoluciones— cuando la liquidación cubre el periodo. Hoy, sin informe de devoluciones, el crédito medido existe y no se usa: el beneficio sale corto. El dato ya está publicado en `settlementFees()`; falta consumirlo. |
| `src/12-datos.js` · `settlementFees()`, `txContraste` | **5 · rentabilidad** | Cuando las dos fuentes no cuadran, las tarifas medidas no se aportan y `pnl()` vuelve a estimarlas. `pnl()` no enseña esa circunstancia en ningún sitio: la única pantalla que la dice hoy es Reclamaciones. Convendría un aviso en Rentabilidad. |

## Qué queda por medir

- **El detector 3 no se ha podido probar contra datos reales**: no hay ningún
  libro mayor de inventario entre los ficheros reales disponibles. Probado solo
  con fixtures.
- **El detector 4 tampoco**: hace falta la vista previa de tarifas importada en
  dos días distintos, y el histórico real solo tiene una foto.
- **El detector 2 se queda sin coste**: el catálogo del hub estaba vacío en la
  prueba, así que todas las compensaciones salieron «sin coste conocido». Con el
  catálogo poblado, el detector funciona; hace falta una prueba con catálogo real.
- **La ventana de las tarifas cobradas de más sigue sin fuente oficial.** Si
  aparece, se cambia una línea en `CLAIM_VENTANAS` y el detector 4 deja de salir
  como «no confirmado».

### Medido contra ficheros reales

Sí, contra el informe de transacciones real y contra los informes reales de
devoluciones, pedidos y vista previa de tarifas.

> **Las cifras reales no van aquí.** Este fichero está en el repositorio, y el
> repositorio es público. Van en el informe al orquestador.

Lo que sí se puede decir aquí, porque es estructura y no cifra de negocio: el
fichero se reconoce, se le quitan las siete líneas de preámbulo, se reparan
9.920 secuencias de mojibake, entran **5.642 filas** de **27 columnas**, ninguna
sin fecha, y no se produce **ni un error de JavaScript**.
