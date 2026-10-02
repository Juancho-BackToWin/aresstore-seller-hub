/* =========================================================================
   El informe de vista previa de tarifas, como lo sirve Amazon de verdad

   Los fixtures de este fichero están SINTETIZADOS a partir de la
   especificación de cabecera y de los recuentos del encargo del 23 de agosto.
   Ni una celda sale de un informe de Juancho: el repositorio es público y el
   informe de pedidos trae ciudad y código postal de compradores reales.

   Lo que se comprueba es lo que se usa para calcular, no lo que se reconoce.
   ========================================================================= */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> Math.abs(a-b) < (t==null?0.01:t);
const D = fs.mkdtempSync(path.join(os.tmpdir(),'tarifas-'));

/* Cabecera de 30 columnas del formato nuevo. Las tres que importan y que el
   hub no leía: `amazon-store`, `currency` y la tarifa doméstica, que Amazon
   escribe en ortografía británica —`fulfilment`, una sola `l`— y con un
   `domestic` en medio que ningún alias contemplaba. */
const H=['sku','fnsku','asin','amazon-store','product-name','brand','fulfilled-by',
 'has-local-inventory','your-price','sales-price','longest-side','median-side','shortest-side',
 'item-package-weight','unit-of-weight','product-size-tier','currency','estimated-fee-total',
 'estimated-referral-fee-per-unit','estimated-variable-closing-fee',
 'estimated-order-handling-fee-per-order','estimated-pick-pack-fee-per-unit',
 'estimated-weight-handling-fee-per-unit','expected-domestic-fulfilment-fee-per-unit',
 'expected-efn-fulfilment-fee-per-unit-uk','expected-efn-fulfilment-fee-per-unit-de',
 'expected-efn-fulfilment-fee-per-unit-fr','expected-efn-fulfilment-fee-per-unit-it',
 'expected-efn-fulfilment-fee-per-unit-es','expected-efn-fulfilment-fee-per-unit-se'];
const fila = (sku, tienda, div, precio, com, fba) => [sku,'X0'+sku,'B0'+sku,tienda,'P '+sku,
 'Aresstore','Amazon','Yes',precio,precio,'20','15','8','450','grams','Standard',div,
 '0.00',com,'0.00','0.00','0.00','0.00',fba,'--','--','--','--','--','--'];
const w = (n, filas) => { const f=path.join(D,n);
  fs.writeFileSync(f, [H.join('\t')].concat(filas.map(r=>r.join('\t'))).join('\n')+'\n'); return f; };

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

  const limpiar = () => page.evaluate(()=>{
    DB = blankDB(); DB.mappings={};
    document.getElementById('fileList').innerHTML=''; saveDB(); refreshAll();
  });
  const cargar = async f => { await page.setInputFiles('#csvFile', f); await page.waitForTimeout(1000); };

  console.log('\n=== TAR-A · LA TARIFA DE LOGÍSTICA DEL FORMATO NUEVO ===');
  /* Amazon sirve la columna como `expected-domestic-fulfilment-fee-per-unit`.
     normHdr la deja en `expecteddomesticfulfilmentfeeperunit` y el único alias
     que había era `expectedfulfillmentfeeperunit`: dos letras de diferencia y
     un `domestic` en medio.

     Y no fallaba cayendo al valor por defecto de 3,20 €, que ya sería malo.
     Fallaba peor: la segunda pasada de resolveFields buscaba una columna de
     dinero libre y le enchufaba `sales-price`. La tarifa de logística se leía
     como el PRECIO DE VENTA — 12,99 € donde eran 2,18 €, casi seis veces —
     y con eso cualquier producto parece que pierde dinero. */
  await limpiar();
  await cargar(w('nuevo.txt',[
    fila('FBASPB0101','Amazon.es','EUR','12.99','2.65','2.18'),
    fila('FBA0111',   'Amazon.es','EUR','9.99', '2.04','2.24'),
    fila('FBA0112',   'Amazon.es','EUR','9.99', '2.04','2.26'),
    fila('FBASS0150', 'Amazon.es','EUR','19.99','4.08','3.05'),
    fila('FBA0500',   'Amazon.es','EUR','24.99','5.10','4.01')]));
  const nuevo = await page.evaluate(()=>{
    const imp = DB.imports.fees||{};
    return {mapa: imp.map||{}, filas:(imp.rows||[]).map(r=>+toNum(r._fba).toFixed(2))};
  });
  check('_fba se mapea a la columna doméstica, no a sales-price',
    nuevo.mapa._fba==='expecteddomesticfulfilmentfeeperunit', nuevo.mapa._fba||'sin mapear');
  check('y salen las cinco tarifas reales, no 3,20 € ni el precio de venta',
    nuevo.filas.join(' / ')==='2.18 / 2.24 / 2.26 / 3.05 / 4.01',
    nuevo.filas.join(' / ')+' · con el fallo daban 12.99 / 9.99 / 9.99 / 19.99 / 24.99');

  console.log('\n=== TAR-B · UN CAMPO OPCIONAL NO SE ADIVINA POR TIPO ===');
  /* La raíz de TAR-A: `resolveFields` rellenaba por tipo de contenido lo que el
     alias no hubiera casado, también en campos opcionales. Un opcional sin
     mapear cae a un valor por defecto que está documentado; uno adivinado mete
     un número real de otra columna y no lo dice nadie. */
  await limpiar();
  /* Fichero SIN ninguna columna de tarifa de logística: se le quita la
     doméstica y las seis EFN, y se deja `sales-price`, que es la que la
     segunda pasada cogía. */
  const Hsin = H.filter(h=>!/fulfilment/.test(h));
  const fSin = path.join(D,'sinfba.txt');
  fs.writeFileSync(fSin, [Hsin.join('\t')].concat([
    ['FBA0101','X0','B0','Amazon.es','P','Aresstore','Amazon','Yes','19.99','19.99','20','15','8',
     '450','grams','Standard','EUR','0.00','4.08','0.00','0.00','0.00','0.00'].join('\t')]).join('\n')+'\n');
  await cargar(fSin);
  const opc = await page.evaluate(()=>{
    const imp=DB.imports.fees||{};
    return {fba:(imp.map||{})._fba, ref:(imp.map||{})._referral, precio:(imp.map||{})._price,
            cols:Object.keys((imp.rows||[{}])[0]||{}).length};
  });
  check('sin ninguna columna de tarifa, _fba se queda SIN mapear', opc.fba===undefined,
    opc.fba||'sin mapear · antes cogía sales-price y leía la tarifa como el precio de venta');
  check('y los que sí tienen alias siguen mapeados',
    opc.ref==='estimatedreferralfeeperunit' && /price/.test(opc.precio||''),
    'referral='+opc.ref+' · price='+opc.precio);

  console.log('\n=== TAR-C · NUEVE TIENDAS Y TRES DIVISAS EN EL MISMO FICHERO ===');
  /* El fichero real trae 31 SKU × 9 tiendas = 216 filas, en EUR, SEK y SAR.
     La clave del diccionario era solo el SKU, así que ganaba la última fila
     leída: según el orden del fichero podías acabar aplicando una tarifa saudí
     en riales a una venta española. */
  const REPARTO=[['Amazon.es',29,'EUR',1],['Amazon.de',29,'EUR',1],['Amazon.ie',25,'EUR',1],
   ['Amazon.it',24,'EUR',1],['Amazon.fr',23,'EUR',1],['Amazon.se',22,'SEK',11.3],
   ['Amazon.com.be',22,'EUR',1],['Amazon.nl',22,'EUR',1],['Amazon.sa',20,'SAR',4.1]];
  const grande=[];
  REPARTO.forEach(([tienda,n,div,fx])=>{ for(let i=0;i<n;i++){
    const precio=(9.99+i*0.5)*fx;
    grande.push(fila('FBA0'+(100+i), tienda, div, precio.toFixed(2),
      (precio*0.204).toFixed(2), ((2.18+(i%5)*0.45)*fx).toFixed(2))); } });
  await limpiar();
  await cargar(w('nueve.txt', grande));
  const nueve = await page.evaluate(()=>{
    const hoy=new Date(); const d=new Date(hoy); d.setDate(d.getDate()-3);
    const dia=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const v=(ch,pais)=>({amazonorderid:'o'+pais, purchasedate:dia+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:ch, sku:'FBA0105', asin:'B0T', itemstatus:'Shipped',
      quantity:'10', itemprice:'120.00', itemtax:'0', shipcountry:pais, currency:'EUR'});
    DB.products=[{id:'p',sku:'FBA0105',name:'P',cogs:2,freight:0,fba:3.2,referral:15,
                  price:12,channel:'FBA',lots:[]}];
    DB.imports.orders={rows:[v('Amazon.es','ES'), v('Amazon.se','SE')],count:2,file:'o'};
    periodDays=30;
    const P=pnl();
    return {filas:P.feeFilas, tiendas:P.feeTiendas.length, divisas:Object.keys(P.feeDivisas),
            fuera:P.feeOtraDivisa, sinPais:P.feeSinTarifaPais, ref:+P.referral.toFixed(2)};
  });
  check('el hub declara las 216 filas', nueve.filas===216, nueve.filas);
  check('y las nueve tiendas', nueve.tiendas===9, nueve.tiendas+' tiendas');
  check('y las tres divisas', nueve.divisas.sort().join(',')==='EUR,SAR,SEK', nueve.divisas.join(', '));
  check('las 42 filas que no están en euros quedan fuera del cálculo', nueve.fuera===42,
    nueve.fuera+' filas (22 en SEK + 20 en SAR) · ninguna cifra en riales entra en un cálculo en euros');

  console.log('\n=== TAR-D · SIN TARIFA DE TU MERCADO, NO SE COGE LA DE OTRO ===');
  /* La venta sueca no tiene tarifa en euros —las de Suecia vienen en SEK— así
     que va con el valor por defecto del producto y se cuenta. Coger la
     española daría un número con pinta de medido: la comisión del mismo SKU no
     es la misma en las nueve tiendas.

     Aritmética, con los valores REDONDEADOS tal y como vienen en el fichero,
     que es lo que el hub lee —2,55 € de comisión sobre 12,49 € de precio, no
     un 20,400 % exacto—:
       tipo leído  = 2,55 / 12,49            = 20,416 %
       España      = 120 × 0,20416           = 24,4996 €
       Suecia      = 120 × 0,15 por defecto  = 18,0000 €
       total                                 = 42,4996 €
     Cogiendo la tarifa española también para Suecia saldrían 48,9992 €. */
  check('las 10 unidades suecas se cuentan como sin tarifa de su mercado',
    nueve.sinPais===10, nueve.sinPais+' unidades');
  check('y la comisión sale 42,50 €, no 49,00 €', near(nueve.ref, 42.4996, 0.01),
    nueve.ref+' € = 24,50 de España al 20,416 % + 18,00 de Suecia al 15 % por defecto');

  console.log('\n=== TAR-E · «--» ES AUSENCIA, NO UN CERO ===');
  /* En el fichero real hay 0 celdas vacías en las columnas de tarifa y en
     cambio «--» en 4 filas de la doméstica y en 363 de las EFN. `toNum("--")`
     devuelve 0, que cae al defecto en silencio. Ahora se cuenta y se dice. */
  await limpiar();
  await cargar(w('guiones.txt',[
    fila('FBA0101','Amazon.es','EUR','19.99','4.08','--'),
    fila('FBA0102','Amazon.es','EUR','19.99','4.08','--'),
    fila('FBA0103','Amazon.es','EUR','19.99','4.08','3.05')]));
  const g = await page.evaluate(()=>{ periodDays=30;
    DB.products=[{id:'p',sku:'FBA0101',name:'P',cogs:2,freight:0,fba:3.2,referral:15,
                  price:19.99,channel:'FBA',lots:[]}];
    return {sinFba: pnl().feeSinFba, skus: pnl().feeSkus};
  });
  check('las dos tarifas «--» se cuentan como ausentes', g.sinFba===2,
    g.sinFba+' de 3 · con el fallo pasaban por 0,00 € y caían al defecto en silencio');
  check('y las tres filas siguen dando su comisión', g.skus===3, g.skus+' SKU con tarifa leída');

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  try{ fs.rmSync(D,{recursive:true,force:true}); }catch(e){}
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
