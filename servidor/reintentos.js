'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   servidor/reintentos.js · esperar cuando Amazon dice «vas demasiado deprisa»

   LO QUE DICE LA DOCUMENTACIÓN, VERIFICADO.
   Fuente: https://developer-docs.amazon.com/sp-api/docs/usage-plans-and-rate-limits
   Consultada el 17 de septiembre de 2026.

     · «A 429 is a retry-able status code. You can try again, but repeated
        throttled requests require a back-off strategy.»
     · «When you call an SP-API operation, the `x-amzn-RateLimit-Limit` response
        header, if available, specifies the operation's rate limits per
        account-application pair.»
     · «The `x-amzn-RateLimit-Limit` response header is for HTTP status codes
        20x, 400 and 404.»

   La tercera frase es la que cambia el diseño: la cabecera con el ritmo
   permitido NO está garantizada precisamente en el 429, que es cuando haría
   falta. Por eso aquí la cabecera se usa **si viene** para fijar una espera
   mínima (1/ritmo segundos), y si no viene se cae a espera exponencial. Un
   cliente que se quede esperando a que llegue la cabecera no reintenta nunca.

   Los ritmos por operación (Reports v2021-06-30, modelo oficial
   `reports_2021-06-30.json`, consultado el 17 de septiembre de 2026):
     createReport 0,0167 req/s (ráfaga 15) · getReport 2 req/s (ráfaga 15)
     getReports 0,0222 req/s (ráfaga 10) · getReportDocument 0,0167 req/s (15)
   0,0167 req/s es UN informe por minuto: el ciclo completo de doce informes no
   cabe en una ráfaga y la espera no es un caso raro, es el camino normal.
   ═══════════════════════════════════════════════════════════════════════════ */

const dormirDeVerdad = ms => new Promise(r => setTimeout(r, ms));

/* Espera mínima que impone la cabecera de ritmo, en milisegundos.
   `x-amzn-RateLimit-Limit` viene en peticiones por segundo (p. ej. «0.0167»),
   así que el hueco entre peticiones es su inversa. Un valor no numérico o cero
   se ignora en vez de convertirse en Infinity y colgar el proceso. */
function esperaPorRitmo(cabeceras){
  if(!cabeceras) return 0;
  const leer = n => (typeof cabeceras.get === 'function' ? cabeceras.get(n) : cabeceras[n]);
  const bruto = leer('x-amzn-RateLimit-Limit') || leer('x-amzn-ratelimit-limit');
  if(bruto == null) return 0;
  const ritmo = Number(String(bruto).trim());
  if(!isFinite(ritmo) || ritmo <= 0) return 0;
  return Math.ceil(1000 / ritmo);
}

/* Reintento con espera exponencial y «jitter».

   El jitter (medio azar sobre la espera) no es adorno: diez informes que fallan
   a la vez y esperan exactamente lo mismo vuelven a chocar a la vez. Se inyecta
   `aleatorio` para que las pruebas sean deterministas.

   Solo se reintenta lo que viene marcado `reintentable === true`. Todo lo demás
   sube tal cual: un 400 o un informe CANCELLED reintentados son un bucle
   infinito que no arregla nada. */
async function conReintentos(fn, opciones){
  const op = opciones || {};
  const intentos     = op.intentos      || 5;
  const base         = op.esperaBase    || 1000;
  const tope         = op.esperaMaxima  || 60000;
  const dormir       = op.dormir        || dormirDeVerdad;
  const aleatorio    = op.aleatorio     || Math.random;
  const registro     = op.registro      || (()=>{});
  const etiqueta     = op.etiqueta      || 'operación';

  let ultimo = null;
  for(let intento = 1; intento <= intentos; intento++){
    try{
      return await fn(intento);
    }catch(e){
      ultimo = e;
      if(!e || e.reintentable !== true) throw e;
      if(intento === intentos) break;

      const exponencial = Math.min(tope, base * Math.pow(2, intento - 1));
      let espera = Math.round(exponencial * (0.5 + 0.5 * aleatorio()));
      /* La espera que pide Amazon manda sobre la nuestra, y no se recorta con
         el tope: si el plan de uso dice un minuto, es un minuto. */
      if(typeof e.esperaMinima === 'number' && e.esperaMinima > espera) espera = e.esperaMinima;

      registro({evento:'reintento', etiqueta, intento, espera,
                motivo: e.codigo || e.message});
      await dormir(espera);
    }
  }
  const e = ultimo || new Error('Fallo sin causa en ' + etiqueta);
  e.intentosAgotados = intentos;
  e.message = e.message + ' · agotados los ' + intentos + ' intentos de ' + etiqueta;
  throw e;
}

module.exports = { conReintentos, esperaPorRitmo, dormirDeVerdad };
