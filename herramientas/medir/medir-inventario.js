/* Mide el cruce de los tres informes de inventario (sesión B, §0/B1/B2/B3)
   cargando los ficheros REALES en la aplicación compilada.

   Uso:  node herramientas/medir/medir-inventario.js <gestión> <multipaís> [salud] [devoluciones]

   Los ficheros reales NO están en el repositorio y no deben estarlo.  */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const ficheros = process.argv.slice(2);
if(!ficheros.length){ console.error('uso: node medir-inventario.js <fichero...>'); process.exit(2); }
ficheros.forEach(f=>{ if(!fs.existsSync(f)){ console.error('no existe: '+f); process.exit(2); } });

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: '+e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname,'..','..','index.html'));
  await page.waitForTimeout(700);
  await page.evaluate(()=>{ DB=blankDB(); DB.mappings={}; saveDB(); refreshAll(); });

  for(const f of ficheros){
    await page.setInputFiles('#csvFile', path.resolve(f));
    await page.waitForTimeout(2000);
    const id = await page.evaluate(()=>Object.keys(DB.imports).filter(k=>DB.imports[k]).pop());
    console.log('cargado · ' + path.basename(f) + '  → ' + id);
  }

  const R = await page.evaluate(()=>{
    const c = stockCruce(), f = stockSnapshotDate();
    DB.history = {}; delete DB.settings.stockDate;
    const cap = captureStock();
    return {
      skusG:c.skusGestion, skusM:c.skusMulti, skusS:c.skusSalud,
      disp:c.totDisp, noDisp:c.totNoDisp, total:c.totGestion, multi:c.totMulti,
      porPais:c.porPais, ausentes:c.ausentes,
      soloMulti:c.soloMulti.map(x=>({sku:x.sku, ud:x.multi, salud:x.salud})),
      soloGestion:c.soloGestion.map(x=>x.sku),
      diferencia:c.diferencia, sinExplicar:c.descuadre, noContado:c.noDisponibleNoContado,
      fecha:f.k, fuente:f.src, porque:f.why,
      archivado:cap.skus, sinFecha:!!cap.sinFecha, motivo:cap.motivo||'',
      dias:Object.keys((DB.history||{}).d||{})
    };
  });

  console.log('\n=== CRUCE DE LOS TRES INFORMES · SOBRE LOS FICHEROS REALES ===');
  console.log('Gestión de inventario FBA   ' + String(R.skusG).padStart(3) + ' referencias · ' +
              String(R.disp).padStart(4) + ' disponibles + ' + R.noDisp +
              ' presentes sin poder venderse = ' + R.total + ' en almacén');
  console.log('Inventario multipaís        ' + String(R.skusM).padStart(3) + ' referencias · ' +
              String(R.multi).padStart(4) + ' unidades');
  console.log('Salud del inventario        ' + String(R.skusS).padStart(3) + ' referencias');
  console.log('por país  ' + Object.keys(R.porPais).sort((a,b)=>R.porPais[b]-R.porPais[a])
                              .map(k=>k+' '+R.porPais[k]).join(' · '));
  console.log('\ndiferencia bruta            ' + R.diferencia + ' unidades');
  console.log('  · SKUs ausentes del de gestión   +' + R.ausentes +
              '  (' + R.soloMulti.length + ' referencias, ' +
              (R.multi>0 ? (R.ausentes/R.multi*100).toFixed(0) : '0') + ' % del stock)');
  console.log('  · presentes y no «disponibles»   −' + R.noContado);
  console.log('  · SIN EXPLICAR                    ' + R.sinExplicar +
              (R.sinExplicar===0 ? '   ✔' : '   ✗ hay que mirarlo'));
  if(R.soloMulti.length){
    console.log('\nreferencias que el informe de gestión NO trae:');
    R.soloMulti.forEach(x=>console.log('  ' + x.sku.padEnd(14) + String(x.ud).padStart(4) + ' ud en el multipaís' +
      (x.salud!=null ? '  ·  ' + x.salud + ' ud en el de Salud del inventario' +
        (x.salud===x.ud ? '  (las mismas)' : '  (DISTINTAS)') : '  ·  no está en el de Salud')));
  }
  if(R.soloGestion.length) console.log('\nreferencias solo en el de gestión: ' + R.soloGestion.join(', '));

  console.log('\n=== B1 · FECHA DE LA FOTO ===');
  console.log('fecha        ' + (R.fecha||'—') + '   (fuente: ' + R.fuente + ')');
  console.log('por qué      ' + R.porque);
  console.log('archivado    ' + (R.sinFecha ? 'NO · ' + R.motivo
               : R.archivado + ' referencias en ' + R.dias.join(', ')));
  if(errores.length) console.log('\nERRORES DE JS: ' + errores.join(' | '));
  await browser.close();
})();
