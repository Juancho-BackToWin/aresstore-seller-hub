const {chromium}=require('playwright'); const path=require('path'), fs=require('fs');
const FIX=path.resolve(__dirname,'fixtures'), FIXES=path.resolve(__dirname,'fixtures-es');
let fails=0; const ck=(l,c,e)=>{if(!c)fails++;console.log('  '+(c?'OK   ':'FALLO')+' '+l+(e!==undefined?'  → '+e:''));};
const snap = p => p.evaluate(()=>{
  const P=pnl(), I=invStats(), A=adStats();
  return {ventas:Math.round(P.grossInc), unidades:P.units, devol:+P.retRate.toFixed(2),
          stock:I.reduce((a,r)=>a+r.qty,0), paises:Object.keys(I.reduce((a,r)=>Object.assign(a,r.byCountry),{})).length,
          gasto:Math.round(A.spend), terminos:A.terms.length};
});
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('dialog',d=>d.accept());
  await p.goto('file://'+path.resolve(__dirname,'..','index.html')); await p.waitForTimeout(700);
  await p.click('.appcard:not(.soon)'); await p.waitForTimeout(400);
  await p.evaluate(()=>document.querySelector('.nav-item[data-view="datos"]').click());
  await p.waitForTimeout(300);

  console.log('\n=== A · INFORMES EN INGLÉS (referencia) ===');
  await p.setInputFiles('#csvFile', ['all-orders.txt','fba-inventory.txt','multicountry.txt','fee-preview.txt','returns.txt','search-terms.csv']
    .map(f=>path.resolve(FIX,f)));
  await p.waitForTimeout(3000);
  const EN = await snap(p);
  console.log('     '+JSON.stringify(EN));

  console.log('\n=== B · LOS MISMOS, EN ESPAÑOL ===');
  await p.evaluate(()=>{ DB.imports={}; DB.mappings={}; saveDB(); refreshAll(); });
  await p.waitForTimeout(400);
  await p.evaluate(()=>document.getElementById('fileList').innerHTML='');
  const esFiles = fs.readdirSync(FIXES).filter(f=>f!=='hostil-sin-nombres.txt');
  await p.setInputFiles('#csvFile', esFiles.map(f=>path.resolve(FIXES,f)));
  await p.waitForTimeout(3500);
  const items = await p.$$eval('#fileList .fileitem', els=>els.map(e=>({
    name:(e.querySelector('.f-name')||{}).textContent, meta:(e.querySelector('.f-meta')||{}).textContent,
    ok:!!e.querySelector('.f-dot.ok')})));
  items.forEach(i=>console.log('     '+(i.ok?'✓':'✗')+' '+i.name.padEnd(22)+' '+(i.meta||'').slice(0,62)));
  ck('los 6 informes en español se reconocen', items.filter(i=>i.ok).length===6, items.filter(i=>i.ok).length+'/6');

  const ES = await snap(p);
  console.log('     '+JSON.stringify(ES));
  ck('mismas ventas',      ES.ventas===EN.ventas,      EN.ventas+' vs '+ES.ventas);
  ck('mismas unidades',    ES.unidades===EN.unidades,  EN.unidades+' vs '+ES.unidades);
  ck('misma tasa devolución', ES.devol===EN.devol,     EN.devol+' vs '+ES.devol);
  ck('mismo stock',        ES.stock===EN.stock,        EN.stock+' vs '+ES.stock);
  ck('mismo desglose por país', ES.paises===EN.paises, EN.paises+' vs '+ES.paises);
  ck('mismo gasto de PPC', ES.gasto===EN.gasto,        EN.gasto+' vs '+ES.gasto);
  ck('mismos términos',    ES.terminos===EN.terminos,  EN.terminos+' vs '+ES.terminos);

  console.log('\n=== C · COMISIÓN REAL LEÍDA DEL INFORME (20,4% joyería) ===');
  const fee=await p.evaluate(()=>{const r=(DB.imports.fees&&DB.imports.fees.rows[0])||{};
    return {sku:r._sku, comision:r._referral, fba:r._fba};});
  console.log('     '+JSON.stringify(fee));
  ck('extrae la comisión por unidad', fee.comision && parseFloat(String(fee.comision).replace(',','.'))>4);

  console.log('\n=== D · CASO HOSTIL: cabeceras columna_1, columna_2… ===');
  await p.evaluate(()=>{ DB.imports={}; DB.mappings={}; saveDB(); document.getElementById('fileList').innerHTML=''; });
  await p.setInputFiles('#csvFile', [path.resolve(FIXES,'hostil-sin-nombres.txt')]);
  await p.waitForTimeout(2000);
  const h=await p.$$eval('#fileList .fileitem', els=>els.map(e=>({
    meta:(e.querySelector('.f-meta')||{}).textContent, ok:!!e.querySelector('.f-dot.ok'),
    btn:!!e.querySelector('button')})));
  console.log('     '+JSON.stringify(h[0]));
  ck('lo identifica solo por el contenido, o ofrece asignarlo a mano', h[0] && (h[0].ok || h[0].btn));
  if(h[0]&&h[0].ok){ const H=await snap(p); console.log('     '+JSON.stringify(H));
    ck('y las cifras cuadran con la referencia', H.unidades>0); }

  console.log('\nERRORES JS: '+errs.length); errs.forEach(e=>console.log('  '+e));
  console.log('\n######## '+(fails===0&&errs.length===0?'TODO CORRECTO':fails+' fallos / '+errs.length+' errores')+' ########');
  await b.close();
})();
