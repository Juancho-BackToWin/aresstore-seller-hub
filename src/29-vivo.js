/* ═══════════════════════════════════════════════════════════════════════════
   EN VIVO · el Hub lee Supabase (fase 3 de docs/ESTADO-DATOS.md)

   QUÉ RESPONDE. «¿Qué dicen hoy los datos que ya recogen los agentes?»: stock
   de la última foto, pedidos de España de los últimos 7 y 30 días, el dinero
   por mes y país hasta donde llega el informe de transacciones, la bandeja de
   decisiones y lo fresca que está cada fuente.

   QUÉ NO HACE (y lo dice en pantalla):
   · No resta el coste de producto: en Supabase solo hay 4 costes confirmados.
     La cifra es «neto antes de coste de producto», no beneficio.
   · Los pedidos por API son solo de España; el stock es el pool europeo. No
     calcula cobertura con esas dos cosas juntas: saldría un número creíble y
     falso (el stock de cuatro países entre las ventas de uno).
   · El dinero se corta en la última fecha de `amz_ventas_linea` (hoy, 23-nov).
     Lo posterior no se inventa.
   · No sustituye a la importación manual: los módulos de siempre siguen
     leyendo de este navegador. Esta vista es aparte.

   SEGURIDAD. Solo la clave PUBLICABLE (hecha para ir en el navegador). Las
   tablas están cerradas; las funciones `amz_panel_*` exigen que la sesión sea
   la del titular (servidor/sql/004_panel_lectura.sql). La sesión se guarda en
   este navegador, en una clave propia, y se puede cerrar desde la vista.
   ═══════════════════════════════════════════════════════════════════════════ */

const VIVO = {
  url:'https://hqmshjjhzwkuumoiksou.supabase.co',
  clave:'sb_publishable_gzfv2xmn5WcAvH0-hMoPvg_5ulMv_pl',
  correo:'juancho@grupoarestora.com',
  claveSesion:'aresstore_sb_sesion',
  datos:null, cargado:null, cargando:false, error:'', aviso:'',
  SKUS_CLAVE:['FBA0500','FBA0103']
};

/* ── Fechas en hora local (misma regla que iso() de 12-datos) ─────────────── */
function vivoDia(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function vivoHace(hoy, n){ const d=new Date(hoy.getTime()); d.setHours(12,0,0,0); d.setDate(d.getDate()-n); return vivoDia(d); }
function vivoNum(x){ const n=Number(x); return isFinite(n)?n:0; }
function vivoR2(x){ return Math.round(x*100)/100; }

/* ── Cálculos puros (los prueba tests/vivo.test.js) ──────────────────────────
   Dinero por mes y país desde amz_panel_ventas_dia.
   · ingresos      = Σ ingreso (sin IVA) de todas las filas (ventas y reembolsos)
   · amazon        = Σ comisión + logística + otros, SALVO las filas de tipo
                     «publicidad» (que van aparte)
   · publicidad    = Σ otros de las filas de tipo «publicidad»
   · neto          = ingresos + amazon + publicidad  (= liquidado − IVA)
   Los costes vienen en negativo en el informe; aquí se respetan los signos. */
function vivoDineroPorMes(filas){
  const m = {};
  (filas||[]).forEach(f=>{
    const mes = String(f.dia||'').slice(0,7), pais = f.pais||'—';
    if(!mes) return;
    const k = mes+'|'+pais;
    const a = m[k] || (m[k] = {mes, pais, ingresos:0, amazon:0, publicidad:0, unidades:0, neto:0});
    const ing = vivoNum(f.ingreso), com = vivoNum(f.comision), log = vivoNum(f.logistica), otr = vivoNum(f.otros);
    a.ingresos += ing;
    if(f.tipo==='publicidad'){ a.publicidad += com+log+otr; }
    else { a.amazon += com+log+otr; }
    if(f.tipo==='venta') a.unidades += vivoNum(f.unidades);
    if(f.tipo==='reembolso') a.unidades -= Math.abs(vivoNum(f.unidades));
  });
  return Object.values(m).map(a=>{
    a.ingresos=vivoR2(a.ingresos); a.amazon=vivoR2(a.amazon); a.publicidad=vivoR2(a.publicidad);
    a.neto=vivoR2(a.ingresos+a.amazon+a.publicidad); return a;
  }).sort((x,y)=> x.mes===y.mes ? (x.pais<y.pais?-1:1) : (x.mes<y.mes?1:-1));
}

/* Pedidos de los últimos 7 y 30 días (hoy incluido), sin cancelados. */
function vivoPedidos(filas, hoy){
  const d7 = vivoHace(hoy,6), d30 = vivoHace(hoy,29);
  const porSku = {}, tot = {u7:0,u30:0,importe30:0,pedidos30:0,ultimoDia:null};
  (filas||[]).forEach(f=>{
    if(f.estado==='Canceled') return;
    const dia = String(f.dia||'');
    if(!tot.ultimoDia || dia>tot.ultimoDia) tot.ultimoDia = dia;
    if(dia < d30) return;
    const s = porSku[f.sku] || (porSku[f.sku] = {sku:f.sku, u7:0, u30:0, importe30:0});
    const u = vivoNum(f.unidades);
    s.u30 += u; s.importe30 += vivoNum(f.importe); tot.u30 += u; tot.importe30 += vivoNum(f.importe);
    tot.pedidos30 += vivoNum(f.pedidos);
    if(dia >= d7){ s.u7 += u; tot.u7 += u; }
  });
  tot.importe30 = vivoR2(tot.importe30);
  return {total:tot, skus:Object.values(porSku).map(s=>(s.importe30=vivoR2(s.importe30),s))
                                 .sort((a,b)=>b.u30-a.u30)};
}

/* Stock de la última foto: total y los dos SKU que se conservan. */
function vivoStock(filas){
  const r = {fecha:null, skus:0, disponibles:0, reservadas:0, entrantes:0, no_vendibles:0, clave:{}};
  (filas||[]).forEach(f=>{
    r.fecha = f.fecha_foto || r.fecha; r.skus++;
    r.disponibles += vivoNum(f.disponibles); r.reservadas += vivoNum(f.reservadas);
    r.entrantes += vivoNum(f.entrantes); r.no_vendibles += vivoNum(f.no_vendibles);
    if(VIVO.SKUS_CLAVE.indexOf(f.sku)>=0) r.clave[f.sku] = {
      disponibles:vivoNum(f.disponibles), reservadas:vivoNum(f.reservadas), entrantes:vivoNum(f.entrantes)};
  });
  return r;
}

/* Frescura: días desde la última ingesta buena de cada fuente. */
function vivoFrescura(ingestas, hoy){
  return (ingestas||[]).map(g=>{
    const t = new Date(g.cuando); const dias = Math.floor((hoy - t)/86400000);
    return {fuente:g.id_hub, estado:g.estado, cuando:g.cuando, dias,
            vieja: g.estado!=='ok' || ((g.id_hub==='inventario'||g.id_hub==='pedidos') && dias>=2)};
  }).sort((a,b)=> a.fuente<b.fuente?-1:1);
}

/* ── Sesión ──────────────────────────────────────────────────────────────── */
function vivoSesion(){
  try{ return JSON.parse(localStorage.getItem(VIVO.claveSesion)||'null'); }catch(e){ return null; }
}
function vivoGuardarSesion(s){
  try{ if(s) localStorage.setItem(VIVO.claveSesion, JSON.stringify(s)); else localStorage.removeItem(VIVO.claveSesion); }catch(e){}
}
/* Vuelta del enlace mágico: #access_token=…&refresh_token=…&expires_in=… */
function vivoLeerRetorno(){
  const h = (location.hash||'').replace(/^#/,'');
  if(!h || (h.indexOf('access_token=')<0 && h.indexOf('error')<0)) return false;
  const p = new URLSearchParams(h);
  if(p.get('error') || p.get('error_description')){
    VIVO.error = 'El enlace no ha valido: '+(p.get('error_description')||p.get('error')).replace(/\+/g,' ')+'. Pide otro.';
  }else if(p.get('access_token')){
    vivoGuardarSesion({access_token:p.get('access_token'), refresh_token:p.get('refresh_token'),
      expires_at: Math.floor(Date.now()/1000) + (parseInt(p.get('expires_in'),10)||3600)});
    VIVO.aviso = 'Sesión iniciada.';
  }
  try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){ location.hash=''; }
  return true;
}
async function vivoToken(){
  const s = vivoSesion(); if(!s) return null;
  if(s.expires_at && s.expires_at - 60 > Date.now()/1000) return s.access_token;
  if(!s.refresh_token) return null;
  const r = await fetch(VIVO.url+'/auth/v1/token?grant_type=refresh_token', {method:'POST',
    headers:{'apikey':VIVO.clave,'Content-Type':'application/json'}, body:JSON.stringify({refresh_token:s.refresh_token})});
  if(!r.ok){ vivoGuardarSesion(null); return null; }
  const j = await r.json();
  vivoGuardarSesion({access_token:j.access_token, refresh_token:j.refresh_token,
    expires_at: Math.floor(Date.now()/1000) + (j.expires_in||3600)});
  return j.access_token;
}
async function vivoPedirEnlace(){
  const el = document.getElementById('vivoCorreo');
  const correo = (el && el.value || VIVO.correo).trim();
  VIVO.error=''; VIVO.aviso='Enviando…'; renderVivo();
  try{
    const vuelta = location.origin + location.pathname;
    const r = await fetch(VIVO.url+'/auth/v1/otp?redirect_to='+encodeURIComponent(vuelta), {method:'POST',
      headers:{'apikey':VIVO.clave,'Content-Type':'application/json'},
      body:JSON.stringify({email:correo, create_user:false})});
    if(!r.ok){ const t = await r.text(); throw new Error(r.status+' '+t.slice(0,160)); }
    VIVO.aviso = 'Te he mandado un enlace a '+correo+'. Ábrelo en este mismo navegador.';
  }catch(e){ VIVO.aviso=''; VIVO.error = 'No se ha podido enviar el enlace: '+e.message; }
  renderVivo();
}
function vivoSalir(){ vivoGuardarSesion(null); VIVO.datos=null; VIVO.cargado=null; VIVO.aviso='Sesión cerrada.'; renderVivo(); }

async function vivoRpc(nombre, args, token){
  const r = await fetch(VIVO.url+'/rest/v1/rpc/'+nombre, {method:'POST',
    headers:{'apikey':VIVO.clave,'Authorization':'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(args||{})});
  if(r.status===401 || r.status===403){ const e = new Error('sin permiso'); e.permiso = true; throw e; }
  if(!r.ok) throw new Error(nombre+': '+r.status+' '+(await r.text()).slice(0,160));
  return r.json();
}
async function vivoCargar(){
  if(VIVO.cargando) return;
  const token = await vivoToken().catch(()=>null);
  if(!token){ renderVivo(); return; }
  VIVO.cargando = true; VIVO.error=''; renderVivo();
  try{
    const hoy = new Date();
    const [ventas, pedidos, inventario, recom, ingestas] = await Promise.all([
      vivoRpc('amz_panel_ventas_dia', {p_desde: vivoHace(hoy, 200)}, token),
      vivoRpc('amz_panel_pedidos_dia', {p_desde: vivoHace(hoy, 40)}, token),
      vivoRpc('amz_panel_inventario', {}, token),
      vivoRpc('amz_panel_recomendaciones', {p_limite: 30}, token),
      vivoRpc('amz_panel_ingestas', {}, token)]);
    VIVO.datos = {ventas, pedidos, inventario, recom, ingestas};
    VIVO.cargado = new Date();
  }catch(e){
    if(e.permiso) VIVO.datos = null;
    VIVO.error = e.permiso ? 'Esta sesión no tiene permiso para leer los datos del negocio.' : 'Error al leer Supabase: '+e.message;
  }
  VIVO.cargando = false; renderVivo();
}

/* ── Pintado ─────────────────────────────────────────────────────────────── */
function vivoEur(x){ return typeof fmt==='function' ? fmt(x) : (Math.round(x*100)/100)+' €'; }
function vivoFechaCorta(s){ if(!s) return '—'; const d=new Date(s); return isNaN(d)?String(s):d.toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }

function vivoHtmlDatos(D, hoy){
  const st = vivoStock(D.inventario), pe = vivoPedidos(D.pedidos, hoy),
        me = vivoDineroPorMes(D.ventas), fr = vivoFrescura(D.ingestas, hoy);
  const corte = (D.ventas||[]).reduce((m,f)=> f.dia>m?f.dia:m, '');
  const k = (sku)=> st.clave[sku] ? st.clave[sku].disponibles+' disp. · '+st.clave[sku].reservadas+' res.' : 'sin dato';
  const kp = sku => { const s = pe.skus.filter(x=>x.sku===sku)[0]; return s ? s.u7+' / '+s.u30 : '0 / 0'; };
  let h = '<div class="kpis">'+
    kpi('Stock FBA (pool UE)', num(st.disponibles), 'medido · foto del '+esc(st.fecha||'—')+' · '+st.skus+' SKU')+
    kpi('FBA0500 paños', k('FBA0500'), 'medido · pedidos ES 7/30 días: '+kp('FBA0500'))+
    kpi('FBA0103 pulsera', k('FBA0103'), 'medido · pedidos ES 7/30 días: '+kp('FBA0103'))+
    kpi('Pedidos España 30 días', num(pe.total.u30)+' uds', 'medido · '+vivoEur(pe.total.importe30)+' con IVA · 7 días: '+pe.total.u7+' uds')+
  '</div>';

  h += '<div class="panel"><h2>Dinero por mes y país</h2>'+
    '<p class="desc">Medido, del informe de transacciones de Seller Central, <strong>hasta el '+esc(corte||'—')+'</strong>. '+
    'Ingresos sin IVA (ventas menos reembolsos); «Amazon» son comisiones, logística y tarifas; publicidad son las facturas de anuncios cobradas por Amazon. '+
    '<strong>Neto antes de coste de producto</strong>: aún no resta lo que cuesta el producto (en Supabase solo hay 4 costes confirmados), así que no es beneficio.</p>'+
    '<div class="tbl-wrap"><table class="grid"><thead><tr><th>Mes</th><th>País</th><th class="r">Uds netas</th><th class="r">Ingresos</th><th class="r">Amazon</th><th class="r">Publicidad</th><th class="r">Neto antes de coste</th></tr></thead><tbody>'+
    me.slice(0,40).map(a=>'<tr><td>'+esc(a.mes)+'</td><td>'+esc(a.pais)+'</td><td class="r">'+num(a.unidades)+'</td><td class="r">'+vivoEur(a.ingresos)+
      '</td><td class="r">'+vivoEur(a.amazon)+'</td><td class="r">'+vivoEur(a.publicidad)+'</td><td class="r"><strong>'+vivoEur(a.neto)+'</strong></td></tr>').join('')+
    '</tbody></table></div></div>';

  h += '<div class="panel"><h2>Pedidos de España por SKU · 30 días</h2>'+
    '<p class="desc">Medido por SP-API, sin cancelados, día en hora de Madrid. Solo España: Italia y Francia también venden y aquí no salen. Último pedido recogido: '+esc(pe.total.ultimoDia||'—')+'.</p>'+
    '<div class="tbl-wrap"><table class="grid"><thead><tr><th>SKU</th><th class="r">Uds 7 días</th><th class="r">Uds 30 días</th><th class="r">Importe 30 días (con IVA)</th></tr></thead><tbody>'+
    (pe.skus.length? pe.skus.map(s=>'<tr><td>'+esc(s.sku)+'</td><td class="r">'+num(s.u7)+'</td><td class="r">'+num(s.u30)+'</td><td class="r">'+vivoEur(s.importe30)+'</td></tr>').join('')
      : '<tr><td colspan="4">Sin pedidos en 30 días.</td></tr>')+
    '</tbody></table></div></div>';

  h += '<div class="panel"><h2>Decisiones de los agentes</h2>'+
    '<p class="desc">Las últimas 30 filas de la bandeja (<code>amz_recomendaciones</code>): lo que se ha propuesto o hecho, con su partida.</p>'+
    '<div class="tbl-wrap"><table class="grid"><thead><tr><th>#</th><th>Fecha</th><th>Módulo</th><th>SKU</th><th>País</th><th>Acción</th><th>Estado</th></tr></thead><tbody>'+
    (D.recom||[]).map(r=>'<tr><td>'+r.id+'</td><td>'+esc(vivoFechaCorta(r.creada))+'</td><td>'+esc(r.modulo)+'</td><td>'+esc(r.sku||'')+'</td><td>'+esc(r.pais||'')+
      '</td><td>'+esc(r.accion)+'</td><td><span class="pill '+(r.estado==='ejecutada'?'go':r.estado==='propuesta'?'warn':'info')+'">'+esc(r.estado)+'</span></td></tr>').join('')+
    '</tbody></table></div></div>';

  h += '<div class="panel"><h2>Frescura de las fuentes</h2>'+
    '<div class="tbl-wrap"><table class="grid"><thead><tr><th>Fuente</th><th>Estado</th><th>Última</th><th class="r">Días</th></tr></thead><tbody>'+
    fr.map(f=>'<tr><td>'+esc(f.fuente)+'</td><td><span class="pill '+(f.vieja?'stop':'go')+'">'+esc(f.estado)+'</span></td><td>'+esc(vivoFechaCorta(f.cuando))+'</td><td class="r">'+f.dias+'</td></tr>').join('')+
    '</tbody></table></div>'+
    '<p class="desc" style="margin-top:10px">Inventario y pedidos se recogen cada día a las 06:17 (hora de Madrid). En rojo, una fuente con error o con más de un día de retraso.</p></div>';
  return h;
}

function renderVivo(){
  const el = document.getElementById('vivoCuerpo'); if(!el) return;
  const s = vivoSesion();
  let h = '';
  if(VIVO.error) h += '<div class="panel" style="border-left:4px solid var(--stop)"><strong>'+esc(VIVO.error)+'</strong></div>';
  if(VIVO.aviso) h += '<div class="panel"><strong>'+esc(VIVO.aviso)+'</strong></div>';
  if(!s){
    h += '<div class="panel"><h2>Entrar</h2>'+
      '<p class="desc">Los datos del negocio solo se enseñan con tu sesión. Te mando un enlace al correo; ábrelo en este navegador y vuelves aquí con la sesión hecha.</p>'+
      '<div class="row-2"><div class="field"><label>Correo</label><input type="email" id="vivoCorreo" value="'+esc(VIVO.correo)+'"></div></div>'+
      '<button class="btn primary" onclick="vivoPedirEnlace()">Mandarme el enlace</button></div>';
    el.innerHTML = h; return;
  }
  h += '<div class="panel" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">'+
    '<span>Datos leídos '+(VIVO.cargado? 'a las '+esc(vivoFechaCorta(VIVO.cargado)) : '—')+(VIVO.cargando?' · leyendo…':'')+'</span>'+
    '<button class="btn sm" onclick="VIVO.cargado=null;vivoCargar()">Actualizar</button>'+
    '<button class="btn sm" onclick="vivoSalir()">Cerrar sesión</button></div>';
  if(VIVO.datos) h += vivoHtmlDatos(VIVO.datos, new Date());
  el.innerHTML = h;
  const viejo = !VIVO.cargado || (Date.now()-VIVO.cargado.getTime() > 10*60*1000);
  if(viejo && !VIVO.cargando && !VIVO.error){
    const vista = document.getElementById('view-vivo');
    if(vista && vista.classList.contains('active')) vivoCargar();
  }
}

registrarVista({
  id:'vivo', etiqueta:'En vivo', icono:'●', grupo:'Visión general', crumb:'Visión general',
  render:renderVivo,
  html:
    '<div class="panel"><div class="panel-head"><div>'+
      '<h2>En vivo · lo que recogen los agentes</h2>'+
      '<p class="desc" style="margin:0">Lee Supabase con tu sesión. Cada cifra dice si es medida y de qué fecha. '+
      'Los demás módulos siguen funcionando con los ficheros que importas en Datos.</p>'+
    '</div></div></div>'+
    '<div id="vivoCuerpo"></div>'
});

/* Si se vuelve del enlace mágico, abrir directamente esta vista. */
if(vivoLeerRetorno()){
  document.addEventListener('DOMContentLoaded', ()=>{ setTimeout(()=>{ try{ if(typeof openApp==='function') openApp(); go('vivo'); }catch(e){} }, 0); });
}
