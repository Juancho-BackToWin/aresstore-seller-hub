/* ═══════════════════════════════════════════════════════════════════════════
   22 · TRANSACCIONES · Pagos › Transacciones › Descargar

   POR QUÉ ESTE INFORME. La liquidación plana (`settlement`) cubre una quincena
   y Amazon la retira el 11-nov-2026. El informe de transacciones cubre el
   intervalo que le pidas —el fichero real del negocio son CUATRO AÑOS— y trae
   las mismas columnas de dinero: tarifas de venta, tarifas de Logística,
   tarifas de otras transacciones y «otro». Es la única fuente del hub capaz de
   medir comisiones fuera de la quincena liquidada.

   Y ES LA FUENTE QUE MÁS FÁCIL PRODUCE UN NÚMERO CREÍBLE Y FALSO: si se suma a
   la liquidación plana sin deduplicar, la misma comisión se resta dos veces y
   el beneficio se hunde; si se deduplica de más, desaparece. Por eso la
   deduplicación es explícita, se mide y se enseña (`txFees().dupPagos`).

   FORMATO LITERAL DEL FICHERO, MEDIDO EL 17-09-2026 sobre el fichero real
   (2.015.117 bytes, fuera del repositorio):
     · BOM UTF-8 · fin de línea LF · termina en salto de línea
     · separador COMA, entrecomillado completo, DECIMALES CON COMA
     · 27 columnas · 5.650 líneas · 5.642 filas de datos
     · SIETE líneas de preámbulo: la cabecera está en la LÍNEA 8.
       (Los documentos del proyecto decían «una línea» y «ocho líneas, cabecera
       en la 9». Ninguno acertaba. Manda la medición.)
     · fechas tipo «17 dic 2023 22:37:41 UTC», con el mes abreviado en español,
       que `parseDate()` NO sabe leer: se lee aquí, en `txFecha()`.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── La codificación ────────────────────────────────────────────────────────
   COSTURA → carril 1: esto lo tiene que arreglar `readSmart`, que no es mío.

   EL FALLO, MEDIDO EL 17-09-2026 SOBRE EL FICHERO REAL. `readSmart` decodifica
   como UTF-8 y, si aparece el carácter de sustitución (U+FFFD), deduce que el
   fichero venía en windows-1252 y lo vuelve a decodificar así. La deducción es
   razonable para casi todos los informes de Amazon. Aquí es falsa: el fichero
   de transacciones ES UTF-8 válido y CONTIENE un U+FFFD escrito por el propio
   Amazon (bytes EF BF BD, en el byte 867.186 de 2.015.117, dentro del título
   de un producto). Un solo carácter convierte el fichero entero en mojibake.

   Y EL MOJIBAKE NO DA ERROR: DA NÚMEROS. Con el fichero real, la cabecera
   «tarifas de Logística de Amazon» se normalizaba a `tarifasdelogasticadeamazon`
   y ningún alias casaba: la TARIFA DE LOGÍSTICA DE CUATRO AÑOS salía 0,00 €.
   «descripción» quedaba en `descripcian`, así que las 40 filas de publicidad
   dejaban de reconocerse como publicidad y se sumaban a «otras tarifas» —el
   mismo gasto que `adStats()` ya mide, contado dos veces—. Y «número de
   pedido» quedaba en `namerodepedido`, con lo que el detector de devoluciones
   fantasma se quedaba sin pedido al que agarrarse y devolvía cero casos sobre
   526 reembolsos.

   LA REPARACIÓN ES EXACTA Y REVERSIBLE: una decodificación cp1252 de bytes
   UTF-8 se deshace mapeando cada carácter a su byte cp1252 y volviendo a
   decodificar. Los tres guardarraíles impiden tocar un fichero que sí sea
   cp1252: hacen falta tres o más secuencias de mojibake, TODOS los caracteres
   tienen que caber en el repertorio cp1252, y el resultado tiene que ser
   UTF-8 ESTRICTAMENTE válido. Si alguno falla, el texto se devuelve intacto. */
const TX_CP1252 = {0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,
  0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,
  0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,
  0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F};
function txArreglaMojibake(txt){
  const s = String(txt || '');
  const marcas = (s.match(/\u00C3[\u0080-\u00BF]|\u00E2\u20AC|\u00C2[\u00A0-\u00BF]/g) || []).length;
  if(marcas < 3) return txt;
  const bytes = new Uint8Array(s.length);
  for(let i=0;i<s.length;i++){
    const c = s.charCodeAt(i);
    if(c <= 0xFF) bytes[i] = c;
    else if(TX_CP1252[c] !== undefined) bytes[i] = TX_CP1252[c];
    else return txt;                      // no viene de una lectura cp1252
  }
  let out;
  try{ out = new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
  catch(e){ return txt; }                 // no era UTF-8 por debajo
  if(out === s) return txt;
  return {texto: out,
          nota: 'reparada la codificación: el fichero es UTF-8 y se había leído como '+
                'windows-1252 ('+marcas+' secuencias corregidas)'};
}
registrarPreproceso(txArreglaMojibake, 'codificación UTF-8 leída como windows-1252');

/* ── El preámbulo ───────────────────────────────────────────────────────────
   COSTURA → carril 1: el importador está reescribiendo `parseDelimited` y la
   detección genérica de preámbulos. Mientras tanto este preproceso quita las
   líneas de aviso ANTES de que el parser las vea, sin abrir su fichero.

   `parseDelimited` busca la cabecera entre las SEIS primeras filas y exige
   3+ celdas no vacías. Con siete líneas de preámbulo nunca la encuentra: se
   queda con la línea 1 («Incluye transacciones del Marketplace…») como
   cabecera y el informe entero entra como una sola columna de basura. No da
   error: da un informe «leído» con cero euros dentro.

   CONSERVADOR A PROPÓSITO. Solo actúa si TODAS las líneas anteriores tienen
   exactamente un campo CSV, si hay TRES O MÁS de ellas y si la primera línea
   ancha trae 15 campos o más. Los informes de Publicidad llevan una o dos
   líneas de título y los sigue tratando `parseDelimited`, que ya sabe; este
   preproceso no se los toca. */
function txCamposCSV(linea, sep){
  let n = 1, q = false;
  for(let i=0;i<linea.length;i++){
    const c = linea[i];
    if(q){ if(c === '"'){ if(linea[i+1] === '"') i++; else q = false; } }
    else if(c === '"') q = true;
    else if(c === sep) n++;
  }
  return n;
}
function txQuitaPreambulo(txt){
  const s = String(txt || '').replace(/^﻿/, '');
  if(!s) return txt;
  const lineas = s.split('\n');
  const sep = (lineas[0].indexOf('\t') >= 0) ? '\t' : ((lineas[0].indexOf(';') >= 0) ? ';' : ',');
  let cab = -1;
  for(let i=0; i<Math.min(15, lineas.length); i++){
    if(!lineas[i].trim()) continue;
    const n = txCamposCSV(lineas[i], sep);
    if(n === 1) continue;                 // sigue siendo preámbulo
    if(n >= 15) cab = i;                  // primera línea ancha: la cabecera
    break;                                // cualquier otra cosa: no es este formato
  }
  if(cab < 3) return txt;                 // menos de tres líneas de aviso: no toco nada
  for(let i=0;i<cab;i++){
    if(lineas[i].trim() && txCamposCSV(lineas[i], sep) !== 1) return txt;
  }
  return {texto: lineas.slice(cab).join('\n'),
          nota: 'quitadas '+cab+' líneas de preámbulo antes de la cabecera '+
                '(la cabecera estaba en la línea '+(cab+1)+')'};
}
registrarPreproceso(txQuitaPreambulo, 'preámbulo del informe de transacciones');

/* ── Fechas del informe ─────────────────────────────────────────────────────
   «17 dic 2023 22:37:41 UTC». `parseDate()` es del carril 6 y no lee meses
   abreviados en español: `new Date('17 dic 2023')` sale inválida y la fila se
   descartaría en silencio. Aquí se lee el mes por nombre, en español y en
   inglés, y si no se reconoce se cae a `parseDate()` en vez de inventar. */
const TX_MESES = {ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,set:8,oct:9,nov:10,dic:11,
                  jan:0,apr:3,aug:7,dec:11};
function txFecha(s){
  if(!s) return null;
  const t = fold(String(s).trim());
  const m = t.match(/^(\d{1,2})\s+([a-z]{3,})\.?\s+(\d{4})/);
  if(m){
    const mes = TX_MESES[m[2].slice(0,3)];
    if(mes !== undefined) return new Date(+m[3], mes, +m[1]);
  }
  return parseDate(s);
}

/* ── El informe ─────────────────────────────────────────────────────────────
   Se registra con `registrarInforme` para no abrir `REPORTS` en 12-datos.js.
   `_tipo` es obligatorio y sin tipo de contenido: eso es lo que impide que
   este informe le robe la detección a otro. La segunda pasada de
   `resolveFields` solo rellena campos obligatorios CON tipo, así que en un
   fichero que no sea este `_tipo` se queda sin mapear, la puntuación se lleva
   −20 y gana el informe que toca. */
registrarInforme({
  id:'tx', label:'Transacciones (Pagos)', en:'Transaction report',
  path:'Pagos › Transacciones › Rango personalizado › Descargar',
  feeds:'Comisiones reales de varios años, y la evidencia de las reclamaciones',
  hdr:['fechayhora','identificadordepago','tipo'],
  fields:{
    /* `type:null` a propósito. La columna trae «5 sep 2026 10:00:00 UTC», que
       el perfilador de columnas NO clasifica como fecha porque `parseDate()`
       no lee meses abreviados en español. Con `type:'date'` el alias se
       rechazaba por incompatibilidad de tipo, el campo obligatorio salía como
       ausente y el importador abría el asignador manual: «me falta 1 columna»
       sobre un fichero perfectamente legible. La fecha la lee `txFecha()`. */
    _date   :{req:1, type:null,    alias:[/^fechayhora$/,/^datetime$/,/^fecha(hora)?$/]},
    _tipo   :{req:1, type:null,    alias:[/^tipo$/,/^type$/]},
    _pago   :{req:0, type:null,    alias:[/identificadordepago/,/^settlementid$/,/iddeliquidacion/]},
    /* Los alias toleran las dos grafías: la correcta y la que deja el mojibake
       si la reparación de arriba no se ha podido aplicar. Con el fichero real,
       `número de pedido` llegaba a `namerodepedido` y `gestión logística` a
       `gestianlogastica`. Un alias de más aquí no cuesta nada; una columna sin
       mapear cuesta el detector entero. */
    _oid    :{req:0, type:'orderId',alias:[/^n[au]merodepedido$/,/numerodepedido/,/^orderid$/,/amazonorderid/]},
    _sku    :{req:0, type:'code',  alias:[/^sku$/,/sellersku/,/referencia/]},
    _desc   :{req:0, type:null,    alias:[/^descripci[ao]n$/,/^description$/]},
    _qty    :{req:0, type:'int',   alias:[/^cantidad$/,/^quantity$/]},
    _channel:{req:0, type:null,    alias:[/webdeamazon/,/^marketplace$/,/^tienda$/]},
    _fulfil :{req:0, type:null,    alias:[/^gesti[ao]nlog[ai]stica$/,/gestionlogistica/,/^fulfil?ment$/]},
    _ventas :{req:0, type:'money', alias:[/ventasdeproductos/,/^productsales$/]},
    _iva    :{req:0, type:'money', alias:[/impuestodeventasdeproductos/,/productsalestax/]},
    _com    :{req:0, type:'money', alias:[/^tarifasdeventa$/,/^sellingfees$/]},
    _fba    :{req:0, type:'money', alias:[/^tarifasdelog[ai]sticadeamazon$/,/tarifasdelogisticadeamazon/,/^fbafees$/]},
    _otras  :{req:0, type:'money', alias:[/tarifasdeotrastransacciones/,/othertransactionfees/]},
    _otro   :{req:0, type:'money', alias:[/^otro$/,/^other$/]},
    _total  :{req:0, type:'money', alias:[/^total$/]}
  },
  sig:P => !!(P && P.has && P.has.date && P.cols >= 20 && P.n && P.n.money >= 8)
});

/* ── Tipos de transacción ───────────────────────────────────────────────────
   QUÉ ENTRA EN LAS TARIFAS Y QUÉ NO. Esta lista es la revisión adversarial de
   este carril escrita en código: cada exclusión evita que un importe se cuente
   DOS VECES contra la cuenta de resultados.

   · «Ajuste» son los reembolsos de inventario de Amazon: dinero que ENTRA. Si
     entrara aquí restaría como si fuera una tarifa negativa, y además `pnl()`
     ya tiene su propia línea de reembolsos. Fuera de las tarifas; los usa el
     detector de compensaciones de 23-reclamaciones.js.
   · «Tarifa de prestación de servicio» con descripción de publicidad es el
     gasto de PPC, que `adStats()` ya mide desde el informe de términos de
     búsqueda. Contarlo aquí lo duplicaría.
   · «Transferir» y «Saldo descubierto» son movimientos de caja, no gastos.
   · «Cargo retroactivo» / «Refund_Retrocharge» son impuestos retrocedidos, que
     es terreno del motor de IVA, no de las tarifas. */
const TX_FUERA_DE_TARIFAS = /^(transferir|transfer|saldo descubierto|ajuste|adjustment|cargo retroactivo|chargeback|refund_retrocharge)$/i;
const TX_PUBLICIDAD  = /publicidad|advertis|cost of advertising/i;
const TX_ALMACEN     = /almacen|storage/i;
const TX_ES_AJUSTE   = /^(ajuste|adjustment)$/i;
const TX_ES_REEMBOLSO= /^(reembolso|refund)$/i;
const TX_ES_PEDIDO   = /^(pedido|order)$/i;

/* ── Filas normalizadas ─────────────────────────────────────────────────────
   Memorizadas contra el objeto de importación: `pnl()` llama a
   `settlementFees()` y `refreshAll()` llama a diez render seguidos. Releer y
   reparsear 5.642 filas en cada uno se nota; recalcular cuando cambia el
   fichero, no. */
let _txCache = null;
function txRows(){
  const src = (DB.imports && DB.imports.tx) || null;
  if(!src || !src.rows || !src.rows.length){ _txCache = null; return []; }
  if(_txCache && _txCache.src === src) return _txCache.out;
  const out = src.rows.map(r=>{
    const f = txFecha(gv(r,'_date','fechayhora','datetime'));
    const tipo = String(gv(r,'_tipo','tipo','type')||'').trim();
    const desc = String(gv(r,'_desc','descripcion','descripcian','description')||'').trim();
    return {
      f, k: f ? iso(f) : '',
      pago: String(gv(r,'_pago','identificadordepago','settlementid')||'').trim(),
      tipo, desc,
      oid : String(gv(r,'_oid','numerodepedido','namerodepedido','orderid')||'').trim(),
      sku : String(gv(r,'_sku','sku','sellersku')||'').trim(),
      qty : toNum(gv(r,'_qty','cantidad','quantity')),
      pais: countryOf(gv(r,'_channel','webdeamazon','marketplace')),
      fulfil: String(gv(r,'_fulfil','gestionlogistica','gestianlogastica','fulfillment')||'').trim(),
      ventas: toNum(gv(r,'_ventas','ventasdeproductos','productsales')),
      iva   : toNum(gv(r,'_iva','impuestodeventasdeproductos','productsalestax')),
      com   : toNum(gv(r,'_com','tarifasdeventa','sellingfees')),
      fba   : toNum(gv(r,'_fba','tarifasdelogisticadeamazon','tarifasdelogasticadeamazon','fbafees')),
      otras : toNum(gv(r,'_otras','tarifasdeotrastransacciones','othertransactionfees')),
      otro  : toNum(gv(r,'_otro','otro','other')),
      total : toNum(gv(r,'_total','total'))
    };
  });
  _txCache = {src, out};
  return out;
}
function txHay(){ return txRows().length > 0; }

/* Cobertura real del informe: la primera y la última fecha que trae. */
function txSpan(){
  let d0=null, d1=null, n=0, sinFecha=0;
  txRows().forEach(r=>{
    if(!r.f){ sinFecha++; return; }
    n++;
    if(!d0 || r.f<d0) d0=r.f;
    if(!d1 || r.f>d1) d1=r.f;
  });
  return {desde:d0, hasta:d1, filas:n, sinFecha};
}

/* ── Deduplicación contra la liquidación plana ──────────────────────────────
   LAS DOS FUENTES DICEN LO MISMO. Cada fila del informe de transacciones lleva
   su «identificador de pago», que ES el `settlement-id` del fichero plano. Si
   las dos están cargadas y comparten identificador, la comisión de esa
   quincena está en las dos: sumarlas la cuenta dos veces.

   Se deduplica por identificador, que es exacto. Cuando el fichero plano no
   trae identificador legible, se cae a la ventana de fechas que la liquidación
   cubre DE VERDAD (solo sus filas entendidas), que es la misma ventana que
   `settlementFees()` usa para decidir qué está medido. Las dos reglas dejan
   fuera lo mismo cuando las dos se pueden aplicar. */
function txPagosDeLiquidacion(){
  const ids = {};
  imp('settlement').forEach(r=>{
    const id = String(gv(r,'settlementid','_pago')||'').trim();
    if(id) ids[id] = 1;
  });
  return ids;
}

/* ── Tarifas medidas desde las transacciones ────────────────────────────────
   Misma convención de signo que `settlementFees()`: devuelve COSTES POSITIVOS.
   En el fichero las tarifas vienen negativas (te las cobran) y los créditos de
   comisión de un reembolso vienen positivos (te las devuelven).

   `refCredito` sale APARTE del coste de comisión a propósito: es el arreglo de
   E6, y está explicado entero en `settlementFees()`. */
function txFees(opts){
  opts = opts || {};
  const from  = opts.from || periodStart();
  const hasta = opts.hasta || null;         // tope superior opcional
  const pais  = opts.pais !== undefined ? opts.pais : countryFilter;
  const dupIds = opts.dedup === false ? {} : txPagosDeLiquidacion();
  const dupVentana = (opts.dedup === false) ? null : (opts.ventanaLiq || null);

  let referral=0, refCredito=0, fba=0, storage=0, other=0;
  let rows=0, matched=0, dupPagos=0, dupFilas=0, fuera=0;
  let desde=null, tope=null;
  const pagosDup = {};

  txRows().forEach(r=>{
    if(!r.f || r.f < from) return;
    if(hasta && r.f > hasta) return;
    if(pais !== 'ALL' && r.pais && r.pais !== pais) return;
    rows++;
    /* Deduplicación · por identificador de pago, y si no, por la ventana que
       la liquidación plana cubre de verdad. */
    if(r.pago && dupIds[r.pago]){ dupFilas++; if(!pagosDup[r.pago]){ pagosDup[r.pago]=1; dupPagos++; } return; }
    if(dupVentana && dupVentana.desde && dupVentana.hasta &&
       r.f >= dupVentana.desde && r.f <= dupVentana.hasta){ dupFilas++; return; }

    if(TX_FUERA_DE_TARIFAS.test(r.tipo)){ fuera++; return; }
    if(TX_PUBLICIDAD.test(r.desc)){ fuera++; return; }

    const hayAlgo = r.com || r.fba || r.otras || r.otro;
    if(!hayAlgo) return;
    matched++;
    if(!desde || r.f<desde) desde=r.f;
    if(!tope  || r.f>tope ) tope =r.f;

    /* Comisión. Negativa = te la cobran; positiva = te la devuelven porque has
       reembolsado al cliente. Las dos caras van por separado. */
    if(r.com < 0) referral += -r.com;
    else if(r.com > 0) refCredito += r.com;

    if(r.fba) fba += -r.fba;

    const resto = r.otras + r.otro;
    if(resto){
      if(TX_ALMACEN.test(r.desc)) storage += -resto;
      else other += -resto;
    }
    /* El informe de transacciones NO trae columna de promoción separada: el
       descuento ya viene descontado de «ventas de productos». Devolver un cero
       inventado como si estuviera medido sería justo el error que persigue
       este carril, así que `promo` se declara null y la pantalla lo dice. */
  });
  return {referral, refCredito, fba, storage, other, promo:null,
          rows, matched, dupPagos, dupFilas, fuera, desde, hasta:tope};
}

/* ── ¿HABLAN LAS DOS FUENTES DEL MISMO NEGOCIO? ─────────────────────────────
   ESTE GUARDARRAÍL SALIÓ DE CARGAR LOS FICHEROS REALES el 17-09-2026, y evita
   el peor número que este carril puede producir.

   El informe de transacciones trae las tarifas de VARIOS AÑOS. El informe de
   pedidos que hubiera cargado al lado cubría menos: 265 ventas y 4.024,74 € de
   ingreso. Restar cuatro años de comisiones y tarifas de logística a ese
   ingreso daba un beneficio de −31.520,08 € y un margen del −867,6 %. No es un
   error del cálculo: es que las dos fuentes no hablan del mismo negocio, y
   nadie lo estaba comprobando.

   Así que se comprueba. El informe de transacciones también trae las VENTAS
   (las filas «Pedido»), así que las dos fuentes se pueden contrastar: si no
   coinciden dentro de un ±25 %, las tarifas medidas NO se aportan a la cuenta
   de resultados y se dice por qué. `pnl()` vuelve entonces a estimarlas desde
   las ventas que sí conoce, que es coherente aunque sea menos preciso.

   Las tarifas siguen ahí para las RECLAMACIONES, que no dependen del informe
   de pedidos: una devolución fantasma se detecta con el reembolso, no con la
   cuenta de resultados. */
function txContraste(from){
  let ventasTx = 0, pedidos = 0;
  txRows().forEach(r=>{
    if(!r.f || r.f < from) return;
    if(!TX_ES_PEDIDO.test(r.tipo)) return;
    if(countryFilter !== 'ALL' && r.pais && r.pais !== countryFilter) return;
    ventasTx += r.ventas + r.iva; pedidos++;
  });
  let ventasHub = 0;
  try{ salesRows().forEach(r=>{ if(r.date && r.date >= from) ventasHub += r.revenue; }); }catch(e){}
  let razon = '';
  if(ventasHub <= 0) razon = 'no hay informe de pedidos con ventas en este periodo';
  else if(ventasTx > ventasHub*1.25) razon = 'el informe de transacciones ve '+fmt(ventasTx)+
    ' de ventas y el de pedidos solo '+fmt(ventasHub);
  else if(ventasTx < ventasHub*0.75) razon = 'el informe de pedidos ve '+fmt(ventasHub)+
    ' de ventas y el de transacciones solo '+fmt(ventasTx);
  return {ok: !razon, ventasTx, ventasHub, pedidos, razon};
}

/* Lo que la pantalla de Datos necesita saber para no mentir sobre la fuente. */
function txResumen(){
  const s = txSpan(), f = txFees({from:new Date(2000,0,1), pais:'ALL'});
  return {filas:s.filas, sinFecha:s.sinFecha, desde:s.desde, hasta:s.hasta,
          dupPagos:f.dupPagos, dupFilas:f.dupFilas, fuera:f.fuera,
          referral:f.referral, refCredito:f.refCredito, fba:f.fba,
          storage:f.storage, other:f.other};
}
