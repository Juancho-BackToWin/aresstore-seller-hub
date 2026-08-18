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

  console.log('\n=== PNL-E · EL BOTÓN «TODO» NO ES UN MES ===');
  /* `periodDays = 0` es «Todo», y ser cero lo hacía falsy: cada `periodDays||30`
     caía al literal 30.

     Caso: 120 días de ventas, 10 ud/día a 100 € = 120.000 € de ingreso, con
     600 €/mes de gastos fijos.
       gastos fijos de 120 días = 600 × (120/30) = 2.400,00 €
       con el fallo             = 600 × ( 30/30) =   600,00 €
     Es decir, cuatro meses de ventas contra un mes de alquiler: 1.800 € de
     beneficio regalados solo por pulsar un botón. */
  const todo = await page.evaluate(js(`
    const ventas=[]; for(let k=0;k<120;k++) ventas.push(venta(dia(k),10));
    DB.imports.orders = {rows:ventas, count:120, file:'o'};
    DB.expenses = [{id:'e1', name:'Gestoría', amount:600}];
    periodDays = 0;
    const T = pnl();
    periodDays = 120;
    const C = pnl();
    return {dias:T.periodDaysReal, span:T.dataDays,
            fijosTodo:T.fixed, fijos120:C.fixed,
            ventasTodo:T.grossInc, beneficioTodo:T.profit, beneficio120:C.profit};
  `));
  check('«Todo» mide los días que de verdad hay', todo.dias===120,
    todo.dias+' d · con el fallo eran 30');
  check('los gastos fijos son los de 120 días, no los de 30', near(todo.fijosTodo, 2400),
    todo.fijosTodo.toFixed(2)+' € = 600 × (120/30) · con el fallo daban 600,00 €');
  check('y «Todo» da lo mismo que pedir 120 días a mano',
    near(todo.beneficioTodo, todo.beneficio120) && near(todo.fijosTodo, todo.fijos120),
    todo.beneficioTodo.toFixed(2)+' € = '+todo.beneficio120.toFixed(2)+' €');

  console.log('\n=== PNL-F · PEDIR MÁS DÍAS DE LOS QUE TRAE EL INFORME SE DICE ===');
  /* Un informe de 120 días mirado a 365 no convierte los otros 245 en días de
     venta cero. La velocidad de Inventario dividía entre 365 y se quedaba en un
     tercio: la única referencia en rotura desaparecía de la pantalla.
       velocidad honesta = 1.200 ud / 120 días observados = 10,00 ud/día
       con el fallo      = 1.200 ud / 365                 =  3,29 ud/día */
  const corto = await page.evaluate(js(`
    const ventas=[]; for(let k=0;k<120;k++) ventas.push(venta(dia(k),10));
    DB.imports.orders = {rows:ventas, count:120, file:'o'};
    DB.imports.inventory = {rows:[{sku:'TEST-1', afnfulfillablequantity:'300'}], count:1, file:'i'};
    periodDays = 365;
    const P = pnl();
    const I = invStats().filter(x=>String(x.sku).toUpperCase()==='TEST-1')[0];
    return {pedidos:P.periodDaysReal, cubiertos:P.dataDays, vel:I.velocity, cover:I.cover};
  `));
  check('el hub sabe que le faltan días de informe',
    corto.pedidos===365 && corto.cubiertos===120, corto.cubiertos+' de '+corto.pedidos+' días');
  check('y la velocidad se mide sobre los días observados', near(corto.vel, 10, 0.05),
    corto.vel.toFixed(2)+' ud/día = 1.200 / 120 · con el fallo daba 3,29');
  check('así la cobertura no se triplica', Math.round(corto.cover)===30,
    Math.round(corto.cover)+' d = 300 ud / 10 al día · con el fallo daban 91 d y la rotura desaparecía de la pantalla');

  console.log('\n=== PNL-G · LA FECHA NO PUEDE DEPENDER DE LA HORA A LA QUE MIRES ===');
  /* daysBetween restaba milisegundos entre un instante (today(), con hora) y
     una medianoche (parseDate). A partir de las 12:00 locales, Math.round caía
     un entero: el vencimiento de proveedor de HOY salía en −1 y el filtro k>=0
     lo tiraba de la proyección de caja. Mismo día, misma base de datos, dos
     números distintos según la hora. */
  const horas = await page.evaluate(js(`
    const hoyISO = dia(0), ayerISO = dia(1), mananaISO = dia(-1);
    return {hoy: daysBetween(parseDate(hoyISO), today()),
            ayer: daysBetween(parseDate(ayerISO), today()),
            manana: daysBetween(parseDate(mananaISO), today()),
            hora: new Date().getHours()};
  `));
  check('la prueba corre a una hora que antes rompía', horas.hora!==undefined, horas.hora+':00');
  check('hoy son 0 días, a cualquier hora', horas.hoy===0,
    horas.hoy+' · a partir de las 12:00 daba −1 y el pago de hoy desaparecía de la caja');
  check('ayer es 1 día', horas.ayer===1, horas.ayer);
  check('mañana es −1 día', horas.manana===-1, horas.manana);

  console.log('\n=== PNL-H · LA COMISIÓN ES LA DEL PRODUCTO, NO UN 15 % PARA TODO ===');
  /* El campo «Comisión referral %» es editable por producto en Catálogo y
     pnl() no lo leía: usaba grossInc × 0,15 para todo el catálogo. En joyería,
     donde Amazon cobra el 20 %, eso son seis puntos de margen regalados.

     Caso: 400 ud a 100 € = 40.000 € de ingreso, comisión del producto 20 %.
       comisión correcta = 40.000 × 0,20 = 8.000,00 €
       con el fallo      = 40.000 × 0,15 = 6.000,00 €  → 2.000 € de beneficio inventados */
  const com = await page.evaluate(js(`
    DB.products[0].referral = 20;
    DB.imports.orders = {rows:[venta(dia(5),400)], count:1, file:'o'};
    periodDays = 30;
    const alto = pnl();
    DB.products[0].referral = 15;
    const bajo = pnl();
    DB.products[0].referral = 0;      // sin poner nada, el 15 % por defecto
    const cero = pnl();
    return {alto:alto.referral, bajo:bajo.referral, cero:cero.referral,
            dif: alto.profit - bajo.profit};
  `));
  check('un producto al 20 % paga el 20 %', near(com.alto, 8000),
    com.alto.toFixed(2)+' € = 40.000 × 0,20 · con el fallo daba 6.000,00 €');
  check('uno al 15 % paga el 15 %', near(com.bajo, 6000), com.bajo.toFixed(2)+' €');
  check('y sin porcentaje cargado se mantiene el 15 % por defecto', near(com.cero, 6000),
    com.cero.toFixed(2)+' € · el defecto no cambia, solo deja de ignorarse lo que sí has puesto');
  check('la diferencia entre 20 % y 15 % son 2.000 € de beneficio', near(com.dif, -2000),
    com.dif.toFixed(2)+' €');

  console.log('\n=== PNL-I · EL IVA DE LA TABLA ABC ES EL QUE SE COBRÓ, NO UN 21 % FIJO ===');
  /* Dos SKU económicamente idénticos: mismo ingreso NETO, mismo coste, misma
     tarifa. Uno se vende solo en Alemania (IVA 19 %) y otro solo en España
     (21 %). Dividir entre 1,21 clavado hacía que el alemán —que es igual de
     bueno— apareciera con mucho menos beneficio, y la ABC lo degradaba.

     Aritmética: 300 ud cada uno, ingreso neto 3.000 € cada uno.
       ES: bruto 3.630 · IVA 630 · neto 3.000
       DE: bruto 3.570 · IVA 570 · neto 3.000
     Con el 21 % fijo, DE salía con 3.570/1,21 = 2.950,41 € de ingreso neto:
     49,59 € que no existen, y con ellos el ranking al revés. */
  const abc = await page.evaluate(js(`
    DB.products = [
      {id:'a', sku:'ES-ONLY', name:'ES', cogs:5, freight:0, fba:3, referral:15, price:12.1, channel:'FBA', lots:[]},
      {id:'b', sku:'DE-ONLY', name:'DE', cogs:5, freight:0, fba:3, referral:15, price:11.9, channel:'FBA', lots:[]}];
    const fila = (sku,ch,pais,bruto,iva)=>({amazonorderid:'o'+sku, purchasedate:dia(5)+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:ch, sku:sku, asin:'B0X', itemstatus:'Shipped',
      quantity:'300', itemprice:String(bruto), itemtax:String(iva), shipcountry:pais});
    DB.imports.orders = {rows:[fila('ES-ONLY','Amazon.es','ES',3630,630),
                               fila('DE-ONLY','Amazon.de','DE',3570,570)], count:2, file:'o'};
    periodDays = 30;
    const S = skuStats();
    const g = k => S.filter(x=>x.sku===k)[0];
    return {es:{net:g('ES-ONLY').netRev, prof:g('ES-ONLY').profit, abc:g('ES-ONLY').abc},
            de:{net:g('DE-ONLY').netRev, prof:g('DE-ONLY').profit, abc:g('DE-ONLY').abc}};
  `));
  check('los dos SKU tienen el mismo ingreso neto: 3.000 €',
    near(abc.es.net, 3000) && near(abc.de.net, 3000),
    'ES '+abc.es.net.toFixed(2)+' € · DE '+abc.de.net.toFixed(2)+' € · con el fallo DE daba 2.950,41 €');
  check('y el alemán ya no sale peor que el español por su IVA', abc.de.prof >= abc.es.prof,
    'DE '+abc.de.prof.toFixed(2)+' € ≥ ES '+abc.es.prof.toFixed(2)+' € · el alemán paga menos IVA, así que gana más');
  check('la ABC deja de degradarlo', !(abc.de.abc==='C' && abc.es.abc==='A'),
    'DE='+abc.de.abc+' · ES='+abc.es.abc+' · con el fallo eran C y A');

  console.log('\n=== PNL-J · LOS MERCADOS DE FUERA DE LA UE NO SE EVAPORAN ===');
  /* amazon.co.uk no está en COUNTRIES, así que sus ventas contaban en el P&L y
     en la ABC y desaparecían de la tabla de mercados del Panel sin aviso.
     Caso: 200 ud a España (2.420 €) y 100 ud al Reino Unido (1.210 €).
       facturación total = 3.630 €; la tabla enseñaba 2.420 € · faltaba el 33 %. */
  const fuera = await page.evaluate(js(`
    const fila = (ch,pais,q,bruto)=>({amazonorderid:'o'+pais, purchasedate:dia(5)+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:ch, sku:'TEST-1', asin:'B0X', itemstatus:'Shipped',
      quantity:String(q), itemprice:String(bruto), itemtax:'0', shipcountry:pais});
    DB.imports.orders = {rows:[fila('Amazon.es','ES',200,2420), fila('Amazon.co.uk','GB',100,1210)], count:2, file:'o'};
    periodDays = 30;
    const P = pnl(), C = countryStats().filter(x=>x.units>0);
    return {pnl:P.grossInc, tabla:C.reduce((a,x)=>a+x.rev,0),
            filas:C.map(x=>x.c.code+':'+x.units)};
  `));
  check('la tabla de mercados suma lo mismo que el P&L', near(fuera.tabla, fuera.pnl),
    fuera.tabla.toFixed(2)+' € = '+fuera.pnl.toFixed(2)+' € · con el fallo faltaba el 33 %');
  check('y el mercado de fuera aparece agrupado, no borrado',
    fuera.filas.some(f=>/^··/.test(f)), fuera.filas.join(' · '));

  console.log('\n=== PNL-K · EL PRODUCTO QUE SOSTIENE EL NEGOCIO NO PUEDE SER «C» ===');
  /* La clase salía del acumulado DESPUÉS de sumar el producto, así que el que
     cruzaba el 80 % nunca entraba en A. Con un solo producto rentable, el
     acumulado valía 100 y le tocaba «C»: la píldora de los residuales para el
     que genera el 100 % del beneficio, y el veredicto remitiendo a una
     categoría A que estaba vacía.

     Caso: BUENO gana dinero, MALO lo pierde. BUENO es el 100 % del beneficio
     positivo, así que es «A», y MALO es «D» por perder. */
  const clases = await page.evaluate(js(`
    DB.products = [
      {id:'a', sku:'BUENO', name:'B', cogs:4, freight:0, fba:3, referral:15, price:20, channel:'FBA', lots:[]},
      {id:'b', sku:'MALO',  name:'M', cogs:18, freight:0, fba:3, referral:15, price:20, channel:'FBA', lots:[]}];
    const fila = (sku,q,bruto)=>({amazonorderid:'o'+sku, purchasedate:dia(5)+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:sku, asin:'B0X', itemstatus:'Shipped',
      quantity:String(q), itemprice:String(bruto), itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[fila('BUENO',400,8000), fila('MALO',50,1000)], count:2, file:'o'};
    periodDays = 30;
    const S = skuStats();
    return S.map(x=>({sku:x.sku, abc:x.abc, profit:Math.round(x.profit), cum:Math.round(x.cum)}));
  `));
  clases.forEach(c=>console.log('     '+c.abc+' | '+c.sku+' | '+c.profit+' € | acumulado '+c.cum+' %'));
  const bueno = clases.filter(c=>c.sku==='BUENO')[0], malo = clases.filter(c=>c.sku==='MALO')[0];
  check('el único producto rentable es «A»', bueno.abc==='A',
    bueno.abc+' · con el fallo era «C» con el 100 % del beneficio detrás');
  check('y el que pierde dinero sigue siendo «D»', malo.abc==='D', malo.abc);

  console.log('\n=== PNL-L · EL GASTO DE PUBLICIDAD SE AJUSTA AL PERIODO ===');
  /* El informe de términos de búsqueda no trae fecha por fila, pero sí su
     propio rango en «Start Date» y «End Date». Sin usarlo, el gasto entero se
     cargaba a cualquier periodo: con ventas idénticas día a día, el margen iba
     de −58,6 % a 30 días a −13,6 % con «Todo». El mismo gasto y el mismo
     negocio, tres respuestas distintas.

     Caso: informe de 60 días con 1.200 € de gasto = 20 €/día.
       mirando 30 días → 600,00 €
       mirando 60 días → 1.200,00 €
       mirando 90 días → 1.800,00 € */
  const ppc = await page.evaluate(js(`
    const ventas=[]; for(let k=0;k<120;k++) ventas.push(venta(dia(k),10));
    DB.imports.orders = {rows:ventas, count:120, file:'o'};
    DB.imports.searchterm = {count:1, file:'ads', rows:[{
      startdate: dia(59), enddate: dia(0),
      customersearchterm:'rodillo', campaignname:'SP', impressions:'1000',
      clicks:'100', spend:'1200', totalsales:'3000', totalorders:'20'}]};
    const out={};
    [30,60,90].forEach(d=>{ periodDays=d; const P=pnl();
      out[d]={ppc:P.ppc, dias:P.adDays, solape:Math.round(P.adSolapePct)}; });
    periodDays=30;
    return out;
  `));
  check('el hub lee el rango del propio informe', ppc[30].dias===60, ppc[30].dias+' días');
  check('a 30 días, la mitad del gasto', near(ppc[30].ppc, 600),
    ppc[30].ppc.toFixed(2)+' € = 1.200 × (30/60) · con el fallo eran 1.200,00 € en los tres casos');
  check('a 60 días, el gasto entero', near(ppc[60].ppc, 1200), ppc[60].ppc.toFixed(2)+' €');
  check('a 90 días, uno y medio', near(ppc[90].ppc, 1800), ppc[90].ppc.toFixed(2)+' €');
  check('y con 30 días el informe cubre el periodo entero', ppc[30].solape===100,
    ppc[30].solape+' % de solape');

  console.log('\n=== PNL-M · UN INFORME DE PUBLICIDAD VIEJO SE DELATA ===');
  /* Prorratear un informe de hace tres meses sobre el mes actual da un número
     utilizable —mejor que cero, que inflaría el margen— pero no es una medición
     de este mes, y eso tiene que verse. */
  const viejo = await page.evaluate(js(`
    const ventas=[]; for(let k=0;k<120;k++) ventas.push(venta(dia(k),10));
    DB.imports.orders = {rows:ventas, count:120, file:'o'};
    DB.imports.searchterm = {count:1, file:'ads', rows:[{
      startdate: dia(119), enddate: dia(90),
      customersearchterm:'rodillo', campaignname:'SP', impressions:'1000',
      clicks:'100', spend:'900', totalsales:'2000', totalorders:'10'}]};
    periodDays = 30;
    const P = pnl();
    return {solape:Math.round(P.adSolapePct), ppc:P.ppc};
  `));
  check('un informe que no toca el periodo lo dice: 0 % de solape', viejo.solape===0,
    viejo.solape+' % · el informe es de hace tres meses');
  check('pero el gasto no se pone a cero, que inflaría el margen', viejo.ppc>0,
    viejo.ppc.toFixed(2)+' € prorrateados');

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
