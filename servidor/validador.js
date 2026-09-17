'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   servidor/validador.js · ¿las columnas que manda la API son las que el hub lee?

   POR QUÉ EXISTE. Lo dice Amazon, no nosotros. Preguntas frecuentes de la API
   de informes, consultadas el 17 de septiembre de 2026
   (https://developer-docs.amazon.com/sp-api/docs/reports-faq):

     «No. Seller Central provides additional reports that you can't access using
      the Reports API. Additionally, some reports can be similar but do not
      contain the same attributes or data.»

   Y en la guía de la API de informes:

     «Amazon periodically adds new fields and field values to reports, and the
      format and structure of document identifiers may change. Ensure that any
      report parsers that you build into your applications can handle these types
      of updates.»

   Traducido a lo que le pasaría al hub: el mismo informe, servido por API, puede
   traer otras columnas. El importador resuelve por alias, y lo que no casa se
   queda sin mapear. Un campo sin mapear no da error: da CERO. Ceros con pinta de
   medidos, que es la avería más cara de este proyecto.

   Este validador compara las cabeceras REALES recibidas con los alias declarados
   en `REPORTS` (src/12-datos.js) y DECLARA qué no casa, antes de guardar nada.

   Lee `src/12-datos.js` en vez de duplicar los alias a propósito: dos copias de
   la misma tabla se separan, y la que se queda vieja es siempre la del
   servidor. // COSTURA → carril 1: `REPORTS` vive en un fichero de navegador sin
   exportaciones. Aquí se extrae el literal del array y se evalúa aislado. Al
   integrar, lo natural es que `12-datos.js` exporte `REPORTS` cuando corre en
   Node, y entonces esta extracción sobra.
   ═══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RUTA_DATOS = path.resolve(__dirname, '..', 'src', '12-datos.js');

/* Las mismas dos funciones del hub, copiadas al pie de la letra: si aquí se
   normalizara distinto, el validador diría que casa lo que al importador no le
   casa, que es peor que no validar. */
function plegar(s){
  return String(s||'').toLowerCase()
    .replace(/[áàâäã]/g,'a').replace(/[éèêë]/g,'e').replace(/[íìîï]/g,'i')
    .replace(/[óòôöõ]/g,'o').replace(/[úùûü]/g,'u')
    .replace(/ñ/g,'n').replace(/ç/g,'c');
}
function normalizar(h){ return plegar(h).replace(/^﻿/,'').replace(/[^a-z0-9]/g,''); }

/* ── Extraer REPORTS del fichero del hub ──────────────────────────────────── */
let _cache = null;
function definicionesDelHub(ruta){
  const fichero = ruta || RUTA_DATOS;
  if(_cache && _cache.fichero === fichero) return _cache.reports;
  const fuente = fs.readFileSync(fichero, 'utf8');
  const inicio = fuente.indexOf('const REPORTS = [');
  if(inicio < 0) throw new Error('No encuentro `const REPORTS = [` en ' + fichero);
  const corchete = fuente.indexOf('[', inicio);
  const fin = fuente.indexOf('\n];', corchete);
  if(fin < 0) throw new Error('No encuentro el cierre de REPORTS en ' + fichero);
  const literal = fuente.slice(corchete, fin + 2);

  let reports;
  try{
    reports = vm.runInNewContext('(' + literal + ')', Object.create(null), {timeout:2000});
  }catch(e){
    throw new Error('No he podido leer REPORTS de ' + fichero + ': ' + e.message);
  }
  /* Si la extracción se rompiera (porque alguien reordene el fichero), lo que
     NO puede pasar es que devuelva media tabla y el validador dé por buenas
     unas cabeceras que nunca ha comparado. */
  if(!Array.isArray(reports) || reports.length < 10){
    throw new Error('REPORTS extraído de ' + fichero + ' tiene ' +
      (Array.isArray(reports) ? reports.length : 'algo que no es un array') +
      ' entradas; esperaba doce informes');
  }
  _cache = {fichero, reports};
  return reports;
}
function definicion(idHub, ruta){
  const d = definicionesDelHub(ruta).filter(r=>r.id===idHub)[0];
  if(!d) throw new Error('El hub no define ningún informe con id «'+idHub+'»');
  return d;
}

/* ── Qué se pierde si falta cada campo opcional ───────────────────────────────
   Un campo obligatorio que falta rompe la importación y se ve. Un opcional que
   falta NO se ve: se cae a un valor por defecto. Estas tres líneas son averías
   que ya han pasado en este proyecto, y por eso el aviso dice qué se pierde. */
const CONSECUENCIAS = {
  'orders._tax':  'el IVA de cada pedido se leería como 0 y el margen saldría alto',
  'orders._cur':  'no se sabría en qué divisa está el importe; mezclaría libras con euros',
  'fees._store':  'las tarifas de nueve tiendas se pisarían entre sí por SKU',
  'fees._cur':    'podrían aplicarse tarifas en otra divisa a ventas españolas',
  'fees._fba':    'la tarifa de logística quedaría sin leer y el coste por unidad saldría bajo',
  'vat._rate':    'no se detectaría el tipo reducido',
  'returns._qty': 'las unidades devueltas contarían como una por línea'
};

/* ── El validador ─────────────────────────────────────────────────────────── */
/* Compara SOLO por alias de cabecera, a propósito. El importador tiene una
   segunda pasada que resuelve campos obligatorios por el TIPO del contenido;
   esa pasada es la que un día metió `sales-price` donde iba la tarifa de
   logística. Para decidir si un informe de la API se puede leer, la pregunta es
   si sus cabeceras casan, no si hay alguna columna con números parecidos. */
function validarCabeceras(idHub, cabeceras, opciones){
  const op = opciones || {};
  const def = op.definicion || definicion(idHub, op.rutaDatos);
  const campos = def.fields || {};
  const nombres = Object.keys(campos);

  const normalizadas = (cabeceras||[]).map(h=>({cruda:h, norma:normalizar(h)}))
                                      .filter(x=>x.norma !== '');
  const usadas = {};
  const mapa = {}, faltanObligatorios = [], faltanOpcionales = [];

  nombres.forEach(campo=>{
    const d = campos[campo];
    let encontrada = null;
    for(const rx of (d.alias||[])){
      for(const h of normalizadas){
        if(usadas[h.norma]) continue;
        if(rx.test(h.norma)){ encontrada = h; break; }
      }
      if(encontrada) break;
    }
    if(encontrada){ mapa[campo] = encontrada.cruda; usadas[encontrada.norma] = campo; }
    else if(d.req) faltanObligatorios.push(detalleFalta(idHub, campo, d));
    else faltanOpcionales.push(detalleFalta(idHub, campo, d));
  });

  const sinUsar = normalizadas.filter(h=>!usadas[h.norma]).map(h=>h.cruda);

  const diag = {
    informe: idHub,
    etiqueta: def.label || idHub,
    ok: faltanObligatorios.length === 0 && nombres.length > 0,
    sinCamposDeclarados: nombres.length === 0,
    cabecerasRecibidas: normalizadas.length,
    mapa, faltanObligatorios, faltanOpcionales,
    cabecerasSinUsar: sinUsar
  };
  diag.mensaje = redactar(diag);
  return diag;
}

function detalleFalta(idHub, campo, d){
  return {
    campo,
    obligatorio: !!d.req,
    alias: (d.alias||[]).map(r=>String(r)),
    consecuencia: CONSECUENCIAS[idHub + '.' + campo] || null
  };
}

function redactar(d){
  if(d.sinCamposDeclarados){
    return 'El informe «'+d.informe+'» no declara campos en REPORTS: el hub lo guarda entero ' +
           'sin leer columnas, así que aquí no hay nada que validar.';
  }
  const partes = [];
  if(d.faltanObligatorios.length){
    partes.push('FALTAN ' + d.faltanObligatorios.length + ' columnas OBLIGATORIAS en «'+d.etiqueta+'»: ' +
      d.faltanObligatorios.map(f=>f.campo).join(', ') +
      '. El informe NO se puede leer: importarlo daría filas vacías con pinta de importadas.');
  }
  if(d.faltanOpcionales.length){
    partes.push('No casan ' + d.faltanOpcionales.length + ' columnas opcionales: ' +
      d.faltanOpcionales.map(f=>f.campo + (f.consecuencia ? ' ('+f.consecuencia+')' : '')).join('; ') + '.');
  }
  if(d.cabecerasSinUsar.length){
    partes.push(d.cabecerasSinUsar.length + ' cabeceras recibidas que el hub no usa' +
      (d.cabecerasSinUsar.length <= 8 ? ': ' + d.cabecerasSinUsar.join(', ') : '') + '.');
  }
  if(!partes.length) return 'Todas las columnas declaradas para «'+d.etiqueta+'» casan con las recibidas.';
  return partes.join(' ');
}

/* ── Sacar la cabecera de un informe recibido ─────────────────────────────────
   Los informes de Publicidad traen líneas de título antes de la cabecera; se
   toma como cabecera la primera fila con tres celdas no vacías, igual que
   `parseDelimited`. Aquí no hace falta el intérprete de comillas completo:
   solo se necesitan los NOMBRES de las columnas. */
function cabecerasDelTexto(texto){
  const lineas = String(texto||'').split(/\r?\n/);
  for(let i=0; i<Math.min(6, lineas.length); i++){
    const l = lineas[i];
    if(!l || !l.trim()) continue;
    const tabs = (l.match(/\t/g)||[]).length,
          comas = (l.match(/,/g)||[]).length,
          puntos = (l.match(/;/g)||[]).length;
    const sep = tabs >= Math.max(comas, puntos) && tabs > 0 ? '\t' : (puntos > comas ? ';' : ',');
    const celdas = l.split(sep).map(c=>c.trim().replace(/^"|"$/g,''));
    if(celdas.filter(c=>c!=='').length >= 3) return {cabeceras:celdas, separador:sep, linea:i};
  }
  return {cabeceras:[], separador:null, linea:-1};
}

/* Cuenta las filas de datos, que no es lo mismo que «tiene datos». Se devuelve
   aparte para que quien archive pueda decidir: cero filas puede ser un mes sin
   devoluciones o una descarga cortada, y el que archiva tiene que saber cuál. */
function contarFilas(texto, lineaCabecera){
  const lineas = String(texto||'').split(/\r?\n/);
  let n = 0;
  for(let i = (lineaCabecera||0) + 1; i < lineas.length; i++){
    if(lineas[i] && lineas[i].trim() !== '') n++;
  }
  return n;
}

function validarTexto(idHub, texto, opciones){
  const c = cabecerasDelTexto(texto);
  const diag = validarCabeceras(idHub, c.cabeceras, opciones);
  diag.separador = c.separador;
  diag.filas = contarFilas(texto, c.linea);
  return diag;
}

module.exports = {
  definicionesDelHub, definicion, validarCabeceras, validarTexto,
  cabecerasDelTexto, contarFilas, normalizar, CONSECUENCIAS, RUTA_DATOS
};
