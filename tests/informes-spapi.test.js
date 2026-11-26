#!/usr/bin/env node
/* =========================================================================
   amz-informes · servidor/supabase/functions/amz-informes/index.ts

   Pide informes de la Reports API y guarda su texto en amz_documentos.
   El riesgo que vigila esta suite es de privacidad: los informes de pedidos y
   de devoluciones traen datos del comprador, y Supabase no es su sitio. Por
   eso la función tiene una LISTA BLANCA y solo deja pedir informes de
   inventario, tarifas y listings.

   I1 · sin x-recolector-key correcta: 401 y ni una llamada a Amazon.
   I2 · un informe de pedidos (GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL)
        se rechaza con 400 antes de pedir el token.
   I3 · un informe permitido sin terminar devuelve su estado y no guarda nada.
   I4 · uno terminado se guarda en 'spapi/informes/<tipo>/<PAIS>/<día Madrid>'
        con huella; 3 líneas (cabecera + 2) = 2 filas.
   Todo con dobles y datos sintéticos.
   ========================================================================= */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');
const FUENTE = path.resolve(__dirname, '..', 'servidor/supabase/functions/amz-informes/index.ts');

let fails = 0;
const check = (label, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'OK   ' : 'FALLO') + ' ' + label + (extra !== undefined ? '  → ' + extra : ''));
};
const CLAVE = 'clave-sintetica';
const AHORA = Date.UTC(2026, 10, 26, 23, 30, 0);
const TOKEN_FALSO = ['tok', 'sint'].join('-');

function entorno(opc = {}) {
  const llamadas = [], escrituras = [];
  const resp = (status, cuerpo, texto) => ({ ok: status < 300, status, json: async () => cuerpo, text: async () => (texto !== undefined ? texto : JSON.stringify(cuerpo)), arrayBuffer: async () => new TextEncoder().encode(texto || '').buffer });
  const fetch = async (url, init = {}) => {
    url = String(url); llamadas.push(url);
    if (url.includes('/rest/v1/amz_config')) return resp(200, [{ valor: CLAVE }]);
    if (url.includes('/rest/v1/')) { escrituras.push({ url, cuerpo: JSON.parse(init.body) }); return resp(201, null, ''); }
    if (url.startsWith('https://api.amazon.com/auth')) return resp(200, { access_token: TOKEN_FALSO });
    if (url.endsWith('/reports/2021-06-30/reports') && init.method === 'POST') return resp(202, { reportId: '123' });
    if (/\/reports\/2021-06-30\/reports\/\d+$/.test(url)) return resp(200, opc.hecho ? { processingStatus: 'DONE', reportDocumentId: 'doc-1' } : { processingStatus: 'IN_PROGRESS' });
    if (url.includes('/documents/doc-1')) return resp(200, { url: 'https://descarga.invalid/doc' });
    if (url.startsWith('https://descarga.invalid')) return resp(200, null, 'sku\tavailable\nA\t1\nB\t2\n');
    return resp(404, {});
  };
  let h = null;
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(AHORA); } static now() { return AHORA; } }
  const ctx = { fetch, URL, URLSearchParams, Intl, JSON, Math, Number, String, Array, Object, Promise, Uint8Array, TextEncoder, TextDecoder, Set, Response, Blob, DecompressionStream,
    Date: FakeDate, crypto: globalThis.crypto, setTimeout: (f) => { f(); return 0; }, console,
    Deno: { env: { get: (k) => ({ SUPABASE_URL: 'https://sb.invalid', SUPABASE_SERVICE_ROLE_KEY: 'x' })[k] }, serve: (f) => { h = f; } } };
  vm.runInNewContext(stripTypeScriptTypes(fs.readFileSync(FUENTE, 'utf8')), ctx);
  return { h, llamadas, escrituras };
}
const pet = (q, clave) => ({ url: 'https://sb.invalid/functions/v1/amz-informes?' + q, headers: { get: (k) => (k === 'x-recolector-key' ? clave : null) } });
const PLAN = 'tipo=GET_FBA_INVENTORY_PLANNING_DATA&mercados=ES';

(async () => {
  console.log('\n=== I1 · SIN CLAVE NO HAY NADA ===');
  { const e = entorno(); const r = await e.h(pet('accion=crear&' + PLAN, 'otra'));
    check('401', r.status === 401, r.status);
    check('ninguna llamada a Amazon', !e.llamadas.some((u) => /amazon\.com/.test(u)), e.llamadas.length); }

  console.log('\n=== I2 · LOS INFORMES CON COMPRADOR NO SE PUEDEN PEDIR ===');
  for (const t of ['GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL', 'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA', 'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL']) {
    const e = entorno(); const r = await e.h(pet('accion=crear&tipo=' + t + '&mercados=ES', CLAVE));
    check(t + ': 400 y sin pedir token', r.status === 400 && !e.llamadas.some((u) => /amazon\.com/.test(u)), r.status);
  }

  console.log('\n=== I3 · SIN TERMINAR, NO GUARDA ===');
  { const e = entorno(); const r = await e.h(pet('accion=leer&id=123&' + PLAN, CLAVE)); const b = await r.json();
    check('devuelve IN_PROGRESS', b.estado === 'IN_PROGRESS', b.estado);
    check('no escribe en Supabase', e.escrituras.length === 0, e.escrituras.length); }

  console.log('\n=== I4 · TERMINADO, GUARDA CON SU CLAVE ===');
  { const e = entorno({ hecho: true }); const r = await e.h(pet('accion=leer&id=123&' + PLAN, CLAVE)); const b = await r.json();
    const doc = e.escrituras.find((w) => w.url.includes('amz_documentos'));
    const fila = doc && doc.cuerpo[0];
    check('2 filas (cabecera + 2 líneas)', b.filas === 2, b.filas);
    check('clave con el día de Madrid (27, no 26)', b.clave === 'spapi/informes/GET_FBA_INVENTORY_PLANNING_DATA/ES/2026-11-27', b.clave);
    check('lleva huella sha-256', fila && /^[0-9a-f]{64}$/.test(fila.huella));
    check('registro en amz_ingestas', e.escrituras.some((w) => w.url.includes('amz_ingestas'))); }

  console.log('\n' + (fails ? '✗ ' + fails + ' FALLO(S)' : '✓ informes-spapi: todo en verde'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('  FALLO la suite no pudo ejecutarse  → ' + e.message); process.exit(1); });
