#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   FILAS GEMELAS · dos filas idénticas en un mismo fichero son dos transacciones

   Medido el 3-10-2026 en el informe real de transacciones (5.642 filas, cuatro
   años): un pedido de dos unidades del mismo SKU trae DOS filas idénticas —misma
   hora, mismo pedido, mismo importe—; su reembolso, otras dos; sus tarifas de
   devolución, otras dos. Nueve filas así en el informe. El importador las daba
   por «ya estaban» y las tiraba: ventas y reembolsos de menos, sin aviso.

   Regla nueva (multiconjunto): dentro de un fichero cada fila cuenta; entre
   ficheros, una fila que traen los dos cuenta las veces del que más la trae.

   Fixture: el formato literal del informe en español (preámbulo de siete
   líneas, comillas, decimales con coma), cifras inventadas.
     A · un pedido de dos unidades en dos filas iguales (82,00 € cada una) y
         otro pedido distinto (82,00 €): 3 filas, 246,00 €.
     B · el mismo informe A descargado otra vez: no debe sumar nada.
     C · un informe que solo trae UNA de las dos filas gemelas: tampoco suma
         (A ya trae dos), y si se quita A, quedan las de C.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};

const PRE = ['"Incluye transacciones del Marketplace de Amazon, Logística de Amazon y Amazon Webstore"',
  '"Todos los importes en EUR, a menos que se especifique lo contrario"','"Definiciones:"',
  '"Recaudación de impuestos sobre ventas: incluye los impuestos sobre ventas recaudados al comprador."',
  '"Tarifas por venta: incluyen tarifas variables por cierre de venta y tarifas por referencia."',
  '"Tarifas de otras transacciones: incluye reintegros de los cargos por envío y retenciones de envío."',
  '"Otro: incluye importes de transacciones distintas del pedido."'];
const CAB = ['fecha y hora','identificador de pago','tipo','número de pedido','sku','descripción','cantidad',
  'web de Amazon','gestión logística','ciudad de procedencia del pedido','comunidad autónoma de procedencia del pedido',
  'código postal de procedencia del pedido','Formulario de recaudación de impuestos','ventas de productos',
  'impuesto de ventas de productos','abonos de envío','impuestos por abonos de envío','abonos de envoltorio para regalo',
  'impuestos por abonos de envoltorio para regalo','devoluciones promocionales','impuestos de descuentos por promociones',
  'impuesto retenido en el sitio web','tarifas de venta','tarifas de Logística de Amazon','tarifas de otras transacciones',
  'otro','total'];
const q = v => '"'+v+'"';
const fila = (fecha, pedido, sku) => [fecha,'900001','Pedido',pedido,sku,'Producto de prueba','1','amazon.es','Amazon','','','','',
  '100,00','0','0','0','0','0','0','0','0','-15,00','-3,00','0','0','82,00'].map(q).join(',');
const GEMELA = fila('12 sep 2026 22:43:16 UTC','111-0000001-0000001','LAB-01');
const OTRA   = fila('13 sep 2026 10:00:00 UTC','111-0000002-0000002','LAB-02');
const csv = filas => '﻿'+PRE.concat([CAB.map(q).join(',')]).concat(filas).join('\r\n')+'\r\n';

const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'gemelas-'));
fs.writeFileSync(path.join(FIX,'A.csv'), csv([GEMELA, GEMELA, OTRA]));
fs.writeFileSync(path.join(FIX,'B.csv'), csv([GEMELA, GEMELA, OTRA]));
fs.writeFileSync(path.join(FIX,'C.csv'), csv([GEMELA]));

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const page = await (await browser.newContext({timezoneId:'Europe/Madrid'})).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);
  await page.evaluate(()=>{ DB=blankDB(); saveDB(); refreshAll(); go('datos'); });
  const cargar = async n => {
    await page.setInputFiles('#csvFile', []);
    await page.setInputFiles('#csvFile', path.join(FIX, n));
    for(let i=0;i<40;i++){ await page.waitForTimeout(150);
      if(!await page.evaluate(()=>/leyendo/i.test(document.getElementById('fileList').textContent))) break; }
    await page.waitForTimeout(150);
  };
  const estado = () => page.evaluate(()=>{
    const T = (typeof txRows==='function') ? txRows() : [];
    return {filas:(DB.imports.tx||{}).count||0, total:Math.round(T.reduce((a,r)=>a+(r.total||0),0)*100)/100,
            ficheros:((DB.imports.tx||{}).ficheros||[]).map(f=>f.fid)}; });

  console.log('\n=== GEM-1 · DOS FILAS IGUALES EN UN FICHERO SON DOS ===');
  await cargar('A.csv');
  const a = await estado();
  check('el informe A trae 3 transacciones, no 2', a.filas===3, a.filas+' filas (sin el arreglo, 2)');
  check('y suman 246,00 €', Math.abs(a.total-246)<0.005, a.total+' €');

  console.log('\n=== GEM-2 · EL MISMO INFORME OTRA VEZ NO SUMA ===');
  await cargar('B.csv');
  const b = await estado();
  check('A y B juntos siguen siendo 3 filas y 246,00 €', b.filas===3 && Math.abs(b.total-246)<0.005, b.filas+' filas · '+b.total+' €');

  console.log('\n=== GEM-3 · UN FICHERO CON UNA SOLA DE LAS GEMELAS TAMPOCO SUMA ===');
  await cargar('C.csv');
  const c = await estado();
  check('con C, siguen siendo 3 filas', c.filas===3, c.filas+' filas · ficheros '+c.ficheros.join(','));

  console.log('\n=== GEM-4 · QUITAR FICHEROS DEVUELVE LO QUE QUEDA ===');
  const d = await page.evaluate(()=>{
    const fs = (DB.imports.tx.ficheros||[]).map(f=>f.fid);
    impGuardarFusion('tx', impEntradas(DB.imports.tx).filter(e=>e.fid!==fs[0] && e.fid!==fs[1]));
    return {filas: DB.imports.tx.count, quedan:(DB.imports.tx.ficheros||[]).length};
  });
  check('sin A ni B, queda la fila de C', d.filas===1 && d.quedan===1, d.filas+' filas en '+d.quedan+' fichero');
  const e = await page.evaluate(()=>{
    DB.imports = {}; saveDB();
    return true; });
  await cargar('C.csv'); await cargar('A.csv');
  const f = await estado();
  check('cargados en el otro orden (C y luego A), también 3', f.filas===3 && Math.abs(f.total-246)<0.005, f.filas+' filas · '+f.total+' €');

  check('sin errores de JS', errors.length===0, errors.slice(0,2).join(' | ') || 'limpio');
  await browser.close();
  console.log(fails ? '\n✗ '+fails+' fallos' : '\n✓ todo correcto');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
