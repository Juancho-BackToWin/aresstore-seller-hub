/* ================= HELPERS ================= */
function n(id){const el=document.getElementById(id);const v=parseFloat(el?el.value:0);return isNaN(v)?0:v;}
function chk(id){const el=document.getElementById(id);return el?el.checked:false;}
function eur(x){if(!isFinite(x))return '—';return (x<0?'-':'')+'€'+Math.abs(x).toFixed(2);}
function pct(x){if(!isFinite(x))return '—';return x.toFixed(1)+'%';}
function cls(v,good,mid){return v>=good?'pos':(v>=mid?'warn':'neg');}

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
  const refundAdmin = Math.min(5, 0.20*referral);
  const retProc = i.retProcMode==='apparel' ? 0.5*fba
                : i.retProcMode==='manual'  ? i.retProcEur : 0;
  const annualUnits = i.monthly*12;
  const vatUnit = annualUnits>0 ? i.vatAnnual/annualUnits : 0;

  const revenue      = (1-r)*netRev;
  const referralCost = (1-r)*referral + r*refundAdmin;
  const returnCost   = r*retProc;
  const productCost  = landed*(1 - r*(1-u));
  const opsCost      = fba + storage + i.lowInvEur + i.eprEur + vatUnit;

  const contribution = revenue - referralCost - returnCost - productCost - opsCost;
  const profit       = contribution - ppc;
  const marginNet    = revenue>0 ? profit/revenue*100 : 0;
  const marginContrib= revenue>0 ? contribution/revenue*100 : 0;
  const roi          = landed>0 ? profit/landed*100 : 0;
  const beTacos      = price>0 ? contribution/price*100 : 0;

  return {price,vat,netRev,landed,referral,fba,ppc,storage,refundAdmin,retProc,vatUnit,
          revenue,referralCost,returnCost,productCost,opsCost,
          contribution,profit,marginNet,marginContrib,roi,maxPpc:contribution,beTacos};
}

function breakevenPrice(i){
  const r=Math.min(0.95,Math.max(0,i.returnRate)), u=Math.min(1,Math.max(0,i.unsellable));
  const landed=i.cogs+i.freight;
  const fba=i.fbaBase*(i.fuel?FUEL:1);
  const storage=(i.litres/1000)*i.storageRate*i.stockMonths;
  const retProc=i.retProcMode==='apparel'?0.5*fba:(i.retProcMode==='manual'?i.retProcEur:0);
  const annualUnits=i.monthly*12;
  const vatUnit=annualUnits>0?i.vatAnnual/annualUnits:0;
  let k=(1-r)/(1+i.vat/100) - (1-r)*i.referralPct - r*0.20*i.referralPct;
  if(i.ppcMode==='tacos') k-=i.ppcPct;
  const c=-(fba+storage+i.lowInvEur+i.eprEur+vatUnit) - r*retProc - landed*(1-r*(1-u))
          - (i.ppcMode==='tacos'?0:i.ppcEur);
  return k>0 ? -c/k : NaN;
}
function breakevenLanded(i){
  const e=unitEconomics(i);
  const r=Math.min(0.95,Math.max(0,i.returnRate)), u=Math.min(1,Math.max(0,i.unsellable));
  const coef=1-r*(1-u);
  return coef>0 ? e.landed + e.profit/coef : NaN;
}

/* ================= RENDER ================= */
function calc(){
  const i=inputs();
  const e=unitEconomics(i);

  set('mProfit', eur(e.profit), e.profit>0?'pos':'neg');
  set('mMargin', pct(e.marginNet), cls(e.marginNet,TARGET.net,0));
  set('mContrib', pct(e.marginContrib), cls(e.marginContrib,TARGET.contrib,0));
  set('mRoi', pct(e.roi), cls(e.roi,TARGET.roi,0));
  set('mBreakeven', eur(Math.max(0,e.maxPpc)), e.maxPpc>0?'warn':'neg');
  document.getElementById('mBeNote').textContent =
    e.maxPpc>0 ? 'equivale a un TACOS máximo del '+e.beTacos.toFixed(1)+'%' : 'ya pierdes dinero sin gastar en PPC';

  const bp=breakevenPrice(i), bl=breakevenLanded(i);
  set('mBePrice', eur(bp), isFinite(bp)&&bp<i.price?'warn':'neg');
  set('mBeLanded', eur(bl), isFinite(bl)&&bl>e.landed?'warn':'neg');

  const inv=i.units*e.landed;
  const cover=i.monthly>0?i.units/i.monthly:Infinity;
  const payback=e.profit>0&&i.monthly>0?inv/(e.profit*i.monthly):Infinity;
  set('mInv', eur(inv), 'warn');
  document.getElementById('mInvNote').textContent=i.units?i.units+' ud × '+eur(e.landed)+' puesto en almacén':'';
  set('mCover', isFinite(cover)?cover.toFixed(1)+' m':'—', cover>6?'warn':'');
  set('mPayback', isFinite(payback)?payback.toFixed(1)+' m':'—', payback<=4?'pos':(payback<=8?'warn':'neg'));
  set('mOrder', eur(e.profit*i.units), e.profit>0?'pos':'neg');
  document.getElementById('mOrderNote').textContent=i.units?'pedido de '+i.units+' ud':'';
  set('mMonthly', eur(e.profit*i.monthly), e.profit>0?'pos':'neg');
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
    ['Return processing fee', e.returnCost, '#b45309'],
    ['EPR + gestoría IVA', i.eprEur+e.vatUnit, '#475569'],
    ['Beneficio', e.profit, e.profit>0?'#15803D':'#B91C1C']
  ];
  const total=rows.reduce((a,b)=>a+b[1],0);
  const max=Math.max.apply(null,rows.map(x=>Math.abs(x[1])).concat([Math.abs(i.price)*0.05,0.01]));
  document.getElementById('waterfall').innerHTML = rows.map(x=>
    '<div class="wrow"><span class="wname">'+x[0]+'</span>'+
    '<span class="wbar"><i style="width:'+Math.min(100,Math.abs(x[1])/max*100).toFixed(1)+'%;background:'+x[2]+'"></i></span>'+
    '<span class="wval" style="color:'+(x[0]==='Beneficio'?x[2]:'#516066')+'">'+eur(x[1])+'</span></div>'
  ).join('') +
  '<div class="wrow" style="margin-top:8px;padding-top:9px;border-top:1px solid var(--hair)">'+
  '<span class="wname" style="color:var(--text);font-weight:600">Suma = PVP</span>'+
  '<span class="wbar" style="background:none"></span>'+
  '<span class="wval" id="wfTotal">'+eur(total)+'</span></div>';
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
             '<td class="num '+c+'" style="'+bold+'">'+eur(r.profit)+'</td></tr>';
    }).join('');
}

function verdict(e,payback,stress){
  const v=document.getElementById('verdict');
  const worst=stress[stress.length-1];
  const C=[
    {label:'Beneficio positivo por unidad',      ok:e.profit>0,                 val:eur(e.profit)},
    {label:'Margen neto ≥ 15%',                  ok:e.marginNet>=TARGET.net,    val:pct(e.marginNet)},
    {label:'Contribución ≥ 30% (antes de PPC)',  ok:e.marginContrib>=TARGET.contrib, val:pct(e.marginContrib)},
    {label:'ROI ≥ 60% sobre coste de producto',  ok:e.roi>=TARGET.roi,          val:pct(e.roi)},
    {label:'Aguanta el escenario combinado',     ok:worst.profit>0,             val:eur(worst.profit)}
  ];
  const failed=C.filter(c=>!c.ok);
  let state,head,note;
  if(e.profit<=0){
    state='stop'; head='No comprar';
    note='Pierdes dinero en cada unidad con los costes reales dentro. Necesitas bajar el coste de compra por debajo de '+eur(breakevenLanded(inputs()))+' o subir el precio por encima de '+eur(breakevenPrice(inputs()))+'.';
  } else if(failed.length===0){
    state='go'; head='Válido para escalar';
    note='Cumple los cinco criterios y aguanta el escenario de estrés. Puedes comprometer stock y presupuesto de PPC con este producto.';
  } else if(failed.length===1 && failed[0].label.indexOf('estrés')===-1 && failed[0].label.indexOf('combinado')===-1){
    state='caution'; head='Viable, pero con un margen de error estrecho';
    note='Falla 1 de 5 criterios: '+failed[0].label.toLowerCase()+'. Sirve para probar con un pedido pequeño, no para invertir a fondo.';
  } else {
    state='caution'; head='No escalar todavía';
    note='Falla '+failed.length+' de 5 criterios. '+(worst.profit<=0?'Lo más grave: el escenario combinado te lleva a '+eur(worst.profit)+'/ud, así que cualquier desviación simultánea te pone en pérdidas.':'Ajusta precio, coste o PPC antes de comprometer capital.');
  }
  v.className='verdict '+state;
  document.getElementById('vLabel').textContent='Veredicto · '+C.filter(c=>c.ok).length+' de 5 criterios';
  document.getElementById('vHead').textContent=head;
  document.getElementById('vNote').textContent=note;
  document.getElementById('criteria').innerHTML=C.map(c=>
    '<div class="crit"><span class="cmark">'+(c.ok?'✓':'✕')+'</span><span>'+c.label+'</span><span class="cval">'+c.val+'</span></div>'
  ).join('');
}

/* ================= COMPARADOR PANEU ================= */
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
  return COUNTRIES.map(c=>{
    const s=countryState[c.code];
    const li=(c.lowInv && i.lowInvEur)?i.lowInvEur:0;
    const per=Object.assign({},i,{fbaBase:s.fba, lowInvEur:li, vatAnnual:s.vatCost, monthly:s.units/12});
    const e=unitEconomics(per,{price:s.price, vat:c.vat});
    return {c,s,e,annual:e.profit*s.units};
  });
}
function renderCountryTable(){
  initCountryState();
  const t=document.getElementById('countryTable');
  t.innerHTML =
    '<tr><th style="width:26px"></th><th>País</th><th class="num">IVA</th><th class="num">PVP €</th>'+
    '<th class="num">FBA €/ud</th><th class="num">ud/año</th><th class="num">Gestoría €/año</th>'+
    '<th class="num">€/ud</th><th class="num">Margen</th><th class="num">Aporta €/año</th></tr>'+
    COUNTRIES.map(c=>{
      const s=countryState[c.code];
      const inp=(f,st,v)=>'<input type="number" step="'+st+'" value="'+v+'" oninput="cSet(\''+c.code+'\',\''+f+'\',this.value)">';
      return '<tr id="crow-'+c.code+'">'+
        '<td><input type="checkbox" style="width:auto" '+(s.on?'checked':'')+' onchange="cSet(\''+c.code+'\',\'on\',this.checked)"></td>'+
        '<td class="name"><strong>'+c.code+'</strong> '+c.name+' '+(c.storage?'<span class="pill core">stock local</span>':'<span class="pill">EFN</span>')+'</td>'+
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
  let total=0, active=0;
  rows.forEach(({c,s,e,annual})=>{
    const mc=e.profit<=0?'neg':(e.marginNet>=TARGET.net?'pos':'warn');
    const cp=document.getElementById('cp-'+c.code); if(!cp)return;
    cp.textContent=eur(e.profit); cp.className='num '+mc;
    const cm=document.getElementById('cm-'+c.code);
    cm.textContent=pct(e.marginNet); cm.className='num '+mc;
    const ca=document.getElementById('ca-'+c.code);
    ca.textContent=eur(annual); ca.className='num '+(annual<=0?'neg':'pos');
    const tr=document.getElementById('crow-'+c.code);
    tr.className=s.on?'':'dim';
    if(s.on){total+=annual;active++;}
  });
  const on=rows.filter(r=>r.s.on);
  const losers=on.filter(r=>r.annual<=0);
  const best=on.slice().sort((a,b)=>b.annual-a.annual)[0];
  const efnDefault=on.filter(r=>!r.c.storage && Math.abs(r.s.fba-n('fba'))<0.001);
  let msg='<strong>Resultado con '+active+' mercado'+(active===1?'':'s')+' activo'+(active===1?'':'s')+': '+eur(total)+'/año.</strong> ';
  if(best) msg+='El que más aporta es '+best.c.name+' con '+eur(best.annual)+'. ';
  if(losers.length){
    msg+='<span style="color:var(--stop)"><strong>'+losers.length+' mercado'+(losers.length===1?'':'s')+' destruye'+(losers.length===1?'':'n')+' valor</strong> ('+losers.map(l=>l.c.code).join(', ')+'): el margen unitario puede parecer aceptable, pero el volumen no cubre el coste fijo de cumplimiento. Antes de abrirlos, o subes el volumen o negocias la gestoría a la baja.</span> ';
  } else if(active){
    msg+='Todos los mercados activos cubren su coste de cumplimiento. Para encontrar tu umbral real de entrada en un país candidato, baja su volumen estimado hasta que la aportación anual pase a negativa: ese es el mínimo que necesitas vender allí. ';
  }
  if(efnDefault.length){
    msg+='<br><br><span style="color:var(--caution)"><strong>Atención:</strong> '+efnDefault.map(r=>r.c.code).join(', ')+' se sirve'+(efnDefault.length===1?'':'n')+' por EFN transfronterizo y '+(efnDefault.length===1?'tiene':'tienen')+' la tarifa FBA por defecto, la misma que un envío local. <strong>La tarifa transfronteriza es más cara</strong>, así que su rentabilidad aquí está sobrestimada. Copia la tarifa real de tu rate card en la columna FBA antes de usar esta tabla para decidir.</span>';
  }
  document.getElementById('countryVerdict').innerHTML=msg;
}

