/* ═══════════════════════════════════════════════════════════════════════════
   CARRIL 1 · IMPORTADOR
   Un informe que entra «en verde» con las columnas cruzadas o con filas comidas
   es peor que uno rechazado

   Todo lo que hay aquí se ha visto FALLAR primero contra el árbol sin el
   arreglo, y fallar con un mensaje que dice qué falta —no con un stack—. Las
   fixtures reproducen el formato literal de cada fichero: marca de orden de
   bytes, fin de línea, salto final o su ausencia, separador, coma decimal y
   espacios al final de la cabecera.

   Nota de privacidad: aquí no hay un solo dato real del negocio. Todas las
   cifras salen de las fixtures sintéticas y su aritmética está escrita a mano
   en el comentario de cada bloque.
   ═══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');
const { execFileSync } = require('child_process');

const FIX = path.resolve(__dirname, 'fixtures-importador');
try{ execFileSync(process.execPath, [path.join(__dirname,'mkfixtures-importador.js')], {stdio:'ignore'}); }catch(e){}

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t) => typeof a==='number' && isFinite(a) && Math.abs(a-b) <= (t===undefined?0.005:t);
const f = n => path.join(FIX, n);

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { const t = m.text();
    if(m.type()==='error' && t.indexOf('ERR_')<0 && t.indexOf('Failed to load resource')<0) errors.push('CONSOLE: '+t); });
  page.on('dialog', d => d.accept());
  /* Toda lectura del navegador va envuelta: sin el arreglo, la función que la
     prueba busca no existe, y lo que tiene que salir es un FALLO con el mensaje
     de qué falta, no un stack que aborte la suite y esconda las demás. */
  const ev = async (fn, arg) => {
    try{ return await page.evaluate(fn, arg); }
    catch(e){ return {__error: String((e && e.message) || e).split('\n')[0]}; }
  };
  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);
  /* A 1440 px la barra lateral va plegada y los botones de navegación miden
     0×0: se navega llamando a `go()`, nunca haciendo clic. */
  await ev(()=>go('datos'));
  await page.waitForTimeout(200);

  const limpiar = async () => {
    await ev(()=>{ DB.imports={}; DB.mappings={};
      try{ REGISTRO.notas.length = 0; }catch(e){}
      DB.history = (typeof blankDB==='function' ? blankDB().history : DB.history);
      saveDB(); document.getElementById('fileList').innerHTML=''; refreshAll(); });
    await page.waitForTimeout(150);
  };
  /* Importa uno o varios ficheros, de uno en uno: en lote se esconde que un
     informe se identifique como otro, porque el segundo tapa al primero. */
  /* Chromium NO dispara `change` si se vuelve a elegir exactamente el mismo
     fichero que ya estaba en el campo, así que se vacía antes de cada envío.
     Es una maña del navegador, no del hub: sin ella, la prueba de reimportar el
     mismo fichero mediría que no ha pasado nada porque nunca llegó a pasar. */
  const soltar = async (nombre) => {
    await page.setInputFiles('#csvFile', []);
    await page.setInputFiles('#csvFile', f(nombre));
    await page.waitForTimeout(1100);
  };
  const importar = async (...nombres) => {
    for(const n of nombres){ await soltar(n); }
    return ev(()=>{
      const out = {items:[], imports:{}, notas:[]};
      out.items = [...document.querySelectorAll('#fileList .fileitem')].map(e=>({
        dot: e.querySelector('.f-dot.ok') ? 'ok' : e.querySelector('.f-dot.err') ? 'err' : 'wait',
        meta: (e.querySelector('.f-meta')||{textContent:''}).textContent.replace(/\s+/g,' '),
        btn : (e.querySelector('button')||{textContent:''}).textContent }));
      Object.keys(DB.imports).forEach(k=>{ const i = DB.imports[k];
        out.imports[k] = {count:i.count, fusion:i.fusion||null,
          ficheros:(i.ficheros||[]).map(x=>({fid:x.fid, nombre:x.nombre, brutas:x.brutas,
            nuevas:x.nuevas, duplicadas:x.duplicadas, degeneradas:x.degeneradas,
            avisos:(x.avisos||[]).length}))}; });
      try{ out.notas = REGISTRO.notas.map(n=>n.nota); }catch(e){}
      return out;
    }).then(r => (r && r.__error)
      ? {items:[{dot:'?', meta:'no se ha podido leer la pantalla: '+r.__error, btn:''}],
         imports:{}, notas:[], __error:r.__error}
      : r);
  };

  /* ═══════════════════════════════════════════════════════════════════════
     IMP-A · VARIOS FICHEROS DEL MISMO INFORME SON UN CONJUNTO, NO EL ÚLTIMO
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== IMP-A · DOS TROZOS DE «TODOS LOS PEDIDOS» SE FUSIONAN ===');
  /* Las ocho líneas de las dos fixtures y lo que tiene que salir, a mano:
       A: OI-1001, OI-1002 (17-ago, 10,00 €), OI-1003, «0» (pedido …0004)
       B: OI-1003 (idéntica), OI-1002 (25-ago, 12,00 €), «0» (pedido …0005), OI-1004
     8 líneas leídas →
       · OI-1003 de B es un duplicado exacto de la de A
       · OI-1002 aparece dos veces con contenido distinto: gana la de 25-ago
       · los dos «0» son dos pedidos distintos y NO se funden
     = 6 filas únicas · 2 repetidas · 2 con clave degenerada */
  await limpiar();
  const A = await importar('pedidos-a.txt','pedidos-b.txt');
  const oi = Object.assign({count:0, fusion:null, ficheros:[]}, A.imports.orders||{});
  check('los dos ficheros entran en el mismo informe, no se pisan',
    (oi.ficheros||[]).length===2, (oi.ficheros||[]).length+' fichero(s) registrado(s) · sin la fusión el segundo borra al primero y quedan 4 filas');
  check('las 8 líneas leídas dejan 6 filas únicas',
    oi.count===6, oi.count+' filas · esperadas 6');
  check('y se declara de dónde sale ese 6',
    oi.fusion && oi.fusion.brutas===8 && oi.fusion.duplicadas===2,
    JSON.stringify(oi.fusion));
  check('el primer fichero declara sus 4 filas nuevas y ninguna repetida',
    !!oi.ficheros[0] && oi.ficheros[0].nuevas===4 && oi.ficheros[0].duplicadas===0,
    oi.ficheros[0] ? JSON.stringify(oi.ficheros[0]) : 'el informe no guarda de qué fichero viene cada fila');
  check('el segundo declara 2 nuevas y 2 ya vistas',
    !!oi.ficheros[1] && oi.ficheros[1].nuevas===2 && oi.ficheros[1].duplicadas===2,
    oi.ficheros[1] ? JSON.stringify(oi.ficheros[1]) : 'solo hay '+oi.ficheros.length+' aportación(es): el segundo fichero ha borrado al primero');

  console.log('\n=== IMP-B · LA CLAVE «0» NO IDENTIFICA NADA ===');
  /* Deduplicar por `order-item-id` sin mirar el valor fundiría las dos líneas
     con «0» —que son dos pedidos distintos— en una sola. El total bajaría a 5
     y nadie vería el aviso: un número redondo, creíble y falso. */
  const degen = await ev(()=>{
    const filas = imp('orders');
    const ceros = filas.filter(r=>String(r['orderitemid']||'')==='0');
    return {total:filas.length, ceros:ceros.length,
            pedidos:[...new Set(ceros.map(r=>r['amazonorderid']))].length,
            declarado:(DB.imports.orders.fusion||{}).degeneradas};
  });
  check('las dos líneas con identificador «0» siguen siendo dos',
    degen.ceros===2 && degen.pedidos===2,
    degen.ceros+' fila(s) · '+degen.pedidos+' pedido(s) distinto(s) · fundirlas se come una venta real');
  check('y el hub dice cuántas claves venían degeneradas',
    degen.declarado===2, degen.declarado+' declaradas · esperadas 2');

  console.log('\n=== IMP-C · CON LA MISMA CLAVE, MANDA LA ACTUALIZACIÓN MÁS RECIENTE ===');
  const gana = await ev(()=>{
    const r = imp('orders').filter(x=>String(x['orderitemid'])==='OI-1002')[0] || {};
    return {n:imp('orders').filter(x=>String(x['orderitemid'])==='OI-1002').length,
            precio:r['itemprice'], upd:r['lastupdateddate']};
  });
  check('OI-1002 queda una sola vez', gana.n===1, gana.n+' fila(s)');
  check('y con el importe de la versión del 25-ago (12,00 €), no la del 17 (10,00 €)',
    gana.precio==='12.00', gana.precio+' € · actualizada el '+gana.upd);

  console.log('\n=== IMP-D · UN FICHERO SIN SALTO FINAL NO PIERDE SU ÚLTIMA LÍNEA ===');
  /* `pedidos-b.txt` termina sin salto de línea, como cinco de los ficheros que
     sirve Amazon. Su última línea es OI-1004. */
  const ultima = await ev(()=>imp('orders').filter(r=>String(r['orderitemid'])==='OI-1004').length);
  check('la última línea del fichero sin salto final entra igual', ultima===1,
    ultima+' fila(s) OI-1004 · si se trocea mal, esta es la que desaparece');

  console.log('\n=== IMP-E · UN FICHERO CON BOM Y OTRO SIN ÉL SON EL MISMO INFORME ===');
  /* `pedidos-a.txt` no lleva marca de orden de bytes y `pedidos-b.txt` sí. Si
     la identidad de una fila se calculara sobre el texto crudo, la primera
     columna de uno de los dos no casaría nunca y las filas repetidas entrarían
     dos veces: saldrían 8 en vez de 6. */
  check('la marca de orden de bytes no duplica ninguna fila', oi.count===6,
    oi.count+' filas · con el BOM rompiendo la primera columna saldrían 8');

  console.log('\n=== IMP-F · REIMPORTAR EL MISMO FICHERO NO CAMBIA NADA ===');
  const antes = await ev(()=>({n:imp('orders').length, f:(DB.imports.orders.ficheros||[]).length}));
  await soltar('pedidos-a.txt');
  const despues = await ev(()=>({n:imp('orders').length, f:(DB.imports.orders.ficheros||[]).length,
    meta:[...document.querySelectorAll('#fileList .fileitem')].pop().querySelector('.f-meta').textContent.replace(/\s+/g,' ')}));
  check('las filas no se mueven', antes.n===despues.n && despues.n===6,
    antes.n+' → '+despues.n);
  check('y no aparece un tercer fichero', despues.f===2, despues.f+' fichero(s)');
  check('y la pantalla lo dice en vez de fingir que ha importado algo',
    /ya estaba importado/i.test(despues.meta), despues.meta.slice(0,80));

  console.log('\n=== IMP-G · QUITAR UN FICHERO DEJA EXACTAMENTE LOS DEMÁS ===');
  /* Quitando el fichero A quedan las 4 líneas del B: OI-1003, OI-1002 (25-ago),
     el «0» del pedido …0005 y OI-1004. */
  const quitado = await ev(()=>{
    if(typeof quitarFicheroImportado!=='function') throw new Error('no existe quitarFicheroImportado(): no se puede quitar un fichero suelto');
    if(!DB.imports.orders || !(DB.imports.orders.ficheros||[]).length) throw new Error('el informe no guarda sus ficheros: no hay ninguno que quitar');
    const fid = DB.imports.orders.ficheros[0].fid;
    quitarFicheroImportado('orders', fid);
    return {n:imp('orders').length, f:(DB.imports.orders.ficheros||[]).length,
            ids:imp('orders').map(r=>r['orderitemid']).sort().join(',')};
  });
  check('se quedan las 4 filas del fichero que sigue cargado', quitado.n===4,
    quitado.__error ? quitado.__error : (quitado.n+' filas · '+quitado.ids));
  check('y el informe pasa a tener un solo fichero', quitado.f===1,
    quitado.__error ? quitado.__error : (quitado.f+' fichero(s)'));
  const vuelta = await ev(()=>{
    if(typeof quitarFicheroImportado!=='function') throw new Error('no existe quitarFicheroImportado()');
    if(!DB.imports.orders || !(DB.imports.orders.ficheros||[]).length) throw new Error('el informe no guarda sus ficheros');
    const fid = DB.imports.orders.ficheros[0].fid;
    quitarFicheroImportado('orders', fid);
    return {hay:!!DB.imports.orders, n:imp('orders').length};
  });
  check('quitar el último deja el informe sin cargar, no a medias',
    vuelta.hay===false && vuelta.n===0,
    vuelta.__error ? vuelta.__error : JSON.stringify(vuelta));

  /* ═══════════════════════════════════════════════════════════════════════
     IMP-H · DEVOLUCIONES · dos ficheros, una repetida
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== IMP-H · DEVOLUCIONES EN DOS FICHEROS ===');
  /* A: LPN-A, LPN-B · B: LPN-B (idéntica), LPN-C, LPN-D
     5 líneas leídas → 4 únicas · 1 repetida. Y `devoluciones-a.txt` no termina
     en salto de línea, así que LPN-B es justo la que se perdería. */
  await limpiar();
  const DEV = await importar('devoluciones-a.txt','devoluciones-b.txt');
  const dv = Object.assign({count:0, fusion:null}, DEV.imports.returns||{});
  check('5 líneas leídas dejan 4 devoluciones únicas', dv.count===4,
    dv.count+' · esperadas 4');
  check('la repetida se cuenta y se dice', dv.fusion && dv.fusion.duplicadas===1,
    JSON.stringify(dv.fusion));
  const lpn = await ev(()=>imp('returns').map(r=>r['licenseplatenumber']).sort().join(','))
    .then(x => typeof x==='string' ? x : '(no se ha podido leer: '+(x&&x.__error)+')');
  check('y están las cuatro matrículas, cada una una vez', lpn==='LPN-A,LPN-B,LPN-C,LPN-D', lpn);

  /* ═══════════════════════════════════════════════════════════════════════
     IMP-I · IVA · fusión y el país que `vatReport()` recibe
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== IMP-I · IVA · DOS FICHEROS Y EL PAÍS BIEN LEÍDO ===');
  /* iva-a: EV0001, EV0002 · iva-b: las mismas dos + EV0003, EV0004, EV0005.
     7 líneas leídas → 5 únicas · 2 repetidas.
     Base 100+50+200+100+100 = 550,00 € · IVA 10+11+42+6+8 = 77,00 €
     Diferencia contra el tipo general de cada país:
       ES 100 × (21−10)/100 = 11,00   PT 100 × (23−6)/100 = 17,00
       PL 100 × (23−8)/100  = 15,00   → 43,00 € en total */
  await limpiar();
  const IV = await importar('iva-a.txt','iva-b.txt');
  const iv = Object.assign({count:0, fusion:null}, IV.imports.vat||{});
  check('7 líneas leídas dejan 5 transacciones únicas', iv.count===5, iv.count+' · esperadas 5');
  check('las 2 repetidas se declaran', iv.fusion && iv.fusion.duplicadas===2, JSON.stringify(iv.fusion));
  const V = await ev(()=>{ try{ const v = vatReport();
      return {rows:v.rows, ventas:v.ventas, base:+v.base.toFixed(2), vat:+v.vat.toFixed(2),
              dif:+v.diferencia.toFixed(2), paises:Object.keys(v.porPais).sort().join(',')};
    }catch(e){ return {error:e.message}; } });
  check('vatReport() ve las 5 filas fusionadas', V.rows===5, JSON.stringify(V));
  check('la base suma 550,00 € y el IVA 77,00 €', near(V.base,550) && near(V.vat,77),
    V.base+' € de base · '+V.vat+' € de IVA');
  /* La prueba que importa: `TAXABLE_JURISDICTION` trae el nombre del país en
     inglés y `vatReport()` se queda con sus dos primeras letras. Leyendo esa
     columna, España es «SP», Portugal y Polonia son las dos «PO», y ninguno de
     esos códigos tiene tipo general: la diferencia sale 0,00 € y la pantalla no
     avisa de nada. Hay que leer `SALE_ARRIVAL_COUNTRY`, que trae el ISO. */
  check('los países son ES, IT, PL y PT, no «SP», «IT» y dos veces «PO»',
    V.paises==='ES,IT,PL,PT', V.paises+' · con TAXABLE_JURISDICTION salen SP/IT/PO y PO tapa a dos países distintos');
  check('y la diferencia de IVA sale 43,00 €, no 0,00 €', near(V.dif,43),
    V.dif+' € · sin el código ISO no hay tipo general con el que comparar y el detector se queda mudo');

  /* ═══════════════════════════════════════════════════════════════════════
     IMP-J · PREÁMBULO ANTES DE LA CABECERA
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== IMP-J · SIETE LÍNEAS DE AVISO ANTES DE LA CABECERA ===');
  /* La fixture lleva 7 líneas de preámbulo, cada una UNA celda entrecomillada
     con comas dentro, y luego una cabecera de 8 columnas y 3 filas de datos. */
  await limpiar();
  const PRE = await importar('preambulo.csv');
  check('se dice cuántas líneas se han saltado, no se hace en silencio',
    PRE.notas.length===1 && /7 líneas de preámbulo/.test(PRE.notas[0]),
    JSON.stringify(PRE.notas));
  const it0 = PRE.items[0] || {meta:'(no hay ninguna línea de fichero en pantalla)', dot:'?'};
  check('y el fichero se lee con sus 8 columnas y sus 3 filas',
    /8 columnas/.test(it0.meta) && /3 filas/.test(it0.meta), it0.meta.slice(0,90));
  check('no se traga como si tal cosa un informe que no reconoce',
    it0.dot!=='ok' && /no lo reconozco/i.test(it0.meta), it0.dot+' · '+it0.meta.slice(0,60));
  const notaEnPantalla = await ev(()=>{
    const c = document.getElementById('impFicheros');
    return c ? c.textContent.replace(/\s+/g,' ') : '(no existe el panel de ficheros en Datos)';
  }).then(x => typeof x==='string' ? x : '(no se ha podido leer: '+(x&&x.__error)+')');
  check('la nota sale en la pantalla de Datos, no solo en la consola',
    /preámbulo/.test(notaEnPantalla), notaEnPantalla.slice(0,100) || '(el panel no existe)');

  /* ═══════════════════════════════════════════════════════════════════════
     IMP-K · «;», COMA DECIMAL, EURO Y ESPACIO FINAL EN LA CABECERA
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== IMP-K · PUNTO Y COMA, COMA DECIMAL Y UNA CABECERA CON ESPACIO FINAL ===');
  /* Gasto: 1,50 + 2,25 + 1.234,56 = 1.238,31 €
     Ventas: 10,00 + 0,00 + 2.000,00 = 2.010,00 € */
  await limpiar();
  const PUB = await importar('publicidad-es.csv');
  const pb = Object.assign({count:0}, PUB.imports.searchterm||{});
  check('el CSV con «;» se reconoce y entra entero', pb.count===3, pb.count+' filas · esperadas 3');
  const sumas = await ev(()=>{ try{
      const R = imp('searchterm');
      return {gasto:+R.reduce((a,r)=>a+toNum(gv(r,'_spend')),0).toFixed(2),
              ventas:+R.reduce((a,r)=>a+toNum(gv(r,'_sales')),0).toFixed(2),
              term:gv(R[0],'_term')};
    }catch(e){ return {error:e.message}; } });
  check('los importes con coma decimal y símbolo de euro suman 1.238,31 €',
    near(sumas.gasto,1238.31), sumas.gasto+' € · leyendo «€1.234,56» como 1,23 € saldrían 3,75 €');
  check('y las ventas atribuidas suman 2.010,00 €', near(sumas.ventas,2010), sumas.ventas+' €');
  /* La cabecera «Coste publicitario de las ventas (ACOS) total » termina en
     espacio, igual que en el fichero real. Ningún alias anclado puede aplicarse
     sobre el nombre sin recortar. */
  const espacios = await ev(()=>{
    const H = ['sku ','order-item-id ','Coste publicitario de las ventas (ACOS) total '];
    const norm = H.map(normHdr);
    return {norm, casa:/^sku$/.test(norm[0]), clave:norm[1]==='orderitemid'};
  });
  check('un nombre de columna con espacio final sigue casando con un alias ^…$',
    espacios.casa && espacios.clave, JSON.stringify(espacios.norm));

  /* ═══════════════════════════════════════════════════════════════════════
     IMP-L · C3 · CABECERAS EN OTRO IDIOMA: NUNCA EN SILENCIO
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== IMP-L · UN INFORME EN ITALIANO NO ENTRA SIN CONFIRMAR ===');
  /* La fixture italiana trae `spese-di-spedizione` (3,99 €) ANTES de
     `prezzo-articolo` (11,99 €…). Ningún alias reconoce esos nombres, así que
     el importe de la venta se elegiría por la forma del contenido, y entre
     columnas de dinero la segunda pasada coge la primera: el gasto de envío. */
  await limpiar();
  const IT = await importar('pedidos-italiano.txt');
  const iti = IT.items[0] || {meta:'(no hay línea de fichero)', dot:'?', btn:''};
  check('no se importa en verde', iti.dot!=='ok' && !IT.imports.orders,
    iti.dot+' · '+(IT.imports.orders? IT.imports.orders.count+' filas importadas' : 'sin importar'));
  check('se ofrece asignar las columnas a mano', /revisar|asignar|completar/i.test(iti.btn),
    JSON.stringify(iti.btn));
  check('y el mensaje dice QUÉ columna no se ha entendido, no solo que hay un problema',
    /Importe de la venta/.test(iti.meta) && /spese|prezzo/.test(iti.meta), iti.meta.slice(0,130));

  console.log('\n=== IMP-L2 · CONFIRMADO UNA VEZ, NO SE VUELVE A PREGUNTAR ===');
  /* El asistente promete que la asignación «se guarda para siempre». Si el
     freno del bloque anterior se disparara también con la asignación ya
     guardada, ese mismo fichero preguntaría en cada importación y la promesa
     sería falsa. Se simula la confirmación guardando el mapeo y se vuelve a
     soltar el fichero. */
  const confirmado = await ev(()=>{
    /* Se reconstruye la firma de la hoja tal cual la vería el importador y se
       guarda la asignación correcta, como si el usuario la hubiera confirmado
       en el asistente: el importe es `prezzo-articolo`, no `spese-di-spedizione`. */
    const H = ['identificativo-ordine-amazon','data-acquisto','data-ultimo-aggiornamento','stato-ordine',
      'canale-di-gestione','canale-di-vendita','nome-prodotto','sku','asin','stato-articolo',
      'quantita','valuta','spese-di-spedizione','prezzo-articolo','imposta-articolo',
      'sconto-promozione','citta-spedizione','provincia-spedizione','cap-spedizione','paese-spedizione'];
    DB.imports = {}; DB.mappings = {};
    DB.mappings[sheetSig(H)] = {reportId:'orders', map:{
      _oid:'identificativoordineamazon', _date:'dataacquisto', _sku:'sku',
      _qty:'quantita', _amount:'prezzoarticolo', _tax:'impostaarticolo'}};
    saveDB(); document.getElementById('fileList').innerHTML=''; refreshAll();
    return Object.keys(DB.mappings)[0];
  });
  await page.waitForTimeout(200);
  await soltar('pedidos-italiano.txt');
  const rec = await ev(()=>{
    const e = [...document.querySelectorAll('#fileList .fileitem')].pop();
    return {n:imp('orders').length,
            meta:(e && e.querySelector('.f-meta')||{textContent:''}).textContent.replace(/\s+/g,' '),
            importe:(imp('orders')[0]||{})._amount};
  });
  check('con la asignación guardada entra sin volver a preguntar',
    rec.n===8, (rec.n===undefined?'no se ha podido medir':rec.n+' filas')+' · '+String(rec.meta).slice(0,70));
  check('y usa la columna que se confirmó, no la primera de dinero',
    rec.importe==='11.99', String(rec.importe)+' € · «spese-di-spedizione» son 3,99 €');

  /* ═══════════════════════════════════════════════════════════════════════
     IMP-M · C1 · TARIFAS SIN COLUMNA DE PRECIO
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== IMP-M · TARIFAS SIN PRECIO: LA COMISIÓN NO ESTÁ MEDIDA ===');
  /* La comisión viene en euros por unidad (4,08 €) y el hub necesita el precio
     para convertirla en porcentaje. Sin `your-price` ni `sales-price` se cae al
     15 % por defecto — en verde y sin decirlo. */
  await limpiar();
  const C1 = await importar('tarifas-sin-precio.txt');
  const c1 = C1.items[0] || {meta:'(no hay línea de fichero)', dot:'?'};
  check('las filas se cargan, que son útiles para la tarifa de logística',
    C1.imports.fees && C1.imports.fees.count===3, (C1.imports.fees||{}).count+' filas');
  check('pero NO se da por bueno en verde', c1.dot!=='ok', c1.dot+' · un ✓ aquí es la comisión al 15 % disfrazada de medida');
  check('y se dice que sin precio la comisión no está medida',
    /15 %/.test(c1.meta) && /precio de venta/i.test(c1.meta), c1.meta.slice(0,150));
  const avisoPanel = await ev(()=>{
    const c = document.getElementById('impFicheros'); return c ? c.textContent.replace(/\s+/g,' ') : '(no existe el panel de ficheros en Datos)'; })
    .then(x => typeof x==='string' ? x : '(no se ha podido leer: '+(x&&x.__error)+')');
  check('el aviso sigue en Datos cuando ya no está la línea del fichero',
    /no trae columna de precio/i.test(avisoPanel), avisoPanel.slice(0,110) || '(sin panel)');

  console.log('\n=== IMP-N · UNA TARIFA DE LOGÍSTICA A 0,00 NO ES UNA MEDICIÓN ===');
  /* `hayNumero("0.00")` es verdadero, así que un cero literal pasa por dato
     medido; luego el cálculo lo descarta igualmente por no ser > 0 y usa la
     tarifa por defecto del producto, sin contarlo como ausente. Dos de las tres
     filas de la fixture vienen así. */
  await limpiar();
  const A5 = await importar('tarifas-cero.txt');
  const a5 = A5.items[0] || {meta:'(no hay línea de fichero)'};
  check('se avisa de las 2 filas con la tarifa de logística a 0,00',
    /0,00/.test(a5.meta) && /2 de 3/.test(a5.meta), a5.meta.slice(0,160));

  /* ═══════════════════════════════════════════════════════════════════════
     IMP-O · .XLSX · se rechaza, pero explicando cómo salir del paso
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== IMP-O · EL LIBRO DE EXCEL SE RECHAZA CON UNA SALIDA ===');
  await limpiar();
  const XL = await importar('informe_ppc.xlsx');
  const xl = XL.items[0] || {meta:'(no hay línea de fichero)', dot:'?'};
  check('no se importa', xl.dot==='err', xl.dot);
  check('y el mensaje dice DÓNDE pedir el CSV en Seller Central',
    /Gestor de campañas/.test(xl.meta) && /CSV/.test(xl.meta), xl.meta.slice(0,120));
  check('y cómo convertirlo si solo tienes el .xlsx',
    /Guardar como/.test(xl.meta), xl.meta.slice(0,200));

  /* ═══════════════════════════════════════════════════════════════════════
     IMP-P · A3 · `countryOf` casaba por subcadena
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== IMP-P · «UNITED KINGDOM» NO ES ITALIA ===');
  const P = await ev(()=>({
    uk:countryOf('United Kingdom'), dk:countryOf('Denmark'), ee:countryOf('Estonia'),
    se_pais:countryOf('Sweden'), es_dom:countryOf('Amazon.es'), be:countryOf('Amazon.com.be'),
    cod:countryOf('DE'), nombre:countryOf('Spain'), tienda:countryOf('Tienda: Amazon.it'),
    uk_dom:countryOf('Amazon.co.uk'), sa:countryOf('Amazon.sa'), vacio:countryOf('')
  }));
  /* INTEGRACIÓN · antes esta comprobación pedía `null`. Desde la entrega del
     6-sep y el carril 8, MKT_MAP mapea el Reino Unido a GB A PROPÓSITO: el
     informe real de IVA trae facturas de Amazon en libras con MARKETPLACE
     `amazon.co.uk`. GB es la verdad, no un país inventado, y al no estar en
     COUNTRIES cae en «Otros mercados» y no pinta columna de cumplimiento.
     Lo que esta comprobación vigila —que «unITed» no se lea como Italia—
     sigue igual de estricto: cualquier cosa distinta de GB falla. */
  check('«United Kingdom» ya no es IT: es GB', P.uk==='GB', String(P.uk)+' · «unITed» llevaba dentro la clave «it»');
  check('«Denmark» ya no es DE',        P.dk===null, String(P.dk)+' · «DEnmark» llevaba dentro la clave «de»');
  check('«Estonia» ya no es ES',        P.ee===null, String(P.ee)+' · «EStonia» llevaba dentro la clave «es»');
  check('un dominio conocido da su país y uno ajeno no inventa ninguno',
    P.uk_dom==='GB' && P.sa===null, 'co.uk→'+P.uk_dom+' · sa→'+P.sa);
  check('y lo que sí se sabe se sigue sabiendo',
    P.se_pais==='SE' && P.es_dom==='ES' && P.be==='BE' && P.cod==='DE' && P.nombre==='ES' && P.tienda==='IT',
    JSON.stringify(P));

  /* ═══════════════════════════════════════════════════════════════════════
     IMP-Q · LA API QUE USAN LOS DEMÁS CARRILES NO CAMBIA
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n=== IMP-Q · `imp(id)` SIGUE DEVOLVIENDO LAS FILAS FUSIONADAS ===');
  await limpiar();
  await importar('pedidos-a.txt','pedidos-b.txt');
  const API = await ev(()=>{
    const r = imp('orders');
    return {esArray:Array.isArray(r), n:r.length, hasImp:hasImp('orders'),
            mismoObjeto: r === DB.imports.orders.rows,
            campos: !!(r[0] && r[0]._sku && r[0]._date && r[0]._qty!==undefined),
            vacio: imp('reimb').length, hasVacio: hasImp('reimb')};
  });
  check('devuelve un array de las 6 filas fusionadas',
    API.esArray && API.n===6 && API.mismoObjeto, JSON.stringify(API));
  check('con los campos internos ya normalizados', API.campos, String(API.campos));
  check('y un informe sin cargar sigue dando lista vacía y hasImp() falso',
    API.vacio===0 && API.hasVacio===false, API.vacio+' · '+API.hasVacio);

  /* Una base guardada con la forma antigua —solo `rows`, sin `ficheros`— tiene
     que seguir funcionando y aceptar un fichero nuevo encima. */
  console.log('\n=== IMP-R · UNA BASE ANTIGUA NO SE ROMPE AL AÑADIRLE UN FICHERO ===');
  const vieja = await ev(async ()=>{
    const filas = imp('orders').map(r=>{ const c={}; for(const k in r){ if(k!=='__fs') c[k]=r[k]; } return c; });
    DB.imports.orders = {rows:filas, count:filas.length, file:'antiguo.txt', map:{}, cols:34,
                         loadedAt:new Date().toISOString(), how:'cabeceras en inglés'};
    saveDB();
    return {antes: imp('orders').length};
  });
  await soltar('pedidos-a.txt');
  const migrada = await ev(()=>({n:imp('orders').length,
    f:(DB.imports.orders.ficheros||[]).map(x=>x.nombre).join(' + ')}));
  check('la base vieja se convierte en una aportación con nombre',
    typeof migrada.f==='string' && /antiguo\.txt/.test(migrada.f),
    migrada.f ? migrada.f : 'el informe no guarda de qué fichero viene cada fila');
  check('y añadir encima un fichero ya contenido no inventa filas',
    vieja.antes===6 && migrada.n===6, vieja.antes+' → '+migrada.n);

  console.log('\n=== IMP-S · NINGÚN ERROR DE JAVASCRIPT EN TODA LA SESIÓN ===');
  /* Datos vacía, a medias y llena, ya recorridas arriba. Se remata mirando que
     la pantalla se pinta sin nada cargado. */
  await limpiar();
  await ev(()=>{ renderDatos(); refreshAll(); });
  await page.waitForTimeout(300);
  const vacia = await ev(()=>{
    const c = document.getElementById('impFicheros');
    return {existe: !!c, texto:(c?c.textContent:'').trim().length,
            tabla: document.getElementById('dataState').textContent.indexOf('Nada importado')>=0};
  });
  check('con Datos vacía el panel de ficheros no enseña una tabla de nada',
    vacia.texto===0 && vacia.tabla, JSON.stringify(vacia));
  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');

  console.log('\n######## ' + (fails===0 && errors.length===0
    ? 'TODO CORRECTO' : fails+' fallos / '+errors.length+' errores') + ' ########');
  await browser.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
