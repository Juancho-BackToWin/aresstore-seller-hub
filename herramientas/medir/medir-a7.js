/* Mide el detector de IVA fiscal (A7) cargando los informes REALES de Amazon
   en la aplicación compilada. No es una prueba: es el paso 5 del METODO, que
   es contrastar lo que dice el hub con la realidad del negocio.

   Uso:  node herramientas/medir/medir-a7.js <fichero-de-IVA> [más ficheros...]

   Los ficheros reales NO están en el repositorio y no deben estarlo: traen
   datos de compradores y el repositorio es público. Se pasan por la línea de
   órdenes desde donde los tengas.  */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const ficheros = process.argv.slice(2);
if(!ficheros.length){ console.error('uso: node medir-a7.js <fichero...>'); process.exit(2); }
ficheros.forEach(f=>{ if(!fs.existsSync(f)){ console.error('no existe: '+f); process.exit(2); } });

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('PAGEERROR: '+e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname,'..','..','index.html'));
  await page.waitForTimeout(700);
  await page.evaluate(()=>{ DB=blankDB(); DB.mappings={}; saveDB(); refreshAll(); });

  for(const f of ficheros){
    await page.setInputFiles('#csvFile', path.resolve(f));
    await page.waitForTimeout(2500);
    console.log('cargado · ' + path.basename(f));
  }

  const V = await page.evaluate(()=>{
    const v = vatReport();
    return {
      filas:v.rows, ventas:v.ventas, base:+v.base.toFixed(2), iva:+v.vat.toFixed(2),
      diferencia:+v.diferencia.toFixed(2), tuya:+v.difTuya.toFixed(2),
      delMercado:+v.difDelMercado.toFixed(2), sinResponsable:v.sinResponsable,
      ventasReducidas:v.ventasReducidas, ventasCero:v.ventasCero||0, sinJuris:v.sinJuris,
      porPais:Object.keys(v.porPais).sort().reduce((a,k)=>{
        a[k]={ventas:v.porPais[k].ventas, base:+v.porPais[k].base.toFixed(2),
              dif:+v.porPais[k].dif.toFixed(2), tipos:Object.keys(v.porPais[k].tipos).sort()};
        return a;},{}),
      codigos:v.porCodigo, periodos:v.periodos
    };
  });

  console.log('\n=== IVA FISCAL · MEDIDO SOBRE LOS FICHEROS REALES ===');
  console.log('filas del informe          ' + V.filas);
  console.log('ventas (TRANSACTION_TYPE)  ' + V.ventas);
  console.log('base sin IVA               ' + V.base.toFixed(2) + ' €');
  console.log('IVA repercutido            ' + V.iva.toFixed(2) + ' €');
  console.log('DIFERENCIA                 ' + V.diferencia.toFixed(2) + ' €   (' +
              (V.base>0 ? (V.diferencia/V.base*100).toFixed(2) : '—') + ' % de la base)');
  console.log('  · tuya                   ' + V.tuya.toFixed(2) + ' €');
  console.log('  · del mercado (Amazon)   ' + V.delMercado.toFixed(2) + ' €');
  console.log('  · sin responsable        ' + V.sinResponsable + ' filas');
  console.log('ventas a tipo reducido     ' + V.ventasReducidas);
  console.log('ventas a tipo CERO         ' + V.ventasCero);
  console.log('filas SIN jurisdicción     ' + V.sinJuris);
  console.log('\npaís   ventas       base      diferencia   tipos aplicados');
  Object.keys(V.porPais).forEach(k=>{ const p=V.porPais[k];
    console.log('  ' + k + '   ' + String(p.ventas).padStart(5) + '  ' +
                p.base.toFixed(2).padStart(10) + '  ' + p.dif.toFixed(2).padStart(10) +
                '   ' + p.tipos.join(' · ')); });
  console.log('\ncódigos fiscales de producto: ' + JSON.stringify(V.codigos));
  console.log('periodos del informe:        ' + JSON.stringify(V.periodos));
  if(errores.length) console.log('\nERRORES DE JS: ' + errores.join(' | '));
  await browser.close();
})();
