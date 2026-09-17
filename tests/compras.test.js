/* =========================================================================
   Carril 7 · M3 · Compras y caja

   Todo lo de aquí persigue la misma clase de fallo: el hub no revienta, el hub
   enseña un número creíble y falso. Un lote con 400 unidades que no han
   llegado, un flete repartido por un criterio distinto del que dice la
   pantalla, un pedido en dólares leído como euros, o 35.000 € de un pedido que
   la curva de caja no gasta nunca porque nadie escribió su vencimiento.

   Las fixtures son sintéticas y llevan fechas RELATIVAS a hoy: una prueba
   atada a una fecha absoluta se pudre sola en cuanto pasa el mes.

   A 1440 px la barra lateral va plegada y todos los botones de navegación
   miden 0×0, así que aquí se navega con `page.evaluate(()=>go('compras'))` y
   nunca con un click sobre `.nav-item`.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> Math.abs(a-b) < (t==null?0.01:t);

/* Laboratorio. Dos productos para poder repartir flete entre caro y barato, y
   30 días de ventas de 10 ud/día del primero para que la curva de caja tenga
   algo que proyectar. Sin reserva, sin IVA y sin gastos fijos: la aritmética
   se hace de cabeza y se escribe en el comentario de cada bloque. */
const LAB = `
  DB = blankDB();
  DB.products = [
    {id:'t1', sku:'A-1', name:'Barato', cogs:10, freight:0, fba:0, referral:0, price:100, channel:'FBA', lots:[]},
    {id:'t2', sku:'B-2', name:'Caro',   cogs:40, freight:0, fba:0, referral:0, price:300, channel:'FBA', lots:[]}
  ];
  DB.suppliers = [{id:'s1', name:'Fabrica', country:'CN', lead:60, prod:30, moq:100}];
  const hoy = new Date();
  const dia = k => { const d=new Date(hoy); d.setDate(d.getDate()-k);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const venta = (d,q)=>({amazonorderid:'o'+d+q, purchasedate:d+'T10:00:00+00:00',
    fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'A-1', asin:'B0X',
    itemstatus:'Shipped', quantity:String(q), itemprice:String(100*q), itemtax:'0',
    shipcountry:'ES'});
  const ventas=[]; for(let k=0;k<30;k++) ventas.push(venta(dia(k),10));
  DB.imports.orders = {rows:ventas, count:30, file:'o'};
  DB.settings.cash.start = 100000;
  DB.settings.cash.reserve = 0;
  DB.settings.cash.vat = 0;
  DB.settings.cash.ppcDaily = 0;
  DB.settings.costMethod = 'period';
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

  /* ═══════════════════════════════════════════════════════════════════════
     COM-A · UN PEDIDO QUE LLEGA EN DOS VECES SON DOS LOTES, NO UNO
     ═══════════════════════════════════════════════════════════════════════
     Pedido:  1.500 ud de A-1 a 10 €/ud · flete 3.000 € repartido por unidades
     Flete por unidad  = 3.000 / 1.500                    =     2,00 €/ud
     Coste puesto      = 10,00 + 2,00                     =    12,00 €/ud
     Entrega 1 (hace 40 d): 600 ud → lote de 600 ud, 7.200 € puestos
     Entrega 2 (hace 10 d): 500 ud → lote de 500 ud, 6.000 € puestos
     Pendientes: 1.500 − 1.100                            =       400 ud
     Flete efectivamente cargado = 1.100 × 2,00           =  2.200,00 €
       ( = 3.000 × 1.100/1.500, que es lo que tiene que ser )

     Sin entregas parciales el pedido creaba UN lote de 1.500 unidades fechado
     el día de la primera caja: 400 unidades de stock que no existen y 4.800 €
     de valor inventado, con la fecha equivocada además. */
  console.log('\n=== COM-A · ENTREGAS PARCIALES: UN LOTE POR RECEPCIÓN, CADA UNO CON SU FECHA ===');
  const parcial = await page.evaluate(js(`
    DB.pos = [{id:'p1', ref:'PO-PARCIAL', supplierId:'s1', status:'transit', alloc:'units',
      freight:3000, ordered:dia(90), eta:dia(-5), received:dia(40),
      items:[{sku:'A-1', qty:1500, unitCost:10}],
      receipts:[{id:'r1', ref:'1a caja', date:dia(40), lines:{0:600}},
                {id:'r2', ref:'2a caja', date:dia(10), lines:{0:500}}],
      payments:[{label:'todo', pct:100, dueDate:dia(-20), paid:false}]}];
    applyPOCosts(DB.pos[0]);
    applyPOCosts(DB.pos[0]);                        // reaplicar no puede duplicar
    const L = DB.products[0].lots.filter(l=>l.poId);
    const A = poReceiptAudit(DB.pos[0]);
    return {n:L.length,
            unidades: L.reduce((a,l)=>a+l.qty,0),
            fechas: L.map(l=>l.date).sort(),
            costes: L.map(l=>+(l.unit+l.freight).toFixed(4)),
            fleteCargado: L.reduce((a,l)=>a+l.qty*l.freight,0),
            esperadas: [dia(40), dia(10)].sort(),
            audit:{pedidas:A.pedidas, recibidas:A.recibidas, pendientes:A.pendientes, entregas:A.entregas}};
  `));
  check('el pedido crea un lote por entrega, no uno por pedido', parcial.n===2,
    parcial.n+' lotes · sin entregas parciales sale 1 lote con las 1.500 unidades de golpe');
  check('y solo cuenta las unidades que han llegado de verdad', parcial.unidades===1100,
    parcial.unidades+' ud de las 1.500 pedidas · las otras 400 siguen en el barco');
  check('cada lote lleva la fecha de SU recepción',
    JSON.stringify(parcial.fechas)===JSON.stringify(parcial.esperadas),
    parcial.fechas.join(' · ')+' · esperadas '+parcial.esperadas.join(' · '));
  check('partir el envío no cambia el coste unitario: 10,00 + 3.000/1.500',
    parcial.costes.every(c=>near(c,12)), parcial.costes.join(' · ')+' € puestos');
  check('el flete cargado es el del pedido en la proporción recibida',
    near(parcial.fleteCargado, 2200, 0.5),
    parcial.fleteCargado.toFixed(2)+' € = 3.000 × 1.100/1.500 · repartir el flete entero entre lo recibido daría 3.000 y un coste unitario inflado');
  check('la auditoría de recepción cuadra: 1.100 recibidas, 400 pendientes',
    parcial.audit.recibidas===1100 && parcial.audit.pendientes===400 && parcial.audit.entregas===2,
    JSON.stringify(parcial.audit));
  check('aplicar el pedido dos veces actualiza los lotes, no los duplica', parcial.n===2,
    'dos entregas, dos lotes');

  console.log('\n=== COM-B · UNA ENTREGA SIN FECHA NO INVENTA UNA FECHA PLAUSIBLE ===');
  /* `poLotDate()` manda: sin fecha de recepción no hay lote. Con entregas, la
     fecha que manda es la de la ENTREGA, no la del pedido. Caer en
     `po.received` fecharía la primera caja el día en que llegó la última, que
     es semanas después de que ese stock existiera. */
  const sinFecha = await page.evaluate(js(`
    DB.pos = [{id:'p2', ref:'PO-SF', supplierId:'s1', status:'transit', alloc:'units',
      freight:0, ordered:dia(90), received:dia(5),
      items:[{sku:'A-1', qty:1000, unitCost:10}],
      receipts:[{id:'r1', ref:'con fecha', date:dia(30), lines:{0:400}},
                {id:'r2', ref:'sin fecha', date:'',       lines:{0:600}}],
      payments:[{label:'todo', pct:100, dueDate:dia(-1), paid:false}]}];
    applyPOCosts(DB.pos[0]);
    const L = DB.products[0].lots.filter(l=>l.poId);
    return {n:L.length, unidades:L.reduce((a,l)=>a+l.qty,0), fecha:(L[0]||{}).date,
            esperada:dia(30), recibido:DB.pos[0].received,
            lotDateDeLaEntregaSinFecha: poLotDate(DB.pos[0], DB.pos[0].receipts[1])};
  `));
  check('la entrega sin fecha no crea lote', sinFecha.n===1 && sinFecha.unidades===400,
    sinFecha.n+' lote · '+sinFecha.unidades+' ud · la de 600 espera a tener fecha');
  check('y NO se le pega la fecha de «Recibido el»',
    sinFecha.lotDateDeLaEntregaSinFecha===null,
    String(sinFecha.lotDateDeLaEntregaSinFecha)+' · caer en '+sinFecha.recibido+' fecharía ese stock semanas después de existir');
  check('la entrega que sí tiene fecha usa la suya', sinFecha.fecha===sinFecha.esperada,
    sinFecha.fecha+' · esperada '+sinFecha.esperada);

  /* ═══════════════════════════════════════════════════════════════════════
     COM-C · EL FLETE REPARTIDO, Y LA BASE DEL REPARTO A LA VISTA
     ═══════════════════════════════════════════════════════════════════════
     Pedido: flete 1.000 €
       A-1 · 100 ud × 10 € = 1.000 € · 2,00 kg/ud = 200 kg
       B-2 · 100 ud × 40 € = 4.000 € · 0,50 kg/ud =  50 kg
       Totales: 200 ud · 5.000 € · 250 kg
     Por unidades:  1.000/200                       = 5,00 €/ud a las dos
     Por valor:     A = 1.000 × 1.000/5.000 / 100   = 2,00 €/ud
                    B = 1.000 × 4.000/5.000 / 100   = 8,00 €/ud
     Por peso:      A = 1.000 ×   200/250   / 100   = 8,00 €/ud
                    B = 1.000 ×    50/250   / 100   = 2,00 €/ud
     El mismo flete da un coste puesto de 12, 15 o 18 € para A-1 según el
     criterio. Un 50 % de diferencia en el coste del SKU barato: por eso la
     base del reparto tiene que verse, y no puede vivir dentro de una función. */
  console.log('\n=== COM-C · EL MISMO FLETE, TRES COSTES UNITARIOS: LA BASE SE DICE ===');
  const flete = await page.evaluate(js(`
    const mk = alloc => ({id:'p3', ref:'PO-FLETE', supplierId:'s1', status:'transit', alloc:alloc,
      freight:1000, ordered:dia(30),
      items:[{sku:'A-1', qty:100, unitCost:10, weight:2},
             {sku:'B-2', qty:100, unitCost:40, weight:0.5}], payments:[]});
    const leer = alloc => { const po = mk(alloc); const b = poFreightBasis(po);
      return {a:+poUnitCostOf(po, po.items[0]).toFixed(4), b:+poUnitCostOf(po, po.items[1]).toFixed(4),
              base:{usado:b.usado, total:b.total, degradado:b.degradado, texto:b.texto}}; };
    return {units:leer('units'), value:leer('value'), weight:leer('weight')};
  `));
  check('por unidades: 1.000/200 = 5,00 €/ud a las dos líneas',
    near(flete.units.a,15) && near(flete.units.b,45),
    'A-1 '+flete.units.a+' € · B-2 '+flete.units.b+' €');
  check('por valor: el caro se lleva el flete (8,00 frente a 2,00)',
    near(flete.value.a,12) && near(flete.value.b,48),
    'A-1 '+flete.value.a+' € · B-2 '+flete.value.b+' €');
  check('por peso: se invierte, el voluminoso paga (8,00 el barato)',
    near(flete.weight.a,18) && near(flete.weight.b,42),
    'A-1 '+flete.weight.a+' € · B-2 '+flete.weight.b+' € · sin el reparto por peso salía 15 y 45 como si fuera por unidades');
  check('la base del reparto por peso dice sobre qué total reparte',
    flete.weight.base.usado==='weight' && near(flete.weight.base.total,250) && flete.weight.base.degradado===false,
    flete.weight.base.texto);
  check('y la de por valor también', flete.value.base.usado==='value' && near(flete.value.base.total,5000),
    flete.value.base.texto);

  console.log('\n=== COM-D · REPARTIR POR PESO SIN PESOS NO SE HACE EN SILENCIO ===');
  /* Si nadie ha declarado kilos, el reparto por peso no se puede hacer. Caer a
     unidades y seguir rotulando «por peso» es exactamente un número creíble y
     falso: la pantalla afirma un criterio y aplica otro. */
  const degrada = await page.evaluate(js(`
    const po = {id:'p4', ref:'PO-SINPESO', supplierId:'s1', status:'transit', alloc:'weight',
      freight:1000, ordered:dia(30),
      items:[{sku:'A-1', qty:100, unitCost:10}, {sku:'B-2', qty:100, unitCost:40}], payments:[]};
    const b = poFreightBasis(po);
    return {pedido:b.pedido, usado:b.usado, degradado:b.degradado, motivo:b.motivo, texto:b.texto,
            coste:+poUnitCostOf(po, po.items[0]).toFixed(4)};
  `));
  check('el criterio pedido y el aplicado se guardan por separado',
    degrada.pedido==='weight' && degrada.usado==='units', degrada.pedido+' → '+degrada.usado);
  check('y la pantalla lo declara en vez de callarlo', degrada.degradado===true && /NO aplicable/.test(degrada.texto),
    degrada.texto);
  check('el número sigue siendo el de unidades, que es el que se ha aplicado',
    near(degrada.coste, 15), degrada.coste+' € = 10 + 1.000/200');

  console.log('\n=== COM-E · LA BASE DEL REPARTO SE VE EN PANTALLA Y SALE EN EL CSV ===');
  const visible = await page.evaluate(js(`
    DB.pos = [{id:'p5', ref:'PO-VISIBLE', supplierId:'s1', status:'transit', alloc:'weight',
      freight:1000, ordered:dia(30), received:dia(2),
      items:[{sku:'A-1', qty:100, unitCost:10, weight:2},{sku:'B-2', qty:100, unitCost:40, weight:0.5}],
      payments:[{label:'todo', pct:100, dueDate:dia(-3), paid:false}]}];
    go('compras');
    const txt = document.getElementById('poList').textContent;
    let csv='';
    const realBlob=window.Blob, realCreate=URL.createObjectURL, realClick=HTMLAnchorElement.prototype.click;
    window.Blob=function(pt,o){ csv=pt.join(''); return new realBlob(pt,o); };
    URL.createObjectURL=()=>'blob:falso'; HTMLAnchorElement.prototype.click=function(){};
    exportCompras();
    const cab = csv.replace(/^\\ufeff/,'').split('\\r\\n')[0];
    const fila = csv.replace(/^\\ufeff/,'').split('\\r\\n')[1]||'';
    window.Blob=realBlob; URL.createObjectURL=realCreate; HTMLAnchorElement.prototype.click=realClick;
    return {txt, cab, fila};
  `));
  check('la ficha del pedido enseña el criterio y el total de la base',
    /por peso/.test(visible.txt) && /250/.test(visible.txt),
    (visible.txt.match(/Flete[^\\n]{0,90}/)||[''])[0].trim());
  check('el CSV lleva columnas de reparto pedido, aplicado, total y unidad',
    /Reparto pedido/.test(visible.cab) && /Reparto aplicado/.test(visible.cab) &&
    /Total de la base/.test(visible.cab) && /Unidad de la base/.test(visible.cab),
    visible.cab.slice(0,160));
  check('y la fila trae el flete por unidad junto a su base, no solo el total',
    /por peso/.test(visible.fila) && /;8;/.test(visible.fila.replace(/,/g,'.').replace(/\\.0+;/g,';')),
    visible.fila.slice(0,170));

  /* ═══════════════════════════════════════════════════════════════════════
     COM-F · LAS CINCO CATEGORÍAS SUMAN LA CURVA. SI NO, SOBRA UNA VERDAD
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== COM-F · COBROS, MERCANCÍA, GASTOS, INVERSIONES Y DIVIDENDOS CUADRAN CON EL SALDO ===');
  const cats = await page.evaluate(js(`
    DB.expenses = [{id:'e1', concept:'Gestoria', amount:500}];
    DB.settings.cash.vat = 21;
    DB.pos = [{id:'p6', ref:'PO-CAT', supplierId:'s1', status:'transit', alloc:'units', freight:0,
      ordered:dia(20), items:[{sku:'A-1', qty:300, unitCost:10}],
      payments:[{label:'todo', pct:100, dueDate:dia(-15), paid:false}]}];
    DB.cashPlan = {movs:[
      {id:'m1', cat:'inversiones', concept:'Molde', amount:8000, date:dia(-20), repeat:'once'},
      {id:'m2', cat:'dividendos',  concept:'Reparto', amount:2500, date:dia(-45), repeat:'once'},
      {id:'m3', cat:'gastos',      concept:'Seguro', amount:300,  date:dia(-3),  repeat:'month'}
    ]};
    const C = cashProjection();
    let descuadre = 0, peor = null, sinCat = 0;
    let prev = DB.settings.cash.start;
    C.forEach(c=>{
      /* Sin categorías no se revienta con un TypeError: se cuenta y se dice.
         Una prueba que escupe un stack no sobrevive a que alguien borre lo que
         comprueba, porque nadie sabe leer qué falta en un stack. */
      if(!c.cat){ sinCat++; prev = c.bal; return; }
      const k = c.cat;
      const neto = k.cobros - k.mercancia - k.gastos - k.inversiones - k.dividendos;
      const d = Math.abs((c.bal - prev) - neto);
      if(d > descuadre){ descuadre = d; peor = c.k; }
      prev = c.bal;
      if(Math.abs(c.inflow - k.cobros) > 0.0001) descuadre = 1e9;
      if(Math.abs(c.outflow - (k.mercancia+k.gastos+k.inversiones+k.dividendos)) > 0.0001) descuadre = 1e9;
    });
    const T = C.meta.totales || {};
    return {descuadre, peor, sinCat, T,
            inv:T.inversiones, div:T.dividendos,
            tieneCategorias: !!(C[0] && C[0].cat)};
  `));
  check('cada día trae sus cinco categorías', cats.tieneCategorias===true && cats.sinCat===0,
    cats.sinCat+' de 90 días vienen sin desglose · sin él la pantalla enseña un reparto que nadie ha comprobado contra la curva');
  check('y las cinco suman exactamente la variación del saldo, los 90 días',
    cats.sinCat===0 && cats.descuadre < 0.0001,
    cats.sinCat ? 'no se ha podido comprobar: '+cats.sinCat+' días sin categorías'
                : 'descuadre máximo '+cats.descuadre.toFixed(6)+' € (día '+cats.peor+')');
  check('la inversión programada cae dentro de la ventana y suma 8.000',
    near(cats.inv, 8000, 0.5), (cats.inv==null?'sin totales por categoría':cats.inv.toFixed(2)+' €'));
  check('y el dividendo programado, 2.500', near(cats.div, 2500, 0.5),
    (cats.div==null?'sin totales por categoría':cats.div.toFixed(2)+' €'));

  console.log('\n=== COM-G · LA CURVA CON Y SIN DEPÓSITOS, EN LAS DOS DIRECCIONES ===');
  /* Aritmética del caso:
       Pedido de 1.000 ud × 40 €          =  40.000,00 €
       Depósito de producción, 30%        =  12.000,00 €  · fecha de pedido + 0 d
       Saldo, 70%                         =  28.000,00 €  · cierre de producción + 0 d
       Fecha de pedido = hoy + 10 d       → depósito el día 10
       Plazo de fabricación = 30 d        → saldo el día 40
     Quitar los dos depósitos tiene que subir la caja final EXACTAMENTE 40.000 €
     y no un euro más: si sube otra cosa, el depósito está moviendo algo que no
     es su importe. Y mover el plazo de fabricación de 30 a 45 días tiene que
     mover el saldo del día 40 al 55 sin cambiar la caja final. */
  const dep = await page.evaluate(js(`
    const mk = (pagos) => [{id:'p7', ref:'PO-DEP', supplierId:'s1', status:'ordered', alloc:'units',
      freight:0, ordered:dia(-10), eta:dia(-70), prodDays:30,
      items:[{sku:'B-2', qty:1000, unitCost:40}], payments:pagos}];
    const dos = [{label:'Deposito de produccion', pct:30, basis:'order',      offset:0, paid:false},
                 {label:'Saldo',                  pct:70, basis:'production', offset:0, paid:false}];
    DB.pos = mk(dos);
    const con = cashProjection();
    const diasConPago = con.filter(c=>c.po>0).map(c=>({k:c.k, po:Math.round(c.po)}));
    DB.pos = mk([]);
    const sin = cashProjection();
    DB.pos = mk(dos); DB.pos[0].prodDays = 45;
    const tarde = cashProjection();
    const diasTarde = tarde.filter(c=>c.po>0).map(c=>c.k);
    return {
      finalCon: con[89].bal, finalSin: sin[89].bal, finalTarde: tarde[89].bal,
      diasConPago, diasTarde,
      mercanciaCon: con.meta.totales.mercancia, mercanciaSin: sin.meta.totales.mercancia
    };
  `));
  console.log('     pagos en los días ' + JSON.stringify(dep.diasConPago));
  check('el depósito de producción cae el día del pedido y el saldo al cerrar fabricación',
    dep.diasConPago.length===2 && dep.diasConPago[0].k===10 && dep.diasConPago[0].po===12000 &&
    dep.diasConPago[1].k===40 && dep.diasConPago[1].po===28000,
    JSON.stringify(dep.diasConPago)+' · esperado [{k:10,po:12000},{k:40,po:28000}] · sin anclas los dos se quedan sin fecha y no entran en la curva');
  check('quitar los depósitos sube la caja final exactamente los 40.000 del pedido',
    near(dep.finalSin - dep.finalCon, 40000, 1),
    (dep.finalSin - dep.finalCon).toFixed(2)+' € de diferencia');
  check('y eso es todo lo que cambia: la categoría mercancía baja lo mismo',
    near(dep.mercanciaCon - dep.mercanciaSin, 40000, 1),
    (dep.mercanciaCon - dep.mercanciaSin).toFixed(2)+' €');
  check('alargar la fabricación de 30 a 45 días mueve el saldo del día 40 al 55',
    JSON.stringify(dep.diasTarde)==='[10,55]', JSON.stringify(dep.diasTarde)+' · esperado [10,55]');
  check('sin cambiar la caja a 90 días, porque es el mismo dinero',
    near(dep.finalCon, dep.finalTarde, 1),
    dep.finalCon.toFixed(0)+' € frente a '+dep.finalTarde.toFixed(0)+' €');

  console.log('\n=== COM-H · UN DEPÓSITO SIN PLAZO DE FABRICACIÓN NO DESAPARECE DE LA CURVA ===');
  /* Si el ancla no se puede resolver, antes se hacía `return` y ese importe se
     evaporaba de la proyección mientras «Pagos comprometidos» seguía
     contándolo: dos pantallas, dos verdades. */
  const huerfano = await page.evaluate(js(`
    DB.suppliers = [{id:'s1', name:'Fabrica', country:'CN', lead:60, moq:100}];   // sin prod
    DB.pos = [{id:'p8', ref:'PO-HUERFANO', supplierId:'s1', status:'ordered', alloc:'units', freight:0,
      ordered:dia(-5), items:[{sku:'B-2', qty:500, unitCost:40}],
      payments:[{label:'Saldo', pct:100, basis:'production', offset:0, paid:false}]}];
    const C = cashProjection();
    go('tesoreria');
    const txt = document.getElementById('cashVerdict').textContent;
    return {enCurva:C.reduce((a,c)=>a+c.po,0), sinFecha:C.meta.sinFecha,
            avisa:/sin fecha resoluble/i.test(txt)};
  `));
  check('el importe no entra en la curva, porque no hay fecha que inventar',
    near(huerfano.enCurva, 0), huerfano.enCurva.toFixed(2)+' €');
  check('pero se mide: 500 × 40 = 20.000 € contados aparte',
    near(huerfano.sinFecha, 20000, 0.5),
    huerfano.sinFecha.toFixed(2)+' € · antes se perdían en un return silencioso');
  check('y Tesorería lo dice en el veredicto', huerfano.avisa===true,
    'el usuario ve el hueco en la pantalla donde decide, no en la consola');

  /* ═══════════════════════════════════════════════════════════════════════
     COM-I · EL PEDIDO QUE HACE QUE LA CURVA SEA PLAUSIBLE Y EQUIVOCADA
     ═══════════════════════════════════════════════════════════════════════
     Un pedido de 50.000 € en el que solo se ha tecleado el anticipo del 30 %.
     La curva gasta 15.000 € y los otros 35.000 no existen en ninguna parte:
     ni en la proyección, ni en un aviso. La caja sale sobrada y el hub
     recomienda un pedido adicional que no cabe. */
  console.log('\n=== COM-I · 35.000 € QUE LA CURVA NO GASTA PORQUE NADIE ESCRIBIÓ SU VENCIMIENTO ===');
  const hueco = await page.evaluate(js(`
    const po = {id:'p9', ref:'PO-HUECO', supplierId:'s1', status:'ordered', alloc:'units', freight:0,
      ordered:dia(-3), items:[{sku:'B-2', qty:1250, unitCost:40}],
      payments:[{label:'Anticipo', pct:30, basis:'fixed', dueDate:dia(-3), paid:false}]};
    DB.pos = [po];
    const C = cashProjection();
    go('tesoreria');
    const txt = document.getElementById('cashVerdict').textContent;
    const compras = (go('compras'), document.getElementById('poKpis').textContent);
    const kpiTxt = (compras.match(/Sin calendario de pago[^A-ZÁÉÍÓÚ]*/)||[''])[0];
    po.payments.push({label:'Saldo', pct:70, basis:'fixed', dueDate:dia(-40), paid:false});
    const C2 = cashProjection();
    go('tesoreria');
    const txt2 = document.getElementById('cashVerdict').textContent;
    return {importe:poAmount(po), gap:C.meta.sinCalendario, enCurva:C.reduce((a,c)=>a+c.po,0),
            avisa:/ning[uú]n vencimiento escrito/i.test(txt),
            kpiCompras:/Sin calendario/i.test(compras) && /35\.000/.test(kpiTxt), kpiTxt,
            gap2:C2.meta.sinCalendario, enCurva2:C2.reduce((a,c)=>a+c.po,0),
            avisa2:/ning[uú]n vencimiento escrito/i.test(txt2)};
  `));
  check('el pedido son 50.000 € y la curva solo gasta el anticipo',
    near(hueco.importe, 50000) && near(hueco.enCurva, 15000, 0.5),
    hueco.importe.toFixed(0)+' € pedidos · '+hueco.enCurva.toFixed(0)+' € en la curva');
  check('el hueco se mide en euros, no se deja para que alguien lo note',
    near(hueco.gap, 35000, 0.5),
    hueco.gap.toFixed(2)+' € · sin la medición el hub enseña 35.000 € de caja que no tiene');
  check('Tesorería lo canta en el veredicto', hueco.avisa===true, 'aviso en rojo, no una nota al pie');
  check('y Compras lo lleva en un KPI propio, con el importe dentro',
    hueco.kpiCompras===true, '«'+hueco.kpiTxt.trim()+'» · esperado el KPI con los 35.000 €');
  check('al completar el calendario al 100% el hueco desaparece',
    near(hueco.gap2, 0) && near(hueco.enCurva2, 50000, 0.5) && hueco.avisa2===false,
    hueco.gap2.toFixed(2)+' € de hueco · '+hueco.enCurva2.toFixed(0)+' € en la curva');

  /* ═══════════════════════════════════════════════════════════════════════
     COM-J · DIVISA: SOLO REGISTRAR, NUNCA ADIVINAR
     ═══════════════════════════════════════════════════════════════════════
     Pedido de 1.000 ud × 45 USD + 5.000 USD de flete = 50.000 USD
     Tipo introducido A MANO: 1 USD = 0,92 €
     Importe en euros = 50.000 × 0,92                  = 46.000,00 €
     Coste puesto por unidad = (45 + 5.000/1.000) × 0,92 = 46,00 €
     Sin tipo, el hub NO convierte y NO crea lote: 50.000 USD leídos como
     50.000 € son 4.000 € de diferencia en la curva, perfectamente plausibles. */
  console.log('\n=== COM-J · UN PEDIDO EN DÓLARES NO SE LEE COMO SI FUERAN EUROS ===');
  const divisa = await page.evaluate(js(`
    const mk = fx => ({id:'pA', ref:'PO-USD', supplierId:'s1', status:'transit', alloc:'units',
      cur:'USD', fx:fx, fxDate:dia(5), freight:5000, ordered:dia(30), received:dia(4),
      items:[{sku:'B-2', qty:1000, unitCost:45}],
      payments:[{label:'todo', pct:100, basis:'fixed', dueDate:dia(-6), paid:false}]});

    DB.products[1].lots = [];
    DB.pos = [mk(0.92)];
    applyPOCosts(DB.pos[0]);
    const lote = (DB.products[1].lots.filter(l=>l.poId)[0])||{};
    const conTipo = {importe:poAmount(DB.pos[0]),
                     coste:+((lote.unit||0)+(lote.freight||0)).toFixed(4),
                     falta:poFxMissing(DB.pos[0])};

    DB.products[1].lots = [];
    DB.pos = [mk(0)];
    applyPOCosts(DB.pos[0]);
    const C = cashProjection();
    go('tesoreria');
    const txt = document.getElementById('cashVerdict').textContent;
    const sinTipo = {importe:poAmount(DB.pos[0]),
                     lotes:DB.products[1].lots.filter(l=>l.poId).length,
                     falta:poFxMissing(DB.pos[0]),
                     medido:C.meta.enDivisaSinTipo, pedidos:C.meta.posSinTipo,
                     avisa:/divisa sin tipo de cambio/i.test(txt),
                     nota:poFxNota(DB.pos[0])};
    return {conTipo, sinTipo, notaCon:poFxNota(mk(0.92))};
  `));
  check('con tipo a mano, el importe del pedido va en euros: 50.000 × 0,92',
    near(divisa.conTipo.importe, 46000) && divisa.conTipo.falta===false,
    divisa.conTipo.importe.toFixed(2)+' €');
  check('y el lote entra en euros, no en dólares: (45 + 5) × 0,92',
    near(divisa.conTipo.coste, 46),
    divisa.conTipo.coste+' € puestos · sin convertir entrarían 50,00 «euros» que son dólares');
  check('el tipo se declara como introducido a mano y sin fuente automática',
    /a mano/.test(divisa.notaCon) && /no consulta ning/.test(divisa.notaCon), divisa.notaCon);
  check('sin tipo, el pedido NO crea ningún lote', divisa.sinTipo.lotes===0,
    divisa.sinTipo.lotes+' lotes · meter 45 USD en el catálogo como 45 € es un coste un 8% bajo que nadie ve');
  check('y la curva de caja lo cuenta aparte, con su aviso',
    near(divisa.sinTipo.medido, 50000, 0.5) && divisa.sinTipo.pedidos===1 && divisa.sinTipo.avisa===true,
    divisa.sinTipo.medido.toFixed(0)+' en 1 pedido · '+divisa.sinTipo.nota.slice(0,70));

  console.log('\n=== COM-K · UN PEDIDO A MEDIO RECIBIR SIGUE CUBRIENDO LOS DÍAS QUE FALTAN ===');
  /* El lado de caja de las entregas parciales. Laboratorio: 10 ud/día de A-1 a
     10 € de coste base → 100 €/día de reposición.
       Pedido de 1.500 ud, recibidas 600 → pendientes 900 → 90 días cubiertos.
     Marcado «recibido» y sin entregas declaradas, el pedido cubre CERO días y
     la curva descuenta 90 × 100 = 9.000 € de reposición que ya está pagada en
     los vencimientos del pedido. Con las entregas declaradas cubre los 90. */
  const cobertura = await page.evaluate(js(`
    const base = recs => [{id:'pB', ref:'PO-MEDIO', supplierId:'s1', status:'received', alloc:'units',
      freight:0, ordered:dia(60), items:[{sku:'A-1', qty:1500, unitCost:10}],
      receipts:recs, payments:[]}];
    const salida = () => { const c = cashProjection();
      return {rep:c.reduce((a,d)=>a+((d.outflow||0)-(d.po||0)),0), dias:c.meta.diasCubiertos}; };
    DB.pos = []; DB.expenses = [];
    const sinPedido = salida();
    DB.pos = base([]);                                  // sin entregas: criterio de siempre
    const comoAntes = salida();
    DB.pos = base([{id:'r1', ref:'1a', date:dia(20), lines:{0:600}}]);
    const aMedias = salida();
    DB.pos = base([{id:'r1', ref:'1a', date:dia(20), lines:{0:600}},
                   {id:'r2', ref:'2a', date:dia(5),  lines:{0:900}}]);
    const entero = salida();
    DB.pos = [];
    return {sinPedido, comoAntes, aMedias, entero};
  `));
  console.log('     sin pedido '+cobertura.sinPedido.rep.toFixed(0)+' €  ·  «recibido» sin entregas '+
              cobertura.comoAntes.rep.toFixed(0)+' €  ·  600 de 1.500 recibidas '+cobertura.aMedias.rep.toFixed(0)+
              ' €  ·  todo recibido '+cobertura.entero.rep.toFixed(0)+' €');
  check('un pedido «recibido» sin entregas declaradas se comporta como siempre: cubre cero días',
    near(cobertura.comoAntes.rep, cobertura.sinPedido.rep, 1) && cobertura.comoAntes.dias===0,
    cobertura.comoAntes.rep.toFixed(0)+' € · el criterio anterior no se toca sin dato que lo justifique');
  check('con 600 de 1.500 recibidas, las 900 que faltan sí cubren 90 días',
    Math.round(cobertura.aMedias.dias)===90 && near(cobertura.aMedias.rep, 0, 1),
    Math.round(cobertura.aMedias.dias)+' d cubiertos · '+cobertura.aMedias.rep.toFixed(0)+
    ' € de reposición frente a '+cobertura.sinPedido.rep.toFixed(0)+' € · antes descontaba las dos cosas por la misma mercancía');
  check('y cuando ha llegado todo, deja de cubrir', cobertura.entero.dias===0,
    Math.round(cobertura.entero.dias)+' d · la mercancía ya está en la estantería y su coste ya viajó al lote');

  console.log('\n=== COM-L · TRES ESTADOS DE PANTALLA, SIN UN SOLO ERROR DE JS ===');
  /* Vacía, con datos a medias y completa. La navegación va por `go()`: a
     1440 px la barra lateral está plegada y los botones miden 0×0. */
  const pantallas = await page.evaluate(`(()=>{
    const r = {};
    DB = blankDB(); periodDays = 30;
    go('compras');   r.vaciaCompras   = document.getElementById('poList').textContent.length;
    go('tesoreria'); r.vaciaTesoreria = document.getElementById('cashVerdict').textContent.length;
    r.vaciaPlan = !!document.getElementById('cashPlanTable');
    r.vaciaCats = (document.getElementById('cashPlanHost')||{textContent:''}).textContent.indexOf('Dividendos')>=0;
    return r;
  })()`);
  check('con la base vacía, Compras y Tesorería pintan algo útil',
    pantallas.vaciaCompras>50 && pantallas.vaciaTesoreria>50,
    pantallas.vaciaCompras+' / '+pantallas.vaciaTesoreria+' caracteres');
  check('y el panel de las cinco categorías existe desde el primer día',
    pantallas.vaciaPlan===true && pantallas.vaciaCats===true,
    'tabla de movimientos programados y tarjetas de categoría presentes');

  const completa = await page.evaluate(()=>{
    loadDemo();
    go('compras');
    const compras = document.getElementById('poList').textContent;
    go('tesoreria');
    const host = document.getElementById('cashPlanHost');
    cashPlanAdd('inversiones');
    const conMov = document.querySelectorAll('#cashPlanTable tr').length;
    const id = DB.cashPlan.movs[0].id;
    cashPlanUpd(id, 'amount', 4000);
    const C = cashProjection();
    cashPlanDel(id);
    const sinMov = document.querySelectorAll('#cashPlanTable tr').length;
    return {compras: compras.length, comprasTxt: compras, host: !!host, hostTxt: host?host.textContent.length:0,
            conMov, sinMov, inv: C.meta.totales.inversiones, movs: DB.cashPlan.movs.length};
  });
  check('con los datos de ejemplo, Compras enseña sus pedidos con su auditoría',
    /Flete/.test(completa.comprasTxt) && /por unidades/.test(completa.comprasTxt),
    completa.comprasTxt.slice(0,150));
  check('los movimientos programados se añaden, se editan y se borran',
    completa.conMov===2 && completa.sinMov===2 && completa.movs===0,
    'cabecera + 1 fila con movimiento · cabecera + fila vacía sin él');
  check('y el importe editado entra en la categoría inversiones',
    near(completa.inv, 4000, 0.5), completa.inv.toFixed(2)+' €');

  console.log('\n=== COM-M · LA EXPORTACIÓN DE CAJA CUADRA CONSIGO MISMA ===');
  const csvCaja = await page.evaluate(js(`
    DB.expenses = [{id:'e1', concept:'Gestoria', amount:500}];
    DB.cashPlan = {movs:[{id:'m1', cat:'dividendos', concept:'Reparto', amount:3000, date:dia(-30), repeat:'once'}]};
    let csv='';
    const realBlob=window.Blob, realCreate=URL.createObjectURL, realClick=HTMLAnchorElement.prototype.click;
    window.Blob=function(pt,o){ csv=pt.join(''); return new realBlob(pt,o); };
    URL.createObjectURL=()=>'blob:falso'; HTMLAnchorElement.prototype.click=function(){};
    exportTesoreria();
    window.Blob=realBlob; URL.createObjectURL=realCreate; HTMLAnchorElement.prototype.click=realClick;
    const lineas = csv.replace(/^\\ufeff/,'').split('\\r\\n').filter(x=>x!=='');
    const cab = lineas[0].split(';');
    const idx = n => cab.indexOf(n);
    const num = s => parseFloat(String(s).replace(',', '.'))||0;
    let peor = 0;
    lineas.slice(1).forEach(l=>{
      const c = l.split(';');
      if(idx('Cat. cobros')<0 || idx('Suma de categorías')<0){ peor = 1e9; return; }
      const suma = num(c[idx('Cat. cobros')]) - num(c[idx('Cat. mercancía')]) - num(c[idx('Cat. gastos')]) -
                   num(c[idx('Cat. inversiones')]) - num(c[idx('Cat. dividendos')]);
      peor = Math.max(peor, Math.abs(suma - num(c[idx('Suma de categorías')])));
      /* Y contra las columnas de la curva, no solo contra sí mismas: cinco
         categorías a cero cuadran perfectamente consigo mismas y no dicen nada
         de los cobros y los pagos que la pantalla sí está enseñando. */
      peor = Math.max(peor, Math.abs(num(c[idx('Cobros')]) - num(c[idx('Cat. cobros')])));
      peor = Math.max(peor, Math.abs(num(c[idx('Pagos')]) -
        (num(c[idx('Cat. mercancía')]) + num(c[idx('Cat. gastos')]) +
         num(c[idx('Cat. inversiones')]) + num(c[idx('Cat. dividendos')]))));
    });
    return {cab:lineas[0], filas:lineas.length-1, peor,
            tieneDiv: idx('Cat. dividendos')>=0, tieneInv: idx('Cat. inversiones')>=0};
  `));
  check('el CSV de caja abre los 90 días por las cinco categorías',
    csvCaja.filas===90 && csvCaja.tieneDiv && csvCaja.tieneInv,
    csvCaja.filas+' filas · '+csvCaja.cab.slice(0,120));
  check('y las categorías cuadran con la curva y con su columna de control, fila a fila',
    csvCaja.peor < 0.02,
    csvCaja.peor>1e8 ? 'el CSV no trae las columnas de categoría, así que no hay nada que cuadrar'
                     : 'descuadre máximo '+csvCaja.peor.toFixed(4)+' €');

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
