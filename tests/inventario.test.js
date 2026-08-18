/* =========================================================================
   Inventario · cobertura, velocidad y cuánto hay que pedir

   Los números de esta pantalla no deciden un margen: deciden si se rompe
   stock o si entra un contenedor que sobra. Los dos errores cuestan dinero y
   ninguno da error en pantalla.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> Math.abs(a-b) < (t==null?0.01:t);

/* Laboratorio: dos referencias, 30 días de ventas.
   RAPIDO · 10 ud/día, se vende en DE y en ES a partes iguales
   LENTO  ·  1 ud/día */
const LAB = `
  DB = blankDB();
  DB.suppliers = [{id:'s1', name:'Prov', lead:30}];
  DB.products = [
    {id:'a', sku:'RAPIDO', name:'Rápido', cogs:4, freight:1, fba:3, referral:15, price:20, channel:'FBA', supplierId:'s1', lots:[]},
    {id:'b', sku:'LENTO',  name:'Lento',  cogs:4, freight:1, fba:3, referral:15, price:20, channel:'FBA', supplierId:'s1', lots:[]}];
  const hoy = new Date();
  const dia = k => { const d=new Date(hoy); d.setDate(d.getDate()-k);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const venta = (d,sku,q,pais,canal)=>({amazonorderid:'o'+d+sku+pais, purchasedate:d+'T10:00:00+00:00',
    fulfillmentchannel:'Amazon', saleschannel:canal, sku:sku, asin:'B0X', itemstatus:'Shipped',
    quantity:String(q), itemprice:String(20*q), itemtax:'0', shipcountry:pais});
  const ventas=[];
  for(let k=0;k<30;k++){
    ventas.push(venta(dia(k),'RAPIDO',5,'DE','Amazon.de'));
    ventas.push(venta(dia(k),'RAPIDO',5,'ES','Amazon.es'));
    ventas.push(venta(dia(k),'LENTO',1,'ES','Amazon.es'));
  }
  DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
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

  console.log('\n=== INV-A · EL FILTRO DE PAÍS NO PUEDE DIVIDIR LAS VENTAS Y DEJAR EL STOCK ENTERO ===');
  /* RAPIDO vende 10 ud/día en toda Europa, 5 de ellas en España, y tiene 300
     unidades en el almacén europeo.
       cobertura correcta = 300 / 10 = 30 días
       con el fallo (ES)  = 300 /  5 = 60 días
     Sesenta días de cobertura para algo que se agota en treinta: la referencia
     en rotura desaparecía de la pantalla junto con las unidades que había que
     pedir. El stock de FBA es europeo y no se puede trocear. */
  const pais = await page.evaluate(js(`
    DB.imports.inventory = {count:2, file:'i', rows:[
      {sku:'RAPIDO', afnfulfillablequantity:'300'},
      {sku:'LENTO',  afnfulfillablequantity:'300'}]};
    const g = (arr,k) => arr.filter(x=>x.sku===k)[0];
    countryFilter='ALL'; const todo = invStats();
    countryFilter='ES';  const soloES = invStats();
    countryFilter='ALL';
    return {todoVel:g(todo,'RAPIDO').velocity, todoCob:g(todo,'RAPIDO').cover,
            esVel:g(soloES,'RAPIDO').velocity, esCob:g(soloES,'RAPIDO').cover,
            esStock:g(soloES,'RAPIDO').qty};
  `));
  check('sin filtro, RAPIDO vende 10 al día y cubre 30 días',
    near(pais.todoVel,10,0.05) && Math.round(pais.todoCob)===30,
    pais.todoVel.toFixed(2)+' ud/día · '+Math.round(pais.todoCob)+' d');
  check('y con el filtro de España puesto, dice exactamente lo mismo',
    near(pais.esVel, pais.todoVel, 0.05) && Math.round(pais.esCob)===Math.round(pais.todoCob),
    pais.esVel.toFixed(2)+' ud/día · '+Math.round(pais.esCob)+' d · con el fallo daba 5,00 y 60 d');

  console.log('\n=== INV-B · UN SKU QUE SOLO VIENE EN EL MULTIPAÍS NO VALE CERO ===');
  /* La misma pantalla enseñaba «0 unidades» en la tabla de cobertura y «1.400»
     en la tabla de stock por país, tres filas más abajo. Y el histórico
     archivaba ese cero, que es un dato que no se puede reconstruir. */
  const multi = await page.evaluate(js(`
    DB.imports.inventory = {count:1, file:'i', rows:[{sku:'LENTO', afnfulfillablequantity:'50'}]};
    DB.imports.multicountry = {count:4, file:'m', rows:[
      {sellersku:'RAPIDO', country:'DE', quantityforlocalfulfillment:'200'},
      {sellersku:'RAPIDO', country:'FR', quantityforlocalfulfillment:'100'},
      {sellersku:'RAPIDO', country:'IT', quantityforlocalfulfillment:'50'},
      {sellersku:'LENTO',  country:'ES', quantityforlocalfulfillment:'50'}]};
    const I = invStats(), g = k => I.filter(x=>x.sku===k)[0];
    const r = g('RAPIDO');
    return {qty:r.qty, porPais:r.byCountry, sumaPais:Object.keys(r.byCountry).reduce((a,c)=>a+r.byCountry[c],0),
            lento:g('LENTO').qty};
  `));
  check('el SKU que solo está en el multipaís cuenta sus 350 unidades',
    multi.qty===350, multi.qty+' ud · con el fallo eran 0');
  check('y la tabla de países suma lo mismo que la columna de stock',
    multi.sumaPais===multi.qty, multi.sumaPais+' = '+multi.qty);
  check('el que sí viene en el informe de inventario no se cuenta dos veces',
    multi.lento===50, multi.lento+' ud · 50 del informe, no 50+50');

  console.log('\n=== INV-C · LO QUE YA ESTÁ EN UN BARCO CUENTA ===');
  /* Punto de pedido = velocidad × (plazo + colchón) = 10 × (30+35) = 650 ud.
     Con 300 en almacén, faltarían 350. Pero si hay 400 en un barco, no hace
     falta pedir nada. Sin esto, el ejemplo pedía 421 unidades de una
     referencia que tenía 900 llegando, y encima la marcaba en rotura. */
  const transito = await page.evaluate(js(`
    DB.imports.inventory = {count:1, file:'i', rows:[{sku:'RAPIDO', afnfulfillablequantity:'300'}]};
    const g = () => invStats().filter(x=>x.sku==='RAPIDO')[0];
    const sin = g();
    DB.pos = [{id:'p1', ref:'PO-1', supplierId:'s1', status:'transit', freight:0,
               items:[{sku:'RAPIDO', qty:400, unitCost:5}], payments:[]}];
    const con = g();
    DB.pos[0].status='received';
    const recibido = g();
    return {rp:sin.reorderPoint, sinPedir:sin.need, conPedir:con.need,
            enCamino:con.enCamino, recibidoEnCamino:recibido.enCamino};
  `));
  check('el punto de pedido es 650 unidades', transito.rp===650,
    transito.rp+' = 10 ud/día × (30 de plazo + 35 de colchón)');
  check('sin nada en camino, hay que pedir 350', transito.sinPedir===350,
    transito.sinPedir+' = 650 − 300 en almacén');
  check('con 400 en un barco, ya no hace falta pedir', transito.conPedir===0,
    transito.conPedir+' · con el fallo seguía pidiendo 350 que ya venían');
  check('y un pedido ya recibido deja de contar como en camino',
    transito.recibidoEnCamino===0, transito.recibidoEnCamino+' · ya está en el almacén, contarlo sería contarlo dos veces');

  console.log('\n=== INV-D · LA COBERTURA DE LA CARTERA NO ES LA MEDIA DE LAS COBERTURAS ===');
  /* RAPIDO: 300 ud a 10/día = 30 d. LENTO: 3.000 ud a 1/día = 3.000 d.
       cobertura de la cartera = 3.300 ud / 11 ud-día    =   300 d
       media de las coberturas = (30 + 3.000) / 2        = 1.515 d
       con el tope de 365      = (30 +   365) / 2        =   198 d
     Ninguno de los dos promedios describe nada: el titular de 198 días se lee
     «voy sobrado» con una referencia que se agota en un mes. */
  const cartera = await page.evaluate(js(`
    DB.imports.inventory = {count:2, file:'i', rows:[
      {sku:'RAPIDO', afnfulfillablequantity:'300'},
      {sku:'LENTO',  afnfulfillablequantity:'3000'}]};
    go('inventario');
    const I = invStats();
    const stock = I.reduce((a,r)=>a+r.qty,0), vel = I.reduce((a,r)=>a+r.velocity,0);
    const kpis = [...document.querySelectorAll('#invKpis .kpi')]
      .map(x=>x.querySelector('.k-name').textContent+'='+x.querySelector('.k-val').textContent);
    return {cartera: stock/vel,
            mediaConTope: I.reduce((a,r)=>a+Math.min(r.cover,365),0)/I.length,
            kpis};
  `));
  cartera.kpis.forEach(k=>console.log('     '+k));
  check('la cobertura de la cartera son 300 días', Math.round(cartera.cartera)===300,
    Math.round(cartera.cartera)+' d = 3.300 ud / 11 al día');
  check('y la pantalla enseña ese número, no la media de 198',
    cartera.kpis.some(k=>/cartera=300 d/i.test(k.replace(/\s+/g,''))
                      || /Cobertura de la cartera=300 d/.test(k)),
    cartera.kpis.filter(k=>/[Cc]obertura/.test(k)).join(' · ')+
    ' · la media con tope daba '+Math.round(cartera.mediaConTope)+' d');

  console.log('\n=== INV-E · UNA REFERENCIA MUERTA NO SUBE LA COBERTURA DE NADIE ===');
  /* El centinela de «venta cero» valía 999 y entraba en la media como 365: una
     sola referencia parada subía el titular un 34 %. Dividiendo totales, una
     referencia sin ventas suma su stock y no suma velocidad, que es lo que
     hace de verdad. */
  const muerta = await page.evaluate(js(`
    DB.products.push({id:'c', sku:'MUERTO', name:'Muerto', cogs:4, freight:1, fba:3,
                      referral:15, price:20, channel:'FBA', supplierId:'s1', lots:[]});
    DB.imports.inventory = {count:3, file:'i', rows:[
      {sku:'RAPIDO', afnfulfillablequantity:'300'},
      {sku:'LENTO',  afnfulfillablequantity:'300'},
      {sku:'MUERTO', afnfulfillablequantity:'500'}]};
    const I = invStats();
    const stock = I.reduce((a,r)=>a+r.qty,0), vel = I.reduce((a,r)=>a+r.velocity,0);
    const m = I.filter(x=>x.sku==='MUERTO')[0];
    return {cartera: stock/vel, cover:m.cover, vel:m.velocity,
            mediaConTope: I.reduce((a,r)=>a+Math.min(r.cover,365),0)/I.length};
  `));
  check('la referencia parada se marca con cobertura infinita, no con 365',
    muerta.cover>900 && muerta.vel===0, muerta.cover+' · la tabla pinta ∞');
  check('y la cobertura de la cartera la cuenta por lo que es: stock sin salida',
    Math.round(muerta.cartera)===100,
    Math.round(muerta.cartera)+' d = 1.100 ud / 11 al día · la media con tope daba '+
    Math.round(muerta.mediaConTope)+' d, un 253 % más');

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
