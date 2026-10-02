/* =========================================================================
   Las costuras · que diez carriles puedan trabajar a la vez sin pisarse

   Esto no prueba ninguna funcionalidad del hub. Prueba el andamio: que un
   módulo nuevo `src/2x-*.js` entre solo en la compilación, y que desde él se
   pueda registrar un informe, una vista, una clave de la base, un preproceso
   de texto, un estilo y una exportación SIN abrir ninguno de los ficheros
   compartidos.

   Por qué merece una suite propia: si una de estas costuras está rota, no se
   nota hasta la integración, cuando diez ramas ya se han construido encima. Y
   ahí cuesta diez veces más. Cada comprobación se ha visto fallar antes de
   darla por buena.

   El módulo de prueba se crea al empezar y se borra al terminar, pase lo que
   pase. Si esta suite deja un `src/29-zz-costura-tmp.js` detrás, es que se
   murió a medias: bórralo a mano y vuelve a correrla.
   ========================================================================= */
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const TMP = path.join(RAIZ, 'src', '29-zz-costura-tmp.js');
const MARCA = 'COSTURA_TMP_MARCA_UNICA_9F3A';

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const compilar = () => spawnSync('bash', ['build.sh'], {cwd:RAIZ, encoding:'utf8'});

/* El módulo que un carril escribiría. Usa las seis funciones del registro. */
const MODULO = `/* ${MARCA} · módulo temporal de la suite de costuras */
window.__costuraRenders = 0;

registrarEstilo('.costura-prueba{color:rgb(186, 218, 85)}');

registrarInforme({id:'costuratmp', label:'Informe de prueba de costura', en:'Seam Test',
  path:'—', feeds:'nada, es de prueba',
  hdr:['costuracolumna'], onlyEn:true, fields:{}, sig:()=>false});

registrarClaveDB('costuraClave', {saludo:'hola', lista:[]});

registrarPreproceso(function(txt){
  if(String(txt).indexOf('@@PREAMBULO@@')!==0) return txt;
  return {texto: String(txt).split('\\n').slice(1).join('\\n'),
          nota: 'quitada 1 línea de preámbulo antes de la cabecera'};
}, 'preambulo-de-prueba');

registrarVista({id:'costuratmp', etiqueta:'Costura', icono:'✚', grupo:'Riesgo',
  crumb:'Prueba de costura',
  html:'<div class="card"><h2 class="costura-prueba" id="costuraTitulo">Vista de costura</h2>'+
       '<div id="costuraCuenta">0</div></div>',
  render:function(){ window.__costuraRenders++;
    var el=document.getElementById('costuraCuenta');
    if(el) el.textContent=String(window.__costuraRenders); }});

registrarExportacion('costuratmp','Exportar costura',function(){ window.__costuraExport=true; });
`;

const limpiar = () => { try{ fs.unlinkSync(TMP); }catch(e){} };

(async () => {
try{
  /* ── COS-A · build.sh recoge los módulos nuevos él solo ─────────────────── */
  console.log('\n=== COS-A · UN MÓDULO 2x NUEVO ENTRA SIN TOCAR build.sh ===');

  const antes = fs.readFileSync(path.join(RAIZ,'index.html'),'utf8');
  check('antes de crear el módulo, su marca no está en el bundle',
    antes.indexOf(MARCA) < 0, 'limpio');

  fs.writeFileSync(TMP, MODULO);
  const c1 = compilar();
  const bundle = fs.readFileSync(path.join(RAIZ,'index.html'),'utf8');
  check('build.sh compila con el módulo nuevo', c1.status===0, 'salida '+c1.status);
  check('y el módulo ha entrado en el bundle sin editar la lista a mano',
    bundle.indexOf(MARCA) >= 0, bundle.indexOf(MARCA)>=0 ? 'incluido' : 'NO incluido');

  /* El orden importa: los 2x tienen que ir DESPUÉS del registro (si no, las
     funciones no existen) y ANTES de 13-render (si no, el botón de navegación
     llega tarde y nadie le engancha el escuchador). */
  check('va después de 19-registro.js y antes de 13-render.js',
    bundle.indexOf('Registro de extensiones') < bundle.indexOf(MARCA) &&
    bundle.indexOf(MARCA) < bundle.indexOf('function refreshAll'),
    'orden correcto');

  /* En la otra dirección: un 2x con un error de sintaxis tiene que tumbar la
     compilación. Si no, la comprobación final de build.sh no está mirando los
     módulos nuevos y un carril podría subir código que no arranca. */
  fs.writeFileSync(TMP, MODULO + '\nfunction roto( { // falta de todo\n');
  const c2 = compilar();
  check('un módulo 2x con sintaxis rota tumba la compilación',
    c2.status !== 0, 'salida '+c2.status);

  fs.writeFileSync(TMP, MODULO);
  const c3 = compilar();
  check('y al arreglarlo vuelve a compilar', c3.status===0, 'salida '+c3.status);

  /* ── el resto, en el navegador ──────────────────────────────────────────── */
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { const t=m.text();
    if(m.type()==='error' && t.indexOf('ERR_')<0 && t.indexOf('Failed to load resource')<0) errors.push('CONSOLE: '+t); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.join(RAIZ,'index.html'));
  await page.waitForTimeout(800);

  console.log('\n=== COS-B · registrarInforme ===');
  const b = await page.evaluate(()=>{
    const def = REPORTS.filter(r=>r.id==='costuratmp')[0];
    let err = '';
    try{ registrarInforme({id:'costuratmp', label:'duplicado'}); }
    catch(e){ err = e.message; }
    return {hay:!!def, etiqueta:def?def.label:'', err, cuantos:REPORTS.filter(r=>r.id==='costuratmp').length};
  });
  check('el informe registrado está en REPORTS', b.hay, b.etiqueta);
  check('registrar dos veces el mismo id falla ruidosamente',
    /ya hay un informe/i.test(b.err), b.err || 'no lanzó nada');
  check('y el duplicado no se ha colado en REPORTS', b.cuantos===1, b.cuantos+' entrada(s)');

  console.log('\n=== COS-C · registrarVista ===');
  const c = await page.evaluate(()=>{
    const sec = document.getElementById('view-costuratmp');
    const btn = document.querySelector('.nav-item[data-view="costuratmp"]');
    let grupo = '';
    if(btn){ let n=btn.previousElementSibling;
      while(n && !n.classList.contains('nav-label')) n=n.previousElementSibling;
      grupo = n ? n.textContent.trim() : ''; }
    return {sec:!!sec, btn:!!btn, grupo, crumb:(typeof CRUMBS==='object'?CRUMBS['costuratmp']:undefined),
            renders: window.__costuraRenders};
  });
  check('la sección existe', c.sec);
  check('el botón de navegación existe', c.btn);
  check('y está dentro del grupo que pidió', c.grupo==='Riesgo', c.grupo || '(ninguno)');
  check('la miga de pan está enganchada', c.crumb==='Prueba de costura', String(c.crumb));
  check('el render ha entrado en refreshAll', c.renders>0, c.renders+' pasadas');

  /* Navegar de verdad: la vista se enseña y el render vuelve a pasar. Si esto
     falla, la vista existe pero no se puede abrir.

     Se navega con `go()`, que es la API de navegación de la propia aplicación,
     y no con un click de Playwright sobre el botón. No es un atajo: a esta
     anchura la barra lateral va plegada y TODOS los botones de navegación —
     también los escritos a mano en 01-head.html, comprobado con
     `cumplimiento` — miden 0×0, así que un click real fallaría por la barra,
     no por la costura. `go()` hace `b.click()` sobre el botón, de modo que
     esto sigue demostrando lo que importa: que 13-render le enganchó su
     escuchador al botón que insertó el registro. */
  await page.evaluate(()=>go('costuratmp'));
  await page.waitForTimeout(400);
  const nav = await page.evaluate(()=>({
    visible: document.getElementById('view-costuratmp').classList.contains('active'),
    cuenta: document.getElementById('costuraCuenta').textContent,
    renders: window.__costuraRenders
  }));
  check('al pulsar el botón se abre la vista', nav.visible);
  check('y el render se ejecuta otra vez al navegar', nav.renders>c.renders,
    c.renders+' → '+nav.renders);
  check('lo que pinta el render llega a la pantalla', nav.cuenta===String(nav.renders),
    'en pantalla '+nav.cuenta);

  console.log('\n=== COS-D · registrarClaveDB ===');
  const d = await page.evaluate(()=>{
    const enBaseViva = DB.costuraClave !== undefined;
    const enBaseNueva = blankDB().costuraClave !== undefined;
    /* Migración: una base guardada ANTES de que existiera la clave. */
    let migrada = false;
    try{
      const vieja = JSON.stringify({v:'0.3', products:[], imports:{}});
      localStorage.setItem(STORE_KEY, vieja);
      migrada = loadDB().costuraClave !== undefined;
    }catch(e){}
    /* Copia y restauración: el mismo camino que exportData / importData. */
    DB.costuraClave = {saludo:'adiós', lista:[1,2,3]};
    const copia = JSON.parse(JSON.stringify(Object.assign({}, DB, {app:'Aresstore Seller Hub'})));
    const enLaCopia = copia.costuraClave && copia.costuraClave.saludo==='adiós';
    DB.costuraClave = {saludo:'hola', lista:[]};
    Object.assign(DB, copia);
    const vuelve = DB.costuraClave && DB.costuraClave.lista.length===3;
    return {enBaseViva, enBaseNueva, migrada, enLaCopia, vuelve};
  });
  check('la clave está en la base viva', d.enBaseViva);
  check('y en toda base nueva (blankDB)', d.enBaseNueva);
  check('una base antigua sin la clave la recibe al cargar (loadDB)', d.migrada);
  check('la clave viaja dentro de la copia de seguridad', d.enLaCopia);
  check('y vuelve entera al restaurar', d.vuelve);

  console.log('\n=== COS-E · registrarPreproceso ===');
  const e = await page.evaluate(async ()=>{
    const cabecera = 'costuracolumna\tvalor';
    const conPreambulo = '@@PREAMBULO@@ aviso de Amazon\n' + cabecera + '\nA\t1';
    const f = new File([conPreambulo], 'costura.txt', {type:'text/plain'});
    const txt = await readSmart(f);
    const primera = String(txt).split('\n')[0];
    const nota = (REGISTRO.notas||[]).filter(n=>n.etiqueta==='preambulo-de-prueba')[0];
    /* Y que parseDelimited vea ya la cabecera buena, que es el objetivo. */
    const p = parseDelimited(txt);
    return {primera, nota: nota?nota.nota:'', cabecera:(p.headers||[])[0]};
  });
  check('readSmart aplica el preproceso antes de parsear',
    e.primera==='costuracolumna\tvalor', JSON.stringify(e.primera).slice(0,60));
  check('parseDelimited ya ve la cabecera buena', /costuracolumna/i.test(e.cabecera||''), e.cabecera);
  check('y el preproceso declara qué ha hecho', /preámbulo/i.test(e.nota), e.nota || '(no lo dice)');

  console.log('\n=== COS-F · registrarEstilo ===');
  const f6 = await page.evaluate(()=>{
    const hay = document.querySelectorAll('style[data-registro]').length;
    const el = document.getElementById('costuraTitulo');
    return {hay, color: el ? getComputedStyle(el).color : ''};
  });
  check('el estilo se ha inyectado sin tocar 01-head.html', f6.hay>0, f6.hay+' bloque(s)');
  check('y la regla se aplica de verdad en pantalla',
    f6.color.replace(/\s/g,'')==='rgb(186,218,85)', f6.color);

  console.log('\n=== COS-G · registrarExportacion ===');
  await page.evaluate(()=>go('datos'));
  await page.waitForTimeout(400);
  const g = await page.evaluate(()=>{
    const b = document.querySelector('#view-datos button[data-export="costuratmp"]');
    if(b) b.click();
    return {hay:!!b, etiqueta:b?b.textContent:'', disparado: window.__costuraExport===true};
  });
  check('el botón aparece en Datos › Salida', g.hay, g.etiqueta);
  check('y al pulsarlo se ejecuta la exportación', g.disparado);

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  await browser.close();

}catch(err){
  fails++;
  console.log('  FALLO la suite se ha caído  → ' + (err && err.message));
}finally{
  limpiar();
  const fin = compilar();
  if(fin.status!==0){ fails++; console.log('  FALLO no he podido dejar el bundle limpio al terminar'); }
}

console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
process.exit(fails===0 ? 0 : 1);
})();
