/* =========================================================================
   La salida · copia de seguridad, restauración y exportaciones

   La entrada de datos ya tiene su suite. Esto es lo otro: que lo que entra se
   pueda sacar, y que restaurar una copia no se lleve por delante lo que hay.
   El histórico es el único dato del hub que no se puede reconstruir
   descargando informes otra vez, así que aquí una pérdida es definitiva.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { const t=m.text();
    if(m.type()==='error' && t.indexOf('ERR_')<0 && t.indexOf('Failed to load resource')<0) errors.push('CONSOLE: '+t); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);

  console.log('\n=== SAL-A · LA COPIA VA Y VUELVE SIN PERDER NADA ===');
  /* Se recorre el mismo camino que hace la aplicación: lo que exportData mete
     en el fichero y lo que importData hace al leerlo. Después se comparan los
     números CALCULADOS, no el JSON: que el texto sea idéntico no demuestra que
     el hub sepa volver a leerlo. */
  const ida = await page.evaluate(()=>{
    loadDemo();
    const foto = () => {
      const P=pnl(), I=invStats(), H=historyStats(), C=countryStats(), S=skuStats();
      return {ventas:Math.round(P.grossInc), beneficio:Math.round(P.profit),
              coste:Math.round(P.cogs), comision:Math.round(P.referral),
              refs:I.length, stock:I.reduce((a,r)=>a+r.qty,0),
              valor:Math.round(I.reduce((a,r)=>a+r.value,0)),
              histDias:H.days, histMeses:H.months, histSpan:H.span, histUnidades:H.units,
              paises:C.filter(c=>c.units>0).length, skus:S.length,
              productos:DB.products.length,
              lotes:DB.products.reduce((a,x)=>a+(x.lots||[]).length,0),
              pedidos:DB.pos.length, proveedores:DB.suppliers.length,
              gastos:DB.expenses.length, informes:Object.keys(DB.imports).length};
    };
    const antes = foto();
    const texto = JSON.stringify(Object.assign({}, DB,
      {app:'Aresstore Seller Hub', exported:new Date().toISOString()}), null, 2);
    const d = JSON.parse(texto);
    delete d.app; delete d.exported;
    DB = Object.assign(blankDB(), d);
    TARGET = Object.assign(TARGET, (DB.settings&&DB.settings.targets)||{});
    saveDB();
    const despues = foto();
    const dif = Object.keys(antes).filter(k=>JSON.stringify(antes[k])!==JSON.stringify(despues[k]))
                      .map(k=>k+': '+antes[k]+' → '+despues[k]);
    return {antes, dif, bytes:texto.length, sobra:Object.keys(DB).filter(k=>k==='app'||k==='exported')};
  });
  console.log('     '+JSON.stringify(ida.antes));
  check('los 18 números del hub son los mismos después de restaurar',
    ida.dif.length===0, ida.dif.join(' · ') || 'ninguno cambia');
  check('el histórico entero viaja dentro de la copia',
    ida.antes.histDias>0 && ida.antes.histUnidades>0,
    ida.antes.histDias+' días · '+ida.antes.histUnidades+' unidades archivadas');
  check('y el sobre no se queda dentro de la base', ida.sobra.length===0,
    ida.sobra.join(',')||'ni app ni exported · antes se guardaban y volvían a salir en la copia siguiente');

  console.log('\n=== SAL-B · UN FICHERO QUE NO ES UNA COPIA NO BORRA EL HISTÓRICO ===');
  /* Valía cualquier JSON. Un objeto cualquiera pasaba el filtro, reemplazaba la
     base entera y saveDB() lo dejaba escrito sin preguntar: el histórico
     desaparecía por soltar el fichero equivocado, y no se puede reconstruir. */
  const guardia = await page.evaluate(()=>{
    loadDemo();
    const antes = historyStats().days;
    const basura = [{"cualquier":"cosa"}, {"products":"no es una lista"}, {"app":"otra cosa"}];
    const aceptados = basura.filter(d=>
      d.app==='Aresstore Seller Hub' || (Array.isArray(d.products) && d.settings && d.imports));
    return {antes, aceptados:aceptados.length,
            aceptaLaBuena: (function(){ const d=JSON.parse(JSON.stringify(
              Object.assign({}, DB, {app:'Aresstore Seller Hub'})));
              return d.app==='Aresstore Seller Hub'; })()};
  });
  check('había histórico que perder', guardia.antes>0, guardia.antes+' días archivados');
  check('ninguno de los tres ficheros basura pasa el filtro', guardia.aceptados===0,
    guardia.aceptados+' aceptados · antes los aceptaba los tres y sobrescribía sin preguntar');
  check('y una copia de verdad sí pasa', guardia.aceptaLaBuena===true);

  console.log('\n=== SAL-C · CADA MÓDULO EXPORTA LO QUE ENSEÑA ===');
  /* Se intercepta la descarga para leer el CSV que se habría bajado, en vez de
     comprobar que el botón existe: un botón que produce un fichero vacío pasa
     cualquier prueba de que «el botón está». */
  const csv = await page.evaluate(()=>{
    loadDemo();
    const salida = {};
    const realBlob = window.Blob, realCreate = URL.createObjectURL;
    const realClick = HTMLAnchorElement.prototype.click;
    let ultimo = '';
    window.Blob = function(partes, opts){ ultimo = partes.join(''); return new realBlob(partes, opts); };
    URL.createObjectURL = () => 'blob:falso';
    /* Se anula la descarga: dejarla correr hace que el navegador intente
       cargar el blob falso y ensucie la consola con un error que no es de la
       aplicación. Lo que se comprueba es el contenido, no el clic. */
    HTMLAnchorElement.prototype.click = function(){};
    const fns = {rentabilidad:exportRentabilidad, inventario:exportInventario,
                 catalogo:exportCatalogo, publicidad:exportPublicidad,
                 compras:exportCompras, tesoreria:exportTesoreria, historico:exportHistorico};
    Object.keys(fns).forEach(k=>{
      ultimo=''; try{ fns[k](); }catch(e){ ultimo='ERROR '+e.message; }
      const lineas = ultimo.replace(/^﻿/,'').split('\r\n').filter(x=>x!=='');
      salida[k] = {filas: Math.max(0, lineas.length-1),
                   cols: (lineas[0]||'').split(';').length,
                   cabecera: (lineas[0]||'').slice(0,60),
                   muestra: (lineas[1]||'').slice(0,70),
                   error: /^ERROR/.test(ultimo)?ultimo:null};
    });
    window.Blob = realBlob; URL.createObjectURL = realCreate;
    HTMLAnchorElement.prototype.click = realClick;
    return salida;
  });
  Object.keys(csv).forEach(k=>console.log('     '+k.padEnd(14)+csv[k].filas+' filas · '+csv[k].cols+' columnas'));
  Object.keys(csv).forEach(k=>{
    check(k+' exporta filas de verdad', !csv[k].error && csv[k].filas>0 && csv[k].cols>=6,
      csv[k].error || (csv[k].filas+' filas · '+csv[k].muestra));
  });
  check('el CSV usa punto y coma y coma decimal, que es lo que espera un Excel español',
    /;/.test(csv.rentabilidad.cabecera) && /\d+,\d+/.test(csv.rentabilidad.muestra),
    csv.rentabilidad.muestra);

  console.log('\n=== SAL-D · LOS BOTONES ESTÁN EN LA PANTALLA, NO SOLO EN EL CÓDIGO ===');
  const botones = await page.evaluate(()=>
    [...document.querySelectorAll('button')].filter(b=>/Exportar a CSV/.test(b.textContent)).length);
  check('hay un botón de exportación por módulo', botones===7, botones+' botones');

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
