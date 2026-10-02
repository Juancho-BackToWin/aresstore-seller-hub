'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   servidor/almacen.js · dónde se guarda lo descargado

   AQUÍ NO SE DECIDE DÓNDE SE ALOJA ESTO. Vercel Pro con tareas programadas,
   Supabase con Edge Functions y cron, u otra cosa: es una decisión de Juancho
   que todavía no está tomada, y el coste y las consecuencias de cada opción
   están en `docs/carriles/9-spapi.md`.

   Lo que sí se decide aquí es que el resto del código NO se entere. Toda la
   ingesta habla con esta interfaz y con nada más. El único adaptador que trae
   este carril es el de MEMORIA, que es el que usan las pruebas. No hay ninguno
   real, y eso es intencionado: un adaptador real escrito antes de la decisión
   es trabajo que se tira, y encima ata la decisión.

   La interfaz, entera:

     guardarDocumento({clave, texto, meta})  → {clave, bytes, huella}
     leerDocumento(clave)                    → {texto, meta} | null
     existeDocumento(clave)                  → boolean
     anotarIngesta(registro)                 → registro guardado
     ingestas(filtro)                        → array de registros
     ultimaIngesta(filtro)                   → registro | null

   Seis métodos. Cualquier alojamiento que sepa guardar un texto por clave y una
   fila por ingesta puede implementarlos en una tarde.
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');

const METODOS = ['guardarDocumento','leerDocumento','existeDocumento',
                 'anotarIngesta','ingestas','ultimaIngesta'];

/* Se comprueba al arrancar, no al primer fallo. Un adaptador al que le falte
   `anotarIngesta` funcionaría durante horas descargando informes y perdiendo el
   rastro de lo que ya se archivó; el día que se mire la ventana de 90 días de
   las liquidaciones, ya no habrá nada que mirar. */
function comprobarAlmacen(almacen){
  if(!almacen || typeof almacen !== 'object') throw new Error('Almacén: no se ha pasado ninguno');
  const faltan = METODOS.filter(m=>typeof almacen[m] !== 'function');
  if(faltan.length){
    const e = new Error('Al almacén le faltan métodos de la interfaz: ' + faltan.join(', '));
    e.codigo = 'ALMACEN_INCOMPLETO';
    e.faltan = faltan;
    throw e;
  }
  return almacen;
}

function huellaDe(texto){
  return crypto.createHash('sha256').update(Buffer.from(String(texto), 'utf8')).digest('hex');
}

/* ── Adaptador de memoria ─────────────────────────────────────────────────── */
class AlmacenMemoria {
  constructor(){ this.documentos = new Map(); this.registros = []; }

  async guardarDocumento(d){
    if(!d || !d.clave) throw new Error('guardarDocumento necesita una clave');
    if(typeof d.texto !== 'string') throw new Error('guardarDocumento necesita texto');
    const huella = huellaDe(d.texto);
    this.documentos.set(d.clave, {texto:d.texto, meta:d.meta||{}, huella,
                                  bytes:Buffer.byteLength(d.texto,'utf8')});
    return {clave:d.clave, bytes:Buffer.byteLength(d.texto,'utf8'), huella};
  }
  async leerDocumento(clave){
    const x = this.documentos.get(clave);
    return x ? {texto:x.texto, meta:x.meta, huella:x.huella} : null;
  }
  async existeDocumento(clave){ return this.documentos.has(clave); }

  async anotarIngesta(registro){
    const r = Object.assign({}, registro);
    if(!r.cuando) r.cuando = new Date().toISOString();
    this.registros.push(r);
    return r;
  }
  async ingestas(filtro){
    const f = filtro || {};
    return this.registros.filter(r=>{
      if(f.idHub && r.idHub !== f.idHub) return false;
      if(f.estado && r.estado !== f.estado) return false;
      if(f.desde && String(r.cuando) < String(f.desde)) return false;
      if(f.hasta && String(r.cuando) > String(f.hasta)) return false;
      if(f.mercado && !(r.mercados||[]).includes(f.mercado)) return false;
      return true;
    });
  }
  async ultimaIngesta(filtro){
    const lista = await this.ingestas(filtro);
    if(!lista.length) return null;
    return lista.slice().sort((a,b)=>String(a.cuando).localeCompare(String(b.cuando))).pop();
  }
}

module.exports = { AlmacenMemoria, comprobarAlmacen, huellaDe, METODOS };
