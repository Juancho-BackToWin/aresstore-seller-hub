#!/usr/bin/env node
/* =========================================================================
   CARRIL 3 · TRANSACCIONES Y RECLAMACIONES

   Un hub de gestión no falla dando error: falla dando un número creíble y
   falso. En este carril el número creíble y falso tiene dos caras, y las dos
   cuestan dinero: reclamar algo que Amazon no debe —y que te cierra la puerta
   a las reclamaciones buenas— o no ver lo que sí debe.

   Cada caso lleva la aritmética a mano en el comentario. Cada prueba que
   persigue un fallo se ha visto ROJA sin el arreglo, con mensaje, y el mensaje
   dice qué número daba antes.
   ========================================================================= */
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const FIX  = path.resolve(__dirname, 'fixtures-3');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> typeof a==='number' && isFinite(a) && Math.abs(a-b) < (t==null?0.005:t);

/* Las fixtures llevan fechas relativas a hoy: se regeneran antes de nada, igual
   que hace `tests/run-all.js` con las demás. */
spawnSync('node', [path.join('tests','mkfixtures-3.js')], {cwd:RAIZ, encoding:'utf8'});

/* Laboratorio compartido: un producto que cuesta 5,00 € y se vende a 100,00 €,
   para que la comisión del 15 % sea 15,00 € exactos y las cuentas se hagan de
   cabeza. */
const LAB = `
  DB = blankDB();
  DB.products = [
    {id:'p1', sku:'ARS-REC-01', name:'Producto de prueba uno', cogs:5, freight:0,
     fba:3, referral:15, price:100, channel:'FBA', lots:[]},
    {id:'p2', sku:'ARS-REC-02', name:'Producto de prueba dos', cogs:8, freight:2,
     fba:3, referral:15, price:100, channel:'FBA', lots:[]}
  ];
  const hoy = new Date();
  const dia = k => { const d=new Date(hoy); d.setDate(d.getDate()-k);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const venta = (d,q,sku)=>({amazonorderid:'o'+d+q, _oid:'o'+d+q,
    purchasedate:d+'T10:00:00+00:00', _date:d+'T10:00:00+00:00',
    fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:sku||'ARS-REC-01', _sku:sku||'ARS-REC-01',
    asin:'B0REC1', itemstatus:'Shipped', quantity:String(q), _qty:String(q),
    itemprice:String(100*q), _amount:String(100*q), itemtax:'0', _tax:'0', shipcountry:'ES', _country:'ES'});
`;
const js = body => '(()=>{' + LAB + body + '})()';

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  page.on('console', m => { const t=m.text();
    if(m.type()==='error' && t.indexOf('ERR_')<0 && t.indexOf('Failed to load resource')<0) errores.push('CONSOLE: '+t); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(RAIZ,'index.html'));
  await page.waitForTimeout(700);

  /* ══ REC-A · LA VISTA VACÍA ═══════════════════════════════════════════════
     Antes de cargar nada. Una pantalla nueva que peta con la base en blanco se
     lleva por delante las diez que ya funcionaban, porque `refreshAll()` las
     recorre en fila. */
  console.log('\n=== REC-A · LA VISTA VACÍA NO PETA Y NO INVENTA ===');
  const vacia = await page.evaluate(js(`
    go('reclamaciones'); refreshAll();
    const A = claimsAll();
    const sec = document.getElementById('view-reclamaciones');
    return {existe: !!sec, visible: sec && sec.classList.contains('active'),
            total:A.total, casos:A.casos, fuente:A.hayFuente,
            texto: (document.getElementById('clBloques')||{}).textContent||'',
            ventanas: (document.getElementById('clVentanas')||{}).textContent||''};
  `));
  check('la vista existe y se puede navegar a ella', vacia.existe && vacia.visible, 'view-reclamaciones');
  check('sin informes no hay ni un caso ni un euro', vacia.casos===0 && vacia.total===0,
    vacia.casos+' casos · '+vacia.total.toFixed(2)+' €');
  check('y lo dice, en vez de enseñar una tabla vacía',
    vacia.texto.indexOf('Todavía no hay datos')>=0, vacia.texto.slice(0,60));
  check('los plazos se enseñan igual, con su fecha de consulta',
    vacia.ventanas.indexOf('2026-09-17')>=0 && vacia.ventanas.indexOf('45')>=0,
    vacia.ventanas.slice(0,90));

  /* ══ REC-B · E6 · EL CRÉDITO DE COMISIÓN, CONTADO DOS VECES ═══════════════
     En la liquidación, la comisión de una venta viene NEGATIVA y la del
     reembolso de esa venta viene POSITIVA. Sumadas en el mismo saco, la
     comisión salía ya neta de reembolsos. Y `pnl()` vuelve a acreditar esa
     misma comisión en su línea de devoluciones. El mismo crédito, dos veces.

     Aritmética: 10 ventas de 100 € = 1.000 € de ingreso.
       comisión liquidada de las ventas   = 150,00 €
       crédito de comisión del reembolso  =  12,00 €
       una devolución, sin estado declarado
     La liquidación solo AÑADE información, así que el beneficio no puede
     moverse. MEDIDO EN ESTA BASE el 17-09-2026, antes del arreglo: sin
     liquidación 507,996 €; con ella 519,996 €. Doce euros justos de más. */
  console.log('\n=== REC-B · E6 · EL CRÉDITO DE COMISIÓN DE UN REEMBOLSO ===');
  const e6 = await page.evaluate(js(`
    const ventas=[]; for(let i=0;i<10;i++) ventas.push(venta(dia(5),1));
    ventas.forEach((v,i)=>{ v.amazonorderid='o'+i; v._oid='o'+i; });
    DB.imports.orders = {rows:ventas, count:10, file:'o'};
    DB.imports.returns = {count:1, file:'r', rows:[{_oid:'o0', orderid:'o0',
      _date:dia(3), returndate:dia(3), _sku:'ARS-REC-01', sku:'ARS-REC-01',
      _qty:'1', quantity:'1', _disp:'', detaileddisposition:''}]};
    periodDays = 30;
    const sin = pnl();
    DB.imports.settlement = {count:2, file:'s', rows:[
      {settlementid:'S1', transactiontype:'Order', posteddate:dia(5), marketplacename:'Amazon.es',
       itemrelatedfeetype:'Commission', itemrelatedfeeamount:'-150.00',
       orderfeetype:'', orderfeeamount:'', shipmentfeetype:'', shipmentfeeamount:'', promotionamount:''},
      {settlementid:'S1', transactiontype:'Refund', posteddate:dia(3), marketplacename:'Amazon.es',
       itemrelatedfeetype:'Commission', itemrelatedfeeamount:'12.00',
       orderfeetype:'', orderfeeamount:'', shipmentfeetype:'', shipmentfeeamount:'', promotionamount:''}
    ]};
    const con = pnl(), sf = settlementFees();
    return {sinProfit:sin.profit, conProfit:con.profit, sinRef:sin.referral, conRef:con.referral,
            sfRef:sf.referral, sfCred:sf.refCredito, retCom:con.retComision};
  `));
  check('la liquidación mide 150,00 € de comisión COBRADA', near(e6.sfRef, 150),
    (e6.sfRef==null?'undefined':e6.sfRef.toFixed(2))+' € · con el fallo salía 138,00 €, ya neta del reembolso');
  check('y el crédito de 12,00 € sale APARTE, no restado dentro',
    near(e6.sfCred, 12), (e6.sfCred==null?'refCredito no existe: el arreglo de E6 no está':e6.sfCred.toFixed(2)+' €'));
  check('la devolución sigue acreditando su comisión una vez', near(e6.retCom, 12),
    (e6.retCom==null?'—':e6.retCom.toFixed(2))+' € = 15,00 − mín(5, 20 % de 15,00)');
  check('cargar la liquidación NO mueve el beneficio', near(e6.conProfit, e6.sinProfit, 0.01),
    e6.conProfit.toFixed(3)+' € frente a '+e6.sinProfit.toFixed(3)+' € · con el fallo subía a 519,996 € (+12,00 €, un 2,4 % sobre 1.000 € de venta)');
  check('la comisión del periodo son 150,00 €, no 138,00 €', near(e6.conRef, 150),
    e6.conRef.toFixed(2)+' €');

  /* ══ REC-C · EL PREÁMBULO Y EL FORMATO LITERAL ════════════════════════════
     Por la puerta de entrada de verdad: el mismo `<input type=file>` que usa
     una persona. `parseDelimited` busca la cabecera entre las SEIS primeras
     filas; con siete líneas de preámbulo no la encuentra nunca y se queda con
     la línea 1 como cabecera. No da error: da un informe «reconocido» con cero
     euros dentro. */
  console.log('\n=== REC-C · SIETE LÍNEAS DE PREÁMBULO Y DECIMALES CON COMA ===');
  await page.evaluate(js(`periodDays = 0;`));
  await page.setInputFiles('#csvFile', path.resolve(FIX,'transacciones.csv'));
  await page.waitForTimeout(1200);
  const carga = await page.evaluate(`(()=>{
    const t = DB.imports.tx;
    window.__txFix = t;
    const R = txRows();
    const nota = (REGISTRO.notas||[]).map(n=>n.nota).join(' | ');
    const pedido = R.filter(r=>r.oid==='111-0000001-0000001')[0] || {};
    return {reconocido: !!t, filas: t?t.count:0, cols: t?t.cols:0,
            nota, ventas:pedido.ventas, com:pedido.com, fecha:pedido.k,
            span: (()=>{const s=txSpan(); return {filas:s.filas, sinFecha:s.sinFecha};})()};
  })()`);
  check('el informe de transacciones se reconoce', carga.reconocido===true, carga.reconocido?'sí':'NO');
  check('con sus 27 columnas', carga.cols===27, carga.cols+' columnas');
  check('y sus 14 filas de datos, no 21 ni 1', carga.filas===14,
    carga.filas+' filas · con el preámbulo sin quitar, la cabecera era la línea 1 y el fichero entraba como UNA columna');
  check('el preproceso lo cuenta en vez de transformar en silencio',
    /(quitadas|saltado) 7 líneas de preámbulo/.test(carga.nota), carga.nota||'ninguna nota');
  check('los decimales con coma se leen como números', near(carga.ventas, 100) && near(carga.com, -15),
    'ventas '+carga.ventas+' · tarifas de venta '+carga.com+' · «-15,00» no puede salir −1500 ni 0');
  check('las fechas «5 sep 2026 10:00:00 UTC» se leen', !!carga.fecha && /^\d{4}-\d{2}-\d{2}$/.test(carga.fecha),
    carga.fecha+' · parseDate() no sabe leer meses abreviados en español');
  check('las 14 filas traen fecha', carga.span.filas===14 && carga.span.sinFecha===0,
    carga.span.filas+' con fecha · '+carga.span.sinFecha+' sin fecha');

  /* ══ REC-C2 · UN SOLO CARÁCTER NO PUEDE ROMPER EL FICHERO ENTERO ═════════
     El informe real es UTF-8 VÁLIDO y trae dentro un U+FFFD escrito por el
     propio Amazon. `readSmart` lo interpreta como «esto era windows-1252» y
     vuelve a decodificar el fichero entero así. Medido el 17-09-2026 contra el
     fichero real: la cabecera «tarifas de Logística de Amazon» quedaba en
     `tarifasdelogasticadeamazon`, ningún alias casaba y la TARIFA DE LOGÍSTICA
     DE CUATRO AÑOS salía 0,00 €; «descripción» quedaba en `descripcian` y las
     filas de publicidad dejaban de reconocerse como tales, así que el gasto de
     PPC se sumaba otra vez a las tarifas; y «número de pedido» quedaba en
     `namerodepedido`, con lo que el detector de devoluciones fantasma se
     quedaba sin pedido al que agarrarse. */
  console.log('\n=== REC-C2 · UN U+FFFD DENTRO NO PUEDE VOLVER MOJIBAKE EL FICHERO ===');
  await page.setInputFiles('#csvFile', path.resolve(FIX,'transacciones-fffd.csv'));
  await page.waitForTimeout(1200);
  const moji = await page.evaluate(`(()=>{
    periodDays = 0; countryFilter = 'ALL';
    const t = DB.imports.tx;
    const claves = t ? Object.keys(t.rows[0]) : [];
    const f = txFees({from:new Date(2000,0,1)});
    const R = txRows();
    return {filas:t?t.count:0, claves,
            nota:(REGISTRO.notas||[]).filter(n=>/fffd/.test(n.fichero||''))
                   .map(n=>n.etiqueta+' → '+n.nota).join(' | '),
            fba:f.fba, other:f.other, fuera:f.fuera,
            oids: R.filter(r=>r.oid).length,
            desc: (R.filter(r=>/publicidad/i.test(r.desc))[0]||{}).desc || ''};
  })()`);
  check('el fichero se lee igual de bien', moji.filas===14, moji.filas+' filas');
  check('la reparación de codificación se declara',
    /reparada la codificación/.test(moji.nota), moji.nota.slice(0,70));
  check('la cabecera «tarifas de Logística de Amazon» se reconoce',
    moji.claves.indexOf('tarifasdelogisticadeamazon')>=0,
    'con el fallo llegaba como «tarifasdelogasticadeamazon» y la tarifa FBA salía 0,00 €');
  check('y la tarifa de logística sigue siendo 9,00 €', near(moji.fba, 9),
    moji.fba.toFixed(2)+' € · con el fallo: 0,00 €');
  check('«descripción» se reconoce, así que la publicidad se sigue excluyendo',
    near(moji.other, 0) && moji.fuera===4,
    'otras tarifas '+moji.other.toFixed(2)+' € · '+moji.fuera+' filas fuera · con el fallo, 20,00 € de PPC contados dos veces');
  check('«número de pedido» se reconoce en las 11 filas que lo traen',
    moji.oids===11, moji.oids+' pedidos · sin esta columna el detector de devoluciones fantasma se queda ciego');
  check('y los acentos llegan bien a la pantalla', /publicidad/.test(moji.desc) && !/Ã/.test(moji.desc),
    moji.desc || '(sin descripción)');

  /* Se vuelve a dejar cargado el fichero limpio para el resto de la sesión. */
  await page.setInputFiles('#csvFile', path.resolve(FIX,'transacciones.csv'));
  await page.waitForTimeout(1200);
  await page.evaluate(`window.__txFix = DB.imports.tx;`);

  /* ══ REC-D · LAS TARIFAS QUE SÍ Y LAS QUE NO ══════════════════════════════
       comisión cobrada  = 3 × 15,00                      =  45,00 €
       crédito de comisión = 12+6+8+5+4+3                 =  38,00 €
       tarifa de logística = 3 × 3,00                     =   9,00 €
       almacenamiento      = 4,00                         =   4,00 €
     Y CUATRO FILAS QUE NO PUEDEN ENTRAR: la publicidad (−20,00 €), que
     `adStats()` ya mide desde el informe de términos de búsqueda; la
     transferencia (−0,01 €), que es caja; y los dos ajustes, que son dinero
     que ENTRA y que `pnl()` ya tiene en su línea de reembolsos. Meterlas aquí
     las contaría dos veces. */
  console.log('\n=== REC-D · QUÉ ES UNA TARIFA Y QUÉ NO ===');
  const fees = await page.evaluate(`(()=>{
    DB.imports.tx = window.__txFix; periodDays = 0; countryFilter = 'ALL';
    const f = txFees({from:new Date(2000,0,1)});
    return f;
  })()`);
  check('comisión cobrada 45,00 €', near(fees.referral, 45), fees.referral.toFixed(2)+' € = 3 × 15,00');
  check('crédito de comisión 38,00 €, y por separado', near(fees.refCredito, 38),
    fees.refCredito.toFixed(2)+' € = 12+6+8+5+4+3');
  check('tarifa de logística 9,00 €', near(fees.fba, 9), fees.fba.toFixed(2)+' € = 3 × 3,00');
  check('almacenamiento 4,00 €', near(fees.storage, 4), fees.storage.toFixed(2)+' €');
  check('la publicidad NO entra: ya la mide adStats()', near(fees.other, 0),
    fees.other.toFixed(2)+' € · contándola saldrían 20,01 € de tarifas que ya están en la línea de PPC');
  check('cuatro filas declaradas fuera de las tarifas', fees.fuera===4,
    fees.fuera+' fuera · publicidad, transferencia y dos ajustes');
  check('la promoción se declara desconocida, no cero', fees.promo===null,
    String(fees.promo)+' · el informe no trae columna de promoción y un cero parecería medido');

  /* ══ REC-E · DEDUPLICACIÓN ENTRE LAS DOS FUENTES ══════════════════════════
     Cada fila del informe de transacciones lleva su «identificador de pago»,
     que ES el `settlement-id` del fichero plano. Las tres ventas de la fixture
     pertenecen a la liquidación 900001. Si además se carga esa liquidación:
       comisión correcta = 45,00 €   (la de la liquidación)
       sin deduplicar    = 90,00 €   (45 del fichero plano + 45 de transacciones)
     Duplicar la comisión no da un error: da un beneficio 45 € más bajo con
     dos ficheros que dicen lo mismo. */
  console.log('\n=== REC-E · LAS DOS FUENTES NO SE CUENTAN DOS VECES ===');
  const dedup = await page.evaluate(js(`
    DB.imports.tx = window.__txFix; periodDays = 0; countryFilter = 'ALL';
    /* El informe de pedidos tiene que corroborar las ventas: si no, las
       tarifas medidas no se aplican (ver REC-E2). */
    DB.imports.orders = {count:3, file:'o', rows:[venta(dia(5),1), venta(dia(6),1), venta(dia(7),1)]};
    const soloTx = settlementFees();
    DB.imports.settlement = {count:1, file:'liq', rows:[
      {settlementid:'900001', transactiontype:'Order', posteddate:dia(6), marketplacename:'Amazon.es',
       itemrelatedfeetype:'Commission', itemrelatedfeeamount:'-45.00',
       orderfeetype:'', orderfeeamount:'', shipmentfeetype:'', shipmentfeeamount:'', promotionamount:''}]};
    const con = settlementFees();
    const sinDedup = txFees({from:new Date(2000,0,1), dedup:false});
    delete DB.imports.settlement;
    return {soloTx:soloTx.referral, con:con.referral, dupPagos:con.dupPagos, dupFilas:con.dupFilas,
            fuente:con.fuente, sinDedup:sinDedup.referral + 45};
  `));
  check('solo con transacciones, la comisión son 45,00 €', near(dedup.soloTx, 45), dedup.soloTx.toFixed(2)+' €');
  check('con las dos fuentes cargadas, SIGUEN siendo 45,00 €', near(dedup.con, 45),
    dedup.con.toFixed(2)+' € · sin deduplicar saldrían '+dedup.sinDedup.toFixed(2)+' €');
  check('y se dice cuánto se ha descartado y por qué', dedup.dupPagos===1 && dedup.dupFilas===3,
    dedup.dupPagos+' liquidación · '+dedup.dupFilas+' filas ya presentes en el fichero plano');
  check('la fuente del dato se declara', dedup.fuente==='liquidación + transacciones', dedup.fuente);

  /* ══ REC-E2 · ¿HABLAN LAS DOS FUENTES DEL MISMO NEGOCIO? ══════════════════
     SALIÓ DE CARGAR LOS FICHEROS REALES el 17-09-2026. El informe de
     transacciones trae las tarifas de varios años; el informe de pedidos que
     había al lado cubría 265 ventas y 4.024,74 € de ingreso. Restar las unas al
     otro daba −31.520,08 € de beneficio y un margen del −867,6 %.

     Aquí, en pequeño. El informe de pedidos trae UNA venta de 100 € el día
     ago(7); el de transacciones trae TRES ventas de 100 € entre ago(7) y
     ago(5), con 45,00 € de comisión. Las tarifas se acotan primero al intervalo
     que cubren las ventas —desde ago(7)—, y aun así las dos fuentes no cuadran:
     300 € contra 100 €. Así que las tarifas medidas NO entran en la cuenta de
     resultados y `pnl()` vuelve a estimarlas: 15 % de 100 € = 15,00 €. */
  console.log('\n=== REC-E2 · SI LAS DOS FUENTES NO CUADRAN, NO SE MIDE ===');
  const contraste = await page.evaluate(js(`
    DB.imports.tx = window.__txFix; periodDays = 0; countryFilter = 'ALL';
    DB.imports.orders = {count:1, file:'o', rows:[venta(dia(7),1)]};
    const sf = settlementFees(); const P = pnl();
    DB.imports.orders = {count:3, file:'o', rows:[venta(dia(5),1), venta(dia(6),1), venta(dia(7),1)]};
    const sf2 = settlementFees(); const P2 = pnl();
    return {mal:{ref:sf.referral, fuente:sf.fuente, ok:sf.txContraste.ok, razon:sf.txContraste.razon,
                 pnlRef:P.referral, medido:P.refMedido},
            bien:{ref:sf2.referral, fuente:sf2.fuente, ok:sf2.txContraste.ok,
                  pnlRef:P2.referral, medido:P2.refMedido}};
  `));
  check('con un informe de pedidos que no cuadra, la comisión medida no se aporta',
    near(contraste.mal.ref, 0) && contraste.mal.ok===false,
    contraste.mal.ref.toFixed(2)+' € · sin este guardarraíl se restaban 45,00 € de tarifas a 100 € de venta');
  check('y se dice por qué', /transacciones ve/.test(contraste.mal.razon), contraste.mal.razon);
  check('pnl() vuelve a estimar: 15 % de 100 € = 15,00 €',
    near(contraste.mal.pnlRef, 15) && contraste.mal.medido===false,
    contraste.mal.pnlRef.toFixed(2)+' € · con el fallo salían 45,00 € contra 100 € de ingreso');
  check('la fuente lo declara en vez de callarlo',
    /sin contrastar/.test(contraste.mal.fuente), contraste.mal.fuente);
  check('y con un informe de pedidos que sí cuadra, se mide',
    near(contraste.bien.ref, 45) && contraste.bien.medido===true && contraste.bien.ok===true,
    contraste.bien.ref.toFixed(2)+' € medidos · '+contraste.bien.fuente);

  /* ══ REC-F · DETECTOR 1 · DEVOLUCIONES FANTASMA ═══════════════════════════
     Reembolso al cliente, sin devolución registrada y sin compensación.
       ago(60)  …0009  100,00 − 12,00 = 88,00 €  → dentro de plazo (45–105)
       ago(10)  …0010   50,00 −  6,00 = 44,00 €  → aún no: faltan 35 días
       ago(200) …0011   70,00 −  8,00 = 62,00 €  → fuera de plazo
       ago(60)  …0012  gestión «Vendedor»        → Amazon no debe nada
       ago(61)  …0013  con devolución registrada → no es fantasma
       ago(62)  …0015  con ajuste compensatorio  → ya cobrado
     Total reclamable = 88,00 €, no 194,00 € ni 259,00 €. */
  console.log('\n=== REC-F · DETECTOR 1 · DEVOLUCIONES FANTASMA ===');
  const fantasma = await page.evaluate(js(`
    DB.imports.tx = window.__txFix; periodDays = 0;
    const dev = (k,oid)=>({_oid:oid, orderid:oid, _date:dia(k), returndate:dia(k),
      _sku:'ARS-REC-01', sku:'ARS-REC-01', _qty:'1', quantity:'1',
      _disp:'sellable', detaileddisposition:'sellable'});
    const sinInforme = claimDevolucionesFantasma();
    /* Un informe de devoluciones de un solo día: NO cubre los 45 días que el
       cliente tiene para devolver, así que no se puede saber si falta ninguna. */
    DB.imports.returns = {count:1, file:'dev', rows:[dev(61,'111-0000013-0000013')]};
    const corto = claimDevolucionesFantasma();
    /* Un informe que sí cubre el intervalo. */
    DB.imports.returns = {count:3, file:'dev', rows:[
      dev(220,'111-0000099-0000099'), dev(61,'111-0000013-0000013'), dev(5,'111-0000098-0000098')]};
    const r = claimDevolucionesFantasma();
    return {sinInforme:{casos:sinInforme.casos.length, avisos:sinInforme.avisos.length},
            corto:{casos:corto.casos.length, aviso:corto.avisos[0]||''},
            casos:r.casos.map(c=>({oid:c.oid, importe:c.importe, estado:c.estado.estado})),
            total:r.total, desc:r.descartados, aviso:r.avisos[0]||''};
  `));
  check('sin el informe de devoluciones NO se enseña ni un caso',
    fantasma.sinInforme.casos===0 && fantasma.sinInforme.avisos===1,
    fantasma.sinInforme.casos+' casos · sin ese informe TODO reembolso parecería fantasma');
  /* ESTE CASO SALIÓ DE CARGAR LOS FICHEROS REALES el 17-09-2026: el informe de
     transacciones traía 2 años y 8 meses con 526 reembolsos y el informe de
     devoluciones descargado cubría unos pocos días. El detector daba 459
     «devoluciones fantasma» que no lo eran: era el informe, que no llegaba. */
  check('un informe de devoluciones más corto que la ventana tampoco vale',
    fantasma.corto.casos===0 && /menos de los 45 días/.test(fantasma.corto.aviso),
    fantasma.corto.casos+' casos · contra ficheros reales esto daba 459 falsos positivos');
  check('con un informe que sí cubre, dos candidatos', fantasma.casos.length===2,
    fantasma.casos.length+' casos · '+fantasma.casos.map(c=>c.oid.slice(-4)+':'+c.estado).join(' '));
  check('el reclamable son 88,00 €, no 194,00 €', near(fantasma.total, 88),
    fantasma.total.toFixed(2)+' € = 100,00 − 12,00 · solo el que está dentro de la ventana 45–105');
  check('el de hace 200 días dice «fuera de plazo» y no suma',
    (fantasma.casos.filter(c=>c.estado==='caducada')[0]||{}).importe===62,
    JSON.stringify(fantasma.casos.filter(c=>c.estado==='caducada')));
  check('el reembolso de hace 10 días no se evalúa: el cliente aún puede devolver',
    fantasma.desc.fueraDeCobertura===1, JSON.stringify(fantasma.desc));
  check('el reembolso de gestión propia se descarta: Amazon no debe nada',
    fantasma.desc.fbm===1, JSON.stringify(fantasma.desc));
  check('el que tiene devolución registrada y el ya compensado, también',
    fantasma.desc.conDevolucion===1 && fantasma.desc.compensados===1, JSON.stringify(fantasma.desc));
  check('y la pantalla dice hasta dónde cubre el informe',
    /cubre del .* al /.test(fantasma.aviso), fantasma.aviso.slice(0,80));

  /* ══ REC-G · DETECTOR 2 · REEMBOLSO POR DEBAJO DEL COSTE ══════════════════
     ARS-REC-01 cuesta 5,00 € puestos (5,00 de fábrica + 0,00 de flete).
       ago(20) ajuste de  2,00 € por 1 ud → faltan 3,00 €, dentro de los 60 días
       ago(55) ajuste de 22,00 € por 1 ud → por encima del coste: no se reclama
     El coste se LEE de `costNow()`, que es del carril 2: recalcularlo aquí es
     como los números dejan de cuadrar entre pantallas. */
  console.log('\n=== REC-G · DETECTOR 2 · REEMBOLSO POR DEBAJO DEL COSTE ===');
  const corto = await page.evaluate(`(()=>{
    DB.imports.tx = window.__txFix;
    const r = claimReembolsoInsuficiente();
    return {casos:r.casos.map(c=>({sku:c.sku, importe:c.importe, costeUd:c.costeUd,
            compUd:c.compensadoUd, estado:c.estado.estado, flete:c.fleteNoAdmisible})),
            total:r.total, desc:r.descartados,
            plantilla: r.casos.length ? claimPlantilla(r.casos[0],
              {id:'valor', ventana:'valor'}) : ''};
  })()`);
  check('un solo caso corto', corto.casos.length===1, JSON.stringify(corto.casos));
  check('faltan 3,00 €, que es 5,00 de coste menos 2,00 compensados', near(corto.total, 3),
    corto.total.toFixed(2)+' €');
  check('el coste lo pone costNow(), no una fórmula paralela',
    near((corto.casos[0]||{}).costeUd, 5), String((corto.casos[0]||{}).costeUd));
  check('la compensación de 22,00 € no se reclama', corto.desc.suficientes===1, JSON.stringify(corto.desc));
  check('la plantilla cita los 60 días y el coste de aprovisionamiento',
    /60 días/.test(corto.plantilla) && /aprovisionamiento/.test(corto.plantilla),
    corto.plantilla.split('\n')[0]);

  /* ══ REC-H · DETECTOR 3 · INVENTARIO PERDIDO O DAÑADO ═════════════════════
     ARS-REC-02 cuesta 10,00 € puestos (8,00 de fábrica + 2,00 de flete).
       ago(20) −3 ud dañadas en el almacén → 30,00 €, dentro de los 60 días
       ago(90) −2 ud dañadas en el almacén → 20,00 €, FUERA de plazo
       ago(15) −1 ud dañada POR EL CLIENTE → Amazon no la paga
       ago(25) −1 ud de ARS-REC-01        → ya compensada el ago(20)
       ago(10) −4 ud de un SKU sin coste  → se enseña SIN importe inventado
       ago(12) +5 ud de entrada           → no es una pérdida
     Total reclamable = 30,00 €. */
  console.log('\n=== REC-H · DETECTOR 3 · INVENTARIO PERDIDO SIN COMPENSAR ===');
  const perdido = await page.evaluate(js(`
    DB.imports.tx = window.__txFix; periodDays = 0;
    const L = (k,sku,q,disp,ev)=>({_date:dia(k), date:dia(k), _sku:sku, msku:sku,
      _qty:String(q), quantity:String(q), _event:ev||'Adjustments', eventtype:ev||'Adjustments',
      disposition:disp, reason:'', referenceid:'REF'+k, _country:'ES', country:'ES'});
    DB.imports.ledger = {count:6, file:'led', rows:[
      L(20,'ARS-REC-02',-3,'WAREHOUSE_DAMAGED'),
      L(90,'ARS-REC-02',-2,'WAREHOUSE_DAMAGED'),
      L(15,'ARS-REC-02',-1,'CUSTOMER_DAMAGED'),
      L(25,'ARS-REC-01',-1,'WAREHOUSE_DAMAGED'),
      L(10,'ARS-REC-09',-4,'WAREHOUSE_DAMAGED'),
      L(12,'ARS-REC-02', 5,'SELLABLE','Receipts')
    ]};
    const r = claimInventarioPerdido();
    return {casos:r.casos.map(c=>({sku:c.sku, uds:c.unidades, importe:c.importe, estado:c.estado.estado})),
            total:r.total, desc:r.descartados};
  `));
  check('tres casos, no seis', perdido.casos.length===3, JSON.stringify(perdido.casos));
  check('el reclamable son 30,00 €: 3 ud × 10,00 € de coste puesto', near(perdido.total, 30),
    perdido.total.toFixed(2)+' € · las 2 ud de hace 90 días están fuera de los 60 de plazo');
  check('lo dañado por el cliente NO se reclama', perdido.desc.noEsDeAmazon===1, JSON.stringify(perdido.desc));
  check('lo ya compensado tampoco', perdido.desc.compensados===1, JSON.stringify(perdido.desc));
  check('sin coste conocido se dice, no se inventa un importe',
    perdido.desc.sinCoste===1 && perdido.casos.filter(c=>c.importe===null).length===1,
    JSON.stringify(perdido.casos.filter(c=>c.importe===null)));
  check('una entrada de inventario no es una pérdida',
    perdido.casos.filter(c=>c.uds===5).length===0, 'ninguna entrada contada');

  /* ══ REC-I · DETECTOR 4 · CAMBIO DE TARIFA FBA ════════════════════════════
     El histórico guarda la tarifa vigente cada día que se importó la vista
     previa de tarifas.
       ago(30) ARS-REC-01 → 3,00 €
       ago(10) ARS-REC-01 → 4,20 €   ·  +1,20 € × 7 ud vendidas = 8,40 €
     NO suma al total reclamable: Amazon sube tarifas por calendario todos los
     años y eso no se reclama. Y el plazo para disputar un cobro de tarifa NO
     está confirmado en ninguna página oficial, así que sale como tal. */
  console.log('\n=== REC-I · DETECTOR 4 · CAMBIO DE TARIFA DE LOGÍSTICA ===');
  const tarifa = await page.evaluate(js(`
    DB.imports.tx = window.__txFix; periodDays = 0;
    const ventas=[]; for(let i=0;i<7;i++) ventas.push(venta(dia(5),1));
    ventas.forEach((v,i)=>{ v.amazonorderid='t'+i; v._oid='t'+i; });
    DB.imports.orders = {rows:ventas, count:7, file:'o'};
    DB.imports.fees = {count:1, file:'f', rows:[{_sku:'ARS-REC-01', sku:'ARS-REC-01', _asin:'B0REC1', asin:'B0REC1'}]};
    DB.history.d[dia(30)] = {f:{'ARS-REC-01':[3.00, 15.00]}};
    DB.history.d[dia(20)] = {f:{'ARS-REC-01':[3.00, 15.00]}};
    DB.history.d[dia(10)] = {f:{'ARS-REC-01':[4.20, 15.00]}};
    const r = claimCambioTarifa();
    const A = claimsAll();
    return {casos:r.casos.map(c=>({sku:c.sku, asin:c.asin, antes:c.antes, ahora:c.ahora,
              uds:c.unidades, importe:c.importe, estado:c.estado.estado})),
            totalGlobal:A.total, revisar:A.revisar};
  `));
  check('un solo cambio detectado, no dos', tarifa.casos.length===1, JSON.stringify(tarifa.casos));
  check('de 3,00 € a 4,20 €, con su ASIN',
    near((tarifa.casos[0]||{}).antes,3) && near((tarifa.casos[0]||{}).ahora,4.2) && (tarifa.casos[0]||{}).asin==='B0REC1',
    JSON.stringify(tarifa.casos[0]||{}));
  check('8,40 € en juego: 1,20 € × 7 unidades vendidas después',
    near((tarifa.casos[0]||{}).importe, 8.4), String((tarifa.casos[0]||{}).importe));
  check('el plazo sale como NO CONFIRMADO, no como 90 días de un blog',
    (tarifa.casos[0]||{}).estado==='sin-confirmar', String((tarifa.casos[0]||{}).estado));
  check('y NO suma al total reclamable: es una revisión, no una deuda',
    tarifa.revisar===1 && !near(tarifa.totalGlobal, 8.4) && tarifa.totalGlobal>0,
    'total reclamable '+tarifa.totalGlobal.toFixed(2)+' € · a revisar '+tarifa.revisar);

  /* ══ REC-J · LAS VENTANAS ═════════════════════════════════════════════════
     No están escritas de memoria: salen de anuncios oficiales de Seller
     Central consultados el 17-09-2026, y el plazo de las devoluciones de
     cliente NO ES EL MISMO en amazon.es (45–105) que en amazon.com (60–120).
     El plan antiguo del proyecto decía «105 y 60 días»; para amazon.es el 105
     sigue vigente y el 60 es el MÍNIMO, no el máximo. */
  console.log('\n=== REC-J · LAS VENTANAS, CON FUENTE Y FECHA ===');
  const ven = await page.evaluate(`(()=>{
    const V = CLAIM_VENTANAS;
    return {consulta:CLAIM_CONSULTA,
            dev:{min:V.devolucion.min, max:V.devolucion.max, url:V.devolucion.url, conf:V.devolucion.confirmada},
            alm:{max:V.almacen.max, conf:V.almacen.confirmada, url:V.almacen.url},
            val:{max:V.valor.max, conf:V.valor.confirmada, url:V.valor.url},
            tar:{conf:V.tarifa.confirmada, min:V.tarifa.min, max:V.tarifa.max},
            todas:Object.keys(V).every(k=>V[k].confirmada ? !!V[k].url : true)};
  })()`);
  check('devolución de cliente en amazon.es: 45–105 días', ven.dev.min===45 && ven.dev.max===105,
    ven.dev.min+'–'+ven.dev.max+' · el anuncio de amazon.com dice 60–120: son mercados distintos');
  check('inventario extraviado o dañado: 60 días', ven.alm.max===60, String(ven.alm.max));
  check('desacuerdo con el importe: 60 días desde el reembolso', ven.val.max===60, String(ven.val.max));
  check('tarifa cobrada de más: NO CONFIRMADA, y sin cifra inventada',
    ven.tar.conf===false && ven.tar.min===null && ven.tar.max===null, JSON.stringify(ven.tar));
  check('cada ventana confirmada trae su enlace oficial', ven.todas===true, 'sí');
  check('y la fecha de consulta', ven.consulta==='2026-09-17', ven.consulta);

  /* ══ REC-K · LA VISTA COMPLETA ═══════════════════════════════════════════ */
  console.log('\n=== REC-K · LA VISTA CON TODO CARGADO ===');
  const llena = await page.evaluate(js(`
    /* El estado completo: las cuatro fuentes a la vez, que es como se usa de
       verdad. Siete casos: 2 devoluciones fantasma, 1 reembolso corto,
       3 pérdidas de inventario y 1 cambio de tarifa. */
    DB.imports.tx = window.__txFix; periodDays = 0;
    const dev = (k,oid)=>({_oid:oid, orderid:oid, _date:dia(k), returndate:dia(k),
      _sku:'ARS-REC-01', sku:'ARS-REC-01', _qty:'1', quantity:'1',
      _disp:'sellable', detaileddisposition:'sellable'});
    DB.imports.returns = {count:3, file:'dev', rows:[
      dev(220,'111-0000099-0000099'), dev(61,'111-0000013-0000013'), dev(5,'111-0000098-0000098')]};
    const L = (k,sku,q,disp,ev)=>({_date:dia(k), date:dia(k), _sku:sku, msku:sku,
      _qty:String(q), quantity:String(q), _event:ev||'Adjustments', eventtype:ev||'Adjustments',
      disposition:disp, reason:'', referenceid:'REF'+k, _country:'ES', country:'ES'});
    DB.imports.ledger = {count:6, file:'led', rows:[
      L(20,'ARS-REC-02',-3,'WAREHOUSE_DAMAGED'), L(90,'ARS-REC-02',-2,'WAREHOUSE_DAMAGED'),
      L(15,'ARS-REC-02',-1,'CUSTOMER_DAMAGED'),  L(25,'ARS-REC-01',-1,'WAREHOUSE_DAMAGED'),
      L(10,'ARS-REC-09',-4,'WAREHOUSE_DAMAGED'), L(12,'ARS-REC-02', 5,'SELLABLE','Receipts')]};
    const ventas=[]; for(let i=0;i<7;i++) ventas.push(venta(dia(5),1));
    ventas.forEach((v,i)=>{ v.amazonorderid='t'+i; v._oid='t'+i; });
    DB.imports.orders = {rows:ventas, count:7, file:'o'};
    DB.imports.fees = {count:1, file:'f', rows:[{_sku:'ARS-REC-01', sku:'ARS-REC-01', _asin:'B0REC1', asin:'B0REC1'}]};
    DB.history.d[dia(30)] = {f:{'ARS-REC-01':[3.00, 15.00]}};
    DB.history.d[dia(10)] = {f:{'ARS-REC-01':[4.20, 15.00]}};
    const A = claimsAll();
    go('reclamaciones'); refreshAll();
    const c = document.getElementById('clBloques');
    const k = document.getElementById('clKpis');
    return {filas: c.querySelectorAll('table.grid tr').length,
            plantillas: c.querySelectorAll('textarea.cl-tpl').length,
            kpis: k.querySelectorAll('.kpi').length,
            fuente: (document.getElementById('clFuente')||{}).textContent||'',
            texto: c.textContent,
            casos: A.casos, total: A.total,
            aviso: c.textContent.indexOf('El hub no envía nada')>=0,
            enlaces: document.querySelectorAll('#clVentanas a').length};
  `));
  check('siete casos de los cuatro detectores', llena.casos===7, llena.casos+' casos');
  check('reclamable dentro de plazo: 88,00 + 3,00 + 30,00 = 121,00 €', near(llena.total, 121),
    llena.total.toFixed(2)+' € · el cambio de tarifa NO suma');
  check('la tabla se pinta', llena.filas>=18, llena.filas+' filas');
  check('cada caso trae su plantilla de texto', llena.plantillas===7, llena.plantillas+' plantillas');
  check('los cuatro KPI', llena.kpis===4, llena.kpis+' KPI');
  check('y se repite que el hub NO envía nada a Amazon', llena.aviso===true, 'sí');
  check('los plazos enlazan a la fuente oficial', llena.enlaces>=3, llena.enlaces+' enlaces');
  check('se dice qué se ha descartado a propósito',
    llena.texto.indexOf('Descartados a propósito')>=0, 'sí');
  check('y de dónde sale cada euro: filas, intervalo y lo dejado fuera',
    /Informe de transacciones/.test(llena.fuente) && /14 filas/.test(llena.fuente) &&
    /fuera de las tarifas a propósito/.test(llena.fuente), llena.fuente.slice(0,110));

  console.log('\n=== REC-L · NI UN ERROR DE JAVASCRIPT EN TODA LA SESIÓN ===');
  check('la consola queda limpia', errores.length===0, errores.slice(0,3).join(' | ') || 'limpia');

  await browser.close();
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  process.exit(fails===0 ? 0 : 1);
})().catch(e=>{ console.error(e); process.exit(1); });
