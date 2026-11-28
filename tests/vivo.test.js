#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   EN VIVO · lo que el Hub lee de Supabase (src/29-vivo.js)

   Laboratorio (cifras inventadas, «hoy» = 28-nov-2026 a mediodía, Madrid):

   DINERO POR MES Y PAÍS (amz_panel_ventas_dia)
     2026-10 ES · venta      ingreso 100, comisión −15, logística −20, otros −1, 4 uds
               · reembolso  ingreso −25, comisión +3, 1 ud devuelta
               · publicidad otros −10
               · tarifa     logística −5
       ingresos   = 100 − 25                       =  75,00
       amazon     = (−15 −20 −1) + 3 + (−5)        = −38,00   (sin la publicidad)
       publicidad = −10,00
       neto       = 75 − 38 − 10                   =  27,00
       uds netas  = 4 − 1                          =   3
     2026-10 IT · venta ingreso 50, comisión −7,5, logística −10 → neto 32,50
     2026-11 ES · venta ingreso 10                               → neto 10,00
     Orden: el mes más reciente primero; dentro del mes, por país.
     LA TRAMPA: si la publicidad se sumase dentro de «amazon», amazon saldría
     −48 y el neto seguiría 27. La prueba mira las dos columnas por separado.

   PEDIDOS (amz_panel_pedidos_dia) · 7 días = desde 22-nov; 30 días = desde 30-oct
     28-nov FBA0500 Shipped  2 uds 40 €   → 7 y 30
     22-nov FBA0500 Pending  1 ud  20 €   → 7 y 30 (borde de 7 días)
     21-nov FBA0500 Shipped  3 uds 60 €   → solo 30
     30-oct FBA0103 Shipped  1 ud  15 €   → 30 (borde de 30 días)
     29-oct FBA0103 Shipped  5 uds 75 €   → fuera
     27-nov FBA0103 Canceled 4 uds        → fuera (cancelado)
       FBA0500: 7 días 3, 30 días 6, 120 €;  FBA0103: 0 / 1, 15 €
       total: 7 días 3, 30 días 7, 135 €

   STOCK (amz_panel_inventario): FBA0500 116/28, FBA0103 30/2, FBA0999 10/0
       disponibles 156, 3 SKU

   FRESCURA: inventario ok hoy (0 días, verde); pedidos ok hace 3 días (rojo);
             informe con error (rojo).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b)=> typeof a==='number' && Math.abs(a-b) < 0.005;

const VENTAS = [
  {dia:'2026-10-05', pais:'ES', sku:'FBA0500', tipo:'venta', unidades:4, ingreso:100, iva:21, comision:-15, logistica:-20, otros:-1},
  {dia:'2026-10-09', pais:'ES', sku:'FBA0500', tipo:'reembolso', unidades:1, ingreso:-25, iva:-5.25, comision:3, logistica:0, otros:0},
  {dia:'2026-10-15', pais:'ES', sku:null, tipo:'publicidad', unidades:0, ingreso:0, iva:0, comision:0, logistica:0, otros:-10},
  {dia:'2026-10-20', pais:'ES', sku:null, tipo:'tarifa', unidades:0, ingreso:0, iva:0, comision:0, logistica:-5, otros:0},
  {dia:'2026-10-07', pais:'IT', sku:'FBA0500', tipo:'venta', unidades:2, ingreso:50, iva:11, comision:-7.5, logistica:-10, otros:0},
  {dia:'2026-11-02', pais:'ES', sku:'FBA0103', tipo:'venta', unidades:1, ingreso:10, iva:2.1, comision:0, logistica:0, otros:0}];
const PEDIDOS = [
  {dia:'2026-11-28', pais:'ES', sku:'FBA0500', estado:'Shipped', pedidos:2, unidades:2, importe:40},
  {dia:'2026-11-22', pais:'ES', sku:'FBA0500', estado:'Pending', pedidos:1, unidades:1, importe:20},
  {dia:'2026-11-21', pais:'ES', sku:'FBA0500', estado:'Shipped', pedidos:3, unidades:3, importe:60},
  {dia:'2026-10-30', pais:'ES', sku:'FBA0103', estado:'Shipped', pedidos:1, unidades:1, importe:15},
  {dia:'2026-10-29', pais:'ES', sku:'FBA0103', estado:'Shipped', pedidos:5, unidades:5, importe:75},
  {dia:'2026-11-27', pais:'ES', sku:'FBA0103', estado:'Canceled', pedidos:1, unidades:4, importe:0}];
const INVENTARIO = [
  {fecha_foto:'2026-11-28', sku:'FBA0500', asin:'B0DJCCM1D6', disponibles:116, reservadas:28, entrantes:0, no_vendibles:0},
  {fecha_foto:'2026-11-28', sku:'FBA0103', asin:'B0D7CSXHQJ', disponibles:30, reservadas:2, entrantes:0, no_vendibles:0},
  {fecha_foto:'2026-11-28', sku:'FBA0999', asin:'B0XXXXXXXX', disponibles:10, reservadas:0, entrantes:0, no_vendibles:5}];
const INGESTAS = [
  {id_hub:'inventario', estado:'ok', cuando:'2026-11-28T05:17:00Z', mercados:['ES']},
  {id_hub:'pedidos', estado:'ok', cuando:'2026-11-25T05:17:00Z', mercados:['ES']},
  {id_hub:'informe:X', estado:'error', cuando:'2026-11-27T06:00:00Z', mercados:['ES']}];
const RECOM = [{id:7, creada:'2026-11-28T09:00:00Z', modulo:'auditor', sku:'FBA0500', pais:'ES',
  accion:'<img src=x onerror=alert(1)> título', estado:'ejecutada'}];

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const llamadas = [];
  let modo = 'ok';
  await page.route('https://hqmshjjhzwkuumoiksou.supabase.co/**', async route => {
    const url = route.request().url(); const h = route.request().headers();
    llamadas.push({url, apikey:h['apikey'], auth:h['authorization']||''});
    if(modo==='denegado') return route.fulfill({status:403, contentType:'application/json', body:'{"code":"42501","message":"acceso denegado"}'});
    const f = url.split('/rpc/')[1] || '';
    const body = {amz_panel_ventas_dia:VENTAS, amz_panel_pedidos_dia:PEDIDOS, amz_panel_inventario:INVENTARIO,
                  amz_panel_recomendaciones:RECOM, amz_panel_ingestas:INGESTAS}[f];
    return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(body||[])});
  });
  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);

  console.log('\n1 · Cálculos puros');
  const r = await page.evaluate(([V,P,I,G])=>{
    const hoy = new Date(2026,10,28,12,0,0);
    return {me:vivoDineroPorMes(V), pe:vivoPedidos(P,hoy), st:vivoStock(I), fr:vivoFrescura(G,hoy)};
  }, [VENTAS, PEDIDOS, INVENTARIO, INGESTAS]);
  const es10 = r.me.filter(a=>a.mes==='2026-10'&&a.pais==='ES')[0]||{};
  check('ES oct · ingresos 75,00', near(es10.ingresos,75), es10.ingresos);
  check('ES oct · amazon −38,00 (sin publicidad)', near(es10.amazon,-38), es10.amazon);
  check('ES oct · publicidad −10,00', near(es10.publicidad,-10), es10.publicidad);
  check('ES oct · neto 27,00', near(es10.neto,27), es10.neto);
  check('ES oct · 3 uds netas', es10.unidades===3, es10.unidades);
  const it10 = r.me.filter(a=>a.mes==='2026-10'&&a.pais==='IT')[0]||{};
  check('IT oct · neto 32,50', near(it10.neto,32.5), it10.neto);
  check('orden: noviembre primero', r.me[0] && r.me[0].mes==='2026-11', r.me.map(a=>a.mes+a.pais).join(','));
  const s500 = r.pe.skus.filter(s=>s.sku==='FBA0500')[0]||{}, s103 = r.pe.skus.filter(s=>s.sku==='FBA0103')[0]||{};
  check('FBA0500 · 7 días 3 uds (borde del 22 incluido)', s500.u7===3, s500.u7);
  check('FBA0500 · 30 días 6 uds, 120 €', s500.u30===6 && near(s500.importe30,120), s500.u30+' / '+s500.importe30);
  check('FBA0103 · 30 días 1 ud (borde 30-oct dentro, 29-oct fuera, cancelado fuera)', s103.u30===1 && s103.u7===0, s103.u7+' / '+s103.u30);
  check('total · 7 días 3, 30 días 7, 135 €', r.pe.total.u7===3 && r.pe.total.u30===7 && near(r.pe.total.importe30,135),
        r.pe.total.u7+' / '+r.pe.total.u30+' / '+r.pe.total.importe30);
  check('último pedido 28-nov', r.pe.total.ultimoDia==='2026-11-28', r.pe.total.ultimoDia);
  check('stock · 156 disponibles, 3 SKU', r.st.disponibles===156 && r.st.skus===3, r.st.disponibles+' / '+r.st.skus);
  check('stock · FBA0500 116 disp. 28 res.', r.st.clave.FBA0500 && r.st.clave.FBA0500.disponibles===116 && r.st.clave.FBA0500.reservadas===28);
  const fr = {}; r.fr.forEach(f=>fr[f.fuente]=f);
  check('frescura · inventario de hoy en verde', fr.inventario && fr.inventario.vieja===false && fr.inventario.dias===0);
  check('frescura · pedidos de hace 3 días en rojo', fr.pedidos && fr.pedidos.vieja===true && fr.pedidos.dias===3);
  check('frescura · informe con error en rojo', fr['informe:X'] && fr['informe:X'].vieja===true);

  console.log('\n2 · Sin sesión: no se pide nada a Supabase');
  await page.evaluate(()=>{ localStorage.removeItem('aresstore_sb_sesion'); VIVO.datos=null; VIVO.cargado=null; VIVO.error=''; VIVO.aviso=''; go('vivo'); });
  await page.waitForTimeout(300);
  const sinSesion = await page.evaluate(()=>document.getElementById('vivoCuerpo').innerText);
  check('enseña «Mandarme el enlace»', /Mandarme el enlace/.test(sinSesion));
  check('ninguna llamada a las funciones sin sesión', llamadas.filter(l=>/\/rpc\//.test(l.url)).length===0, llamadas.length);

  console.log('\n3 · Vuelta del enlace mágico y lectura');
  await page.evaluate(()=>{ location.hash = '#access_token=tokA&refresh_token=tokR&expires_in=3600&token_type=bearer';
    vivoLeerRetorno(); VIVO.aviso=''; go('vivo'); });
  await page.waitForTimeout(800);
  const ses = await page.evaluate(()=>({s:JSON.parse(localStorage.getItem('aresstore_sb_sesion')||'null'), h:location.hash}));
  check('guarda la sesión del enlace', ses.s && ses.s.access_token==='tokA' && ses.s.refresh_token==='tokR');
  check('limpia el token de la barra de direcciones', ses.h==='', ses.h);
  const rpc = llamadas.filter(l=>/\/rpc\//.test(l.url));
  check('pide las 5 funciones', rpc.length===5, rpc.map(l=>l.url.split('/rpc/')[1]).join(','));
  check('con la clave publicable, nunca service_role', rpc.every(l=>/^sb_publishable_/.test(l.apikey||'')), rpc[0]&&rpc[0].apikey);
  check('con el token de la sesión', rpc.every(l=>l.auth==='Bearer tokA'));
  const txt = await page.evaluate(()=>document.getElementById('vivoCuerpo').innerText);
  check('pinta el stock 156', /156/.test(txt));
  check('pinta «Neto antes de coste» y no «beneficio» como cifra', /Neto antes de coste/.test(txt));
  check('dice la fecha de corte del dinero (2026-11-02)', /hasta el 2026-11-02/.test(txt));
  check('dice que los pedidos son solo de España', /Solo España/.test(txt));
  const inyectado = await page.evaluate(()=>document.querySelectorAll('#vivoCuerpo img').length);
  check('el texto de la bandeja se escapa (sin <img> inyectado)', inyectado===0, inyectado);
  const html = await page.evaluate(()=>document.documentElement.outerHTML);
  check('index.html no lleva ninguna clave service_role', !/service_role/.test(html));

  console.log('\n4 · Sesión de otro usuario: permiso denegado');
  modo = 'denegado';
  await page.evaluate(()=>{ VIVO.datos=null; VIVO.cargado=null; VIVO.error=''; return vivoCargar(); });
  await page.waitForTimeout(300);
  const den = await page.evaluate(()=>({t:document.getElementById('vivoCuerpo').innerText, d:VIVO.datos}));
  check('dice que la sesión no tiene permiso', /no tiene permiso/.test(den.t));
  check('no deja datos en pantalla', den.d===null && !/156/.test(den.t));

  check('sin errores de página', errors.length===0, errors.join(' | '));
  await browser.close();
  console.log('\n' + (fails ? '✗ ' + fails + ' FALLO' : '✓ todo correcto'));
  process.exit(fails ? 1 : 0);
})();
