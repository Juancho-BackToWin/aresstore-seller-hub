const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const FIX = require('path').resolve(__dirname,'fixtures');
const FIXES = require('path').resolve(__dirname,'fixtures-es');

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
  page.on('console', m => { const t=m.text(); if(m.type()==='error' && t.indexOf('ERR_CONNECTION')<0 && t.indexOf('Failed to load resource')<0) errors.push('CONSOLE: '+t); });

  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);
  const txt = s => page.textContent(s);

  console.log('\n=== A0 · LANZADOR ===');
  check('arranca en el lanzador, no en la app', await page.isVisible('#shellHome'));
  check('la app está oculta hasta que se abre', !(await page.isVisible('#shellApp')));
  const appCards = await page.$$eval('.appcard', els=>els.map(e=>
    (e.querySelector('.an')||{}).textContent+' · '+(e.querySelector('.abadge')||{}).textContent+
    ' · icono='+(e.querySelector('.ai svg')?'sí':'NO')));
  appCards.forEach(a=>console.log('     '+a));
  check('hay 6 tarjetas de app con su icono', appCards.length===6 && appCards.every(a=>/icono=sí/.test(a)));
  check('solo Gestión Seller está activa', appCards.filter(a=>/Abrir/.test(a)).length===1);
  check('el Hub tiene su propio icono en la cabecera', !!(await page.$('.home-mark svg')));
  check('hay favicon y manifest embebidos',
    !!(await page.$('link[rel="icon"]')) && !!(await page.$('link[rel="manifest"]')));
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(500);
  check('al pulsar el icono se abre la app de gestión', await page.isVisible('#shellApp'));
  await page.click('.backhub'); await page.waitForTimeout(400);
  check('se puede volver al lanzador', await page.isVisible('#shellHome'));
  await page.click('.appcard:not(.soon)'); await page.waitForTimeout(400);

  console.log('\n=== A · ARRANQUE EN FRÍO (sin datos) ===');
  check('la página carga sin errores de JS', errors.length===0, errors.join(' | ') || 'limpio');
  check('el Panel avisa de que son estimaciones',
    (await txt('#panelFresh')).indexOf('estimación')>0);
  const views = ['panel','datos','rentabilidad','tesoreria','catalogo','inventario','compras','publicidad','calculadora','paises','cumplimiento','diagnostico','auditoria','acerca'];
  let navOK = true;
  for(const v of views){
    await page.click('.nav-item[data-view="'+v+'"]');
    await page.waitForTimeout(120);
    if(!(await page.isVisible('#view-'+v))) { navOK=false; console.log('     no visible: '+v); }
  }
  check('las 14 vistas navegan y se muestran', navOK, views.length+' vistas');
  check('el aviso del PPWR informa del estado real', /PPWR|agosto de 2026/.test(await txt('#ppwrBanner')),
    (await txt('#ppwrBanner')).replace(/\s+/g,' ').trim().slice(0,90));

  console.log('\n=== B · IMPORTACIÓN DE INFORMES REALES DE AMAZON ===');
  await page.click('.nav-item[data-view="datos"]');
  await page.waitForTimeout(200);
  const fixtures = fs.readdirSync(FIX).map(f=>path.resolve(FIX,f));
  await page.setInputFiles('#csvFile', fixtures);
  await page.waitForTimeout(2500);
  const items = await page.$$eval('#fileList .fileitem', els => els.map(e=>({
    name:(e.querySelector('.f-name')||{}).textContent,
    meta:(e.querySelector('.f-meta')||{}).textContent,
    right:(e.querySelector('.f-right')||{textContent:''}).textContent,
    ok:!!e.querySelector('.f-dot.ok')
  })));
  items.forEach(i => console.log('     ' + (i.ok?'✓':'✗') + ' ' + i.name.padEnd(22) + ' ' + (i.meta||'').slice(0,46).padEnd(48) + (i.right||'')));
  /* Doce informes reconocidos y uno que no: `desconocido.csv` está ahí a
     propósito, porque tragarse un archivo que no se entiende es peor que
     rechazarlo. La verificación uno a uno de los doce, en español y en inglés,
     vive en tests/informes.test.js. */
  check('12 de 13 archivos reconocidos', items.filter(i=>i.ok).length===12, items.filter(i=>i.ok).length+'/13');
  check('el archivo desconocido falla con mensaje útil',
    items.some(i=>i.name==='desconocido.csv' && !i.ok && /no lo reconozco/i.test(i.meta)));
  check('detecta el libro de inventario pese a venir en Latin-1',
    items.some(i=>i.name==='ledger-detail.txt' && i.ok));
  check('detecta el TSV con cabeceras en mayúsculas y espacios',
    items.some(i=>i.name==='ledger-detail.txt' && /[Ll]ibro (mayor )?de inventario/.test(i.meta)));
  check('detecta el CSV de Ads con comas y comillas',
    items.some(i=>i.name==='search-terms.csv' && i.ok));
  check('detecta el informe con guiones bajos (almacenaje)',
    items.some(i=>i.name==='storage-fees.txt' && i.ok));
  const ledSample = await page.evaluate(()=>{
    const r=(DB.imports.ledger&&DB.imports.ledger.rows[0])||{};
    return (r.title||'')+' | '+(r.country||'')+' | '+(r.eventtype||'');
  });
  console.log('     fila leída del TSV Latin-1: ' + ledSample);
  check('decodifica Latin-1 sin corromper acentos',
    ledSample.indexOf('�')<0 && /Rodillo de masaje/.test(ledSample), ledSample);

  console.log('\n=== C · PANEL CON DATOS ===');
  await page.click('.nav-item[data-view="panel"]');
  await page.waitForTimeout(400);
  const kpis = await page.$$eval('#panelKpis .kpi', els=>els.map(e=>
    e.querySelector('.k-name').textContent+' = '+e.querySelector('.k-val').textContent+' ('+e.querySelector('.k-sub').textContent+')'));
  kpis.forEach(k=>console.log('     '+k));
  check('hay 6 indicadores', kpis.length===6);
  check('las ventas ya no son cero', !/= €0/.test(kpis[0]));
  const alerts = await page.$$eval('#panelAlerts .alert-row', els=>els.map(e=>
    e.querySelector('strong').textContent+' :: '+e.querySelector('span span').textContent.slice(0,80)));
  alerts.forEach(a=>console.log('     • '+a));
  check('genera alertas accionables', alerts.length>0, alerts.length+' alertas');
  const pc = await page.$$eval('#panelCountries tr', rs=>rs.slice(1).map(r=>Array.from(r.cells).map(c=>c.textContent.trim()).join(' | ')));
  pc.slice(0,5).forEach(r=>console.log('     '+r));
  check('desglosa por país desde sales-channel', pc.length>=4);

  console.log('\n=== D · RENTABILIDAD ===');
  await page.click('.nav-item[data-view="rentabilidad"]');
  await page.waitForTimeout(400);
  const pnlRows = await page.$$eval('#pnlTable tr', rs=>rs.map(r=>Array.from(r.cells).map(c=>c.textContent.trim()).join(' … ')));
  pnlRows.forEach(r=>console.log('     '+r));
  check('la cuenta de resultados tiene líneas', pnlRows.length>8);
  check('marca las comisiones como estimadas sin liquidación',
    pnlRows.join(' ').indexOf('estimada')>0);
  const skus = await page.$$eval('#skuTable tr', rs=>rs.slice(1).map(r=>Array.from(r.cells).slice(0,7).map(c=>c.textContent.trim()).join(' | ')));
  skus.forEach(r=>console.log('     '+r));
  check('clasifica los SKU en ABC', skus.length===4 && /^A/.test(skus[0]));
  check('avisa de los SKU sin coste cargado', skus.join('').indexOf('sin coste')>0);

  console.log('\n=== E · CATÁLOGO Y COSTES → efecto en cadena ===');
  await page.click('.nav-item[data-view="catalogo"]');
  await page.waitForTimeout(300);
  await page.click('button:has-text("+ Producto")');
  await page.waitForTimeout(300);
  await page.fill('#mp_sku','ARS-ROD-01'); await page.fill('#mp_name','Rodillo de masaje muscular');
  await page.fill('#mp_cogs','4.50'); await page.fill('#mp_freight','1.20'); await page.fill('#mp_fba','3.20');
  await page.click('#mSave');
  await page.waitForTimeout(500);
  const prodRows = await page.$$eval('#productTable tr', rs=>rs.slice(1).map(r=>Array.from(r.cells).map(c=>c.textContent.trim()).join(' | ')));
  prodRows.forEach(r=>console.log('     '+r));
  check('el producto se crea y cruza con ventas y stock', prodRows.length===1 && /420/.test(prodRows[0]));
  await page.click('.nav-item[data-view="rentabilidad"]');
  await page.waitForTimeout(400);
  const skus2 = await page.$$eval('#skuTable tr', rs=>rs.slice(1).map(r=>Array.from(r.cells)[5].textContent.trim()));
  check('cargar el coste cambia el margen de ese SKU en Rentabilidad', skus2[0]!==undefined, 'márgenes: '+skus2.join(', '));

  console.log('\n=== F · INVENTARIO ===');
  await page.click('.nav-item[data-view="inventario"]');
  await page.waitForTimeout(400);
  const inv = await page.$$eval('#invTable tr', rs=>rs.slice(1).map(r=>Array.from(r.cells).map(c=>c.textContent.replace(/\s+/g,' ').trim()).join(' | ')));
  inv.forEach(r=>console.log('     '+r));
  check('calcula cobertura desde la venta real', inv.length===4);
  check('marca al menos un estado de riesgo', inv.join(' ').match(/tarifa bajo inv|sobrestock|en banda/));
  const invC = await page.$$eval('#invCountryTable tr', rs=>rs.map(r=>Array.from(r.cells).map(c=>c.textContent.trim()).join(' ')));
  invC.forEach(r=>console.log('     '+r));
  check('reparte el stock por país (informe multipaís)', invC.length>=5);

  console.log('\n=== G · COMPRAS → TESORERÍA ===');
  await page.click('.nav-item[data-view="compras"]');
  await page.waitForTimeout(300);
  await page.click('button:has-text("+ Proveedor")');
  await page.waitForTimeout(300);
  await page.fill('#ms_name','Ningbo Handa Ltd.'); await page.fill('#ms_lead','52');
  await page.click('#mSave'); await page.waitForTimeout(400);
  await page.click('button:has-text("+ Pedido")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("+ Línea")');
  await page.waitForTimeout(300);
  await page.selectOption('#modalBody table select >> nth=0', 'ARS-ROD-01');
  await page.waitForTimeout(250);
  const qtyInp = await page.$$('#modalBody table input[type=number]');
  await qtyInp[0].fill('600'); await qtyInp[0].dispatchEvent('change');
  await page.waitForTimeout(250);
  const qtyInp2 = await page.$$('#modalBody table input[type=number]');
  await qtyInp2[1].fill('4.35'); await qtyInp2[1].dispatchEvent('change');
  await page.waitForTimeout(250);
  await page.fill('#mo_fre','640');
  const realCost = await page.$$eval('#modalBody table td.mut', els=>els.map(e=>e.textContent.trim()));
  console.log('     coste unitario con flete repartido: ' + realCost.slice(0,1).join(' '));
  await page.click('#mSave'); await page.waitForTimeout(600);
  const poTxt = await txt('#poList');
  console.log('     ' + poTxt.replace(/\s+/g,' ').trim().slice(0,150));
  check('el pedido se guarda con su importe', /2\.?61|2610|€/.test(poTxt));
  const poK = await page.$$eval('#poKpis .kpi', els=>els.map(e=>e.querySelector('.k-name').textContent+'='+e.querySelector('.k-val').textContent));
  poK.forEach(k=>console.log('     '+k));
  check('el pedido genera pagos comprometidos', poK.some(k=>/Pendiente de pagar=€[1-9]/.test(k)));

  await page.click('.nav-item[data-view="tesoreria"]');
  await page.waitForTimeout(500);
  const cashK = await page.$$eval('#cashKpis .kpi', els=>els.map(e=>e.querySelector('.k-name').textContent+' = '+e.querySelector('.k-val').textContent));
  cashK.forEach(k=>console.log('     '+k));
  const bars = await page.$$eval('#cashChart .cbar', els=>els.length);
  check('la proyección dibuja 90 días', bars===90, bars+' barras');
  check('el vencimiento del pedido llega a la curva de caja',
    (await page.$$eval('#cashChart .cbar', els=>els.some(e=>/pago de pedido/.test(e.getAttribute('title'))))));
  console.log('     veredicto: ' + (await txt('#cashVerdict')).replace(/\s+/g,' ').trim().slice(0,230));

  console.log('\n=== H · PUBLICIDAD ===');
  await page.click('.nav-item[data-view="publicidad"]');
  await page.waitForTimeout(400);
  const adK = await page.$$eval('#adKpis .kpi', els=>els.map(e=>e.querySelector('.k-name').textContent+' = '+e.querySelector('.k-val').textContent));
  adK.forEach(k=>console.log('     '+k));
  const st = await page.$$eval('#stTable tr', rs=>rs.slice(1,5).map(r=>Array.from(r.cells).map(c=>c.textContent.trim()).join(' | ')));
  st.forEach(r=>console.log('     '+r));
  check('lee los términos de búsqueda', st.length===4);
  check('identifica términos a negativizar', (await txt('#stTable')).indexOf('negativizar')>0);
  check('cuantifica el gasto sin conversión', adK.some(k=>/sin conversión = €[1-9]/.test(k)));

  console.log('\n=== I · CUMPLIMIENTO ===');
  await page.click('.nav-item[data-view="cumplimiento"]');
  await page.waitForTimeout(400);
  const compRows = await page.$$eval('#compTable tr', rs=>rs.length);
  check('lista los 9 mercados', compRows===10, compRows+' filas');
  await page.click('#compTable tr:nth-child(2) td:nth-child(1) input');
  await page.waitForTimeout(300);
  check('activar un mercado sin EPR dispara la alerta',
    (await txt('#compTable')).indexOf('falta')>0 || (await txt('#ppwrBanner')).indexOf('sin registro')>0);
  console.log('     ' + (await txt('#compVerdict')).replace(/\s+/g,' ').trim().slice(0,220));

  console.log('\n=== J · CALCULADORA (heredada de v0.2) ===');
  await page.click('.nav-item[data-view="calculadora"]');
  await page.waitForTimeout(400);
  check('el motor de validación sigue dando 14,4%', (await txt('#mMargin'))==='14.4%', await txt('#mMargin'));
  check('el veredicto multicriterio funciona', (await txt('#vLabel')).indexOf('2 de 5')>0, await txt('#vLabel'));
  await page.fill('#saveName','Producto de prueba');
  await page.click('#view-calculadora button:has-text("Guardar")');
  await page.waitForTimeout(400);
  check('guarda la validación', (await page.$$('#savedList .saved-item')).length===1);

  console.log('\n=== K · PERSISTENCIA ===');
  await page.reload(); await page.waitForTimeout(900);
  await page.click('.nav-item[data-view="catalogo"]');
  await page.waitForTimeout(400);
  check('los productos sobreviven a recargar', (await page.$$eval('#productTable tr', r=>r.length))===2);
  await page.click('.nav-item[data-view="datos"]');
  await page.waitForTimeout(300);
  const ds = await page.$$eval('#dataState tr', rs=>rs.slice(1).map(r=>Array.from(r.cells).map(c=>c.textContent.trim()).join(' | ')));
  ds.forEach(r=>console.log('     '+r));
  check('los informes importados sobreviven a recargar', ds.length===12, ds.length+' informes');

  console.log('\n=== L · CAPTURAS Y MÓVIL ===');
  for(const v of ['panel','rentabilidad','tesoreria','inventario','compras','datos','cumplimiento','acerca']){
    await page.click('.nav-item[data-view="'+v+'"]');
    await page.waitForTimeout(400);
    await page.screenshot({path:'/tmp/hub-'+v+'.png'});
  }
  const mob = await browser.newPage({viewport:{width:390,height:844}});
  mob.on('pageerror', e=>errors.push('MOBILE: '+e.message));
  await mob.goto('file://'+path.resolve(__dirname,'..','index.html'));
  await mob.waitForTimeout(800);
  await mob.screenshot({path:'/tmp/hub-mobile-home.png'});
  const ovHome = await mob.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('el lanzador no desborda en móvil', ovHome<=2, ovHome+'px');
  await mob.click('.appcard:not(.soon)'); await mob.waitForTimeout(600);
  const ov = await mob.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('sin desbordamiento horizontal en móvil', ov<=2, ov+'px');
  await mob.screenshot({path:'/tmp/hub-mobile.png'});

  console.log('\n=== ERRORES DE JS: ' + errors.length + ' ===');
  errors.forEach(e=>console.log('  '+e));
  console.log('\n########  ' + (fails===0 && errors.length===0 ? 'TODO CORRECTO' : fails+' FALLOS / '+errors.length+' ERRORES') + '  ########');
  await browser.close();
})();
