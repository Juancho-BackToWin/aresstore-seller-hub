/* Mide los detectores de Reclamaciones cargando informes REALES en la
   aplicación compilada. No es una prueba: es el paso 6 del METODO.

   Uso:  node herramientas/medir/medir-reclamaciones.js <fichero> [otro...]
   (transacciones, devoluciones, pedidos, reembolsos, libro mayor… en el orden
   que quieras: cada uno se reconoce por su cabecera).

   Los ficheros reales NO están ni deben estar en el repositorio: es público.
   Esta herramienta no imprime números de pedido, SKU ni nombres de producto:
   solo recuentos, importes agregados, fechas extremas y los avisos que da cada
   detector. */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const ficheros = process.argv.slice(2);
if(!ficheros.length){ console.error('uso: node medir-reclamaciones.js <fichero...>'); process.exit(2); }
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

  const cargados = [];
  for(const f of ficheros){
    await page.setInputFiles('#csvFile', []);
    await page.setInputFiles('#csvFile', path.resolve(f));
    for(let i=0;i<120;i++){
      await page.waitForTimeout(250);
      if(!await page.evaluate(()=>/leyendo/i.test((document.getElementById('fileList')||{}).textContent||''))) break;
    }
    const linea = await page.evaluate(()=>{ const it = Array.from(document.querySelectorAll('#fileList .fileitem')).pop();
      return it ? (it.querySelector('.f-meta')||it).textContent.replace(/\s+/g,' ').slice(0,140) : ''; });
    cargados.push({fichero: path.basename(f), linea});
  }

  const R = await page.evaluate(()=>{
    const out = {informes:{}};
    Object.keys(DB.imports||{}).forEach(k=>{ out.informes[k] = (DB.imports[k]||{}).count||0; });
    const tx = (typeof txRows==='function') ? txRows() : [];
    const tipos = {}; let d0=null, d1=null;
    tx.forEach(r=>{ tipos[r.tipo] = (tipos[r.tipo]||0)+1; if(r.f){ if(!d0||r.f<d0) d0=r.f; if(!d1||r.f>d1) d1=r.f; } });
    out.transacciones = {filas:tx.length, desde:d0?iso(d0):null, hasta:d1?iso(d1):null, tipos};
    const C = claimsAll();
    out.total = Math.round(C.total*100)/100; out.casos = C.casos; out.caducados = C.caducados;
    out.pronto = C.pronto; out.revisar = C.revisar;
    out.bloques = C.bloques.map(b=>{
      const est = {}; b.r.casos.forEach(c=>{ est[c.estado.estado] = (est[c.estado.estado]||0)+1; });
      const importePorEstado = {}; b.r.casos.forEach(c=>{ importePorEstado[c.estado.estado] =
        Math.round(((importePorEstado[c.estado.estado]||0) + (c.importe||0))*100)/100; });
      const fechas = b.r.casos.map(c=>c.fecha).filter(Boolean).sort((a,b)=>a-b);
      return {id:b.id, casos:b.r.casos.length, total:Math.round(b.r.total*100)/100, porEstado:est, importePorEstado,
              desde: fechas.length?iso(fechas[0]):null, hasta: fechas.length?iso(fechas[fechas.length-1]):null,
              descartados:b.r.descartados, avisos:b.r.avisos};
    });
    return out;
  });
  console.log(JSON.stringify({cargados, R, errores}, null, 1));
  await browser.close();
})().catch(e=>{ console.error(e); process.exit(1); });
