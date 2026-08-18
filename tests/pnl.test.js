/* =========================================================================
   P&L · las tarifas de Amazon y la base sobre la que se calcula el margen

   Un motor de costes no falla dando error: da un margen creíble y falso. Estas
   pruebas atacan el punto donde el hub decide si un número está MEDIDO o
   ESTIMADO, porque la etiqueta «medido» es la que hace que alguien se lo crea.

   Cada caso lleva la aritmética a mano en el comentario: si el motor cambia y
   la prueba falla, ahí está la cuenta para saber quién se equivoca.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> Math.abs(a-b) < (t==null?0.01:t);

/* Laboratorio: un solo producto, 100 € por unidad sin IVA, coste 5 €.
   Así la comisión al 15 % es exactamente el 15 % del ingreso y las cuentas
   se hacen de cabeza. */
const LAB = `
  DB = blankDB();
  DB.products = [{id:'t1', sku:'TEST-1', name:'Producto', cogs:5, freight:0,
                  fba:3, referral:15, price:100, channel:'FBA', lots:[]}];
  const hoy = new Date();
  const dia = k => { const d=new Date(hoy); d.setDate(d.getDate()-k);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const venta = (d,q)=>({amazonorderid:'o'+d+q, purchasedate:d+'T10:00:00+00:00',
    fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'TEST-1', asin:'B0X',
    itemstatus:'Shipped', quantity:String(q), itemprice:String(100*q), itemtax:'0',
    shipcountry:'ES'});
`;
const js = body => '(()=>{' + LAB + body + '})()';

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

  console.log('\n=== PNL-A · UNA LIQUIDACIÓN QUE NO SÉ LEER NO ES UNA MEDICIÓN ===');
  /* El fichero plano de liquidación tiene dos esquemas. El lector entiende el
     viejo, con `item-related-fee-type` / `item-related-fee-amount`. El que
     Amazon sirve hoy trae `amount-type` / `amount-description` / `amount`, que
     este lector no mira.

     Aritmética del caso: 100 unidades a 100 € = 10.000 € de ingreso.
       comisión estimada  = 15 % de 10.000       = 1.500,00 €
       tarifa FBA         = 3,00 × 1,015 × 100   =   304,50 €
     Con el fallo, las tres filas de la liquidación bastaban para declarar
     «medido», la comisión salía 0 € y el beneficio pasaba de 7.695,50 € a
     9.500,00 €: un 23,4 % de más, con la etiqueta de máxima confianza. */
  const noLeido = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),100)], count:1, file:'o'};
    periodDays = 30;
    const sin = pnl();
    DB.imports.settlement = {count:3, file:'v2', rows:[
      {settlementid:'S', transactiontype:'Order', posteddate:dia(4), marketplacename:'Amazon.es',
       amounttype:'ItemFees', amountdescription:'Commission', amount:'-1500.00', sku:'TEST-1'},
      {settlementid:'S', transactiontype:'Order', posteddate:dia(4), marketplacename:'Amazon.es',
       amounttype:'ItemFees', amountdescription:'FBAPerUnitFulfillmentFee', amount:'-304.50', sku:'TEST-1'},
      {settlementid:'S', transactiontype:'Order', posteddate:dia(4), marketplacename:'Amazon.es',
       amounttype:'ItemPrice', amountdescription:'Principal', amount:'10000.00', sku:'TEST-1'}
    ]};
    const con = pnl(), sf = settlementFees();
    return {sin:{ref:sin.referral, fba:sin.fba, profit:sin.profit, med:sin.measured},
            con:{ref:con.referral, fba:con.fba, profit:con.profit, med:con.measured},
            filas:sf.rows, entendidas:sf.matched};
  `));
  check('la liquidación trae filas del periodo', noLeido.filas===3, noLeido.filas+' filas');
  check('pero ninguna en un esquema que este lector entienda', noLeido.entendidas===0,
    noLeido.entendidas+' entendidas · el fichero de hoy usa amount-type, no item-related-fee-type');
  check('así que NO se declara medido', noLeido.con.med===false,
    'antes bastaba con que hubiera filas');
  check('la comisión sigue siendo la estimada, no cero', near(noLeido.con.ref, 1500),
    noLeido.con.ref.toFixed(2)+' € = 15 % de 10.000 · con el fallo daba 0,00 €');
  check('y el beneficio no se mueve ni un céntimo', near(noLeido.con.profit, noLeido.sin.profit),
    noLeido.con.profit.toFixed(2)+' € = '+noLeido.sin.profit.toFixed(2)+' € · con el fallo subía a 9.500,00 € (+23,4 %)');

  console.log('\n=== PNL-B · UNA LIQUIDACIÓN DE 14 DÍAS NO MIDE 90 ===');
  /* Amazon liquida cada 14 días. Mirar el trimestre con una sola liquidación
     cargada es el caso normal, no uno rebuscado.

     Aritmética: 90 días × 10 ud × 100 € = 90.000 € de ingreso.
       comisión de los 90 días al 15 %              = 13.500,00 €
       la liquidación mide 14 días: 14 × 150 €      =  2.100,00 €
       los 76 días restantes se estiman: 15 % de 76.000 € = 11.400,00 €
       total                                        = 13.500,00 €
     Con el fallo se restaban solo 2.100 € a 90 días de ingresos y el
     beneficio subía un 20,4 %, sellado como «medido». */
  const parcial = await page.evaluate(js(`
    const ventas=[]; for(let k=0;k<90;k++) ventas.push(venta(dia(k),10));
    DB.imports.orders = {rows:ventas, count:90, file:'o'};
    periodDays = 90;
    const sin = pnl();
    const liq=[]; for(let k=0;k<14;k++) liq.push({settlementid:'S', transactiontype:'Order',
      posteddate:dia(k), marketplacename:'Amazon.es',
      itemrelatedfeetype:'Commission', itemrelatedfeeamount:'-150.00',
      orderfeetype:'', orderfeeamount:'', shipmentfeetype:'', shipmentfeeamount:'', promotionamount:''});
    DB.imports.settlement = {rows:liq, count:14, file:'q'};
    const con = pnl(), sf = settlementFees();
    return {ingreso:sin.grossInc, sinRef:sin.referral, sinProfit:sin.profit,
            conRef:con.referral, conProfit:con.profit, med:con.measured,
            cobertura:con.feeCoverPct, medido:sf.referral};
  `));
  check('el periodo factura 90.000 €', near(parcial.ingreso, 90000), parcial.ingreso.toFixed(2)+' €');
  check('la liquidación mide 2.100 € de comisión', near(parcial.medido, 2100),
    parcial.medido.toFixed(2)+' € = 14 días × 150 €');
  check('pero la comisión del periodo son 13.500 €, no 2.100 €', near(parcial.conRef, 13500),
    parcial.conRef.toFixed(2)+' € = 2.100 medidos + 11.400 estimados de los 76 días que la liquidación no cubre');
  check('y el beneficio no se infla', near(parcial.conProfit, parcial.sinProfit, 0.02),
    parcial.conProfit.toFixed(2)+' € · con el fallo daba 83.400,00 € (+20,4 %)');
  check('la pantalla puede decir qué parte está medida', Math.round(parcial.cobertura)===16,
    Math.round(parcial.cobertura)+' % del ingreso cubierto por la liquidación');

  console.log('\n=== PNL-C · UNA CATEGORÍA AUSENTE NO ES UNA CATEGORÍA A CERO ===');
  /* La liquidación de PNL-B cubre sus 14 días y no trae ni una línea de
     tarifa FBA. Cobrar 0 € de logística por 140 unidades enviadas por Amazon
     no le pasa a nadie: es que ese concepto no venía en el fichero.

     Aritmética: 900 unidades × 3,00 € × 1,015 de recargo = 2.740,50 €.
     Tomando la ausencia por un cero salían 2.314,20 € y el beneficio subía
     426,30 € sin que nadie hubiera enviado nada más barato. */
  const ausente = await page.evaluate(js(`
    const ventas=[]; for(let k=0;k<90;k++) ventas.push(venta(dia(k),10));
    DB.imports.orders = {rows:ventas, count:90, file:'o'};
    periodDays = 90;
    const liq=[]; for(let k=0;k<14;k++) liq.push({settlementid:'S', transactiontype:'Order',
      posteddate:dia(k), marketplacename:'Amazon.es',
      itemrelatedfeetype:'Commission', itemrelatedfeeamount:'-150.00', promotionamount:''});
    DB.imports.settlement = {rows:liq, count:14, file:'q'};
    return {fba: pnl().fba, unidades: pnl().units};
  `));
  check('las 900 unidades pagan su tarifa FBA completa', near(ausente.fba, 2740.5, 0.02),
    ausente.fba.toFixed(2)+' € = 900 × 3,00 × 1,015 · con el fallo daban 2.314,20 €');

  console.log('\n=== PNL-D · SIN LIQUIDACIÓN, NADA CAMBIA (no regresión) ===');
  const base = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),100)], count:1, file:'o'};
    periodDays = 30;
    const P = pnl();
    return {ref:P.referral, fba:P.fba, med:P.measured, cov:P.feeCoverPct, profit:P.profit};
  `));
  check('comisión estimada al 15 %', near(base.ref, 1500), base.ref.toFixed(2)+' €');
  check('tarifa FBA con el recargo de combustible', near(base.fba, 304.5), base.fba.toFixed(2)+' € = 100 × 3,00 × 1,015');
  check('no se declara medido', base.med===false);
  check('y la cobertura de la liquidación es cero', base.cov===0, base.cov+' %');

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
