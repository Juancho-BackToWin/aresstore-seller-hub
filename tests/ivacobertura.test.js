#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LA DEUDA DE IVA DE UN MES SIN PEDIDOS CARGADOS NO SE RESTA AL BENEFICIO

   Medido el 2-10-2026 con los informes reales: el de IVA cubre mayo, junio y
   julio de 2026; los de pedidos, agosto y septiembre de 2025 y junio y julio de
   2026. En «Todo», el P&L restaba la deuda de mayo contra un ingreso que no
   tenía las ventas de mayo. La línea de IVA era verdadera; el beneficio, falso.

   Laboratorio (cifras inventadas, el repositorio es público):
     · mes A = el de hace 70 días: una venta ES de base 100,00 € a tipo 10 %.
       Deuda: 100 × (21 − 10) / 100 = 11,00 €. HAY un pedido cargado ese mes.
     · mes B = el de hace 130 días: una venta ES de base 200,00 € a tipo 10 %.
       Deuda: 200 × 11 / 100 = 22,00 €. NO hay ningún pedido de ese mes.
   Esperado en «Todo»: la línea del P&L resta 11,00 €, no 33,00 €, y se dice
   que 22,00 € del mes B no se restan. El informe de IVA entero sigue diciendo
   33,00 € (es lo que va a la gestoría).
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

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const page = await (await browser.newContext({timezoneId:'Europe/Madrid'})).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);

  const R = await page.evaluate(()=>{
    try{
      const dia = k => { const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-k); return d; };
      const ddmmyyyy = d => String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear();
      const isoD = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      const A = dia(70), B = dia(130);
      DB = blankDB();
      DB.products = [{id:'p1', sku:'LAB-1', name:'Laboratorio', cogs:1, freight:0, fba:1, referral:15, price:121, channel:'FBA', lots:[]}];
      const venta = (d, base) => ({transactiontype:'SALE', transactioncompletedate:ddmmyyyy(d),
        taxablejurisdiction:'SPAIN', totalactivityvalueamtvatexcl:String(base), totalactivityvaluevatamt:String(base*0.10),
        priceofitemsvatratepercent:'0.1000', producttaxcode:'A_FOOD_DESSERT', sellersku:'LAB-1'});
      DB.imports.vat = {rows:[venta(A,100), venta(B,200)], count:2, file:'lab'};
      const pedido = d => ({amazonorderid:'o'+isoD(d), purchasedate:isoD(d)+'T10:00:00+00:00', fulfillmentchannel:'Amazon',
        saleschannel:'Amazon.es', sku:'LAB-1', asin:'B0LAB00001', itemstatus:'Shipped', quantity:'1',
        itemprice:'121', itemtax:'21', shipcountry:'ES'});
      DB.imports.orders = {rows:[pedido(A)], count:1, file:'lab'};
      periodDays = 0; countryFilter = 'ALL';
      const P = pnl();
      const informe = vatReport().difTuya;
      const sinVentas = P.vatSinVentas || null;
      /* Y si se carga un pedido del mes B, su deuda entra sola. */
      DB.imports.orders.rows.push(pedido(B)); DB.imports.orders.count = 2;
      const P2 = pnl();
      return {linea:P.vatShortfall, informe, sinVentas, linea2:P2.vatShortfall,
              mesB: isoD(B).slice(0,7), sinVentas2: P2.vatSinVentas};
    }catch(e){ return {__err:String(e && e.message || e).slice(0,140)}; }
  });
  const err = R.__err ? 'error: '+R.__err : undefined;

  check('la deuda del informe de IVA entero sigue siendo 33,00 € (la de la gestoría)', !R.__err && near(R.informe, 33),
    err || R.informe+' €');
  check('el P&L resta solo la del mes con pedidos: 11,00 €', !R.__err && near(R.linea, 11),
    err || R.linea+' € (sin el arreglo, 33,00 €)');
  check('y dice cuánto aparta y de qué mes', !R.__err && R.sinVentas && near(R.sinVentas.difTuya, 22) &&
    R.sinVentas.meses.join(',')===R.mesB, err || JSON.stringify(R.sinVentas));
  check('con un pedido del mes B cargado, su deuda entra sola: 33,00 €', !R.__err && near(R.linea2, 33) &&
    R.sinVentas2 && R.sinVentas2.meses.length===0, err || R.linea2+' €');

  /* Revisión adversarial del 3-10-2026.
     R2 · La venta del mes B (sin pedidos) se reembolsa en el mes A (con
          pedidos). Mes A: +11,00 de su venta y −22,00 del reembolso; mes B
          apartado: +22,00. Total del informe: 11 + 22 − 22 = 11,00 €. La resta
          ingenua daba 11 − 22 = −11,00 €: el IVA no repercutido SUBÍA el
          beneficio. Nunca por debajo de cero.
     R4 · Un único pedido CANCELADO en el mes B no lo da por cubierto. */
  const R2 = await page.evaluate(()=>{ try{
      const dia = k => { const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-k); return d; };
      const ddmmyyyy = d => String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear();
      const isoD = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      const A = dia(70), B = dia(130);
      const fila = (d, base, tipo) => ({transactiontype:tipo||'SALE', transactioncompletedate:ddmmyyyy(d),
        taxablejurisdiction:'SPAIN', totalactivityvalueamtvatexcl:String(base), totalactivityvaluevatamt:String(base*0.10),
        priceofitemsvatratepercent:'0.1000', producttaxcode:'A_FOOD_DESSERT', sellersku:'LAB-1'});
      DB.imports.vat = {rows:[fila(A,100), fila(B,200), fila(A,-200,'REFUND')], count:3, file:'lab'};
      const pedido = (d, st) => ({amazonorderid:'o'+isoD(d)+(st||''), purchasedate:isoD(d)+'T10:00:00+00:00', fulfillmentchannel:'Amazon',
        saleschannel:'Amazon.es', sku:'LAB-1', asin:'B0LAB00001', itemstatus:st||'Shipped', quantity:'1', itemprice:'121', itemtax:'21', shipcountry:'ES'});
      DB.imports.orders = {rows:[pedido(A)], count:1, file:'lab'};
      periodDays = 0; countryFilter = 'ALL';
      const r2 = {linea:pnl().vatShortfall, informe:vatReport().difTuya};
      DB.imports.vat = {rows:[fila(A,100), fila(B,200)], count:2, file:'lab'};
      DB.imports.orders = {rows:[pedido(A), pedido(B,'Cancelled')], count:2, file:'lab'};
      const P4 = pnl();
      return Object.assign(r2, {linea4:P4.vatShortfall, meses4:(P4.vatSinVentas||{}).meses});
    }catch(e){ return {__err:String(e&&e.message||e).slice(0,140)}; } });
  check('R2 · un reembolso de un mes apartado no deja la línea de IVA en negativo', !R2.__err && R2.linea>=0 && near(R2.informe, 11),
    R2.__err || ('línea '+R2.linea+' € · informe '+R2.informe+' €'));
  check('R4 · un pedido cancelado no da el mes por cubierto: se restan 11,00 €, no 33,00 €', !R2.__err && near(R2.linea4, 11) &&
    (R2.meses4||[]).length===1, R2.__err || (R2.linea4+' € · meses apartados '+JSON.stringify(R2.meses4)));

  await page.evaluate(()=>{ const dia = k => { const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-k); return d; };
    const ddmmyyyy = d => String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear();
    const isoD = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const venta = (d, base) => ({transactiontype:'SALE', transactioncompletedate:ddmmyyyy(d), taxablejurisdiction:'SPAIN',
      totalactivityvalueamtvatexcl:String(base), totalactivityvaluevatamt:String(base*0.10), priceofitemsvatratepercent:'0.1000',
      producttaxcode:'A_FOOD_DESSERT', sellersku:'LAB-1'});
    DB.imports.vat = {rows:[venta(dia(70),100), venta(dia(130),200)], count:2, file:'lab'};
    DB.imports.orders = {rows:[{amazonorderid:'oA', purchasedate:isoD(dia(70))+'T10:00:00+00:00', fulfillmentchannel:'Amazon',
      saleschannel:'Amazon.es', sku:'LAB-1', asin:'B0LAB00001', itemstatus:'Shipped', quantity:'1', itemprice:'121', itemtax:'21', shipcountry:'ES'}],
      count:1, file:'lab'};
    saveDB(); refreshAll(); go('rentabilidad'); });
  await page.waitForTimeout(400);
  const T = await page.evaluate(()=>document.body.innerText);
  check('la pantalla de Rentabilidad lo explica', /no hay ni un pedido cargado/.test(T),
    /no hay ni un pedido cargado/.test(T) ? 'lo dice' : 'no lo dice');

  check('sin errores de JS', errors.length===0, errors.slice(0,2).join(' | ') || 'limpio');
  await browser.close();
  console.log(fails ? '\n✗ '+fails+' fallos' : '\n✓ todo correcto');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
