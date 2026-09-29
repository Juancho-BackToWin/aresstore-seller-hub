/* Mide el cierre de V2/V3/A1/E1 sobre los informes REALES: compara el desglose
   por SKU que sale del P&L con el que salía de la fórmula antigua, y enseña
   cuántas referencias cambian de clase ABC.

   Uso:  node herramientas/medir/medir-abc.js <pedidos> [devoluciones] [iva] ...
         (cualquier informe que el hub reconozca; el orden da igual)

   Los costes por unidad salen del §7 del traspaso y son DEDUCCIÓN, no
   confirmación de Juancho. Lo que este script mide con certeza es la FORMA y el
   TAMAÑO de la distorsión, no el beneficio absoluto del negocio.  */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const ficheros = process.argv.slice(2);
if(!ficheros.length){ console.error('uso: node medir-abc.js <fichero...>'); process.exit(2); }
ficheros.forEach(f=>{ if(!fs.existsSync(f)){ console.error('no existe: '+f); process.exit(2); } });

/* Coste por unidad según la familia · §7 del traspaso · DEDUCIDO */
const COSTE = sku => {
  const s = String(sku).toUpperCase();
  if(/^FBASPB01(0[1-9]|10)$/.test(s)) return 5.00;
  if(/^FBA015[0-3]$/.test(s))         return 3.90;
  if(/^FBANS010[4-6]$/.test(s))       return 3.30;
  if(/^FBA0500$/.test(s))             return 3.80;
  if(/^FBA010[1-3]$/.test(s))         return 2.90;
  if(/^FBA01(1[1-9]|2[0-8])(\.1)?$/.test(s)) return 2.27;
  return 0;   // desconocido: el hub lo dirá como «sin coste»
};

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
    await page.waitForTimeout(2500);
    console.log('cargado · ' + path.basename(f));
  }

  /* Catálogo a partir de los SKUs que traen las ventas, con el coste de su
     familia. Sin catálogo, `costOfSales` no tiene de dónde sacar el coste y la
     comparación no mide lo que quiere medir. */
  const cat = await page.evaluate('(()=>{const COSTE=' + String(COSTE) + `;
    countryFilter='ALL'; periodDays = 3650;
    const skus = Array.from(new Set(salesRows({country:'ALL'}).map(r=>String(r.sku))));
    DB.products = skus.map((s,i)=>({id:'p'+i, sku:s, name:s, cogs:COSTE(s), freight:0,
      fba:2.18, referral:15, price:0, channel:'FBA', lots:[]}));
    saveDB(); refreshAll();
    return {skus:skus.length, sinCoste:skus.filter(s=>!COSTE(s)).length,
            desconocidos:skus.filter(s=>!COSTE(s)).slice(0,8)};
  })()`);
  console.log('catálogo deducido · ' + cat.skus + ' SKUs · sin coste de familia: ' + cat.sinCoste +
              (cat.sinCoste ? '  (' + cat.desconocidos.join(', ') + (cat.sinCoste>8?', …':'') + ')' : ''));

  const R = await page.evaluate(()=>{
    countryFilter = 'ALL';
    periodDays = 3650;
    const P = pnl(), N = skuStats();
    /* La fórmula ANTIGUA, tal cual estaba antes del arreglo. */
    const S = salesRows(), m = {};
    S.forEach(r=>{ const k=String(r.sku);
      if(!m[k]) m[k]={sku:k, revenue:0, tax:0, units:0};
      m[k].revenue+=r.revenue; m[k].tax+=r.tax; m[k].units+=r.qty; });
    const feeRate = P.grossInc>0 ? (P.referral+P.fba+P.ship+P.storage+P.otherFee)/P.grossInc : 0.22;
    const ppcRate = P.grossInc>0 ? P.ppc/P.grossInc : 0;
    let viejo = Object.keys(m).map(k=>{ const x=m[k];
      const cb = P.costBySku[k] || {cogs:0};
      return {sku:k, profit:(x.revenue-x.tax) - x.revenue*feeRate - x.revenue*ppcRate - (cb.cogs||0)};
    }).sort((a,b)=>b.profit-a.profit);
    const totPos = viejo.filter(r=>r.profit>0).reduce((a,r)=>a+r.profit,0) || 1;
    let cum=0;
    viejo.forEach(r=>{ if(r.profit>0){ const antes=cum; cum += r.profit/totPos*100;
        r.abc = antes<80?'A':(antes<95?'B':'C'); } else r.abc='D'; });
    const vi = {}; viejo.forEach(r=>vi[r.sku]=r);
    return {
      pnl:{ingreso:+P.grossInc.toFixed(2), unidades:P.units, iva:+P.tax.toFixed(2),
           comision:+P.referral.toFixed(2), fba:+P.fba.toFixed(2), coste:+P.cogs.toFixed(2),
           devoluciones:+P.returnsCost.toFixed(2), ivaNoRep:+P.vatShortfall.toFixed(2),
           ppc:+P.ppc.toFixed(2), fijos:+P.fixed.toFixed(2), reembolsos:+P.reimb.toFixed(2),
           beneficio:+P.profit.toFixed(2), noImputable:+P.noImputable.toFixed(2),
           retUnits:P.retUnits, retImputadas:+P.retImputadas.toFixed(2),
           retDescartadas:P.retDescartadas, retMotivos:P.retPorMotivo},
      nuevo:{suma:+N.reduce((a,r)=>a+r.profit,0).toFixed(2), filas:N.length},
      viejoSuma:+viejo.reduce((a,r)=>a+r.profit,0).toFixed(2),
      cambios: N.map(r=>({sku:r.sku, nuevo:+r.profit.toFixed(2), viejo:+((vi[r.sku]||{}).profit||0).toFixed(2),
                          abcN:r.abc, abcV:(vi[r.sku]||{}).abc||'—',
                          fba:+(r.fba||0).toFixed(2), dev:+(r.returns||0).toFixed(2), vat:+(r.vat||0).toFixed(2)}))
    };
  });

  const P = R.pnl;
  console.log('\n=== CUENTA DE RESULTADOS · SOBRE LOS FICHEROS REALES ===');
  console.log('ingreso bruto           ' + P.ingreso.toFixed(2) + ' €   (' + P.unidades + ' unidades)');
  console.log('IVA                    -' + P.iva.toFixed(2) + ' €');
  console.log('comisión               -' + P.comision.toFixed(2) + ' €');
  console.log('tarifa de logística    -' + P.fba.toFixed(2) + ' €');
  console.log('coste de producto      -' + P.coste.toFixed(2) + ' €');
  console.log('publicidad             -' + P.ppc.toFixed(2) + ' €');
  console.log('devoluciones           -' + P.devoluciones.toFixed(2) + ' €   (' +
              P.retUnits + ' ud · imputadas ' + P.retImputadas + ' · descartadas ' + P.retDescartadas + ')');
  console.log('IVA no repercutido     -' + P.ivaNoRep.toFixed(2) + ' €');
  console.log('gastos fijos           -' + P.fijos.toFixed(2) + ' €');
  console.log('reembolsos             +' + P.reembolsos.toFixed(2) + ' €');
  console.log('BENEFICIO               ' + P.beneficio.toFixed(2) + ' €');
  console.log('  no imputable a SKU    ' + P.noImputable.toFixed(2) + ' €');
  console.log('motivos de devolución   ' + JSON.stringify(P.retMotivos));

  console.log('\n=== EL DESGLOSE POR SKU CONTRA EL P&L ===');
  const totalNuevo = +(R.nuevo.suma + P.noImputable).toFixed(2);
  console.log('suma del desglose NUEVO + no imputable   ' + totalNuevo.toFixed(2) + ' €');
  console.log('beneficio del P&L                        ' + P.beneficio.toFixed(2) + ' €');
  console.log('desfase                                  ' + Math.abs(totalNuevo-P.beneficio).toFixed(2) + ' €' +
              (Math.abs(totalNuevo-P.beneficio) < 0.01 ? '   ✔ cuadra al céntimo' : '   ✗ NO CUADRA'));
  console.log('suma del desglose ANTIGUO                ' + R.viejoSuma.toFixed(2) + ' €   · se pasa ' +
              (R.viejoSuma - P.beneficio).toFixed(2) + ' €');

  const mueve = R.cambios.filter(c=>c.abcN!==c.abcV);
  console.log('\n=== REFERENCIAS QUE CAMBIAN DE CLASE ABC · ' + mueve.length + ' de ' + R.cambios.length + ' ===');
  console.log('SKU              antiguo →   nuevo    clase   tarifa FBA  devoluc.  IVA');
  mueve.forEach(c=>console.log('  ' + c.sku.padEnd(14) + String(c.viejo.toFixed(2)).padStart(9) + ' →' +
    String(c.nuevo.toFixed(2)).padStart(9) + '   ' + c.abcV + '→' + c.abcN +
    String(c.fba.toFixed(2)).padStart(11) + String(c.dev.toFixed(2)).padStart(10) + String(c.vat.toFixed(2)).padStart(8)));
  const pierden = R.cambios.filter(c=>c.viejo>0 && c.nuevo<0);
  console.log('\nreferencias que la pantalla ANTIGUA daba por rentables y pierden dinero: ' + pierden.length +
              (pierden.length ? '  → ' + pierden.map(c=>c.sku).join(', ') : ''));
  if(errores.length) console.log('\nERRORES DE JS: ' + errores.join(' | '));
  await browser.close();
})();
