/* =========================================================================
   29 · MECÁNICA DE UNA DEVOLUCIÓN · una sola, para todas las pantallas
   =========================================================================

   POR QUÉ EXISTE ESTE FICHERO

   Hasta ahora la mecánica de una devolución estaba escrita DOS veces:

     · en `unitEconomics()` (Validar producto), por unidad vendida y con una
       tasa de devolución estimada;
     · dentro de `pnl()` (Rentabilidad), por unidad devuelta y con las
       devoluciones observadas en el informe.

   Dos copias de la misma regla siempre acaban divergiendo, y ya habían
   divergido: el validador cobra una tarifa por procesamiento de devoluciones
   y `pnl()` no la cobra nunca. El mismo producto, con la misma tasa de
   devolución, daba dos márgenes distintos según la pantalla que mirases. Esa
   es la forma más cara de romper «la misma cifra no se calcula dos veces»,
   porque ninguna de las dos pantallas da error: las dos dan un número creíble.

   Aquí vive la mecánica, una sola vez. `unitEconomics()` ya la usa. Para
   `pnl()` queda la costura escrita al final de este fichero: no se llama desde
   aquí porque `pnl()` es del carril 5.

   -------------------------------------------------------------------------
   LAS CUATRO REGLAS, Y QUÉ DICE LA DOCUMENTACIÓN OFICIAL DE AMAZON
   -------------------------------------------------------------------------
   Verificado contra fuentes de Amazon el 17 de septiembre de 2026. Se separa
   a propósito lo confirmado con cita literal de lo confirmado por omisión o
   por fuente secundaria: dar por buena una regla sin comprobarla es
   exactamente el fallo que este fichero viene a cerrar.

   REGLA 1 · LA TARIFA DE LOGÍSTICA (FBA) NO VUELVE.
     Estado: confirmada por omisión en fuente oficial + fuentes secundarias.
     Fuente oficial: https://sell.amazon.es/precios (Amazon España, consultada
     el 2026-09-17). Dice qué se reembolsa — «Amazon te reembolsará el importe
     de la tarifa por referencia que pagaste […] menos la tarifa de gestión de
     reembolso aplicable» — y NO menciona la tarifa de gestión logística entre
     lo que vuelve. El rate card europeo vigente tampoco la lista como
     reembolsable. No he encontrado en una página de Amazon accesible desde
     esta sesión la frase literal «la tarifa de gestión logística no se
     reembolsa»; las fuentes secundarias del sector son unánimes en que no
     vuelve, porque el servicio (recoger, embalar, enviar) ya se prestó.
     Consecuencia en el modelo: la tarifa logística se cobra una vez por unidad
     VENDIDA y no se le resta nada a la unidad devuelta. Por eso `logistica`
     entra en esta función solo para poder declararla, no para sumar.

   REGLA 2 · TASA DE GESTIÓN DE LA DEVOLUCIÓN = MÍN(5 €, 20 % DE LA COMISIÓN).
     Estado: CONFIRMADA con cita literal, en euros.
     Fuente: https://sell.amazon.es/precios (Amazon España, consultada el
     2026-09-17): «la tarifa de gestión de reembolso aplicable, que es menor de
     5 € o el 20 % de la tarifa por referencia aplicable». La misma página da
     el ejemplo: un reembolso del precio total de venta de 10 € en una
     categoría con tarifa por referencia del 15 % → tarifa de gestión de
     reembolso de 0,30 €.
     Comprobación del ejemplo con esta función: comisión = 10 × 15 % = 1,50 €;
     20 % de 1,50 = 0,30 €; mín(5; 0,30) = 0,30 €. Coincide al céntimo, y hay
     una prueba que lo fija (`tests/devoluciones.test.js`, bloque DEV-A).
     El tope es POR ARTÍCULO reembolsado, no por pedido.

   REGLA 3 · HAY UN COSTE DE PROCESAMIENTO.
     Estado: CONFIRMADA, con un matiz que el encargo no decía y que importa.
     Fuente: rate card europeo oficial de Amazon en vigor desde el 1 de julio
     de 2026, páginas 24 y 25 (consultado el 2026-09-17):
     https://m.media-amazon.com/images/G/02/sell/images/260630-FBA-Rate-Card-ES1.pdf
     Ahí figuran las «Tarifas por procesamiento de devoluciones de alta tasa de
     devolución», en dos tablas: «Para productos de alta tasa de devolución de
     todas las categorías, excepto ropa, accesorios y calzado» y «Para
     productos de alta tasa de devolución de categorías seleccionadas, excepto
     ropa, accesorios y calzado».
     EL MATIZ: en Europa NO es un coste universal. Solo lo pagan (a) los
     productos que superan el umbral de tasa de devolución de su categoría y
     (b) ropa, accesorios y calzado, que quedan fuera de esas tablas porque
     tienen su propia regla — el 50 % de la tarifa de gestión logística del
     producto, desde la primera devolución, sin umbral (rate cards europeos de
     Amazon, misma familia de documentos en m.media-amazon.com).
     Consecuencia en el modelo: `procesamiento` es un parámetro, no una
     constante, y su valor por defecto es 0. Cobrárselo a todo el mundo
     inflaría el coste; cobrárselo a nadie lo desinflaría. El desplegable del
     validador («No aplica» / «Moda: 50 % FBA» / «Manual €») es justo esa
     elección de tres ramas, y ahora es la única que existe.

   REGLA 4 · SOLO LO REVENDIBLE RECUPERA COSTE DE PRODUCTO.
     Estado: confirmada, pero NO es una tarifa de Amazon.
     Amazon no te «devuelve» el coste del producto: lo que hace es asignar una
     disposición a cada unidad que vuelve (informe FBA Customer Returns, campo
     `detailed-disposition`). Solo la unidad que vuelve SELLABLE regresa al
     inventario vendible y se puede volver a vender; la que vuelve
     UNSELLABLE/DAMAGED/DEFECTIVE ya no. Recuperar el coste es, por tanto, una
     consecuencia del estado en que vuelve, no una línea de tarifa.
     Consecuencia en el modelo: `revendible` es una fracción de 0 a 1 y su
     valor por defecto es 0 — sin saber en qué estado volvió, se cuenta como NO
     recuperada, que es el supuesto que no infla el beneficio. `pnl()` ya lee
     esa columna y hace exactamente eso.

   NADA DE ESTO CONTRADICE LAS CUATRO REGLAS DEL ENCARGO. Lo único que añade la
   documentación es que la regla 3 es condicional en Europa, no universal; el
   modelo ya lo era.
   ========================================================================= */

/* El tope y el porcentaje de la regla 2, escritos una vez y con nombre, para
   que no vuelvan a aparecer como literales sueltos repartidos por el código.
   Así estaban antes: `Math.min(5, 0.20*referral)` en el validador y otro
   `Math.min(5, 0.20*comUd)` dentro de `pnl()`. */
const DEV_TASA_TOPE = 5;      // € por artículo reembolsado
const DEV_TASA_PCT  = 0.20;   // del importe de la comisión por referencia

/* Las cuatro reglas, en una forma que una prueba puede leer. No es adorno: si
   alguien cambia la mecánica sin tocar esta tabla, la prueba que compara las
   dos cosas se pone roja con un mensaje que dice cuál. */
const DEV_REGLAS = [
  {id:'logistica',   regla:'La tarifa de logística (FBA) no vuelve'},
  {id:'tasa',        regla:'Tasa de gestión = mín(5 €, 20 % de la comisión por referencia)'},
  {id:'procesamiento', regla:'Hay un coste de procesamiento (condicional en Europa)'},
  {id:'revendible',  regla:'Solo lo revendible recupera coste de producto'}
];

/* Regla 2, aislada, porque se usa suelta en los avisos de la pantalla. */
function tasaGestionDevolucion(comision){
  const c = Math.max(0, Number(comision) || 0);
  return Math.min(DEV_TASA_TOPE, DEV_TASA_PCT * c);
}

/* =========================================================================
   Lo que cuesta UNA unidad devuelta.

   Entra lo que sabemos de esa unidad tal y como se vendió; sale el desglose y
   el coste total. No conoce tasas de devolución ni periodos: eso es de quien
   llama. El validador la multiplica por su tasa estimada; `pnl()` la
   multiplicaría por cada unidad realmente devuelta. Misma función, mismos
   céntimos.

     ingresoNeto    € de ingreso SIN IVA que se devuelve al cliente
     comision       € de comisión por referencia que se cobraron en la venta
     logistica      € de tarifa de gestión logística cobrados en la venta
                    (regla 1: NO se resta, entra solo para poder declararla)
     procesamiento  € de tarifa por procesamiento de devoluciones (regla 3)
     costeProducto  € de coste del producto puesto en almacén
     revendible     fracción 0..1 que vuelve en estado vendible (regla 4)

   Los importes se saturan a 0 por abajo a propósito: un coste negativo aquí
   sería un ingreso inventado, y esta función existe justamente para que no
   haya números inventados creíbles.
   ========================================================================= */
function costeDevolucion(u){
  u = u || {};
  const ingreso    = Math.max(0, Number(u.ingresoNeto)    || 0);
  const comision   = Math.max(0, Number(u.comision)       || 0);
  const logistica  = Math.max(0, Number(u.logistica)      || 0);
  const proceso    = Math.max(0, Number(u.procesamiento)  || 0);
  const producto   = Math.max(0, Number(u.costeProducto)  || 0);
  const revendible = Math.min(1, Math.max(0, u.revendible == null ? 0 : (Number(u.revendible) || 0)));

  const tasaGestion         = tasaGestionDevolucion(comision);   // regla 2
  const comisionReintegrada = comision - tasaGestion;
  const costeRecuperado     = producto * revendible;             // regla 4

  return {
    /* Lo que pierdes */
    ingresoDevuelto: ingreso,
    tasaGestion: tasaGestion,
    procesamiento: proceso,
    costeNoRecuperado: producto - costeRecuperado,
    /* Lo que recuperas */
    comisionReintegrada: comisionReintegrada,
    costeRecuperado: costeRecuperado,
    /* Declarada, no sumada. Regla 1: ya se cobró en la venta y se queda
       cobrada, así que restarla otra vez aquí sería cobrarla dos veces. */
    logisticaNoDevuelta: logistica,
    /* El número. Lo que esa devolución te cuesta de verdad. */
    coste: ingreso - comisionReintegrada + proceso - costeRecuperado
  };
}

/* =========================================================================
   COSTURA → carril 5: `pnl()` (src/12-datos.js) tiene que llamar a
   `costeDevolucion()` en lugar de repetir la mecánica dentro de su bucle
   `retRows.forEach(...)`.

   QUÉ. El bloque de `pnl()` que hoy hace, por cada fila de devolución:

       retIngreso  += q*netUd;
       retComision += q*(comUd - Math.min(5, 0.20*comUd));
       ... y solo si la disposición es «sellable», retCoste += q*(cb.cogs/cb.units);
       const returnsCost = retIngreso - retComision - retCoste;

   pasa a ser, por cada fila:

       const d = costeDevolucion({
         ingresoNeto  : netUd,
         comision     : comUd,
         logistica    : fbaUd,                 // se declara, no se resta
         procesamiento: procUd,                // ← hoy no se cobra: ver ABAJO
         costeProducto: costeUd,
         revendible   : esVendible ? 1 : 0
       });
       returnsCost += q * d.coste;

   POR QUÉ. Las dos pantallas dan hoy márgenes distintos para el mismo
   producto, y la diferencia NO es ruido: es entera y exactamente la tarifa por
   procesamiento de devoluciones (regla 3). El validador la cobra —
   `retProcMode` = «Moda: 50 % FBA» o «Manual €» — y `pnl()` no la cobra nunca,
   porque no existe en su bucle. Las otras tres reglas ya coinciden al céntimo
   entre las dos, y `tests/devoluciones.test.js` (bloque DEV-D) lo comprueba
   componente a componente y se pone roja si alguna deja de coincidir.

   EL ÚNICO DATO QUE FALTA. `procUd` no está en ningún informe: Amazon lo cobra
   en la liquidación, no en el informe de devoluciones. Las dos salidas
   razonables, en orden de preferencia:
     (a) leerlo de la liquidación, si `settlementFees()` llega a separar el
         concepto «Return processing fee» de `other`; sería un dato medido;
     (b) mientras tanto, dejarlo en 0 y DECIRLO en la pantalla de Rentabilidad,
         que es lo que pasa hoy sin decirlo. Un 0 callado es lo que hizo que
         las dos pantallas divergieran sin que nadie lo notara.
   Lo que no vale es volver a escribir `Math.min(5, 0.20*comUd)` en `pnl()`:
   esa línea ya vive aquí, y duplicarla es reabrir el mismo agujero.

   NO SE LLAMA DESDE AQUÍ. `pnl()` es del carril 5 y no se toca desde el 10.
   ========================================================================= */
