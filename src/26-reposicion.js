/* ═══════════════════════════════════════════════════════════════════════════
   M2 · REPOSICIÓN  ·  carril 6

   Qué decide esta pantalla: cuántas unidades pedir de cada referencia y cuándo.
   Es la decisión más cara del hub después de la de precio, y la que más
   fácilmente se equivoca dando una cifra creíble. Tres reglas que mandan sobre
   todo lo que hay debajo:

   1 · La velocidad que manda es la que EXCLUYE los días sin stock. Ya existía
       en M0 (`velocityStats`, 12b-historico.js): unidades entre días con stock,
       no entre días de calendario. Aquí no se rehace, se usa. Cuando no hay
       histórico con el que corregirla, se dice y se cae a la de Inventario.

   2 · Lo estimado se presenta como estimado. Una velocidad medida sobre cuatro
       días no vale lo mismo que una medida sobre noventa, y proyectarla a un
       plazo de fabricación de tres meses multiplica por veinte el ruido de una
       semana floja. Cada fila lleva su base de medición escrita.

   3 · La regla de la tarifa por bajo inventario es la de Amazon, verificada
       contra su documentación vigente, no la que le suene a nadie. Ver
       TARIFA_BAJO_INV más abajo.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── COSTURA → congelados: stockSnapshotDate() ──────────────────────────────
   El encargo la da por congelada («la llamas, no la cambias»), pero el
   17-09-2026 NO EXISTE en esta base: `grep -rn "stockSnapshotDate" src/` no
   devuelve nada, igual que pasaba con `paisDeJuris()` según PROPIEDAD.md. No se
   puede llamar a lo que no está, así que se define aquí, en el fichero del
   carril, con la firma mínima que D5 necesita. Si la integración recupera la
   versión original, esta se borra y `rebuildHistory()` seguirá funcionando sin
   tocarla, porque solo depende de la firma.

   Qué devuelve: el día en que se MIDIÓ la foto de inventario, que es el día en
   que se descargó el informe, no el día en que se pulsa «reconstruir».
   `saveImport()` sella `loadedAt` en el momento de la importación, así que esa
   es la fecha de la medición. Devuelve null cuando no consta: sin fecha no se
   archiva nada, porque un dato de histórico mal fechado es peor que no tenerlo.

   Se queda con la MÁS RECIENTE de las dos fotos posibles (inventario FBA y
   multipaís) porque `captureStock()` las funde en un solo registro y el
   registro no puede llevar dos fechas. Cuando difieren, la pantalla lo dice. */
function stockSnapshotDate(){
  const cand = [];
  ['inventory','multicountry'].forEach(id=>{
    const x = (DB.imports||{})[id];
    if(!x || !x.loadedAt) return;
    const d = new Date(x.loadedAt);
    if(!isNaN(d.getTime())) cand.push(d);
  });
  if(!cand.length) return null;
  cand.sort((a,b)=>b-a);
  return startOfDay(cand[0]);
}
/* ¿Las dos fotos son del mismo día? Si no, el registro fundido lleva la fecha
   de una sola y la otra está desfasada. Se enseña, no se disimula. */
function stockSnapshotSpread(){
  const dias = [];
  ['inventory','multicountry'].forEach(id=>{
    const x = (DB.imports||{})[id];
    if(!x || !x.loadedAt) return;
    const d = new Date(x.loadedAt);
    if(!isNaN(d.getTime())) dias.push(iso(startOfDay(d)));
  });
  const u = Array.from(new Set(dias)).sort();
  return {dias:u, mismoDia: u.length<2};
}

/* ═══ LA TARIFA POR BAJO INVENTARIO, SEGÚN AMAZON ══════════════════════════

   FUENTE PRIMARIA, consultada el 17 de septiembre de 2026:
   «Tarifas — Fulfilment by Amazon (FBA). Tarifas europeas. En vigor a partir
   del 1 de julio de 2026», tarifario oficial de Amazon España, páginas 10-11 y
   pregunta frecuente P6 (página 31):
   https://m.media-amazon.com/images/G/02/sell/images/260630-FBA-Rate-Card-ES1.pdf

   Literal del tarifario (P6 y página 10):

     «Solo cargaremos la tarifa por cobertura de coste por nivel bajo de
      inventario (Programa Paneuropeo) cuando tanto los días históricos de
      suministro a largo plazo (últimos 90 días) como los días históricos de
      suministro a corto plazo (últimos 30 días) sean inferiores a 28 días
      (4 semanas); de lo contrario, los vendedores no incurrirán en la tarifa.»

     «Calcularemos la cantidad histórica de días de suministro del FNSKU del
      vendedor en función de la media diaria de unidades disponibles, dividida
      entre la media diaria de unidades enviadas en las tiendas del Programa
      paneuropeo, tanto a largo plazo (últimos 90 días) como a corto plazo
      (últimos 30 días).»

     «No se aplica a Países Bajos, Polonia, Suecia, Bélgica e Irlanda.»

   Lo que eso cambia respecto a lo que hacía el hub. Inventario marcaba «tarifa
   bajo inv.» con UNA cobertura instantánea: stock de hoy entre venta media del
   periodo. Amazon no usa eso. Usa dos medias históricas —90 días y 30 días— y
   cobra solo si LAS DOS bajan de 28. Con el criterio instantáneo, una
   referencia que acaba de vaciarse tras tres meses sobrada sale marcada como si
   fuera a pagar, y una que lleva tres meses justa pero hoy tiene una entrada
   recién recibida sale limpia. Ninguna de las dos es lo que Amazon va a cobrar.

   Importes verificados en el mismo tarifario (€/unidad, DE/IT/ES/FR):

                                       0–14 d   14–21 d   21–28 d
     Sobre ligero  (≤100 g)             0,27      0,18      0,16
     Sobre estándar (≤460 g)            0,41      0,25      0,18
     Sobre grande / paquete pequeño     0,46      0,27      0,18
     Paquete estándar (≤11,9 kg)        0,67      0,35      0,21
     Tamaño grande / voluminoso / pesado — sin importe: no se aplica

   Es decir: el rango «0,16 – 0,67 €/ud» que ya decía la pantalla de Inventario
   es CORRECTO, y ahora está comprobado contra el tarifario en vez de heredado.

   Lo que NO he podido confirmar y por tanto NO se aplica: varias fuentes
   secundarias hablan de una exención de 180 días para ASIN nuevos en Logística
   de Amazon. Esa exención aparece en material del mercado estadounidense; en el
   tarifario europeo vigente no está. No se implementa como si fuera segura: el
   hub avisa igual para un SKU nuevo y dice que la exención no está confirmada.

   Tampoco se modela el nivel de tamaño, porque el hub no conoce las medidas de
   los productos: se enseña el rango, no un importe por unidad concreto. Poner
   un importe exacto sin saber el tamaño sería inventárselo.
   ═══════════════════════════════════════════════════════════════════════════ */
const TARIFA_BAJO_INV = {
  umbralDias : 28,
  ventanas   : [30, 90],                 // las DOS tienen que estar por debajo
  paises     : ['DE','FR','IT','ES'],
  excluidos  : ['NL','PL','SE','BE','IE'],
  rangoEur   : [0.16, 0.67],
  fuente     : 'Tarifario FBA Europa de Amazon, en vigor desde el 1-jul-2026, págs. 10-11 y P6',
  url        : 'https://m.media-amazon.com/images/G/02/sell/images/260630-FBA-Rate-Card-ES1.pdf',
  consultado : '2026-09-17'
};

/* ── Los seis parámetros de reposición, por producto ────────────────────────
   Se guardan con registrarClaveDB, que es la costura probada: aparecen solos en
   `blankDB()`, en la migración de `loadDB()`, en la copia de seguridad y en la
   restauración, sin abrir ninguno de los ficheros compartidos. Se editan desde
   Inventario —Catálogo es del carril 2— y viven aquí, no en el producto, para
   que el carril 2 pueda seguir tocando la ficha sin chocar. */
const REPO_CAMPOS = [
  {k:'fabricacion', l:'Fabricación',    u:'días', d:30, ayuda:'desde que el proveedor acepta el pedido hasta que está listo'},
  {k:'transito',    l:'Tránsito',       u:'días', d:30, ayuda:'del almacén del proveedor al centro logístico'},
  {k:'recepcion',   l:'Recepción',      u:'días', d:7,  ayuda:'lo que Amazon tarda en dar por disponible lo recibido'},
  {k:'colchon',     l:'Colchón',        u:'días', d:14, ayuda:'margen de seguridad sobre el plazo, para la variación de la demanda'},
  {k:'objetivoMin', l:'Objetivo mínimo',u:'días', d:35, ayuda:'por debajo de esto, la cobertura es incómoda'},
  {k:'objetivoMax', l:'Objetivo máximo',u:'días', d:90, ayuda:'techo: por encima empieza a pagarse almacenaje de más'},
  {k:'frecuencia',  l:'Frecuencia',     u:'días', d:30, ayuda:'cada cuánto se lanza un pedido a este proveedor'}
];
registrarClaveDB('reposicion', {});

/* Los valores por defecto no se inventan cuando hay algo mejor: el plazo de
   fabricación arranca del que tenga cargado el proveedor en su ficha, que es un
   dato real del carril 7, y solo cae al valor de la tabla si no lo hay. */
function repoDefaults(sku){
  const p = findProd(sku);
  const sup = p && p.supplierId ? (DB.suppliers||[]).filter(s=>s.id===p.supplierId)[0] : null;
  const out = {};
  REPO_CAMPOS.forEach(c=>out[c.k]=c.d);
  if(sup && toNum(sup.lead)>0) out.fabricacion = toNum(sup.lead);
  return out;
}
function repoParams(sku){
  const guardado = (DB.reposicion||{})[String(sku)] || {};
  const base = repoDefaults(sku);
  const out = {}, propios = {};
  REPO_CAMPOS.forEach(c=>{
    const v = guardado[c.k];
    const puesto = v!==undefined && v!==null && String(v).trim()!=='';
    out[c.k] = puesto ? toNum(v) : base[c.k];
    propios[c.k] = puesto;
  });
  out._propios = propios;
  out._editado = REPO_CAMPOS.some(c=>propios[c.k]);
  return out;
}
function repoSave(sku, campos){
  if(!DB.reposicion) DB.reposicion = {};
  DB.reposicion[String(sku)] = campos;
  saveDB();
  if(typeof refreshAll==='function') refreshAll();
}

/* ── Días de suministro a la manera de Amazon ───────────────────────────────
   Media diaria de unidades disponibles ÷ media diaria de unidades enviadas, en
   la ventana pedida. Sobre los mismos días, las dos medias tienen el mismo
   divisor, así que la división se simplifica a (suma de stock)/(suma de
   unidades). Lo que NO se simplifica es de dónde salen: el stock viene de
   `stockSeries()`, que arrastra la última foto conocida, así que la precisión
   depende de cada cuánto se importe el inventario. Por eso cada resultado
   viene con el número de fotos reales que hay dentro de la ventana, y sin
   ninguna foto se devuelve null: «no lo sé» no es «está bien».

   Diferencia declarada con la métrica de Amazon, que no se puede cerrar desde
   informes descargados: Amazon la calcula por FNSKU y solo con las unidades
   enviadas en las tiendas paneuropeas (DE/FR/IT/ES). Aquí es por SKU y con
   todas las unidades del informe de pedidos. Es una aproximación, y como tal
   se presenta. */
function diasSuministro(windowDays){
  const H = hist(), S = stockSeries();
  const w = windowDays || 30;
  const toK = iso(addDays(today(), -1));          // hoy es parcial, se excluye
  const fromK = iso(addDays(today(), -w));
  const keys = S.days.filter(k=>k>=fromK && k<=toK && !(H.d[k] && H.d[k].x));
  const stockSum = {}, unidSum = {}, skus = {};
  let conFoto = 0;
  keys.forEach(k=>{
    if(H.d[k] && H.d[k].k) conFoto++;
    const carried = S.byDay[k] || {};
    Object.keys(carried).forEach(sk=>{ skus[sk]=1; stockSum[sk]=(stockSum[sk]||0)+carried[sk]; });
    const s = (H.d[k] && H.d[k].s) || {};
    Object.keys(s).forEach(sk=>{ skus[sk]=1; unidSum[sk]=(unidSum[sk]||0)+s[sk][0]; });
  });
  const out = {dias:keys.length, conFoto, ventana:w, porSku:{}};
  Object.keys(skus).forEach(sk=>{
    const u = unidSum[sk]||0, st = stockSum[sk]||0;
    out.porSku[sk] = {
      /* Sin fotos no hay numerador que valga; sin unidades enviadas no hay
         denominador y la cobertura es infinita, que no es «menos de 28». */
      dias: (!conFoto || !keys.length) ? null : (u>0 ? st/u : (st>0 ? Infinity : null)),
      unidades:u, stockAcumulado:st
    };
  });
  return out;
}

/* Veredicto de tarifa por SKU, con la regla literal del tarifario: las DOS
   ventanas por debajo de 28 días. Devuelve `null` en `aplica` cuando no se
   puede calcular, que es distinto de `false`. */
function riesgoTarifaBajoInv(){
  const c = TARIFA_BAJO_INV;
  const v30 = diasSuministro(c.ventanas[0]), v90 = diasSuministro(c.ventanas[1]);
  const skus = Array.from(new Set(Object.keys(v30.porSku).concat(Object.keys(v90.porSku))));
  const out = {medible: !!(v30.conFoto && v90.conFoto), fotos30:v30.conFoto, fotos90:v90.conFoto, porSku:{}};
  skus.forEach(sk=>{
    const a = (v30.porSku[sk]||{}).dias, b = (v90.porSku[sk]||{}).dias;
    const medible = a!==null && a!==undefined && b!==null && b!==undefined;
    out.porSku[sk] = {d30:a, d90:b, medible,
      aplica: medible ? (a < c.umbralDias && b < c.umbralDias) : null};
  });
  return out;
}

/* ── El plan de reposición ──────────────────────────────────────────────────

   Aritmética, toda a la vista para que se pueda comprobar a mano:

     plazo          = fabricación + tránsito + recepción
     puntoPedido    = velocidad × (plazo + colchón)
     nivelObjetivo  = velocidad × (plazo + colchón + frecuencia)
     techo          = velocidad × objetivoMax
     disponible     = stock + lo que ya viene en camino
     pedir          = disponible ≤ puntoPedido
                      ? máx(0, redondeoArriba(mín(nivelObjetivo, techo)) − disponible)
                      : 0

   El techo es lo que impide que una frecuencia larga con un plazo largo mande
   comprar un año de stock y se coma en almacenaje lo que ahorra en fletes.
   El disparo por punto de pedido es lo que impide pedir cada vez que se mira la
   pantalla: mientras haya cobertura por encima del punto de pedido, no se pide.

   Y una cosa que no se hace: si el stock es DESCONOCIDO (D3), no se pide nada.
   No se puede calcular cuánto falta sin saber cuánto hay, y rellenar ese hueco
   con un cero es la manera exacta de mandar comprar un contenedor de algo que
   está lleno. */
function repoPlan(){
  const I = invStats();
  const V = (function(){ try{ return velocityStats(30); }catch(e){ return []; } })();
  const vel = {}; V.forEach(r=>vel[String(r.sku).toLowerCase()] = r);
  const T = (function(){ try{ return riesgoTarifaBajoInv(); }catch(e){ return {medible:false, porSku:{}}; } })();
  return I.map(r=>{
    const P = repoParams(r.sku);
    const plazo = P.fabricacion + P.transito + P.recepcion;
    const vr = vel[String(r.sku).toLowerCase()] || null;
    /* La velocidad buena es la de M0, que descuenta los días sin stock. Solo
       vale si se ha medido sobre días con stock de verdad; si no, se cae a la
       de Inventario y la fila lo dice. */
    const usaReal = !!(vr && vr.withStock>0 && vr.units>0);
    const velocidad = usaReal ? vr.real : r.velocity;
    const base = usaReal ? 'real' : 'periodo';
    const diasBase = usaReal ? vr.withStock : r.diasObservados;
    const estimada = !usaReal ? !!r.velocidadEstimada : (vr.withStock < INV_DIAS_MIN_VELOCIDAD);

    const puntoPedido   = velocidad * (plazo + P.colchon);
    const nivelObjetivo = velocidad * (plazo + P.colchon + P.frecuencia);
    const techo         = velocidad * P.objetivoMax;
    const suelo         = velocidad * P.objetivoMin;
    const disponible    = r.stockDesconocido ? null : (r.qty + r.enCamino);
    const cobertura     = (disponible===null || !(velocidad>0)) ? null : disponible/velocidad;
    const objetivo      = Math.min(nivelObjetivo, techo);
    const dispara       = disponible!==null && velocidad>0 && disponible <= puntoPedido;
    const pedir         = dispara ? Math.max(0, Math.ceil(objetivo) - disponible) : 0;
    const tar           = T.porSku[String(r.sku)] || T.porSku[String(r.sku).toLowerCase()] || null;
    /* Cuándo hay que lanzar el pedido para no romper: los días que quedan por
       encima del punto de pedido. Negativo significa que ya vas tarde. */
    const margenDias = (disponible===null || !(velocidad>0)) ? null
                     : (disponible - puntoPedido) / velocidad;
    return {
      sku:r.sku, name:r.name, fbm:r.fbm, stock:r.qty, stockDesconocido:r.stockDesconocido,
      enCamino:r.enCamino, disponible, velocidad, base, diasBase, estimada,
      params:P, plazo, puntoPedido, nivelObjetivo, techo, suelo, objetivo,
      cobertura, dispara, pedir, margenDias,
      tarifa: tar ? {d30:tar.d30, d90:tar.d90, aplica:tar.aplica, medible:tar.medible} : null,
      valorPedido: pedir * toNum(r.unitCost)
    };
  }).sort((a,b)=>{
    const am = a.margenDias===null ? 1e9 : a.margenDias, bm = b.margenDias===null ? 1e9 : b.margenDias;
    return am-bm;
  });
}

/* ── Cobertura por país ─────────────────────────────────────────────────────
   Unidades que hay físicamente en cada país (informe multipaís) entre la venta
   diaria de ese país (informe de pedidos, filtrado por canal). Lo que responde:
   si estás rompiendo stock en Alemania mientras te sobra en Polonia.

   La columna de tarifa se rellena SOLO para los cuatro países en los que Amazon
   la cobra. Para Países Bajos, Polonia, Suecia, Bélgica e Irlanda el tarifario
   dice expresamente que no se aplica, y ahí la pantalla pone «no aplica», no
   un riesgo en verde que se lea como «vas bien». */
function coberturaPorPais(){
  const I = invStats();
  const S = salesRows({from:periodStart(), country:'ALL'});
  const sp = salesSpan({country:'ALL'});
  const dias = Math.max(1, Math.min(daysInPeriod(), sp.days || daysInPeriod()));
  const ventasPais = {};                       // sku → país → unidades
  S.forEach(r=>{
    if(!r.country || !r.sku) return;
    const k = String(r.sku);
    (ventasPais[k] || (ventasPais[k] = {}))[r.country] =
      (ventasPais[k][r.country]||0) + r.qty;
  });
  const T = (function(){ try{ return riesgoTarifaBajoInv(); }catch(e){ return {porSku:{}}; } })();
  const filas = [];
  I.forEach(r=>{
    const paises = Object.keys(r.byCountry||{});
    if(!paises.length) return;
    const tar = T.porSku[String(r.sku)] || null;
    paises.forEach(c=>{
      const q = r.byCountry[c];
      const u = (ventasPais[String(r.sku)]||{})[c] || 0;
      const v = u/dias;
      filas.push({sku:r.sku, pais:c, unidades:q, ventaDia:v,
        cobertura: v>0 ? q/v : null,
        enAlcance: TARIFA_BAJO_INV.paises.indexOf(c)>=0,
        excluido:  TARIFA_BAJO_INV.excluidos.indexOf(c)>=0,
        /* El veredicto de tarifa es por SKU, no por país: Amazon mide los días
           de suministro sobre el conjunto de las tiendas paneuropeas, no tienda
           a tienda. Se repite en cada fila del país donde sí se cobra. */
        tarifa: tar });
    });
  });
  return {filas, dias};
}

/* ── Editor de los seis parámetros, desde Inventario ───────────────────────── */
function repoEditModal(sku){
  const P = repoParams(sku), p = findProd(sku);
  const campo = c => '<label style="display:block;margin-bottom:10px">'+
      '<span style="display:block;font-size:11.5px;color:var(--muted);margin-bottom:3px">'+
      esc(c.l)+' <span class="mut">('+esc(c.u)+')</span> — '+esc(c.ayuda)+'</span>'+
      '<input type="number" min="0" step="1" id="repo_'+c.k+'" value="'+P[c.k]+'" '+
      'style="width:100%;padding:7px 9px;border-radius:8px;border:1px solid var(--hair);'+
      'background:var(--ink-2);color:inherit;font-family:inherit"></label>';
  openModal('Reposición · '+sku,
    'Los seis parámetros con los que se calcula cuánto pedir de '+esc((p&&p.name)||sku)+
    '. Se guardan aquí, no en la ficha del producto.',
    '<div>'+REPO_CAMPOS.map(campo).join('')+
    '<p class="mut" style="font-size:11.5px;margin:6px 0 0">Plazo total = fabricación + tránsito + recepción. '+
    'El punto de pedido es la velocidad por (plazo + colchón); el objetivo, la velocidad por (plazo + colchón + frecuencia), '+
    'con el techo del objetivo máximo.</p></div>',
    ()=>{
      const out = {};
      REPO_CAMPOS.forEach(c=>{
        const e = document.getElementById('repo_'+c.k);
        out[c.k] = e ? toNum(e.value) : P[c.k];
      });
      repoSave(sku, out);
      toast('Parámetros de reposición guardados para '+sku);
    },
    ()=>{ if(DB.reposicion) delete DB.reposicion[String(sku)]; saveDB(); refreshAll(); toast('Parámetros de '+sku+' devueltos a los valores por defecto'); });
}

/* ── La vista ──────────────────────────────────────────────────────────────── */
registrarEstilo(
  '.repo-note{font-size:11.5px;color:var(--muted)}'+
  '.repo-est{font-size:10px;letter-spacing:.3px;text-transform:uppercase;'+
  'background:#5A3E1E;color:#F3D8B6;padding:2px 6px;border-radius:20px;white-space:nowrap}'
);

function renderRepo(){
  const R = repoPlan(), C = coberturaPorPais();
  const hay = R.length;
  const pedir = R.filter(r=>r.pedir>0);
  const tarde = R.filter(r=>r.margenDias!==null && r.margenDias<0);
  const desconocidos = R.filter(r=>r.stockDesconocido);
  const estimadas = R.filter(r=>r.estimada && r.velocidad>0);
  const inversion = pedir.reduce((a,r)=>a+r.valorPedido, 0);

  const kp = document.getElementById('repoKpis');
  if(kp) kp.innerHTML =
    kpi('Referencias a pedir', num(pedir.length), hay? 'de '+num(hay)+' con movimiento' : 'sin datos', pedir.length?'warn':'pos')+
    kpi('Unidades a pedir', num(pedir.reduce((a,r)=>a+r.pedir,0)), 'hasta el nivel objetivo','accent')+
    kpi('Inversión del pedido', fmt(inversion,0), 'a coste puesto en almacén','')+
    kpi('Ya vas tarde', num(tarde.length), 'por debajo del punto de pedido', tarde.length?'neg':'pos')+
    kpi('Stock sin medir', num(desconocidos.length), 'sin foto de inventario: no se pide a ciegas', desconocidos.length?'warn':'pos')+
    kpi('Velocidad estimada', num(estimadas.length), 'medida sobre menos de '+INV_DIAS_MIN_VELOCIDAD+' días', estimadas.length?'warn':'pos');

  tbl('repoTable','<tr><th>SKU</th><th class="num">Velocidad</th><th>Base</th><th class="num">Plazo</th>'+
    '<th class="num">Punto de pedido</th><th class="num">Disponible</th><th class="num">Cobertura</th>'+
    '<th class="num">Margen</th><th class="num">Pedir</th><th></th></tr>'+
    (hay ? R.map(r=>{
      const vel = r.velocidad>0 ? num(r.velocidad,2) : '—';
      return '<tr><td class="name"><strong>'+esc(r.sku)+'</strong>'+
        (r.name && r.name!==r.sku ? '<br><span class="mut" style="font-size:11px">'+esc(r.name)+'</span>' : '')+'</td>'+
        '<td class="num" style="font-weight:600">'+vel+'</td>'+
        '<td class="name mut" style="font-size:11.5px">'+
          (r.velocidad>0
            ? (r.base==='real' ? 'días con stock · '+num(r.diasBase)+' d' : 'periodo · '+num(r.diasBase)+' d')+
              (r.estimada ? ' <span class="repo-est">estimado</span>' : '')
            : 'sin ventas')+'</td>'+
        '<td class="num mut">'+num(r.plazo)+' d</td>'+
        '<td class="num">'+(r.velocidad>0?num(Math.ceil(r.puntoPedido)):'—')+'</td>'+
        '<td class="num">'+(r.disponible===null?'<span class="mut">sin medir</span>':num(r.disponible))+'</td>'+
        '<td class="num '+(r.cobertura===null?'mut':(r.cobertura<r.params.objetivoMin?'neg':(r.cobertura>r.params.objetivoMax?'warn':'pos')))+'">'+
          (r.cobertura===null?'—':num(r.cobertura,0)+' d')+'</td>'+
        '<td class="num '+(r.margenDias===null?'mut':(r.margenDias<0?'neg':(r.margenDias<7?'warn':'')))+'">'+
          (r.margenDias===null?'—':(r.margenDias<0?'−':'')+num(Math.abs(r.margenDias),0)+' d')+'</td>'+
        '<td class="num '+(r.pedir>0?'warn':'mut')+'" style="font-weight:600">'+(r.pedir>0?num(r.pedir):'—')+'</td>'+
        '<td><button class="btn sm" onclick="repoEditModal(\''+esc(r.sku).replace(/'/g,"\\'")+'\')">Parámetros</button></td></tr>';
    }).join('')
      : '<tr><td colspan="10" class="name mut">Importa el informe de pedidos y el de inventario FBA para calcular la reposición.</td></tr>'));

  let v = '';
  if(!hay){
    v = 'Sin datos con los que calcular nada todavía.';
  } else {
    if(desconocidos.length) v += '<strong style="color:var(--caution)">'+desconocidos.length+' referencia'+
      (desconocidos.length===1?'':'s')+' sin foto de inventario.</strong> No tienen stock cero: tienen stock desconocido, '+
      'y por eso no se les pide nada. Cero unidades y «no me lo han dicho» son cosas distintas, y confundirlas manda '+
      'comprar un contenedor de algo que está lleno. ';
    if(estimadas.length) v += '<strong>'+estimadas.length+' velocidad'+(estimadas.length===1?'':'es')+
      ' medida'+(estimadas.length===1?'':'s')+' sobre menos de '+INV_DIAS_MIN_VELOCIDAD+' días.</strong> '+
      'Están marcadas como estimadas porque proyectar un plazo de fabricación entero desde unos pocos días '+
      'multiplica el ruido de una semana floja. No son mediciones y no se presentan como tales. ';
    if(tarde.length) v += '<strong style="color:var(--stop)">'+tarde.length+' ya por debajo del punto de pedido.</strong> '+
      'El margen en negativo son los días de retraso sobre el momento en que había que haber lanzado el pedido. ';
    if(!pedir.length && !desconocidos.length) v += '<strong>Nada que pedir hoy.</strong> Toda la cartera está por encima de su punto de pedido. ';
    v += '<br><br><span class="mut">La velocidad que se usa es la de M0 cuando hay histórico: unidades entre los días que '+
      'SÍ hubo stock, no entre días de calendario. Un SKU que estuvo agotado media semana vendió lo que vendió en los días '+
      'que pudo vender, y repartirlo entre los siete deja la reposición corta justo en lo que más se vende. Cuando no hay '+
      'histórico con el que corregir, la columna «Base» dice «periodo» y el número es la media simple.</span>';
  }
  const ver = document.getElementById('repoVerdict'); if(ver) ver.innerHTML = v;

  /* Cobertura por país y tarifa por bajo inventario */
  const T = (function(){ try{ return riesgoTarifaBajoInv(); }catch(e){ return {medible:false, porSku:{}}; } })();
  const c = TARIFA_BAJO_INV;
  tbl('repoPaisTable','<tr><th>SKU</th><th>País</th><th class="num">Unidades</th><th class="num">Venta/día</th>'+
    '<th class="num">Cobertura</th><th>Tarifa por bajo inventario</th></tr>'+
    (C.filas.length ? C.filas.map(f=>{
      let cel;
      if(f.excluido) cel = '<span class="pill">no se cobra aquí</span>';
      else if(!f.enAlcance) cel = '<span class="mut">fuera del programa paneuropeo</span>';
      else if(!f.tarifa || !f.tarifa.medible) cel = '<span class="pill warn">no se puede calcular</span>';
      else if(f.tarifa.aplica) cel = '<span class="pill stop">sí · '+num(f.tarifa.d30,0)+' d a 30 y '+
           num(f.tarifa.d90,0)+' d a 90, ambos bajo '+c.umbralDias+'</span>';
      else cel = '<span class="pill go">no · '+
           (isFinite(f.tarifa.d30)?num(f.tarifa.d30,0):'∞')+' d a 30 y '+
           (isFinite(f.tarifa.d90)?num(f.tarifa.d90,0):'∞')+' d a 90</span>';
      return '<tr><td class="name"><strong>'+esc(f.sku)+'</strong></td>'+
        '<td class="name">'+esc(f.pais)+'</td>'+
        '<td class="num">'+num(f.unidades)+'</td>'+
        '<td class="num">'+num(f.ventaDia,2)+'</td>'+
        '<td class="num '+(f.cobertura===null?'mut':(f.cobertura<c.umbralDias?'neg':'pos'))+'">'+
          (f.cobertura===null?'sin venta':num(f.cobertura,0)+' d')+'</td>'+
        '<td>'+cel+'</td></tr>';
    }).join('')
      : '<tr><td colspan="6" class="name mut">Importa el <strong>Inventario multipaís</strong> para ver dónde está físicamente cada unidad.</td></tr>'));

  const nota = document.getElementById('repoTarifaNota');
  if(nota) nota.innerHTML =
    '<strong>La regla es la de Amazon, comprobada contra su tarifario.</strong> '+
    'La tarifa de cobertura por niveles bajos de inventario (Programa Paneuropeo) se cobra solo cuando '+
    '<em>tanto</em> los días históricos de suministro de los últimos 90 días <em>como</em> los de los últimos 30 '+
    'bajan de '+c.umbralDias+'. Los días de suministro son la media diaria de unidades disponibles entre la media diaria '+
    'de unidades enviadas. Se aplica en '+c.paises.join(', ')+' y expresamente <strong>no</strong> en '+
    c.excluidos.join(', ')+'. El importe va de '+num(c.rangoEur[0],2)+' a '+num(c.rangoEur[1],2)+' € por unidad según '+
    'tamaño y cuánto se baje del umbral; el hub no conoce las medidas de tus productos, así que enseña el rango y no '+
    'se inventa un importe por unidad.'+
    '<br><br><span class="mut">Fuente: '+esc(c.fuente)+' · <a href="'+esc(c.url)+'" target="_blank" rel="noopener">tarifario oficial (PDF)</a> · '+
    'consultado el '+esc(c.consultado)+'.</span>'+
    '<br><br><span class="mut"><strong>Lo que aquí es aproximación, y no medición.</strong> Amazon calcula esos días por FNSKU '+
    'y solo con las unidades enviadas en las tiendas paneuropeas; este hub los calcula por SKU y con todas las unidades del '+
    'informe de pedidos, y el stock de los días sin foto lo arrastra de la última que haya. '+
    (T.medible ? 'Ahora mismo hay '+num(T.fotos30)+' foto(s) de inventario en los últimos 30 días y '+num(T.fotos90)+' en los últimos 90.'
               : 'Ahora mismo no hay fotos de inventario suficientes en la ventana, así que la columna dice «no se puede calcular» en vez de dar un veredicto.')+
    ' Varias fuentes secundarias mencionan una exención de 180 días para ASIN nuevos: no está en el tarifario europeo vigente, '+
    'así que este hub no la aplica y sigue avisando también para las referencias recientes.</span>';
}

registrarVista({
  id:'reposicion', etiqueta:'Reposición', icono:'⟳', grupo:'Producto', crumb:'Producto',
  render:renderRepo,
  html:
    '<div class="kpis" id="repoKpis"></div>'+
    '<div class="panel">'+
      '<div class="panel-head"><div>'+
        '<h2>Cuánto pedir de cada referencia</h2>'+
        '<p class="desc" style="margin:0">Seis parámetros por producto —fabricación, tránsito, recepción, colchón, rango objetivo y frecuencia— '+
        'y la velocidad de venta que descuenta los días sin stock. El margen es lo que te queda antes de tener que lanzar el pedido: '+
        'en negativo significa que ya vas tarde.</p>'+
      '</div><div class="ph-actions"><button class="btn sm" onclick="exportReposicion()">Exportar reposición (CSV)</button></div></div>'+
      '<div class="tbl-wrap"><table class="grid" id="repoTable"></table></div>'+
      '<div id="repoVerdict" class="assumptions" style="margin-top:16px"></div>'+
    '</div>'+
    '<div class="panel">'+
      '<h2>Cobertura por país y tarifa por bajo inventario</h2>'+
      '<p class="desc">Dónde está físicamente cada unidad y qué dice la regla de Amazon sobre ella. '+
      'Romper stock en un país mientras sobra en otro es el fallo más caro y más invisible del programa paneuropeo.</p>'+
      '<div class="tbl-wrap"><table class="grid" id="repoPaisTable"></table></div>'+
      '<div id="repoTarifaNota" class="assumptions" style="margin-top:16px"></div>'+
    '</div>'
});

function exportReposicion(){
  const R = repoPlan();
  descargarCSV('reposicion',
    ['SKU','Producto','Stock','Stock medido','En camino','Disponible','Velocidad','Base de la velocidad',
     'Días medidos','Estimada','Fabricación','Tránsito','Recepción','Colchón','Objetivo mín','Objetivo máx',
     'Frecuencia','Plazo total','Punto de pedido','Nivel objetivo','Cobertura (días)','Margen (días)','Pedir',
     'Días de suministro 30','Días de suministro 90','Tarifa bajo inventario'],
    R.map(r=>[r.sku, r.name, r.stockDesconocido?'':r.stock, r.stockDesconocido?'no':'sí',
      r.enCamino, r.disponible===null?'':r.disponible, r2(r.velocidad),
      r.base==='real'?'días con stock':'periodo', r.diasBase, r.estimada?'sí':'no',
      r.params.fabricacion, r.params.transito, r.params.recepcion, r.params.colchon,
      r.params.objetivoMin, r.params.objetivoMax, r.params.frecuencia, r.plazo,
      Math.ceil(r.puntoPedido), Math.ceil(r.objetivo),
      r.cobertura===null?'':r2(r.cobertura), r.margenDias===null?'':r2(r.margenDias), r.pedir,
      (r.tarifa && isFinite(r.tarifa.d30)) ? r2(r.tarifa.d30) : '',
      (r.tarifa && isFinite(r.tarifa.d90)) ? r2(r.tarifa.d90) : '',
      !r.tarifa || r.tarifa.aplica===null ? 'no se puede calcular' : (r.tarifa.aplica?'sí':'no')]));
}
registrarExportacion('reposicion', 'Reposición (CSV)', exportReposicion);
