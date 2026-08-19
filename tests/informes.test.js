/* =========================================================================
   Los doce informes del importador, uno a uno

   El hub dice reconocer doce informes de Seller Central. Esta suite comprueba
   dos cosas distintas que se confundían:

     1 · que los reconoce, en inglés y —los siete traducibles— en español;
     2 · que lo que reconoce ALIMENTA algo.

   La segunda importa tanto como la primera. Un informe que se importa, cuenta
   sus filas y se queda ahí es una pantalla que dice «✓ reconocido» sobre un
   dato que no llega a ningún número. Eso no es un error visible: es la
   apariencia de que funciona.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FIX  = path.resolve(__dirname,'fixtures');
const FIXES = path.resolve(__dirname,'fixtures-es');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};

/* fichero → informe que debe salir. Los cinco marcados `soloEn` los sirve
   Amazon únicamente en inglés, así que no llevan pareja en español. */
const EN = [
  ['all-orders.txt',            'orders'],
  ['fba-inventory.txt',         'inventory'],
  ['multicountry.txt',          'multicountry'],
  ['fee-preview.txt',           'fees'],
  ['returns.txt',               'returns'],
  ['search-terms.csv',          'searchterm'],
  ['ledger-detail.txt',         'ledger'],
  ['settlement.txt',            'settlement'],
  ['storage-fees.txt',          'storage'],
  ['inventory-planning.txt',    'planning'],
  ['reimbursements.txt',        'reimb'],
  ['vat-transactions.txt',      'vat']
];
const ES = [
  ['pedidos-es.txt',            'orders'],
  ['inventario-es.txt',         'inventory'],
  ['multipais-es.txt',          'multicountry'],
  ['tarifas-es.txt',            'fees'],
  ['devoluciones-es.txt',       'returns'],
  ['terminos-es.csv',           'searchterm'],
  ['libro-inventario-es.txt',   'ledger']
];

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { const t=m.text();
    if(m.type()==='error' && t.indexOf('ERR_')<0 && t.indexOf('Failed to load resource')<0) errors.push('CONSOLE: '+t); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);

  const limpiar = async () => {
    await page.evaluate(()=>{ DB.imports={}; DB.mappings={}; saveDB();
                              document.getElementById('fileList').innerHTML=''; refreshAll(); });
    await page.waitForTimeout(200);
  };
  /* Se importa cada fichero SOLO, no todos de golpe: importar en lote esconde
     que un informe se haya identificado como otro, porque el segundo pisa al
     primero y las cuentas siguen saliendo. */
  const importar = async (dir, fichero) => {
    await limpiar();
    await page.setInputFiles('#csvFile', path.resolve(dir, fichero));
    await page.waitForTimeout(900);
    return page.evaluate(()=>{
      const el = document.querySelector('#fileList .fileitem');
      const ids = Object.keys(DB.imports);
      return {ok: !!(el && el.querySelector('.f-dot.ok')),
              meta: (el && el.querySelector('.f-meta').textContent) || '',
              id: ids[0] || null, filas: ids[0] ? DB.imports[ids[0]].count : 0,
              como: ids[0] ? DB.imports[ids[0]].how : ''};
    });
  };

  console.log('\n=== INF-A · LOS DOCE, EN INGLÉS, UNO A UNO ===');
  for(const [f, esperado] of EN){
    const r = await importar(FIX, f);
    check(f.padEnd(26)+' → '+esperado,
      r.ok && r.id===esperado,
      (r.id||'no reconocido')+' · '+r.filas+' filas · '+(r.como||r.meta.slice(0,50)));
  }

  console.log('\n=== INF-B · LOS SIETE TRADUCIBLES, EN ESPAÑOL ===');
  /* Los otros cinco (liquidación, almacenaje, salud del inventario,
     reembolsos e IVA) Amazon solo los sirve en inglés y están marcados
     `onlyEn`: no se detectan por puntuación en español a propósito. */
  for(const [f, esperado] of ES){
    const r = await importar(FIXES, f);
    check(f.padEnd(26)+' → '+esperado,
      r.ok && r.id===esperado,
      (r.id||'no reconocido')+' · '+r.filas+' filas · '+(r.como||r.meta.slice(0,50)));
  }

  console.log('\n=== INF-C · UN INFORME QUE NO RECONOZCO SE DICE, NO SE TRAGA ===');
  const desconocido = await importar(FIX, 'desconocido.csv');
  check('el archivo desconocido no se importa como si tal cosa',
    !desconocido.ok && /no lo reconozco/i.test(desconocido.meta), desconocido.meta.slice(0,60));
  const roto = await importar(FIXES, 'terminos-roto.csv');
  check('el CSV desalineado se rechaza en vez de desplazar las columnas',
    !roto.ok && /desalineado/i.test(roto.meta), roto.meta.slice(0,70));

  console.log('\n=== INF-D · QUÉ ALIMENTA CADA UNO ===');
  /* La pregunta que no se hacía nadie. Se importa cada informe solo y se mira
     si algún número del hub se mueve. Los que no mueven nada se declaran
     decorativos aquí y en la pantalla de Datos, en vez de lucir un «✓». */
  const efecto = await page.evaluate(()=>{
    const huella = () => {
      const P = pnl(), I = invStats(), H = historyStats();
      return JSON.stringify([Math.round(P.grossInc), Math.round(P.profit), Math.round(P.cogs),
        Math.round(P.referral), Math.round(P.fba), Math.round(P.storage), Math.round(P.otherFee),
        Math.round(P.ppc), Math.round(P.reimb), Math.round(P.returnsCost), P.retUnits,
        I.reduce((a,r)=>a+r.qty,0), I.length, H.days]);
    };
    return {huella: huella.toString()};
  });
  const consumidos = [];
  const decorativos = [];
  for(const [f, id] of EN){
    await limpiar();
    /* Base común: siempre el informe de pedidos, que es el que da un P&L sobre
       el que se pueda notar el efecto de los demás. */
    await page.setInputFiles('#csvFile', path.resolve(FIX,'all-orders.txt'));
    await page.waitForTimeout(800);
    const antes = await page.evaluate('('+efecto.huella+')()');
    if(id!=='orders'){
      await page.setInputFiles('#csvFile', path.resolve(FIX,f));
      await page.waitForTimeout(800);
    }
    const despues = await page.evaluate('('+efecto.huella+')()');
    const mueve = id==='orders' ? antes!=='[0,0,0,0,0,0,0,0,0,0,0,0,0,0]' : antes!==despues;
    (mueve?consumidos:decorativos).push(id);
    console.log('     '+(mueve?'alimenta  ':'decorativo')+'  '+id.padEnd(14)+f);
  }
  check('los informes que el hub promete usar mueven algún número',
    ['orders','inventory','multicountry','returns','searchterm','settlement','planning','reimb']
      .every(id=>consumidos.indexOf(id)>=0),
    'alimentan: '+consumidos.join(', '));
  check('y los que no alimentan nada están declarados como tales',
    decorativos.slice().sort().join(',')==='ledger,storage,vat',
    'decorativos: '+(decorativos.join(', ')||'ninguno')+
    ' · si esta lista cambia, hay que actualizar lo que la pantalla de Datos promete de cada uno');

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
