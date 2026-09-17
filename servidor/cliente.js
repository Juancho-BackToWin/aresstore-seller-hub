'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   servidor/cliente.js · una llamada a SP-API, con sus reintentos

   Todo lo que este módulo hace es LEER. No hay aquí ni un POST que escriba en
   Amazon: `createReport` crea un informe para nosotros, no toca el catálogo,
   ni el precio, ni un pedido. El carril entero está construido y APAGADO.

   Fuentes verificadas el 17 de septiembre de 2026:
     · Cabecera de la ficha y punto de entrada por región →
       https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api
       https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints
     · 429 y espera →
       https://developer-docs.amazon.com/sp-api/docs/usage-plans-and-rate-limits
   ═══════════════════════════════════════════════════════════════════════════ */

const { conReintentos, esperaPorRitmo } = require('./reintentos');

class ErrorSpapi extends Error {
  constructor(mensaje, extra){
    super(mensaje);
    this.name = 'ErrorSpapi';
    Object.assign(this, extra || {});
  }
}

class ClienteSpapi {
  constructor(opciones){
    const op = opciones || {};
    if(!op.punto) throw new Error('ClienteSpapi necesita el punto de entrada de la región');
    if(!op.lwa)   throw new Error('ClienteSpapi necesita un proveedor de ficha de acceso (Lwa)');
    this.punto    = op.punto.replace(/\/+$/,'');
    this.lwa      = op.lwa;
    this.buscar   = op.fetch || globalThis.fetch;
    this.ahora    = op.ahora || (()=>Date.now());
    this.dormir   = op.dormir;
    this.aleatorio= op.aleatorio;
    this.registro = op.registro || (()=>{});
    this.intentos = op.intentos || 5;
    this.esperaBase = op.esperaBase || 1000;
  }

  /* Devuelve {datos, estado, cabeceras}. `consulta` admite arrays, que SP-API
     espera separados por comas (no repitiendo el parámetro). */
  async pedir(peticion){
    const p = peticion || {};
    const metodo = p.metodo || 'GET';
    const operacion = p.operacion || (metodo + ' ' + p.ruta);
    const url = this.punto + p.ruta + construirConsulta(p.consulta);
    let renovada = false;

    return conReintentos(async ()=>{
      const ficha = await this.lwa.token();
      const cabeceras = {
        'x-amz-access-token': ficha,
        'accept': 'application/json',
        'user-agent': 'AresstoreSellerHub/0.7 (Language=JavaScript)'
      };
      const inicio = {method: metodo, headers: cabeceras};
      if(p.cuerpo !== undefined){
        cabeceras['content-type'] = 'application/json';
        inicio.body = JSON.stringify(p.cuerpo);
      }

      const r = await this.buscar(url, inicio);
      const texto = await textoDe(r);
      const datos = texto ? intentarJson(texto) : null;

      if(r.ok) return {datos, estado:r.status, cabeceras:r.headers};

      const e = new ErrorSpapi(
        'SP-API ha contestado ' + r.status + ' en ' + operacion + detallarError(datos),
        {estado:r.status, operacion, codigo: codigoDe(datos, r.status), cuerpo: datos});

      if(r.status === 429){
        e.reintentable = true;
        /* La cabecera de ritmo NO está garantizada en un 429 (ver reintentos.js).
           Si viene, marca la espera mínima; si no, manda la exponencial. */
        const minima = esperaPorRitmo(r.headers);
        if(minima) e.esperaMinima = minima;
      } else if(r.status >= 500){
        e.reintentable = true;
      } else if((r.status === 401 || r.status === 403) && !renovada){
        /* Una ficha puede caducar antes de lo previsto. Se renueva y se
           reintenta UNA vez; a la segunda, 403 es 403 y significa que a la
           aplicación le falta el permiso, no la ficha. */
        renovada = true;
        this.lwa.invalidar();
        e.reintentable = true;
        e.esperaMinima = 0;
      } else {
        e.reintentable = false;
      }
      throw e;
    }, {etiqueta:operacion, intentos:this.intentos, esperaBase:this.esperaBase,
        dormir:this.dormir, aleatorio:this.aleatorio, registro:this.registro});
  }
}

function construirConsulta(consulta){
  if(!consulta) return '';
  const partes = [];
  for(const k of Object.keys(consulta)){
    const v = consulta[k];
    if(v === undefined || v === null || v === '') continue;
    partes.push(encodeURIComponent(k) + '=' +
      encodeURIComponent(Array.isArray(v) ? v.join(',') : String(v)));
  }
  return partes.length ? '?' + partes.join('&') : '';
}
async function textoDe(r){ try{ return await r.text(); }catch(e){ return ''; } }
function intentarJson(t){ try{ return JSON.parse(t); }catch(e){ return {textoCrudo:String(t).slice(0,400)}; } }
function codigoDe(datos, estado){
  const err = datos && Array.isArray(datos.errors) && datos.errors[0];
  return (err && err.code) || 'HTTP_' + estado;
}
function detallarError(datos){
  const err = datos && Array.isArray(datos.errors) && datos.errors[0];
  if(!err) return '';
  return ' · ' + [err.code, err.message].filter(Boolean).join(': ');
}

module.exports = { ClienteSpapi, ErrorSpapi };
