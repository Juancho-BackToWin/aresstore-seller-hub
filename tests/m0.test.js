/* =========================================================================
   M0 · pruebas del histórico
   Lo que se comprueba aquí no es que la pantalla pinte: es que el archivo de
   historia sea CORRECTO, porque un histórico equivocado es peor que ninguno.
   En concreto: que reimportar no duplique, que las unidades archivadas cuadren
   con las del informe, que un día sin stock se detecte y suba la velocidad
   real, que la compactación no pierda unidades y que vaciar los informes no
   se lleve la historia por delante.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

const OK = c => c ? 'OK   ' : 'FALLO';
let fails = 0;
function check(label, cond, extra){
  if(!cond) fails++;
  console.log('  ' + OK(cond) + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
}

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const page = await browser.newPage({ viewport:{width:1440,height:1000} });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { const t=m.text();
    if(m.type()==='error' && t.indexOf('ERR_CONNECTION')<0 && t.indexOf('Failed to load resource')<0) errors.push('CONSOLE: '+t); });

  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);

  console.log('\n=== M0-A · LA VISTA EXISTE Y NAVEGA ===');
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(400);
  check('hay entrada de menú «Histórico»', !!(await page.$('.nav-item[data-view="historico"]')));
  await page.click('.nav-item[data-view="historico"]');
  await page.waitForTimeout(250);
  check('la vista se muestra', await page.isVisible('#view-historico'));
  check('en frío avisa de que el histórico está vacío',
    /vacío y el reloj corre/.test(await page.textContent('#histBanner')));
  check('la página sigue sin errores de JS', errors.length===0, errors.join(' | ') || 'limpio');

  console.log('\n=== M0-B · LA IMPORTACIÓN RELLENA HACIA ATRÁS ===');
  page.on('dialog', d => d.accept());
  await page.evaluate(()=>loadDemo());
  await page.waitForTimeout(800);
  const s1 = await page.evaluate(()=>historyStats());
  check('el histórico se llena con el pasado del informe, no solo con hoy', s1.span > 100, s1.span+' días desde '+s1.first);
  check('hay días con detalle diario', s1.days > 0, s1.days+' días');
  check('hay al menos una foto de stock', s1.withStock >= 1, s1.withStock);
  check('queda registro de la importación', s1.log >= 1, s1.log+' entradas');

  console.log('\n=== M0-C · LAS CIFRAS ARCHIVADAS CUADRAN CON EL INFORME ===');
  const cuadre = await page.evaluate(()=>{
    const rows = salesRows({from:null, country:'ALL'});
    const u = rows.reduce((a,r)=>a+r.qty,0);
    const r = rows.reduce((a,x)=>a+x.revenue,0);
    const h = historyStats();
    return {infUnits:u, infRev:Math.round(r), hUnits:h.units, hRev:Math.round(h.rev)};
  });
  check('las unidades archivadas son las del informe', cuadre.infUnits===cuadre.hUnits,
    cuadre.hUnits+' vs '+cuadre.infUnits);
  check('el ingreso archivado cuadra (±1 € por redondeo)', Math.abs(cuadre.infRev-cuadre.hRev)<=1,
    cuadre.hRev+' vs '+cuadre.infRev);

  console.log('\n=== M0-D · REIMPORTAR NO DUPLICA (el fallo más caro posible) ===');
  const dup = await page.evaluate(()=>{
    const a = historyStats();
    captureOrders(); captureOrders(); captureOrders();
    const b = historyStats();
    return {antes:a.units, despues:b.units, dAntes:a.days, dDespues:b.days};
  });
  check('tres capturas seguidas dejan las mismas unidades', dup.antes===dup.despues,
    dup.antes+' → '+dup.despues);
  check('y los mismos días', dup.dAntes===dup.dDespues, dup.dAntes+' → '+dup.dDespues);

  console.log('\n=== M0-E · EL DÍA EN CURSO SE MARCA COMO PARCIAL ===');
  const parcial = await page.evaluate(()=>{
    const H = hist(), k = iso(today());
    return {existe: !!H.d[k], parcial: !!(H.d[k] && H.d[k].x)};
  });
  check('hoy está archivado', parcial.existe);
  check('hoy está marcado como día incompleto', parcial.parcial,
    'el informe del día en curso siempre viene a medias');

  console.log('\n=== M0-F · DÍAS SIN STOCK Y VELOCIDAD REAL ===');
  const oos = await page.evaluate(()=>{
    const H = hist();
    const sku = 'ARS-ROD-01';
    // se simulan 10 días seguidos a stock cero y sin ventas, hace 5..14 días
    for(let i=5;i<15;i++){
      const k = iso(addDays(today(),-i));
      const day = H.d[k] || (H.d[k]={});
      day.k = {}; day.k[sku] = [0];
      if(day.s) delete day.s[sku];
    }
    const V = velocityStats(30).filter(r=>r.sku===sku)[0] || {};
    return {oos:V.oos, simple:V.simple, real:V.real, obs:V.observed, units:V.units};
  });
  check('detecta los 10 días sin stock', oos.oos===10, oos.oos+' días');
  check('la velocidad real es mayor que la media simple', oos.real > oos.simple,
    oos.real.toFixed(2)+'/día real vs '+oos.simple.toFixed(2)+'/día simple');
  check('y el reparto es exactamente unidades entre días con stock',
    Math.abs(oos.real - oos.units/(oos.obs-oos.oos)) < 0.001);

  console.log('\n=== M0-G · UN DÍA CON VENTAS NUNCA CUENTA COMO ROTO ===');
  const noFalso = await page.evaluate(()=>{
    const H = hist(), sku='ARS-BAN-02';
    const k = iso(addDays(today(),-3));
    const day = H.d[k] || (H.d[k]={});
    day.k = {}; day.k[sku] = [0];                 // foto vieja a cero…
    day.s = day.s || {}; day.s[sku] = [4, 71.96, 12.49];  // …pero ese día se vendió
    const V = velocityStats(30).filter(r=>r.sku===sku)[0] || {};
    return {oos:V.oos};
  });
  check('stock a cero con ventas no se cuenta como rotura', noFalso.oos===0,
    'una foto vieja no puede inventar un día perdido');

  console.log('\n=== M0-H · COMPACTACIÓN SIN PÉRDIDA ===');
  const comp = await page.evaluate(()=>{
    const a = historyStats();
    const n = compactHistory(30);
    const b = historyStats();
    return {movidos:n, uAntes:a.units, uDespues:b.units, rAntes:Math.round(a.rev), rDespues:Math.round(b.rev),
            dAntes:a.days, dDespues:b.days, meses:b.months, bytesAntes:a.bytes, bytesDespues:b.bytes, cut:b.cut};
  });
  check('compacta días antiguos a mes', comp.movidos>0 && comp.meses>0,
    comp.movidos+' días → '+comp.meses+' meses');
  check('no se pierde ni una unidad', comp.uAntes===comp.uDespues, comp.uAntes+' = '+comp.uDespues);
  check('no se pierde ingreso (±1 €)', Math.abs(comp.rAntes-comp.rDespues)<=1, comp.rAntes+' vs '+comp.rDespues);
  check('el detalle diario se reduce', comp.dDespues < comp.dAntes, comp.dAntes+' → '+comp.dDespues+' días');
  check('ocupa menos espacio', comp.bytesDespues < comp.bytesAntes,
    Math.round(comp.bytesAntes/1024)+' KB → '+Math.round(comp.bytesDespues/1024)+' KB');
  check('queda anotada la fecha de corte', !!comp.cut, comp.cut);

  console.log('\n=== M0-I · LO COMPACTADO NO SE REABRE ===');
  /* Ojo con la aserción: en M0-F se borraron ventas a mano para simular la
     rotura, así que volver a importar SÍ debe cambiar el total — restaurándolo
     al del informe. Lo que se comprueba es que nunca lo supere (duplicado) y
     que los días ya compactados no vuelvan al detalle diario. */
  const reabre = await page.evaluate(()=>{
    const a = historyStats();
    captureOrders(); captureOrders();
    const b = historyStats();
    const inf = salesRows({from:null, country:'ALL'}).reduce((x,r)=>x+r.qty,0);
    return {dAntes:a.days, dDespues:b.days, uDespues:b.units, inf};
  });
  check('reimportar tras compactar no resucita los días viejos', reabre.dAntes===reabre.dDespues,
    reabre.dAntes+' = '+reabre.dDespues);
  check('el total sigue siendo el del informe, sin duplicar', reabre.uDespues===reabre.inf,
    reabre.uDespues+' = '+reabre.inf);

  console.log('\n=== M0-J · VACIAR INFORMES NO BORRA LA HISTORIA ===');
  const wipe = await page.evaluate(()=>{
    const a = historyStats();
    wipeImports();
    const b = historyStats();
    return {antes:a.units, despues:b.units, imports:Object.keys(DB.imports).length};
  });
  check('los informes se vacían', wipe.imports===0);
  check('el histórico sobrevive', wipe.antes===wipe.despues && wipe.despues>0,
    wipe.despues+' unidades archivadas');

  console.log('\n=== M0-K · COPIA DE SEGURIDAD ===');
  const bk = await page.evaluate(()=>{
    const antes = backupDue();
    markBackup();
    const despues = backupDue();
    const payload = Object.assign({}, DB);
    return {antes, despues, llevaHistorico: !!(payload.history && Object.keys(payload.history.d||{}).length + Object.keys(payload.history.m||{}).length)};
  });
  check('sin copia previa el aviso está encendido', bk.antes>0, bk.antes===999?'nunca':bk.antes+' d');
  check('al descargar la copia el aviso se apaga', bk.despues===0);
  check('la copia lleva el histórico dentro', bk.llevaHistorico);

  console.log('\n=== M0-L · LA VISTA RENDERIZA CON DATOS ===');
  await page.click('.nav-item[data-view="historico"]');
  await page.waitForTimeout(300);
  const barras = await page.$$eval('#histChart .cbar', e=>e.length);
  check('pinta 90 barras de días', barras===90, barras);
  check('la tabla de velocidad tiene filas', (await page.$$eval('#histVelTable tr', e=>e.length))>1);
  check('el registro de importaciones tiene filas', (await page.$$eval('#histLogTable tr', e=>e.length))>1);
  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');

  console.log('\n' + (fails ? '✗ ' + fails + ' comprobaciones fallidas' : '✓ todo correcto'));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
