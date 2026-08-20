/* =========================================================================
   IVA · la base sobre la que se calcula TODO margen

   Por qué existe esta suite. `tests/pnl.test.js` fija `itemtax:'0'` en su
   laboratorio, así que las 400 y pico comprobaciones de rentabilidad corren
   sobre un negocio sin IVA y son estructuralmente incapaces de ver el fallo
   más caro que tiene el hub: cuando el informe de pedidos no trae la columna
   de impuesto, `_tax` vale 0 (está declarado `req:0` en 12-datos.js) y el
   «ingreso neto» pasa a ser el ingreso CON IVA, sin un solo aviso.

   Una suite en verde que no puede fallar por el motivo correcto da la misma
   falsa tranquilidad que un margen inflado. Esto convierte el IVA en un eje
   de prueba en vez de en una constante.

   Escrita el 19-ago-2026 con los cuatro casos en ROJO, que es como debe
   nacer una prueba que persigue un fallo real: primero se demuestra que el
   fallo existe y cuánto cuesta, después se arregla. `taxBasis()` en
   12-datos.js es el arreglo; estos casos son la demostración de que hacía
   falta y el seguro de que no vuelve.

   Cada caso lleva la aritmética a mano en el comentario.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> Math.abs(a-b) < (t==null?0.01:t);

/* Laboratorio. Un solo producto, precio NETO 100 € por unidad, coste 5 €,
   tarifa FBA 3 €, comisión 15 %. El precio con IVA cambia según el país,
   que es justo lo que se quiere ejercitar.

   `venta(dia, uds, {pais, vat, conIva})`:
     - `conIva:true`  → la fila trae `itemtax`, como el informe en inglés.
     - `conIva:false` → la fila NO trae la clave, que es exactamente lo que
       ocurre con un informe cuya columna de impuesto no existe o no casa
       con ningún alias. */
const LAB = `
  DB = blankDB();
  DB.products = [{id:'t1', sku:'TEST-1', name:'Producto', cogs:5, freight:0,
                  fba:3, referral:15, price:100, channel:'FBA', lots:[]}];
  const hoy = new Date();
  const dia = k => { const d=new Date(hoy); d.setDate(d.getDate()-k);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const venta = (d,q,o)=>{
    o = o || {};
    const neto  = o.neto==null ? 100 : o.neto;
    const vat   = o.vat==null  ? 21  : o.vat;
    const pais  = o.pais || 'ES';
    const bruto = neto * (1 + vat/100);
    const row = {amazonorderid:'o'+pais+d+q, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.'+pais.toLowerCase(),
      sku:'TEST-1', asin:'B0X', itemstatus:'Shipped', quantity:String(q),
      itemprice:(bruto*q).toFixed(2), shipcountry:pais};
    if(o.conIva !== false) row.itemtax = ((bruto-neto)*q).toFixed(2);
    return row;
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

  /* =====================================================================
     IVA-A · CONTROL: con la columna de impuesto, la base es la correcta
     =====================================================================
     100 unidades en España, precio neto 100 €, IVA 21 %.
       itemprice  = 121,00 × 100 = 12.100,00 €
       itemtax    =  21,00 × 100 =  2.100,00 €
       ingreso neto            = 12.100 − 2.100 = 10.000,00 €
       comisión 15 % del bruto CON IVA          =  1.815,00 €   (12.100 × 0,15)
       tarifa FBA 3,00 × 1,015 × 100            =    304,50 €
       coste de producto 5,00 × 100             =    500,00 €
       beneficio = 10.000 − 1.815 − 304,50 − 500 = 7.380,50 €
       margen    = 7.380,50 / 10.000            =     73,81 %                */
  console.log('\n=== IVA-A · CONTROL: LA COLUMNA ESTÁ Y LA BASE ES LA BUENA ===');
  const A = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),100,{pais:'ES', vat:21})], count:1, file:'o'};
    periodDays = 30;
    const p = pnl();
    return {gross:p.grossInc, tax:p.tax, net:p.net, ref:p.referral, fba:p.fba,
            cogs:p.cogs, profit:p.profit, margin:p.margin};
  `));
  check('ingreso bruto 12.100 €',        near(A.gross, 12100),  A.gross);
  check('impuesto leído 2.100 €',        near(A.tax,    2100),  A.tax);
  check('ingreso NETO 10.000 €',         near(A.net,   10000),  A.net);
  check('comisión 1.815 € (15 % del bruto con IVA)', near(A.ref, 1815, 0.5), A.ref);
  check('tarifa FBA 304,50 €',           near(A.fba,   304.5, 0.5), A.fba);
  check('beneficio 7.380,50 €',          near(A.profit, 7380.5, 1), A.profit);
  check('margen 73,81 %',                near(A.margin, 73.81, 0.1), A.margin);

  /* =====================================================================
     IVA-B · SIN LA COLUMNA: el IVA se deduce y la base se etiqueta
     =====================================================================
     Idéntico al anterior, pero la fila no trae `itemtax`.
       impuesto leído          =      0,00 €   ← el hub no sabe que hay IVA
       «ingreso neto»          = 12.100,00 €   ← es el bruto disfrazado
       beneficio = 12.100 − 1.815 − 304,50 − 500 = 9.480,50 €
       margen    = 9.480,50 / 12.100            =     78,35 %

     Eso era ANTES de taxBasis(): 2.100 € de beneficio ficticio y 4,5 puntos
     de margen, con el mismo aspecto de dato bueno que el caso A.

     DECISIÓN (Juancho, 19-ago-2026): el hub DEDUCE el IVA del tipo del país
     y etiqueta la base como estimada. Así que el margen debe volver a 73,81 %
     —el mismo que con la columna, porque el tipo español es exactamente el
     21 % que se deduce— y `baseQuality` debe decir «estimada».             */
  console.log('\n=== IVA-B · SIN COLUMNA DE IMPUESTO ===');
  const B = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),100,{pais:'ES', vat:21, conIva:false})], count:1, file:'o'};
    periodDays = 30;
    const p = pnl();
    return {gross:p.grossInc, tax:p.tax, net:p.net, profit:p.profit, margin:p.margin,
            taxKnown: p.taxKnown, base: p.baseQuality};
  `));
  check('deduce los 2.100 € de IVA que el informe no traía', near(B.tax, 2100, 1), B.tax);
  check('el ingreso neto vuelve a 10.000 €',  near(B.net, 10000, 1), B.net);
  check('el beneficio vuelve a 7.380,50 €',   near(B.profit, 7380.5, 1), B.profit);
  check('el margen vuelve a 73,81 %',         near(B.margin, 73.81, 0.1), B.margin);
  check('y NO se presenta como base medida',  B.taxKnown === false, 'taxKnown=' + B.taxKnown);
  check('la base queda etiquetada «estimada»', B.base === 'estimada', B.base);
  console.log('     ── diferencia con el caso A: ' + (B.profit-A.profit).toFixed(2) +
              ' € y ' + (B.margin-A.margin).toFixed(2) + ' puntos');

  /* =====================================================================
     IVA-C · LA INVERSIÓN: informes mixtos entre dos mercados
     =====================================================================
     Es el caso realista: el informe de un marketplace trae la columna y el de
     otro no. Mismo negocio real en los dos, 100 unidades a 100 € netos.

       ESPAÑA, IVA 21 %, SIN columna:
         bruto 12.100 · «neto» 12.100 · comisión 1.815 · FBA 304,50 · coste 500
         beneficio 9.480,50 · margen 78,35 %

       ALEMANIA, IVA 19 %, CON columna:
         bruto 11.900 · neto 10.000 · comisión 1.785 · FBA 304,50 · coste 500
         beneficio 7.410,50 · margen 74,11 %

     Verdad del negocio: los dos ganan lo mismo antes de comisión, pero Amazon
     cobra la comisión sobre el precio CON IVA, así que el país de IVA más alto
     es genuinamente el peor. ALEMANIA GANA por 0,30 puntos (74,11 vs 73,81).

     Lo que enseña el hub: España 78,35 % contra Alemania 74,11 %. España gana
     por 4,24 puntos. El orden está invertido y la distancia es catorce veces
     la real. Es exactamente la decisión para la que existe el comparador
     PanEU.                                                                 */
  console.log('\n=== IVA-C · INFORMES MIXTOS: EL ORDEN ENTRE PAÍSES SE MANTIENE ===');
  const C = await page.evaluate(js(`
    const mk = (pais,vat,conIva)=>{
      DB.imports.orders = {rows:[venta(dia(5),100,{pais:pais, vat:vat, conIva:conIva})], count:1, file:'o'};
      periodDays = 30; country = pais;
      const p = pnl();
      return {net:p.net, profit:p.profit, margin:p.margin};
    };
    const esSin  = mk('ES',21,false);
    const deCon  = mk('DE',19,true);
    const esCon  = mk('ES',21,true);
    country = 'ALL';
    return {esSin, deCon, esCon};
  `));
  console.log('     España  sin columna → margen ' + (C.esSin.margin||0).toFixed(2) + ' %');
  console.log('     Alemania con columna → margen ' + (C.deCon.margin||0).toFixed(2) + ' %');
  console.log('     España  con columna → margen ' + (C.esCon.margin||0).toFixed(2) + ' %  (la verdad)');
  check('con la columna, Alemania sale mejor que España, que es la realidad',
        C.deCon.margin > C.esCon.margin,
        'DE ' + (C.deCon.margin||0).toFixed(2) + ' % vs ES ' + (C.esCon.margin||0).toFixed(2) + ' %');
  check('sigue saliendo mejor Alemania aunque el informe de España venga sin columna',
        C.deCon.margin > C.esSin.margin,
        'DE ' + (C.deCon.margin||0).toFixed(2) + ' % vs ES ' + (C.esSin.margin||0).toFixed(2) + ' %');

  /* =====================================================================
     IVA-D · EL SESGO NO ERA CONSTANTE, ASÍ QUE NO SE PODÍA IGNORAR
     =====================================================================
     Alguien podría decir: «si a todos les falta la columna, el error es el
     mismo y la comparación sigue valiendo». No es cierto, porque el sesgo
     depende del tipo de IVA de cada país.

       ES (21 %): 78,35 % frente a 73,81 % reales → +4,54 puntos
       DE (19 %): 78,24 % frente a 74,11 % reales → +4,13 puntos
       SE (25 %): 78,55 % frente a 73,23 % reales → +5,32 puntos

     Con la columna, Suecia es el peor de los tres. Sin ella salía el MEJOR:
     el sesgo premiaba justamente al país que peor está. Con taxBasis() los
     dos órdenes coinciden, que es la única forma de que el comparador PanEU
     sirva para decidir.                                                    */
  console.log('\n=== IVA-D · SIN COLUMNA EN NINGUNO: EL SESGO YA NO PREMIA AL PEOR PAÍS ===');
  const D = await page.evaluate(js(`
    const mk = (pais,vat,conIva)=>{
      DB.imports.orders = {rows:[venta(dia(5),100,{pais:pais, vat:vat, conIva:conIva})], count:1, file:'o'};
      periodDays = 30; country = pais;
      return pnl().margin;
    };
    const r = {
      esCon:mk('ES',21,true),  esSin:mk('ES',21,false),
      deCon:mk('DE',19,true),  deSin:mk('DE',19,false),
      seCon:mk('SE',25,true),  seSin:mk('SE',25,false)
    };
    country = 'ALL';
    return r;
  `));
  const ord = o => Object.entries(o).sort((a,b)=>b[1]-a[1]).map(x=>x[0]).join(' > ');
  const conCol = {ES:D.esCon, DE:D.deCon, SE:D.seCon};
  const sinCol = {ES:D.esSin, DE:D.deSin, SE:D.seSin};
  console.log('     con columna → ' + ord(conCol) + '   (' + Object.values(conCol).map(v=>(v||0).toFixed(2)).join(' / ') + ')');
  console.log('     sin columna → ' + ord(sinCol) + '   (' + Object.values(sinCol).map(v=>(v||0).toFixed(2)).join(' / ') + ')');
  check('con la columna, Suecia (IVA 25 %) es el peor de los tres',
        D.seCon < D.esCon && D.seCon < D.deCon, (D.seCon||0).toFixed(2) + ' %');
  check('sigue siendo el peor sin la columna (antes salía el mejor)',
        D.seSin < D.esSin && D.seSin < D.deSin, (D.seSin||0).toFixed(2) + ' %');
  check('el orden es el mismo con y sin columna', ord(conCol) === ord(sinCol),
        '«' + ord(conCol) + '» frente a «' + ord(sinCol) + '»');

  /* =====================================================================
     IVA-E · EL AVISO VIVE DONDE SE PUEDE ARREGLAR
     =====================================================================
     Deducir el IVA salva el número, pero deducir no es leer. Donde esto se
     arregla de verdad no es en Rentabilidad, es en Datos: volviendo a
     descargar el informe con la columna. Un aviso que solo aparece junto al
     margen es un aviso puesto donde ya no se puede hacer nada.             */
  console.log('\n=== IVA-E · DATOS AVISA DE QUE FALTA LA COLUMNA ===');
  const E = await page.evaluate(js(`
    DB.imports.orders = {rows:[venta(dia(5),100,{pais:'ES', vat:21, conIva:false})], count:1, file:'o'};
    periodDays = 30;
    go('datos');
    const conFallo = document.getElementById('dataTaxWarn').textContent;
    DB.imports.orders = {rows:[venta(dia(5),100,{pais:'ES', vat:21})], count:1, file:'o'};
    go('datos');
    const sinFallo = document.getElementById('dataTaxWarn').textContent;
    return {conFallo, sinFallo};
  `));
  check('con la columna ausente, la pantalla de Datos lo dice',
    /no trae la columna de impuesto/i.test(E.conFallo), E.conFallo.slice(0,90)+'…');
  check('y dice qué hay que hacer, no solo qué pasa',
    /vuelve a descargar/i.test(E.conFallo) && /item-tax/i.test(E.conFallo), 'incluye la acción');
  check('con la columna presente, no molesta', E.sinFallo.trim()==='', '«'+E.sinFallo.trim()+'»');

  console.log('\nERRORES JS: ' + errors.length);
  errors.forEach(e => console.log('   ' + e));
  await browser.close();
  console.log(fails ? '\n######## ' + fails + ' fallos ########'
                    : '\n✓ todo correcto');
  process.exit(fails ? 1 : 0);
})();
