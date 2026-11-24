#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   Almacén · el mismo contrato para el adaptador de memoria y el de Supabase

   SIN RED. El Supabase de esta suite es un PostgREST SIMULADO que entiende solo
   las peticiones que hace `almacen-supabase.js`. Prueba dos cosas:
     1 · que los dos adaptadores cumplen la misma batería de contrato;
     2 · que el de Supabase manda las peticiones que debe (upsert por clave,
         filtro de mercado con `cs.`, la clave nunca en un mensaje de error).
   NO prueba el Supabase real. Eso queda dicho en el propio adaptador.

   Las comprobaciones que persiguen un fallo concreto se han visto rojas sin su
   arreglo; la lista está al final de este fichero.
   ═══════════════════════════════════════════════════════════════════════════ */

const path = require('path');
const { AlmacenMemoria, comprobarAlmacen } = require(path.resolve(__dirname, '..', 'servidor', 'almacen'));
const { AlmacenSupabase } = require(path.resolve(__dirname, '..', 'servidor', 'almacen-supabase'));

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};

/* ── PostgREST de mentira ─────────────────────────────────────────────────── */
function postgrestFalso(){
  const tablas = {amz_documentos:[], amz_ingestas:[]};
  let id = 0;
  const peticiones = [];
  const resp = (estado, cuerpo) => ({ok: estado>=200 && estado<300, status: estado,
                                     text: async () => cuerpo === undefined ? '' : JSON.stringify(cuerpo)});
  async function fetch(url, op){
    peticiones.push({url, op});
    if(op.headers.apikey !== 'clave-servicio') return resp(401, {message:'Invalid API key'});
    const u = new URL(url);
    const tabla = u.pathname.replace('/rest/v1/','');
    if(!tablas[tabla]) return resp(404, {message:'tabla no existe'});
    const p = u.searchParams;
    if(op.method === 'POST'){
      const filas = JSON.parse(op.body);
      for(const f of filas){
        if(tabla === 'amz_documentos'){
          const i = tablas.amz_documentos.findIndex(x=>x.clave===f.clave);
          if(i >= 0){
            if(!String(op.headers.Prefer||'').includes('merge-duplicates'))
              return resp(409, {message:'duplicate key'});
            tablas.amz_documentos[i] = f;
          } else tablas.amz_documentos.push(f);
        } else {
          tablas.amz_ingestas.push(Object.assign({id: ++id}, f));
        }
      }
      return resp(201);
    }
    let filas = tablas[tabla].slice();
    for(const [k, v] of p.entries()){
      if(['select','order','limit','on_conflict'].includes(k)) continue;
      const [opr, ...resto] = v.split('.'); const val = resto.join('.');
      filas = filas.filter(f=>{
        if(opr === 'eq')  return String(f[k]) === val;
        if(opr === 'gte') return String(f[k]) >= val;
        if(opr === 'lte') return String(f[k]) <= val;
        if(opr === 'cs')  return val.replace(/[{}]/g,'').split(',').every(m=>(f[k]||[]).includes(m));
        throw new Error('operador no simulado: ' + opr);
      });
    }
    if(p.get('order')) filas.sort((a,b)=>String(a.cuando).localeCompare(String(b.cuando)) || a.id-b.id);
    if(p.get('limit')) filas = filas.slice(0, +p.get('limit'));
    const cols = (p.get('select')||'*').split(',');
    return resp(200, filas.map(f=> cols[0]==='*' ? f : Object.fromEntries(cols.map(c=>[c, f[c]]))));
  }
  return {fetch, tablas, peticiones};
}

/* ── El contrato, igual para los dos ─────────────────────────────────────── */
async function contrato(nombre, a){
  const t = s => nombre + ' · ' + s;
  comprobarAlmacen(a);
  check(t('tiene los seis métodos'), true);

  const g = await a.guardarDocumento({clave:'x/1.txt', texto:'cabecera\nfila ñ', meta:{idHub:'orders'}});
  check(t('guardar devuelve bytes UTF-8 reales (ñ son dos)'), g.bytes === 16, g.bytes);
  check(t('guardar devuelve la huella sha256'), /^[0-9a-f]{64}$/.test(g.huella));
  check(t('el documento existe'), await a.existeDocumento('x/1.txt') === true);
  check(t('uno que no se guardó no existe'), await a.existeDocumento('x/2.txt') === false);
  const l = await a.leerDocumento('x/1.txt');
  check(t('se lee el mismo texto y la meta'), l && l.texto === 'cabecera\nfila ñ' && l.meta.idHub === 'orders');
  check(t('leer uno inexistente da null'), await a.leerDocumento('nada') === null);

  /* Volver a guardar la misma clave sustituye, no duplica ni falla: es lo que
     hace el de memoria y lo que necesita una ingesta que se repite. */
  await a.guardarDocumento({clave:'x/1.txt', texto:'nuevo'});
  const l2 = await a.leerDocumento('x/1.txt');
  check(t('guardar otra vez la misma clave sustituye el texto'), l2 && l2.texto === 'nuevo', l2 && l2.texto);

  await a.anotarIngesta({idHub:'orders', estado:'ARCHIVADO', cuando:'2026-11-01T10:00:00.000Z', mercados:['ES','FR'], clave:'x/1.txt'});
  await a.anotarIngesta({idHub:'orders', estado:'ARCHIVADO', cuando:'2026-11-03T10:00:00.000Z', mercados:['IT']});
  await a.anotarIngesta({idHub:'settlement', estado:'RECHAZADO', cuando:'2026-11-02T10:00:00.000Z', mercados:['ES']});

  check(t('filtrar por informe'), (await a.ingestas({idHub:'orders'})).length === 2);
  check(t('filtrar por estado'), (await a.ingestas({estado:'RECHAZADO'})).length === 1);
  check(t('filtrar por mercado'), (await a.ingestas({mercado:'ES'})).length === 2);
  check(t('filtrar por desde/hasta'),
    (await a.ingestas({desde:'2026-11-02T00:00:00.000Z', hasta:'2026-11-02T23:59:59.000Z'})).length === 1);
  const u = await a.ultimaIngesta({idHub:'orders'});
  check(t('la última es la de fecha más reciente'), u && u.cuando === '2026-11-03T10:00:00.000Z', u && u.cuando);
  check(t('el registro vuelve con su cuando tal cual se anotó'), u && typeof u.cuando === 'string' && u.mercados[0] === 'IT');
  check(t('sin coincidencias, la última es null'), await a.ultimaIngesta({idHub:'nada'}) === null);
}

(async () => {
  console.log('Contrato · memoria');
  await contrato('memoria', new AlmacenMemoria());

  console.log('Contrato · Supabase (simulado)');
  const pg = postgrestFalso();
  await contrato('supabase', new AlmacenSupabase({url:'https://hub.supabase.co/', clave:'clave-servicio', fetch:pg.fetch}));

  console.log('Supabase · peticiones y errores');
  {
    const doc = pg.peticiones.find(x=>x.op.method==='POST' && x.url.includes('/amz_documentos'));
    check('guardar es un upsert por clave (on_conflict + merge-duplicates)',
      doc && doc.url.includes('on_conflict=clave') && /merge-duplicates/.test(doc.op.headers.Prefer));
    check('la URL base sin barra final no duplica la barra',
      pg.peticiones.every(x=>!x.url.includes('.co//')));
    check('apikey y Authorization llevan la clave', pg.peticiones.every(x=>
      x.op.headers.apikey === 'clave-servicio' && x.op.headers.Authorization === 'Bearer clave-servicio'));
  }
  {
    let e = null;
    try { new AlmacenSupabase({url:'', clave:'', fetch:()=>{}}); } catch(x){ e = x; }
    check('sin URL ni clave no arranca, y dice cuáles faltan',
      e && e.codigo === 'ALMACEN_SIN_CONFIG' && e.faltan.length === 2, e && e.message);
  }
  {
    /* Una clave equivocada (p. ej. la pública) tiene que fallar al arrancar,
       y el error no puede llevar la clave dentro. */
    const pg2 = postgrestFalso();
    const a = new AlmacenSupabase({url:'https://hub.supabase.co', clave:'clave-publica-SECRETA', fetch:pg2.fetch});
    let e = null;
    try { await a.comprobarConexion(); } catch(x){ e = x; }
    check('con una clave que no es la de servicio, comprobarConexion falla', e && e.estado === 401, e && e.message);
    check('el mensaje de error no contiene la clave', e && !e.message.includes('SECRETA'), e && e.message);
  }
  {
    const a = new AlmacenSupabase({url:'https://hub.supabase.co', clave:'clave-servicio', fetch:postgrestFalso().fetch});
    let e = null;
    try { await a.anotarIngesta({estado:'ARCHIVADO'}); } catch(x){ e = x; }
    check('una ingesta sin idHub se rechaza antes de mandarla', e && /idHub/.test(e.message));
  }

  console.log('\n' + (fails ? '✗ ' + fails + ' FALLO(S)' : '✓ todo correcto'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  FALLO excepción no capturada  → ' + (e && e.stack || e)); process.exit(1); });

/* Vistas rojas sin su arreglo (24-nov):
   · sin `resolution=merge-duplicates` → «guardar otra vez la misma clave
     sustituye el texto» FALLO (409 duplicate key).
   · sin `.replace(/\/+$/,'')` en la URL → «la URL base sin barra final…» FALLO.
   · con el texto de la respuesta 401 incluyendo la cabecera → no aplica: el
     simulador no devuelve la clave; el arreglo es no escribir cabeceras en el
     error, y se comprueba que el mensaje no la lleva. */
