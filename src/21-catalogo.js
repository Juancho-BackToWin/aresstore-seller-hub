/* ═══════════════════════════════════════════════════════════════════════════
   CARRIL 2 · CATÁLOGO Y COSTES

   LA NORMA QUE MANDA AQUÍ. Un hub de gestión no falla dando error: falla
   dando un número creíble y falso. En este carril el fallo estrella tiene
   nombre y apellidos: un SKU sin coste cargado vale CERO, y un coste de cero
   produce un margen precioso que nadie ha medido. `FBANS0101`, `FBANS0103` y
   todas las unidades `amzn.gr.*` entraban exactamente por esa puerta.

   Este módulo hace cuatro cosas y ninguna abre un fichero compartido:

     1 · Registra el «Informe de listings activos», que nunca se había podido
         cargar, y ofrece crear los productos que faltan SIN tocar los que ya
         están.
     2 · Coste base en bloque sobre una selección múltiple. Al COSTE BASE,
         nunca a un lote: un lote inventado sella el margen como si estuviera
         medido, que es justo lo contrario de lo que persigue este proyecto.
     3 · Familias de coste, editables, y declaradas en pantalla como lo que
         son: deducidas, sin confirmar por Juancho.
     4 · Un SKU sin coste deja de valer cero: sale como «coste desconocido» y
         no cuenta como cobertura medida.

   Lo que NO hace, a propósito, está documentado más abajo en su sitio:
   heredar el coste de un `amzn.gr.*` a partir del SKU que parece llevar
   dentro. La documentación oficial de Amazon no lo respalda (ver GR-DOC).
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────
   0 · FECHAS DEL INFORME DE LISTINGS  ·  el sufijo MET/MEST

   MEDIDO con Bash sobre el fichero real el 17-09-2026, no supuesto:
   `open-date` viene como `DD/MM/YYYY HH:MM:SS MET` o `... MEST`. En las 39
   filas reales aparecen las dos formas.

   Ese sufijo NO es un huso que entienda `Date`. Comprobado:
   `new Date('22/08/2024 18:29:56 MEST')` → Invalid Date. Pasarlo tal cual
   dejaría la fecha de alta a nulo sin decirlo, y un catálogo con fechas de
   alta en blanco es exactamente un dato perdido en silencio.

   MET = UTC+1 y MEST = UTC+2, que son los mismos desplazamientos que CET y
   CEST, el huso civil de Europe/Madrid. Es decir: la fecha del calendario que
   Amazon imprime YA es la fecha de Madrid. Por eso aquí NO se convierte nada
   — convertir movería algunos altas un día sin que nada lo justifique — y sí
   se guarda el desplazamiento para que el dato quede auditable.
   ───────────────────────────────────────────────────────────────────────── */
const LISTING_HUSOS = {MET:1, MEST:2, CET:1, CEST:2, GMT:0, UTC:0, Z:0};

function listingOpenDate(v){
  const s = String(v==null ? '' : v).trim();
  if(!s) return {ok:false, iso:'', hora:'', huso:'', offsetH:null, motivo:'la celda viene vacía'};

  /* ISO primero: si algún día Amazon cambia el formato, no se rompe. */
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m){
    return {ok:true, iso:m[1]+'-'+m[2]+'-'+m[3],
            hora: m[4]!==undefined ? (('0'+m[4]).slice(-2)+':'+m[5]+':'+(m[6]||'00')) : '',
            huso:'', offsetH:null, motivo:''};
  }

  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*([A-Za-z]{1,5})?\s*$/);
  if(!m) return {ok:false, iso:'', hora:'', huso:'', offsetH:null,
                 motivo:'no reconozco el formato de «'+s+'»'};

  const dd = +m[1], mm = +m[2], yyyy = +m[3];
  if(mm<1 || mm>12 || dd<1 || dd>31)
    return {ok:false, iso:'', hora:'', huso:'', offsetH:null,
            motivo:'día o mes fuera de rango en «'+s+'»'};

  const husoRaw = (m[7]||'').toUpperCase();
  const conocido = Object.prototype.hasOwnProperty.call(LISTING_HUSOS, husoRaw);
  const iso = yyyy + '-' + ('0'+mm).slice(-2) + '-' + ('0'+dd).slice(-2);
  return {
    ok: true,
    iso: iso,
    hora: m[4]!==undefined ? (('0'+m[4]).slice(-2)+':'+m[5]+':'+(m[6]||'00')) : '',
    huso: husoRaw,
    offsetH: conocido ? LISTING_HUSOS[husoRaw] : null,
    /* Un huso que no conocemos NO invalida la fecha del calendario, pero sí se
       dice, porque es la clase de detalle que luego explica un desfase de un
       día que nadie sabe de dónde salió. */
    motivo: (husoRaw && !conocido) ? 'huso «'+husoRaw+'» no reconocido: se conserva la fecha impresa, sin convertir' : ''
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   1 · EL INFORME DE LISTINGS ACTIVOS

   Formato MEDIDO con Bash sobre el fichero real el 17-09-2026:
   80.098 bytes · BOM UTF-8 SÍ · fin de línea LF puro · termina en salto de
   línea · separador TAB · cabecera en la línea 1 · 49 columnas · 39 filas de
   datos · las 49 columnas están presentes en las 40 líneas.

   Se registra por la costura (`registrarInforme`), no abriendo `REPORTS` a
   mano: ese fichero es del carril 1 y está trabajando a la vez.

   `_opendate` va como OBLIGATORIO a propósito. Es la única columna que no
   comparte con ningún otro informe del catálogo, así que es lo que impide que
   esta definición le robe la detección a «Todos los pedidos» o a la vista
   previa de tarifas cuando llegan con las cabeceras traducidas.
   ───────────────────────────────────────────────────────────────────────── */
registrarInforme({
  id:'listings',
  label:'Informe de listings activos',
  en:'Active Listings Report',
  path:'Inventario › Informes de inventario › «Informe de listings activos»',
  feeds:'Catálogo: SKU, título, PVP publicado, ASIN, canal y fecha de alta',
  hdr:['sellersku','itemname','opendate','asin1'],
  forbid:['orderId'],
  fields:{
    _sku     :{req:1, type:'code',  alias:[/^sellersku$/,/^sku$/,/skudelvendedor/,/^referencia$/]},
    _opendate:{req:1, type:'date',  alias:[/^opendate$/,/fecha.*(alta|apertura|creacion)/]},
    _name    :{req:0, type:null,    alias:[/^itemname$/,/nombredelart/,/^titulo$/,/^nombre$/]},
    _price   :{req:0, type:'money', alias:[/^price$/,/^precio$/]},
    _asin    :{req:0, type:'asin',  alias:[/^asin1$/,/^asin$/]},
    _fulfil  :{req:0, type:null,    alias:[/^fulfillmentchannel$/,/fulfil?ment?channel/,/canaldegestion/,/^logistica$/]},
    _lid     :{req:0, type:null,    alias:[/^listingid$/,/iddelanuncio/]}
  },
  /* Huella por contenido, para cuando las cabeceras vienen traducidas: muchas
     columnas, ASIN presente y ningún identificador de pedido. */
  sig: P => P.has.asin && !P.has.orderId && P.cols >= 40
});

/* AMAZON_EU / AFN son FBA; DEFAULT / MFN son FBM. Cualquier otra cosa se deja
   sin decidir en vez de meterla en FBA «porque casi siempre lo es». */
function listingCanal(v){
  const s = String(v==null?'':v).trim().toUpperCase();
  if(!s) return {canal:'', seguro:false};
  if(s.indexOf('AMAZON')===0 || s==='AFN') return {canal:'FBA', seguro:true};
  if(s==='DEFAULT' || s==='MFN' || s.indexOf('MERCHANT')===0) return {canal:'FBM', seguro:true};
  return {canal:'', seguro:false};
}

/* Filas del informe ya leídas, una por SKU y con la fecha resuelta. */
function listingsParsed(){
  if(typeof imp!=='function') return [];
  return imp('listings').map(r=>{
    const sku = String((typeof gv==='function' ? gv(r,'_sku','sellersku','sku') : r._sku) || '').trim();
    const f   = listingOpenDate(typeof gv==='function' ? gv(r,'_opendate','opendate') : r._opendate);
    const ch  = listingCanal(typeof gv==='function' ? gv(r,'_fulfil','fulfillmentchannel') : r._fulfil);
    return {
      sku: sku,
      name: String((typeof gv==='function' ? gv(r,'_name','itemname') : r._name) || '').trim(),
      price: toNum((typeof gv==='function' ? gv(r,'_price','price') : r._price)),
      asin: String((typeof gv==='function' ? gv(r,'_asin','asin1') : r._asin) || '').trim(),
      canal: ch.canal, canalSeguro: ch.seguro,
      alta: f
    };
  }).filter(r=>r.sku);
}

/* Qué crearía el informe y qué ya estaba. No toca nada: solo compara. */
function catalogoDiff(){
  const rows = listingsParsed();
  const hay = {};
  DB.products.forEach(p=>{ hay[String(p.sku||'').trim().toLowerCase()] = p; });
  const crear = [], existentes = [], vistos = {};
  let duplicados = 0;
  rows.forEach(r=>{
    const k = r.sku.toLowerCase();
    if(vistos[k]){ duplicados++; return; }
    vistos[k] = 1;
    if(hay[k]) existentes.push(r); else crear.push(r);
  });
  /* Y al revés: productos del catálogo que el informe ya NO trae. No se borran
     —el informe solo lista lo ACTIVO, y un producto retirado sigue teniendo
     ventas y coste en el histórico— pero se dicen, porque un catálogo que
     crece y nunca encoge acaba costeando referencias que ya no existen. */
  const enInforme = {};
  rows.forEach(r=>{ enInforme[r.sku.toLowerCase()] = 1; });
  const fueraDelInforme = rows.length
    ? DB.products.filter(p=>!enInforme[String(p.sku||'').trim().toLowerCase()]).map(p=>p.sku)
    : [];
  return {filas:rows.length, crear, existentes, duplicados, fueraDelInforme,
          sinFecha: rows.filter(r=>!r.alta.ok).length,
          sinCanal: rows.filter(r=>!r.canalSeguro).length};
}

/* Crea SOLO los que faltan. Los que ya están no se tocan: ni el nombre, ni el
   precio, ni el coste, ni el canal. Un informe de listings no sabe nada del
   coste, así que «actualizar» un producto existente con él solo puede quitar
   información que alguien cargó a mano. */
function crearProductosDeListings(){
  const d = catalogoDiff();
  if(!d.filas){ if(typeof toast==='function') toast('No hay ningún informe de listings cargado'); return d; }
  if(!d.crear.length){
    if(typeof toast==='function') toast('No falta ninguno: los '+d.existentes.length+' SKU del informe ya están en el catálogo');
    DB.catalogoUltimaAlta = {cuando:new Date().toISOString(), creados:[], existentes:d.existentes.map(r=>r.sku)};
    saveDB(); renderCatalogo(); return d;
  }
  d.crear.forEach(r=>{
    DB.products.push({
      id: uid(),
      sku: r.sku,
      name: r.name || r.sku,
      supplierId: '',
      /* Del informe, medido */
      price: r.price,
      asin: r.asin,
      channel: r.canal || 'FBA',
      openDate: r.alta.ok ? r.alta.iso : '',
      /* NO del informe: el informe de listings no trae coste ninguno. Cero
         aquí NO significa «cuesta cero», significa «no lo sé», y por eso va
         además la marca explícita que lee el resto del módulo. */
      cogs: 0, freight: 0, costeDeclarado: false,
      /* Los mismos valores por defecto que pone `editProduct` a un producto
         nuevo hecho a mano. Son SUPUESTOS del hub, no medidas, y la pantalla
         lo dice al terminar. Dejarlos a cero sería peor: abarataría el coste
         y engordaría el margen sin avisar. */
      fba: 3.2, litres: 1.5, referral: 15, fbmShip: 0, fbmStock: 0,
      origen: 'informe de listings activos'
    });
  });
  DB.catalogoUltimaAlta = {
    cuando: new Date().toISOString(),
    creados: d.crear.map(r=>r.sku),
    existentes: d.existentes.map(r=>r.sku)
  };
  saveDB();
  if(typeof refreshAll==='function') refreshAll(); else renderCatalogo();
  if(typeof toast==='function')
    toast(d.crear.length+' producto'+(d.crear.length===1?'':'s')+' creado'+(d.crear.length===1?'':'s')+
          ' · '+d.existentes.length+' ya estaba'+(d.existentes.length===1?'':'n')+' · sin coste: hay que cargarlo');
  return d;
}

/* ─────────────────────────────────────────────────────────────────────────
   2 · UN SKU SIN COSTE NO VALE CERO

   `costOfSales()` ya cuenta aparte las unidades de origen `none` y ya deja
   fuera de `known` todo lo que se costea a cero. Lo que faltaba estaba en la
   PANTALLA: el catálogo imprimía «0,00 €» con la etiqueta «base», que se lee
   como un coste medido de cero euros. Eso es el número creíble y falso.
   ───────────────────────────────────────────────────────────────────────── */
function costeConocido(p){
  if(!p) return false;
  if(typeof prodLots==='function' && prodLots(p).length) return true;
  return (toNum(p.cogs) + toNum(p.freight)) > 0;
}

/* Unidades vendidas por SKU, tal y como las escribe el informe de pedidos.
   Sirve para ver SKU que VENDEN y no están en el catálogo: esos no aparecen
   en ninguna tabla de productos y son los que más fácil se escapan. */
function catUnidadesVendidas(){
  const m = {};
  if(typeof imp!=='function') return m;
  imp('orders').forEach(r=>{
    const s = String((typeof gv==='function' ? gv(r,'_sku','sku') : r._sku) || '').trim();
    if(!s) return;
    const q = toNum((typeof gv==='function' ? gv(r,'_qty','quantity','quantitypurchased') : r._qty));
    m[s] = (m[s]||0) + (q>0 ? q : 0);
  });
  return m;
}

/* El inventario completo de lo que no se sabe costear. */
function catCosteDesconocido(){
  const vendidas = catUnidadesVendidas();
  const enCatalogo = {};
  DB.products.forEach(p=>{ enCatalogo[String(p.sku||'').trim().toLowerCase()] = p; });

  const productos = DB.products.filter(p=>!costeConocido(p)).map(p=>({
    sku: p.sku, name: p.name || '',
    uds: vendidas[p.sku] || 0,
    gr: skuGradeResell(p.sku)
  }));

  const huerfanos = [];
  Object.keys(vendidas).forEach(sk=>{
    if(enCatalogo[sk.trim().toLowerCase()]) return;
    huerfanos.push({sku:sk, uds:vendidas[sk], gr:skuGradeResell(sk)});
  });

  const udsProd = productos.reduce((a,x)=>a+x.uds, 0);
  const udsHuer = huerfanos.reduce((a,x)=>a+x.uds, 0);
  const totalUds = Object.keys(vendidas).reduce((a,k)=>a+vendidas[k], 0);

  return {
    productos: productos.sort((a,b)=>b.uds-a.uds || String(a.sku).localeCompare(String(b.sku))),
    huerfanos: huerfanos.sort((a,b)=>b.uds-a.uds || String(a.sku).localeCompare(String(b.sku))),
    skus: productos.length + huerfanos.length,
    uds: udsProd + udsHuer,
    udsVendidasTotal: totalUds,
    pct: totalUds>0 ? (udsProd+udsHuer)/totalUds*100 : 0
  };
}

/* ─────────────────────────────────────────────────────────────────────────
   GR-DOC · LOS SKU `amzn.gr.*` · HIPÓTESIS VERIFICADA, Y HASTA DÓNDE

   La hipótesis del encargo era: los SKU con forma `amzn.gr.<SKU>-…` PARECEN
   unidades del programa de reventa de devoluciones de Amazon ligadas a un SKU
   propio. Se ha buscado en la documentación oficial. Resultado, en dos partes,
   porque la hipótesis tiene dos mitades y solo una está confirmada:

   CONFIRMADO por Amazon. Seller Central, página de ayuda «FBA Grade and
   Resell» (id UA6RV6UA4DR2MFK,
   https://sellercentral.amazon.com/gp/help/external/UA6RV6UA4DR2MFK),
   consultada el 17 de septiembre de 2026. Dice, literalmente, que «All SKUs in
   FBA Grade and Resell begin with amzn.gr to allow you to search for and track
   graded inventory in Seller Central», que Amazon GENERA un SKU nuevo para la
   unidad calificada, que la publica bajo el ASIN padre y que el vendedor sigue
   siendo el vendedor registrado. O sea: el prefijo `amzn.gr.` identifica, sin
   ambigüedad, unidades del programa de reventa de devoluciones. Esa mitad de
   la hipótesis queda confirmada.

   NO CONFIRMADO. Que el texto que va DETRÁS del prefijo sea el SKU propio del
   vendedor. La documentación de Amazon no publica la gramática del SKU: habla
   del prefijo y del ASIN padre, y nada más. El formato
   `amzn.gr.[seller-msku]-[defecto]-[condición]` solo aparece en blogs de
   terceros (kwickmetrics, 17-09-2026), que no citan fuente de Amazon.

   CONSECUENCIA, Y ES LA PARTE QUE IMPORTA: el hub NO hereda el coste del SKU
   base. Heredarlo sería exactamente el fallo que este proyecto persigue —
   rellenar un coste a partir de una gramática que nadie ha publicado y que,
   cuando el SKU propio lleva guiones, es además AMBIGUA. Un `amzn.gr.*` sigue
   saliendo como «coste desconocido» hasta que alguien le ponga un coste.

   Lo que sí se hace: leer la forma del SKU para poder ENSEÑARLA, marcada como
   deducida. Sirve para que Juancho sepa a qué mirar. No entra en ningún número.

   Los grados que Amazon documenta son LN, VG, GD y AC. Si aparece otro, se
   dice que no se reconoce en vez de traducirlo a ojo.
   ───────────────────────────────────────────────────────────────────────── */
const GR_PREFIJO = 'amzn.gr.';
const GR_GRADOS = {LN:'Como nuevo', VG:'Muy bueno', GD:'Bueno', AC:'Aceptable'};
const GR_FUENTE = {
  titulo: 'Amazon Seller Central · «FBA Grade and Resell» (UA6RV6UA4DR2MFK)',
  url: 'https://sellercentral.amazon.com/gp/help/external/UA6RV6UA4DR2MFK',
  consultada: '17 de septiembre de 2026'
};

function skuGradeResell(sku){
  const s = String(sku||'');
  if(s.toLowerCase().indexOf(GR_PREFIJO) !== 0) return null;
  const resto = s.slice(GR_PREFIJO.length);

  /* El grado: sufijo de dos letras al final. Se acepta como GRADO solo si
     Amazon lo documenta; si no, se dice que no se reconoce. */
  let grado = null, gradoRaw = '';
  const g = resto.match(/-([A-Za-z]{2})$/);
  if(g){ gradoRaw = g[1].toUpperCase(); grado = GR_GRADOS[gradoRaw] || null; }

  /* La base APARENTE. Un SKU propio puede llevar guiones (ARS-ROD-01), así que
     partir por el primer guión es una suposición. Se resuelve contra el
     catálogo, que es un hecho comprobable: se busca el prefijo MÁS LARGO que
     coincida con un SKU que existe de verdad. Si ninguno coincide, se deja la
     partición ingenua y se marca como NO comprobada. */
  const skus = DB.products.map(p=>String(p.sku||'')).filter(Boolean)
                 .sort((a,b)=>b.length-a.length);
  let base = '', comprobada = false;
  for(let i=0;i<skus.length;i++){
    const c = skus[i];
    if(resto.toLowerCase().indexOf(c.toLowerCase())===0 &&
       (resto.length===c.length || resto.charAt(c.length)==='-')){
      base = c; comprobada = true; break;
    }
  }
  if(!base){ base = resto.split('-')[0] || resto; }

  return {sku:s, base:base, baseEnCatalogo:comprobada, grado:grado, gradoRaw:gradoRaw};
}

/* ─────────────────────────────────────────────────────────────────────────
   3 · FAMILIAS DE COSTE

   Las seis vienen HEREDADAS de una entrega anterior y NADIE las ha
   confirmado. Se guardan con esa etiqueta pegada y la pantalla la enseña con
   esas palabras. Un coste deducido que se presenta sin adjetivo es un coste
   medido para quien lo lee.
   ───────────────────────────────────────────────────────────────────────── */
const CAT_FAMILIAS_ORIGEN = 'deducidas, sin confirmar por Juancho';
const CAT_FAMILIAS_INICIALES = [
  {id:'FBASPB0100', coste:5.00},
  {id:'FBASLB0110', coste:2.27},
  {id:'FBASS0150',  coste:3.90},
  {id:'FBA100',     coste:2.90},
  {id:'FBANS0100',  coste:3.30},
  {id:'FBA0500',    coste:3.80}
];
registrarClaveDB('costFamilies', {
  origen: CAT_FAMILIAS_ORIGEN,
  confirmadas: false,
  filas: CAT_FAMILIAS_INICIALES.map(f=>({id:f.id, coste:f.coste}))
});
registrarClaveDB('catalogoUltimaAlta', null);

function catFamilias(){
  const f = DB.costFamilies;
  if(!f || !Array.isArray(f.filas)) return {origen:CAT_FAMILIAS_ORIGEN, confirmadas:false, filas:[]};
  return f;
}
function catFamiliaCoste(id){
  const r = catFamilias().filas.filter(x=>x.id===id)[0];
  return r ? toNum(r.coste) : 0;
}
function catFamiliaSet(i, campo, v){
  const F = catFamilias();
  if(!F.filas[i]) return;
  F.filas[i][campo] = campo==='coste' ? toNum(v) : String(v||'').trim();
  /* Tocar una familia NO la confirma. Solo Juancho confirma, y para eso está
     el botón de al lado. */
  saveDB();
}
function catFamiliaAdd(){
  catFamilias().filas.push({id:'NUEVA', coste:0});
  saveDB(); renderCatalogo();
}
function catFamiliaDel(i){
  const F = catFamilias();
  F.filas.splice(i,1); saveDB(); renderCatalogo();
}
function catFamiliasConfirmar(){
  const F = catFamilias();
  F.confirmadas = !F.confirmadas;
  F.origen = F.confirmadas
    ? 'confirmadas por Juancho el ' + iso(today())
    : CAT_FAMILIAS_ORIGEN;
  saveDB(); renderCatalogo();
  if(typeof toast==='function')
    toast(F.confirmadas ? 'Familias marcadas como confirmadas' : 'Familias de vuelta a «'+CAT_FAMILIAS_ORIGEN+'»');
}

/* ─────────────────────────────────────────────────────────────────────────
   4 · COSTE BASE EN BLOQUE

   AL COSTE BASE, NUNCA A UN LOTE. Un lote dice «compré N unidades este día a
   este precio»; escribir uno desde aquí sería afirmar una compra que nadie ha
   hecho, y `lotCoverage()` lo contaría como unidad MEDIDA. El coste base dice
   «esto es lo que creo que vale», que es la verdad de lo que está pasando, y
   el motor ya lo cuenta como relleno y no como medición.
   ───────────────────────────────────────────────────────────────────────── */
/* La selección y el importe viven FUERA del DOM.

   `refreshAll()` se dispara con casi cualquier cosa —importar, guardar un
   lote, cambiar de periodo— y vuelve a pintar la tabla entera. Si la selección
   viviera solo en las casillas, marcar veinte productos y que te la borre un
   refresco a mitad de faena convierte esta pantalla en inservible; y peor, si
   se borra a medias, «aplicar a los seleccionados» aplica a otros. */
let catSelIds = {};
let catBulkEstado = {coste:0, tipo:'fabrica', familia:''};

function catSelMarcado(id){ return !!catSelIds[id]; }
function catSeleccionados(){
  /* El DOM manda mientras la tabla está pintada; el estado guardado es el
     respaldo para lo que el último repintado se haya llevado por delante. */
  const enDom = Array.prototype.slice.call(document.querySelectorAll('.cat-sel'));
  if(enDom.length){
    catSelIds = {};
    enDom.forEach(e=>{ if(e.checked) catSelIds[e.getAttribute('data-id')] = 1; });
  }
  return Object.keys(catSelIds).filter(id=>DB.products.some(p=>p.id===id));
}
function catSelTodos(on){
  Array.prototype.slice.call(document.querySelectorAll('.cat-sel'))
    .forEach(e=>{ e.checked = !!on; });
  if(!on) catSelIds = {};
  catSelCuenta();
}
function catSelCuenta(){
  const n2 = catSeleccionados().length;
  const el = document.getElementById('catSelCount');
  if(el) el.textContent = n2 + ' seleccionado' + (n2===1?'':'s');
  const todos = document.querySelector('.cat-sel-all');
  const cajas = document.querySelectorAll('.cat-sel');
  if(todos) todos.checked = cajas.length>0 && n2===cajas.length;
}
function catBulkRecordar(){
  const c = document.getElementById('catCosteBase');
  const t = document.getElementById('catCosteTipo');
  const f2 = document.getElementById('catFamSel');
  if(c) catBulkEstado.coste = toNum(c.value);
  if(t) catBulkEstado.tipo = t.value;
  if(f2) catBulkEstado.familia = f2.value;
}
function catAplicarFamilia(){
  const fid = val('catFamSel');
  const inp = document.getElementById('catCosteBase');
  if(fid && inp){ inp.value = catFamiliaCoste(fid); }
  catBulkRecordar();
}
/* REVISIÓN ADVERSARIAL · de qué es el importe que se escribe.

   `p.cogs` es el coste de FÁBRICA y `p.freight` el transporte: el coste que
   cuenta es la suma. Escribir solo `cogs` y dejar `freight` como estaba es la
   puerta por la que entra un número creíble y falso en las DOS direcciones:
   si el importe que tecleas ya lleva el transporte dentro y el producto además
   arrastraba un flete, el coste sale inflado; y si tecleas un coste de fábrica
   sobre un producto con el flete a cero, el coste puesto sale CORTO y el
   margen, alto. Por eso hay que decir cuál de las dos cosas es el importe. */
function catAplicarCosteBase(){
  const ids = catSeleccionados();
  if(!ids.length){ if(typeof toast==='function') toast('No has seleccionado ningún producto'); return null; }
  catBulkRecordar();
  const coste = catBulkEstado.coste;
  const puesto = catBulkEstado.tipo === 'puesto';
  const fid = catBulkEstado.familia || '';
  if(!(coste > 0)){
    if(typeof toast==='function')
      toast('Un coste base de cero no es un coste: es un margen inventado. Pon el importe o deja el SKU como «coste desconocido».');
    return null;
  }
  const F = catFamilias();
  const etiqueta = fid
    ? ('familia '+fid+(F.confirmadas ? ' (confirmada)' : ' ('+CAT_FAMILIAS_ORIGEN+')'))
    : 'importe escrito a mano, sin confirmar';
  let tocados = 0;
  ids.forEach(id=>{
    const p = DB.products.filter(x=>x.id===id)[0];
    if(!p) return;
    p.cogs = coste;            // COSTE BASE. Ni un lote se crea aquí.
    /* Si el importe es el coste PUESTO, el transporte que arrastraba el
       producto se pone a cero: si no, se sumaría dos veces. */
    if(puesto) p.freight = 0;
    p.costFamily = fid;
    p.costSource = etiqueta + (puesto ? ' · coste puesto en almacén' : ' · coste de fábrica, más el transporte del producto');
    p.costeDeclarado = true;
    tocados++;
  });
  catSelIds = {};
  saveDB();
  if(typeof refreshAll==='function') refreshAll(); else renderCatalogo();
  if(typeof toast==='function')
    toast('Coste base de '+fmt(coste)+' aplicado a '+tocados+' producto'+(tocados===1?'':'s')+
          ' · '+(puesto?'coste puesto':'coste de fábrica')+' · '+etiqueta+' · no se ha creado ningún lote');
  return {tocados, coste, etiqueta, puesto};
}

/* ─────────────────────────────────────────────────────────────────────────
   COSTURA → carril 5 (rentabilidad): `pnl().measured`

   QUÉ. `pnl()` marca el periodo como MEDIDO con
       measured = sf.matched>0 && tb.known && !ads.spanUnknown
   — liquidación casada, base de IVA leída y publicidad fechada. El COSTE no
   entra en esa condición.

   POR QUÉ IMPORTA. Con ese criterio, un periodo en el que el 40 % de las
   unidades se costea a cero euros puede salir con la insignia de «medido» y
   un margen precioso. Es literalmente el fallo estrella de este carril, solo
   que visto desde la otra pantalla.

   QUÉ PIDO. Que la condición incluya también el coste:
       measured = sf.matched>0 && tb.known && !ads.spanUnknown &&
                  cost.units>0 && cost.known >= cost.units
   Es una línea, dentro de `pnl()`, que es de vuestro carril. `cost` ya está
   calculado justo encima y `cost.known` ya excluye las unidades a coste cero,
   así que no hace falta nada más.

   MIENTRAS TANTO. Este módulo NO edita `pnl()`. Calcula el mismo hecho por su
   cuenta con `catCostePnlFiable()` y lo enseña en Catálogo, para que al menos
   haya UNA pantalla donde el agujero se vea. Cuando el carril 5 aplique la
   línea, esta función se puede borrar.
   ───────────────────────────────────────────────────────────────────────── */
function catCostePnlFiable(){
  try{
    const S = (typeof salesRows==='function') ? salesRows() : [];
    const C = costOfSales(S);
    return {
      ok: C.units>0 && C.known >= C.units,
      units: C.units, known: C.known, sinCoste: Math.max(0, C.units - C.known),
      medidas: C.quality ? C.quality.lot : 0,
      pctMedido: C.measuredPct || 0
    };
  }catch(e){
    return {ok:false, units:0, known:0, sinCoste:0, medidas:0, pctMedido:0, err:e.message};
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   5 · LA PANTALLA
   ───────────────────────────────────────────────────────────────────────── */
registrarEstilo(
  '.cat-desconocido{color:var(--stop,#e5484d);font-weight:600}'+
  '.cat-deducido{font-size:10px;opacity:.75}'+
  '#catPanels .panel{margin-top:18px}'+
  '#catPanels .grid td input[type=number]{width:96px}'+
  '.cat-sel{width:15px;height:15px;cursor:pointer}'
);

/* Los paneles se insertan en la vista de Catálogo, que ya está en el DOM
   cuando corren los módulos 2x (el HTML va antes que el <script>). Así no se
   abre `src/02-views.html`, que lo comparten los diez carriles. */
function catMontarPaneles(){
  const vista = document.getElementById('view-catalogo');
  if(!vista || document.getElementById('catPanels')) return;
  const cont = document.createElement('div');
  cont.id = 'catPanels';
  cont.innerHTML =
    '<div class="panel">'+
      '<div class="panel-head"><div>'+
        '<h2>Informe de listings activos</h2>'+
        '<p class="desc" style="margin:0">El informe que dice qué estás vendiendo de verdad en Amazon: SKU, título, PVP publicado, ASIN, canal y fecha de alta. No trae ningún coste, así que lo que cree aquí nace sin coste y lo dice.</p>'+
      '</div></div>'+
      '<div id="catListingsBox"></div>'+
    '</div>'+
    '<div class="panel">'+
      '<div class="panel-head"><div>'+
        '<h2>Coste base en bloque</h2>'+
        '<p class="desc" style="margin:0">Marca productos en la tabla de arriba y ponles un coste base de una vez. Va al <strong>coste base</strong>, nunca a un lote: un lote afirma una compra que existió, y escribir uno desde aquí sellaría como medido un margen que no lo está.</p>'+
      '</div></div>'+
      '<div id="catBulkBox"></div>'+
    '</div>'+
    '<div class="panel">'+
      '<div class="panel-head"><div>'+
        '<h2>Familias de coste</h2>'+
        '<p class="desc" style="margin:0">Costes por familia de producto para no teclear el mismo importe veinte veces.</p>'+
      '</div></div>'+
      '<div id="catFamBox"></div>'+
    '</div>'+
    '<div class="panel">'+
      '<div class="panel-head"><div>'+
        '<h2>SKU sin coste conocido</h2>'+
        '<p class="desc" style="margin:0">Un SKU sin coste no vale cero euros: no se sabe lo que vale. La diferencia entre las dos cosas es todo el margen.</p>'+
      '</div></div>'+
      '<div id="catSinCosteBox"></div>'+
    '</div>';
  /* Antes del panel de lotes, que es el que cierra la pantalla. */
  const lotes = vista.querySelector('#lotMethodBox');
  const panelLotes = lotes ? lotes.closest('.panel') : null;
  if(panelLotes) vista.insertBefore(cont, panelLotes);
  else vista.appendChild(cont);
}

function renderCatalogoExtra(){
  catMontarPaneles();
  renderCatListings();
  renderCatBulk();
  renderCatFamilias();
  renderCatSinCoste();
}

function renderCatListings(){
  const el = document.getElementById('catListingsBox'); if(!el) return;
  const cargado = (typeof hasImp==='function') && hasImp('listings');
  if(!cargado){
    el.innerHTML = '<div class="note-box info" style="margin:0;font-size:12.5px">'+
      '<strong>Todavía no has cargado ningún informe de listings activos.</strong> '+
      'Se descarga en <em>Inventario › Informes de inventario › «Informe de listings activos»</em> y se suelta en la pestaña Datos. '+
      'Viene en TXT separado por tabuladores, con BOM UTF-8 y 49 columnas; el hub lo reconoce solo por <code>seller-sku</code>, <code>item-name</code>, <code>open-date</code> y <code>asin1</code>.</div>';
    return;
  }
  const d = catalogoDiff();
  const U = DB.catalogoUltimaAlta;
  const lista = (arr, clase) => arr.length
    ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">'+
        arr.map(s=>'<span class="pill '+clase+'">'+esc(s)+'</span>').join('')+'</div>'
    : '';
  el.innerHTML =
    '<div class="kpis">'+
      kpi('SKU en el informe', num(d.filas), d.duplicados? num(d.duplicados)+' repetidos, contados una vez' : 'una fila por anuncio activo', '')+
      kpi('Faltan en el catálogo', num(d.crear.length), d.crear.length? 'se pueden crear ahora' : 'ninguno', d.crear.length?'warn':'pos')+
      kpi('Ya estaban', num(d.existentes.length), 'no se tocan', '')+
      kpi('En el catálogo y no en el informe', num(d.fueraDelInforme.length),
          d.fueraDelInforme.length? 'retirados o de otra cuenta · no se borra ninguno' : 'ninguno',
          d.fueraDelInforme.length?'warn':'')+
      kpi('Sin fecha de alta legible', num(d.sinFecha),
          d.sinFecha? 'formato de open-date no reconocido' : 'las '+num(d.filas)+' con DD/MM/YYYY + MET/MEST', d.sinFecha?'warn':'pos')+
    '</div>'+
    '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-top:14px">'+
      '<button class="btn sm primary" onclick="crearProductosDeListings()"'+(d.crear.length?'':' disabled')+'>'+
        'Crear los '+num(d.crear.length)+' productos que faltan</button>'+
      '<span class="mut" style="font-size:12.5px">No toca los '+num(d.existentes.length)+' que ya están.</span>'+
    '</div>'+
    (d.crear.length ? '<div class="mut" style="font-size:12.5px;margin-top:10px">Se crearían:</div>'+lista(d.crear.map(r=>r.sku),'warn') : '')+
    (d.existentes.length ? '<div class="mut" style="font-size:12.5px;margin-top:10px">Ya estaban, no se tocan:</div>'+lista(d.existentes.map(r=>r.sku),'') : '')+
    (d.fueraDelInforme.length ? '<div class="mut" style="font-size:12.5px;margin-top:10px">En tu catálogo y no en este informe (no se borran):</div>'+lista(d.fueraDelInforme,'warn') : '')+
    (d.sinCanal ? '<div class="note-box warn" style="margin-top:12px;font-size:12.5px">'+num(d.sinCanal)+
       ' fila(s) traen un <code>fulfillment-channel</code> que no sé traducir a FBA o FBM. Esas se crean como FBA y hay que revisarlas a mano: meterlas en FBA «porque casi siempre lo es» cambia la tarifa y con ella el margen.</div>' : '')+
    (U ? '<div class="note-box info" style="margin-top:12px;font-size:12.5px"><strong>Última vez que se creó desde el informe:</strong> '+
         esc(String(U.cuando).slice(0,10))+' · creados '+num((U.creados||[]).length)+
         ' · ya estaban '+num((U.existentes||[]).length)+'. '+
         'Los productos creados nacen <strong>sin coste</strong>, y con la tarifa FBA (3,20 €) y la comisión (15 %) que el hub pone por defecto a cualquier producto nuevo: son supuestos del hub, no medidas, porque el informe de listings no trae ni coste ni tarifas.</div>' : '');
}

function renderCatBulk(){
  const el = document.getElementById('catBulkBox'); if(!el) return;
  catBulkRecordar();
  const E = catBulkEstado;
  const F = catFamilias();
  el.innerHTML =
    '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:flex-end">'+
      '<div class="field" style="margin:0"><label>Familia (opcional)</label>'+
        '<select id="catFamSel" onchange="catAplicarFamilia()">'+
          '<option value=""'+(E.familia?'':' selected')+'>— importe a mano —</option>'+
          F.filas.map(f=>'<option value="'+esc(f.id)+'"'+(E.familia===f.id?' selected':'')+'>'+esc(f.id)+' · '+fmt(toNum(f.coste))+'</option>').join('')+
        '</select></div>'+
      '<div class="field" style="margin:0"><label>Coste base</label>'+
        '<div class="input-wrap"><input type="number" step="0.01" id="catCosteBase" value="'+toNum(E.coste)+'" oninput="catBulkRecordar()"><span class="unit">€</span></div></div>'+
      '<div class="field" style="margin:0"><label>Ese importe es…</label>'+
        '<select id="catCosteTipo" onchange="catBulkRecordar()">'+
          '<option value="fabrica"'+(E.tipo==='puesto'?'':' selected')+'>coste de FÁBRICA · se le suma el transporte que ya tenga el producto</option>'+
          '<option value="puesto"'+(E.tipo==='puesto'?' selected':'')+'>coste PUESTO en almacén · sustituye también el transporte</option>'+
        '</select></div>'+
      '<button class="btn sm" onclick="catSelTodos(true)">Marcar todos</button>'+
      '<button class="btn sm" onclick="catSelTodos(false)">Ninguno</button>'+
      '<button class="btn sm primary" onclick="catAplicarCosteBase()">Aplicar coste base a los seleccionados</button>'+
      '<span class="mut" id="catSelCount" style="font-size:12.5px">0 seleccionados</span>'+
    '</div>'+
    '<div class="note-box warn" style="margin:12px 0 0;font-size:12.5px">'+
      '<strong>Esto escribe un coste base, no una compra.</strong> El coste base es la red de seguridad para las ventas que ningún lote cubre, '+
      'y el motor lo cuenta como relleno, no como unidad medida. Si además quieres que el margen pase de estimado a medido, hay que cargar las compras de verdad en «Lotes de coste», con su fecha y sus unidades.'+
      (F.confirmadas ? '' : ' Las familias de aquí al lado están <strong>'+esc(CAT_FAMILIAS_ORIGEN)+'</strong>.')+
    '</div>';
  catSelCuenta();
}

function renderCatFamilias(){
  const el = document.getElementById('catFamBox'); if(!el) return;
  const F = catFamilias();
  el.innerHTML =
    '<div class="note-box '+(F.confirmadas?'info':'warn')+'" style="margin:0 0 12px;font-size:12.5px">'+
      '<strong>Estas seis cifras están '+esc(F.origen)+'.</strong> '+
      (F.confirmadas
        ? 'Alguien ha marcado que las ha revisado. Si eso no es cierto, quítalo: una cifra confirmada por error es peor que una sin confirmar.'
        : 'Vinieron heredadas de una entrega anterior y no se han podido comprobar contra ninguna factura en esta base. Un coste que se presenta sin adjetivo se lee como un coste medido, y con él el margen sale sellado sin que nadie lo haya medido. Úsalas para arrancar, no para decidir.')+
    '</div>'+
    '<div class="tbl-wrap"><table class="grid" id="catFamTable">'+
      '<tr><th>Familia</th><th class="num">Coste base €</th><th>Estado</th><th style="width:36px"></th></tr>'+
      (F.filas.length ? F.filas.map((f,i)=>
        '<tr><td class="name"><input type="text" value="'+esc(f.id)+'" oninput="catFamiliaSet('+i+',\'id\',this.value)"></td>'+
        '<td class="num"><input type="number" step="0.01" value="'+toNum(f.coste)+'" oninput="catFamiliaSet('+i+',\'coste\',this.value)"></td>'+
        '<td class="name '+(F.confirmadas?'pos':'')+'">'+esc(F.confirmadas?'confirmada':'deducida, sin confirmar')+'</td>'+
        '<td><button class="icon-btn" onclick="catFamiliaDel('+i+')">✕</button></td></tr>').join('')
        : '<tr><td colspan="4" class="name mut">Sin familias.</td></tr>')+
    '</table></div>'+
    '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:12px">'+
      '<button class="btn sm" onclick="catFamiliaAdd()">+ Familia</button>'+
      '<button class="btn sm'+(F.confirmadas?'':' primary')+'" onclick="catFamiliasConfirmar()">'+
        (F.confirmadas ? 'Quitar la confirmación' : 'Juancho las ha confirmado')+'</button>'+
    '</div>';
}

function renderCatSinCoste(){
  const el = document.getElementById('catSinCosteBox'); if(!el) return;
  const D = catCosteDesconocido();
  const P = catCostePnlFiable();
  const gr = D.productos.filter(x=>x.gr).concat(D.huerfanos.filter(x=>x.gr));

  const filas = D.productos.map(x=>({sku:x.sku, name:x.name, uds:x.uds, donde:'en el catálogo, sin coste', gr:x.gr}))
    .concat(D.huerfanos.map(x=>({sku:x.sku, name:'', uds:x.uds, donde:'vende y no está en el catálogo', gr:x.gr})));

  el.innerHTML =
    '<div class="kpis">'+
      kpi('SKU sin coste conocido', num(D.skus),
          D.skus? 'ninguno de ellos vale cero: no se sabe lo que vale' : 'todos los SKU tienen coste', D.skus?'neg':'pos')+
      kpi('Unidades vendidas sin coste', num(P.sinCoste),
          P.units? 'de '+num(P.units)+' del periodo' : 'sin ventas en el periodo', P.sinCoste?'neg':'pos')+
      kpi('Cobertura medida', num(P.pctMedido,0)+' %',
          'unidades respaldadas por una compra con unidades', (P.pctMedido>=90?'pos':(P.pctMedido>=50?'warn':'neg')))+
      kpi('¿El margen del periodo está medido?', P.ok? 'sí, por coste' : 'no',
          P.ok? 'todas las unidades vendidas tienen coste' : num(P.sinCoste)+' unidades se costean a cero euros', P.ok?'pos':'neg')+
    '</div>'+
    (P.ok ? '' :
      '<div class="note-box warn" style="margin:14px 0 0;font-size:12.5px">'+
        '<strong>'+num(P.sinCoste)+' unidades del periodo se están costeando a cero euros.</strong> '+
        'Cada una de ellas aporta al beneficio su precio de venta entero menos comisiones: margen inventado, no margen medido. '+
        'Mientras esto siga así, el beneficio de Rentabilidad está por encima del real, y no por poco. '+
        '<br><br><span class="mut">Nota de integración: la insignia de «medido» de Rentabilidad todavía no mira el coste '+
        '(mira liquidación, base de IVA y publicidad). Está pedido al carril 5 como costura; hasta entonces, este panel es el único sitio donde se ve.</span>'+
      '</div>')+
    /* REVISIÓN ADVERSARIAL · el catálogo que haría que esto saliera alto y
       falso es el más fácil de todos: marcar todos los productos y aplicarles
       una familia de un plumazo. La tabla de abajo se queda vacía y se lee
       «ya está», cuando lo único que ha pasado es que ahora hay un número
       DEDUCIDO donde antes había un hueco. Por eso el veredicto se escribe
       aquí, y mira las dos cosas a la vez. */
    (D.productos.length===0 && P.units>0 && P.pctMedido < 90
      ? '<div class="note-box warn" style="margin:14px 0 0;font-size:12.5px">'+
        '<strong>Ya no queda ningún SKU sin coste, pero eso no quiere decir que el margen esté medido.</strong> '+
        'Solo el '+num(P.pctMedido,0)+' % de las unidades del periodo tiene detrás una compra con fecha y unidades. '+
        'El resto se costea con el coste base, que es lo que crees que vale, no lo que pagaste. '+
        'Para que el margen pase de estimado a medido hay que cargar las compras en «Lotes de coste».</div>'
      : '')+
    (D.skus===0 && P.units>0 && P.pctMedido >= 90
      ? '<div class="note-box info" style="margin:14px 0 0;font-size:12.5px">'+
        '<strong>Ningún SKU sin coste y el '+num(P.pctMedido,0)+' % de las unidades respaldado por una compra real.</strong> '+
        'Esto sí es un margen medido.</div>'
      : '')+
    '<div class="tbl-wrap" style="margin-top:14px"><table class="grid" id="catSinCosteTable">'+
      '<tr><th>SKU</th><th>Producto</th><th class="num">Unidades vendidas</th><th>Coste</th><th>Dónde está</th></tr>'+
      (filas.length ? filas.map(f=>
        '<tr><td><strong>'+esc(f.sku)+'</strong>'+
          (f.gr ? '<br><span class="pill info cat-deducido">reventa de devoluciones</span>' : '')+'</td>'+
        '<td class="name mut">'+esc(f.name||'—')+'</td>'+
        '<td class="num">'+(f.uds? num(f.uds) : '—')+'</td>'+
        '<td><span class="cat-desconocido">coste desconocido</span></td>'+
        '<td class="name mut">'+esc(f.donde)+'</td></tr>').join('')
        : '<tr><td colspan="5" class="name mut">Ningún SKU sin coste. Es la primera vez que esta tabla puede estar vacía.</td></tr>')+
    '</table></div>'+
    renderCatGradeResell(gr);
}

/* La tabla de `amzn.gr.*`: se ENSEÑA, no se usa para rellenar nada. */
function renderCatGradeResell(gr){
  const cab =
    '<h2 style="margin-top:26px">Unidades <code>amzn.gr.*</code> · reventa de devoluciones</h2>'+
    '<div class="note-box info" style="margin:10px 0 0;font-size:12.5px">'+
      '<strong>Qué dice Amazon, y qué no.</strong> '+
      'La página de ayuda de Seller Central <em>«FBA Grade and Resell»</em> (<code>UA6RV6UA4DR2MFK</code>, '+
      '<a href="'+GR_FUENTE.url+'" target="_blank" rel="noopener">'+GR_FUENTE.url+'</a>, consultada el '+GR_FUENTE.consultada+') '+
      'dice que <em>todos</em> los SKU del programa empiezan por <code>amzn.gr</code>, que Amazon genera un SKU nuevo para cada unidad calificada '+
      'y que la publica bajo el ASIN padre, contigo como vendedor registrado. Eso queda <strong>confirmado</strong>: '+
      'un <code>amzn.gr.*</code> es una unidad de reventa de devoluciones.'+
      '<br><br>'+
      '<strong>Lo que Amazon NO documenta</strong> es que el texto que va detrás del prefijo sea tu propio SKU. '+
      'La gramática del SKU (<code>amzn.gr.[msku]-[defecto]-[condición]</code>) solo aparece en blogs de terceros, sin fuente de Amazon. '+
      'Y cuando tu SKU lleva guiones, esa partición es además ambigua.'+
      '<br><br>'+
      '<strong>Por eso el hub NO hereda el coste del SKU base.</strong> Rellenar un coste a partir de una gramática que nadie ha publicado '+
      'es exactamente el fallo que este proyecto persigue. Estas unidades siguen como «coste desconocido» hasta que alguien les ponga un coste, '+
      'y la columna «SKU base aparente» de aquí abajo está <strong>deducida de la forma del texto</strong>: sirve para saber a qué mirar, no entra en ningún número.'+
      '<br><br>Los grados que Amazon documenta son <code>LN</code>, <code>VG</code>, <code>GD</code> y <code>AC</code>. Cualquier otro se marca como no reconocido en vez de traducirlo a ojo.'+
    '</div>';
  if(!gr.length)
    return cab + '<div class="mut" style="font-size:12.5px;margin-top:12px">No hay ningún SKU <code>amzn.gr.*</code> sin coste en estos datos.</div>';
  return cab +
    '<div class="tbl-wrap" style="margin-top:12px"><table class="grid" id="catGrTable">'+
      '<tr><th>SKU de la unidad</th><th>SKU base aparente</th><th>¿Está ese SKU en tu catálogo?</th><th>Grado</th><th class="num">Unidades</th><th>Coste</th></tr>'+
      gr.map(x=>'<tr><td class="name"><strong>'+esc(x.sku)+'</strong></td>'+
        '<td><strong>'+esc(x.gr.base)+'</strong> <span class="mut cat-deducido">deducido</span></td>'+
        '<td class="'+(x.gr.baseEnCatalogo?'pos':'mut')+'">'+(x.gr.baseEnCatalogo?'sí':'no · partición sin comprobar')+'</td>'+
        '<td>'+(x.gr.grado ? esc(x.gr.grado)+' <span class="mut cat-deducido">'+esc(x.gr.gradoRaw)+'</span>'
                           : (x.gr.gradoRaw ? '<span class="pill warn">«'+esc(x.gr.gradoRaw)+'» no documentado</span>' : '<span class="mut">—</span>'))+'</td>'+
        '<td class="num">'+(x.uds? num(x.uds) : '—')+'</td>'+
        '<td><span class="cat-desconocido">coste desconocido</span></td></tr>').join('')+
    '</table></div>';
}

/* ─────────────────────────────────────────────────────────────────────────
   6 · EXPORTACIÓN DEL CATÁLOGO CON EL ORIGEN DEL COSTE

   `exportCatalogo()` (que también es de este carril) saca los LOTES en crudo.
   Falta la otra mitad: el catálogo con el coste y, sobre todo, de dónde sale
   ese coste. Un CSV de costes sin la columna «de dónde sale» es un CSV que
   dentro de tres meses nadie sabe si se puede creer.
   ───────────────────────────────────────────────────────────────────────── */
registrarExportacion('catalogocostes', 'Exportar catálogo y costes', function(){
  const F = catFamilias();
  descargarCSV('catalogo-y-costes',
    ['SKU','Producto','Canal','ASIN','Alta','Coste base €','Origen del coste','Lotes','PVP €'],
    DB.products.map(p=>{
      const conocido = costeConocido(p);
      const lotes = (typeof prodLots==='function') ? prodLots(p).length : 0;
      let origen;
      if(lotes) origen = 'lotes de compra ('+lotes+')';
      else if(!conocido) origen = 'COSTE DESCONOCIDO';
      else origen = p.costSource || 'introducido a mano, sin confirmar';
      return [p.sku, p.name||'', p.channel||'FBA', p.asin||'', p.openDate||'',
              conocido ? r2(toNum(p.cogs)+toNum(p.freight)) : '',
              origen, lotes, r2(toNum(p.price))];
    }).concat(
      /* Las familias van al pie del mismo fichero, con su adjetivo pegado. */
      [[]], [['FAMILIAS DE COSTE', F.origen, '', '', '', '', '', '', '']],
      F.filas.map(f=>['', f.id, '', '', '', r2(toNum(f.coste)), F.origen, '', ''])
    ));
});
