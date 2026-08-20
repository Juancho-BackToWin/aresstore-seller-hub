/* =========================================================================
   Tesorería · la proyección de caja a 90 días

   Es el número con el que se decide si cabe un pedido. Una caja optimista no
   da error: hace que se lance un pedido que deja la cuenta en descubierto, y
   eso se descubre en el banco, no en la pantalla.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> Math.abs(a-b) < (t==null?0.01:t);

/* Laboratorio: 10 unidades al día a 100 € sin IVA, coste puesto 40 €/ud.
   Saldo de partida 10.000 €. Sin reserva, sin IVA, sin gastos fijos, para que
   la cuenta se pueda hacer de cabeza. */
const LAB = `
  DB = blankDB();
  DB.products = [{id:'t1', sku:'TEST-1', name:'P', cogs:40, freight:0, fba:0,
                  referral:0, price:100, channel:'FBA', lots:[]}];
  const hoy = new Date();
  const dia = k => { const d=new Date(hoy); d.setDate(d.getDate()-k);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const venta = (d,q)=>({amazonorderid:'o'+d+q, purchasedate:d+'T10:00:00+00:00',
    fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'TEST-1', asin:'B0X',
    itemstatus:'Shipped', quantity:String(q), itemprice:String(100*q), itemtax:'0',
    shipcountry:'ES'});
  const ventas=[]; for(let k=0;k<30;k++) ventas.push(venta(dia(k),10));
  DB.imports.orders = {rows:ventas, count:30, file:'o'};
  DB.settings.cash.start = 10000;
  DB.settings.cash.reserve = 0;
  DB.settings.cash.vat = 0;
  DB.settings.cash.ppcDaily = 0;
  periodDays = 30;
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

  console.log('\n=== CAJA-A · VENDER 90 DÍAS SIN VOLVER A COMPRAR NO ES PRUDENTE, ES OTRO NEGOCIO ===');
  /* Aritmética del caso, sin ningún pedido cargado:
       ingreso diario  = 30.000 € / 30 días        = 1.000,00 €/día
       coste diario    = 30 ud/día... no: 10 ud/día × 40 € = 400,00 €/día
       en 90 días entra 90.000 € y sale 90 × 400   = 36.000,00 €
       caja final      = 10.000 + 90.000 − 36.000  = 64.000,00 €  (aprox., el
       cobro va por ciclos de 14 días y el último tramo queda pendiente)
     Lo que importa de la prueba no es el céntimo, es que el coste de reponer
     NO puede ser cero: con `dayCogsFlow = 0` salían 36.000 € de más. */
  const repone = await page.evaluate(js(`
    const C = cashProjection();
    const salidas = C.reduce((a,c)=>a+c.outflow, 0);
    return {meta:C.meta, salidas, final:C[C.length-1].bal,
            minimo:C.reduce((a,b)=>b.bal<a.bal?b:a,C[0]).bal};
  `));
  check('la curva descuenta el coste de reponer, todos los días',
    near(repone.meta.dayCogsFlow, 400), repone.meta.dayCogsFlow.toFixed(2)+' €/día = 10 ud × 40 € · con el fallo era 0,00');
  check('y en 90 días eso son 36.000 € que antes no salían de la cuenta',
    near(repone.salidas, 36000, 1), repone.salidas.toFixed(2)+' €');

  console.log('\n=== CAJA-B · LO QUE YA HAS PEDIDO NO SE PAGA DOS VECES ===');
  /* Un pedido de 600 unidades cubre 60 días de venta a 10 ud/día. Durante esos
     60 días no se carga reposición diaria, porque ya la estás pagando en los
     vencimientos del pedido. Si se cargaran las dos cosas, la curva restaría
     24.000 € de reposición más los 24.000 € del pedido por la misma mercancía. */
  const doble = await page.evaluate(js(`
    DB.suppliers=[{id:'s1', name:'Prov', lead:30}];
    DB.pos=[{id:'p1', ref:'PO-1', supplierId:'s1', status:'transit', freight:0,
             items:[{sku:'TEST-1', qty:600, unitCost:40}],
             payments:[{pct:100, dueDate:dia(-10), paid:false}]}];
    const C = cashProjection();
    const salidas = C.reduce((a,c)=>a+c.outflow, 0);
    const pagoPO = C.reduce((a,c)=>a+c.po, 0);
    return {meta:C.meta, salidas, pagoPO};
  `));
  check('el pedido cubre 60 días de venta', Math.round(doble.meta.diasCubiertos)===60,
    Math.round(doble.meta.diasCubiertos)+' d = 600 ud / 10 al día');
  check('el pedido se paga entero una vez', near(doble.pagoPO, 24000),
    doble.pagoPO.toFixed(2)+' € = 600 × 40');
  check('y solo se repone a diario lo que el pedido NO cubre',
    near(doble.salidas, 24000 + 30*400, 1),
    doble.salidas.toFixed(2)+' € = 24.000 del pedido + 30 días × 400 · sin el crédito serían 60.000');

  console.log('\n=== CAJA-C · UN PAGO VENCIDO Y SIN PAGAR NO DESAPARECE ===');
  /* Estaba filtrado con `k>=0`, así que un vencimiento de hace dos días —o el
     de hoy mismo, por el redondeo de daysBetween— se caía de la curva mientras
     el KPI «Pagos comprometidos» seguía contándolo. La pantalla enseñaba una
     deuda que la proyección no gastaba nunca. */
  const vencido = await page.evaluate(js(`
    DB.suppliers=[{id:'s1', name:'Prov', lead:30}];
    DB.pos=[{id:'p1', ref:'PO-1', supplierId:'s1', status:'received', freight:0,
             items:[{sku:'OTRO', qty:100, unitCost:35}],
             payments:[{pct:100, dueDate:dia(2), paid:false}]}];   // vencio hace 2 dias
    const C = cashProjection();
    return {dia0:C[0].po, total:C.reduce((a,c)=>a+c.po,0)};
  `));
  check('el vencimiento atrasado se paga el día 0, no en el limbo',
    near(vencido.dia0, 3500), vencido.dia0.toFixed(2)+' € = 100 × 35 · con el fallo eran 0,00 €');
  check('y solo una vez', near(vencido.total, 3500), vencido.total.toFixed(2)+' €');

  console.log('\n=== CAJA-D · UN PAGO QUE VENCE HOY VENCE HOY, SEAN LAS 11 O LAS 23 ===');
  const hoyPago = await page.evaluate(js(`
    DB.suppliers=[{id:'s1', name:'Prov', lead:30}];
    DB.pos=[{id:'p1', ref:'PO-1', supplierId:'s1', status:'transit', freight:0,
             items:[{sku:'OTRO', qty:100, unitCost:25}],
             payments:[{pct:100, dueDate:dia(0), paid:false}]}];
    const C = cashProjection();
    return {dia0:C[0].po, total:C.reduce((a,c)=>a+c.po,0), hora:new Date().getHours()};
  `));
  check('el pago de hoy está en la curva', near(hoyPago.dia0, 2500),
    hoyPago.dia0.toFixed(2)+' € a las '+hoyPago.hora+':00 · con el fallo desaparecía a partir de las 12:00');

  console.log('\n=== CAJA-E · UN DESCUBIERTO NO PUEDE PARECER UN BUEN DÍA ===');
  /* La altura de la barra era el valor absoluto contra flex-end: -6.000 se
     dibujaba idéntico a +6.000, y cuanto más hondo el agujero, más alta la
     barra. Se mide en píxeles del DOM, no leyendo el CSS. */
  const barras = await page.evaluate(js(`
    DB.suppliers=[{id:'s1', name:'Prov', lead:30}];
    DB.pos=[{id:'p1', ref:'PO-1', supplierId:'s1', status:'transit', freight:0,
             items:[{sku:'OTRO', qty:1000, unitCost:80}],
             payments:[{pct:100, dueDate:dia(-10), paid:false}]}];
    go('tesoreria');
    const C = cashProjection();
    const chart = document.getElementById('cashChart');
    const cero = chart.querySelector('.zeroline').getBoundingClientRect();
    const fills = [...chart.querySelectorAll('.cfill')];
    const conSigno = fills.map((f,i)=>{
      const r = f.getBoundingClientRect();
      return {bal:C[i].bal, arriba:r.bottom<=cero.top+1.5, abajo:r.top>=cero.top-1.5, alto:r.height};
    });
    const pos = conSigno.filter(x=>x.bal>0), neg = conSigno.filter(x=>x.bal<0);
    return {hayNeg:neg.length, hayPos:pos.length,
            posBienColocadas: pos.every(x=>x.arriba),
            negBienColocadas: neg.every(x=>x.abajo),
            ejemploNeg: neg[0], ejemploPos: pos[0]};
  `));
  check('el escenario llega de verdad a números rojos', barras.hayNeg>0 && barras.hayPos>0,
    barras.hayPos+' días en positivo · '+barras.hayNeg+' en negativo');
  check('las barras positivas salen por encima de la línea de cero', barras.posBienColocadas===true);
  check('y las negativas cuelgan por debajo, no crecen hacia arriba', barras.negBienColocadas===true,
    'saldo '+Math.round(barras.ejemploNeg.bal)+' € · con el fallo se dibujaba igual que uno positivo del mismo importe');

  console.log('\n=== CAJA-F · EL AVISO ROJO NO SE APAGA POR NO TENER PEDIDOS CARGADOS ===');
  /* El veredicto rojo estaba detrás de `if(!DB.pos.length && !DB.expenses.length)`,
     que es exactamente el estado de un usuario nuevo. Noventa días arrancando
     en negativo y ni una línea roja aquí, mientras el Panel sí avisaba con los
     mismos datos. */
  const aviso = await page.evaluate(js(`
    DB.settings.cash.start = -2000;
    DB.pos = []; DB.expenses = [];
    go('tesoreria');
    const txt = document.getElementById('cashVerdict').textContent;
    return {txt, avisa:/por debajo del colch/i.test(txt),
            sigueDiciendoQueFaltanDatos:/no has cargado ning/i.test(txt)};
  `));
  check('con el saldo en negativo, Tesorería avisa', aviso.avisa===true,
    aviso.txt.slice(0,90)+'…');
  check('y sigue diciendo que faltan pedidos y gastos, sin tapar el aviso',
    aviso.sigueDiciendoQueFaltanDatos===true, 'las dos cosas caben');

  console.log('\n=== CAJA-G · LO QUE CUBRE DÍAS ES LO QUE VIENE EN CAMINO, NO CUALQUIER PEDIDO ===');
  /* La curva descuenta reposición salvo los días que ya cubre mercancía
     pedida. Ese crédito solo vale para lo que de verdad está viajando.

     Aritmética del caso, con el laboratorio (10 ud/día, 40 €/ud de coste):
       coste de reposición = 10 × 40                    =    400,00 €/día
       en 90 días sin ningún crédito                    = 36.000,00 €

     Un pedido de 600 unidades daría 600/10 = 60 días de crédito, y la salida
     bajaría a 30 × 400 = 12.000 €. Diferencia: 24.000 €.

     Ese crédito NO debe darse cuando:
       · el pedido ya está RECIBIDO — está en la estantería, su coste ya viajó
         al lote y al coste de ventas; contarlo otra vez es contarlo dos veces;
       · el pedido es un BORRADOR — no lo has enviado, no hay nada viajando;
       · el pedido es de OTRO SKU — 600 unidades de un producto no reponen las
         ventas de otro.                                                      */
  const credito = await page.evaluate(js(`
    /* Solo la reposición, sin los vencimientos del propio pedido: lo que se
       compara es el crédito de días, no el desembolso. */
    const salida = () => { const c = cashProjection();
      return c.reduce((a,d)=>a+((d.outflow||0)-(d.po||0)), 0); };
    const po = (status, sku, qty) => { DB.pos = [{id:'p1', supplier:'S', status:status,
      eta:'', items:[{sku:sku, qty:qty, unitCost:40}], payments:[]}]; return salida(); };
    DB.pos = []; DB.expenses = [];
    const sinPedido   = salida();
    const enTransito  = po('transit',  'TEST-1', 600);
    const recibido    = po('received', 'TEST-1', 600);
    const borrador    = po('draft',    'TEST-1', 600);
    const otroSku     = po('transit',  'OTRO',   600);
    DB.pos = [];
    return {sinPedido, enTransito, recibido, borrador, otroSku};
  `));
  console.log('     sin pedido ' + credito.sinPedido.toFixed(0) + ' €  ·  en tránsito ' +
              credito.enTransito.toFixed(0) + ' €  ·  recibido ' + credito.recibido.toFixed(0) +
              ' €  ·  borrador ' + credito.borrador.toFixed(0) + ' €  ·  otro SKU ' +
              credito.otroSku.toFixed(0) + ' €');
  check('un pedido en tránsito SÍ cubre días y baja la salida',
        credito.enTransito < credito.sinPedido - 1000,
        credito.enTransito.toFixed(0) + ' € frente a ' + credito.sinPedido.toFixed(0) + ' €');
  check('un pedido ya RECIBIDO no vuelve a cubrir días',
        near(credito.recibido, credito.sinPedido, 1),
        credito.recibido.toFixed(0) + ' € frente a ' + credito.sinPedido.toFixed(0) + ' €');
  check('un BORRADOR no cubre días',
        near(credito.borrador, credito.sinPedido, 1),
        credito.borrador.toFixed(0) + ' € frente a ' + credito.sinPedido.toFixed(0) + ' €');
  check('un pedido de OTRO SKU no repone las ventas de este',
        near(credito.otroSku, credito.sinPedido, 1),
        credito.otroSku.toFixed(0) + ' € frente a ' + credito.sinPedido.toFixed(0) + ' €');

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
