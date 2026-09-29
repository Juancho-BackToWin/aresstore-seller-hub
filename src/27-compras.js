/* ═══════════════════════════════════════════════════════════════════════════
   Carril 7 · M3 · Compras y caja

   POR QUÉ ESTE FICHERO. Un hub de gestión no falla dando error: falla dando un
   número creíble y falso. En compras hay cuatro sitios donde eso pasa sin que
   nadie lo note, y los cuatro cambian el coste unitario o la curva de caja —o
   sea, el margen y la decisión de pedir:

   1 · ENTREGAS PARCIALES. Un pedido de 1.500 unidades del que han llegado 600
       creaba un lote de 1.500 unidades fechado el día de la primera recepción.
       Stock inflado, y el coste puesto de esas 900 unidades aplicado a ventas
       que se sirvieron con stock anterior. Ahora cada recepción es un lote con
       SU fecha y SUS unidades, y `poLotDate()` sigue mandando: sin fecha no hay
       lote, ni de una entrega ni de un pedido entero.

   2 · REPARTO DE FLETE. Repartir por unidades, por valor o por peso da tres
       costes unitarios distintos para la misma factura. Un flete repartido sin
       decir cómo es exactamente un número creíble y falso. Aquí la BASE del
       reparto —qué criterio, sobre qué total, con qué unidad— se calcula una
       sola vez, se enseña en la pantalla del pedido y sale en la exportación.
       Y si el criterio pedido no se puede aplicar (peso sin pesos declarados),
       NO se cae en silencio a unidades: se cae diciéndolo.

   3 · EL CALENDARIO DE PAGOS INCOMPLETO. Un pedido de 50.000 € con solo el 30 %
       de anticipo escrito gastaba 15.000 € en la curva y los otros 35.000 no
       existían en ninguna parte. La caja salía plausible y sobraba. Ahora ese
       hueco se mide (`poSinCalendario`) y Tesorería lo dice. No se inventa una
       fecha para colocarlo: inventar la fecha es inventar el número.

   4 · DIVISA. Un pedido en dólares sin tipo de cambio se leía como si fueran
       euros. Aquí la divisa y el tipo son MANUALES y se declaran como tales.
       Sin tipo no se convierte y no se crea lote: se avisa. Nada de tipos de
       cambio automáticos — la multidivisa está despriorizada con dato (1,19 %
       de las ventas, cifra HEREDADA del traspaso de septiembre y no medida
       contra esta base).

   ORDEN DE EJECUCIÓN. Este módulo corre antes de 13-render y después de
   12-datos. Todo lo de aquí son `function`, izadas en el archivo concatenado,
   así que `cashProjection()` (12-datos) y `renderCompras()` (13-render) pueden
   llamarlas sin importar el orden del fichero.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── 0 · Dónde se guarda lo nuevo ──────────────────────────────────────────
   Una clave propia por la costura del registro, en vez de abrir `blankDB()`.
   Trae su migración, su copia y su restauración de serie. */
registrarClaveDB('cashPlan', {movs:[]});

/* Las cinco categorías de la caja. El orden es el del cuadro de mando: de lo
   que entra a lo que se reparte. */
const CASH_CATS = [
  ['cobros',      'Cobros',      'liquidaciones de Amazon y cobros programados'],
  ['mercancia',   'Mercancía',   'vencimientos de pedidos y reposición diaria'],
  ['gastos',      'Gastos',      'publicidad, fijos, IVA y gastos programados'],
  ['inversiones', 'Inversiones', 'desembolsos que no son mercancía'],
  ['dividendos',  'Dividendos',  'lo que sale hacia los socios']
];
/* Mercancía NO se puede programar a mano: sale de los pedidos. Dejar que se
   teclee sería tener dos verdades sobre el mismo dinero. */
const CASH_PLAN_CATS = CASH_CATS.filter(c=>c[0]!=='mercancia');

const PO_CURRENCIES = [
  ['EUR','EUR · euro'], ['USD','USD · dólar'], ['CNY','CNY · yuan'],
  ['GBP','GBP · libra'], ['PLN','PLN · zloty'], ['SEK','SEK · corona sueca'],
  ['TRY','TRY · lira'],  ['INR','INR · rupia']
];

/* Anclas de un vencimiento. `fixed` es lo que había y sigue siendo el defecto:
   un pedido antiguo sin `basis` se comporta exactamente igual que antes. */
const PAY_ANCLAS = [
  ['fixed',      'Fecha fija'],
  ['order',      'Desde la fecha de pedido'],
  ['production', 'Al cerrar producción'],
  ['eta',        'Desde la llegada prevista']
];

/* ═══════════════════════════════════════════════════════════════════════════
   1 · DIVISA DE COMPRA · solo registrar
   ═══════════════════════════════════════════════════════════════════════════ */
function poCur(po){
  const c = String((po && po.cur) || 'EUR').toUpperCase().trim();
  return c || 'EUR';
}
/* Euros por UNA unidad de la divisa del pedido. Siempre a mano.
   Devuelve null —no 1— cuando el pedido está en divisa y no hay tipo escrito:
   un 1 por defecto convierte 45.000 USD en 45.000 € y nadie lo ve. */
function poFxRate(po){
  if(poCur(po)==='EUR') return 1;
  const r = toNum(po && po.fx);
  return r > 0 ? r : null;
}
function poFxMissing(po){ return poFxRate(po) === null; }
function poFxNota(po){
  if(poCur(po)==='EUR') return 'Pedido en euros · sin conversión';
  const r = poFxRate(po);
  if(r===null) return 'Pedido en '+poCur(po)+' SIN tipo de cambio: los importes están en '+poCur(po)+', no en euros';
  return '1 '+poCur(po)+' = '+num(r,4)+' € · tipo introducido a mano'+
         (po.fxDate ? ' el '+po.fxDate : '')+' · el hub no consulta ningún tipo automático';
}
/* Convierte a euros un importe expresado en la divisa del pedido. */
function poEur(po, x){
  const r = poFxRate(po);
  return r===null ? null : toNum(x)*r;
}
/* Importe en la divisa del pedido, escrito como se lee: `fmt()` siempre pone
   el símbolo del euro delante, y un pedido en yuanes rotulado con «€» es otro
   número creíble y falso, solo que del tamaño de un factor 7. */
function poFmt(po, x, d){
  const c = poCur(po);
  return c==='EUR' ? fmt(x, d) : num(x, d==null?2:d)+' '+c;
}

/* ═══════════════════════════════════════════════════════════════════════════
   2 · REPARTO DE FLETE AUDITABLE · por unidades, por valor o por peso
   ═══════════════════════════════════════════════════════════════════════════ */
function poLineWeight(it){ return toNum(it && it.weight); }
function poValue(po){ return (po.items||[]).reduce((a,i)=>a+toNum(i.qty)*toNum(i.unitCost),0); }
function poWeight(po){ return (po.items||[]).reduce((a,i)=>a+toNum(i.qty)*poLineWeight(i),0); }

/* La BASE del reparto, calculada una sola vez y enseñada en pantalla y en el
   CSV. `pedido` es el criterio que eligió el usuario; `usado` es el que de
   verdad se ha podido aplicar. Cuando no coinciden, `degradado` es cierto y
   `motivo` dice por qué: una pantalla que pone «por peso» mientras reparte por
   unidades es la definición de número creíble y falso. */
function poFreightBasis(po){
  po = po || {};
  const pedido = ['units','value','weight'].indexOf(String(po.alloc)) >= 0 ? String(po.alloc) : 'units';
  const tot = {units:poUnits(po), value:poValue(po), weight:poWeight(po)};
  const UNI = {units:'unidades', value:'€ de mercancía', weight:'kg'};
  const NOM = {units:'por unidades', value:'proporcional al valor', weight:'por peso'};
  let usado = pedido, degradado = false, motivo = '';
  if(!(tot[pedido] > 0)){
    if(tot.units > 0){
      usado = 'units'; degradado = true;
      motivo = pedido==='weight'
        ? 'ninguna línea tiene peso declarado, así que el peso total es 0 kg'
        : 'el valor de la mercancía es 0 €';
    }else{
      usado = null; degradado = true;
      motivo = 'el pedido no tiene unidades';
    }
  }
  const total = usado ? tot[usado] : 0;
  const flete = toNum(po.freight);
  const porBase = (usado && total>0) ? flete/total : 0;
  const divisa = poCur(po)==='EUR' ? '€' : poCur(po);
  const etiqueta = usado
    ? NOM[usado]+' · '+num(total, usado==='units'?0:2)+' '+UNI[usado]+
      ' · '+num(porBase,4)+' '+divisa+'/'+(usado==='units'?'ud':(usado==='value'?'€':'kg'))
    : 'sin reparto posible';
  return {pedido, usado, degradado, motivo, total, porBase, flete,
          unidad: usado ? UNI[usado] : '—',
          nombrePedido: NOM[pedido], nombreUsado: usado ? NOM[usado] : 'sin reparto',
          etiqueta,
          /* La frase que va a la pantalla y al CSV, entera. */
          texto: (degradado
            ? NOM[pedido]+' NO aplicable ('+motivo+') → '+etiqueta
            : etiqueta)};
}
/* Flete que carga UNA unidad de esta línea, en la divisa del pedido. */
function poFreightShareOf(po, it){
  const b = poFreightBasis(po);
  const q = toNum(it && it.qty);
  if(!b.usado || !(b.total>0) || !(q>0)) return 0;
  const peso = b.usado==='value'  ? q*toNum(it.unitCost)
             : b.usado==='weight' ? q*poLineWeight(it)
             : q;
  return b.flete*(peso/b.total)/q;
}

/* ═══════════════════════════════════════════════════════════════════════════
   3 · ENTREGAS PARCIALES
   Una recepción = {id, date, ref, lines:{<índice de línea>: unidades}}.
   El índice, y no el SKU, porque el mismo SKU puede estar dos veces en el
   mismo pedido a precios distintos — que es como se perdía la mitad de las
   unidades y salía un flete negativo.
   ═══════════════════════════════════════════════════════════════════════════ */
function poReceipts(po){ return (po && Array.isArray(po.receipts)) ? po.receipts : []; }
function poReceiptQty(rec, idx){ return toNum(((rec&&rec.lines)||{})[idx]); }
function poReceiptUnits(rec){
  const l = (rec&&rec.lines)||{};
  return Object.keys(l).reduce((a,k)=>a+toNum(l[k]), 0);
}
function poReceivedUnitsOf(po, idx){
  return poReceipts(po).reduce((a,r)=>a+poReceiptQty(r, idx), 0);
}
function poReceivedUnits(po){
  return (po.items||[]).reduce((a,i,idx)=>a+poReceivedUnitsOf(po, idx), 0);
}
/* Auditoría de recepción, línea a línea. Lo que se enseña en la ficha del
   pedido y lo que sostiene la exportación. */
function poReceiptAudit(po){
  const recs = poReceipts(po);
  const lineas = (po.items||[]).map((i,idx)=>{
    const ped = toNum(i.qty), rec = poReceivedUnitsOf(po, idx);
    return {idx, sku:i.sku, pedidas:ped, recibidas:rec, pendientes:ped-rec, excedida: rec>ped+0.0001};
  });
  return {
    entregas: recs.length,
    pedidas:   lineas.reduce((a,l)=>a+l.pedidas,0),
    recibidas: lineas.reduce((a,l)=>a+l.recibidas,0),
    pendientes:lineas.reduce((a,l)=>a+Math.max(0,l.pendientes),0),
    excedidas: lineas.filter(l=>l.excedida),
    sinFecha:  recs.filter(r=>!poLotDate(po, r)),
    lineas
  };
}
/* Unidades de este pedido que todavía NO han llegado.

   Con entregas declaradas es aritmética: pedidas − recibidas. Sin entregas se
   conserva EXACTAMENTE el criterio anterior —un pedido en estado «recibido»
   cubre cero días, el resto cubre todo lo pedido—, porque cambiarlo sin dato
   haría más optimista la curva de caja de todo el mundo de golpe. */
function poEnCursoUnits(po, filtroSku){
  const recs = poReceipts(po);
  return (po.items||[]).reduce((a,i,idx)=>{
    if(filtroSku && !filtroSku(i.sku)) return a;
    const ped = toNum(i.qty);
    const rec = recs.length ? poReceivedUnitsOf(po, idx) : (po.status==='received' ? ped : 0);
    return a + Math.max(0, ped - rec);
  }, 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
   4 · PLAZOS DE FABRICACIÓN Y DEPÓSITOS PROGRAMADOS
   ═══════════════════════════════════════════════════════════════════════════ */
/* Días de FABRICACIÓN (no el plazo total puerta a puerta, que es `lead`).
   Sin plazo declarado devuelve null y quien llama decide, en vez de caer en un
   número plausible: un 30 por defecto coloca un depósito de cinco cifras en un
   día que nadie ha dicho. */
function poProductionDays(po){
  const propio = toNum(po && po.prodDays);
  if(propio > 0) return propio;
  const sup = (DB.suppliers||[]).filter(s=>s.id===(po&&po.supplierId))[0];
  const sp = toNum(sup && sup.prod);
  return sp > 0 ? sp : null;
}
function poProductionEnd(po){
  const d = parseDate(po && po.ordered); if(!d) return null;
  const p = poProductionDays(po);       if(p === null) return null;
  return addDays(d, p);
}
/* Fecha real de un vencimiento. Sin `basis` es la de siempre: `dueDate`. */
function poPayDate(po, pay){
  const base = String((pay && pay.basis) || 'fixed');
  if(base === 'fixed') return parseDate(pay && pay.dueDate);
  const off = toNum(pay && pay.offset);
  let ancla = null;
  if(base==='order')           ancla = parseDate(po && po.ordered);
  else if(base==='production') ancla = poProductionEnd(po);
  else if(base==='eta')        ancla = parseDate(po && po.eta);
  return ancla ? addDays(ancla, off) : null;
}
function poPayDateTexto(po, pay){
  const d = poPayDate(po, pay);
  if(!d) return '— sin fecha resoluble';
  const base = String((pay && pay.basis) || 'fixed');
  if(base==='fixed') return iso(d);
  const off = toNum(pay && pay.offset);
  const nom = (PAY_ANCLAS.filter(a=>a[0]===base)[0]||['','?'])[1];
  return iso(d)+' · '+nom+(off ? (off>0?' +':' ')+off+' d' : '');
}
function poPctDeclarado(po){ return (po.payments||[]).reduce((a,p)=>a+toNum(p.pct), 0); }
/* El hueco del calendario, en euros y con signo: positivo = importe del pedido
   que no tiene ningún vencimiento escrito y que la curva por tanto NO gasta;
   negativo = calendario que suma más del 100 % y gasta de más. */
function poSinCalendario(po){
  const pct = poPctDeclarado(po);
  if(Math.abs(pct-100) < 0.5) return 0;
  return poAmount(po)*(100-pct)/100;
}

/* ═══════════════════════════════════════════════════════════════════════════
   5 · MOVIMIENTOS PROGRAMADOS DE CAJA (inversiones, dividendos, cobros, gastos)
   ═══════════════════════════════════════════════════════════════════════════ */
function cashPlan(){
  if(!DB.cashPlan || !Array.isArray(DB.cashPlan.movs)) DB.cashPlan = {movs:[]};
  return DB.cashPlan;
}
function cashPlanAdd(cat){
  cashPlan().movs.push({id:uid(), cat:cat||'inversiones', concept:'Nuevo movimiento',
                        amount:0, date:iso(addDays(today(),30)), repeat:'once'});
  saveDB(); renderTesoreria();
}
function cashPlanUpd(id, f, v){
  const m = cashPlan().movs.filter(x=>x.id===id)[0]; if(!m) return;
  m[f] = (f==='amount') ? toNum(v) : v;
  saveDB();
  if(f!=='concept') renderTesoreria();
}
function cashPlanDel(id){
  cashPlan().movs = cashPlan().movs.filter(x=>x.id!==id);
  saveDB(); renderTesoreria();
}
/* Reparte los movimientos programados sobre la ventana de la proyección.

   Un movimiento MENSUAL fijado el día 31 cae el último día de febrero, no
   desaparece ese mes: un dividendo que se salta cuatro meses al año deja la
   caja alta y falsa.
   Un movimiento único con fecha PASADA no se arrastra al día 0 —a diferencia
   de un vencimiento de pedido, que es una deuda viva— pero se cuenta aparte y
   Tesorería lo dice, para que no desaparezca en silencio. */
function cashPlanFlows(start, days){
  const dias = {};
  let fuera = 0, pasados = 0, n = 0;
  const mete = (k, cat, amt) => {
    if(!dias[k]) dias[k] = {};
    dias[k][cat] = (dias[k][cat]||0) + amt;
  };
  cashPlan().movs.forEach(m=>{
    const cat = ['cobros','gastos','inversiones','dividendos'].indexOf(String(m.cat))>=0
      ? String(m.cat) : 'gastos';
    const amt = toNum(m.amount);
    if(!amt) return;
    const d0 = parseDate(m.date); if(!d0) return;
    n++;
    if(String(m.repeat)==='month'){
      const diaPedido = d0.getDate();
      for(let k=0; k<days; k++){
        const d = addDays(start, k);
        if(daysBetween(d0, d) < 0) continue;
        const ultimo = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
        if(d.getDate() === Math.min(diaPedido, ultimo)) mete(k, cat, amt);
      }
    }else{
      const k = daysBetween(start, d0);
      if(k < 0)          pasados += amt;
      else if(k < days)  mete(k, cat, amt);
      else               fuera += amt;
    }
  });
  return {dias, fuera, pasados, n};
}

/* ═══════════════════════════════════════════════════════════════════════════
   6 · PANTALLA · lo que hay que poder VER para que el número sea auditable
   ═══════════════════════════════════════════════════════════════════════════ */
registrarEstilo(
  '.po-audit{margin-top:9px;font-size:12px;line-height:1.55}'+
  '.po-audit .lb{display:inline-block;min-width:96px;color:#6a7a80}'+
  '.po-audit .warn{color:var(--caution,#b26a00);font-weight:600}'+
  '.po-audit .bad{color:var(--stop,#c0392b);font-weight:600}'+
  '.po-audit code{font-family:var(--mono);background:rgba(0,0,0,.05);padding:1px 4px;border-radius:3px}'+
  '.cat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;margin-top:12px}'+
  '.cat-card{border:1px solid rgba(0,0,0,.09);border-radius:9px;padding:10px 12px}'+
  '.cat-card .cc-n{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:#6a7a80}'+
  '.cat-card .cc-v{font-family:var(--mono);font-size:17px;font-weight:600;margin-top:3px}'+
  '.cat-card .cc-s{font-size:11.5px;color:#6a7a80;margin-top:2px}'
);

/* El bloque auditable de un pedido: base del reparto, recepción y divisa.
   Va dentro de la ficha del pedido, que es donde se decide. */
function poAuditHTML(po){
  const b = poAuditBase(po);
  const A = poReceiptAudit(po);
  const cur = poCur(po);
  const fila = (lb, txt, cls) => '<div><span class="lb">'+lb+'</span>'+
    (cls?'<span class="'+cls+'">':'<span>')+txt+'</span></div>';
  let h = '<div class="po-audit">';
  h += fila('Flete', poFmt(po, toNum(po.freight), 2)+' · '+esc(b.texto),
            b.degradado ? 'warn' : '');
  if(A.entregas){
    const pct = A.pedidas>0 ? A.recibidas/A.pedidas*100 : 0;
    h += fila('Recepción', A.entregas+' entrega'+(A.entregas===1?'':'s')+' · '+
      num(A.recibidas)+' de '+num(A.pedidas)+' ud ('+num(pct,0)+'%) · pendientes '+num(A.pendientes),
      A.excedidas.length ? 'bad' : '');
    if(A.sinFecha.length)
      h += fila('', A.sinFecha.length+' entrega(s) sin fecha: no crean lote hasta que la tengan', 'warn');
    if(A.excedidas.length)
      h += fila('', 'recibidas más unidades de las pedidas en '+A.excedidas.length+' línea(s): el flete repartido se pasa del total', 'bad');
  }else if(po.received){
    h += fila('Recepción', 'pedido completo el '+esc(po.received)+' · sin entregas parciales declaradas');
  }
  if(cur!=='EUR') h += fila('Divisa', esc(poFxNota(po)), poFxMissing(po) ? 'bad' : '');
  const gap = poSinCalendario(po);
  if(Math.abs(gap) > 0.5)
    h += fila('Calendario', 'los vencimientos suman '+num(poPctDeclarado(po),1)+'%: '+
      (gap>0 ? fmt(gap,0)+' que la curva de caja NO gasta' : fmt(-gap,0)+' de más'), 'bad');
  const pd = poProductionDays(po);
  if(pd!==null) h += fila('Fabricación', num(pd,0)+' d'+(poProductionEnd(po)?' · cierra el '+iso(poProductionEnd(po)):''));
  h += '</div>';
  return h;
}
/* Envoltorio para poder llamar a poFreightBasis desde la plantilla sin repetir
   el cálculo tres veces por pedido. */
function poAuditBase(po){ return poFreightBasis(po); }

/* Tabla de entregas dentro del modal del pedido. */
function poReceiptRowsHTML(po){
  const recs = poReceipts(po);
  if(!recs.length)
    return '<div class="mut" style="font-size:12.5px">Sin entregas parciales. El pedido crea un solo lote por línea con la fecha de «Recibido el». '+
           'En cuanto declares una entrega, mandan las entregas: cada una es un lote con SU fecha y SUS unidades.</div>';
  return '<div class="tbl-wrap"><table class="grid"><tr><th>Entrega</th><th>Fecha</th>'+
    (po.items||[]).map((i,idx)=>'<th class="num">'+esc(i.sku||('línea '+(idx+1)))+'</th>').join('')+
    '<th class="num">Total</th><th></th></tr>'+
    recs.map((r,ri)=>'<tr><td><input type="text" value="'+esc(r.ref||('Entrega '+(ri+1)))+
        '" onchange="poRec('+ri+',\'ref\',this.value)"></td>'+
      '<td style="width:140px"><input type="date" value="'+esc(r.date||'')+'" onchange="poRec('+ri+',\'date\',this.value)"></td>'+
      (po.items||[]).map((i,idx)=>'<td class="num" style="width:80px"><input type="number" value="'+
        toNum(poReceiptQty(r,idx))+'" onchange="poRecQty('+ri+','+idx+',this.value)"></td>').join('')+
      '<td class="num mut">'+num(poReceiptUnits(r))+'</td>'+
      '<td><button class="icon-btn" onclick="poDelRec('+ri+')">✕</button></td></tr>').join('')+
    '<tr class="tot"><td class="name">Recibido</td><td></td>'+
      (po.items||[]).map((i,idx)=>'<td class="num">'+num(poReceivedUnitsOf(po,idx))+' / '+num(toNum(i.qty))+'</td>').join('')+
      '<td class="num">'+num(poReceivedUnits(po))+'</td><td></td></tr>'+
    '</table></div>';
}

/* Panel de Tesorería que no cabe en la vista congelada: las cinco categorías y
   los movimientos programados. Se cuelga al final de la sección, una sola vez.
   No se toca `src/02-views.html` porque la tabla de propiedad no le da vista
   nueva a este carril. */
function tesoreriaHost(){
  let el = document.getElementById('cashPlanHost');
  if(el) return el;
  const v = document.getElementById('view-tesoreria');
  if(!v) return null;
  el = document.createElement('div');
  el.id = 'cashPlanHost';
  v.appendChild(el);
  return el;
}
function renderCashPlan(C){
  const host = tesoreriaHost(); if(!host) return;
  const T = (C && C.meta && C.meta.totales) || {};
  const cards = CASH_CATS.map(c=>{
    const v = toNum(T[c[0]]);
    const signo = c[0]==='cobros' ? '+' : '−';
    return '<div class="cat-card"><div class="cc-n">'+c[1]+'</div>'+
           '<div class="cc-v">'+signo+' '+fmt(Math.abs(v),0)+'</div>'+
           '<div class="cc-s">'+c[2]+'</div></div>';
  }).join('');
  const neto = toNum(T.cobros) - toNum(T.mercancia) - toNum(T.gastos) - toNum(T.inversiones) - toNum(T.dividendos);
  const movs = cashPlan().movs;
  host.innerHTML =
    '<div class="panel"><div class="panel-head"><div>'+
      '<h2>Las cinco categorías, a 90 días</h2>'+
      '<p class="desc" style="margin:0">La misma curva, abierta por dónde va el dinero. Las cinco suman exactamente '+
      'la variación de saldo del periodo: si no cuadraran, alguna categoría estaría contando algo que la curva no gasta.</p>'+
    '</div></div>'+
    '<div class="cat-grid">'+cards+'</div>'+
    '<div class="assumptions" style="margin-top:14px">Variación neta de los 90 días: <strong>'+fmt(neto,0)+'</strong>'+
      ' · cobros − mercancía − gastos − inversiones − dividendos. '+
      'Mercancía no se teclea aquí: sale de los pedidos de compra, y tenerlo en dos sitios sería tener dos verdades.</div>'+
    '</div>'+
    '<div class="panel"><div class="panel-head"><div>'+
      '<h2>Movimientos programados</h2>'+
      '<p class="desc" style="margin:0">Inversiones, dividendos, cobros y gastos que no son mensuales ni salen de un pedido. '+
      'Puntuales o repetidos cada mes.</p></div>'+
      '<div class="ph-actions">'+
        CASH_PLAN_CATS.map(c=>'<button class="btn sm" onclick="cashPlanAdd(\''+c[0]+'\')">+ '+c[1]+'</button>').join('')+
      '</div></div>'+
    '<div class="tbl-wrap"><table class="grid" id="cashPlanTable">'+
      '<tr><th>Categoría</th><th>Concepto</th><th class="num">Importe</th><th>Fecha</th><th>Repite</th><th style="width:36px"></th></tr>'+
      (movs.length ? movs.map(m=>
        '<tr><td style="width:130px"><select onchange="cashPlanUpd(\''+m.id+'\',\'cat\',this.value)">'+
          CASH_PLAN_CATS.map(c=>'<option value="'+c[0]+'"'+(c[0]===m.cat?' selected':'')+'>'+c[1]+'</option>').join('')+
          '</select></td>'+
        '<td class="name"><input type="text" value="'+esc(m.concept)+'" oninput="cashPlanUpd(\''+m.id+'\',\'concept\',this.value)"></td>'+
        '<td class="num" style="width:110px"><input type="number" step="50" value="'+toNum(m.amount)+'" onchange="cashPlanUpd(\''+m.id+'\',\'amount\',this.value)"></td>'+
        '<td style="width:150px"><input type="date" value="'+esc(m.date||'')+'" onchange="cashPlanUpd(\''+m.id+'\',\'date\',this.value)"></td>'+
        '<td style="width:110px"><select onchange="cashPlanUpd(\''+m.id+'\',\'repeat\',this.value)">'+
          '<option value="once"'+(m.repeat!=='month'?' selected':'')+'>Una vez</option>'+
          '<option value="month"'+(m.repeat==='month'?' selected':'')+'>Cada mes</option></select></td>'+
        '<td><button class="icon-btn" onclick="cashPlanDel(\''+m.id+'\')">✕</button></td></tr>').join('')
        : '<tr><td colspan="6" class="name mut">Sin movimientos programados. El depósito de una máquina, una devolución de préstamo o el reparto anual de dividendos van aquí: '+
          'son los que hunden la curva un día concreto y no aparecen en ningún gasto mensual.</td></tr>')+
    '</table></div></div>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   7 · EXPORTACIÓN DE ENTREGAS
   Por la costura del registro, para no añadir otro botón «Exportar a CSV» a la
   vista de Compras (que está en 02-views.html y no es de este carril).
   ═══════════════════════════════════════════════════════════════════════════ */
function exportEntregas(){
  const filas = [];
  DB.pos.forEach(po=>{
    const sup = (DB.suppliers.filter(s=>s.id===po.supplierId)[0]||{});
    const b = poFreightBasis(po);
    const fx = poFxRate(po);
    poReceipts(po).forEach(r=>{
      (po.items||[]).forEach((i,idx)=>{
        const q = poReceiptQty(r, idx);
        if(!(q>0)) return;
        const fleteUd = poFreightShareOf(po, i);
        filas.push([po.ref||po.id, sup.name||'', r.ref||'', r.date||'', i.sku, idx+1, q,
          r2(toNum(i.unitCost)), r2(fleteUd), r2(toNum(i.unitCost)+fleteUd),
          r2(fleteUd*q), b.nombrePedido, b.nombreUsado, r2(b.total), b.unidad,
          poCur(po), fx===null ? 'SIN TIPO' : r2(fx), poCur(po)==='EUR' ? 'no' : 'sí, a mano']);
      });
    });
  });
  descargarCSV('compras-entregas',
    ['Pedido','Proveedor','Entrega','Fecha de recepción','SKU','Línea','Unidades recibidas',
     'Coste de fábrica','Flete por unidad','Coste puesto por unidad','Flete de esta entrega',
     'Reparto pedido','Reparto aplicado','Total de la base','Unidad de la base',
     'Divisa','Tipo de cambio','Tipo introducido a mano'], filas);
}
registrarExportacion('entregas', 'Entregas parciales (CSV)', exportEntregas);
