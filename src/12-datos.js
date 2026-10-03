
/* =========================================================================
   1 · ESTADO Y PERSISTENCIA
   ========================================================================= */
const STORE_KEY = 'aresstore_hub_v3';
let storageOK = true, memDB = null;

function blankDB(){
  const comp = {};
  COUNTRIES.forEach(c=>comp[c.code]={active:c.storage&&['DE','FR','IT','ES'].indexOf(c.code)>=0,
    vatReg:false, vatCost:c.vatCost, oss:false, epr:false, eprDate:'', notes:''});
  return {
    v:'0.3',
    settings:{ targets:Object.assign({},TARGET),
               cash:{start:5000, cycle:14, reserve:15, vat:21, ppcDaily:0},
               /* M1.1 · cómo se costea cada venta. El detalle, en 12c-lotes.js */
               costMethod:'period' },
    products:[], suppliers:[], pos:[], expenses:[],
    compliance:comp, saved:[], imports:{},
    /* M0 · lo único que no se puede reconstruir descargando informes otra vez.
       Estructura y normalización en 12b-historico.js (hist()). */
    history:{v:1, d:{}, m:{}, log:[], obs:{}, cut:null, bk:{last:null}}
  };
}
let DB = blankDB();

(function testStorage(){
  try{ localStorage.setItem('__t','1'); localStorage.removeItem('__t'); }
  catch(e){ storageOK=false; const b=document.getElementById('storageBanner'); if(b) b.style.display='block'; }
})();
function loadDB(){
  if(!storageOK) return memDB || blankDB();
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return blankDB();
    const d = JSON.parse(raw);
    const base = blankDB();
    return Object.assign(base, d, {settings:Object.assign(base.settings, d.settings||{})});
  }catch(e){ return blankDB(); }
}
function saveDB(){
  DB.settings.targets = TARGET;
  if(!storageOK){ memDB = DB; return false; }
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); return true; }
  catch(e){
    /* Lo que crece sin parar es el histórico. Antes de rendirse y degradar a
       memoria —que es como se pierden los datos sin enterarse— se compacta el
       detalle diario a 30 días y se reintenta una vez. */
    try{
      if(typeof compactHistory==='function' && compactHistory(30)>0){
        localStorage.setItem(STORE_KEY, JSON.stringify(DB));
        if(typeof toast==='function') toast('El almacenamiento estaba lleno: he compactado el histórico a 30 días de detalle. Descarga una copia de seguridad.');
        return true;
      }
    }catch(e2){}
    storageOK=false; memDB=DB;
    const b=document.getElementById('storageBanner'); if(b) b.style.display='block';
    toast('El navegador ya no acepta guardar. Descarga una copia antes de cerrar.');
    return false;
  }
}
const uid = ()=> Math.random().toString(36).slice(2,9);

/* =========================================================================
   2 · UTILIDADES
   ========================================================================= */
function fmt(x,d){ if(!isFinite(x)||x===null) return '—';
  return (x<0?'-':'')+'€'+Math.abs(x).toLocaleString('es-ES',{minimumFractionDigits:d==null?2:d,maximumFractionDigits:d==null?2:d}); }
function num(x,d){ if(!isFinite(x)||x===null) return '—';
  return x.toLocaleString('es-ES',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); }
function today(){ return new Date(); }
/* Fecha en formato aaaa-mm-dd, en HORA LOCAL.
   Antes usaba toISOString(), que serializa en UTC mientras parseDate() y
   new Date() construyen fechas locales. En España —UTC+1 en invierno, +2 en
   verano— eso devolvía SIEMPRE el día anterior: una venta del 15 se archivaba
   como del 14, y en el día en que cambiaba un lote de coste el margen salía
   con el precio equivocado. No se veía en las pruebas porque el navegador de
   pruebas corre en UTC. La usan a la vez el histórico (M0) y los lotes (M1.1),
   así que tiene que ser una sola función o las dos se desincronizan. */
function iso(d){
  const p = n2 => (n2<10?'0':'')+n2;
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
function addDays(d,k){ const x=new Date(d.getTime()); x.setDate(x.getDate()+k); return x; }
/* Días de calendario entre dos fechas, no milisegundos entre dos instantes.
   `today()` lleva la hora del día y `parseDate()` devuelve medianoche, así que
   restar en crudo daba un número que cambiaba a lo largo del día: a partir de
   las 12:00, `round` bajaba un entero. Efectos medidos: el pago de proveedor
   que vencía HOY salía en −1 y el filtro `k>=0` lo tiraba de la proyección de
   caja (2.500 € de 10.000 desaparecidos), los demás vencimientos se adelantaban
   un día, y la «historia acumulada» del histórico decía 8 días por la mañana y
   9 por la tarde con los mismos datos. Es la misma familia que el fallo de
   `iso()`: mezclar un instante con una fecha. */
function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function daysBetween(a,b){ return Math.round((startOfDay(b)-startOfDay(a))/86400000); }
/* ═══ FECHAS · lo que entra y lo que se queda fuera ═════════════════════════

   B2 · NADA ACOTABA LAS FECHAS. `new Date(2027, 12, 45)` no falla: desborda y
   devuelve el 14 de febrero de 2028. Medido en esta base el 17-09-2026:
   `'2027-13-45'` entraba como 2028-02-14 y `'45000'` —un serial de hoja de
   cálculo, que en Excel es el 15-03-2023— entraba como el 1 de enero del año
   45000. Ninguno de los dos da error: dan una fecha creíble y falsa, que es
   exactamente el fallo que este hub tiene prohibido cometer. Aquí se rechaza
   todo lo que no sea un día del calendario que exista de verdad.

   El tope por arriba es GENEROSO a propósito (hoy + 5 años) porque parseDate()
   la usan también las fechas previstas de los pedidos de compra y los
   vencimientos de pago del carril 7, que son futuras por definición. Quien
   descarta las ventas futuras es salesRows(), donde una venta con fecha de
   mañana sí es un error del informe.

   B3 · LA HORA Y EL HUSO SE TIRABAN. El informe de pedidos trae
   `2026-09-17T23:30:00+00:00`, y la expresión regular se quedaba con
   `2026-09-17`. En Madrid esas 23:30 UTC son la 01:30 del 18: todos los
   pedidos entre las 22:00 y las 24:00 UTC —en verano; entre las 23:00 y las
   24:00 en invierno— se archivaban en el día anterior al que el vendedor ve en
   Seller Central. Es el mismo error de familia que tenía iso(): mezclar un
   INSTANTE con una FECHA. Cuando la cadena declara hora Y huso, el día es el
   del calendario del usuario, resuelto por el motor de fechas del navegador.
   Cuando no declara huso, no hay nada que convertir y la fecha se lee tal cual.
   ══════════════════════════════════════════════════════════════════════════ */
const FECHA_ANIO_MIN    = 2000;   // antes de esto no hay negocio que archivar
const FECHA_ANIOS_VISTA = 5;      // margen por arriba: ETA de pedidos, vencimientos

/* Un día del calendario, o nada. Rechaza el mes 13, el 31 de febrero y los
   años imposibles en vez de dejar que el constructor los desborde. */
function fechaValida(y,m,d){
  if(!(y>=FECHA_ANIO_MIN && y<=today().getFullYear()+FECHA_ANIOS_VISTA)) return null;
  if(!(m>=1 && m<=12) || !(d>=1 && d<=31)) return null;
  const x = new Date(y, m-1, d);
  if(x.getFullYear()!==y || x.getMonth()!==m-1 || x.getDate()!==d) return null;
  return x;
}
function parseDate(s){
  if(s==null || s==='') return null;
  if(s instanceof Date) return isNaN(s.getTime()) ? null : startOfDay(s);
  s = String(s).trim();
  if(!s) return null;
  /* B3 · fecha + hora + huso declarado: se resuelve al día LOCAL del usuario. */
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i);
  if(m){
    const t = Date.parse(s.replace(' ','T'));
    if(isNaN(t)) return null;
    const loc = new Date(t);
    return fechaValida(loc.getFullYear(), loc.getMonth()+1, loc.getDate());
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return fechaValida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);          // dd/mm/yyyy europeo
  if(m) return fechaValida(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);                       // aaaammdd compacto
  if(m) return fechaValida(+m[1], +m[2], +m[3]);
  /* B2 · un número suelto es un serial de hoja de cálculo o una referencia, no
     una fecha. `new Date('45000')` devuelve el año 45000 sin pestañear. */
  if(/^[\d.,]+$/.test(s)) return null;
  const d = new Date(s);
  if(isNaN(d.getTime())) return null;
  return fechaValida(d.getFullYear(), d.getMonth()+1, d.getDate());
}
function toNum(v){
  if(v==null||v==='') return 0;
  let s = String(v).replace(/[^\d,.\-]/g,'');
  // 1.234,56 (europeo) vs 1,234.56 (anglosajón)
  if(/,\d{1,2}$/.test(s) && s.indexOf('.')<s.lastIndexOf(',')) s = s.replace(/\./g,'').replace(',','.');
  else s = s.replace(/,/g,'');
  const n2 = parseFloat(s);
  return isNaN(n2) ? 0 : n2;
}
/* ¿Esta celda trae un número, o trae un hueco disfrazado?

   Amazon rellena las celdas vacías con «--», «N/A» o «-» según el informe, y
   `toNum` las convierte en 0 sin decir nada. Para la mayoría de columnas da
   igual; para la del IVA no: confundir «el IVA es cero» con «no me han dicho el
   IVA» es el fallo más caro que ha tenido este hub, y por esa puerta volvía a
   entrar aunque taxBasis() ya lo cubriera para la columna ausente. */
function hayNumero(v){
  if(v === undefined || v === null) return false;
  const s = String(v).trim();
  if(s === '') return false;
  return /\d/.test(s);
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
/* Plegado de acentos ANTES de limpiar: si no, "término" queda en "trmino" y
   ningún alias en español puede casar nunca. Este detalle rompía la mitad
   del reconocimiento en español. */
function fold(s){
  return String(s||'').toLowerCase()
    .replace(/[áàâäã]/g,'a').replace(/[éèêë]/g,'e').replace(/[íìîï]/g,'i')
    .replace(/[óòôöõ]/g,'o').replace(/[úùûü]/g,'u')
    .replace(/ñ/g,'n').replace(/ç/g,'c');
}
function normHdr(h){ return fold(h).replace(/^﻿/,'').replace(/[^a-z0-9]/g,''); }
/* De qué país habla esta celda.

   ANTES CASABA POR SUBCADENA, y eso es una máquina de fabricar números creíbles
   y falsos: `MKT_MAP` tiene claves de dos letras («de», «es», «it»…), así que
   «United Kingdom» lleva «it» dentro y devolvía ITALIA, «Denmark» lleva «de» y
   devolvía ALEMANIA, y «Estonia» lleva «es» y devolvía ESPAÑA. Ninguno de esos
   tres es un mercado nuestro: lo correcto es no saberlo, no acertar por azar.
   Una venta colocada en el país equivocado no da error en ningún sitio; se suma
   al desglose por mercado y ahí se queda.

   Ahora, en este orden:
     1 · la celda entera, tal cual esté en el mapa («amazon.es», «es», «spain»);
     2 · si parece un dominio de Amazon, SOLO vale el dominio: un «amazon.co.uk»
         que no está en el mapa devuelve null y no se sigue mirando;
     3 · por palabras completas, nunca por un trozo de palabra. */
function countryOf(v){
  if(!v) return null;
  const s = String(v).toLowerCase().trim();
  if(MKT_MAP[s]) return MKT_MAP[s];
  const dom = s.match(/amazon\.[a-z][a-z.]{1,9}/);
  if(dom){
    let d = dom[0];
    while(d.length > 'amazon'.length){
      if(MKT_MAP[d]) return MKT_MAP[d];
      d = d.replace(/\.[a-z]+$/, '');            // «amazon.com.be» → «amazon.com» → «amazon»
    }
    return null;
  }
  const piezas = s.split(/[^a-z0-9]+/).filter(Boolean);
  for(let i=0;i<piezas.length;i++){ if(MKT_MAP[piezas[i]]) return MKT_MAP[piezas[i]]; }
  return null;
}

/* =========================================================================
   3 · CATÁLOGO DE INFORMES DE SELLER CENTRAL
   Firmas tomadas de los esquemas del conector abierto de Airbyte para la
   Selling Partner API. La detección compara cabeceras normalizadas, así que
   da igual el nombre del fichero y aguanta guiones, guiones bajos y espacios.
   ========================================================================= *//* =========================================================================
   3 · INFORMES DE SELLER CENTRAL — reconocimiento independiente del idioma

   Amazon traduce las cabeceras de sus informes según el idioma que tengas
   configurado, y no publica la lista de nombres traducidos. Depender de ellas
   es frágil. Así que el reconocimiento va en tres pasadas:

     1. Cabeceras conocidas (inglés) — camino rápido y sin ambigüedad.
     2. Alias por palabra clave en español e inglés — "fecha", "cantidad",
        "importe", "pedido"… funcionan igual escritas de cualquier forma.
     3. Perfil del CONTENIDO de cada columna — un identificador de pedido
        siempre tiene la forma 171-1234567-1234567 y un ASIN siempre empieza
        por B0, digan lo que digan las cabeceras. Esta pasada es la que hace
        que funcione en cualquier idioma.

   Y si las tres fallan, se le pregunta al usuario una vez y se recuerda.
   ========================================================================= */

/* ---------- Qué contiene una columna ---------- */
const KIND = {
  orderId : v => /^\d{2,4}-\d{5,9}-\d{5,9}$/.test(v),
  asin    : v => /^B[0-9A-Z]{9}$/i.test(v),
  fnsku   : v => /^X[0-9A-Z]{9}$/i.test(v),
  date    : v => /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}[\/.]\d{1,2}[\/.]\d{4}/.test(v),
  channel : v => /amazon\.[a-z.]{2,7}/i.test(v),
  country : v => /^(DE|FR|IT|ES|PL|NL|BE|IE|SE|GB|UK|AT|PT)$/.test(v),
  currency: v => /^(EUR|GBP|PLN|SEK|USD|CHF)$/i.test(v),
  money   : v => /^-?\d{1,9}[.,]\d{1,2}$/.test(v),
  int     : v => /^-?\d{1,7}$/.test(v),
  code    : v => /^[A-Za-z0-9][A-Za-z0-9._\-\/]{2,39}$/.test(v) && !/^\d+([.,]\d+)?$/.test(v),
  text    : v => /[a-záéíóúñü]{3}/i.test(v) && v.indexOf(' ') > 0
};
function colProfile(rows, key){
  const vals = [];
  for(let i=0; i<rows.length && vals.length<200; i++){
    const v = rows[i][key];
    if(v!=null && String(v).trim()!=='') vals.push(String(v).trim());
  }
  const p = {n:vals.length, uniq:0, dom:null};
  if(!vals.length) return p;
  Object.keys(KIND).forEach(k=>{
    let hit=0; vals.forEach(v=>{ if(KIND[k](v)) hit++; });
    p[k] = hit/vals.length;
  });
  p.uniq = new Set(vals).size / vals.length;
  p.sample = vals.slice(0,3);
  // el tipo dominante: el más específico que cubra al menos el 80%
  const order = ['orderId','asin','fnsku','date','channel','currency','country','money','int','code','text'];
  for(const k of order){ if(p[k] >= 0.8){ p.dom = k; break; } }
  return p;
}
function sheetProfile(headers, rows){
  const P = {cols:headers.length, byKey:{}, count:{}};
  headers.forEach(h=>{
    const k = normHdr(h);
    const pr = colProfile(rows, k);
    P.byKey[k] = pr;
    if(pr.dom) P.count[pr.dom] = (P.count[pr.dom]||0) + 1;
  });
  const c = t => P.count[t]||0;
  P.has = {orderId:c('orderId')>0, asin:c('asin')>0, fnsku:c('fnsku')>0, date:c('date')>0,
           channel:c('channel')>0, country:c('country')>0, currency:c('currency')>0};
  P.n = {money:c('money'), int:c('int'), code:c('code'), text:c('text')};
  return P;
}

/* ---------- Definición de los informes ----------
   hdr   : cabeceras inglesas exactas (camino rápido)
   fields: campo interno → alias de cabecera (ES/EN) + tipo esperado
   sig   : huella por contenido, para cuando las cabeceras vienen traducidas */
const REPORTS = [
  {id:'orders', label:'Todos los pedidos', en:'All Orders',
   path:'Informes › Logística de Amazon › «Todos los pedidos»', feeds:'Ventas, unidades y país',
   hdr:['amazonorderid','purchasedate','sku'],
   forbid:['fnsku'],
   fields:{
     _oid    :{req:1, type:'orderId', alias:[/amazonorderid/,/pedido/,/order/]},
     _date   :{req:1, type:'date',    alias:[/purchasedate/,/fecha.*(compra|pedido)/,/^fecha/]},
     _sku    :{req:1, type:'code',    alias:[/^sku$/,/sellersku/,/skudelvendedor/,/referencia/]},
     _qty    :{req:1, type:'int',     alias:[/quantity(purchased|shipped)?$/,/cantidad/,/unidades/]},
     _amount :{req:1, type:'money',   alias:[/itemprice/,/preciodelart/,/^importe/,/^precio/]},
     _tax    :{req:0, type:'money',   alias:[/itemtax/,/impuestodelart/,/^impuesto/,/^iva/]},
     _asin   :{req:0, type:'asin',    alias:[/asin/]},
     _channel:{req:0, type:'channel', alias:[/saleschannel/,/canaldeventa/,/marketplace/]},
     _country:{req:0, type:'country', alias:[/shipcountry/,/paisdeenvio/,/pais/]},
     /* La columna 16 de 34 se llama `currency`. El traspaso del 22 de agosto
        afirmaba que «el informe de pedidos no declara campo de divisa»: es
        falso, y esa afirmación es la que dejó el fallo sin arreglar. Amazon lo
        dice; el hub no lo leía. */
     _cur    :{req:0, type:null,      alias:[/^currency$/,/divisa/,/moneda/]},
     _status :{req:0, type:null,      alias:[/itemstatus/,/orderstatus/,/estadodel/,/estado/]},
     _fulfil :{req:0, type:null,      alias:[/fulfil?ment?channel/,/canaldegestion/,/logistica/]}
   },
   sig:P => P.has.orderId && P.has.date && P.n.money>=1 && P.n.int>=1 && P.cols>=15},

  {id:'inventory', forbidOid:1, label:'Gestión de inventario de Logística de Amazon', en:'Manage FBA Inventory',
   path:'Informes › Logística de Amazon › Inventario', feeds:'Stock disponible',
   hdr:['afnfulfillablequantity','sku'],
   fields:{
     _sku:{req:1, type:'code', alias:[/^sku$/,/sellersku/,/skudelvendedor/,/referencia/]},
     _qty:{req:1, type:'int',  alias:[/afnfulfillablequantity/,/cantidad.*disponible/,/disponible/,/cantidadgestionada/]},
     _asin:{req:0,type:'asin', alias:[/asin/]},
     _name:{req:0,type:null,   alias:[/productname/,/nombredelproducto/,/titulo/]}
   },
   forbid:['orderId'],
   sig:P => !P.has.orderId && !P.has.date && P.has.asin && P.n.int>=5 && P.cols>=15 && P.cols<=30},

  {id:'multicountry', forbidOid:1, label:'Inventario multipaís', en:'Multi-Country Inventory',
   path:'Informes › Logística de Amazon › Inventario › Ver más informes', feeds:'Unidades en cada país',
   hdr:['quantityforlocalfulfillment'],
   fields:{
     _sku    :{req:1, type:'code',    alias:[/sellersku/,/^sku$/,/referencia/]},
     _country:{req:1, type:'country', alias:[/country/,/pais/,/país/]},
     _qty    :{req:1, type:'int',     alias:[/quantityforlocalfulfillment/,/cantidad/,/unidades/]}
   },
   forbid:['orderId'],
   sig:P => P.has.country && P.cols<=9 && P.n.int>=1 && !P.has.orderId && !P.has.date},

  {id:'fees', forbidOid:1, label:'Vista previa de tarifas de Logística de Amazon', en:'FBA Fee Preview',
   path:'Informes › Logística de Amazon › Pagos', feeds:'Comisión y tarifa FBA reales por SKU',
   hdr:['estimatedreferralfeeperunit'],
   fields:{
     _sku     :{req:1, type:'code',  alias:[/^sku$/,/sellersku/,/referencia/]},
     _referral:{req:1, type:'money', alias:[/referralfeeperunit/,/comision.*porunidad/,/comisionporrecomendacion/,/comision/]},
     /* Amazon escribe esta columna de tres maneras y ninguna es «la» oficial:
        `expected-fulfillment-fee-per-unit` en el formato antiguo, y en el nuevo
        `expected-domestic-fulfilment-fee-per-unit` —ortografía británica, una
        sola `l`, y un `domestic` en medio— más seis columnas EFN por país. El
        alias antiguo no casaba con la nueva, y entonces la segunda pasada de
        resolveFields le enchufaba `sales-price`: la tarifa de logística se leía
        como el PRECIO DE VENTA, 12,99 € donde eran 2,18 €. La doméstica va
        primero a propósito; las EFN suelen venir a `--`. */
     _fba     :{req:0, type:'money', alias:[/expected.*domestic.*fulfil?ment.*feeperunit/,
                                            /expected.*fulfil?ment.*feeperunit/,
                                            /expectedefnfulfil?mentfeeperunit/,
                                            /tarifadegestionlogistica/,/tarifadelogistica/,/gestionlogistica/]},
     _price   :{req:0, type:'money', alias:[/yourprice/,/salesprice/,/tuprecio/,/preciodeventa/]},
     /* El fichero real trae 31 SKU × 9 tiendas en 3 divisas. Sin leer estas dos
        columnas la clave era solo el SKU y ganaba la última fila leída: según el
        orden del fichero podías acabar aplicando tarifas saudíes en riales a
        ventas españolas. El dato estaba en el fichero; no se leía. */
     _store   :{req:0, type:null,  alias:[/amazonstore/,/^store$/,/tienda/,/marketplace/]},
     _cur     :{req:0, type:null,  alias:[/^currency$/,/divisa/,/moneda/]}
   },
   forbid:['orderId'],
   sig:P => P.has.asin && P.has.currency && P.n.money>=5 && !P.has.orderId && P.cols>=25},

  {id:'returns', label:'Devoluciones de Logística de Amazon', en:'FBA Customer Returns',
   path:'Informes › Logística de Amazon › Concesiones al cliente', feeds:'Tasa real de devolución',
   hdr:['detaileddisposition','returndate'],
   fields:{
     _oid :{req:1, type:'orderId', alias:[/orderid/,/pedido/]},
     _date:{req:1, type:'date', alias:[/returndate/,/fecha.*devoluci/,/^fecha/]},
     _sku :{req:1, type:'code', alias:[/^sku$/,/sellersku/,/referencia/]},
     _qty :{req:0, type:'int',  alias:[/quantity/,/cantidad/,/unidades/]},
     _disp:{req:0, type:null,   alias:[/detaileddisposition/,/disposicion/,/estado/]},
     /* B4 · el motivo es la senal de negocio: doce de catorce por talla no es
        un problema de calidad, es una guia de tallas. Viene en MAYUSCULAS
        (`JEWELRY_TOO_SMALL`), como `detailed-disposition`. */
     _reason:{req:0, type:null, alias:[/^reason$/,/motivo/,/razon/]}
   },
   sig:P => P.has.orderId && P.has.date && P.cols<=18 && P.n.int>=1},

  {id:'searchterm', label:'Términos de búsqueda (Publicidad)', en:'Search Term Report',
   path:'Publicidad › Gestor de campañas › Informes', feeds:'Gasto y desperdicio de PPC',
   hdr:['customersearchterm'],
   fields:{
     _term    :{req:1, type:null,  alias:[/customersearchterm/,/searchterm/,/termino.*busqueda/,/terminodebusqueda/]},
     /* CARRIL 4 · Las dos columnas de fecha que este informe SÍ trae y que esta
        definición no declaraba. Sin declararlas, `adStats()` tenía que ir a
        buscarlas por su nombre en crudo y el gasto de publicidad acababa
        dependiendo de que el nombre de la columna fuera el que alguien puso en
        una lista. Van con `type:null` a propósito: el perfilador clasifica
        «ago 20, 2026» como texto, no como fecha, así que exigir `type:'date'`
        dejaría la columna sin asignar justo en los informes en español. Y con
        alias anclados `^…$` sobre el nombre YA NORMALIZADO por `normHdr()`,
        que es quien quita el espacio final que Amazon deja en cabeceras como
        «Coste publicitario de las ventas (ACOS) total »: anclar contra el
        nombre sin recortar no casaría nunca. */
     _from    :{req:0, type:null,  alias:[/^startdate$/,/^fechadeinicio$/,/^fechainicio$/,/^start$/,/^desde$/]},
     _to      :{req:0, type:null,  alias:[/^enddate$/,/^fechadefinalizacion$/,/^fechadefin$/,/^fechafin$/,/^end$/,/^hasta$/]},
     _spend   :{req:1, type:'money',alias:[/^spend/,/^cost$/,/gasto/,/inversion/]},
     _sales   :{req:0, type:'money',alias:[/totalsales/,/attributedsales/,/ventastotales/,/^ventas/]},
     _orders  :{req:0, type:'int',  alias:[/totalorders/,/attributedconversions/,/pedidostotales/,/^pedidos/,/conversiones/]},
     _clicks  :{req:0, type:'int',  alias:[/^clicks$/,/^clics/,/pulsaciones/]},
     _impr    :{req:0, type:'int',  alias:[/impressions/,/impresiones/]},
     _campaign:{req:0, type:null,   alias:[/campaignname/,/nombredecampa/,/campa/]}
   },
   sig:P => !P.has.orderId && !P.has.asin && P.n.int>=2 && P.n.money>=2 && P.n.text>=1},

  {id:'ledger', label:'Libro mayor de inventario', en:'Inventory Ledger',
   path:'Informes › Logística de Amazon › Inventario', feeds:'Movimientos de stock por país',
   /* Se guarda entero y todavía no alimenta ningún cálculo. Se dice en la
      pantalla en vez de dejar que el «✓ reconocido» parezca otra cosa. */
   guardaSinUsar:1,
   hdr:['eventtype','referenceid','fnsku'],
   fields:{
     _date   :{req:1, type:'date',   alias:[/^date/,/^fecha/]},
     _sku    :{req:0, type:'code',   alias:[/msku/,/^sku$/,/referencia/]},
     _country:{req:0, type:'country',alias:[/country/,/pais/]},
     _qty    :{req:0, type:'int',    alias:[/quantity/,/cantidad/]},
     _event  :{req:0, type:null,     alias:[/eventtype/,/tipodeevento/,/evento/]}
     /* El carril 3 necesita `disposition`, `reason` y `reference-id` para
        distinguir una unidad DAÑADA en el almacén —que Amazon debe compensar—
        de una devolución vendible que vuelve al stock. NO se declaran como
        campos: `normalizeRows` conserva las cabeceras normalizadas tal cual, y
        `gv(r,'_disp','disposition','disposicion')` las encuentra igual.

        Y declararlas ROMPÍA LA DETECCIÓN, medido el 17-09-2026: con los alias
        `/^motivo$/` y `/disposicion/` dentro de `ledger`, el fixture español
        de devoluciones (`devoluciones-es.txt`, 38 filas) se reconocía como
        libro mayor de inventario y la tasa de devolución del hub pasaba de
        3,02 % a 0 %. Dos suites en rojo por cuatro alias de más: los alias de
        un informe compiten con los de todos los demás. */
   },
   sig:P => P.has.fnsku && P.has.date && P.cols<=20},

  {id:'settlement', label:'Liquidación (fichero plano)', en:'Settlement flat file',
   path:'Pagos › Todos los extractos › Descargar fichero plano', feeds:'Comisiones y dinero real',
   warn:'Solo en inglés · Amazon lo retira el 11-nov-2026',
   hdr:['settlementid','transactiontype'], onlyEn:true, fields:{}, sig:()=>false},

  {id:'storage', label:'Tarifas mensuales de almacenamiento', en:'FBA Monthly Storage Fees',
   path:'Informes › Logística de Amazon › Pagos', feeds:'Coste real de almacenaje',
   guardaSinUsar:1,
   hdr:['estimatedmonthlystoragefee'], onlyEn:true, fields:{}, sig:()=>false},

  {id:'planning', label:'Salud del inventario', en:'FBA Inventory Planning',
   path:'Inventario › Gestionar salud del inventario', feeds:'Exceso y antigüedad',
   hdr:['sellthrough','daysofsupply'], onlyEn:true, fields:{}, sig:()=>false},

  {id:'reimb', label:'Reembolsos de Logística de Amazon', en:'FBA Reimbursements',
   path:'Informes › Logística de Amazon › Pagos', feeds:'Dinero recuperado, y qué reclamaciones ya están compensadas',
   /* EL KPI «REEMBOLSOS» SALÍA 0 € CON EL INFORME CARGADO, y el traspaso lo
      daba por un fallo de `pnl()`. No lo es del todo: `normalizeRows` conserva
      las cabeceras normalizadas tal cual, así que en el fichero INGLÉS
      `approval-date` → `approvaldate` sí existe y `pnl()` lo encuentra.
      Comprobado en esta base el 17-09-2026: con el fichero inglés el KPI se
      mueve; con la versión en español del informe, no, porque `fields` estaba
      vacío y no había un solo alias que tradujera «fecha de aprobación».

      Los campos van todos con `req:0` a propósito: el camino rápido de
      detección es `hdr`, y después `resolveFields` exige que no falte ningún
      obligatorio. Un campo obligatorio aquí bloquearía la importación del
      fichero inglés, que hoy funciona. */
   hdr:['reimbursementid'], onlyEn:true,
   fields:{
     _date  :{req:0, type:'date',  alias:[/approvaldate/,/fechadeaprobacion/,/^fecha/]},
     _rid   :{req:0, type:null,    alias:[/^reimbursementid$/,/iddereembolso/]},
     _case  :{req:0, type:null,    alias:[/^caseid$/,/iddelcaso/,/numerodecaso/]},
     _oid   :{req:0, type:'orderId',alias:[/amazonorderid/,/numerodepedido/]},
     _reason:{req:0, type:null,    alias:[/^reason$/,/^motivo$/]},
     _sku   :{req:0, type:'code',  alias:[/^sku$/,/sellersku/,/referencia/]},
     _asin  :{req:0, type:'asin',  alias:[/^asin$/]},
     _amount:{req:0, type:'money', alias:[/amounttotal/,/importetotal/,/^total$/]},
     _unit  :{req:0, type:'money', alias:[/amountperunit/,/importeporunidad/]},
     _qty   :{req:0, type:'int',   alias:[/quantityreimbursedtotal/,/cantidadreembolsadatotal/,/^cantidad/]}
   },
   sig:()=>false},

  {id:'vat', label:'Transacciones sujetas a IVA', en:'VAT Transactions',
   path:'Informes › Biblioteca de documentos fiscales',
   feeds:'IVA realmente aplicado por pedido, y el detector de tipo reducido',
   /* 95 columnas, TAB, UTF-8. Los alias cubren los dos juegos de nombres que
      trae el informe: el corto (`SALE_ARRIVAL_COUNTRY`, `TOTAL_ACTIVITY_VALUE_*`)
      y el largo (`TAXABLE_JURISDICTION`, `TOTAL_PRICE_OF_ITEMS_*`). */
   hdr:['transactiontype','salearrivalcountry'], onlyEn:true,
   fields:{
     _period:{req:0, type:null,   alias:[/activityperiod/]},
     _ttype :{req:0, type:null,   alias:[/^transactiontype$/]},
     _event :{req:0, type:null,   alias:[/transactioneventid/,/activitytransactionid/]},
     _sku   :{req:0, type:'code', alias:[/sellersku/,/^sku$/]},
     /* EL ORDEN DE ESTOS TRES ALIAS ES EL NÚMERO.

        `TAXABLE_JURISDICTION` trae el NOMBRE del país en inglés —SPAIN, ITALY,
        GERMANY—, y `vatReport()` se queda con sus dos primeras letras para
        buscar el tipo general. Con esa columna delante, España salía como «SP»,
        Alemania como «GE», Austria como «AU» y Polonia y Portugal LAS DOS como
        «PO». Ninguno de esos códigos está en `VAT_GENERAL`, así que el detector
        de tipo reducido no comparaba nada en esos países y la diferencia de IVA
        que sí existe se quedaba a cero, sin un solo aviso. Y «PO» es peor
        todavía: dos países distintos sumando en el mismo cajón.

        INTEGRACIÓN · el carril 1 y la entrega del 6-sep arreglaron ESTE MISMO
        fallo por dos puertas distintas, y hay que quedarse con una sola.

        El carril 1 puso `SALE_ARRIVAL_COUNTRY` delante: trae el código ISO ya
        hecho y esquiva el recorte. La entrega arregló el recorte en su origen,
        con `paisDeJuris()` y MKT_MAP, y dejó la jurisdicción donde estaba.

        Manda la entrega, por dos razones. La primera es fiscal: la deuda es de
        la JURISDICCIÓN IMPONIBLE, que en venta a distancia bajo umbral o fuera
        de OSS es el país de SALIDA, no el de destino; leer el destino cambia la
        deuda de país sin avisar. La segunda es que el destino miente cuando no
        se sabe: en el informe real hay filas con `XX`, y leerlas como país
        asigna euros a un país que no existe — que es exactamente el fallo que
        A7 venía a cerrar. Lo fija tests/ivafiscal.test.js con la jurisdicción
        NARNIA.

        El destino se conserva de red, detrás: `vatReport()` cae a
        `salearrivalcountry` fila a fila si la jurisdicción viene vacía. */
     _juris :{req:0, type:null,   alias:[/taxablejurisdiction/,
                                         /^salearrivalcountry$/,/^arrivalcountry$/,/arrivalcountry/]},
     /* Ojo: viene en FRACCIÓN DECIMAL. `0.1` es el 10 %, no el 0,1 %. */
     _rate  :{req:0, type:null,   alias:[/priceofitemsvatratepercent/,/vatratepercent/]},
     _base  :{req:0, type:'money',alias:[/totalpriceofitemsamtvatexcl/,/totalactivityvalueamtvatexcl/]},
     _vat   :{req:0, type:'money',alias:[/totalpriceofitemsvatamt/,/totalactivityvaluevatamt/]},
     _ptc   :{req:0, type:null,   alias:[/producttaxcode/]},
     _scheme:{req:0, type:null,   alias:[/taxreportingscheme/]},
     _resp  :{req:0, type:null,   alias:[/taxcollectionresponsibility/]}
   },
   sig:()=>false}
];

/* ---------- Lectura de fichero con detección de codificación ---------- */
function readSmart(file){
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onerror = ()=>rej(new Error('No se pudo leer el archivo'));
    r.onload = ()=>{
      const buf = r.result;
      const b = new Uint8Array(buf);
      /* UTF-16 se detecta por su marca de orden de bytes, ANTES de intentar
         nada. Leído como UTF-8, un TSV en UTF-16 queda con un NUL entre cada
         letra; `normHdr` los quita al limpiar, así que las cabeceras seguían
         casando y el informe se daba por reconocido — con cero unidades y cero
         euros dentro. Un «✓ reconocido» sobre un fichero que no se ha leído es
         peor que un error. Amazon sirve así varios de sus TSV. */
      let txt;
      if(b.length>=2 && b[0]===0xFF && b[1]===0xFE)      txt = new TextDecoder('utf-16le').decode(buf);
      else if(b.length>=2 && b[0]===0xFE && b[1]===0xFF) txt = new TextDecoder('utf-16be').decode(buf);
      else {
        txt = new TextDecoder('utf-8',{fatal:false}).decode(buf);
        // Amazon sirve muchos informes en Latin-1. Si aparece el carácter de
        // sustitución, reintentamos con windows-1252.
        if(txt.indexOf(String.fromCharCode(65533)) >= 0){
          try{ txt = new TextDecoder('windows-1252').decode(buf); }catch(e){}
        }
      }
      res(txt.replace(/^﻿/,''));
    };
    r.readAsArrayBuffer(file);
  });
}
/* ---------- Parser TSV/CSV con comillas ---------- */
function parseDelimited(text){
  const nl = text.indexOf('\n');
  const firstLine = text.slice(0, nl>0 ? nl : 400);
  /* Los separadores se cuentan FUERA DE LAS COMILLAS. Un CSV cuya primera
     celda sea un texto entrecomillado con comas dentro —«Incluye pedidos,
     devoluciones y ajustes»— parecía tener siete columnas y ganaba la coma
     aunque el fichero fuera de tabuladores. Contar dentro de las comillas es
     contar el texto del usuario, no la forma del fichero. */
  const fuera = sep => { let n=0, q=false;
    for(let i=0;i<firstLine.length;i++){ const ch=firstLine[i];
      if(ch==='"'){ if(q && firstLine[i+1]==='"'){ i++; } else q=!q; }
      else if(ch===sep && !q) n++; }
    return n; };
  const tabs=fuera('\t'), commas=fuera(','), semis=fuera(';');
  const D = tabs >= Math.max(commas,semis) && tabs>0 ? '\t' : (semis>commas ? ';' : ',');
  const rows=[]; let row=[], cur='', q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){
      if(ch==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; }
      else cur+=ch;
    } else if(ch==='"'){ q=true; }
    else if(ch===D){ row.push(cur); cur=''; }
    else if(ch==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; }
    else if(ch!=='\r'){ cur+=ch; }
  }
  if(cur!==''||row.length){ row.push(cur); rows.push(row); }
  if(!rows.length) return {headers:[],rows:[],delim:D};
  /* Dónde está la cabecera. Varios informes llevan líneas de aviso antes.
     La regla vieja miraba SEIS líneas y se conformaba con «3+ celdas no
     vacías»; el informe de transacciones personalizadas trae SIETE líneas de
     preámbulo, así que se quedaba con la última de ellas —una sola celda— y
     todo lo demás salía desalineado. Ahora se busca en treinta líneas y se
     exige que la fila tenga tantas celdas como la mayoría del fichero, que es
     lo que distingue una cabecera de una línea de aviso.
     `registrarPreproceso` ya recorta el preámbulo antes de llegar aquí; esto
     es la red por si un fichero se cuela por otro camino. */
  let hi=0;
  const frec={};
  for(let i=0;i<Math.min(40,rows.length);i++){ const n=rows[i].length; if(n>1) frec[n]=(frec[n]||0)+1; }
  let modo=0, veces=0;
  for(const n in frec){ if(frec[n]>veces || (frec[n]===veces && +n>modo)){ modo=+n; veces=frec[n]; } }
  let hallado=false;
  if(modo>=3){
    for(let i=0;i<Math.min(30,rows.length);i++){
      if(rows[i].length!==modo) continue;
      const llenas = rows[i].map(x=>String(x).trim()).filter(x=>x!=='');
      if(llenas.length<3) continue;
      /* Y TIENE QUE PARECER UNA CABECERA. Sin esta condición, un CSV en español
         con coma decimal y coma de separador —donde las filas de datos llevan
         MÁS celdas que la cabecera— haría que la mayoría fuese la de los datos
         y se cogería la primera fila de datos como cabecera. El fichero
         quedaría «alineado», nadie vería el desajuste y las cifras saldrían
         desplazadas de columna: exactamente el fallo que este parser existe
         para no cometer. Una cabecera son nombres; una fila de datos, números. */
      const numericas = llenas.filter(x=>/^[-+]?[\d.,]+%?$/.test(x)).length;
      if(numericas > llenas.length*0.4) continue;
      hi=i; hallado=true; break;
    }
  }
  if(!hallado){
    for(let i=0;i<Math.min(6,rows.length);i++){
      if(rows[i].filter(x=>String(x).trim()!=='').length>=3){ hi=i; break; }
    }
  }
  const headers = rows[hi].map(h=>String(h).trim());
  const out=[]; let bad=0;
  for(let i=hi+1;i<rows.length;i++){
    if(rows[i].length===1 && String(rows[i][0]).trim()==='') continue;
    if(rows[i].length !== headers.length) bad++;
    const o={};
    headers.forEach((h,j)=>{ o[normHdr(h)] = rows[i][j]!==undefined ? String(rows[i][j]).trim() : ''; });
    out.push(o);
  }
  /* Si muchas filas no tienen tantas celdas como la cabecera, el archivo está
     desalineado — típicamente un CSV con coma decimal y coma como separador,
     sin comillas. Leerlo así daría cifras desplazadas de columna: números
     creíbles y falsos. Mejor negarse que dar un dato equivocado. */
  const misaligned = out.length>4 && bad/out.length > 0.1;
  return {headers, rows:out, delim:D, misaligned:misaligned, badRows:bad};
}

/* ---------- Firma de la hoja, para recordar asignaciones manuales ---------- */
function sheetSig(headers){
  const s = headers.map(normHdr).sort().join('|');
  let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; }
  return 'h'+Math.abs(h).toString(36)+'-'+headers.length;
}

/* ---------- Identificar de qué informe se trata ----------
   No se usa la huella de contenido como filtro que descarta, sino como una
   evidencia más que suma. Cada informe candidato se PUNTÚA: un alias de
   cabecera acertado vale mucho, una columna resuelta por su tipo vale poco,
   y que falte un campo obligatorio penaliza fuerte. Gana el de más puntos.
   Así un informe en español no se descarta por no encajar en una huella. */
function scoreReport(rep, headers, P){
  if(!rep.fields || !Object.keys(rep.fields).length) return {score:-999};
  const r = resolveFields(rep, headers, P);
  let sc = r.aliasHits*3 + r.typeHits*1 - r.missing.length*20;
  try{ if(rep.sig && rep.sig(P)) sc += 2; }catch(e){}
  // prueba en contra: si el informe no puede llevar cierto tipo de columna y
  // la hoja la tiene, es que no es este informe
  (rep.forbid||[]).forEach(t=>{ if(P.has[t]) sc -= 12; });
  return {score:sc, map:r.map, missing:r.missing, aliasHits:r.aliasHits};
}
function detectReport(headers, rows){
  const H = headers.map(normHdr);
  // 1 · cabeceras inglesas exactas — camino rápido, sin ambigüedad
  let best=null, bn=0;
  REPORTS.forEach(r=>{
    if(r.hdr && r.hdr.every(s=>H.indexOf(s)>=0) && r.hdr.length>bn){ best=r; bn=r.hdr.length; }
  });
  if(best) return {rep:best, how:'cabeceras en inglés'};
  // 2 · asignación que el usuario ya guardó para estas mismas columnas
  const sig = sheetSig(headers);
  const learned = (DB.mappings||{})[sig];
  if(learned){
    const r = REPORTS.filter(x=>x.id===learned.reportId)[0];
    if(r) return {rep:r, how:'asignación que guardaste', map:learned.map};
  }
  // 3 · puntuación combinando alias en español y contenido de las columnas
  const P = sheetProfile(headers, rows);
  let win=null, ws=-999, wr=null;
  REPORTS.forEach(r=>{
    if(r.onlyEn) return;
    const s = scoreReport(r, headers, P);
    if(s.score>ws){ ws=s.score; win=r; wr=s; }
  });
  if(win && ws>=3){
    const how = wr.aliasHits>=2 ? 'nombres de columna en español' : 'contenido de las columnas';
    return {rep:win, how:how, profile:P, map:wr.map, score:ws};
  }
  return {rep:null, profile:P, sig:sig};
}

/* ---------- Asignar columnas a campos internos ---------- */
function resolveFields(rep, headers, P){
  const H = headers.map(normHdr);
  const map={}, used={}, missing=[];
  let aliasHits=0, typeHits=0;
  const fields = rep.fields||{};
  // primera pasada: alias de cabecera
  Object.keys(fields).forEach(f=>{
    const d = fields[f];
    for(const rx of d.alias){
      for(let i=0;i<H.length;i++){
        if(used[H[i]]) continue;
        if(rx.test(H[i])){
          const pr = P.byKey[H[i]];
          if(pr && pr.n===0) continue;          // columna vacía: no vale como prueba
          if(!d.type || !pr || !pr.dom || pr.dom===d.type ||
             (d.type==='money' && pr.dom==='int') || (d.type==='int' && pr.dom==='money') ||
             (d.type==='code' && (pr.dom==='text'||pr.dom==='code'))){
            map[f]=H[i]; used[H[i]]=1; aliasHits++; return;
          }
        }
      }
    }
  });
  /* Segunda pasada: por tipo de contenido, para lo que quede sin asignar.

     Solo para campos OBLIGATORIOS. Un campo opcional cuyo alias no ha casado se
     queda sin mapear a propósito: sin él se cae a un valor por defecto que está
     documentado, mientras que adivinarlo por tipo mete un número real de otra
     columna y no lo dice nadie. Medido: la tarifa de logística acababa siendo
     `sales-price`, y con un informe de pedidos sin columna de impuesto
     reconocible el IVA habría acabado siendo cualquier otro importe. Los
     obligatorios sí lo conservan, porque sin ellos la importación se bloquea y
     el asignador manual se lo pregunta al usuario. */
  Object.keys(fields).forEach(f=>{
    if(map[f]) return;
    const d = fields[f];
    if(!d.type || !d.req) return;
    let bestK=null, bestU=-1;
    H.forEach(k=>{
      if(used[k]) return;
      const pr=P.byKey[k]; if(!pr||!pr.dom||pr.n===0) return;
      const ok = pr.dom===d.type ||
                 (d.type==='money' && pr.dom==='int') ||
                 (d.type==='code'  && pr.dom==='text');
      if(!ok) return;
      // para códigos preferimos alta cardinalidad; para importes, la primera
      const u = d.type==='code' ? pr.uniq : 1/(H.indexOf(k)+1);
      if(u>bestU){ bestU=u; bestK=k; }
    });
    if(bestK){ map[f]=bestK; used[bestK]=1; typeHits++; }
  });
  Object.keys(fields).forEach(f=>{ if(fields[f].req && !map[f]) missing.push(f); });
  return {map, missing, aliasHits, typeHits};
}

/* ---------- Normalizar filas a los nombres internos ---------- */
const FIELD_LABEL = {
  _date:'Fecha', _sku:'SKU / referencia', _qty:'Unidades', _amount:'Importe de la venta',
  _tax:'Impuesto (IVA)', _asin:'ASIN', _channel:'Canal de venta', _country:'País',
  _status:'Estado del pedido', _fulfil:'Canal logístico', _name:'Nombre del producto',
  _referral:'Comisión por unidad', _fba:'Tarifa de logística', _price:'Precio de venta',
  _disp:'Estado de la devolución', _term:'Término de búsqueda', _spend:'Gasto',
  _sales:'Ventas atribuidas', _orders:'Pedidos', _clicks:'Clics', _impr:'Impresiones',
  _campaign:'Campaña', _event:'Tipo de movimiento'
};
function normalizeRows(rows, map){
  const keys = Object.keys(map);
  return rows.map(r=>{
    const o = r;
    keys.forEach(f=>{ o[f] = r[map[f]]; });
    return o;
  });
}

/* ---------- Ingesta ---------- */
async function handleFiles(files){
  const list = document.getElementById('fileList');
  const pendientes = [];
  for(const f of Array.from(files)){
    const el = document.createElement('div');
    el.className='fileitem';
    el.innerHTML = '<span class="f-dot wait"></span><span class="f-name">'+esc(f.name)+'</span><span class="f-meta">leyendo…</span>';
    list.appendChild(el);
    try{
      if(/\.xlsx?$/i.test(f.name)){
        el.innerHTML='<span class="f-dot err"></span><span class="f-name">'+esc(f.name)+'</span>'+
          '<span class="f-meta">Excel no soportado. Descarga el informe en .txt o .csv desde Amazon.</span>';
        continue;
      }
      const txt = await readSmart(f);
      const {headers, rows, misaligned, badRows, delim} = parseDelimited(txt);
      if(misaligned){
        el.innerHTML='<span class="f-dot err"></span><span class="f-name">'+esc(f.name)+'</span>'+
          '<span class="f-meta"><strong>Archivo desalineado</strong>: '+num(badRows)+' de '+num(rows.length)+
          ' filas no tienen las mismas celdas que la cabecera. Suele pasar en CSV en español, '+
          'donde los decimales van con coma y el separador también es coma. '+
          'Vuelve a descargarlo en <strong>.txt</strong> y funcionará. No lo importo porque los '+
          'números saldrían desplazados de columna.</span>';
        continue;
      }
      if(!rows.length){
        el.innerHTML='<span class="f-dot err"></span><span class="f-name">'+esc(f.name)+'</span><span class="f-meta">El archivo no tiene filas de datos.</span>';
        continue;
      }
      const det = detectReport(headers, rows);
      if(!det.rep){
        el.innerHTML='<span class="f-dot err"></span><span class="f-name">'+esc(f.name)+'</span>'+
          '<span class="f-meta">No lo reconozco. '+headers.length+' columnas, '+num(rows.length)+' filas.</span>'+
          '<span class="f-right"><button class="btn sm primary">Asignar columnas</button></span>';
        const btn = el.querySelector('button');
        btn.onclick = ()=>openMapper(f.name, headers, rows, det.sig, el);
        continue;
      }
      const P = det.profile || sheetProfile(headers, rows);
      let map = det.map, missing = [];
      if(!map){ const r = resolveFields(det.rep, headers, P); map = r.map; missing = r.missing; }
      if(missing.length){
        el.innerHTML='<span class="f-dot wait"></span><span class="f-name">'+esc(f.name)+'</span>'+
          '<span class="f-meta">'+esc(det.rep.label)+' — me faltan '+missing.length+' columna'+(missing.length===1?'':'s')+'</span>'+
          '<span class="f-right"><button class="btn sm primary">Completar</button></span>';
        el.querySelector('button').onclick = ()=>openMapper(f.name, headers, rows, sheetSig(headers), el, det.rep, map);
        continue;
      }
      saveImport(det.rep, headers, rows, map, f.name, el, det.how);
    }catch(err){
      el.innerHTML='<span class="f-dot err"></span><span class="f-name">'+esc(f.name)+'</span><span class="f-meta">'+esc(err.message)+'</span>';
    }
  }
  refreshAll();
}
/* Guardar una importación.

   YA NO PISA LO QUE HUBIERA. Amazon parte un mismo informe en varios ficheros
   cuando lo pides por tramos, y hasta ahora el segundo borraba al primero sin
   decir nada: soltabas tres trozos de «Todos los pedidos» y te quedabas con el
   último, con las cuentas del mes hechas sobre un tercio de las ventas y la
   pantalla en verde. Ahora cada fichero es una aportación con nombre propio y
   las filas se FUSIONAN (ver `impFusionar`, en src/20-importador.js).

   Dos cosas que se comprueban ANTES de guardar nada, porque después ya no se
   ven: si una columna de importe o de cantidad obligatoria se ha elegido solo
   por la forma de su contenido (C3), y si al informe le falta una columna sin
   la cual el número que alimenta no está medido aunque lo parezca (C1). */
function saveImport(rep, headers, rows, map, fileName, el, how){
  /* «Confirmado» es tanto lo que el usuario acaba de asignar a mano como la
     asignación que guardó en su día para estas mismas columnas. Si no se
     contara la segunda, un informe en italiano confirmado una vez volvería a
     preguntar en cada importación, y el asistente prometía justo lo contrario:
     «se hace una vez y queda guardado». */
  const comoDicho = how || 'asignación manual';
  const manual = comoDicho === 'asignación manual' || comoDicho === 'asignación que guardaste';
  /* C3 · cabeceras en un idioma que no reconocemos.
     Cuando el importe o la cantidad se han deducido del CONTENIDO y no del
     nombre de la columna, la elección es posicional: entre varias columnas de
     dinero, `resolveFields` se queda con la primera. Con las cabeceras en
     italiano, francés o alemán eso cruza el precio del artículo con el del
     envío o con el descuento, se importa en verde y nadie se entera. Se para y
     se pide confirmación, que es barata; deshacer un trimestre mal contado, no. */
  if(!manual && typeof impCamposInciertos==='function'){
    const inciertos = impCamposInciertos(rep, map);
    if(inciertos.length && el){
      const lista = inciertos.map(x=>'<strong>'+esc(FIELD_LABEL[x.campo]||x.campo)+'</strong> ← «'+esc(x.columna)+'»').join(', ');
      el.innerHTML = '<span class="f-dot wait"></span><span class="f-name">'+esc(fileName)+'</span>'+
        '<span class="f-meta"><strong>'+esc(rep.label)+', pero no me fío de '+inciertos.length+
        ' columna'+(inciertos.length===1?'':'s')+'.</strong> '+lista+'. '+
        'Ese emparejamiento no sale del nombre de la columna —no lo reconozco en este idioma— sino de la '+
        'forma de lo que hay dentro, y entre varias columnas de números la elección es el orden. '+
        'Confírmame cuál es cada una y no te lo vuelvo a preguntar.</span>'+
        '<span class="f-right"><button class="btn sm primary">Revisar columnas</button></span>';
      el.querySelector('button').onclick = ()=>openMapper(fileName, headers, rows, sheetSig(headers), el, rep, map);
      return null;
    }
  }
  const norm = normalizeRows(rows, map);
  const avisos = (typeof impAvisos==='function') ? impAvisos(rep, map, norm) : [];
  const res = impAnadirFichero(rep.id, norm, fileName, headers.length,
                               how||'asignación manual', map, avisos);
  const store = res.store, ent = res.entrada || {};
  if(!DB.mappings) DB.mappings={};
  DB.mappings[sheetSig(headers)] = {reportId:rep.id, map:map};
  /* M0 · antes de guardar, la importación deja su huella en el histórico.
     Esto es lo que convierte una foto del presente en historia propia. */
  const hg = (typeof captureHistory==='function')
    ? captureHistory(rep, store.count, fileName, how||'asignación manual') : null;
  saveDB();
  let hnote = '';
  if(hg){
    if(hg.orders && hg.orders.days) hnote = ' · <span class="pos">histórico: '+num(hg.orders.days)+' día'+(hg.orders.days===1?'':'s')+'</span>';
    else if(hg.stock && hg.stock.skus) hnote = ' · <span class="pos">foto de stock de '+num(hg.stock.skus)+
      ' SKU fechada el '+esc(hg.stock.fecha)+'</span>'+
      (hg.stock.fuente==='planning' ? ' <span class="mut">(del informe)</span>' : ' <span class="mut">(la indicaste tú)</span>')+
      (hg.stock.reescribe ? ' · <span class="warn">reescribe '+num(hg.stock.reescribe)+' foto(s) posteriores</span>' : '');
    else if(hg.fees && hg.fees.skus) hnote = ' · <span class="pos">tarifas de '+num(hg.fees.skus)+' SKU</span>';
  }
  const grave = avisos.filter(a=>a.nivel==='stop').length>0;
  const punto = grave ? 'wait' : 'ok';
  let detalle;
  if(res.yaEstaba){
    detalle = '<strong>ya estaba importado</strong> · nada ha cambiado';
  } else {
    detalle = '<strong>'+num(ent.nuevas||0)+'</strong> fila'+((ent.nuevas||0)===1?'':'s')+' nueva'+((ent.nuevas||0)===1?'':'s')+
      (ent.duplicadas ? ' · '+num(ent.duplicadas)+' ya estaba'+(ent.duplicadas===1?'':'n')+' por otro fichero' : '')+
      (res.reemplazado ? ' · sustituye a la versión anterior del mismo nombre' : '');
  }
  const nFich = (store.ficheros||[]).length;
  if(el) el.innerHTML='<span class="f-dot '+punto+'"></span><span class="f-name">'+esc(fileName)+'</span>'+
    '<span class="f-meta">'+esc(rep.label)+' · reconocido por '+esc(how||'asignación manual')+' · '+detalle+
    (nFich>1 ? ' · el informe se fusiona a partir de '+nFich+' ficheros' : '')+hnote+
    (avisos.length ? '<br>'+avisos.map(a=>'<span class="'+(a.nivel==='stop'?'neg':'warn')+'">⚠ </span>'+a.txt).join('<br>') : '')+
    '</span>'+
    '<span class="f-right"><strong>'+num(store.count)+'</strong> filas · '+headers.length+' col.</span>';
  /* B1 · la foto de stock NO se archiva sin la fecha del informe. Antes se
     sellaba con `iso(today())`: un informe del 22 de agosto subido el 5 de
     septiembre borraba catorce días de roturas reales del histórico, y eso no
     se corrige reimportando. Así que aquí se pregunta, en la propia fila del
     fichero, y hasta que no se conteste el histórico no se toca. */
  if(el && hg && hg.stock && hg.stock.sinFecha) pedirFechaFoto(el, hg.stock.motivo);
  refreshAll();
  return store;
}
/* Pregunta la fecha de la foto de stock y, con ella, archiva. */
function pedirFechaFoto(el, motivo){
  const w = document.createElement('div');
  w.className = 'note-box warn';
  w.style.margin = '6px 0 10px';
  w.innerHTML = '<strong>No archivo esta foto de stock: no sé de qué día es.</strong><br>'+
    esc(motivo||'')+'. Los informes de <em>Gestión de inventario</em> y de <em>Inventario multipaís</em> '+
    'no traen ninguna columna de fecha, y sellarla con la de hoy borraría del histórico las roturas '+
    'de los días intermedios — y eso no se arregla reimportando.<br>'+
    '<label style="display:inline-flex;gap:8px;align-items:center;margin-top:8px">'+
    '¿De qué día es el informe? <input type="date" class="inp" style="width:auto"></label> '+
    '<button class="btn sm primary">Archivar la foto</button> '+
    '<span class="mut" style="margin-left:8px">También puedes cargar el informe de <em>Salud del inventario</em>, '+
    'que trae <code>snapshot-date</code>, y se coge de ahí.</span>';
  const inp = w.querySelector('input'), btn = w.querySelector('button');
  inp.max = iso(today());
  btn.onclick = ()=>{
    if(!inp.value){ toast('Pon la fecha del informe: sin ella el histórico se queda como está.'); return; }
    if(!DB.settings) DB.settings = {};
    DB.settings.stockDate = inp.value;
    const r = captureStock();
    saveDB();
    if(r && r.sinFecha){ toast('Sigo sin poder archivarla: '+r.motivo); return; }
    w.className = 'note-box';
    w.innerHTML = '<strong>Foto de stock archivada con fecha '+esc(r.fecha)+'</strong> · '+
      num(r.skus)+' referencias · '+num(r.disp)+' disponibles, '+num(r.noDisp)+
      ' presentes sin poder venderse, '+num(r.total)+' en almacén.'+
      (r.reescribe ? ' <span class="warn">Reescribe '+num(r.reescribe)+' foto(s) posteriores.</span>' : '');
    refreshAll();
  };
  el.parentNode.insertBefore(w, el.nextSibling);
}

/* ---------- Asistente manual: se hace una vez y queda guardado ---------- */
function openMapper(fileName, headers, rows, sig, el, repPre, mapPre){
  const P = sheetProfile(headers, rows);
  const opts = h => '<option value="">— ninguna —</option>' + headers.map(x=>{
    const k=normHdr(x), pr=P.byKey[k];
    const ej = pr && pr.sample && pr.sample.length ? '  ·  ej: '+pr.sample.slice(0,2).join(' / ') : '';
    return '<option value="'+esc(k)+'"'+(h===k?' selected':'')+'>'+esc(x)+esc(ej.slice(0,52))+'</option>';
  }).join('');

  function body(repId){
    const rep = REPORTS.filter(r=>r.id===repId)[0];
    if(!rep) return '';
    const P2 = P;
    const auto = mapPre && repPre && repPre.id===repId ? mapPre : resolveFields(rep, headers, P2).map;
    const fs = Object.keys(rep.fields||{});
    if(!fs.length) return '<div class="note-box warn" style="margin:0">Este informe solo se admite con las cabeceras en inglés.</div>';
    return '<div class="tbl-wrap"><table class="grid"><tr><th>Dato que necesito</th><th></th><th>Columna de tu archivo</th></tr>'+
      fs.map(f=>'<tr><td class="name">'+esc(FIELD_LABEL[f]||f)+
        (rep.fields[f].req?' <span class="pill stop">obligatorio</span>':' <span class="pill">opcional</span>')+'</td>'+
        '<td class="mut">→</td>'+
        '<td><select id="mapf_'+f+'">'+opts(auto[f])+'</select></td></tr>').join('')+
      '</table></div>';
  }

  openModal('Asignar columnas · '+fileName,
    'Dime qué columna de tu archivo contiene cada dato. Se guarda para siempre: la próxima vez que sueltes un informe con estas mismas columnas, lo reconoceré solo.',
    '<div class="field"><label>¿Qué informe es?</label><select id="mapRep" onchange="mapperSwitch()">'+
      REPORTS.filter(r=>!r.onlyEn).map(r=>'<option value="'+r.id+'"'+(repPre&&repPre.id===r.id?' selected':'')+'>'+
        esc(r.label)+'  ('+esc(r.en)+')</option>').join('')+
    '</select></div><div id="mapBody">'+body(repPre?repPre.id:REPORTS[0].id)+'</div>',
    ()=>{
      const repId = val('mapRep');
      const rep = REPORTS.filter(r=>r.id===repId)[0];
      const map={}, falta=[];
      Object.keys(rep.fields||{}).forEach(f=>{
        const v = val('mapf_'+f);
        if(v) map[f]=v; else if(rep.fields[f].req) falta.push(FIELD_LABEL[f]||f);
      });
      if(falta.length){ toast('Falta asignar: '+falta.join(', ')); return; }
      saveImport(rep, headers, rows, map, fileName, el, 'asignación manual');
      toast('Guardado. La próxima vez lo reconoceré solo.');
    });
  window.mapperSwitch = ()=>{ document.getElementById('mapBody').innerHTML = body(val('mapRep')); };
}

function wipeImports(){
  if(!confirm('Se borran los informes importados. Tus productos, proveedores, pedidos y el HISTÓRICO se conservan.')) return;
  DB.imports={};
  /* Las notas de los preprocesos hablan de ficheros que ya no están: dejarlas
     sería enseñar la trazabilidad de unos datos borrados. */
  try{ if(typeof REGISTRO==='object' && REGISTRO) REGISTRO.notas.length = 0; }catch(e){}
  saveDB(); refreshAll(); toast('Datos importados vaciados · el histórico sigue intacto');
}
function forgetMappings(){
  if(!confirm('Se olvidan las asignaciones de columnas que guardaste. Los datos importados se conservan.')) return;
  DB.mappings={}; saveDB(); renderDatos(); toast('Asignaciones olvidadas');
}
/* =========================================================================
   4 · DERIVADOS  ·  todo lo que el hub calcula a partir de lo importado
   ========================================================================= */
function imp(id){ return (DB.imports[id]&&DB.imports[id].rows) || []; }
/* Lee un campo por su nombre interno y, si no está, por el nombre inglés
   original: así los datos importados antes de este cambio siguen valiendo. */
function gv(r){ for(let i=1;i<arguments.length;i++){ const k=arguments[i];
  if(r[k]!==undefined && r[k]!=='') return r[k]; } return undefined; }
function hasImp(id){ return imp(id).length>0; }
function prodBySku(){ const m={}; DB.products.forEach(p=>m[String(p.sku).toLowerCase()]=p); return m; }
function findProd(sku){ return prodBySku()[String(sku||'').toLowerCase()] || null; }
/* Coste base del producto. Desde M1.1 ya no es la última palabra: es la red de
   seguridad para las unidades que ningún lote de compra cubre. Quien decide el
   coste de una venta concreta es unitCostAt(), en 12c-lotes.js. */
function landed(p){ return p ? (toNum(p.cogs)+toNum(p.freight)) : 0; }
/* La divisa en la que el hub hace sus cuentas. Una sola, y declarada: el
   catálogo de tarifas y el informe de pedidos la comparan contra esto para
   dejar fuera lo que no se puede sumar sin un tipo de cambio. */
const DIVISA_VENTAS = 'EUR';
function periodStart(){ return periodDays ? addDays(today(), -periodDays) : new Date(2000,0,1); }

/* Días que dura el periodo que se está mirando.

   `periodDays = 0` es el botón «Todo», y valer cero lo hacía falsy: cada
   `periodDays||30` caía al literal 30. Con un informe de 120 días, «Todo»
   comparaba cuatro meses de ventas contra UN mes de gastos fijos (+10,9 puntos
   de margen), anualizaba ×12,17 lo que ya eran cuatro meses («Aporta al año
   €66.635» donde eran €4.100) y multiplicaba por cuatro la velocidad de venta,
   con lo que Inventario mandaba pedir 2.156 unidades donde tocaban 311. Ni un
   dato cambiaba: solo el botón. */
function daysInPeriod(){
  if(periodDays) return periodDays;
  const sp = salesSpan();
  return sp.days || 30;
}

/* Días que el informe de pedidos cubre DE VERDAD dentro del periodo elegido.

   No es lo mismo que `daysInPeriod()`: pedir «12 meses» con un informe de 120
   días no convierte los otros 245 en días de venta cero, convierte el informe
   en insuficiente. Dividir entre 365 hundía la velocidad a un tercio y hacía
   desaparecer de Inventario la única referencia en rotura. La velocidad se
   mide sobre los días observados; que el informe no llegue se dice, no se
   promedia con ceros inventados. */
/* Hasta qué día llega DE VERDAD el informe de pedidos.

   Es una propiedad del fichero, no de la vista: no depende del filtro de país
   ni del periodo elegido. Por eso se mide sobre el informe entero. */
function salesCoverage(){
  const rows = salesRows({from:null, country:'ALL'});
  let max=null;
  rows.forEach(r=>{ if(r.date && (!max || r.date>max)) max=r.date; });
  return max;
}

/* B1 · EL EXTREMO DERECHO ES LA ÚLTIMA FECHA QUE CUBRE EL INFORME.

   Estaba fijado en `today()` con este argumento, que sigue siendo cierto: un
   SKU que dejó de venderse hace un mes tiene ese mes de días observados con
   cero ventas, y contarlos es lo que baja su velocidad. Lo que faltaba es la
   otra mitad. Si el informe COMPLETO se corta hace quince días —lo normal
   cuando se descarga «últimos 30 días» un lunes y se mira el jueves, o cuando
   Seller Central tarda en consolidar—, esos quince días no son días de venta
   cero: son días sin medir. Meterlos en el divisor diluye la velocidad de todo
   el catálogo a la vez.

   Medido en el laboratorio de esta rama (tests/fechas.test.js, caso FECHA-A):
   un informe con 10 ud/día durante 16 días que termina hace 15
     con el fallo  = 160 ud / 30 días de ventana =  5,33 ud/día
     arreglado     = 160 ud / 16 días cubiertos  = 10,00 ud/día
   Es la diferencia entre mandar pedir la mitad de lo que hace falta.

   La distinción entre las dos mitades es que el corte se mide sobre el informe
   ENTERO: si cualquier SKU vendió ayer, el informe cubre hasta ayer y el que no
   vendió sí tiene sus días a cero. */
function salesSpan(opt){
  const rows = salesRows(opt);
  let min=null;
  rows.forEach(r=>{ if(!r.date) return;
    if(!min || r.date<min) min=r.date; });
  const hoy0 = startOfDay(today());
  const cob = salesCoverage();
  if(!min) return {from:null, to:null, days:0, cubreHasta:cob, diasSinCubrir: cob ? Math.max(0, daysBetween(cob, hoy0)) : 0, alDia:!cob};
  const hasta = (cob && cob < hoy0) ? cob : hoy0;
  return {from:min, to:hasta, days: Math.max(1, daysBetween(min, hasta)+1),
          cubreHasta: cob, diasSinCubrir: cob ? Math.max(0, daysBetween(cob, hoy0)) : 0,
          alDia: !!cob && daysBetween(cob, hoy0)===0};
}

/* Ventas normalizadas desde el informe de pedidos.
   Sin argumentos se comporta como siempre: periodo y país de la interfaz.
   El histórico (M0) la llama con {from:null, country:'ALL'} porque archiva el
   negocio entero, no la vista que tengas abierta. */
function salesRows(opt){
  opt = opt || {};
  const from = opt.from !== undefined ? opt.from : periodStart();
  const cf   = opt.country !== undefined ? opt.country : countryFilter;
  /* B2 · las fechas que no pueden ser, se descartan, se cuentan y se enseñan.
     Una venta con fecha de mañana no es una venta de mañana: es una celda mal
     formada, un huso mal resuelto por el exportador o un serial de hoja de
     cálculo. Dejarla pasar alarga el rango observado hacia delante y diluye la
     velocidad de todo el catálogo, que es el mismo daño que B1 por el otro
     lado. Se cuentan aparte de las que caen por divisa. */
  const hoy0 = startOfDay(today());
  const fechas = {futuras:0, ilegibles:0};
  const todas = imp('orders').map(r=>{
    const cruda = gv(r,'_date','purchasedate');
    let d = parseDate(cruda);
    if(!d){ if(String(cruda==null?'':cruda).trim()!=='') fechas.ilegibles++; }
    else if(d > hoy0){ fechas.futuras++; d = null; }
    const st = String(gv(r,'_status','itemstatus','orderstatus')||'').toLowerCase();
    const ful = gv(r,'_fulfil','fulfillmentchannel');
    return {
      date:d, sku:gv(r,'_sku','sku')||'', asin:gv(r,'_asin','asin')||'',
      qty: toNum(gv(r,'_qty','quantity')),
      revenue: toNum(gv(r,'_amount','itemprice')),
      tax: toNum(gv(r,'_tax','itemtax')),
      /* La columna de impuesto es OPCIONAL en este informe (`_tax` req:0), así
         que hay que distinguir «el IVA es cero» de «no me han dicho el IVA».
         Confundirlos era el fallo más caro del hub: ver taxBasis(). */
      taxSeen: (()=>{
        const v = gv(r,'_tax','itemtax');
        if(!hayNumero(v)) return false;
        /* Un 0,00 literal de IVA sobre una venta con importe, en un país con
           tipo general distinto de cero, no es «el IVA es cero»: es la columna
           sin poblar. Amazon no cobra 0 % en una venta corriente en España. Se
           trata como sin dato para que taxBasis() lo deduzca, que baja el
           ingreso neto y por tanto el beneficio: nunca infla.
           En los informes reales de Juancho no aparece ni un cero literal, así
           que esto es una red, no una corrección de algo que esté pasando. */
        if(toNum(v) !== 0) return true;
        const imp = toNum(gv(r,'_amount','itemprice'));
        if(imp === 0) return true;                  // línea sin importe: cero coherente
        const c = countryOf(gv(r,'_channel','saleschannel')) || countryOf(gv(r,'_country','shipcountry'));
        const nom = c ? (COUNTRIES.filter(x=>x.code===c)[0]||{}).vat : null;
        return !(nom > 0);
      })(),
      cur: String(gv(r,'_cur','currency')||'').trim().toUpperCase(),
      oid: String(gv(r,'_oid','amazonorderid','orderid')||'').trim(),
      country: countryOf(gv(r,'_channel','saleschannel')) || countryOf(gv(r,'_country','shipcountry')) || null,
      fbm: ful ? /merchant|mfn|vendedor|comerciante/i.test(ful) : null,
      /* Un pedido PENDIENTE no es una venta: el comprador todavía no ha pagado
         y el informe lo trae sin importe. Contarlo sumaba unidades fantasma
         —que bajan el precio medio— y, peor, les cobraba tarifa de logística
         a unidades que nunca se enviaron. «Sin enviar» sí es una venta y no
         entra aquí. */
      cancelled: st.indexOf('cancel')>=0 || st.indexOf('anulad')>=0 ||
                 st==='pending' || st==='pendiente'
    };
  });
  /* Divisa · de 238 líneas reales de un mes, UNA venía en zlotys, y contarla
     como si fueran euros sobrestimaba el ingreso en 38,46 € sobre 3.237,73 €.
     Se excluye y se dice cuántas: convertir con un tipo de cambio que no
     tenemos sería inventarse la cifra, y excluir nunca infla el ingreso.
     Las líneas sin divisa declarada se dejan pasar — son las canceladas y las
     `Non-Amazon` sin importes, que ya no suman nada. */
  const otraDivisa = {};
  const enDivisa = todas.filter(r=>{
    if(!r.cur || r.cur===DIVISA_VENTAS) return true;
    otraDivisa[r.cur] = (otraDivisa[r.cur]||0) + 1;
    return false;
  });
  const out = enDivisa.filter(r=>r.date && !r.cancelled && (!from || r.date>=from) &&
               (cf==='ALL' || r.country===cf));
  out.meta = {otraDivisa, fueraPorDivisa:Object.keys(otraDivisa).reduce((a,k)=>a+otraDivisa[k],0),
              fechas, fueraPorFecha: fechas.futuras + fechas.ilegibles};
  return out;
}
/* =========================================================================
   IVA realmente aplicado · el informe de transacciones sujetas al IVA

   Por qué esto es lo que más dinero mueve del hub. El código fiscal de producto
   de la cuenta puede ser uno de alimentación aplicado a artículos que no lo
   son, y entonces Amazon liquida tipos reducidos —del orden del 5 % al 10 %
   según el país— donde correspondería el general. Las cifras medidas sobre los
   informes reales NO van aquí: este repositorio es público. Están en el
   documento del proyecto, en el traspaso correspondiente.

   Ese coste no estaba en ninguna pantalla, así que todos los márgenes que el
   hub enseñaba eran optimistas en unos once puntos. No es un fallo de cálculo
   del hub: es una deuda fiscal real que el hub no veía.

   Dos cosas distintas salen de aquí:

   · el IVA MEDIDO por pedido, que cierra el hueco de las líneas de `orders` que
     vienen sin importe de impuesto y sustituye a la deducción por tipo nominal;
   · el DETECTOR, que compara el tipo aplicado con el general del país y dice
     cuánto se está dejando de repercutir. Ese sigue haciendo falta aunque el
     IVA esté medido, porque medir bien una liquidación equivocada no la
     arregla.
   ========================================================================= */
/* Fecha de una transacción del informe de IVA. Amazon la escribe «31-07-2026»
   —día, mes y año con GUIONES—, que `parseDate()` no lee: solo entiende el
   formato europeo con barra o punto. Se prueba primero la fecha en que se
   completó la transacción, luego la del cálculo del impuesto y la de salida. */
function vatFechaFila(r){
  const v = gv(r,'transactioncompletedate','taxcalculationdate','transactiondepartdate');
  if(v==null || v==='') return null;
  const m = String(v).trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if(m) return fechaValida(+m[3], +m[2], +m[1]);
  return parseDate(v);
}

/* `vatReport(opts)` · SIN argumentos hace lo de siempre, sobre TODO el informe
   —el dossier para la gestoría depende de eso y no cambia—. Con `opts` se corta
   a un periodo (`desde`, `hasta`) y a un país (`pais`, código ISO de la
   jurisdicción), y es lo que usa la cuenta de resultados.

   Por qué hace falta, medido el 29-09-2026 contra los informes reales: la
   cuenta de resultados restaba la deuda de IVA del informe ENTERO fuese cual
   fuese el periodo mirado. Con un informe de tres meses y la pantalla en «30
   días», el mes salía cargado con la deuda de los tres, y aunque ese mes no
   hubiera ninguna venta, el beneficio salía negativo por el importe completo.
   Con un filtro de país, igual: un país cargaba la deuda de todos.

   Una fila sin fecha legible no se puede colocar en ningún periodo: con corte
   se queda fuera y se cuenta en `sinFecha`, para que la pantalla lo diga. */
/* ── LA DEUDA DE IVA DE UN MES SIN PEDIDOS CARGADOS NO SE RESTA AL BENEFICIO ──

   Medido el 2-10-2026 con los informes reales: el de IVA cubre mayo, junio y
   julio de 2026; los de pedidos, agosto y septiembre de 2025 y junio y julio de
   2026. En «Todo», el P&L restaba la deuda de MAYO contra un ingreso que no
   tenía las ventas de mayo: la línea de IVA era la verdadera y el beneficio,
   falso, porque comparaba un coste de tres meses con ingresos de dos.

   Aquí se separan los meses que el informe de IVA trae con ventas y para los
   que NO hay ni un pedido cargado. Su deuda no se resta al beneficio del
   periodo —no hay con qué compararla— y la pantalla dice cuánto es y de qué
   meses. No desaparece: sigue entera en la pantalla de IVA y en el dossier de
   la gestoría, que no pasan por aquí.

   Lo que NO hace: mirar la cobertura por día. Un mes con un solo pedido cargado
   cuenta como cubierto. Es la granularidad con que se descargan los informes,
   y se dice. */
function ivaMesesSinVentas(S, pais, desde){
  const out = {meses:[], difTuya:0, diferencia:0, ventas:0};
  const rows = imp('vat');
  if(!rows.length) return out;
  /* La cobertura es la del INFORME de pedidos, no la de las ventas que se
     miran: con el filtro de un país, que Italia no venda un mes no quiere decir
     que falte el informe de ese mes. Por eso se leen las fechas de todos los
     pedidos importados, sin periodo ni país. */
  const conVentas = {};
  /* Un pedido cancelado o pendiente, o en otra divisa, no es una venta del
     P&L: no puede dar un mes por cubierto (lo encontró la revisión adversarial
     del 3-10-2026: un único pedido cancelado hacía restar la deuda del mes
     entero contra cero ingresos de ese mes). */
  imp('orders').forEach(r=>{
    const st = String(gv(r,'_status','itemstatus','orderstatus')||'').toLowerCase();
    if(st.indexOf('cancel')>=0 || st.indexOf('anulad')>=0 || st==='pending' || st==='pendiente') return;
    const cur = String(gv(r,'_cur','currency','divisa')||'').trim().toUpperCase();
    if(cur && cur!==DIVISA_VENTAS) return;
    const d = parseDate(gv(r,'_date','purchasedate'));
    if(d && !isNaN(d)) conVentas[iso(d).slice(0,7)] = 1; });
  const mesesIva = {};
  rows.forEach(r=>{
    const t = String(gv(r,'_ttype','transactiontype')||'').toUpperCase();
    if(t && t.indexOf('SALE')<0) return;
    const f = vatFechaFila(r); if(!f) return;
    if(desde && f < startOfDay(desde)) return;
    mesesIva[iso(f).slice(0,7)] = 1;
  });
  Object.keys(mesesIva).sort().forEach(m=>{
    if(conVentas[m]) return;
    const y = +m.slice(0,4), mo = +m.slice(5,7);
    let ini = new Date(y, mo-1, 1), fin = new Date(y, mo, 0);
    if(desde && ini < startOfDay(desde)) ini = startOfDay(desde);
    const V = vatReport({desde:ini, hasta:fin, pais});
    if(!V.ventas && !V.difTuya) return;
    out.meses.push(m); out.difTuya += V.difTuya; out.diferencia += V.diferencia; out.ventas += V.ventas;
  });
  return out;
}

function vatReport(opts){
  const rows = imp('vat');
  const out = {rows:rows.length, ventas:0, base:0, vat:0, diferencia:0, ventasReducidas:0,
               difTuya:0, difDelMercado:0, sinResponsable:0,
               porPais:{}, porCodigo:{}, porPedido:{}, periodos:{}, sinJuris:0, ventasCero:0,
               sinFecha:0, fueraDeCorte:0, cortado:!!opts, ventasB2BCero:0, baseB2BCero:0, diferenciaIvaIncluido:0,
               reembolsos:0, baseReembolsos:0, reembolsosReducidos:0, difReembolsos:0,
               difReembolsosIncl:0, reembSinJuris:0};
  if(!rows.length) return out;
  const corte = opts || null;
  rows.forEach(r=>{
    const tipoTx = String(gv(r,'_ttype','transactiontype')||'').toUpperCase();
    /* Ventas y REEMBOLSOS. El resto —traslados entre almacenes (FC_TRANSFER),
       devoluciones físicas sin importe (RETURN), facturas y abonos de Amazon a
       ti (INVOICE, CREDIT_NOTE)— no es venta tuya a un cliente.

       Los reembolsos entran desde el 2-10-2026, medido contra el informe real:
       42 filas REFUND con base e IVA en negativo y el mismo tipo reducido de la
       venta que anulan. Un reembolso rectifica la base de esa venta, y con ella
       la deuda. Contando solo ventas, la deuda salía por encima de la real. */
    const esReemb = tipoTx.indexOf('REFUND') >= 0;
    if(tipoTx && tipoTx.indexOf('SALE')<0 && !esReemb) return;
    if(corte && (corte.desde || corte.hasta)){
      const f = vatFechaFila(r);
      if(!f){ out.sinFecha++; return; }
      if((corte.desde && f < startOfDay(corte.desde)) || (corte.hasta && f > startOfDay(corte.hasta))){
        out.fueraDeCorte++; return; }
    }
    if(corte && corte.pais){
      const pj = paisDeJuris(gv(r,'_juris','taxablejurisdiction','salearrivalcountry'));
      if(pj !== corte.pais){ out.fueraDeCorte++; return; }
    }
    /* `TAXABLE_JURISDICTION` trae el nombre COMPLETO del país, no el código
       ISO. Cortar por las dos primeras letras daba `SP`, `GE`, y `PO` para
       Portugal y Polonia a la vez: ninguno encontraba su tipo general y la
       diferencia salía cero justo en el país que más pesa. */
    const pais = paisDeJuris(gv(r,'_juris','taxablejurisdiction','salearrivalcountry'));
    const base = toNum(gv(r,'_base','totalpriceofitemsamtvatexcl','totalactivityvalueamtvatexcl'));
    const iva  = toNum(gv(r,'_vat','totalpriceofitemsvatamt','totalactivityvaluevatamt'));
    /* El tipo viene en fracción decimal: 0.1 es el 10 %. Un informe que lo
       trajera ya en porcentaje daría 1000 % al multiplicar, así que se
       distingue por el orden de magnitud en vez de confiar en el formato. */
    const rateRaw = gv(r,'_rate','priceofitemsvatratepercent','vatratepercent');
    const rateSeen = rateRaw !== undefined && rateRaw !== null && String(rateRaw).trim() !== '';
    let pct = toNum(rateRaw);
    if(pct > 1) pct = pct/100;
    /* Y si no viene, se calcula del propio importe, que es más fiable que
       suponer. */
    if(!(pct>0) && base!==0 && iva/base>0) pct = iva/base;
    const aplicado = pct*100;
    const general  = VAT_GENERAL[pais];

    if(pais && !out.porPais[pais]) out.porPais[pais] = {ventas:0, base:0, vat:0, dif:0, tipos:{}};
    if(esReemb){
      /* Un reembolso no es una venta: no suma a ventas, base ni tipos. Solo
         rectifica la deuda de abajo, y se cuenta aparte. */
      out.reembolsos++; out.baseReembolsos += base;
      if(!pais) out.reembSinJuris++;
    } else {
    out.ventas++; out.base += base; out.vat += iva;
    if(pais) { const P = out.porPais[pais];
      P.ventas++; P.base += base; P.vat += iva;
      P.tipos[aplicado.toFixed(1)] = (P.tipos[aplicado.toFixed(1)]||0)+1; }
    else out.sinJuris++;
    const ptc = String(gv(r,'_ptc','producttaxcode')||'').trim();
    if(ptc) out.porCodigo[ptc] = (out.porCodigo[ptc]||0)+1;
    const per = String(gv(r,'_period','activityperiod')||'').trim();
    if(per) out.periodos[per] = (out.periodos[per]||0)+1;

    /* El identificador de pedido permite cruzar con `orders` y tomar el IVA
       medido en vez de deducirlo. En el fichero real viene en 265 de 294 filas. */
    const ev = String(gv(r,'_event','transactioneventid','activitytransactionid')||'').trim();
    const oid = (ev.match(/\d{3}-\d{7}-\d{7}/)||[])[0] || null;
    if(oid){ const O = out.porPedido[oid] || (out.porPedido[oid] = {base:0, vat:0});
      O.base += base; O.vat += iva; }

    /* Una venta a tipo CERO declarado tambien es una diferencia, y de las que
       mas llaman la atencion a un inspector. Antes quedaba fuera por exigir
       `aplicado > 0`. Se cuenta aparte para poder senalarla. */
    if(rateSeen && aplicado <= 0.05) out.ventasCero = (out.ventasCero||0) + 1;
    }
    /* Una venta a tipo CERO a un comprador con NIF-IVA no es una deuda: es una
       venta entre empresas —entrega intracomunitaria exenta, o inversión del
       sujeto pasivo cuando el vendedor no está establecido en ese país— y el
       tipo cero es el correcto. Medido el 29-09-2026: las 14 ventas a tipo
       cero del informe real llevan TODAS número de IVA del comprador, y el
       hub las cargaba como deuda al tipo general. Se cuentan aparte para que
       la gestoría las vea, pero no suman. */
    const nifComprador = String(gv(r,'buyervatnumber')||'').trim();
    if(rateSeen && aplicado <= 0.05 && nifComprador){
      if(!esReemb){
        out.ventasB2BCero++; out.baseB2BCero += base;
        if(pais) out.porPais[pais].b2bCero = (out.porPais[pais].b2bCero||0) + 1;
      }
      return;
    }
    if(general > 0 && (aplicado > 0 || rateSeen) && aplicado < general - 0.05){
      /* La deuda es la diferencia entre lo que habria que haber repercutido al
         tipo general y lo que Amazon repercutio DE VERDAD, no entre dos tipos
         nominales: el importe de cada linea viene ya redondeado al centimo y
         restar tipos deja un residuo que no existe en ningun sitio. */
      const dif = base*general/100 - iva;
      out.diferencia += dif;
      if(esReemb){ out.reembolsosReducidos++; out.difReembolsos += dif; }
      else out.ventasReducidas++;
      if(pais) out.porPais[pais].dif += dif;
      /* La MISMA deuda con el otro criterio que puede aplicar Hacienda: que lo
         que pagó el cliente ya incluía el IVA (TJUE C-249/12, Tulică). Entonces
         la base se recalcula hacia abajo y la deuda es menor. Qué criterio toca
         lo decide la gestoría, no el hub: se enseñan los dos. */
      const difIncl = (base+iva)*general/(100+general) - iva;
      out.diferenciaIvaIncluido += difIncl;
      if(esReemb) out.difReembolsosIncl += difIncl;
      if(pais) out.porPais[pais].difIncl = (out.porPais[pais].difIncl||0) + difIncl;
      /* De quién es la deuda. Cuando Amazon actúa como sujeto pasivo —el
         `TAX_COLLECTION_RESPONSIBILITY` es del mercado— el que responde ante
         Hacienda es Amazon y a ti no te lo van a reclamar. Cuando eres tú, o
         cuando el informe no lo dice, la diferencia es tuya y entra en la
         cuenta de resultados: si la columna falta, cargarla es lo prudente,
         porque el error caro es creerte un margen que no tienes. */
      const resp = String(gv(r,'_resp','taxcollectionresponsibility')||'').toUpperCase();
      if(!resp) { out.sinResponsable++; out.difTuya += dif; }
      else if(/MARKETPLACE|AMAZON|DEEMED/.test(resp)) out.difDelMercado += dif;
      else out.difTuya += dif;
    }
  });
  return out;
}

/* Comisiones reales desde la liquidación.

   Dos cosas que hay que distinguir y antes no se distinguían:

   · `rows` son las filas de liquidación que caen en el periodo. `matched` son
     las que además traen una columna de tarifa que este lector entiende. La
     diferencia importa porque el fichero plano de liquidación tiene dos
     esquemas y solo el viejo lleva `item-related-fee-type`. Con el que Amazon
     sirve hoy, `rows` sale alto y `matched` cero: las columnas están, pero se
     llaman de otra manera. Contar filas para decidir si el dato está medido
     hacía que la comisión saliera 0 € y el beneficio subiera un 23 %, con la
     etiqueta «medido» encima.

   · `desde`/`hasta` acotan lo que la liquidación cubre de verdad, y solo con
     las filas entendidas. Amazon liquida cada 14 días: una liquidación suelta
     cubre una quincena, no el trimestre que estés mirando en pantalla. Sin
     esto, 14 días de comisiones se restaban a 90 días de ingresos. */
function settlementFees(){
  const from = periodStart();
  let referral=0, refCredito=0, fba=0, storage=0, other=0, promo=0, rows=0, matched=0;
  let desde=null, hasta=null;
  imp('settlement').forEach(r=>{
    const d = parseDate(r.posteddate)||parseDate(r.settlementstartdate);
    if(!d || d<from) return;
    if(countryFilter!=='ALL' && countryOf(r.marketplacename)!==countryFilter) return;
    rows++;
    const t=(r.itemrelatedfeetype||'')+' '+(r.orderfeetype||'')+' '+(r.shipmentfeetype||'');
    const amt = toNum(r.itemrelatedfeeamount)+toNum(r.orderfeeamount)+toNum(r.shipmentfeeamount);
    if(!t.trim() && !amt) return;              // fila de un esquema que no leo
    matched++;
    if(!desde || d<desde) desde=d;
    if(!hasta || d>hasta) hasta=d;
    const tl = t.toLowerCase();
    if(tl.indexOf('commission')>=0||tl.indexOf('referral')>=0){
      /* E6 · EL CRÉDITO DE COMISIÓN DE UN REEMBOLSO, CONTADO DOS VECES.

         En la liquidación, la comisión de una venta viene NEGATIVA (te la
         cobran) y la del reembolso de esa venta viene POSITIVA (te la
         devuelven). Sumando las dos en el mismo saco, `referral` salía ya neto
         de reembolsos. Y `pnl()`, por su cuenta, vuelve a acreditar esa misma
         comisión en la línea de devoluciones (`retComision`), que estima desde
         el informe de devoluciones. El mismo crédito, dos veces.

         MEDIDO EN ESTA BASE el 17-09-2026, antes del arreglo: 10 ventas de
         100 €, comisión liquidada −150,00 €, crédito del reembolso +12,00 €,
         una devolución. Sin liquidación el beneficio salía 507,996 €; con
         ella, 519,996 €. Doce euros exactos de más sobre 1.000 € de venta
         —un 2,4 %— por un fichero que solo añade información.

         EL ARREGLO, DEL LADO DE `settlementFees()`: `referral` pasa a ser lo
         que Amazon COBRA de comisión, y el crédito sale aparte en
         `refCredito`. Así `pnl()` acredita el reembolso una sola vez, por la
         puerta que ya tenía. Si el informe de devoluciones no está cargado, el
         crédito no se aplica y la comisión sale ALTA: el beneficio queda corto,
         que es el lado por el que equivocarse no cuesta dinero.

         COSTURA → carril 5: lo ideal es que `pnl()` prefiera `sf.refCredito`
         —medido, viene de la liquidación— sobre `retComision` —estimado desde
         el informe de devoluciones— cuando la liquidación cubre el periodo.
         Eso es cuerpo de `pnl()`, que no es mío. Queda documentado en
         `docs/carriles/3-reclamaciones.md` y el dato ya está publicado aquí. */
      if(amt > 0) refCredito += amt;
      else referral += amt;
    }
    else if(tl.indexOf('fba')>=0||tl.indexOf('fulfil')>=0) fba += amt;
    else if(tl.indexOf('storage')>=0) storage += amt;
    else other += amt;
    promo += toNum(r.promotionamount);
  });
  const out = {referral:-referral, fba:-fba, storage:-storage, other:-other, promo:-promo,
               refCredito, rows, matched, desde, hasta,
               txRows:0, txMatched:0, dupPagos:0, dupFilas:0,
               fuente: matched>0 ? 'liquidación' : (rows>0 ? 'liquidación sin leer' : 'ninguna')};
  /* ── La segunda fuente · el informe de transacciones (22-transacciones.js) ──
     La liquidación plana cubre una quincena y Amazon la retira el 11-nov-2026.
     El informe de transacciones cubre el rango que le pidas. Se suman las dos,
     DEDUPLICANDO por identificador de pago: cada fila de transacciones lleva el
     `settlement-id` de la liquidación a la que pertenece, así que lo que ya
     viene en el fichero plano no se vuelve a contar. Sin eso, cargar los dos
     ficheros duplicaría las comisiones de la quincena solapada. */
  if(typeof txHay === 'function' && txHay()){
    /* Las tarifas medidas tienen que venir del mismo intervalo que las ventas
       contra las que se van a restar. Con el botón «Todo», `periodStart()` es
       el año 2000 y el informe de transacciones trae cuatro años de tarifas:
       sin este tope se restaban a las ventas que hubiera cargado el informe de
       pedidos, cubrieran lo que cubrieran. */
    const sp = (typeof salesSpan === 'function') ? salesSpan() : null;
    const desdeVentas = (sp && sp.from && sp.from > from) ? sp.from : from;
    const cont = txContraste(desdeVentas);
    out.txContraste = cont;
    if(!cont.ok){
      /* Las dos fuentes no hablan del mismo negocio. Las tarifas del informe de
         transacciones NO entran en la cuenta de resultados: `pnl()` las estimará
         desde las ventas que sí conoce, que es coherente aunque sea menos
         preciso. Siguen alimentando las reclamaciones, que no dependen del
         informe de pedidos. Medido contra ficheros reales: sin esto, el margen
         salía −867,6 %. */
      out.fuente = matched>0 ? 'liquidación · transacciones sin contrastar'
                             : 'transacciones sin contrastar';
      return out;
    }
    const t = txFees({from:desdeVentas, ventanaLiq:{desde, hasta}});
    out.referral   += t.referral;
    out.refCredito += t.refCredito;
    out.fba        += t.fba;
    out.storage    += t.storage;
    out.other      += t.other;
    out.rows       += t.rows;
    out.matched    += t.matched;
    out.txRows      = t.rows;
    out.txMatched   = t.matched;
    out.dupPagos    = t.dupPagos;
    out.dupFilas    = t.dupFilas;
    if(t.desde && (!out.desde || t.desde < out.desde)) out.desde = t.desde;
    if(t.hasta && (!out.hasta || t.hasta > out.hasta)) out.hasta = t.hasta;
    out.fuente = (matched>0 ? 'liquidación + transacciones' : 'transacciones');
  }
  return out;
}
/* Gasto y desperdicio publicitario */
function adStats(){
  /* CARRIL 4 · El cuerpo entero vive en `src/24-publicidad.js`, que es el
     fichero de este carril. Aquí queda el nombre por el que lo llaman `pnl()`
     y la pantalla.

     Lo que hacía antes, y por qué no podía quedarse: buscaba UN rango para
     todo el informe —el mínimo y el máximo de las columnas de fecha— y
     multiplicaba el gasto entero por `díasDelPeriodo / díasDelInforme`. Dos
     fallos medidos sobre el informe real de agosto de 2026:

       · `parseDate()` no entiende «ago 20, 2026» (ni ene, ni abr, ni dic),
         así que el rango salía de 65 días reales a 43, y el gasto imputado al
         periodo era un 51 % más alto de lo que tocaba. Con la etiqueta
         «medido» puesta.
       · 205 de las 1.222 filas de ese informe no son de un día, sino de tramos
         de hasta 65 días naturales. Con un factor único, el gasto de un término
         que solo corrió en junio se cargaba a un periodo de septiembre.

     Ahora cada fila se reparte entre sus días y se corta con el periodo, y el
     prorrateo se dice en pantalla. `pubAdStats()` devuelve todo lo que este
     objeto devolvía —`spend`, `spendBruto`, `adDays`, `factor`, `spanUnknown`,
     `desde`, `hasta`, `solape`, `solapePct`, `sales`, `clicks`, `impr`,
     `waste`, `wasteTerms`, `terms`, `acos`— y añade el desglose. */
  return pubAdStats();
}
/* IVA · la base sobre la que se calcula TODO margen.

   El informe de pedidos trae la columna de impuesto como opcional. Cuando
   faltaba, `tax` valía 0 y el «ingreso neto» pasaba a ser el ingreso CON IVA,
   sin un solo aviso. No es solo que inflara el margen 4,5 puntos: **invertía
   el orden entre mercados**. Amazon cobra la comisión sobre el precio con
   IVA, así que el país de tipo más alto es genuinamente el peor; sin la
   columna salía el mejor. Medido en tests/iva.test.js con tres mercados:
   DE > ES > SE se convertía en SE > ES > DE, exactamente del revés, que es
   justo la decisión para la que existe el comparador PanEU.

   Ahora, donde falta la columna, el IVA se DEDUCE del tipo del país y todo lo
   que dependa de la base queda etiquetado como estimado. Nunca medido.

   La salvaguarda del tipo efectivo observado evita el error simétrico: si en
   las filas que SÍ traen columna el IVA efectivo de ese mercado es ~0, es que
   sus precios vienen ya netos y no hay nada que deducir. Sin esto, un informe
   neto se quedaría sin IVA dos veces y el margen saldría hundido en vez de
   inflado — el mismo tipo de fallo, con el signo cambiado. */
function taxBasis(S){
  const nominal = {};
  COUNTRIES.forEach(c => { nominal[c.code] = c.vat; });

  /* Orden de preferencia del IVA de una venta:
       1 · el del informe fiscal, que es el que Amazon liquidó de verdad;
       2 · el de la columna del informe de pedidos;
       3 · deducido del tipo del país, y entonces la base va etiquetada.
     El informe fiscal manda porque es el único que sabe que a estos productos
     se les está aplicando un tipo reducido de alimentación: deducir por el tipo
     general daría un IVA más ALTO que el real y un beneficio más bajo — sería
     prudente, pero también falso, y taparía la deuda en vez de enseñarla. */
  const V = vatReport();
  const porPedido = V.porPedido || {};
  const ingresoPorPedido = {};
  S.forEach(r => { if(r.oid && porPedido[r.oid]) ingresoPorPedido[r.oid] = (ingresoPorPedido[r.oid]||0) + r.revenue; });
  let medidoFiscal = 0, revFiscal = 0;
  const ivaFiscalDe = r => {
    if(!r.oid || !porPedido[r.oid]) return null;
    const total = ingresoPorPedido[r.oid];
    /* Un pedido puede tener varias líneas: se reparte por ingreso, que es la
       única proporción que el informe permite reconstruir. */
    const parte = total>0 ? r.revenue/total : 1;
    return porPedido[r.oid].vat * parte;
  };

  const obs = {};
  S.forEach(r => {
    if(!r.taxSeen || !r.country) return;
    const o = obs[r.country] || (obs[r.country] = {rev:0, tax:0});
    o.rev += r.revenue; o.tax += r.tax;
  });
  /* Tipo a aplicar a un mercado: el que se observa si hay muestra, y si no el
     nominal del país. `tax/(rev-tax)` porque el IVA se expresa sobre la base. */
  const rateFor = c => {
    const o = obs[c];
    if(o && o.rev > 0){ const base = o.rev - o.tax; return base > 0 ? o.tax/base*100 : 0; }
    return nominal[c] != null ? nominal[c] : null;
  };

  let observed = 0, estimated = 0, revSeen = 0, revEst = 0, revBlind = 0;
  const paises = {};
  /* M1.2 · el MISMO reparto del IVA que usa el total, abierto por SKU y por
     país.

     Antes cada pantalla se lo calculaba a su manera y las tres no cuadraban:
     `pnl()` deduce el IVA que falta en la columna, pero `skuStats()` y
     `countryStats()` hacían `revenue - tax` con la columna en crudo. Con un
     informe sin columna de impuesto —el caso normal, y el que avisa Datos— el
     P&L restaba el IVA y el desglose no, así que la suma del desglose salía por
     encima del total en todo el IVA del periodo y los márgenes por SKU y por
     mercado, que son con los que se decide qué empujar, salían inflados en ese
     mismo importe.

     Aquí se anota, fila a fila, el IVA imputado y CÓMO: leído, deducido o
     imposible de saber. La suma de `porSku` y la de `porPais` son, por
     construcción, el mismo número que `tax`. */
  const porSku = {}, porPais = {}, porMes = {};
  /* Si `25-metricas.js` no estuviera —alguien lo borra, o el build se lo deja—,
     no hay vocabulario de calidad y esto reventaría con un ReferenceError en
     mitad del P&L, dejando el hub entero sin números y a las pruebas con un
     stack en vez de un mensaje. Sin ese módulo lo honesto no es suponer que
     todo está medido: es que no se sabe. Degradar a «desconocido» es el único
     lado que nunca infla un margen. */
  const peor = (typeof peorCalidad==='function') ? peorCalidad : function(){ return 'desconocido'; };
  const anota = (r, iva, cal) => {
    const sk = String(r.sku||'');
    const a = porSku[sk] || (porSku[sk] = {rev:0, tax:0, calidad:'medido'});
    a.rev += r.revenue; a.tax += iva; a.calidad = peor(a.calidad, cal);
    /* Sin país conocido el grupo se llama «??» y NO desaparece: es justo el que
       más falseaba la tabla de mercados. */
    const pk = r.country || '??';
    const b = porPais[pk] || (porPais[pk] = {rev:0, tax:0, calidad:'medido'});
    b.rev += r.revenue; b.tax += iva; b.calidad = peor(b.calidad, cal);
    /* Y por mes, para que el corte mensual no tenga que prorratear el IVA del
       SKU por ingreso: un SKU que vende en España un mes y en Alemania el
       siguiente tiene tipos distintos, y prorratear le pondría a cada mes un
       IVA que no es el suyo. El total cuadraría igual y cada mes estaría mal,
       que es la peor de las dos maneras de equivocarse. */
    const mk = iso(r.date).slice(0,7);
    const c = porMes[mk] || (porMes[mk] = {rev:0, tax:0, calidad:'medido'});
    c.rev += r.revenue; c.tax += iva; c.calidad = peor(c.calidad, cal);
  };
  S.forEach(r => {
    const f = ivaFiscalDe(r);
    if(f != null){ medidoFiscal += f; revFiscal += r.revenue; observed += f; revSeen += r.revenue;
                   anota(r, f, 'medido'); return; }
    if(r.taxSeen){ observed += r.tax; revSeen += r.revenue; anota(r, r.tax, 'medido'); return; }
    const pct = r.country != null ? rateFor(r.country) : null;
    if(pct == null){ revBlind += r.revenue; anota(r, 0, 'desconocido'); return; }   /* sin país: no deducible */
    const iva = r.revenue - r.revenue/(1 + pct/100);
    estimated += iva;
    revEst += r.revenue;
    anota(r, iva, 'estimado');
    if(r.country) paises[r.country] = pct;
  });

  const rev = revSeen + revEst + revBlind;
  return {
    tax: observed + estimated,
    observed, estimated,
    revSeen, revEst, revBlind, rev,
    medidoFiscal, revFiscal,
    /* La deuda de IVA que entra en la cuenta de resultados es la del PERIODO y
       el país que se miran, no la del informe entero. `V` sigue sirviendo el
       IVA medido por pedido, que es por pedido y no depende del corte. */
    fiscal: (()=>{
      const pais = (typeof countryFilter!=='undefined' && countryFilter!=='ALL') ? countryFilter : null;
      /* «Todo» (periodDays = 0) no corta por fecha: ahí también cuentan las
         filas sin fecha legible, que en cualquier otro periodo se quedan fuera. */
      const F = !periodDays ? (pais ? vatReport({pais}) : vatReport())
                            : vatReport({desde: periodStart(), hasta: today(), pais});
      F.sinVentas = ivaMesesSinVentas(S, pais, periodDays ? periodStart() : null);
      return F;
    })(),
    porSku, porPais, porMes,
    paisesDeducidos: paises,
    coverPct: rev > 0 ? revSeen/rev*100 : 100,
    known: revEst === 0 && revBlind === 0,   /* toda la base viene del informe */
    blind: revBlind > 0,                      /* hay ingreso sin país: ni deducible */
    quality: revEst === 0 && revBlind === 0 ? 'medida' : (revBlind > 0 ? 'desconocida' : 'estimada')
  };
}

/* Cuenta de resultados del periodo. Cada línea sabe si está medida o estimada. */
function pnl(){
  const S = salesRows();
  const grossInc = S.reduce((a,r)=>a+r.revenue,0);
  const units    = S.reduce((a,r)=>a+r.qty,0);
  const tb       = taxBasis(S);
  const tax      = tb.tax;
  const net      = grossInc - tax;
  const pm       = prodBySku();
  /* M1.1 · el coste ya no es una constante por SKU: cada venta se costea con
     el lote que le toca según el método elegido. `cost.quality` dice cuántas
     unidades están respaldadas por una compra real y cuántas por la red de
     seguridad, que es lo que permite auditar este número en vez de creérselo. */
  const cost = costOfSales(S);
  const cogs = cost.cogs, cogsKnown = cost.known;
  /* ------------------------------------------------------------------
     V2 · V3 · A1 · E1 · el desglose por SKU sale de AQUÍ, no de una
     fórmula paralela.

     `skuStats()` rehacía la cuenta con dos tasas planas —tarifas sobre
     el ingreso, publicidad sobre el ingreso— y eso no es lo que cobra
     Amazon: la tarifa de logística es un importe FIJO por unidad. Con
     una tarifa por unidad repartida como porcentaje del ingreso, la
     pieza cara paga varias veces lo que paga de verdad y la barata una
     fracción. En un catálogo donde conviven las dos, eso INVIERTE el
     orden del ABC, que es la pantalla con la que se decide qué producto
     se empuja y cuál se mata.

     Y las devoluciones y el IVA no repercutido no bajaban a ningún SKU:
     se restaban del total y desaparecían de la tabla.

     A partir de aquí, cada total que calcula esta función deja también
     su parte en `SK[sku]`, y lo que NINGÚN SKU puede llevarse —gastos
     fijos, reembolsos de Amazon— se declara en `noImputable` en vez de
     desvanecerse. `tests/coherencia.test.js` vigila la propiedad que lo
     cierra: la suma del desglose más lo no imputable es el beneficio
     del P&L, al céntimo.
     ------------------------------------------------------------------ */
  const SK = {};
  const skuDe = r => {
    const k = String(r.sku);
    return SK[k] || (SK[k] = {sku:k, units:0, revenue:0, tax:0, referral:0, fba:0,
                              ship:0, storage:0, otherFee:0, cogs:0, ppc:0,
                              returns:0, vat:0});
  };
  S.forEach(r=>{ const b=skuDe(r); b.units+=r.qty; b.revenue+=r.revenue; b.tax+=r.tax; });
  /* Reparto proporcional con el residuo asignado, para que la suma sea el
     total EXACTO y no «casi». Sin esto la coherencia se cumpliría por los
     pelos de la coma flotante y un día dejaría de cumplirse sin que nadie
     hubiera tocado nada. */
  const reparte = (total, campo, pesoDe) => {
    const ks = Object.keys(SK);
    const T = ks.reduce((a,k)=>a+pesoDe(SK[k]),0);
    if(!ks.length) return;
    if(!(T>0)){ SK[ks[0]][campo] += total; return; }
    let acc=0, mayor=ks[0];
    ks.forEach(k=>{ const v = total*(pesoDe(SK[k])/T); SK[k][campo]+=v; acc+=v;
      if(pesoDe(SK[k])>pesoDe(SK[mayor])) mayor=k; });
    SK[mayor][campo] += total-acc;
  };
  const sf = settlementFees();
  /* Está medido lo que la liquidación explica, no lo que la liquidación pesa.
     Antes bastaba con que hubiera filas en el periodo: con un fichero cuyas
     columnas de tarifa no reconocemos salían 0 € de comisión sellados como
     «medido», y el beneficio subía un 23 %. */
  const ads = adStats();
  /* Y no basta con que la liquidación se entienda: si la BASE de ingreso está
     deducida en vez de leída, el margen que sale encima no está medido por
     mucho que las comisiones sí lo estén. La etiqueta la fija el eslabón más
     débil, no el más fuerte. */
  const measured = sf.matched>0 && tb.known && !ads.spanUnknown;
  /* Pero eso es la ETIQUETA. Cuánto cubre la liquidación es otro hecho, y de
     la liquidación sola: mezclarlos hacía que una base de IVA deducida pusiera
     la cobertura a 0 % y la pantalla dejara de poder decir «la liquidación
     cubre el 16 % del periodo», que sigue siendo verdad. La insignia ya exige
     por su cuenta cobertura completa Y base leída Y publicidad fechada. */
  const hayLiquidacion = sf.matched>0;
  let referral, fba, storage, otherFee, feeCoverPct;
  /* Qué conceptos vienen de verdad de la liquidación. La salvedad de la tarifa
     FBA colgaba de la cobertura de COMISIÓN, así que una liquidación que
     cubría el periodo entero con solo líneas de comisión presentaba como
     medida una tarifa FBA íntegramente estimada. Son cosas distintas y ahora
     se dicen por separado. */
  let refMedido = false, fbaMedido = false;
  let ship=0, fbmUnits=0, fbaUnits=0;
  S.forEach(r=>{
    const p=pm[String(r.sku).toLowerCase()];
    const isFbm = r.fbm!=null ? r.fbm : !!(p && p.channel==='FBM');
    if(isFbm){ const e=(p?toNum(p.fbmShip):4.5)*r.qty; fbmUnits+=r.qty; ship += e; skuDe(r).ship += e; }
    else fbaUnits+=r.qty;
  });
  /* Tarifas estimadas de un subconjunto de ventas. Se usa para el periodo
     entero cuando no hay liquidación, y solo para el trozo que la liquidación
     no cubre cuando sí la hay. */
  /* La vista previa de tarifas, cuando está cargada, manda sobre el porcentaje
     que hayas puesto a mano: es lo que Amazon dice que te va a cobrar por ese
     SKU. Se importaba, se guardaba y no llegaba a ningún número del P&L, que
     es justo el informe que hace falta para dejar de suponer el 15 %.

     Del informe se saca el PORCENTAJE (comisión ÷ precio del informe), no el
     importe por unidad: así se adapta al precio al que vendiste de verdad, que
     con promociones no es el del informe. */
  /* Las tarifas se indexan por SKU **y tienda**, y solo entran las filas en la
     divisa de referencia. Una tarifa en riales sumada a un ingreso en euros no
     da un número aproximado: da uno inventado, y encima creíble. Las filas de
     otra divisa se cuentan y se declaran en vez de convertirse con un tipo de
     cambio que no tenemos. */
  const tarifas = {}, feeTiendas = {}, feeDivisas = {};
  let feeOtraDivisa = 0, feeSinFba = 0, feeFilas = 0;
  imp('fees').forEach(r=>{
    const sk = String(gv(r,'_sku','sku','sellersku')||'').toLowerCase(); if(!sk) return;
    feeFilas++;
    const div = String(gv(r,'_cur','currency')||'').trim().toUpperCase() || DIVISA_VENTAS;
    feeDivisas[div] = (feeDivisas[div]||0) + 1;
    const tiendaTxt = gv(r,'_store','amazonstore','store');
    const tienda = countryOf(tiendaTxt) || null;
    if(tiendaTxt) feeTiendas[String(tiendaTxt).trim()] = 1;
    if(div !== DIVISA_VENTAS){ feeOtraDivisa++; return; }   // no se mezcla con euros
    const ref   = toNum(gv(r,'_referral','estimatedreferralfeeperunit'));
    const precio= toNum(gv(r,'_price','yourprice','salesprice'));
    const crudo = gv(r,'_fba','expecteddomesticfulfilmentfeeperunit','expectedfulfillmentfeeperunit');
    /* «--» es la marca de ausencia de ESTE informe, no un cero: 4 filas de la
       tarifa doméstica y 363 de las EFN vienen así en el fichero real. */
    const fbaUd = hayNumero(crudo) ? toNum(crudo) : 0;
    if(!hayNumero(crudo)) feeSinFba++;
    const fila = {pct: (ref>0 && precio>0) ? ref/precio : 0, fba: fbaUd};
    tarifas[sk+'|'+(tienda||'*')] = fila;
    if(!tarifas[sk+'|*']) tarifas[sk+'|*'] = fila;   // respaldo si no hay tienda
  });
  /* La tarifa del país que vendió, y NUNCA la de otro país.

     Si el informe declara tiendas y no hay fila del país de esa venta, se cae al
     valor por defecto del producto y se cuenta en `feeSinTarifaPais`. Coger la
     de otra tienda daría un número con pinta de medido que no lo es: la comisión
     de un mismo SKU no es la misma en las nueve. El respaldo `|*` solo vale
     cuando el fichero es de un único mercado y no trae columna de tienda. */
  const feeMultiTienda = Object.keys(feeTiendas).length > 1;
  const tarifaDe = (sk, pais) => {
    if(pais && tarifas[sk+'|'+pais]) return tarifas[sk+'|'+pais];
    if(feeMultiTienda) return null;
    return tarifas[sk+'|*'] || null;
  };
  let udsConTarifa=0, udsSinTarifaDeSuPais=0;
  /* Orden de preferencia: lo que dice Amazon, lo que has puesto tú, el 15 %
     por defecto. El 15 % es el último recurso, no el primero.

     Vive aquí, en UNA función, porque lo usan dos sitios: la comisión que se
     cobra en la venta y la que Amazon reintegra en la devolución. Estaban
     duplicados y el de las devoluciones se saltaba el informe de tarifas, así
     que cobraba la venta al tipo real y reintegraba al 15 %. Con una categoría
     al 8 %, cada devolución te devolvía un 15 % que nunca pagaste. Dos copias
     de la misma regla siempre acaban divergiendo; es la misma lección que
     `iso()`. */
  /* El país de la venta manda: la comisión de un SKU no es la misma en las
     nueve tiendas, y aplicar la de otra es inventarse un número creíble. */
  const refPctOf = (k, pais) => {
    const p = pm[k], t = tarifaDe(k, pais);
    return (t && t.pct>0) ? t.pct
         : (p && toNum(p.referral)>0 ? toNum(p.referral)/100 : 0.15);
  };
  /* Devuelve además la FORMA del reparto por SKU. Cuando la liquidación mide
     el total pero no lo desglosa, el tamaño lo pone la liquidación y la forma
     la pone esta estimación: así el desglose no puede sumar otra cosa que el
     total medido. */
  const estFees = rows => {
    let ref=0, f=0; const porSku={};
    const dep = (k,c,v)=>{ const b=porSku[k]||(porSku[k]={referral:0,fba:0}); b[c]+=v; };
    rows.forEach(r=>{
      const k = String(r.sku).toLowerCase();
      const p = pm[k], t = tarifaDe(k, r.country);
      if(!t && (tarifas[k+'|*'] || (r.country && feeMultiTienda))) udsSinTarifaDeSuPais += r.qty;
      const pct = refPctOf(k, r.country);
      if(t && t.pct>0) udsConTarifa += r.qty;
      const rr = r.revenue*pct; ref += rr; dep(String(r.sku),'referral',rr);
      const isFbm = r.fbm!=null ? r.fbm : !!(p && p.channel==='FBM');
      if(!isFbm){ const ff = (t && t.fba>0 ? t.fba : (p?toNum(p.fba):3.2)*FUEL)*r.qty;
        f += ff; dep(String(r.sku),'fba',ff); }
    });
    return {referral:ref, fba:f, porSku};
  };
  /* Vuelca una estimación por SKU tal cual (lo que la liquidación no cubre) o
     reescalada al total medido (lo que sí cubre, pero sin desglosar). */
  const vuelca = (est, campo, totalMedido) => {
    const ks = Object.keys(est.porSku);
    const suma = ks.reduce((a,k)=>a+est.porSku[k][campo],0);
    if(totalMedido==null){ ks.forEach(k=>{ skuDe({sku:k})[campo] += est.porSku[k][campo]; }); return; }
    if(!(suma>0)){ reparte(totalMedido, campo, b=>b.revenue); return; }
    let acc=0, mayor=ks[0];
    ks.forEach(k=>{ const v = totalMedido*(est.porSku[k][campo]/suma);
      skuDe({sku:k})[campo] += v; acc+=v;
      if(est.porSku[k][campo] > est.porSku[mayor][campo]) mayor=k; });
    skuDe({sku:mayor})[campo] += totalMedido-acc;
  };
  if(hayLiquidacion){
    /* Amazon liquida cada 14 días, así que una liquidación cubre una quincena
       y el periodo en pantalla puede ser un trimestre. Restar 14 días de
       comisiones a 90 días de ingresos inflaba el beneficio un 20 % con la
       etiqueta «medido» puesta. Lo que la liquidación cubre va medido; lo que
       queda fuera se estima, y `feeCoverPct` dice cuánto es cada cosa. */
    const d0=iso(sf.desde), d1=iso(sf.hasta);
    const fuera=[], dentro=[]; let cubierto=0;
    S.forEach(r=>{ const d=iso(r.date);
      if(d>=d0 && d<=d1){ cubierto+=r.revenue; dentro.push(r); } else fuera.push(r); });
    const est = estFees(fuera), estDentro = estFees(dentro);
    /* Una categoría que sale exactamente a cero teniendo ventas cubiertas
       detrás no es una medición de cero: es que ese concepto no venía en el
       fichero. Cobrar 0 € de comisión sobre ventas reales no le pasa a nadie.
       Se estima esa categoría y se deja de llamarla medida. */
    refMedido = sf.referral>0; fbaMedido = sf.fba>0;
    referral = (refMedido ? sf.referral : estDentro.referral) + est.referral;
    fba      = (fbaMedido ? sf.fba      : estDentro.fba)      + est.fba;
    storage  = sf.storage; otherFee = sf.other;
    vuelca(est,'referral',null);  vuelca(est,'fba',null);
    vuelca(estDentro,'referral', refMedido ? sf.referral : null);
    vuelca(estDentro,'fba',      fbaMedido ? sf.fba      : null);
    feeCoverPct = grossInc>0 ? cubierto/grossInc*100 : 100;
    if(!refMedido) feeCoverPct = 0;   // sin comisión medida, no hay nada medido que presumir
  } else {
    const est = estFees(S);
    referral = est.referral; fba = est.fba; storage = 0; otherFee = 0;
    feeCoverPct = 0;
    vuelca(est,'referral',null); vuelca(est,'fba',null);
  }
  /* El IVA del P&L no siempre es el que traen las filas. Cuando el informe no
     declara `item-tax`, `taxBasis()` lo DEDUCE del tipo del país, y entonces
     `net` no es la suma de (ingreso − IVA de la fila) de ningún SKU. Sin esta
     línea el desglose se pasaba exactamente el IVA deducido y la tabla
     enseñaba márgenes que el negocio no tiene. Lo que las filas sí declaran se
     respeta; solo se reparte la diferencia. */
  const taxFilas = Object.keys(SK).reduce((a,k)=>a+SK[k].tax,0);
  const taxDeducido = tax - taxFilas;
  if(Math.abs(taxDeducido) > 0.0001) reparte(taxDeducido, 'tax', b=>b.revenue);
  /* Almacenaje y otras tarifas se reparten POR UNIDAD, no por ingreso. No es
     exacto —el almacenaje va por volumen— pero por ingreso se repetiría
     exactamente el error que hundía V2: cargar al artículo caro un coste que
     no depende del precio. */
  reparte(storage,  'storage',  b=>b.units);
  reparte(otherFee, 'otherFee', b=>b.units);
  Object.keys(cost.bySku||{}).forEach(k=>{ skuDe({sku:k}).cogs += cost.bySku[k].cogs||0; });
  let ppc = ads.spend || (DB.settings.cash.ppcDaily||0)*daysInPeriod();
  /* CON EL FILTRO DE UN PAÍS, LA PUBLICIDAD DE ESE PAÍS. Antes el P&L de
     España cargaba con todo el gasto del informe, el de Italia incluido: un
     país que apenas se anuncia salía hundido y el que más gasta, aliviado.
     Lo encontró la tarde del 3-10-2026 al probar «Campañas → producto» por
     país. Ahora `ppc` es la cuota del país en lo observado: su gasto con país,
     más la parte del gasto SIN país (informes viejos) en la misma proporción
     que el gasto con país. Si ninguna fila trae país no hay con qué repartir:
     se queda entero y la pantalla lo dice (`ppcPaisSinDato`). */
  let ppcPaisCuota = null, ppcPaisSinDato = false, ppcPaisRepartido = 0;
  const filtroPais = typeof countryFilter!=='undefined' && countryFilter!=='ALL';
  if(filtroPais && ads.spend>0){
    /* El gasto de cada país con sus tres componentes (`porPaisGasto`, ver
       pubAdStats): observado, extrapolado con la mezcla del tramo del que
       sale el ritmo, y sin fecha. Suma `ads.spend`. Lo que no dice país se
       reparte en la proporción de lo que sí lo dice. Si algún país sale
       negativo (abonos), una proporción no significa nada: no se reparte y se
       dice que es el gasto de todos. */
    const M = ads.porPaisGasto||{};
    const tot = Object.keys(M).reduce((a,k)=>a+M[k],0), sinPais = M['??']||0, cfg = M[countryFilter]||0;
    const conocido = tot - sinPais;
    const negativos = Object.keys(M).some(k=>k!=='??' && M[k] < -0.005);
    if(tot>0 && conocido>0 && !negativos){ ppcPaisCuota = (cfg + sinPais*cfg/conocido)/tot;
      ppcPaisRepartido = ppc*(sinPais*cfg/conocido)/tot; ppc = ppc*ppcPaisCuota; }
    else ppcPaisSinDato = true;
  }
  /* Sin informe, el gasto diario de ajustes es de toda la cuenta: con filtro
     es el de todos los países y se dice. */
  else if(filtroPais && ppc>0) ppcPaisSinDato = true;
  /* De dónde sale ese gasto, que no es lo mismo y la pantalla lo tenía todo
     bajo la misma etiqueta:
       informe            · con su rango, prorrateado a los días del periodo
       informe-sin-fechas · el informe no dice qué periodo cubre: NO prorrateado
       diario             · no hay informe, se usa el gasto diario de ajustes
       ninguno            · no hay ni informe ni gasto diario: publicidad = 0 */
  const ppcSource = ads.spend>0 ? (ads.spanUnknown ? 'informe-sin-fechas' : 'informe')
                  : (ppc>0 ? 'diario' : 'ninguno');
  const retRows = imp('returns').filter(r=>{ const d=parseDate(gv(r,'_date','returndate')); return d && d>=periodStart(); });
  const retUnits = retRows.reduce((a,r)=>a+(toNum(gv(r,'_qty','quantity'))||1),0);
  const reimb = imp('reimb').filter(r=>{const d=parseDate(r.approvaldate); return d&&d>=periodStart();})
                            .reduce((a,r)=>a+toNum(r.amounttotal),0);
  const fixed = DB.expenses.reduce((a,e)=>a+toNum(e.amount),0) * (daysInPeriod()/30);

  /* Devoluciones · lo que cuestan de verdad.

     Hasta ahora se contaban (`retUnits`, `retRate`) y no restaban nada: un
     producto con el 100 % de devoluciones daba exactamente el mismo beneficio
     que uno con cero. El motor unitario de Validar producto sí modela la
     mecánica; la cuenta de resultados no la usaba.

     Por unidad devuelta:
       · se devuelve el ingreso y su IVA;
       · Amazon reintegra la comisión MENOS la tasa de gestión del reembolso,
         que es mín(5 €, 20 % de la comisión);
       · la tarifa de logística NO se devuelve, así que se queda cobrada;
       · el coste de producto se recupera solo si la unidad vuelve vendible.
         Sin saber en qué estado volvió, se cuenta como NO recuperada, que es
         el supuesto que no infla el beneficio. */
  const ventaSku = {};
  S.forEach(r=>{ const k=String(r.sku).toLowerCase();
    if(!ventaSku[k]) ventaSku[k]={rev:0, tax:0, units:0, paises:{}, pais:null};
    ventaSku[k].rev+=r.revenue; ventaSku[k].tax+=r.tax; ventaSku[k].units+=r.qty;
    /* El país donde MÁS se vendió ese SKU, para poder cobrar la devolución a la
       comisión de su mercado en vez de a la de otro. */
    if(r.country){ const P2=ventaSku[k].paises; P2[r.country]=(P2[r.country]||0)+r.qty;
      if(!ventaSku[k].pais || P2[r.country]>P2[ventaSku[k].pais]) ventaSku[k].pais=r.country; } });

  /* El informe de devoluciones NO trae país. Con el desplegable en España se
     estaban restando las devoluciones de los nueve mercados contra las ventas
     de uno: el país que miras carga con lo que devuelven todos. La pantalla ya
     avisa de este mismo defecto para la publicidad y en devoluciones callaba.

     No se puede saber de qué mercado vino cada devolución, pero sí en qué
     proporción vende ese SKU en el mercado que estás mirando. Se reparte por
     esa proporción y se dice que es un reparto, no una medición. Con el
     filtro en «todos» la proporción es 1 y no cambia nada. */
  const cuotaPais = {};
  if(countryFilter !== 'ALL'){
    const todo = {};
    salesRows({country:'ALL'}).forEach(r=>{ const k=String(r.sku).toLowerCase();
      todo[k] = (todo[k]||0) + r.qty; });
    Object.keys(ventaSku).forEach(k=>{
      cuotaPais[k] = todo[k]>0 ? ventaSku[k].units/todo[k] : 1; });
  }
  const cuotaDe = k => countryFilter==='ALL' ? 1 : (cuotaPais[k]!=null ? cuotaPais[k] : 1);
  /* `cost.bySku` viene con el SKU tal cual lo escribe el informe; aquí se
     compara en minúsculas, así que hace falta el índice. */
  const costeSku = {};
  Object.keys(cost.bySku||{}).forEach(k=>{ costeSku[k.toLowerCase()] = cost.bySku[k]; });
  /* El informe de devoluciones escribe el SKU como le da la gana; el desglose
     se indexa con el SKU tal cual lo escribe el informe de ventas. */
  const skOrig = {}; Object.keys(SK).forEach(k=>{ skOrig[k.toLowerCase()] = k; });
  let retIngreso=0, retComision=0, retCoste=0, retVendibles=0, retSinEstado=0;
  /* Unidades que se cuentan pero NO se cobran, porque su SKU no vendió en el
     periodo. Antes el rótulo decía «N ud» sobre un importe de menos unidades. */
  let retDescartadas=0, retImputadas=0;
  /* B4 · la devolución deja de depender de un umbral binario.

     Antes: si el SKU no vendió NI UNA unidad en el periodo en pantalla, la
     devolución entera se descartaba (`retDescartadas`); si vendió una, se
     imputaba completa. El salto es discontinuo y arbitrario — la misma
     devolución cuesta 0 € o cuesta todo según haya habido una venta más o una
     menos—, y quien mira un mes flojo ve un coste de devoluciones de cero
     mientras la mercancía vuelve al almacén igual.

     Ahora la devolución se imputa SIEMPRE al periodo en que se produjo, y el
     precio medio sale de la ventana más larga de la que haya datos, no solo de
     lo que cae dentro del periodo en pantalla. Lo que no se puede saber —a qué
     venta concreta corresponde— se sigue diciendo: `retFueraDePeriodo` cuenta
     las que se cobran con el precio del histórico, y solo se descarta la
     devolución de un SKU que no ha vendido NUNCA, que es la única de la que de
     verdad no se sabe nada. */
  const ventaHist = {};
  salesRows({country:'ALL', from:new Date(0)}).forEach(r=>{
    const k = String(r.sku).toLowerCase();
    const h = ventaHist[k] || (ventaHist[k] = {rev:0, tax:0, units:0, paises:{}, pais:null});
    h.rev += r.revenue; h.tax += r.tax; h.units += r.qty;
    if(r.country){ const P3=h.paises; P3[r.country]=(P3[r.country]||0)+r.qty;
      if(!h.pais || P3[r.country]>P3[h.pais]) h.pais=r.country; }
  });
  let retFueraDePeriodo = 0;
  const retPorMotivo = {};
  retRows.forEach(r=>{
    const k = String(gv(r,'_sku','sku','sellersku')||'').toLowerCase();
    const qBruto = toNum(gv(r,'_qty','quantity'))||1;
    /* El motivo es la señal de negocio: la mayoría por talla no es un problema
       de calidad, es una guía de tallas. Se cuenta siempre, aunque la
       devolución no se pueda costear. */
    const motivo = String(gv(r,'_reason','reason','motivo')||'SIN_MOTIVO').trim().toUpperCase();
    retPorMotivo[motivo] = (retPorMotivo[motivo]||0) + qBruto;
    let v = ventaSku[k], delHistorico = false;
    if(!v || !v.units){ v = ventaHist[k]; delHistorico = true; }
    if(!v || !v.units){ retDescartadas += qBruto; return; }  // nunca ha vendido: no sé nada
    if(delHistorico) retFueraDePeriodo += qBruto;
    const q = qBruto * (delHistorico ? 1 : cuotaDe(k));
    const p = pm[k];
    const netUd   = (v.rev - v.tax)/v.units;
    const grossUd = v.rev/v.units;
    const comUd = grossUd*refPctOf(k, v.pais);
    retImputadas += q;
    const dIng = q*netUd, dCom = q*(comUd - Math.min(5, 0.20*comUd));
    retIngreso  += dIng;
    retComision += dCom;
    let dCos = 0;
    const disp = String(gv(r,'_disp','detaileddisposition','disposicion','estado')||'').trim().toLowerCase();
    if(!disp) retSinEstado += q;
    if(disp==='sellable' || disp==='vendible'){
      retVendibles += q;
      const cb = costeSku[k];
      if(cb && cb.units) dCos = q*(cb.cogs/cb.units);
      retCoste += dCos;
    }
    /* La devolución cae en el SKU que la tuvo. Antes se restaba del total y no
       aparecía en ninguna fila de la tabla: la referencia con más devoluciones
       salía tan rentable como si no tuviera ninguna.

       Un SKU que solo aparece en devoluciones —vendió en otro periodo— no tiene
       fila en el desglose todavía. Se le crea, con cero ventas y su coste de
       devolución, en vez de dejar ese coste sin dueño: si no, la suma del
       desglose dejaría de ser el beneficio del P&L, que es justo la propiedad
       que vigila `tests/coherencia.test.js`. */
    const ko = skOrig[k] || (skOrig[k] = String(gv(r,'_sku','sku','sellersku')||''));
    if(ko){
      if(!SK[ko]) SK[ko] = {sku:ko, units:0, revenue:0, tax:0, referral:0, fba:0, ship:0,
                            storage:0, otherFee:0, cogs:0, ppc:0, returns:0, vat:0, soloDevolucion:true};
      SK[ko].returns += dIng - dCom - dCos;
    }
  });
  const returnsCost = retIngreso - retComision - retCoste;

  /* M1.2 · E4 · la TASA de devoluciones y el COSTE de devoluciones tienen que
     contar lo mismo, o la pantalla se contradice consigo misma.

     Estaban desacopladas: el coste se reparte por la cuota de ventas del
     mercado filtrado (`cuotaDe`) y descarta las devoluciones de referencias que
     no vendieron, mientras la tasa dividía las unidades BRUTAS del informe
     entre las unidades del mercado filtrado. Medido con una fixture de 10 ud en
     ES + 10 ud en DE y 4 devoluciones sin país: con el filtro en ES la tasa
     decía 40,0 % y el coste cobraba 2 unidades, o sea un 20 %. Dos respuestas a
     la misma pregunta, en la misma pantalla, con los mismos datos.

     Ahora la tasa se calcula sobre las MISMAS unidades que se cobran, y lo que
     no se ha podido imputar (`retDescartadas`) se declara aparte en vez de
     colarse en el numerador.

     Y sin informe de devoluciones la tasa no es 0 %: es desconocida. Un 0 %
     ahí es tan falso como 0 € de publicidad, y por el mismo motivo. */
  const hayDevoluciones = imp('returns').length > 0;
  const retRate = units>0 ? retImputadas/units*100 : null;
  const retRateCalidad = !hayDevoluciones ? 'desconocido'
                       : units===0 ? 'desconocido'
                       : (countryFilter!=='ALL' || retDescartadas>0) ? 'estimado' : 'medido';
  /* E2 · una tasa por encima del 100 % puede ser REAL —devoluciones de ventas
     anteriores al periodo, que el informe fecha por la devolución y no por la
     venta— pero imprimirla a secas es un número creíble y falso: parece que
     devuelves más de lo que vendes. Se marca para que la pantalla lo explique
     en vez de recortarlo, que sería esconder un dato verdadero. */
  const retRateExcede = retRate != null && retRate > 100;

  /* El IVA que Amazon no repercutió y que responde tu NIF sigue siendo tuyo
     ante Hacienda: es un coste real del periodo, no una advertencia. Sin esta
     línea todos los márgenes salían optimistas en unos once puntos. */
  /* Menos la de los meses del informe de IVA sin un solo pedido cargado: ver
     `ivaMesesSinVentas`. Se guarda aparte para poder decirlo. */
  const vatSinVentas = ((tb.fiscal||{}).sinVentas) || {meses:[], difTuya:0};
  /* NUNCA POR DEBAJO DE CERO. Un reembolso cae en el mes en que se hace, y su
     venta puede ser de un mes apartado: entonces el mes cubierto se queda el
     reembolso sin la venta y la resta salía negativa —el IVA no repercutido
     SUBÍA el beneficio—. Si pasa, se aparta como mucho lo que hay, y se dice. */
  const vatTotal = (tb.fiscal||{}).difTuya || 0;
  let vatShortfall = vatTotal - (vatSinVentas.difTuya || 0);
  if(vatShortfall < 0 && vatTotal >= 0){ vatSinVentas.recortado = true; vatShortfall = 0; }
  const profit = net - referral - fba - ship - storage - otherFee - cogs - ppc - fixed + reimb - returnsCost - vatShortfall;
  /* Publicidad e IVA no repercutido SE REPARTEN, y la pantalla tiene que
     decirlo. No se pueden medir por SKU con los informes de hoy: el de PPC no
     casa campaña con SKU de forma fiable y el de IVA no trae SKU en absoluto.
     Repartirlos por ingreso declarando que es un reparto es honesto; dejarlos
     fuera del desglose —que era lo que había— no lo era, porque hacía que la
     tabla enseñara beneficios que el negocio no tiene. */
  /* Publicidad: primero lo que tiene destino confirmado (Publicidad › Campañas
     → producto), a los SKUs de su grupo por su ingreso; el resto, por ingreso
     entre todos. Ver `pubPpcPorCampana` en src/24-publicidad.js. La suma no
     cambia: solo cambia quién la lleva. */
  let ppcImputado = 0, ppcSinDestino = 0;
  if(ppc>0 && typeof pubPpcPorCampana==='function' && ads.spend>0){
    let C = []; try{ C = pubPpcPorCampana(); }catch(e){ C = []; }
    /* LA PARTE IMPUTADA SIGUE LA MISMA PROPORCIÓN QUE LO OBSERVADO.
       `ppc` incluye lo extrapolado a los días sin informe y las filas sin
       término; las campañas solo traen lo observado. Si solo se imputara lo
       observado, la mitad del gasto de un informe de medio periodo volvería a
       caer en SKUs que no se anuncian (revisión del 3-10-2026). Así que cada
       campaña se lleva su CUOTA del gasto total: gasto observado × ppc ÷
       observado total. La suma de cuotas es `ppc` exacto, nunca más; y un
       abono negativo sin término reduce todas las cuotas por igual en vez de
       hacer saltar una campaña entera. */
    const obsTot = C.reduce((a,c)=>a+c.gasto,0);
    let f = obsTot>0 ? ppc/obsTot : 0;
    if(ppcPaisCuota!=null){
      /* Con filtro, `ppc` es lo de este país: se reparte sobre lo que sus
         campañas observaron en él (más su parte de lo que no dice país), nunca
         sobre el total, o un país se imputaría más de lo que le toca. */
      const cfObs = C.reduce((a,c)=>a+((c.porPais||{})[countryFilter]||0),0);
      const unk = C.reduce((a,c)=>a+((c.porPais||{})['??']||0),0), known = obsTot - unk;
      const den = cfObs + (known>0 ? unk*cfObs/known : 0);
      f = den>0 ? ppc/den : 0;
    }
    const cf = (typeof countryFilter!=='undefined' && countryFilter!=='ALL') ? countryFilter : null;
    const porSkuMin = {}; Object.keys(SK).forEach(k=>porSkuMin[k.toLowerCase()] = k);
    /* TOPE: nunca se imputa más que `ppc`. Un abono con término resta del
       denominador pero no se imputa a nadie, y sin tope la campaña positiva
       se llevaba más que todo el gasto, y el reparto general salía negativo
       (tercera revisión de la tarde del 3-10-2026). */
    let gPos = 0;
    C.forEach(c=>{ if(!c.skus.length) return; const g0 = (cf ? ((c.porPais||{})[cf]||0) : c.gasto) * f; if(g0>0) gPos += g0; });
    const tope = (gPos > ppc && ppc>0) ? ppc/gPos : (ppc>0 ? 1 : 0);
    C.forEach(c=>{
      if(!c.skus.length || !(f>0)) return;
      /* Con filtro de país, solo lo que la campaña gastó EN ese país. */
      const g = (cf ? ((c.porPais||{})[cf]||0) : c.gasto) * f * tope;
      if(!(g>0)) return;
      const ks = c.skus.map(x=>porSkuMin[String(x).toLowerCase()]).filter(Boolean);
      const T = ks.reduce((a,k)=>a+SK[k].revenue,0);
      if(!ks.length || !(T>0)){ ppcSinDestino += g; return; }
      let acc = 0, mayor = ks[0];
      ks.forEach(k=>{ const v = g*(SK[k].revenue/T); SK[k].ppc += v; acc += v;
        if(SK[k].revenue > SK[mayor].revenue) mayor = k; });
      SK[mayor].ppc += g - acc;
      ppcImputado += g;
    });
  }
  reparte(ppc - ppcImputado, 'ppc', b=>b.revenue);
  reparte(vatShortfall, 'vat', b=>b.revenue);
  /* Lo que ningún SKU puede llevarse. Se declara; no se esconde. */
  const noImputable = reimb - fixed;
  const bySkuBreak = {};
  Object.keys(SK).forEach(k=>{ const b=SK[k];
    b.netRev = b.revenue - b.tax;
    b.profit = b.netRev - b.referral - b.fba - b.ship - b.storage - b.otherFee
             - b.cogs - b.ppc - b.returns - b.vat;
    bySkuBreak[k] = b; });
  return {
    bySku: bySkuBreak, noImputable, noImputableDetalle: {reimb, fixed},
    ppcImputado, ppcSinDestino,
    repartidos: {ppc: (ppc - ppcImputado)!==0, vat: vatShortfall!==0,
                 storage: storage!==0, otherFee: otherFee!==0},
    grossInc, tax, net, units, cogs, cogsKnown, referral, fba, ship, fbmUnits, fbaUnits, storage, otherFee, ppc, fixed, reimb, profit,
    taxBasis: tb, taxKnown: tb.known, baseQuality: tb.quality, taxCoverPct: tb.coverPct,
    vat: tb.fiscal, vatDif: (tb.fiscal||{}).diferencia||0, vatShortfall, vatSinVentas,
    vatVentasReducidas: (tb.fiscal||{}).ventasReducidas||0,
    ppcSource, adSpanUnknown: ads.spanUnknown, ppcPaisCuota, ppcPaisSinDato, ppcPaisRepartido,
    adExtrapolado: (ads.spendExtrapolado||0) > 0.005 || !!ads.fueraDePeriodo,
    refMedido, fbaMedido,
    feeCoverPct, settleRows:sf.rows, settleMatched:sf.matched,
    feeSkus: Object.keys(tarifas).filter(k=>!/\|\*$/.test(k)).length, feeUnits: udsConTarifa,
    feeFilas, feeTiendas: Object.keys(feeTiendas), feeDivisas,
    ventasFueraDivisa: (S.meta||{}).fueraPorDivisa||0,
    ventasOtraDivisa: (S.meta||{}).otraDivisa||{},
    feeOtraDivisa, feeSinFba, feeSinTarifaPais: udsSinTarifaDeSuPais,
    returnsCost, retIngreso, retComision, retCoste, retVendibles, retSinEstado,
    retImputadas, retDescartadas, retRepartidas: countryFilter!=='ALL',
    retFueraDePeriodo, retPorMotivo,
    periodDaysReal: daysInPeriod(), dataDays: salesSpan().days,
    cost, costMethod:cost.method, costBySku:cost.bySku, costQuality:cost.quality, costMeasuredPct:cost.measuredPct,
    measured, retUnits, retRate, retRateCalidad, retRateExcede, hayDevoluciones,
    /* Sin ingreso no hay margen que calcular, y devolver 0 hacía que una
       pérdida de 900 € con cero ventas se presentara como «Margen neto 0,0 %».
       `null` es lo que hay: la pantalla escribe «—». */
    margin: net>0 ? profit/net*100 : null,
    tacos: grossInc>0 ? ppc/grossInc*100 : 0,
    roi: cogs>0 ? profit/cogs*100 : 0,
    avgPrice: units>0 ? grossInc/units : 0,
    adSales: ads.sales, adWaste: ads.waste, adWasteTerms: ads.wasteTerms,
    adDays: ads.adDays, adFactor: ads.factor, adSpendBruto: ads.spendBruto,
    adSolapePct: ads.solapePct, adDesde: ads.desde, adHasta: ads.hasta
  };
}
/* Rentabilidad por SKU + clasificación ABC */
function skuStats(){
  const S = salesRows(), pm = prodBySku(), P = pnl();
  const m={};
  S.forEach(r=>{
    const k=String(r.sku);
    if(!m[k]) m[k]={sku:k, name:(pm[k.toLowerCase()]&&pm[k.toLowerCase()].name)||k, units:0, revenue:0, tax:0, countries:{}};
    m[k].units+=r.qty; m[k].revenue+=r.revenue; m[k].tax+=r.tax;
    if(r.country) m[k].countries[r.country]=(m[k].countries[r.country]||0)+r.qty;
  });
  /* Un SKU que solo aparece en devoluciones no tiene ventas en el periodo, así
     que no está en `m`. Tiene que salir en la tabla igual: su coste existe, y
     si no sale, la suma del desglose deja de ser el beneficio del P&L. */
  Object.keys(P.bySku||{}).forEach(k=>{ if(!m[k]){
    const b = P.bySku[k];
    m[k] = {sku:k, name:(pm[k.toLowerCase()]&&pm[k.toLowerCase()].name)||k,
            units:b.units||0, revenue:b.revenue||0, tax:b.tax||0, countries:{}}; } });
  const rows = Object.keys(m).map(k=>{
    const x=m[k], p=pm[k.toLowerCase()];
    /* El IVA que se restó es el que traía cada pedido, no un 21 % clavado. Con
       el 21 % fijo, dos SKU económicamente idénticos —uno vendido en Alemania
       al 19 % y otro en España al 21 %— salían con un 85 % de diferencia de
       beneficio, y el alemán, que era el mejor de los dos, se etiquetaba «C»
       mientras el español se llevaba la «A». Es la pantalla con la que se
       decide qué producto se empuja. */
    /* INTEGRACIÓN · los dos lados arreglaban cosas distintas y las dos se
       quedan.

       De la entrega del 6-sep: TODO el desglose sale del mismo cálculo que el
       P&L, no de una fórmula paralela con dos tasas planas. La tarifa de
       logística es un importe fijo por unidad; repartida como porcentaje del
       ingreso invertía el orden del ABC, que es la pantalla con la que se
       decide qué producto se empuja. La coherencia la vigila
       `tests/coherencia.test.js`.

       Del carril 5 (M1.2): el IVA sale del mismo reparto que el total y no de
       la columna en crudo. `x.revenue - x.tax` solo coincide con el P&L cuando
       el informe trae la columna de impuesto; cuando no la trae, el P&L lo
       deduce del tipo del país. Aquí se usa `b.tax`, que es el que el P&L ha
       repartido —deducido incluido—, así que el ingreso neto de la tabla es el
       mismo número que el de la cuenta de resultados. `ivaCalidad` se conserva
       para que la pantalla diga si está medido o deducido. */
    const b = (P.bySku && P.bySku[k]) || {tax:x.tax, referral:0,fba:0,ship:0,storage:0,
                                          otherFee:0,cogs:0,ppc:0,returns:0,vat:0,
                                          profit:x.revenue - x.tax};
    const tbk = ((P.taxBasis||{}).porSku||{})[k] || {calidad:'medido'};
    const iva = (b.tax!=null) ? b.tax : x.tax;
    const netRev = x.revenue - iva;
    const cogs = b.cogs || 0;
    const profit = b.profit;
    return Object.assign(x,{netRev, iva, ivaCalidad:tbk.calidad, cogs, profit, hasCost:!!p,
      referral:b.referral, fba:b.fba, ship:b.ship, storage:b.storage, otherFee:b.otherFee,
      ppc:b.ppc, returns:b.returns, vat:b.vat,
      unitCost: x.units>0 ? cogs/x.units : 0,
      /* M1.2 · `0 %` con cero ingreso no es un margen del cero por ciento: es
         que no hay margen que calcular. `null` es lo que hay, y la pantalla
         escribe «—». Y por debajo del umbral de unidades el porcentaje no se
         enseña: con cuatro ventas un 38 % no significa nada. */
      margin: netRev>0 ? profit/netRev*100 : null,
      /* Sin `25-metricas.js` no hay umbral que aplicar; `Infinity` esconde
         todos los porcentajes, que es el lado que no invita a decidir sobre
         ruido. */
      pctFiable: x.units >= (typeof umbralUnidades==='function' ? umbralUnidades() : Infinity),
      share:0, cum:0, abc:'C'});
  }).sort((a,b)=>b.profit-a.profit);
  const totPos = rows.filter(r=>r.profit>0).reduce((a,r)=>a+r.profit,0) || 1;
  let cum=0;
  rows.forEach(r=>{
    r.share = r.profit>0 ? r.profit/totPos*100 : 0;
    if(r.profit>0){
      /* La clase se decide por lo acumulado ANTES de este producto, que es lo
         que hace Pareto: «A» son los que hacen falta para llegar al 80 %,
         incluido el que lo cruza. Mirando el acumulado DESPUÉS, el producto que
         cruzaba el 80 % nunca entraba en A, y con un solo producto rentable
         `cum` valía 100 y salía «C»: el que sostiene el negocio con la píldora
         de los residuales, y el veredicto remitiendo a una categoría A vacía. */
      const antes = cum;
      cum += r.share; r.cum = cum;
      r.abc = antes<80 ? 'A' : (antes<95 ? 'B' : 'C');
    }
    else { r.cum=100; r.abc='D'; }
  });
  return rows;
}
/* Días observados por debajo de los cuales una velocidad no es una medición.
   Dos semanas es el mínimo para que un fin de semana flojo no mande el número.
   No es una constante de Amazon: es un criterio del hub, y por eso la pantalla
   dice «estimado sobre N días» en vez de dar la cifra a secas. */
const INV_DIAS_MIN_VELOCIDAD = 14;

/* El riesgo, con los tres «no se sabe» separados del «se sabe y está mal».

   D3 · sin stock medido no hay cobertura: `nd`.
   D4 · sin ventas no hay cobertura que medir: `sinventa`. Antes, el centinela
        999 caía en `cover>154` y la referencia salía etiquetada SOBRESTOCK, con
        su KPI y su recomendación de liquidar. Un SKU recién dado de alta que
        todavía no ha vendido nada no es sobrestock: es un SKU sin historia. */
function riesgoCobertura(cover, velocity, fbm){
  if(cover===null || cover===undefined) return 'nd';
  if(!(velocity>0)) return 'sinventa';
  const bajo = fbm ? 14 : 28;
  return cover<bajo ? 'low' : (cover>154 ? 'over' : 'ok');
}

/* Inventario consolidado: stock, cobertura y riesgo de tarifa */
function invStats(){
  /* El stock de FBA es europeo y no se puede trocear por el desplegable de
     país, así que las ventas tampoco. Con el filtro puesto, las ventas se
     dividían y el stock no: la cobertura salía ×4 y la única referencia en
     rotura desaparecía de la pantalla junto con las 421 unidades que había que
     pedir. Aquí se mira siempre el conjunto, y la pantalla lo dice. */
  const S = salesRows({country:'ALL'}), pm = prodBySku();
  const sold={}, primera={};
  S.forEach(r=>{
    const k = String(r.sku);
    sold[k]=(sold[k]||0)+r.qty;
    /* D1 · cuándo empezó a vender ESTE SKU dentro de la ventana. */
    if(r.qty>0 && r.date && (!primera[k] || r.date<primera[k])) primera[k]=r.date;
  });
  /* Días OBSERVADOS, no días pedidos: ver salesSpan(). */
  const sp = salesSpan({country:'ALL'});
  const days = Math.min(daysInPeriod(), sp.days || daysInPeriod());
  const cubreHasta = sp.cubreHasta || startOfDay(today());
  /* D1 · ¿el SKU es NUEVO, o solo lleva tiempo callado? La primera venta dentro
     de la ventana no distingue las dos cosas, y confundirlas es caro en los dos
     sentidos: estrechar la ventana de un SKU viejo que vendió una unidad
     anteayer dispara su velocidad y manda comprar un contenedor. Quien lo
     distingue es el histórico, que sabe si ese SKU ya vendía antes de que
     empezara esta ventana. Sin histórico no se puede distinguir, así que se
     aplica la ventana propia —que es el fallo declarado— pero la fila sale
     marcada como estimada y la pantalla lo dice. */
  const histPrimera = (typeof primerasVentasHistoricas==='function')
    ? (function(){ try{ return primerasVentasHistoricas(); }catch(e){ return {}; } })() : {};
  const hayHistorico = Object.keys(histPrimera).length>0;
  /* INTEGRACIÓN · el stock sale del CRUCE de los tres informes
     (`stockCruce()`, entrega del 6-sep, medido contra los ficheros reales: al
     informe de gestión le faltan referencias y unidades, y su columna
     «disponible» deja fuera unidades que existen). Si no hay cruce —porque no
     se han cargado esos informes— se usa el respaldo del carril 6. En los dos
     caminos rige D3, que es del carril 6: lo que NO se ha medido vale null, no
     cero, porque cero con ventas es rotura y manda comprar. */
  const C = (typeof stockCruce==='function') ? stockCruce() : null;
  const stock={}, byCountry={}, noDisp={}, totalFisico={}, medido={};
  if(C && C.filas && C.filas.length){
    C.filas.forEach(f=>{
      stock[f.sku] = f.enGestion ? f.disp : (f.enMulti ? f.multi : f.salud);
      noDisp[f.sku] = f.enGestion ? f.noDisp : 0;
      totalFisico[f.sku] = f.enGestion ? f.total : (f.enMulti ? f.multi : f.salud);
      medido[f.sku] = 1;
      if(Object.keys(f.porPais).length) byCountry[f.sku] = f.porPais;
    });
  } else {
  const mcTotal={};
  imp('inventory').forEach(r=>{
    const k=gv(r,'_sku','sku','sellersku'); if(!k) return;
    stock[k]=(stock[k]||0)+toNum(gv(r,'_qty','afnfulfillablequantity'));
  });
  imp('multicountry').forEach(r=>{
    const k=gv(r,'_sku','sellersku','sku'), c=countryOf(gv(r,'_country','country')); if(!k) return;
    if(!byCountry[k]) byCountry[k]={};
    const q = toNum(gv(r,'_qty','quantityforlocalfulfillment'));
    if(c) byCountry[k][c]=(byCountry[k][c]||0)+q;
    mcTotal[k]=(mcTotal[k]||0)+q;
  });
  /* D3 · MEDIDO A CERO Y NO MEDIDO NO SON LO MISMO. `stock[k]||0` convertía
     «este SKU no sale en ningún informe de inventario» en «este SKU tiene cero
     unidades», y cero unidades con ventas es rotura: cobertura 0, riesgo bajo y
     una orden de pedir el punto de pedido entero. Una cifra creíble, redonda y
     completamente inventada. Aquí, lo que no se ha medido vale null. */
  Object.keys(stock).forEach(k=>medido[k]=1);
  Object.keys(mcTotal).forEach(k=>medido[k]=1);
  /* Un SKU que solo aparece en el informe multipaís valía CERO unidades aquí y
     en el histórico, mientras la tabla de países de la misma pantalla enseñaba
     sus 1.400. Los lotes de coste ya hacían este respaldo; Inventario se quedó
     fuera de aquella corrección. Solo cuando el SKU no viene en el informe de
     inventario: sumar los dos contaría el mismo stock dos veces. */
  Object.keys(mcTotal).forEach(k=>{ if(!(k in stock)) stock[k]=mcTotal[k]; });
  if(!Object.keys(stock).length) imp('planning').forEach(r=>{ if(r.sku){ stock[r.sku]=toNum(r.available); medido[r.sku]=1; } });
  }
  const plan={}; imp('planning').forEach(r=>{ if(r.sku) plan[r.sku]=r; });
  const keys = Array.from(new Set(Object.keys(stock).concat(Object.keys(sold)).concat(DB.products.map(p=>String(p.sku)))));
  return keys.map(k=>{
    const p=pm[k.toLowerCase()];
    const fbm = !!(p && p.channel==='FBM');
    /* D1 · la ventana del SKU empieza en su primera venta cuando hay motivo
       para creer que antes no existía. */
    const desdeSku = primera[k] || null;
    const hk = histPrimera[k] || histPrimera[k.toLowerCase()] || null;
    const vieneDeAntes = hk ? (parseDate(hk) < (sp.from || cubreHasta)) : false;
    const arrancaDespues = !!(desdeSku && sp.from && daysBetween(sp.from, desdeSku) > 0);
    const nuevo = arrancaDespues && !vieneDeAntes;
    const diasSku = nuevo ? Math.max(1, Math.min(days, daysBetween(desdeSku, cubreHasta)+1)) : days;
    const velocity = (sold[k]||0)/diasSku;
    /* E5 · una ventana corta no se puede presentar como una medición. El punto
       de pedido proyecta plazo + colchón —del orden de ochenta días— hacia
       delante; hacerlo desde cuatro días observados es multiplicar por veinte
       el ruido de una semana floja. Se marca, no se esconde. */
    const velocidadEstimada = velocity>0 && (diasSku < INV_DIAS_MIN_VELOCIDAD || (nuevo && !hayHistorico));
    const stockMedido = fbm
      ? !!(p && p.fbmStock!==undefined && p.fbmStock!==null && String(p.fbmStock).trim()!=='')
      : !!medido[k];
    const qty = !stockMedido ? null : (fbm ? toNum(p.fbmStock) : (stock[k]||0));
    /* D4 · 999 es un centinela de «no se puede calcular», no una medición de
       999 días. Se conserva para no romper lo que ya lo pinta como ∞, pero el
       riesgo deja de llamarse sobrestock: sin venta no hay cobertura que medir.
       D3 · sin stock medido no hay cobertura de ninguna clase. */
    const cover = qty===null ? null : (velocity>0 ? qty/velocity : (qty>0?999:0));
    const lead = p&&p.supplierId ? (DB.suppliers.find(s=>s.id===p.supplierId)||{}).lead||45 : 45;
    const reorderPoint = Math.ceil(velocity*(toNum(lead)+TARGET.cover));
    /* Lo que ya está en un barco cuenta. Sin esto, el ejemplo mandaba pedir
       421 unidades más de una referencia que tenía 900 llegando, y encima la
       marcaba en rotura: 753 unidades de sobrecompra y una alarma falsa.

       Un BORRADOR no está en ningún barco: no lo has enviado y el proveedor no
       lo ha visto. Descontarlo de lo que hay que pedir es descontar una
       intención, y hace que la pantalla ponga «Pedir —» sobre una referencia
       que no tiene nada llegando. Mismo criterio que en la curva de caja. */
    const posSku = DB.pos.filter(po=>po.status!=='closed' && po.status!=='received' && po.status!=='draft')
      .map(po=>({po, q:(po.items||[]).filter(i=>String(i.sku).toLowerCase()===k.toLowerCase())
                                     .reduce((b,i)=>b+toNum(i.qty),0)}))
      .filter(x=>x.q>0);
    const enCamino = posSku.reduce((a,x)=>a+x.q, 0);
    /* Y una segunda mitad que faltaba: `enCamino` entraba en lo que hay que
       pedir pero NO en la cobertura ni en el riesgo, así que la referencia con
       900 unidades llegando seguía pintada «tarifa bajo inventario» y seguía
       contando en el KPI «Bajo cobertura». Son dos preguntas distintas y
       mezclarlas hacía que la pantalla se contradijera consigo misma:

         cover        · días que aguanta lo que HAY EN EL ALMACÉN. Es lo que
                        determina la tarifa por inventario bajo, porque Amazon
                        la cobra sobre lo almacenado, no sobre lo que navega.
                        Meter aquí el tránsito ocultaría un coste real.
         coverTransito· días que aguanta contando lo que viene. Es la respuesta
                        a «¿tengo que pedir?».

       El aviso de tarifa se mantiene —se va a cobrar igual—, pero deja de
       leerse como una orden de compra cuando ya hay mercancía en camino. Si el
       pedido no tiene fecha prevista no se puede afirmar que llegue a tiempo,
       y entonces no mitiga nada: se dice y ya. */
    const etaConocida = posSku.length>0 && posSku.every(x=>!!parseDate(x.po.eta));
    const diasHastaRotura = (qty!==null && velocity>0) ? qty/velocity : 999;
    const llegaATiempo = etaConocida && posSku.every(x=>{
      const d = parseDate(x.po.eta); return d && daysBetween(today(), d) <= diasHastaRotura; });
    const pl = plan[k]||{};
    const coverTransito = qty===null ? null
      : (velocity>0 ? (qty+enCamino)/velocity : ((qty+enCamino)>0?999:0));
    const fila = C && C.filas ? C.filas.filter(f=>f.sku===k)[0] : null;
    return {sku:k, name:(p&&p.name)||k, fbm, qty, velocity, cover, coverTransito,
      stockDesconocido: qty===null,
      /* B2 (entrega 6-sep) · los tres números por separado, y la pantalla dice
         cuál mira. `qty` es lo DISPONIBLE, que es lo que se puede vender hoy;
         `qtyNoDisp` existe y no se puede vender; `qtyTotal` es lo que hay en el
         almacén. Con el stock sin medir los tres son null, no cero (D3). */
      qtyNoDisp: (fbm || qty===null) ? 0 : (noDisp[k]||0),
      qtyTotal:  qty===null ? null : (fbm ? qty : (totalFisico[k]!=null ? totalFisico[k] : qty)),
      soloEnMulti: !!(fila && !fila.enGestion && fila.enMulti),
      soloEnGestion: !!(fila && fila.enGestion && !fila.enMulti),
      /* D1 / E5 (carril 6) · sobre cuántos días se ha medido esta velocidad, y
         si se puede llamar medición. Lo lee la pantalla y lo lee M2. */
      diasObservados: diasSku, diasVentana: days, skuNuevo: nuevo,
      primeraVenta: desdeSku ? iso(desdeSku) : null, velocidadEstimada,
      lead:toNum(lead), enCamino, etaConocida, llegaATiempo,
      reorderPoint, need: qty===null ? null : Math.max(0, reorderPoint-qty-enCamino),
      byCountry: fbm ? {} : (byCountry[k]||{}),
      excess: toNum(pl.estimatedexcessquantity),
      aged: toNum(pl.invage271to365days)+toNum(pl.invage365plusdays),
      sellThrough: toNum(pl.sellthrough),
      /* Valorar el stock al coste del último lote comprado, no al coste base
         de hace un año: el capital inmovilizado es lo que costaría reponerlo. */
      unitCost: costNow(p),
      value: qty===null ? 0 : qty*costNow(p),
      risk: riesgoCobertura(cover, velocity, fbm),
      /* El riesgo de COMPRA, que es el que manda pedir. El de tarifa sigue
         siendo `risk` y sigue avisando aunque este esté cubierto. */
      riskCompra: riesgoCobertura(coverTransito, velocity, fbm)
    };
  }).filter(r=>r.qty>0||r.velocity>0)
    /* Lo que no se ha podido medir va al principio: es lo que hay que ir a
       mirar, no lo que se puede ignorar por salir al final de la lista. */
    .sort((a,b)=>{
      const av = a.cover===null ? -1 : a.cover, bv = b.cover===null ? -1 : b.cover;
      return av-bv;
    });
}
/* El P&L del negocio entero, sin el filtro de país de la interfaz. Lo necesita
   la comparativa por mercados: si el numerador es de un solo país y el
   denominador de todos, los porcentajes no significan nada. */
function pnlAll(){
  const c = countryFilter;
  countryFilter = 'ALL';
  try{ return pnl(); } finally { countryFilter = c; }
}
/* Beneficio por mercado, con la gestoría amortizada entre las unidades reales */
function countryStats(){
  const rows = salesRows({from:periodStart(), country:'ALL'});
  const P = pnlAll();
  const feeRate = P.grossInc>0 ? (P.referral+P.fba+P.ship+P.storage+P.otherFee+P.ppc)/P.grossInc : 0.32;
  /* El coste va por PAÍS de verdad, no repartiendo el coste medio entre todas
     las unidades. Repartir por unidades hacía que el mercado que vende el
     producto caro saliera igual de rentable que el que vende el barato —o
     mejor—, que es justo al revés y es la pantalla con la que se decide en qué
     mercado empujar. */
  const C = costOfSales(rows);
  /* M1.2 · A2 · el coste de las ventas SIN país no lo indexa `C.byCountry`,
     que solo anota las filas que traen país. Ese coste sí está en el total
     `C.cogs`, así que el grupo «??» salía con 0 € de coste de producto y un
     margen altísimo: medido con una fixture de 10 ud a 100 € sin canal
     reconocible, la fila «Otros mercados» daba 82,0 % de margen y «aporta al
     año 9.971 €», en verde y sin una sola marca.

     El residuo —total menos lo imputado a países— es exactamente el coste de
     esas ventas, así que se le devuelve a su grupo y el desglose vuelve a sumar
     el total. Es la regla de la casa: lo que no se puede imputar se declara
     aparte, no se reparte ni se pierde. */
  // COSTURA → carril 2: `costOfSales().byCountry` (src/12c-lotes.js) solo indexa
  // las filas que traen país, así que el coste de las ventas sin mercado
  // reconocible no tiene dónde caer y esta tabla lo daba por cero. Aquí se
  // reconstruye por diferencia, que es exacto pero indirecto: lo que toca al
  // integrar es que `byCountry` tenga su propio grupo '??', como ya lo tiene el
  // reparto del IVA en `taxBasis()`. Mientras tanto, esta resta cuadra.
  const cogsImputado = Object.keys(C.byCountry).reduce((a,k)=>a+(C.byCountry[k].cogs||0), 0);
  const cogsSinPais = C.cogs - cogsImputado;
  const m={};
  rows.forEach(r=>{ const c=r.country||'??'; if(!m[c]) m[c]={code:c,units:0,rev:0,tax:0};
    m[c].units+=r.qty; m[c].rev+=r.revenue; m[c].tax+=r.tax; });
  const scale = 365/daysInPeriod();
  /* Los mercados que no están en COUNTRIES —el Reino Unido, sin ir más lejos—
     contaban en el P&L y en la ABC y desaparecían de esta tabla: en un caso
     medido, un 33 % de la facturación se evaporaba sin que nada lo dijera.
     Ahora se agrupan en una fila «otros» en vez de no existir. */
  const otros = Object.keys(m).filter(k=>!COUNTRIES.some(c=>c.code===k))
                              .map(k=>m[k]).filter(x=>x.units>0);
  const listado = COUNTRIES.slice();
  if(otros.length) listado.push({code:'··', name:'Otros mercados', vat:0, storage:false, vatCost:0, cur:'EUR', otros:true});
  /* El IVA por mercado sale del mismo reparto que el total (ver `taxBasis`), no
     de la columna en crudo. Con un informe sin columna de impuesto, `x.rev -
     x.tax` devolvía el ingreso CON IVA para TODOS los mercados, no solo para el
     grupo sin país: el desglose por mercado no sumaba el ingreso neto del P&L y
     cada margen de esta tabla salía inflado en el IVA de su mercado. */
  const TP = P.taxBasis.porPais || {};
  const ivaDe = code => (TP[code] || {tax:0}).tax;
  const calDe = code => (TP[code] || {calidad:'desconocido'}).calidad;
  return listado.map(c=>{
    const codigos = c.otros ? otros.map(o=>o.code) : [c.code];
    const x = c.otros
      ? otros.reduce((a,o)=>({units:a.units+o.units, rev:a.rev+o.rev, tax:a.tax+o.tax}), {units:0,rev:0,tax:0})
      : (m[c.code]||{units:0,rev:0,tax:0});
    const conf = c.otros ? {} : (DB.compliance[c.code]||{});
    const vatCost = conf.active ? toNum(conf.vatCost) : 0;
    /* IVA realmente cobrado, no el nominal del país: una venta a Alemania
       facturada con IVA español existe, y con el nominal salían 50 € de
       ingreso neto inventados por mercado. */
    const iva = codigos.reduce((a,k)=>a+ivaDe(k), 0);
    const peor = (typeof peorCalidad==='function') ? peorCalidad : function(){ return 'desconocido'; };
    const calidad = x.units>0
      ? codigos.reduce((a,k)=>peor(a, calDe(k)), 'medido')
      : 'medido';
    const netRev = x.rev - iva;
    const cogs = codigos.reduce((a,k)=>
      a + (k==='??' ? cogsSinPais : ((C.byCountry[k]||{cogs:0}).cogs||0)), 0);
    const gross = netRev - x.rev*feeRate - cogs;
    const vatShare = vatCost*(daysInPeriod()/365);
    const profit = gross - vatShare;
    return {c, units:x.units, rev:x.rev, iva, netRev, cogs, profit, annual:profit*scale,
            calidad, sinPais: codigos.indexOf('??')>=0,
            /* Cero ventas no es «margen 0 %», y por debajo del umbral un
               porcentaje no significa nada: las dos cosas se dicen aquí y la
               pantalla escribe «—». */
            margin: netRev>0 ? profit/netRev*100 : null,
            /* Sin `25-metricas.js` no hay umbral que aplicar; `Infinity` esconde
         todos los porcentajes, que es el lado que no invita a decidir sobre
         ruido. */
      pctFiable: x.units >= (typeof umbralUnidades==='function' ? umbralUnidades() : Infinity),
            active:!!conf.active,
            perUnit: x.units>0?profit/x.units:0, vatCost};
  });
}
/* Proyección de caja a 90 días */
function cashProjection(){
  const cs = DB.settings.cash, P = pnl();
  const days = 90;
  const start = today();
  const dayRev  = P.grossInc/daysInPeriod();
  const feeRate = P.grossInc>0 ? (P.referral+P.fba+P.ship+P.storage+P.otherFee)/P.grossInc : 0.22;
  const dayPpc  = (P.ppc/daysInPeriod()) || cs.ppcDaily || 0;

  /* Reponer lo que vendes también cuesta dinero.

     Aquí había un `dayCogsFlow = 0` con el comentario «el coste sale por los
     pedidos, no a diario». Solo es verdad si has cargado los pedidos, y la
     curva es justo lo que miras ANTES de cargarlos. Resultado medido con los
     datos de ejemplo: la pantalla decía «caja mínima €1.424, aguanta los 90
     días» y recomendaba un pedido adicional de €7.000, cuando reponiendo lo
     que vende se queda en −€232 y toca el descubierto el mismo día que llamaba
     mínimo. Vender noventa días sin volver a comprar género no es un escenario
     prudente: es otro negocio.

     Para no cobrarlo dos veces, la mercancía que ya has pedido y aún no ha
     llegado cubre sus días: durante esos días no se carga reposición, porque
     ya la estás pagando en los vencimientos del pedido.

     Dos cosas que este filtro daba por buenas y no lo son:

     · Un pedido RECIBIDO ya no está en camino, está en la estantería, y su
       coste ya viajó al lote y de ahí al coste de ventas. Contarlo otra vez
       como «mercancía que cubre días futuros» es contarlo dos veces. Medido:
       un pedido recibido y pagado de 600 unidades de OTRO SKU regalaba 60 días
       sin cargo de reposición y dejaba la caja final en 70.250 € en vez de
       46.250 €. Veinticuatro mil euros en la curva que decide si pides
       financiación. El resto del fichero ya excluye `received` por este mismo
       motivo (ver `enCamino`): esta línea era la que se había quedado fuera de
       la convención.

     · Un BORRADOR no es un pedido. No lo has enviado, el proveedor no lo ha
       visto y no hay nada viajando. Cubrir días con él es cubrirlos con una
       intención.

     Y el crédito es POR SKU, no entre SKU: 600 unidades de un producto no
     reponen las ventas de otro. Se cuenta solo lo pedido de los SKU que de
     verdad se están vendiendo en el periodo. */
  const dayUnits    = P.units/daysInPeriod();
  const dayCogsFlow = P.cogs/daysInPeriod();
  const skusVendidos = {};
  salesRows().forEach(r=>{ if(r.sku) skusVendidos[String(r.sku).toLowerCase()] = 1; });
  /* M3 · ENTREGAS PARCIALES. Lo que cubre días es lo que todavía NO ha
     llegado, y con entregas declaradas eso es aritmética —pedidas menos
     recibidas— en vez de una lectura del estado del pedido. Un pedido de 1.500
     unidades del que han llegado 600 y está marcado «recibido» cubría CERO
     días, cuando quedan 900 navegando cuyo pago sí está en la curva.
     Sin entregas declaradas, `poEnCursoUnits` conserva exactamente el criterio
     anterior: «recibido» cubre cero, el resto cubre todo lo pedido. */
  const unidsEnCurso = DB.pos
    .filter(po => po.status!=='closed' && po.status!=='draft')
    .reduce((a,po) => a + poEnCursoUnits(po, sku=>!!skusVendidos[String(sku).toLowerCase()]), 0);
  const diasCubiertos = dayUnits>0 ? unidsEnCurso/dayUnits : 0;

  /* B5 · LAS DEVOLUCIONES SALEN DE CAJA, y la curva no las descontaba.

     `returnsCost` ya está calculado y ya baja a cada SKU, pero la proyección de
     tesorería seguía como si el dinero devuelto no saliera nunca. Con la tasa
     de devolución real del negocio eso es dinero que se resta del saldo mínimo,
     que es el número con el que se decide si hace falta financiación.

     El desfase: la devolución sale de caja cuando Amazon la REEMBOLSA, no
     cuando el cliente la solicita. Amazon reembolsa al comprador de inmediato y
     lo descuenta en la liquidación siguiente, así que el desembolso cae dentro
     del mismo ciclo de pago. Se modela como un flujo diario porque a 90 días
     vista la forma exacta dentro del ciclo no cambia el mínimo; lo que lo
     cambia es que ANTES no salía en absoluto. */
  const dayReturns = (P.returnsCost||0)/daysInPeriod();

  const monthlyFixed = DB.expenses.reduce((a,e)=>a+toNum(e.amount),0);
  /* Vencimientos de pedidos de compra pendientes.

     Lo vencido y sin pagar no es dinero que ya no vayas a desembolsar: es el
     que pagas mañana. Antes el filtro `k>=0` lo tiraba de la curva mientras el
     KPI «Pagos comprometidos» seguía contándolo, así que la pantalla enseñaba
     una deuda que la proyección no gastaba nunca. Ahora cae en el día 0. */
  /* M3 · DEPÓSITOS PROGRAMADOS. La fecha de un vencimiento deja de tener que
     ser absoluta: puede colgar de la fecha de pedido, del CIERRE DE PRODUCCIÓN
     —fecha de pedido más el plazo de fabricación real del proveedor— o de la
     llegada prevista. `poPayDate()` (27-compras) resuelve las dos formas, y un
     vencimiento antiguo sin `basis` sigue leyéndose por `dueDate` exactamente
     igual que antes.

     Y se miden tres agujeros por los que antes se escapaba dinero de la curva
     sin que nada lo dijera:

     · `sinFecha` — un vencimiento cuya fecha no se puede resolver (ancla en
       producción sin plazo declarado, o `dueDate` ilegible). Antes se hacía
       `return` en silencio y ese importe desaparecía de la proyección mientras
       el KPI «Pagos comprometidos» seguía contándolo.

     · `sinCalendario` — el trozo del pedido que NO tiene ningún vencimiento
       escrito. Un pedido de 50.000 € con solo el anticipo del 30 % tecleado
       gastaba 15.000 € en la curva, y los otros 35.000 no existían en ningún
       sitio. La caja salía plausible y sobrada. No se coloca en un día
       inventado —inventar la fecha es inventar el número—: se mide y se dice.

     · `enDivisaSinTipo` — pedidos en divisa cuyo importe NO está en euros
       porque nadie ha escrito el tipo de cambio. */
  const poFlows = {};
  let fueraDeVentana = 0, sinFecha = 0, sinCalendario = 0, enDivisaSinTipo = 0, posSinTipo = 0;
  DB.pos.forEach(po=>{
    if(po.status==='closed') return;
    if(poFxMissing(po)){ enDivisaSinTipo += poAmount(po); posSinTipo++; }
    const hueco = poSinCalendario(po);
    if(Math.abs(hueco) > 0.5) sinCalendario += hueco;
    (po.payments||[]).forEach(pay=>{
      if(pay.paid) return;
      const importe = poAmount(po)*(toNum(pay.pct)/100);
      const d = poPayDate(po, pay);
      if(!d){ sinFecha += importe; return; }
      const k = Math.max(0, daysBetween(start,d));
      if(k<days) poFlows[k] = (poFlows[k]||0) + importe;
      else fueraDeVentana += importe;      // vence más allá de los 90 días
    });
  });

  /* M3 · movimientos programados que no son mercancía ni gasto mensual: el
     depósito de una máquina, la devolución de un préstamo, el reparto anual de
     dividendos. Son justo los que hunden la curva un día concreto y no
     aparecían en ninguna parte. */
  const plan = cashPlanFlows(start, days);

  let bal = toNum(cs.start), pending = 0;
  const out=[];
  /* Las CINCO CATEGORÍAS. Cada día se reparte en cobros, mercancía, gastos,
     inversiones y dividendos, y la suma de las cinco es, por construcción, la
     variación del saldo: `inflow` y `outflow` se calculan DESDE las categorías
     y no al lado de ellas, que es como se llega a un desglose que no cuadra
     con la curva que está justo encima. */
  const totales = {cobros:0, mercancia:0, gastos:0, inversiones:0, dividendos:0};
  for(let k=0;k<days;k++){
    const d = addDays(start,k);
    const cat = {cobros:0, mercancia:0, gastos:0, inversiones:0, dividendos:0};
    pending += dayRev*(1-feeRate);
    if(k>0 && k % Math.max(1,Math.round(toNum(cs.cycle)||14)) === 0){
      const cobro = pending*(1 - toNum(cs.reserve)/100);
      pending -= cobro;
      cat.cobros += cobro;
    }
    cat.gastos += dayPpc;
    /* B5 (entrega 6-sep) · las devoluciones salen de caja, y la curva no las
       descontaba. Van dentro de «gastos», que es la categoría del carril 7 que
       les corresponde: no son mercancía ni inversión. */
    cat.gastos += dayReturns;
    if(k >= diasCubiertos) cat.mercancia += dayCogsFlow;   // ver «reponer lo que vendes»
    if(d.getDate()===1) cat.gastos += monthlyFixed;
    if(d.getDate()===20) cat.gastos += dayRev*30*(toNum(cs.vat)/100)/(1+toNum(cs.vat)/100);
    if(poFlows[k]) cat.mercancia += poFlows[k];
    const pl = plan.dias[k] || {};
    cat.cobros      += toNum(pl.cobros);
    cat.gastos      += toNum(pl.gastos);
    cat.inversiones += toNum(pl.inversiones);
    cat.dividendos  += toNum(pl.dividendos);

    const inflow  = cat.cobros;
    const outflow = cat.mercancia + cat.gastos + cat.inversiones + cat.dividendos;
    Object.keys(totales).forEach(c=>{ totales[c] += cat[c]; });
    bal += inflow - outflow;
    out.push({k, date:d, inflow, outflow, bal, po:poFlows[k]||0, cat});
  }
  out.meta = {dayCogsFlow, diasCubiertos, unidsEnCurso, fueraDeVentana,
              sinFecha, sinCalendario, enDivisaSinTipo, posSinTipo,
              planFuera:plan.fuera, planPasados:plan.pasados, planN:plan.n,
              totales, dayReturns, returnsCost:P.returnsCost||0};
  return out;
}
/* M3 · el importe de un pedido se da SIEMPRE en euros, porque en euros está
   la caja, el margen y el colchón. Un pedido en divisa se convierte con el tipo
   que haya escrito el usuario a mano (`poFxRate`, en 27-compras).

   Si el pedido está en divisa y NO hay tipo, esta función devuelve el importe
   SIN convertir —no hay nada mejor que devolver— y `poFxMissing(po)` queda en
   cierto para que la pantalla y la curva de caja lo canten. Lo que no se hace
   es asumir un tipo de 1: 45.000 USD leídos como 45.000 € son ocho mil euros
   de diferencia en la curva que decide si cabe el pedido siguiente, y no salta
   ningún aviso porque el número es perfectamente plausible. */
function poAmount(po){
  const items = (po&&po.items)||[];
  const bruto = items.reduce((a,i)=>a+toNum(i.qty)*toNum(i.unitCost),0) + toNum(po&&po.freight);
  const fx = poFxRate(po);
  return fx===null ? bruto : bruto*fx;
}
function poUnits(po){ return (po.items||[]).reduce((a,i)=>a+toNum(i.qty),0); }
/* Reparto del flete al coste unitario, que es lo que cierra el círculo
   compra → coste → margen. Sin esto el margen es una estimación. */
/* Por LÍNEA, no por SKU. El mismo SKU puede aparecer dos veces en un pedido
   —una reposición y una ampliación negociadas a precios distintos— y resolver
   el flete con la primera línea mientras el coste sale de la segunda producía
   fletes negativos y un 25 % de coste de menos, sin ningún aviso. */
/* M3 · el reparto pasa a tener TRES bases —unidades, valor y peso— y, sobre
   todo, a ser auditable: `poFreightBasis(po)` (27-compras) dice qué criterio se
   pidió, cuál se ha podido aplicar de verdad, sobre qué total y en qué unidad,
   y esa frase es la que se enseña en la ficha del pedido y sale en el CSV.
   Aquí solo queda la aritmética, en la DIVISA DEL PEDIDO: la conversión a euros
   la hace quien crea el lote, que es el único sitio donde hay que hacerla. */
function poUnitCostOf(po, it){
  if(!it) return 0;
  return toNum(it.unitCost) + poFreightShareOf(po, it);
}
function poUnitCost(po, sku){
  return poUnitCostOf(po, (po.items||[]).find(i=>String(i.sku)===String(sku)));
}
/* M1.1 · un pedido recibido crea el LOTE, con su fecha, sus unidades y el flete
   ya repartido. Antes sobrescribía el coste del producto, y eso reescribía
   hacia atrás el margen de todo lo vendido con el lote anterior: el histórico
   cambiaba de números sin que nadie hubiera vendido nada distinto.
   El coste base se sigue actualizando porque es la red de seguridad, pero ya
   no es lo que costea las ventas anteriores a esta compra. */
function applyPOCosts(po){
  /* M3 · DIVISA. Antes que nada: un pedido en divisa sin tipo de cambio escrito
     no puede crear lotes, porque el coste entraría en el catálogo en dólares o
     en yuanes tratados como euros. El hub no consulta ningún tipo automático a
     propósito (la multidivisa está despriorizada), así que aquí solo cabe
     pedirlo. */
  if(poFxMissing(po)){
    toast('Este pedido está en '+poCur(po)+' y no tiene tipo de cambio. Escríbelo a mano en el pedido: sin él, el coste entraría en el catálogo en '+poCur(po)+' tratado como euros, y el margen saldría bajo sin que nada avise.');
    return;
  }

  const recs = poReceipts(po);
  let n2=0, lots=0, fecha='', futuro=false, saltadas=0;

  if(recs.length){
    /* M3 · ENTREGAS PARCIALES. Manda la lista de entregas: cada una crea su
       propio lote, con SU fecha y SUS unidades. En cuanto hay una entrega
       declarada, `po.received` deja de crear nada — si creara también su lote,
       el mismo contenedor entraría dos veces en el stock. */
    const conFecha = recs.filter(r=>poLotDate(po, r));
    saltadas = recs.length - conFecha.length;
    if(!conFecha.length){
      toast('Ninguna de las '+recs.length+' entregas de este pedido tiene fecha de recepción. Ponla en cada entrega: es la que decide desde cuándo existe ese stock y qué ventas costea.');
      return;
    }
    conFecha.forEach(r=>{
      (po.items||[]).forEach((i,idx)=>{
        if(!(poReceiptQty(r, idx) > 0)) return;
        if(!findProd(i.sku)) return;
        if(lotFromPO(po, i, idx, r)) lots++;
        n2++;
      });
    });
    const fechas = conFecha.map(r=>poLotDate(po, r)).sort();
    fecha = fechas[0] + (fechas.length>1 ? ' … '+fechas[fechas.length-1] : '');
    futuro = fechas[fechas.length-1] > iso(today());
  }else{
    /* Sin fecha de recepción no se crea nada. Antes se caía en la llegada
       prevista y, si no la había, en la fecha del pedido: un pedido cursado hace
       45 días y todavía en un barco fechaba el lote hace 45 días y subía un 61 %
       el coste de ventas que se sirvieron con stock viejo. Y no saltaba ningún
       aviso, porque el aviso solo miraba fechas futuras. */
    if(!poLotDate(po)){
      toast('Este pedido no tiene fecha de recepción. Ponla en «Recibido el»: es la que decide qué ventas se costean con este lote, y sin ella el coste se aplicaría a ventas que se sirvieron con stock anterior.');
      return;
    }
    fecha = poLotDate(po);
    futuro = fecha > iso(today());
    (po.items||[]).forEach((i,idx)=>{
      if(!findProd(i.sku)) return;
      if(lotFromPO(po, i, idx)) lots++;
      n2++;
    });
  }
  /* Ya NO se toca p.cogs. El coste base es lo que el producto valía antes de
     que hubiera registro de compras, y machacarlo con el precio del último
     pedido reescribía hacia atrás el margen de todo lo vendido: recibir un
     contenedor en agosto subía el coste de una venta de marzo. El pedido crea
     su lote, con su fecha, y ahí se queda. */
  saveDB(); refreshAll();
  if(!n2){ toast('Ningún SKU del pedido está en el catálogo'); return; }
  const A = poReceiptAudit(po);
  toast(lots+' lote'+(lots===1?'':'s')+' de coste creado'+(lots===1?'':'s')+' con fecha '+fecha+', flete repartido '+poFreightBasis(po).nombreUsado+
    (recs.length ? ' · '+num(A.recibidas)+' de '+num(A.pedidas)+' unidades recibidas' : '')+
    (saltadas ? ' · '+saltadas+' entrega(s) sin fecha, sin lote' : '')+
    (futuro ? ' · OJO: hay fecha de recepción futura, así que ese lote no costeará ninguna venta todavía' : ''));
}
