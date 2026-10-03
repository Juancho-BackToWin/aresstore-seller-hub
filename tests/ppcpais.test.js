#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   PUBLICIDAD · CAMPAÑA Y PAÍS, Y CAMPAÑAS RENOMBRADAS ENTRE INFORMES
   (tarde del 3-10-2026, bloques 2 y 4 del prompt maestro)

   Laboratorio (cifras inventadas, nada del negocio):
     SKUs FBANS0101, FBANS0102 (grupo FBANS) y FBASPB0101.
     Ventas, 30 días, una unidad al día de cada uno a 25, 25 y 20 €
       → ingresos 750, 750 y 600 (total 2.100), sin IVA.

   BLOQUE 2 · «NS EXACTA» existe en España (1,00 €/día) y en Italia
   (2,00 €/día) con el mismo nombre. Informe de 30 días: 30 + 60 = 90,00 €.
     a) Asignación GUARDADA ANTES del arreglo, por nombre: {'ns exacta': FBANS}.
        Tiene que seguir valiendo para los dos países: 90,00 € imputados.
     b) Italia se asigna aparte a FBASPB:
          ES 30 € → FBANS0101 y FBANS0102 por ingreso: 15,00 + 15,00
          IT 60 € → FBASPB0101:                        60,00
        Suma 90,00 €. Sin el arreglo, la asignación de Italia pisaba la
        general y los 90 € iban a FBASPB.
     c) Se vacía la casilla de Italia (hay general debajo): Italia queda
        «sin asignar», no hereda. Imputado 30,00 €; los 60,00 € de Italia
        se reparten por ingreso:
          FBASPB0101 = 60 × 600/2.100              = 17,14 €
          cada FBANS = 15 + 60 × 750/2.100 = 15 + 21,43 = 36,43 €
        Suma 90,00 €. La general sigue guardada.

   BLOQUE 4 · Dos ficheros, España, 1,00 €/día, los mismos cuatro términos y
   el mismo grupo de anuncios:
     f1 «NS EXACTA»       de hace 29 días a hace 10  (20 días · 20,00 €)
     f2 «NS EXACTA 2026»  de hace 19 días a hace 0   (20 días · 20,00 €)
   Días contados por los dos: de hace 19 a hace 10 = 10 días.
   Gasto en juego = Σ min(1,1) = 10,00 €, todo dentro de los 30 días.
   Controles que NO deben avisarse:
     f3 trae «NS BROAD» y «NS PHRASE» los mismos días (hace 5…0) y los mismos
     términos entre sí (otros que los de arriba): un fichero que las trae
     juntas dice que eran dos campañas vivas a la vez.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b)=> typeof a==='number' && Math.abs(a-b) < 0.01;
const n2 = x => typeof x==='number' ? x.toFixed(2) : String(x);

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const page = await (await browser.newContext({timezoneId:'Europe/Madrid'})).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);
  const ev = async src => { try{ return await page.evaluate(src); }
    catch(e){ return {__err:String(e&&e.message||e).split('\n')[0].slice(0,160)}; } };

  /* Laboratorio común: catálogo y ventas. */
  await page.evaluate(()=>{
    window.__dia = k => { const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-k);
      return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    DB = blankDB();
    DB.products = [
      {id:'a', sku:'FBANS0101', name:'Pulsera piedra natural', cogs:2, freight:0, fba:2, referral:15, price:25, channel:'FBA', lots:[]},
      {id:'b', sku:'FBANS0102', name:'Pulsera piedra natural', cogs:2, freight:0, fba:2, referral:15, price:25, channel:'FBA', lots:[]},
      {id:'c', sku:'FBASPB0101', name:'Pulsera cuero trenzado', cogs:3, freight:0, fba:2, referral:15, price:20, channel:'FBA', lots:[]}];
    const ventas = [];
    for(let k=0;k<30;k++)
      [['FBANS0101',25],['FBANS0102',25],['FBASPB0101',20]].forEach(([sku,pr])=>ventas.push({amazonorderid:'o'+k+sku,
        purchasedate:__dia(k)+'T10:00:00+00:00', fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku, asin:'B0'+sku,
        itemstatus:'Shipped', quantity:'1', itemprice:String(pr), itemtax:'0', shipcountry:'ES'}));
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'lab'};
    periodDays = 30; countryFilter = 'ALL';
  });
  const porSku = `(()=>{ const P=pnl(); const o={}; const L=P.bySku||{};
     (Array.isArray(L)?L:Object.values(L)).forEach(b=>{ if(b&&b.sku) o[b.sku]=b.ppc; });
     return {ppc:P.ppc, imp:P.ppcImputado, sk:o}; })()`;

  console.log('=== BLOQUE 2 · la misma campaña en dos países se asigna por país ===');
  await page.evaluate(()=>{
    const st = [];
    for(let k=0;k<30;k++){
      st.push({_term:'piedra '+k, _campaign:'NS EXACTA', country:'España', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'});
      st.push({_term:'pietra '+k, _campaign:'NS EXACTA', country:'Italia', _from:__dia(k), _to:__dia(k), _spend:'2', _sales:'0', _clicks:'5', _impr:'100'});
    }
    DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
    /* Una asignación guardada antes del arreglo: la clave es el nombre plegado. */
    DB.ppcAsig = {'ns exacta': {prefijos:['FBANS'], fecha:'2026-10-02'}};
    saveDB();
  });
  const a = await ev(porSku);
  check('a) el laboratorio da 90,00 € de publicidad', !a.__err && near(a.ppc, 90), a.__err || n2(a.ppc));
  check('a) la asignación guardada antes, solo por nombre, sigue valiendo en los dos países: 90,00 € imputados',
    !a.__err && near(a.imp, 90), a.__err || n2(a.imp));
  const filas = await ev(`pubPpcPorCampana().map(c=>({campana:c.campana, pais:c.pais, gasto:c.gasto, propia:c.asig&&c.asig.propia}))`);
  check('a) «NS EXACTA» sale en dos filas, ES 30,00 € e IT 60,00 €, heredando la general',
    Array.isArray(filas) && filas.length===2 &&
    filas.some(f=>f.pais==='ES' && near(f.gasto,30) && f.propia===false) &&
    filas.some(f=>f.pais==='IT' && near(f.gasto,60) && f.propia===false), JSON.stringify(filas));

  await ev(`pubAsignar('NS EXACTA','FBASPB','IT')`);
  const b = await ev(porSku);
  const bs = b.sk||{};
  check('b) Italia asignada aparte: FBASPB0101 lleva 60,00 € (sin el arreglo, 90,00 €)',
    !b.__err && near(bs.FBASPB0101, 60), b.__err || ('FBASPB0101 '+n2(bs.FBASPB0101)));
  check('b) España sigue con la general: 15,00 € a cada FBANS',
    !b.__err && near(bs.FBANS0101, 15) && near(bs.FBANS0102, 15), b.__err || (n2(bs.FBANS0101)+' · '+n2(bs.FBANS0102)));
  check('b) imputado 90,00 € y la suma no cambia',
    !b.__err && near(b.imp, 90) && near((bs.FBANS0101||0)+(bs.FBANS0102||0)+(bs.FBASPB0101||0), 90), b.__err || n2(b.imp));
  const claves = await ev(`Object.keys(DB.ppcAsig).sort().join(',')`);
  check('b) se guarda «ns exacta|IT» y la general sigue intacta', claves==='ns exacta,ns exacta|IT', String(claves));

  await ev(`pubAsignar('NS EXACTA','','IT')`);
  const c = await ev(porSku);
  const cs = c.sk||{};
  check('c) vaciar Italia la deja sin asignar en vez de heredar: imputado 30,00 €',
    !c.__err && near(c.imp, 30), c.__err || n2(c.imp));
  check('c) los 60,00 € de Italia se reparten por ingreso: FBASPB 17,14 €, cada FBANS 36,43 €',
    !c.__err && near(cs.FBASPB0101, 17.142857) && near(cs.FBANS0101, 36.428571) && near(cs.FBANS0102, 36.428571),
    c.__err || (n2(cs.FBASPB0101)+' · '+n2(cs.FBANS0101)+' · '+n2(cs.FBANS0102)));
  const gen = await ev(`!!DB.ppcAsig['ns exacta'] && !!(DB.ppcAsig['ns exacta|IT']||{}).sinAsignar`);
  check('c) la general sigue guardada y Italia queda marcada «sin asignar»', gen===true, String(gen));

  await page.evaluate(()=>{ go('publicidad'); });
  await page.waitForTimeout(400);
  const ui = await page.evaluate(()=>{ const t=document.getElementById('pubAsigTable');
    return t ? Array.from(t.querySelectorAll('input[data-campana]')).map(i=>i.getAttribute('data-pais')).sort().join(',') : ''; });
  check('la tabla «Campañas → producto» tiene una casilla por país', ui==='ES,IT', ui);

  console.log('\n=== BLOQUE 4 · campaña renombrada entre dos informes ===');
  await page.evaluate(()=>{
    const st = [];
    const fila = (fid, camp, k, term, grupo) => ({_term:term, _campaign:camp, adgroupname:grupo, country:'España',
      _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100', __fs:fid});
    for(let k=29;k>=10;k--) st.push(fila('f1','NS EXACTA', k, 'piedra '+(k%4), 'NS'));
    for(let k=19;k>=0;k--)  st.push(fila('f2','NS EXACTA 2026', k, 'piedra '+(k%4), 'NS'));
    for(let k=5;k>=0;k--){  st.push(fila('f3','NS BROAD', k, 'cuero '+(k%4), 'CUERO'));
                            st.push(fila('f3','NS PHRASE', k, 'cuero '+(k%4), 'CUERO')); }
    DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
    DB.ppcAsig = {}; periodDays = 30; countryFilter = 'ALL'; saveDB();
  });
  const r = await ev(`(()=>{ const A = pubAdStats(); return {spend:A.spend, R:A.renombradas}; })()`);
  const R = (r && r.R) || [];
  check('se detecta exactamente una campaña renombrada', !r.__err && Array.isArray(r.R) && R.length===1,
    r.__err || JSON.stringify(R).slice(0,240));
  if(R.length===1){
    const x = R[0];
    check('es «NS EXACTA» ↔ «NS EXACTA 2026», en ES', [x.a,x.b].sort().join(' / ')==='NS EXACTA / NS EXACTA 2026' && x.pais==='ES',
      x.a+' / '+x.b+' ('+x.pais+')');
    check('10 días contados por los dos, 4 términos en común', x.dias===10 && x.comunes===4, x.dias+' días · '+x.comunes+' términos');
    check('gasto en juego 10,00 €, todo dentro del periodo', near(x.gasto, 10) && near(x.gastoPeriodo, 10),
      n2(x.gasto)+' · en el periodo '+n2(x.gastoPeriodo));
  }
  check('«NS BROAD» y «NS PHRASE», que un mismo fichero trae juntas, no se avisan',
    !R.some(x=>/BROAD|PHRASE/.test(x.a+x.b)), JSON.stringify(R.map(x=>x.a+'/'+x.b)));
  /* La cifra de gasto no cambia: el bloque solo avisa. 20 + 20 + 6 + 6 = 52 €. */
  check('el hub no funde nada: el gasto sigue siendo 52,00 €', !r.__err && near(r.spend, 52), r.__err || n2(r.spend));

  await page.evaluate(()=>{ go('dashboard'); go('publicidad'); });
  await page.waitForTimeout(400);
  const txt = await page.evaluate(()=>{ const v=document.getElementById('stVerdict'); return v ? v.textContent : ''; });
  check('la pantalla lo dice, con el gasto en juego', /parece renombrada/.test(txt) && /10,00/.test(txt),
    (txt.match(/Una campaña parece[^.]*\./)||[''])[0].slice(0,200) || 'sin aviso');

  console.log('\n=== REVISIÓN ADVERSARIAL DE LA TARDE DEL 3-10-2026 ===');
  /* H1 · El MISMO término en dos países. «NS EXACTA», término «pulsera», 30 días:
     España 1 €/día (30 €), Italia 2 €/día (60 €). General FBANS, Italia FBASPB.
     Debe salir: FBANS 15 + 15, FBASPB 60. Antes: un solo grupo con el país de
     la primera fila, ES 90 € → FBANS 45 + 45, FBASPB 0. Con filtro IT: 60 € imputados. */
  const h1 = await ev(`(()=>{ const st=[];
    for(let k=0;k<30;k++){
      st.push({_term:'pulsera', _campaign:'NS EXACTA', country:'España', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'});
      st.push({_term:'pulsera', _campaign:'NS EXACTA', country:'Italia', _from:__dia(k), _to:__dia(k), _spend:'2', _sales:'0', _clicks:'5', _impr:'100'}); }
    DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
    DB.ppcAsig = {'ns exacta':{prefijos:['FBANS']}, 'ns exacta|IT':{prefijos:['FBASPB']}};
    periodDays=30; countryFilter='ALL'; const P=pnl(); const o={}; Object.values(P.bySku).forEach(b=>o[b.sku]=b.ppc);
    return {o, imp:P.ppcImputado}; })()`);
  check('H1 · el mismo término en ES e IT: FBANS 15,00 + 15,00, FBASPB 60,00 (antes 45 + 45 y 0)',
    !h1.__err && near(h1.o.FBANS0101,15) && near(h1.o.FBANS0102,15) && near(h1.o.FBASPB0101,60),
    h1.__err || (n2(h1.o.FBANS0101)+' · '+n2(h1.o.FBANS0102)+' · '+n2(h1.o.FBASPB0101)));

  /* H2 · En el periodo solo gasta Italia (60 €), que tiene asignación propia
     FBASPB, y hay una general FBANS. Debe salir FBASPB 60. Antes: la general,
     FBANS 30 + 30. Con Italia «sin asignar»: reparto por ingreso de 60 €,
     FBASPB 60×600/2.100 = 17,14, cada FBANS 60×750/2.100 = 21,43. */
  const h2 = await ev(`(()=>{ const st=[];
    for(let k=0;k<30;k++) st.push({_term:'pietra', _campaign:'NS EXACTA', country:'Italia', _from:__dia(k), _to:__dia(k), _spend:'2', _sales:'0', _clicks:'5', _impr:'100'});
    DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
    DB.ppcAsig = {'ns exacta':{prefijos:['FBANS']}, 'ns exacta|IT':{prefijos:['FBASPB']}};
    periodDays=30; countryFilter='ALL'; const P=pnl(); const o={}; Object.values(P.bySku).forEach(b=>o[b.sku]=b.ppc);
    const fila = pubPpcPorCampana()[0];
    DB.ppcAsig['ns exacta|IT'] = {sinAsignar:true}; const P2=pnl(); const o2={}; Object.values(P2.bySku).forEach(b=>o2[b.sku]=b.ppc);
    return {o, o2, clave:fila.paisClave}; })()`);
  check('H2 · un solo país en el periodo con asignación propia: FBASPB 60,00 € (antes 0)',
    !h2.__err && near(h2.o.FBASPB0101,60) && near(h2.o.FBANS0101,0), h2.__err || (n2(h2.o.FBASPB0101)+' · FBANS '+n2(h2.o.FBANS0101)));
  check('H2 · y su casilla escribe en la clave del país, no en la general', !h2.__err && h2.clave==='IT', h2.__err || String(h2.clave));
  check('H2 · Italia «sin asignar» con un solo país: reparto por ingreso, FBASPB 17,14 €, cada FBANS 21,43 €',
    !h2.__err && near(h2.o2.FBASPB0101,17.142857) && near(h2.o2.FBANS0101,21.428571),
    h2.__err || (n2(h2.o2.FBASPB0101)+' · '+n2(h2.o2.FBANS0101)));

  /* H3 · Nombres con «|». El caso del bloque 4 con «SP | NS | EXACTA» y
     «SP | NS | EXACTA 2026»: el mismo aviso de 10,00 € (antes ninguno). */
  /* H5 · Una campaña vieja que casa con DOS nuevas de un mismo informe:
     f1 «NS VIEJA» días 29…10; f2 «NS EXACTA 26» y «NS FRASE 26» días 19…0,
     mismos términos y grupo, 1 €/día. Cada día común: f1 cuenta 1, f2 cuenta 2;
     sobra como mucho 3 − 2 = 1 €/día → 10,00 € (antes 20,00 €, dos parejas). */
  const h35 = await ev(`(()=>{ const fila = (fid, camp, k, term) => ({_term:term, _campaign:camp, adgroupname:'NS', country:'España',
      _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100', __fs:fid});
    let st=[];
    for(let k=29;k>=10;k--) st.push(fila('f1','SP | NS | EXACTA', k, 'piedra '+(k%4)));
    for(let k=19;k>=0;k--)  st.push(fila('f2','SP | NS | EXACTA 2026', k, 'piedra '+(k%4)));
    DB.imports.searchterm = {rows:st, count:st.length, file:'lab'}; DB.ppcAsig={};
    const A1 = pubAdStats();
    st=[];
    for(let k=29;k>=10;k--) st.push(fila('f1','NS VIEJA', k, 'piedra '+(k%4)));
    for(let k=19;k>=0;k--){ st.push(fila('f2','NS EXACTA 26', k, 'piedra '+(k%4))); st.push(fila('f2','NS FRASE 26', k, 'piedra '+(k%4))); }
    DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
    const A2 = pubAdStats();
    return {n1:A1.renombradas.length, t1:A1.renombradas.total, n2:A2.renombradas.length, t2:A2.renombradas.total, tp2:A2.renombradas.totalPeriodo}; })()`);
  check('H3 · nombres con «|» también se detectan: 1 aviso de 10,00 € (antes ninguno)',
    !h35.__err && h35.n1===1 && near(h35.t1,10), h35.__err || (h35.n1+' · '+n2(h35.t1)));
  check('H5 · una vieja con dos nuevas del mismo informe: hasta 10,00 €, no 20,00 €',
    !h35.__err && h35.n2===2 && near(h35.t2,10) && near(h35.tp2,10), h35.__err || (h35.n2+' parejas · '+n2(h35.t2)+' · periodo '+n2(h35.tp2)));

  /* H6 · CON EL FILTRO DE UN PAÍS, LA PUBLICIDAD DE ESE PAÍS (encontrado al
     probar H1; venía de antes). Ventas: FBANS0101 en ES (25 €/día) y
     FBASPB0101 en IT (20 €/día), 30 días. Publicidad «NS EXACTA»: ES 1 €/día
     (30 €), IT 2 €/día (60 €), y 1 €/día SIN país (30 €, un informe viejo).
     Total 120 €. Con país: 90 € (ES 30, IT 60).
       Filtro ES: 30 + 30 × 30/90 = 40,00 €   (antes 120,00 €)
       Filtro IT: 60 + 30 × 60/90 = 80,00 €   (antes 120,00 €)
       40 + 80 = 120: la suma de los países es el total.
     Asignación general FBANS e Italia FBASPB:
       ES imputa sus 30 € a FBANS0101 (la parte sin país no tiene país que la
       asigne y se reparte): FBANS0101 lleva los 40,00 €.
       IT imputa 60 € a FBASPB0101 y reparte 20 €: FBASPB0101 lleva 80,00 €. */
  const h6 = await ev(`(()=>{ DB.products=[{id:'a',sku:'FBANS0101',name:'x',cogs:2,freight:0,fba:2,referral:15,price:25,channel:'FBA',lots:[]},
      {id:'c',sku:'FBASPB0101',name:'y',cogs:2,freight:0,fba:2,referral:15,price:20,channel:'FBA',lots:[]}];
    const v=[], st=[];
    for(let k=0;k<30;k++){
      [['FBANS0101','ES',25],['FBASPB0101','IT',20]].forEach(([s,c,p])=>v.push({amazonorderid:'h6'+k+s, purchasedate:__dia(k)+'T10:00:00+00:00',
        fulfillmentchannel:'Amazon', saleschannel:'Amazon.'+c.toLowerCase(), sku:s, asin:'B'+s, itemstatus:'Shipped', quantity:'1',
        itemprice:String(p), itemtax:'0', shipcountry:c}));
      st.push({_term:'pulsera', _campaign:'NS EXACTA', country:'España', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'});
      st.push({_term:'pulsera', _campaign:'NS EXACTA', country:'Italia', _from:__dia(k), _to:__dia(k), _spend:'2', _sales:'0', _clicks:'5', _impr:'100'});
      st.push({_term:'pulsera', _campaign:'NS EXACTA', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'}); }
    DB.imports.orders={rows:v, count:v.length, file:'lab'}; DB.imports.searchterm={rows:st, count:st.length, file:'lab'};
    DB.ppcAsig={'ns exacta':{prefijos:['FBANS']}, 'ns exacta|IT':{prefijos:['FBASPB']}}; periodDays=30;
    const r={}; ['ALL','ES','IT'].forEach(cf=>{ countryFilter=cf; const P=pnl(); const o={};
      Object.values(P.bySku).forEach(b=>o[b.sku]=b.ppc); r[cf]={ppc:P.ppc, imp:P.ppcImputado, o, cuota:P.ppcPaisCuota}; });
    countryFilter='ALL'; return r; })()`);
  check('H6 · sin filtro, 120,00 € de publicidad', !h6.__err && near(h6.ALL.ppc,120), h6.__err || n2(h6.ALL.ppc));
  check('H6 · filtro ES: 40,00 € (30 de España + su parte de lo sin país), no los 120 de todos',
    !h6.__err && near(h6.ES.ppc,40), h6.__err || n2(h6.ES.ppc));
  check('H6 · filtro IT: 80,00 €, y ES + IT = 120,00 €', !h6.__err && near(h6.IT.ppc,80) && near(h6.ES.ppc+h6.IT.ppc,120),
    h6.__err || n2(h6.IT.ppc));
  check('H6 · ES: FBANS0101 lleva 40,00 € (30 imputados)', !h6.__err && near(h6.ES.o.FBANS0101,40) && near(h6.ES.imp,30),
    h6.__err || (n2(h6.ES.o.FBANS0101)+' · imputado '+n2(h6.ES.imp)));
  check('H6 · IT: FBASPB0101 lleva 80,00 € (60 imputados)', !h6.__err && near(h6.IT.o.FBASPB0101,80) && near(h6.IT.imp,60),
    h6.__err || (n2(h6.IT.o.FBASPB0101)+' · imputado '+n2(h6.IT.imp)));

  console.log('\n=== SEGUNDA REVISIÓN · TARDE DEL 3-10-2026 ===');
  /* Laboratorio de la segunda revisión: FBANS0101 vende en ES (25 €/día) y
     FBASPB0101 en IT (20 €/día), 30 días; sin asignaciones. Una función
     carga filas de publicidad y devuelve el P&L por país. */
  await page.evaluate(()=>{ window.__pais = (st, extra) => {
    DB.products=[{id:'a',sku:'FBANS0101',name:'x',cogs:2,freight:0,fba:2,referral:15,price:25,channel:'FBA',lots:[]},
      {id:'c',sku:'FBASPB0101',name:'y',cogs:2,freight:0,fba:2,referral:15,price:20,channel:'FBA',lots:[]}];
    const v=[]; for(let k=0;k<30;k++) [['FBANS0101','ES',25],['FBASPB0101','IT',20]].forEach(([s,c,p])=>v.push({amazonorderid:'s'+k+s,
      purchasedate:__dia(k)+'T10:00:00+00:00', fulfillmentchannel:'Amazon', saleschannel:'Amazon.'+c.toLowerCase(), sku:s, asin:'B'+s,
      itemstatus:'Shipped', quantity:'1', itemprice:String(p), itemtax:'0', shipcountry:c}));
    DB.imports.orders={rows:v, count:v.length, file:'lab'};
    DB.imports.searchterm = st.length ? {rows:st, count:st.length, file:'lab'} : undefined;
    if(!st.length) delete DB.imports.searchterm;
    DB.ppcAsig=(extra&&extra.asig)||{}; periodDays=30; DB.settings.cash.ppcDaily = (extra&&extra.diario)||0;
    const r={}; ['ALL','ES','IT','DE'].forEach(cf=>{ countryFilter=cf; const P=pnl();
      const Q=(typeof cascada==='function') ? cascada(P) : null; const L = Q && Q.lineas;
      const lin = Array.isArray(L) ? L.filter(x=>x.id==='publicidad')[0] : null;
      r[cf]={ppc:P.ppc, imp:P.ppcImputado, sinDato:P.ppcPaisSinDato, calidad: lin ? lin.calidad : null}; });
    countryFilter='ALL'; DB.settings.cash.ppcDaily = 0; return r; }; });
  const __dia = k => { const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-k);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const fila = (camp, pais, k, gasto, term) => Object.assign({_campaign:camp, _from:__dia(k), _to:__dia(k), _spend:String(gasto),
    _sales:'0', _clicks:'5', _impr:'100'}, term===null ? {} : {_term:term||'pulsera'}, pais ? {country:pais} : {});

  /* S2 · Informe que NO toca el periodo: días 60…31, ES 1 €/día e IT 2 €/día.
     Todo es extrapolado (90 €). Con filtro, ES 90 × 30/90 = 30, IT 60, DE 0.
     Antes: 90 los tres, y sin aviso. */
  const s2rows=[]; for(let k=60;k>=31;k--){ s2rows.push(fila('NS EXACTA','España',k,1)); s2rows.push(fila('NS EXACTA','Italia',k,2)); }
  const s2 = await ev(`__pais(${JSON.stringify(s2rows)})`);
  check('S2 · informe fuera del periodo: ES 30,00 · IT 60,00 · DE 0,00 (antes 90 los tres)',
    !s2.__err && near(s2.ES.ppc,30) && near(s2.IT.ppc,60) && near(s2.DE.ppc,0),
    s2.__err || [s2.ES.ppc,s2.IT.ppc,s2.DE.ppc].map(n2).join(' · '));
  check('S2 · y la línea no se llama «medida»: es extrapolada', !s2.__err && s2.ALL.calidad==='estimado', s2.__err || String(s2.ALL.calidad));

  /* S3 · Filas SIN término con país: ES 1 €/día e IT 1 €/día con término, e
     IT 2 €/día sin término. Total 120. ES 30, IT 90 (antes 60 y 60). */
  const s3rows=[]; for(let k=0;k<30;k++){ s3rows.push(fila('NS EXACTA','España',k,1)); s3rows.push(fila('NS EXACTA','Italia',k,1));
    s3rows.push(fila('SD IT','Italia',k,2,null)); }
  /* «NS EXACTA» asignada a FBANS: en ES imputa sus 30 €, ni uno más (con el
     factor del total, 30 × 120/60 = 60 €, el doble de lo que tiene España). */
  const s3 = await ev(`__pais(${JSON.stringify(s3rows)}, {asig:{'ns exacta':{prefijos:['FBANS']}}})`);
  check('S3 · filas sin término van a su país: ES 30,00 · IT 90,00 (antes 60 y 60)',
    !s3.__err && near(s3.ES.ppc,30) && near(s3.IT.ppc,90), s3.__err || n2(s3.ES.ppc)+' · '+n2(s3.IT.ppc));
  check('S3 · con filtro, nunca se imputa más de lo que tiene el país: ES imputa 30,00 de 30,00',
    !s3.__err && near(s3.ES.imp,30) && s3.IT.imp<=s3.IT.ppc+0.01,
    s3.__err || ('ES '+n2(s3.ES.imp)+'/'+n2(s3.ES.ppc)+' · IT '+n2(s3.IT.imp)+'/'+n2(s3.IT.ppc)));

  /* S6 · «Deutschland» 1 €/día e «Italia» 2 €/día: DE 30, IT 60 (antes DE 0). */
  const s6rows=[]; for(let k=0;k<30;k++){ s6rows.push(fila('NS DE','Deutschland',k,1)); s6rows.push(fila('NS IT','Italia',k,2)); }
  const s6 = await ev(`__pais(${JSON.stringify(s6rows)})`);
  check('S6 · «Deutschland» es Alemania: DE 30,00 · IT 60,00 (antes DE 0,00)',
    !s6.__err && near(s6.DE.ppc,30) && near(s6.IT.ppc,60), s6.__err || n2(s6.DE.ppc)+' · '+n2(s6.IT.ppc));
  const s6b = await ev(`[pubPaisCodigo('Atlantis'), pubPaisCodigo('allemagne'), pubPaisCodigo('')].join(',')`);
  check('S6 · un nombre que no se reconoce va a «sin país», no a un país propio', s6b==='??,DE,??', String(s6b));

  /* S5 · Sin informe, gasto diario de ajustes 3 €: con filtro es de toda la
     cuenta y se dice (`ppcPaisSinDato`). */
  const s5 = await ev(`__pais([], {diario:3})`);
  check('S5 · gasto diario con filtro: se marca como gasto de todos los países', !s5.__err && s5.ES.sinDato===true && near(s5.ES.ppc,90),
    s5.__err || (s5.ES.sinDato+' · '+n2(s5.ES.ppc)));

  /* S7 · El aviso de Rentabilidad «el informe no trae país» solo si es verdad. */
  await ev(`__pais(${JSON.stringify(s3rows)})`);
  const s7 = await page.evaluate(()=>{ countryFilter='ES'; let t='';
    try{ go('rentabilidad'); renderRent(); t = document.getElementById('view-rentabilidad').textContent; }catch(e){ t='ERROR '+e.message; }
    countryFilter='ALL'; return /productos generan/.test(t) ? /no trae país: el gasto que ves es el de/.test(t) : 'sin veredicto: '+t.slice(0,80); });
  check('S7 · con un informe que sí trae país, Rentabilidad ya no dice que no lo trae', s7===false, String(s7));

  /* S8 · Una vieja SIN país (f1, días 29…10) casa con una nueva de ES y otra
     de IT del mismo f2 (días 19…0), 1 €/día. Sobra como mucho 1 €/día × 10. */
  const s8 = await ev(`(()=>{ const f=(fid,camp,pais,k,t)=>Object.assign({_term:t, _campaign:camp, adgroupname:'NS', _from:__dia(k), _to:__dia(k),
      _spend:'1', _sales:'0', _clicks:'5', _impr:'100', __fs:fid}, pais?{country:pais}:{});
    const st=[]; for(let k=29;k>=10;k--) st.push(f('f1','NS EXACTA',null,k,'piedra '+(k%4)));
    for(let k=19;k>=0;k--){ st.push(f('f2','NS EXACTA ES','España',k,'piedra '+(k%4))); st.push(f('f2','NS EXACTA IT','Italia',k,'piedra '+(k%4))); }
    DB.imports.searchterm={rows:st, count:st.length, file:'lab'}; const R=pubAdStats().renombradas; return {n:R.length, t:R.total}; })()`);
  check('S8 · vieja sin país con dos nuevas ES e IT: hasta 10,00 €, no 20,00 €', !s8.__err && near(s8.t,10), s8.__err || (s8.n+' parejas · '+n2(s8.t)));

  console.log('\n=== TERCERA REVISIÓN · TARDE DEL 3-10-2026 ===');
  const ff = (fid, camp, pais, k, gasto, term) => Object.assign(fila(camp, pais, k, gasto, term), fid ? {__fs:fid} : {});
  /* E1b · Dos informes: f1 España 10 €/día de hace 29 a hace 20 (100 €); f2
     Italia 1 €/día de hace 9 a hoy (10 €). El hueco de hace 19 a hace 10 se
     extrapola al ritmo del último tramo, el italiano: 10 días × 1 € = 10 €.
     Total 120. Esperado: ES 100,00 · IT 20,00. Antes: con la mezcla de lo
     observado (100/110 España), ES 109,09 · IT 10,91. */
  const e1 = []; for(let k=29;k>=20;k--) e1.push(ff('f1','NS ES','España',k,10)); for(let k=9;k>=0;k--) e1.push(ff('f2','NS IT','Italia',k,1));
  const r1 = await ev(`__pais(${JSON.stringify(e1)})`);
  check('E1 · lo extrapolado va con la mezcla de su tramo: ES 100,00 · IT 20,00 (antes 109,09 · 10,91)',
    !r1.__err && near(r1.ALL.ppc,120) && near(r1.ES.ppc,100) && near(r1.IT.ppc,20), r1.__err || [r1.ALL.ppc,r1.ES.ppc,r1.IT.ppc].map(n2).join(' · '));
  /* E2 · Informe italiano fuera del periodo (2 €/día, hace 60…31: 60 € al
     ritmo de Italia) y una fila española SIN fecha de 5 €. Total 65.
     Esperado ES 5 · IT 60. Antes: ES 65 · IT 0. */
  const e2 = []; for(let k=60;k>=31;k--) e2.push(fila('NS IT','Italia',k,2));
  e2.push({_term:'pulsera', _campaign:'NS ES', country:'España', _spend:'5', _sales:'0', _clicks:'5', _impr:'100'});
  const r2b = await ev(`__pais(${JSON.stringify(e2)})`);
  check('E2 · fuera del periodo con una fila sin fecha: ES 5,00 · IT 60,00 (antes 65 · 0)',
    !r2b.__err && near(r2b.ALL.ppc,65) && near(r2b.ES.ppc,5) && near(r2b.IT.ppc,60), r2b.__err || [r2b.ALL.ppc,r2b.ES.ppc,r2b.IT.ppc].map(n2).join(' · '));
  /* E3 · Signos mezclados: ES +100, IT −90 (abono), sin país +50, todo hoy.
     60 € de un día, estirados un día más a su ritmo: 120. Una proporción con un país negativo no significa nada: no se
     reparte y se dice. Antes: ES 1.200 · IT −1.080. */
  const r3b = await ev(`__pais(${JSON.stringify([fila('A','España',0,100), fila('B','Italia',0,-90), fila('C',null,0,50)])})`);
  check('E3 · con un abono que deja un país en negativo, no se reparte: ES = el total, 120,00, y marcado «de todos» (antes 1.200)',
    !r3b.__err && near(r3b.ALL.ppc,120) && near(r3b.ES.ppc,120) && r3b.ES.sinDato===true, r3b.__err || (n2(r3b.ES.ppc)+' · '+r3b.ES.sinDato));
  /* E4 · Abono con término. España, 15 días (hace 14 a hoy): «A» 10 €/día
     (150 €) asignada a FBANS, «B» −6 €/día (−90 €). Observado 60; los otros
     15 días se extrapolan a 4 €/día: 60. ppc = 120. Factor 120/60 = 2:
     A se llevaba 300 € de 120, y el reparto general salía en −180.
     Esperado: imputado 120,00 como mucho; FBANS0101 120,00 · FBASPB0101 0,00. */
  const e4 = []; for(let k=14;k>=0;k--){ e4.push(fila('A','España',k,10)); e4.push(fila('B','España',k,-6)); }
  const r4 = await ev(`(()=>{ const r = __pais(${JSON.stringify(e4)}, {asig:{'a':{prefijos:['FBANS']}}});
    DB.ppcAsig = {'a':{prefijos:['FBANS']}}; countryFilter='ALL'; const P=pnl(); const o={}; Object.values(P.bySku).forEach(b=>o[b.sku]=b.ppc);
    DB.ppcAsig = {}; return Object.assign(r, {o}); })()`);
  check('E4 · con un abono con término, nunca se imputa más que el gasto: 120,00 de 120,00 (antes 300)',
    !r4.__err && near(r4.ALL.ppc,120) && r4.ALL.imp<=r4.ALL.ppc+0.01 && near(r4.ALL.imp,120), r4.__err || (n2(r4.ALL.imp)+' de '+n2(r4.ALL.ppc)));
  check('E4 · y ningún SKU sale con publicidad negativa: FBANS0101 120,00 · FBASPB0101 0,00',
    !r4.__err && near(r4.o.FBANS0101,120) && near(r4.o.FBASPB0101,0), r4.__err || (n2(r4.o.FBANS0101)+' · '+n2(r4.o.FBASPB0101)));

  check('sin errores de JS', errors.length===0, errors.slice(0,2).join(' | ') || 'limpio');
  await browser.close();
  console.log(fails ? '\n✗ '+fails+' fallos' : '\n✓ todo correcto');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
