#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   CUMPLIMIENTO · EL NÚMERO EPR QUE ANOTAS CONTRA EL QUE TIENE AMAZON

   Por qué existe. Medido en el informe de EPR real de abril-junio de 2026:
   la columna REGISTRATION_NUMBER venía VACÍA en las filas de los cuatro países
   con ventas. Hasta ahora la pantalla ponía al lado lo que decía el informe y lo
   que anotabas tú, pero no los cruzaba: con un número anotado, un país pasaba a
   «declarado por ti» aunque Amazon no lo tuviera — y es Amazon quien bloquea
   el listado. Y un país con ventas según Amazon pero sin la casilla de mercado
   marcada salía «no activo · el hub no afirma nada».

   Un país por veredicto, con números inventados (el repositorio es público):
     ES · Amazon tiene «ES-RPP-0001»; anotas «es rpp 0001»   → coincide
     DE · filas de envase sin número; no marcado como mercado → amazon-no + vende según Amazon
     FR · Amazon tiene «FR-IDU-1»; anotas «FR-IDU-2»; textil sin número → distinto + otra obligación
     IT · una fila con «IT-CONAI-9» y otra sin número; anotas el mismo → mixto
     PL · Amazon tiene «PL-BDO-5»; no anotas nada              → solo-amazon
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};

const CAB = ['UNIQUE_ACCOUNT_IDENTIFIER','REPORT_PERIOD_START','REPORT_PERIOD_END','ASIN','AMAZON_MARKETPLACE',
  'SHIP_TO_COUNTRY_CODE','SHIP_TO_COUNTRY','ITEM_NAME_IN_ENGLISH','ITEM_NAME_AS_IN_MARKETPLACE','REGISTRATION_NUMBER',
  'EPR_CATEGORY','EPR_SUBCATEGORY1','EPR_SUBCATEGORY2','EPR_SUBCATEGORY3','EPR_SUBCATEGORY4',
  'GL_PRODUCT_GROUP_DESCRIPTION','PRODUCT_TYPE','TOTAL_UNITS_SOLD','UNITS_PER_ASIN','BATTERY_EMBEDDED',
  'ITEM_WEIGHT_WITHOUT_PACKAGE_KG','ITEM_WEIGHT_WITH_PACKAGE_KG','TOTAL_REPORTED_WEIGHT_KG','ITEM_WIDTH_CM',
  'PACKAGE_WIDTH_CM','ITEM_HEIGHT_CM','PACKAGE_HEIGHT_CM','PAPER_KG','GLASS_KG','ALUMINUM_KG','STEEL_KG',
  'PLASTIC_KG','WOOD_KG','OTHER_KG'];
const fila = o => CAB.map(c => o[c]!=null ? o[c] : '').join('\t');
const base = (asin, cc, pais, reg, cat, uds) => ({UNIQUE_ACCOUNT_IDENTIFIER:'DEMO-ACCOUNT', REPORT_PERIOD_START:'2026-04-01',
  REPORT_PERIOD_END:'2026-06-30', ASIN:asin, AMAZON_MARKETPLACE:'amazon.'+cc.toLowerCase(), SHIP_TO_COUNTRY_CODE:cc,
  SHIP_TO_COUNTRY:pais, ITEM_NAME_IN_ENGLISH:'Demo', ITEM_NAME_AS_IN_MARKETPLACE:'Demo', REGISTRATION_NUMBER:reg,
  EPR_CATEGORY:cat, TOTAL_UNITS_SOLD:String(uds), UNITS_PER_ASIN:'1', BATTERY_EMBEDDED:'NO',
  PAPER_KG: /Packag/.test(cat) ? '0.010' : '', PLASTIC_KG: /Packag/.test(cat) ? '0.005' : '',
  TOTAL_REPORTED_WEIGHT_KG: /Packag/.test(cat) ? '' : '0.500'});
const FILAS = [
  base('B0DEMO0001','ES','SPAIN','ES-RPP-0001','Primary Packaging',10),
  base('B0DEMO0002','ES','SPAIN','ES-RPP-0001','Primary Packaging',5),
  base('B0DEMO0003','DE','GERMANY','','Primary Packaging',7),
  base('B0DEMO0004','FR','FRANCE','FR-IDU-1','Primary Packaging',3),
  base('B0DEMO0004','FR','FRANCE','','Textiles',3),
  base('B0DEMO0005','IT','ITALY','IT-CONAI-9','Primary Packaging',2),
  base('B0DEMO0006','IT','ITALY','','Primary Packaging',1),
  base('B0DEMO0007','PL','POLAND','PL-BDO-5','Primary Packaging',4)
];
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'epr-cruce-'));
fs.writeFileSync(path.join(FIX,'epr.txt'), '﻿'+[CAB.join('\t')].concat(FILAS.map(fila)).join('\n')+'\n');

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);
  const ev = async (src) => { try{ return await page.evaluate(src); }
    catch(e){ return {__err: String((e && e.message) || e).split('\n')[0].slice(0,140)}; } };

  /* Mercados: ES, FR, IT, PL marcados como activos; DE NO (Amazon dirá que vende).
     Números anotados: ES con otra forma de escribir el mismo, FR otro número,
     IT el mismo que la fila que lo trae, PL nada. ES con NIF-IVA para que lo
     único que pueda moverle el estado sea el cruce. */
  await page.evaluate(()=>{
    DB = blankDB(); COUNTRIES.forEach(c=>DB.compliance[c.code].active=false);
    ['ES','FR','IT','PL'].forEach(k=>DB.compliance[k].active=true);
    DB.compliance.ES.eprNum='es rpp 0001'; DB.compliance.ES.vatNum='ESX0000000';
    DB.compliance.FR.eprNum='FR-IDU-2';    DB.compliance.FR.vatNum='FRX0000000';
    DB.compliance.IT.eprNum='IT-CONAI-9';  DB.compliance.IT.vatNum='ITX0000000';
    DB.compliance.PL.vatNum='PLX0000000';
    saveDB(); refreshAll(); go('datos');
  });
  await page.setInputFiles('#csvFile', path.join(FIX,'epr.txt'));
  for(let i=0;i<30;i++){ await page.waitForTimeout(150);
    if(await page.evaluate(()=>((DB.imports.epr||{}).count||0)>0)) break; }

  const R = await ev(`(()=>{ const est = cumplEstados(); const o={};
    est.forEach(s=>{ o[s.code] = {estado:s.estado, cruce:s.cruce && s.cruce.tipo, pend:s.pendientes.join(' | '),
      vendeAmazon:s.vendeSegunAmazon}; });
    return o; })()`);
  const e = k => R.__err ? 'sin el arreglo: '+R.__err : (R[k] ? R[k].estado+' · '+R[k].cruce+' · '+R[k].pend : '(sin país)');

  console.log('\n=== EPR-1 · EL MISMO NÚMERO ESCRITO DE OTRA FORMA ES EL MISMO ===');
  check('ES: «es rpp 0001» y «ES-RPP-0001» coinciden', !R.__err && R.ES.cruce==='coincide', e('ES'));
  check('ES queda «declarado» (no hay nada más pendiente)', !R.__err && R.ES.estado==='declarado', e('ES'));

  console.log('\n=== EPR-2 · AMAZON NO TIENE EL NÚMERO, Y AMAZON DICE QUE VENDES ===');
  check('DE: el cruce dice que Amazon no tiene número', !R.__err && R.DE.cruce==='amazon-no', e('DE'));
  check('DE no sale «no activo»: el informe dice que vendiste ahí', !R.__err && R.DE.vendeAmazon===true && R.DE.estado!=='inactivo', e('DE'));
  check('y como no hay número anotado, está en riesgo, con el porqué', !R.__err && R.DE.estado==='riesgo' &&
    /7 unidades vendidas/.test(R.DE.pend) && /no lo tienes marcado/.test(R.DE.pend), e('DE'));
  check('pero no se inventa que guardes stock en un país que no has marcado', !R.__err && !/guardas stock/.test(R.DE.pend), e('DE'));

  console.log('\n=== EPR-3 · AMAZON TIENE OTRO NÚMERO ===');
  check('FR: el cruce lo detecta', !R.__err && R.FR.cruce==='distinto', e('FR'));
  check('FR baja de «declarado» a «parcial», y nombra el número de Amazon', !R.__err && R.FR.estado==='parcial' &&
    /FR-IDU-1/.test(R.FR.pend), e('FR'));
  check('y avisa de que el textil, con su propio registro, va sin número', !R.__err && /textil/.test(R.FR.pend), e('FR'));

  console.log('\n=== EPR-4 · A MEDIAS ===');
  check('IT: una fila con número y otra sin él es «mixto», no «coincide»', !R.__err && R.IT.cruce==='mixto' &&
    R.IT.estado==='parcial', e('IT'));

  console.log('\n=== EPR-5 · AMAZON TIENE UN NÚMERO QUE NO HAS ANOTADO ===');
  check('PL: «solo-amazon», y sin número anotado sigue en riesgo', !R.__err && R.PL.cruce==='solo-amazon' &&
    R.PL.estado==='riesgo' && /PL-BDO-5/.test(R.PL.pend), e('PL'));

  console.log('\n=== EPR-6 · EN PANTALLA ===');
  await page.evaluate(()=>go('cumplimiento'));
  await page.waitForTimeout(400);
  const P = await page.evaluate(()=>{ const t=document.getElementById('cumplEprTabla');
    return t ? Array.from(t.querySelectorAll('[data-cruce]')).map(x=>x.getAttribute('data-cruce')).join(',') : ''; });
  check('la tabla del informe de EPR enseña el cruce de cada país', /amazon-no/.test(P) && /distinto/.test(P) &&
    /coincide/.test(P), P || '(sin columna de cruce)');

  console.log('\n=== EPR-7 · SIN INFORME, EL CRUCE NO AFIRMA NADA ===');
  const S = await ev(`(()=>{ delete DB.imports.epr; const s = cumplEstados().filter(x=>x.code==='ES')[0];
    return {cruce:s.cruce && s.cruce.tipo, estado:s.estado}; })()`);
  check('sin informe de EPR, ES vuelve a «declarado» por tu palabra y el cruce dice que no hay con qué cruzar',
    !S.__err && S.cruce==='sin-informe' && S.estado==='declarado', S.__err || (S.estado+' · '+S.cruce));

  check('sin errores de JS', errors.length===0, errors.slice(0,3).join(' | ') || 'limpio');
  await browser.close();
  console.log(fails ? '\n✗ '+fails+' fallos' : '\n✓ todo correcto');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
