/* =========================================================================
   El informe de transacciones sujetas al IVA · lo que más dinero mueve

   El código fiscal de producto de la cuenta es `A_FOOD_DESSERT` —postre
   alimenticio— aplicado a pulseras y a bayetas de coche, así que Amazon
   liquida tipos reducidos de alimentación: 10 % en España e Italia, 5,5 % en
   Francia, 7 % en Alemania, 6 % en Bélgica. Medido sobre mayo, junio y julio
   de 2026: faltan 759,13 € sobre 6.533,76 € de base, el 11,62 %.

   Ese coste no estaba en ninguna pantalla, así que los márgenes que el hub
   enseñaba eran optimistas en unos once puntos. **No es un fallo de cálculo
   del hub: es una deuda fiscal real que el hub no veía.**

   Los fixtures están SINTETIZADOS a partir de la especificación de columnas y
   de los recuentos del encargo. Ni una celda sale de un informe de Juancho:
   el repositorio es público.
   ========================================================================= */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> Math.abs(a-b) < (t==null?0.01:t);
const D = fs.mkdtempSync(path.join(os.tmpdir(),'ivafiscal-'));

/* Las 11 columnas que importan de las 95 del informe real. */
const H = ['UNIQUE_ACCOUNT_IDENTIFIER','ACTIVITY_PERIOD','TRANSACTION_TYPE','TRANSACTION_EVENT_ID',
 'SELLER_SKU','TAXABLE_JURISDICTION','PRICE_OF_ITEMS_VAT_RATE_PERCENT',
 'TOTAL_PRICE_OF_ITEMS_AMT_VAT_EXCL','TOTAL_PRICE_OF_ITEMS_VAT_AMT','PRODUCT_TAX_CODE',
 'TAX_REPORTING_SCHEME','TAX_COLLECTION_RESPONSIBILITY','SALE_ARRIVAL_COUNTRY',
 'TRANSACTION_COMPLETE_DATE'];

/* La fecha de cada transacción, en el formato LITERAL del informe real
   —«31-07-2026», día-mes-año con guiones, medido el 29-09-2026—. Hace cinco
   días, para que caiga dentro de un periodo de 30 días mirado hoy. */
const hace = n => { const d=new Date(); d.setDate(d.getDate()-n);
  return String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear(); };
const FECHA = hace(5);

/* Reparto que reproduce EXACTAMENTE los totales medidos.
   Tipos reducidos aplicados y tipo general de cada país:
     ES 10 / 21 → delta 11,0     IT 10 / 22 → delta 12,0
     FR 5,5 / 20 → delta 14,5    DE  7 / 19 → delta 12,0
     BE  6 / 21 → delta 15,0
   Objetivo: 457 ventas · base 6.533,76 € · diferencia 759,13 €.
   Se fijan cuatro países y se resuelve el quinto para caer en el euro. */
const RED = {ES:10, IT:10, FR:5.5, DE:7, BE:6};
const GEN = {ES:21, IT:22, FR:20, DE:19, BE:21};
const CUENTA = {ES:300, IT:60, FR:50, DE:35, BE:12};   // 457 ventas
const BASE_FIJA = {IT:900, FR:700, DE:500, BE:150};    // 2.250,00 €
const BASE_TOTAL = 6533.76, DIF_OBJETIVO = 759.13;
const baseES = BASE_TOTAL - Object.keys(BASE_FIJA).reduce((a,k)=>a+BASE_FIJA[k],0);
const BASES = Object.assign({ES:baseES}, BASE_FIJA);
/* Con esas bases la diferencia no cae justo en 759,13 €, así que se ajusta el
   tipo aplicado en España —el país con más peso— hasta el céntimo. Es una
   fixture, no una hipótesis sobre el negocio: lo que se comprueba es que el
   detector suma bien, no de dónde salen las bases. */
const difSinES = Object.keys(BASE_FIJA).reduce((a,k)=>a+BASES[k]*(GEN[k]-RED[k])/100, 0);
RED.ES = GEN.ES - (DIF_OBJETIVO - difSinES)/BASES.ES*100;

/* `TAXABLE_JURISDICTION` NO trae el codigo ISO: trae el nombre completo del
   pais en ingles. Escribirlo aqui como `ES` era lo que dejaba pasar el fallo
   de A7 —cortar por las dos primeras letras daba `SP`, `GE`, y `PO` para
   Portugal y Polonia a la vez— con la fixture en verde. El formato literal de
   la columna forma parte de la especificacion del informe. */
const JURIS = {ES:'SPAIN', IT:'ITALY', FR:'FRANCE', DE:'GERMANY', BE:'BELGIUM',
               PT:'PORTUGAL', PL:'POLAND', AT:'AUSTRIA'};

const filas = [];
Object.keys(CUENTA).forEach(pais=>{
  const n = CUENTA[pais], basePorFila = BASES[pais]/n, pct = RED[pais];
  for(let i=0;i<n;i++){
    const iva = basePorFila*pct/100;
    filas.push(['AZ1','2026-06','SALE','171-'+String(5000000+filas.length).padStart(7,'0')+'-'+
      String(4000000+filas.length).padStart(7,'0'),'FBA0101',JURIS[pais],(pct/100).toFixed(6),
      basePorFila.toFixed(6), iva.toFixed(6),'A_FOOD_DESSERT','UNION-OSS','SELLER',pais,FECHA]);
  }
});
const F = path.join(D,'vat.txt');
fs.writeFileSync(F,[H.join('\t')].concat(filas.map(r=>r.join('\t'))).join('\n')+'\n');

/* Segunda fixture, independiente de la calibrada arriba, para los casos que la
   primera no puede cubrir sin mover sus totales al centimo:
     PORTUGAL y POLAND     chocaban los dos en `PO`
     AUSTRIA               daba `AU`
     una jurisdiccion que el hub no conoce  -> no debe inventarse un pais
     ventas a tipo CERO declarado           -> antes quedaban fuera de la deuda
   Aritmetica a mano, base x general/100 - iva repercutido:
     PT  100,00 x 23/100 -  6,00 = 17,00
     PL  100,00 x 23/100 -  5,00 = 18,00
     AT  100,00 x 20/100 - 10,00 = 10,00
     ES  100,00 x 21/100 -  0,00 = 21,00   (2 ventas a tipo cero)
     NARNIA: sin tipo general -> 0,00, y ni un euro asignado a un pais inventado
     total                        = 66,00 */
const CASOS = [['PT',6],['PL',5],['AT',10],['ES',0]];
const filas2 = [];
CASOS.forEach(([pais,pct])=>{
  for(let i=0;i<2;i++) filas2.push(['AZ1','2026-07','SALE',
    '171-'+String(6000000+filas2.length).padStart(7,'0')+'-'+String(3000000+filas2.length).padStart(7,'0'),
    'FBA0500',JURIS[pais],(pct/100).toFixed(6),'50.000000',(50*pct/100).toFixed(6),
    'A_FOOD_DESSERT','UNION-OSS','SELLER',pais,FECHA]);
});
filas2.push(['AZ1','2026-07','SALE','171-6000099-3000099','FBA0500','NARNIA','0.210000',
             '100.000000','21.000000','A_FOOD_DESSERT','UNION-OSS','SELLER','XX',FECHA]);
const F2 = path.join(D,'vat-jurisdicciones.txt');
fs.writeFileSync(F2,[H.join('\t')].concat(filas2.map(r=>r.join('\t'))).join('\n')+'\n');

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
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);
  await page.evaluate(()=>{ DB=blankDB(); DB.mappings={}; saveDB();
    document.getElementById('fileList').innerHTML=''; refreshAll(); });
  await page.setInputFiles('#csvFile', F);
  await page.waitForTimeout(1200);

  console.log('\n=== FIS-A · EL INFORME SE LEE, Y EL TIPO VIENE EN FRACCIÓN ===');
  /* `PRICE_OF_ITEMS_VAT_RATE_PERCENT` trae `0.1` para el 10 %. Tomarlo por un
     porcentaje daría un 0,1 % y el detector no vería nada; multiplicarlo dos
     veces daría 1000 %. Se distingue por el orden de magnitud. */
  const A = await page.evaluate(()=>{
    const el = document.querySelector('#fileList .fileitem');
    const V = vatReport();
    return {ok:!!(el&&el.querySelector('.f-dot.ok')), id:Object.keys(DB.imports)[0],
            filas:V.rows, ventas:V.ventas, base:+V.base.toFixed(2), iva:+V.vat.toFixed(2),
            paises:Object.keys(V.porPais).sort(), codigos:Object.keys(V.porCodigo),
            tiposES:Object.keys((V.porPais.ES||{tipos:{}}).tipos)};
  });
  check('el informe se reconoce', A.ok && A.id==='vat', A.id);
  check('y ya no es de los que se guardan sin usar', A.ventas===457, A.ventas+' ventas leídas');
  check('la base imponible son 6.533,76 €', near(A.base, 6533.76, 0.02), A.base+' €');
  check('los cinco países aparecen', A.paises.join(',')==='BE,DE,ES,FR,IT', A.paises.join(', '));
  check('y el código fiscal de producto se lee', A.codigos.join(',')==='A_FOOD_DESSERT', A.codigos.join(', '));

  console.log('\n=== FIS-B · EL DETECTOR DE TIPO REDUCIDO ===');
  /* Aritmética por país, base × (general − aplicado):
       IT  900,00 × (22 − 10  )/100 = 108,00 €
       FR  700,00 × (20 −  5,5)/100 = 101,50 €
       DE  500,00 × (19 −  7  )/100 =  60,00 €
       BE  150,00 × (21 −  6  )/100 =  22,50 €
       ES  4.283,76 × el resto      = 467,13 €
       total                        = 759,13 €  */
  const B = await page.evaluate(()=>{
    const V = vatReport();
    return {dif:+V.diferencia.toFixed(2), n:V.ventasReducidas,
            tuya:+V.difTuya.toFixed(2), mercado:+V.difDelMercado.toFixed(2),
            porPais:Object.keys(V.porPais).reduce((a,k)=>{a[k]=+V.porPais[k].dif.toFixed(2);return a;},{})};
  });
  check('las 457 ventas llevan tipo reducido', B.n===457, B.n);
  check('y la diferencia son 759,13 €', near(B.dif, 759.13, 0.02),
    B.dif+' € · por país: '+JSON.stringify(B.porPais));
  check('la deuda es tuya, porque el informe dice SELLER', near(B.tuya, 759.13, 0.02) && B.mercado===0,
    'tuya '+B.tuya+' € · de Amazon '+B.mercado+' €');

  console.log('\n=== FIS-C · SI RESPONDE AMAZON, NO SE TE CARGA A TI ===');
  /* `TAX_COLLECTION_RESPONSIBILITY` existe para esto. Cuando Amazon actúa como
     sujeto pasivo, la diferencia no te la reclaman: verla sigue interesando,
     pagarla no. */
  const C = await page.evaluate(()=>{
    DB.imports.vat.rows.forEach(r=>{ r._resp='MARKETPLACE'; r.taxcollectionresponsibility='MARKETPLACE'; });
    const V = vatReport();
    return {dif:+V.diferencia.toFixed(2), tuya:+V.difTuya.toFixed(2), mercado:+V.difDelMercado.toFixed(2)};
  });
  check('la diferencia se sigue viendo entera', near(C.dif, 759.13, 0.02), C.dif+' €');
  check('pero no se te carga a ti', C.tuya===0 && near(C.mercado, 759.13, 0.02),
    'tuya '+C.tuya+' € · de Amazon '+C.mercado+' €');

  console.log('\n=== FIS-D · EL MARGEN BAJA EN CONSECUENCIA ===');
  /* El criterio de aceptación del encargo. La diferencia es un coste real del
     periodo —lo debes tú ante Hacienda— y hasta ahora no estaba en ninguna
     línea, así que el beneficio salía 759,13 € por encima de lo que es. */
  const Dm = await page.evaluate(()=>{
    DB.imports.vat.rows.forEach(r=>{ r._resp='SELLER'; r.taxcollectionresponsibility='SELLER'; });
    DB.products=[{id:'p',sku:'FBA0101',name:'P',cogs:2,freight:0,fba:3,referral:15,
                  price:20,channel:'FBA',lots:[]}];
    const hoy=new Date(); const d=new Date(hoy); d.setDate(d.getDate()-5);
    const dia=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    DB.imports.orders={count:1,file:'o',rows:[{amazonorderid:'171-9-9',
      purchasedate:dia+'T10:00:00+00:00', fulfillmentchannel:'Amazon', saleschannel:'Amazon.es',
      sku:'FBA0101', asin:'B0', itemstatus:'Shipped', quantity:'400', itemprice:'8000.00',
      itemtax:'1388.43', shipcountry:'ES', currency:'EUR'}]};
    periodDays=30;
    const con = pnl();
    const guardado = DB.imports.vat; DB.imports.vat = {rows:[],count:0,file:'x'};
    const sin = pnl();
    DB.imports.vat = guardado;
    return {conProfit:+con.profit.toFixed(2), sinProfit:+sin.profit.toFixed(2),
            linea:+con.vatShortfall.toFixed(2), n:con.vatVentasReducidas};
  });
  check('el P&L trae una línea de IVA no repercutido', near(Dm.linea, 759.13, 0.02),
    Dm.linea+' €');
  check('y el beneficio baja exactamente eso', near(Dm.sinProfit - Dm.conProfit, 759.13, 0.02),
    (Dm.sinProfit-Dm.conProfit).toFixed(2)+' € · de '+Dm.sinProfit+' € a '+Dm.conProfit+' €');

  console.log('\n=== FIS-D2 · LA DEUDA ES LA DEL PERIODO Y EL PAÍS QUE SE MIRAN ===');
  /* Medido el 29-09-2026 contra los informes reales: la cuenta de resultados
     restaba la deuda del informe ENTERO fuese cual fuese el periodo. Un
     informe de mayo a julio mirado en «30 días» a finales de septiembre daba
     beneficio negativo por la deuda completa sin una sola venta en el mes.

     Aritmética: las 457 ventas suman 759,13 €. Italia sola, 900,00 × (22 − 10)
     / 100 = 108,00 €. Movidas a hace 60 días, en un periodo de 30 no queda
     ninguna: 0,00 €. Sin fecha, con periodo, tampoco; en «Todo», las 457. */
  const D2 = await page.evaluate(()=>{
    const filas = DB.imports.vat.rows;
    const guarda = filas.map(r=>r.transactioncompletedate);
    const linea = ()=> +pnl().vatShortfall.toFixed(2);
    const o = {};
    periodDays=30; countryFilter='IT'; o.it = linea(); countryFilter='ALL';
    const hace60 = (()=>{ const d=new Date(); d.setDate(d.getDate()-60);
      return String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear(); })();
    filas.forEach(r=>{ r.transactioncompletedate = hace60; });
    periodDays=30; o.viejas30 = linea();
    periodDays=90; o.viejas90 = linea();
    periodDays=0;  o.viejasTodo = linea();
    filas.forEach(r=>{ delete r.transactioncompletedate; });
    periodDays=30; o.sinFecha30 = linea(); o.sinFechaN = pnl().vat.sinFecha;
    periodDays=0;  o.sinFechaTodo = linea();
    filas.forEach((r,i)=>{ r.transactioncompletedate = guarda[i]; });
    periodDays=30;
    return o;
  });
  check('con el filtro de un país, la línea es la deuda de ESE país', near(D2.it, 108.00, 0.02),
    D2.it+' €' + (near(D2.it,759.13,0.02) ? '  ← es la deuda de todos los países' : ''));
  check('ventas de hace 60 días no cargan un periodo de 30', near(D2.viejas30, 0, 0.005),
    D2.viejas30+' €' + (D2.viejas30>0 ? '  ← la deuda del informe entero se carga al periodo mirado' : ''));
  check('y sí cargan el de 90 y el de «Todo»', near(D2.viejas90, 759.13, 0.02) && near(D2.viejasTodo, 759.13, 0.02),
    '90 d: '+D2.viejas90+' € · Todo: '+D2.viejasTodo+' €');
  check('una fila sin fecha no se coloca en ningún periodo, y se cuenta',
    near(D2.sinFecha30, 0, 0.005) && D2.sinFechaN===457, D2.sinFecha30+' € · sin fecha: '+D2.sinFechaN);
  check('pero en «Todo» sí cuenta', near(D2.sinFechaTodo, 759.13, 0.02), D2.sinFechaTodo+' €');

  console.log('\n=== FIS-E · Y SE DICE EN PANTALLA, CON EL CÓDIGO QUE LO CAUSA ===');
  const E = await page.evaluate(()=>{ go('rentabilidad');
    return document.getElementById('abcVerdict').textContent; });
  check('la pantalla da el recuento y el importe',
    /457 ventas con un tipo de IVA inferior al general/.test(E) && /759,13/.test(E),
    (E.match(/[^.]*tipo de IVA inferior[^.]*/)||[''])[0].slice(0,110));
  check('y señala el código fiscal de producto, que es la causa',
    /A_FOOD_DESSERT/.test(E), 'nombra el código en pantalla');
  check('sin presentarlo como un fallo del hub',
    /deuda fiscal real/.test(E), 'lo dice con esas palabras');

  console.log('\n=== FIS-F · CADA JURISDICCIÓN A SU PAÍS, Y LO QUE NO SE RECONOCE SE DICE ===');
  /* El fallo de A7 no era de aritmética: era que el país no se identificaba, y
     un cero por no reconocer la jurisdicción es indistinguible en pantalla de
     un cero por no haber deuda. Aquí se comprueba lo segundo tanto como lo
     primero: PORTUGAL y POLAND separados, AUSTRIA reconocida, y una
     jurisdicción desconocida que NO acaba asignada a ningún país. */
  await page.evaluate(()=>{ DB=blankDB(); DB.mappings={}; saveDB();
    document.getElementById('fileList').innerHTML=''; refreshAll(); });
  await page.setInputFiles('#csvFile', F2);
  await page.waitForTimeout(1200);
  const Fj = await page.evaluate(()=>{
    const V = vatReport();
    return {ventas:V.ventas, base:+V.base.toFixed(2), dif:+V.diferencia.toFixed(2),
            cero:V.ventasCero||0, sinJuris:V.sinJuris, incl:+(V.diferenciaIvaIncluido||0).toFixed(2),
            paises:Object.keys(V.porPais).sort(),
            porPais:Object.keys(V.porPais).reduce((a,k)=>{a[k]=+V.porPais[k].dif.toFixed(2);return a;},{})};
  });
  check('PORTUGAL y POLAND ya no colisionan en el mismo código',
    Fj.porPais.PT===17 && Fj.porPais.PL===18, 'PT '+Fj.porPais.PT+' € · PL '+Fj.porPais.PL+' €');
  check('AUSTRIA se reconoce', Fj.porPais.AT===10, Fj.porPais.AT+' €');
  check('las ventas a tipo cero declarado cuentan como deuda',
    Fj.cero===2 && Fj.porPais.ES===21, Fj.cero+' ventas a cero · ES '+Fj.porPais.ES+' €');
  check('la jurisdicción desconocida no se asigna a un país inventado',
    Fj.sinJuris===1 && Fj.paises.join(',')==='AT,ES,PL,PT', Fj.paises.join(', ')+' · sin país: '+Fj.sinJuris);
  check('y la diferencia total son 66,00 €', near(Fj.dif, 66, 0.02),
    Fj.dif+' € sobre '+Fj.base+' € de base en '+Fj.ventas+' ventas');
  /* El otro criterio, el de precio con IVA incluido: (base + iva) × g/(100+g) − iva.
       PT (100 + 6) × 23/123 −  6 = 13,8211
       PL (100 + 5) × 23/123 −  5 = 14,6341
       AT (100 + 10) × 20/120 − 10 =  8,3333
       ES (100 + 0) × 21/121 −  0 = 17,3554
       total                        = 54,1440  →  54,14 € */
  check('y con el criterio de precio con IVA incluido, 54,14 €', near(Fj.incl, 54.14, 0.02),
    Fj.incl+' €' + (near(Fj.incl,Fj.dif,0.02) ? '  ← sale igual que el otro criterio' : ''));

  console.log('\n=== FIS-G · TIPO CERO A UNA EMPRESA CON NIF-IVA NO ES DEUDA ===');
  /* Medido el 29-09-2026: las 14 ventas a tipo cero del informe real llevan
     TODAS `BUYER_VAT_NUMBER`. Son ventas entre empresas —entrega
     intracomunitaria exenta, o inversión del sujeto pasivo— y el cero es el
     tipo correcto. El hub las cargaba como deuda al tipo general.
     Aritmética: las dos ventas españolas a cero de la fixture son
     50,00 × 21 / 100 = 10,50 € cada una. Con NIF del comprador la deuda baja
     de 66,00 a 66,00 − 21,00 = 45,00 €, y España se queda en 0,00 €. */
  const G = await page.evaluate(()=>{
    DB.imports.vat.rows.forEach(r=>{
      const j = String(r.taxablejurisdiction||r._juris||'').toUpperCase();
      const t = parseFloat(r.priceofitemsvatratepercent||r._rate||'1');
      if(j==='SPAIN' && t===0) r.buyervatnumber = 'PT999999990';
    });
    const V = vatReport();
    return {dif:+V.diferencia.toFixed(2), es:+((V.porPais.ES||{}).dif||0).toFixed(2),
            b2b:V.ventasB2BCero, cero:V.ventasCero};
  });
  check('con NIF del comprador, la venta a tipo cero no suma deuda', near(G.dif, 45, 0.02),
    G.dif+' €' + (near(G.dif,66,0.02) ? '  ← cuenta como deuda una venta entre empresas' : ''));
  check('España se queda sin deuda y las dos ventas se cuentan aparte',
    near(G.es, 0, 0.005) && G.b2b===2 && G.cero===2, 'ES '+G.es+' € · B2B a cero: '+G.b2b+' · a cero: '+G.cero);

  console.log('\n=== FIS-H · UN REEMBOLSO RECTIFICA LA DEUDA DE LA VENTA QUE ANULA ===');
  /* Medido el 2-10-2026 contra el informe real: 42 filas REFUND, con base e
     IVA en negativo y el tipo reducido de la venta. El hub solo contaba
     ventas y la deuda salía 55,15 € por encima.
     Aritmética, sobre los 45,00 € de FIS-G:
       reembolso de una venta austriaca, base −50,00, IVA −5,00 al 10 %:
         −50,00 × 20/100 − (−5,00) = −10,00 + 5,00 = −5,00   → 40,00 €
       con el otro criterio: (−55,00) × 20/120 + 5,00 = −4,1667
       un RETURN sin importes no mueve nada
       un reembolso B2B a tipo cero con NIF tampoco: el cero era correcto
     Y ninguno cuenta como venta: siguen siendo 9. */
  const Hh = await page.evaluate(()=>{
    const rows = DB.imports.vat.rows;
    const antes = vatReport();
    const at = rows.filter(r=>String(r.taxablejurisdiction||r._juris||'').toUpperCase()==='AUSTRIA')[0];
    const es0 = rows.filter(r=>String(r.buyervatnumber||'').trim())[0];
    const clona = (r, tipo, signo, vacio) => { const c = Object.assign({}, r);
      ['transactiontype','_ttype'].forEach(k=>{ if(k in c || k==='transactiontype') c[k]=tipo; });
      ['totalpriceofitemsamtvatexcl','_base','totalpriceofitemsvatamt','_vat'].forEach(k=>{
        if(c[k]!==undefined && c[k]!=='') c[k] = vacio ? '' : String(signo*Math.abs(parseFloat(c[k]))); });
      return c; };
    rows.push(clona(at,'REFUND',-1,false));
    rows.push(clona(at,'RETURN',1,true));
    rows.push(clona(es0,'REFUND',-1,false));
    const V = vatReport();
    rows.splice(rows.length-3, 3);
    return {antes:+antes.diferencia.toFixed(2), dif:+V.diferencia.toFixed(2), incl:+V.diferenciaIvaIncluido.toFixed(4),
            inclAntes:+antes.diferenciaIvaIncluido.toFixed(4), ventas:V.ventas, ventasAntes:antes.ventas,
            reemb:V.reembolsos, reembRed:V.reembolsosReducidos, at:+V.porPais.AT.dif.toFixed(2)};
  });
  check('el reembolso de una venta a tipo reducido resta su deuda', near(Hh.dif, 40, 0.02),
    Hh.antes+' € → '+Hh.dif+' €' + (near(Hh.dif,45,0.02) ? '  ← el reembolso no rectifica nada: solo se cuentan ventas' : ''));
  check('también con el criterio de precio con IVA incluido', near(Hh.inclAntes - Hh.incl, 4.1667, 0.001),
    (Hh.inclAntes-Hh.incl).toFixed(4)+' € menos');
  check('y en su país', near(Hh.at, 5, 0.02), 'AT '+Hh.at+' €');
  check('ni el RETURN sin importe ni el reembolso B2B mueven la deuda, y nada cuenta como venta',
    Hh.ventas===Hh.ventasAntes && Hh.reemb===2 && Hh.reembRed===1,
    'ventas '+Hh.ventasAntes+'→'+Hh.ventas+' · reembolsos '+Hh.reemb+' · a tipo reducido '+Hh.reembRed);

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  try{ fs.rmSync(D,{recursive:true,force:true}); }catch(e){}
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
