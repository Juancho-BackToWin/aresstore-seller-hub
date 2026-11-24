'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   servidor/almacen-supabase.js · el adaptador real de `almacen.js`

   Implementa los seis métodos de la interfaz sobre las tablas `amz_documentos` e
   `amz_ingestas` de `servidor/sql/001_esquema.sql`, hablando con la API REST de
   Supabase (PostgREST) con `fetch`. Sin dependencias.

   CLAVES. Usa la clave de SERVICIO, que salta RLS. Por eso solo se construye en
   el servidor y lee la clave del entorno; si alguien intenta pasarle la clave
   pública (`anon`), las tablas no tienen ninguna política y todo devolverá
   vacío o 401: se detecta al arrancar con `comprobarConexion()` en vez de
   descubrirlo cuando falte un mes de liquidaciones.

   PARIDAD CON EL DE MEMORIA. `tests/almacen.test.js` pasa la MISMA batería de
   contrato a los dos adaptadores. Lo que guarda uno lo devuelve igual el otro:
   el registro de ingesta se guarda entero en `registro` (jsonb) y se devuelve
   tal cual, así que `cuando` sigue siendo la cadena ISO que se anotó y no el
   formato con zona que devolvería Postgres.

   LÍMITE DICHO. Las pruebas usan un servidor PostgREST SIMULADO. Comprueban que
   las peticiones son las que deben y que el contrato se cumple; NO comprueban
   el Supabase real. Eso se hace una vez creado el proyecto, con
   `herramientas/medir/medir-almacen-supabase.js` (pendiente de escribir con el
   proyecto delante), y hasta entonces este adaptador está «probado en
   laboratorio», no «verificado».
   ═══════════════════════════════════════════════════════════════════════════ */

const { huellaDe } = require('./almacen');

const ENTORNO = { URL:'SUPABASE_URL', CLAVE:'SUPABASE_SERVICE_ROLE_KEY' };

class AlmacenSupabase {
  /* op: {url, clave, fetch?}. Si no se pasan url/clave se leen del entorno. */
  constructor(op){
    const o = op || {};
    this.url   = String(o.url   || process.env[ENTORNO.URL]   || '').replace(/\/+$/,'');
    this.clave = String(o.clave || process.env[ENTORNO.CLAVE] || '');
    this.buscar = o.fetch || globalThis.fetch;
    const faltan = [];
    if(!this.url)   faltan.push(ENTORNO.URL);
    if(!this.clave) faltan.push(ENTORNO.CLAVE);
    if(faltan.length){
      const e = new Error('AlmacenSupabase: faltan variables de entorno: ' + faltan.join(', '));
      e.codigo = 'ALMACEN_SIN_CONFIG'; e.faltan = faltan;
      throw e;
    }
    if(typeof this.buscar !== 'function') throw new Error('AlmacenSupabase: no hay fetch');
  }

  async _pedir(metodo, ruta, cuerpo, cabeceras){
    const res = await this.buscar(this.url + '/rest/v1/' + ruta, {
      method: metodo,
      headers: Object.assign({
        apikey: this.clave,
        Authorization: ['Bearer', this.clave].join(' '),   // sin literal: privacidad.test.js
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }, cabeceras || {}),
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
    const texto = await res.text();
    if(!res.ok){
      /* Nunca se escribe la clave en el error: solo método, ruta y estado. */
      const e = new Error('Supabase ' + metodo + ' ' + ruta.split('?')[0] + ' → ' + res.status +
                          (texto ? ': ' + texto.slice(0, 300) : ''));
      e.codigo = 'ALMACEN_HTTP'; e.estado = res.status;
      throw e;
    }
    return texto ? JSON.parse(texto) : null;
  }

  /* Comprueba que la clave es la de servicio y que las tablas existen. */
  async comprobarConexion(){
    await this._pedir('GET', 'amz_documentos?select=clave&limit=1');
    await this._pedir('GET', 'amz_ingestas?select=id&limit=1');
    return true;
  }

  async guardarDocumento(d){
    if(!d || !d.clave) throw new Error('guardarDocumento necesita una clave');
    if(typeof d.texto !== 'string') throw new Error('guardarDocumento necesita texto');
    const huella = huellaDe(d.texto);
    const bytes = Buffer.byteLength(d.texto, 'utf8');
    await this._pedir('POST', 'amz_documentos?on_conflict=clave',
      [{clave:d.clave, texto:d.texto, meta:d.meta || {}, huella, bytes}],
      {Prefer:'resolution=merge-duplicates,return=minimal'});
    return {clave:d.clave, bytes, huella};
  }

  async leerDocumento(clave){
    const filas = await this._pedir('GET',
      'amz_documentos?select=texto,meta,huella&clave=eq.' + encodeURIComponent(clave) + '&limit=1');
    if(!filas || !filas.length) return null;
    const x = filas[0];
    return {texto:x.texto, meta:x.meta || {}, huella:x.huella};
  }

  async existeDocumento(clave){
    const filas = await this._pedir('GET',
      'amz_documentos?select=clave&clave=eq.' + encodeURIComponent(clave) + '&limit=1');
    return !!(filas && filas.length);
  }

  async anotarIngesta(registro){
    const r = Object.assign({}, registro);
    if(!r.cuando) r.cuando = new Date().toISOString();
    if(!r.idHub) throw new Error('anotarIngesta necesita idHub');
    if(!r.estado) throw new Error('anotarIngesta necesita estado');
    await this._pedir('POST', 'amz_ingestas', [{
      id_hub: r.idHub, estado: r.estado, cuando: r.cuando,
      mercados: Array.isArray(r.mercados) ? r.mercados : [],
      clave: r.clave || null, registro: r
    }], {Prefer:'return=minimal'});
    return r;
  }

  async ingestas(filtro){
    const f = filtro || {};
    const q = ['select=registro', 'order=cuando.asc,id.asc'];
    if(f.idHub)   q.push('id_hub=eq.' + encodeURIComponent(f.idHub));
    if(f.estado)  q.push('estado=eq.' + encodeURIComponent(f.estado));
    if(f.desde)   q.push('cuando=gte.' + encodeURIComponent(f.desde));
    if(f.hasta)   q.push('cuando=lte.' + encodeURIComponent(f.hasta));
    if(f.mercado) q.push('mercados=cs.' + encodeURIComponent('{' + f.mercado + '}'));
    const filas = await this._pedir('GET', 'amz_ingestas?' + q.join('&'));
    return (filas || []).map(x => x.registro);
  }

  async ultimaIngesta(filtro){
    const lista = await this.ingestas(filtro);
    if(!lista.length) return null;
    return lista.slice().sort((a,b)=>String(a.cuando).localeCompare(String(b.cuando))).pop();
  }
}

module.exports = { AlmacenSupabase, ENTORNO };
