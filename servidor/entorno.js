'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   servidor/entorno.js · los NOMBRES de las variables de entorno, nunca valores

   Este repositorio es PÚBLICO. Aquí no hay, ni puede haber, ninguna credencial:
   ni real, ni de ejemplo, ni inventada con pinta de real. Lo único que se
   documenta es cómo SE LLAMA cada variable y qué pasa si falta.

   `tests/privacidad.test.js` recorre el árbol buscando credenciales y corre la
   primera de todas las suites. Un valor aquí la pondría roja, y con razón.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Nombre de cada variable → para qué sirve. El valor lo pone el entorno de
   ejecución (el panel de Vercel, los «secrets» de Supabase, o el shell de quien
   lo pruebe en local), nunca un fichero del repositorio. */
const VARIABLES = {
  identificadorCliente: {
    nombre: 'SPAPI_LWA_CLIENT_ID',
    para: 'Identificador de la aplicación en Login with Amazon (LWA).'
  },
  claveCliente: {
    nombre: 'SPAPI_LWA_CLIENT_SECRET',
    para: 'Clave de la aplicación en LWA. Nunca sale del entorno de ejecución.'
  },
  fichaRenovacion: {
    nombre: 'SPAPI_LWA_REFRESH_TOKEN',
    para: 'Ficha de renovación que el vendedor otorga al autorizar la aplicación.'
  },
  region: {
    nombre: 'SPAPI_REGION',
    para: 'Región de SP-API: eu, na o fe. Para Aresstore, eu.'
  },
  mercados: {
    nombre: 'SPAPI_MARKETPLACE_IDS',
    para: 'Lista separada por comas de identificadores de tienda (marketplaceId).'
  }
};

/* Puntos de entrada de SP-API por región.
   Fuente: https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints
   Consultado el 17 de septiembre de 2026. */
const REGIONES = {
  na: 'https://sellingpartnerapi-na.amazon.com',
  eu: 'https://sellingpartnerapi-eu.amazon.com',
  fe: 'https://sellingpartnerapi-fe.amazon.com'
};

/* Punto de entrada de LWA para canjear la ficha de renovación por una de acceso.
   Fuente: https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api
   Consultado el 17 de septiembre de 2026. */
const PUNTO_LWA = 'https://api.amazon.com/auth/o2/token';

/* Identificadores de tienda de las nueve tiendas europeas en las que vende
   Aresstore. No son secretos: son públicos y los mismos para todo el mundo.
   Fuente: https://developer-docs.amazon.com/sp-api/docs/marketplace-ids
   Consultado el 17 de septiembre de 2026. */
const TIENDAS_EU = {
  ES: 'A1RKKUPIHCS9HS', FR: 'A13V1IB3VIYZZH', DE: 'A1PA6795UKMFR9',
  IT: 'APJ6JRA9NG5V4',  NL: 'A1805IZSGTT6HS', BE: 'AMEN7PMS3EDWL',
  PL: 'A1C3SOZRARQ6R3', SE: 'A2NODRKZP88ZB9', IE: 'A28R8C7NBKEWEA',
  UK: 'A1F83G8C2ARO7P'
};

/* ── Leer la configuración del entorno ──────────────────────────────────────
   No inventa valores por defecto para las credenciales. Si falta una, lo dice
   con el NOMBRE de la variable que falta: un fallo de configuración tiene que
   leerse como un fallo de configuración, no como un 403 de Amazon a las tres de
   la mañana. */
function configuracionDeEntorno(entorno){
  const env = entorno || {};
  const faltan = [];
  const leer = k => {
    const v = env[VARIABLES[k].nombre];
    if(!v || !String(v).trim()){ faltan.push(VARIABLES[k].nombre); return null; }
    return String(v).trim();
  };
  const cfg = {
    identificadorCliente: leer('identificadorCliente'),
    claveCliente:         leer('claveCliente'),
    fichaRenovacion:      leer('fichaRenovacion'),
    region:              (env[VARIABLES.region.nombre] || 'eu').trim().toLowerCase(),
    mercados:            (env[VARIABLES.mercados.nombre] || '')
                           .split(',').map(s=>s.trim()).filter(Boolean)
  };
  if(faltan.length){
    const e = new Error('Faltan variables de entorno: ' + faltan.join(', '));
    e.codigo = 'CONFIGURACION_INCOMPLETA';
    e.faltan = faltan;
    throw e;
  }
  if(!REGIONES[cfg.region]){
    const e = new Error('Región desconocida «'+cfg.region+'». Valores válidos: ' +
      Object.keys(REGIONES).join(', ') + ' (variable ' + VARIABLES.region.nombre + ')');
    e.codigo = 'REGION_DESCONOCIDA';
    throw e;
  }
  cfg.punto = REGIONES[cfg.region];
  return cfg;
}

/* ── Tapar credenciales antes de escribir en el registro ────────────────────
   Un `console.log(cuerpo)` con la ficha de renovación dentro la deja escrita en
   los registros del alojamiento para siempre. Todo lo que este módulo imprima
   pasa por aquí primero. */
const CAMPOS_TAPADOS = /(client_id|client_secret|refresh_token|access_token|x-amz-access-token|authorization)/i;
function tapar(valor){
  if(valor == null) return valor;
  if(typeof valor === 'string') return valor;
  if(Array.isArray(valor)) return valor.map(tapar);
  if(typeof valor === 'object'){
    const salida = {};
    for(const k of Object.keys(valor)){
      salida[k] = CAMPOS_TAPADOS.test(k) ? '«tapado»' : tapar(valor[k]);
    }
    return salida;
  }
  return valor;
}

module.exports = { VARIABLES, REGIONES, PUNTO_LWA, TIENDAS_EU, configuracionDeEntorno, tapar };
