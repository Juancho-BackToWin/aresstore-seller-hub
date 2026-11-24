#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   REVISIÓN DEL 4-10-2026 · TRES NÚMEROS FALSOS EN LA PUBLICIDAD POR PAÍS

   Un revisor independiente que no había visto el código de la PR #19 buscó en
   ella los fallos que tuvo la implementación paralela de la #20. Cuatro no se
   reproducen; encontró estos tres, que sí:

   Laboratorio (cifras inventadas, nada del negocio): FBANS0101 y FBANS0102 a
   25 € (ES) y FBASPB0101 a 20 € (DE), una unidad al día, 30 días.

   T1 · TOPE DE FILAS. «Campañas → producto» pintaba `C.slice(0,80)`. Con 60
        campañas en ES y DE (120 filas), gasto 1 + c/100 € por fila:
          total = 2 × (60 + Σ c/100, c=0…59) = 2 × (60 + 17,70) = 155,40 €
        El motor tenía las 120 filas; la pantalla, 80. Las 40 de abajo (el
        revisor midió 43,80 €) no se podían asignar, y la nota de cobertura
        hablaba de los 155,40 € sin decir que había filas ocultas.
        Esperado: 120 casillas.

   T2 · UN ABONO QUE DEJA UN PAÍS EN NEGATIVO. ES 3 €/día, DE 1 €/día, 30
        días; un abono de −40 € en DE: ES 90, DE −10, «Todos» 80.
        Antes: con el filtro ES salía 80 y con el filtro DE también 80. La suma
        de los países, 160 = el doble del total, y la pantalla decía «el
        informe no trae país» (lo trae) y «el margen sale más bajo de lo real»
        (para ES era al revés: 80 cargados de 90 gastados).
        Ahora: el abono que excede el gasto de su país se descuenta del resto
        de países en proporción a su gasto.
          ES = 90 − 10 = 80 · DE = 0 · ES + DE = 80 = «Todos».
        Y la pantalla lo dice como reparto.

   T3 · EL TOTAL DEL AVISO DE RENOMBRADAS, PAÍS A PAÍS. Dos renombres en dos
        países el mismo día, con cifras distintas en cada informe:
          f1 «NS» ES 3 €/día y «PB» IT 1 €/día, de hace 29 a hace 10
          f2 «NS 2026» ES 1 €/día y «PB 2026» IT 3 €/día, de hace 19 a hoy
        Diez días comunes. Por pareja, min(3,1) = 1 €/día → 10 € cada una.
        Total = 20 €. Antes salía 40: el total se hacía por día juntando los
        países (f1 = 4, f2 = 4, sobra 4 €/día), y el titular decía el doble de
        lo que sumaban sus propias parejas.
        Control que no debe romperse: una campaña vieja SIN país que casa con
        una nueva de ES y otra de IT del mismo informe sobra una sola vez.
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

  await page.evaluate(()=>{
    window.__dia = k => { const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-k);
      return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    window.__lab = ()=>{
      DB = blankDB();
      DB.products = [
        {id:'a', sku:'FBANS0101', name:'Pulsera A', cogs:2, freight:0, fba:2, referral:15, price:25, channel:'FBA', lots:[]},
        {id:'b', sku:'FBANS0102', name:'Pulsera B', cogs:2, freight:0, fba:2, referral:15, price:25, channel:'FBA', lots:[]},
        {id:'c', sku:'FBASPB0101', name:'Pulsera C', cogs:3, freight:0, fba:2, referral:15, price:20, channel:'FBA', lots:[]}];
      const v = [];
      for(let k=0;k<30;k++)
        [['FBANS0101',25,'ES'],['FBANS0102',25,'ES'],['FBASPB0101',20,'DE']].forEach(([sku,pr,c])=>v.push({amazonorderid:'o'+k+sku,
          purchasedate:__dia(k)+'T10:00:00+00:00', fulfillmentchannel:'Amazon', saleschannel:'Amazon.'+c.toLowerCase(), sku, asin:'B0'+sku,
          itemstatus:'Shipped', quantity:'1', itemprice:String(pr), itemtax:'0', shipcountry:c}));
      DB.imports.orders = {rows:v, count:v.length, file:'lab'};
      DB.ppcAsig = {}; periodDays = 30; countryFilter = 'ALL';
    };
  });

  /* ══ T1 · TOPE DE FILAS ══════════════════════════════════════════════════ */
  console.log('\n=== T1 · CAMPAÑAS → PRODUCTO SIN TOPE DE FILAS ===');
  const r1 = await ev(`(()=>{ __lab(); const st=[];
      for(let c=0;c<60;c++) for(const pais of ['España','Alemania'])
        st.push({_term:'t'+c, _campaign:'CAMP '+String(c).padStart(3,'0'), country:pais, _from:__dia(3), _to:__dia(3),
          _spend:String(1 + c/100), _sales:'0', _clicks:'5', _impr:'100'});
      DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
      const C = pubPpcPorCampana(); go('dashboard'); go('publicidad');
      const filasUI = document.querySelectorAll('#pubAsigTable input[data-campana]').length;
      const tot = C.reduce((a,c)=>a+c.gasto,0);
      return {filasMotor:C.length, filasUI, tot}; })()`);
  check('T1 · el motor tiene 120 filas campaña×país', !r1.__err && r1.filasMotor===120, r1.__err || r1.filasMotor);
  check('T1 · y la pantalla enseña las 120 casillas, no 80: todo el gasto (155,40 €) se puede asignar',
    !r1.__err && r1.filasUI===120 && near(r1.tot,155.40), r1.__err || (r1.filasUI+' casillas · '+n2(r1.tot)));

  /* ══ T2 · UN ABONO QUE DEJA UN PAÍS EN NEGATIVO ═════════════════════════ */
  console.log('\n=== T2 · LA SUMA DE LOS PAÍSES ES EL TOTAL, TAMBIÉN CON UN ABONO ===');
  const r2 = await ev(`(()=>{ __lab(); const st=[];
      for(let k=0;k<30;k++){
        st.push({_term:'rodillo', _campaign:'R', country:'España', _from:__dia(k), _to:__dia(k), _spend:'3', _sales:'0', _clicks:'5', _impr:'100'});
        st.push({_term:'rodillo', _campaign:'R', country:'Alemania', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'}); }
      st.push({_term:'', _campaign:'R', country:'Alemania', _from:__dia(2), _to:__dia(2), _spend:'-40', _sales:'0', _clicks:'0', _impr:'0'});
      DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
      const r={}; ['ALL','ES','DE'].forEach(cf=>{ countryFilter=cf; const P=pnl();
        r[cf]={ppc:P.ppc, sinDato:P.ppcPaisSinDato, abono:P.ppcPaisAbono||0}; });
      countryFilter='ES'; go('dashboard'); go('rentabilidad'); const txtES = document.body.innerText;
      countryFilter='DE'; go('dashboard'); go('rentabilidad'); const txtDE = document.body.innerText;
      countryFilter='ALL'; go('dashboard');
      return {r, noTrae:/no trae país/.test(txtES)||/no trae país/.test(txtDE),
        dice:/supera el gasto/.test(txtES), deTodos:/de <?todos/i.test(txtES) && /Estás filtrando por un solo mercado/.test(txtES)}; })()`);
  check('T2 · «Todos» = 90 − 10 = 80,00', !r2.__err && near(r2.r.ALL.ppc,80), r2.__err || n2(r2.r.ALL.ppc));
  check('T2 · España = 90 − 10 de abono sobrante = 80,00 (antes 80 «de todos»)',
    !r2.__err && near(r2.r.ES.ppc,80) && r2.r.ES.sinDato===false, r2.__err || (n2(r2.r.ES.ppc)+' · sinDato '+r2.r.ES.sinDato));
  check('T2 · Alemania = 0,00, nunca negativa (antes 80, el gasto de todos)',
    !r2.__err && near(r2.r.DE.ppc,0), r2.__err || n2(r2.r.DE.ppc));
  check('T2 · la suma de los países es el total: 80 + 0 = 80 (antes 160, el doble)',
    !r2.__err && near(r2.r.ES.ppc + r2.r.DE.ppc, r2.r.ALL.ppc), r2.__err || n2(r2.r.ES.ppc + r2.r.DE.ppc)+' de '+n2(r2.r.ALL.ppc));
  check('T2 · la pantalla deja de decir «el informe no trae país», que era falso', !r2.__err && !r2.noTrae, r2.__err || r2.noTrae);
  check('T2 · y dice que un abono supera el gasto de su país y cómo se ha repartido (10,00 €)',
    !r2.__err && r2.dice && near(r2.r.ES.abono,10), r2.__err || (r2.dice+' · '+n2(r2.r.ES.abono)));

  /* ══ T3 · EL TOTAL DEL AVISO DE RENOMBRADAS, PAÍS A PAÍS ════════════════ */
  console.log('\n=== T3 · EL TITULAR DEL AVISO SUMA LO MISMO QUE SUS PAREJAS ===');
  const fila = (fid,camp,pais,grupo,term,k,eur)=>({_term:term, _campaign:camp, adgroupname:grupo, country:pais,
    _from:'@'+k, _to:'@'+k, _spend:String(eur), _sales:'0', _clicks:'5', _impr:'100', __fs:fid});
  const st3 = [];
  for(let k=29;k>=10;k--) for(let t=0;t<4;t++){
    st3.push(fila('f1','NS','España','NS','piedra '+t,k,3/4)); st3.push(fila('f1','PB','Italia','PB','cuero '+t,k,1/4)); }
  for(let k=19;k>=0;k--) for(let t=0;t<4;t++){
    st3.push(fila('f2','NS 2026','España','NS','piedra '+t,k,1/4)); st3.push(fila('f2','PB 2026','Italia','PB','cuero '+t,k,3/4)); }
  const r3 = await ev(`(()=>{ __lab(); const st=${JSON.stringify(st3)}.map(x=>Object.assign(x,{_from:__dia(+x._from.slice(1)), _to:__dia(+x._to.slice(1))}));
      DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
      const R = pubAdStats().renombradas;
      return {n:R.length, total:R.total, parejas:R.reduce((a,r)=>a+r.gasto,0)}; })()`);
  check('T3 · dos parejas, una por país', !r3.__err && r3.n===2, r3.__err || r3.n);
  check('T3 · cada pareja, 10 días × min(3,1) = 10,00 €; juntas, 20,00', !r3.__err && near(r3.parejas,20), r3.__err || n2(r3.parejas));
  check('T3 · el titular dice 20,00 €, lo que suman sus parejas (antes 40,00)', !r3.__err && near(r3.total,20), r3.__err || n2(r3.total));

  /* Control: una vieja SIN país, f1, 1 €/día, que casa con una nueva de ES
     (1 €/día) y otra de IT (1 €/día) de f2. Días comunes: 10. Cada día f1
     cuenta 1 y f2 cuenta 2: lo que puede sobrar es 1 €/día → 10,00 €, una sola
     vez. Contado por separado saldría 20. */
  const st3b = [];
  for(let k=29;k>=10;k--) for(let t=0;t<4;t++) st3b.push(fila('f1','NS','','NS','piedra '+t,k,1/4));
  for(let k=19;k>=0;k--) for(let t=0;t<4;t++){
    st3b.push(fila('f2','NS ES','España','NS','piedra '+t,k,1/4)); st3b.push(fila('f2','NS IT','Italia','NS','piedra '+t,k,1/4)); }
  const r3b = await ev(`(()=>{ __lab(); const st=${JSON.stringify(st3b)}.map(x=>Object.assign(x,{_from:__dia(+x._from.slice(1)), _to:__dia(+x._to.slice(1))}));
      DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
      const R = pubAdStats().renombradas; return {n:R.length, total:R.total}; })()`);
  check('T3 · control: una vieja sin país que casa con ES e IT del mismo informe sobra una sola vez: 10,00',
    !r3b.__err && r3b.n===2 && near(r3b.total,10), r3b.__err || (r3b.n+' parejas · '+n2(r3b.total)));


  /* ══ SEGUNDA RONDA DE REVISIÓN (4-10-2026) ══════════════════════════════
     T4 · TRES FICHEROS Y UNA VIEJA QUE CASA CON DOS NUEVAS. f1 «NS» sin país
          1 €/día (hace 29…10); f2 «NS ES» 10 €/día y f3 «NS IT» 10 €/día
          (hace 19…0). Dos parejas, 10 días comunes, min(1,10) = 1 → 10 €
          cada una, 20 € sumadas. Pero lo que de verdad puede estar contado dos
          veces es lo que cuenta la vieja: 1 €/día → 10 €. El grupo juntaba los
          tres informes y restaba solo el mayor: 1 + 10 + 10 − 10 = 11 €/día →
          110 €, más que sus propias parejas.
     T4b · lo mismo en un solo país con términos no transitivos: vieja con
          t0…t5, nueva B con t0…t2, nueva C con t3…t5 (B y C no casan): 10 €. */
  const T4 = ['piedra 0','piedra 1','piedra 2','piedra 3'];
  const gen = spec => { const st=[]; spec.forEach(([fid,camp,pais,grupo,terms,k0,k1,eur])=>{
    for(let k=k0;k>=k1;k--) terms.forEach(t=>st.push(fila(fid,camp,pais,grupo,t,k,eur/terms.length))); }); return st; };
  const rnTot = async spec => ev(`(()=>{ __lab(); const st=${JSON.stringify(gen(spec))}.map(x=>Object.assign(x,{_from:__dia(+x._from.slice(1)), _to:__dia(+x._to.slice(1))}));
      DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
      const R = pubAdStats().renombradas; return {n:R.length, total:R.total, parejas:R.reduce((a,r)=>a+r.gasto,0)}; })()`);
  const r4 = await rnTot([['f1','NS','','NS',T4,29,10,1], ['f2','NS ES','España','NS',T4,19,0,10], ['f3','NS IT','Italia','NS',T4,19,0,10]]);
  check('T4 · vieja sin país + nuevas de ES e IT en dos informes: 2 parejas, 20 € sumadas', !r4.__err && r4.n===2 && near(r4.parejas,20), r4.__err || (r4.n+' · '+n2(r4.parejas)));
  /* El gasto de España y el de Italia no pueden ser el mismo euro: el gasto
     real es al menos 10 + 10 = 20 €/día, y sobra como mucho 21 − 20 = 1. */
  check('T4 · el titular dice 10,00 €, lo que cuenta la vieja (antes 110)', !r4.__err && near(r4.total,10), r4.__err || n2(r4.total));
  const r4b = await rnTot([['f1','NS','España','NS',['t0','t1','t2','t3','t4','t5'],29,10,1], ['f2','NS B','España','NS',['t0','t1','t2'],19,0,10], ['f3','NS C','España','NS',['t3','t4','t5'],19,0,10]]);
  /* T4b · En un solo país, el hub no puede saber si B y C son la misma
     campaña: los dos casan con la vieja. La cota que no se queda corta es
     21 − 10 = 11 €/día → 110 €, más que las parejas (20), y la pantalla tiene
     que decir por qué. Es la cota, no lo probable. */
  check('T4b · un país, términos no transitivos: hasta 110,00 €, y la pantalla explica por qué pasa de las parejas',
    !r4b.__err && near(r4b.total,110), r4b.__err || (r4b.n+' parejas · '+n2(r4b.total)));
  /* T4d · TERCERA RONDA. Una campaña renombrada dos veces, y su grupo de
     anuncios renombrado una vez, en tres informes, ES, 5 €/día, 4 términos:
       f1 «NS»      grupo G1, de hace 29 a hace 10
       f2 «NS 2025» grupo G1 de hace 19 a hace 13 · grupo G2 de hace 12 a hace 5
       f3 «NS 2026» grupo G2, de hace 12 a hoy
     Parejas: NS–NS 2025 (días 19…10: 10 días, 50 €) y NS 2025–NS 2026 (días
     12…5: 8 días, 40 €). NS–NS 2026 no casa (no comparten grupo) aunque sea el
     mismo gasto. Contado 240 €, real 30 × 5 = 150: duplicado 90 €. Los días
     12…10 se cuentan tres veces. La cota de cobertura daba 75. */
  const r4d = await rnTot([['f1','NS','España','G1',T4,29,10,5], ['f2','NS 2025','España','G1',T4,19,13,5],
    ['f2','NS 2025','España','G2',T4,12,5,5], ['f3','NS 2026','España','G2',T4,12,0,5]]);
  check('T4d · un euro contado tres veces: el titular dice 90,00 €, no se queda corto (con la cota de cobertura, 75)',
    !r4d.__err && near(r4d.total,90) && near(r4d.parejas,90), r4d.__err || (n2(r4d.total)+' · parejas '+n2(r4d.parejas)));
  const r4c = await rnTot([['f1','NS','España','NS',T4,29,15,5], ['f2','NS 2025','España','NS',T4,20,5,5], ['f3','NS 2026','España','NS',T4,10,0,5]]);
  check('T4c · control: cadena A→B→C a 5 €/día, solapes de 6 días cada uno: 30 + 30 = 60,00', !r4c.__err && near(r4c.total,60), r4c.__err || n2(r4c.total));

  /* T5 · EL ABONO SE COME TODO LO QUE TIENE PAÍS. ES 1 €/día 10 días = 10;
          DE −30 de abono; filas SIN país 10 €/día 10 días = 100; periodo de 30
          días: el ritmo extrapola 20 días más. Lo conocido sale negativo
          (10 − 30 = −20) y el código volvía a cargar a cada país el gasto de
          todos: la suma de los países, varias veces el total.
          Esperado: España, el único país con gasto positivo, carga con todo;
          Alemania 0; la suma es «Todos»; y la pantalla no dice que el informe
          no trae país. */
  const r5 = await ev(`(()=>{ __lab(); const st=[];
      for(let k=0;k<10;k++){ st.push({_term:'r', _campaign:'R', country:'España', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'});
                             st.push({_term:'r', _campaign:'R', country:'', _from:__dia(k), _to:__dia(k), _spend:'10', _sales:'0', _clicks:'5', _impr:'100'}); }
      st.push({_term:'', _campaign:'R', country:'Alemania', _from:__dia(2), _to:__dia(2), _spend:'-30', _sales:'0', _clicks:'0', _impr:'0'});
      DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
      const r={}; ['ALL','ES','DE','IT'].forEach(cf=>{ countryFilter=cf; const P=pnl(); r[cf]={ppc:P.ppc, sinDato:P.ppcPaisSinDato}; });
      countryFilter='DE'; go('dashboard'); go('rentabilidad'); const txt = document.body.innerText; countryFilter='ALL'; go('dashboard');
      return {r, noTrae:/no trae país/.test(txt)}; })()`);
  check('T5 · Alemania 0,00 e Italia 0,00 (antes cargaban el total cada una)', !r5.__err && near(r5.r.DE.ppc,0) && near(r5.r.IT.ppc,0),
    r5.__err || ('DE '+n2(r5.r.DE.ppc)+' · IT '+n2(r5.r.IT.ppc)));
  check('T5 · España carga con todo y la suma de los países es «Todos»', !r5.__err && r5.r.ALL.ppc>0 && near(r5.r.ES.ppc, r5.r.ALL.ppc),
    r5.__err || ('ES '+n2(r5.r.ES.ppc)+' de '+n2(r5.r.ALL.ppc)));
  check('T5 · y la pantalla no dice que el informe no trae país', !r5.__err && !r5.noTrae, r5.__err || r5.noTrae);

  /* T6 · FILAS SIN PAÍS NEGATIVAS. ES 3 €/día y DE 1 €/día, 30 días (90 y
          30); un abono sin país de −20. «Todos» = 100. España = 100 × 90/120 =
          75, cuando lo medido en España son 90: es un reparto. Antes la
          etiqueta decía «medido», porque solo se miraba un reparto positivo. */
  const r6 = await ev(`(()=>{ __lab(); const st=[];
      for(let k=0;k<30;k++){ st.push({_term:'r', _campaign:'R', country:'España', _from:__dia(k), _to:__dia(k), _spend:'3', _sales:'0', _clicks:'5', _impr:'100'});
                             st.push({_term:'r', _campaign:'R', country:'Alemania', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'}); }
      st.push({_term:'', _campaign:'R', country:'', _from:__dia(3), _to:__dia(3), _spend:'-20', _sales:'0', _clicks:'0', _impr:'0'});
      DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
      countryFilter='ES'; const P=pnl(); const Q=cascada(P); const lin=(Q.lineas||[]).filter(x=>x.id==='publicidad')[0];
      countryFilter='ALL'; return {ppc:P.ppc, rep:P.ppcPaisRepartido, calidad: lin && lin.calidad}; })()`);
  check('T6 · España = 100 × 90/120 = 75,00, con −15,00 de filas sin país', !r6.__err && near(r6.ppc,75) && near(r6.rep,-15), r6.__err || (n2(r6.ppc)+' · '+n2(r6.rep)));
  check('T6 · y la línea de publicidad dice «estimado», no «medido»', !r6.__err && r6.calidad==='estimado', r6.__err || r6.calidad);

  /* T4e · CUARTA RONDA. Cadena con el eslabón del medio contando menos (un
     informe de resumen), España, días 19…10:
       f1 «NS» grupo G1 30 €/día · f2 «NS 2025» G1 y G2 10 €/día · f3 «NS 2026» G2 30 €/día
     Si las tres son la misma campaña, el real es al menos 30 y se cuentan 70:
     sobra hasta 40 €/día → 400 €. La suma de mínimos de las parejas daba 200,
     por debajo del duplicado mínimo posible (300). */
  const r4e = await rnTot([['f1','NS','España','G1',T4,19,10,30], ['f2','NS 2025','España','G1',T4,19,10,5],
    ['f2','NS 2025','España','G2',T4,19,10,5], ['f3','NS 2026','España','G2',T4,19,10,30]]);
  check('T4e · cadena con el eslabón del medio menor: hasta 400,00 €, no 200', !r4e.__err && near(r4e.total,400), r4e.__err || (r4e.n+' parejas · '+n2(r4e.total)));
  await page.evaluate(()=>{ go('dashboard'); go('publicidad'); });
  const txt4 = await page.evaluate(()=>document.body.innerText);
  check('T4e · y la pantalla dice que el total pasa de las parejas y por qué', /pasa de lo que suman las parejas/.test(txt4), /pasa de lo que suman/.test(txt4));

  /* T9 · CUARTA RONDA. La parte sin país, con la asignación del país. «Z»:
     ES 3 €/día, DE 1 €/día y 2 €/día sin país, 30 días (90, 30, 60). Asignada
     en ES a FBANS0101, en DE a FBASPB0101; la general, a FBANS0102.
     FBANS0101 vende también en Alemania.
       cuota DE = 30/120 = 0,25 · DE = 180 × 0,25 = 45
       DE: 30 € a FBASPB0101 + 60 × 0,25 = 15 € de la parte sin país.
     La parte sin país, en Alemania, es de la campaña de Alemania: a
     FBASPB0101. Antes iba a la general (FBANS0102), que no vende en
     Alemania, caía sin destino y FBANS0101 cargaba con una parte. */
  const r9 = await ev(`(()=>{ __lab(); const st=[];
      for(let k=0;k<30;k++){
        DB.imports.orders.rows.push({amazonorderid:'d'+k, purchasedate:__dia(k)+'T10:00:00+00:00', fulfillmentchannel:'Amazon', saleschannel:'Amazon.de',
          sku:'FBANS0101', asin:'B0FBANS0101', itemstatus:'Shipped', quantity:'1', itemprice:'25', itemtax:'0', shipcountry:'DE'});
        st.push({_term:'z', _campaign:'Z', country:'España', _from:__dia(k), _to:__dia(k), _spend:'3', _sales:'0', _clicks:'5', _impr:'100'});
        st.push({_term:'z', _campaign:'Z', country:'Alemania', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'});
        st.push({_term:'z', _campaign:'Z', country:'', _from:__dia(k), _to:__dia(k), _spend:'2', _sales:'0', _clicks:'5', _impr:'100'}); }
      DB.imports.orders.count = DB.imports.orders.rows.length;
      DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
      pubAsignar('Z','FBANS0102'); pubAsignar('Z','FBANS0101','ES'); pubAsignar('Z','FBASPB0101','DE');
      countryFilter='DE'; const P=pnl(); const o={}; Object.values(P.bySku).forEach(b=>o[b.sku]=b.ppc);
      const filas = pubPpcPorCampana().map(c=>c.pais+':'+c.skus.join('+'));
      countryFilter='ALL'; return {ppc:P.ppc, o, filas}; })()`);
  check('T9 · el laboratorio asigna Z por país (ES → FBANS0101, DE → FBASPB0101)', !r9.__err && r9.filas.indexOf('DE:FBASPB0101')>=0 && r9.filas.indexOf('ES:FBANS0101')>=0,
    r9.__err || r9.filas.join(' · '));
  check('T9 · filtro DE: 45,00 €, todos a FBASPB0101; FBANS0101 0,00 (antes cargaba parte de la sin país)',
    !r9.__err && near(r9.ppc,45) && near(r9.o.FBASPB0101,45) && near(r9.o.FBANS0101||0,0), r9.__err || (n2(r9.ppc)+' · FBASPB '+n2(r9.o.FBASPB0101)+' · FBANS0101 '+n2(r9.o.FBANS0101)));

  /* T10 · CUARTA RONDA. Céntimos y ceros. (a) ES +5 y −5, 90 € sin país: hay
     país aunque sume cero; la causa en pantalla no es «no trae país». (b) ES
     +0,1 +0,2 −0,3 (5,55e-17 en coma flotante): no es un país positivo que se
     lleve el 100 %. */
  const r10 = await ev(`(()=>{ const out={};
      for(const [nom, filasEs] of [['a',['5','-5']], ['b',['0.1','0.2','-0.3']]]){
        __lab(); const st=[];
        for(let k=0;k<30;k++) st.push({_term:'r', _campaign:'R', country:'', _from:__dia(k), _to:__dia(k), _spend:'3', _sales:'0', _clicks:'5', _impr:'100'});
        filasEs.forEach(v=>st.push({_term:'', _campaign:'R', country:'España', _from:__dia(2), _to:__dia(2), _spend:v, _sales:'0', _clicks:'0', _impr:'0'}));
        DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
        countryFilter='ES'; go('dashboard'); go('rentabilidad'); const txt=document.body.innerText; const P=pnl(); countryFilter='ALL'; go('dashboard');
        out[nom] = {sinDato:P.ppcPaisSinDato, cuota:P.ppcPaisCuota, noTrae:/no trae país/.test(txt), dice:/ningún país tiene gasto/.test(txt)};
      } return out; })()`);
  check('T10a · ES +5 −5: «de todos», con la causa verdadera, no «no trae país»', !r10.__err && r10.a.sinDato && !r10.a.noTrae && r10.a.dice, r10.__err || JSON.stringify(r10.a));
  check('T10b · ES +0,1 +0,2 −0,3: no se lleva el 100 % por un residuo de coma flotante', !r10.__err && r10.b.sinDato && r10.b.cuota==null && r10.b.dice, r10.__err || JSON.stringify(r10.b));

  /* T7 · TERCERA RONDA. La parte SIN PAÍS de una campaña asignada, con el
     filtro de un país. «R» asignada a FBANS. España 3 €/día con país y 1 €/día
     sin país, 30 días; Alemania 1 €/día. Todos = 150.
       cuota ES = 90/(90+30) = 0,75 → ES = 112,50 (90 + 30 × 0,75)
     Toda la «R» es de FBANS: con «Todos», FBASPB0101 no lleva publicidad. Con
     el filtro ES tampoco puede llevarla: antes los 22,50 de filas sin país se
     repartían por ingreso y FBASPB0101 cargaba con su parte. */
  const r7 = await ev(`(()=>{ __lab(); const st=[];
      /* FBASPB0101 también vende en España: si no, el reparto por ingreso con
         el filtro ES nunca podría darle nada y la prueba no ejercería el caso
         (primera versión de esta prueba: verde sin el arreglo). */
      for(let k=0;k<30;k++) DB.imports.orders.rows.push({amazonorderid:'x'+k, purchasedate:__dia(k)+'T10:00:00+00:00', fulfillmentchannel:'Amazon',
        saleschannel:'Amazon.es', sku:'FBASPB0101', asin:'B0FBASPB0101', itemstatus:'Shipped', quantity:'1', itemprice:'20', itemtax:'0', shipcountry:'ES'});
      DB.imports.orders.count = DB.imports.orders.rows.length;
      for(let k=0;k<30;k++){ st.push({_term:'r', _campaign:'R', country:'España', _from:__dia(k), _to:__dia(k), _spend:'3', _sales:'0', _clicks:'5', _impr:'100'});
        st.push({_term:'r', _campaign:'R', country:'', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'});
        st.push({_term:'r', _campaign:'R', country:'Alemania', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'}); }
      DB.imports.searchterm = {rows:st, count:st.length, file:'lab'}; DB.ppcAsig = {'r':{prefijos:['FBANS']}};
      const r={}; ['ALL','ES'].forEach(cf=>{ countryFilter=cf; const P=pnl(); const o={}; Object.values(P.bySku).forEach(b=>o[b.sku]=b.ppc);
        r[cf]={ppc:P.ppc, imp:P.ppcImputado, A:(o.FBANS0101||0)+(o.FBANS0102||0), B:o.FBASPB0101||0}; });
      countryFilter='ALL'; return r; })()`);
  check('T7 · «Todos»: 150,00, todo en FBANS, FBASPB0101 0,00', !r7.__err && near(r7.ALL.ppc,150) && near(r7.ALL.A,150) && near(r7.ALL.B,0),
    r7.__err || (n2(r7.ALL.ppc)+' · A '+n2(r7.ALL.A)+' · B '+n2(r7.ALL.B)));
  check('T7 · filtro ES: 112,50, todo en FBANS; FBASPB0101 0,00 (antes cargaba la parte sin país)',
    !r7.__err && near(r7.ES.ppc,112.5) && near(r7.ES.A,112.5) && near(r7.ES.B,0), r7.__err || (n2(r7.ES.ppc)+' · A '+n2(r7.ES.A)+' · B '+n2(r7.ES.B)));

  /* T8 · Solo hay país en un abono (sin país +90, ES −5): ningún país tiene
     gasto positivo y no se puede repartir. Se enseña el de todos, pero la
     pantalla no puede decir «el informe no trae país»: lo trae. */
  const r8 = await ev(`(()=>{ __lab(); const st=[];
      for(let k=0;k<30;k++) st.push({_term:'r', _campaign:'R', country:'', _from:__dia(k), _to:__dia(k), _spend:'3', _sales:'0', _clicks:'5', _impr:'100'});
      st.push({_term:'', _campaign:'R', country:'España', _from:__dia(2), _to:__dia(2), _spend:'-5', _sales:'0', _clicks:'0', _impr:'0'});
      DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
      countryFilter='ES'; go('dashboard'); go('rentabilidad'); const txt=document.body.innerText; const P=pnl(); countryFilter='ALL'; go('dashboard');
      return {sinDato:P.ppcPaisSinDato, noTrae:/no trae país/.test(txt), dice:/ningún país tiene gasto/.test(txt)}; })()`);
  check('T8 · sin ningún país en positivo, se marca «de todos» y lo dice con la causa verdadera',
    !r8.__err && r8.sinDato===true && !r8.noTrae && r8.dice, r8.__err || JSON.stringify(r8));

  /* T11 · LA CACHÉ DE UN REPINTADO NO CAMBIA NINGÚN NÚMERO. Con ventas,
     publicidad en dos países, sin país y una asignación, se pintan las diez
     pantallas sin caché y con ella, con tres combinaciones de periodo y país:
     el texto tiene que salir idéntico. Y fuera de un repintado no queda
     caché: cambiar una asignación después se ve en la siguiente cuenta. */
  const r11 = await ev(`(()=>{ __lab(); const st=[];
      for(let k=0;k<30;k++){ st.push({_term:'r', _campaign:'R', country:'España', _from:__dia(k), _to:__dia(k), _spend:'3', _sales:'5', _clicks:'5', _impr:'100'});
        st.push({_term:'s', _campaign:'S', country:'Alemania', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'});
        st.push({_term:'r', _campaign:'R', country:'', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'}); }
      DB.imports.searchterm = {rows:st, count:st.length, file:'lab'}; pubAsignar('R','FBANS');
      const foto=()=>Array.from(document.querySelectorAll('.view')).map(v=>v.id+'\\n'+v.innerText).join('\\n#####\\n');
      const out={iguales:0, distintas:[]};
      for(const [pd,cf] of [[30,'ALL'],[90,'ES'],[365,'DE']]){ periodDays=pd; countryFilter=cf;
        window.__SIN_MEMO=true; refreshAll(); const a=foto(); window.__SIN_MEMO=false; refreshAll(); const b=foto();
        if(a===b) out.iguales++; else out.distintas.push(pd+'/'+cf); }
      periodDays=30; countryFilter='ALL'; refreshAll();
      out.memoFuera = MEMO_REPINTADO;
      const antes = pnl().bySku; const aA = Object.values(antes).filter(b=>b.sku==='FBASPB0101')[0].ppc;
      pubAsignar('R','FBASPB'); const desp = Object.values(pnl().bySku).filter(b=>b.sku==='FBASPB0101')[0].ppc;
      out.cambia = desp > aA + 1; return out; })()`);
  check('T11 · con caché y sin ella, las diez pantallas dicen exactamente lo mismo (3 combinaciones de periodo y país)',
    !r11.__err && r11.iguales===3, r11.__err || (r11.iguales+' iguales · distintas: '+r11.distintas.join(', ')));
  check('T11 · fuera de un repintado no queda caché, y una asignación nueva se ve en la siguiente cuenta',
    !r11.__err && r11.memoFuera===null && r11.cambia, r11.__err || (String(r11.memoFuera)+' · '+r11.cambia));

  /* T12 · QUINTA RONDA. La parte sin país sigue la asignación GUARDADA del
     país, haya o no gasto con país en el periodo, y respeta «*» y «sin
     asignar». FBANS0101 (A) y FBASPB0101 (B) venden 25 €/día en ES y en DE.
       «R»: 2 €/día SIN país (60). «Q»: ES 3 €/día (90), DE 1 €/día (30), sin
       asignar.
       cuota DE = 30/(90+30) = 0,25 → DE = 180 × 0,25 = 45
       parte sin país de R en DE = 60 × 0,25 = 15 · Q en DE = 30 por ingreso
     a) R general → A, R en DE → B (R no gasta con país en DE): A 15, B 30.
        Antes: A 30, B 15 (la fila de DE no existía y mandaba la general).
     b) R en DE = «*»: los 15 por ingreso: A 22,50, B 22,50 (antes A 30).
     c) R en DE sin asignar: igual que «*», A 22,50, B 22,50. */
  const r12 = await ev(`(()=>{ const out={};
      for(const caso of ['a','b','c']){
        __lab(); DB.products = DB.products.filter(p=>p.sku!=='FBANS0102');
        const v=[]; for(let k=0;k<30;k++) for(const sku of ['FBANS0101','FBASPB0101']) for(const c of ['ES','DE'])
          v.push({amazonorderid:'t'+k+sku+c, purchasedate:__dia(k)+'T10:00:00+00:00', fulfillmentchannel:'Amazon', saleschannel:'Amazon.'+c.toLowerCase(),
            sku, asin:'B0'+sku, itemstatus:'Shipped', quantity:'1', itemprice:'25', itemtax:'0', shipcountry:c});
        DB.imports.orders = {rows:v, count:v.length, file:'lab'};
        const st=[]; for(let k=0;k<30;k++){
          st.push({_term:'r', _campaign:'R', country:'', _from:__dia(k), _to:__dia(k), _spend:'2', _sales:'0', _clicks:'5', _impr:'100'});
          st.push({_term:'q', _campaign:'Q', country:'España', _from:__dia(k), _to:__dia(k), _spend:'3', _sales:'0', _clicks:'5', _impr:'100'});
          st.push({_term:'q', _campaign:'Q', country:'Alemania', _from:__dia(k), _to:__dia(k), _spend:'1', _sales:'0', _clicks:'5', _impr:'100'}); }
        DB.imports.searchterm = {rows:st, count:st.length, file:'lab'};
        pubAsignar('R','FBANS0101');
        if(caso==='a') pubAsignar('R','FBASPB0101','DE');
        if(caso==='b') pubAsignar('R','*','DE');
        if(caso==='c') pubAsignar('R','','DE');
        countryFilter='DE'; const P=pnl(); const o={}; Object.values(P.bySku).forEach(b=>o[b.sku]=b.ppc); countryFilter='ALL';
        out[caso]={ppc:P.ppc, A:o.FBANS0101||0, B:o.FBASPB0101||0};
      } return out; })()`);
  check('T12a · R asignada en DE a FBASPB0101 sin gasto con país en DE: A 15,00 · B 30,00 (antes A 30 · B 15)',
    !r12.__err && near(r12.a.ppc,45) && near(r12.a.A,15) && near(r12.a.B,30), r12.__err || (n2(r12.a.ppc)+' · A '+n2(r12.a.A)+' · B '+n2(r12.a.B)));
  check('T12b · R en DE con «*»: los 15 por ingreso, A 22,50 · B 22,50',
    !r12.__err && near(r12.b.A,22.5) && near(r12.b.B,22.5), r12.__err || ('A '+n2(r12.b.A)+' · B '+n2(r12.b.B)));
  check('T12c · R sin asignar en DE: A 22,50 · B 22,50',
    !r12.__err && near(r12.c.A,22.5) && near(r12.c.B,22.5), r12.__err || ('A '+n2(r12.c.A)+' · B '+n2(r12.c.B)));

  check('sin errores de JS', errors.length===0, errors.slice(0,2).join(' | ') || 'limpio');
  await browser.close();
  console.log(fails ? '\n✗ '+fails+' fallos' : '\n✓ todo correcto');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
