/* =========================================================================
   COHERENCIA · el desglose por SKU y la cuenta de resultados son el MISMO
   cálculo, y esta prueba lo vigila.

   Cierra V2, V3, A1 y E1 de la revisión adversarial, que eran el mismo fallo
   por cuatro puertas: `skuStats()` rehacía la cuenta con dos tasas planas en
   vez de consumir el desglose del P&L.

   La propiedad, una sola y en una frase:

       la suma del desglose, en cualquier eje, más lo explícitamente no
       imputable, es el beneficio del P&L, al céntimo.

   Por qué esa y no una lista de comprobaciones sueltas: si mañana alguien
   añade una línea al P&L y olvida bajarla al desglose, una lista de
   comprobaciones no se entera y esta propiedad se pone roja sola.

   Cada caso lleva la aritmética a mano en el comentario. Si la prueba falla,
   ahí está la cuenta para saber quién de los dos está equivocado.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> Math.abs(n(a)-n(b)) < (t==null?0.01:t);
/* Sin el arreglo, el desglose no existe y estas propiedades vienen `undefined`.
   Un `undefined.toFixed()` mataría la suite con un stack en vez de decir qué
   falta, y una prueba que se muere no explica nada. `n()` convierte la ausencia
   en cero para que el mensaje de fallo diga el número que falta y por qué. */
const n = v => (typeof v==='number' && isFinite(v)) ? v : (v==null||isNaN(Number(v)) ? 0 : Number(v));
const eur = v => (typeof v==='number' && isFinite(v)) ? v.toFixed(2) : (v==null?'AUSENTE':String(v));

/* Laboratorio · dos referencias que es justo el caso que hundía V2:
     CARO   · 39,99 € la unidad
     BARATO ·  9,99 € la unidad
   Las dos con la MISMA tarifa de logística, 2,18 € por unidad, porque la
   tarifa FBA es un importe fijo y no un porcentaje. Repartida como porcentaje
   del ingreso —que es lo que hacía la fórmula vieja— la cara paga cuatro veces
   lo que paga de verdad y la barata una cuarta parte. */
const LAB = `
  DB = blankDB();
  DB.products = [
    {id:'c', sku:'CARO',   name:'Pieza cara',   cogs:4, freight:0, fba:2.18, referral:15, price:39.99, channel:'FBA', lots:[]},
    {id:'b', sku:'BARATO', name:'Complemento',  cogs:4, freight:0, fba:2.18, referral:15, price:9.99,  channel:'FBA', lots:[]}
  ];
  const hoy = new Date();
  const dia = k => { const d=new Date(hoy); d.setDate(d.getDate()-k);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const venta = (d,sku,q,precio,iva,pais)=>({amazonorderid:'o'+d+sku+q, purchasedate:d+'T10:00:00+00:00',
    fulfillmentchannel:'Amazon',
    saleschannel:'Amazon.'+({ES:'es',FR:'fr',IT:'it',DE:'de',PL:'pl'}[pais||'ES']||'es'),
    sku:sku, asin:'B0'+sku,
    itemstatus:'Shipped', quantity:String(q), currency:'EUR',
    itemprice:String((precio*q).toFixed(2)), itemtax:String((iva*q).toFixed(2)),
    shipcountry:pais||'ES'});
  const devol = (d,sku,q,disp)=>({returndate:d+'T10:00:00+00:00', orderid:'r'+d+sku,
    sku:sku, asin:'B0'+sku, fnsku:'X', productname:sku, quantity:String(q),
    fulfillmentcenterid:'MAD4', detaileddisposition:disp||'SELLABLE',
    reason:'JEWELRY_TOO_SMALL', status:'Unit returned to inventory'});
  /* El desglose, sumado a mano desde skuStats(), y comparado con el P&L. */
  const cuadra = () => {
    const P = pnl(), R = skuStats();
    const suma = R.reduce((a,r)=>a+(r.profit||0),0);
    return {profit:P.profit, suma, noImp:P.noImputable, total:suma+(P.noImputable||0),
            filas:R.length,
            porSku:R.map(r=>({sku:r.sku, profit:r.profit, fba:r.fba, referral:r.referral,
                              ppc:r.ppc, returns:r.returns, vat:r.vat, cogs:r.cogs, abc:r.abc}))};
  };
  /* La fórmula ANTIGUA, reproducida aquí tal cual estaba, para poder medir la
     distorsión en vez de afirmarla. */
  const viejo = () => {
    const P = pnl(), S = salesRows(), pm = prodBySku();
    const feeRate = P.grossInc>0 ? (P.referral+P.fba+P.ship+P.storage+P.otherFee)/P.grossInc : 0.22;
    const ppcRate = P.grossInc>0 ? P.ppc/P.grossInc : 0;
    const m={};
    S.forEach(r=>{ const k=String(r.sku);
      if(!m[k]) m[k]={sku:k, revenue:0, tax:0};
      m[k].revenue+=r.revenue; m[k].tax+=r.tax; });
    return Object.keys(m).map(k=>{ const x=m[k];
      const cb = P.costBySku[k] || {cogs:0};
      return {sku:k, profit:(x.revenue-x.tax) - x.revenue*feeRate - x.revenue*ppcRate - (cb.cogs||0)};
    });
  };
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

  console.log('\n=== COH-A · EL CASO DESNUDO · SOLO VENTAS ===');
  /* 10 unidades de CARO a 39,99 (IVA 0 para que la cuenta se haga de cabeza)
     y 10 de BARATO a 9,99.
       ingreso  = 399,90 + 99,90            = 499,80 €
       comisión = 15 % de 499,80            =  74,97 €
       tarifa   = 20 ud × 2,18 × 1,015      =  44,25 €
       coste    = 20 ud × 4,00              =  80,00 €
       beneficio = 499,80 − 74,97 − 44,25 − 80,00 = 300,58 € */
  const desnudo = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),'CARO',10,39.99,0), venta(dia(5),'BARATO',10,9.99,0)], count:2, file:'o'};
    periodDays = 30;
    return {c:cuadra(), v:viejo(), P:{ing:pnl().grossInc, fba:pnl().fba}};
  `));
  check('A1 · el periodo factura 499,80 €', near(desnudo.P.ing, 499.80), eur(desnudo.P.ing)+' €');
  check('A2 · la suma del desglose es el beneficio del P&L',
    near(desnudo.c.total, desnudo.c.profit),
    eur(desnudo.c.total)+' € vs '+eur(desnudo.c.profit)+' € del P&L');
  const caro = desnudo.c.porSku.find(r=>r.sku==='CARO'), barato = desnudo.c.porSku.find(r=>r.sku==='BARATO');
  check('A3 · las dos referencias pagan la MISMA tarifa de logística',
    near(caro.fba, barato.fba), 'CARO '+eur(caro.fba)+' € · BARATO '+eur(barato.fba)+' €');
  const vCaro = desnudo.v.find(r=>r.sku==='CARO'), vBarato = desnudo.v.find(r=>r.sku==='BARATO');
  check('A4 · y con la fórmula antigua no la pagaban: ese era el fallo',
    !near(vCaro.profit, caro.profit, 1) || !near(vBarato.profit, barato.profit, 1),
    'CARO '+eur(vCaro.profit)+' → '+eur(caro.profit)+' € · BARATO '+
    eur(vBarato.profit)+' → '+eur(barato.profit)+' €');

  console.log('\n=== COH-B · CON DEVOLUCIONES · CAEN EN EL SKU QUE LAS TUVO ===');
  /* Cuatro devoluciones de BARATO, vendible. La devolución cuesta:
       ingreso devuelto      = 4 × 9,99            = 39,96 €
       comisión reintegrada  = 4 × (1,4985 − 0,2997) = 4,7952 €
       coste recuperado      = 4 × 4,00            = 16,00 €
       coste neto            = 39,96 − 4,80 − 16,00 = 19,16 €
     Con la fórmula antigua esos 19,16 € no aparecían en ninguna fila. */
  const conDev = await page.evaluate(js(`
    DB.imports.orders  = {rows:[venta(dia(5),'CARO',10,39.99,0), venta(dia(5),'BARATO',10,9.99,0)], count:2, file:'o'};
    DB.imports.returns = {rows:[devol(dia(3),'BARATO',4,'SELLABLE')], count:1, file:'d'};
    periodDays = 30;
    return {c:cuadra(), v:viejo(), ret:pnl().returnsCost};
  `));
  check('B1 · la suma del desglose sigue siendo el beneficio del P&L',
    near(conDev.c.total, conDev.c.profit),
    eur(conDev.c.total)+' € vs '+eur(conDev.c.profit)+' €');
  const bDev = conDev.c.porSku.find(r=>r.sku==='BARATO');
  const cDev = conDev.c.porSku.find(r=>r.sku==='CARO');
  check('B2 · el coste de la devolución cae entero en BARATO',
    near(bDev.returns, conDev.ret) && near(cDev.returns, 0) && conDev.ret!==0,
    'BARATO '+eur(bDev.returns)+' € · CARO '+eur(cDev.returns)+
    ' € · P&L '+eur(conDev.ret)+' €');
  const vSuma = conDev.v.reduce((a,r)=>a+r.profit,0);
  check('B3 · con la fórmula antigua el desglose se pasaba el coste entero de las devoluciones',
    vSuma - conDev.c.profit > conDev.ret*0.9,
    'antiguo '+eur(vSuma)+' € vs P&L '+eur(conDev.c.profit)+
    ' € · se pasa '+eur(vSuma-conDev.c.profit)+' €');

  console.log('\n=== COH-C · CON IVA NO REPERCUTIDO · LA LÍNEA QUE NO BAJABA ===');
  /* El IVA que Amazon no repercute y que responde tu NIF es un coste real del
     periodo. Restado del total y no de ningún SKU, la tabla enseñaba
     referencias rentables que pierden dinero. */
  const conIva = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),'CARO',10,39.99,4.20), venta(dia(5),'BARATO',10,9.99,1.05)], count:2, file:'o'};
    DB.imports.vat = {count:2, file:'v', rows:[
      {uniqueaccountidentifier:'A', activityperiod:'MAY-2026', transactiontype:'SALE',
       totalactivityvalueamtvatincl:'441.90', totalactivityvalueamtvatexcl:'399.90',
       totalactivityvalueamtvatamt:'42.00', taxablejurisdiction:'SPAIN',
       taxcollectionresponsibility:'SELLER', priceofitemsamtvatrate:'0.10'}
    ]};
    periodDays = 30;
    const P = pnl();
    return {c:cuadra(), v:viejo(), vat:P.vatShortfall, rep:P.repartidos};
  `));
  check('C1 · la suma del desglose sigue siendo el beneficio del P&L',
    near(conIva.c.total, conIva.c.profit),
    eur(conIva.c.total)+' € vs '+eur(conIva.c.profit)+' €');
  const sumaVat = conIva.c.porSku.reduce((a,r)=>a+(r.vat||0),0);
  check('C2 · el IVA no repercutido se reparte entero entre los SKUs',
    near(sumaVat, conIva.vat), eur(sumaVat)+' € vs '+eur(conIva.vat)+' € del P&L');
  check('C3 · y el hub declara que es un reparto, no una medición',
    conIva.vat===0 || (conIva.rep||{}).vat===true, 'repartidos.vat='+(conIva.rep||{}).vat);

  console.log('\n=== COH-D · CON PUBLICIDAD, GASTOS FIJOS Y REEMBOLSOS ===');
  /* Publicidad: se reparte por ingreso y se declara.
     Gastos fijos y reembolsos de Amazon: NINGÚN SKU puede llevárselos, así que
     van a `noImputable`. Antes desaparecían del desglose sin decirlo, que es
     como una tabla suma más que la cuenta de la que sale. */
  const completo = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),'CARO',10,39.99,0), venta(dia(5),'BARATO',10,9.99,0)], count:2, file:'o'};
    DB.imports.reimb  = {count:1, file:'rb', rows:[{approvaldate:dia(4), amounttotal:'12.00', sku:'CARO'}]};
    DB.expenses = [{id:'e1', name:'Gestoria', amount:60}];
    DB.settings.cash.ppcDaily = 1;
    periodDays = 30;
    const P = pnl();
    return {c:cuadra(), ppc:P.ppc, fixed:P.fixed, reimb:P.reimb, rep:P.repartidos, det:P.noImputableDetalle};
  `));
  check('D1 · la suma del desglose MÁS lo no imputable es el beneficio del P&L',
    near(completo.c.total, completo.c.profit),
    eur(completo.c.total)+' € vs '+eur(completo.c.profit)+' €');
  check('D2 · y sin lo no imputable NO cuadra, que es justo el punto',
    !near(completo.c.suma, completo.c.profit),
    'solo desglose '+eur(completo.c.suma)+' € · no imputable '+eur(completo.c.noImp)+' €');
  check('D3 · lo no imputable es exactamente reembolsos menos gastos fijos',
    near(completo.c.noImp, completo.reimb - completo.fixed),
    eur(completo.c.noImp)+' € = '+eur(completo.reimb)+' − '+eur(completo.fixed));
  const sumaPpc = completo.c.porSku.reduce((a,r)=>a+(r.ppc||0),0);
  check('D4 · la publicidad se reparte entera y se declara como reparto',
    near(sumaPpc, completo.ppc) && (completo.rep||{}).ppc===true,
    eur(sumaPpc)+' € vs '+eur(completo.ppc)+' € del P&L');

  console.log('\n=== COH-E · CON LIQUIDACIÓN · EL TAMAÑO LO PONE AMAZON, LA FORMA LA ESTIMACIÓN ===');
  /* Cuando la liquidación mide el total de comisión pero no lo desglosa por
     SKU, el TAMAÑO es el medido y la FORMA es la estimada. Así el desglose no
     puede sumar otra cosa que el total. */
  const liq = await page.evaluate(js(`
    const ventas=[]; for(let k=0;k<20;k++){ ventas.push(venta(dia(k),'CARO',2,39.99,0));
                                            ventas.push(venta(dia(k),'BARATO',5,9.99,0)); }
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    const l=[]; for(let k=0;k<14;k++) l.push({settlementid:'S', transactiontype:'Order',
      posteddate:dia(k), marketplacename:'Amazon.es',
      itemrelatedfeetype:'Commission', itemrelatedfeeamount:'-9.00',
      orderfeetype:'', orderfeeamount:'', shipmentfeetype:'', shipmentfeeamount:'', promotionamount:''});
    DB.imports.settlement = {rows:l, count:14, file:'q'};
    periodDays = 30;
    const P = pnl();
    return {c:cuadra(), ref:P.referral, fba:P.fba, storage:P.storage, other:P.otherFee};
  `));
  check('E1 · la suma del desglose es el beneficio del P&L',
    near(liq.c.total, liq.c.profit),
    eur(liq.c.total)+' € vs '+eur(liq.c.profit)+' €');
  const sumaRef = liq.c.porSku.reduce((a,r)=>a+(r.referral||0),0);
  const sumaFba = liq.c.porSku.reduce((a,r)=>a+(r.fba||0),0);
  check('E2 · la comisión repartida suma la comisión del P&L al céntimo',
    near(sumaRef, liq.ref), eur(sumaRef)+' € vs '+eur(liq.ref)+' €');
  check('E3 · y la tarifa de logística también',
    near(sumaFba, liq.fba), eur(sumaFba)+' € vs '+eur(liq.fba)+' €');

  console.log('\n=== COH-F · CON EL FILTRO DE PAÍS PUESTO ===');
  /* La coherencia tiene que aguantar en CUALQUIER eje, no solo con el filtro
     en «todos». Con el desplegable en un país, el P&L y el desglose miran las
     mismas ventas o no miran lo mismo. */
  const filtro = await page.evaluate(js(`
    DB.imports.orders = {rows:[
      venta(dia(5),'CARO',10,39.99,0,'ES'), venta(dia(5),'BARATO',10,9.99,0,'ES'),
      venta(dia(4),'CARO',6,39.99,0,'FR'),  venta(dia(4),'BARATO',8,9.99,0,'IT')], count:4, file:'o'};
    DB.imports.returns = {rows:[devol(dia(3),'BARATO',4,'SELLABLE')], count:1, file:'d'};
    periodDays = 30;
    const r = {};
    ['ALL','ES','FR','IT'].forEach(p=>{ countryFilter=p; r[p]=cuadra(); });
    countryFilter='ALL';
    return r;
  `));
  ['ALL','ES','FR','IT'].forEach(p=>{
    check('F · con el filtro en '+p+' la suma del desglose es el beneficio del P&L',
      near(filtro[p].total, filtro[p].profit),
      eur(filtro[p].total)+' € vs '+eur(filtro[p].profit)+' €');
  });

  console.log('\n=== COH-G · UN SKU DE SORTEO · INGRESO CERO Y TARIFA REAL ===');
  /* Hay SKUs de sorteo en el informe real, con unidades servidas y 0 € de
     ingreso. Con la fórmula antigua salían exactamente a cero —el reparto era
     proporcional al ingreso, y su ingreso es cero—. Con la nueva aparecen,
     correctamente, como pérdida pura de tarifa de logística. */
  const sorteo = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),'CARO',10,39.99,0), venta(dia(5),'BARATO',19,0,0)], count:2, file:'o'};
    periodDays = 30;
    return {c:cuadra(), v:viejo()};
  `));
  const gSorteo = sorteo.c.porSku.find(r=>r.sku==='BARATO');
  const vSorteo = sorteo.v.find(r=>r.sku==='BARATO');
  check('G1 · la suma del desglose es el beneficio del P&L',
    near(sorteo.c.total, sorteo.c.profit),
    eur(sorteo.c.total)+' € vs '+eur(sorteo.c.profit)+' €');
  check('G2 · el SKU de sorteo aparece como pérdida, no como cero',
    n(gSorteo.profit) < -1, eur(gSorteo.profit)+' € · con la fórmula antigua daba '+
    eur(vSorteo.profit)+' €');
  check('G3 · y su pérdida incluye la tarifa de logística que sí se paga',
    n(gSorteo.fba) > 1, eur(gSorteo.fba)+' € de tarifa sobre 19 unidades servidas');

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
