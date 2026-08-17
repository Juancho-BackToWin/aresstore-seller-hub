const {chromium}=require('playwright');
let fails=0; const ck=(l,c,e)=>{if(!c)fails++;console.log('  '+(c?'OK   ':'FALLO')+' '+l+(e!==undefined?'  → '+e:''));};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:1400,height:950}});
  const errs=[], net=[];
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
  p.on('response',r=>net.push(r.status()+' '+r.url().split('/').pop()));
  await p.goto('http://localhost:8899/');
  await p.waitForTimeout(1800);

  console.log('\n=== RECURSOS ===');
  net.filter(n=>!/localhost:8899\/$/.test(n)).forEach(n=>console.log('     '+n));
  const codes={};
  for(const f of ['index.html','manifest.webmanifest','sw.js','icon-192.png','icon-512.png','icon-180.png','icon-maskable-512.png']){
    codes[f]=await p.evaluate(async f=>{try{const r=await fetch(f,{cache:'no-store'});return r.status;}catch(e){return 0;}},f);
  }
  Object.keys(codes).forEach(f=>console.log('     '+codes[f]+'  '+f));
  ck('los 7 archivos responden 200', Object.values(codes).every(c=>c===200));
  ck('no hay 404', !net.some(n=>n.startsWith('404')), net.filter(n=>n.startsWith('404')).join(', ')||'ninguno');

  console.log('\n=== APP ===');
  ck('arranca en el lanzador', await p.isVisible('#shellHome'));
  const cards=await p.$$eval('.appcard',e=>e.length);
  ck('las 6 tarjetas con icono', cards===6);
  ck('el manifest está enlazado como archivo',
    (await p.getAttribute('link[rel=manifest]','href'))==='manifest.webmanifest');
  ck('apple-touch-icon apunta a archivo', /icon-180/.test(await p.getAttribute('link[rel="apple-touch-icon"]','href')));

  console.log('\n=== PWA ===');
  const sw=await p.evaluate(async()=>{
    const r=await navigator.serviceWorker.getRegistration();
    return r ? (r.active?'activo':(r.installing?'instalando':'registrado')) : 'ninguno';
  });
  ck('service worker registrado', sw!=='ninguno', sw);
  const man=await p.evaluate(async()=>{
    const r=await fetch('manifest.webmanifest'); const j=await r.json();
    return j.name+' | display='+j.display+' | iconos='+j.icons.length+' | maskable='+(j.icons.some(i=>i.purpose==='maskable')?'sí':'no');
  });
  console.log('     '+man);
  ck('manifest válido con icono maskable', /maskable=sí/.test(man) && /display=standalone/.test(man));

  console.log('\n=== FUNCIONA IGUAL QUE ANTES ===');
  await p.click('.appcard:not(.soon)'); await p.waitForTimeout(500);
  ck('se abre Gestión Seller', await p.isVisible('#shellApp'));
  p.on('dialog',d=>d.accept());
  await p.evaluate(()=>document.querySelector('.nav-item[data-view="datos"]').click());
  await p.waitForTimeout(300);
  await p.click('button:has-text("Cargar datos de ejemplo")'); await p.waitForTimeout(1200);
  await p.evaluate(()=>document.querySelector('.nav-item[data-view="panel"]').click());
  await p.waitForTimeout(500);
  const k=await p.$$eval('#panelKpis .kpi',e=>e.map(x=>x.querySelector('.k-name').textContent+'='+x.querySelector('.k-val').textContent));
  k.forEach(x=>console.log('     '+x));
  ck('el panel calcula con datos', k.length===6 && !/=€0/.test(k[0]));
  await p.screenshot({path:'/tmp/web-launcher.png'});

  console.log('\n=== OFFLINE ===');
  await p.reload(); await p.waitForTimeout(900);   // que el sw tome el control
  await p.context().setOffline(true);
  await p.reload().catch(()=>{});
  await p.waitForTimeout(1200);
  const off=await p.evaluate(()=>{
    const h=document.getElementById('shellHome'), a=document.getElementById('shellApp');
    const vis = el => el && el.offsetParent !== null;
    return {titulo:document.title, hub:vis(h), app:vis(a),
            kpis:document.querySelectorAll('#panelKpis .kpi').length};
  }).catch(e=>({error:e.message}));
  console.log('     ' + JSON.stringify(off));
  ck('sigue abriendo sin conexión', off.titulo==='Aresstore Seller Hub' && (off.hub||off.app));
  ck('y conserva los datos guardados', off.kpis===6);
  await p.context().setOffline(false);

  console.log('\nERRORES JS: '+errs.length); errs.forEach(e=>console.log('  '+e));
  console.log('\n######## '+(fails===0&&errs.length===0?'TODO CORRECTO':fails+' fallos / '+errs.length+' errores')+' ########');
  await b.close();
})();
