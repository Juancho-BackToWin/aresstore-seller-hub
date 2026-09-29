/* =========================================================================
   M1.2 · LA CASCADA, SUS ETIQUETAS Y EL CUADRE DE LOS CORTES

   Qué se persigue aquí. Un hub de gestión no falla dando error: falla dando un
   número creíble y falso. Los tres sitios donde eso pasa en una cuenta de
   resultados son siempre los mismos:

     · una línea que vale cero porque falta el informe, presentada como un cero
       medido — infla el beneficio y encima parece dato;
     · un total que se rotula «medido» porque la mayoría de sus sumandos lo
       están, cuando basta uno estimado para que no lo sea;
     · un desglose que no suma el total, de manera que la pantalla de al lado
       dice otra cosa y no hay forma de saber cuál miente.

   Cada caso lleva la aritmética a mano en el comentario. Si el motor cambia y
   la prueba se pone roja, ahí está la cuenta para saber quién se equivoca.

   TODAS las comprobaciones están escritas para SOBREVIVIR a que alguien borre
   lo que comprueban: si `cascada()` desaparece, si una línea deja de existir o
   si un campo se queda sin poblar, la prueba sale ROJA con un mensaje que dice
   qué falta, no con un stack en mitad de un `undefined`.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> typeof a==='number' && typeof b==='number' && Math.abs(a-b) < (t==null?0.01:t);

/* Laboratorio: un producto, 100 € por unidad CON IVA español, coste 5 €.
   Con el 21 % la base es 100/1,21 = 82,6446 €, y la comisión al 15 % es
   exactamente el 15 % del precio con IVA, que es como Amazon la cobra. */
const LAB = `
  DB = blankDB();
  DB.products = [{id:'t1', sku:'TEST-1', name:'Producto', cogs:5, freight:0,
                  fba:3, referral:15, price:100, channel:'FBA', lots:[]}];
  const hoy = new Date();
  const dia = k => { const d=new Date(hoy); d.setDate(d.getDate()-k);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const venta = (d,q,o)=>{ o = o||{};
    return {amazonorderid:'o'+d+q+(o.sku||'')+(o.ch||''), purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:o.ch===undefined?'Amazon.es':o.ch,
      sku:o.sku||'TEST-1', asin:'B0X', itemstatus:'Shipped', quantity:String(q),
      itemprice:String((o.precio==null?100:o.precio)*q),
      itemtax:o.iva===undefined?'':String(o.iva),
      shipcountry:o.pais===undefined?'ES':o.pais}; };
  const devolucion = (d,n,o)=>{ o=o||{}; const r=[];
    for(let i=0;i<n;i++) r.push({'order-id':'r'+d+i+(o.sku||''), returndate:d,
      sku:o.sku||'TEST-1', quantity:'1', detaileddisposition:o.disp||''});
    return r; };
  /* Lo que se pide a la cascada en casi todos los casos, envuelto para que un
     fallo devuelva un mensaje y no rompa la página entera. */
  const K = () => { try{ return cascada(); }catch(e){ return {__error:String(e.message||e)}; } };
  const lin = (k,id) => (k && k.lineas ? k.lineas.filter(x=>x.id===id)[0] : null) || null;
`;
const js = body => '(()=>{ try{' + LAB + body + '}catch(e){ return {__error:String(e.message||e)}; } })()';

/* Un resultado que no se ha podido calcular tiene que decirlo con palabras.
   `ex()` construye el texto del fallo: el error si lo hubo, o lo que se
   esperaba encontrar y no estaba. */
const ex = (R, texto) => (R && R.__error) ? ('no se ha podido calcular · ' + R.__error) : texto;

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
     M12-A · EL MÓDULO EXISTE Y NO ES UN ESQUELETO
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-A · EL MÓDULO EXISTE, Y CON LAS PIEZAS QUE HACEN FALTA ===');
  const A = await page.evaluate(()=>{
    const f = n => typeof window[n]==='function' || typeof eval('typeof '+n)==='function';
    const tiene = n => { try{ return eval('typeof '+n)==='function'; }catch(e){ return false; } };
    return {cascada:tiene('cascada'), corteSku:tiene('cortePorSku'), cortePais:tiene('cortePorPais'),
            corteMes:tiene('cortePorMes'), peor:tiene('peorCalidad'), pct:tiene('pctSeguro'),
            frontera:tiene('fronteraM0'), umbral:tiene('umbralUnidades'),
            vista: !!document.getElementById('view-metricas'),
            boton: !!document.querySelector('.nav-item[data-view="metricas"]')};
  });
  check('A1 · `cascada()` existe', A.cascada===true, A.cascada?'':'falta la función que abre la cuenta de resultados línea a línea');
  check('A2 · los tres cortes existen', A.corteSku && A.cortePais && A.corteMes,
    'sku='+A.corteSku+' país='+A.cortePais+' mes='+A.corteMes);
  check('A3 · la herencia de la peor etiqueta tiene función propia', A.peor===true,
    A.peor?'peorCalidad()':'falta `peorCalidad()`: sin ella cada línea decide su etiqueta por su cuenta y la regla se cuela por cualquier sitio');
  check('A4 · el umbral de unidades y el porcentaje seguro existen', A.pct && A.umbral,
    'pctSeguro='+A.pct+' umbralUnidades='+A.umbral);
  check('A5 · la frontera de compactación se puede consultar', A.frontera===true,
    A.frontera?'fronteraM0()':'falta `fronteraM0()`: un corte que cruza la compactación del histórico no es comparable y nadie lo diría');
  check('A6 · y hay una pantalla de verdad, no solo motor', A.vista && A.boton,
    'sección='+A.vista+' · botón de navegación='+A.boton);

  /* ═══════════════════════════════════════════════════════════════════════
     M12-B · UN CASO POR CADA TRAMO DE LA CASCADA

     Aritmética del laboratorio, a mano:
       ingresos con IVA   100 ud × 100 €            = 10.000,00
       IVA repercutido    10.000 − 10.000/1,21      =  1.735,54   (ES 21 %)
       ingreso neto                                 =  8.264,46
       comisión           15 % de 10.000            =  1.500,00
       tarifa FBA         3,00 × 1,015 × 100        =    304,50
       envío propio       sin ventas FBM            =      0,00
       almacenaje         sin liquidación           =      0,00   desconocido
       otras tarifas      sin liquidación           =      0,00   desconocido
       margen de canal    8.264,46 − 1.804,50       =  6.459,96
       coste de producto  5,00 × 100                =    500,00
       margen de producto                           =  5.959,96
       devoluciones, IVA no repercutido, publicidad,
       reembolsos y gastos fijos: sin informe        =      0,00   desconocido
       resultado                                    =  5.959,96
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-B · UN CASO POR CADA TRAMO, CON LA CUENTA HECHA A MANO ===');
  const B = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),100)], count:1, file:'o'};
    periodDays = 30; countryFilter='ALL';
    const P = pnl(), k = K();
    if(k.__error) return k;
    const v = id => { const l = lin(k,id); return l ? {valor:l.valor, calidad:l.calidad, total:!!l.total} : null; };
    return {P:{profit:P.profit, net:P.net, tax:P.tax, gross:P.grossInc},
            ingresos:v('ingresos'), iva:v('iva'), neto:v('neto'),
            comision:v('comision'), fba:v('fba'), envio:v('envio'),
            almacenaje:v('almacenaje'), otras:v('otras'), canal:v('canal'),
            coste:v('coste'), producto:v('producto'),
            devoluciones:v('devoluciones'), ivaNoRep:v('ivaNoRep'),
            publicidad:v('publicidad'), reembolsos:v('reembolsos'), fijos:v('fijos'),
            resultado:k.resultado ? {id:k.resultado.id, valor:k.resultado.valor, calidad:k.resultado.calidad} : null,
            suma:k.suma, etiqueta:k.etiquetaResultado};
  `));
  const tramo = (id, etiqueta, esperado, R) => {
    const l = R && !R.__error ? R[id] : null;
    check('B · '+etiqueta+' = '+esperado.toFixed(2)+' €',
      !!l && near(l.valor, esperado),
      ex(R, l ? l.valor.toFixed(2)+' €' : 'la línea «'+id+'» no está en la cascada: falta ese tramo entero'));
  };
  tramo('ingresos','ingresos con IVA',      10000,   B);
  tramo('iva','IVA repercutido',            -1735.54, B);
  tramo('neto','ingreso neto (subtotal)',    8264.46, B);
  tramo('comision','comisión de Amazon',    -1500,   B);
  tramo('fba','tarifas de logística FBA',    -304.50, B);
  tramo('envio','envío propio (FBM)',            0,   B);
  tramo('almacenaje','almacenaje',               0,   B);
  tramo('otras','otras tarifas',                 0,   B);
  tramo('canal','margen de canal (subtotal)', 6459.96, B);
  tramo('coste','coste de producto',          -500,   B);
  tramo('producto','margen de producto (subtotal)', 5959.96, B);
  tramo('devoluciones','devoluciones',           0,   B);
  tramo('ivaNoRep','IVA no repercutido',         0,   B);
  tramo('publicidad','publicidad',               0,   B);
  tramo('reembolsos','reembolsos recuperados',   0,   B);
  tramo('fijos','gastos fijos',                  0,   B);
  check('B17 · el resultado de la cascada es el beneficio del P&L, al céntimo',
    !!B.resultado && near(B.resultado.valor, B.P && B.P.profit, 0.005),
    ex(B, B.resultado ? B.resultado.valor.toFixed(4)+' € vs '+B.P.profit.toFixed(4)+' € del P&L' : 'la cascada no tiene línea de resultado'));
  check('B18 · y la SUMA de las líneas sueltas también, que es lo que impide que el desglose se separe del total',
    near(B.suma, B.P && B.P.profit, 0.005),
    ex(B, (B.suma!=null? B.suma.toFixed(4):'—')+' € sumando las líneas · '+(B.P?B.P.profit.toFixed(4):'—')+' € en el P&L'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-C · HERENCIA DE LA PEOR
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-C · UN SUBTOTAL HEREDA LA PEOR ETIQUETA DE LO QUE LLEVA ENCIMA ===');
  const C = await page.evaluate(js(`
    if(typeof peorCalidad!=='function') return {__error:'no existe peorCalidad()'};
    /* Caso 1 · la columna de impuesto NO viene, así que el IVA se DEDUCE del
       tipo del país: la línea es estimada y el ingreso neto, que se compone de
       ingresos (medido) + IVA (estimado), tiene que salir estimado. Un ingreso
       neto rotulado «medido» sobre un IVA deducido es exactamente el número
       creíble y falso que este módulo persigue. */
    DB.imports.orders = {rows:[venta(dia(5),100)], count:1, file:'o'};
    periodDays = 30; countryFilter='ALL';
    const k1 = K();
    /* Caso 2 · con la columna de impuesto SÍ presente, el IVA pasa a medido y
       el ingreso neto también. Lo que no cambia es el resultado: sigue llevando
       líneas desconocidas debajo. */
    DB.imports.orders = {rows:[venta(dia(5),100,{iva:17.36})], count:1, file:'o'};
    const k2 = K();
    return {
      peor:{
        dosMedidos: peorCalidad('medido','medido'),
        medidoEstimado: peorCalidad('medido','estimado'),
        estimadoDesconocido: peorCalidad('estimado','desconocido'),
        desconocidoMedido: peorCalidad('desconocido','medido'),
        ordenIndiferente: peorCalidad('desconocido','estimado')===peorCalidad('estimado','desconocido'),
        vacio: peorCalidad()
      },
      sinColumna:{iva:(lin(k1,'iva')||{}).calidad, neto:(lin(k1,'neto')||{}).calidad,
                  ingresos:(lin(k1,'ingresos')||{}).calidad, resultado:k1.calidad},
      conColumna:{iva:(lin(k2,'iva')||{}).calidad, neto:(lin(k2,'neto')||{}).calidad,
                  resultado:k2.calidad}
    };
  `));
  check('C1 · dos medidos dan medido', C.peor && C.peor.dosMedidos==='medido', ex(C, C.peor&&C.peor.dosMedidos));
  check('C2 · medido + estimado da ESTIMADO, no medido',
    C.peor && C.peor.medidoEstimado==='estimado',
    ex(C, (C.peor&&C.peor.medidoEstimado)+' · si diera «medido» bastaría un sumando bueno para sellar una suma mala'));
  check('C3 · estimado + desconocido da DESCONOCIDO',
    C.peor && C.peor.estimadoDesconocido==='desconocido', ex(C, C.peor&&C.peor.estimadoDesconocido));
  check('C4 · y da igual el orden en que lleguen', C.peor && C.peor.ordenIndiferente===true &&
    C.peor.desconocidoMedido==='desconocido', ex(C, 'desconocido+medido='+(C.peor&&C.peor.desconocidoMedido)));
  check('C5 · sin argumentos, lo más benigno posible', C.peor && C.peor.vacio==='medido', ex(C, C.peor&&C.peor.vacio));
  check('C6 · con el IVA deducido, el ingreso neto NO se rotula medido',
    C.sinColumna && C.sinColumna.ingresos==='medido' && C.sinColumna.iva==='estimado' &&
    C.sinColumna.neto==='estimado',
    ex(C, 'ingresos='+(C.sinColumna||{}).ingresos+' · IVA='+(C.sinColumna||{}).iva+' · neto='+(C.sinColumna||{}).neto));
  check('C7 · y con la columna de impuesto presente sí pasa a medido',
    C.conColumna && C.conColumna.iva==='medido' && C.conColumna.neto==='medido',
    ex(C, 'IVA='+(C.conColumna||{}).iva+' · neto='+(C.conColumna||{}).neto));
  check('C8 · pero el resultado sigue siendo desconocido, porque debajo hay líneas sin informe',
    C.conColumna && C.conColumna.resultado==='desconocido',
    ex(C, (C.conColumna||{}).resultado+' · una sola línea desconocida basta para que el total no lo sea'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-D · PUBLICIDAD SIN INFORME ES DESCONOCIDO, NUNCA 0 €
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-D · PUBLICIDAD SIN INFORME ES «DESCONOCIDO», NUNCA 0 € ===');
  const D = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),100)], count:1, file:'o'};
    periodDays = 30; countryFilter='ALL';
    const sin = K();
    go('metricas');
    const filaSin = (document.querySelector('#mtCascada [data-linea="publicidad"]')||{}).textContent||'';
    /* Ahora con informe: 30 días de gasto que coinciden con el periodo, 300 €.
       Prorrateo = 30/30 = 1, así que se carga entero y sin suponer nada. */
    DB.imports.searchterm = {count:1, file:'s', rows:[{customersearchterm:'x', campaignname:'c',
      spend:'300', sales:'900', orders:'9', clicks:'10', impressions:'100',
      startdate:dia(29), enddate:dia(0)}]};
    const con = K();
    go('metricas');
    const filaCon = (document.querySelector('#mtCascada [data-linea="publicidad"]')||{}).textContent||'';
    const lSin = lin(sin,'publicidad'), lCon = lin(con,'publicidad');
    return {sin: lSin?{valor:lSin.valor, calidad:lSin.calidad}:null,
            con: lCon?{valor:lCon.valor, calidad:lCon.calidad}:null,
            filaSin, filaCon,
            profitSin: pnl().profit};
  `));
  check('D1 · sin informe de publicidad la línea es «desconocido»',
    D.sin && D.sin.calidad==='desconocido',
    ex(D, D.sin ? 'la línea dice «'+D.sin.calidad+'» con '+D.sin.valor+' €: un cero etiquetado medido o estimado infla el beneficio y parece dato'
                : 'no hay línea «publicidad» en la cascada'));
  check('D2 · y en pantalla se pinta «—», no «€0»',
    typeof D.filaSin==='string' && D.filaSin.indexOf('—')>=0 && !/€\s?0(?!\d)/.test(D.filaSin),
    ex(D, JSON.stringify((D.filaSin||'').replace(/\s+/g,' ').slice(0,90))));
  check('D3 · con el informe cargado deja de ser desconocida y enseña el importe',
    D.con && D.con.calidad!=='desconocido' && near(D.con.valor, -300),
    ex(D, D.con ? D.con.calidad+' · '+D.con.valor.toFixed(2)+' €' : 'sigue sin haber línea'));
  check('D4 · y entonces el importe sí aparece en pantalla',
    typeof D.filaCon==='string' && /300/.test(D.filaCon),
    ex(D, JSON.stringify((D.filaCon||'').replace(/\s+/g,' ').slice(0,90))));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-E · UMBRAL DE 10 UNIDADES
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-E · POR DEBAJO DE 10 UNIDADES NO SE ENSEÑA EL PORCENTAJE ===');
  const E = await page.evaluate(js(`
    if(typeof pctSeguro!=='function') return {__error:'no existe pctSeguro()'};
    /* Dos SKU idénticos salvo en el número de ventas: uno con 9 unidades y otro
       con 10. El margen porcentual de los dos es el mismo; lo único que cambia
       es si la muestra da para enseñarlo. */
    DB.products.push({id:'t2', sku:'POCO', name:'Poco', cogs:5, freight:0, fba:3, referral:15, price:100, channel:'FBA', lots:[]});
    DB.imports.orders = {rows:[venta(dia(5),10,{sku:'TEST-1'}), venta(dia(5),9,{sku:'POCO'})], count:2, file:'o'};
    periodDays = 30; countryFilter='ALL';
    const S = skuStats();
    const g = k => S.filter(x=>x.sku===k)[0] || null;
    go('rentabilidad');
    const celdas = {};
    document.querySelectorAll('#skuTable tr').forEach(tr=>{
      const c = tr.cells; if(!c || c.length<7) return;
      celdas[(c[1].textContent||'').trim().split(/\\s/)[0]] = (c[5].textContent||'').trim();
    });
    return {umbral: umbralUnidades(),
            diez: pctSeguro(38, 100, 10), nueve: pctSeguro(38, 100, 9),
            cero: pctSeguro(0, 0, 0),
            baseCero: pctSeguro(-50, 0, 40),
            skuDiez: g('TEST-1') ? {units:g('TEST-1').units, pctFiable:g('TEST-1').pctFiable} : null,
            skuNueve: g('POCO') ? {units:g('POCO').units, pctFiable:g('POCO').pctFiable} : null,
            celdas};
  `));
  check('E1 · el umbral es de 10 unidades', E.umbral===10, ex(E, E.umbral+' unidades'));
  check('E2 · con 10 unidades el porcentaje se enseña',
    E.diez && E.diez.ok===true && E.diez.texto==='38,0%', ex(E, E.diez && E.diez.texto));
  check('E3 · con 9 no, y se dice por qué en vez de dejar un hueco mudo',
    E.nueve && E.nueve.ok===false && E.nueve.texto==='—' && /10/.test(E.nueve.razon||''),
    ex(E, E.nueve ? E.nueve.texto+' · «'+E.nueve.razon+'»' : 'pctSeguro no devolvió nada'));
  check('E4 · sin ingreso neto sobre el que dividir tampoco se inventa un 0 %',
    E.baseCero && E.baseCero.texto==='—', ex(E, E.baseCero && E.baseCero.texto));
  check('E5 · y el corte por SKU marca cuál tiene muestra y cuál no',
    E.skuDiez && E.skuNueve && E.skuDiez.pctFiable===true && E.skuNueve.pctFiable===false,
    ex(E, 'TEST-1 ('+((E.skuDiez||{}).units)+' ud) = '+((E.skuDiez||{}).pctFiable)+
          ' · POCO ('+((E.skuNueve||{}).units)+' ud) = '+((E.skuNueve||{}).pctFiable)));
  check('E6 · en la tabla de Rentabilidad, el de 9 unidades enseña «—» y el de 10 un porcentaje',
    E.celdas && E.celdas['POCO']==='—' && /%/.test(E.celdas['TEST-1']||''),
    ex(E, 'POCO='+JSON.stringify((E.celdas||{})['POCO'])+' · TEST-1='+JSON.stringify((E.celdas||{})['TEST-1'])+
          ' · con 9 ventas un margen es ruido con forma de dato'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-F · «—» PARA CERO VENTAS, NO «0 %»
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-F · CON CERO VENTAS SE ESCRIBE «—», NO «0 %» ===');
  const F = await page.evaluate(js(`
    /* Sin ninguna venta pero con un gasto fijo cargado: hay pérdida y no hay
       ingreso. «Margen 0 %» diría que vendiste sin margen; la verdad es que no
       vendiste. */
    DB.imports.orders = {rows:[], count:0, file:'o'};
    DB.expenses = [{id:'g1', concept:'Gestoría', amount:300}];
    periodDays = 30; countryFilter='ALL';
    const P = pnl(), k = K();
    go('metricas');
    const kpis = (document.getElementById('mtKpis')||{}).textContent||'';
    go('rentabilidad');
    const rent = (document.getElementById('pnlKpis')||{}).textContent||'';
    return {units:P.units, margin:P.margin, profit:P.profit,
            pct: typeof pctSeguro==='function' ? pctSeguro(P.profit, P.net, P.units) : null,
            kpis, rent, resultado:k.resultado?k.resultado.valor:null};
  `));
  check('F1 · sin ventas, el margen del P&L es null y no 0',
    F.units===0 && F.margin===null,
    ex(F, 'unidades='+F.units+' · margen='+JSON.stringify(F.margin)+' · un 0 % aquí confunde «no vendí» con «vendí sin margen»'));
  check('F2 · el porcentaje seguro devuelve «—» y dice que no hubo ventas',
    F.pct && F.pct.texto==='—' && /sin ventas/.test(F.pct.razon||''),
    ex(F, F.pct ? F.pct.texto+' · «'+F.pct.razon+'»' : 'pctSeguro no devolvió nada'));
  check('F3 · y la pantalla escribe «—» sin colar un «0,0%» por ningún lado',
    typeof F.kpis==='string' && F.kpis.indexOf('—')>=0 && !/\b0,0\s?%/.test(F.kpis),
    ex(F, JSON.stringify((F.kpis||'').replace(/\s+/g,' ').slice(0,110))));
  check('F4 · aunque haya pérdida de verdad detrás', F.profit < 0,
    ex(F, (F.profit==null?'—':F.profit.toFixed(2))+' € de pérdida con cero ventas'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-G · CUADRE DEL CORTE POR SKU
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-G · CUADRE 1/3 · EL DESGLOSE POR SKU SUMA EXACTAMENTE EL TOTAL ===');
  const G = await page.evaluate(js(`
    DB.products = [
      {id:'a', sku:'AAA', name:'A', cogs:4, freight:1, fba:3, referral:15, price:30, channel:'FBA', lots:[]},
      {id:'b', sku:'BBB', name:'B', cogs:9, freight:0, fba:3, referral:12, price:50, channel:'FBA', lots:[]}];
    /* Un tercer SKU que NO está en el catálogo: vende y no tiene coste. Es el
       que más rompe los cuadres, porque su coste vale cero y su margen sale
       inflado. Tiene que seguir sumando. */
    DB.imports.orders = {rows:[
      venta(dia(4),40,{sku:'AAA', precio:30}),
      venta(dia(3),25,{sku:'BBB', precio:50, ch:'Amazon.de', pais:'DE'}),
      venta(dia(2),12,{sku:'HUERFANO', precio:20})], count:3, file:'o'};
    DB.expenses = [{id:'g1', concept:'Gestoría', amount:300}];
    DB.imports.returns = {count:3, rows:devolucion(dia(1),3,{sku:'AAA'}), file:'r'};
    periodDays = 30; countryFilter='ALL';
    const P = pnl();
    const C = (typeof cortePorSku==='function') ? cortePorSku() : null;
    if(!C) return {__error:'no existe cortePorSku()'};
    return {n:C.filas.length,
            rev:C.total.rev, iva:C.total.iva, netRev:C.total.netRev, cogs:C.total.cogs,
            units:C.total.units, profit:C.total.profit,
            recon:C.reconstruido, noImp:C.noImputableTotal,
            ctrl:C.control,
            claves:C.filas.map(f=>f.clave).sort()};
  `));
  check('G1 · están los tres SKU, incluido el que no está en el catálogo',
    G.n===3 && JSON.stringify(G.claves)===JSON.stringify(['AAA','BBB','HUERFANO']),
    ex(G, (G.claves||[]).join(', ')));
  check('G2 · la suma de ventas por SKU es la del P&L',
    near(G.rev, G.ctrl && G.ctrl.rev, 0.005), ex(G, (G.rev||0).toFixed(2)+' € vs '+((G.ctrl||{}).rev||0).toFixed(2)+' €'));
  check('G3 · la suma del IVA imputado por SKU es la del P&L',
    near(G.iva, G.ctrl && G.ctrl.iva, 0.005),
    ex(G, (G.iva||0).toFixed(4)+' € vs '+((G.ctrl||{}).iva||0).toFixed(4)+' € · si no cuadra es que el desglose deduce el IVA de otra manera que el total'));
  check('G4 · y por tanto el ingreso neto por SKU suma el ingreso neto del P&L',
    near(G.netRev, G.ctrl && G.ctrl.netRev, 0.005),
    ex(G, (G.netRev||0).toFixed(2)+' € vs '+((G.ctrl||{}).netRev||0).toFixed(2)+' €'));
  check('G5 · el coste de producto por SKU suma el del P&L',
    near(G.cogs, G.ctrl && G.ctrl.cogs, 0.005), ex(G, (G.cogs||0).toFixed(2)+' € vs '+((G.ctrl||{}).cogs||0).toFixed(2)+' €'));
  check('G6 · las unidades también', near(G.units, G.ctrl && G.ctrl.units, 0.0001),
    ex(G, G.units+' ud vs '+((G.ctrl||{}).units)+' ud'));
  check('G7 · y beneficio por SKU + lo NO imputable reconstruye el beneficio del P&L al céntimo',
    near(G.recon, G.ctrl && G.ctrl.profit, 0.005),
    ex(G, (G.recon||0).toFixed(4)+' € reconstruido vs '+((G.ctrl||{}).profit||0).toFixed(4)+' € del P&L · '+
          'el bloque no imputable vale '+(G.noImp||0).toFixed(2)+' €'));
  check('G8 · y lo no imputable no es cero, o sea que la prueba está mirando algo',
    Math.abs(G.noImp||0) > 0.01,
    ex(G, (G.noImp||0).toFixed(2)+' € entre devoluciones, gastos fijos, IVA no repercutido y reembolsos'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-H · CUADRE DEL CORTE POR PAÍS
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-H · CUADRE 2/3 · EL DESGLOSE POR MERCADO SUMA EXACTAMENTE EL TOTAL ===');
  const H = await page.evaluate(js(`
    /* Tres mercados de la UE, uno de fuera (Reino Unido, que no está en
       COUNTRIES) y un grupo sin canal reconocible. Los dos últimos son los que
       se evaporaban o se colaban sin marca. */
    DB.imports.orders = {rows:[
      venta(dia(4),30,{ch:'Amazon.es', pais:'ES'}),
      venta(dia(4),20,{ch:'Amazon.de', pais:'DE'}),
      venta(dia(4),10,{ch:'Amazon.it', pais:'IT'}),
      venta(dia(4),10,{ch:'Amazon.co.uk', pais:'GB'}),
      venta(dia(4),5, {ch:'', pais:''})], count:5, file:'o'};
    DB.expenses = [{id:'g1', concept:'Gestoría', amount:300}];
    periodDays = 30; countryFilter='ALL';
    const C = (typeof cortePorPais==='function') ? cortePorPais() : null;
    if(!C) return {__error:'no existe cortePorPais()'};
    return {n:C.filas.length, rev:C.total.rev, iva:C.total.iva, netRev:C.total.netRev,
            cogs:C.total.cogs, units:C.total.units, recon:C.reconstruido, ctrl:C.control,
            demas:(C.imputadoDeMas||[]).map(x=>({e:x.etiqueta, v:x.valor})),
            filas:C.filas.map(f=>({k:f.clave, u:f.units, cal:f.calidad, sinPais:!!f.sinPais, cogs:f.cogs}))};
  `));
  (H.filas||[]).forEach(f=>console.log('     '+f.k+' · '+f.u+' ud · '+f.cal+(f.sinPais?' · incluye ventas sin país':'')));
  check('H1 · la suma de ventas por mercado es la del negocio entero',
    near(H.rev, H.ctrl && H.ctrl.rev, 0.005), ex(H, (H.rev||0).toFixed(2)+' € vs '+((H.ctrl||{}).rev||0).toFixed(2)+' €'));
  check('H2 · el IVA por mercado suma el IVA del P&L',
    near(H.iva, H.ctrl && H.ctrl.iva, 0.005),
    ex(H, (H.iva||0).toFixed(4)+' € vs '+((H.ctrl||{}).iva||0).toFixed(4)+' €'));
  check('H3 · el ingreso neto por mercado suma el ingreso neto del P&L',
    near(H.netRev, H.ctrl && H.ctrl.netRev, 0.005),
    ex(H, (H.netRev||0).toFixed(2)+' € vs '+((H.ctrl||{}).netRev||0).toFixed(2)+' € · '+
          'con la columna de impuesto ausente, restar «rev − tax en crudo» devuelve el ingreso CON IVA'));
  check('H4 · el coste de producto por mercado suma el del P&L, incluido el de las ventas sin país',
    near(H.cogs, H.ctrl && H.ctrl.cogs, 0.005),
    ex(H, (H.cogs||0).toFixed(2)+' € vs '+((H.ctrl||{}).cogs||0).toFixed(2)+' € · '+
          '`costOfSales().byCountry` no indexa las filas sin país, así que ese coste se pierde si no se le devuelve a su grupo'));
  check('H5 · las unidades cuadran', near(H.units, H.ctrl && H.ctrl.units, 0.0001),
    ex(H, H.units+' ud vs '+((H.ctrl||{}).units)+' ud'));
  /* Esta tabla resta de cada mercado el coste de tener el IVA dado de alta allí
     (la gestoría de `DB.compliance`), que la cuenta de resultados no tiene en
     ninguna línea. Con tres mercados activos a 1.500 €/año y 30 días de
     periodo son 3 × 1.500 × 30/365 = 369,86 € de diferencia. No es un
     descuadre: son dos preguntas distintas. Lo que no puede ser es que la
     diferencia sea invisible, así que tiene que venir DECLARADA y con su
     importe, y con ella la identidad cierra al céntimo. */
  check('H6 · la diferencia con el P&L viene declarada, no escondida',
    Array.isArray(H.demas) && H.demas.length===1 && near(H.demas[0].v, 369.86, 0.02),
    ex(H, (H.demas||[]).map(x=>x.e+' = '+x.v.toFixed(2)+' €').join(' · ') ||
          'la tabla por mercado resta un coste de cumplimiento que el P&L no tiene y no lo declara en ninguna parte'));
  check('H7 · y contándola, beneficio por mercado + no imputable reconstruye el del P&L al céntimo',
    near(H.recon, H.ctrl && H.ctrl.profit, 0.005),
    ex(H, (H.recon||0).toFixed(4)+' € vs '+((H.ctrl||{}).profit||0).toFixed(4)+' €'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-I · CUADRE DEL CORTE POR MES
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-I · CUADRE 3/3 · EL DESGLOSE POR MES SUMA EXACTAMENTE EL TOTAL ===');
  const I = await page.evaluate(js(`
    /* Ventas repartidas en cuatro meses hacia atrás, mirando «Todo». */
    DB.imports.orders = {rows:[
      venta(dia(5),10), venta(dia(40),20), venta(dia(75),30), venta(dia(110),40)], count:4, file:'o'};
    DB.expenses = [{id:'g1', concept:'Gestoría', amount:300}];
    periodDays = 0; countryFilter='ALL';
    const C = (typeof cortePorMes==='function') ? cortePorMes() : null;
    if(!C) return {__error:'no existe cortePorMes()'};
    return {n:C.filas.length, rev:C.total.rev, iva:C.total.iva, netRev:C.total.netRev,
            cogs:C.total.cogs, units:C.total.units, recon:C.reconstruido, ctrl:C.control,
            meses:C.filas.map(f=>f.clave),
            ordenados: C.filas.map(f=>f.clave).join(',')===C.filas.map(f=>f.clave).sort().join(',')};
  `));
  check('I1 · hay un corte por cada mes con ventas', I.n>=3, ex(I, (I.meses||[]).join(' · ')));
  check('I2 · y salen en orden', I.ordenados===true, ex(I, (I.meses||[]).join(' · ')));
  check('I3 · la suma de ventas por mes es la del P&L',
    near(I.rev, I.ctrl && I.ctrl.rev, 0.005), ex(I, (I.rev||0).toFixed(2)+' € vs '+((I.ctrl||{}).rev||0).toFixed(2)+' €'));
  check('I4 · el IVA por mes suma el IVA del P&L',
    near(I.iva, I.ctrl && I.ctrl.iva, 0.005), ex(I, (I.iva||0).toFixed(4)+' € vs '+((I.ctrl||{}).iva||0).toFixed(4)+' €'));
  check('I5 · el ingreso neto por mes suma el del P&L',
    near(I.netRev, I.ctrl && I.ctrl.netRev, 0.005), ex(I, (I.netRev||0).toFixed(2)+' € vs '+((I.ctrl||{}).netRev||0).toFixed(2)+' €'));
  check('I6 · el coste por mes suma el del P&L, con el mismo libro de lotes',
    near(I.cogs, I.ctrl && I.ctrl.cogs, 0.005), ex(I, (I.cogs||0).toFixed(2)+' € vs '+((I.ctrl||{}).cogs||0).toFixed(2)+' €'));
  check('I7 · las unidades cuadran', near(I.units, I.ctrl && I.ctrl.units, 0.0001),
    ex(I, I.units+' ud vs '+((I.ctrl||{}).units)+' ud'));
  check('I8 · y beneficio por mes + lo no imputable reconstruye el del P&L',
    near(I.recon, I.ctrl && I.ctrl.profit, 0.005),
    ex(I, (I.recon||0).toFixed(4)+' € vs '+((I.ctrl||{}).profit||0).toFixed(4)+' €'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-J · LA FRONTERA DE COMPACTACIÓN DEL HISTÓRICO (M0)
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-J · UN CORTE QUE CRUZA LA COMPACTACIÓN NO ES COMPARABLE, Y SE DICE ===');
  const J = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),10), venta(dia(75),30), venta(dia(110),40)], count:3, file:'o'};
    periodDays = 0; countryFilter='ALL';
    /* Sin compactación no hay frontera que avisar. */
    DB.history = {v:1, d:{}, m:{}, log:[], obs:{}, cut:null, bk:{last:null}};
    const sinCut = (typeof cortePorMes==='function') ? cortePorMes() : null;
    const fSin = (typeof fronteraM0==='function') ? fronteraM0(periodStart()) : null;
    /* Ahora sí: el histórico está compactado hasta hace 90 días. */
    const corte = dia(90);
    DB.history.cut = corte;
    const conCut = cortePorMes();
    const fCon = fronteraM0(periodStart());
    go('metricas');
    const banner = (document.getElementById('mtFrontera')||{}).textContent||'';
    const tabla = (document.getElementById('mtMes')||{}).textContent||'';
    return {corte,
            sinCut: sinCut ? {cruza:!!(sinCut.frontera||{}).cruza,
                              marcados:sinCut.filas.filter(f=>f.compactado).length} : null,
            conCut: conCut ? {cruza:!!(conCut.frontera||{}).cruza,
                              marcados:conCut.filas.filter(f=>f.compactado).length,
                              meses:conCut.filas.map(f=>f.clave+(f.compactado?'*':''))} : null,
            fSin: fSin ? {cut:fSin.cut, cruza:fSin.cruza} : null,
            fCon: fCon ? {cut:fCon.cut, cruza:fCon.cruza} : null,
            banner, tablaTieneMarca:/compactado/.test(tabla)};
  `));
  console.log('     meses del corte: ' + ((J.conCut||{}).meses||[]).join(' · ') + '   (* = compactado)');
  check('J1 · sin compactación no se avisa de nada',
    J.sinCut && J.sinCut.cruza===false && J.sinCut.marcados===0 && J.fSin && J.fSin.cut===null,
    ex(J, 'cruza='+((J.sinCut||{}).cruza)+' · meses marcados='+((J.sinCut||{}).marcados)));
  check('J2 · con el histórico compactado, `fronteraM0()` lo detecta',
    J.fCon && J.fCon.cut===J.corte && J.fCon.cruza===true,
    ex(J, 'cut='+((J.fCon||{}).cut)+' · cruza='+((J.fCon||{}).cruza)+' · esperaba '+J.corte));
  check('J3 · y el corte por mes marca los meses anteriores a la frontera',
    J.conCut && J.conCut.cruza===true && J.conCut.marcados>0,
    ex(J, 'marcados '+((J.conCut||{}).marcados)+' de '+(((J.conCut||{}).meses)||[]).length+
          ' · los meses compactados ya no tienen detalle diario y no son comparables con los de al lado'));
  check('J4 · no los marca todos: los posteriores a la frontera sí son comparables',
    J.conCut && J.conCut.marcados < (((J.conCut||{}).meses)||[]).length,
    ex(J, ((J.conCut||{}).meses||[]).join(' · ')));
  check('J5 · y la pantalla lo dice con la fecha, no en silencio',
    typeof J.banner==='string' && J.banner.indexOf(J.corte)>=0 && /compact/i.test(J.banner),
    ex(J, JSON.stringify((J.banner||'').replace(/\s+/g,' ').slice(0,130)) || 'el aviso de frontera está vacío'));
  check('J6 · y la tabla marca cada mes afectado, no solo el conjunto',
    J.tablaTieneMarca===true,
    ex(J, J.tablaTieneMarca ? 'la tabla marca los meses compactados uno a uno'
                            : 'la tabla de meses NO lleva la marca «compactado»: el aviso general no dice CUÁL de los meses no es comparable'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-K · «BENEFICIO» SOLO DONDE HAY GASTOS FIJOS
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-K · SIN GASTOS FIJOS NO ES «BENEFICIO», ES «MARGEN DE CONTRIBUCIÓN» ===');
  const Kt = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),100)], count:1, file:'o'};
    periodDays = 30; countryFilter='ALL';
    DB.expenses = [];
    const sin = K();
    /* Los RÓTULOS de cada fila, no el texto entero de la tabla. El aviso al pie
       usa la palabra «beneficio» a propósito —«esto no es un beneficio»—, que
       es justo lo que la regla pide que diga. Lo que no puede existir es una
       LÍNEA de la cuenta de resultados que se llame así. */
    const rotulos = () => [...document.querySelectorAll('#pnlTable tr[data-linea]')]
      .map(tr=>String((((tr.cells[0]||{}).firstChild)||{}).textContent||'').trim());
    go('rentabilidad'); const rentSin = rotulos();
    go('metricas');     const mtSin  = (document.getElementById('mtKpis')||{}).textContent||'';
    const vereSin = (document.getElementById('mtVeredicto')||{}).textContent||'';
    DB.expenses = [{id:'g1', concept:'Gestoría', amount:300}];
    const con = K();
    go('rentabilidad'); const rentCon = rotulos();
    return {sin:{etiqueta:sin.etiquetaResultado, id:(sin.resultado||{}).id, hayFijos:sin.hayFijos},
            con:{etiqueta:con.etiquetaResultado, id:(con.resultado||{}).id, hayFijos:con.hayFijos,
                 fijos:(lin(con,'fijos')||{}).valor, calFijos:(lin(con,'fijos')||{}).calidad},
            calFijosSin:(lin(sin,'fijos')||{}).calidad,
            rentSin, rentCon, mtSin, vereSin};
  `));
  check('K1 · sin gastos fijos cargados, la línea de abajo se llama «Margen de contribución»',
    Kt.sin && Kt.sin.etiqueta==='Margen de contribución' && Kt.sin.id==='contribucion',
    ex(Kt, 'se llama «'+((Kt.sin||{}).etiqueta)+'» · llamarlo beneficio hace creer que el negocio gana eso'));
  check('K2 · y ninguna LÍNEA de la cuenta de resultados se llama «Beneficio»',
    Array.isArray(Kt.rentSin) && Kt.rentSin.length>0 && !Kt.rentSin.some(t=>/^Beneficio/i.test(t)),
    ex(Kt, (Kt.rentSin||[]).filter(t=>/[Bb]eneficio/.test(t)).join(' · ') ||
           'ninguna · la de abajo se llama «'+((Kt.rentSin||[]).slice(-1)[0]||'?')+'»'));
  check('K3 · la pantalla lo explica con esas palabras exactas',
    typeof Kt.vereSin==='string' && /margen de contribuci/i.test(Kt.vereSin) && /gasto fijo/i.test(Kt.vereSin),
    ex(Kt, JSON.stringify((Kt.vereSin||'').replace(/\s+/g,' ').slice(0,130))));
  check('K4 · y esa línea de gastos fijos vale «desconocido», no un cero medido',
    Kt.calFijosSin==='desconocido',
    ex(Kt, 'dice «'+Kt.calFijosSin+'»: sin gastos cargados, ese 0 € no es que no tengas gastos'));
  check('K5 · con gastos fijos cargados sí se llama «Beneficio neto»',
    Kt.con && Kt.con.etiqueta==='Beneficio neto' && Kt.con.id==='beneficio',
    ex(Kt, 'se llama «'+((Kt.con||{}).etiqueta)+'»'));
  check('K6 · y entonces sí hay una línea «Beneficio neto» en la cuenta de resultados',
    Array.isArray(Kt.rentCon) && Kt.rentCon.some(t=>/^Beneficio neto/.test(t)),
    ex(Kt, (Kt.rentCon||[]).slice(-2).join(' · ') || 'la tabla no trae rótulos'));
  check('K7 · con 300 €/mes y un periodo de 30 días, la línea vale 300 €',
    near(Kt.con && Kt.con.fijos, -300), ex(Kt, ((Kt.con||{}).fijos||0).toFixed(2)+' €'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-L · HALLAZGO A2 · LAS VENTAS SIN PAÍS
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-L · A2 · EL GRUPO SIN PAÍS NI DEDUCE IVA NI SE PINTABA MARCADO ===');
  const L = await page.evaluate(js(`
    /* 10 ud × 100 € por un canal que el hub no reconoce = 1.000 € de ingreso
       sin país. Su IVA no se puede deducir (no se sabe de qué país es) y su
       coste de producto son 5 × 10 = 50 €, que antes no llegaban a la fila. */
    DB.imports.orders = {rows:[venta(dia(5),10,{ch:'Non-Amazon', pais:''})], count:1, file:'o'};
    periodDays = 30; countryFilter='ALL';
    const P = pnl(), CS = countryStats();
    const otros = CS.filter(x=>x.units>0)[0] || null;
    go('panel');
    const html = (document.getElementById('panelCountries')||{}).innerHTML||'';
    const nota = (document.getElementById('panelCountriesNote')||{}).textContent||'';
    const tb = P.taxBasis||{};
    return {revBlind:tb.revBlind, quality:P.baseQuality, cogsTotal:P.cogs,
            fila: otros ? {code:otros.c.code, units:otros.units, rev:otros.rev, iva:otros.iva,
                           netRev:otros.netRev, cogs:otros.cogs, calidad:otros.calidad,
                           sinPais:!!otros.sinPais, margin:otros.margin} : null,
            marcaEnTabla:/desconocido/.test(html), nota,
            porPais: tb.porPais ? Object.keys(tb.porPais) : null};
  `));
  check('L1 · el ingreso sin país sigue siendo ciego para el IVA: 1.000 € no deducibles',
    near(L.revBlind, 1000) && L.quality==='desconocida',
    ex(L, 'revBlind='+L.revBlind+' · calidad de la base='+L.quality));
  check('L2 · y el reparto del IVA le reserva su propio grupo «??»',
    Array.isArray(L.porPais) && L.porPais.indexOf('??')>=0,
    ex(L, 'grupos: '+(L.porPais||[]).join(', ')+' · sin grupo propio, esas ventas no se pueden marcar'));
  check('L3 · la fila lleva ahora su coste de producto imputado (5 € × 10 ud = 50 €)',
    L.fila && near(L.fila.cogs, 50),
    ex(L, L.fila ? L.fila.cogs.toFixed(2)+' € de coste en la fila, '+ (L.cogsTotal||0).toFixed(2)+' € en el P&L · '+
        '`costOfSales().byCountry` no indexa las filas sin país, así que valía 0 € y el margen salía altísimo'
      : 'no hay fila de mercado con unidades'));
  check('L4 · la fila va marcada como «desconocido», no en verde y sin nada',
    L.fila && L.fila.calidad==='desconocido' && L.fila.sinPais===true,
    ex(L, L.fila ? 'calidad='+L.fila.calidad+' · sinPais='+L.fila.sinPais : 'no hay fila'));
  check('L5 · y la marca llega a la pantalla, que es donde se decide',
    L.marcaEnTabla===true,
    ex(L, 'la tabla de mercados del Panel no pinta la procedencia de cada fila'));
  check('L6 · con una nota que explica por qué su margen sale más alto del real',
    typeof L.nota==='string' && /IVA/.test(L.nota) && /sin país|no se reconoce/i.test(L.nota),
    ex(L, JSON.stringify((L.nota||'').replace(/\s+/g,' ').slice(0,130)) || 'no hay nota'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-M · HALLAZGO E2 · TASA DE DEVOLUCIONES POR ENCIMA DEL 100 %
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-M · E2 · UNA TASA DE DEVOLUCIONES DEL 150 % SE EXPLICA, NO SE IMPRIME A SECAS ===');
  const M = await page.evaluate(js(`
    /* 20 unidades vendidas en el periodo y 30 devoluciones fechadas dentro de
       él, que vienen de ventas anteriores: 30/20 = 150,0 %. Es un dato REAL y
       por eso no se recorta; lo que no puede es aparecer desnudo. */
    DB.imports.orders = {rows:[venta(dia(5),20)], count:1, file:'o'};
    DB.imports.returns = {count:30, rows:devolucion(dia(3),30), file:'r'};
    periodDays = 30; countryFilter='ALL';
    const P = pnl();
    go('panel');
    const kpis = (document.getElementById('panelKpis')||{}).textContent||'';
    /* Y el caso de al lado: SIN informe de devoluciones. */
    delete DB.imports.returns;
    const sin = pnl();
    go('panel');
    const kpisSin = (document.getElementById('panelKpis')||{}).textContent||'';
    return {rate:P.retRate, excede:P.retRateExcede, cal:P.retRateCalidad,
            retUnits:P.retUnits, units:P.units, kpis,
            sin:{rate:sin.retRate, cal:sin.retRateCalidad, hay:sin.hayDevoluciones}, kpisSin};
  `));
  check('M1 · la tasa es del 150 % y el motor lo sabe',
    near(M.rate, 150, 0.05) && M.excede===true,
    ex(M, (M.rate==null?'—':M.rate.toFixed(1))+' % · marcada como excedida: '+M.excede+
          ' ('+M.retUnits+' devoluciones sobre '+M.units+' ud vendidas)'));
  check('M2 · y la pantalla la explica en la misma frase, no la deja desnuda',
    typeof M.kpis==='string' && /150,0%/.test(M.kpis) && /anterior/i.test(M.kpis),
    ex(M, JSON.stringify((M.kpis||'').replace(/\s+/g,' ').slice(0,150))+
          ' · un 150 % sin explicación parece que devuelves más de lo que vendes'));
  check('M3 · sin informe de devoluciones la tasa NO es 0 %: es desconocida',
    M.sin && M.sin.cal==='desconocido' && M.sin.hay===false,
    ex(M, 'calidad='+((M.sin||{}).cal)+' · un 0 % ahí hace creer que no te devuelven nada'));
  check('M4 · y en pantalla se escribe «—», no «0,0%»',
    typeof M.kpisSin==='string' && /devoluciones —/.test(M.kpisSin),
    ex(M, JSON.stringify((M.kpisSin||'').replace(/\s+/g,' ').slice(0,150))));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-N · HALLAZGO E4 · TASA Y COSTE DE DEVOLUCIONES, COHERENTES
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-N · E4 · CON FILTRO DE PAÍS, LA TASA Y EL COSTE DE DEVOLUCIONES CUENTAN LO MISMO ===');
  const N = await page.evaluate(js(`
    /* El mismo SKU vendido 10 ud en España y 10 en Alemania, y 4 devoluciones
       que el informe trae SIN país. La cuota de España es 10/20 = 0,5, así que
       al coste se le imputan 4 × 0,5 = 2 unidades.
       Antes: la tasa dividía las 4 brutas entre las 10 de España = 40,0 %,
       mientras el coste cobraba 2, o sea un 20,0 %. Dos respuestas a la misma
       pregunta en la misma pantalla. */
    DB.imports.orders = {rows:[venta(dia(5),10,{ch:'Amazon.es', pais:'ES'}),
                               venta(dia(5),10,{ch:'Amazon.de', pais:'DE'})], count:2, file:'o'};
    DB.imports.returns = {count:4, rows:devolucion(dia(3),4), file:'r'};
    periodDays = 30;
    countryFilter='ALL'; const all = pnl();
    countryFilter='ES';  const es  = pnl();
    countryFilter='ALL';
    const coherente = p => p.units>0 ? p.retImputadas/p.units*100 : null;
    return {all:{rate:all.retRate, imput:all.retImputadas, units:all.units, cal:all.retRateCalidad,
                 implicita:coherente(all)},
            es:{rate:es.retRate, imput:es.retImputadas, units:es.units, cal:es.retRateCalidad,
                implicita:coherente(es), coste:es.returnsCost}};
  `));
  check('N1 · sin filtro, la tasa es el 20 % y coincide con lo que cobra el coste',
    near(N.all && N.all.rate, 20, 0.05) && near(N.all && N.all.rate, N.all && N.all.implicita, 0.005),
    ex(N, 'tasa='+((N.all||{}).rate||0).toFixed(1)+' % · imputadas '+((N.all||{}).imput)+' de '+((N.all||{}).units)+' ud'));
  check('N2 · con el filtro en España, la tasa cuenta las MISMAS unidades que el coste',
    near(N.es && N.es.rate, N.es && N.es.implicita, 0.005),
    ex(N, 'tasa='+((N.es||{}).rate==null?'—':(N.es.rate).toFixed(1))+' % · el coste imputa '+
          ((N.es||{}).imput)+' ud de '+((N.es||{}).units)+', que son el '+
          (((N.es||{}).implicita)||0).toFixed(1)+' % · antes la tasa decía 40,0 % y el coste el 20,0 %'));
  check('N3 · o sea, el 20 % y no el 40 %',
    near(N.es && N.es.rate, 20, 0.05),
    ex(N, ((N.es||{}).rate==null?'—':(N.es.rate).toFixed(1))+' %'));
  check('N4 · y esa tasa va etiquetada «estimado», porque es un reparto y no una medición',
    N.es && N.es.cal==='estimado',
    ex(N, 'dice «'+((N.es||{}).cal)+'» · el informe de devoluciones no trae país: repartir es suponer'));
  check('N5 · el coste de devoluciones del mercado filtrado no es cero, o sea que hay algo que comparar',
    Math.abs((N.es||{}).coste||0) > 0.01, ex(N, (((N.es||{}).coste)||0).toFixed(2)+' €'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-O · EL IVA DEL DESGLOSE ES EL DEL TOTAL, TAMBIÉN SIN COLUMNA
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-O · EL INGRESO NETO POR SKU NO PUEDE SER EL INGRESO CON IVA ===');
  const O = await page.evaluate(js(`
    /* El informe no trae columna de impuesto. El P&L deduce el 21 % español;
       el desglose por SKU hacía «ingreso − columna en crudo», o sea «ingreso −
       0», y devolvía el ingreso CON IVA como si fuera neto.
       10.000 € de ingreso · IVA deducido 1.735,54 € · neto 8.264,46 €. */
    DB.imports.orders = {rows:[venta(dia(5),100)], count:1, file:'o'};
    periodDays = 30; countryFilter='ALL';
    const P = pnl(), S = skuStats();
    const r = S[0] || null;
    return {pnlNet:P.net, pnlTax:P.tax, gross:P.grossInc,
            sku: r ? {netRev:r.netRev, iva:r.iva, cal:r.ivaCalidad, margin:r.margin} : null};
  `));
  check('O1 · el P&L deduce 1.735,54 € de IVA sobre 10.000 € de ingreso',
    near(O.pnlTax, 1735.54) && near(O.pnlNet, 8264.46),
    ex(O, 'IVA '+((O.pnlTax||0).toFixed(2))+' € · neto '+((O.pnlNet||0).toFixed(2))+' €'));
  check('O2 · y el SKU imputa exactamente ese mismo IVA, no cero',
    O.sku && near(O.sku.iva, O.pnlTax, 0.005),
    ex(O, O.sku ? O.sku.iva.toFixed(2)+' € imputados al SKU frente a '+((O.pnlTax||0).toFixed(2))+' € del P&L'
                : 'no hay fila de SKU'));
  check('O3 · así que su ingreso neto es 8.264,46 € y no los 10.000 € con IVA',
    O.sku && near(O.sku.netRev, 8264.46),
    ex(O, O.sku ? O.sku.netRev.toFixed(2)+' € · con el fallo salían '+((O.gross||0).toFixed(2))+' €, '+
        'y el margen por SKU quedaba inflado en todo el IVA del periodo' : 'no hay fila de SKU'));
  check('O4 · y el SKU declara que ese IVA está DEDUCIDO, no leído',
    O.sku && O.sku.cal==='estimado',
    ex(O, O.sku ? 'dice «'+O.sku.cal+'»' : 'no hay fila de SKU'));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-P · LA PANTALLA, EN SUS TRES ESTADOS
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-P · LA PANTALLA AGUANTA VACÍA, A MEDIAS Y COMPLETA ===');
  const P1 = await page.evaluate(js(`
    DB = blankDB(); DB.imports = {}; periodDays = 30; countryFilter='ALL';
    refreshAll(); go('metricas');
    const sec = document.getElementById('view-metricas');
    return {activa: !!(sec && sec.classList.contains('active')),
            casc: (document.getElementById('mtCascada')||{}).innerHTML.length,
            sku:  (document.getElementById('mtSku')||{}).textContent||'',
            kpis: (document.getElementById('mtKpis')||{}).textContent||''};
  `));
  check('P1 · vacía · la vista se abre y pinta la cascada igualmente',
    P1.activa===true && P1.casc>200, ex(P1, 'activa='+P1.activa+' · '+P1.casc+' bytes de cascada'));
  check('P2 · vacía · el corte por SKU dice que no hay datos en vez de quedarse en blanco',
    typeof P1.sku==='string' && /Sin ventas|Importa/.test(P1.sku),
    ex(P1, JSON.stringify((P1.sku||'').replace(/\s+/g,' ').slice(0,90))));
  check('P3 · vacía · y no se cuela ningún «0,0%» donde debería haber «—»',
    typeof P1.kpis==='string' && !/\b0,0\s?%/.test(P1.kpis) && P1.kpis.indexOf('—')>=0,
    ex(P1, JSON.stringify((P1.kpis||'').replace(/\s+/g,' ').slice(0,110))));

  const P2 = await page.evaluate(js(`
    /* A medias: solo el informe de pedidos. Es el estado real de casi todo el
       mundo el primer día. */
    DB.imports.orders = {rows:[venta(dia(5),100), venta(dia(20),50,{ch:'Amazon.de', pais:'DE'})], count:2, file:'o'};
    refreshAll(); go('metricas');
    const k = K();
    return {desconocidas:k.cuenta ? k.cuenta.desconocido : null,
            faltan: (k.faltan||[]).map(f=>f.linea),
            vered:(document.getElementById('mtVeredicto')||{}).textContent||'',
            mes:(document.getElementById('mtMes')||{}).textContent||'',
            pais:(document.getElementById('mtPais')||{}).textContent||''};
  `));
  check('P4 · a medias · la cascada cuenta las líneas que no puede saber',
    P2.desconocidas>0, ex(P2, P2.desconocidas+' líneas desconocidas'));
  check('P5 · a medias · y dice QUÉ informe cerraría cada hueco, no solo que falta algo',
    Array.isArray(P2.faltan) && P2.faltan.length>0 && /informe/i.test(P2.vered||''),
    ex(P2, (P2.faltan||[]).join(', ')));
  check('P6 · a medias · los cortes por mercado y por mes se pintan con datos',
    /ES/.test(P2.pais||'') && /DE/.test(P2.pais||'') && /\d{4}-\d{2}/.test(P2.mes||''),
    ex(P2, 'mercados: '+String(P2.pais||'').replace(/\s+/g,' ').slice(0,60)));

  const P3 = await page.evaluate(js(`
    /* Completa: con los informes que hacen falta para que ninguna línea quede
       desconocida. */
    loadDemo();
    refreshAll(); go('metricas');
    const k = K();
    return {lineas:(k.lineas||[]).length, calidad:k.calidad,
            cuenta:k.cuenta, suma:k.suma, profit:pnl().profit,
            casc:(document.getElementById('mtCascada')||{}).innerHTML.length,
            noImp:(document.getElementById('mtNoImputable')||{}).textContent||''};
  `));
  check('P7 · completa · la cascada tiene sus dieciséis líneas más el resultado',
    P3.lineas>=16, ex(P3, P3.lineas+' líneas'));
  check('P8 · completa · y sigue sumando el beneficio del P&L al céntimo',
    near(P3.suma, P3.profit, 0.005),
    ex(P3, (P3.suma==null?'—':P3.suma.toFixed(4))+' € vs '+(P3.profit==null?'—':P3.profit.toFixed(4))+' €'));
  /* INTEGRACIÓN · eran cuatro conceptos y ahora son dos, y no es que se hayan
     escondido: las devoluciones y el IVA no repercutido SÍ bajan a cada SKU
     desde la entrega del 6-sep, así que ya no son «no imputables». Contarlos
     aquí además los restaba dos veces y el beneficio reconstruido salía por
     debajo del P&L, que es justo lo que G7 vigila. Lo que esta comprobación
     protege —que el bloque exista, esté etiquetado y diga por qué no se puede
     repartir— sigue igual de estricto. */
  check('P9 · completa · el bloque de lo no imputable se pinta con sus conceptos y su porqué',
    typeof P3.noImp==='string' && /Gastos fijos/.test(P3.noImp) && /Reembolsos/.test(P3.noImp) &&
    /no se puede repartir/i.test(P3.noImp) &&
    !/Devoluciones/.test(P3.noImp) && !/IVA no repercutido/.test(P3.noImp),
    ex(P3, JSON.stringify((P3.noImp||'').replace(/\s+/g,' ').slice(0,110))));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-Q · LA SALIDA
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-Q · LA CASCADA SE PUEDE SACAR, CON SUS ETIQUETAS DENTRO ===');
  const Q = await page.evaluate(()=>{
    const realBlob = window.Blob, realCreate = URL.createObjectURL;
    const realClick = HTMLAnchorElement.prototype.click;
    let ultimo = '';
    window.Blob = function(p,o){ ultimo = p.join(''); return new realBlob(p,o); };
    URL.createObjectURL = () => 'blob:falso';
    HTMLAnchorElement.prototype.click = function(){};
    let error = null;
    try{ exportarCascada(); }catch(e){ error = String(e.message||e); }
    window.Blob = realBlob; URL.createObjectURL = realCreate;
    HTMLAnchorElement.prototype.click = realClick;
    const lineas = ultimo.replace(/^﻿/,'').split('\r\n');
    const boton = [...document.querySelectorAll('#view-metricas button')]
      .filter(b=>/Descargar la cascada/.test(b.textContent)).length;
    return {error, cab:lineas[0]||'', filas:lineas.length-1,
            muestra:lineas[1]||'', texto:ultimo, boton,
            registrada: typeof window.exportar_cascada === 'function'};
  });
  check('Q1 · el botón está en la pantalla', Q.boton===1, Q.boton+' botones');
  check('Q2 · y también registrado en Datos › Salida por la costura', Q.registrada===true,
    Q.registrada ? 'exportar_cascada' : 'registrarExportacion no lo ha enganchado');
  check('Q3 · produce un CSV con filas de verdad', !Q.error && Q.filas>=16,
    Q.error || (Q.filas+' filas · '+Q.cab.slice(0,60)));
  check('Q4 · que lleva la etiqueta de calidad de cada línea, que es lo que hace útil el fichero',
    /Calidad/.test(Q.cab||'') && /(medido|estimado|desconocido)/.test(Q.texto||''),
    (Q.cab||'').slice(0,70));

  /* ═══════════════════════════════════════════════════════════════════════
     M12-R · REVISIÓN ADVERSARIAL PROPIA · dos entradas reales que daban una
     cifra plausible y equivocada, encontradas al repasar el módulo escrito.
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== M12-R · EL IVA DE UN MES ES EL DE SUS VENTAS, NO EL PROMEDIO DEL SKU ===');
  const R = await page.evaluate(js(`
    /* El MISMO SKU vendido en dos meses y en dos países: 100 ud a 100 € en
       España (21 %) y 100 ud a 100 € en Alemania (19 %), en meses distintos.
         mes de España   IVA = 10.000 − 10.000/1,21 = 1.735,54 €
         mes de Alemania IVA = 10.000 − 10.000/1,19 = 1.596,64 €
       Repartir el IVA del SKU entre sus meses por ingreso daría 1.666,09 € a
       cada uno: el total cuadraría y los dos meses estarían mal, que es la peor
       de las dos maneras de fallar, porque nada chirría. */
    DB.imports.orders = {rows:[
      venta(dia(5),100,{ch:'Amazon.es', pais:'ES'}),
      venta(dia(40),100,{ch:'Amazon.de', pais:'DE'})], count:2, file:'o'};
    periodDays = 0; countryFilter='ALL';
    const P = pnl();
    const C = cortePorMes();
    const mkES = dia(5).slice(0,7), mkDE = dia(40).slice(0,7);
    const fila = k => C.filas.filter(f=>f.clave===k)[0] || null;
    return {mkES, mkDE, distintos: mkES!==mkDE,
            es: fila(mkES) ? fila(mkES).iva : null,
            de: fila(mkDE) ? fila(mkDE).iva : null,
            total:C.total.iva, ctrl:P.tax};
  `));
  check('R1 · los dos meses son distintos, que es lo que hace útil el caso',
    R.distintos===true, ex(R, R.mkDE+' → '+R.mkES));
  check('R2 · el mes de España lleva SU IVA al 21 %: 1.735,54 €',
    near(R.es, 1735.54, 0.02),
    ex(R, (R.es==null?'—':R.es.toFixed(2))+' € · prorrateando por ingreso saldrían 1.666,09 €'));
  check('R3 · y el de Alemania el suyo al 19 %: 1.596,64 €',
    near(R.de, 1596.64, 0.02),
    ex(R, (R.de==null?'—':R.de.toFixed(2))+' € · prorrateando por ingreso saldrían 1.666,09 €'));
  check('R4 · con lo que los dos meses NO son iguales, que es la señal de que no se prorratea',
    R.es!=null && R.de!=null && Math.abs(R.es-R.de) > 100,
    ex(R, 'se diferencian en '+(R.es!=null&&R.de!=null ? Math.abs(R.es-R.de).toFixed(2) : '—')+' €'));
  check('R5 · y aun así el total sigue cuadrando con el P&L',
    near(R.total, R.ctrl, 0.005),
    ex(R, (R.total||0).toFixed(4)+' € vs '+(R.ctrl||0).toFixed(4)+' €'));

  console.log('\n=== M12-S · EL MARGEN DEL TITULAR TAMBIÉN NECESITA MUESTRA ===');
  const Sm = await page.evaluate(js(`
    /* Es el número que más se mira del hub. Con nueve ventas, un «38 %» no es
       el margen del negocio: es lo que dieron nueve ventas. */
    const leer = id => { const e=[...document.querySelectorAll('#'+id+' .kpi')]
      .filter(k=>/Margen neto/.test((k.querySelector('.k-name')||{}).textContent||''))[0];
      return e ? {val:(e.querySelector('.k-val')||{}).textContent||'',
                  sub:(e.querySelector('.k-sub')||{}).textContent||''} : null; };
    DB.imports.orders = {rows:[venta(dia(5),9)], count:1, file:'o'};
    periodDays = 30; countryFilter='ALL';
    refreshAll();
    go('panel');        const panelPoco = leer('panelKpis');
    go('rentabilidad'); const rentPoco  = leer('pnlKpis');
    DB.imports.orders = {rows:[venta(dia(5),10)], count:1, file:'o'};
    refreshAll();
    go('panel');        const panelBien = leer('panelKpis');
    go('rentabilidad'); const rentBien  = leer('pnlKpis');
    return {panelPoco, rentPoco, panelBien, rentBien};
  `));
  check('S1 · con 9 unidades, el Panel escribe «—» en el margen neto',
    Sm.panelPoco && Sm.panelPoco.val.trim()==='—' && /9 ud/.test(Sm.panelPoco.sub||''),
    ex(Sm, Sm.panelPoco ? JSON.stringify(Sm.panelPoco.val)+' · «'+Sm.panelPoco.sub+'»' : 'no hay KPI de margen neto en el Panel'));
  check('S2 · y Rentabilidad dice lo mismo, no otra cosa',
    Sm.rentPoco && Sm.rentPoco.val.trim()==='—',
    ex(Sm, Sm.rentPoco ? JSON.stringify(Sm.rentPoco.val)+' · «'+Sm.rentPoco.sub+'»' : 'no hay KPI de margen neto en Rentabilidad'));
  check('S3 · con 10 unidades sí se enseña, en las dos pantallas',
    Sm.panelBien && Sm.rentBien && /%/.test(Sm.panelBien.val) && /%/.test(Sm.rentBien.val),
    ex(Sm, 'Panel='+JSON.stringify((Sm.panelBien||{}).val)+' · Rentabilidad='+JSON.stringify((Sm.rentBien||{}).val)));
  check('S4 · y las dos pantallas dicen exactamente el mismo número',
    Sm.panelBien && Sm.rentBien && Sm.panelBien.val.trim()===Sm.rentBien.val.trim(),
    ex(Sm, JSON.stringify((Sm.panelBien||{}).val)+' vs '+JSON.stringify((Sm.rentBien||{}).val)));

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
