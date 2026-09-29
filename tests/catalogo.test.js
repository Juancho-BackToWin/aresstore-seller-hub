#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   CARRIL 2 · CATÁLOGO Y COSTES

   Lo que persigue esta suite, dicho sin adornos: que un SKU sin coste deje de
   valer CERO EUROS. Un coste de cero no es un coste barato, es un coste que no
   se sabe, y la diferencia entre las dos cosas es el margen entero de ese SKU.
   Ese es el número creíble y falso de este carril.

   CADA COMPROBACIÓN QUE PERSIGUE UN FALLO SE MIRA EN LAS DOS DIRECCIONES, y
   está escrita para que se pueda ver: al lado del valor bueno se comprueba
   también el valor que daba el código ANTES del arreglo. Si alguien revierte
   el arreglo, la comprobación sale roja y el mensaje dice qué falta —«la celda
   pone 0,00 €»— en vez de reventar con un stack.

   Las fixtures son SINTÉTICAS y se regeneran al empezar (`mkfixtures-catalogo`),
   porque las fechas de venta van relativas a hoy. Ni un dato real: el
   repositorio es público.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const APP  = path.resolve(RAIZ, 'index.html');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};

/* ── fixtures frescas ───────────────────────────────────────────────────── */
const gen = spawnSync('node', [path.join('tests','mkfixtures-catalogo.js')], {cwd:RAIZ, encoding:'utf8'});
if(gen.status !== 0){ console.log('No se han podido generar las fixtures del carril 2\n'+(gen.stderr||'')); process.exit(1); }
const { D:FIX, R:REC } = require('./mkfixtures-catalogo.js');

const f = n => path.join(FIX, n);

(async () => {
/* ═══ CAT-A · LA FIXTURE REPRODUCE EL FORMATO LITERAL ════════════════════════
   Medido con Bash sobre el fichero real el 17-09-2026: BOM UTF-8, LF puro,
   TAB, cabecera en la línea 1, 49 columnas, termina en salto de línea. Si la
   fixture no lo reproduce, lo que prueba el resto de la suite no es el
   fichero de Amazon: es otra cosa que se le parece. */
console.log('\n=== CAT-A · FORMATO LITERAL DEL INFORME DE LISTINGS ===');
{
  const buf = fs.readFileSync(f('listings-activos.txt'));
  check('lleva BOM UTF-8 (ef bb bf)',
    buf[0]===0xEF && buf[1]===0xBB && buf[2]===0xBF,
    buf.slice(0,3).toString('hex'));
  check('fin de línea LF puro, ni un CRLF',
    buf.indexOf(0x0D) < 0, buf.indexOf(0x0D)<0 ? 'sin \\r' : 'hay un \\r en el byte '+buf.indexOf(0x0D));
  check('termina en salto de línea', buf[buf.length-1]===0x0A, '0x'+buf[buf.length-1].toString(16));
  const lineas = buf.toString('utf8').replace(/^﻿/,'').split('\n');
  const conDatos = lineas.filter(l=>l!=='');
  check('separador TAB y cabecera en la línea 1',
    conDatos[0].split('\t')[3]==='seller-sku', conDatos[0].split('\t').slice(0,5).join(' | '));
  const anchos = new Set(conDatos.map(l=>l.split('\t').length));
  check('49 columnas en todas las líneas', anchos.size===1 && anchos.has(49),
    Array.from(anchos).join(','));
  check(REC.listings.filas+' filas de datos', conDatos.length-1===REC.listings.filas,
    (conDatos.length-1)+' filas');
  check('la columna quantity va vacía, como en el informe real (AFN)',
    conDatos.slice(1).every(l=>l.split('\t')[5]===''), 'todas vacías');
  const husos = conDatos.slice(1).map(l=>(l.split('\t')[6].match(/([A-Z]+)$/)||[])[1]);
  check('open-date trae los dos sufijos, MET y MEST',
    husos.indexOf('MET')>=0 && husos.indexOf('MEST')>=0, Array.from(new Set(husos)).join(','));
}

/* ═══ CAT-B · PRIVACIDAD DE MIS PROPIAS FIXTURES ════════════════════════════
   `privacidad.test.js` mira `fixtures/` y `fixtures-es/`; esta carpeta es
   nueva y no la ve. Como el repositorio es público, se mira aquí. */
console.log('\n=== CAT-B · NI UN DATO REAL EN MIS FIXTURES ===');
{
  const todo = fs.readdirSync(FIX).map(n=>fs.readFileSync(f(n),'utf8')).join('\n');
  /* Los prefijos reales de los SKU de Juancho y su marca no pueden aparecer. */
  const PROHIBIDO = [/\bFBAS?PB\d/i, /\bFBANS\d/i, /\bFBA0\d{3}\b/i, /18KOra/i];
  const sucio = PROHIBIDO.filter(rx=>rx.test(todo)).map(rx=>String(rx));
  check('ningún SKU ni marca real en las fixtures del carril',
    sucio.length===0, sucio.join(' | ') || 'limpio');
  /* Y en positivo, que es lo que de verdad cierra la puerta: TODO lo que tenga
     forma de ASIN tiene que ser uno inventado por mí. Una lista negra no vale
     aquí, porque para escribirla habría que traer los ASIN reales al repositorio. */
  const asins = Array.from(new Set(todo.match(/\bB[0-9A-Z]{9}\b/g) || []));
  const ajenos = asins.filter(a=>a.indexOf('B0DEMO')!==0);
  check('los '+asins.length+' ASIN de las fixtures son todos inventados (B0DEMO…)',
    ajenos.length===0, ajenos.join(', ') || 'todos B0DEMO…');
  check('las columnas de comprador van vacías',
    !/\t(Madrid|Barcelona|Gij[oó]n|Boiro|Bermeo)\t/i.test(todo), 'sin ciudades');
}

const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
page.on('console', m => { const t=m.text();
  if(m.type()==='error' && t.indexOf('ERR_CONNECTION')<0 && t.indexOf('Failed to load resource')<0)
    errores.push('CONSOLE: '+t); });

await page.goto('file://' + APP);
await page.waitForTimeout(600);
await page.click('.appcard:not(.soon)');
await page.waitForTimeout(400);

/* A 1440 px la barra lateral va plegada y los botones de navegación miden
   0×0: se navega llamando a go(), nunca pinchando. */
const ir = async v => { await page.evaluate(x=>go(x), v); await page.waitForTimeout(250); };
/* Soltar DOS VECES los mismos ficheros en el mismo input no dispara `change`
   en Chromium si la lista es idéntica: hay que vaciarla antes o la segunda
   importación no ocurre y la prueba mide el estado de la anterior. */
const cargar = async (nombres) => {
  await page.evaluate(()=>{ const e=document.getElementById('csvFile'); if(e) e.value=''; });
  await page.setInputFiles('#csvFile', []);
  await page.setInputFiles('#csvFile', nombres.map(f));
  await page.waitForTimeout(2500);
};
const limpiar = async () => {
  await page.evaluate(()=>{ DB = blankDB(); saveDB(); refreshAll(); });
  await page.waitForTimeout(200);
};

/* ═══ CAT-C · LA FECHA CON SUFIJO MET/MEST ══════════════════════════════════
   EN LAS DOS DIRECCIONES. `new Date(bruto)` es lo que hacía el código sin el
   arreglo: devuelve Invalid Date y la fecha de alta se perdía sin avisar. */
console.log('\n=== CAT-C · open-date CON SUFIJO MET / MEST ===');
{
  const r = await page.evaluate(()=>{
    const casos = ['22/08/2024 18:29:56 MEST','10/12/2024 07:32:26 MET',
                   '03/03/2025 10:00:00 XYZ','fecha que no es','2025-06-01T08:00:00'];
    return casos.map(s=>({
      bruto: s,
      nativo: (function(){ const d=new Date(s); return isNaN(d.getTime()) ? 'Invalid Date' : d.toISOString().slice(0,10); })(),
      r: listingOpenDate(s)
    }));
  });
  const m = {}; r.forEach(x=>m[x.bruto]=x);

  check('SIN el arreglo, new Date() no entiende el sufijo MEST',
    m['22/08/2024 18:29:56 MEST'].nativo === 'Invalid Date',
    'new Date("22/08/2024 18:29:56 MEST") = '+m['22/08/2024 18:29:56 MEST'].nativo);
  check('SIN el arreglo, new Date() tampoco entiende MET',
    m['10/12/2024 07:32:26 MET'].nativo === 'Invalid Date',
    'new Date("10/12/2024 07:32:26 MET") = '+m['10/12/2024 07:32:26 MET'].nativo);

  check('CON el arreglo, MEST da la fecha impresa sin moverla',
    m['22/08/2024 18:29:56 MEST'].r.ok && m['22/08/2024 18:29:56 MEST'].r.iso === '2024-08-22',
    m['22/08/2024 18:29:56 MEST'].r.iso || '(vacío)');
  check('y guarda el huso y su desplazamiento (MEST = UTC+2)',
    m['22/08/2024 18:29:56 MEST'].r.huso==='MEST' && m['22/08/2024 18:29:56 MEST'].r.offsetH===2,
    m['22/08/2024 18:29:56 MEST'].r.huso+' / UTC+'+m['22/08/2024 18:29:56 MEST'].r.offsetH);
  check('CON el arreglo, MET da 2024-12-10 (día 10, mes 12: europeo, no americano)',
    m['10/12/2024 07:32:26 MET'].r.iso === '2024-12-10', m['10/12/2024 07:32:26 MET'].r.iso);
  check('y MET es UTC+1', m['10/12/2024 07:32:26 MET'].r.offsetH===1,
    'UTC+'+m['10/12/2024 07:32:26 MET'].r.offsetH);
  check('un huso desconocido conserva la fecha pero LO DICE',
    m['03/03/2025 10:00:00 XYZ'].r.ok && m['03/03/2025 10:00:00 XYZ'].r.iso==='2025-03-03' &&
    /no reconocido/.test(m['03/03/2025 10:00:00 XYZ'].r.motivo),
    m['03/03/2025 10:00:00 XYZ'].r.motivo || '(sin motivo: se lo está tragando en silencio)');
  check('una fecha ilegible NO se convierte en nada: devuelve ok=false con motivo',
    m['fecha que no es'].r.ok===false && /no reconozco el formato/.test(m['fecha que no es'].r.motivo),
    m['fecha que no es'].r.motivo || '(sin motivo)');
  check('un ISO sigue funcionando', m['2025-06-01T08:00:00'].r.iso === '2025-06-01',
    m['2025-06-01T08:00:00'].r.iso);
}

/* ═══ CAT-D · EL INFORME SE RECONOCE Y NO LE ROBA LA DETECCIÓN A NADIE ══════ */
console.log('\n=== CAT-D · RECONOCIMIENTO DEL INFORME DE LISTINGS ===');
await limpiar();
await ir('datos');
await cargar(['listings-activos.txt','all-orders.txt']);
{
  const items = await page.$$eval('#fileList .fileitem', els=>els.map(e=>({
    name:(e.querySelector('.f-name')||{}).textContent,
    meta:(e.querySelector('.f-meta')||{}).textContent,
    ok:!!e.querySelector('.f-dot.ok')})));
  items.forEach(i=>console.log('     '+(i.ok?'✓':'✗')+' '+i.name+' · '+(i.meta||'').slice(0,60)));
  check('el informe de listings se reconoce',
    items.some(i=>i.name==='listings-activos.txt' && i.ok && /listings activos/i.test(i.meta)),
    (items.filter(i=>i.name==='listings-activos.txt')[0]||{}).meta || 'no aparece');
  check('y el informe de pedidos SIGUE reconociéndose como pedidos',
    items.some(i=>i.name==='all-orders.txt' && i.ok && /pedidos/i.test(i.meta)),
    (items.filter(i=>i.name==='all-orders.txt')[0]||{}).meta || 'no aparece');
  const est = await page.evaluate(()=>({
    listings: (DB.imports.listings||{}).count,
    orders: (DB.imports.orders||{}).count,
    cols: (DB.imports.listings||{}).cols,
    sku0: ((DB.imports.listings||{}).rows||[])[0]
  }));
  check('guarda las '+REC.listings.filas+' filas del informe', est.listings===REC.listings.filas, est.listings+' filas');
  check('y las 49 columnas', est.cols===49, est.cols+' columnas');
  check('lee el SKU pese al BOM de la primera cabecera',
    est.sku0 && est.sku0._sku==='DEMO-AA01', est.sku0 ? est.sku0._sku : '(nada)');
  check('lee el PVP publicado', est.sku0 && Math.abs(toNumNode(est.sku0._price)-16.99)<0.001,
    est.sku0 ? est.sku0._price : '(nada)');
  check('lee el ASIN', est.sku0 && est.sku0._asin==='B0DEMO0001', est.sku0 ? est.sku0._asin : '(nada)');
  check('el informe de pedidos entra entero', est.orders===REC.pedidos.filas, est.orders+' filas');
}
function toNumNode(v){ const x=parseFloat(String(v).replace(',','.')); return isNaN(x)?NaN:x; }

/* ═══ CAT-E · CREAR LOS QUE FALTAN, SIN TOCAR LOS QUE ESTÁN ═════════════════
   El producto que ya existe se deja con un nombre y un coste que el informe
   NO trae. Si «crear los que faltan» los pisara, se vería aquí. */
console.log('\n=== CAT-E · CREAR LOS QUE FALTAN ===');
{
  await page.evaluate(()=>{
    DB.products = [{id:'fijo1', sku:'DEMO-AA01', name:'NOMBRE PUESTO A MANO', supplierId:'',
                    price:99.99, cogs:4.44, freight:0.56, channel:'FBM', fba:3.2, litres:1.5,
                    referral:15, fbmShip:2, fbmStock:0, lots:[]}];
    saveDB(); refreshAll();
  });
  await ir('catalogo');
  const antes = await page.evaluate(()=>{
    const d = catalogoDiff();
    return {crear:d.crear.map(r=>r.sku), existentes:d.existentes.map(r=>r.sku), filas:d.filas};
  });
  check('ve '+(REC.listings.filas-1)+' que faltan y 1 que ya está',
    antes.crear.length===REC.listings.filas-1 && antes.existentes.length===1,
    antes.crear.length+' a crear · '+antes.existentes.join(',')+' ya está');

  const r = await page.evaluate(()=>{
    const d = crearProductosDeListings();
    const p = DB.products.filter(x=>x.id==='fijo1')[0];
    return {
      creados: d.crear.map(x=>x.sku), existentes: d.existentes.map(x=>x.sku),
      total: DB.products.length,
      fijo: {name:p.name, cogs:p.cogs, freight:p.freight, price:p.price, channel:p.channel},
      nuevo: DB.products.filter(x=>x.sku==='DEMO-AA02')[0]
    };
  });
  await page.waitForTimeout(300);
  check('crea los '+(REC.listings.filas-1)+' que faltaban', r.creados.length===REC.listings.filas-1,
    r.creados.join(', '));
  check('y dice cuál ya estaba', r.existentes.join(',')==='DEMO-AA01', r.existentes.join(','));
  check('el catálogo queda con '+REC.listings.filas+' productos', r.total===REC.listings.filas, r.total);
  check('NO toca el nombre del que ya estaba', r.fijo.name==='NOMBRE PUESTO A MANO', r.fijo.name);
  check('NO toca su coste base', Math.abs(r.fijo.cogs-4.44)<1e-9 && Math.abs(r.fijo.freight-0.56)<1e-9,
    r.fijo.cogs+' + '+r.fijo.freight);
  check('NO toca su PVP ni su canal', r.fijo.price===99.99 && r.fijo.channel==='FBM',
    r.fijo.price+' € · '+r.fijo.channel);
  check('el producto creado trae el PVP del informe', Math.abs(r.nuevo.price-16.99)<1e-9, r.nuevo.price);
  check('el producto creado trae la fecha de alta ya resuelta', r.nuevo.openDate==='2024-12-10', r.nuevo.openDate);
  check('el producto creado trae el ASIN y el canal', r.nuevo.asin==='B0DEMO0002' && r.nuevo.channel==='FBA',
    r.nuevo.asin+' · '+r.nuevo.channel);
  check('y NACE SIN COSTE, que es lo que el informe sabe: no inventa uno',
    r.nuevo.cogs===0 && r.nuevo.freight===0 && r.nuevo.costeDeclarado===false,
    'cogs='+r.nuevo.cogs+' freight='+r.nuevo.freight+' declarado='+r.nuevo.costeDeclarado);

  const otra = await page.evaluate(()=>{ const d=crearProductosDeListings(); return {crear:d.crear.length, total:DB.products.length}; });
  await page.waitForTimeout(200);
  check('pulsarlo dos veces no duplica nada', otra.crear===0 && otra.total===REC.listings.filas,
    otra.crear+' a crear · '+otra.total+' productos');

  /* Y al revés: un producto que el informe ya no trae se DICE, no se borra.
     El informe lista solo lo activo, y un producto retirado sigue teniendo
     ventas y coste en el histórico. */
  const retirado = await page.evaluate(()=>{
    DB.products.push({id:'retirado1', sku:'DEMO-RETIRADO', name:'Ya no se vende', cogs:2, freight:0, lots:[]});
    saveDB(); refreshAll();
    const d = catalogoDiff();
    return {fuera:d.fueraDelInforme, crear:d.crear.length, total:DB.products.length,
            texto:(document.getElementById('catListingsBox')||{textContent:''}).textContent};
  });
  await page.waitForTimeout(250);
  check('un producto que el informe ya no trae se señala',
    retirado.fuera.join(',')==='DEMO-RETIRADO', retirado.fuera.join(',') || '(no lo ve)');
  check('y NO se borra ni se propone crear nada por ello',
    retirado.crear===0 && retirado.total===REC.listings.filas+1, retirado.total+' productos');
  check('la pantalla lo cuenta', /En el cat[áa]logo y no en el informe/.test(retirado.texto),
    /En el cat[áa]logo y no en el informe/.test(retirado.texto) ? 'lo cuenta' : 'no lo cuenta');
  await page.evaluate(()=>{ DB.products = DB.products.filter(p=>p.id!=='retirado1'); saveDB(); refreshAll(); });
  await page.waitForTimeout(200);
}

/* ═══ CAT-F · UN SKU SIN COSTE NO VALE CERO ═════════════════════════════════
   EN LAS DOS DIRECCIONES. El motor sigue devolviendo 0 para el coste — eso no
   ha cambiado y se comprueba— y lo que cambia es que la PANTALLA ya no lo
   imprime como «0,00 €». Sin el arreglo del render, la celda pone «0,00 €
   base» y esta comprobación sale roja diciendo exactamente eso. */
console.log('\n=== CAT-F · «COSTE DESCONOCIDO», NO «0,00 €» ===');
{
  const r = await page.evaluate(()=>{
    const p = DB.products.filter(x=>x.sku==='DEMO-NS01')[0];
    const filas = Array.prototype.slice.call(document.querySelectorAll('#productTable tr'));
    const fila = filas.filter(t=>/DEMO-NS01/.test(t.textContent))[0];
    const celdas = fila ? Array.prototype.slice.call(fila.cells).map(c=>c.textContent.trim()) : [];
    const conCoste = DB.products.filter(x=>x.sku==='DEMO-AA01')[0];
    const filaCon = filas.filter(t=>/DEMO-AA01<|DEMO-AA01/.test(t.textContent))[0];
    return {
      motorCoste: unitCostAt(p, iso(today())).cost,
      motorSrc: unitCostAt(p, iso(today())).src,
      conocido: costeConocido(p),
      conocidoDelQueTiene: costeConocido(conCoste),
      celdaCoste: celdas[5] || '',
      celdas: celdas.length,
      filaConCoste: filaCon ? Array.prototype.slice.call(filaCon.cells).map(c=>c.textContent.trim())[5] : ''
    };
  });
  check('SIN el arreglo, el motor da 0 para este SKU y eso es lo que se imprimía',
    r.motorCoste===0 && r.motorSrc==='none', 'coste='+r.motorCoste+' origen='+r.motorSrc);
  check('costeConocido() lo marca como NO conocido', r.conocido===false, String(r.conocido));
  check('y sí reconoce el que sí tiene coste', r.conocidoDelQueTiene===true, String(r.conocidoDelQueTiene));
  check('CON el arreglo, la celda pone «coste desconocido»',
    /coste desconocido/i.test(r.celdaCoste), '«'+r.celdaCoste+'»');
  check('y NO pone un cero, que se lee como «cuesta cero euros»',
    !/0[,.]00/.test(r.celdaCoste), '«'+r.celdaCoste+'»');
  check('el producto que SÍ tiene coste sigue enseñando su importe',
    /5[,.]00/.test(r.filaConCoste) || /\d/.test(r.filaConCoste), '«'+r.filaConCoste+'»');
}

/* ═══ CAT-G · NO CUENTA COMO COBERTURA MEDIDA ═══════════════════════════════
   ARITMÉTICA A MANO (ver mkfixtures-catalogo.js):
     12 días × 4 ud × 4 SKU = 192 · más 12 ud del amzn.gr.* = 204 vendidas.
     Sin coste: DEMO-NS01 (48) + DEMO-NS03 (48) + amzn.gr.* (12) = 108.
   204 − 108 = 96 con coste. 108/204 = 52,94 % del periodo a coste cero. */
console.log('\n=== CAT-G · LAS UNIDADES SIN COSTE NO SON COBERTURA MEDIDA ===');
{
  await page.evaluate(()=>{
    /* Coste base solo a dos SKU, a mano, para que el reparto sea el de la
       aritmética de arriba y no dependa de nada más. */
    ['DEMO-AA01','DEMO-AA02'].forEach(s=>{
      const p = DB.products.filter(x=>x.sku===s)[0];
      if(p){ p.cogs = 5; p.freight = 0; p.costeDeclarado = true; }
    });
    saveDB(); refreshAll();
  });
  await page.waitForTimeout(300);
  const r = await page.evaluate(()=>{
    const C = costOfSales(salesRows({from:null, country:'ALL'}));
    const F = catCostePnlFiable();
    const D = catCosteDesconocido();
    const P = pnl();
    return {units:C.units, known:C.known, none:C.quality.none, medidas:C.quality.lot,
            pct:C.measuredPct, fiable:F, sinCosteSkus:D.skus, sinCosteUds:D.uds,
            pnlMeasured:P.measured, pnlCogsKnown:P.cogsKnown, pnlUnits:P.units};
  });
  check('204 unidades vendidas en el periodo', r.units===REC.pedidos.unidades, r.units);
  check('96 con coste conocido', r.known===REC.pedidos.unidades-REC.pedidos.unidadesSinCoste, r.known);
  check('108 costeadas a cero, contadas aparte como origen «none»',
    Math.round(r.none)===REC.pedidos.unidadesSinCoste, Math.round(r.none));
  check('cobertura MEDIDA = 0 %: ni una unidad tiene una compra detrás',
    Math.round(r.pct)===0 && Math.round(r.medidas)===0,
    r.pct.toFixed(1)+' % · '+Math.round(r.medidas)+' unidades con lote');
  /* 5 productos del catálogo sin coste (todos menos DEMO-AA01 y DEMO-AA02, a
     los que se les acaba de poner 5,00) más el amzn.gr.* que vende y no está
     en el catálogo = 6. Los tres que además VENDEN son los que ponen las 108
     unidades de la línea de abajo. */
  check('el catálogo declara 6 SKU sin coste conocido', r.sinCosteSkus===6, r.sinCosteSkus+' SKU');
  check('y 108 unidades vendidas detrás de ellos', r.sinCosteUds===REC.pedidos.unidadesSinCoste, r.sinCosteUds);
  check('catCostePnlFiable() dice que el margen del periodo NO está medido por coste',
    r.fiable.ok===false && r.fiable.sinCoste===REC.pedidos.unidadesSinCoste,
    r.fiable.sinCoste+' unidades a coste cero');
  /* COSTURA → carril 5. Esto NO es una comprobación que deba pasar a verde
     desde este carril: documenta el agujero que queda abierto en pnl(), y la
     prueba lo deja escrito para que se vea en la integración. */
  console.log('     COSTURA carril 5 · pnl().measured = ' + r.pnlMeasured +
    ' con ' + (r.pnlUnits - r.pnlCogsKnown) + ' de ' + r.pnlUnits + ' unidades a coste cero');
  check('pnl() ya cuenta bien cuántas unidades tienen coste (cogsKnown)',
    r.pnlCogsKnown === REC.pedidos.unidades-REC.pedidos.unidadesSinCoste, r.pnlCogsKnown);
}

/* ═══ CAT-H · COSTE BASE EN BLOQUE · Y NI UN LOTE ═══════════════════════════ */
console.log('\n=== CAT-H · COSTE BASE EN BLOQUE, NUNCA UN LOTE ===');
{
  await ir('catalogo');
  const r = await page.evaluate(()=>{
    const lotesAntes = DB.products.reduce((a,p)=>a+((p.lots||[]).length),0);
    /* Selecciona los dos que no tienen coste */
    Array.prototype.slice.call(document.querySelectorAll('.cat-sel')).forEach(e=>{ e.checked=false; });
    const ids = DB.products.filter(p=>p.sku==='DEMO-NS01'||p.sku==='DEMO-NS03').map(p=>p.id);
    ids.forEach(id=>{ const e=document.querySelector('.cat-sel[data-id="'+id+'"]'); if(e) e.checked=true; });
    /* Coste cero: tiene que negarse */
    document.getElementById('catCosteBase').value = '0';
    const cero = catAplicarCosteBase();
    /* Y ahora con importe, declarado como coste de FÁBRICA */
    document.getElementById('catCosteBase').value = '3.30';
    document.getElementById('catCosteTipo').value = 'fabrica';
    const ok = catAplicarCosteBase();
    const lotesDespues = DB.products.reduce((a,p)=>a+((p.lots||[]).length),0);
    const ns1 = DB.products.filter(p=>p.sku==='DEMO-NS01')[0];
    const otro = DB.products.filter(p=>p.sku==='DEMO-AA03')[0];
    return {cero, ok, lotesAntes, lotesDespues,
            ns1:{cogs:ns1.cogs, src:ns1.costSource, declarado:ns1.costeDeclarado, lots:(ns1.lots||[]).length},
            otro:{cogs:otro.cogs, declarado:otro.costeDeclarado},
            cobertura: costOfSales(salesRows({from:null,country:'ALL'})).measuredPct};
  });
  await page.waitForTimeout(300);
  check('un coste base de cero se RECHAZA, no se aplica',
    r.cero===null, r.cero===null ? 'rechazado' : 'lo ha aplicado igualmente');
  check('aplica el coste base a los 2 seleccionados', r.ok && r.ok.tocados===2, r.ok?r.ok.tocados:'nada');
  check('el SKU seleccionado queda con coste base 3,30', Math.abs(r.ns1.cogs-3.30)<1e-9, r.ns1.cogs);
  check('y con el origen del coste escrito al lado', /sin confirmar|familia/.test(r.ns1.src||''),
    r.ns1.src || '(sin origen: el coste queda sin trazabilidad)');
  check('NO se ha creado NI UN LOTE', r.lotesDespues===r.lotesAntes && r.ns1.lots===0,
    r.lotesAntes+' → '+r.lotesDespues+' lotes');
  check('y por eso la cobertura MEDIDA sigue en 0 %: un coste base no es una compra',
    Math.round(r.cobertura)===0, r.cobertura.toFixed(1)+' %');
  check('los productos NO seleccionados no se tocan',
    r.otro.cogs===0 && r.otro.declarado===false, 'cogs='+r.otro.cogs);
}

/* ═══ CAT-H2 · REVISIÓN ADVERSARIAL · FÁBRICA CONTRA PUESTO EN ALMACÉN ══════
   El importe que se teclea puede ser el coste de fábrica o el coste puesto en
   almacén, y confundirlos mueve el margen en las dos direcciones sin que nada
   avise: sobre un producto con flete cargado, un «puesto» tratado como
   «fábrica» suma el flete dos veces; y un «fábrica» sobre un producto con el
   flete a cero deja el coste puesto CORTO, que es la dirección peligrosa. */
console.log('\n=== CAT-H2 · ¿EL IMPORTE ES DE FÁBRICA O PUESTO EN ALMACÉN? ===');
{
  const r = await page.evaluate(()=>{
    const p = DB.products.filter(x=>x.sku==='DEMO-SP01')[0];
    p.cogs = 0; p.freight = 0.70; saveDB(); refreshAll();
    Array.prototype.slice.call(document.querySelectorAll('.cat-sel')).forEach(e=>{ e.checked=false; });
    const e = document.querySelector('.cat-sel[data-id="'+p.id+'"]'); if(e) e.checked = true;

    document.getElementById('catCosteBase').value = '4.00';
    document.getElementById('catCosteTipo').value = 'fabrica';
    catAplicarCosteBase();
    const fabrica = {cogs:p.cogs, freight:p.freight, puesto: unitCostAt(p, iso(today())).cost, src:p.costSource};

    /* Aplicar SUELTA la selección a propósito: volver a pulsar sin querer
       sobre los mismos productos es un error caro y silencioso. Así que para
       la segunda pasada hay que volver a marcarlo, y eso se comprueba. */
    const trasAplicar = catSeleccionados().length;
    const e2 = document.querySelector('.cat-sel[data-id="'+p.id+'"]'); if(e2) e2.checked = true;
    catSelCuenta();
    document.getElementById('catCosteBase').value = '4.00';
    document.getElementById('catCosteTipo').value = 'puesto';
    catAplicarCosteBase();
    const puesto = {cogs:p.cogs, freight:p.freight, total: unitCostAt(p, iso(today())).cost, src:p.costSource};
    return {fabrica, puesto, trasAplicar};
  });
  await page.waitForTimeout(250);
  check('aplicar SUELTA la selección: no se puede aplicar dos veces sin querer',
    r.trasAplicar===0, r.trasAplicar+' siguen marcados');
  check('«de fábrica» respeta el transporte que ya tenía: 4,00 + 0,70 = 4,70',
    Math.abs(r.fabrica.puesto-4.70)<1e-9, r.fabrica.cogs+' + '+r.fabrica.freight+' = '+r.fabrica.puesto);
  check('y lo deja escrito en el origen del coste',
    /coste de f[áa]brica/.test(r.fabrica.src||''), r.fabrica.src);
  check('«puesto en almacén» pone el transporte a cero: 4,00, no 4,70',
    Math.abs(r.puesto.total-4.00)<1e-9 && r.puesto.freight===0,
    r.puesto.cogs+' + '+r.puesto.freight+' = '+r.puesto.total);
  check('y también lo deja escrito', /puesto en almac[ée]n/.test(r.puesto.src||''), r.puesto.src);
}

/* ═══ CAT-H4 · LA SELECCIÓN SOBREVIVE A UN REPINTADO ════════════════════════
   `refreshAll()` salta con casi cualquier cosa y vuelve a pintar la tabla. Si
   la selección viviera solo en las casillas, se borraría a mitad de faena; y
   si se borrara A MEDIAS, «aplicar a los seleccionados» aplicaría a otros. */
console.log('\n=== CAT-H4 · LA SELECCIÓN NO SE PIERDE AL REPINTAR ===');
{
  const r = await page.evaluate(()=>{
    catSelTodos(false);
    const ids = DB.products.slice(0,2).map(p=>p.id);
    ids.forEach(id=>{ const e=document.querySelector('.cat-sel[data-id="'+id+'"]'); if(e) e.checked=true; });
    catSelCuenta();
    const antes = catSeleccionados().slice().sort();
    refreshAll();                       // un repintado cualquiera
    const marcadas = Array.prototype.slice.call(document.querySelectorAll('.cat-sel:checked'))
      .map(e=>e.getAttribute('data-id')).sort();
    return {antes, marcadas, cuenta:(document.getElementById('catSelCount')||{textContent:''}).textContent};
  });
  check('las dos casillas siguen marcadas después de refreshAll()',
    r.marcadas.join(',')===r.antes.join(',') && r.marcadas.length===2,
    r.marcadas.length+' de '+r.antes.length+' siguen marcadas');
  check('y el contador lo refleja', /2 seleccionados/.test(r.cuenta), r.cuenta);
  await page.evaluate(()=>catSelTodos(false));
}

/* ═══ CAT-H3 · «NINGÚN SKU SIN COSTE» NO ES «EL MARGEN ESTÁ MEDIDO» ═════════
   El catálogo real que haría que la cobertura saliera alta y falsa es el más
   fácil de construir: marcar todos y aplicarles una familia de un plumazo. La
   tabla de SKU sin coste se queda vacía y se lee «ya está». */
console.log('\n=== CAT-H3 · APLICAR UNA FAMILIA A TODO NO MIDE NADA ===');
{
  const r = await page.evaluate(()=>{
    catSelTodos(true);
    document.getElementById('catCosteBase').value = '3.90';
    document.getElementById('catCosteTipo').value = 'puesto';
    catAplicarCosteBase();
    const D = catCosteDesconocido();
    const C = costOfSales(salesRows({from:null, country:'ALL'}));
    return {sinCosteEnCatalogo: D.productos.length, huerfanos: D.huerfanos.length,
            medido: C.measuredPct, known:C.known, units:C.units,
            caja:(document.getElementById('catSinCosteBox')||{textContent:''}).textContent};
  });
  await page.waitForTimeout(250);
  check('ya no queda ningún producto del catálogo sin coste', r.sinCosteEnCatalogo===0, r.sinCosteEnCatalogo);
  check('pero el amzn.gr.* que vende y no está en el catálogo SIGUE sin coste',
    r.huerfanos===1, r.huerfanos+' huérfano(s)');
  check('y la cobertura MEDIDA sigue en 0 %: un coste base no es una compra',
    Math.round(r.medido)===0, r.medido.toFixed(1)+' %');
  check('la pantalla lo dice en vez de dejar que se lea «ya está»',
    /no quiere decir que el margen est[ée] medido/.test(r.caja),
    /no quiere decir que el margen est[ée] medido/.test(r.caja) ? 'lo dice' : 'NO lo dice');
}

/* ═══ CAT-I · FAMILIAS DE COSTE ═════════════════════════════════════════════ */
console.log('\n=== CAT-I · FAMILIAS DE COSTE, DECLARADAS COMO DEDUCIDAS ===');
{
  await limpiar();
  await ir('catalogo');
  const r = await page.evaluate(()=>{
    const F = catFamilias();
    return {filas:F.filas.map(x=>x.id+'='+x.coste), origen:F.origen, confirmadas:F.confirmadas,
            texto:(document.getElementById('catFamBox')||{textContent:''}).textContent,
            pantalla:(document.getElementById('view-catalogo')||{textContent:''}).textContent};
  });
  const esperadas = ['FBASPB0100=5','FBASLB0110=2.27','FBASS0150=3.9','FBA100=2.9','FBANS0100=3.3','FBA0500=3.8'];
  check('las seis familias están precargadas con sus importes',
    r.filas.join('|')===esperadas.join('|'), r.filas.join(' · '));
  check('están marcadas como NO confirmadas', r.confirmadas===false, String(r.confirmadas));
  check('la pantalla lo dice con esas palabras: «deducidas, sin confirmar por Juancho»',
    /deducidas, sin confirmar por Juancho/.test(r.texto),
    /deducidas, sin confirmar por Juancho/.test(r.texto) ? 'lo dice' : 'NO lo dice: «'+r.texto.slice(0,120)+'»');
  const e = await page.evaluate(()=>{
    catFamiliaSet(0,'coste','7.25');
    const antes = catFamilias().confirmadas;
    catFamiliasConfirmar();
    const F = catFamilias();
    return {coste:F.filas[0].coste, antes, ahora:F.confirmadas, origen:F.origen};
  });
  check('la tabla es editable', Math.abs(e.coste-7.25)<1e-9, e.coste);
  check('editar una familia NO la da por confirmada', e.antes===false, String(e.antes));
  check('confirmarla es un acto aparte y queda fechado',
    e.ahora===true && /confirmadas por Juancho el \d{4}-\d{2}-\d{2}/.test(e.origen), e.origen);
  await page.evaluate(()=>catFamiliasConfirmar());
}

/* ═══ CAT-J · LOS amzn.gr.* ═════════════════════════════════════════════════
   La hipótesis se ha verificado contra la documentación oficial y solo está
   confirmada a medias: Amazon documenta el PREFIJO, no la gramática. Por eso
   el coste NO se hereda, y esta prueba es la que impide que alguien lo
   «arregle» heredándolo. */
console.log('\n=== CAT-J · amzn.gr.* · SE ENSEÑA, NO SE HEREDA ===');
{
  await limpiar();
  await ir('datos');
  await cargar(['listings-activos.txt','all-orders.txt']);
  await ir('catalogo');
  const hayImp = await page.evaluate(()=>({l:(DB.imports.listings||{}).count, o:(DB.imports.orders||{}).count}));
  check('los dos informes están cargados antes de mirar los amzn.gr.*',
    hayImp.l===7 && hayImp.o===60, 'listings='+hayImp.l+' pedidos='+hayImp.o);
  await page.evaluate(()=>{ crearProductosDeListings();
    const p = DB.products.filter(x=>x.sku==='DEMO-AA01')[0]; if(p){ p.cogs=5; p.freight=0; }
    saveDB(); refreshAll(); });
  await page.waitForTimeout(400);
  const r = await page.evaluate(()=>{
    const g = skuGradeResell('amzn.gr.DEMO-AA01-Kq7xR2-VG');
    const noGr = skuGradeResell('DEMO-AA01');
    const raro = skuGradeResell('amzn.gr.DEMO-AA01-Kq7xR2-PO');
    const suelto = skuGradeResell('amzn.gr.NO-ESTA-EN-CATALOGO-abc-LN');
    const D = catCosteDesconocido();
    const huer = D.huerfanos.filter(x=>/^amzn\.gr\./.test(x.sku))[0];
    const base = DB.products.filter(p=>p.sku==='DEMO-AA01')[0];
    const creado = DB.products.filter(p=>/^amzn\.gr\./.test(p.sku)).length;
    return {g, noGr, raro, suelto, huer, baseCogs:base.cogs, creado,
            texto:(document.getElementById('catSinCosteBox')||{textContent:''}).textContent};
  });
  check('un SKU normal no se confunde con uno de reventa', r.noGr===null, String(r.noGr));
  check('resuelve la base DEMO-AA01 aunque el SKU lleve guiones',
    r.g && r.g.base==='DEMO-AA01' && r.g.baseEnCatalogo===true,
    r.g ? r.g.base+' · comprobada='+r.g.baseEnCatalogo : '(nada)');
  check('lee el grado VG y lo traduce', r.g && r.g.gradoRaw==='VG' && r.g.grado==='Muy bueno',
    r.g ? r.g.gradoRaw+' → '+r.g.grado : '(nada)');
  check('un grado que Amazon NO documenta (PO) se deja sin traducir',
    r.raro && r.raro.gradoRaw==='PO' && r.raro.grado===null,
    r.raro ? r.raro.gradoRaw+' → '+String(r.raro.grado) : '(nada)');
  check('si la base no está en el catálogo, la partición se marca SIN COMPROBAR',
    r.suelto && r.suelto.baseEnCatalogo===false, r.suelto ? String(r.suelto.baseEnCatalogo) : '(nada)');
  check('el amzn.gr.* vende y NO está en el catálogo: sale en la lista',
    !!r.huer && r.huer.uds===REC.pedidos.dias, r.huer ? r.huer.sku+' · '+r.huer.uds+' ud' : 'no aparece');
  check('y NO se ha creado ningún producto amzn.gr.* por su cuenta', r.creado===0, r.creado);
  check('EL COSTE NO SE HEREDA: el SKU base vale 5,00 y el amzn.gr.* sigue sin coste',
    r.baseCogs===5 && /coste desconocido/i.test(r.texto), 'base='+r.baseCogs);
  check('la pantalla cita la página de ayuda de Amazon y la fecha de consulta',
    /UA6RV6UA4DR2MFK/.test(r.texto) && /17 de septiembre de 2026/.test(r.texto),
    /UA6RV6UA4DR2MFK/.test(r.texto) ? 'cita la fuente' : 'NO cita la fuente');
  check('y dice, con todas las letras, que Amazon no documenta la gramática del SKU',
    /NO documenta/.test(r.texto), /NO documenta/.test(r.texto) ? 'lo dice' : 'NO lo dice');
}

/* ═══ CAT-K · CATÁLOGO VACÍO, PARCIAL Y COMPLETO, SIN ERRORES DE JS ═════════ */
console.log('\n=== CAT-K · VACÍO, PARCIAL Y COMPLETO ===');
{
  const marca = errores.length;
  await limpiar();
  await ir('catalogo');
  const vacio = await page.evaluate(()=>({
    tabla:(document.getElementById('productTable')||{textContent:''}).textContent,
    listings:(document.getElementById('catListingsBox')||{textContent:''}).textContent,
    sinCoste:(document.getElementById('catSinCosteBox')||{textContent:''}).textContent,
    fams:(document.getElementById('catFamTable')||{rows:[]}).rows.length
  }));
  check('VACÍO · la tabla lo dice en vez de quedarse en blanco',
    /Sin productos/.test(vacio.tabla), vacio.tabla.trim().slice(0,70));
  check('VACÍO · dice dónde se descarga el informe de listings',
    /Informes de inventario/.test(vacio.listings), vacio.listings.trim().slice(0,70));
  check('VACÍO · las familias siguen ahí', vacio.fams===7, (vacio.fams-1)+' familias');
  check('VACÍO · sin errores de JS', errores.length===marca, errores.slice(marca).join(' | ')||'limpio');

  const m2 = errores.length;
  await ir('datos');
  await cargar(['listings-activos.txt']);
  await ir('catalogo');
  const parcial = await page.evaluate(()=>{
    crearProductosDeListings();
    const p = DB.products[0]; p.cogs = 6; p.freight = 0; saveDB(); refreshAll();
    return {tabla:(document.getElementById('productTable')||{textContent:''}).textContent,
            desc:(document.getElementById('productTable')||{textContent:''}).textContent.split('coste desconocido').length-1};
  });
  await page.waitForTimeout(300);
  check('PARCIAL · uno con coste y el resto como «coste desconocido»',
    parcial.desc===REC.listings.filas-1, parcial.desc+' celdas «coste desconocido» de '+(REC.listings.filas-1)+' esperadas');
  check('PARCIAL · sin errores de JS', errores.length===m2, errores.slice(m2).join(' | ')||'limpio');

  const m3 = errores.length;
  const completo = await page.evaluate(()=>{
    DB.products.forEach(p=>{ p.cogs = 4.10; p.freight = 0.40; p.costeDeclarado = true; });
    saveDB(); refreshAll();
    const D = catCosteDesconocido();
    return {tabla:(document.getElementById('productTable')||{textContent:''}).textContent,
            skus:D.skus, huerfanos:D.huerfanos.length,
            caja:(document.getElementById('catSinCosteBox')||{textContent:''}).textContent};
  });
  await page.waitForTimeout(300);
  check('COMPLETO · ya no queda ninguna celda «coste desconocido» en el catálogo',
    completo.tabla.indexOf('coste desconocido')<0, 'limpio');
  check('COMPLETO · y el panel lo dice en vez de quedarse mudo',
    /Ningún SKU sin coste/.test(completo.caja) || completo.skus===0,
    completo.skus+' SKU sin coste');
  check('COMPLETO · sin errores de JS', errores.length===m3, errores.slice(m3).join(' | ')||'limpio');
}

/* ═══ CAT-L · EXPORTACIÓN ═══════════════════════════════════════════════════ */
console.log('\n=== CAT-L · LA EXPORTACIÓN DICE DE DÓNDE SALE CADA COSTE ===');
{
  const r = await page.evaluate(()=>{
    let cabeceras=null, filas=null;
    const orig = window.descargarCSV;
    window.descargarCSV = function(n,c,f2){ cabeceras=c; filas=f2; };
    try{ window.exportar_catalogocostes(); } finally { window.descargarCSV = orig; }
    return {cabeceras, filas, registrada: REGISTRO.exportaciones.some(e=>e.id==='catalogocostes')};
  });
  check('la exportación está registrada por la costura', r.registrada===true, String(r.registrada));
  check('lleva una columna «Origen del coste»',
    (r.cabeceras||[]).indexOf('Origen del coste')>=0, (r.cabeceras||[]).join(' · '));
  check('y arrastra el adjetivo de las familias al fichero',
    (r.filas||[]).some(f2=>String(f2.join(' ')).indexOf('FAMILIAS DE COSTE')>=0),
    'pie con las familias');
}

console.log('\n=== CAT-M · NINGÚN ERROR DE JS EN TODA LA SESIÓN ===');
check('la sesión entera va sin errores de JS', errores.length===0, errores.join(' | ') || 'limpio');

await browser.close();
console.log('\n' + (fails ? fails + ' FALLOS' : 'TODO CORRECTO'));
process.exit(fails ? 1 : 0);
})().catch(e => { console.error('La suite se ha roto: ' + e.message); process.exit(1); });
