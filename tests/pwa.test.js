/* =========================================================================
   Accesos · la app instalable, la autoactualización y el modo sin conexión

   Esta suite necesita la app servida por HTTP: el service worker y el modo
   sin conexión no existen sobre file://. Antes había que levantar el servidor
   a mano y por eso se quedaba fuera de `test:all` y nadie la miraba. Ahora se
   levanta ella sola en un puerto libre.

   Distinción que importa: un recurso del PROPIO origen que falla es un fallo
   de la app y pone la suite en rojo. Un recurso EXTERNO que falla (la CDN de
   fuentes) es una nota, no un fallo: la app tiene que funcionar sin él, y en
   este contenedor de pruebas la CDN ni siquiera es alcanzable.
   ========================================================================= */
const {chromium}=require('playwright');
const http=require('http'), fs=require('fs'), path=require('path');

const ROOT=path.resolve(__dirname,'..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json',
            '.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml',
            '.css':'text/css','.csv':'text/csv','.txt':'text/plain'};

function serve(){
  return new Promise(res=>{
    const s=http.createServer((req,rq)=>{
      let f=decodeURIComponent(req.url.split('?')[0]);
      if(f==='/') f='/index.html';
      const full=path.join(ROOT,f);
      if(!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()){
        rq.writeHead(404); return rq.end('no');
      }
      rq.writeHead(200,{'Content-Type':MIME[path.extname(full)]||'application/octet-stream',
                        'Cache-Control':'no-store','Service-Worker-Allowed':'/'});
      fs.createReadStream(full).pipe(rq);
    });
    s.listen(0,'127.0.0.1',()=>res({srv:s, base:'http://127.0.0.1:'+s.address().port+'/'}));
  });
}

let fails=0;
const ck=(l,c,e)=>{if(!c)fails++;console.log('  '+(c?'OK   ':'FALLO')+' '+l+(e!==undefined?'  → '+e:''));};

(async()=>{
  const {srv, base}=await serve();
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1400,height:950}, timezoneId:'Europe/Madrid'});
  const p=await ctx.newPage();
  const errs=[], externos=[], net=[];
  const propio = u => u.indexOf(base)===0;
  /* Durante la prueba sin conexión se cortan a propósito todas las peticiones,
     así que ahí un fallo de red es el resultado esperado, no un defecto. */
  let sinConexion = false;

  p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  /* «Failed to load resource» no dice de qué recurso: el veredicto lo da
     requestfailed, que sí trae la URL y permite separar propio de externo. */
  p.on('console',m=>{ if(m.type()==='error' && m.text().indexOf('Failed to load resource')<0) errs.push('CONSOLE: '+m.text()); });
  p.on('requestfailed',r=>{ if(sinConexion) return; (propio(r.url())?errs:externos).push(r.failure().errorText+' '+r.url()); });
  p.on('response',r=>net.push(r.status()+' '+r.url().split('/').pop()));
  p.on('dialog',d=>d.accept());

  await p.goto(base);
  await p.waitForTimeout(1800);

  console.log('\n=== RECURSOS ===');
  const codes={};
  for(const f of ['index.html','manifest.webmanifest','sw.js','icon-192.png','icon-512.png','icon-180.png','icon-maskable-512.png']){
    codes[f]=await p.evaluate(async f=>{try{const r=await fetch(f,{cache:'no-store'});return r.status;}catch(e){return 0;}},f);
    console.log('     '+codes[f]+'  '+f);
  }
  ck('los 7 archivos del armazón responden 200', Object.values(codes).every(c=>c===200));
  ck('no hay 404', !net.some(n=>n.startsWith('404')), net.filter(n=>n.startsWith('404')).join(', ')||'ninguno');

  console.log('\n=== APP ===');
  ck('arranca en el lanzador', await p.isVisible('#shellHome'));
  ck('las 6 tarjetas con icono', (await p.$$eval('.appcard',e=>e.length))===6);
  ck('el manifest está enlazado como archivo, no como data: URL',
    (await p.getAttribute('link[rel=manifest]','href'))==='manifest.webmanifest');
  ck('apple-touch-icon apunta a archivo', /^icon-180\.png$/.test(await p.getAttribute('link[rel="apple-touch-icon"]','href')));

  console.log('\n=== PWA ===');
  const sw=await p.evaluate(async()=>{
    const r=await navigator.serviceWorker.getRegistration();
    return r ? (r.active?'activo':(r.installing?'instalando':'registrado')) : 'ninguno';
  });
  ck('service worker registrado', sw!=='ninguno', sw);
  const man=await p.evaluate(async()=>{ const r=await fetch('manifest.webmanifest'); return r.json(); });
  console.log('     '+man.name+' | display='+man.display+' | iconos='+man.icons.length);
  ck('manifest válido con icono maskable',
    man.display==='standalone' && man.icons.some(i=>i.purpose==='maskable'),
    'maskable='+(man.icons.some(i=>i.purpose==='maskable')?'sí':'no'));

  /* La identidad de una PWA instalada es su `id` resuelto; si no lo hay, el
     `start_url` resuelto. Hay una app YA instalada en móvil y PC: si esto
     cambiase, el navegador la trataría como una app nueva en vez de como una
     actualización, y los datos viven atados a ese origen. */
  const ident=await p.evaluate(m=>({
    id: new URL(m.id, location.href).href,
    start: new URL(m.start_url, location.href).href,
    scope: new URL(m.scope, location.href).href,
    raiz: new URL('.', location.href).href
  }), man);
  ck('la identidad de la app instalada sigue siendo la raíz del sitio',
    ident.id===ident.raiz && ident.start===ident.raiz && ident.scope===ident.raiz,
    'id='+ident.id+' · start='+ident.start);
  ck('el manifest declara un id explícito, para que no dependa del start_url',
    typeof man.id==='string' && man.id.length>0, man.id);

  console.log('\n=== LOS ICONOS SON LOS BUENOS ===');
  /* En iPhone el icono de la pantalla de inicio venía de un apple-touch-icon
     en data:, que iOS Safari ignora. Comprobamos que ahora es un PNG real y
     que cada icono declarado mide de verdad lo que dice medir. */
  const iconos=await p.evaluate(async list=>{
    const out=[];
    for(const src of list){
      const r=await fetch(src,{cache:'no-store'});
      const bl=await r.blob();
      const bm=await createImageBitmap(bl);
      out.push({src, bytes:bl.size, w:bm.width, h:bm.height});
    }
    return out;
  }, man.icons.map(i=>i.src).concat(['icon-180.png']));
  iconos.forEach(i=>console.log('     '+i.src+'  '+i.w+'×'+i.h+'  '+i.bytes+' B'));
  const dim = s => (iconos.filter(i=>i.src===s)[0]||{});
  ck('icon-192 mide 192×192', dim('icon-192.png').w===192 && dim('icon-192.png').h===192);
  ck('icon-512 mide 512×512', dim('icon-512.png').w===512 && dim('icon-512.png').h===512);
  ck('icon-maskable-512 mide 512×512', dim('icon-maskable-512.png').w===512);
  ck('el apple-touch-icon de iPhone mide 180×180 y no está vacío',
    dim('icon-180.png').w===180 && dim('icon-180.png').bytes>2000,
    dim('icon-180.png').w+'×'+dim('icon-180.png').h+' · '+dim('icon-180.png').bytes+' B');

  console.log('\n=== FUNCIONA IGUAL QUE ANTES ===');
  await p.click('.appcard:not(.soon)'); await p.waitForTimeout(500);
  ck('se abre Gestión Seller', await p.isVisible('#shellApp'));
  await p.evaluate(()=>document.querySelector('.nav-item[data-view="datos"]').click());
  await p.waitForTimeout(300);
  await p.click('button:has-text("Cargar datos de ejemplo")'); await p.waitForTimeout(1500);
  await p.evaluate(()=>document.querySelector('.nav-item[data-view="panel"]').click());
  await p.waitForTimeout(500);
  const k=await p.$$eval('#panelKpis .kpi',e=>e.map(x=>x.querySelector('.k-name').textContent+'='+x.querySelector('.k-val').textContent));
  k.forEach(x=>console.log('     '+x));
  ck('el panel calcula con datos', k.length===6 && !/=€0/.test(k[0]));

  console.log('\n=== AUTOACTUALIZACIÓN ===');
  /* Lo que dispara la actualización en los dispositivos es que build.sh
     escriba un identificador de caché nuevo en cada compilación. Si dos
     compilaciones distintas comparten identificador, el móvil se queda con la
     versión vieja para siempre y nadie se entera. */
  const cacheId=await p.evaluate(async()=>{
    const r=await fetch('sw.js',{cache:'no-store'}); const t=await r.text();
    return (t.match(/const CACHE\s*=\s*'([^']+)'/)||[])[1];
  });
  ck('el service worker lleva identificador de caché sellado con la compilación',
    /^aresstore-[\d.]+-\d{12}$/.test(cacheId||''), cacheId);
  const cacheados=await p.evaluate(async()=>{
    const ks=await caches.keys();
    if(!ks.length) return [];
    return (await (await caches.open(ks[0])).keys()).map(r=>r.url.split('/').pop()||'raíz');
  });
  console.log('     en caché: '+cacheados.join(', '));
  ck('el armazón entero está en caché, no solo el HTML',
    ['index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-180.png','icon-maskable-512.png']
      .every(f=>cacheados.indexOf(f)>=0),
    cacheados.length+' entradas');

  console.log('\n=== SIN CONEXIÓN ===');
  /* La bandera se levanta antes de la recarga a propósito: al recargar, el
     service worker se reinstala y su addAll compite con la navegación, así que
     el armazón sale abortado sin que pase nada malo. Que la caché está bien lo
     demuestran las comprobaciones de abajo, no la ausencia de abortos aquí. */
  sinConexion = true;
  await p.reload(); await p.waitForTimeout(900);   // que el sw tome el control
  await ctx.setOffline(true);
  await p.reload().catch(()=>{});
  await p.waitForTimeout(1200);
  const off=await p.evaluate(()=>{
    const vis = el => el && el.offsetParent !== null;
    return {titulo:document.title, hub:vis(document.getElementById('shellHome')),
            app:vis(document.getElementById('shellApp')),
            kpis:document.querySelectorAll('#panelKpis .kpi').length};
  }).catch(e=>({error:e.message}));
  console.log('     ' + JSON.stringify(off));
  ck('sigue abriendo sin conexión', off.titulo==='Aresstore Seller Hub' && (off.hub||off.app));
  ck('y conserva los datos guardados', off.kpis===6);
  const iconOff=await p.evaluate(async()=>{try{const r=await fetch('icon-180.png');return r.ok;}catch(e){return false;}});
  ck('el icono se sirve desde la caché sin conexión', iconOff===true);
  await ctx.setOffline(false);
  sinConexion = false;

  if(externos.length){
    console.log('\n=== EXTERNOS QUE NO CARGARON (nota, no fallo) ===');
    [...new Set(externos.map(e=>e.split(' ')[0]+' '+e.split('/')[2]))].forEach(e=>console.log('     '+e));
    console.log('     La app no depende de ellos para funcionar; solo cambia la tipografía.');
  }
  console.log('\nERRORES DEL PROPIO ORIGEN: '+errs.length); errs.forEach(e=>console.log('  '+e));
  console.log('\n######## '+(fails===0&&errs.length===0?'TODO CORRECTO':fails+' fallos / '+errs.length+' errores')+' ########');
  await b.close(); srv.close();
  process.exit(fails===0&&errs.length===0 ? 0 : 1);
})();
