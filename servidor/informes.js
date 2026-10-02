'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   servidor/informes.js · el ciclo createReport → getReport → getReportDocument

   TODO LO QUE SIGUE ESTÁ VERIFICADO CONTRA LA DOCUMENTACIÓN VIGENTE.
   Modelo oficial `reports_2021-06-30.json` del repositorio
   amzn/selling-partner-api-models, y las páginas de developer-docs.amazon.com.
   Consultados el 17 de septiembre de 2026.

   1 · LA URL DEL DOCUMENTO CADUCA A LOS 5 MINUTOS. CONFIRMADO, literal:
       «A presigned URL for the report document. If `compressionAlgorithm` is not
        returned, you can download the report directly from this URL. This URL
        expires after 5 minutes.»
       Consecuencia de diseño: la URL NO se guarda ni se reutiliza. Si caduca,
       lo que se repite es `getReportDocument`, no la descarga muerta.

   2 · UN INFORME SIN DATOS VUELVE «CANCELLED», Y NO ES UN ERROR. CONFIRMADO,
       literal, en la tabla del enum `processingStatus`:
       «The report was cancelled. There are two ways a report can be cancelled:
        an explicit cancellation request before the report starts processing, or
        an automatic cancellation if there is no data to return.»
       Y MATIZADO por las preguntas frecuentes, que dan TRES causas:
       «There are three possible reasons a report is cancelled: The report was
        manually cancelled through the API before processing started. No data can
        be found for the report. You can request some reports (for example, FBA
        reports) only once within a specified time period.»
       (https://developer-docs.amazon.com/sp-api/docs/reports-faq)
       Esto es lo más importante de todo el módulo: CANCELLED **no significa
       «no hay datos»**. Significa «no hay datos, o has pedido este informe dos
       veces el mismo día». Archivarlo como «no hubo ventas» sería inventarse un
       cero. Por eso aquí es un estado propio, `CANCELADO`, que ni se reintenta
       ni se guarda como contenido.

   3 · El documento puede venir comprimido con GZIP (`compressionAlgorithm`), y
       es el único valor posible del enum.

   4 · `getReports` pagina con `nextToken`, y literal:
       «Specifying `nextToken` with any other parameters will cause the request
        to fail.»
       Por eso la segunda página y siguientes se piden con `nextToken` SOLO.

   5 · Retención: «Reports are retained for a maximum of 90 days» (parámetro
       `createdSince` de `getReports`). Lo que no se archive dentro de esa
       ventana no se recupera.
   ═══════════════════════════════════════════════════════════════════════════ */

const zlib = require('zlib');
const { ErrorSpapi } = require('./cliente');
const { conReintentos } = require('./reintentos');

const RUTA = '/reports/2021-06-30';

/* Los cinco estados del enum oficial, con lo que significa cada uno. */
const ESTADOS = {
  EN_COLA:     'IN_QUEUE',
  EN_CURSO:    'IN_PROGRESS',
  HECHO:       'DONE',
  CANCELADO:   'CANCELLED',
  FATAL:       'FATAL'
};
const TERMINALES = [ESTADOS.HECHO, ESTADOS.CANCELADO, ESTADOS.FATAL];

/* Vida de la URL del documento, en milisegundos, y el margen con el que se da
   por muerta. 5 minutos exactos es lo que dice Amazon; se descarta 15 segundos
   antes porque entre comprobar y descargar pasa tiempo, y porque el reloj del
   servidor y el de Amazon no son el mismo reloj. */
const VIDA_URL_MS = 5 * 60 * 1000;
const MARGEN_URL_MS = 15 * 1000;

const MOTIVO_CANCELADO =
  'CANCELLED no distingue entre «no hay datos», «alguien lo canceló» y «este ' +
  'informe solo se puede pedir una vez en el periodo». Sin poder distinguirlo, ' +
  'no se archiva nada: un cero archivado como medida es peor que un hueco visible.';

/* ── 1 · pedir el informe ─────────────────────────────────────────────────── */
async function crearInforme(cliente, peticion){
  const p = peticion || {};
  if(!p.reportType) throw new Error('crearInforme necesita reportType');
  if(!p.marketplaceIds || !p.marketplaceIds.length) throw new Error('crearInforme necesita marketplaceIds');
  const cuerpo = {reportType: p.reportType, marketplaceIds: p.marketplaceIds};
  if(p.dataStartTime) cuerpo.dataStartTime = p.dataStartTime;
  if(p.dataEndTime)   cuerpo.dataEndTime   = p.dataEndTime;
  if(p.reportOptions) cuerpo.reportOptions = p.reportOptions;

  const r = await cliente.pedir({metodo:'POST', ruta:RUTA + '/reports',
                                 cuerpo, operacion:'createReport ' + p.reportType});
  const id = r.datos && r.datos.reportId;
  if(!id) throw new ErrorSpapi('createReport ha contestado sin reportId', {codigo:'SIN_REPORT_ID'});
  return id;
}

/* ── 2 · consultar su estado ──────────────────────────────────────────────── */
async function estadoInforme(cliente, reportId){
  const r = await cliente.pedir({ruta: RUTA + '/reports/' + encodeURIComponent(reportId),
                                 operacion:'getReport ' + reportId});
  if(!r.datos || !r.datos.processingStatus){
    throw new ErrorSpapi('getReport ha contestado sin processingStatus', {codigo:'SIN_ESTADO'});
  }
  return r.datos;
}

/* Espera hasta un estado terminal. Devuelve el informe; NO lanza por CANCELLED,
   porque no es un error. Sí lanza por FATAL, que sí lo es.

   El sondeo espera cada vez un poco más (hasta un tope) en vez de machacar
   `getReport`: su plan de uso son 2 peticiones por segundo, pero un informe de
   pedidos tarda minutos y sondearlo dos veces por segundo solo sirve para
   gastar la cuota de las demás operaciones. */
async function esperarInforme(cliente, reportId, opciones){
  const op = opciones || {};
  const dormir   = op.dormir || (ms=>new Promise(r=>setTimeout(r, ms)));
  const ahora    = op.ahora  || (()=>Date.now());
  const registro = op.registro || (()=>{});
  const esperaInicial = op.esperaInicial || 5000;
  const esperaMaxima  = op.esperaMaxima  || 60000;
  const limite = ahora() + (op.tiempoMaximoMs || 30 * 60 * 1000);

  let espera = esperaInicial, vueltas = 0;
  for(;;){
    const informe = await estadoInforme(cliente, reportId);
    vueltas++;
    if(TERMINALES.indexOf(informe.processingStatus) >= 0){
      if(informe.processingStatus === ESTADOS.FATAL){
        throw new ErrorSpapi('El informe ' + reportId + ' ha terminado en FATAL',
          {codigo:'INFORME_FATAL', reportId, informe, reintentable:false});
      }
      registro({evento:'informe', reportId, estado:informe.processingStatus, vueltas});
      return informe;
    }
    if(ahora() >= limite){
      /* Rendirse por tiempo NO es «no hay datos». El informe puede terminar más
         tarde: se devuelve su identificador para poder retomarlo, y quien llame
         tiene que tratarlo como un hueco, no como un cero. */
      throw new ErrorSpapi('El informe ' + reportId + ' sigue en ' +
        informe.processingStatus + ' tras ' + vueltas + ' comprobaciones',
        {codigo:'ESPERA_AGOTADA', reportId, informe, reintentable:false});
    }
    await dormir(espera);
    espera = Math.min(esperaMaxima, Math.round(espera * 1.5));
  }
}

/* ── 3 · la URL del documento, que dura cinco minutos ─────────────────────── */
async function documentoInforme(cliente, reportDocumentId, opciones){
  const op = opciones || {};
  const ahora = op.ahora || (()=>Date.now());
  const r = await cliente.pedir({ruta: RUTA + '/documents/' + encodeURIComponent(reportDocumentId),
                                 operacion:'getReportDocument ' + reportDocumentId});
  const d = r.datos || {};
  if(!d.url) throw new ErrorSpapi('getReportDocument ha contestado sin url', {codigo:'SIN_URL'});
  return {
    reportDocumentId: d.reportDocumentId || reportDocumentId,
    url: d.url,
    compresion: d.compressionAlgorithm || null,
    /* Se calcula y se guarda porque es lo que permite NO intentar una descarga
       que ya se sabe muerta. */
    caducaEn: ahora() + VIDA_URL_MS
  };
}

/* ── 4 · descargar ────────────────────────────────────────────────────────── */
/* La URL es prefirmada: se descarga SIN la cabecera de la ficha. Añadirla puede
   invalidar la firma, y además mandaría la credencial a un servidor de
   almacenamiento que no la necesita. */
async function descargarDocumento(documento, opciones){
  const op = opciones || {};
  const buscar = op.fetch || globalThis.fetch;
  const ahora  = op.ahora || (()=>Date.now());

  if(ahora() >= documento.caducaEn - MARGEN_URL_MS){
    throw new ErrorSpapi(
      'La URL del documento ' + documento.reportDocumentId + ' ha caducado (dura 5 minutos)',
      {codigo:'URL_CADUCADA', pedirUrlNueva:true, reintentable:false});
  }

  const r = await buscar(documento.url, {method:'GET'});
  if(!r.ok){
    /* Un 403 aquí es casi siempre «Request has expired» del almacenamiento. Se
       marca para pedir una URL nueva, no para reintentar la misma. */
    const caducada = r.status === 403 || r.status === 400;
    throw new ErrorSpapi(
      'La descarga del documento ' + documento.reportDocumentId + ' ha contestado ' + r.status,
      {codigo: caducada ? 'URL_CADUCADA' : 'DESCARGA_FALLIDA',
       estado: r.status, pedirUrlNueva: caducada, reintentable: !caducada && r.status >= 500});
  }

  const crudo = Buffer.from(await r.arrayBuffer());

  /* Un corte de conexión a mitad de descarga da un fichero MÁS CORTO, no un
     error: se leería como un informe con menos filas, y esas filas que faltan
     no se notan en ningún sitio. Si el servidor declara el tamaño, se comprueba. */
  const declarado = leerCabecera(r.headers, 'content-length');
  if(declarado != null && String(declarado).trim() !== ''){
    const n = Number(declarado);
    if(isFinite(n) && n >= 0 && n !== crudo.length){
      throw new ErrorSpapi('Descarga incompleta del documento ' + documento.reportDocumentId +
        ': el servidor declaraba ' + n + ' bytes y han llegado ' + crudo.length,
        {codigo:'DESCARGA_INCOMPLETA', declarado:n, recibido:crudo.length, reintentable:true});
    }
  }

  let bytes = crudo;
  if(documento.compresion === 'GZIP'){
    try{
      bytes = zlib.gunzipSync(crudo);
    }catch(e){
      /* gunzip falla con un GZIP cortado. Que falle es exactamente lo que
         queremos: un GZIP a medias descomprimido «como se pueda» daría un
         informe truncado con pinta de completo. */
      throw new ErrorSpapi('El documento ' + documento.reportDocumentId +
        ' venía en GZIP y no se ha podido descomprimir (¿descarga cortada?): ' + e.message,
        {codigo:'GZIP_ILEGIBLE', reintentable:true});
    }
  } else if(documento.compresion){
    throw new ErrorSpapi('Compresión desconocida «' + documento.compresion +
      '»; el enum oficial solo admite GZIP', {codigo:'COMPRESION_DESCONOCIDA'});
  }

  return {texto: decodificar(bytes), bytes: bytes.length, bytesComprimidos: crudo.length};
}

/* Amazon sirve sus TSV en UTF-8, en UTF-16 con marca de orden de bytes y en
   Latin-1 según el informe. Misma lógica que `readSmart` del hub: leerlos todos
   como UTF-8 deja un informe reconocido y vacío, que es el peor resultado
   posible. // COSTURA → carril 1: aquí se repite la detección de codificación
   de `readSmart` porque aquella vive en el navegador y recibe un File. Al
   integrar, una sola función que tome bytes. */
function decodificar(bytes){
  if(bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return quitarMarca(bytes.toString('utf16le'));
  if(bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF){
    const v = Buffer.from(bytes); v.swap16(); return quitarMarca(v.toString('utf16le'));
  }
  let texto = bytes.toString('utf8');
  if(texto.indexOf('�') >= 0) texto = bytes.toString('latin1');
  return quitarMarca(texto);
}
function quitarMarca(t){ return t.replace(/^﻿/, ''); }

function leerCabecera(cabeceras, nombre){
  if(!cabeceras) return null;
  if(typeof cabeceras.get === 'function') return cabeceras.get(nombre);
  return cabeceras[nombre] != null ? cabeceras[nombre] : cabeceras[nombre.toLowerCase()];
}

/* Pide la URL y descarga; si la URL ha caducado, pide OTRA URL. Reintentar la
   descarga contra una URL muerta es el bucle que no arregla nada. */
async function contenidoDelDocumento(cliente, reportDocumentId, opciones){
  const op = opciones || {};
  const intentos = op.intentosUrl || 3;
  let ultimo = null;
  for(let i = 1; i <= intentos; i++){
    const documento = await documentoInforme(cliente, reportDocumentId, op);
    try{
      const contenido = await descargarDocumento(documento, op);
      return Object.assign({compresion: documento.compresion}, contenido);
    }catch(e){
      ultimo = e;
      const repetible = e && (e.pedirUrlNueva === true || e.reintentable === true);
      if(!repetible || i === intentos) throw e;
      (op.registro || (()=>{}))({evento:'documento', accion:'pedir URL nueva',
                                 intento:i, motivo:e.codigo});
    }
  }
  throw ultimo;
}

/* ── 5 · listar informes ya existentes (liquidaciones) ────────────────────── */
/* Devuelve TODAS las páginas. Quedarse en la primera y decir «ya está» es el
   fallo que hace perder liquidaciones para siempre: solo se ven 90 días atrás. */
async function listarInformes(cliente, filtros, opciones){
  const f = filtros || {};
  const op = opciones || {};
  const maximoPaginas = op.maximoPaginas || 50;
  const informes = [];
  let nextToken = null, paginas = 0;

  do{
    const consulta = nextToken
      /* `nextToken` va SOLO: «Specifying nextToken with any other parameters
         will cause the request to fail». */
      ? {nextToken}
      : {reportTypes: f.reportTypes, processingStatuses: f.processingStatuses,
         marketplaceIds: f.marketplaceIds, createdSince: f.createdSince,
         createdUntil: f.createdUntil, pageSize: f.pageSize};
    const r = await cliente.pedir({ruta: RUTA + '/reports', consulta,
                                   operacion:'getReports' + (nextToken ? ' (página '+(paginas+1)+')' : '')});
    const datos = r.datos || {};
    (datos.reports || []).forEach(x=>informes.push(x));
    nextToken = datos.nextToken || null;
    paginas++;
    if(paginas >= maximoPaginas && nextToken){
      throw new ErrorSpapi('getReports sigue paginando tras ' + paginas +
        ' páginas; se para para no dar por completa una lista que no lo está',
        {codigo:'DEMASIADAS_PAGINAS', paginas, parcial:true});
    }
  } while(nextToken);

  return {informes, paginas};
}

/* ── 6 · el ciclo entero ──────────────────────────────────────────────────── */
/* Devuelve siempre un objeto con `estado`, nunca un texto suelto:
     LISTO     · hay documento y texto
     CANCELADO · Amazon lo canceló; NO se reintenta y NO se archiva nada
   y lanza en lo demás (FATAL, espera agotada, descarga incompleta…). */
async function cicloInforme(cliente, peticion, opciones){
  const op = opciones || {};
  const reportId = await crearInforme(cliente, peticion);
  const informe  = await esperarInforme(cliente, reportId, op);

  if(informe.processingStatus === ESTADOS.CANCELADO){
    return {estado:'CANCELADO', reportId, informe, motivo: MOTIVO_CANCELADO,
            reintentar:false, texto:null};
  }
  if(!informe.reportDocumentId){
    /* DONE sin documento no es «vacío»: es una respuesta que no entendemos.
       Tratarla como vacía archivaría un cero. */
    throw new ErrorSpapi('El informe ' + reportId + ' dice DONE pero no trae reportDocumentId',
      {codigo:'HECHO_SIN_DOCUMENTO', reportId, informe});
  }
  const contenido = await contenidoDelDocumento(cliente, informe.reportDocumentId, op);
  return Object.assign({estado:'LISTO', reportId, informe}, contenido);
}

module.exports = {
  ESTADOS, TERMINALES, RUTA, VIDA_URL_MS, MARGEN_URL_MS, MOTIVO_CANCELADO,
  crearInforme, estadoInforme, esperarInforme, documentoInforme,
  descargarDocumento, contenidoDelDocumento, listarInformes, cicloInforme,
  decodificar
};
