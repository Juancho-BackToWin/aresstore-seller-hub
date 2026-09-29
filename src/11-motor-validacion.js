/* ================= HELPERS ================= */
function n(id){const el=document.getElementById(id);const v=parseFloat(el?el.value:0);return isNaN(v)?0:v;}
function chk(id){const el=document.getElementById(id);return el?el.checked:false;}
function eur(x){if(!isFinite(x))return '—';return (x<0?'-':'')+'€'+Math.abs(x).toFixed(2);}
function pct(x){if(!isFinite(x))return '—';return x.toFixed(1)+'%';}
function cls(v,good,mid){return v>=good?'pos':(v>=mid?'warn':'neg');}

/* -------------------------------------------------------------------------
   DIVISAS · por qué esto está aquí y no es cosmético.

   `COUNTRIES` declara la divisa de cada mercado desde siempre (`cur`), y hasta
   ahora NADIE la leía. Polonia cobra en zlotys y Suecia en coronas, pero la
   calculadora rotulaba «€» en todas partes y el comparador PanEU SUMABA las
   nueve aportaciones anuales en un solo total con el símbolo del euro delante.

   Medido en esta base antes del arreglo, con los nueve mercados por defecto y
   PL y SE activados: el total anunciado era «4525,14 €/año», de los cuales
   374,22 eran PLN y 1688,92 SEK — el 45,6 % del titular no eran euros. Y peor
   que el total: el ranking. La frase «el que más aporta es Suecia con 1688,92 €»
   compara coronas contra euros; a ~11 SEK/€ esas coronas son unos 150 €, o sea
   que Suecia no era el primero sino el último. La tabla no daba error: daba el
   país equivocado con un número creíble.

   Aquí NO se convierte nada. El hub no tiene tipo de cambio y no se lo va a
   inventar; es la misma doctrina que ya aplica `pnl()` con las tarifas en otra
   divisa («una tarifa en riales sumada a un ingreso en euros no da un número
   aproximado: da uno inventado»). Lo que se hace es DECLARAR la divisa, sumar
   solo lo que es sumable y contar aparte lo que no lo es.
   ------------------------------------------------------------------------- */
const DIVISA_BASE = 'EUR';
const SIMBOLO = {EUR:'€', PLN:'zł', SEK:'kr', GBP:'£'};
function divisaDe(code){
  const c = COUNTRIES.filter(x=>x.code===code)[0];
  return (c && c.cur) || DIVISA_BASE;
}
function esBase(cur){ return (cur||DIVISA_BASE)===DIVISA_BASE; }
/* Importe CON su divisa. Nunca pone «€» sobre una cifra que no son euros. */
function money(x, cur){
  if(!isFinite(x)) return '—';
  cur = cur || DIVISA_BASE;
  const s = SIMBOLO[cur];
  const abs = Math.abs(x).toFixed(2), sg = x<0?'-':'';
  /* Con símbolo propio basta (`2850,00 zł`): es inequívoco y cabe en la celda.
     Sin símbolo conocido se usa el código ISO, que es lo que no admite dudas.
     Lo que nunca puede salir es un «€» encima de una cifra que no son euros. */
  return esBase(cur) ? sg+'€'+abs : sg+abs+' '+(s || cur);
}

const sel=document.getElementById('country');
COUNTRIES.forEach(c=>{
  const o=document.createElement('option');
  o.value=c.code;
  o.textContent=c.name+' · IVA '+c.vat+'%'+(c.storage?'':' (sin stock local)');
  sel.appendChild(o);
});
sel.value='ES';
function onCountryChange(){
  const c=COUNTRIES.find(x=>x.code===sel.value);
  document.getElementById('vat').value=c.vat;
  document.getElementById('vatAnnual').value=c.vatCost;
  const li=document.getElementById('lowInv');
  li.disabled=!c.lowInv;
  if(!c.lowInv) li.value='0';
  calc();
}
function setPpcMode(m){
  ppcMode=m;
  document.querySelectorAll('#ppcMode button').forEach((b,i)=>b.classList.toggle('on',(i===0)===(m==='tacos')));
  document.getElementById('ppcUnit').textContent = m==='tacos'?'%':'€';
  document.getElementById('ppc').value = m==='tacos'?15:2.5;
  calc();
}
function setPpcModeVisual(){
  document.querySelectorAll('#ppcMode button').forEach((b,i)=>b.classList.toggle('on',(i===0)===(ppcMode==='tacos')));
  document.getElementById('ppcUnit').textContent = ppcMode==='tacos'?'%':'€';
}
function setSeason(s){
  document.getElementById('storageRate').value = s==='high'?52.20:27.54;
  document.querySelectorAll('.seg button[onclick^="setSeason"]').forEach((b,i)=>b.classList.toggle('on',(i===0)===(s==='low')));
  calc();
}
function setCalcChannel(m){
  calcChannel=m;
  document.querySelectorAll('#calcCh button').forEach((b,i)=>b.classList.toggle('on',(i===0)===(m==='FBA')));
  document.getElementById('fbaLabel').innerHTML = m==='FBA'
    ? 'Tarifa FBA base <span class="hint">/ud</span>'
    : 'Coste de envío propio <span class="hint">/ud, con embalaje</span>';
  document.getElementById('fuelRow').style.display = m==='FBA' ? 'flex' : 'none';
  document.getElementById('storageSet').style.opacity = m==='FBA' ? '1' : '.42';
  document.getElementById('storageSet').style.pointerEvents = m==='FBA' ? 'auto' : 'none';
  document.getElementById('calcChNote').innerHTML = m==='FBA'
    ? 'En FBA pagas tarifa de gestión, almacenaje y los recargos por sobrestock, pero ganas la Buy Box con más facilidad y Prime. Es el canal por defecto para marca propia.'
    : 'En FBM se apagan el almacenaje y la tarifa por bajo inventario, y el recargo de combustible no aplica. A cambio, mete en el coste de envío el embalaje, el porte real y una parte de tu tiempo de atención al cliente: subestimarlo es el error típico que hace parecer rentable un producto voluminoso que no lo es. La comisión de referencia se paga igual.';
  if(m==='FBM'){ document.getElementById('fba').value='6.50'; }
  else { document.getElementById('fba').value='3.20'; }
  calc();
}
function onRetProc(){
  const m=document.getElementById('retProcMode').value;
  document.getElementById('retProcField').style.display = m==='manual'?'block':'none';
  calc();
}

/* ================= MOTOR ================= */
function inputs(){
  return {
    price:n('price'), vat:n('vat'),
    cogs:n('cogs'), freight:n('freight'),
    referralPct:n('referral')/100,
    fbaBase:n('fba'), fuel: calcChannel==='FBA' && chk('fuel'),
    ppcMode:ppcMode, ppcPct:n('ppc')/100, ppcEur:n('ppc'),
    returnRate:n('returnRate')/100, unsellable:n('unsellable')/100,
    retProcMode:document.getElementById('retProcMode').value, retProcEur:n('retProcEur'),
    litres: calcChannel==='FBA'?n('litres'):0, stockMonths:n('stockMonths'), storageRate:n('storageRate'),
    lowInvEur: calcChannel==='FBA' ? (parseFloat(document.getElementById('lowInv').value)||0) : 0,
    eprEur:n('epr'), vatAnnual:n('vatAnnual'),
    monthly:n('monthly'), units:n('units')
  };
}

function unitEconomics(i, over){
  over = over || {};
  const price = over.price!=null ? over.price : i.price;
  const vat   = over.vat!=null   ? over.vat   : i.vat;
  const landed = i.cogs + i.freight;
  const r = Math.min(0.95, Math.max(0, i.returnRate));
  const u = Math.min(1, Math.max(0, i.unsellable));

  const netRev = (1+vat/100)>0 ? price/(1+vat/100) : 0;
  const referral = price * i.referralPct;                 // base CON IVA
  const fba = i.fbaBase * (i.fuel?FUEL:1);
  const ppc = i.ppcMode==='tacos' ? price*i.ppcPct : i.ppcEur;
  const storage = (i.litres/1000) * i.storageRate * i.stockMonths;
  const retProc = i.retProcMode==='apparel' ? 0.5*fba
                : i.retProcMode==='manual'  ? i.retProcEur : 0;
  const annualUnits = i.monthly*12;
  const vatUnit = annualUnits>0 ? i.vatAnnual/annualUnits : 0;

  /* LA MECÁNICA DE LA DEVOLUCIÓN NO SE ESCRIBE AQUÍ. Vive una sola vez, en
     `costeDevolucion()` (src/29-mecanica-devoluciones.js), que es la misma que
     tiene que usar `pnl()`. Este motor la multiplica por la tasa de devolución
     estimada; `pnl()` la multiplicará por las devoluciones que trae el informe.
     Misma función, mismos céntimos, dos pantallas.

     `revendible` = 1-u, porque la fracción que vuelve vendible es por
     definición el complemento del «% no revendible» que se teclea. */
  const dev = costeDevolucion({
    ingresoNeto  : netRev,
    comision     : referral,
    logistica    : fba,          // regla 1: se declara, no se resta
    procesamiento: retProc,
    costeProducto: landed,
    revendible   : 1 - u
  });
  const refundAdmin = dev.tasaGestion;

  /* Las cuatro líneas de la cascada, DERIVADAS de la mecánica en vez de
     repetidas a mano: cada una es «lo que cuesta la venta» menos «lo que r
     devoluciones le recuperan (o le añaden) a esa línea». */
  const revenue      = netRev   - r*dev.ingresoDevuelto;
  const referralCost = referral - r*dev.comisionReintegrada;
  const returnCost   = r*dev.procesamiento;
  const productCost  = landed   - r*dev.costeRecuperado;
  const opsCost      = fba + storage + i.lowInvEur + i.eprEur + vatUnit;

  const contribution = revenue - referralCost - returnCost - productCost - opsCost;
  const profit       = contribution - ppc;
  const marginNet    = revenue>0 ? profit/revenue*100 : 0;
  const marginContrib= revenue>0 ? contribution/revenue*100 : 0;
  const roi          = landed>0 ? profit/landed*100 : 0;
  const beTacos      = price>0 ? contribution/price*100 : 0;

  return {price,vat,netRev,landed,referral,fba,ppc,storage,refundAdmin,retProc,vatUnit,
          returnRate:r, unsellable:u, dev, devCoste:dev.coste, annualUnits,
          revenue,referralCost,returnCost,productCost,opsCost,
          contribution,profit,marginNet,marginContrib,roi,maxPpc:contribution,beTacos};
}

/* -------------------------------------------------------------------------
   AVISOS · los productos que salen plausibles y equivocados.

   Esto es la revisión adversarial del motor puesta en pantalla. Cada aviso
   corresponde a una configuración con la que el validador da un veredicto
   creíble sobre una cuenta que no se sostiene. No se bloquea nada ni se
   inventa un número distinto: se dice en voz alta qué acaba de desaparecer del
   cálculo, que es lo contrario de fallar en silencio.
   ------------------------------------------------------------------------- */
function avisosValidador(i, e, code){
  const a = [];
  const cur = divisaDe(code);

  /* 1 · Mercado que no cobra en euros. La pantalla entera rotula «€» y el PVP
     que tecleas en Polonia son zlotys. El veredicto sigue siendo válido —los
     porcentajes no tienen divisa— pero los importes no son euros. */
  if(!esBase(cur)){
    a.push({tipo:'divisa', txt:'<strong>'+esc(code)+' cobra en '+esc(cur)+', no en euros.</strong> '+
      'Los importes de esta pantalla están en '+esc(cur)+': el PVP, el coste puesto en almacén, '+
      'la tarifa FBA y el beneficio por unidad. Los porcentajes (margen, ROI, TACOS) no dependen '+
      'de la divisa y sí son comparables. El hub no convierte divisas porque no tiene tipo de '+
      'cambio, y convertir con uno inventado daría un número creíble y falso. '+
      '<strong>Ojo con la gestoría:</strong> el valor por defecto de este país viene del catálogo '+
      'de países, que lo tiene en EUROS. Si dejas los importes en '+esc(cur)+', cámbialo también.'});
  }

  /* 2 · El agujero más caro que tenía esta pantalla. La gestoría de IVA se
     reparte entre las unidades anuales; con «ventas estimadas/mes» a 0 el
     divisor es 0 y el coste fijo se evapora, en silencio, dejando un margen
     estupendo. Un producto que no vende no es un producto con coste fijo
     cero: es un producto al que no se le puede repartir el coste fijo. */
  if(!(i.monthly>0) && i.vatAnnual>0){
    a.push({tipo:'grave', txt:'<strong>La gestoría de IVA no está repartida.</strong> '+
      'Has puesto 0 ventas estimadas al mes, así que los '+money(i.vatAnnual,cur)+'/año de '+
      'este país no se están repartiendo entre ninguna unidad y han desaparecido del margen. '+
      'El beneficio por unidad que ves de más está sin ese coste dentro. Pon el volumen que '+
      'esperas de verdad, por bajo que sea: es justo el número que decide si ese mercado '+
      'compensa abrirlo.'});
  }

  /* 3 · «Moda: 50 % FBA» con el canal en FBM. La tarifa por procesamiento de
     devoluciones es una tarifa de LOGÍSTICA DE AMAZON; en FBM Amazon no la
     cobra porque no toca el paquete. El importe sigue teniendo sentido como
     tu propio coste de gestionar la devolución, pero no es lo que dice la
     etiqueta, y confundirlos es cobrarse una tarifa que nadie te cobra. */
  if(calcChannel==='FBM' && i.retProcMode==='apparel'){
    a.push({tipo:'aviso', txt:'<strong>En FBM Amazon no cobra tarifa por procesamiento de devoluciones.</strong> '+
      'El «50 % de la tarifa FBA» es una tarifa del rate card de Logística de Amazon. Con el canal '+
      'en FBM lo que estás cargando ('+money(e.retProc,cur)+'/devolución) es tu propio coste de '+
      'recibir y reacondicionar la devolución. Si es lo que querías, mejor ponlo en «Manual €» '+
      'con tu cifra; si no, ponlo en «No aplica».'});
  }

  /* 4 · Tasa de devolución por encima del tope del motor. */
  if(i.returnRate > 0.95){
    a.push({tipo:'aviso', txt:'<strong>La tasa de devolución está limitada al 95 %.</strong> '+
      'Has puesto '+pct(i.returnRate*100)+' y el motor calcula con 95 %. Por encima de ahí la '+
      'cuenta deja de significar nada: no es un producto con poco margen, es un producto que no '+
      'se puede vender.'});
  }
  return a;
}

/* -------------------------------------------------------------------------
   LOS DOS UMBRALES DE EQUILIBRIO SE RESUELVEN SOBRE `unitEconomics()`.

   Antes cada uno tenía su propia fórmula cerrada, que era una TERCERA copia de
   la mecánica de devoluciones. Y estaba mal: `breakevenPrice` usaba
   `r*0.20*referralPct*price` para la tasa de gestión, sin el tope de 5 €. El
   tope solo muerde cuando la comisión pasa de 25 €, así que con el producto de
   ejemplo (24,99 €) los dos números coincidían y el fallo era invisible —
   aparecía justo en los productos caros, que son los que más capital
   comprometen.

   Medido en esta base antes del arreglo, con PVP 400 €, coste puesto en
   almacén 200 €, comisión 15 %, 30 % de devoluciones y nada revendible:
     · «Precio mínimo viable» que daba la fórmula ......... 447,78 €
     · precio de equilibrio real del propio motor ......... 442,44 €
     · beneficio que el motor da al precio «de equilibrio» ... +2,53 €/ud
   Es decir, la tarjeta declaraba como mínimo un precio 5,34 € por encima del
   mínimo, con el propio motor diciendo que ahí ya se gana dinero. No daba
   error: daba un número creíble y falso, que es el fallo que este hub tiene
   prohibido.

   Resolver por bisección sobre el propio motor cuesta microsegundos y hace
   IMPOSIBLE que los umbrales se desincronicen de las tarjetas de arriba. Es la
   regla de este carril aplicada a sí mismo.
   ------------------------------------------------------------------------- */
function resolverCero(f, lo, hi){
  /* x en [lo,hi] con f(x)=0, suponiendo f no decreciente. NaN si no hay cruce:
     «no hay precio que lo salve» es una respuesta, y es mejor que un número. */
  if(!(isFinite(lo) && isFinite(hi) && hi>lo)) return NaN;
  const flo=f(lo), fhi=f(hi);
  if(!isFinite(flo) || !isFinite(fhi)) return NaN;
  if(flo>0) return lo;
  if(fhi<=0) return NaN;
  for(let k=0;k<200 && (hi-lo)>1e-9;k++){
    const m=(lo+hi)/2;
    if(f(m)<=0) lo=m; else hi=m;
  }
  return (lo+hi)/2;
}
function breakevenPrice(i){
  /* Techo de búsqueda atado al caso (nunca menos de 1.000 €) para que un
     producto caro tenga sitio donde cruzar. */
  const hi = Math.max(1000, (i.price||0)*100, ((i.cogs||0)+(i.freight||0))*100);
  return resolverCero(p => unitEconomics(i,{price:p}).profit, 0, hi);
}
function breakevenLanded(i){
  /* Aquí el beneficio DECRECE con el coste, así que se resuelve sobre -f: el
     punto donde el beneficio deja de ser positivo es el coste máximo pagable.
     El techo es el PVP: pagar por una unidad más de lo que vale venderla no es
     un umbral, es un sinsentido. */
  const hi = Math.max(1, (i.price||0)*10);
  const x = resolverCero(L => -unitEconomics(Object.assign({},i,{cogs:L, freight:0})).profit, 0, hi);
  return isFinite(x) && x>0 ? x : NaN;
}

/* ================= RENDER ================= */
/* La divisa del mercado que hay seleccionado ahora mismo. Se fija una vez por
   repintado y la usan todas las cifras de la pantalla, para que no quede ni un
   solo «€» encima de un importe en zlotys o en coronas. */
let calcCur = DIVISA_BASE;
function mm(x){ return money(x, calcCur); }

function calc(){
  const i=inputs();
  calcCur = divisaDe(sel.value);
  const e=unitEconomics(i);

  renderAvisos(avisosValidador(i, e, sel.value));

  set('mProfit', mm(e.profit), e.profit>0?'pos':'neg');
  set('mMargin', pct(e.marginNet), cls(e.marginNet,TARGET.net,0));
  set('mContrib', pct(e.marginContrib), cls(e.marginContrib,TARGET.contrib,0));
  set('mRoi', pct(e.roi), cls(e.roi,TARGET.roi,0));
  set('mBreakeven', mm(Math.max(0,e.maxPpc)), e.maxPpc>0?'warn':'neg');
  document.getElementById('mBeNote').textContent =
    e.maxPpc>0 ? 'equivale a un TACOS máximo del '+e.beTacos.toFixed(1)+'%' : 'ya pierdes dinero sin gastar en PPC';

  const bp=breakevenPrice(i), bl=breakevenLanded(i);
  set('mBePrice', mm(bp), isFinite(bp)&&bp<i.price?'warn':'neg');
  set('mBeLanded', mm(bl), isFinite(bl)&&bl>e.landed?'warn':'neg');

  const inv=i.units*e.landed;
  const cover=i.monthly>0?i.units/i.monthly:Infinity;
  const payback=e.profit>0&&i.monthly>0?inv/(e.profit*i.monthly):Infinity;
  set('mInv', mm(inv), 'warn');
  document.getElementById('mInvNote').textContent=i.units?i.units+' ud × '+mm(e.landed)+' puesto en almacén':'';
  set('mCover', isFinite(cover)?cover.toFixed(1)+' m':'—', cover>6?'warn':'');
  set('mPayback', isFinite(payback)?payback.toFixed(1)+' m':'—', payback<=4?'pos':(payback<=8?'warn':'neg'));
  set('mOrder', mm(e.profit*i.units), e.profit>0?'pos':'neg');
  document.getElementById('mOrderNote').textContent=i.units?'pedido de '+i.units+' ud':'';
  set('mMonthly', mm(e.profit*i.monthly), e.profit>0?'pos':'neg');
  document.getElementById('mMonthlyNote').textContent=i.monthly?i.monthly+' ud/mes · cota superior, el PPC sube al escalar':'';

  waterfall(i,e);
  const stress=stressTest(i);
  verdict(e,payback,stress);
  renderStress(stress);
  if(document.getElementById('view-paises').classList.contains('active')) renderCountryTable();
}
function set(id,val,c){
  const el=document.getElementById(id);
  if(!el)return;
  el.textContent=val; el.className='m-val'+(c?' '+c:'');
}

/* Pinta los avisos del motor y pone la divisa del mercado en cada unidad de
   dinero de la pantalla. Las dos cosas van juntas a propósito: son la misma
   idea — que lo que se lee coincida con lo que se está calculando. */
function renderAvisos(avisos){
  const box=document.getElementById('calcAvisos');
  if(box){
    box.innerHTML = !avisos.length ? '' : avisos.map(a=>
      '<div class="note-box '+(a.tipo==='grave'?'stop':a.tipo==='divisa'?'info':'caution')+'" '+
      'data-aviso="'+a.tipo+'" style="margin:0 0 10px;font-size:12.5px">'+a.txt+'</div>').join('');
  }
  /* El símbolo de cada campo de dinero. Un «€» encima de un PVP en zlotys es
     exactamente el número creíble y falso que este hub no puede dar. */
  const simbolo = esBase(calcCur) ? '€' : (SIMBOLO[calcCur]||calcCur);
  const vista=document.getElementById('view-calculadora');
  if(vista) vista.querySelectorAll('[data-money]').forEach(el=>{ el.textContent=simbolo; });
}

function waterfall(i,e){
  const r=Math.min(0.95,Math.max(0,i.returnRate));
  const vatAmt=i.price-e.netRev;
  const rows=[
    ['IVA repercutido', vatAmt, '#9aa8ac'],
    ['Ingreso perdido en devoluciones', r*e.netRev, '#a16207'],
    ['Comisión referral', e.referralCost, '#c2410c'],
    ['Tarifa FBA', e.fba, '#ea580c'],
    ['Coste de producto', e.productCost, '#7c3aed'],
    ['Publicidad', e.ppc, '#0284c7'],
    ['Almacenaje + bajo inv.', e.storage+i.lowInvEur, '#64748b'],
    ['Procesamiento de devoluciones', e.returnCost, '#b45309'],
    ['EPR + gestoría IVA', i.eprEur+e.vatUnit, '#475569'],
    ['Beneficio', e.profit, e.profit>0?'#15803D':'#B91C1C']
  ];
  const total=rows.reduce((a,b)=>a+b[1],0);
  const max=Math.max.apply(null,rows.map(x=>Math.abs(x[1])).concat([Math.abs(i.price)*0.05,0.01]));
  document.getElementById('waterfall').innerHTML = rows.map(x=>
    '<div class="wrow"><span class="wname">'+x[0]+'</span>'+
    '<span class="wbar"><i style="width:'+Math.min(100,Math.abs(x[1])/max*100).toFixed(1)+'%;background:'+x[2]+'"></i></span>'+
    '<span class="wval" style="color:'+(x[0]==='Beneficio'?x[2]:'#516066')+'">'+mm(x[1])+'</span></div>'
  ).join('') +
  '<div class="wrow" style="margin-top:8px;padding-top:9px;border-top:1px solid var(--hair)">'+
  '<span class="wname" style="color:var(--text);font-weight:600">Suma = PVP</span>'+
  '<span class="wbar" style="background:none"></span>'+
  '<span class="wval" id="wfTotal">'+mm(total)+'</span></div>';
}

function stressTest(i){
  const S=[
    {name:'Base', mod:x=>x},
    {name:'PPC +50%', mod:x=>({...x, ppcPct:x.ppcPct*1.5, ppcEur:x.ppcEur*1.5})},
    {name:'Precio −10%', mod:x=>({...x, price:x.price*0.9})},
    {name:'Coste +15%', mod:x=>({...x, cogs:x.cogs*1.15, freight:x.freight*1.15})},
    {name:'Devoluciones ×2', mod:x=>({...x, returnRate:x.returnRate*2})},
    {name:'Combinado', mod:x=>({...x, ppcPct:x.ppcPct*1.5, ppcEur:x.ppcEur*1.5, price:x.price*0.9, cogs:x.cogs*1.15, freight:x.freight*1.15, returnRate:x.returnRate*2})}
  ];
  return S.map(s=>{const e=unitEconomics(s.mod(i));return {name:s.name, margin:e.marginNet, profit:e.profit};});
}
function renderStress(rows){
  const t=document.getElementById('stressTable');
  t.innerHTML='<tr><th>Escenario</th><th class="num">Margen neto</th><th class="num">€/ud</th></tr>'+
    rows.map((r,idx)=>{
      const c=r.profit<=0?'neg':(r.margin<TARGET.net?'warn':'pos');
      const bold=(idx===0||idx===rows.length-1)?'font-weight:600;':'';
      return '<tr><td class="name" style="'+bold+'">'+r.name+'</td>'+
             '<td class="num '+c+'" style="'+bold+'">'+pct(r.margin)+'</td>'+
             '<td class="num '+c+'" style="'+bold+'">'+mm(r.profit)+'</td></tr>';
    }).join('');
}

function verdict(e,payback,stress){
  const v=document.getElementById('verdict');
  const worst=stress[stress.length-1];
  const C=[
    {label:'Beneficio positivo por unidad',      ok:e.profit>0,                 val:mm(e.profit)},
    {label:'Margen neto ≥ 15%',                  ok:e.marginNet>=TARGET.net,    val:pct(e.marginNet)},
    {label:'Contribución ≥ 30% (antes de PPC)',  ok:e.marginContrib>=TARGET.contrib, val:pct(e.marginContrib)},
    {label:'ROI ≥ 60% sobre coste de producto',  ok:e.roi>=TARGET.roi,          val:pct(e.roi)},
    {label:'Aguanta el escenario combinado',     ok:worst.profit>0,             val:mm(worst.profit)}
  ];
  const failed=C.filter(c=>!c.ok);
  let state,head,note;
  if(e.profit<=0){
    state='stop'; head='No comprar';
    note='Pierdes dinero en cada unidad con los costes reales dentro. Necesitas bajar el coste de compra por debajo de '+mm(breakevenLanded(inputs()))+' o subir el precio por encima de '+mm(breakevenPrice(inputs()))+'.';
  } else if(failed.length===0){
    state='go'; head='Válido para escalar';
    note='Cumple los cinco criterios y aguanta el escenario de estrés. Puedes comprometer stock y presupuesto de PPC con este producto.';
  } else if(failed.length===1 && failed[0].label.indexOf('estrés')===-1 && failed[0].label.indexOf('combinado')===-1){
    state='caution'; head='Viable, pero con un margen de error estrecho';
    note='Falla 1 de 5 criterios: '+failed[0].label.toLowerCase()+'. Sirve para probar con un pedido pequeño, no para invertir a fondo.';
  } else {
    state='caution'; head='No escalar todavía';
    note='Falla '+failed.length+' de 5 criterios. '+(worst.profit<=0?'Lo más grave: el escenario combinado te lleva a '+mm(worst.profit)+'/ud, así que cualquier desviación simultánea te pone en pérdidas.':'Ajusta precio, coste o PPC antes de comprometer capital.');
  }
  v.className='verdict '+state;
  document.getElementById('vLabel').textContent='Veredicto · '+C.filter(c=>c.ok).length+' de 5 criterios';
  document.getElementById('vHead').textContent=head;
  document.getElementById('vNote').textContent=note;
  document.getElementById('criteria').innerHTML=C.map(c=>
    '<div class="crit"><span class="cmark">'+(c.ok?'✓':'✕')+'</span><span>'+c.label+'</span><span class="cval">'+c.val+'</span></div>'
  ).join('');
}

/* ================= COMPARADOR PANEU =================

   INTEGRACIÓN · el comparador pinta MERCADOS, y un país que el hub no puede
   afirmar que exista no es un mercado. El carril 8 añadió Chequia a COUNTRIES
   marcada `origen:'heredado'` y lo dejó escrito con todas las letras: el
   encargo dice que es país de almacenaje PanEU, pero no aparece ni una vez en
   los ficheros reales —ni venta, ni jurisdicción, ni traslado—. Está en la
   lista para que Cumplimiento pueda avisar de un alta que quizá haga falta, no
   para que el comparador la pinte como un mercado más con su divisa y su
   columna, que es presentar como medido lo que es heredado.

   Los países medidos o de base sí entran. Si algún día CZ se confirma —una
   sola fila real basta—, cambia `origen` y entra sola, sin tocar esta línea. */
const COMPARABLES = () => COUNTRIES.filter(c => c.origen !== 'heredado');

function initCountryState(){
  const base=n('price'), monthly=n('monthly'), fba=n('fba');
  COUNTRIES.forEach(c=>{
    if(!countryState[c.code]) countryState[c.code]={
      on:['DE','FR','IT','ES'].indexOf(c.code)>=0,
      price:base, fba:fba, units:Math.round(monthly*12/4), vatCost:c.vatCost
    };
    if(countryState[c.code].fba==null) countryState[c.code].fba=fba;
  });
}
function cSet(code,field,val){
  countryState[code][field] = field==='on' ? val : (parseFloat(val)||0);
  updateCountryCells();   // recalcula sin reconstruir la tabla (no se pierde el foco)
}
function countryRows(){
  const i=inputs();
  return COMPARABLES().map(c=>{
    const s=countryState[c.code];
    const li=(c.lowInv && i.lowInvEur)?i.lowInvEur:0;
    const per=Object.assign({},i,{fbaBase:s.fba, lowInvEur:li, vatAnnual:s.vatCost, monthly:s.units/12});
    const e=unitEconomics(per,{price:s.price, vat:c.vat});
    /* `cur` viaja con la fila. Todo lo que pinte o sume esta tabla tiene que
       poder preguntar en qué divisa está el número que tiene delante, porque
       aquí es donde antes se sumaban zlotys y coronas como si fueran euros. */
    return {c,s,e,cur:c.cur||DIVISA_BASE, annual:e.profit*s.units};
  });
}
function renderCountryTable(){
  initCountryState();
  const t=document.getElementById('countryTable');
  t.innerHTML =
    '<tr><th style="width:26px"></th><th>País</th><th class="num">Divisa</th><th class="num">IVA</th><th class="num">PVP</th>'+
    '<th class="num">FBA /ud</th><th class="num">ud/año</th><th class="num">Gestoría /año</th>'+
    '<th class="num">Benef./ud</th><th class="num">Margen</th><th class="num">Aporta /año</th></tr>'+
    COMPARABLES().map(c=>{
      const s=countryState[c.code];
      const inp=(f,st,v)=>'<input type="number" step="'+st+'" value="'+v+'" oninput="cSet(\''+c.code+'\',\''+f+'\',this.value)">';
      return '<tr id="crow-'+c.code+'">'+
        '<td><input type="checkbox" style="width:auto" '+(s.on?'checked':'')+' onchange="cSet(\''+c.code+'\',\'on\',this.checked)"></td>'+
        '<td class="name"><strong>'+c.code+'</strong> '+c.name+' '+(c.storage?'<span class="pill core">stock local</span>':'<span class="pill">EFN</span>')+'</td>'+
        '<td class="num" data-cur="'+(c.cur||DIVISA_BASE)+'">'+(esBase(c.cur)?'€ EUR':'<strong style="color:var(--caution)">'+(c.cur)+'</strong>')+'</td>'+
        '<td class="num">'+c.vat+'%</td>'+
        '<td class="num">'+inp('price','0.01',s.price.toFixed(2))+'</td>'+
        '<td class="num">'+inp('fba','0.01',s.fba.toFixed(2))+'</td>'+
        '<td class="num">'+inp('units','10',s.units)+'</td>'+
        '<td class="num">'+inp('vatCost','50',s.vatCost)+'</td>'+
        '<td class="num" id="cp-'+c.code+'">—</td>'+
        '<td class="num" id="cm-'+c.code+'">—</td>'+
        '<td class="num" id="ca-'+c.code+'" style="font-weight:600">—</td></tr>';
    }).join('');
  updateCountryCells();
}
function updateCountryCells(){
  const rows=countryRows();
  rows.forEach(({c,e,s,cur,annual})=>{
    const mc=e.profit<=0?'neg':(e.marginNet>=TARGET.net?'pos':'warn');
    const cp=document.getElementById('cp-'+c.code); if(!cp)return;
    /* Cada celda con SU divisa. Antes todas decían «€». */
    cp.textContent=money(e.profit,cur); cp.className='num '+mc;
    const cm=document.getElementById('cm-'+c.code);
    cm.textContent=pct(e.marginNet); cm.className='num '+mc;
    const ca=document.getElementById('ca-'+c.code);
    ca.textContent=money(annual,cur); ca.className='num '+(annual<=0?'neg':'pos');
    const tr=document.getElementById('crow-'+c.code);
    tr.className=s.on?'':'dim';
  });

  const on = rows.filter(r=>r.s.on);
  /* EL TOTAL SOLO SUMA LO QUE ES SUMABLE.

     Este era el número falso de esta pantalla: un único total con el símbolo
     del euro que incluía la aportación de Polonia en zlotys y la de Suecia en
     coronas. Con los valores por defecto y esos dos mercados activados salía
     «4525,14 €/año» cuando los euros de verdad eran 2461,99; el 45,6 % del
     titular no eran euros. El hub no tiene tipo de cambio y no se lo inventa
     (es la misma doctrina que ya aplica `pnl()` con las tarifas en otra
     divisa): lo que hace es sumar los euros y CONTAR aparte lo demás. */
  const enEuros = on.filter(r=>esBase(r.cur));
  const fuera   = on.filter(r=>!esBase(r.cur));
  const total   = enEuros.reduce((a,r)=>a+r.annual,0);
  const active  = on.length;

  /* El ranking también. «El que más aporta es Suecia» comparaba coronas contra
     euros, y a ~11 SEK/€ Suecia no era el primero sino el último. Solo se
     corona al mejor de entre los que están en la misma divisa. */
  const best = enEuros.slice().sort((a,b)=>b.annual-a.annual)[0];
  /* Un mercado destruye valor o no lo destruye con independencia de la divisa:
     el signo sí es comparable aunque el importe no lo sea. */
  const losers = on.filter(r=>r.annual<=0);
  const efnDefault = on.filter(r=>!r.c.storage && Math.abs(r.s.fba-n('fba'))<0.001);

  let msg='<strong>Resultado con '+active+' mercado'+(active===1?'':'s')+' activo'+(active===1?'':'s')+': '+
          eur(total)+'/año</strong>, sumando solo los '+enEuros.length+' que cobran en euros. ';
  if(best) msg+='De esos, el que más aporta es '+esc(best.c.name)+' con '+eur(best.annual)+'. ';
  if(fuera.length){
    msg+='<br><br><span style="color:var(--caution)"><strong>'+fuera.length+' mercado'+(fuera.length===1?'':'s')+
      ' no cobra'+(fuera.length===1?'':'n')+' en euros y por eso no está'+(fuera.length===1?'':'n')+' en ese total:</strong> '+
      fuera.map(r=>esc(r.c.code)+' '+money(r.annual,r.cur)+' ('+esc(r.cur)+')').join(' · ')+'. '+
      'El hub no convierte divisas porque no tiene tipo de cambio, y sumarlas con uno inventado no daría '+
      'un total aproximado: daría uno falso con pinta de exacto. Para compararlos con los de arriba, pasa '+
      'su aportación a euros al cambio de tu banco, o teclea el PVP, la tarifa FBA y la gestoría de '+
      'esas filas ya convertidos a euros y cámbiales la divisa en tu hoja, no aquí. '+
      'Los porcentajes de margen sí son comparables tal cual: no dependen de la divisa.</span> ';
  }
  if(losers.length){
    msg+='<br><br><span style="color:var(--stop)"><strong>'+losers.length+' mercado'+(losers.length===1?'':'s')+' destruye'+(losers.length===1?'':'n')+' valor</strong> ('+losers.map(l=>esc(l.c.code)).join(', ')+'): el margen unitario puede parecer aceptable, pero el volumen no cubre el coste fijo de cumplimiento. Antes de abrirlos, o subes el volumen o negocias la gestoría a la baja.</span> ';
  } else if(active){
    msg+='Todos los mercados activos cubren su coste de cumplimiento. Para encontrar tu umbral real de entrada en un país candidato, baja su volumen estimado hasta que la aportación anual pase a negativa: ese es el mínimo que necesitas vender allí. ';
  }
  /* La tabla hereda de la calculadora el coste puesto en almacén, el EPR y el
     resto de costes unitarios. Si la calculadora está puesta en un mercado que
     no cobra en euros, esos costes están en esa divisa y se están aplicando a
     las nueve filas. Es la misma mezcla, una capa más abajo. */
  if(!esBase(divisaDe(sel.value))){
    msg+='<br><br><span style="color:var(--stop)"><strong>La calculadora está en '+esc(sel.value)+
      ', que cobra en '+esc(divisaDe(sel.value))+'.</strong> Esta tabla hereda de ella el coste puesto '+
      'en almacén, el EPR y el resto de costes por unidad, así que los está aplicando en '+
      esc(divisaDe(sel.value))+' a filas que cobran en euros. Vuelve a la calculadora y ponla en un '+
      'mercado del euro antes de leer estos números.</span> ';
  }
  if(efnDefault.length){
    msg+='<br><br><span style="color:var(--caution)"><strong>Atención:</strong> '+efnDefault.map(r=>esc(r.c.code)).join(', ')+' se sirve'+(efnDefault.length===1?'':'n')+' por EFN transfronterizo y '+(efnDefault.length===1?'tiene':'tienen')+' la tarifa FBA por defecto, la misma que un envío local. <strong>La tarifa transfronteriza es más cara</strong>, así que su rentabilidad aquí está sobrestimada. Copia la tarifa real de tu rate card en la columna FBA antes de usar esta tabla para decidir.</span>';
  }
  document.getElementById('countryVerdict').innerHTML=msg;
}

