/* Mide la lectura del informe de términos de búsqueda de Sponsored Products
   cargando el fichero REAL en la aplicación compilada. No es una prueba: es el
   paso 5 del METODO.

   Uso:  node herramientas/medir/medir-ppc.js <informe.csv> [otro.csv...]

   El fichero real NO está ni debe estar en el repositorio: es público.

   Carga cada fichero en una base en blanco, por separado, e imprime lo que el
   hub entiende de él: cómo lo reconoce, cuántas filas lee, qué fechas, cuántas
   filas se quedan sin fecha y cuánto gasto suma. El gasto se suma sobre las
   filas tal cual (`pubFilas()`), sin prorratear, para que sea comparable con
   la suma directa de la columna «Gasto» del fichero. */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const ficheros = process.argv.slice(2);
if(!ficheros.length){ console.error('uso: node medir-ppc.js <fichero...>'); process.exit(2); }
ficheros.forEach(f=>{ if(!fs.existsSync(f)){ console.error('no existe: '+f); process.exit(2); } });

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  for(const f of ficheros){
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push('PAGEERROR: '+e.message));
    page.on('dialog', d => d.accept());
    await page.goto('file://' + path.resolve(__dirname,'..','..','index.html'));
    await page.waitForTimeout(700);
    await page.evaluate(()=>{ DB=blankDB(); DB.mappings={}; saveDB(); refreshAll(); });
    await page.setInputFiles('#csvFile', path.resolve(f));
    for(let i=0;i<40;i++){
      await page.waitForTimeout(250);
      const listo = await page.evaluate(()=>!/leyendo/i.test((document.getElementById('fileList')||{}).textContent||''));
      if(listo) break;
    }
    const R = await page.evaluate(()=>{
      const ids = Object.keys(DB.imports||{}).filter(k=>((DB.imports[k]||{}).rows||[]).length);
      const F = (typeof pubFilas==='function') ? pubFilas() : [];
      const con = F.filter(x=>x.desde);
      const iso2 = d => d ? d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') : '—';
      const d0 = con.length ? new Date(Math.min.apply(null, con.map(x=>x.desde))) : null;
      const d1 = con.length ? new Date(Math.max.apply(null, con.map(x=>x.hasta))) : null;
      const divisas = {}; F.forEach(x=>{ divisas[x.divisa||'(vacía)']=(divisas[x.divisa||'(vacía)']||0)+1; });
      return {
        ids, filas:F.length, sinFecha:F.length-con.length, tramo:con.filter(x=>x.dias>1).length,
        desde:iso2(d0), hasta:iso2(d1),
        gasto:+F.reduce((a,x)=>a+x.spend,0).toFixed(2),
        ventas:+F.reduce((a,x)=>a+x.sales,0).toFixed(2),
        clics:F.reduce((a,x)=>a+x.clicks,0), divisas,
        aviso:((document.getElementById('fileList')||{}).textContent||'').replace(/\s+/g,' ').slice(0,220)
      };
    });
    console.log('\n=== ' + path.basename(f) + ' ===');
    console.log('el hub lo importa como   ' + (R.ids.join(', ')||'NADA'));
    console.log('filas leídas             ' + R.filas + '   sin fecha: ' + R.sinFecha + '   de más de un día: ' + R.tramo);
    console.log('fechas                   ' + R.desde + ' → ' + R.hasta);
    console.log('gasto (suma de filas)    ' + R.gasto.toFixed(2));
    console.log('ventas 7 d               ' + R.ventas.toFixed(2) + '   clics: ' + R.clics);
    console.log('divisas                  ' + JSON.stringify(R.divisas));
    if(!R.ids.length) console.log('lista de ficheros        ' + R.aviso);
    if(errores.length) console.log('ERRORES DE PÁGINA:\n' + errores.join('\n'));
    await page.close();
  }
  await browser.close();
})();
