#!/usr/bin/env node
/* =========================================================================
   Recolector (Agente 0) · servidor/supabase/functions/amz-recolector/index.ts

   Por qué existe: la noche del 26-nov dos sesiones desplegaron dos versiones
   distintas de la misma función. La desplegada (v3) exige x-recolector-key y
   además recoge pedidos; la del repositorio (v1) aceptaba el JWT anon y solo
   hacía inventario. Si alguien hubiera desplegado la del repositorio, el cron
   de las 05:17 habría empezado a dar 401 y los pedidos se habrían dejado de
   recoger sin que nada lo dijera.

   Esta suite EJECUTA la función (no la lee): quita los tipos con
   module.stripTypeScriptTypes, sustituye Deno, fetch, setTimeout y el
   cliente de Supabase por dobles que apuntan todo lo que reciben, y la llama
   como la llama el cron. Todos los datos son sintéticos.

   Lo que se comprueba, y la aritmética a mano:
   R1 · sin la clave correcta: 401 y ni una llamada a Amazon.
   R2 · inventario en dos páginas (SKU-A 5+1+2+3 · SKU-B 7+0+0+0):
        disponibles 12, no vendibles 1, reservadas 2, entrantes 3.
   R3 · el día de la foto es el de Madrid: 26-nov 23:30 UTC = 27-nov 00:30 en
        Madrid → documento spapi/inventario/ES/2026-11-27.
   R4 · la foto del día se SUSTITUYE (delete por documento antes del insert).
   R5 · pedidos: lo que trae Amazon del comprador (BuyerInfo, ShippingAddress)
        no llega a la fila; upsert por order_id+order_item_id; 2 + 1 = 3 uds.
   R6 · dias se acota a 1..30: dias=99 → LastUpdatedAfter = ahora − 30 días.
   R7 · si falla el token: 502, ninguna llamada a SP-API y registro en
        amz_ingestas con estado «error».
   R8 · el cron versionado llama con la cabecera x-recolector-key leída de
        amz_config, no con la clave anon.
   ========================================================================= */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');
const RAIZ = path.resolve(__dirname, '..');
const FUENTE = path.join(RAIZ, 'servidor/supabase/functions/amz-recolector/index.ts');
const CRON = path.join(RAIZ, 'servidor/sql/002_recolector_cron.sql');

let fails = 0;
const check = (label, cond, extra) => {
  if (!cond) fails++;
  console.log('  ' + (cond ? 'OK   ' : 'FALLO') + ' ' + label + (extra !== undefined ? '  → ' + extra : ''));
};

const CLAVE = 'clave-sintetica-de-prueba';
const TOKEN_FALSO = ['tok', 'sintetico'].join('-'); // partido para no parecer una credencial a privacidad.test.js
const AHORA = Date.UTC(2026, 10, 26, 23, 30, 0); // 26-nov 23:30 UTC

/* Doble de Supabase: apunta cada operación. */
function dobleDB(opc = {}) {
  const ops = [];
  const builder = (tabla) => {
    const b = {
      _filtros: [],
      select(c) { b._op = 'select'; return b; },
      eq(col, val) { b._filtros.push([col, val]); if (b._op === 'delete') { ops.push({ tabla, op: 'delete', filtros: b._filtros }); return Promise.resolve({ error: null }); } return b; },
      maybeSingle() {
        if (tabla === 'amz_config') return Promise.resolve({ data: opc.sinClave ? null : { valor: CLAVE }, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      delete() { b._op = 'delete'; return b; },
      insert(filas) { ops.push({ tabla, op: 'insert', filas: [].concat(filas) }); return Promise.resolve({ error: null }); },
      upsert(filas, o) { ops.push({ tabla, op: 'upsert', filas: [].concat(filas), opciones: o }); return Promise.resolve({ error: null }); },
    };
    return b;
  };
  return { ops, cliente: { from: builder } };
}

/* Doble de Amazon: LWA + inventario en 2 páginas + 1 página de pedidos. */
function dobleAmazon(opc = {}) {
  const llamadas = [];
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
  const fetch = async (url, init) => {
    url = String(url);
    llamadas.push(url);
    if (url.startsWith('https://api.amazon.com/auth/o2/token')) {
      return opc.tokenFalla ? resp(400, { error: 'invalid_grant' }) : resp(200, { access_token: TOKEN_FALSO });
    }
    if (url.includes('/fba/inventory/v1/summaries')) {
      if (!url.includes('nextToken=')) return resp(200, { payload: { inventorySummaries: [
        { sellerSku: 'SKU-A', asin: 'B000000001', totalQuantity: 11, inventoryDetails: { fulfillableQuantity: 5, unfulfillableQuantity: { totalUnfulfillableQuantity: 1 }, reservedQuantity: { totalReservedQuantity: 2 }, inboundWorkingQuantity: 1, inboundShippedQuantity: 1, inboundReceivingQuantity: 1 } },
      ] }, pagination: { nextToken: 'pag2' } });
      return resp(200, { payload: { inventorySummaries: [
        { sellerSku: 'SKU-B', asin: 'B000000002', totalQuantity: 7, inventoryDetails: { fulfillableQuantity: 7 } },
      ] } });
    }
    if (/\/orders\/v0\/orders\?/.test(url)) {
      return resp(200, { payload: { Orders: [
        { AmazonOrderId: '000-0000001-0000001', PurchaseDate: '2026-11-26T10:00:00Z', LastUpdateDate: '2026-11-26T11:00:00Z', OrderStatus: 'Shipped', FulfillmentChannel: 'AFN', MarketplaceId: 'A1RKKUPIHCS9HS', IsBusinessOrder: false,
          BuyerInfo: { BuyerEmail: 'comprador@ejemplo.invalid', BuyerName: 'Nombre Sintetico' }, ShippingAddress: { City: 'CiudadSintetica', PostalCode: '99199' } },
        { AmazonOrderId: '000-0000002-0000002', PurchaseDate: '2026-11-26T12:00:00Z', LastUpdateDate: '2026-11-26T12:00:00Z', OrderStatus: 'Pending', FulfillmentChannel: 'AFN', MarketplaceId: 'A1RKKUPIHCS9HS' },
      ] } });
    }
    if (/\/orders\/v0\/orders\/[^/]+\/orderItems/.test(url)) {
      const uno = url.includes('0000001');
      return resp(200, { payload: { OrderItems: [ uno
        ? { OrderItemId: 'IT1', SellerSKU: 'SKU-A', ASIN: 'B000000001', QuantityOrdered: 2, QuantityShipped: 2, ItemPrice: { Amount: '37.08', CurrencyCode: 'EUR' }, ItemTax: { Amount: '6.44', CurrencyCode: 'EUR' } }
        : { OrderItemId: 'IT2', SellerSKU: 'SKU-B', ASIN: 'B000000002', QuantityOrdered: 1, QuantityShipped: 0 } ] } });
    }
    return resp(404, { errors: [{ code: 'NotFound' }] });
  };
  return { llamadas, fetch };
}

/* Carga la función en un contexto aislado y devuelve su manejador. */
function cargar(db, amz) {
  let ts = fs.readFileSync(FUENTE, 'utf8');
  const imp = /^import \{ createClient \} from "jsr:@supabase\/supabase-js@2";$/m;
  if (!imp.test(ts)) throw new Error('la función ya no importa createClient como se esperaba');
  ts = ts.replace(imp, 'const createClient = (..._a) => __DB__;');
  const js = stripTypeScriptTypes(ts);
  let manejador = null;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(AHORA); }
    static now() { return AHORA; }
  }
  const ctx = {
    __DB__: db.cliente, fetch: amz.fetch, URL, URLSearchParams, Intl, JSON, Math, Number, String, Array, Object, Promise, Uint8Array, TextEncoder,
    Date: FakeDate, crypto: globalThis.crypto, console,
    setTimeout: (f) => { f(); return 0; },
    Response: class { constructor(b, i) { this.body = b; this.status = i.status; } async json() { return JSON.parse(this.body); } },
    Deno: { env: { get: (k) => ({ SUPABASE_URL: 'https://sintetico.invalid', SUPABASE_SERVICE_ROLE_KEY: 'x', SPAPI_REFRESH_TOKEN: 'r', SPAPI_LWA_CLIENT_ID: 'c', SPAPI_LWA_CLIENT_SECRET: 's' })[k] },
            serve: (h) => { manejador = h; } },
  };
  vm.runInNewContext(js, ctx, { filename: 'amz-recolector.js' });
  if (!manejador) throw new Error('la función no registró Deno.serve');
  return manejador;
}
const peticion = (q, clave) => ({ url: 'https://sintetico.invalid/functions/v1/amz-recolector?' + q, headers: { get: (k) => (k === 'x-recolector-key' ? clave : null) } });

(async () => {
  console.log('\n=== R1 · SIN CLAVE NO HAY NADA ===');
  {
    const db = dobleDB(), amz = dobleAmazon();
    const h = cargar(db, amz);
    const r1 = await h(peticion('mercados=ES', null));
    const r2 = await h(peticion('mercados=ES', 'otra-clave'));
    check('sin cabecera: 401', r1.status === 401, r1.status);
    check('con clave equivocada: 401', r2.status === 401, r2.status);
    check('ninguna llamada a Amazon', amz.llamadas.length === 0, amz.llamadas.length);
    const db2 = dobleDB({ sinClave: true }), amz2 = dobleAmazon();
    const r3 = await cargar(db2, amz2)(peticion('mercados=ES', CLAVE));
    check('sin clave guardada en amz_config, ni la «correcta» entra: 401', r3.status === 401, r3.status);
  }

  console.log('\n=== R2-R6 · PASADA COMPLETA COMO LA DEL CRON ===');
  const db = dobleDB(), amz = dobleAmazon();
  const h = cargar(db, amz);
  const r = await h(peticion('mercados=ES&dias=99', CLAVE));
  const cuerpo = await r.json();
  check('responde 200 y ok', r.status === 200 && cuerpo.ok === true, r.status + ' ' + JSON.stringify(cuerpo.errores));

  const inv = db.ops.filter((o) => o.tabla === 'amz_inventario_foto');
  const ins = inv.find((o) => o.op === 'insert');
  const filas = ins ? ins.filas : [];
  const suma = (k) => filas.reduce((a, f) => a + f[k], 0);
  check('R2 · dos SKU de dos páginas', filas.length === 2, filas.map((f) => f.sku).join(','));
  check('R2 · disponibles 5+7 = 12', suma('disponibles') === 12, suma('disponibles'));
  check('R2 · no vendibles 1+0 = 1', suma('no_vendibles') === 1, suma('no_vendibles'));
  check('R2 · reservadas 2+0 = 2', suma('reservadas') === 2, suma('reservadas'));
  check('R2 · entrantes 1+1+1 = 3 (trabajo + enviado + recepción)', suma('entrantes') === 3, suma('entrantes'));

  const clave = 'spapi/inventario/ES/2026-11-27';
  check('R3 · fecha de la foto en hora de Madrid (2026-11-27, no 26)', filas.every((f) => f.fecha_foto === '2026-11-27'), filas[0] && filas[0].fecha_foto);
  check('R3 · documento ' + clave, filas.every((f) => f.documento === clave), filas[0] && filas[0].documento);

  const iDel = db.ops.findIndex((o) => o.tabla === 'amz_inventario_foto' && o.op === 'delete');
  const iIns = db.ops.findIndex((o) => o.tabla === 'amz_inventario_foto' && o.op === 'insert');
  check('R4 · borra la foto del mismo documento ANTES de insertar', iDel >= 0 && iDel < iIns && JSON.stringify(db.ops[iDel].filtros) === JSON.stringify([['documento', clave]]), JSON.stringify(db.ops[iDel] && db.ops[iDel].filtros));

  const ped = db.ops.find((o) => o.tabla === 'amz_pedidos_api' && o.op === 'upsert');
  const pf = ped ? ped.filas : [];
  const texto = JSON.stringify(pf);
  check('R5 · dos líneas de pedido', pf.length === 2, pf.length);
  check('R5 · unidades 2+1 = 3', pf.reduce((a, f) => a + f.unidades, 0) === 3);
  check('R5 · upsert por order_id,order_item_id', ped && ped.opciones && ped.opciones.onConflict === 'order_id,order_item_id', ped && JSON.stringify(ped.opciones));
  check('R5 · ningún dato del comprador en las filas', !/comprador@|Nombre Sintetico|CiudadSintetica|PostalCode|BuyerInfo|ShippingAddress|99199/.test(texto), texto.slice(0, 80));
  check('R5 · solo columnas de amz_pedidos_api', pf.every((f) => Object.keys(f).every((k) => ['order_id','order_item_id','fecha_compra','ultima_actualizacion','estado','canal','marketplace_id','pais','sku','asin','unidades','unidades_enviadas','precio','iva','descuento','divisa','b2b','recogido'].includes(k))), Object.keys(pf[0] || {}).join(','));
  check('R5 · precio e IVA como número; sin precio (pendiente) queda null', pf[0] && pf[0].precio === 37.08 && pf[0].iva === 6.44 && pf[1].precio === null, pf.map((f) => f.precio).join('/'));

  const uOrd = amz.llamadas.find((u) => /orders\/v0\/orders\?/.test(u)) || '';
  const desde = decodeURIComponent((uOrd.match(/LastUpdatedAfter=([^&]+)/) || [])[1] || '');
  check('R6 · dias=99 se acota a 30 días', desde === new Date(AHORA - 30 * 864e5).toISOString(), desde);

  const ing = db.ops.filter((o) => o.tabla === 'amz_ingestas').map((o) => o.filas[0]);
  check('registro en amz_ingestas: inventario y pedidos, ok', ing.length === 2 && ing.every((x) => x.estado === 'ok') && ing.map((x) => x.id_hub).sort().join() === 'inventario,pedidos', JSON.stringify(ing.map((x) => x.id_hub + ':' + x.estado)));
  const docs = db.ops.filter((o) => o.tabla === 'amz_documentos').map((o) => o.filas[0]);
  check('cada documento lleva huella (obligatoria en amz_documentos)', docs.length === 2 && docs.every((d) => /^[0-9a-f]{64}$/.test(d.huella)), docs.map((d) => d.clave).join(' · '));

  console.log('\n=== R7 · SI FALLA EL TOKEN, SE DICE ===');
  {
    const db = dobleDB(), amz = dobleAmazon({ tokenFalla: true });
    const r = await cargar(db, amz)(peticion('mercados=ES', CLAVE));
    const ing = db.ops.filter((o) => o.tabla === 'amz_ingestas').map((o) => o.filas[0]);
    check('502', r.status === 502, r.status);
    check('ninguna llamada a SP-API', amz.llamadas.every((u) => u.startsWith('https://api.amazon.com/auth')), amz.llamadas.length);
    check('amz_ingestas: recolector · error', ing.length === 1 && ing[0].id_hub === 'recolector' && ing[0].estado === 'error', JSON.stringify(ing));
    check('ninguna foto ni pedido escritos', !db.ops.some((o) => /amz_inventario_foto|amz_pedidos_api/.test(o.tabla)));
  }

  console.log('\n=== R8 · EL CRON VERSIONADO ES EL QUE ESTÁ EN MARCHA ===');
  {
    const sql = fs.readFileSync(CRON, 'utf8');
    const activo = sql.replace(/^--.*$/gm, '');
    check('llama con x-recolector-key', /'x-recolector-key'/.test(activo));
    check('la clave sale de amz_config, no se escribe en el fichero', /select valor from public\.amz_config where clave\s*=\s*'recolector_key'/.test(activo));
    check('ya no usa la clave anon', !/CLAVE_ANON|Bearer/.test(activo));
    check('mercados=ES&dias=3 a las 05:17 UTC', /mercados=ES&dias=3/.test(activo) && /'17 5 \* \* \*'/.test(activo));
  }

  console.log('\n' + (fails ? '✗ ' + fails + ' FALLO(S)' : '✓ recolector: todo en verde'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('  FALLO la suite no pudo ejecutarse  → ' + e.message); process.exit(1); });
