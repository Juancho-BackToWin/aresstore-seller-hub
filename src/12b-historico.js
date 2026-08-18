
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
  return H;
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
  for(let d = new Date(min.getTime()); d <= max; d = addDays(d,1)){
    const k = iso(d);
    if(cut && k <= cut) continue;
    const day = hDay(k);
    const a = agg[k] || {s:{}, cs:{}};
    day.s = a.s; day.cs = a.cs;
    if(k >= tIso) day.x = 1; else delete day.x;   // hoy siempre es un día parcial
    n++;
  }
  return {days:n, from:iso(min), to:iso(max)};
}

/* ---------- 2 · Foto de stock, fechada hoy ---------- */
function captureStock(){
  const stock = {}, byC = {};
  imp('inventory').forEach(r=>{
    const k = gv(r,'_sku','sku','sellersku'); if(!k) return;
    stock[k] = (stock[k]||0) + toNum(gv(r,'_qty','afnfulfillablequantity'));
  });
  imp('multicountry').forEach(r=>{
    const k = gv(r,'_sku','sellersku','sku'), c = countryOf(gv(r,'_country','country'));
    if(!k) return;
    if(!byC[k]) byC[k] = {};
    if(c) byC[k][c] = (byC[k][c]||0) + toNum(gv(r,'_qty','quantityforlocalfulfillment'));
    if(stock[k]===undefined) stock[k] = 0;
  });
  DB.products.forEach(p=>{ if(p.channel==='FBM' && toNum(p.fbmStock)) stock[String(p.sku)] = toNum(p.fbmStock); });
  const keys = Object.keys(stock);
  if(!keys.length) return {skus:0};
  const H = hist(), k = iso(today()), day = hDay(k);
  day.k = {};
  keys.forEach(s=>{
    const q = stock[s];
    day.k[s] = (byC[s] && Object.keys(byC[s]).length) ? [q, byC[s]] : [q];
    const o = H.obs[s] || (H.obs[s] = {n:0, z:0, last:null, lz:0});
    /* Una observación por SKU y por día. Reimportar el mismo día corrige la
       observación en lugar de añadir otra: si no, el porcentaje de rotura
       subiría solo por volver a soltar el mismo fichero. */
    const z = q<=0 ? 1 : 0;
    if(o.last !== k){ o.n++; o.z += z; o.lz = z; o.last = k; }
    else if(z !== o.lz){ o.z += z - o.lz; o.lz = z; }
  });
  return {skus:keys.length};
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
  const oos = oosDays(keys[0], keys[keys.length-1]);
  keys.forEach(k=>{
    const day = H.d[k], mk = k.slice(0,7);
    const m = H.m[mk] || (H.m[mk] = {s:{}, cs:{}, days:0, oos:{}, kEnd:null});
    m.days++;
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
  // el recuento de rotura se reparte al mes al que pertenece cada día
  Object.keys(oos).forEach(sk=>{
    const mk = keys[0].slice(0,7);
    const m = H.m[mk]; if(!m) return;
    m.oos[sk] = (m.oos[sk]||0) + oos[sk];
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
    const m0 = months[0] + '-01';
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
          cut:H.cut};
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
  const g = captureAll();
  saveDB(); refreshAll();
  toast(g.orders && g.orders.days ? ('Histórico reconstruido con '+num(g.orders.days)+' días del informe de pedidos')
                                  : 'Reconstruido con lo que hay importado ahora mismo');
}
