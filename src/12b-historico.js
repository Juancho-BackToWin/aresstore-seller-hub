
/* =========================================================================
   M0 · HISTÓRICO  ·  lo único que no se puede reconstruir después

   Los informes de Seller Central son una foto del presente, no un archivo.
   El de inventario dice cuánto stock hay HOY; mañana ese número se ha ido y
   Amazon no lo guarda. Este módulo convierte cada importación en historia
   propia, que es lo que después permite calcular velocidad de venta real,
   estacionalidad y cambios de tarifa.

   Tres decisiones que conviene entender antes de tocar nada:

   1 · NO se archivan los informes, se archivan HECHOS DIARIOS. Guardar cada
       fichero entero reventaría el almacenamiento del navegador en semanas
       —son unos 5 MB en total y un informe de pedidos ronda 1 KB por línea—
       y el fallo llegaría en forma de «ya no puedo guardar», que es la peor
       manera de perder datos. Se guarda por día y SKU: unidades, ingreso,
       impuesto, stock, precio y tarifas. Ocupa dos órdenes de magnitud menos
       y responde a las mismas preguntas.

   2 · El informe de pedidos trae SU PROPIO pasado (30, 90 o 120 días según
       lo que pidas). La primera importación no empieza el histórico desde
       hoy: lo rellena hacia atrás. Por eso el rango cubierto se SOBRESCRIBE
       en lugar de sumarse — si no, reimportar un mes duplicaría las ventas.

   3 · El stock y las tarifas no tienen pasado en el informe: son de hoy y se
       fechan hoy. De ahí que la resolución del histórico de inventario sea
       la de tu costumbre de importar. Con una importación semanal se sabe el
       stock de un día de cada siete, y eso se dice en la interfaz en lugar
       de disimularlo.
   ========================================================================= */

const HIST_DETAIL_DAYS = 90;      // detalle diario; más atrás se compacta a mes
const HIST_LOG_MAX     = 300;     // entradas del registro de importaciones
const HIST_BACKUP_DAYS = 7;       // aviso de copia de seguridad

function hist(){
  if(!DB.history || typeof DB.history!=='object') DB.history = {};
  const H = DB.history;
  if(!H.v) H.v = 1;
  if(!H.d || typeof H.d!=='object') H.d = {};   // detalle por día
  if(!H.m || typeof H.m!=='object') H.m = {};   // meses compactados
  if(!Array.isArray(H.log)) H.log = [];         // registro de importaciones
  if(!H.obs || typeof H.obs!=='object') H.obs = {}; // observaciones de stock por SKU
  if(!H.bk || typeof H.bk!=='object') H.bk = {last:null};
  if(H.cut===undefined) H.cut = null;           // fecha hasta la que está compactado
  if(!Array.isArray(H.rev)) H.rev = [];         // reescrituras de lo ya archivado
  return H;
}
const HIST_REV_MAX = 200;
/* ---------- Constancia de que algo ya archivado ha cambiado ----------------
   El histórico es el único daño irreversible de este hub. Sobrescribir el rango
   que cubre el informe de pedidos es deliberado —si no, reimportar un mes
   duplicaría las ventas— pero hacerlo EN SILENCIO no lo es. Un arreglo de
   fechas como B3 mueve pedidos de un día al siguiente: sin este registro, la
   serie de ayer cambia y no aparece en ninguna pantalla, que es exactamente
   cómo un número deja de ser fiable sin que nadie se entere.

   La foto de stock es distinta y se trata distinto: Amazon no guarda el stock
   de días pasados, así que una foto archivada no se puede volver a medir. Esa
   NO se sobrescribe nunca; el conflicto se anota y gana la que ya estaba. */
function logRevision(k, que, antes, ahora, nota){
  const H = hist();
  H.rev.unshift({t:new Date().toISOString(), k, q:que, a:antes, b:ahora, n:nota||''});
  if(H.rev.length > HIST_REV_MAX) H.rev.length = HIST_REV_MAX;
  return H.rev[0];
}
function hDay(k){ const H=hist(); return H.d[k] || (H.d[k] = {}); }
function r2(x){ return Math.round((x||0)*100)/100; }

/* ---------- Registro de importaciones ---------- */
function logImport(repId, label, rows, file, how){
  const H = hist();
  H.log.unshift({t:new Date().toISOString(), r:repId, l:label, n:rows, f:file, h:how||''});
  if(H.log.length > HIST_LOG_MAX) H.log.length = HIST_LOG_MAX;
}

/* ---------- 1 · Ventas por día y SKU, desde el informe de pedidos ----------
   Se recorre el informe COMPLETO, sin el filtro de periodo ni el de país de
   la interfaz: el histórico es del negocio, no de lo que estés mirando. */
function captureOrders(){
  const rows = salesRows({from:null, country:'ALL'});
  if(!rows.length) return {days:0};
  const H = hist();
  let min=null, max=null;
  const agg = {};
  rows.forEach(r=>{
    if(!min || r.date<min) min = r.date;
    if(!max || r.date>max) max = r.date;
    const k = iso(r.date);
    const a = agg[k] || (agg[k] = {s:{}, cs:{}});
    const sk = String(r.sku||'—');
    const e = a.s[sk] || (a.s[sk] = [0,0,0]);
    e[0] += r.qty; e[1] += r.revenue; e[2] += r.tax;
    if(r.country){
      const c = a.cs[r.country] || (a.cs[r.country] = [0,0]);
      c[0] += r.qty; c[1] += r.revenue;
    }
  });
  Object.keys(agg).forEach(k=>{
    const a = agg[k];
    Object.keys(a.s).forEach(sk=>{ a.s[sk][1]=r2(a.s[sk][1]); a.s[sk][2]=r2(a.s[sk][2]); });
    Object.keys(a.cs).forEach(c=>{ a.cs[c][1]=r2(a.cs[c][1]); });
  });
  /* Se sobrescribe todo el rango cubierto por el informe, incluidos los días
     sin ninguna venta: un día a cero es un dato, no un hueco. Lo que ya está
     compactado no se reabre. */
  const cut = H.cut || '';
  const tIso = iso(today());
  let n = 0;
  const revisiones = [];
  for(let d = new Date(min.getTime()); d <= max; d = addDays(d,1)){
    const k = iso(d);
    if(cut && k <= cut) continue;
    const day = hDay(k);
    const a = agg[k] || {s:{}, cs:{}};
    /* Un día que ya estaba archivado y que cambia se anota antes de cambiarlo.
       Es lo que hace visible el arreglo de B3: al dejar de tirar el huso, los
       pedidos de 22:00–24:00 UTC se mueven al día siguiente y dos días de la
       serie cambian de total. La reimportación idéntica no anota nada, porque
       no cambia nada. */
    if(day.s){
      const antes = Object.keys(day.s).reduce((x,sk)=>x+(day.s[sk][0]||0),0);
      const ahora = Object.keys(a.s).reduce((x,sk)=>x+(a.s[sk][0]||0),0);
      if(antes!==ahora) revisiones.push([k, antes, ahora]);
    }
    day.s = a.s; day.cs = a.cs;
    if(k >= tIso) day.x = 1; else delete day.x;   // hoy siempre es un día parcial
    n++;
  }
  revisiones.forEach(r=>logRevision(r[0], 'ventas', r[1], r[2],
    'el informe reimportado trae otro total para un día ya archivado'));
  return {days:n, from:iso(min), to:iso(max), revisiones:revisiones.length};
}

/* =========================================================================
   B · §0 y B3 · EL CRUCE DE LOS TRES INFORMES DE INVENTARIO

   Medido sobre los ficheros reales: el informe de «Gestión de inventario de
   Logística de Amazon» **no trae el catálogo completo**. El de *Inventario
   multipaís* declara más referencias y más unidades. Las cifras concretas
   están en el documento del proyecto, no aquí: el repositorio es público.

   Por qué esto va antes que cualquier otra cosa de la sesión B: `captureStock()`
   archiva la foto y alimenta `H.obs`, el contador de roturas, que **no se
   corrige reimportando**. Un cero por «este informe no trae el SKU» es
   indistinguible en pantalla de un cero por «no queda stock» —el mismo error
   que A7 con las jurisdicciones—, y deja a esas referencias en rotura
   permanente con la velocidad de venta inflada, que es justo el número con el
   que se decide cuánto reponer.

   `stockCruce()` no promedia ni elige un informe ganador: dice qué declara cada
   uno, cuánto no cuadra, y qué SKUs faltan en cuál.
   ========================================================================= */
function stockCruce(){
  const G = {}, M = {}, S = {}, byC = {}, paises = {};
  imp('inventory').forEach(r=>{
    const k = gv(r,'_sku','sku','sellersku'); if(!k) return;
    const g = G[k] || (G[k] = {disp:0, res:0, inv:0, tr:0, unsell:0, total:0});
    g.disp   += toNum(gv(r,'_qty','afnfulfillablequantity'));
    g.res    += toNum(r.afnreservedquantity);
    g.inv    += toNum(r.afnresearchingquantity);
    g.tr     += toNum(r.afnfctransferquantity);
    g.unsell += toNum(r.afnunsellablequantity);
    g.total  += toNum(r.afntotalquantity);
  });
  imp('multicountry').forEach(r=>{
    const k = gv(r,'_sku','sellersku','sku'); if(!k) return;
    const c = countryOf(gv(r,'_country','country'));
    const q = toNum(gv(r,'_qty','quantityforlocalfulfillment'));
    M[k] = (M[k]||0) + q;
    if(c){ (byC[k] || (byC[k]={}))[c] = ((byC[k]||{})[c]||0) + q;
           paises[c] = (paises[c]||0) + q; }
  });
  imp('planning').forEach(r=>{ const k = r.sku; if(!k) return;
    S[k] = (S[k]||0) + toNum(r.available); });

  const skus = Array.from(new Set(Object.keys(G).concat(Object.keys(M)).concat(Object.keys(S)))).sort();
  const filas = skus.map(k=>{
    const g = G[k] || null;
    /* «no disponible pero presente»: existe, está en el almacén y no se puede
       vender ahora mismo. No es cero y no es disponible. */
    const noDisp = g ? (g.res + g.inv + g.tr + g.unsell) : 0;
    return {sku:k,
      enGestion: !!g, enMulti: M[k]!==undefined, enSalud: S[k]!==undefined,
      disp: g ? g.disp : null, noDisp: g ? noDisp : null, total: g ? g.total : null,
      multi: M[k]!==undefined ? M[k] : null,
      salud: S[k]!==undefined ? S[k] : null,
      porPais: byC[k] || {}};
  });
  const soloMulti = filas.filter(f=>!f.enGestion && f.enMulti);
  const soloGestion = filas.filter(f=>f.enGestion && !f.enMulti);
  const totGestion = filas.reduce((a,f)=>a+(f.total||0),0);
  const totDisp    = filas.reduce((a,f)=>a+(f.disp||0),0);
  const totNoDisp  = filas.reduce((a,f)=>a+(f.noDisp||0),0);
  const totMulti   = filas.reduce((a,f)=>a+(f.multi||0),0);
  /* Cuánto de la diferencia se explica por SKUs ausentes y cuánto por unidades
     que existen pero no son «disponibles en un país». Son dos causas de signo
     contrario y sumarlas en un solo número las oculta. */
  const ausentes   = soloMulti.reduce((a,f)=>a+(f.multi||0),0);
  /* Lo que NO se explica, que es lo único que debe alarmar.

     Lo que SÍ se explica: el multipaís cuenta las unidades disponibles EN UN
     PAÍS, así que deja fuera lo reservado, lo que está en investigación y lo no
     vendible, pero SÍ cuenta lo que viaja entre centros. Lo que queda después
     de eso es lo que hay que mirar. */
  let sinExplicar = 0;
  filas.forEach(f=>{
    if(!f.enGestion || !f.enMulti) return;
    const g = G[f.sku];
    const esperado = f.total - g.res - g.inv - g.unsell;   // la transferencia sí cuenta
    sinExplicar += (f.multi - esperado);
  });
  return {
    filas, soloMulti, soloGestion,
    skusGestion: filas.filter(f=>f.enGestion).length,
    skusMulti:   filas.filter(f=>f.enMulti).length,
    skusSalud:   filas.filter(f=>f.enSalud).length,
    totGestion, totDisp, totNoDisp, totMulti, ausentes,
    porPais: paises,
    /* La diferencia bruta entre los dos informes, y la parte de ella que NO
       tiene explicación. La primera alarma a quien no sepa por qué; la segunda
       es la que de verdad hay que mirar. */
    diferencia: totMulti - totGestion,
    descuadre: sinExplicar,
    noDisponibleNoContado: totNoDisp - filas.reduce((a,f)=>a+((f.enGestion&&f.enMulti&&G[f.sku])?G[f.sku].tr:0),0),
    hayGestion: Object.keys(G).length>0, hayMulti: Object.keys(M).length>0,
    haySalud: Object.keys(S).length>0
  };
}

/* =========================================================================
   B1 · LA FOTO DE STOCK DEJA DE FECHARSE CON EL DÍA DE HOY

   `captureStock()` sellaba la foto con `iso(today())`. Un informe de hace dos
   semanas subido hoy se archivaba como de hoy, y borraba del histórico las
   roturas de los días intermedios. Es el único daño irreversible del hub:
   `H.obs` no se corrige reimportando.

   La regla es la de `poLotDate()`, que se niega a crear un lote sin fecha de
   recepción:
     1 · si está el informe de Salud del inventario, la fecha es su
         `snapshot-date` — y NO `Inventory age snapshot date`, que va dos días
         por detrás y es otra cosa (el corte de antigüedad, no la foto);
     2 · si no, se pregunta, y no se archiva sin respuesta. Ni el informe de
         gestión ni el multipaís traen NINGUNA columna de fecha —confirmado
         enumerando las 26 y las 6—, así que adivinarla es inventarse el eje
         temporal del histórico entero;
     3 · nunca una fecha futura, y si es anterior a la última archivada se dice
         que se está reescribiendo el pasado.
   ========================================================================= */
function stockSnapshotDate(){
  /* 1 · la del informe que sí la trae */
  let d = null;
  imp('planning').forEach(r=>{
    const v = String(r.snapshotdate||'').trim();
    if(!v) return;
    const p = parseDate(v); if(!p) return;
    const k = iso(p);
    if(!d || k > d) d = k;                 // si hubiera varias, la más reciente
  });
  if(d) return {k:d, src:'planning', why:'`snapshot-date` del informe de Salud del inventario'};
  /* 2 · la que haya dicho Juancho al importar */
  const m = (DB.settings && DB.settings.stockDate) ? String(DB.settings.stockDate).trim() : '';
  if(m){ const p = parseDate(m); if(p) return {k:iso(p), src:'manual', why:'fecha indicada al importar'}; }
  /* 3 · no hay fecha: no se archiva */
  return {k:null, src:'ninguna',
          why:'ni el informe de gestión ni el multipaís traen columna de fecha, y no se ha indicado ninguna'};
}

/* ---------- 2 · Foto de stock, fechada con el día del INFORME ---------- */
function captureStock(){
  const C = stockCruce();
  const fecha = stockSnapshotDate();
  const stock = {}, noDisp = {}, total = {}, byC = {};
  C.filas.forEach(f=>{
    /* Un SKU que solo viene en el multipaís NO vale cero: vale lo que el
       multipaís declara. Y un SKU que solo viene en el de gestión conserva sus
       tres números. Lo que no se sabe se deja sin archivar, no a cero. */
    if(f.enGestion){ stock[f.sku] = f.disp; noDisp[f.sku] = f.noDisp; total[f.sku] = f.total; }
    else if(f.enMulti){ stock[f.sku] = f.multi; noDisp[f.sku] = 0; total[f.sku] = f.multi; }
    else if(f.enSalud){ stock[f.sku] = f.salud; noDisp[f.sku] = 0; total[f.sku] = f.salud; }
    if(Object.keys(f.porPais).length) byC[f.sku] = f.porPais;
  });
  DB.products.forEach(p=>{ if(p.channel==='FBM' && toNum(p.fbmStock)){
    stock[String(p.sku)] = toNum(p.fbmStock); noDisp[String(p.sku)] = 0;
    total[String(p.sku)] = toNum(p.fbmStock); } });
  const keys = Object.keys(stock);
  if(!keys.length) return {skus:0};

  /* B1 · sin fecha no se archiva. Y se dice, en vez de archivar con la de hoy
     y que nadie se entere hasta que el contador de roturas ya esté sucio. */
  if(!fecha.k) return {skus:0, sinFecha:true, motivo:fecha.why, cruce:C};
  const hoy = iso(today());
  if(fecha.k > hoy) return {skus:0, sinFecha:true, cruce:C,
    motivo:'la fecha de la foto ('+fecha.k+') es posterior a hoy ('+hoy+')'};

  const H = hist(), k = fecha.k, day = hDay(k);
  /* Si ya hay fotos archivadas después de esta, se está reescribiendo el
     pasado. Se hace —el informe es el informe— pero se dice. */
  const posteriores = Object.keys(H.d).filter(x=>x>k && H.d[x] && H.d[x].k).length;
  day.k = {};
  keys.forEach(s=>{
    const q = stock[s];
    /* Tres números, no uno: disponible, no disponible pero presente, y total.
       Antes se archivaba solo `afn-fulfillable-quantity` y las unidades que
       existen y están en el almacén sin poder venderse desaparecían del
       histórico. */
    const nd = noDisp[s]||0, tt = total[s]!=null ? total[s] : q;
    const c  = (byC[s] && Object.keys(byC[s]).length) ? byC[s] : null;
    day.k[s] = c ? [q, c, nd, tt] : [q, null, nd, tt];
    const o = H.obs[s] || (H.obs[s] = {n:0, z:0, last:null, lz:0});
    /* Una observación por SKU y por día. Reimportar el mismo día corrige la
       observación en lugar de añadir otra: si no, el porcentaje de rotura
       subiría solo por volver a soltar el mismo fichero. */
    const z = q<=0 ? 1 : 0;
    if(o.last !== k){ o.n++; o.z += z; o.lz = z; o.last = k; }
    else if(z !== o.lz){ o.z += z - o.lz; o.lz = z; }
  });
  return {skus:keys.length, fecha:k, fuente:fecha.src, porque:fecha.why,
          reescribe:posteriores, cruce:C,
          disp:C.totDisp, noDisp:C.totNoDisp, total:C.totGestion, multi:C.totMulti,
          ausentes:C.soloMulti.map(f=>f.sku)};
}

/* ---------- 3 · Precio y tarifas vigentes, fechadas hoy ----------
   Es lo que después permite detectar que Amazon te ha cambiado la tarifa de
   un ASIN sin avisar (M5.4), que es dinero que no se recupera si no se ve. */
function captureFees(){
  const rows = imp('fees');
  if(!rows.length) return {skus:0};
  const day = hDay(iso(today()));
  const p = {}, f = {};
  rows.forEach(r=>{
    const sk = gv(r,'_sku','sku','sellersku'); if(!sk) return;
    const price = toNum(gv(r,'_price','yourprice','salesprice'));
    const fba   = toNum(gv(r,'_fba','expectedfulfillmentfeeperunit'));
    const ref   = toNum(gv(r,'_referral','estimatedreferralfeeperunit'));
    if(price) p[sk] = r2(price);
    if(fba || ref) f[sk] = [r2(fba), r2(ref)];
  });
  if(Object.keys(p).length) day.p = p;
  if(Object.keys(f).length) day.f = f;
  return {skus:Object.keys(f).length || Object.keys(p).length};
}

/* ---------- Entrada única: se llama después de cada importación ---------- */
function captureHistory(rep, count, file, how){
  const got = {orders:null, stock:null, fees:null, err:null};
  try{
    logImport(rep.id, rep.label, count, file, how);
    if(rep.id==='orders')                                   got.orders = captureOrders();
    if(rep.id==='inventory' || rep.id==='multicountry')      got.stock  = captureStock();
    if(rep.id==='fees')                                     got.fees   = captureFees();
    compactHistory();
  }catch(e){ got.err = e.message; console.warn('histórico', e); }
  return got;
}
/* Rehace el histórico con todo lo que haya importado ahora mismo. Se usa al
   cargar los datos de ejemplo y desde el botón de reconstrucción. */
function captureAll(){
  const out = {};
  try{ out.orders = captureOrders(); }catch(e){}
  try{ out.stock  = captureStock();  }catch(e){}
  try{ out.fees   = captureFees();   }catch(e){}
  try{ compactHistory(); }catch(e){}
  return out;
}

/* =========================================================================
   DÍAS SIN STOCK
   No se inventa nada: se arrastra hacia delante la última foto conocida de
   stock y un día cuenta como roto solo si (a) la última foto estaba a cero y
   (b) ese día no se vendió ni una unidad. Las dos condiciones juntas. Con una
   sola no basta: un stock a cero con ventas significa que la foto es vieja, y
   un día sin ventas con stock es simplemente un día flojo.
   ========================================================================= */
function stockSeries(){
  const H = hist();
  const days = Object.keys(H.d).sort();
  const carry = {};                       // sku → último stock conocido
  const out = {};                         // fecha → {sku: stock arrastrado}
  // punto de partida: el cierre del último mes compactado
  const months = Object.keys(H.m).sort();
  for(let i=0;i<months.length;i++){
    const ke = H.m[months[i]].kEnd;
    if(ke && ke.k) Object.keys(ke.k).forEach(s=>carry[s]=ke.k[s][0]);
  }
  days.forEach(k=>{
    const day = H.d[k];
    if(day.k) Object.keys(day.k).forEach(s=>carry[s] = day.k[s][0]);
    out[k] = Object.assign({}, carry);
  });
  return {days, byDay:out};
}
/* Días sin stock por SKU dentro de un rango de fechas (ambas inclusive). */
function oosDays(fromK, toK){
  const H = hist(), S = stockSeries(), res = {};
  S.days.forEach(k=>{
    if(fromK && k < fromK) return;
    if(toK && k > toK) return;
    const day = H.d[k];
    if(day.x) return;                      // día parcial: no cuenta ni a favor ni en contra
    const carried = S.byDay[k];
    Object.keys(carried).forEach(s=>{
      if(carried[s] > 0) return;
      const sold = (day.s && day.s[s]) ? day.s[s][0] : 0;
      if(sold > 0) return;
      res[s] = (res[s]||0) + 1;
    });
  });
  return res;
}
/* Velocidad de venta real: unidades entre los días que SÍ tuviste stock.
   Es el detalle que más cambia una decisión de reposición y el motivo por el
   que M0 va antes que M2. */
function velocityStats(windowDays){
  const H = hist();
  const w = windowDays || 30;
  const toK = iso(addDays(today(), -1));        // hoy es parcial, se excluye
  const fromK = iso(addDays(today(), -w));
  const keys = Object.keys(H.d).filter(k=>k>=fromK && k<=toK && !H.d[k].x).sort();
  const oos = oosDays(fromK, toK);
  const units = {}, skus = {};
  keys.forEach(k=>{
    const s = H.d[k].s || {};
    Object.keys(s).forEach(sk=>{ units[sk] = (units[sk]||0) + s[sk][0]; skus[sk]=1; });
  });
  Object.keys(oos).forEach(sk=>skus[sk]=1);
  const observed = keys.length;
  return Object.keys(skus).map(sk=>{
    const u = units[sk]||0, z = Math.min(oos[sk]||0, observed);
    const withStock = observed - z;
    return {sku:sk, units:u, observed, oos:z,
            withStock, simple: observed>0 ? u/observed : 0,
            real: withStock>0 ? u/withStock : 0,
            lift: (observed>0 && withStock>0 && u>0) ? (u/withStock)/(u/observed) : 1};
  }).sort((a,b)=>b.units-a.units);
}

/* Primera venta archivada de cada SKU, en clave aaaa-mm-dd.

   Es lo que permite a invStats() distinguir un SKU RECIÉN LANZADO —cuya
   velocidad hay que medir desde su primera venta, D1— de uno viejo que
   simplemente lleva semanas sin vender. Sin esta distinción, estrechar la
   ventana convierte una unidad vendida anteayer en 0,5 ud/día y manda comprar
   un contenedor. Los meses compactados cuentan con su primer día real
   archivado, que es lo único que queda de ellos. */
function primerasVentasHistoricas(){
  const H = hist(), out = {};
  const anota = (sk, k)=>{ if(!out[sk] || k<out[sk]) out[sk]=k; };
  Object.keys(H.d).forEach(k=>{
    const s = H.d[k].s || {};
    Object.keys(s).forEach(sk=>{ if(s[sk][0]>0) anota(sk, k); });
  });
  Object.keys(H.m).forEach(mk=>{
    const m = H.m[mk], s = m.s || {};
    const k = m.first || (mk + '-01');
    Object.keys(s).forEach(sk=>{ if(s[sk][0]>0) anota(sk, k); });
  });
  return out;
}

/* ---------- D5 · la foto de stock lleva la fecha en que se MIDIÓ -----------

   `captureStock()` fecha la foto HOY, y está bien: en una importación normal el
   fichero se acaba de descargar. Pero «Reconstruir desde lo importado» vuelve a
   archivar una foto que puede llevar semanas en el navegador, y la refecha como
   de hoy. Consecuencias medidas sobre la mecánica de este módulo: los días
   entre la foto real y hoy pierden su stock arrastrado, `oosDays()` deja de ver
   una rotura que sí hubo, y `velocityStats()` devuelve la media simple
   disfrazada de velocidad real. Un número creíble y falso, y encima sobre el
   histórico, que no se puede volver a pedir.

   Esta función mueve la foto que `captureStock()` acaba de dejar en el día de
   hoy al día en que de verdad se midió. Si ese día YA TIENE una foto
   archivada, no la pisa: gana la que estaba —es una medición que Amazon no
   conserva en ningún sitio— y el conflicto queda anotado. */
function refecharFotoStock(destino){
  const H = hist(), kHoy = iso(today());
  const day = H.d[kHoy];
  if(!day || !day.k) return {movida:0, motivo:'no hay foto de hoy que mover'};
  const skus = Object.keys(day.k);
  const descontarObs = ()=>skus.forEach(s=>{
    const o = H.obs[s];
    if(o && o.last===kHoy){ o.n=Math.max(0,o.n-1); o.z=Math.max(0,o.z-(o.lz||0)); o.last=null; o.lz=0; }
  });
  const limpiarHoy = ()=>{ delete day.k; if(!Object.keys(day).length) delete H.d[kHoy]; };

  if(!destino){
    /* Nada se archiva sin saber de qué día es. */
    descontarObs(); limpiarHoy();
    logRevision(kHoy, 'foto de stock', skus.length, 0,
      'no consta la fecha de descarga del informe de inventario: la foto no se archiva');
    return {movida:0, motivo:'sin fecha de medición'};
  }
  const kDest = iso(destino);
  if(kDest === kHoy) return {movida:0, motivo:'la foto ya es de hoy'};
  if(H.cut && kDest <= H.cut){
    descontarObs(); limpiarHoy();
    logRevision(kDest, 'foto de stock', null, skus.length,
      'el '+kDest+' ya está compactado y no se reabre');
    return {movida:0, motivo:'compactado'};
  }
  if(H.d[kDest] && H.d[kDest].k){
    descontarObs(); limpiarHoy();
    logRevision(kDest, 'foto de stock', Object.keys(H.d[kDest].k).length, skus.length,
      'ya había una foto archivada ese día y no se reescribe: Amazon no guarda el stock de días pasados');
    return {movida:0, motivo:'ya archivada', conflicto:true};
  }
  const dest = hDay(kDest);
  dest.k = day.k;
  skus.forEach(s=>{ const o = H.obs[s]; if(o && o.last===kHoy) o.last = kDest; });
  limpiarHoy();
  logRevision(kDest, 'foto de stock', null, skus.length,
    'foto refechada al día en que se descargó el informe, no al de la reconstrucción');
  return {movida:skus.length, kDest};
}

/* =========================================================================
   COMPACTACIÓN
   El detalle día a día se resume a mes a partir de los 90 días. Antes de
   borrar nada se congela el recuento de días sin stock, porque después ya no
   se puede recalcular.
   ========================================================================= */
function compactHistory(keepDays){
  const H = hist();
  const keep = keepDays || HIST_DETAIL_DAYS;
  const limit = iso(addDays(today(), -keep));
  const keys = Object.keys(H.d).filter(k=>k < limit).sort();
  if(!keys.length) return 0;
  /* La rotura se cuenta MES A MES, sobre el rango de cada mes. Antes se contaba
     una vez sobre todo el tramo y se volcaba entera en `keys[0].slice(0,7)`,
     que es siempre el primer mes: 110 días de rotura acabaron apilados en un
     mes que solo tenía 2 días archivados. El comentario decía que se repartía;
     el código tomaba el primer mes dentro del bucle. */
  const porMes = {};
  keys.forEach(k=>{ const mk=k.slice(0,7); (porMes[mk]||(porMes[mk]=[])).push(k); });
  const oosMes = {};
  Object.keys(porMes).forEach(mk=>{
    const ks = porMes[mk];
    oosMes[mk] = oosDays(ks[0], ks[ks.length-1]);
  });
  keys.forEach(k=>{
    const day = H.d[k], mk = k.slice(0,7);
    const m = H.m[mk] || (H.m[mk] = {s:{}, cs:{}, days:0, oos:{}, kEnd:null});
    m.days++;
    /* El primer día REAL archivado de este mes. Sin él, `historyStats` tomaba
       el día 1 del mes y se inventaba hasta 30 días de historia: el KPI decía
       «141 días desde el 2026-04-01» cuando el primer dato era del 20 de abril
       y eran 120. Un número falso en el titular del módulo que existe
       precisamente para ser fiable. */
    if(!m.first || k < m.first) m.first = k;
    Object.keys(day.s||{}).forEach(sk=>{
      const e = m.s[sk] || (m.s[sk] = [0,0,0]), v = day.s[sk];
      e[0]+=v[0]; e[1]=r2(e[1]+v[1]); e[2]=r2(e[2]+v[2]);
    });
    Object.keys(day.cs||{}).forEach(c=>{
      const e = m.cs[c] || (m.cs[c] = [0,0]), v = day.cs[c];
      e[0]+=v[0]; e[1]=r2(e[1]+v[1]);
    });
    if(day.k) m.kEnd = {d:k, k:day.k};
    delete H.d[k];
  });
  // cada mes se lleva su propia rotura, contada sobre sus propios días
  Object.keys(oosMes).forEach(mk=>{
    const m = H.m[mk]; if(!m) return;
    Object.keys(oosMes[mk]).forEach(sk=>{
      m.oos[sk] = (m.oos[sk]||0) + oosMes[mk][sk];
    });
  });
  H.cut = keys[keys.length-1];
  return keys.length;
}

/* =========================================================================
   ESTADO Y TAMAÑO
   ========================================================================= */
function historyStats(){
  const H = hist();
  const days = Object.keys(H.d).sort();
  const months = Object.keys(H.m).sort();
  let first = days[0] || null;
  if(months.length){
    /* El primer día real del mes más antiguo, no su día 1. `m.first` lo escribe
       compactHistory; para historiales compactados antes de que existiera, el
       día 1 es lo único que hay y se sigue usando como último recurso. */
    const m0 = H.m[months[0]].first || (months[0] + '-01');
    if(!first || m0 < first) first = m0;
  }
  const span = first ? daysBetween(parseDate(first), today()) + 1 : 0;
  const withStock = days.filter(k=>H.d[k].k).length;
  const withFees  = days.filter(k=>H.d[k].f).length;
  let units=0, rev=0;
  days.forEach(k=>{ const s=H.d[k].s||{}; Object.keys(s).forEach(sk=>{ units+=s[sk][0]; rev+=s[sk][1]; }); });
  months.forEach(mk=>{ const s=H.m[mk].s||{}; Object.keys(s).forEach(sk=>{ units+=s[sk][0]; rev+=s[sk][1]; }); });
  let bytes = 0; try{ bytes = JSON.stringify(H).length; }catch(e){}
  let dbBytes = 0; try{ dbBytes = JSON.stringify(DB).length; }catch(e){}
  return {first, span, days:days.length, months:months.length, withStock, withFees,
          units, rev:r2(rev), bytes, dbBytes, log:H.log.length,
          backup:H.bk.last, backupAge: H.bk.last ? daysBetween(new Date(H.bk.last), today()) : null,
          cut:H.cut, revisiones:(H.rev||[]).length};
}
function backupDue(){
  const s = historyStats();
  if(!s.days && !s.months) return 0;
  if(s.backupAge===null) return 999;
  return s.backupAge >= HIST_BACKUP_DAYS ? s.backupAge : 0;
}
function markBackup(){ hist().bk.last = new Date().toISOString(); saveDB(); }

/* Serie diaria lista para pintar, rellenando los huecos con cero. */
function historySeries(nDays){
  const H = hist();
  const n = nDays || 90;
  const out = [];
  for(let i=n-1; i>=0; i--){
    const d = addDays(today(), -i), k = iso(d);
    const day = H.d[k];
    let u=0, r=0;
    if(day && day.s) Object.keys(day.s).forEach(sk=>{ u+=day.s[sk][0]; r+=day.s[sk][1]; });
    out.push({k, d, units:u, rev:r2(r), has:!!day, partial:!!(day&&day.x), stock:!!(day&&day.k)});
  }
  return out;
}

function wipeHistory(){
  if(!confirm('Se borra TODO el histórico: ventas por día, fotos de stock y registro de importaciones.\n\n'+
              'Esto no se puede deshacer y no se puede reconstruir descargando informes otra vez, porque Amazon '+
              'no guarda el stock de días pasados. Descarga antes una copia de seguridad.\n\n¿Seguro?')) return;
  DB.history = {v:1, d:{}, m:{}, log:[], obs:{}, cut:null, bk:{last:null}};
  saveDB(); refreshAll(); toast('Histórico borrado');
}
function rebuildHistory(){
  /* D5 · la fecha de la foto se decide ANTES de reconstruir, con
     stockSnapshotDate(), que la saca de cuándo se importó el informe. Si no
     consta, no se archiva ninguna foto: nada entra en el histórico sin saber de
     qué día es. `captureStock()` está congelada y sigue fechando hoy; lo que
     hace esta función es corregir la fecha después, sin tocarla. */
  /* INTEGRACIÓN · con la entrega del 6-sep, `captureStock()` YA archiva en la
     fecha del informe y se niega a archivar sin ella, así que el refechado de
     después es una red y no el camino principal: si la foto quedó bien puesta,
     `refecharFotoStock()` no encuentra nada de hoy que mover y no hace nada.
     Se conserva porque sigue sirviendo para arreglar fotos ya archivadas mal. */
  const snapF = (typeof stockSnapshotDate==='function') ? stockSnapshotDate() : null;
  const snap = (snapF && snapF.k) ? parseDate(snapF.k) : null;
  const g = captureAll();
  let ref = null;
  try{ ref = refecharFotoStock(snap); }catch(e){ console.warn('refechado', e); }
  compactHistory();
  saveDB(); refreshAll();
  let msg = g.orders && g.orders.days
    ? 'Histórico reconstruido con '+num(g.orders.days)+' días del informe de pedidos'
    : 'Reconstruido con lo que hay importado ahora mismo';
  if(ref && ref.movida) msg += ' · foto de stock fechada el '+ref.kDest+', no hoy';
  else if(ref && ref.motivo==='sin fecha de medición') msg += ' · sin foto de stock: no consta de qué día es';
  else if(ref && ref.conflicto) msg += ' · la foto de ese día ya estaba archivada y no se ha reescrito';
  if(g.orders && g.orders.revisiones) msg += ' · '+num(g.orders.revisiones)+' día(s) ya archivados han cambiado';
  toast(msg);
}
