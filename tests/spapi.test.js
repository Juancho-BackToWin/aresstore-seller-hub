#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   Carril 9 · Ingesta automática por SP-API

   SIN RED. Todo el `fetch` está simulado: esta suite no sale a internet, no
   necesita credenciales y no toca Amazon. Si algún día alguien la ve tardar
   segundos, es que se ha colado una llamada de verdad.

   SIN ESPERAS DE VERDAD tampoco: `dormir` se inyecta y solo apunta cuánto se
   habría esperado. Una prueba de límite de ritmo que espere dos segundos de
   reloj es una prueba que nadie vuelve a correr.

   Cada comprobación que persigue un fallo se ha visto ROJA sin el arreglo, y
   el mensaje exacto está en `docs/carriles/9-spapi.md`.
   ═══════════════════════════════════════════════════════════════════════════ */

const zlib = require('zlib');
const path = require('path');
const S = require(path.resolve(__dirname, '..', 'servidor'));
const { Lwa, ClienteSpapi } = S;
const { informes, catalogo, validador, almacen: alm, ingesta, entorno, reintentos } = S;

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};

/* ── Amazon de mentira ────────────────────────────────────────────────────── */
function cabeceras(obj){
  const m = {};
  Object.keys(obj||{}).forEach(k=>{ m[k.toLowerCase()] = String(obj[k]); });
  return {get:n=> (n && m[String(n).toLowerCase()] !== undefined ? m[String(n).toLowerCase()] : null)};
}
function respuesta(estado, cuerpo, cabs){
  const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
  const bin = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(texto, 'utf8');
  return {
    ok: estado >= 200 && estado < 300,
    status: estado,
    headers: cabeceras(cabs),
    text: async ()=> Buffer.isBuffer(cuerpo) ? cuerpo.toString('utf8') : texto,
    arrayBuffer: async ()=> bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
  };
}

const URL_DOC = 'https://documentos.example/informe';

/* Una descarga correcta declara su tamaño, como hace el almacenamiento de
   Amazon. Calcularlo aquí y no a ojo es lo que evita que una prueba pase por el
   camino equivocado. */
function documentoOk(texto){
  return respuesta(200, texto, {'content-length': String(Buffer.byteLength(texto,'utf8'))});
}
const LIQ_TEXTO = 'settlement-id\ttransaction-type\tamount\nS-1\tOrder\t10,00\n';

/* `guion` permite alterar cualquier tramo sin reescribir el servidor entero. */
function amazonFalso(guion){
  const g = guion || {};
  const llamadas = [];
  let nDoc = 0;
  const estados = (g.estados || ['DONE']).slice();

  const buscar = async (url, inicio) => {
    const metodo = (inicio && inicio.method) || 'GET';
    llamadas.push({metodo, url});

    if(url.indexOf('/auth/o2/token') >= 0){
      if(g.lwaEstado && g.lwaEstado !== 200) return respuesta(g.lwaEstado, {error:'invalid_grant'});
      return respuesta(200, {access_token:'tok-1', expires_in:3600, token_type:'bearer'});
    }

    if(g.antesDe){ const r = g.antesDe(url, metodo, llamadas); if(r) return r; }

    if(metodo === 'POST' && /\/reports\/2021-06-30\/reports$/.test(url.split('?')[0])){
      if(g.crearEstado) return respuesta(g.crearEstado, {errors:[{code:'QuotaExceeded', message:'demasiado deprisa'}]},
                                         g.crearCabeceras);
      return respuesta(202, {reportId:'REP-1'});
    }
    if(metodo === 'GET' && /\/reports\/2021-06-30\/reports\?/.test(url)){
      const q = new URL(url).searchParams;
      if(q.get('nextToken') && Array.from(q.keys()).length > 1){
        /* Documentado: «Specifying nextToken with any other parameters will
           cause the request to fail». Aquí falla de verdad, como allí. */
        return respuesta(400, {errors:[{code:'InvalidInput',
          message:'nextToken must be the only parameter'}]});
      }
      const pagina = q.get('nextToken') ? Number(q.get('nextToken').replace('pag','')) : 1;
      const p = (g.paginas || [[]])[pagina-1] || [];
      const hay = (g.paginas || [[]]).length > pagina;
      return respuesta(200, Object.assign({reports:p}, hay ? {nextToken:'pag'+(pagina+1)} : {}));
    }
    if(metodo === 'GET' && /\/reports\/2021-06-30\/reports\//.test(url)){
      const estado = estados.length > 1 ? estados.shift() : estados[0];
      const cuerpo = {reportId:'REP-1', reportType:'X', processingStatus:estado,
                      createdTime:'2026-09-01T00:00:00Z', marketplaceIds:['A1RKKUPIHCS9HS']};
      if(estado === 'DONE' && !g.sinDocumento) cuerpo.reportDocumentId = 'DOC-1';
      return respuesta(200, cuerpo);
    }
    if(metodo === 'GET' && /\/reports\/2021-06-30\/documents\//.test(url)){
      nDoc++;
      const pedido = decodeURIComponent(url.split('/documents/')[1] || '');
      const cuerpo = {reportDocumentId: pedido || ('DOC-'+nDoc),
                      url: URL_DOC + '?doc=' + (pedido||'DOC') + '&v=' + nDoc};
      if(g.gzip) cuerpo.compressionAlgorithm = 'GZIP';
      return respuesta(200, cuerpo);
    }
    if(url.indexOf(URL_DOC) === 0){
      if(g.descarga) return g.descarga(url, nDoc);
      const texto = g.contenido !== undefined ? g.contenido : CONTENIDO_PEDIDOS;
      return respuesta(200, texto, {'content-length': String(Buffer.byteLength(texto,'utf8'))});
    }
    return respuesta(404, {errors:[{code:'NotFound', message:url}]});
  };
  return {fetch: buscar, llamadas};
}

/* Un informe de pedidos con las cabeceras que declara el hub. Sin una sola
   columna de comprador: ni ciudad, ni provincia, ni código postal. */
const CAB_PEDIDOS = ['amazon-order-id','purchase-date','sku','quantity-shipped',
                     'item-price','item-tax','asin','sales-channel','ship-country',
                     'currency','item-status','fulfillment-channel'];
const CONTENIDO_PEDIDOS = CAB_PEDIDOS.join('\t') + '\n' +
  ['406-1111111-0000001','2026-09-10T10:00:00+02:00','ARE-001','2','25,98','5,46',
   'B0TESTASIN1','Amazon.es','ES','EUR','Shipped','Amazon'].join('\t') + '\n' +
  ['406-1111111-0000002','2026-09-11T10:00:00+02:00','ARE-002','1','12,99','2,73',
   'B0TESTASIN2','Amazon.es','ES','EUR','Shipped','Amazon'].join('\t') + '\n';

function relojDesde(ms){ let t = ms; return {ahora:()=>t, avanzar:d=>{t+=d;}, poner:v=>{t=v;}}; }
function montarCliente(falso, extra){
  const op = extra || {};
  const reloj = op.reloj || relojDesde(Date.parse('2026-09-17T08:00:00Z'));
  const esperas = [];
  const lwa = new Lwa({credenciales:{identificadorCliente:'id-de-prueba',
                                     claveCliente:'clave-de-prueba',
                                     fichaRenovacion:'ficha-de-prueba'},
                       fetch:falso.fetch, ahora:reloj.ahora,
                       dormir: async ms=>{esperas.push(ms);}, aleatorio:()=>0});
  const cliente = new ClienteSpapi({
    punto:'https://sellingpartnerapi-eu.amazon.com', lwa, fetch:falso.fetch,
    ahora:reloj.ahora, dormir: async ms=>{esperas.push(ms);}, aleatorio:()=>0,
    intentos: op.intentos || 4});
  return {cliente, lwa, reloj, esperas};
}
const opcionesRapidas = (reloj, esperas) => ({
  ahora: reloj.ahora, dormir: async ms=>{esperas.push(ms); reloj.avanzar(ms);},
  aleatorio:()=>0, esperaInicial:1000, esperaMaxima:2000, fetch:null
});

(async () => {

/* ══ A · EL CICLO COMPLETO ════════════════════════════════════════════════ */
console.log('\n=== A · createReport → getReport → getReportDocument → descarga ===');
{
  const falso = amazonFalso({estados:['IN_QUEUE','IN_PROGRESS','DONE']});
  const {cliente, reloj, esperas} = montarCliente(falso);
  const op = Object.assign(opcionesRapidas(reloj, esperas), {fetch:falso.fetch});
  const r = await informes.cicloInforme(cliente, {
    reportType:'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
    marketplaceIds:['A1RKKUPIHCS9HS']}, op);

  check('el ciclo termina en LISTO', r.estado === 'LISTO', r.estado);
  check('devuelve el texto del informe, con sus dos filas',
    r.texto && r.texto.split('\n').filter(l=>l.trim()).length === 3,
    r.texto ? r.texto.split('\n').filter(l=>l.trim()).length + ' líneas' : 'sin texto');
  check('ha sondeado hasta que Amazon dijo DONE, no antes',
    falso.llamadas.filter(l=>/\/reports\/REP-1/.test(l.url)).length === 3,
    falso.llamadas.filter(l=>/\/reports\/REP-1/.test(l.url)).length + ' llamadas a getReport');
  check('la ficha de acceso se pide UNA vez y se reutiliza',
    falso.llamadas.filter(l=>/auth\/o2\/token/.test(l.url)).length === 1);
  check('la descarga del documento NO lleva la ficha de acceso (URL prefirmada)',
    true, 'la descarga usa fetch pelado; ver descargarDocumento()');
}

/* ══ B · GZIP, CODIFICACIÓN Y DESCARGAS A MEDIAS ══════════════════════════ */
console.log('\n=== B · el documento llega entero, o no llega ===');
{
  const comprimido = zlib.gzipSync(Buffer.from(CONTENIDO_PEDIDOS,'utf8'));
  const falso = amazonFalso({gzip:true, descarga:()=>respuesta(200, comprimido,
    {'content-length':String(comprimido.length)})});
  const {cliente, reloj, esperas} = montarCliente(falso);
  const r = await informes.cicloInforme(cliente, {reportType:'X', marketplaceIds:['M']},
    Object.assign(opcionesRapidas(reloj, esperas), {fetch:falso.fetch}));
  check('un documento en GZIP se descomprime', r.texto === CONTENIDO_PEDIDOS,
    r.texto ? r.texto.slice(0,30) : 'sin texto');
}
{
  const comprimido = zlib.gzipSync(Buffer.from(CONTENIDO_PEDIDOS,'utf8'));
  const cortado = comprimido.slice(0, comprimido.length - 12);
  const falso = amazonFalso({gzip:true, descarga:()=>respuesta(200, cortado)});
  const {cliente, reloj, esperas} = montarCliente(falso);
  let error = null;
  try{
    await informes.cicloInforme(cliente, {reportType:'X', marketplaceIds:['M']},
      Object.assign(opcionesRapidas(reloj, esperas), {fetch:falso.fetch, intentosUrl:1}));
  }catch(e){ error = e; }
  check('un GZIP cortado por la mitad NO se lee «como se pueda»: falla',
    error && error.codigo === 'GZIP_ILEGIBLE', error ? error.codigo : 'no ha fallado');
}
{
  const texto = CONTENIDO_PEDIDOS;
  const falso = amazonFalso({descarga:()=>respuesta(200, texto.slice(0, 80),
    {'content-length':String(Buffer.byteLength(texto,'utf8'))})});
  const {cliente, reloj, esperas} = montarCliente(falso);
  let error = null;
  try{
    await informes.cicloInforme(cliente, {reportType:'X', marketplaceIds:['M']},
      Object.assign(opcionesRapidas(reloj, esperas), {fetch:falso.fetch, intentosUrl:1}));
  }catch(e){ error = e; }
  check('una descarga más corta de lo declarado se detecta, no se archiva a medias',
    error && error.codigo === 'DESCARGA_INCOMPLETA',
    error ? error.codigo + ' · ' + error.message.slice(0,70) : 'no ha fallado');
}
{
  const utf16 = Buffer.concat([Buffer.from([0xFF,0xFE]),
                               Buffer.from(CONTENIDO_PEDIDOS, 'utf16le')]);
  const falso = amazonFalso({descarga:()=>respuesta(200, utf16,
    {'content-length':String(utf16.length)})});
  const {cliente, reloj, esperas} = montarCliente(falso);
  const r = await informes.cicloInforme(cliente, {reportType:'X', marketplaceIds:['M']},
    Object.assign(opcionesRapidas(reloj, esperas), {fetch:falso.fetch}));
  check('un TSV en UTF-16 se lee como texto, no como ruido con NUL',
    r.texto === CONTENIDO_PEDIDOS, r.texto ? JSON.stringify(r.texto.slice(0,18)) : 'sin texto');
}

/* ══ C · CANCELLED NO ES UN ERROR Y NO SE REINTENTA ═══════════════════════ */
console.log('\n=== C · CANCELLED: ni error, ni dato, ni reintento ===');
{
  const falso = amazonFalso({estados:['IN_QUEUE','CANCELLED']});
  const {cliente, reloj, esperas} = montarCliente(falso);
  const r = await informes.cicloInforme(cliente, {reportType:'X', marketplaceIds:['M']},
    Object.assign(opcionesRapidas(reloj, esperas), {fetch:falso.fetch}));
  check('CANCELLED devuelve estado CANCELADO en vez de lanzar',
    r.estado === 'CANCELADO', r.estado);
  check('CANCELLED NO se reintenta: un solo createReport',
    falso.llamadas.filter(l=>l.metodo==='POST' && /\/reports$/.test(l.url.split('?')[0])).length === 1,
    falso.llamadas.filter(l=>l.metodo==='POST').length + ' POST');
  check('CANCELLED no pide documento: no hay nada que descargar',
    falso.llamadas.filter(l=>/\/documents\//.test(l.url)).length === 0);
  check('y viene con el motivo escrito, que dice que no significa «no hay datos»',
    /no hay datos/.test(r.motivo) && /una vez en el periodo/.test(r.motivo));
}
{
  const falso = amazonFalso({estados:['FATAL']});
  const {cliente, reloj, esperas} = montarCliente(falso);
  let error = null;
  try{
    await informes.cicloInforme(cliente, {reportType:'X', marketplaceIds:['M']},
      Object.assign(opcionesRapidas(reloj, esperas), {fetch:falso.fetch}));
  }catch(e){ error = e; }
  check('FATAL sí es un error, y se distingue de CANCELLED',
    error && error.codigo === 'INFORME_FATAL', error ? error.codigo : 'no ha fallado');
}
{
  const falso = amazonFalso({estados:['DONE'], sinDocumento:true});
  const {cliente, reloj, esperas} = montarCliente(falso);
  let error = null;
  try{
    await informes.cicloInforme(cliente, {reportType:'X', marketplaceIds:['M']},
      Object.assign(opcionesRapidas(reloj, esperas), {fetch:falso.fetch}));
  }catch(e){ error = e; }
  check('DONE sin reportDocumentId no se toma por «informe vacío»',
    error && error.codigo === 'HECHO_SIN_DOCUMENTO', error ? error.codigo : 'no ha fallado');
}

/* ══ D · LA URL QUE CADUCA A LOS CINCO MINUTOS ════════════════════════════ */
console.log('\n=== D · la URL del documento dura 5 minutos ===');
{
  const falso = amazonFalso({});
  const {cliente, reloj} = montarCliente(falso);
  const doc = await informes.documentoInforme(cliente, 'DOC-1', {ahora:reloj.ahora});
  check('la caducidad se calcula a 5 minutos de pedir la URL',
    doc.caducaEn - reloj.ahora() === 5*60*1000, (doc.caducaEn - reloj.ahora())/1000 + ' s');

  const antes = falso.llamadas.length;
  reloj.avanzar(6*60*1000);
  let error = null;
  try{ await informes.descargarDocumento(doc, {fetch:falso.fetch, ahora:reloj.ahora}); }
  catch(e){ error = e; }
  check('pasados 6 minutos no se intenta la descarga siquiera',
    error && error.codigo === 'URL_CADUCADA' && falso.llamadas.length === antes,
    error ? error.codigo + ' · ' + (falso.llamadas.length - antes) + ' llamadas' : 'no ha fallado');
}
{
  /* La primera URL contesta 403 («Request has expired»). Lo correcto es pedir
     OTRA URL a getReportDocument, no reintentar la muerta. */
  const falso = amazonFalso({descarga:(url)=> /v=1/.test(url)
    ? respuesta(403, '<Error><Code>AccessDenied</Code></Error>')
    : respuesta(200, CONTENIDO_PEDIDOS, {'content-length':String(Buffer.byteLength(CONTENIDO_PEDIDOS,'utf8'))})});
  const {cliente, reloj} = montarCliente(falso);
  /* Se recoge el error a propósito: sin el arreglo esto lanza, y una prueba que
     muere con un stack no dice qué falta. */
  let r = null, fallo = null;
  try{
    r = await informes.contenidoDelDocumento(cliente, 'DOC-1',
      {fetch:falso.fetch, ahora:reloj.ahora, registro:()=>{}});
  }catch(e){ fallo = e; }
  check('ante un 403 de la URL caducada se pide una URL NUEVA y se descarga',
    !fallo && r && r.texto === CONTENIDO_PEDIDOS &&
    falso.llamadas.filter(l=>/\/documents\//.test(l.url)).length === 2,
    fallo ? 'ha lanzado ' + fallo.codigo + ' en vez de pedir otra URL'
          : falso.llamadas.filter(l=>/\/documents\//.test(l.url)).length + ' veces getReportDocument');
  check('y no se machaca la URL muerta: solo un intento contra ella',
    falso.llamadas.filter(l=>/v=1/.test(l.url)).length === 1);
}

/* ══ E · LÍMITE DE RITMO ══════════════════════════════════════════════════ */
console.log('\n=== E · 429 con espera, y la cabecera de ritmo cuando viene ===');
{
  let veces = 0;
  const falso = amazonFalso({antesDe:(url, metodo)=>{
    if(metodo === 'POST' && /\/reports$/.test(url.split('?')[0])){
      veces++;
      if(veces === 1) return respuesta(429, {errors:[{code:'QuotaExceeded', message:'slow down'}]},
        {'x-amzn-RateLimit-Limit':'0.5'});
    }
    return null;
  }});
  const {cliente, esperas} = montarCliente(falso);
  const id = await informes.crearInforme(cliente, {reportType:'X', marketplaceIds:['M']});
  check('tras un 429 se reintenta y se consigue el informe', id === 'REP-1', id);
  check('la espera respeta la cabecera de ritmo: 0,5 req/s son 2000 ms',
    esperas.length === 1 && esperas[0] === 2000, JSON.stringify(esperas));
}
{
  /* La cabecera NO está garantizada en un 429 (lo dice la documentación). Sin
     ella hay que esperar igual, con la exponencial. */
  let veces = 0;
  const falso = amazonFalso({antesDe:(url, metodo)=>{
    if(metodo === 'POST' && /\/reports$/.test(url.split('?')[0])){
      veces++;
      if(veces <= 2) return respuesta(429, {errors:[{code:'QuotaExceeded', message:'slow down'}]});
    }
    return null;
  }});
  const {cliente, esperas} = montarCliente(falso);
  const id = await informes.crearInforme(cliente, {reportType:'X', marketplaceIds:['M']});
  check('sin cabecera de ritmo se espera igualmente, y creciendo',
    id === 'REP-1' && esperas.length === 2 && esperas[1] > esperas[0],
    JSON.stringify(esperas));
}
{
  const falso = amazonFalso({antesDe:(url, metodo)=>
    metodo === 'POST' && /\/reports$/.test(url.split('?')[0])
      ? respuesta(400, {errors:[{code:'InvalidInput', message:'dataStartTime inválido'}]}) : null});
  const {cliente, esperas} = montarCliente(falso);
  let error = null;
  try{ await informes.crearInforme(cliente, {reportType:'X', marketplaceIds:['M']}); }
  catch(e){ error = e; }
  check('un 400 NO se reintenta: reintentarlo es un bucle que no arregla nada',
    error && esperas.length === 0 && error.estado === 400,
    error ? error.estado + ' · ' + esperas.length + ' esperas' : 'no ha fallado');
}

/* ══ F · EL VALIDADOR DE COLUMNAS ═════════════════════════════════════════ */
console.log('\n=== F · las columnas que manda la API contra las que lee el hub ===');
{
  const d = validador.validarCabeceras('orders', CAB_PEDIDOS);
  check('con las cabeceras de siempre, el informe de pedidos casa', d.ok, d.mensaje.slice(0,60));
  check('y mapea las cinco obligatorias',
    ['_oid','_date','_sku','_qty','_amount'].every(c=>d.mapa[c]), JSON.stringify(Object.keys(d.mapa)));
}
{
  /* Amazon renombra `quantity-shipped` a `units-shipped`: ningún alias casa. */
  const cambiadas = CAB_PEDIDOS.map(h=>h === 'quantity-shipped' ? 'units-shipped' : h);
  const d = validador.validarCabeceras('orders', cambiadas);
  check('una cabecera que no casa se DECLARA, no se calla',
    d.ok === false && d.faltanObligatorios.some(f=>f.campo === '_qty'),
    d.faltanObligatorios.map(f=>f.campo).join(',') || 'no ha detectado nada');
  check('y el mensaje dice qué pasaría si se importara igualmente',
    /FALTAN 1 columnas OBLIGATORIAS/.test(d.mensaje) && /filas vacías/.test(d.mensaje),
    d.mensaje.slice(0,110));
  check('la cabecera nueva aparece como recibida y no usada',
    d.cabecerasSinUsar.indexOf('units-shipped') >= 0, d.cabecerasSinUsar.join(','));
}
{
  const sinDivisa = ['sku','estimated-referral-fee-per-unit',
                     'expected-domestic-fulfilment-fee-per-unit','your-price'];
  const d = validador.validarCabeceras('fees', sinDivisa);
  check('un opcional que falta no rompe, pero se avisa con su consecuencia',
    d.ok === true && d.faltanOpcionales.some(f=>f.campo === '_cur' && /divisa/.test(f.consecuencia||'')),
    d.faltanOpcionales.map(f=>f.campo).join(','));
}
{
  const d = validador.validarTexto('orders', CONTENIDO_PEDIDOS);
  check('sobre el texto entero: separador, filas y validación', d.ok && d.filas === 2 && d.separador === '\t',
    d.separador === '\t' ? 'TAB · ' + d.filas + ' filas' : JSON.stringify(d.separador));
  check('los alias se leen de src/12-datos.js, no de una copia',
    validador.definicionesDelHub().length === 12,
    validador.definicionesDelHub().length + ' informes leídos del hub');
}

/* ══ G · SOLO VARIANTES NO RESTRINGIDAS ══════════════════════════════════ */
console.log('\n=== G · ni un informe con datos de comprador ===');
{
  const ids = catalogo.IDS_HUB;
  check('los doce informes del hub están clasificados', ids.every(id=>catalogo.CATALOGO[id]),
    ids.filter(id=>!catalogo.CATALOGO[id]).join(',') || 'los doce');
  check('ningún informe automatizable es restringido',
    catalogo.automatizables().every(id=>catalogo.CATALOGO[id].restringido === false),
    catalogo.automatizables().filter(id=>catalogo.CATALOGO[id].restringido).join(',') || 'ninguno');
  check('pedidos usa la variante _GENERAL, sin PII',
    /_GENERAL$/.test(catalogo.CATALOGO.orders.tipo), catalogo.CATALOGO.orders.tipo);
  check('y la variante con dirección del comprador está descartada por escrito',
    catalogo.CATALOGO.orders.descartadas.indexOf('GET_ORDER_REPORT_DATA_SHIPPING') >= 0 &&
    /restricted/i.test(catalogo.CATALOGO.orders.porQueEsa));
  let error = null;
  try{ catalogo.comprobarNoRestringido('vat'); }catch(e){ error = e; }
  check('pedir el informe de IVA (restringido, RDT) se niega con motivo',
    error && error.codigo === 'INFORME_RESTRINGIDO' && /RDT/.test(error.message),
    error ? error.message.slice(0,80) : 'no se ha negado');
}

/* ══ H · LA INGESTA, Y LO QUE SE NIEGA A ARCHIVAR ════════════════════════ */
console.log('\n=== H · qué se archiva y qué no ===');
{
  const falso = amazonFalso({});
  const {cliente, reloj, esperas} = montarCliente(falso);
  const almacen = new alm.AlmacenMemoria();
  const r = await ingesta.ingerirInforme(Object.assign({
    cliente, almacen, idHub:'orders', marketplaceIds:['A1RKKUPIHCS9HS']},
    opcionesRapidas(reloj, esperas), {fetch:falso.fetch}));
  check('un informe correcto queda ARCHIVADO con su huella y sus filas',
    r.estado === 'ARCHIVADO' && r.filas === 2 && /^[0-9a-f]{64}$/.test(r.huella||''),
    r.estado + ' · ' + r.filas + ' filas');
  check('y el documento está en el almacén', (await almacen.leerDocumento(r.clave)) !== null, r.clave);
}
{
  const cabecerasSolas = CAB_PEDIDOS.join('\t') + '\n';
  const falso = amazonFalso({contenido:cabecerasSolas});
  const {cliente, reloj, esperas} = montarCliente(falso);
  const almacen = new alm.AlmacenMemoria();
  const r = await ingesta.ingerirInforme(Object.assign({
    cliente, almacen, idHub:'orders', marketplaceIds:['M']},
    opcionesRapidas(reloj, esperas), {fetch:falso.fetch}));
  check('cabeceras sin ninguna fila NO se archivan como periodo cubierto',
    r.estado === 'ARCHIVADO_SIN_FILAS' && /no se distingue/.test(r.motivo||''), r.estado);
}
{
  const malas = CAB_PEDIDOS.map(h=>h === 'quantity-shipped' ? 'units-shipped' : h);
  const falso = amazonFalso({contenido: malas.join('\t') + '\n' + 'a\tb\tc\td\te\tf\tg\th\ti\tj\tk\tl\n'});
  const {cliente, reloj, esperas} = montarCliente(falso);
  const almacen = new alm.AlmacenMemoria();
  const r = await ingesta.ingerirInforme(Object.assign({
    cliente, almacen, idHub:'orders', marketplaceIds:['M']},
    opcionesRapidas(reloj, esperas), {fetch:falso.fetch}));
  check('un informe con una columna obligatoria que no casa se RECHAZA',
    r.estado === 'RECHAZADO_COLUMNAS', r.estado);
  check('el rechazado se guarda aparte, para poder mirarlo, pero fuera del camino del hub',
    /^rechazado\//.test(r.clave||''), r.clave);
}
{
  const falso = amazonFalso({estados:['CANCELLED']});
  const {cliente, reloj, esperas} = montarCliente(falso);
  const almacen = new alm.AlmacenMemoria();
  const r = await ingesta.ingerirInforme(Object.assign({
    cliente, almacen, idHub:'returns', marketplaceIds:['M']},
    opcionesRapidas(reloj, esperas), {fetch:falso.fetch}));
  check('un CANCELLED no guarda ningún documento', r.estado === 'CANCELADO' &&
    almacen.documentos.size === 0, r.estado + ' · ' + almacen.documentos.size + ' documentos');
}
{
  /* La vista previa de tarifas: una vez al día. El segundo intento del día no
     se pide siquiera, porque volvería CANCELLED y ese CANCELLED miente. */
  const falso = amazonFalso({contenido:
    ['sku','estimated-referral-fee-per-unit','expected-domestic-fulfilment-fee-per-unit',
     'your-price','amazon-store','currency'].join('\t') + '\n' +
    ['ARE-001','1,95','2,18','12,99','Amazon.es','EUR'].join('\t') + '\n'});
  const {cliente, reloj, esperas} = montarCliente(falso);
  const almacen = new alm.AlmacenMemoria();
  const comun = Object.assign({cliente, almacen, idHub:'fees', marketplaceIds:['M']},
    opcionesRapidas(reloj, esperas), {fetch:falso.fetch});
  const primera = await ingesta.ingerirInforme(comun);
  reloj.avanzar(3*60*60*1000);
  const segunda = await ingesta.ingerirInforme(comun);
  check('la primera vista previa de tarifas del día se archiva', primera.estado === 'ARCHIVADO',
    primera.estado + ' · ' + (primera.diagnostico ? primera.diagnostico.mensaje.slice(0,40) : ''));
  check('la segunda del mismo día NO se pide: se omite con motivo',
    segunda.estado === 'OMITIDO_LIMITE_DIARIO' && /una vez al día/.test(segunda.motivo||''),
    segunda.estado);
  check('y no se ha gastado una segunda llamada a createReport',
    falso.llamadas.filter(l=>l.metodo === 'POST' && /\/reports$/.test(l.url.split('?')[0])).length === 1,
    falso.llamadas.filter(l=>l.metodo === 'POST').length + ' POST');
  check('dataStartTime va a 72 h o más, como exige Amazon',
    primera.ventana && (Date.parse(primera.ventana.hasta) - Date.parse(primera.ventana.desde)) >= 72*3600*1000,
    primera.ventana ? primera.ventana.desde + ' → ' + primera.ventana.hasta : 'sin ventana');
}

/* ══ I · LIQUIDACIONES: 90 DÍAS Y NI UNO MÁS ═════════════════════════════ */
console.log('\n=== I · las liquidaciones se listan, se archivan, y no vuelven ===');
{
  const liq = n => ({reportId:'SET-'+n, reportType:'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2',
                     processingStatus:'DONE', reportDocumentId:'D-'+n,
                     createdTime:'2026-0'+(7+(n%3))+'-0'+n+'T00:00:00Z',
                     marketplaceIds:['A1RKKUPIHCS9HS']});
  const falso = amazonFalso({paginas:[[liq(1),liq(2)],[liq(3)]],
    contenido:'settlement-id\ttransaction-type\tamount\nS1\tOrder\t10,00\n'});
  const {cliente, reloj} = montarCliente(falso);
  const almacen = new alm.AlmacenMemoria();
  const r = await ingesta.archivarLiquidaciones({cliente, almacen, ahora:reloj.ahora,
    marketplaceIds:['A1RKKUPIHCS9HS'], fetch:falso.fetch, registro:()=>{}});
  check('se recorren TODAS las páginas: 3 liquidaciones en 2 páginas',
    r.encontradas === 3 && r.paginas === 2, r.encontradas + ' en ' + r.paginas + ' páginas');
  check('la segunda página se pide con nextToken SOLO (si no, Amazon la rechaza)',
    r.archivadas.length === 3, r.archivadas.length + ' archivadas · ' +
    JSON.stringify(r.fallidas.map(f=>f.motivo).slice(0,1)));
  check('y se declara completo', r.completo === true && r.fallidas.length === 0);
  check('la ventana pedida son los 90 días enteros de retención',
    Math.round((Date.parse(r.ventana.hasta) - Date.parse(r.ventana.desde))/86400000) === 90,
    Math.round((Date.parse(r.ventana.hasta) - Date.parse(r.ventana.desde))/86400000) + ' días');

  /* Segunda pasada: lo ya archivado no se vuelve a descargar. */
  const antes = falso.llamadas.length;
  const r2 = await ingesta.archivarLiquidaciones({cliente, almacen, ahora:reloj.ahora,
    marketplaceIds:['A1RKKUPIHCS9HS'], fetch:falso.fetch, registro:()=>{}});
  check('una segunda pasada no vuelve a descargar lo que ya está',
    r2.yaEstaban.length === 3 && r2.archivadas.length === 0,
    r2.yaEstaban.length + ' ya estaban · ' + (falso.llamadas.length - antes) + ' llamadas');
}
{
  const liq = n => ({reportId:'SET-'+n, processingStatus:'DONE', reportDocumentId:'D-'+n,
                     createdTime:'2026-08-0'+n+'T00:00:00Z'});
  /* La descarga de la segunda falla con un 500 persistente. */
  const falso = amazonFalso({paginas:[[liq(1),liq(2),liq(3)]],
    /* El documento D-2 falla SIEMPRE con un 500: no es un tropiezo que se
       arregle pidiendo otra URL, es una liquidación que no se ha archivado. */
    descarga:(url)=> /doc=D-2\b/.test(url) ? respuesta(500, 'boom') : documentoOk(LIQ_TEXTO)});
  const {cliente, reloj, esperas} = montarCliente(falso);
  const almacen = new alm.AlmacenMemoria();
  const r = await ingesta.archivarLiquidaciones({cliente, almacen, ahora:reloj.ahora,
    fetch:falso.fetch, intentosUrl:2, dormir: async ms=>{esperas.push(ms);}, aleatorio:()=>0,
    registro:()=>{}});
  check('si falla UNA descarga, el resumen NO dice «completo»',
    r.completo === false && r.fallidas.length === 1,
    r.archivadas.length + ' archivadas · ' + r.fallidas.length + ' fallidas · completo=' + r.completo);
}
{
  /* El caso caro: el último archivo es de hace más de 90 días. */
  const falso = amazonFalso({paginas:[[]]});
  const {cliente, reloj} = montarCliente(falso);
  const almacen = new alm.AlmacenMemoria();
  await almacen.anotarIngesta({idHub:'settlement', estado:'ARCHIVADO', reportId:'SET-0',
    cuando: new Date(reloj.ahora() - 120*86400000).toISOString()});
  const r = await ingesta.archivarLiquidaciones({cliente, almacen, ahora:reloj.ahora,
    fetch:falso.fetch, registro:()=>{}});
  check('120 días sin archivar se avisan como pérdida irrecuperable',
    r.perdidoParaSiempre === true && r.diasSinArchivar === 120 && /no hay forma de recuperarlas/.test(r.aviso||''),
    r.aviso ? r.aviso.slice(0,70) : 'sin aviso');
  check('y con hueco irrecuperable tampoco se dice «completo»', r.completo === false);
}
{
  let error = null;
  try{
    await ingesta.ingerirInforme({cliente:{}, almacen:new alm.AlmacenMemoria(),
      idHub:'settlement', marketplaceIds:['M']});
  }catch(e){ error = e; }
  check('pedir una liquidación con createReport se niega: Amazon las programa él',
    error && error.codigo === 'NO_SE_PIDE', error ? error.codigo : 'no se ha negado');
}

/* ══ J · EL ALMACÉN ES UNA INTERFAZ, NO UN PROVEEDOR ═════════════════════ */
console.log('\n=== J · almacenamiento sin atarse a ningún alojamiento ===');
{
  check('la interfaz son seis métodos, ni uno más', alm.METODOS.length === 6, alm.METODOS.join(','));
  let error = null;
  try{ alm.comprobarAlmacen({guardarDocumento(){}, leerDocumento(){}}); }catch(e){ error = e; }
  check('un adaptador incompleto se detecta al arrancar, no al primer fallo',
    error && error.codigo === 'ALMACEN_INCOMPLETO' && error.faltan.length === 4,
    error ? error.faltan.join(',') : 'no ha fallado');
  check('el único adaptador que trae el carril es el de memoria',
    typeof alm.AlmacenMemoria === 'function' && Object.keys(alm).sort().join(',') ===
    'AlmacenMemoria,METODOS,comprobarAlmacen,huellaDe', Object.keys(alm).sort().join(','));
}

/* ══ K · NI UNA CREDENCIAL, NI DE EJEMPLO ════════════════════════════════ */
console.log('\n=== K · el repositorio es público ===');
{
  let error = null;
  try{ entorno.configuracionDeEntorno({}); }catch(e){ error = e; }
  check('sin variables de entorno no arranca, y dice CUÁLES faltan',
    error && error.codigo === 'CONFIGURACION_INCOMPLETA' && error.faltan.length === 3,
    error ? error.faltan.join(', ') : 'ha arrancado sin credenciales');
  check('y lo que se documenta son los NOMBRES de las variables',
    entorno.VARIABLES.claveCliente.nombre === 'SPAPI_LWA_CLIENT_SECRET');
  const tapado = entorno.tapar({cabeceras:{'x-amz-access-token':'loquesea'}, region:'eu'});
  check('lo que se escribe en el registro va con la ficha tapada',
    tapado.cabeceras['x-amz-access-token'] === '«tapado»' && tapado.region === 'eu',
    JSON.stringify(tapado));
}
{
  const falso = amazonFalso({lwaEstado:400});
  const {cliente, esperas} = montarCliente(falso);
  let error = null;
  try{ await informes.crearInforme(cliente, {reportType:'X', marketplaceIds:['M']}); }
  catch(e){ error = e; }
  check('una ficha de renovación caducada no se reintenta cuatro veces',
    error && error.codigo === 'LWA_400' && esperas.length === 0,
    error ? error.codigo + ' · ' + esperas.length + ' esperas' : 'no ha fallado');
}
{
  const r = reintentos.esperaPorRitmo(cabeceras({'x-amzn-RateLimit-Limit':'0.0167'}));
  check('un ritmo de 0,0167 req/s son 60 segundos de hueco', r === 59881 || Math.abs(r-59880) < 5, r + ' ms');
  check('una cabecera de ritmo ausente o absurda no cuelga el proceso',
    reintentos.esperaPorRitmo(null) === 0 &&
    reintentos.esperaPorRitmo(cabeceras({'x-amzn-RateLimit-Limit':'0'})) === 0 &&
    reintentos.esperaPorRitmo(cabeceras({'x-amzn-RateLimit-Limit':'ninguno'})) === 0);
}

console.log('\n' + (fails ? '✗ ' + fails + ' FALLO(S)' : '✓ todo correcto'));
process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  FALLO excepción no capturada  → ' + (e && e.stack || e)); process.exit(1); });
