const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const files=fs.readdirSync(__dirname).filter(f=>f.endsWith('.svg'));
  for(const f of files){
    const name=f.replace('.svg','');
    for(const size of [512,192]){
      const p=await b.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
      await p.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>`+fs.readFileSync(path.join(__dirname,f),'utf8'));
      await p.waitForTimeout(120);
      await p.screenshot({path:path.join(__dirname, name+'-'+size+'.png'), omitBackground:true});
      await p.close();
    }
  }
  // hoja de contacto para revisar el set de un vistazo
  const p=await b.newPage({viewport:{width:1240,height:560}});
  await p.setContent(`<html><body style="margin:0;background:#F6F2EF;font-family:system-ui">
  <div style="padding:34px 40px"><div style="font-size:22px;font-weight:700;color:#171210;margin-bottom:4px">Aresstore Seller Hub · set de iconos</div>
  <div style="font-size:13px;color:#7a6a60;margin-bottom:26px">Squircle, gradiente naranja, glifo geométrico. El del Hub va en negativo para distinguir contenedor de contenido.</div>
  <div style="display:flex;gap:26px;flex-wrap:wrap">`+
  files.map(f=>`<div style="text-align:center;width:150px"><img src="${f}" style="width:130px;height:130px;border-radius:30px;box-shadow:0 8px 22px rgba(23,18,16,.16)"><div style="font-size:12px;margin-top:10px;color:#171210;font-weight:600">${f.replace('icon-','').replace('.svg','')}</div></div>`).join('')+
  `</div></div></body></html>`,{baseURL:'file://'+__dirname+'/'});
  await p.goto('file://'+__dirname+'/contact.html').catch(()=>{});
  await b.close();
})();
