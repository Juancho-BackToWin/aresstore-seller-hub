'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   servidor/index.js · la puerta de entrada, y el interruptor

   EL CARRIL ESTÁ CONSTRUIDO Y APAGADO. Este módulo no se ejecuta solo, no hay
   tarea programada, no hay despliegue y no hay credenciales en ninguna parte.
   `montar()` es lo único que enciende algo, y falla a propósito si le falta una
   variable de entorno, diciendo cuál.

   POR QUÉ ESTO NO ESTÁ EN `api/`. Vercel convierte una carpeta `api/` en
   funciones serverless en el siguiente despliegue, y este proyecto se sirve
   como HTML estático. Una carpeta mal elegida habría cambiado cómo se sirve la
   aplicación entera sin que nadie lo pidiera. Por eso `servidor/`.
   ═══════════════════════════════════════════════════════════════════════════ */

const entorno   = require('./entorno');
const reintentos= require('./reintentos');
const { Lwa }   = require('./lwa');
const { ClienteSpapi, ErrorSpapi } = require('./cliente');
const informes  = require('./informes');
const catalogo  = require('./catalogo');
const validador = require('./validador');
const almacen   = require('./almacen');
const ingesta   = require('./ingesta');

/* Construye el cliente a partir del entorno. Si falta una variable, lanza con
   su nombre: un fallo de configuración tiene que leerse como tal. */
function montar(opciones){
  const op = opciones || {};
  const cfg = entorno.configuracionDeEntorno(op.env || process.env);
  const lwa = new Lwa({
    credenciales:{
      identificadorCliente: cfg.identificadorCliente,
      claveCliente: cfg.claveCliente,
      fichaRenovacion: cfg.fichaRenovacion
    },
    fetch: op.fetch, ahora: op.ahora, dormir: op.dormir,
    aleatorio: op.aleatorio, registro: op.registro
  });
  const cliente = new ClienteSpapi({
    punto: cfg.punto, lwa,
    fetch: op.fetch, ahora: op.ahora, dormir: op.dormir,
    aleatorio: op.aleatorio, registro: op.registro
  });
  return {cliente, lwa, configuracion:{region:cfg.region, punto:cfg.punto, mercados:cfg.mercados}};
}

module.exports = Object.assign({montar, Lwa, ClienteSpapi, ErrorSpapi},
  {entorno, reintentos, informes, catalogo, validador, almacen, ingesta});
