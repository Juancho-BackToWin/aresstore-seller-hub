
/* =========================================================================
   M1.1 · COSTES POR LOTES  ·  lo que hace creíble el margen

   Hasta aquí cada SKU tenía UN coste, constante para toda la eternidad. Con
   precios de fábrica y fletes moviéndose —y en 2026 se mueven— eso falsea el
   margen exactamente donde se decide si escalar: una venta de marzo se costea
   con el precio de agosto, y el número sale bonito o feo por casualidad.

   Un lote es una compra: fecha, unidades, coste de fábrica y flete repartido.
   A partir de ahí, cada unidad vendida se puede costear con el lote que le
   corresponde. Tres métodos, y ninguno es el correcto en abstracto:

   · POR PERIODO — la venta se costea con el lote vigente en su fecha. Es el
     más intuitivo y el más robusto cuando faltan lotes: no necesita saber
     cuántas unidades quedaban, solo qué coste estaba vigente. Es el que
     recomiendo mientras el registro de compras no esté completo.

   · FIFO — la venta consume el lote más antiguo que quede. Es el que refleja
     de verdad lo que pagaste por las unidades que saliste vendiendo, y es el
     que exige el registro completo: si falta el lote de apertura o falta una
     compra, la cola se vacía y hay que inventar. Aquí no se inventa en
     silencio: cada unidad costeada por relleno queda contada y se dice en
     pantalla cuántas son.

   · PROMEDIO PONDERADO — media de los lotes hasta la fecha de la venta,
     ponderada por unidades compradas. Es el más estable y el que menos se
     mueve por un lote pequeño y raro. Suaviza, y suavizar también es mentir
     un poco: un lote caro no se ve hasta que pesa.

   DECISIÓN DE FONDO: el coste base del producto (`cogs` + `freight`) NO
   desaparece. Sigue siendo la red de seguridad para las ventas que ningún
   lote cubre. Así, una base de datos sin lotes se comporta exactamente igual
   que antes de este módulo —nada se rompe— y las unidades que caen en la red
   se cuentan aparte en vez de disfrazarse de dato medido.
   ========================================================================= */

const COST_METHODS = [
  {id:'period', name:'Por periodo',
   short:'el lote vigente en la fecha de la venta',
   long:'Cada venta se costea con el último lote comprado antes de esa fecha. No necesita saber cuántas unidades quedaban de cada lote, así que es el que mejor aguanta un registro de compras incompleto. Es el punto de partida recomendado.'},
  {id:'fifo', name:'FIFO',
   short:'consume primero el lote más antiguo',
   long:'Cada unidad vendida consume el lote más antiguo que quede con existencias. Es el que refleja lo que pagaste de verdad por lo que vendiste, y el único que exige tener TODAS las compras cargadas, incluida la de apertura. Si la cola se agota, las unidades restantes se costean con el último lote y aparecen contadas como relleno.'},
  {id:'avg', name:'Promedio ponderado',
   short:'media de las compras hasta esa fecha',
   long:'Media de los lotes anteriores a la venta, ponderada por unidades compradas. Es el más estable mes a mes y el que menos se altera por un lote pequeño. A cambio, un lote caro tarda en notarse en el margen.'}
];

function costMethod(){
  const m = DB.settings && DB.settings.costMethod;
  return COST_METHODS.some(x=>x.id===m) ? m : 'period';
}
function costMethodInfo(){ const m=costMethod(); return COST_METHODS.filter(x=>x.id===m)[0]; }
function setCostMethod(m){
  if(!COST_METHODS.some(x=>x.id===m)) return;
  DB.settings.costMethod = m;
  saveDB(); refreshAll();
  toast('Método de coste: '+costMethodInfo().name+' · '+costMethodInfo().short);
}

/* -------------------------------------------------------------------------
   El lote
   ------------------------------------------------------------------------- */
function lotCost(l){ return toNum(l.unit) + toNum(l.freight); }
function baseCost(p){ return p ? (toNum(p.cogs) + toNum(p.freight)) : 0; }

/* Lotes válidos de un producto, ordenados por fecha. Un lote sin fecha o sin
   coste no sirve para nada y se ignora aquí en lugar de contaminar el cálculo;
   la interfaz lo marca en rojo para que se corrija. */
function prodLots(p){
  if(!p || !Array.isArray(p.lots)) return [];
  return p.lots.filter(l=>l && l.date && lotCost(l)>0)
               .slice().sort((a,b)=> a.date<b.date ? -1 : (a.date>b.date ? 1 : 0));
}
function badLots(p){
  if(!p || !Array.isArray(p.lots)) return [];
  return p.lots.filter(l=>!l || !l.date || lotCost(l)<=0);
}
function anyLots(){ return DB.products.some(p=>prodLots(p).length>0); }
function totalLots(){ return DB.products.reduce((a,p)=>a+(Array.isArray(p.lots)?p.lots.length:0),0); }

/* -------------------------------------------------------------------------
   Método 1 · por periodo
   ------------------------------------------------------------------------- */
function costPeriodAt(p, k){
  /* Se trabaja sobre los lotes YA FUNDIDOS por fecha (mergedLots). Sin fundir,
     dos contenedores del mismo día daban un coste u otro según el orden en que
     se hubieran tecleado —hasta el triple— porque «el último de la lista» es
     una posición, no una fecha. */
  const L = mergedLots(p);
  if(!L.length) return {cost:baseCost(p), src:baseCost(p)>0?'base':'none'};
  let hit = null;
  for(let i=0;i<L.length;i++){ if(L[i].date <= k) hit = L[i]; else break; }
  if(hit) return {cost:hit.cost, src:'lot'};
  /* La venta es anterior a tu primer lote: no hay compra registrada que la
     explique, y usar el lote MÁS NUEVO para costear la venta MÁS VIEJA es
     precisamente reescribir el pasado. Para eso está el coste base, que es lo
     que el producto valía antes de que existiera registro de compras. Si ni
     eso hay, se cae al lote más antiguo, pero cuenta como no medido. */
  const b = baseCost(p);
  return {cost: b>0 ? b : L[0].cost, src:'open'};
}

/* -------------------------------------------------------------------------
   Método 2 · promedio ponderado
   Media de las compras hasta la fecha, ponderada por unidades. Un lote sin
   unidades pesa cero; si ninguno tiene unidades se cae a media simple, que es
   lo único que queda.
   ------------------------------------------------------------------------- */
function costAvgAt(p, k){
  const L = mergedLots(p);
  if(!L.length) return {cost:baseCost(p), src:baseCost(p)>0?'base':'none'};
  const upto = L.filter(l=>l.date <= k);
  /* Venta anterior a todas las compras: promediar el historial ENTERO metería
     en la media lotes posteriores a la venta, que es mezclar el futuro con el
     pasado. Se usa el coste base, igual que en «por periodo». */
  if(!upto.length){
    const b = baseCost(p);
    return {cost: b>0 ? b : L[0].cost, src:'open'};
  }
  let q=0, v=0;
  upto.forEach(l=>{ q+=l.qty; v+=l.qty*l.cost; });
  const cost = q>0 ? v/q : upto.reduce((a,l)=>a+l.cost,0)/upto.length;
  return {cost, src:'lot'};
}

/* -------------------------------------------------------------------------
   EL LIBRO DE UNIDADES  ·  el control de cantidad, común a los tres métodos

   Aquí está la diferencia entre «existe un lote con fecha anterior a esta
   venta» y «había unidades». Son cosas distintas y confundirlas es lo que
   permitía que 700 unidades sin ninguna compra detrás salieran certificadas
   como medidas en el método recomendado.

   El libro recorre las ventas en orden y las va consumiendo contra los lotes,
   como haría FIFO. Se calcula SIEMPRE, use el método que use, porque de él
   sale de dónde viene cada unidad. Lo que cambia con el método es el COSTE,
   no el recuento.

   Tres decisiones que conviene entender:

   1 · Se recorre el informe COMPLETO, no el periodo que estés mirando. Si se
       recorriera solo el periodo, la cola arrancaría llena en cada pantalla y
       el lote más barato se volvería a consumir cada vez. El filtro de periodo
       se aplica DESPUÉS.

   2 · Se agrupa por día y SKU. Dentro de un mismo día no hay forma de saber
       qué pedido fue primero, así que las unidades de ese día comparten el
       coste medio de lo que consumieron. Es determinista, que es lo que
       importa: la misma importación da siempre el mismo margen.

   3 · EL AGUJERO QUE NO SE VE, Y CÓMO SE CIERRA. La cola arranca con todo lo
       que has comprado nunca, pero solo se consume con las ventas del informe,
       que cubre 90 o 120 días. Lo que compraste Y VENDISTE antes de esa ventana
       seguía entero en la cola, y FIFO lo volvía a gastar: un contenedor barato
       de hace un año se regastaba hoy y el margen salía espléndido.

       Se cierra con una cuenta que el hub ya tiene los datos para hacer:
           sobrante = comprado − vendido en el informe − stock de hoy
       Si sobra, eso se vendió antes de la ventana, y se descuenta de la CABEZA
       de la cola, que es donde estaba. Con eso el coste se corrige solo y ya no
       hace falta encender ninguna alarma. La alarma (`stale`) queda reservada
       para cuando no se puede hacer la cuenta —sin informe de inventario no se
       sabe el stock— que es cuando de verdad no se puede saber. Una señal
       encendida siempre se apaga en la cabeza de quien la mira.

       Límite honesto: el stock que se usa es el disponible, sin contar lo que
       está en tránsito ni reservado. Si tienes mercancía en un barco, el
       sobrante sale mayor de lo que es y se recorta de más. Y ojo con la
       tentación de llamar a eso «prudente»: el recorte no empuja el coste
       hacia arriba, lo empuja hacia los lotes MÁS NUEVOS. Con precios
       subiendo sale más caro —prudente—, pero con precios bajando sale más
       barato y el margen queda optimista.
   ------------------------------------------------------------------------- */
let _ledgerMemo = {sig:null, val:null};
function lotsSig(){
  /* La firma tiene que cambiar SIEMPRE que cambie algo que mueva el resultado.
     Contar filas no basta: dos informes distintos pueden tener las mismas
     filas y devolverías el coste del anterior sin enterarte. Por eso entran
     también las marcas de tiempo de las importaciones. El SKU va escapado
     porque los separadores de la firma son caracteres corrientes. */
  const O = DB.imports.orders || {}, I = DB.imports.inventory || {}, M = DB.imports.multicountry || {};
  let s = ((O.rows && O.rows.length)||0) + '|' + (O.loadedAt||'') + '|' +
          ((I.rows && I.rows.length)||0) + '|' + (I.loadedAt||'') + '|' + (M.loadedAt||'');
  DB.products.forEach(p=>{
    s += '|' + encodeURIComponent(p.sku) + ':' + baseCost(p) + ':' + (p.channel||'') + ':' + toNum(p.fbmStock) + ':' +
         prodLots(p).map(l=>l.date+'#'+toNum(l.qty)+'#'+lotCost(l)).join(',');
  });
  return s;
}
/* Lotes de la misma fecha fundidos en uno: cantidad sumada y coste medio
   ponderado. Sin esto, dos contenedores del mismo día daban un coste u otro
   según el orden en que se hubieran tecleado —hasta el triple— porque la cola
   los consumía en orden de inserción. */
function mergedLots(p){
  const out = [];
  prodLots(p).forEach(l=>{
    const cur = out.length ? out[out.length-1] : null;
    const q = Math.max(0, toNum(l.qty)), c = lotCost(l);
    if(cur && cur.date === l.date){
      cur.qty += q; cur.sum += q*c; cur.n++; cur.plain += c;
    } else out.push({date:l.date, qty:q, sum:q*c, n:1, plain:c});
  });
  /* El respaldo cuando ningún lote del día lleva unidades es la media simple
     de TODOS ellos, acumulada. Promediar de dos en dos daba un número distinto
     según el orden —6,75 € o 5,25 € para 3, 6 y 9 €— que es exactamente el
     fallo que este fundido viene a arreglar. */
  return out.map(x=>({date:x.date, qty:x.qty,
                      cost: x.qty>0 ? x.sum/x.qty : x.plain/x.n}));
}
/* Stock disponible de hoy por SKU, en minúsculas, y —esto es lo importante—
   de QUÉ SKU se ha visto el stock de verdad. Un «lo sé» global era falso: con
   una sola fila de cualquier informe, o con un stock propio de FBM tecleado en
   el catálogo, el hub daba por conocido el stock de todo el catálogo y a los
   demás SKU les asignaba cero. Y un cero inventado hace que el recorte se
   coma el almacén entero: 1.950 unidades en la estantería dadas por vendidas
   y un coste un 111 % más alto, con una frase afirmativa al lado. */
function stockBySku(){
  const s = {}, seen = {};
  imp('inventory').forEach(r=>{
    const k = gv(r,'_sku','sku','sellersku'); if(!k) return;
    const sk = String(k).toLowerCase();
    s[sk] = (s[sk]||0) + toNum(gv(r,'_qty','afnfulfillablequantity'));
    seen[sk] = 1;
  });
  /* El informe multipaís trae la cantidad de cada país y antes se leía para
     tirarla. Solo se usa para los SKU que no vengan en el de inventario, que
     ya da el total: sumar los dos sería contar el mismo stock dos veces. */
  const mc = {};
  imp('multicountry').forEach(r=>{
    const k = gv(r,'_sku','sellersku','sku'); if(!k) return;
    const sk = String(k).toLowerCase();
    mc[sk] = (mc[sk]||0) + toNum(gv(r,'_qty','quantityforlocalfulfillment'));
  });
  Object.keys(mc).forEach(sk=>{ if(!seen[sk]){ s[sk] = mc[sk]; seen[sk] = 1; } });
  DB.products.forEach(p=>{
    if(p.channel!=='FBM') return;
    if(p.fbmStock===undefined || p.fbmStock==='') return;
    const sk = String(p.sku).toLowerCase();
    s[sk] = toNum(p.fbmStock); seen[sk] = 1;
  });
  return {stock:s, seen};
}

function lotLedger(){
  const sig = lotsSig();
  if(_ledgerMemo.sig === sig) return _ledgerMemo.val;

  const rows = salesRows({from:null, country:'ALL'});
  const pm = prodBySku();
  const ST = stockBySku();

  /* unidades vendidas por SKU y día. En minúsculas, igual que prodBySku():
     dos escrituras del mismo SKU en el informe crearían dos colas que
     consumen los mismos lotes y las unidades dejarían de conservarse. */
  const bySku = {};
  rows.forEach(r=>{
    const sk = String(r.sku||'').toLowerCase();
    const k = iso(r.date);
    const m = bySku[sk] || (bySku[sk] = {});
    m[k] = (m[k]||0) + r.qty;
  });

  /* Las devoluciones se restan de lo vendido. El libro cuenta ventas brutas y
     el stock del informe viene NETO de devoluciones, así que sin esta resta la
     tasa de devolución se colaba en el cuadre y se inventaba un lote de
     apertura de ese tamaño. */
  const devuelto = {};
  imp('returns').forEach(r=>{
    const k = gv(r,'_sku','sku','sellersku'); if(!k) return;
    const sk = String(k).toLowerCase();
    devuelto[sk] = (devuelto[sk]||0) + (toNum(gv(r,'_qty','quantity')) || 1);
  });

  const out = {}, bal = {};
  let todosVistos = true;
  Object.keys(bySku).forEach(sk=>{
    const p = pm[sk] || null;
    const L = mergedLots(p);
    if(!L.length) return;                 // sin lotes: lo resuelve costOfSales

    const days = Object.keys(bySku[sk]).sort();
    const firstSale = days[0];
    const bought = L.reduce((a,l)=>a+l.qty, 0);
    const sold   = days.reduce((a,k)=>a+bySku[sk][k], 0);
    const visto  = !!ST.seen[sk];
    if(!visto) todosVistos = false;
    const st     = visto ? (ST.stock[sk]||0) : 0;
    const bc     = baseCost(p);
    const q      = L.map(l=>({date:l.date, left:l.qty, cost:l.cost}));

    /* DOS CORRECCIONES SIMÉTRICAS, una por cada extremo de la cola.

       Por la cabeza · lo comprado que no explican ni las ventas del informe ni
       el stock de hoy se vendió ANTES de la ventana del informe, así que se
       descuenta: si no, un contenedor barato de hace un año se regasta hoy.

       Por la cola · si has vendido más de lo que has comprado, esas unidades
       salieron del stock que ya tenías el día que empezaste a registrar
       compras. Se antepone un lote de apertura por esa cantidad, al coste
       base. Sin él, la cola tenía unidades pero eran del lote equivocado: el
       recuento decía 98 % medido y el coste se iba un 33 % arriba. */
    const neto  = Math.max(0, sold - (devuelto[sk]||0));
    const sobra = bought - neto - st;
    const falta = Math.max(0, neto + st - bought);
    let recortado = 0, apertura = 0;
    if(visto && sobra > 0){
      let t = sobra;
      for(let i=0; i<q.length && t>0; i++){
        const take = Math.min(t, q[i].left);
        q[i].left -= take; t -= take; recortado += take;
      }
    }
    if(falta > 0){
      apertura = falta;
      q.unshift({date:'0000-00-00', left:falta, cost: bc>0 ? bc : q[0].cost, open:true});
    }
    bal[sk] = {bought, sold, neto, devuelto:(devuelto[sk]||0), stock:st, stockKnown:visto,
               recortado, apertura, sobra: Math.max(0, sobra), falta};

    const dst = out[sk] = {};
    let qi = 0, lastCost = null;
    days.forEach(k=>{
      let need = bySku[sk][k], val = 0, taken = 0;
      const qq = {lot:0, open:0, tail:0, stale:0};
      while(need > 0){
        while(qi < q.length && q[qi].left <= 0) qi++;
        if(qi >= q.length) break;
        const lot = q[qi];
        /* Un lote posterior a la venta no puede haber surtido esa venta. No se
           consume: si se consumiera, esas unidades se le quitarían a las ventas
           que sí vinieron de ahí y el desfase se arrastraría hacia delante. */
        if(lot.date > k) break;
        const take = Math.min(need, lot.left);
        lot.left -= take; need -= take; taken += take; val += take*lot.cost;
        lastCost = lot.cost;
        if(lot.open) qq.open += take;
        /* Sin haber visto el stock de ESTE SKU no se puede cuadrar la cantidad,
           y consumir un lote anterior al informe pasa de medición a suposición. */
        else if(!visto && lot.date < firstSale) qq.stale += take;
        else qq.lot += take;
      }
      if(need > 0){
        /* Se ha vaciado lo disponible A ESTA FECHA. Con el lote de apertura ya
           puesto, esto solo pasa cuando la compra existe pero está fechada
           DESPUÉS de la venta: tienes el papel, no tenías la mercancía. */
        const abierto = (lastCost === null);
        const c = abierto ? (bc > 0 ? bc : (q[0] ? q[0].cost : 0)) : lastCost;
        val += need*c; taken += need;
        if(abierto) qq.open += need; else qq.tail += need;
        need = 0;
      }
      dst[k] = {c: taken>0 ? val/taken : 0, q:qq, u:taken};
    });
  });
  _ledgerMemo = {sig, val:{cost:out, bal, stockKnown:todosVistos}};
  return _ledgerMemo.val;
}

/* -------------------------------------------------------------------------
   Entrada única · coste unitario de UNA unidad a una fecha

   Deliberadamente NO pasa por FIFO. FIFO responde a otra pregunta —qué lote
   consumió una venta concreta— y usarlo aquí hacía que el valor del inventario
   cambiara tres veces según si el informe traía o no una venta de hoy: mismo
   stock, mismos lotes, 8.000 € de diferencia. Para valorar existencias la
   pregunta correcta es siempre «cuánto cuesta reponerlo».
   ------------------------------------------------------------------------- */
function unitCostAt(p, dateOrK){
  const k = typeof dateOrK === 'string' ? dateOrK : iso(dateOrK||today());
  return costMethod()==='avg' ? costAvgAt(p, k) : costPeriodAt(p, k);
}

/* Coste unitario vigente hoy: es el que vale para valorar el inventario. */
function costNow(p){ return unitCostAt(p, iso(today())).cost; }

/* -------------------------------------------------------------------------
   Coste de un conjunto de ventas · lo que consume el P&L

   Devuelve el total, el desglose por SKU y por país y —esto es lo importante—
   de dónde sale cada unidad. Un coste total sin saber cuántas unidades están
   medidas y cuántas rellenadas es un número que no se puede auditar.

   El COSTE sale del método elegido. El RECUENTO sale siempre del libro de
   unidades, que es común a los tres: el método es un criterio contable, la
   cantidad de mercancía que compraste no.

   Los orígenes posibles:
     lot   · respaldada por una compra registrada con unidades suficientes
     stale · consumió un lote anterior al informe sin poder cuadrar cantidades
             (falta el informe de inventario). Suposición, no medición
     open  · venta anterior a toda compra registrada: falta el stock de apertura
     tail  · se agotó lo comprado y se prolongó el último coste conocido
     base  · el producto no tiene ningún lote
     none  · no hay coste de ninguna clase
   ------------------------------------------------------------------------- */
function costOfSales(rows){
  const pm = prodBySku();
  const q = {lot:0, stale:0, open:0, tail:0, base:0, none:0};
  const bySku = {}, byCountry = {};
  let cogs = 0, units = 0, known = 0;
  const useFifo = costMethod()==='fifo';
  const T = lotLedger();

  rows.forEach(r=>{
    const skRaw = String(r.sku||''), sk = skRaw.toLowerCase();
    const p = pm[sk] || null;
    const k = iso(r.date);
    const d = T.cost[sk] && T.cost[sk][k];
    let cost;
    if(d && d.u > 0){
      if(useFifo) cost = d.c;
      else {
        /* Las unidades de apertura salen de stock que ya tenías antes de que
           existiera registro de compras, así que su precio es el coste base y
           no el del primer lote. En FIFO ya lo hace la cola; aquí hay que
           mezclarlo dentro del día, o la pantalla dice «van al coste base» y
           el número dice otra cosa: en el hueco de registro más común eso son
           un 34 % de coste de más. */
        const c0 = unitCostAt(p, k).cost;
        const ab = d.q.open;
        cost = ab>0 ? (ab*baseCost(p) + (d.u-ab)*c0)/d.u : c0;
      }
      /* El reparto de orígenes de ese día se prorratea entre las filas del
         día, no entre todo el negocio: dentro de un mismo día y SKU las
         unidades son intercambiables, entre periodos distintos no. */
      const share = r.qty/d.u;
      q.lot += d.q.lot*share; q.stale += d.q.stale*share;
      q.open += d.q.open*share; q.tail += d.q.tail*share;
    } else {
      const x = unitCostAt(p, k);
      cost = x.cost;
      q[x.src] = (q[x.src]||0) + r.qty;
    }
    const b = bySku[skRaw] || (bySku[skRaw] = {sku:skRaw, units:0, cogs:0, known:0});
    b.units += r.qty; b.cogs += cost*r.qty;
    if(r.country){
      const c = byCountry[r.country] || (byCountry[r.country] = {units:0, cogs:0});
      c.units += r.qty; c.cogs += cost*r.qty;
    }
    units += r.qty; cogs += cost*r.qty;
    if(cost > 0){ known += r.qty; b.known += r.qty; }
  });

  return {cogs, units, known, bySku, byCountry, quality:q, bal:T.bal, stockKnown:T.stockKnown,
          measuredPct: units>0 ? q.lot/units*100 : 0,
          method: costMethod()};
}

/* Resumen para la interfaz: cuánto de lo que ves está respaldado por lotes. */
function lotCoverage(){
  const S = (typeof salesRows==='function') ? salesRows() : [];
  const C = costOfSales(S);
  const q = C.quality;
  return {
    units:C.units, cogs:C.cogs, method:C.method,
    lot:q.lot, stale:q.stale, open:q.open, tail:q.tail, base:q.base, none:q.none,
    pct: C.measuredPct,
    stockKnown: C.stockKnown,
    products: DB.products.length,
    withLots: DB.products.filter(p=>prodLots(p).length>0).length,
    lots: totalLots(),
    bad: DB.products.reduce((a,p)=>a+badLots(p).length,0)
  };
}

/* -------------------------------------------------------------------------
   Altas de lotes
   ------------------------------------------------------------------------- */
function addLot(prodId, lot){
  const p = DB.products.find(x=>x.id===prodId); if(!p) return null;
  if(!Array.isArray(p.lots)) p.lots = [];
  const l = Object.assign({id:uid(), date:iso(today()), qty:0, unit:0, freight:0, ref:''}, lot||{});
  p.lots.push(l);
  return l;
}
function delLot(prodId, lotId){
  const p = DB.products.find(x=>x.id===prodId); if(!p || !Array.isArray(p.lots)) return;
  p.lots = p.lots.filter(l=>l.id!==lotId);
}
/* Qué fecha lleva el lote que crea un pedido: la de RECEPCIÓN, y solo esa.
   La mercancía que sigue en un barco no puede haber surtido ninguna venta, y
   la fecha del PEDIDO es justamente la que con certeza NO es la de llegada:
   fechar ahí el lote hace que un contenedor que todavía no ha llegado se coma
   el margen de dos meses de ventas que salieron del stock viejo. Sin fecha de
   recepción devuelve null y quien llama decide, en lugar de inventarse una
   fecha plausible. */
function poLotDate(po){
  return po.received || null;
}
/* Un pedido de compra crea un lote POR LÍNEA, con el flete ya repartido. Si el
   mismo pedido se aplica dos veces —entrega parcial— se actualiza el lote que
   ya creó en lugar de duplicarlo. La clave lleva el índice de la línea: con el
   SKU solo, un pedido con la misma referencia en dos líneas perdía la mitad de
   las unidades y escribía un flete negativo. */
function lotFromPO(po, item, idx){
  const p = findProd(item.sku); if(!p) return null;
  /* La guarda vive aquí, no solo en quien llama: una función que crea datos no
     debe poder fabricar un lote sin fecha por descuido de otro. */
  if(!poLotDate(po)) return null;
  if(!Array.isArray(p.lots)) p.lots = [];
  const unit = toNum(item.unitCost);
  const freight = +(poUnitCostOf(po, item) - unit).toFixed(4);
  const date = poLotDate(po);
  const key = po.id + '·' + (idx==null ? item.sku : idx);
  let l = p.lots.filter(x=>x.poId===key)[0];
  if(l){ Object.assign(l, {date, qty:toNum(item.qty), unit, freight}); return l; }
  const prov = (DB.suppliers.filter(s=>s.id===po.supplierId)[0]||{}).name || '';
  l = {id:uid(), poId:key, date, qty:toNum(item.qty), unit, freight,
       ref:(po.ref||'pedido') + (prov ? ' · '+prov : '')};
  p.lots.push(l);
  return l;
}

/* -------------------------------------------------------------------------
   Carga por pegado · una tarde de trabajo, no una tarde de formularios

   Formato: SKU, fecha, unidades, coste de fábrica, flete por unidad
   Acepta tabulador, coma o punto y coma, con o sin cabecera, y números en
   formato español. El flete admite dos lecturas y se pregunta cuál: total del
   lote o ya por unidad. Confundirlas mete un factor de cientos en el margen.
   ------------------------------------------------------------------------- */
function parseLotPaste(text, freightIsTotal){
  /* Parser propio y deliberadamente tonto: cinco columnas por posición. No se
     reutiliza el del importador de informes porque aquel indexa las filas por
     el nombre de la columna, y aquí la cabecera puede no existir. Depender de
     nombres para leer algo que se lee por posición es como se desalinean las
     columnas sin que nadie se entere. */
  const lines = String(text||'').split(/\r?\n/).filter(l=>l.trim()!=='');
  const out = [], errs = [];
  const first = lines[0] || '';
  const tabs=(first.match(/\t/g)||[]).length, semis=(first.match(/;/g)||[]).length,
        commas=(first.match(/,/g)||[]).length;
  const D = tabs>0 ? '\t' : (semis>0 ? ';' : (commas>0 ? ',' : /\s{2,}/));
  lines.forEach((line, i)=>{
    const c = line.split(D).map(x=>String(x).trim());
    const sku = c[0]||'';
    if(!sku) return;
    if(i===0 && /^(sku|referencia|producto)$/i.test(sku)) return;   // cabecera
    const p = findProd(sku);
    const d = parseDate(c[1]);
    /* Con coma como separador un «4,35» se parte en dos celdas y todo se
       desplaza. Se detecta en lugar de leer números creíbles y falsos. */
    if(D===',' && c.length>5){
      errs.push('línea '+(i+1)+': hay más de cinco columnas. Si tus decimales llevan coma, separa con tabulador o punto y coma.');
      return;
    }
    if(!p){ errs.push('línea '+(i+1)+': el SKU «'+sku+'» no está en el catálogo'); return; }
    if(!d){ errs.push('línea '+(i+1)+': fecha ilegible («'+(c[1]||'')+'»)'); return; }
    const qty = toNum(c[2]), unit = toNum(c[3]), fr = toNum(c[4]);
    if(unit <= 0){ errs.push('línea '+(i+1)+': coste de fábrica a cero'); return; }
    if(qty <= 0 && costMethod()==='fifo'){
      errs.push('línea '+(i+1)+': sin unidades. En FIFO un lote sin cantidad no se puede consumir.');
      return;
    }
    const freight = freightIsTotal ? (qty>0 ? fr/qty : 0) : fr;
    out.push({prodId:p.id, sku:p.sku, date:iso(d), qty, unit, freight:+freight.toFixed(4)});
  });
  return {lots:out, errs};
}
function applyLotPaste(parsed){
  let n2 = 0;
  parsed.forEach(l=>{
    addLot(l.prodId, {date:l.date, qty:l.qty, unit:l.unit, freight:l.freight, ref:'importado'});
    n2++;
  });
  if(n2){ saveDB(); refreshAll(); }
  return n2;
}
