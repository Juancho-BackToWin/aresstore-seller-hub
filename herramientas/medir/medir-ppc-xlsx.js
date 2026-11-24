/* Mide la lectura de VARIOS informes de términos de búsqueda en .xlsx cargados
   juntos, que es como los va a usar Juancho. No es una prueba: es el paso 6 del
   METODO (probar contra ficheros reales de Amazon en la aplicación compilada).

   Uso:  node herramientas/medir/medir-ppc-xlsx.js <informe.xlsx> [otro.xlsx...]

   Los ficheros reales NO están ni deben estar en el repositorio: es público.
   Esta herramienta no imprime ningún término de búsqueda ni nombre de campaña;
   solo recuentos y totales.

   Imprime dos cosas:
   1 · Cada fichero por separado: si se reconoce, cuántas filas, desde y hasta,
       y el gasto sumado fila a fila sin prorratear (comparable con sumar la
       columna «Gasto» en Excel).
   2 · Todos juntos: el gasto bruto después de resolver solapes, cuánto ha
       quedado fuera por solape y en cuántos días, los días cubiertos y el
       gasto a 30, 90 y 365 días. Se imprime en JSON para poder contrastarlo
       con un cálculo independiente. */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const ficheros = process.argv.slice(2);
if(!ficheros.length){ console.error('uso: node medir-ppc-xlsx.js <fichero.xlsx...>'); process.exit(2); }
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
  await page.evaluate(()=>{ DB=blankDB(); DB.mappings={}; saveDB(); refreshAll(); go('datos'); });

  const porFichero = [];
  const T0 = Date.now();
  for(const f of ficheros){
    const antes = await page.evaluate(()=>((DB.imports.searchterm||{}).ficheros||[]).length);
    /* Playwright no entrega bien un fichero cuya RUTA lleva tildes («términos»):
       el input recibe nada y el fichero sale «no reconocido» sin error. Pasó el
       4-oct con casi todos los informes de una carpeta real, y parecía un fallo
       del lector. No lo es: con el mismo fichero dado a la página como un File
       con su nombre acentuado, el hub lo lee entero. Por eso se le pasan los
       bytes y el nombre, no la ruta. */
    await page.setInputFiles('#csvFile', []);
    await page.setInputFiles('#csvFile', {name:path.basename(f), buffer:fs.readFileSync(f),
      mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    /* Se espera a que no quede nada «leyendo…» Y a que el número de ficheros
       del informe cambie (o a que pase un rato largo: un fichero que no se
       reconoce no lo cambia nunca). */
    for(let i=0;i<120;i++){
      await page.waitForTimeout(250);
      const e = await page.evaluate(()=>({leyendo:/leyendo/i.test((document.getElementById('fileList')||{}).textContent||''),
        n:((DB.imports.searchterm||{}).ficheros||[]).length}));
      if(!e.leyendo && (e.n!==antes || i>=20)) break;
    }
    const r = await page.evaluate((antes)=>{
      const st = DB.imports.searchterm || {};
      const fs = st.ficheros || [];
      if(fs.length===antes) return {reconocido:false,
        meta: (Array.from(document.querySelectorAll('#fileList .fileitem')).pop()||{}).textContent||''};
      const nuevo = fs[fs.length-1];
      const filas = pubFilas().filter(x=>x.ficheros.indexOf(nuevo.fid)>=0);
      let d0=null, d1=null, gasto=0, sinFecha=0;
      filas.forEach(x=>{ gasto+=x.spend; if(!x.desde){ sinFecha++; return; }
        if(!d0||x.desde<d0) d0=x.desde; if(!d1||x.hasta>d1) d1=x.hasta; });
      return {reconocido:true, fid:nuevo.fid, filas:nuevo.brutas, nuevas:nuevo.nuevas,
        repetidas:nuevo.duplicadas, desde:d0?iso(d0):null, hasta:d1?iso(d1):null,
        sinFecha, gasto:Math.round(gasto*100)/100};
    }, antes);
    r.segundos = Math.round((Date.now()-T0)/100)/10;
    process.stderr.write('· '+path.basename(f)+' '+r.segundos+' s\n');
    porFichero.push(Object.assign({fichero:path.basename(f)}, r));
  }

  const juntos = await page.evaluate(()=>{
    const out = {};
    [30,90,365,3650].forEach(d=>{ periodDays=d; const A=pubAdStats();
      out[d] = {imputado:Math.round(A.spend*100)/100, observado:Math.round(A.spendObservado*100)/100,
        extrapolado:Math.round(A.spendExtrapolado*100)/100, diasSinDato:A.diasSinDato};
      if(d===3650) Object.assign(out, {bruto:Math.round(A.spendBruto*100)/100,
        solape:Math.round(A.gastoSolape*100)/100, diasSolape:A.diasSolape, ficheros:A.ficheros,
        diasCubiertos:A.adDays, desde:A.desde?iso(A.desde):null, hasta:A.hasta?iso(A.hasta):null,
        otraDivisa:A.filasOtraDivisa, sinFecha:A.filasSinFecha});
    });
    return out;
  });
  console.log(JSON.stringify({porFichero, juntos, errores}, null, 1));
  await browser.close();
})().catch(e=>{ console.error(e); process.exit(1); });
