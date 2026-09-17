/* =========================================================================
   Fechas, inventario y reposición · carril 6

   Lo que se persigue aquí no es que el hub dé error: es que dé un número
   creíble y falso. Todos los casos son sintéticos y la aritmética está escrita
   a mano en el comentario de cada uno, para que se pueda comprobar sin correr
   nada. Ninguno depende de una fecha absoluta: todo va relativo a hoy, porque
   las fixtures de este repositorio se regeneran con `ago(k)` y una prueba con
   una fecha clavada se pudre sola (pasó el 17 de septiembre con una suite que
   estaba verde el 24 de agosto).

   Para verla ROJA sin los arreglos:
     HUB_INDEX=<index.html compilado desde base/2026-09> node tests/fechas.test.js
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

const INDEX = process.env.HUB_INDEX || path.resolve(__dirname, '..', 'index.html');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> typeof a==='number' && isFinite(a) && Math.abs(a-b) < (t==null?0.01:t);
/* Un resultado que llega como {falta:'...'} es una función que no existe en el
   árbol que se está probando. Se convierte en un mensaje, no en un stack. */
const falta = r => (r && r.falta) ? ('falta ' + r.falta) : null;

/* Laboratorio común. Dos referencias, proveedor con 30 días de plazo.
   `dia(k)` es hace k días; `dia(-k)`, dentro de k días. */
const LAB = `
  DB = blankDB();
  DB.suppliers = [{id:'s1', name:'Prov', lead:30}];
  DB.products = [
    {id:'a', sku:'RAPIDO', name:'Rápido', cogs:4, freight:1, fba:3, referral:15, price:20, channel:'FBA', supplierId:'s1', lots:[]},
    {id:'b', sku:'LENTO',  name:'Lento',  cogs:4, freight:1, fba:3, referral:15, price:20, channel:'FBA', supplierId:'s1', lots:[]}];
  const hoy = new Date();
  const dia = k => { const d=new Date(hoy); d.setDate(d.getDate()-k);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const venta = (d,sku,q,pais,canal,hora)=>({amazonorderid:'o'+d+sku+pais+(hora||''),
    purchasedate:d+'T'+(hora||'10:00')+':00+00:00',
    fulfillmentchannel:'Amazon', saleschannel:canal||'Amazon.es', sku:sku, asin:'B0X',
    itemstatus:'Shipped', quantity:String(q), itemprice:String(20*q), itemtax:'0', shipcountry:pais||'ES'});
  periodDays = 30;
  countryFilter = 'ALL';
`;
const js = body => '(()=>{' + LAB + body + '})()';

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000},
                                        timezoneId:'Europe/Madrid', locale:'es-ES'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { const t=m.text();
    if(m.type()==='error' && t.indexOf('ERR_')<0 && t.indexOf('Failed to load resource')<0) errors.push('CONSOLE: '+t); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + INDEX);
  await page.waitForTimeout(700);

  const zona = await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone);
  check('la prueba corre en el huso del usuario, que es donde vive B3', zona==='Europe/Madrid', zona);

  /* ═══════════════════════════════════════════════════════════════════════
     B1 · EL EXTREMO DERECHO DEL PERIODO ES LA ÚLTIMA FECHA QUE CUBRE EL INFORME
     ═══════════════════════════════════════════════════════════════════════
     Informe descargado hace dos semanas y mirado hoy: cubre del día −29 al
     día −14, dieciséis días, con 10 ud/día. Total 160 unidades.

       correcto = 160 ud / 16 días cubiertos            = 10,00 ud/día
       fallo    = 160 ud / 30 días (del −29 hasta HOY)  =  5,33 ud/día

     Con 5,33 ud/día y 300 unidades en almacén la pantalla dice 56 días de
     cobertura donde son 30: la referencia sale de la lista de rotura y el
     punto de pedido se queda a la mitad. */
  console.log('\n=== FECHA-A · UN INFORME QUE NO LLEGA HASTA HOY NO CUBRE HASTA HOY ===');
  const b1 = await page.evaluate(js(`
    const ventas=[];
    for(let k=14;k<=29;k++) ventas.push(venta(dia(k),'RAPIDO',10));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    DB.imports.inventory = {count:1, file:'i', rows:[{sku:'RAPIDO', afnfulfillablequantity:'300'}]};
    const sp = salesSpan({country:'ALL'});
    const r = invStats().filter(x=>x.sku==='RAPIDO')[0] || {};
    return {dias:sp.days, cubre: sp.cubreHasta ? iso(sp.cubreHasta) : null,
            sinCubrir: sp.diasSinCubrir, esperadoCubre: dia(14),
            vel:r.velocity, cover:r.cover, unidades:160};
  `));
  check('el informe cubre hasta su última fecha, no hasta hoy',
    b1.cubre===b1.esperadoCubre && b1.sinCubrir===14,
    'cubre hasta '+b1.cubre+' (esperado '+b1.esperadoCubre+') · '+b1.sinCubrir+' días sin cubrir');
  check('los días observados son los 16 que cubre el informe, no 30',
    b1.dias===16, b1.dias+' días · con el fallo eran 30, contando como venta cero quince días que el informe no mide');
  check('y la velocidad son 10 ud/día, no 5,33',
    near(b1.vel, 10, 0.02),
    (b1.vel||0).toFixed(2)+' ud/día · correcto: 160 ud / 16 días cubiertos = 10,00 · con el fallo: 160 / 30 = '+(160/30).toFixed(2));
  check('con lo que la cobertura son 30 días y no 56',
    Math.round(b1.cover)===30,
    Math.round(b1.cover)+' d · correcto: 300 ud / 10 al día = 30 d · con el fallo: 300 / 5,33 = '+Math.round(300/(160/30))+' d, y la referencia salía de la lista de rotura');
  const b1txt = await page.evaluate(js(`
    const ventas=[];
    for(let k=14;k<=29;k++) ventas.push(venta(dia(k),'RAPIDO',10));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    DB.imports.inventory = {count:1, file:'i', rows:[{sku:'RAPIDO', afnfulfillablequantity:'300'}]};
    go('inventario');
    return document.getElementById('invVerdict').textContent;
  `));
  check('y la pantalla dice hasta dónde llega el informe y cuántos días le faltan',
    /se corta el/i.test(b1txt) && /16 d/i.test(b1txt),
    (b1txt||'').slice(0,150).replace(/\s+/g,' ')+'…');

  /* ═══════════════════════════════════════════════════════════════════════
     B2 · LAS FECHAS QUE NO PUEDEN SER SE DESCARTAN, SE CUENTAN Y SE ENSEÑAN
     ═══════════════════════════════════════════════════════════════════════
     Tres líneas envenenadas sobre un informe de 30 días a 10 ud/día:
       · '2027-13-45'  → mes 13 y día 45. `new Date(2027,12,45)` NO falla:
                         desborda y devuelve el 14 de febrero de 2028.
       · '45000'       → serial de hoja de cálculo. `new Date('45000')`
                         devuelve el 1 de enero del año 45000.
       · dentro de 5 días → una venta que todavía no ha ocurrido.
     Las tres traen 500 unidades cada una. Si entran, la velocidad y la
     cobertura del catálogo entero quedan tocadas y nadie se entera. */
  console.log('\n=== FECHA-B · UNA FECHA IMPOSIBLE NO ENTRA COMO SI TAL COSA ===');
  const b2 = await page.evaluate(js(`
    const suelta = (f,q)=>({amazonorderid:'x'+f, purchasedate:f, fulfillmentchannel:'Amazon',
      saleschannel:'Amazon.es', sku:'RAPIDO', asin:'B0X', itemstatus:'Shipped',
      quantity:String(q), itemprice:String(20*q), itemtax:'0', shipcountry:'ES'});
    const ventas=[];
    for(let k=0;k<30;k++) ventas.push(venta(dia(k),'RAPIDO',10));
    const limpio = ventas.length;
    ventas.push(suelta('2027-13-45', 500));
    ventas.push(suelta('45000', 500));
    ventas.push(suelta(dia(-5)+'T10:00:00+00:00', 500));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    const S = salesRows({from:null, country:'ALL'});
    return {filas:S.length, limpio,
            unidades:S.reduce((a,r)=>a+r.qty,0),
            meta:S.meta, mes13: iso(parseDate('2027-13-45')||new Date(0)),
            serial: parseDate('45000'), dia45: parseDate('2027-13-45'),
            futura: S.some(r=>r.date>startOfDay(today()))};
  `));
  check('el mes 13 con día 45 no se convierte en una fecha de 2028',
    b2.dia45===null, b2.dia45===null ? 'descartada' : 'entró como '+b2.mes13+' · con el fallo era 2028-02-14');
  check('un serial de hoja de cálculo no se convierte en el año 45000',
    b2.serial===null, b2.serial===null ? 'descartado' : 'entró como fecha');
  check('ninguna venta queda fechada en el futuro',
    b2.futura===false, b2.futura ? 'hay ventas con fecha posterior a hoy' : 'ninguna');
  check('las tres líneas envenenadas se quedan fuera y no suman sus 1.500 unidades',
    b2.filas===b2.limpio && b2.unidades===300,
    b2.filas+' filas y '+b2.unidades+' ud · deberían ser '+b2.limpio+' y 300');
  check('y el hub las cuenta en vez de tragárselas en silencio',
    b2.meta && b2.meta.fueraPorFecha===3 && b2.meta.fechas.futuras===1 && b2.meta.fechas.ilegibles===2,
    b2.meta ? JSON.stringify(b2.meta.fechas)+' · total '+b2.meta.fueraPorFecha
            : 'salesRows().meta no trae recuento de fechas descartadas');
  const b2txt = await page.evaluate(js(`
    const suelta = (f,q)=>({amazonorderid:'x'+f, purchasedate:f, fulfillmentchannel:'Amazon',
      saleschannel:'Amazon.es', sku:'RAPIDO', asin:'B0X', itemstatus:'Shipped',
      quantity:String(q), itemprice:String(20*q), itemtax:'0', shipcountry:'ES'});
    const ventas=[]; for(let k=0;k<30;k++) ventas.push(venta(dia(k),'RAPIDO',10));
    ventas.push(suelta('2027-13-45',500)); ventas.push(suelta('45000',500));
    ventas.push(suelta(dia(-5)+'T10:00:00+00:00',500));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    DB.imports.inventory = {count:1, file:'i', rows:[{sku:'RAPIDO', afnfulfillablequantity:'300'}]};
    go('inventario');
    return document.getElementById('invVerdict').textContent;
  `));
  check('la pantalla enseña cuántas líneas se han descartado por la fecha',
    /descartado por la fecha|descartad/i.test(b2txt) && /3 l/i.test(b2txt),
    (b2txt||'').replace(/\s+/g,' ').slice(0,200)+'…');

  /* ═══════════════════════════════════════════════════════════════════════
     B3 · LA HORA Y EL HUSO DECIDEN EL DÍA
     ═══════════════════════════════════════════════════════════════════════
     `2026-xx-xxT23:30:00+00:00` son las 01:30 del día siguiente en Madrid
     (UTC+2 en verano, UTC+1 en invierno: en los dos casos pasa de medianoche).
     La expresión regular se quedaba con los diez primeros caracteres y metía
     el pedido en el día anterior al que el vendedor ve en Seller Central. */
  console.log('\n=== FECHA-C · UN PEDIDO DE LAS 23:30 UTC ES DEL DÍA SIGUIENTE EN MADRID ===');
  const b3 = await page.evaluate(js(`
    const d3 = dia(3), d2 = dia(2);
    return {tarde: iso(parseDate(d3+'T23:30:00+00:00')), esperado:d2, crudo:d3,
            manana: iso(parseDate(d3+'T10:00:00+00:00')),
            sinHuso: iso(parseDate(d3+'T23:30:00'))};
  `));
  check('las 23:30 UTC caen en el día siguiente, que es el que ve el vendedor',
    b3.tarde===b3.esperado,
    b3.tarde+' · esperado '+b3.esperado+' · con el fallo se quedaba en '+b3.crudo);
  check('las 10:00 UTC siguen siendo del mismo día', b3.manana===b3.crudo, b3.manana);
  check('y una fecha con hora pero SIN huso declarado no se toca',
    b3.sinHuso===b3.crudo, b3.sinHuso+' · sin huso no hay nada que convertir');

  /* ═══════════════════════════════════════════════════════════════════════
     B3 · Y EL HISTÓRICO YA ARCHIVADO NO SE REESCRIBE EN SILENCIO
     ═══════════════════════════════════════════════════════════════════════
     El histórico es el único daño irreversible de este hub. Arreglar el huso
     mueve pedidos de un día al siguiente, o sea que REESCRIBE días que ya
     estaban guardados. Sobrescribir el rango que cubre el informe es
     deliberado; hacerlo sin dejar constancia, no.

     Montaje: se archiva un informe con 50 ud el día −3. Después se reimporta
     el mismo pedido movido al día −2 (que es lo que hace el arreglo del huso).
     Los dos días cambian de total y los dos tienen que quedar anotados. */
  console.log('\n=== FECHA-D · UN DÍA YA ARCHIVADO QUE CAMBIA SE DICE ===');
  const b3h = await page.evaluate(js(`
    if(typeof logRevision!=='function') return {falta:'logRevision() / H.rev en 12b-historico.js'};
    const base=[]; for(let k=1;k<=10;k++) base.push(venta(dia(k),'RAPIDO',10));
    base.push(venta(dia(3),'RAPIDO',50,'ES','Amazon.es','10:00'));
    DB.imports.orders = {rows:base, count:base.length, file:'o'};
    DB.history = {}; captureOrders();
    const H = hist();
    const antes3 = (H.d[dia(3)].s['RAPIDO']||[0])[0];
    /* Mismo pedido, ahora a las 23:30 UTC: el arreglo lo lleva al día −2 */
    const movido = base.slice(0,-1);
    movido.push(venta(dia(3),'RAPIDO',50,'ES','Amazon.es','23:30'));
    DB.imports.orders = {rows:movido, count:movido.length, file:'o'};
    const g = captureOrders();
    const H2 = hist();
    return {antes3, despues3:(H2.d[dia(3)].s['RAPIDO']||[0])[0],
            despues2:(H2.d[dia(2)].s['RAPIDO']||[0])[0],
            revisiones:g.revisiones, rev:(H2.rev||[]).slice(0,4),
            d3:dia(3), d2:dia(2)};
  `));
  if(falta(b3h)) check('el histórico registra las reescrituras', false, falta(b3h));
  else {
    check('antes del arreglo el día −3 llevaba 60 unidades (10 + el pedido de las 23:30)',
      b3h.antes3===60, b3h.antes3+' ud');
    check('después el pedido se ha ido al día −2, como en Seller Central',
      b3h.despues3===10 && b3h.despues2===60,
      'día −3: '+b3h.despues3+' ud · día −2: '+b3h.despues2+' ud');
    check('y la reescritura de los dos días queda anotada, no se hace en silencio',
      b3h.revisiones===2 && b3h.rev.length>=2 &&
      b3h.rev.some(x=>x.k===b3h.d3 && x.a===60 && x.b===10) &&
      b3h.rev.some(x=>x.k===b3h.d2 && x.a===10 && x.b===60),
      (b3h.revisiones||0)+' día(s) anotados: '+b3h.rev.map(x=>x.k+' '+x.a+'→'+x.b).join(', ')+
      ' · sin esto, la serie de ayer cambia y no aparece en ninguna pantalla');
    const b3v = await page.evaluate(js(`
      if(typeof logRevision!=='function') return {falta:'logRevision()'};
      DB.history = {};
      logRevision(dia(3), 'ventas', 60, 10, 'prueba');
      go('historico');
      return {txt: document.getElementById('histVerdict').textContent};
    `));
    check('y la pantalla del histórico la enseña',
      !falta(b3v) && /ya estaban archivados/i.test(b3v.txt||''),
      falta(b3v) || (b3v.txt||'').replace(/\s+/g,' ').slice(0,140)+'…');
  }

  /* Y la otra mitad: una foto de stock ya archivada NO se pisa nunca. Amazon
     no guarda el stock de días pasados, así que la que está es la única
     medición que existe de ese día. */
  console.log('\n=== FECHA-E · UNA FOTO DE STOCK YA ARCHIVADA NO SE PISA ===');
  const foto = await page.evaluate(js(`
    if(typeof refecharFotoStock!=='function') return {falta:'refecharFotoStock() en 12b-historico.js'};
    DB.history = {};
    const H = hist();
    H.d[dia(6)] = {k:{'RAPIDO':[999]}};                 // medición original, irrepetible
    H.d[iso(today())] = {k:{'RAPIDO':[111]}};           // la que acaba de dejar captureStock
    H.obs['RAPIDO'] = {n:1, z:0, last:iso(today()), lz:0};
    const d = new Date(); d.setDate(d.getDate()-6);
    const r = refecharFotoStock(startOfDay(d));
    return {res:r, original:(hist().d[dia(6)].k['RAPIDO']||[])[0],
            hoy: hist().d[iso(today())] ? !!hist().d[iso(today())].k : false,
            rev:(hist().rev||[])[0]||null};
  `));
  if(falta(foto)) check('la foto archivada no se reescribe', false, falta(foto));
  else {
    check('la medición original del día −6 sigue siendo 999, no la pisa nadie',
      foto.original===999, foto.original+' · si valiera 111, se habría perdido una medición que Amazon no conserva');
    check('la foto mal fechada de hoy se retira en vez de quedarse duplicada',
      foto.hoy===false, foto.hoy ? 'sigue habiendo foto de hoy' : 'retirada');
    check('y el choque queda anotado con su motivo',
      !!(foto.rev && /no se reescribe/i.test(foto.rev.n||'')),
      foto.rev ? foto.rev.k+' · '+(foto.rev.n||'') : 'sin anotar');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     D5 · «RECONSTRUIR DESDE LO IMPORTADO» NO REFECHA LA FOTO COMO DE HOY
     ═══════════════════════════════════════════════════════════════════════
     El informe de inventario se importó hace 6 días. Reconstruir hoy fechaba
     esa foto como de hoy: los seis días intermedios se quedan sin stock
     arrastrado, oosDays() deja de ver la rotura que sí hubo y velocityStats()
     devuelve la media simple disfrazada de velocidad real. */
  console.log('\n=== FECHA-F · LA FOTO DE STOCK LLEVA LA FECHA EN QUE SE MIDIÓ ===');
  const d5 = await page.evaluate(js(`
    if(typeof stockSnapshotDate!=='function') return {falta:'stockSnapshotDate()'};
    const hace6 = new Date(); hace6.setDate(hace6.getDate()-6);
    const ventas=[]; for(let k=0;k<20;k++) ventas.push(venta(dia(k),'RAPIDO',10));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o', loadedAt:new Date().toISOString()};
    DB.imports.inventory = {count:1, file:'i', loadedAt:hace6.toISOString(),
                            rows:[{sku:'RAPIDO', afnfulfillablequantity:'500'}]};
    DB.history = {};
    rebuildHistory();
    const H = hist();
    return {snap: iso(stockSnapshotDate()), esperado: dia(6),
            enSuDia: (H.d[dia(6)] && H.d[dia(6)].k && H.d[dia(6)].k['RAPIDO']) ? H.d[dia(6)].k['RAPIDO'][0] : null,
            enHoy:   (H.d[iso(today())] && H.d[iso(today())].k) ? true : false};
  `));
  if(falta(d5)) check('la reconstrucción usa stockSnapshotDate()', false, falta(d5));
  else {
    check('stockSnapshotDate() devuelve el día en que se importó el informe',
      d5.snap===d5.esperado, d5.snap+' · esperado '+d5.esperado);
    check('la foto reconstruida queda fechada ese día, con sus 500 unidades',
      d5.enSuDia===500, d5.enSuDia+' ud el '+d5.esperado);
    check('y NO queda una foto fechada hoy que nadie ha medido hoy',
      d5.enHoy===false,
      d5.enHoy ? 'hay foto de hoy · con el fallo, seis días perdían su stock arrastrado' : 'ninguna');
  }
  const d5sin = await page.evaluate(js(`
    if(typeof refecharFotoStock!=='function') return {falta:'refecharFotoStock()'};
    const ventas=[]; for(let k=0;k<20;k++) ventas.push(venta(dia(k),'RAPIDO',10));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    DB.imports.inventory = {count:1, file:'i', rows:[{sku:'RAPIDO', afnfulfillablequantity:'500'}]};
    DB.history = {};
    rebuildHistory();
    const H = hist();
    const dias = Object.keys(H.d).filter(k=>H.d[k].k);
    return {conFoto:dias.length, rev:(H.rev||[])[0]||null};
  `));
  check('sin fecha de importación no se archiva ninguna foto: nada entra sin saber de qué día es',
    !falta(d5sin) && d5sin.conFoto===0 && !!(d5sin.rev && /no consta la fecha/i.test(d5sin.rev.n||'')),
    falta(d5sin) || (d5sin.conFoto+' fotos · '+((d5sin.rev&&d5sin.rev.n)||'sin anotar')));

  /* ═══════════════════════════════════════════════════════════════════════
     D1 · UN SKU RECIÉN LANZADO NO SE DILUYE EN TODO EL RANGO DEL INFORME
     ═══════════════════════════════════════════════════════════════════════
     RAPIDO vende 10 ud/día los 30 días. NUEVO se lanzó hace 5 días y vende
     20 ud/día: 100 unidades en 5 días.
       correcto = 100 ud / 5 días desde su primera venta = 20,00 ud/día
       fallo    = 100 ud / 30 días del informe           =  3,33 ud/día
     Con 3,33 ud/día, 200 unidades en almacén dan 60 días de cobertura donde
     son 10: el lanzamiento se queda sin stock en la segunda semana. */
  console.log('\n=== FECHA-G · LA VENTANA DE UN SKU NUEVO EMPIEZA EN SU PRIMERA VENTA ===');
  const d1 = await page.evaluate(js(`
    DB.products.push({id:'c', sku:'NUEVO', name:'Nuevo', cogs:4, freight:1, fba:3,
                      referral:15, price:20, channel:'FBA', supplierId:'s1', lots:[]});
    const ventas=[];
    for(let k=0;k<30;k++) ventas.push(venta(dia(k),'RAPIDO',10));
    for(let k=0;k<5;k++)  ventas.push(venta(dia(k),'NUEVO',20));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    DB.imports.inventory = {count:2, file:'i', rows:[
      {sku:'RAPIDO', afnfulfillablequantity:'300'},
      {sku:'NUEVO',  afnfulfillablequantity:'200'}]};
    DB.history = {};
    const I = invStats(), g = k => I.filter(x=>x.sku===k)[0] || {};
    return {nuevo:g('NUEVO'), rapido:g('RAPIDO')};
  `));
  check('el SKU nuevo vende 20 al día, no 3,33',
    near(d1.nuevo.velocity, 20, 0.05),
    (d1.nuevo.velocity||0).toFixed(2)+' ud/día · correcto: 100 ud / 5 días desde su primera venta = 20,00 · con el fallo: 100 / 30 = '+(100/30).toFixed(2));
  check('su ventana son 5 días, no los 30 del informe',
    d1.nuevo.diasObservados===5,
    (d1.nuevo.diasObservados===undefined ? 'invStats() no dice sobre cuántos días ha medido' : d1.nuevo.diasObservados+' días observados')+' · esperados 5');
  check('y la cobertura son 10 días, no 60',
    Math.round(d1.nuevo.cover)===10,
    Math.round(d1.nuevo.cover)+' d · correcto: 200 ud / 20 al día = 10 d · con el fallo: 200 / 3,33 = '+Math.round(200/(100/30))+' d, y el lanzamiento se queda sin stock en la segunda semana');
  check('el que lleva vendiendo todo el rango no se toca',
    near(d1.rapido.velocity, 10, 0.02) && d1.rapido.diasObservados===30,
    (d1.rapido.velocity||0).toFixed(2)+' ud/día sobre '+
    (d1.rapido.diasObservados===undefined?'? (invStats() no lo dice)':d1.rapido.diasObservados+' días')+' · esperados 30');
  check('y la velocidad del nuevo se marca como estimada, no como medición',
    d1.nuevo.velocidadEstimada===true,
    'velocidadEstimada='+JSON.stringify(d1.nuevo.velocidadEstimada)+' · cinco días proyectados a un plazo de reposición entero no son una medición');

  /* La revisión adversarial de D1: el SKU que NO es nuevo, solo callado.
     LENTO lleva un año vendiendo pero en esta ventana solo vendió anteayer.
     Estrechar su ventana a dos días le daría 2,5 ud/día y un punto de pedido
     de 162 unidades. El histórico es quien sabe que ese SKU ya vendía antes. */
  console.log('\n=== FECHA-H · UN SKU CALLADO NO ES UN SKU NUEVO ===');
  const d1adv = await page.evaluate(js(`
    const ventas=[];
    for(let k=0;k<30;k++) ventas.push(venta(dia(k),'RAPIDO',10));
    ventas.push(venta(dia(2),'LENTO',5));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    DB.imports.inventory = {count:2, file:'i', rows:[
      {sku:'RAPIDO', afnfulfillablequantity:'300'},
      {sku:'LENTO',  afnfulfillablequantity:'100'}]};
    DB.history = {};
    const sinHist = invStats().filter(x=>x.sku==='LENTO')[0] || {};
    /* Ahora el histórico sabe que LENTO ya vendía hace 60 días */
    const H = hist();
    H.d[dia(60)] = {s:{'LENTO':[3, 60, 0]}, cs:{}};
    const conHist = invStats().filter(x=>x.sku==='LENTO')[0] || {};
    return {sinHist, conHist, esperadoCon: 5/30};
  `));
  check('sin histórico, la ventana corta se aplica pero la fila sale marcada como estimada',
    d1adv.sinHist.velocidadEstimada===true,
    'velocidadEstimada='+JSON.stringify(d1adv.sinHist.velocidadEstimada)+' · diasObservados='+d1adv.sinHist.diasObservados+
    ' · velocidad '+(d1adv.sinHist.velocity||0).toFixed(2));
  check('con histórico que prueba que ya vendía antes, se usa la ventana completa',
    near(d1adv.conHist.velocity, 5/30, 0.005) && d1adv.conHist.diasObservados===30,
    (d1adv.conHist.velocity||0).toFixed(3)+' ud/día sobre '+
    (d1adv.conHist.diasObservados===undefined?'? (invStats() no lo dice)':d1adv.conHist.diasObservados+' días')+
    ' · estrechar la ventana le daría '+(5/3).toFixed(2)+' ud/día y un punto de pedido de 109 unidades');

  /* ═══════════════════════════════════════════════════════════════════════
     D3 · SIN FOTO DE INVENTARIO NO HAY STOCK CERO: HAY STOCK DESCONOCIDO
     ═══════════════════════════════════════════════════════════════════════
     El informe de inventario solo trae RAPIDO. LENTO vende 1 ud/día y no
     aparece en ningún informe de stock.
       con el fallo: stock 0 → cobertura 0 días → «tarifa bajo inv.» →
                     pedir = punto de pedido = ceil(1 × (30+35)) = 65 unidades
       correcto    : no se sabe → no se pide nada y se dice que falta medirlo */
  console.log('\n=== FECHA-I · LO QUE NO SE HA MEDIDO NO VALE CERO ===');
  const d3 = await page.evaluate(js(`
    const ventas=[];
    for(let k=0;k<30;k++){ ventas.push(venta(dia(k),'RAPIDO',10)); ventas.push(venta(dia(k),'LENTO',1)); }
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    DB.imports.inventory = {count:1, file:'i', rows:[{sku:'RAPIDO', afnfulfillablequantity:'300'}]};
    DB.history = {};
    const I = invStats(), g = k => I.filter(x=>x.sku===k)[0] || {};
    go('inventario');
    return {lento:g('LENTO'), rapido:g('RAPIDO'),
            txt: document.getElementById('invVerdict').textContent,
            tabla: document.getElementById('invTable').textContent};
  `));
  check('el SKU sin foto de inventario no tiene stock 0: lo tiene desconocido',
    d3.lento.stockDesconocido===true && d3.lento.qty===null,
    'qty='+JSON.stringify(d3.lento.qty)+' · stockDesconocido='+d3.lento.stockDesconocido);
  check('y por tanto no dispara ninguna orden de pedir',
    d3.lento.need===null,
    'pedir='+JSON.stringify(d3.lento.need)+' · con el fallo mandaba pedir 65 unidades de algo que no ha mirado');
  check('ni cuenta como rotura ni como tarifa por bajo inventario',
    d3.lento.risk==='nd', 'riesgo='+d3.lento.risk+' · esperado «nd» (no medido) · con el fallo era «low», o sea rotura sobre un stock que nadie ha mirado');
  check('el que sí está medido no cambia', d3.rapido.qty===300 && d3.rapido.need===350,
    d3.rapido.qty+' ud · pedir '+d3.rapido.need);
  check('y la pantalla lo dice en vez de enseñar un cero',
    /sin foto de inventario/i.test(d3.txt) && /sin medir/i.test(d3.tabla),
    (d3.txt||'').replace(/\s+/g,' ').slice(0,130)+'…');

  /* ═══════════════════════════════════════════════════════════════════════
     D4 · EL CENTINELA DE COBERTURA INFINITA NO ES SOBRESTOCK
     ═══════════════════════════════════════════════════════════════════════
     MUERTO tiene 500 unidades y no ha vendido ni una. `cover` vale 999, que
     es un centinela de «no se puede calcular», y 999 > 154 lo metía en la
     categoría de sobrestock, con su KPI y su consejo de liquidar con
     descuento. Liquidar por un KPI equivocado cuesta margen de verdad. */
  console.log('\n=== FECHA-J · SIN VENTAS NO HAY COBERTURA QUE MEDIR ===');
  const d4 = await page.evaluate(js(`
    DB.products.push({id:'c', sku:'MUERTO', name:'Muerto', cogs:4, freight:1, fba:3,
                      referral:15, price:20, channel:'FBA', supplierId:'s1', lots:[]});
    const ventas=[]; for(let k=0;k<30;k++) ventas.push(venta(dia(k),'RAPIDO',10));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    DB.imports.inventory = {count:2, file:'i', rows:[
      {sku:'RAPIDO', afnfulfillablequantity:'300'},
      {sku:'MUERTO', afnfulfillablequantity:'500'}]};
    DB.history = {};
    const I = invStats(), m = I.filter(x=>x.sku==='MUERTO')[0] || {};
    go('inventario');
    const kpis = [...document.querySelectorAll('#invKpis .kpi')]
      .map(x=>x.querySelector('.k-name').textContent+'='+x.querySelector('.k-val').textContent);
    return {m, kpis, sobre: I.filter(r=>r.risk==='over'&&r.qty>0).length};
  `));
  check('la referencia parada sigue marcada con cobertura infinita', d4.m.cover>900, d4.m.cover);
  check('pero no se llama sobrestock', d4.m.risk==='sinventa',
    'riesgo='+d4.m.risk+' · esperado «sinventa» · con el fallo era «over», porque el centinela 999 pasaba el filtro de cover>154');
  check('y el KPI de sobrestock no la cuenta', d4.sobre===0,
    d4.sobre+' en sobrestock · '+(d4.kpis.filter(k=>/Sobrestock/.test(k))[0]||''));

  /* ═══════════════════════════════════════════════════════════════════════
     E5 · «TODO» NO EXTRAPOLA CUATRO DÍAS A NOVENTA SIN DECIRLO
     ═══════════════════════════════════════════════════════════════════════
     Cuatro días de informe y el botón «Todo» pulsado. El aviso de pocos datos
     de Rentabilidad compara días cubiertos contra días pedidos, y con «Todo»
     los dos son cuatro por construcción: el aviso se apaga solo. Pero el punto
     de pedido sigue proyectando 45 + 35 = 80 días hacia delante desde cuatro
     días observados, que es multiplicar por veinte el ruido de una racha. */
  console.log('\n=== FECHA-K · POCOS DÍAS SON POCOS DÍAS, PULSES EL BOTÓN QUE PULSES ===');
  const e5 = await page.evaluate(js(`
    const ventas=[]; for(let k=0;k<4;k++) ventas.push(venta(dia(k),'RAPIDO',10));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    DB.imports.inventory = {count:1, file:'i', rows:[{sku:'RAPIDO', afnfulfillablequantity:'300'}]};
    DB.history = {};
    periodDays = 0;                                   // el botón «Todo»
    const I = invStats(), r = I.filter(x=>x.sku==='RAPIDO')[0] || {};
    go('inventario');
    const txt = document.getElementById('invVerdict').textContent;
    periodDays = 30;
    return {vel:r.velocity, dias:r.diasObservados, estimada:r.velocidadEstimada,
            rp:r.reorderPoint, txt};
  `));
  check('con «Todo» y cuatro días, la velocidad se mide sobre esos cuatro días',
    e5.dias===4 && near(e5.vel,10,0.02),
    (e5.dias===undefined ? 'invStats() no dice sobre cuántos días ha medido' : e5.dias+' días')+' · '+(e5.vel||0).toFixed(2)+' ud/día');
  check('la velocidad sale marcada como estimada',
    e5.estimada===true, 'estimada='+e5.estimada+' · 4 días proyectados a un punto de pedido de '+e5.rp+' unidades');
  check('y el aviso de pocos datos sigue encendido con «Todo» pulsado',
    /muy pocos días/i.test(e5.txt||''),
    (e5.txt||'').replace(/\s+/g,' ').slice(0,170)+'… · el aviso de Rentabilidad se apaga solo porque compara 4 contra 4');

  /* ═══════════════════════════════════════════════════════════════════════
     M2 · LOS SEIS PARÁMETROS Y LA ARITMÉTICA DE LA REPOSICIÓN
     ═══════════════════════════════════════════════════════════════════════
     RAPIDO, 10 ud/día. Parámetros: fabricación 40, tránsito 25, recepción 5,
     colchón 10, objetivo 30–120 días, frecuencia 30.

       plazo          = 40 + 25 + 5              =   70 días
       puntoPedido    = 10 × (70 + 10)           =  800 unidades
       nivelObjetivo  = 10 × (70 + 10 + 30)      = 1.100 unidades
       techo          = 10 × 120                 = 1.200 unidades
       objetivo       = mín(1.100, 1.200)        = 1.100 unidades
       disponible     = 300 + 0                  =  300 ≤ 800 → dispara
       pedir          = 1.100 − 300              =  800 unidades
       margen         = (300 − 800) / 10         =  −50 días (ya vas tarde)

     Y con el techo bajado a 90 días: techo = 900 → objetivo = 900 → pedir 600.
     El techo existe para que una frecuencia larga con un plazo largo no mande
     comprar un año de stock y se coma en almacenaje lo que ahorra en fletes. */
  console.log('\n=== FECHA-L · LOS SEIS PARÁMETROS DE REPOSICIÓN, A MANO ===');
  const m2 = await page.evaluate(js(`
    if(typeof repoPlan!=='function') return {falta:'repoPlan() en src/26-reposicion.js'};
    const ventas=[]; for(let k=0;k<30;k++) ventas.push(venta(dia(k),'RAPIDO',10));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    DB.imports.inventory = {count:1, file:'i', rows:[{sku:'RAPIDO', afnfulfillablequantity:'300'}]};
    DB.history = {};
    DB.reposicion = {};
    repoSave('RAPIDO', {fabricacion:40, transito:25, recepcion:5, colchon:10,
                        objetivoMin:30, objetivoMax:120, frecuencia:30});
    const a = repoPlan().filter(r=>r.sku==='RAPIDO')[0] || {};
    repoSave('RAPIDO', {fabricacion:40, transito:25, recepcion:5, colchon:10,
                        objetivoMin:30, objetivoMax:90, frecuencia:30});
    const b = repoPlan().filter(r=>r.sku==='RAPIDO')[0] || {};
    const guardado = JSON.parse(JSON.stringify(DB.reposicion['RAPIDO']||{}));
    const enBaseNueva = blankDB().reposicion;
    return {a, b, guardado, enBaseNueva};
  `));
  if(falta(m2)) check('el plan de reposición existe', false, falta(m2));
  else {
    check('el plazo total son los tres tramos sumados', m2.a.plazo===70, m2.a.plazo+' d = 40 + 25 + 5');
    check('el punto de pedido son 800 unidades', Math.round(m2.a.puntoPedido)===800,
      Math.round(m2.a.puntoPedido)+' = 10 ud/día × (70 + 10)');
    check('el nivel objetivo son 1.100 unidades', Math.round(m2.a.nivelObjetivo)===1100,
      Math.round(m2.a.nivelObjetivo)+' = 10 × (70 + 10 + 30)');
    check('con 300 disponibles, hay que pedir 800', m2.a.pedir===800,
      m2.a.pedir+' = 1.100 − 300');
    check('y el margen son −50 días: ya vas tarde', near(m2.a.margenDias,-50,0.01),
      (m2.a.margenDias||0).toFixed(1)+' d');
    check('bajar el objetivo máximo a 90 días recorta el pedido a 600',
      m2.b.pedir===600, m2.b.pedir+' = 900 de techo − 300 · el techo es lo que evita comprar un año de stock');
    check('los seis parámetros se guardan con registrarClaveDB y viajan en la copia',
      m2.guardado.fabricacion===40 && m2.enBaseNueva && typeof m2.enBaseNueva==='object',
      JSON.stringify(m2.guardado)+' · blankDB() trae la clave: '+(m2.enBaseNueva?'sí':'no'));
  }

  /* La velocidad de la reposición es la que EXCLUYE los días sin stock.
     30 días archivados; 10 de ellos con stock cero y sin ventas. 200 unidades
     vendidas en los 20 días que hubo stock:
       media simple    = 200 / 30 = 6,67 ud/día
       velocidad real  = 200 / 20 = 10,00 ud/día
     Reponer con 6,67 deja la compra un tercio corta justo en lo que más se
     vende, que es lo que ya se agotó una vez. */
  console.log('\n=== FECHA-M · LA REPOSICIÓN USA LA VELOCIDAD SIN LOS DÍAS SIN STOCK ===');
  const m2v = await page.evaluate(js(`
    if(typeof repoPlan!=='function') return {falta:'repoPlan()'};
    DB.history = {};
    const H = hist();
    /* Días −1 a −30. Los −11 a −20 con stock cero y sin ventas: rotura. */
    for(let k=1;k<=30;k++){
      const roto = k>=11 && k<=20;
      H.d[dia(k)] = {s: roto?{}:{'RAPIDO':[10, 200, 0]}, cs:{}, k:{'RAPIDO': roto?[0]:[500]}};
    }
    DB.imports.orders = {rows:[], count:0, file:'o'};
    DB.imports.inventory = {count:1, file:'i', rows:[{sku:'RAPIDO', afnfulfillablequantity:'500'}]};
    const V = velocityStats(30).filter(r=>r.sku==='RAPIDO')[0] || {};
    const p = repoPlan().filter(r=>r.sku==='RAPIDO')[0] || {};
    return {V, base:p.base, vel:p.velocidad, dias:p.diasBase};
  `));
  if(falta(m2v)) check('la reposición usa velocityStats', false, falta(m2v));
  else {
    check('velocityStats ya separaba media simple de velocidad real',
      near(m2v.V.simple, 200/30, 0.02) && near(m2v.V.real, 10, 0.02),
      'simple '+(m2v.V.simple||0).toFixed(2)+' · real '+(m2v.V.real||0).toFixed(2)+' · '+m2v.V.oos+' días sin stock');
    check('y la reposición usa la real, no la simple',
      m2v.base==='real' && near(m2v.vel, 10, 0.02),
      'base «'+m2v.base+'» · '+(m2v.vel||0).toFixed(2)+' ud/día sobre '+m2v.dias+' días con stock');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LA TARIFA POR BAJO INVENTARIO, CON LA REGLA DE AMAZON
     ═══════════════════════════════════════════════════════════════════════
     Tarifario FBA Europa vigente desde el 1-jul-2026, págs. 10-11 y P6:
     se cobra solo cuando TANTO los días históricos de suministro de 90 días
     COMO los de 30 días bajan de 28. Días de suministro = media diaria de
     unidades disponibles ÷ media diaria de unidades enviadas.

     Caso construido: 90 días archivados, 10 ud/día vendidas siempre.
       · stock 1.000 los días −90 a −31, stock 100 los días −30 a −1
         d30 = 100 / 10 = 10 días      (por debajo de 28)
         d90 = (60×1.000 + 29×100) / (89×10) ≈ 70,7 días   (por encima)
         → NO se cobra, porque hacen falta las dos
       · stock 100 todos los días → d30 = d90 = 10 → SÍ se cobra
     El criterio instantáneo que usaba Inventario marcaba el primer caso igual
     que el segundo. */
  console.log('\n=== FECHA-N · LA REGLA DE LA TARIFA ES LA DE AMAZON, NO UNA APROXIMACIÓN ===');
  const tar = await page.evaluate(js(`
    if(typeof riesgoTarifaBajoInv!=='function') return {falta:'riesgoTarifaBajoInv() en src/26-reposicion.js'};
    const monta = (stockPorDia)=>{
      DB.history = {};
      const H = hist();
      for(let k=1;k<=89;k++) H.d[dia(k)] = {s:{'RAPIDO':[10, 200, 0]}, cs:{}, k:{'RAPIDO':[stockPorDia(k)]}};
    };
    monta(k => k>30 ? 1000 : 100);
    const mixto = riesgoTarifaBajoInv().porSku['RAPIDO'];
    monta(()=>100);
    const bajo = riesgoTarifaBajoInv().porSku['RAPIDO'];
    DB.history = {};
    const H = hist();
    for(let k=1;k<=89;k++) H.d[dia(k)] = {s:{'RAPIDO':[10,200,0]}, cs:{}};   // sin ninguna foto
    const ciego = riesgoTarifaBajoInv().porSku['RAPIDO'] || {aplica:undefined};
    return {mixto, bajo, ciego, cfg:TARIFA_BAJO_INV};
  `));
  if(falta(tar)) check('la regla de la tarifa está implementada', false, falta(tar));
  else {
    check('el umbral y las dos ventanas son los del tarifario',
      tar.cfg.umbralDias===28 && tar.cfg.ventanas[0]===30 && tar.cfg.ventanas[1]===90,
      tar.cfg.umbralDias+' días · ventanas '+tar.cfg.ventanas.join(' y '));
    check('se aplica en DE, FR, IT y ES, y no en NL, PL, SE, BE ni IE',
      tar.cfg.paises.join(',')==='DE,FR,IT,ES' && tar.cfg.excluidos.join(',')==='NL,PL,SE,BE,IE',
      tar.cfg.paises.join(' ')+' · excluidos '+tar.cfg.excluidos.join(' '));
    check('con 30 días bajos y 90 días altos NO se cobra: hacen falta las dos',
      tar.mixto && tar.mixto.aplica===false && tar.mixto.d30<28 && tar.mixto.d90>=28,
      'd30='+(tar.mixto?tar.mixto.d30.toFixed(1):'?')+' · d90='+(tar.mixto?tar.mixto.d90.toFixed(1):'?')+
      ' · el criterio instantáneo lo marcaba igual que el caso de abajo');
    check('con las dos por debajo de 28 sí se cobra',
      tar.bajo && tar.bajo.aplica===true,
      'd30='+(tar.bajo?tar.bajo.d30.toFixed(1):'?')+' · d90='+(tar.bajo?tar.bajo.d90.toFixed(1):'?'));
    check('y sin ninguna foto de inventario no se dice «no se cobra»: se dice que no se puede calcular',
      tar.ciego.aplica===null,
      'aplica='+JSON.stringify(tar.ciego.aplica)+' · un false aquí sería presentar una ausencia de medición como una medición');
    check('la fuente y la fecha de consulta están declaradas',
      /amazon/i.test(tar.cfg.url||'') && /^\d{4}-\d{2}-\d{2}$/.test(tar.cfg.consultado||''),
      (tar.cfg.fuente||'')+' · consultado el '+tar.cfg.consultado);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LA PANTALLA · vacía, con datos parciales y con datos completos
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== FECHA-O · LAS PANTALLAS AGUANTAN VACÍAS, A MEDIAS Y LLENAS ===');
  const vistas = await page.evaluate(js(`
    const out = {};
    const pinta = (etiqueta)=>{
      go('inventario'); go('reposicion');
      out[etiqueta] = {
        inv: (document.getElementById('invTable')||{}).textContent||'',
        repo: (document.getElementById('repoTable')||{textContent:'SIN VISTA'}).textContent,
        kpis: [...document.querySelectorAll('#repoKpis .kpi')].length,
        pais: (document.getElementById('repoPaisTable')||{textContent:'SIN TABLA'}).textContent,
        nota: (document.getElementById('repoTarifaNota')||{textContent:''}).textContent
      };
    };
    pinta('vacia');
    const ventas=[]; for(let k=0;k<30;k++) ventas.push(venta(dia(k),'RAPIDO',10,'DE','Amazon.de'));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    pinta('parcial');                                     // ventas sin inventario
    DB.imports.inventory = {count:1, file:'i', loadedAt:new Date().toISOString(),
                            rows:[{sku:'RAPIDO', afnfulfillablequantity:'300'}]};
    DB.imports.multicountry = {count:2, file:'m', loadedAt:new Date().toISOString(), rows:[
      {sellersku:'RAPIDO', country:'DE', quantityforlocalfulfillment:'200'},
      {sellersku:'RAPIDO', country:'PL', quantityforlocalfulfillment:'100'}]};
    DB.history = {};
    captureAll();
    pinta('completa');
    return out;
  `));
  check('la vista de Reposición existe', vistas.vacia.repo!=='SIN VISTA',
    vistas.vacia.repo==='SIN VISTA' ? 'no hay tabla #repoTable: falta registrarVista de reposición' : 'registrada');
  check('vacía, invita a importar en vez de enseñar ceros',
    /importa el informe/i.test(vistas.vacia.repo), (vistas.vacia.repo||'').slice(0,80).replace(/\s+/g,' '));
  check('con ventas y sin inventario, el stock sale «sin medir», no cero',
    /sin medir/i.test(vistas.parcial.inv) && /sin medir/i.test(vistas.parcial.repo),
    (vistas.parcial.repo||'').replace(/\s+/g,' ').slice(0,110));
  check('con todo cargado, la tabla de reposición trae la referencia',
    /RAPIDO/.test(vistas.completa.repo) && vistas.completa.kpis>=6,
    vistas.completa.kpis+' KPI · '+(vistas.completa.repo||'').replace(/\s+/g,' ').slice(0,90));
  check('Polonia sale marcada como país donde esta tarifa no se cobra',
    /PL/.test(vistas.completa.pais) && /no se cobra aquí/i.test(vistas.completa.pais),
    (vistas.completa.pais||'').replace(/\s+/g,' ').slice(0,140));
  check('y la nota de la pantalla cita la fuente y la fecha de consulta',
    /consultado el 20\d\d-\d\d-\d\d/i.test(vistas.completa.nota) && /tarifario/i.test(vistas.completa.nota),
    (vistas.completa.nota||'').replace(/\s+/g,' ').slice(-130));

  /* La exportación del carril: que salga con filas y sin dejar un cero donde
     no se ha medido nada. Un cero en un CSV es un número que alguien va a
     sumar en una hoja de cálculo. */
  console.log('\n=== FECHA-P · LA EXPORTACIÓN NO RELLENA HUECOS CON CEROS ===');
  const csv = await page.evaluate(js(`
    if(typeof exportReposicion!=='function') return {falta:'exportReposicion()'};
    const ventas=[];
    for(let k=0;k<30;k++){ ventas.push(venta(dia(k),'RAPIDO',10)); ventas.push(venta(dia(k),'LENTO',1)); }
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    DB.imports.inventory = {count:1, file:'i', rows:[{sku:'RAPIDO', afnfulfillablequantity:'300'}]};
    DB.history = {};
    let texto = '';
    const realBlob = window.Blob, realCreate = URL.createObjectURL,
          realClick = HTMLAnchorElement.prototype.click;
    window.Blob = function(p){ texto = (p||[]).join(''); return new realBlob(p||[], arguments[1]); };
    URL.createObjectURL = ()=> 'blob:x';
    HTMLAnchorElement.prototype.click = function(){};
    try{ exportReposicion(); exportInventario(); }catch(e){ texto = 'ERROR '+e.message; }
    const inv = texto;
    texto = '';
    try{ exportReposicion(); }catch(e){ texto = 'ERROR '+e.message; }
    window.Blob = realBlob; URL.createObjectURL = realCreate;
    HTMLAnchorElement.prototype.click = realClick;
    const lineas = texto.replace(/^\ufeff/,'').split('\\r\\n').filter(x=>x!=='');
    const lento = lineas.filter(l=>/^LENTO/.test(l))[0]||'';
    return {filas:lineas.length-1, cab:(lineas[0]||'').split(';').length, lento,
            invCab: inv.split('\\r\\n')[0]||''};
  `));
  if(falta(csv)) check('la exportación de reposición existe', false, falta(csv));
  else {
    check('el CSV de reposición sale con sus dos referencias y sus columnas',
      csv.filas===2 && csv.cab>=20, csv.filas+' filas · '+csv.cab+' columnas');
    check('y la referencia sin foto de inventario lleva la celda vacía, no un cero',
      /^LENTO;[^;]*;;no;/.test(csv.lento),
      (csv.lento||'').slice(0,70)+' · un cero aquí es un número que alguien suma');
    check('el CSV de inventario declara si el stock está medido',
      /Stock medido/.test(csv.invCab), (csv.invCab||'').slice(0,120));
  }

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
