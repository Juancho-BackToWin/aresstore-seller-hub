/* Mide la lectura del informe de EPR de Amazon cargando el fichero REAL en la
   aplicación compilada. No es una prueba: es el paso 5 del METODO.

   Uso:  node herramientas/medir/medir-epr.js <informe-EPR.txt>

   El fichero real NO está ni debe estar en el repositorio: es público.

   Imprime dos cosas, lado a lado, para que se vea si el hub dice la verdad:
   1 · lo que devuelve eprPorPais() dentro de la app;
   2 · lo que dice el fichero leído directamente, sin pasar por el hub, con las
       unidades DEDUPLICADAS por ASIN y país (un ASIN aparece una vez por cada
       categoría EPR — envase primario, papel impreso, textil… — y sumar
       TOTAL_UNITS_SOLD de todas sus filas cuenta la misma venta varias veces)
       y los kilos de envase sumados por MATERIAL (PAPER_KG, PLASTIC_KG…),
       que es donde el informe real los trae. */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const f = process.argv[2];
if(!f || !fs.existsSync(f)){ console.error('uso: node medir-epr.js <informe-EPR.txt>'); process.exit(2); }

function directo(fichero){
  let t = fs.readFileSync(fichero, 'utf8').replace(/^﻿/, '');
  const L = t.split(/\r?\n/).filter(x=>x.length);
  const H = L[0].split('\t');
  const R = L.slice(1).map(l=>{ const c=l.split('\t'); const o={}; H.forEach((h,i)=>o[h]=(c[i]||'').trim()); return o; });
  const n = x => { const v=parseFloat(String(x).replace(',','.')); return isFinite(v)?v:0; };
  const MAT = ['PAPER_KG','GLASS_KG','ALUMINUM_KG','STEEL_KG','PLASTIC_KG','WOOD_KG','OTHER_KG'];
  const out = {filas:R.length, periodo:null, paises:{}, categorias:{}, conRegistro:0, totalVacio:0};
  const vistos = {};
  R.forEach(r=>{
    if(!out.periodo && r.REPORT_PERIOD_START) out.periodo = r.REPORT_PERIOD_START+' → '+r.REPORT_PERIOD_END;
    const c = r.SHIP_TO_COUNTRY_CODE || '(vacío)';
    const P = out.paises[c] || (out.paises[c] = {filas:0, unidadesBrutas:0, unidades:0, kgTotalReported:0, kgEnvase:0, porMaterial:{}, categorias:{}});
    P.filas++;
    P.unidadesBrutas += n(r.TOTAL_UNITS_SOLD);
    const k = r.ASIN+'|'+c;
    if(/^[A-Z0-9]{10}$/.test(r.ASIN) && !vistos[k]){ vistos[k]=1; P.unidades += n(r.TOTAL_UNITS_SOLD); }  /* «SP FBA» es la caja de envío, no una venta */
    P.kgTotalReported += n(r.TOTAL_REPORTED_WEIGHT_KG);
    const cat = r.EPR_CATEGORY || '(vacía)';
    P.categorias[cat] = (P.categorias[cat]||0)+1;
    out.categorias[cat] = (out.categorias[cat]||0)+1;
    if(/Packaging/i.test(cat)) MAT.forEach(m=>{ const v=n(r[m]); if(v){ P.kgEnvase+=v; P.porMaterial[m]=(P.porMaterial[m]||0)+v; } });
    if(r.REGISTRATION_NUMBER) out.conRegistro++;
    if(!r.TOTAL_REPORTED_WEIGHT_KG) out.totalVacio++;
  });
  return out;
}

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
  await page.setInputFiles('#csvFile', path.resolve(f));
  await page.waitForTimeout(2500);

  const H = await page.evaluate(()=>{
    const e = eprPorPais();
    const ids = Object.keys(DB.imports||{}).filter(k=>((DB.imports[k]||{}).rows||[]).length);
    return {importadoComo: ids, epr: JSON.parse(JSON.stringify(e))};
  });
  const D = directo(f);

  console.log('\n=== INFORME DE EPR · MEDIDO SOBRE EL FICHERO REAL ===');
  console.log('el hub lo importa como       ' + (H.importadoComo.join(', ')||'NADA'));
  console.log('filas (hub / fichero)        ' + H.epr.filas + ' / ' + D.filas);
  console.log('periodo                      ' + D.periodo);
  console.log('categorías EPR               ' + JSON.stringify(D.categorias));
  console.log('filas con nº de registro     ' + D.conRegistro + ' de ' + D.filas);
  console.log('TOTAL_REPORTED_WEIGHT vacío  ' + D.totalVacio + ' de ' + D.filas);
  console.log('\npaís | hub: unidades / kilos / sinRegistro || fichero: ud. dedup / ud. brutas / kg envase por material / kg TOTAL_REPORTED');
  const codes = Array.from(new Set(Object.keys(H.epr.paises).concat(Object.keys(D.paises)))).sort();
  codes.forEach(c=>{
    const h = H.epr.paises[c]||{}, d = D.paises[c]||{};
    console.log(c+'   | '+(h.unidades??'—')+' / '+(h.kilos!=null?h.kilos.toFixed(3):'—')+' / '+(h.sinRegistro??'—')+
      ' || '+(d.unidades??'—')+' / '+(d.unidadesBrutas??'—')+' / '+(d.kgEnvase!=null?d.kgEnvase.toFixed(3):'—')+
      ' / '+(d.kgTotalReported!=null?d.kgTotalReported.toFixed(3):'—')+'   '+JSON.stringify(d.categorias||{}));
  });
  if(errores.length) console.log('\nERRORES DE PÁGINA:\n'+errores.join('\n'));
  await browser.close();
})();
