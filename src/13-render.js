
/* =========================================================================
   4b · LANZADOR DE APLICACIONES
   El Hub es el contenedor; «Gestión Seller» es la primera app que vive dentro.
   Añadir otra app en el futuro son dos pasos: una tarjeta en .apps y su vista.
   ========================================================================= */
function openApp(){
  document.getElementById('shellHome').style.display='none';
  document.getElementById('shellApp').style.display='grid';
  try{ location.hash='#gestion'; }catch(e){}
  refreshAll(); window.scrollTo(0,0);
}
function closeApp(){
  document.getElementById('shellApp').style.display='none';
  document.getElementById('shellHome').style.display='flex';
  document.getElementById('side').classList.remove('open');
  try{ location.hash=''; }catch(e){}
  renderHome(); window.scrollTo(0,0);
}
function renderHome(){
  const el=document.getElementById('homeStrip'); if(!el) return;
  let P={grossInc:0,profit:0,units:0}, nAlert=0;
  try{ P=pnl(); }catch(e){}
  const d = daysBetween(today(), new Date(PPWR_DATE));
  const act = COUNTRIES.filter(c=>(DB.compliance[c.code]||{}).active);
  const missing = act.filter(c=>!(DB.compliance[c.code]||{}).epr).length;
  const nRep = freshness().length;
  const chips=[];
  if(nRep===0){
    chips.push('<div class="hchip alert"><b>0</b> informes cargados · entra y suelta los de Seller Central</div>');
  } else {
    chips.push('<div class="hchip"><b>'+fmt(P.grossInc,0)+'</b> ventas '+(periodDays||'')+' d</div>');
    chips.push('<div class="hchip"><b>'+fmt(P.profit,0)+'</b> beneficio estimado</div>');
    chips.push('<div class="hchip"><b>'+num(nRep)+'</b> informes cargados</div>');
  }
  if(missing>0 && d>-400) chips.push('<div class="hchip alert"><b>'+(d>=0?d+' d':'vencido')+'</b> para el PPWR · '+missing+' mercado'+(missing===1?'':'s')+' sin EPR</div>');
  el.innerHTML=chips.join('');
}

/* =========================================================================
   5 · NAVEGACIÓN
   ========================================================================= */
const CRUMBS = {
  panel:'Estado del negocio', datos:'Informes de Seller Central',
  historico:'Lo que ya no se puede reconstruir',
  rentabilidad:'Devengo · qué has ganado', tesoreria:'Caja · qué has cobrado y qué debes',
  catalogo:'El objeto que atraviesa todo el hub', inventario:'Cobertura, reposición y riesgo de tarifas',
  compras:'Proveedores, pedidos y anticipos', publicidad:'Términos de búsqueda y desperdicio',
  calculadora:'Validación de producto · coste real por unidad',
  paises:'Decisión de expansión · beneficio anual tras cumplimiento',
  cumplimiento:'IVA y EPR por país', diagnostico:'Marco de referencia · Amazon Europa 2026',
  auditoria:'Qué cambió del modelo v0.1 y por qué', acerca:'Arquitectura y decisiones de diseño'
};
function go(v){
  const b = document.querySelector('.nav-item[data-view="'+v+'"]');
  if(b) b.click();
}
document.querySelectorAll('.nav-item[data-view]').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const v=b.dataset.view;
    document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
    const el=document.getElementById('view-'+v); if(el) el.classList.add('active');
    document.getElementById('viewTitle').textContent=b.textContent.replace(/\s*\d+\s*$/,'').replace('!','').trim();
    document.getElementById('viewCrumb').textContent=CRUMBS[v]||'';
    document.getElementById('side').classList.remove('open');
    refreshAll();
    window.scrollTo(0,0);
  });
});
function bindToc(sel,scope){
  const links=document.querySelectorAll(sel+' a');
  links.forEach(a=>a.addEventListener('click',e=>{
    e.preventDefault();
    const t=document.querySelector(a.getAttribute('href')); if(t) t.scrollIntoView({behavior:'smooth'});
  }));
  window.addEventListener('scroll',()=>{
    const sc=document.querySelector(scope);
    if(!sc||!sc.classList.contains('active'))return;
    let cur='';
    document.querySelectorAll(scope+' .doc h2[id], '+scope+' .doc h3[id]').forEach(h=>{
      if(h.getBoundingClientRect().top<140) cur='#'+h.id;
    });
    links.forEach(a=>a.classList.toggle('on',a.getAttribute('href')===cur));
  });
}
function setCountryFilter(v){ countryFilter=v; refreshAll(); }
function setPeriod(d){
  periodDays=d;
  document.querySelectorAll('#periodSeg button').forEach((b,i)=>b.classList.toggle('on', [30,90,365,0][i]===d));
  refreshAll();
}
function saveTargets(){
  TARGET = {net:n('tgNet'), contrib:n('tgContrib'), roi:n('tgRoi'),
            tacos:n('tgTacos'), cover:n('tgCover'), cash:n('tgCash')};
  saveDB(); refreshAll();
}
function saveCash(){
  DB.settings.cash = {start:n('cashStart'), cycle:n('cashCycle'), reserve:n('cashReserve'),
                      vat:n('cashVat'), ppcDaily:DB.settings.cash.ppcDaily||0};
  saveDB(); renderTesoreria();
}

/* =========================================================================
   6 · COMPONENTES
   ========================================================================= */
function kpi(name,val,sub,state){
  return '<div class="kpi '+(state||'')+'"><div class="k-name">'+name+'</div>'+
         '<div class="k-val">'+val+'</div><div class="k-sub">'+(sub||'')+'</div></div>';
}
function tbl(el,html){ const e=document.getElementById(el); if(e) e.innerHTML=html; }
function noData(msg,btn){
  return '<div class="empty"><strong>Todavía no hay datos para esto</strong>'+msg+
    (btn?'<div style="margin-top:12px"><button class="btn sm primary" onclick="go(\'datos\')">Ir a importar</button></div>':'')+'</div>';
}

/* =========================================================================
   7 · PANEL
   ========================================================================= */
function freshness(){
  const out=[];
  REPORTS.forEach(r=>{
    const i=DB.imports[r.id];
    if(!i) return;
    const age = daysBetween(new Date(i.loadedAt), today());
    out.push({r, age, count:i.count});
  });
  return out;
}
function renderPanel(){
  const P = pnl(), F = freshness();
  const stale = F.filter(f=>f.age>10);
  const nav=document.getElementById('navDatos'); if(nav) nav.textContent=F.length;
  let fresh='';
  if(!F.length){
    fresh = '<div class="note-box warn" style="margin-top:0"><strong>Estás mirando una estimación, no tu negocio.</strong> '+
      'Sin informes importados el hub calcula con supuestos genéricos. Suelta los informes de Seller Central en la pestaña Datos '+
      'y todas estas cifras pasarán a ser las tuyas. <button class="btn sm primary" style="margin-left:8px" onclick="go(\'datos\')">Importar ahora</button></div>';
  } else if(stale.length){
    fresh = '<div class="note-box warn" style="margin-top:0"><strong>'+stale.length+' informe'+(stale.length===1?'':'s')+' con más de 10 días.</strong> '+
      'Un dato viejo es peor que ninguno porque te da confianza injustificada: '+stale.map(s=>esc(s.r.label)+' ('+s.age+' d)').join(', ')+'.</div>';
  }
  document.getElementById('panelFresh').innerHTML = fresh;

  const tag = P.measured ? 'medido' : 'estimado';
  document.getElementById('panelKpis').innerHTML =
    kpi('Ventas '+(periodDays?periodDays+' d':'histórico'), fmt(P.grossInc,0), num(P.units)+' unidades','accent')+
    kpi('Beneficio neto', fmt(P.profit,0), tag+' · '+num(P.units?P.profit/P.units:0,2)+' €/ud', P.profit>0?'pos':'neg')+
    kpi('Margen neto', num(P.margin,1)+'%', 'objetivo ≥'+TARGET.net+'%', P.margin>=TARGET.net?'pos':(P.margin>0?'warn':'neg'))+
    kpi('ROI', num(P.roi,0)+'%', 'sobre coste de producto', P.roi>=TARGET.roi?'pos':(P.roi>0?'warn':'neg'))+
    kpi('TACOS', num(P.tacos,1)+'%', 'objetivo <'+TARGET.tacos+'%', P.tacos<=TARGET.tacos?'pos':'warn')+
    kpi('Precio medio', fmt(P.avgPrice), 'devoluciones '+num(P.retRate,1)+'%','');

  // ---- alertas ordenadas por coste de no actuar ----
  const A=[];
  const dPPWR = daysBetween(today(), new Date(PPWR_DATE));
  const noEpr = COUNTRIES.filter(c=>(DB.compliance[c.code]||{}).active && !(DB.compliance[c.code]||{}).epr);
  if(noEpr.length && dPPWR>-400){
    A.push({p:0,lvl:'stop',t:'Registro EPR pendiente en '+noEpr.map(c=>c.code).join(', '),
      s: dPPWR>=0 ? 'Quedan '+dPPWR+' días para el 12-ago-2026. A partir de esa fecha los marketplaces verifican el registro y «Pay on Behalf» deja de servir como cumplimiento.'
                  : 'El PPWR entró en vigor el 12-ago-2026, hace '+(-dPPWR)+' días. Sin plazo ya que agotar: riesgo abierto de bloqueo de listados y sanción, y «Pay on Behalf» no te cubre.', go:'cumplimiento'});
  }
  const cash = cashProjection();
  const low = cash.filter(c=>c.bal < TARGET.cash);
  if(low.length){
    A.push({p:1,lvl:'stop',t:'La caja baja del mínimo en '+low[0].k+' días',
      s:'Saldo proyectado de '+fmt(low[0].bal,0)+' el '+low[0].date.toLocaleDateString('es-ES')+', por debajo de tu colchón de '+fmt(TARGET.cash,0)+'.', go:'tesoreria'});
  }
  const I = invStats();
  const rupture = I.filter(r=>r.risk==='low' && r.velocity>0);
  if(rupture.length) A.push({p:2,lvl:'warn',t:rupture.length+' producto'+(rupture.length===1?'':'s')+' bajo 28 días de cobertura',
    s:'Entras en tarifa por bajo inventario en Alemania, Francia, Italia y España: '+rupture.slice(0,3).map(r=>esc(r.sku)+' ('+num(r.cover,0)+' d)').join(', ')+'.', go:'inventario'});
  const over = I.filter(r=>r.cover>154 && r.qty>0);
  if(over.length) A.push({p:4,lvl:'warn',t:over.length+' producto'+(over.length===1?'':'s')+' con sobrestock',
    s:'Por encima de 22 semanas de cobertura empieza el recargo por utilización de almacén, y a 241 días el de inventario antiguo.', go:'inventario'});
  if(P.adWaste>0) A.push({p:3,lvl:'warn',t:fmt(P.adWaste,0)+' de publicidad sin una sola venta',
    s:P.adWasteTerms+' términos de búsqueda han gastado sin convertir. Negativizarlos es la palanca de mayor retorno por minuto del PPC.', go:'publicidad'});
  const sk = skuStats().filter(r=>r.profit<0);
  if(sk.length) A.push({p:5,lvl:'warn',t:sk.length+' SKU pierde dinero',
    s:sk.slice(0,3).map(r=>esc(r.sku)+' ('+fmt(r.profit,0)+')').join(', ')+'. Antes de optimizar campañas, arregla el precio o el coste.', go:'rentabilidad'});
  const nocost = DB.products.filter(p=>!toNum(p.cogs));
  if(P.units>0 && P.cogsKnown < P.units*0.9){
    const miss = P.units-P.cogsKnown;
    A.push({p:1.5,lvl:'stop',t:'El margen que estás viendo no incluye el coste de '+num(miss)+' unidades',
      s:'Solo '+num(P.cogsKnown)+' de '+num(P.units)+' unidades vendidas tienen coste de compra cargado, así que el beneficio de '+
        fmt(P.profit,0)+' y el margen del '+num(P.margin,1)+'% están inflados. Es el error más común y el más caro: da por bueno un producto que pierde dinero. '+
        'Crea los productos en Catálogo con su coste real.', go:'catalogo'});
  } else if(nocost.length) A.push({p:6,lvl:'info',t:nocost.length+' producto sin coste cargado',
    s:'Sin coste de compra el margen que ves está inflado. Carga el coste base en Catálogo y, si tienes las compras, sus lotes: el coste base es el que se aplica a las ventas anteriores a tu primer lote.', go:'catalogo'});
  /* M1.1 · un coste sin lote que lo respalde no es un error visible: es un
     número creíble. Por eso el aviso va aquí y no escondido en Catálogo. */
  try{
    const LC = lotCoverage();
    if(!LC.lots && P.units>0){
      A.push({p:4.5,lvl:'warn',t:'Todo tu coste sale de un precio único por SKU',
        s:'Ningún producto tiene lotes de compra cargados, así que una venta de hace un año se costea al mismo precio que la de ayer. Con el flete moviéndose eso desplaza el margen justo donde decides si escalar. Cargar las compras de tus cinco familias es una tarde.', go:'catalogo'});
    } else if(LC.lots && LC.units>0 && LC.pct < 75){
      const dudosas = Math.round(LC.units-LC.lot);
      A.push({p:3.5,lvl:'warn',t:num(100-LC.pct,0)+' % de las unidades se costea sin poder comprobar la compra',
        s: (LC.stale>0 && !LC.stockKnown
            ? num(Math.round(LC.stale))+' de esas unidades consumen lotes anteriores a tu informe de pedidos y no hay informe de inventario para cuadrar cantidades, así que no se puede saber si esos lotes seguían enteros. Importa el informe de inventario y el cálculo se corrige solo. '
            : '')+
           'En total '+num(dudosas)+' unidades del periodo no tienen detrás una compra con unidades suficientes: falta el lote de apertura o falta alguna compra por cargar.', go:'catalogo'});
    }
  }catch(e){}
  /* M0 · el histórico solo existe en este navegador. Perderlo es el único daño
     de este hub que no se arregla volviendo a descargar informes de Amazon. */
  try{
    const due = backupDue(), hs = historyStats();
    if(due>=999 && (hs.days||hs.months)) A.push({p:0.5,lvl:'stop',t:'El histórico no tiene ninguna copia de seguridad',
      s:'Llevas '+hs.span+' días archivados y viven solo en el almacenamiento de este navegador. Si se borran los datos de navegación o cambias de equipo, se pierden, y a diferencia de las ventas el stock de días pasados no se puede volver a pedir a Amazon.', go:'historico'});
    else if(due>0) A.push({p:2.5,lvl:'warn',t:'Han pasado '+due+' días sin copia de seguridad del histórico',
      s:'Un minuto de trabajo protege '+hs.span+' días de historia que no se pueden reconstruir.', go:'historico'});
    if(!hs.days && !hs.months && freshness().length) A.push({p:1.2,lvl:'warn',t:'El histórico está vacío pese a tener informes cargados',
      s:'Reconstrúyelo desde lo importado: el informe de pedidos trae su propio pasado y rellena hacia atrás.', go:'historico'});
  }catch(e){}
  if(!A.length) A.push({p:9,lvl:'go',t:'Nada urgente',
    s:'Ninguna alerta activa con los datos cargados. Aprovecha para trabajar en lo importante y no en lo urgente.', go:null});
  A.sort((a,b)=>a.p-b.p);
  document.getElementById('panelAlerts').innerHTML = A.map(a=>
    '<div class="alert-row"><span class="a-ic '+a.lvl+'">'+(a.lvl==='stop'?'!':a.lvl==='warn'?'▲':a.lvl==='go'?'✓':'i')+'</span>'+
    '<span class="a-body"><strong>'+esc(a.t)+'</strong><span>'+a.s+'</span></span>'+
    (a.go?'<span class="a-go"><button class="btn sm" onclick="go(\''+a.go+'\')">Ver</button></span>':'')+'</div>').join('');

  const CS = countryStats().filter(c=>c.units>0 || c.active);
  tbl('panelCountries','<tr><th>Mercado</th><th class="num">Unid.</th><th class="num">Ventas</th>'+
    '<th class="num">€/ud</th><th class="num">Margen</th><th class="num">Aporta al año</th></tr>'+
    (CS.length? CS.map(x=>'<tr class="'+(x.active?'':'dim')+'"><td class="name"><strong>'+x.c.code+'</strong> '+x.c.name+
      ' '+(x.c.storage?'<span class="pill core">stock</span>':'<span class="pill">EFN</span>')+'</td>'+
      '<td class="num">'+num(x.units)+'</td><td class="num">'+fmt(x.rev,0)+'</td>'+
      '<td class="num '+(x.perUnit>0?'pos':'neg')+'">'+fmt(x.perUnit)+'</td>'+
      '<td class="num '+(x.margin>=TARGET.net?'pos':x.margin>0?'warn':'neg')+'">'+num(x.margin,1)+'%</td>'+
      '<td class="num '+(x.annual>0?'pos':'neg')+'" style="font-weight:600">'+fmt(x.annual,0)+'</td></tr>').join('')
    : '<tr><td colspan="6" class="name mut">Importa el informe de pedidos para ver el desglose por país.</td></tr>'));
}

/* =========================================================================
   8 · DATOS
   ========================================================================= */
function renderDatos(){
  document.getElementById('reportCatalog').innerHTML = REPORTS.map(r=>{
    const i = DB.imports[r.id];
    return '<div class="catcard '+(i?'has':'')+'"><div class="c-name">'+esc(r.label)+
      (r.onlyEn?' <span class="pill warn">solo inglés</span>':'')+'</div>'+
      '<div class="c-path">'+esc(r.path)+'</div>'+
      '<div class="c-path mut" style="font-style:italic">'+esc(r.en)+'</div>'+
      (r.warn?'<div class="c-path" style="color:var(--caution);margin-top:4px">⚠ '+esc(r.warn)+'</div>':'')+
      '<div class="c-state">'+(i? '<span class="pos">✓ '+num(i.count)+' filas</span>' : '<span class="mut">sin cargar</span>')+
      ' · <span class="mut">'+esc(r.feeds)+'</span></div></div>';
  }).join('');
  const F = freshness();
  const nMap = Object.keys(DB.mappings||{}).length;
  const mapInfo = document.getElementById('mapInfo');
  if(mapInfo) mapInfo.innerHTML = nMap
    ? '<strong>'+nMap+' asignación'+(nMap===1?'':'es')+' de columnas guardada'+(nMap===1?'':'s')+'.</strong> '+
      'Cuando sueltes un informe con esas mismas columnas lo reconoceré sin preguntarte nada. '+
      'Si Amazon cambia el formato y algo deja de cuadrar, olvídalas y se vuelven a aprender.'
    : 'Todavía no hay asignaciones guardadas. Se crean solas la primera vez que asignas columnas a mano.';
  tbl('dataState','<tr><th>Informe</th><th class="num">Filas</th><th class="num">Columnas</th><th>Reconocido por</th><th>Archivo</th><th class="num">Antigüedad</th></tr>'+
    (F.length ? F.map(f=>{
      const i=DB.imports[f.r.id];
      const c = f.age<=3?'pos':(f.age<=10?'warn':'neg');
      return '<tr><td class="name">'+esc(f.r.label)+'</td><td class="num">'+num(f.count)+'</td>'+
        '<td class="num mut">'+(i.cols||'—')+'</td>'+
        '<td class="name mut" style="font-size:11.5px">'+esc(i.how||'—')+'</td>'+
        '<td class="name mut" style="font-size:11.5px">'+esc(i.file)+'</td>'+
        '<td class="num '+c+'">'+(f.age===0?'hoy':f.age+' d')+'</td></tr>';
    }).join('') : '<tr><td colspan="6" class="name mut">Nada importado todavía.</td></tr>'));
}

/* =========================================================================
   8b · HISTÓRICO (M0)
   ========================================================================= */
function renderHistorico(){
  const S = historyStats();
  const nav = document.getElementById('navHist'); if(nav) nav.textContent = S.span || 0;

  /* --- aviso de copia de seguridad y de arranque --- */
  const due = backupDue();
  let b = '';
  if(!S.days && !S.months){
    b = '<div class="note-box warn" style="margin-top:0"><strong>El histórico está vacío y el reloj corre.</strong> '+
        'Importa el informe de <em>Todos los pedidos</em> en la pestaña Datos: trae consigo entre 30 y 120 días de pasado, '+
        'así que la primera importación no empieza el histórico hoy, lo rellena hacia atrás. '+
        'El de inventario, en cambio, solo puede fecharse hoy: el stock de ayer ya no existe en ningún sitio. '+
        '<button class="btn sm primary" style="margin-left:8px" onclick="go(\'datos\')">Importar ahora</button></div>';
  } else if(due>=999){
    b = '<div class="note-box stop" style="margin-top:0"><strong>Nunca has descargado una copia de seguridad.</strong> '+
        'El histórico vive en el almacenamiento de este navegador y en ningún otro sitio: si borras datos de navegación, '+
        'cambias de equipo o el navegador decide liberar espacio, desaparece y no se puede volver a descargar de Amazon. '+
        '<button class="btn sm primary" style="margin-left:8px" onclick="exportData()">Descargar ahora</button></div>';
  } else if(due>0){
    b = '<div class="note-box warn" style="margin-top:0"><strong>Han pasado '+due+' días desde tu última copia.</strong> '+
        'Descárgala: es el minuto mejor invertido de la semana. '+
        '<button class="btn sm primary" style="margin-left:8px" onclick="exportData()">Descargar</button></div>';
  } else {
    b = '<div class="note-box info" style="margin-top:0"><strong>Copia de seguridad al día</strong> — la última es de hace '+
        (S.backupAge===0?'menos de un día':S.backupAge+' día'+(S.backupAge===1?'':'s'))+'. '+
        'Guárdala fuera de este equipo: el histórico no se puede volver a pedir a Amazon.</div>';
  }
  document.getElementById('histBanner').innerHTML = b;

  const kb = S.bytes/1024, pct = S.dbBytes/(5*1024*1024)*100;
  document.getElementById('histKpis').innerHTML =
    kpi('Historia acumulada', S.span ? num(S.span)+' d' : '—', S.first ? 'desde el '+S.first : 'sin empezar', S.span>0?'accent':'warn')+
    kpi('Días con detalle', num(S.days), S.months? num(S.months)+' mes'+(S.months===1?'':'es')+' compactado'+(S.months===1?'':'s') : 'se compacta a los 90 días','')+
    kpi('Fotos de stock', num(S.withStock), S.withStock? 'una por día importado' : 'importa el inventario FBA', S.withStock?'pos':'warn')+
    kpi('Unidades archivadas', num(S.units), fmt(S.rev,0)+' de ventas','')+
    kpi('Importaciones', num(S.log),'registradas con su fecha','')+
    kpi('Espacio ocupado', (kb<1024? num(kb,0)+' KB' : num(kb/1024,1)+' MB'), num(pct,1)+'% del límite del navegador', pct>70?'warn':'pos');

  /* --- serie diaria --- */
  const SER = historySeries(90);
  const max = Math.max.apply(null, SER.map(x=>x.units).concat([1]));
  document.getElementById('histChart').innerHTML = SER.map(x=>{
    const h = x.has ? Math.max(2, x.units/max*100) : 100;
    const col = !x.has ? 'var(--hair)' : (x.partial ? 'var(--caution)' : (x.units ? 'var(--brand)' : 'var(--muted-2)'));
    const t = x.has ? (x.d.toLocaleDateString('es-ES')+': '+num(x.units)+' ud · '+fmt(x.rev,0)+(x.stock?' · foto de stock':'')+(x.partial?' · día incompleto':''))
                    : (x.d.toLocaleDateString('es-ES')+': sin dato');
    return '<div class="cbar" style="height:'+h.toFixed(1)+'%;background:'+col+';opacity:'+(x.has?1:.45)+'" title="'+esc(t)+'"></div>';
  }).join('');
  document.getElementById('histAxis').innerHTML = '<span>-90 d</span><span>-60 d</span><span>-30 d</span><span>hoy</span>';

  const gaps = SER.filter(x=>!x.has).length;
  let v;
  if(!S.days && !S.months){
    v = 'Sin nada archivado todavía. Este módulo no se ve trabajar: su valor aparece a los tres meses, cuando puedas comparar '+
        'un mes con el anterior y saber si la caída de ventas es tuya o es la categoría.';
  } else {
    v = '<strong>'+num(S.span)+' días de historia propia</strong> desde el '+S.first+'. ';
    if(gaps>0) v += 'Quedan '+gaps+' días de los últimos 90 sin dato, que son los anteriores a tu primera importación o los que el informe no cubría. ';
    v += 'A partir de los 90 días el detalle diario se resume a mes: se conservan unidades, ingreso, impuesto y días sin stock, '+
         'y se suelta la línea a línea. Es lo que evita que el navegador se ahogue sin perder nada de lo que después se consulta.';
    if(S.cut) v += '<br><br><span class="mut">Compactado hasta el '+S.cut+'. Los días anteriores a esa fecha ya no se reescriben aunque vuelvas a importar un informe antiguo.</span>';
  }
  document.getElementById('histVerdict').innerHTML = v;

  /* --- velocidad real --- */
  const V = velocityStats(30);
  const pm = prodBySku();
  tbl('histVelTable','<tr><th>SKU</th><th class="num">Días observados</th><th class="num">Sin stock</th>'+
    '<th class="num">Unidades</th><th class="num">Media simple</th><th class="num">Velocidad real</th><th class="num">Diferencia</th></tr>'+
    (V.length ? V.slice(0,40).map(r=>{
      const p = pm[String(r.sku).toLowerCase()];
      const dif = r.real - r.simple;
      return '<tr><td class="name"><strong>'+esc(r.sku)+'</strong>'+
        (p&&p.name&&p.name!==r.sku?'<br><span class="mut" style="font-size:11px">'+esc(p.name)+'</span>':'')+'</td>'+
        '<td class="num mut">'+num(r.observed)+'</td>'+
        '<td class="num '+(r.oos>0?'neg':'mut')+'">'+(r.oos?num(r.oos)+' d':'—')+'</td>'+
        '<td class="num">'+num(r.units)+'</td>'+
        '<td class="num mut">'+num(r.simple,2)+'</td>'+
        '<td class="num" style="font-weight:600">'+num(r.real,2)+'</td>'+
        '<td class="num '+(dif>0.05?'warn':'mut')+'">'+(dif>0.005? '+'+num(dif/Math.max(r.simple,0.0001)*100,0)+'%' : '—')+'</td></tr>';
    }).join('') : '<tr><td colspan="7" class="name mut">Todavía no hay días archivados con ventas. Importa el informe de pedidos.</td></tr>'));

  const withOos = V.filter(r=>r.oos>0);
  let vn = '';
  if(!V.length){
    vn = 'Sin datos para calcular velocidad todavía.';
  } else {
    vn = 'Ventana de 30 días, excluyendo hoy porque el informe del día en curso siempre viene incompleto. ';
    if(withOos.length) vn += '<strong>'+withOos.length+' referencia'+(withOos.length===1?'':'s')+' con días sin stock detectados.</strong> '+
      'Su velocidad real está por encima de la media simple, así que si repones con la media simple te vuelves a quedar corto. ';
    else vn += 'No se ha detectado ningún día de rotura en la ventana. ';
    vn += '<br><br><span class="mut">Cómo se detecta un día sin stock: se arrastra hacia delante la última foto de inventario conocida y '+
      'un día cuenta como roto solo si esa foto estaba a cero <em>y</em> además ese día no se vendió ni una unidad. Las dos condiciones juntas, '+
      'porque un stock a cero con ventas significa que la foto es vieja y un día sin ventas con stock es simplemente un día flojo. '+
      'La consecuencia práctica: la precisión de este número depende de cada cuánto importas el inventario. Importando una vez por semana '+
      'sabes el stock de un día de cada siete, y los seis restantes son una interpolación conservadora, no una medición.</span>';
  }
  document.getElementById('histVelNote').innerHTML = vn;

  /* --- registro de importaciones --- */
  const H = hist();
  tbl('histLogTable','<tr><th>Cuándo</th><th>Informe</th><th class="num">Filas</th><th>Archivo</th><th>Reconocido por</th></tr>'+
    (H.log.length ? H.log.slice(0,40).map(x=>{
      const d = new Date(x.t), age = daysBetween(d, today());
      return '<tr><td class="name">'+d.toLocaleDateString('es-ES')+' <span class="mut" style="font-size:11px">'+
        (age===0?'hoy':'hace '+age+' d')+'</span></td>'+
        '<td class="name">'+esc(x.l||x.r)+'</td><td class="num">'+num(x.n)+'</td>'+
        '<td class="name mut" style="font-size:11.5px">'+esc(x.f||'—')+'</td>'+
        '<td class="name mut" style="font-size:11.5px">'+esc(x.h||'—')+'</td></tr>';
    }).join('') : '<tr><td colspan="5" class="name mut">Ninguna importación registrada todavía.</td></tr>'));
}

/* =========================================================================
   9 · RENTABILIDAD
   ========================================================================= */
function renderRent(){
  const P = pnl();
  /* «Medido» solo cuando la liquidación cubre el periodo entero. Cubriendo una
     parte, el número es una mezcla y decirlo medido es justo lo que hace que
     alguien se lo crea sin mirarlo. */
  const cov = Math.round(P.feeCoverPct||0);
  const badge = cov>=100 ? '<span class="pill go">medido</span>'
              : cov>0    ? '<span class="pill warn">'+cov+'% medido</span>'
              :            '<span class="pill warn">estimado</span>';
  /* El tipo efectivo se enseña calculado, no como una constante: la comisión
     sale del % de cada producto y el catálogo puede mezclar categorías. */
  const tipoEf = P.grossInc>0 ? num(P.referral/P.grossInc*100,1)+'%' : '—';
  const cobTxt = cov>=100 ? 'de la liquidación'
               : cov>0    ? cov+'% de la liquidación · el resto estimado al '+tipoEf
               :            'estimada al '+tipoEf+' · el % de cada producto';
  document.getElementById('pnlKpis').innerHTML =
    kpi('Ingresos', fmt(P.grossInc,0), 'con IVA · '+num(P.units)+' ud','accent')+
    kpi('Beneficio', fmt(P.profit,0), cov>=100?'comisiones reales':(cov>0?'comisiones '+cov+'% reales':'comisiones estimadas'), P.profit>0?'pos':'neg')+
    kpi('Margen neto', num(P.margin,1)+'%','sobre ingreso sin IVA', P.margin>=TARGET.net?'pos':(P.margin>0?'warn':'neg'))+
    kpi('Coste de producto', fmt(P.cogs,0),
        P.cogsKnown<P.units ? (num(P.units-P.cogsKnown)+' ud sin coste cargado')
                            : (costMethodInfo().name.toLowerCase()+' · '+num(P.costMeasuredPct||0,0)+' % con lote'),
        P.cogsKnown<P.units ? 'warn' : ((P.costMeasuredPct||0)>=90?'':'warn'))+
    kpi('Publicidad', fmt(P.ppc,0),'TACOS '+num(P.tacos,1)+'%', P.tacos<=TARGET.tacos?'pos':'warn')+
    (P.ship>0
      ? kpi('Reparto de canal', num(P.fbaUnits)+' / '+num(P.fbmUnits),'unidades FBA / FBM','')
      : kpi('Reembolsos', fmt(P.reimb,0),'recuperado de Amazon',''));

  const line=(name,val,note,neg)=>'<tr><td class="name">'+name+(note?' <span class="mut" style="font-size:11px">'+note+'</span>':'')+
    '</td><td class="num '+(neg?'neg':'')+'">'+fmt(neg?-Math.abs(val):val,0)+'</td></tr>';
  tbl('pnlTable','<tr><th>Concepto '+badge+'</th><th class="num">Importe</th></tr>'+
    line('Ingresos con IVA',P.grossInc)+
    line('IVA repercutido',P.tax,'',true)+
    '<tr class="tot"><td class="name">Ingreso neto</td><td class="num">'+fmt(P.net,0)+'</td></tr>'+
    line('Comisión de Amazon',P.referral,cobTxt,true)+
    line('Tarifas FBA',P.fba,cov>=100?'':'estimadas con recargo 1,5%',true)+
    (P.ship>0 ? line('Envío propio (FBM)',P.ship,num(P.fbmUnits)+' ud',true) : '')+
    line('Almacenaje',P.storage,'',true)+
    line('Otras tarifas',P.otherFee,'',true)+
    line('Coste de producto',P.cogs,'',true)+
    line('Publicidad',P.ppc, P.adDays
        ? (P.adFactor===1?'':'prorrateado desde un informe de '+num(P.adDays)+' días')
        : (P.ppc>0?'estimado a diario':''), true)+
    line('Gastos fijos',P.fixed,'prorrateados',true)+
    line('Reembolsos recuperados',P.reimb)+
    '<tr class="tot"><td class="name">Beneficio neto</td><td class="num '+(P.profit>0?'pos':'neg')+'">'+fmt(P.profit,0)+'</td></tr>');

  const rows=[['IVA',P.tax,'#9aa8ac'],['Comisión Amazon',P.referral,'#c2410c'],['Tarifas FBA',P.fba,'#ea580c'],
    ['Envío propio (FBM)',P.ship,'#b45309'],
    ['Almacenaje y otras',P.storage+P.otherFee,'#64748b'],['Coste de producto',P.cogs,'#7c3aed'],
    ['Publicidad',P.ppc,'#0284c7'],['Gastos fijos',P.fixed,'#475569'],
    ['Beneficio',P.profit,P.profit>0?'#15803D':'#B91C1C']];
  const max = Math.max.apply(null,rows.map(r=>Math.abs(r[1])).concat([1]));
  document.getElementById('pnlWaterfall').innerHTML = rows.map(r=>
    '<div class="wrow"><span class="wname">'+r[0]+'</span><span class="wbar"><i style="width:'+
    Math.min(100,Math.abs(r[1])/max*100).toFixed(1)+'%;background:'+r[2]+'"></i></span>'+
    '<span class="wval" style="color:'+(r[0]==='Beneficio'?r[2]:'#516066')+'">'+fmt(r[1],0)+'</span></div>').join('');

  const S = skuStats();
  tbl('skuTable','<tr><th>ABC</th><th>SKU</th><th class="num">Unid.</th><th class="num">Ventas</th>'+
    '<th class="num">Coste</th><th class="num">Margen</th><th class="num">Beneficio</th><th style="width:90px">% acum.</th></tr>'+
    (S.length? S.map(r=>
      '<tr><td><span class="pill '+(r.abc==='A'?'go':r.abc==='B'?'core':r.abc==='C'?'warn':'stop')+'">'+r.abc+'</span></td>'+
      '<td class="name"><strong>'+esc(r.sku)+'</strong>'+(r.hasCost?'':' <span class="pill warn">sin coste</span>')+'</td>'+
      '<td class="num">'+num(r.units)+'</td><td class="num">'+fmt(r.revenue,0)+'</td>'+
      '<td class="num mut">'+fmt(r.cogs,0)+'</td>'+
      '<td class="num '+(r.margin>=TARGET.net?'pos':r.margin>0?'warn':'neg')+'">'+num(r.margin,1)+'%</td>'+
      '<td class="num '+(r.profit>0?'pos':'neg')+'" style="font-weight:600">'+fmt(r.profit,0)+'</td>'+
      '<td><div class="bar"><i style="width:'+Math.min(100,r.cum).toFixed(0)+'%"></i></div></td></tr>').join('')
      : '<tr><td colspan="8" class="name mut">Importa el informe de pedidos para ver la rentabilidad por SKU.</td></tr>'));

  const A=S.filter(r=>r.abc==='A'), D=S.filter(r=>r.profit<=0);
  let v='';
  if(S.length){
    v='<strong>'+A.length+' de '+S.length+' productos generan el 80% de tu beneficio.</strong> ';
    if(A.length<=2 && S.length>3) v+='Es una concentración alta: si Amazon suspende uno de esos listados o entra un competidor agresivo, el negocio se para. Diversificar no es una aspiración, es gestión de riesgo. ';
    if(D.length) v+='<span style="color:var(--stop)">'+D.length+' producto'+(D.length===1?'':'s')+' pierde'+(D.length===1?'':'n')+' dinero y consume atención, stock y caja que deberían ir a los de categoría A. La decisión no es optimizarlos: es subirles el precio, renegociar el coste o retirarlos.</span> ';
    /* El informe de términos de búsqueda no trae fecha por fila pero sí su
       propio rango. Cargar su gasto entero contra cualquier periodo hacía que
       el margen fuese de −58,6 % a 30 días y de −13,6 % con «Todo», con las
       mismas ventas todos los días. Se prorratea, y se dice que se prorratea. */
    if(P.adDays>0 && Math.round(P.adSolapePct)<100)
      v+='<br><br>El informe de publicidad cubre '+num(P.adDays)+' días'+
         (P.adDesde?' ('+P.adDesde.toLocaleDateString('es-ES')+' a '+P.adHasta.toLocaleDateString('es-ES')+')':'')+
         ' y solapa el <strong>'+num(P.adSolapePct,0)+'%</strong> del periodo que estás mirando. '+
         'El gasto que ves está prorrateado suponiendo que inviertes parejo: es una cifra ajustada, no medida. '+
         (Math.round(P.adSolapePct)===0 ? 'Con cero solape, descárgate el informe del periodo que quieres analizar antes de fiarte del TACOS.' : '');
    if(countryFilter!=='ALL' && P.ppc>0)
      v+='<br><br>Estás filtrando por un solo mercado y el informe de publicidad no trae país: el gasto que ves es el de <strong>todos</strong> los mercados. El margen de este país sale más bajo de lo real.';
    /* Pedir «12 meses» con un informe de cuatro no convierte los otros ocho en
       meses de venta cero: convierte el informe en insuficiente. Los gastos
       fijos sí se cuentan por los días pedidos, así que el margen sale más bajo
       de lo real, y eso hay que decirlo en vez de dejar que parezca un dato. */
    if(P.dataDays>0 && P.dataDays < P.periodDaysReal)
      v+='<br><br><strong>El informe de pedidos cubre '+num(P.dataDays)+' días de los '+num(P.periodDaysReal)+' que estás mirando.</strong> Las ventas son las que hay; los gastos fijos, en cambio, se cuentan por los '+num(P.periodDaysReal)+' días completos, así que el margen que ves está por debajo del real. Descarga un informe más largo o mira un periodo más corto.';
    const cv = Math.round(P.feeCoverPct||0);
    if(cv<=0 && P.settleRows>0 && !P.settleMatched)
      v+='<br><br><strong>Hay una liquidación cargada y no reconozco sus columnas de tarifas.</strong> El fichero plano de Amazon tiene dos formatos y este lector entiende el que trae «item-related-fee-type». Las comisiones siguen estimadas al 15%: prefiero decírtelo a enseñarte 0 € de comisión y llamarlo medido.';
    else if(cv<=0) v+='<br><br>Estas cifras usan la comisión que tienes puesta en cada producto, no la que Amazon te cobró: no hay informe de liquidación cargado. Impórtalo y pasarán a ser dinero real contado. Y revisa ese porcentaje en Catálogo, porque el valor por defecto es 15% y en muchas categorías no lo es.';
    else if(cv<100) v+='<br><br>La liquidación cargada cubre el <strong>'+cv+'%</strong> de lo facturado en este periodo. Ese trozo son comisiones reales; el resto sigue estimado al 15%. Amazon liquida cada 14 días, así que para cubrir un trimestre hacen falta unas seis liquidaciones.';
  } else v='Sin datos de ventas todavía.';
  document.getElementById('abcVerdict').innerHTML=v;
}

/* =========================================================================
   10 · TESORERÍA
   ========================================================================= */
function renderTesoreria(){
  const cs=DB.settings.cash;
  ['cashStart','cashCycle','cashReserve','cashVat'].forEach((id,i)=>{
    const el=document.getElementById(id);
    if(el && document.activeElement!==el) el.value=[cs.start,cs.cycle,cs.reserve,cs.vat][i];
  });
  const C = cashProjection();
  const min = C.reduce((a,b)=>b.bal<a.bal?b:a, C[0]||{bal:0,k:0});
  const end = C[C.length-1]||{bal:0};
  const outPO = DB.pos.filter(p=>p.status!=='closed').reduce((a,p)=>a+
    (p.payments||[]).filter(x=>!x.paid).reduce((s,x)=>s+poAmount(p)*toNum(x.pct)/100,0),0);
  const tied = DB.pos.filter(p=>p.status!=='closed').reduce((a,p)=>a+poAmount(p),0);
  document.getElementById('cashKpis').innerHTML =
    kpi('Caja hoy', fmt(toNum(cs.start),0),'saldo de partida','accent')+
    kpi('Caja mínima a 90 d', fmt(min.bal,0), 'día '+min.k+' · '+min.date.toLocaleDateString('es-ES'), min.bal<TARGET.cash?'neg':'pos')+
    kpi('Caja a 90 días', fmt(end.bal,0), end.bal>toNum(cs.start)?'genera caja':'consume caja', end.bal>toNum(cs.start)?'pos':'warn')+
    kpi('Pagos comprometidos', fmt(outPO,0),'anticipos y saldos pendientes', outPO>0?'warn':'')+
    kpi('Capital en mercancía', fmt(tied,0),'pedidos en curso','')+
    kpi('Colchón objetivo', fmt(TARGET.cash,0),'ajustable en el Panel','');

  const maxA = Math.max.apply(null, C.map(c=>Math.abs(c.bal)).concat([1]));
  const minB = Math.min.apply(null, C.map(c=>c.bal).concat([0]));
  const range = maxA - Math.min(0,minB) || 1;
  const zeroPct = (maxA/range)*100;
  document.getElementById('cashChart').innerHTML =
    '<div class="zeroline" style="top:'+zeroPct.toFixed(1)+'%"></div>' +
    C.map(c=>{
      const h = Math.max(0.8, Math.abs(c.bal)/range*100);
      const col = c.bal<0 ? 'var(--stop)' : (c.bal<TARGET.cash ? 'var(--caution)' : 'var(--brand)');
      /* Positivo crece hacia arriba desde la línea de cero; negativo cuelga
         hacia abajo. El signo tiene que verse en la forma, no solo en el color:
         un descubierto no puede parecer un día con caja de sobra. */
      const pos = c.bal>=0
        ? 'bottom:'+(100-zeroPct).toFixed(1)+'%;height:'+h.toFixed(1)+'%'
        : 'top:'+zeroPct.toFixed(1)+'%;height:'+h.toFixed(1)+'%';
      return '<div class="cbar" title="'+
        c.date.toLocaleDateString('es-ES')+': '+fmt(c.bal,0)+(c.po?' · pago de pedido '+fmt(c.po,0):'')+'">'+
        '<div class="cfill'+(c.bal<0?' neg':'')+'" style="'+pos+';background:'+col+'"></div></div>';
    }).join('');
  document.getElementById('cashAxis').innerHTML =
    '<span>hoy</span><span>+30 d</span><span>+60 d</span><span>+90 d</span>';

  const neg = C.filter(c=>c.bal<TARGET.cash);
  let v;
  /* El aviso rojo va PRIMERO. Estaba detrás de «no hay pedidos ni gastos», así
     que un usuario nuevo podía pasar noventa días por debajo del colchón, o
     directamente en negativo, sin ver una sola línea roja aquí — mientras el
     Panel, con los mismos datos, sí avisaba. Dos pantallas y dos veredictos
     opuestos es peor que no tener veredicto. */
  if(neg.length){
    v='<strong style="color:var(--stop)">Te quedas por debajo del colchón durante '+neg.length+' día'+(neg.length===1?'':'s')+', empezando el '+neg[0].date.toLocaleDateString('es-ES')+'.</strong> '+
      'Tres salidas por orden de preferencia: retrasar o fraccionar el próximo pedido de compra, negociar un plazo mayor con el proveedor, o buscar financiación. '+
      'La cuarta —reducir stock— parece la más fácil y es la más cara, porque romper cobertura activa la tarifa por bajo inventario y hunde el posicionamiento.';
  } else {
    v='<strong>La caja aguanta los 90 días por encima del colchón.</strong> Con '+fmt(end.bal-toNum(cs.start),0)+' de generación neta en el periodo, '+
      'tienes margen para un pedido adicional de hasta '+fmt(Math.max(0,min.bal-TARGET.cash),0)+' sin comprometer el mínimo de seguridad.';
  }
  if(!DB.pos.length && !DB.expenses.length){
    v+='<br><br>Y todavía le falta la mitad del cuadro: no has cargado ningún pedido de compra ni gastos fijos. '+
       'Cárgalos en Compras y aquí al lado y verás el hueco real entre pagar la fábrica y cobrar de Amazon, '+
       'que es donde se rompe la mayoría de vendedores en crecimiento.';
  }
  const M = C.meta||{};
  if(M.fueraDeVentana>0)
    v+='<br><br>Hay '+fmt(M.fueraDeVentana,0)+' de vencimientos que caen más allá de los 90 días: cuentan en «pagos comprometidos» y no en esta curva.';
  v+='<br><br><span class="mut">Supuestos: las ventas se proyectan con la media del periodo seleccionado y sin estacionalidad, '+
     'el cobro de Amazon se libera cada ciclo reteniendo la reserva, y el IVA se paga el día 20 de cada mes. '+
     'La reposición de lo que vendes se descuenta a diario ('+fmt(M.dayCogsFlow||0)+'/día a coste puesto)'+
     (M.diasCubiertos>=1 ? ', salvo los primeros '+num(M.diasCubiertos,0)+' días, que ya los cubre la mercancía que tienes pedida' : '')+'. '+
     'El primer cobro de Amazon se sitúa a un ciclo completo desde hoy, que es el supuesto más prudente: si tu ciclo va por otro sitio, el mínimo cambia. '+
     'La estacionalidad de Q4 puede desviar esto sustancialmente: úsalo para detectar el problema, no para fijar el importe exacto.</span>';
  document.getElementById('cashVerdict').innerHTML=v;

  tbl('expenseTable','<tr><th>Concepto</th><th class="num">€/mes</th><th style="width:36px"></th></tr>'+
    (DB.expenses.length? DB.expenses.map(e=>
      '<tr><td class="name"><input type="text" value="'+esc(e.concept)+'" oninput="updExpense(\''+e.id+'\',\'concept\',this.value)"></td>'+
      '<td class="num" style="width:110px"><input type="number" step="10" value="'+toNum(e.amount)+'" oninput="updExpense(\''+e.id+'\',\'amount\',this.value)"></td>'+
      '<td><button class="icon-btn" onclick="delExpense(\''+e.id+'\')">✕</button></td></tr>').join('')+
      '<tr class="tot"><td class="name">Total mensual</td><td class="num">'+fmt(DB.expenses.reduce((a,e)=>a+toNum(e.amount),0),0)+'</td><td></td></tr>'
      : '<tr><td colspan="3" class="name mut">Sin gastos fijos. Añade gestoría, herramientas, almacén y cuota de Amazon.</td></tr>'));
}
function addExpense(){ DB.expenses.push({id:uid(),concept:'Nuevo gasto',amount:0}); saveDB(); renderTesoreria(); }
function updExpense(id,f,v){ const e=DB.expenses.find(x=>x.id===id); if(e){e[f]=v; saveDB(); if(f==='amount') renderTesoreria();} }
function delExpense(id){ DB.expenses=DB.expenses.filter(x=>x.id!==id); saveDB(); renderTesoreria(); }

/* =========================================================================
   11 · CATÁLOGO
   ========================================================================= */
function renderCatalogo(){
  const S = skuStats(), I = invStats();
  const sm={}; S.forEach(r=>sm[r.sku]=r);
  const im={}; I.forEach(r=>im[r.sku]=r);
  tbl('productTable','<tr><th>SKU</th><th>Producto</th><th>Canal</th><th>Proveedor</th><th class="num">Coste hoy</th>'+
    '<th class="num">Lotes</th><th class="num">Logística</th><th class="num">Stock</th><th class="num">Cobertura</th><th class="num">Beneficio</th><th style="width:70px"></th></tr>'+
    (DB.products.length? DB.products.map(p=>{
      const s=sm[String(p.sku)]||{}, i=im[String(p.sku)]||{};
      const sup=DB.suppliers.find(x=>x.id===p.supplierId);
      const fbm = p.channel==='FBM';
      const nl = prodLots(p).length;
      const c = unitCostAt(p, iso(today()));
      return '<tr><td><strong>'+esc(p.sku)+'</strong></td><td class="name">'+esc(p.name)+'</td>'+
        '<td><span class="pill '+(fbm?'info':'core')+'">'+(fbm?'FBM':'FBA')+'</span></td>'+
        '<td class="name mut">'+(sup?esc(sup.name):'<span class="pill warn">sin asignar</span>')+'</td>'+
        '<td class="num" title="'+(c.src==='lot'?'del último lote comprado':'coste base del producto, sin lote que lo respalde')+'">'+
          fmt(c.cost)+(c.src==='lot'?'':' <span class="mut" style="font-size:10px">base</span>')+'</td>'+
        '<td class="num">'+(nl? '<a href="#" onclick="editProduct(\''+p.id+'\');return false">'+nl+'</a>'
                              : '<span class="pill warn">0</span>')+'</td>'+
        '<td class="num mut">'+fmt(fbm?toNum(p.fbmShip):toNum(p.fba))+'</td>'+
        '<td class="num">'+(i.qty!=null?num(i.qty):'—')+'</td>'+
        '<td class="num '+(i.cover<28?'neg':i.cover>154?'warn':'pos')+'">'+(i.cover?num(i.cover,0)+' d':'—')+'</td>'+
        '<td class="num '+((s.profit||0)>0?'pos':'neg')+'">'+(s.profit!=null?fmt(s.profit,0):'—')+'</td>'+
        '<td><button class="icon-btn" onclick="editProduct(\''+p.id+'\')">✎</button></td></tr>';
    }).join('')
    : '<tr><td colspan="11" class="name mut">Sin productos. Añade uno o carga datos de ejemplo desde la pestaña Datos.</td></tr>'));
  try{ renderLotes(); }catch(e){ console.warn('lotes',e); }
}

/* =========================================================================
   11b · M1.1 · LOTES DE COSTE
   La pantalla tiene un trabajo por encima de listar lotes: decir qué parte del
   coste que estás viendo está respaldada por una compra real y qué parte es
   relleno. Un margen del 33 % calculado con la mitad de las unidades sin lote
   no es un margen del 33 %, es una estimación disfrazada de medición.
   ========================================================================= */
function renderLotes(){
  const box = document.getElementById('lotMethodBox'); if(!box) return;
  const m = costMethod();
  box.innerHTML =
    '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">'+
      '<span class="mut" style="font-size:12.5px">Cómo se costea cada venta:</span>'+
      COST_METHODS.map(x=>'<button class="btn sm'+(x.id===m?' primary':'')+'" onclick="setCostMethod(\''+x.id+'\')" title="'+esc(x.short)+'">'+x.name+'</button>').join('')+
    '</div>'+
    '<div class="note-box info" style="margin:10px 0 0;font-size:12.5px">'+esc(costMethodInfo().long)+'</div>';

  const C = lotCoverage();
  const relleno = C.stale + C.open + C.tail + C.base + C.none;
  document.getElementById('lotCoverage').innerHTML =
    '<div class="kpis">'+
    kpi('Unidades con lote', num(Math.round(C.lot))+' de '+num(C.units),
        C.units? num(C.pct,0)+' % del periodo respaldado por una compra real' : 'sin ventas en el periodo',
        C.units===0?'':(C.pct>=90?'pos':(C.pct>=50?'warn':'neg')))+
    kpi('Coste del periodo', fmt(C.cogs,0), 'método: '+costMethodInfo().name, '')+
    kpi('Productos con lotes', num(C.withLots)+' de '+num(C.products),
        C.lots+' lote'+(C.lots===1?'':'s')+' cargado'+(C.lots===1?'':'s'), C.withLots<C.products?'warn':'pos')+
    kpi('Unidades sin cuadrar', num(Math.round(relleno)),
        relleno? 'sin una compra con unidades detrás' : 'ninguna', relleno?'warn':'pos')+
    '</div>'+
    (C.lots && !C.stockKnown
      ? '<div class="note-box warn" style="margin:12px 0 0;font-size:12.5px"><strong>Falta el stock de algún SKU con ventas.</strong> '+
        'Sin saber cuántas unidades te quedan hoy no se puede hacer la única cuenta que cierra esto: '+
        '<em>comprado − vendido en el informe − stock de hoy</em>. Lo que sobre de esa resta se vendió antes de que empezara tu informe de pedidos, '+
        'y hasta que no se pueda restar, cualquier lote anterior al informe es una suposición. Se hace SKU a SKU: mira la columna «Stock hoy» del cuadre de abajo para ver cuáles faltan. Importa «Inventario de Logística de Amazon» y el cálculo se corrige solo.</div>'
      : '');

  /* Todos los lotes de todos los productos en una sola tabla: cargarlos es un
     trabajo de una tarde y hacerlo saltando entre cinco fichas es lo que hace
     que esa tarde no llegue nunca. */
  const all = [];
  DB.products.forEach(p=>(p.lots||[]).forEach(l=>all.push({p, l})));
  all.sort((a,b)=> String(b.l.date||'').localeCompare(String(a.l.date||'')) || String(a.p.sku).localeCompare(String(b.p.sku)));
  tbl('lotTable','<tr><th>Fecha</th><th>SKU</th><th class="num">Unidades</th><th class="num">Fábrica</th>'+
    '<th class="num">Flete/ud</th><th class="num">Coste puesto</th><th>Origen</th><th style="width:36px"></th></tr>'+
    (all.length ? all.map(({p,l})=>{
      const malo = !l.date || lotCost(l)<=0;
      return '<tr'+(malo?' style="opacity:.75"':'')+'>'+
        '<td class="name">'+(l.date? esc(l.date) : '<span class="pill warn">sin fecha</span>')+'</td>'+
        '<td><strong>'+esc(p.sku)+'</strong></td>'+
        '<td class="num">'+(toNum(l.qty)? num(l.qty) : '<span class="mut">—</span>')+'</td>'+
        '<td class="num">'+fmt(toNum(l.unit))+'</td>'+
        '<td class="num mut">'+fmt(toNum(l.freight))+'</td>'+
        '<td class="num"><strong>'+fmt(lotCost(l))+'</strong></td>'+
        '<td class="name mut">'+esc(l.ref||(l.poId?'pedido de compra':'manual'))+'</td>'+
        '<td><button class="icon-btn" onclick="lotEditModal(\''+p.id+'\',\''+l.id+'\')">✎</button></td></tr>';
    }).join('')
    : '<tr><td colspan="8" class="name mut">Todavía no hay lotes. Mientras no los haya, todo se costea con el coste base de cada producto, que es exactamente lo que hacía la versión anterior.</td></tr>'));

  /* Cuadre por SKU: comprado contra vendido más lo que queda. Es la cuenta que
     convierte «hay un lote» en «había unidades», y la que dice si falta cargar
     una compra o si sobra porque se vendió antes de que empezara el informe. */
  const B = (function(){ try{ return costOfSales(salesRows({from:null, country:'ALL'})).bal || {}; }catch(e){ return {}; } })();
  const ks = Object.keys(B);
  if(ks.length){
    tbl('lotBalTable','<tr><th>SKU</th><th class="num">Comprado</th><th class="num">Vendido neto</th>'+
      '<th class="num">Stock hoy</th><th class="num">Cuadre</th><th>Qué significa</th></tr>'+
      ks.sort().map(sk=>{
        const b = B[sk];
        const p = DB.products.filter(x=>String(x.sku).toLowerCase()===sk)[0];
        /* El cuadre se LEE del motor, no se recalcula aquí. Recalcularlo con
           b.sold (ventas brutas) daba un número distinto del que el motor usa
           para recortar la cola, y distinto del texto de al lado: exactamente
           las devoluciones de diferencia. Un SKU que cuadraba perfecto llegaba
           a mostrar «−12» junto a «cuadra exactamente». */
        const dif = b.sobra - b.falta;
        let txt, cls;
        if(b.falta>0){ txt=num(b.falta)+' vendidas que ningún lote explica · van al coste base como stock de apertura'; cls='neg'; }
        else if(!b.stockKnown){ txt='no se ha visto el stock de este SKU: no se puede cuadrar'; cls='warn'; }
        else if(b.sobra>0){ txt=num(b.sobra)+' se vendieron antes de tu informe · descontadas de la cola'; cls='mut'; }
        else { txt='cuadra exactamente'; cls='pos'; }
        return '<tr><td><strong>'+esc(p?p.sku:sk)+'</strong></td>'+
          '<td class="num">'+num(b.bought)+'</td>'+
          '<td class="num">'+num(b.neto)+(b.devuelto?' <span class="mut" style="font-size:10px">−'+num(b.devuelto)+' dev</span>':'')+'</td>'+
          '<td class="num'+(b.stockKnown?'':' warn')+'">'+(b.stockKnown?num(b.stock):'sin ver')+'</td>'+
          '<td class="num '+(cls==='neg'?'neg':(cls==='pos'?'pos':''))+'">'+(b.stockKnown?(dif>0?'+':'')+num(dif):'—')+'</td>'+
          '<td class="name '+cls+'">'+txt+'</td></tr>';
      }).join(''));
  } else {
    tbl('lotBalTable','<tr><td class="name mut">Sin lotes que cuadrar todavía.</td></tr>');
  }

  /* Veredicto: qué significa lo que se está viendo, sin adornarlo. */
  let v;
  if(!C.lots){
    v = '<strong>Sin lotes cargados, esto no cambia nada todavía.</strong> Cada venta se sigue costeando con el coste base del producto, '+
        'igual que antes. El módulo empieza a valer en cuanto cargues las compras reales de tus cinco familias: fecha, unidades, coste de fábrica y flete. '+
        'Es una tarde de trabajo y es lo que separa un margen calculado de un margen inventado.';
  } else if(relleno > C.units*0.25){
    v = '<strong style="color:var(--stop)">'+num(Math.round(relleno))+' unidades del periodo ('+num(100-C.pct,0)+' %) no se costean con una compra que se pueda comprobar.</strong> '+
        (C.stale>0 ? '<br><br><strong>'+num(Math.round(C.stale))+' consumen lotes anteriores al primer pedido de tu informe y no hay stock con el que cuadrarlas.</strong> Lo más probable es que esos lotes ya te los hubieras vendido en parte: darlos por intactos abarata el coste y engorda el margen sin que nada avise. Importa el informe de inventario y esto se cierra solo. ' : '')+
        (C.tail>0 ? '<br><br><strong>'+num(Math.round(C.tail))+' agotaron lo comprado</strong> y se han costeado prolongando el último precio conocido: falta cargar alguna compra posterior. ' : '')+
        (C.open>0 ? '<br><br><strong>'+num(Math.round(C.open))+' son anteriores a tu primer lote</strong> y van al coste base del producto. Falta el lote de apertura: el stock que ya tenías el día que empezaste a registrar compras. ' : '')+
        (C.base>0 ? '<br><br><strong>'+num(Math.round(C.base))+' son de productos sin ningún lote.</strong> ' : '')+
        '<br><br>Mientras esto sea así, el margen es una estimación razonable, no una medición.';
  } else {
    v = '<strong>El '+num(C.pct,0)+' % de las unidades vendidas está respaldado por una compra que se puede comprobar.</strong> '+
        'A partir de aquí el margen que ves en Rentabilidad es medido, no supuesto, y el capital inmovilizado de Inventario está valorado al coste de reposición.'+
        (relleno>0 ? ' Quedan '+num(Math.round(relleno))+' unidades rellenadas, poco peso pero conviene saber que están ahí.' : '');
  }
  if(C.bad) v += '<br><br><span style="color:var(--caution)">'+C.bad+' lote'+(C.bad===1?'':'s')+' sin fecha o sin coste: no entran en ningún cálculo hasta que se corrijan.</span>';
  v += '<br><br><span class="mut">Cómo leer los tres métodos: <strong>por periodo</strong> no necesita saber cuántas unidades quedaban de cada lote, así que aguanta un registro incompleto y es el único inmune al agujero de arriba; '+
       '<strong>FIFO</strong> es el que refleja lo que pagaste por lo que vendiste, y el que exige tener todas las compras Y un informe de pedidos que las cubra; '+
       '<strong>promedio ponderado</strong> es el más estable y el que más tarda en enseñar un lote caro. '+
       'Cambiar de método cambia el beneficio del periodo sin que hayas vendido nada distinto: es un cambio de criterio contable, no un dato nuevo.</span>';
  document.getElementById('lotVerdict').innerHTML = v;
}

function lotFields(l){
  return '<div class="row-3">'+
      '<div class="field"><label>Fecha de la compra</label><input type="date" id="ml_date" value="'+esc(l.date||iso(today()))+'"></div>'+
      fld('ml_qty','Unidades','number',l.qty,'ud')+
      fld('ml_unit','Coste de fábrica','number',l.unit,'€/ud')+
    '</div><div class="row-2">'+
      fld('ml_freight','Flete + aranceles','number',l.freight,'€/ud')+
      fld('ml_ref','Referencia','text',l.ref||'')+
    '</div>';
}
function lotAddModal(prodId){
  if(!DB.products.length){ toast('Añade antes algún producto al catálogo'); return; }
  const pid = prodId || DB.products[0].id;
  openModal('Nuevo lote de compra',
    'La fecha es la que manda: es la que decide qué ventas se costean con este lote. Pon la de recepción del stock, no la del pedido, si lo que quieres es que cuadre con lo que estabas vendiendo.',
    '<div class="field"><label>Producto</label><select id="ml_prod">'+
      DB.products.map(p=>'<option value="'+p.id+'"'+(p.id===pid?' selected':'')+'>'+esc(p.sku)+' · '+esc(p.name)+'</option>').join('')+
    '</select></div>'+
    lotFields({date:iso(today()), qty:0, unit:0, freight:0, ref:''})+
    '<div class="note-box info" style="margin:6px 0 0;font-size:12.5px">El flete va <strong>por unidad</strong>, ya repartido. Si solo tienes el total del envío, divídelo entre las unidades del lote — o carga el pedido en Compras y deja que el reparto lo haga el hub, que además lo deja auditable.</div>',
    ()=>{
      const l = {date:val('ml_date'), qty:n('ml_qty'), unit:n('ml_unit'), freight:n('ml_freight'), ref:val('ml_ref')||'manual'};
      if(!l.date || l.unit<=0){ toast('Un lote sin fecha o sin coste de fábrica no sirve para nada'); return; }
      /* En FIFO un lote sin unidades no se puede consumir: existiría en la
         lista sin costear nada, y todas las ventas caerían en el relleno. */
      if(l.qty<=0 && costMethod()==='fifo' &&
         !confirm('Este lote no lleva unidades. Con FIFO no se puede consumir, así que no costeará ninguna venta y todo caerá en el relleno.\n\n¿Guardarlo igualmente?')) return;
      addLot(val('ml_prod'), l);
      saveDB(); refreshAll(); toast('Lote añadido');
    });
}
function lotEditModal(prodId, lotId){
  const p = DB.products.find(x=>x.id===prodId); if(!p) return;
  const l = (p.lots||[]).filter(x=>x.id===lotId)[0]; if(!l) return;
  openModal('Lote de '+p.sku,
    l.poId ? 'Este lote lo creó un pedido de compra. Si lo editas a mano, volver a aplicar los costes del pedido lo sobrescribirá.'
           : 'Cambiar la fecha o el coste mueve el margen de todas las ventas que este lote cubre, hacia atrás incluidas.',
    lotFields(l),
    ()=>{
      l.date=val('ml_date'); l.qty=n('ml_qty'); l.unit=n('ml_unit');
      l.freight=n('ml_freight'); l.ref=val('ml_ref');
      saveDB(); refreshAll(); toast('Lote guardado');
    },
    ()=>{ delLot(prodId, lotId); saveDB(); refreshAll(); toast('Lote eliminado'); });
}
/* Pegar desde una hoja de cálculo. Cargar cinco familias con dos años de
   compras a mano son cien formularios; pegando es un minuto. */
function lotPasteModal(){
  openModal('Pegar lotes desde una hoja',
    'Cinco columnas por posición: SKU, fecha, unidades, coste de fábrica y flete. Separadas por tabulador (que es lo que sale al copiar de Excel), punto y coma o coma.',
    '<div class="field"><label>Pega aquí</label>'+
      '<textarea id="ml_paste" rows="9" style="width:100%;font-family:ui-monospace,monospace;font-size:12px" '+
      'placeholder="ARS-ROD-01&#9;2026-02-14&#9;600&#9;4,35&#9;1,07&#10;ARS-BAN-02&#9;2026-02-14&#9;900&#9;2,70&#9;0,71"></textarea></div>'+
    '<div class="field"><label>La quinta columna es…</label><select id="ml_ftype">'+
      '<option value="unit">flete POR UNIDAD</option>'+
      '<option value="total">flete TOTAL del lote</option>'+
    '</select></div>'+
    '<div class="note-box warn" style="margin:6px 0 0;font-size:12.5px">Confundir el flete total con el flete por unidad mete un factor de cientos en el margen y el número sigue pareciendo creíble. Comprueba la vista previa antes de guardar.</div>'+
    '<div id="ml_prev" style="margin-top:12px"></div>',
    ()=>{
      const r = parseLotPaste(val('ml_paste'), val('ml_ftype')==='total');
      if(!r.lots.length){ toast('No se ha podido leer ninguna línea válida'); return; }
      const n2 = applyLotPaste(r.lots);
      toast(n2+' lote'+(n2===1?'':'s')+' añadido'+(n2===1?'':'s')+(r.errs.length?' · '+r.errs.length+' línea(s) descartada(s)':''));
    });
  const prev = ()=>{
    const t = val('ml_paste')||'';
    const el = document.getElementById('ml_prev');
    if(!t.trim()){ el.innerHTML=''; return; }
    const r = parseLotPaste(t, val('ml_ftype')==='total');
    el.innerHTML = '<div class="tbl-wrap"><table class="grid"><tr><th>SKU</th><th>Fecha</th><th class="num">Ud</th><th class="num">Fábrica</th><th class="num">Flete/ud</th><th class="num">Puesto</th></tr>'+
      r.lots.slice(0,12).map(l=>'<tr><td><strong>'+esc(l.sku)+'</strong></td><td class="name">'+esc(l.date)+'</td>'+
        '<td class="num">'+num(l.qty)+'</td><td class="num">'+fmt(l.unit)+'</td><td class="num mut">'+fmt(l.freight)+'</td>'+
        '<td class="num"><strong>'+fmt(l.unit+l.freight)+'</strong></td></tr>').join('')+
      '</table></div>'+
      '<div class="mut" style="font-size:12px;margin-top:8px">'+r.lots.length+' línea(s) válida(s)'+
      (r.lots.length>12?' · se muestran las 12 primeras':'')+'</div>'+
      (r.errs.length? '<div class="note-box warn" style="margin-top:10px;font-size:12.5px"><strong>Descartadas:</strong><br>'+r.errs.slice(0,8).map(esc).join('<br>')+'</div>' : '');
  };
  document.getElementById('ml_paste').addEventListener('input', prev);
  document.getElementById('ml_ftype').addEventListener('change', prev);
}
/* Resumen de lotes dentro de la ficha del producto. Se muestra, no se edita:
   abrir un modal encima de otro perdería lo que estuvieras escribiendo aquí,
   y los lotes se gestionan en su propia tabla, que es donde se cargan en tanda. */
function lotSummary(p){
  const L = prodLots(p), bad = badLots(p).length;
  if(!L.length){
    return '<div class="note-box warn" style="margin:6px 0 0;font-size:12.5px">'+
      '<strong>Sin lotes de compra.</strong> Todas las ventas de este producto se costean con el coste base de arriba, el mismo para una venta de hace un año que para la de ayer. '+
      'Carga sus compras en «Lotes de coste», al final de esta pantalla, y el margen pasa de estimado a medido.'+
      (bad? ' Hay '+bad+' lote(s) sin fecha o sin coste que no cuentan.' : '')+'</div>';
  }
  const last = L[L.length-1], first = L[0];
  const q = L.reduce((a,l)=>a+Math.max(0,toNum(l.qty)),0);
  return '<div class="note-box info" style="margin:6px 0 0;font-size:12.5px">'+
    '<strong>'+L.length+' lote'+(L.length===1?'':'s')+' de compra</strong> · desde el '+esc(first.date)+' hasta el '+esc(last.date)+
    (q? ' · '+num(q)+' unidades compradas' : '')+'. Último coste puesto: <strong>'+fmt(lotCost(last))+'</strong>'+
    (Math.abs(lotCost(last)-baseCost(p))>0.005 ? ' (el coste base dice '+fmt(baseCost(p))+')' : '')+'. '+
    'El coste base solo se usa para las ventas que ningún lote cubra.'+
    (bad? ' <span style="color:var(--caution)">'+bad+' lote(s) sin fecha o sin coste no cuentan.</span>' : '')+'</div>';
}
function addProduct(){ editProduct(null); }
function editProduct(id){
  const p = id ? DB.products.find(x=>x.id===id) : {id:uid(),sku:'',name:'',supplierId:'',cogs:0,freight:0,fba:3.2,
    litres:1.5,referral:15,price:24.99,channel:'FBA',fbmShip:0,fbmStock:0};
  if(!p.channel) p.channel='FBA';
  openModal(id?'Editar producto':'Nuevo producto',
    'Este objeto lo comparten todos los módulos: cambiar el coste aquí mueve el margen en Rentabilidad, el punto de reposición en Inventario y la curva de Tesorería. El coste base es el que se aplica a las ventas anteriores a tu primer lote de compra.',
    '<div class="row-2">'+
      fld('mp_sku','SKU','text',p.sku)+fld('mp_name','Nombre','text',p.name)+
    '</div><div class="row-2">'+
      '<div class="field"><label>Proveedor</label><select id="mp_sup">'+
        '<option value="">— sin asignar —</option>'+
        DB.suppliers.map(s=>'<option value="'+s.id+'"'+(s.id===p.supplierId?' selected':'')+'>'+esc(s.name)+'</option>').join('')+
      '</select></div>'+
      fld('mp_price','PVP con IVA','number',p.price,'€')+
    '</div><div class="row-3">'+
      '<div class="field"><label>Canal logístico</label><select id="mp_ch" onchange="mpChannel()">'+
        '<option value="FBA"'+(p.channel==='FBA'?' selected':'')+'>FBA · lo envía Amazon</option>'+
        '<option value="FBM"'+(p.channel==='FBM'?' selected':'')+'>FBM · lo envías tú</option>'+
      '</select></div>'+
      fld('mp_cogs','Coste base de fábrica','number',p.cogs,'€')+
      fld('mp_freight','Transporte + aranceles','number',p.freight,'€')+
    '</div>'+ lotSummary(p) +
    '<div class="row-3" id="mp_fbaBox" style="display:'+(p.channel==='FBM'?'none':'grid')+'">'+
      fld('mp_fba','Tarifa FBA','number',p.fba,'€')+
      fld('mp_litres','Volumen','number',p.litres,'L')+
      fld('mp_ref','Comisión referral','number',p.referral,'%')+
    '</div><div class="row-3" id="mp_fbmBox" style="display:'+(p.channel==='FBM'?'grid':'none')+'">'+
      fld('mp_ship','Coste de envío propio','number',p.fbmShip,'€')+
      fld('mp_stock','Stock propio','number',p.fbmStock,'ud')+
      fld('mp_ref2','Comisión referral','number',p.referral,'%')+
    '</div>'+
    '<div class="note-box info" style="margin:6px 0 0;font-size:12.5px" id="mp_note">'+
      (p.channel==='FBM'
        ? 'En FBM no pagas tarifa de gestión ni almacenaje, pero el envío, el embalaje y la atención al cliente los pagas tú, y el coste real por pedido casi siempre es mayor de lo que la gente estima. Tampoco entras en tarifa por bajo inventario, así que la banda de cobertura es más ancha. La comisión de referencia sí se paga igual.'
        : 'En FBA pagas tarifa de gestión, almacenaje y los recargos por sobrestock, pero ganas la Buy Box con más facilidad, Prime y la atención al cliente en idioma local. Es el canal por defecto para marca propia.')+
    '</div>',
    ()=>{
      p.sku=val('mp_sku'); p.name=val('mp_name'); p.supplierId=val('mp_sup');
      p.price=n('mp_price'); p.cogs=n('mp_cogs'); p.freight=n('mp_freight');
      p.channel=val('mp_ch')||'FBA';
      if(p.channel==='FBM'){ p.fbmShip=n('mp_ship'); p.fbmStock=n('mp_stock'); p.referral=n('mp_ref2'); }
      else { p.fba=n('mp_fba'); p.litres=n('mp_litres'); p.referral=n('mp_ref'); }
      if(!id) DB.products.push(p);
      saveDB(); refreshAll(); toast('Producto guardado');
    }, id?()=>{ DB.products=DB.products.filter(x=>x.id!==id); saveDB(); refreshAll(); toast('Producto eliminado'); }:null);
}

/* =========================================================================
   12 · INVENTARIO
   ========================================================================= */
function renderInv(){
  const I = invStats();
  const value = I.reduce((a,r)=>a+r.value,0);
  const rupture = I.filter(r=>r.risk==='low'&&r.velocity>0), over = I.filter(r=>r.risk==='over'&&r.qty>0);
  document.getElementById('invKpis').innerHTML =
    kpi('Unidades en almacén', num(I.reduce((a,r)=>a+r.qty,0)), I.length+' referencias','accent')+
    kpi('Capital inmovilizado', fmt(value,0),'a coste puesto en almacén','')+
    kpi('Bajo cobertura', num(rupture.length),'riesgo de tarifa por bajo inventario', rupture.length?'neg':'pos')+
    kpi('Sobrestock', num(over.length),'riesgo de recargo por antigüedad', over.length?'warn':'pos')+
    kpi('Cobertura media', num(I.length?I.reduce((a,r)=>a+Math.min(r.cover,365),0)/I.length:0,0)+' d','objetivo ~'+TARGET.cover+' d','')+
    kpi('Hay que reponer', num(I.filter(r=>r.need>0).length),'referencias por debajo del punto de pedido', I.filter(r=>r.need>0).length?'warn':'pos');

  tbl('invTable','<tr><th>SKU</th><th class="num">Stock</th><th class="num">Venta/día</th><th class="num">Cobertura</th>'+
    '<th class="num">Plazo</th><th class="num">Punto de pedido</th><th class="num">Pedir</th><th>Estado</th></tr>'+
    (I.length? I.map(r=>
      '<tr><td class="name"><strong>'+esc(r.sku)+'</strong> <span class="pill '+(r.fbm?'info':'core')+'">'+(r.fbm?'FBM':'FBA')+'</span>'+
      (r.name && r.name!==r.sku ? '<br><span class="mut" style="font-size:11px">'+esc(r.name)+'</span>' : '')+'</td>'+
      '<td class="num">'+num(r.qty)+'</td><td class="num">'+num(r.velocity,1)+'</td>'+
      '<td class="num '+(r.cover<28?'neg':r.cover>154?'warn':'pos')+'" style="font-weight:600">'+(r.cover>900?'∞':num(r.cover,0)+' d')+'</td>'+
      '<td class="num mut">'+num(r.lead)+' d</td><td class="num mut">'+num(r.reorderPoint)+'</td>'+
      '<td class="num '+(r.need>0?'warn':'')+'" style="font-weight:600">'+(r.need>0?num(r.need):'—')+'</td>'+
      '<td>'+(r.risk==='low'?(r.fbm?'<span class="pill stop">rotura próxima</span>':'<span class="pill stop">tarifa bajo inv.</span>')
             :r.risk==='over'?'<span class="pill warn">sobrestock</span>':'<span class="pill go">en banda</span>')+'</td></tr>').join('')
      : '<tr><td colspan="8" class="name mut">Importa el informe de inventario FBA y el de pedidos para calcular cobertura.</td></tr>'));

  let v='';
  if(I.length){
    if(rupture.length) v+='<strong style="color:var(--stop)">'+rupture.length+' referencia'+(rupture.length===1?'':'s')+' por debajo de 28 días.</strong> '+
      'La tarifa por bajo inventario son entre 0,16 y 0,67 € por unidad en Alemania, Francia, Italia y España, y solo salta si la cobertura a 30 <em>y</em> a 90 días caen ambas bajo el umbral. Pero el coste real no es la tarifa: es perder posición en la página de resultados mientras estás sin stock, que tarda semanas en recuperarse. ';
    if(over.length) v+='<strong style="color:var(--caution)">'+over.length+' con más de 22 semanas de cobertura.</strong> '+
      'Ahí empieza el recargo por utilización de almacén, que escala hasta 76,87 €/m³/mes. Antes de liquidar con descuento, compara ese coste con el margen que perderías bajando el precio. ';
    if(!rupture.length&&!over.length) v+='<strong>Todo el catálogo está dentro de la banda razonable de cobertura.</strong> Es el estado que quieres: ni tarifa por bajo inventario ni recargo por sobrestock. ';
    v+='<br><br><span class="mut">El punto de pedido es la venta diaria multiplicada por el plazo del proveedor más tu colchón objetivo de '+TARGET.cover+' días. Si el plazo no está cargado en la ficha del proveedor, se asumen 45 días.</span>';
  } else v='Sin datos de inventario.';
  document.getElementById('invVerdict').innerHTML=v;

  const codes = COUNTRIES.map(c=>c.code);
  const anyC = I.some(r=>Object.keys(r.byCountry).length);
  tbl('invCountryTable','<tr><th>SKU</th>'+codes.map(c=>'<th class="num">'+c+'</th>').join('')+'<th class="num">Total</th></tr>'+
    (anyC ? I.filter(r=>Object.keys(r.byCountry).length).map(r=>
      '<tr><td class="name"><strong>'+esc(r.sku)+'</strong></td>'+
      codes.map(c=>{const q=r.byCountry[c]||0;
        return '<td class="num '+(q===0?'mut':'')+'">'+(q||'·')+'</td>';}).join('')+
      '<td class="num" style="font-weight:600">'+num(Object.values(r.byCountry).reduce((a,b)=>a+b,0))+'</td></tr>').join('')
      : '<tr><td colspan="'+(codes.length+2)+'" class="name mut">Importa el <strong>Inventario multipaís</strong> para ver dónde está físicamente cada unidad. Es el informe que revela si estás rompiendo stock en un país mientras te sobra en otro.</td></tr>'));
}

/* =========================================================================
   13 · COMPRAS
   ========================================================================= */
const PO_STATES=[['draft','Borrador'],['ordered','Pedido'],['production','Producción'],
                 ['transit','En tránsito'],['received','Recibido'],['closed','Cerrado']];
function renderCompras(){
  const open = DB.pos.filter(p=>p.status!=='closed');
  const committed = open.reduce((a,p)=>a+(p.payments||[]).filter(x=>!x.paid).reduce((s,x)=>s+poAmount(p)*toNum(x.pct)/100,0),0);
  document.getElementById('poKpis').innerHTML =
    kpi('Pedidos abiertos', num(open.length), DB.pos.length+' en total','accent')+
    kpi('Valor en curso', fmt(open.reduce((a,p)=>a+poAmount(p),0),0),'mercancía comprometida','')+
    kpi('Pendiente de pagar', fmt(committed,0),'anticipos y saldos', committed>0?'warn':'pos')+
    kpi('Unidades entrantes', num(open.reduce((a,p)=>a+poUnits(p),0)),'llegando al almacén','')+
    kpi('Proveedores', num(DB.suppliers.length),'con ficha creada','')+
    kpi('Plazo medio', num(DB.suppliers.length?DB.suppliers.reduce((a,s)=>a+toNum(s.lead),0)/DB.suppliers.length:0,0)+' d','desde pedido a almacén','');

  document.getElementById('poList').innerHTML = DB.pos.length ? DB.pos.map(po=>{
    const sup=DB.suppliers.find(s=>s.id===po.supplierId);
    const si = PO_STATES.findIndex(s=>s[0]===po.status);
    const paid=(po.payments||[]).filter(x=>x.paid).reduce((a,x)=>a+toNum(x.pct),0);
    return '<div class="fileitem" style="align-items:flex-start;padding:15px 17px;margin-bottom:10px;display:block">'+
      '<div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">'+
        '<div style="flex:1;min-width:190px"><div class="s-name" style="font-size:14px">'+esc(po.ref||'Pedido')+
          ' <span class="pill '+(po.status==='closed'?'go':'core')+'">'+(PO_STATES.find(s=>s[0]===po.status)||['','?'])[1]+'</span></div>'+
          '<div class="mut" style="font-size:12px;margin-top:2px">'+(sup?esc(sup.name):'sin proveedor')+
          ' · '+num(poUnits(po))+' ud · '+(po.eta?'llega '+esc(po.eta):'sin fecha')+'</div></div>'+
        '<div style="text-align:right"><div style="font-family:var(--mono);font-weight:600;font-size:16px">'+fmt(poAmount(po),0)+'</div>'+
          '<div class="mut" style="font-size:11.5px">pagado '+num(paid)+'%</div></div>'+
        '<div style="display:flex;gap:6px"><button class="btn sm" onclick="editPO(\''+po.id+'\')">Editar</button>'+
        '<button class="btn sm'+(po.received?'':' ')+'" onclick="applyPOCosts(DB.pos.find(x=>x.id===\''+po.id+'\'))" title="'+
          (po.received ? 'Reparte el flete y crea un lote de coste por línea, fechado el '+esc(po.received)
                       : 'Necesita fecha de recepción: sin ella el lote se aplicaría a ventas servidas con stock anterior')+
          '">Crear lote de coste'+(po.received?'':' ⚠')+'</button></div>'+
      '</div>'+
      '<div class="po-status">'+PO_STATES.map((s,i)=>'<span class="st '+(i<=si?'on':'')+'" title="'+s[1]+'"></span>').join('')+'</div>'+
      '</div>';
  }).join('') : '<div class="empty"><strong>Sin pedidos de compra</strong>Aquí es donde el hub se diferencia de una hoja de cálculo: cada pedido reparte su flete al coste unitario de cada producto y coloca sus vencimientos en la curva de tesorería. El clásico 30% de anticipo y 70% contra documentos deja de vivir en un correo.<div style="margin-top:12px"><button class="btn sm primary" onclick="addPO()">Crear el primero</button></div></div>';

  tbl('supplierTable','<tr><th>Proveedor</th><th>País</th><th class="num">Plazo</th><th class="num">Pedido mínimo</th>'+
    '<th>Condiciones</th><th>Incoterm</th><th style="width:70px"></th></tr>'+
    (DB.suppliers.length? DB.suppliers.map(s=>
      '<tr><td class="name"><strong>'+esc(s.name)+'</strong></td><td>'+esc(s.country||'—')+'</td>'+
      '<td class="num">'+num(toNum(s.lead))+' d</td><td class="num">'+num(toNum(s.moq))+'</td>'+
      '<td class="name mut">'+esc(s.terms||'—')+'</td><td class="mut">'+esc(s.incoterm||'—')+'</td>'+
      '<td><button class="icon-btn" onclick="editSupplier(\''+s.id+'\')">✎</button></td></tr>').join('')
      : '<tr><td colspan="7" class="name mut">Sin proveedores. El plazo de entrega que guardes aquí es lo que calcula tu punto de pedido en Inventario.</td></tr>'));
}
function addSupplier(){ editSupplier(null); }
function editSupplier(id){
  const s = id ? DB.suppliers.find(x=>x.id===id) : {id:uid(),name:'',country:'CN',lead:45,moq:500,terms:'30% anticipo / 70% contra documentos',incoterm:'FOB',notes:''};
  openModal(id?'Editar proveedor':'Nuevo proveedor',
    'El plazo de entrega es el dato que más trabaja: define tu punto de pedido y, con las condiciones de pago, la forma de la curva de caja.',
    '<div class="row-2">'+fld('ms_name','Nombre','text',s.name)+fld('ms_country','País','text',s.country)+'</div>'+
    '<div class="row-3">'+fld('ms_lead','Plazo total','number',s.lead,'d')+fld('ms_moq','Pedido mínimo','number',s.moq,'ud')+
      fld('ms_inco','Incoterm','text',s.incoterm)+'</div>'+
    fld('ms_terms','Condiciones de pago','text',s.terms)+
    '<div class="field"><label>Notas <span class="hint">incidencias de calidad, precios negociados, contacto</span></label>'+
    '<textarea id="ms_notes" rows="3">'+esc(s.notes)+'</textarea></div>',
    ()=>{
      s.name=val('ms_name'); s.country=val('ms_country'); s.lead=n('ms_lead'); s.moq=n('ms_moq');
      s.incoterm=val('ms_inco'); s.terms=val('ms_terms'); s.notes=val('ms_notes');
      if(!id) DB.suppliers.push(s);
      saveDB(); refreshAll(); toast('Proveedor guardado');
    }, id?()=>{ DB.suppliers=DB.suppliers.filter(x=>x.id!==id); saveDB(); refreshAll(); }:null);
}
function addPO(){ editPO(null); }
function editPO(id){
  const po = id ? DB.pos.find(x=>x.id===id) : {id:uid(),ref:'PO-'+iso(today()).slice(2).replace(/-/g,''),
    supplierId:(DB.suppliers[0]||{}).id||'', status:'draft', items:[], freight:0, alloc:'units',
    ordered:iso(today()), eta:iso(addDays(today(),45)),
    payments:[{label:'Anticipo',pct:30,dueDate:iso(today()),paid:false},
              {label:'Saldo contra documentos',pct:70,dueDate:iso(addDays(today(),40)),paid:false}]};
  const itemRows = ()=> (po.items.length?po.items:[{sku:'',qty:0,unitCost:0}]).map((it,i)=>
    '<tr><td><select onchange="poItem('+i+',\'sku\',this.value)">'+
      '<option value="">— SKU —</option>'+
      DB.products.map(p=>'<option value="'+esc(p.sku)+'"'+(String(p.sku)===String(it.sku)?' selected':'')+'>'+esc(p.sku)+' · '+esc(p.name)+'</option>').join('')+
      '</select></td>'+
    '<td class="num" style="width:90px"><input type="number" value="'+toNum(it.qty)+'" onchange="poItem('+i+',\'qty\',this.value)"></td>'+
    '<td class="num" style="width:100px"><input type="number" step="0.01" value="'+toNum(it.unitCost)+'" onchange="poItem('+i+',\'unitCost\',this.value)"></td>'+
    '<td class="num mut">'+fmt(poUnitCost(po,it.sku))+'</td>'+
    '<td><button class="icon-btn" onclick="poDelItem('+i+')">✕</button></td></tr>').join('');
  window.__po = po;
  window.poItem=(i,f,v)=>{ if(!po.items[i]) po.items[i]={sku:'',qty:0,unitCost:0};
    po.items[i][f]= f==='sku'?v:toNum(v); renderPOModal(); };
  window.poDelItem=(i)=>{ po.items.splice(i,1); renderPOModal(); };
  window.poAddItem=()=>{ po.items.push({sku:'',qty:0,unitCost:0}); renderPOModal(); };
  window.poPay=(i,f,v)=>{ po.payments[i][f]= f==='paid'?v:(f==='pct'?toNum(v):v); renderPOModal(); };
  window.poAddPay=()=>{ po.payments.push({label:'Pago',pct:0,dueDate:iso(today()),paid:false}); renderPOModal(); };
  window.poDelPay=(i)=>{ po.payments.splice(i,1); renderPOModal(); };

  function body(){
    const pctTot=(po.payments||[]).reduce((a,p)=>a+toNum(p.pct),0);
    return '<div class="row-3">'+fld('mo_ref','Referencia','text',po.ref)+
      '<div class="field"><label>Proveedor</label><select id="mo_sup">'+
        DB.suppliers.map(s=>'<option value="'+s.id+'"'+(s.id===po.supplierId?' selected':'')+'>'+esc(s.name)+'</option>').join('')+
        (DB.suppliers.length?'':'<option value="">Crea un proveedor primero</option>')+'</select></div>'+
      '<div class="field"><label>Estado</label><select id="mo_st">'+
        PO_STATES.map(s=>'<option value="'+s[0]+'"'+(s[0]===po.status?' selected':'')+'>'+s[1]+'</option>').join('')+'</select></div>'+
      '</div><div class="row-3">'+
        fld('mo_ord','Fecha de pedido','date',po.ordered)+fld('mo_eta','Llegada prevista','date',po.eta)+
        fld('mo_rec','Recibido el','date',po.received)+
      '</div><div class="row-2">'+
        fld('mo_fre','Flete + aranceles total','number',po.freight,'€')+
      '</div>'+
      '<div class="field"><label>Reparto del flete al coste unitario</label><select id="mo_alloc">'+
        '<option value="units"'+(po.alloc==='units'?' selected':'')+'>Por unidades (simple)</option>'+
        '<option value="value"'+(po.alloc==='value'?' selected':'')+'>Proporcional al valor (mejor si mezclas productos caros y baratos)</option>'+
      '</select></div>'+
      '<div class="fieldset"><legend>Líneas <span class="note">la última columna es el coste real con el flete dentro</span></legend>'+
      '<div class="tbl-wrap"><table class="grid"><tr><th>Producto</th><th class="num">Unid.</th><th class="num">€/ud fábrica</th><th class="num">€/ud real</th><th></th></tr>'+
      itemRows()+'</table></div>'+
      '<button class="btn sm" style="margin-top:9px" onclick="poAddItem()">+ Línea</button>'+
      '<div style="margin-top:10px;font-family:var(--mono);font-size:13px">Total del pedido: <strong>'+fmt(poAmount(po),2)+'</strong> · '+num(poUnits(po))+' unidades</div></div>'+
      '<div class="fieldset"><legend>Vencimientos de pago <span class="note">'+(Math.abs(pctTot-100)>0.5?'⚠ suman '+num(pctTot)+'%, no 100%':'suman 100%')+'</span></legend>'+
      '<div class="tbl-wrap"><table class="grid"><tr><th>Concepto</th><th class="num">%</th><th class="num">€</th><th>Vence</th><th>Pagado</th><th></th></tr>'+
      (po.payments||[]).map((p,i)=>
        '<tr><td><input type="text" value="'+esc(p.label)+'" onchange="poPay('+i+',\'label\',this.value)"></td>'+
        '<td class="num" style="width:70px"><input type="number" value="'+toNum(p.pct)+'" onchange="poPay('+i+',\'pct\',this.value)"></td>'+
        '<td class="num mut">'+fmt(poAmount(po)*toNum(p.pct)/100)+'</td>'+
        '<td style="width:140px"><input type="date" value="'+esc(p.dueDate)+'" onchange="poPay('+i+',\'dueDate\',this.value)"></td>'+
        '<td><input type="checkbox" style="width:auto" '+(p.paid?'checked':'')+' onchange="poPay('+i+',\'paid\',this.checked)"></td>'+
        '<td><button class="icon-btn" onclick="poDelPay('+i+')">✕</button></td></tr>').join('')+
      '</table></div><button class="btn sm" style="margin-top:9px" onclick="poAddPay()">+ Vencimiento</button></div>';
  }
  window.renderPOModal=()=>{
    const c=document.getElementById('modalBody'); if(!c) return;
    const keep={ref:val('mo_ref'),sup:val('mo_sup'),st:val('mo_st'),ord:val('mo_ord'),eta:val('mo_eta'),
                rec:val('mo_rec'),fre:val('mo_fre'),alloc:val('mo_alloc')};
    if(keep.ref!=null){ po.ref=keep.ref; po.supplierId=keep.sup; po.status=keep.st;
      po.ordered=keep.ord; po.eta=keep.eta; po.received=keep.rec; po.freight=toNum(keep.fre); po.alloc=keep.alloc; }
    c.innerHTML=body();
  };
  openModal(id?'Editar pedido de compra':'Nuevo pedido de compra',
    'Los vencimientos que pongas aquí aparecen directamente en la proyección de caja. «Aplicar coste» reparte el flete y crea un lote de coste por línea, fechado el día de RECEPCIÓN: la mercancía que sigue en un barco no puede haber surtido ninguna venta, así que rellena ese campo antes de aplicarlo.',
    body(),
    ()=>{
      po.ref=val('mo_ref'); po.supplierId=val('mo_sup'); po.status=val('mo_st');
      po.ordered=val('mo_ord'); po.eta=val('mo_eta'); po.received=val('mo_rec');
      po.freight=n('mo_fre'); po.alloc=val('mo_alloc');
      po.items=(po.items||[]).filter(i=>i.sku&&toNum(i.qty)>0);
      if(!id) DB.pos.push(po);
      saveDB(); refreshAll(); toast('Pedido guardado');
    }, id?()=>{ DB.pos=DB.pos.filter(x=>x.id!==id); saveDB(); refreshAll(); }:null);
}

/* =========================================================================
   14 · PUBLICIDAD
   ========================================================================= */
function renderPub(){
  const a = adStats(), P = pnl();
  document.getElementById('adKpis').innerHTML =
    kpi('Inversión', fmt(a.spend,0), a.terms.length+' términos','accent')+
    kpi('Ventas atribuidas', fmt(a.sales,0),'ACOS '+num(a.acos,1)+'%', a.acos>0&&a.acos<35?'pos':'warn')+
    kpi('TACOS', num(P.tacos,1)+'%','objetivo <'+TARGET.tacos+'%', P.tacos<=TARGET.tacos?'pos':'warn')+
    kpi('Gasto sin conversión', fmt(a.waste,0), a.wasteTerms+' términos a negativizar', a.waste>0?'neg':'pos')+
    kpi('Clics', num(a.clicks), a.clicks?'CPC '+fmt(a.spend/a.clicks):'','')+
    kpi('CTR', num(a.impr? a.clicks/a.impr*100:0,2)+'%','decente por encima de 0,3%', (a.impr&&a.clicks/a.impr*100>=0.3)?'pos':'warn');

  tbl('stTable','<tr><th>Término de búsqueda</th><th>Campaña</th><th class="num">Impr.</th><th class="num">Clics</th>'+
    '<th class="num">Gasto</th><th class="num">Ventas</th><th class="num">Pedidos</th><th class="num">ACOS</th><th>Acción</th></tr>'+
    (a.terms.length? a.terms.slice(0,60).map(t=>{
      const acos = t.sales>0 ? t.spend/t.sales*100 : 0;
      const bad = t.orders===0 && t.spend>0;
      return '<tr><td class="name"><strong>'+esc(t.term)+'</strong></td>'+
        '<td class="name mut" style="font-size:11.5px">'+esc(t.campaign)+'</td>'+
        '<td class="num mut">'+num(t.impr)+'</td><td class="num">'+num(t.clicks)+'</td>'+
        '<td class="num '+(bad?'neg':'')+'" style="font-weight:600">'+fmt(t.spend)+'</td>'+
        '<td class="num">'+fmt(t.sales)+'</td><td class="num">'+num(t.orders)+'</td>'+
        '<td class="num '+(acos===0?'':acos<35?'pos':'warn')+'">'+(t.sales>0?num(acos,0)+'%':'—')+'</td>'+
        '<td>'+(bad?'<span class="pill stop">negativizar</span>':acos>0&&acos<25?'<span class="pill go">subir puja</span>':'<span class="pill">mantener</span>')+'</td></tr>';
    }).join('') : '<tr><td colspan="9" class="name mut">Importa el informe de términos de búsqueda desde la consola de publicidad.</td></tr>'));

  let v;
  if(!a.terms.length){
    v='Sin informe de términos de búsqueda cargado. Es el fichero con mejor relación entre esfuerzo y dinero recuperado de todo el PPC: '+
      'la revisión semanal de términos suele recortar entre un 15% y un 30% del desperdicio.';
  } else {
    v='<strong>'+fmt(a.waste,0)+' gastados en '+a.wasteTerms+' términos que no han vendido nada.</strong> ';
    if(P.avgPrice) v+='Como regla, negativiza todo lo que haya gastado más de '+fmt(P.avgPrice)+' —tu precio medio— sin una sola conversión. ';
    v+='Pero mira antes el número de clics: un término con dos clics y sin venta no ha demostrado nada todavía, y matarlo por impaciencia te cuesta descubrimiento. '+
      'El caso claro es el que acumula muchos clics y ninguna venta.<br><br>'+
      '<span class="mut">No decidas sobre los últimos tres días: los clics inválidos se depuran durante 72 horas y las conversiones se reatribuyen a 1, 7 y 28 días, '+
      'así que un dato puede seguir moviéndose seis semanas después del clic.</span>';
  }
  document.getElementById('stVerdict').innerHTML=v;
}

/* =========================================================================
   15 · CUMPLIMIENTO
   ========================================================================= */
function renderComp(){
  const d = daysBetween(today(), new Date(PPWR_DATE));
  const act = COUNTRIES.filter(c=>(DB.compliance[c.code]||{}).active);
  const missing = act.filter(c=>!(DB.compliance[c.code]||{}).epr);
  const navC=document.getElementById('navCump'); if(navC) navC.textContent = missing.length||'✓';
  let b;
  if(d>=0 && d<=60){
    b='<div class="note-box stop" style="margin-top:0"><strong>Quedan '+d+' día'+(d===1?'':'s')+' para el 12 de agosto de 2026.</strong> '+
      (missing.length? 'Tienes '+missing.length+' mercado'+(missing.length===1?'':'s')+' activo'+(missing.length===1?'':'s')+' sin registro EPR marcado: <strong>'+missing.map(c=>c.name).join(', ')+'</strong>. '+
        'Desde esa fecha los marketplaces están obligados a verificar el registro de cada vendedor en cada país, y no hay periodo de gracia para el stock que ya está en almacén. '+
        'De todo lo que hay en este hub, esto es lo único que puede apagarte el negocio de un día para otro.'
        : 'Tienes marcados los registros EPR de todos tus mercados activos. Verifica también la Declaración UE de Conformidad por tipo de envase y el identificador trazable por unidad.')+'</div>';
  } else if(d<0){
    b='<div class="note-box '+(missing.length?'stop':'info')+'" style="margin-top:0"><strong>El PPWR está en vigor desde el 12 de agosto de 2026 · hace '+(-d)+' días.</strong> '+
      (missing.length
        ? 'Sigues con '+missing.length+' mercado'+(missing.length===1?'':'s')+' activo'+(missing.length===1?'':'s')+' sin registro EPR marcado: <strong>'+missing.map(c=>c.name).join(', ')+'</strong>. '+
          'Ya no hay plazo que agotar. Los marketplaces están obligados a verificar el registro y no hubo periodo de gracia para el stock en almacén, '+
          'así que esto no es una tarea pendiente: es una exposición abierta a bloqueo de listados y sanción. Tramítalo esta semana y, mientras tanto, '+
          'comprueba en Seller Central si ya te han pedido documentación en alguno de esos países.'
        : 'Todos tus mercados activos constan registrados. Verifica también la Declaración UE de Conformidad por tipo de envase y el identificador trazable por unidad, que vencieron el mismo día.')+'</div>';
  } else {
    b='<div class="note-box warn" style="margin-top:0"><strong>Faltan '+d+' días para el 12 de agosto de 2026</strong>, fecha de aplicación general del PPWR. Los registros EPR llevan semanas de tramitación: empieza con margen.</div>';
  }
  document.getElementById('ppwrBanner').innerHTML=b;

  tbl('compTable','<tr><th style="width:26px"></th><th>País</th><th class="num">IVA</th><th>NIF-IVA local</th><th>OSS</th>'+
    '<th>EPR</th><th>Registrado el</th><th class="num">Gestoría €/año</th><th class="num">€/ud</th></tr>'+
    COUNTRIES.map(c=>{
      const x = DB.compliance[c.code]||{};
      const st = countryStats().find(s=>s.c.code===c.code)||{units:0};
      const annualUnits = st.units*(365/daysInPeriod());
      const perUnit = annualUnits>0 ? toNum(x.vatCost)/annualUnits : 0;
      const cb=(f,label)=>'<input type="checkbox" style="width:auto" '+(x[f]?'checked':'')+
        ' onchange="setComp(\''+c.code+'\',\''+f+'\',this.checked)" title="'+label+'">';
      return '<tr class="'+(x.active?'':'dim')+'">'+
        '<td>'+cb('active','Vendo aquí')+'</td>'+
        '<td class="name"><strong>'+c.code+'</strong> '+c.name+' '+(c.storage?'<span class="pill core">stock</span>':'<span class="pill">EFN</span>')+'</td>'+
        '<td class="num mut">'+c.vat+'%</td>'+
        '<td>'+cb('vatReg','Registro de IVA local')+'</td><td>'+cb('oss','Declarado vía OSS')+'</td>'+
        '<td>'+cb('epr','Registro EPR')+(x.active&&!x.epr?' <span class="pill stop">falta</span>':'')+'</td>'+
        '<td style="width:140px"><input type="date" value="'+esc(x.eprDate||'')+'" onchange="setComp(\''+c.code+'\',\'eprDate\',this.value)"></td>'+
        '<td class="num" style="width:110px"><input type="number" step="50" value="'+toNum(x.vatCost)+'" onchange="setComp(\''+c.code+'\',\'vatCost\',this.value)"></td>'+
        '<td class="num '+(perUnit>0.5?'warn':'mut')+'">'+(perUnit?fmt(perUnit):'—')+'</td></tr>';
    }).join(''));

  const totalVat = act.reduce((a,c)=>a+toNum((DB.compliance[c.code]||{}).vatCost),0);
  let v='<strong>Coste anual de cumplimiento con '+act.length+' mercado'+(act.length===1?'':'s')+' activo'+(act.length===1?'':'s')+': '+fmt(totalVat,0)+'.</strong> ';
  v+='La referencia del sector son entre 960 y 2.400 € por país y año —registro más declaraciones recurrentes—, bastante más que los 400 a 1.000 € que circulan en guías desactualizadas. ';
  const stock = act.filter(c=>c.storage), efn = act.filter(c=>!c.storage);
  if(efn.length) v+='<br><br>Tienes activos '+efn.map(c=>c.code).join(', ')+', que se sirven por EFN transfronterizo: <strong>no necesitan NIF-IVA local</strong> mientras no muevas mercancía allí físicamente, por eso su gestoría figura a cero. Países Bajos es obligatorio como marketplace de listado desde junio de 2025, pero eso no lo convierte en país de almacenamiento. ';
  if(stock.length) v+='<br><br>En '+stock.map(c=>c.code).join(', ')+' sí guardas stock, así que el registro de IVA local es obligatorio y el OSS no lo sustituye. ';
  v+='<br><br><span class="mut">Chequia no aparece en esta lista a propósito: no figura en el rate card europeo vigente y las fuentes se contradicen sobre si sigue siendo país de almacenamiento PanEU. Antes de contratar un registro allí, confírmalo en tu Seller Central. Este módulo lleva el control de qué tienes y cuánto cuesta; no presenta declaraciones ni sustituye a una gestoría.</span>';
  document.getElementById('compVerdict').innerHTML=v;
}
function setComp(code,f,v){
  if(!DB.compliance[code]) DB.compliance[code]={};
  DB.compliance[code][f] = (f==='vatCost') ? toNum(v) : v;
  saveDB(); renderComp(); renderPanel();
}

/* =========================================================================
   16 · MODAL
   ========================================================================= */
function fld(id,label,type,v,unit){
  const inp = type==='number'
    ? '<div class="input-wrap"><input type="number" step="0.01" id="'+id+'" value="'+toNum(v)+'">'+(unit?'<span class="unit">'+unit+'</span>':'')+'</div>'
    : '<input type="'+type+'" id="'+id+'" value="'+esc(v==null?'':v)+'">';
  return '<div class="field"><label>'+label+(unit&&type!=='number'?' <span class="hint">'+unit+'</span>':'')+'</label>'+inp+'</div>';
}
function val(id){ const e=document.getElementById(id); return e?e.value:null; }
function mpChannel(){
  const fbm = val('mp_ch')==='FBM';
  document.getElementById('mp_fbaBox').style.display = fbm?'none':'grid';
  document.getElementById('mp_fbmBox').style.display = fbm?'grid':'none';
  document.getElementById('mp_note').innerHTML = fbm
    ? 'En FBM no pagas tarifa de gestión ni almacenaje, pero el envío, el embalaje y la atención al cliente los pagas tú, y el coste real por pedido casi siempre es mayor de lo que la gente estima. Tampoco entras en tarifa por bajo inventario, así que la banda de cobertura es más ancha. La comisión de referencia sí se paga igual.'
    : 'En FBA pagas tarifa de gestión, almacenaje y los recargos por sobrestock, pero ganas la Buy Box con más facilidad, Prime y la atención al cliente en idioma local. Es el canal por defecto para marca propia.';
}
function openModal(title,desc,body,onSave,onDelete){
  const bg=document.getElementById('modalBg');
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalDesc').textContent=desc;
  document.getElementById('modalBody').innerHTML=body;
  const foot=document.getElementById('modalFoot');
  foot.innerHTML = (onDelete?'<button class="btn danger" id="mDel">Eliminar</button>':'')+
    '<button class="btn" id="mCancel">Cancelar</button><button class="btn primary" id="mSave">Guardar</button>';
  document.getElementById('mCancel').onclick=closeModal;
  document.getElementById('mSave').onclick=()=>{ onSave(); closeModal(); };
  if(onDelete) document.getElementById('mDel').onclick=()=>{ if(confirm('¿Eliminar?')){ onDelete(); closeModal(); } };
  bg.classList.add('open');
}
function closeModal(){ document.getElementById('modalBg').classList.remove('open'); }

/* =========================================================================
   17 · EXPORT / IMPORT / DEMO
   ========================================================================= */
function exportData(){
  const payload = Object.assign({}, DB, {app:'Aresstore Seller Hub', exported:new Date().toISOString()});
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='aresstore-hub-'+iso(today())+'.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  /* La copia lleva el histórico dentro, así que descargarla es lo que apaga el
     aviso semanal. Se anota la fecha para poder avisar si vuelves a olvidarlo. */
  try{ markBackup(); renderHistorico(); renderPanel(); }catch(e){}
  toast('Copia descargada, con el histórico dentro. Guárdala fuera de este equipo.');
}
function importData(ev){
  const f=ev.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const d=JSON.parse(r.result);
      if(!d || typeof d!=='object'){ toast('El archivo no tiene el formato esperado'); return; }
      DB = Object.assign(blankDB(), d);
      TARGET = Object.assign(TARGET, (DB.settings&&DB.settings.targets)||{});
      saveDB(); bootValues(); refreshAll(); toast('Datos restaurados');
    }catch(e){ toast('No se pudo leer el archivo'); }
    ev.target.value='';
  };
  r.readAsText(f);
}
function loadDemo(){
  const hs = (function(){ try{ return historyStats(); }catch(e){ return {span:0}; } })();
  if(hs.span>0 && !confirm('ATENCIÓN: esto borra también tu HISTÓRICO ('+hs.span+' días archivados desde el '+hs.first+').\n\n'+
      'El histórico no se puede reconstruir descargando informes otra vez, porque Amazon no guarda el stock de días pasados. '+
      'Descarga primero una copia de seguridad.\n\n¿Cargar los datos de ejemplo de todas formas?')) return;
  if(!hs.span && DB.products.length && !confirm('Se reemplazan los datos actuales por un juego de ejemplo. ¿Continuar?')) return;
  DB = blankDB();
  DB.suppliers=[
    {id:'s1',name:'Ningbo Handa Ltd.',country:'CN',lead:52,moq:500,terms:'30% anticipo / 70% contra B/L',incoterm:'FOB Ningbo',notes:'Buen acabado. Dos incidencias de etiquetado en 2025.'},
    {id:'s2',name:'Poliplast Ibérica',country:'ES',lead:14,moq:200,terms:'60 días fecha factura',incoterm:'EXW Valencia',notes:'Más caro pero permite lotes cortos.'}
  ];
  /* M1.1 · los lotes del ejemplo suben de precio con el tiempo, que es lo que
     pasa de verdad. Sirven para ver de un vistazo que cambiar de método mueve
     el beneficio del periodo sin que se haya vendido nada distinto. */
  const L = (d,qty,unit,freight,ref)=>({id:uid(), date:iso(addDays(today(),-d)), qty, unit, freight, ref});
  DB.products=[
    {id:'p1',sku:'ARS-ROD-01',name:'Rodillo de masaje muscular',supplierId:'s1',cogs:4.5,freight:1.2,fba:3.2,litres:1.5,referral:15,price:24.99,
     lots:[L(300,500,3.95,0.92,'PO-251020'), L(140,600,4.30,1.05,'PO-260328'), L(45,700,4.50,1.20,'PO-260703')]},
    {id:'p2',sku:'ARS-BAN-02',name:'Set de bandas elásticas',supplierId:'s1',cogs:2.8,freight:0.7,fba:2.9,litres:0.9,referral:15,price:17.99,
     lots:[L(300,800,2.40,0.55,'PO-251020'), L(140,900,2.70,0.66,'PO-260328'), L(45,1000,2.80,0.70,'PO-260703')]},
    {id:'p3',sku:'ARS-EST-03',name:'Esterilla plegable',supplierId:'s2',cogs:8.4,freight:2.6,fba:5.1,litres:6.2,referral:15,price:39.99,
     lots:[L(210,200,7.90,2.35,'PO-260118'), L(60,250,8.40,2.60,'PO-260618')]},
    {id:'p4',sku:'ARS-PEL-04',name:'Pelota de liberación miofascial',supplierId:'s1',cogs:1.6,freight:0.4,fba:2.6,litres:0.6,referral:15,price:11.99,
     lots:[L(300,1500,1.42,0.31,'PO-251020'), L(100,2000,1.60,0.40,'PO-260508')]},
    {id:'p5',sku:'ARS-KIT-05',name:'Kit voluminoso de recuperación',supplierId:'s2',cogs:19.5,freight:6.2,fba:0,litres:24,referral:15,price:89.99,
     channel:'FBM',fbmShip:7.4,fbmStock:60,
     lots:[L(180,120,18.20,5.60,'PO-260219'), L(40,100,19.50,6.20,'PO-260708')]}
  ];
  DB.expenses=[{id:'e1',concept:'Gestoría y contabilidad',amount:280},{id:'e2',concept:'Herramientas (Helium 10, etc.)',amount:99},
               {id:'e3',concept:'Cuota Amazon Professional',amount:39},{id:'e4',concept:'Almacén y prep',amount:150}];
  DB.pos=[{id:'o1',ref:'PO-260715',supplierId:'s1',status:'transit',alloc:'units',freight:640,
    ordered:iso(addDays(today(),-38)), eta:iso(addDays(today(),14)),
    items:[{sku:'ARS-ROD-01',qty:600,unitCost:4.35},{sku:'ARS-BAN-02',qty:900,unitCost:2.70}],
    payments:[{label:'Anticipo 30%',pct:30,dueDate:iso(addDays(today(),-38)),paid:true},
              {label:'Saldo contra B/L',pct:70,dueDate:iso(addDays(today(),9)),paid:false}]}];
  ['DE','FR','IT','ES'].forEach(c=>{ DB.compliance[c].active=true; DB.compliance[c].vatReg=true; });
  DB.compliance.ES.epr=true; DB.compliance.DE.epr=true;

  // --- informes sintéticos con las cabeceras reales de Amazon ---
  const chans=['Amazon.de','Amazon.fr','Amazon.it','Amazon.es'];
  const orders=[];
  for(let d=0; d<120; d++){
    const date = iso(addDays(today(), -d));
    DB.products.forEach((p,pi)=>{
      const base=[7,5,2,4,1.2][pi]||1;
      const q = Math.max(0, Math.round(base + Math.sin((d+pi*7)/9)*2 + (d%11===0?3:0)));
      for(let k=0;k<Math.min(q,4);k++){
        const units = Math.max(1, Math.round(q/4));
        orders.push({amazonorderid:'171-'+(1000000+d*17+pi*3+k), purchasedate:date+'T10:00:00+00:00',
          fulfillmentchannel: p.channel==='FBM' ? 'Merchant' : 'Amazon',
          saleschannel:chans[(d+k+pi)%4], sku:p.sku, asin:'B0'+(pi+1)+'XXXXXX', itemstatus:'Shipped',
          quantity:String(units), itemprice:(p.price*units).toFixed(2), itemtax:(p.price*units*0.21/1.21).toFixed(2),
          shipcountry:['DE','FR','IT','ES'][(d+k+pi)%4]});
      }
    });
  }
  DB.imports.orders={rows:orders,count:orders.length,file:'demo-all-orders.csv',loadedAt:new Date().toISOString(),cols:33};

  const inv=[], mc=[];
  const stocks={'ARS-ROD-01':420,'ARS-BAN-02':180,'ARS-EST-03':95,'ARS-PEL-04':1400};
  DB.products.filter(p=>p.channel!=='FBM').forEach(p=>{
    inv.push({sku:p.sku, fnsku:'X00'+p.sku, asin:'B0X', afnfulfillablequantity:String(stocks[p.sku]),
              afntotalquantity:String(stocks[p.sku]), productname:p.name});
    ['DE','FR','IT','ES'].forEach((c,i)=>mc.push({sellersku:p.sku, country:c,
      quantityforlocalfulfillment:String(Math.round(stocks[p.sku]*[0.42,0.24,0.16,0.18][i]))}));
  });
  DB.imports.inventory={rows:inv,count:inv.length,file:'demo-fba-inventory.csv',loadedAt:new Date().toISOString(),cols:21};
  DB.imports.multicountry={rows:mc,count:mc.length,file:'demo-multicountry.csv',loadedAt:new Date().toISOString(),cols:6};

  const st=[];
  const terms=[['rodillo masaje muscular',0],['foam roller',0],['rodillo fitness',0],['masajeador espalda',1],
    ['banda elastica fitness',0],['gomas entrenamiento',1],['esterilla yoga plegable',0],['pelota lacrosse masaje',1],
    ['rodillo de espuma barato',2],['masaje piernas maquina',2],['rodillo pilates',0],['fitness accesorios',2]];
  terms.forEach((t,i)=>{
    const clicks = 30+i*11, spend=(clicks*0.62).toFixed(2);
    const orders_ = t[1]===0? Math.round(clicks*0.09) : (t[1]===1? Math.round(clicks*0.03) : 0);
    st.push({customersearchterm:t[0], campaignname:'SP · '+(i<4?'Rodillo':i<7?'Bandas':'Genérico')+' · exacta',
      impressions:String(clicks*38), clicks:String(clicks), spend:spend,
      sales:(orders_*23.4).toFixed(2), orders:String(orders_)});
  });
  DB.imports.searchterm={rows:st,count:st.length,file:'demo-search-terms.csv',loadedAt:new Date().toISOString(),cols:12};

  const ret=[];
  for(let i=0;i<46;i++){
    const p=DB.products[i%4];
    ret.push({returndate:iso(addDays(today(),-(i*2))), sku:p.sku, quantity:'1',
      detaileddisposition:i%3?'SELLABLE':'CUSTOMER_DAMAGED', reason:'NO_LONGER_NEEDED', orderid:'171-x'+i});
  }
  DB.imports.returns={rows:ret,count:ret.length,file:'demo-returns.csv',loadedAt:new Date().toISOString(),cols:13};

  DB.settings.cash={start:8400,cycle:14,reserve:15,vat:21,ppcDaily:0};
  /* El ejemplo también alimenta el histórico: si no, M0 parecería vacío justo
     cuando alguien está recorriendo los módulos para entender qué hace cada uno. */
  try{ logImport('orders','Todos los pedidos',orders.length,'demo-all-orders.csv','datos de ejemplo'); captureAll(); }catch(e){}
  saveDB(); bootValues(); refreshAll();
  toast('Datos de ejemplo cargados. Recorre los módulos y luego vacíalos para meter los tuyos.');
}

/* =========================================================================
   17b · VALIDACIONES GUARDADAS (módulo Validar producto)
   ========================================================================= */
function currentSnapshot(){
  const ids=['country','vat','price','cogs','freight','referral','fba','ppc','returnRate','unsellable',
             'retProcMode','retProcEur','litres','stockMonths','storageRate','lowInv','epr','vatAnnual','units','monthly'];
  const d={}; ids.forEach(k=>{const el=document.getElementById(k); if(el) d[k]=el.value;});
  d.fuel=chk('fuel'); d.ppcMode=ppcMode;
  d.countryState=JSON.parse(JSON.stringify(countryState));
  return d;
}
function saveProduct(){
  const name=(val('saveName')||'').trim();
  if(!name){ toast('Ponle un nombre al producto'); return; }
  const i=inputs(), e=unitEconomics(i), s=stressTest(i);
  const failed=[e.profit>0, e.marginNet>=TARGET.net, e.marginContrib>=TARGET.contrib,
                e.roi>=TARGET.roi, s[s.length-1].profit>0].filter(x=>!x).length;
  DB.saved.unshift({id:Date.now(), name, marginNet:e.marginNet, profit:e.profit, roi:e.roi,
                    failed, state:e.profit<=0?'stop':(failed?'caution':'go'), snapshot:currentSnapshot()});
  document.getElementById('saveName').value='';
  const ok=saveDB(); renderSaved();
  toast(ok? ('Guardado: '+name) : ('Guardado solo en memoria: '+name+' — descarga una copia'));
}
function renderSaved(){
  const list=document.getElementById('savedList'); if(!list) return;
  if(!DB.saved.length){
    list.innerHTML='<div class="empty">Aún no has validado ningún producto. Evalúa uno y guárdalo para construir tu histórico de decisiones y comparar candidatos entre sí.</div>';
    return;
  }
  list.innerHTML=DB.saved.map(p=>
    '<div class="saved-item"><span class="dot '+p.state+'"></span>'+
    '<div><div class="s-name">'+esc(p.name)+'</div>'+
    '<div class="s-meta">'+fmt(p.profit)+'/ud · ROI '+(isFinite(p.roi)?num(p.roi,0):'—')+'% · '+(5-(p.failed||0))+'/5 criterios</div></div>'+
    '<div class="s-right"><span class="s-margin '+(p.state==='go'?'pos':p.state==='caution'?'warn':'neg')+'">'+num(p.marginNet,1)+'%</span>'+
    '<button class="icon-btn" title="Cargar" onclick="loadProduct('+p.id+')">↺</button>'+
    '<button class="icon-btn" title="Eliminar" onclick="delProduct('+p.id+')">✕</button></div></div>').join('');
}
function loadProduct(id){
  const p=DB.saved.filter(x=>x.id===id)[0]; if(!p) return;
  const s=p.snapshot;
  Object.keys(s).forEach(k=>{
    if(k==='fuel'){ document.getElementById('fuel').checked=s.fuel; }
    else if(k==='ppcMode'){ ppcMode=s.ppcMode; setPpcModeVisual(); }
    else if(k==='countryState'){ countryState=s.countryState||{}; }
    else { const el=document.getElementById(k); if(el) el.value=s[k]; }
  });
  onRetProc();
  const c=COUNTRIES.filter(x=>x.code===val('country'))[0];
  if(c){ const li=document.getElementById('lowInv'); li.disabled=!c.lowInv; }
  calc(); window.scrollTo(0,0); toast('Cargado: '+p.name);
}
function delProduct(id){ DB.saved=DB.saved.filter(x=>x.id!==id); saveDB(); renderSaved(); toast('Eliminado'); }

/* =========================================================================
   18 · ARRANQUE
   ========================================================================= */
function bootValues(){
  const t=DB.settings.targets||TARGET; TARGET=Object.assign({},TARGET,t);
  const set=(id,v)=>{const e=document.getElementById(id); if(e) e.value=v;};
  set('tgNet',TARGET.net); set('tgContrib',TARGET.contrib); set('tgRoi',TARGET.roi);
  set('tgTacos',TARGET.tacos); set('tgCover',TARGET.cover); set('tgCash',TARGET.cash);
  const cs=DB.settings.cash;
  set('cashStart',cs.start); set('cashCycle',cs.cycle); set('cashReserve',cs.reserve); set('cashVat',cs.vat);
}
function refreshAll(){
  try{ renderPanel(); }catch(e){ console.warn('panel',e); }
  try{ renderDatos(); }catch(e){ console.warn('datos',e); }
  try{ renderHistorico(); }catch(e){ console.warn('hist',e); }
  try{ renderRent(); }catch(e){ console.warn('rent',e); }
  try{ renderTesoreria(); }catch(e){ console.warn('tes',e); }
  try{ renderCatalogo(); }catch(e){ console.warn('cat',e); }
  try{ renderInv(); }catch(e){ console.warn('inv',e); }
  try{ renderCompras(); }catch(e){ console.warn('com',e); }
  try{ renderPub(); }catch(e){ console.warn('pub',e); }
  try{ renderComp(); }catch(e){ console.warn('cump',e); }
  try{ renderSaved(); }catch(e){}
  try{ if(typeof calc==='function') calc(); }catch(e){}
}
let toastT;
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),3600);
}
/* drag & drop */
(function(){
  const d=document.getElementById('drop'); if(!d) return;
  ['dragenter','dragover'].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.add('over');}));
  ['dragleave','drop'].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.remove('over');}));
  d.addEventListener('drop',e=>{ if(e.dataTransfer&&e.dataTransfer.files) handleFiles(e.dataTransfer.files); });
})();
document.getElementById('modalBg').addEventListener('click',e=>{ if(e.target.id==='modalBg') closeModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });

/* selector global de país */
(function(){
  const s=document.getElementById('gCountry');
  s.innerHTML='<option value="ALL">Todos los mercados</option>'+
    COUNTRIES.map(c=>'<option value="'+c.code+'">'+c.name+'</option>').join('');
})();

bindToc('#docToc','#view-diagnostico');
bindToc('#auditToc','#view-auditoria');
bindToc('#acercaToc','#view-acerca');

DB = loadDB();
TARGET = Object.assign(TARGET, (DB.settings&&DB.settings.targets)||{});
bootValues();
onCountryChange();
onRetProc();
refreshAll();
renderHome();
/* Se entra siempre por el lanzador, salvo que se vuelva con la app abierta. */
if(location.hash==='#gestion') openApp();


/* =========================================================================
   19 · ACTUALIZACIÓN AUTOMÁTICA
   Publico un cambio, Vercel lo despliega y la app se pone al día sola. Pero
   no recarga si estás escribiendo o tienes un formulario abierto: en ese caso
   avisa y espera. Recargar a alguien a media frase es una falta de respeto.
   ========================================================================= */
let swRefreshing = false;
function puedeRecargarAhora(){
  const bg = document.getElementById('modalBg');
  if(bg && bg.classList.contains('open')) return false;
  const a = document.activeElement;
  if(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
  return true;
}
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js').catch(function(e){ console.warn('sw no registrado', e); });
  });
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if(swRefreshing) return;
    if(puedeRecargarAhora()){ swRefreshing = true; location.reload(); }
    else toast('Hay una versión nueva de la app. Recarga cuando termines lo que estás haciendo.');
  });
}
