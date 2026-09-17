'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   servidor/ingesta.js · la orquestación, y las tres formas de archivar mentiras

   Esta es la parte del carril que decide qué se guarda y qué NO se guarda. La
   revisión adversarial de la que sale este fichero preguntaba: ¿qué respuesta de
   Amazon haría que el hub archivara datos incompletos creyendo que están
   completos? Tres respuestas, y cada una tiene aquí su freno:

   1 · CANCELLED leído como «no hay datos». Sería un cero archivado como medida.
       Freno: estado propio `CANCELADO`, sin documento y sin cobertura. Y para
       los informes de una vez al día, no se vuelve a pedir en el mismo día:
       el segundo intento no da error, vuelve CANCELLED, y ese CANCELLED es
       indistinguible de «no hay ventas».

   2 · Un informe con las columnas cambiadas. Amazon avisa de que los informes
       de la API «do not contain the same attributes or data». Sin validar, el
       importador no encuentra el alias, deja el campo sin mapear y calcula con
       ceros. Freno: se valida ANTES de darlo por archivado, y si faltan
       columnas obligatorias el estado es `RECHAZADO_COLUMNAS`.

   3 · Cero filas dadas por buenas. Un informe con cabecera y ninguna fila puede
       ser un mes sin devoluciones o una descarga cortada. Freno: estado propio
       `ARCHIVADO_SIN_FILAS`, que no cuenta como periodo cubierto.

   Y la cuarta, la cara: las liquidaciones. Solo se ven 90 días atrás. Lo que no
   se archive dentro de esa ventana no se recupera de ninguna manera. Por eso
   `archivarLiquidaciones` recorre TODAS las páginas, nunca dice «completo» si
   una descarga ha fallado, y avisa por escrito de los días de hueco.
   ═══════════════════════════════════════════════════════════════════════════ */

const { cicloInforme, listarInformes, contenidoDelDocumento, ESTADOS } = require('./informes');
const { comprobarNoRestringido, entrada, VIA } = require('./catalogo');
const { comprobarAlmacen } = require('./almacen');
const { validarTexto } = require('./validador');

const DIA_MS = 24 * 60 * 60 * 1000;

const ESTADO = {
  ARCHIVADO:            'ARCHIVADO',
  ARCHIVADO_SIN_FILAS:  'ARCHIVADO_SIN_FILAS',
  CANCELADO:            'CANCELADO',
  RECHAZADO_COLUMNAS:   'RECHAZADO_COLUMNAS',
  OMITIDO_LIMITE_DIARIO:'OMITIDO_LIMITE_DIARIO',
  FALLIDO:              'FALLIDO'
};

const iso = t => new Date(t).toISOString();
const dia = t => iso(t).slice(0,10);

/* ── Un informe, de principio a fin ───────────────────────────────────────── */
async function ingerirInforme(opciones){
  const op = opciones || {};
  const {cliente, almacen, idHub} = op;
  const ahora = op.ahora || (()=>Date.now());
  const registroLog = op.registro || (()=>{});
  if(!cliente) throw new Error('ingerirInforme necesita un cliente');
  comprobarAlmacen(almacen);

  const def = comprobarNoRestringido(idHub);   // lanza si es restringido (PII)
  if(def.via === VIA.LISTAR){
    const e = new Error('«'+idHub+'» no se pide: Amazon lo programa él. Usa archivarLiquidaciones().');
    e.codigo = 'NO_SE_PIDE';
    throw e;
  }
  if(def.via === VIA.MANUAL){
    const e = new Error('«'+idHub+'» no se automatiza: ' + (def.porQueManual||''));
    e.codigo = 'NO_AUTOMATIZABLE';
    throw e;
  }

  const mercados = op.marketplaceIds || [];
  if(!mercados.length) throw new Error('ingerirInforme necesita marketplaceIds');

  /* 1 · el límite de una vez al día, ANTES de gastarlo ───────────────────────
     Pedir dos veces el mismo día no da error: da CANCELLED. Si se deja pasar, la
     segunda ingesta del día archiva «sin datos» sobre un informe que sí los
     tiene. Cuenta cualquier intento que llegara a pedir el informe, salga como
     salga: la cuota se gasta al pedirlo, no al descargarlo. */
  if(def.unaVezAlDia){
    const hoy = dia(ahora());
    const previas = await almacen.ingestas({idHub});
    const yaHoy = (previas||[]).filter(r=>r.pidioInforme && dia(r.cuando) === hoy);
    if(yaHoy.length){
      const r = await almacen.anotarIngesta({
        idHub, tipo:def.tipo, mercados, estado:ESTADO.OMITIDO_LIMITE_DIARIO,
        cuando: iso(ahora()), pidioInforme:false,
        motivo:'«'+idHub+'» solo se puede pedir una vez al día por vendedor; ya se pidió hoy a las ' +
               String(yaHoy[yaHoy.length-1].cuando).slice(11,16) + '. Pedirlo otra vez volvería ' +
               'CANCELLED y ese CANCELLED no se distingue de «no hay datos».'
      });
      registroLog({evento:'ingesta', idHub, estado:r.estado});
      return r;
    }
  }

  /* 2 · la ventana de fechas ────────────────────────────────────────────────
     Para las tarifas, Amazon exige `dataStartTime` a 72 horas o más: pedirlo
     más cerca no genera informe. */
  const hasta = op.dataEndTime ? new Date(op.dataEndTime).getTime() : ahora();
  let desde = op.dataStartTime ? new Date(op.dataStartTime).getTime()
                               : hasta - (def.ventanaDias || op.ventanaDias || 30) * DIA_MS;
  if(def.horasMinimasAtras){
    const tope = ahora() - def.horasMinimasAtras * 60 * 60 * 1000;
    if(desde > tope) desde = tope;
  }

  const peticion = {reportType: def.tipo, marketplaceIds: mercados,
                    dataStartTime: iso(desde), dataEndTime: iso(hasta)};
  if(op.reportOptions) peticion.reportOptions = op.reportOptions;

  let resultado;
  try{
    resultado = await cicloInforme(cliente, peticion, op);
  }catch(e){
    const r = await almacen.anotarIngesta({
      idHub, tipo:def.tipo, mercados, estado:ESTADO.FALLIDO, cuando: iso(ahora()),
      pidioInforme:true, motivo:e.message, codigo:e.codigo || null});
    registroLog({evento:'ingesta', idHub, estado:r.estado, motivo:e.codigo});
    r.error = e;
    return r;
  }

  /* 3 · CANCELLED: ni error, ni dato ─────────────────────────────────────── */
  if(resultado.estado === 'CANCELADO'){
    const r = await almacen.anotarIngesta({
      idHub, tipo:def.tipo, mercados, estado:ESTADO.CANCELADO, cuando: iso(ahora()),
      pidioInforme:true, reportId: resultado.reportId, reintentar:false,
      motivo: resultado.motivo});
    registroLog({evento:'ingesta', idHub, estado:r.estado});
    return r;
  }

  /* 4 · validar las columnas antes de dar nada por bueno ─────────────────── */
  const diagnostico = validarTexto(idHub, resultado.texto, {rutaDatos: op.rutaDatos});
  const clave = 'spapi/' + idHub + '/' + iso(ahora()).replace(/[:.]/g,'-') + '.txt';

  if(!diagnostico.ok && !diagnostico.sinCamposDeclarados){
    /* Se guarda igualmente, pero marcado y fuera del camino del hub: hace falta
       para poder mirar QUÉ columnas mandó Amazon. Lo que no se hace es dejar que
       lo lea el importador. */
    const guardado = await almacen.guardarDocumento({
      clave: 'rechazado/' + clave, texto: resultado.texto,
      meta:{idHub, tipo:def.tipo, mercados, rechazado:true, diagnostico}});
    const r = await almacen.anotarIngesta({
      idHub, tipo:def.tipo, mercados, estado:ESTADO.RECHAZADO_COLUMNAS,
      cuando: iso(ahora()), pidioInforme:true, reportId: resultado.reportId,
      clave: guardado.clave, huella: guardado.huella, bytes: guardado.bytes,
      filas: diagnostico.filas, diagnostico, motivo: diagnostico.mensaje});
    registroLog({evento:'ingesta', idHub, estado:r.estado, motivo:diagnostico.mensaje});
    return r;
  }

  const guardado = await almacen.guardarDocumento({
    clave, texto: resultado.texto,
    meta:{idHub, tipo:def.tipo, mercados, reportId:resultado.reportId,
          compresion:resultado.compresion || null, diagnostico}});

  const r = await almacen.anotarIngesta({
    idHub, tipo:def.tipo, mercados,
    estado: diagnostico.filas > 0 ? ESTADO.ARCHIVADO : ESTADO.ARCHIVADO_SIN_FILAS,
    cuando: iso(ahora()), pidioInforme:true, reportId: resultado.reportId,
    clave: guardado.clave, huella: guardado.huella, bytes: guardado.bytes,
    filas: diagnostico.filas, diagnostico,
    ventana:{desde: iso(desde), hasta: iso(hasta)},
    motivo: diagnostico.filas > 0 ? null :
      'Cabeceras correctas y CERO filas. Puede ser un periodo sin movimiento o una ' +
      'descarga cortada, y desde aquí no se distingue: no cuenta como periodo cubierto.'});
  registroLog({evento:'ingesta', idHub, estado:r.estado, filas:r.filas});
  return r;
}

/* ── Las liquidaciones: listar y archivar, contrarreloj ───────────────────── */
/* No se piden. Se listan con getReports y se archivan. La ventana de retención
   son 90 días; lo que caiga fuera no existe. Esta función NUNCA dice que ha
   cubierto la ventana si algo ha fallado por el camino. */
async function archivarLiquidaciones(opciones){
  const op = opciones || {};
  const {cliente, almacen} = op;
  const ahora = op.ahora || (()=>Date.now());
  const registroLog = op.registro || (()=>{});
  comprobarAlmacen(almacen);
  const def = entrada('settlement');

  const retencion = def.ventanaRetencionDias || 90;
  const hasta = op.createdUntil ? new Date(op.createdUntil).getTime() : ahora();
  /* Siempre la ventana ENTERA, no «desde la última vez». Un informe puede
     aparecer en la lista más tarde de lo que se creó, y arrancar en la fecha del
     último archivo lo dejaría fuera para siempre. Listar de más cuesta una
     llamada; listar de menos cuesta un mes de liquidaciones. */
  const desde = hasta - retencion * DIA_MS;

  const previas = await almacen.ingestas({idHub:'settlement'});
  const archivadasAntes = new Set((previas||[])
    .filter(r=>r.estado === ESTADO.ARCHIVADO || r.estado === ESTADO.ARCHIVADO_SIN_FILAS)
    .map(r=>r.reportId));
  const ultimaAntes = (previas||[])
    .filter(r=>r.estado === ESTADO.ARCHIVADO || r.estado === ESTADO.ARCHIVADO_SIN_FILAS)
    .map(r=>r.cuando).sort().pop() || null;

  const resumen = {
    ventana:{desde: iso(desde), hasta: iso(hasta)},
    encontradas:0, archivadas:[], yaEstaban:[], fallidas:[], paginas:0,
    completo:false, perdidoParaSiempre:false, diasSinArchivar:null, aviso:null
  };

  /* Si la última vez que se archivó fue hace más de 90 días, hay liquidaciones
     que YA NO SE PUEDEN RECUPERAR. Se dice antes de nada, porque es lo único de
     este carril que no admite arreglo posterior. */
  if(ultimaAntes){
    const dias = Math.floor((ahora() - new Date(ultimaAntes).getTime()) / DIA_MS);
    resumen.diasSinArchivar = dias;
    if(dias > retencion){
      resumen.perdidoParaSiempre = true;
      resumen.aviso = 'Han pasado ' + dias + ' días desde el último archivo y la ventana de ' +
        'retención son ' + retencion + '. Las liquidaciones de ese hueco ya no están en Amazon ' +
        'y no hay forma de recuperarlas por API.';
    }
  }

  let lista;
  try{
    lista = await listarInformes(cliente, {
      reportTypes:[def.tipo],
      processingStatuses:[ESTADOS.HECHO],
      marketplaceIds: op.marketplaceIds,
      createdSince: iso(desde), createdUntil: iso(hasta),
      pageSize: op.pageSize || 100
    }, op);
  }catch(e){
    resumen.error = e.message;
    resumen.codigo = e.codigo || null;
    resumen.completo = false;
    registroLog({evento:'liquidaciones', estado:'listado fallido', motivo:e.codigo});
    return resumen;
  }
  resumen.paginas = lista.paginas;
  resumen.encontradas = lista.informes.length;

  for(const informe of lista.informes){
    if(archivadasAntes.has(informe.reportId)){ resumen.yaEstaban.push(informe.reportId); continue; }
    if(!informe.reportDocumentId){
      resumen.fallidas.push({reportId:informe.reportId, motivo:'DONE sin reportDocumentId'});
      continue;
    }
    try{
      const contenido = await contenidoDelDocumento(cliente, informe.reportDocumentId, op);
      const diag = validarTexto('settlement', contenido.texto, {rutaDatos: op.rutaDatos});
      const clave = 'spapi/settlement/' + informe.reportId + '.txt';
      const guardado = await almacen.guardarDocumento({
        clave, texto: contenido.texto,
        meta:{idHub:'settlement', tipo:def.tipo, reportId:informe.reportId,
              createdTime:informe.createdTime, dataEndTime:informe.dataEndTime}});
      const r = await almacen.anotarIngesta({
        idHub:'settlement', tipo:def.tipo, mercados: informe.marketplaceIds || op.marketplaceIds || [],
        estado: diag.filas > 0 ? ESTADO.ARCHIVADO : ESTADO.ARCHIVADO_SIN_FILAS,
        cuando: iso(ahora()), pidioInforme:false, reportId: informe.reportId,
        clave: guardado.clave, huella: guardado.huella, bytes: guardado.bytes,
        filas: diag.filas, createdTime: informe.createdTime});
      resumen.archivadas.push(r);
    }catch(e){
      resumen.fallidas.push({reportId:informe.reportId, motivo:e.message, codigo:e.codigo||null});
      await almacen.anotarIngesta({
        idHub:'settlement', tipo:def.tipo, estado:ESTADO.FALLIDO, cuando: iso(ahora()),
        pidioInforme:false, reportId: informe.reportId, motivo:e.message});
    }
  }

  /* «Completo» significa una cosa muy concreta: se han recorrido todas las
     páginas y no ha fallado ni una descarga. Con una sola fallida, NO está
     completo, por muchas que se hayan archivado. */
  resumen.completo = resumen.fallidas.length === 0 && !resumen.perdidoParaSiempre;
  registroLog({evento:'liquidaciones', archivadas:resumen.archivadas.length,
               fallidas:resumen.fallidas.length, completo:resumen.completo});
  return resumen;
}

module.exports = { ingerirInforme, archivarLiquidaciones, ESTADO, DIA_MS };
