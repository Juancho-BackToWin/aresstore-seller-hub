'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   servidor/lwa.js · la ficha de acceso (Login with Amazon)

   LO QUE DICE LA DOCUMENTACIÓN, VERIFICADO.
   Fuente: https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api
   Consultada el 17 de septiembre de 2026.

     · Punto de entrada: «https://api.amazon.com/auth/o2/token».
     · Para operar en nombre de un vendedor: «grant_type=refresh_token», más
       `refresh_token`, `client_id` y `client_secret`.
     · La respuesta trae `access_token` y `expires_in`, que vale «3600»
       segundos: la ficha dura una hora.
     · La ficha viaja a SP-API en la cabecera «x-amz-access-token».

   DESMENTIDO DE PASO: desde 2023 SP-API ya no exige firma AWS Signature V4 ni
   credenciales de IAM. Aquí no hay ninguna, y no es un olvido.
   Fuente: https://developer-docs.amazon.com/sp-api/docs/migrate-from-aws-signature
   Consultada el 17 de septiembre de 2026.

   ESTE MÓDULO NO SABE NINGUNA CREDENCIAL. Se le pasan al construirlo y vienen
   del entorno de ejecución. Sin ellas no arranca, y lo dice con el nombre de la
   variable que falta (ver `entorno.js`).
   ═══════════════════════════════════════════════════════════════════════════ */

const { PUNTO_LWA } = require('./entorno');
const { conReintentos } = require('./reintentos');

/* Margen antes de la caducidad. Una ficha que caduca «dentro de 4 segundos» es
   una ficha caducada: entre que se pide el informe y se descarga el documento
   pasan minutos. Se renueva un minuto antes. */
const MARGEN_MS = 60 * 1000;

class Lwa {
  constructor(opciones){
    const op = opciones || {};
    if(!op.credenciales) throw new Error('Lwa necesita credenciales (identificadorCliente, claveCliente, fichaRenovacion)');
    const c = op.credenciales;
    for(const k of ['identificadorCliente','claveCliente','fichaRenovacion']){
      if(!c[k]) throw new Error('Lwa: falta la credencial «'+k+'»; se lee del entorno, no del repositorio');
    }
    this.credenciales = c;
    this.buscar   = op.fetch  || globalThis.fetch;
    this.ahora    = op.ahora  || (()=>Date.now());
    this.dormir   = op.dormir;
    this.aleatorio= op.aleatorio;
    this.registro = op.registro || (()=>{});
    this.punto    = op.punto || PUNTO_LWA;
    this.margen   = typeof op.margenMs === 'number' ? op.margenMs : MARGEN_MS;
    this._ficha   = null;
    this._caducaEn= 0;
    this._enCurso = null;
  }

  /* Invalida la ficha guardada. Lo llama el cliente cuando Amazon contesta 403
     con `Unauthorized`: puede ser una ficha caducada antes de tiempo (por
     ejemplo si el reloj del servidor va adelantado) y merece un reintento con
     ficha nueva, pero UNO solo. */
  invalidar(){ this._ficha = null; this._caducaEn = 0; }

  async token(){
    if(this._ficha && this.ahora() < this._caducaEn) return this._ficha;
    /* Si llegan diez peticiones a la vez con la ficha caducada, se pide UNA
       ficha, no diez: LWA también tiene límite de ritmo. */
    if(this._enCurso) return this._enCurso;
    this._enCurso = this._pedir().finally(()=>{ this._enCurso = null; });
    return this._enCurso;
  }

  async _pedir(){
    const cuerpo = new URLSearchParams();
    cuerpo.set('grant_type', 'refresh_token');
    cuerpo.set('refresh_token', this.credenciales.fichaRenovacion);
    cuerpo.set('client_id',     this.credenciales.identificadorCliente);
    cuerpo.set('client_secret', this.credenciales.claveCliente);

    const respuesta = await conReintentos(async ()=>{
      const r = await this.buscar(this.punto, {
        method: 'POST',
        headers: {'content-type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body: cuerpo.toString()
      });
      if(r.ok) return r;
      const texto = await leerTexto(r);
      const e = new Error('LWA ha contestado ' + r.status + ' al renovar la ficha de acceso');
      e.codigo = 'LWA_' + r.status;
      e.estado = r.status;
      /* 400 es «la ficha de renovación ya no vale» o «la aplicación no es esa»:
         reintentarlo no lo arregla y además cuenta contra el límite. 429 y 5xx
         sí se reintentan. */
      e.reintentable = r.status === 429 || r.status >= 500;
      e.detalle = recorte(texto);
      throw e;
    }, {etiqueta:'token LWA', dormir:this.dormir, aleatorio:this.aleatorio,
        registro:this.registro, intentos:4});

    let datos;
    try{ datos = JSON.parse(await leerTexto(respuesta)); }
    catch(e){ throw new Error('LWA ha contestado algo que no es JSON al renovar la ficha'); }

    const ficha = datos && datos.access_token;
    if(!ficha || typeof ficha !== 'string'){
      const e = new Error('LWA ha contestado 200 pero sin ficha de acceso');
      e.codigo = 'LWA_SIN_FICHA';
      throw e;
    }
    const duracion = Number(datos.expires_in);
    const segundos = isFinite(duracion) && duracion > 0 ? duracion : 3600;
    this._ficha = ficha;
    this._caducaEn = this.ahora() + segundos * 1000 - this.margen;
    this.registro({evento:'lwa', accion:'ficha renovada', duracionSegundos:segundos});
    return ficha;
  }
}

async function leerTexto(r){
  try{ return await r.text(); }catch(e){ return ''; }
}
/* Nunca se vuelca entera la respuesta de LWA en el registro: si algún día
   trajera algo sensible, quedaría escrito en los registros del alojamiento. */
function recorte(t){ return String(t||'').slice(0,200); }

module.exports = { Lwa };
