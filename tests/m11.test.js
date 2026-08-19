/* =========================================================================
   M1.1 · pruebas de los costes por lotes

   Lo que se comprueba no es que la pantalla pinte lotes: es que los tres
   métodos den EXACTAMENTE el número que sale de hacer la cuenta a mano. Un
   motor de costes que se equivoca no da error — da un margen creíble y falso,
   que es como se decide escalar un producto que pierde dinero.

   El caso de M11-C está calculado a mano en el comentario, a propósito: si
   alguien cambia el motor y el test falla, tiene ahí la aritmética para saber
   quién de los dos está equivocado.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

const OK = c => c ? 'OK   ' : 'FALLO';
let fails = 0;
function check(label, cond, extra){
  if(!cond) fails++;
  console.log('  ' + OK(cond) + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
}
const near = (a,b,t)=> Math.abs(a-b) < (t==null?0.01:t);

/* Escenario de laboratorio, idéntico en las tres pruebas de método.
   Producto TEST-1, coste base 10 €.
   Lotes:  2026-01-01 · 10 ud · 4,00 + 1,00 = 5,00 €
           2026-03-01 · 30 ud · 6,00 + 1,00 = 7,00 €
   Ventas: 2026-02-01 · 6 ud
           2026-04-01 · 8 ud                                                */
const FIXTURE = `
  DB = blankDB();
  DB.products = [{id:'t1', sku:'TEST-1', name:'Producto de prueba', cogs:10, freight:0,
                  fba:0, referral:15, price:30, channel:'FBA',
                  lots:[{id:'l1', date:'2026-01-01', qty:10, unit:4, freight:1, ref:'A'},
                        {id:'l2', date:'2026-03-01', qty:30, unit:6, freight:1, ref:'B'}]}];
  const mk = (d,q)=>({amazonorderid:'x'+d+q, purchasedate:d+'T10:00:00+00:00',
     fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'TEST-1', asin:'B0X',
     itemstatus:'Shipped', quantity:String(q), itemprice:String(30*q), itemtax:String(30*q*0.21/1.21),
     shipcountry:'ES'});
  DB.imports.orders = {rows:[mk('2026-02-01',6), mk('2026-04-01',8)], count:2, file:'test'};
`;
const COST = `costOfSales(salesRows({from:null, country:'ALL'}))`;
/* Playwright evalúa las cadenas como EXPRESIÓN, no como cuerpo de función:
   sin envolver en una función invocada, el `return` es un error de sintaxis. */
const js = body => '(()=>{' + FIXTURE + body + '})()';

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const page = await browser.newPage({ viewport:{width:1440,height:1000} });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { const t=m.text();
    if(m.type()==='error' && t.indexOf('ERR_CONNECTION')<0 && t.indexOf('Failed to load resource')<0) errors.push('CONSOLE: '+t); });
  page.on('dialog', d => d.accept());

  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);

  console.log('\n=== M11-A · EL MOTOR EXISTE Y ARRANCA EN «POR PERIODO» ===');
  const base = await page.evaluate(()=>({
    metodos: COST_METHODS.map(m=>m.id),
    actual: costMethod(),
    hayTabla: !!document.getElementById('lotTable'),
    hayMetodo: !!document.getElementById('lotMethodBox')
  }));
  check('están los tres métodos', base.metodos.join(',')==='period,fifo,avg', base.metodos.join(', '));
  check('el método por defecto es «por periodo»', base.actual==='period',
    'es el que aguanta un registro de compras incompleto');
  check('la vista de lotes existe en el catálogo', base.hayTabla && base.hayMetodo);

  console.log('\n=== M11-B · SIN LOTES SE COMPORTA COMO ANTES DE M1.1 (no regresión) ===');
  const sinLotes = await page.evaluate(js(`
    DB.products[0].lots = [];
    const c = ${COST};
    return {cogs:c.cogs, units:c.units, base:c.quality.base, lot:c.quality.lot,
            viejo: 14*landed(DB.products[0])};
  `));
  check('el coste es el que daba el cálculo anterior', near(sinLotes.cogs, sinLotes.viejo),
    sinLotes.cogs+' € = 14 ud × '+ (sinLotes.viejo/14) +' € base');
  check('las 14 unidades se cuentan como coste base, no como medidas',
    sinLotes.base===14 && sinLotes.lot===0, sinLotes.base+' base / '+sinLotes.lot+' con lote');

  console.log('\n=== M11-C · LOS TRES MÉTODOS, CONTRA LA CUENTA A MANO ===');
  /* POR PERIODO — cada venta con el lote vigente en su fecha
       01-feb → lote A (5,00) → 6 × 5 = 30
       01-abr → lote B (7,00) → 8 × 7 = 56                    total 86,00  */
  const per = await page.evaluate(js(`
    DB.settings.costMethod='period'; const c = ${COST};
    return {cogs:c.cogs, lot:c.quality.lot, units:c.units};
  `));
  check('POR PERIODO da 86,00 €', near(per.cogs, 86), per.cogs.toFixed(2)+' €  (6×5 + 8×7)');
  check('y sin informe de inventario solo certifica lo que puede comprobar',
    per.lot===4, per.lot+' de '+per.units+' · las otras 10 salen de un lote anterior al informe y no hay stock con el que cuadrarlas');

  /* FIFO — consume el lote más antiguo que quede
       01-feb → 6 del lote A (5,00)                    = 30 · quedan 4 en A
       01-abr → 4 del lote A (20) + 4 del lote B (28)  = 48
                                                          total 78,00      */
  const fifo = await page.evaluate(js(`
    DB.settings.costMethod='fifo'; const c = ${COST};
    return {cogs:c.cogs, lot:c.quality.lot, tail:c.quality.tail, stale:c.quality.stale};
  `));
  check('FIFO da 78,00 €', near(fifo.cogs, 78), fifo.cogs.toFixed(2)+' €  (6×5 + 4×5 + 4×7)');
  check('no se queda sin lotes', near(fifo.tail,0), fifo.tail);
  check('pero avisa de las 10 unidades que salen de un lote anterior al informe',
    Math.round(fifo.stale)===10 && Math.round(fifo.lot)===4,
    fifo.stale+' de lote previo / '+fifo.lot+' comprobables');

  /* PROMEDIO PONDERADO — media de las compras hasta la fecha de la venta
       01-feb → solo lote A                     → 5,00 → 6 × 5   = 30
       01-abr → (10×5 + 30×7)/40 = 260/40 = 6,50 → 8 × 6,5       = 52
                                                          total 82,00      */
  const avg = await page.evaluate(js(`
    DB.settings.costMethod='avg'; const c = ${COST};
    return {cogs:c.cogs};
  `));
  check('PROMEDIO PONDERADO da 82,00 €', near(avg.cogs, 82), avg.cogs.toFixed(2)+' €  (6×5 + 8×6,50)');
  check('los tres métodos dan tres números distintos',
    per.cogs!==fifo.cogs && fifo.cogs!==avg.cogs && per.cogs!==avg.cogs,
    'periodo '+per.cogs+' · fifo '+fifo.cogs+' · ponderado '+avg.cogs);

  console.log('\n=== M11-D · LO QUE NO ESTÁ CUBIERTO SE CUENTA, NO SE DISIMULA ===');
  /* Se venden 14 unidades y solo se compran 5: nueve quedan sin lote que las
     explique. FIFO debe prolongar el último coste y CONTARLAS como relleno. */
  const cola = await page.evaluate(js(`
    DB.settings.costMethod='fifo';
    DB.products[0].lots = [{id:'l1', date:'2026-01-01', qty:5, unit:4, freight:1}];
    const c = ${COST};
    return {cogs:c.cogs, lot:c.quality.lot, tail:c.quality.tail, stale:c.quality.stale,
            open:c.quality.open, pct:c.measuredPct, falta:(c.bal['test-1']||{}).falta};
  `));
  check('detecta que 9 de las 14 vendidas no las explica ninguna compra',
    Math.round(cola.falta)===9 && Math.round(cola.open)===9, Math.round(cola.falta)+' unidades de apertura');
  check('y las costea al coste base, no al del lote', near(cola.cogs, 115),
    cola.cogs.toFixed(2)+' € = 9×10 base + 5×5 lote · antes daba 70 € dando el lote por infinito');
  check('sin declarar medida ni una', Math.round(cola.pct)===0,
    'las 5 con lote son de un lote anterior al informe y no se ha visto el stock');

  /* Venta anterior al primer lote: no hay compra que la explique, así que se
     costea con el COSTE BASE. Antes se costeaba con el lote más nuevo, que es
     reescribir el pasado con un precio que en ese momento no existía. */
  const apertura = await page.evaluate(js(`
    DB.settings.costMethod='period';
    DB.products[0].lots = [{id:'l2', date:'2026-03-01', qty:30, unit:6, freight:1}];
    const c = ${COST};
    return {open:c.quality.open, lot:c.quality.lot, cogs:c.cogs};
  `));
  check('la venta anterior al primer lote va al coste base, no al lote futuro',
    near(apertura.cogs, 116), apertura.cogs.toFixed(2)+' € = 6×10 base + 8×7 lote');
  check('y queda marcada como no medida', apertura.open===6 && apertura.lot===8,
    apertura.open+' de apertura / '+apertura.lot+' cubiertas');

  console.log('\n=== M11-E · CAMBIAR DE MÉTODO MUEVE EL BENEFICIO ===');
  const pnlDif = await page.evaluate(js(`
    periodDays = 0;                                  // todo el histórico
    const out = {};
    ['period','fifo','avg'].forEach(m=>{ DB.settings.costMethod=m; const P=pnl(); out[m]={cogs:P.cogs, profit:P.profit}; });
    return out;
  `));
  check('el P&L usa el método elegido', near(pnlDif.period.cogs,86) && near(pnlDif.fifo.cogs,78) && near(pnlDif.avg.cogs,82),
    'periodo '+pnlDif.period.cogs+' · fifo '+pnlDif.fifo.cogs+' · ponderado '+pnlDif.avg.cogs);
  check('y el beneficio se mueve exactamente esa diferencia',
    near(pnlDif.fifo.profit - pnlDif.period.profit, 8),
    '+'+(pnlDif.fifo.profit-pnlDif.period.profit).toFixed(2)+' € al pasar de periodo a FIFO');

  console.log('\n=== M11-F · DETERMINISTA: LA MISMA IMPORTACIÓN, EL MISMO MARGEN ===');
  const det = await page.evaluate(js(`
    DB.settings.costMethod='fifo';
    const a = ${COST}.cogs, b = ${COST}.cogs, c = ${COST}.cogs;
    return {a,b,c};
  `));
  check('tres cálculos seguidos dan el mismo coste', det.a===det.b && det.b===det.c,
    det.a+' = '+det.b+' = '+det.c+' · la cola de FIFO no se consume entre pantallas');

  console.log('\n=== M11-G · LOTES INVÁLIDOS: FUERA DEL CÁLCULO Y A LA VISTA ===');
  const malos = await page.evaluate(js(`
    DB.settings.costMethod='period';
    DB.products[0].lots.push({id:'lx', date:'', qty:100, unit:1, freight:0});
    DB.products[0].lots.push({id:'ly', date:'2026-05-01', qty:100, unit:0, freight:0});
    const c = ${COST};
    return {cogs:c.cogs, bad:badLots(DB.products[0]).length, validos:prodLots(DB.products[0]).length};
  `));
  check('un lote sin fecha o sin coste no altera el resultado', near(malos.cogs, 86), malos.cogs.toFixed(2)+' €');
  check('pero queda contado para avisar', malos.bad===2 && malos.validos===2, malos.bad+' inválidos / '+malos.validos+' válidos');

  console.log('\n=== M11-H · PEGAR LOTES DESDE UNA HOJA ===');
  const paste = await page.evaluate(js(`
    const txt = 'TEST-1\\t2026-06-01\\t100\\t5,50\\t1,10\\nNO-EXISTE\\t2026-06-01\\t50\\t2\\t1\\nTEST-1\\tfecha mala\\t10\\t3\\t1';
    const r = parseLotPaste(txt, false);
    const rt = parseLotPaste('TEST-1\\t2026-06-01\\t100\\t5,50\\t110', true);
    return {n:r.lots.length, errs:r.errs.length, unit:r.lots[0]&&r.lots[0].unit,
            freight:r.lots[0]&&r.lots[0].freight, fTotal:rt.lots[0]&&rt.lots[0].freight};
  `));
  check('lee la línea buena y descarta las dos malas', paste.n===1 && paste.errs===2,
    paste.n+' válida / '+paste.errs+' descartadas');
  check('entiende los decimales con coma', near(paste.unit,5.5) && near(paste.freight,1.1),
    paste.unit+' + '+paste.freight);
  check('y reparte el flete cuando le dices que es el total del lote', near(paste.fTotal,1.1),
    '110 € / 100 ud = '+paste.fTotal+' €/ud');

  console.log('\n=== M11-I · UN PEDIDO DE COMPRA CREA EL LOTE ===');
  const po = await page.evaluate(js(`
    DB.pos = [{id:'o9', ref:'PO-TEST', status:'received', alloc:'units', freight:200,
               received:'2026-05-01', items:[{sku:'TEST-1', qty:100, unitCost:5}]}];
    const antes = DB.products[0].lots.length;
    applyPOCosts(DB.pos[0]);
    applyPOCosts(DB.pos[0]);                       // recibir dos veces no duplica
    const L = DB.products[0].lots.filter(l=>l.poId);
    return {antes, despues:DB.products[0].lots.length, nPo:L.length,
            date:L[0]&&L[0].date, coste:L[0]?(L[0].unit+L[0].freight):0};
  `));
  check('el pedido recibido crea un lote', po.despues===po.antes+1 && po.nPo===1,
    po.antes+' → '+po.despues+' lotes');
  check('con la fecha de recepción', po.date==='2026-05-01', po.date);
  check('y el flete repartido dentro del coste puesto', near(po.coste, 7),
    po.coste+' € = 5,00 fábrica + 200/100 de flete');
  check('aplicarlo dos veces no duplica el lote', po.nPo===1, 'entrega parcial actualiza, no añade');

  console.log('\n=== M11-K · FIFO NO SE GASTA DOS VECES EL CONTENEDOR VIEJO ===');
  /* El agujero que no se ve: la cola arranca con TODO lo comprado, pero solo
     se consume con las ventas del informe, que cubre 90-120 días. Un lote de
     hace un año, comprado y vendido antes de la ventana, seguía entero en la
     cola y FIFO lo volvía a gastar: 44 % de coste desaparecido con el semáforo
     en verde. Ahora se cuenta como no comprobable y se dice. */
  const viejo = await page.evaluate(js(`
    DB.products[0].lots = [{id:'v1', date:'2025-01-10', qty:1000, unit:4, freight:1},
                           {id:'v2', date:'2026-06-01', qty:1000, unit:8, freight:1}];
    const mk2 = (d,q)=>({amazonorderid:'y'+d+q, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'TEST-1', asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:String(30*q), itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[mk2('2026-07-15',300)], count:1, file:'test2'};
    DB.settings.costMethod='fifo'; const f = ${COST};
    DB.settings.costMethod='period'; const p2 = ${COST};
    return {fifo:f.cogs, fifoPct:f.measuredPct, stale:f.quality.stale, periodo:p2.cogs};
  `));
  check('FIFO sigue dando el número barato (es lo que hace FIFO)', near(viejo.fifo, 1500),
    viejo.fifo+' € frente a '+viejo.periodo+' € por periodo');
  check('pero YA NO lo declara medido', Math.round(viejo.fifoPct)===0,
    'antes decía 100 % · ahora '+Math.round(viejo.fifoPct)+' %');
  check('y señala las 300 unidades como lote anterior al informe', Math.round(viejo.stale)===300,
    Math.round(viejo.stale)+' unidades');

  console.log('\n=== M11-L · DOS LOTES EL MISMO DÍA: EL ORDEN DE TECLEO NO PUEDE MANDAR ===');
  const empate = await page.evaluate(js(`
    DB.settings.costMethod='period';
    const barato = {id:'a', date:'2026-04-01', qty:5000, unit:4, freight:0};
    const caro   = {id:'b', date:'2026-04-01', qty:50,   unit:12, freight:0};
    DB.products[0].lots = [barato, caro];  const uno = ${COST}.cogs;
    DB.products[0].lots = [caro, barato];  const dos = ${COST}.cogs;
    return {uno, dos};
  `));
  check('por periodo, el coste no depende de en qué orden metiste los lotes', empate.uno===empate.dos,
    empate.uno.toFixed(2)+' € = '+empate.dos.toFixed(2)+' € · se promedia el día ponderando por unidades');
  const empateF = await page.evaluate(js(`
    DB.settings.costMethod='fifo';
    const barato = {id:'a', date:'2026-04-01', qty:5000, unit:4, freight:0};
    const caro   = {id:'b', date:'2026-04-01', qty:50,   unit:12, freight:0};
    DB.products[0].lots = [barato, caro];  const uno = ${COST}.cogs;
    DB.products[0].lots = [caro, barato];  const dos = ${COST}.cogs;
    return {uno, dos};
  `));
  check('y en FIFO tampoco: la cola funde los lotes del mismo día',
    empateF.uno===empateF.dos, empateF.uno.toFixed(2)+' € = '+empateF.dos.toFixed(2)+' € · antes eran 400 € y 800 €');

  console.log('\n=== M11-M · VALORAR EL STOCK NO PUEDE DEPENDER DE SI HOY HUBO UNA VENTA ===');
  const val2 = await page.evaluate(js(`
    DB.settings.costMethod='fifo';
    DB.products[0].lots = [{id:'v1', date:'2025-01-01', qty:1000, unit:4, freight:0},
                           {id:'v2', date:'2026-07-01', qty:1000, unit:12, freight:0}];
    const hoy = iso(today());
    const mk3 = (d,q)=>({amazonorderid:'z'+d, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'TEST-1', asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:'30', itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[mk3('2026-07-20',10)], count:1, file:'a'};
    const sinVentaHoy = costNow(DB.products[0]);
    DB.imports.orders = {rows:[mk3('2026-07-20',10), mk3(hoy,1)], count:2, file:'b'};
    const conVentaHoy = costNow(DB.products[0]);
    return {sinVentaHoy, conVentaHoy};
  `));
  check('el coste de reposición es el mismo con y sin venta de hoy',
    near(val2.sinVentaHoy, val2.conVentaHoy) && near(val2.sinVentaHoy, 12),
    val2.sinVentaHoy+' € = '+val2.conVentaHoy+' € · antes eran 12 € y 4 €');

  console.log('\n=== M11-N · EL RECUENTO DE ORÍGENES NO PUEDE CONTAR DOS VECES ===');
  const doble = await page.evaluate(js(`
    DB.products.push({id:'t2', sku:'TEST-2', name:'Sin lotes', cogs:3, freight:0,
                      fba:0, referral:15, price:20, channel:'FBA', lots:[]});
    const mk4 = (sk,d,q)=>({amazonorderid:'w'+sk+d, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:sk, asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:'100', itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[mk4('TEST-1','2026-04-01',100), mk4('TEST-2','2026-04-01',100)], count:2, file:'c'};
    const out={};
    ['period','fifo'].forEach(m=>{ DB.settings.costMethod=m; const c=${COST};
      out[m]={lot:Math.round(c.quality.lot), base:Math.round(c.quality.base),
              stale:Math.round(c.quality.stale), tail:Math.round(c.quality.tail),
              open:Math.round(c.quality.open), units:c.units}; });
    return out;
  `));
  check('las 100 unidades del producto sin lotes van a coste base',
    doble.period.base===100 && doble.fifo.base===100, JSON.stringify(doble.period));
  check('y el recuento es idéntico en los dos métodos',
    JSON.stringify(doble.period)===JSON.stringify(doble.fifo),
    'el método es un criterio contable, no cambia la mercancía que compraste');
  const sumaFifo = doble.fifo.lot + doble.fifo.base + doble.fifo.stale + doble.fifo.tail + doble.fifo.open;
  check('y FIFO cuenta las mismas 200 unidades, ni una más', sumaFifo===200, JSON.stringify(doble.fifo));
  check('las 100 del producto sin lotes no se cuentan dos veces', doble.fifo.base===100,
    doble.fifo.base+' a coste base · antes salían 150 sobre 200');

  console.log('\n=== M11-O · UN PEDIDO CON EL MISMO SKU EN DOS LÍNEAS ===');
  const dup = await page.evaluate(js(`
    DB.settings.costMethod='period';
    DB.products[0].lots = [];
    DB.pos = [{id:'od', ref:'PO-DUP', status:'received', alloc:'units', freight:200,
               received:'2026-05-01',
               items:[{sku:'TEST-1', qty:100, unitCost:5}, {sku:'TEST-1', qty:100, unitCost:9}]}];
    applyPOCosts(DB.pos[0]);
    applyPOCosts(DB.pos[0]);
    const L = DB.products[0].lots;
    const unidades = L.reduce((a,l)=>a+l.qty,0);
    const valor = L.reduce((a,l)=>a+l.qty*(l.unit+l.freight),0);
    return {n:L.length, unidades, valor, flete:L.map(l=>l.freight)};
  `));
  check('crea un lote por línea, no uno solo', dup.n===2, dup.n+' lotes');
  check('no se pierde ni una unidad', dup.unidades===200, dup.unidades+' de 200');
  check('ni un euro: 100×5 + 100×9 + 200 de flete', near(dup.valor, 1600), dup.valor+' €');
  check('y ningún flete sale negativo', dup.flete.every(f=>f>=0), JSON.stringify(dup.flete));

  console.log('\n=== M11-P · RECIBIR UN PEDIDO NO REESCRIBE EL MARGEN DEL PASADO ===');
  const pasado = await page.evaluate(js(`
    DB.settings.costMethod='period';
    DB.products[0].lots = [];                       // solo coste base de 10 €
    const antes = ${COST}.cogs;
    DB.pos = [{id:'op', ref:'PO-AGO', status:'received', alloc:'units', freight:0,
               received:'2026-08-01', items:[{sku:'TEST-1', qty:100, unitCost:20}]}];
    applyPOCosts(DB.pos[0]);
    const despues = ${COST}.cogs;
    return {antes, despues, base:DB.products[0].cogs};
  `));
  check('el coste de lo vendido en febrero y abril no se mueve',
    near(pasado.antes, pasado.despues), pasado.antes+' € → '+pasado.despues+' €');
  check('y el coste base del producto se queda como estaba', near(pasado.base, 10),
    pasado.base+' € · antes lo machacaba con el precio del pedido nuevo');

  console.log('\n=== M11-Q · EL SKU EN OTRA CAJA NO ABRE UNA SEGUNDA COLA ===');
  const caja = await page.evaluate(js(`
    DB.settings.costMethod='fifo';
    DB.products[0].lots = [{id:'c1', date:'2026-01-01', qty:100, unit:4, freight:0},
                           {id:'c2', date:'2026-01-02', qty:100, unit:10, freight:0}];
    const mk5 = (sk,d,q)=>({amazonorderid:'v'+sk+d, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:sk, asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:'100', itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[mk5('TEST-1','2026-03-01',100), mk5('test-1','2026-03-02',100)], count:2, file:'d'};
    return {cogs:${COST}.cogs};
  `));
  check('200 unidades consumen los 200 comprados, no 200 del lote barato',
    near(caja.cogs, 1400), caja.cogs+' € = 100×4 + 100×10');

  console.log('\n=== M11-R · EL COSTE POR PAÍS ES EL DE LO QUE VENDE CADA PAÍS ===');
  const pais = await page.evaluate(js(`
    periodDays = 0; countryFilter = 'ALL';
    DB.settings.costMethod='period';
    DB.products = [
      {id:'c1', sku:'CARO', name:'Caro', cogs:20, freight:0, fba:0, referral:15, price:50, channel:'FBA', lots:[]},
      {id:'c2', sku:'BARATO', name:'Barato', cogs:2, freight:0, fba:0, referral:15, price:50, channel:'FBA', lots:[]}];
    const mk6 = (sk,ch,q)=>({amazonorderid:'p'+sk, purchasedate:'2026-07-01T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:ch, sku:sk, asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:String(50*q), itemtax:'0', shipcountry:'DE'});
    DB.imports.orders = {rows:[mk6('CARO','Amazon.de',100), mk6('BARATO','Amazon.es',100)], count:2, file:'e'};
    const c = ${COST};
    const S = countryStats();
    const de = S.filter(x=>x.c.code==='DE')[0], es = S.filter(x=>x.c.code==='ES')[0];
    return {de:de.profit, es:es.profit, cogsDE:c.byCountry.DE.cogs, cogsES:c.byCountry.ES.cogs};
  `));
  check('el coste se imputa al país que lo vendió', near(pais.cogsDE,2000) && near(pais.cogsES,200),
    'DE '+pais.cogsDE+' € · ES '+pais.cogsES+' €');
  check('y el mercado del producto caro sale menos rentable, no igual', pais.es > pais.de,
    'DE '+Math.round(pais.de)+' € · ES '+Math.round(pais.es)+' €');

  console.log('\n=== M11-T · EL INFORME DE INVENTARIO CIERRA EL AGUJERO DE FIFO ===');
  /* Mismos lotes, mismas ventas. Lo único que cambia es si el hub sabe cuánto
     stock queda hoy. Con ese dato puede restar lo que sobra —comprado que no
     explican ni las ventas del informe ni el almacén— y descontarlo de la
     cabeza de la cola, que es donde estaba. El coste se corrige SOLO. */
  const inv = await page.evaluate(js(`
    DB.settings.costMethod='fifo';
    DB.products[0].lots = [{id:'v1', date:'2025-01-10', qty:1000, unit:4, freight:0},
                           {id:'v2', date:'2026-06-01', qty:1000, unit:10, freight:0}];
    const mkT = (d,q)=>({amazonorderid:'T'+d, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'TEST-1', asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:'100', itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[mkT('2026-07-15',300)], count:1, file:'t', loadedAt:'a'};
    const sinInv = ${COST};
    DB.imports.inventory = {rows:[{sku:'TEST-1', afnfulfillablequantity:'700'}], count:1, file:'i', loadedAt:'b'};
    const conInv = ${COST};
    return {sinCogs:sinInv.cogs, sinPct:sinInv.measuredPct, sinStale:sinInv.quality.stale,
            conCogs:conInv.cogs, conPct:conInv.measuredPct, conStale:conInv.quality.stale,
            sobra:(conInv.bal['test-1']||{}).sobra, recortado:(conInv.bal['test-1']||{}).recortado};
  `));
  check('sin informe de inventario, FIFO regasta el contenedor de 2025',
    near(inv.sinCogs,1200) && Math.round(inv.sinPct)===0,
    inv.sinCogs+' € · '+Math.round(inv.sinPct)+' % medido · '+Math.round(inv.sinStale)+' unidades marcadas');
  check('con el informe de inventario detecta que sobran 1.000 unidades',
    Math.round(inv.sobra)===1000 && Math.round(inv.recortado)===1000,
    'sobra '+Math.round(inv.sobra)+' · recortadas de la cabeza de la cola '+Math.round(inv.recortado));
  check('y el coste se corrige solo, sin tocar nada más', near(inv.conCogs,3000),
    inv.sinCogs+' € → '+inv.conCogs+' € (300 × 10,00, el lote que de verdad quedaba)');
  check('ahora sí puede declararlo medido', Math.round(inv.conPct)===100 && near(inv.conStale,0),
    Math.round(inv.conPct)+' % · la alarma se apaga porque se ha podido cuadrar, no porque se mire para otro lado');

  console.log('\n=== M11-U · UN REGISTRO CORRECTO NO PUEDE DISPARAR LA ALARMA ===');
  /* Una compra SIEMPRE precede a su venta, así que «lote anterior al informe»
     encendía la alarma también con el registro perfecto. Una señal que está
     siempre encendida se apaga en la cabeza de quien la mira, y entonces el
     caso malo pasa sin que nadie lo mire. */
  const limpio = await page.evaluate(js(`
    DB.settings.costMethod='fifo';
    DB.products[0].lots = [{id:'p1', date:'2026-05-01', qty:500, unit:6, freight:0},
                           {id:'p2', date:'2026-06-15', qty:500, unit:8, freight:0}];
    const mkU = (d,q)=>({amazonorderid:'U'+d, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'TEST-1', asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:'100', itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[mkU('2026-06-01',300), mkU('2026-07-01',500)], count:2, file:'u', loadedAt:'c'};
    DB.imports.inventory = {rows:[{sku:'TEST-1', afnfulfillablequantity:'200'}], count:1, file:'i', loadedAt:'d'};
    const c = ${COST};
    return {cogs:c.cogs, pct:c.measuredPct, stale:c.quality.stale, sobra:(c.bal['test-1']||{}).sobra};
  `));
  check('1.000 compradas = 800 vendidas + 200 en almacén: no sobra nada',
    Math.round(limpio.sobra)===0, 'sobra '+Math.round(limpio.sobra));
  check('el coste es el exacto', near(limpio.cogs,5400),
    limpio.cogs+' € = 500×6 + 300×8');
  check('y NO salta ninguna alarma', Math.round(limpio.pct)===100 && near(limpio.stale,0),
    Math.round(limpio.pct)+' % medido');

  console.log('\n=== M11-V · EL CONTROL DE CANTIDAD VALE TAMBIÉN EN «POR PERIODO» ===');
  /* Era el agujero peor, porque estaba en el método recomendado: «existe un
     lote con fecha anterior» se contaba como «había unidades». 700 unidades
     sin ninguna compra detrás salían certificadas como medidas. */
  const cant = await page.evaluate(js(`
    DB.products[0].lots = [{id:'q1', date:'2026-01-01', qty:100, unit:4, freight:0},
                           {id:'q2', date:'2026-08-01', qty:5000, unit:10, freight:0}];
    const mkV = (d,q)=>({amazonorderid:'V'+d, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'TEST-1', asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:'100', itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[mkV('2026-01-15',400), mkV('2026-07-15',400)], count:2, file:'v', loadedAt:'e'};
    DB.imports.inventory = {rows:[{sku:'TEST-1', afnfulfillablequantity:'4300'}], count:1, file:'i', loadedAt:'f'};
    const out={};
    ['period','avg','fifo'].forEach(m=>{ DB.settings.costMethod=m; const c=${COST};
      out[m]={pct:Math.round(c.measuredPct), lot:Math.round(c.quality.lot), tail:Math.round(c.quality.tail)}; });
    return out;
  `));
  check('por periodo ya no certifica las 800 unidades', cant.period.lot===100 && cant.period.tail===700,
    cant.period.lot+' con compra detrás / '+cant.period.tail+' sin ella · antes decía 800 y 0');
  check('el ponderado dice lo mismo', cant.avg.lot===100 && cant.avg.tail===700, JSON.stringify(cant.avg));
  check('y FIFO también: el recuento es el mismo en los tres métodos',
    cant.fifo.lot===100 && cant.fifo.tail===700,
    'el método cambia el COSTE, no la cantidad de mercancía que compraste');

  console.log('\n=== M11-W · UN PEDIDO SIN FECHA DE RECEPCIÓN NO CREA LOTE ===');
  const sinFecha = await page.evaluate(js(`
    DB.products[0].lots = [];
    DB.pos = [{id:'ow', ref:'PO-BARCO', status:'ordered', alloc:'units', freight:0,
               ordered:'2026-07-03', eta:'', items:[{sku:'TEST-1', qty:600, unitCost:9}]}];
    applyPOCosts(DB.pos[0]);
    const sinRec = DB.products[0].lots.length;
    DB.pos[0].received = '2026-08-10';
    applyPOCosts(DB.pos[0]);
    return {sinRec, conRec:DB.products[0].lots.length, fecha:(DB.products[0].lots[0]||{}).date};
  `));
  check('un pedido todavía en un barco no crea ningún lote', sinFecha.sinRec===0,
    'antes lo fechaba el día en que se cursó el pedido y subía un 61 % el coste de ventas ya servidas');
  check('en cuanto pones la fecha de recepción, sí', sinFecha.conRec===1 && sinFecha.fecha==='2026-08-10',
    sinFecha.fecha);

  console.log('\n=== M11-X · UN INFORME DE INVENTARIO PARCIAL NO VALE PARA TODO ===');
  /* El hueco que señaló la revisión: con una sola fila de cualquier SKU el hub
     daba por conocido el stock de TODO el catálogo, y a los que no salían les
     asignaba cero. Un cero inventado hace que el recorte se coma el almacén:
     unidades que están en la estantería contadas como vendidas. */
  const parcial = await page.evaluate(js(`
    DB.settings.costMethod='fifo';
    DB.products[0].lots = [{id:'x1', date:'2025-06-01', qty:1000, unit:3, freight:0},
                           {id:'x2', date:'2026-06-01', qty:1250, unit:6.5, freight:0}];
    DB.products.push({id:'t3', sku:'OTRO', name:'Otro', cogs:1, freight:0, fba:0,
                      referral:15, price:20, channel:'FBA', lots:[]});
    const mkX = (sk,d,q)=>({amazonorderid:'X'+sk+d, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:sk, asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:'100', itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[mkX('TEST-1','2026-04-15',300), mkX('OTRO','2026-04-15',10)], count:2, file:'x', loadedAt:'g'};
    /* inventario SOLO del otro SKU: del de verdad no se ha visto nada */
    DB.imports.inventory = {rows:[{sku:'OTRO', afnfulfillablequantity:'5'}], count:1, file:'i', loadedAt:'h'};
    const ajeno = ${COST};
    /* ahora el bueno: 1.950 unidades en almacén */
    DB.imports.inventory = {rows:[{sku:'OTRO', afnfulfillablequantity:'5'},
                                  {sku:'TEST-1', afnfulfillablequantity:'1950'}], count:2, file:'i', loadedAt:'j'};
    const bueno = ${COST};
    const b1 = ajeno.bal['test-1']||{}, b2 = bueno.bal['test-1']||{};
    return {ajenoCogs:ajeno.bySku['TEST-1'].cogs, ajenoVisto:b1.stockKnown, ajenoRecorte:b1.recortado,
            buenoCogs:bueno.bySku['TEST-1'].cogs, buenoVisto:b2.stockKnown, buenoRecorte:b2.recortado};
  `));
  check('el stock de OTRO no cuenta como stock de TEST-1', parcial.ajenoVisto===false,
    'antes bastaba una fila de cualquier SKU para darlo todo por conocido');
  check('y sin haberlo visto no se recorta nada', Math.round(parcial.ajenoRecorte||0)===0,
    'con el fallo recortaba 1.950 unidades que están en la estantería');
  check('el coste no se infla un 111 %', near(parcial.ajenoCogs, 900),
    parcial.ajenoCogs+' € (300 × 3,00) · con el fallo daban 1.950 € (300 × 6,50)');
  check('y con el informe completo sí cuadra y no recorta de más',
    parcial.buenoVisto===true && Math.round(parcial.buenoRecorte)===0 && near(parcial.buenoCogs,900),
    parcial.buenoCogs+' € · 2.250 comprados = 300 vendidos + 1.950 en almacén');

  console.log('\n=== M11-Y · FALTA EL STOCK DE APERTURA: EL COSTE, NO SOLO LA ETIQUETA ===');
  /* El caso simétrico del recorte y el hueco de registro más común: empiezas a
     cargar compras cuando ya llevabas tiempo vendiendo. La cola TENÍA unidades,
     pero eran del lote equivocado, así que el recuento decía 98 % medido
     mientras el coste se iba un 33 % arriba. */
  const abre = await page.evaluate(js(`
    DB.settings.costMethod='fifo';
    DB.products[0].cogs = 3; DB.products[0].freight = 0;
    DB.products[0].lots = [{id:'y1', date:'2026-01-01', qty:700, unit:5, freight:0},
                           {id:'y2', date:'2026-05-01', qty:1300, unit:7, freight:0}];
    const mkY = (d,q)=>({amazonorderid:'Y'+d, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'TEST-1', asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:'100', itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[mkY('2026-02-01',1200)], count:1, file:'y', loadedAt:'k'};
    DB.imports.inventory = {rows:[{sku:'TEST-1', afnfulfillablequantity:'1300'}], count:1, file:'i', loadedAt:'l'};
    const c = ${COST};
    const b = c.bal['test-1']||{};
    const tres = {};
    ['period','avg','fifo'].forEach(m=>{ DB.settings.costMethod=m; tres[m]=Math.round(${COST}.cogs); });
    /* y con devoluciones: el stock del informe viene NETO, así que restarlas
       es lo que evita inventarse un lote de apertura del tamaño de la tasa */
    DB.settings.costMethod='fifo';
    DB.imports.returns = {rows:[{orderid:'171-1-1', returndate:'2026-02-10', sku:'TEST-1', quantity:'60'}],
                          count:1, file:'r', loadedAt:'m'};
    DB.imports.inventory = {rows:[{sku:'TEST-1', afnfulfillablequantity:'1360'}], count:1, file:'i', loadedAt:'n'};
    const conDev = ${COST};
    return {cogs:c.cogs, unit:c.cogs/1200, falta:b.falta, apertura:b.apertura,
            open:c.quality.open, lot:c.quality.lot, pct:c.measuredPct, tres,
            faltaDev:(conDev.bal['test-1']||{}).falta, devuelto:(conDev.bal['test-1']||{}).devuelto};
  `));
  check('detecta las 500 unidades de apertura que faltan', Math.round(abre.falta)===500 && Math.round(abre.apertura)===500,
    '2.000 compradas contra 1.200 vendidas + 1.300 en almacén');
  check('y da el coste exacto, no uno un 33 % más alto', near(abre.unit, 4.1667, 0.001),
    abre.unit.toFixed(2)+' €/ud = 500×3 base + 700×5 lote · antes daba 5,57 €');
  check('sin certificar como medido lo que no lo está', Math.round(abre.pct)===58,
    Math.round(abre.pct)+' % · antes decía 98 % con 500 unidades sin explicar');
  check('y los TRES métodos cobran la apertura al coste base, no al del lote',
    abre.tres.period===5000 && abre.tres.avg===5000 && abre.tres.fifo===5000,
    JSON.stringify(abre.tres)+' · la pantalla dice «van al coste base» y ahora el número también');
  check('las devoluciones se restan del cuadre en vez de inventar apertura',
    Math.round(abre.devuelto)===60 && Math.round(abre.faltaDev)===500,
    '60 devueltas · el stock del informe ya viene neto, así que no cuentan dos veces');

  console.log('\n=== M11-Z · TRES LOTES DEL MISMO DÍA SIN UNIDADES ===');
  const cero = await page.evaluate(js(`
    DB.settings.costMethod='period';
    DB.products[0].cogs = 0; DB.products[0].freight = 0;
    const a={id:'z1',date:'2026-03-01',qty:0,unit:3,freight:0},
          b={id:'z2',date:'2026-03-01',qty:0,unit:6,freight:0},
          c={id:'z3',date:'2026-03-01',qty:0,unit:9,freight:0};
    DB.products[0].lots = [a,b,c]; const uno = ${COST}.cogs;
    DB.products[0].lots = [c,b,a]; const dos = ${COST}.cogs;
    return {uno, dos};
  `));
  check('el coste medio del día es el mismo en cualquier orden', cero.uno===cero.dos,
    cero.uno.toFixed(2)+' € = '+cero.dos.toFixed(2)+' € · antes salían 6,75 y 5,25 €/ud');

  console.log('\n=== M11-J · LA PANTALLA RESPONDE ===');
  await page.evaluate(()=>{ localStorage.removeItem('aresstore_hub_v3'); });
  await page.reload(); await page.waitForTimeout(600);
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);
  await page.evaluate(()=>loadDemo());
  await page.waitForTimeout(900);
  await page.click('.nav-item[data-view="catalogo"]');
  await page.waitForTimeout(400);
  check('la tabla de lotes tiene filas', (await page.$$eval('#lotTable tr', e=>e.length))>1);
  check('el selector de método está pintado', (await page.$$eval('#lotMethodBox button', e=>e.length))===3);
  check('el veredicto dice algo', (await page.textContent('#lotVerdict')).length>80);
  const demo = await page.evaluate(()=>{
    const out={};
    periodDays = 0;                                   // todo el histórico del informe
    ['period','fifo','avg'].forEach(m=>{ DB.settings.costMethod=m; out[m]=Math.round(pnl().cogs); });
    DB.settings.costMethod='period'; periodDays = 30;
    return {out, cov:lotCoverage()};
  });
  check('con los datos de ejemplo los tres métodos dan tres números distintos',
    new Set(Object.values(demo.out)).size===3, JSON.stringify(demo.out));
  check('y el ejemplo llega al 100 % de cobertura POR PERIODO', Math.round(demo.cov.pct)===100,
    Math.round(demo.cov.pct)+' % · el ejemplo trae informe de inventario, así que las cantidades cuadran');
  console.log('\n=== M11-AA · EL CUADRE DE LA PANTALLA ES EL DEL MOTOR ===');
  /* La columna «Cuadre» se recalculaba en el render con las ventas BRUTAS
     mientras la fila de al lado enseñaba las NETAS y el motor recortaba la cola
     con las netas. Resultado: tres números para la misma cuenta, separados
     exactamente por las devoluciones.

     Caso A · con los datos de ejemplo (ARS-BAN-02):
       comprado 2700 · vendido bruto 708 · devoluciones 12 · neto 696 · stock 180
       sobra correcto = 2700 − 696 − 180 = 1824      ← lo que dice el texto
       lo que pintaba = 2700 − 708 − 180 = 1812      ← 12 de menos

     Caso B · el que lo deja desnudo, un SKU que cuadra EXACTO con devoluciones:
       comprado 100 · vendido bruto 30 · devoluciones 5 · neto 25 · stock 75
       100 = 25 + 75, así que sobra = 0 y falta = 0 → el cuadre es CERO
       lo que pintaba = 100 − 30 − 75 = −5, es decir «−5» pegado a la frase
       «cuadra exactamente». El número y su explicación se contradecían. */
  const cuadreDemo = await page.evaluate(()=>{
    const B = costOfSales(salesRows({from:null, country:'ALL'})).bal;
    const filas = [...document.querySelectorAll('#lotBalTable tbody tr')].map(tr=>{
      const c=[...tr.children].map(x=>x.textContent.trim());
      return {sku:c[0].toLowerCase(), cuadre:c[4], texto:c[5]};
    }).filter(f=>B[f.sku]);
    return filas.map(f=>{
      const b=B[f.sku];
      const pint = Number(String(f.cuadre).replace(/[^\d-]/g,'')) * (/^-/.test(f.cuadre)?1:1);
      return {sku:f.sku, pintado:pint, sobra:b.sobra, falta:b.falta,
              devuelto:b.devuelto, esperado:b.sobra-b.falta,
              citado:Number((f.texto.match(/^([\d.]+)/)||[0,'0'])[1].replace(/\./g,''))};
    });
  });
  const malDemo = cuadreDemo.filter(f=>f.pintado!==f.esperado);
  check('cada fila pinta el mismo cuadre que usa el motor para recortar',
    cuadreDemo.length>0 && malDemo.length===0,
    cuadreDemo.length+' SKU · '+(malDemo.length?JSON.stringify(malDemo):'ninguno discrepa'));
  const conDevo = cuadreDemo.filter(f=>f.devuelto>0);
  check('y el número pintado coincide con el que cita su propia explicación',
    conDevo.length>0 && conDevo.every(f=>f.pintado===f.citado),
    conDevo.map(f=>f.sku+': '+f.pintado+' vs «'+f.citado+' se vendieron antes»').join(' · '));

  const cuadreExacto = await page.evaluate(js(`
    DB.products[0].cogs = 2; DB.products[0].freight = 0;
    DB.products[0].lots = [{id:'k1', date:'2026-01-01', qty:100, unit:2, freight:0}];
    const mkK = (d,q)=>({amazonorderid:'K'+d, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'TEST-1', asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:'100', itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[mkK('2026-02-01',30)], count:1, file:'k', loadedAt:'p'};
    DB.imports.returns = {rows:[{orderid:'K-1', returndate:'2026-02-10', sku:'TEST-1', quantity:'5'}],
                          count:1, file:'kr', loadedAt:'q'};
    DB.imports.inventory = {rows:[{sku:'TEST-1', afnfulfillablequantity:'75'}], count:1, file:'ki', loadedAt:'r'};
    renderCatalogo();
    const b = ${COST}.bal['test-1'];
    const tr = [...document.querySelectorAll('#lotBalTable tbody tr')]
                 .filter(t=>/TEST-1/i.test(t.children[0].textContent))[0];
    const c = tr ? [...tr.children].map(x=>x.textContent.trim()) : [];
    return {sobra:b.sobra, falta:b.falta, devuelto:b.devuelto, neto:b.neto,
            pintado:c[4], texto:c[5]};
  `));
  check('un SKU que cuadra exacto no arrastra sus devoluciones al cuadre',
    Math.round(cuadreExacto.sobra)===0 && Math.round(cuadreExacto.falta)===0,
    '100 comprados = 25 netos vendidos + 75 en almacén · 5 devueltas ya restadas');
  check('y la pantalla escribe 0, no −5',
    /^0$/.test(String(cuadreExacto.pintado||'').replace(/[+\s]/g,'')),
    '«'+cuadreExacto.pintado+'» · con el fallo ponía «-5» al lado de «cuadra exactamente»');
  check('el texto sigue diciendo que cuadra', /cuadra exactamente/.test(cuadreExacto.texto||''),
    cuadreExacto.texto);

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');

  console.log('\n=== M11-S · HORARIO DE ESPAÑA: LA FECHA NO PUEDE IRSE UN DÍA ATRÁS ===');
  /* El runner corre en UTC, así que este fallo era invisible: parseDate() y
     new Date() construyen fechas LOCALES y iso() las serializaba en UTC. En
     España toda fecha volvía como el día anterior, y en el día en que cambiaba
     un lote el margen salía con el precio equivocado. Se comprueba en la zona
     horaria de verdad del usuario. */
  const ctx = await browser.newContext({timezoneId:'Europe/Madrid', locale:'es-ES'});
  const pm = await ctx.newPage();
  const tzErr = [];
  pm.on('pageerror', e => tzErr.push('PAGEERROR: '+e.message));
  await pm.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await pm.waitForTimeout(600);
  const tz = await pm.evaluate(`(()=>{
    const d = parseDate('2026-03-15');
    const hoy = iso(today());
    const tarde = new Date(2026, 2, 15, 23, 0, 0);
    return {ida: iso(d), zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
            tarde: iso(tarde), hoy};
  })()`);
  check('la prueba corre de verdad en horario español', tz.zona==='Europe/Madrid', tz.zona);
  check('una fecha del 15 sigue siendo el 15', tz.ida==='2026-03-15', tz.ida);
  check('y una fecha construida a las 23:00 locales no se va al día anterior',
    tz.tarde==='2026-03-15', tz.tarde+' · con toISOString() salía 2026-03-14');
  const tzCost = await pm.evaluate(`(()=>{
    ${FIXTURE.replace(/\$/g,'$')}
    DB.products[0].lots = [{id:'l1', date:'2026-03-01', qty:100, unit:5, freight:0},
                           {id:'l2', date:'2026-03-15', qty:100, unit:9, freight:0}];
    const mk7 = q=>({amazonorderid:'t1', purchasedate:'2026-03-15T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:'TEST-1', asin:'B0X',
      itemstatus:'Shipped', quantity:String(q), itemprice:'300', itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {rows:[mk7(10)], count:1, file:'tz'};
    DB.settings.costMethod='period';
    return costOfSales(salesRows({from:null, country:'ALL'})).cogs;
  })()`);
  check('la venta del día del cambio de lote se costea con el lote de ese día',
    near(tzCost, 90), tzCost+' € (10 × 9,00) · con el fallo daba 50 €');
  check('sin errores de JS en horario español', tzErr.length===0, tzErr.join(' | ') || 'limpio');
  await ctx.close();

  console.log('\n' + (fails ? '✗ ' + fails + ' comprobaciones fallidas' : '✓ todo correcto'));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
