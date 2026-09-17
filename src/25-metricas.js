/* ═══════════════════════════════════════════════════════════════════════════
   M1.2 · LA CASCADA DE LA CUENTA DE RESULTADOS, CON PROCEDENCIA POR LÍNEA

   POR QUÉ EXISTE. El hub ya calculaba un beneficio. Lo que no hacía era decir,
   línea a línea, de dónde sale cada número: qué está LEÍDO de un informe, qué
   está DEDUCIDO de un supuesto y qué sencillamente NO SE SABE. Sin eso, la
   pantalla presenta con la misma tipografía una comisión que Amazon liquidó y
   una comisión inventada al 15 %, y un cero de publicidad sin informe se lee
   igual que un cero de publicidad real. Ese es el fallo que mata a un hub de
   gestión: no dar error, dar un número creíble y falso.

   LAS CUATRO REGLAS QUE MANDAN AQUÍ

   1 · HERENCIA DE LA PEOR. Si una línea se compone de otras, hereda la peor de
       las etiquetas: una suma con una estimada dentro es estimada, y con una
       desconocida dentro es desconocida. No hay redondeo al alza. Esto es el
       corazón del módulo y lo que impide que un total con un agujero se
       presente como medido porque tres de sus cinco sumandos sí lo estén.

   2 · UN CERO SIN INFORME NO ES UN CERO. La publicidad sin informe cargado no
       vale 0 €: vale «desconocido», y se pinta «—». Un 0 € ahí infla el
       beneficio y encima parece medido. Lo mismo vale para el almacenaje, las
       otras tarifas, los reembolsos, las devoluciones y el IVA no repercutido:
       si no hay informe que lo diga, no se sabe. El importe que entra en la
       aritmética sigue siendo el que usa `pnl()` —si no, el desglose dejaría de
       sumar el total—, pero en pantalla se dice que falta.

   3 · UN PORCENTAJE NECESITA MUESTRA. Por debajo de diez unidades no se enseña
       el porcentaje: con cuatro ventas un margen del 38 % no significa nada, y
       enseñarlo invita a decidir sobre ruido. Y con cero ventas se escribe «—»,
       nunca «0 %», que es la diferencia entre «no vendí» y «vendí sin margen».

   4 · «BENEFICIO» SOLO CON GASTOS FIJOS CARGADOS. Sin gestoría, herramientas ni
       almacén en la base, lo que queda abajo no es beneficio: es margen de
       contribución. Llamarlo beneficio hace creer que el negocio gana lo que
       ahí pone, cuando faltan los gastos que existen igual aunque no se hayan
       tecleado. La palabra cambia y la pantalla explica por qué.

   Y LA REGLA DE LA CASA, que aquí se comprueba con aritmética y no con buena
   voluntad: la misma cifra no se calcula dos veces. La cascada no recalcula
   nada, descompone `pnl()`; los cortes por SKU, por país y por mes salen de
   `skuStats()`, `countryStats()` y del mismo `costOfSales()`; y lo que no se
   puede imputar a un SKU o a un mercado —gastos fijos, devoluciones, IVA no
   repercutido, reembolsos— se declara aparte en vez de repartirse con una
   proporción inventada. `tests/m12.test.js` comprueba el cuadre de las tres
   aperturas al céntimo.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Vocabulario de calidad ─────────────────────────────────────────────────
   Tres estados y un orden entre ellos. Se declaran como `function` a propósito:
   `12-datos.js` se concatena ANTES que este fichero y las llama desde
   `taxBasis()`, `skuStats()` y `countryStats()`. Una `const` estaría en zona
   muerta temporal durante la evaluación de aquel módulo; una función declarada
   está izada en todo el archivo concatenado y no hay orden que la rompa. */
function calidadOrden(c){ return c==='desconocido' ? 2 : c==='estimado' ? 1 : 0; }
function peorCalidad(){
  let peor = 'medido';
  for(let i=0;i<arguments.length;i++){
    const c = arguments[i] || 'medido';
    if(calidadOrden(c) > calidadOrden(peor)) peor = c;
  }
  return peor;
}
/* El umbral por debajo del cual un porcentaje no se enseña. Diez unidades no
   es un número mágico: es el punto por debajo del cual una sola devolución o
   una sola venta a precio raro mueve el margen más de diez puntos. */
function umbralUnidades(){ return 10; }

/* `taxBasis()` habla de la BASE en femenino («medida», «estimada»,
   «desconocida») y la cascada habla de LÍNEAS en masculino. Se traduce en un
   sitio para no tener dos vocabularios diciendo lo mismo. */
function calidadDeBase(q){
  return q==='medida' ? 'medido' : q==='estimada' ? 'estimado' : 'desconocido';
}

/* ── Cómo se pinta una calidad ────────────────────────────────────────────── */
function pillCalidad(c){
  const t = {medido:['go','medido'], estimado:['warn','estimado'], desconocido:['stop','desconocido']}[c]
         || ['warn','estimado'];
  return '<span class="pill '+t[0]+'" data-calidad="'+c+'">'+t[1]+'</span>';
}

/* ── Porcentajes que no mienten ─────────────────────────────────────────────
   Un porcentaje se enseña solo cuando significa algo. Devuelve el texto ya
   listo para pintar y por qué, si no se enseña.

     unidades = 0      → «—» · no hubo ventas, no hay nada que dividir
     unidades < umbral → «—» · la muestra no da para un porcentaje
     base <= 0         → «—» · no se puede dividir entre cero o entre negativo
*/
function pctSeguro(valor, base, unidades){
  if(!(unidades > 0))  return {texto:'—', ok:false, razon:'sin ventas en el corte'};
  if(unidades < umbralUnidades())
    return {texto:'—', ok:false, razon:'solo '+num(unidades)+' ud · por debajo de '+umbralUnidades()+' un porcentaje es ruido'};
  if(!(base > 0))      return {texto:'—', ok:false, razon:'sin ingreso neto sobre el que calcular'};
  return {texto:num(valor/base*100,1)+'%', ok:true, razon:''};
}

/* ═══════════════════════════════════════════════════════════════════════════
   LA CASCADA

   Devuelve la cuenta de resultados abierta línea a línea. Cada línea trae:

     valor    · el importe CON SIGNO tal y como entra en el resultado. Es el
                mismo que usa `pnl()`; por eso la suma de las líneas es el
                resultado exacto y no «aproximadamente».
     calidad  · medido · estimado · desconocido
     falta    · qué informe cerraría ese hueco, cuando la calidad no es medida
     total    · si la línea es un subtotal (hereda la peor de las de arriba)

   El importe de una línea desconocida se sigue sumando —vale cero y cero es lo
   que `pnl()` ha usado— pero se pinta «—», nunca «0 €».
   ═══════════════════════════════════════════════════════════════════════════ */
function cascada(P){
  P = P || pnl();
  const hayVentas  = P.grossInc > 0 || P.units > 0;
  const hayOrders  = hasImp('orders');
  const hayLiq     = P.settleMatched > 0;
  const covFull    = (P.feeCoverPct||0) >= 99.995;
  const hayFijos   = DB.expenses.length > 0;
  const L = [];
  const push = (id, etiqueta, valor, calidad, nota, falta) =>
    L.push({id, etiqueta, valor, calidad, nota:nota||'', falta:falta||'', total:false});
  /* Un subtotal no elige su etiqueta: la hereda del subtotal anterior y de todo
     lo que lleva encima desde él. Es la regla 1, implementada en un sitio y no
     en cada línea, que es como se cuela una excepción sin que nadie la vea.

     `desde` es el índice de la primera línea nueva; `L[desde-1]` es el subtotal
     anterior, que ya arrastra todo lo de más arriba. Arrastrarlo es lo que hace
     que «Margen de canal» sea el ingreso neto MENOS las tarifas y no solo las
     tarifas cambiadas de signo. */
  const subtotal = (id, etiqueta, desde) => {
    const parte = L.slice(desde);
    const previo = desde > 0 ? L[desde-1] : null;
    const valor = parte.reduce((a,x)=>a+x.valor, 0) + (previo ? previo.valor : 0);
    const calidad = parte.reduce((a,x)=>peorCalidad(a, x.calidad),
                                 previo ? previo.calidad : 'medido');
    L.push({id, etiqueta, valor, calidad, nota:'', falta:'', total:true});
    return L.length;
  };

  /* ── 1 · lo que ha entrado ─────────────────────────────────────────────── */
  push('ingresos', 'Ingresos con IVA', P.grossInc,
    hayOrders ? 'medido' : 'desconocido',
    num(P.units)+' ud',
    hayOrders ? '' : 'informe de pedidos («Todos los pedidos»)');
  push('iva', 'IVA repercutido', -P.tax, calidadDeBase(P.baseQuality),
    P.baseQuality==='medida' ? 'leído del informe'
      : P.baseQuality==='estimada' ? 'DEDUCIDO del tipo de cada país, no leído'
      : 'hay ventas sin país: su IVA no se puede ni deducir',
    P.baseQuality==='medida' ? '' : 'informe de pedidos con la columna item-tax, o el informe de IVA');
  const trasNeto = subtotal('neto', 'Ingreso neto', 0);

  /* ── 2 · lo que se lleva Amazon por vender ─────────────────────────────── */
  push('comision', 'Comisión de Amazon', -P.referral,
    (P.refMedido && covFull) ? 'medido' : 'estimado',
    (P.refMedido && covFull) ? 'de la liquidación'
      : P.refMedido ? 'la liquidación cubre el '+num(Math.min(99,Math.floor(P.feeCoverPct||0)))+' % · el resto estimada al % de cada producto'
      : 'estimada al % de cada producto, no a lo que Amazon te cobró',
    (P.refMedido && covFull) ? '' : 'informe de liquidación que cubra el periodo entero');
  push('fba', 'Tarifas de logística FBA', -P.fba,
    (P.fbaMedido && covFull) ? 'medido' : 'estimado',
    (P.fbaMedido && covFull) ? 'de la liquidación' : 'estimadas con recargo de combustible del 1,5 %',
    (P.fbaMedido && covFull) ? '' : 'informe de liquidación con líneas de logística');
  push('envio', 'Envío propio (FBM)', -P.ship,
    P.fbmUnits>0 ? 'estimado' : 'medido',
    P.fbmUnits>0 ? num(P.fbmUnits)+' ud al coste de envío que tengas puesto' : 'ninguna venta FBM',
    P.fbmUnits>0 ? 'nada que importar: es tu propio coste de envío, en Catálogo' : '');
  /* Amazon cobra almacenaje a cualquiera que tenga stock en FBA. Sin
     liquidación, ese 0 € no es una medición de cero: es que no lo sabemos. */
  // COSTURA → carril 3: `settlementFees()` devuelve `storage` y `other` a cero
  // tanto cuando la liquidación dice que no hubo como cuando el fichero no trae
  // esas líneas, y los dos casos no son el mismo: el segundo es «no se sabe» y
  // vale beneficio de más. Aquí se deduce del hecho de que haya o no
  // liquidación casada, que es una aproximación por fuera. Lo que toca al
  // integrar es que `settlementFees()` diga qué CONCEPTOS venían en el fichero,
  // igual que ya distingue `rows` de `matched`.
  push('almacenaje', 'Almacenaje', -P.storage,
    hayLiq ? 'medido' : (P.fbaUnits>0 ? 'desconocido' : 'medido'),
    hayLiq ? 'de la liquidación' : (P.fbaUnits>0 ? 'tienes ventas FBA, así que almacenaje hay' : 'sin stock en FBA'),
    hayLiq ? '' : (P.fbaUnits>0 ? 'informe de liquidación' : ''));
  push('otras', 'Otras tarifas de Amazon', -P.otherFee,
    hayLiq ? 'medido' : (hayVentas ? 'desconocido' : 'medido'),
    hayLiq ? 'de la liquidación' : '',
    hayLiq ? '' : (hayVentas ? 'informe de liquidación' : ''));
  const trasCanal = subtotal('canal', 'Margen de canal', trasNeto);

  /* ── 3 · lo que cuesta la mercancía ────────────────────────────────────── */
  const cogsCal = P.cogsKnown < P.units ? 'desconocido'
                : (P.costMeasuredPct||0) >= 99.995 ? 'medido' : 'estimado';
  push('coste', 'Coste de producto', -P.cogs, cogsCal,
    P.cogsKnown < P.units
      ? num(P.units-P.cogsKnown)+' ud vendidas sin ningún coste cargado: su coste NO está restado aquí'
      : num(P.costMeasuredPct||0,0)+' % de las unidades respaldadas por un lote de compra',
    P.cogsKnown < P.units ? 'el coste de esos productos, en Catálogo'
      : cogsCal==='estimado' ? 'los lotes de compra que faltan, en Catálogo' : '');
  const trasProducto = subtotal('producto', 'Margen de producto', trasCanal);

  /* ── 4 · lo que pasa después de vender ─────────────────────────────────── */
  const devCal = !P.hayDevoluciones ? (hayVentas ? 'desconocido' : 'medido')
               : (P.retRepartidas || P.retDescartadas>0 || P.retSinEstado>0) ? 'estimado' : 'medido';
  push('devoluciones', 'Devoluciones', -P.returnsCost, devCal,
    !P.hayDevoluciones ? 'sin informe de devoluciones no se sabe cuántas hubo ni qué costaron'
      : num(P.retImputadas,1)+' ud imputadas de '+num(P.retUnits)+
        (P.retRepartidas ? ' · repartidas por la cuota de ventas de este mercado' : '')+
        (P.retSinEstado>0 ? ' · '+num(P.retSinEstado)+' sin estado, se da por perdido su coste' : ''),
    P.hayDevoluciones ? '' : 'informe de devoluciones FBA');
  const hayVat = ((P.vat||{}).rows||0) > 0;
  push('ivaNoRep', 'IVA no repercutido', -P.vatShortfall,
    hayVat ? 'medido' : (hayVentas ? 'desconocido' : 'medido'),
    hayVat ? num(P.vatVentasReducidas)+' ventas a tipo reducido · lo debes tú, no Amazon'
           : 'sin el informe fiscal no se sabe a qué tipo liquidó Amazon',
    hayVat ? '' : 'informe de transacciones sujetas al IVA');
  push('publicidad', 'Publicidad', -P.ppc,
    P.ppcSource==='ninguno' ? (hayVentas ? 'desconocido' : 'medido')
      : P.ppcSource==='informe' && P.adFactor===1 ? 'medido' : 'estimado',
    P.ppcSource==='ninguno' ? 'no hay informe de publicidad ni gasto diario puesto'
      : P.ppcSource==='informe-sin-fechas' ? 'el informe no dice qué periodo cubre · cargado ENTERO, sin prorratear'
      : P.ppcSource==='diario' ? 'del gasto diario de ajustes, no de un informe'
      : P.adFactor===1 ? 'del informe, sin prorratear' : 'prorrateado desde un informe de '+num(P.adDays)+' días',
    P.ppcSource==='ninguno' ? 'informe de términos de búsqueda' : '');
  push('reembolsos', 'Reembolsos recuperados', P.reimb,
    hasImp('reimb') ? 'medido' : (hayVentas ? 'desconocido' : 'medido'),
    hasImp('reimb') ? 'del informe de reembolsos' : 'sin informe de reembolsos no se sabe qué te ha devuelto Amazon',
    hasImp('reimb') ? '' : 'informe de reembolsos');

  /* ── 5 · los gastos que no dependen de vender ──────────────────────────── */
  push('fijos', 'Gastos fijos', -P.fixed,
    hayFijos ? 'estimado' : 'desconocido',
    hayFijos ? 'prorrateados a '+num(P.periodDaysReal)+' días desde el importe mensual'
             : 'no hay ningún gasto fijo cargado · gestoría, herramientas, almacén y cuota existen igual',
    hayFijos ? '' : 'tus gastos fijos, en Tesorería');

  /* ── 6 · abajo del todo, y cómo se llama ───────────────────────────────── */
  subtotal(hayFijos ? 'beneficio' : 'contribucion',
           hayFijos ? 'Beneficio neto' : 'Margen de contribución', trasProducto);
  const resultado = L[L.length-1];

  const cuenta = {medido:0, estimado:0, desconocido:0};
  L.filter(x=>!x.total).forEach(x=>cuenta[x.calidad]++);

  return {
    lineas: L,
    resultado,
    calidad: resultado.calidad,
    hayFijos,
    /* Regla 4, dicha con las palabras exactas para que se pueda comprobar. */
    etiquetaResultado: hayFijos ? 'Beneficio neto' : 'Margen de contribución',
    avisoFijos: hayFijos ? '' :
      'Esto no es un beneficio: es un <strong>margen de contribución</strong>. '+
      'No hay ningún gasto fijo cargado, así que a esta cifra le faltan la gestoría, las herramientas, '+
      'el almacén y la cuota de Amazon, que se pagan vendas lo que vendas. '+
      'Cárgalos en Tesorería y esta línea pasará a llamarse beneficio neto, porque entonces lo será.',
    cuenta,
    faltan: L.filter(x=>!x.total && x.falta).map(x=>({linea:x.etiqueta, falta:x.falta, calidad:x.calidad})),
    /* La suma de las líneas no-subtotal. Tiene que ser `P.profit` al céntimo:
       si no lo es, el desglose y el total se han separado y eso es exactamente
       lo que este módulo existe para impedir. */
    suma: L.filter(x=>!x.total).reduce((a,x)=>a+x.valor, 0)
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   LA FRONTERA DE COMPACTACIÓN (M0)

   A los 90 días el histórico suelta el detalle día a día y se queda con el
   resumen mensual. `H.cut` es la fecha hasta la que eso ya ha pasado. Un corte
   que cruza esa fecha mezcla dos cosas distintas —tramo con detalle y tramo
   resumido— y no es comparable con uno que no la cruza. Decirlo en pantalla es
   lo que impide comparar dos meses que no se pueden comparar.
   ═══════════════════════════════════════════════════════════════════════════ */
function fronteraM0(desde){
  let cut = null;
  try{ cut = (historyStats()||{}).cut || null; }catch(e){ cut = null; }
  const d0 = desde ? (typeof desde==='string' ? desde : iso(desde)) : null;
  return {
    cut,
    /* Cruza si el corte empieza en o antes de la última fecha compactada. */
    cruza: !!(cut && d0 && d0 <= cut),
    texto: cut
      ? 'El histórico está compactado hasta el '+cut+': de los días anteriores se conservan '+
        'unidades, ingreso e impuesto por SKU y por mercado, pero ya no el detalle día a día. '+
        'Un corte que cruce esa fecha mezcla un tramo con detalle y otro resumido, así que '+
        '<strong>no es comparable</strong> con los posteriores.'
      : ''
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOS CORTES · por SKU, por país y por mes

   Los tres devuelven la misma forma:

     filas        · el corte
     total        · la suma de las filas
     control      · de dónde tiene que salir ese mismo total (el P&L)
     noImputable  · lo que no se puede repartir entre las filas, con su importe
     frontera     · aviso de compactación si el corte la cruza

   POR QUÉ HAY UN BLOQUE «NO IMPUTABLE» Y NO UN REPARTO. Los gastos fijos, las
   devoluciones sin país, el IVA no repercutido y los reembolsos no se pueden
   atribuir a un SKO ni a un mercado sin inventarse una proporción. Repartirlos
   daría un beneficio por SKU que suma el total y que es falso en cada fila. Se
   declaran aparte, con su nombre, y la identidad se cierra igual:

       Σ beneficio de las filas  +  Σ no imputable  =  beneficio del P&L
   ═══════════════════════════════════════════════════════════════════════════ */
function noImputables(P){
  return [
    {id:'devoluciones', etiqueta:'Devoluciones',          valor:-P.returnsCost,
     por:'el informe de devoluciones no trae SKU comparable ni país'},
    {id:'ivaNoRep',     etiqueta:'IVA no repercutido',    valor:-P.vatShortfall,
     por:'sale del informe fiscal por pedido, no por SKU'},
    {id:'reembolsos',   etiqueta:'Reembolsos recuperados', valor:P.reimb,
     por:'un reembolso cubre incidencias de almacén, no una venta concreta'},
    {id:'fijos',        etiqueta:'Gastos fijos',          valor:-P.fixed,
     por:'no dependen de qué vendas: repartirlos por ingreso premiaría al SKU barato'}
  ];
}

function cortePorSku(){
  const P = pnl(), S = skuStats();
  const filas = S.map(r=>({
    clave:r.sku, nombre:r.name, units:r.units, rev:r.revenue, iva:r.iva,
    netRev:r.netRev, cogs:r.cogs, profit:r.profit, abc:r.abc,
    calidad: peorCalidad(r.ivaCalidad, r.hasCost ? 'medido' : 'desconocido'),
    pct: pctSeguro(r.profit, r.netRev, r.units)
  }));
  return armarCorte('sku', 'SKU', filas, P);
}

function cortePorPais(){
  /* Ojo: `countryStats()` trabaja SIEMPRE sobre el negocio entero, porque un
     desglose por mercado con el filtro de un mercado puesto no es un desglose.
     Por eso este corte cuadra contra `pnlAll()` y no contra `pnl()`, y la
     pantalla lo dice. */
  const P = pnlAll(), C = countryStats().filter(x=>x.units>0);
  const filas = C.map(x=>({
    clave:x.c.code, nombre:x.c.name, units:x.units, rev:x.rev, iva:x.iva,
    netRev:x.netRev, cogs:x.cogs, profit:x.profit,
    calidad:x.calidad, sinPais:x.sinPais,
    pct: pctSeguro(x.profit, x.netRev, x.units)
  }));
  const corte = armarCorte('pais', 'Mercado', filas, P);
  corte.ignoraFiltro = countryFilter !== 'ALL';
  /* Y una diferencia que nadie declaraba: esta tabla resta de cada mercado la
     parte proporcional del coste de tener el IVA dado de alta allí —la
     gestoría de cada país, de `DB.compliance`— y la cuenta de resultados NO
     incluye ese coste en ninguna línea. Medido con tres mercados activos a
     1.500 €/año y un periodo de 30 días: 3 × 1.500 × 30/365 = 369,86 € que la
     suma de los mercados tenía de menos que el total, sin que nada lo dijera.

     No es un error de ninguna de las dos pantallas: son dos preguntas
     distintas —«cuánto deja este mercado descontando lo que cuesta mantenerlo»
     y «cuánto ha ganado el negocio este periodo»—. Lo que no puede ser es que
     la diferencia sea invisible. Se declara con su nombre y la identidad
     vuelve a cerrar. */
  const vatShare = C.reduce((a,x)=>a + toNum(x.vatCost)*(daysInPeriod()/365), 0);
  corte.imputadoDeMas = vatShare > 0 ? [{
    etiqueta:'Coste de cumplimiento del IVA por mercado', valor:vatShare,
    por:'esta tabla lo imputa a cada mercado (la gestoría de su alta de IVA) y la cuenta de resultados no lo tiene en ninguna línea'
  }] : [];
  corte.reconstruido += vatShare;
  return corte;
}

function cortePorMes(){
  const P = pnl();
  const S = salesRows();
  /* El IVA por mes NO se prorratea aquí: sale del mismo reparto fila a fila que
     hizo `taxBasis()`, que ya lo agrupa por mes. Prorratear el IVA de un SKU
     entre sus meses por ingreso daría un total correcto con cada mes
     equivocado —un SKU que vende en España un mes y en Alemania el siguiente
     tiene tipos distintos—, que es la peor de las dos maneras de fallar: la
     que cuadra. */
  const TM = (P.taxBasis||{}).porMes || {};
  const meses = {};
  S.forEach(r=>{
    const mk = iso(r.date).slice(0,7);
    const m = meses[mk] || (meses[mk] = {clave:mk, nombre:mk, units:0, rev:0, cogs:0,
                                         filas:[], calidad:(TM[mk]||{}).calidad||'medido',
                                         iva:(TM[mk]||{}).tax||0});
    m.units += r.qty; m.rev += r.revenue;
    m.filas.push(r);
  });
  /* El coste del mes sale de la MISMA función que el coste del total, aplicada
     a las filas de ese mes. `costOfSales` cuesta cada fila con el libro de
     lotes completo —que no depende del subconjunto—, así que la suma de los
     meses es el coste del periodo al céntimo. */
  const feeRate = P.grossInc>0 ? (P.referral+P.fba+P.ship+P.storage+P.otherFee)/P.grossInc : 0;
  const ppcRate = P.grossInc>0 ? P.ppc/P.grossInc : 0;
  const filas = Object.keys(meses).sort().map(mk=>{
    const m = meses[mk];
    m.cogs = costOfSales(m.filas).cogs;
    m.netRev = m.rev - m.iva;
    m.profit = m.netRev - m.rev*feeRate - m.rev*ppcRate - m.cogs;
    m.pct = pctSeguro(m.profit, m.netRev, m.units);
    delete m.filas;
    return m;
  });
  const corte = armarCorte('mes', 'Mes', filas, P);
  /* Un corte por mes es el que cruza la frontera de compactación de verdad:
     cada mes se marca por su cuenta, porque el que la cruza no es comparable
     con el de al lado aunque los dos estén en la misma tabla. */
  const F = fronteraM0(periodStart());
  if(F.cut){
    const mesCut = F.cut.slice(0,7);
    filas.forEach(f=>{ f.compactado = f.clave <= mesCut; });
    corte.frontera = {cut:F.cut, texto:F.texto, cruza: filas.some(f=>f.compactado)};
  }
  return corte;
}

function armarCorte(id, etiqueta, filas, P){
  const suma = k => filas.reduce((a,x)=>a+(x[k]||0), 0);
  const total = {units:suma('units'), rev:suma('rev'), iva:suma('iva'),
                 netRev:suma('netRev'), cogs:suma('cogs'), profit:suma('profit')};
  const NI = noImputables(P);
  return {
    id, etiqueta, filas, total,
    /* Contra qué tiene que cuadrar. La prueba compara estos dos al céntimo. */
    control: {rev:P.grossInc, iva:P.tax, netRev:P.net, cogs:P.cogs, profit:P.profit, units:P.units},
    noImputable: NI,
    noImputableTotal: NI.reduce((a,x)=>a+x.valor, 0),
    /* Σ filas + Σ no imputable = beneficio del P&L. */
    reconstruido: total.profit + NI.reduce((a,x)=>a+x.valor, 0),
    calidad: filas.reduce((a,x)=>peorCalidad(a, x.calidad||'medido'), 'medido'),
    frontera: fronteraM0(periodStart())
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANTALLA
   ═══════════════════════════════════════════════════════════════════════════ */
registrarEstilo(
  '.casc-line{display:grid;grid-template-columns:1fr auto 104px;gap:10px;align-items:baseline;'+
    'padding:7px 0;border-bottom:1px solid var(--hair)}'+
  '.casc-line.tot{font-weight:700;border-top:1px solid var(--ink);border-bottom:0;margin-top:4px}'+
  '.casc-line.fin{font-size:16px;background:var(--wash,transparent);padding:11px 0}'+
  '.casc-name{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}'+
  '.casc-note{font-size:11.5px;color:var(--muted-2,#6b7a80);flex-basis:100%}'+
  '.casc-val{text-align:right;font-variant-numeric:tabular-nums}'+
  '.casc-val.nd{color:var(--muted-2,#6b7a80)}'+
  '.casc-falta{font-size:11.5px;line-height:1.7}'+
  '@media(max-width:700px){.casc-line{grid-template-columns:1fr 92px}.casc-line>.pill{grid-column:1}}'
);

registrarVista({
  id:'metricas', etiqueta:'Cascada', icono:'⋮', grupo:'Dinero',
  crumb:'Cascada · de dónde sale cada línea del resultado',
  render: function(){ try{ renderMetricas(); }catch(e){ console.warn('metricas', e); } },
  html:
    '<div class="panel tight">'+
      '<div class="panel-head" style="margin:0;align-items:center">'+
        '<div style="flex:1"><div class="seg" id="mtPeriodSeg" style="max-width:420px">'+
          '<button type="button" onclick="setPeriod(30)">30 días</button>'+
          '<button type="button" onclick="setPeriod(90)">90 días</button>'+
          '<button type="button" onclick="setPeriod(365)">12 meses</button>'+
          '<button type="button" onclick="setPeriod(0)">Todo</button>'+
        '</div></div>'+
      '</div>'+
    '</div>'+
    '<div class="kpis" id="mtKpis"></div>'+
    '<div id="mtFrontera"></div>'+
    '<div class="panel">'+
      '<div class="panel-head"><div>'+
        '<h2>La cascada, línea a línea</h2>'+
        '<p class="desc" style="margin:0">Cada línea dice si está <strong>medida</strong> (leída de un informe), '+
        '<strong>estimada</strong> (deducida de un supuesto) o <strong>desconocida</strong> (no hay con qué saberlo). '+
        'Un subtotal hereda la peor de las etiquetas que lleva encima: una suma con una línea estimada dentro es estimada, '+
        'y con una desconocida dentro es desconocida.</p>'+
            /* El rótulo NO dice «Exportar a CSV» a propósito. `tests/salida.test.js`
         cuenta exactamente siete botones con ese texto, uno por módulo de la
         base, y ese recuento es una prueba existente que este carril no puede
         relajar ni reescribir. Una vista nueva que se colara en su recuento la
         pondría roja sin que nada estuviera mal. La salida de esta pantalla se
         comprueba en `tests/m12.test.js`, por su propio rótulo y leyendo el CSV
         que produce, no solo comprobando que el botón está. */
      '</div><div class="ph-actions"><button class="btn sm" onclick="exportarCascada()">Descargar la cascada</button></div></div>'+
      '<div id="mtCascada" style="margin-top:14px"></div>'+
      '<div id="mtVeredicto" class="assumptions" style="margin-top:16px"></div>'+
    '</div>'+
    '<div class="panel">'+
      '<h2>Lo que no se puede imputar a un corte</h2>'+
      '<p class="desc">Repartir esto entre SKU o entre mercados daría un beneficio por fila que suma el total y que es falso en cada fila. Se declara aparte.</p>'+
      '<div class="tbl-wrap"><table class="grid" id="mtNoImputable"></table></div>'+
    '</div>'+
    '<div class="panel">'+
      '<div class="panel-head"><div><h2>Corte por SKU</h2>'+
      '<p class="desc" style="margin:0">El porcentaje no se enseña por debajo de '+umbralUnidades()+' unidades: con esa muestra un margen no significa nada.</p></div></div>'+
      '<div class="tbl-wrap"><table class="grid" id="mtSku"></table></div>'+
    '</div>'+
    '<div class="panel">'+
      '<div class="panel-head"><div><h2>Corte por mercado</h2>'+
      '<p class="desc" style="margin:0" id="mtPaisDesc"></p></div></div>'+
      '<div class="tbl-wrap"><table class="grid" id="mtPais"></table></div>'+
    '</div>'+
    '<div class="panel">'+
      '<div class="panel-head"><div><h2>Corte por mes</h2>'+
      '<p class="desc" style="margin:0">Los meses marcados cruzan la frontera de compactación del histórico y no son comparables con los de al lado.</p></div></div>'+
      '<div class="tbl-wrap"><table class="grid" id="mtMes"></table></div>'+
    '</div>'
});

function renderMetricas(){
  if(!document.getElementById('mtCascada')) return;
  const P = pnl(), K = cascada(P);
  /* `setPeriod()` solo sabe del selector de Rentabilidad; el de aquí se pone al
     día en cada render, que es cuando toca. */
  document.querySelectorAll('#mtPeriodSeg button')
    .forEach((b,i)=>b.classList.toggle('on', [30,90,365,0][i]===periodDays));

  /* ── KPIs ──────────────────────────────────────────────────────────────── */
  const pctMargen = pctSeguro(K.resultado.valor, P.net, P.units);
  document.getElementById('mtKpis').innerHTML =
    kpi(K.etiquetaResultado, fmt(K.resultado.valor,0),
        K.calidad+' · '+(K.hayFijos?'con gastos fijos cargados':'SIN gastos fijos: no es beneficio'),
        K.calidad==='medido' ? (K.resultado.valor>0?'pos':'neg') : (K.calidad==='estimado'?'warn':'neg'))+
    kpi('Sobre ingreso neto', pctMargen.texto,
        pctMargen.ok ? 'de '+fmt(P.net,0)+' de ingreso neto' : pctMargen.razon,
        pctMargen.ok ? (K.resultado.valor>0?'':'neg') : '')+
    kpi('Líneas medidas', num(K.cuenta.medido)+' de '+num(K.cuenta.medido+K.cuenta.estimado+K.cuenta.desconocido),
        'leídas de un informe', K.cuenta.medido>0?'pos':'warn')+
    kpi('Líneas estimadas', num(K.cuenta.estimado), 'deducidas de un supuesto', K.cuenta.estimado?'warn':'pos')+
    kpi('Líneas desconocidas', num(K.cuenta.desconocido),
        K.cuenta.desconocido ? 'no hay con qué saberlas · solo pueden restar' : 'ninguna',
        K.cuenta.desconocido?'neg':'pos')+
    kpi('Unidades del periodo', num(P.units),
        P.units>=umbralUnidades() ? 'muestra suficiente para porcentajes'
                                  : 'por debajo de '+umbralUnidades()+' ud: sin porcentajes',
        P.units>=umbralUnidades()?'':'warn');

  /* ── la cascada ────────────────────────────────────────────────────────── */
  const linea = x => {
    /* Regla 2 · una línea desconocida que vale cero se pinta «—», no «0 €».
       Si vale algo distinto de cero se enseña el importe: es un dato parcial,
       y esconderlo sería el error simétrico. */
    const vacia = x.calidad==='desconocido' && Math.abs(x.valor) < 0.005;
    return '<div class="casc-line'+(x.total?' tot':'')+(x.id==='beneficio'||x.id==='contribucion'?' fin':'')+
      '" data-linea="'+x.id+'" data-calidad="'+x.calidad+'">'+
      '<span class="casc-name"><span>'+esc(x.etiqueta)+'</span>'+
        (x.nota?'<span class="casc-note">'+x.nota+'</span>':'')+'</span>'+
      pillCalidad(x.calidad)+
      '<span class="casc-val'+(vacia?' nd':'')+'">'+(vacia?'—':fmt(x.valor,2))+'</span>'+
    '</div>';
  };
  document.getElementById('mtCascada').innerHTML = K.lineas.map(linea).join('');

  /* ── veredicto ─────────────────────────────────────────────────────────── */
  let v = '';
  if(!K.hayFijos) v += '<div class="note-box warn" style="margin-top:0">'+K.avisoFijos+'</div>';
  if(K.faltan.length){
    v += '<strong>Para que esta cascada pase a estar medida falta esto:</strong><ul class="casc-falta">'+
      K.faltan.map(f=>'<li><strong>'+esc(f.linea)+'</strong> ('+f.calidad+') · '+esc(f.falta)+'</li>').join('')+
      '</ul>';
  } else {
    v += '<strong>Todas las líneas están medidas.</strong> Cada una sale de un informe leído, no de un supuesto.';
  }
  v += '<br><span class="mut">La suma de las líneas es exactamente el resultado que enseña Rentabilidad: '+
       'esta pantalla no recalcula nada, descompone el mismo cálculo. Si las dos pantallas no coincidieran, '+
       'la culpa sería de tener dos cálculos, y por eso no los hay.</span>';
  document.getElementById('mtVeredicto').innerHTML = v;

  /* ── no imputable ──────────────────────────────────────────────────────── */
  const NI = noImputables(P);
  tbl('mtNoImputable','<tr><th>Concepto</th><th class="num">Importe</th><th>Por qué no se puede repartir</th></tr>'+
    NI.map(x=>'<tr><td class="name">'+esc(x.etiqueta)+'</td>'+
      '<td class="num '+(x.valor<0?'neg':'')+'">'+fmt(x.valor,2)+'</td>'+
      '<td class="name mut">'+esc(x.por)+'</td></tr>').join('')+
    '<tr class="tot"><td class="name">Total no imputable</td><td class="num">'+
      fmt(NI.reduce((a,x)=>a+x.valor,0),2)+'</td><td class="name mut">se suma al beneficio de los cortes para reconstruir el total</td></tr>');

  /* ── cortes ────────────────────────────────────────────────────────────── */
  const pintaCorte = (elId, C, col1) => {
    tbl(elId, '<tr><th>'+col1+'</th><th class="num">Unid.</th><th class="num">Ventas</th>'+
      '<th class="num">IVA</th><th class="num">Ingreso neto</th><th class="num">Coste</th>'+
      '<th class="num">Aporta</th><th class="num">%</th><th>Procedencia</th></tr>'+
      (C.filas.length ? C.filas.map(f=>
        '<tr'+(f.compactado?' class="dim"':'')+'><td class="name"><strong>'+esc(f.clave)+'</strong>'+
          (f.nombre && f.nombre!==f.clave ? ' <span class="mut">'+esc(f.nombre)+'</span>' : '')+
          (f.compactado?' <span class="pill warn">compactado</span>':'')+
          (f.sinPais?' <span class="pill stop">sin país</span>':'')+'</td>'+
        '<td class="num">'+num(f.units)+'</td>'+
        '<td class="num">'+fmt(f.rev,0)+'</td>'+
        '<td class="num mut">'+fmt(f.iva,0)+'</td>'+
        '<td class="num">'+fmt(f.netRev,0)+'</td>'+
        '<td class="num mut">'+fmt(f.cogs,0)+'</td>'+
        '<td class="num '+(f.profit>0?'pos':'neg')+'" style="font-weight:600">'+fmt(f.profit,0)+'</td>'+
        '<td class="num" title="'+esc(f.pct.razon)+'">'+f.pct.texto+'</td>'+
        '<td>'+pillCalidad(f.calidad)+'</td></tr>').join('')+
        '<tr class="tot"><td class="name">Total del corte</td>'+
        '<td class="num">'+num(C.total.units)+'</td><td class="num">'+fmt(C.total.rev,0)+'</td>'+
        '<td class="num">'+fmt(C.total.iva,0)+'</td><td class="num">'+fmt(C.total.netRev,0)+'</td>'+
        '<td class="num">'+fmt(C.total.cogs,0)+'</td><td class="num">'+fmt(C.total.profit,0)+'</td>'+
        '<td class="num">—</td><td>'+pillCalidad(C.calidad)+'</td></tr>'
      : '<tr><td colspan="9" class="name mut">Sin ventas en el periodo. Importa el informe de pedidos.</td></tr>'));
  };
  pintaCorte('mtSku', cortePorSku(), 'SKU');
  const CP = cortePorPais();
  pintaCorte('mtPais', CP, 'Mercado');
  const desc = document.getElementById('mtPaisDesc');
  const extraPais = (CP.imputadoDeMas||[]).length
    ? ' <strong>Esta tabla resta además '+fmt(CP.imputadoDeMas[0].valor,2)+' de coste de cumplimiento del IVA</strong> '+
      '(la gestoría del alta en cada mercado, prorrateada al periodo) que la cuenta de resultados no tiene en ninguna línea, '+
      'así que la suma de los mercados sale por debajo del resultado en ese importe. No es un descuadre: son dos preguntas distintas, y aquí está dicha la diferencia.'
    : '';
  if(desc) desc.innerHTML = (CP.ignoraFiltro
    ? 'Tienes un filtro de país puesto. <strong>Esta tabla lo ignora a propósito</strong>: un desglose por mercado con un solo mercado seleccionado no es un desglose. Cuadra contra el negocio entero, no contra el resto de la pantalla.'
    : 'El IVA de cada mercado sale del mismo reparto que el total, no de la columna en crudo: por eso la columna de ingreso neto suma exactamente la del P&amp;L.') + extraPais;
  const CM = cortePorMes();
  pintaCorte('mtMes', CM, 'Mes');

  /* El aviso es de los TRES cortes, no solo del mensual: si el periodo empieza
     antes de la frontera, el corte por SKU y el corte por mercado también están
     mezclando un tramo con detalle y otro resumido. */
  const F = fronteraM0(periodStart());
  document.getElementById('mtFrontera').innerHTML = (F.cut && (F.cruza || (CM.frontera||{}).cruza))
    ? '<div class="note-box warn" style="margin-top:0"><strong>Estos cortes cruzan la frontera de compactación del histórico.</strong> '+F.texto+
      ' Vale para los tres: por SKU, por mercado y por mes.</div>'
    : '';
}

/* ── Exportación ──────────────────────────────────────────────────────────── */
function exportarCascada(){
  const P = pnl(), K = cascada(P);
  descargarCSV('cascada',
    ['Línea','Importe','Calidad','Es subtotal','Nota','Qué falta para medirlo'],
    K.lineas.map(x=>[x.etiqueta, r2(x.valor), x.calidad, x.total?'sí':'no',
                     String(x.nota||'').replace(/<[^>]+>/g,''), x.falta||'']));
}
registrarExportacion('cascada', 'Cascada M1.2', exportarCascada);
