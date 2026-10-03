#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   PUBLICIDAD POR SKU · el gasto de una campaña va a los productos que anuncia

   Laboratorio (cifras inventadas):
     SKUs: FBANS0101 y FBANS0102 (grupo FBANS), FBASPB0101 (grupo FBASPB).
     Ventas, 30 días, una unidad al día de cada uno: 25,00 €, 25,00 € y 20,00 €
       → ingresos 750, 750 y 600 (total 2.100), sin IVA.
     Publicidad, un informe que cubre los 30 días (nada extrapolado):
       «18KOra NS EXACTA» 1,00 €/día = 30,00 €
       «Todas AUTO»       0,50 €/día = 15,00 €            total 45,00 €
   Sin asignar (como hasta ahora), todo por ingreso:
       FBASPB0101 = 45 × 600/2.100 = 12,86 €
   Con «18KOra NS EXACTA» → FBANS confirmado:
       30,00 € a FBANS0101 y FBANS0102 por su ingreso: 15,00 € cada uno;
       15,00 € de «Todas AUTO» por ingreso: 5,36 / 5,36 / 4,29.
       FBASPB0101 = 4,29 €; cada FBANS = 20,36 €; suma 45,00 €.
   La sugerencia (el código «NS» del nombre) NO imputa nada hasta confirmarla.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b)=> typeof a==='number' && Math.abs(a-b) < 0.01;
const n2 = x => typeof x==='number' ? x.toFixed(2) : String(x);

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const page = await (await browser.newContext({timezoneId:'Europe/Madrid'})).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);
  const ev = async src => { try{ return await page.evaluate(src); }
    catch(e){ return {__err:String(e&&e.message||e).split('\n')[0].slice(0,140)}; } };

  await page.evaluate(()=>{
    DB = blankDB();
    DB.products = [
      {id:'a', sku:'FBANS0101', name:'Pulsera piedra natural', cogs:2, freight:0, fba:2, referral:15, price:25, channel:'FBA', lots:[]},
      {id:'b', sku:'FBANS0102', name:'Pulsera piedra natural', cogs:2, freight:0, fba:2, referral:15, price:25, channel:'FBA', lots:[]},
      {id:'c', sku:'FBASPB0101', name:'Pulsera cuero trenzado', cogs:3, freight:0, fba:2, referral:15, price:20, channel:'FBA', lots:[]}];
    const dia = k => { const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-k);
      return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    const ventas = [], st = [];
    for(let k=0;k<30;k++){
      [['FBANS0101',25],['FBANS0102',25],['FBASPB0101',20]].forEach(([sku,pr])=>ventas.push({amazonorderid:'o'+k+sku,
        purchasedate:dia(k)+'T10:00:00+00:00', fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku, asin:'B0'+sku,
        itemstatus:'Shipped', quantity:'1', itemprice:String(pr), itemtax:'0', shipcountry:'ES'}));
      st.push({_term:'ns '+k, _campaign:'18KOra NS EXACTA', campaignname:'18KOra NS EXACTA', _from:dia(k), _to:dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'});
      st.push({_term:'todas '+k, _campaign:'Todas AUTO', campaignname:'Todas AUTO', _from:dia(k), _to:dia(k), _spend:'0.5', _sales:'0', _clicks:'5', _impr:'100'});
    }
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'lab'};
    DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
    periodDays = 30; countryFilter = 'ALL'; saveDB();
  });
  const foto = () => ev(`(()=>{ const P = pnl(); const D = (typeof skuBreakdown==='function') ? null : null;
    const SK = {}; (P.porSku||P.skus||[]).forEach(()=>{});
    return {ppc:P.ppc, imputado:P.ppcImputado, sinDestino:P.ppcSinDestino,
      sk: (function(){ const o={}; const lista = (P.desglose||P.porSkuDesglose||[]);
        (Array.isArray(lista)?lista:[]).forEach(b=>o[b.sku]=b.ppc); return o; })(),
      raw: P.skuRows ? null : Object.keys(P).filter(k=>/sku/i.test(k)) }; })()`);

  const base = await ev(`(()=>{ const P=pnl(); return {ppc:P.ppc, imp:P.ppcImputado,
     keys:Object.keys(P).filter(k=>/sku|desglose|break/i.test(k))}; })()`);
  console.log('  (campos del P&L con SKU: '+(base.keys||[]).join(', ')+')');
  check('el laboratorio da 45,00 € de publicidad, nada extrapolado', !base.__err && near(base.ppc, 45), base.__err || n2(base.ppc)+' €');
  check('sin confirmar nada, no se imputa nada', !base.__err && base.imp===0, base.__err || n2(base.imp));

  const sug = await ev(`(()=>{ const C = pubPpcPorCampana(); const o={};
    C.forEach(c=>o[c.campana]={gasto:c.gasto, sug:c.sugerencia&&c.sugerencia.grupo}); return o; })()`);
  check('la campaña «NS» trae la sugerencia FBANS, y «Todas AUTO» ninguna', !sug.__err &&
    sug['18KOra NS EXACTA'] && sug['18KOra NS EXACTA'].sug==='FBANS' && sug['Todas AUTO'] && !sug['Todas AUTO'].sug,
    sug.__err || JSON.stringify(sug));

  const ppcSku = `(()=>{ const P=pnl(); const L = P.bySku || null;
     const o={}; const src = L || (typeof pnlPorSku==='function' ? pnlPorSku() : null) || [];
     (Array.isArray(src)?src:Object.values(src)).forEach(b=>{ if(b && b.sku) o[b.sku]=b.ppc; });
     return {ppc:P.ppc, imp:P.ppcImputado, sk:o}; })()`;
  const antes = await ev(ppcSku);
  await ev(`pubAsignar('18KOra NS EXACTA','FBANS')`);
  const desp = await ev(ppcSku);
  check('confirmado NS → FBANS, se imputan 30,00 €', !desp.__err && near(desp.imp, 30), desp.__err || n2(desp.imp)+' €');
  const sk = desp.sk||{}, ska = antes.sk||{};
  const hay = Object.keys(sk).length>0;
  check('el desglose por SKU es accesible', hay, hay ? Object.keys(sk).join(', ') : 'no encuentro el desglose: '+JSON.stringify(desp).slice(0,120));
  if(hay){
    check('FBASPB0101, que no se anuncia en esa campaña, pasa de 12,86 € a 4,29 €', near(ska.FBASPB0101, 12.857) && near(sk.FBASPB0101, 4.2857),
      n2(ska.FBASPB0101)+' → '+n2(sk.FBASPB0101)+' €');
    check('cada FBANS lleva 20,36 €', near(sk.FBANS0101, 20.357) && near(sk.FBANS0102, 20.357), n2(sk.FBANS0101)+' · '+n2(sk.FBANS0102));
    check('y la suma sigue siendo 45,00 €', near((sk.FBANS0101||0)+(sk.FBANS0102||0)+(sk.FBASPB0101||0), 45), 'suma');
  }

  /* Una campaña asignada a un grupo que no ha vendido en el periodo: su gasto
     no se puede colgar de nadie y vuelve al reparto general. */
  const sd = await ev(`(()=>{ DB.products.push({id:'d', sku:'FBASS0151', name:'Otra', cogs:1, freight:0, fba:1, referral:15, price:10, channel:'FBA', lots:[]});
    pubAsignar('Todas AUTO','FBASS'); const P=pnl(); return {imp:P.ppcImputado, sin:P.ppcSinDestino, ppc:P.ppc}; })()`);
  check('asignada a un grupo sin ventas, su gasto va al reparto y se dice', !sd.__err && near(sd.imp, 30) && near(sd.sin, 15),
    sd.__err || ('imputado '+n2(sd.imp)+' · sin destino '+n2(sd.sin)));

  await page.evaluate(()=>{ go('publicidad'); });
  await page.waitForTimeout(400);
  const ui = await page.evaluate(()=>{ const t=document.getElementById('pubAsigTable'); return t ? t.querySelectorAll('input[data-campana]').length : 0; });
  check('la tabla «Campañas → producto» está en Publicidad', ui>=2, ui+' casillas');

  /* LA SUGERENCIA NO PUEDE MEZCLAR LÍNEAS. Medido con el catálogo real: 26 SKU
     empiezan por «FBA» y mezclan paños y pulseras. Una palabra que solo está en
     el paño (FBA0500) se sugiere con su prefijo exacto; una que está en dos
     líneas cuyo prefijo común (FBA01) recogería una tercera, no se sugiere. */
  const mez = await ev(`(()=>{ DB.products.push(
      {id:'v', sku:'FBA0500', name:'Vehilex gamuza secado coche', cogs:1, freight:0, fba:1, referral:15, price:10, channel:'FBA', lots:[]},
      {id:'p', sku:'FBA0101', name:'Pulseras hombre piedras naturales', cogs:1, freight:0, fba:1, referral:15, price:10, channel:'FBA', lots:[]},
      {id:'q', sku:'FBA0111', name:'Pulsera hombre de cuero trenzado', cogs:1, freight:0, fba:1, referral:15, price:10, channel:'FBA', lots:[]},
      {id:'r', sku:'FBA0150', name:'Pulseras hombre acero trenzado', cogs:1, freight:0, fba:1, referral:15, price:10, channel:'FBA', lots:[]});
    const a = pubSugerencia('Vehilex Paños Italia EXACTA'), b = pubSugerencia('Trenzado manual');
    return {a: a && a.prefijos.join(','), b: b && b.prefijos.join(','), skus: pubSkusDePrefijos(['FBA011','fba0150']).join(',')}; })()`);
  check('«Vehilex» sugiere exactamente FBA0500', !mez.__err && mez.a==='FBA0500', mez.__err || String(mez.a));
  check('una palabra de dos líneas cuyo prefijo común arrastraría otra, no sugiere nada', !mez.__err && mez.b===null, mez.__err || String(mez.b));
  check('varios prefijos, sin distinguir mayúsculas', !mez.__err && mez.skus==='FBA0111,FBA0150', mez.__err || mez.skus);

  check('sin errores de JS', errors.length===0, errors.slice(0,2).join(' | ') || 'limpio');
  await browser.close();
  console.log(fails ? '\n✗ '+fails+' fallos' : '\n✓ todo correcto');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
