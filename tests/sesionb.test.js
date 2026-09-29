/* =========================================================================
   SESIÓN B · inventario, fecha de la foto, devoluciones y caja

   Los criterios de aceptación de `ESPEC-SESION-B-2026-09-05.md`, con la
   aritmética a mano en el comentario y los recuentos del fichero real
   reproducidos en fixture. Los ficheros reales NO están aquí y no pueden
   estarlo —el repositorio es público y los informes traen datos de
   compradores—, así que las fixtures replican sus RECUENTOS y su FORMATO
   LITERAL de columna, que es lo que el sexto paso del METODO exige.

   El formato literal replicado:
     · gestión FBA   · 26 columnas, NINGUNA de fecha, `store` vacía
     · multipaís     · `country` con código ISO de dos letras, no nombre
     · salud         · `snapshot-date` y `Inventory age snapshot date`, que va
                       dos días por detrás y NO vale
     · devoluciones  · `detailed-disposition` y `reason` en MAYÚSCULAS
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> Math.abs(a-b) < (t==null?0.01:t);
const n = v => (typeof v==='number' && isFinite(v)) ? v : (v==null ? 0 : (isNaN(Number(v))?0:Number(v)));

const D = fs.mkdtempSync(path.join(os.tmpdir(),'sesionb-'));

/* ---- Fixture: los tres informes de inventario, con los recuentos reales ----
   Gestión FBA: 21 SKUs · disponible 755 · reservado 13 · investigación 45 ·
                transferencia 2 · no vendible 0 · TOTAL 815
   Multipaís:   31 filas · 926 unidades · ES 684 · FR 137 · IT 99 · DE 5 · PL 1
   Ausentes del de gestión: diez referencias, 169 unidades
   815 − 58 + 169 = 926                                                       */
const AUSENTES = [['FBA0116',13],['FBASPB0101',20],['FBASPB0102',20],['FBASPB0103',15],
                  ['FBASPB0104',8],['FBASPB0105',19],['FBASPB0107',10],['FBASPB0108',33],
                  ['FBASPB0109',13],['FBASPB0110',18]];   // 169 unidades
const HG = ['sku','fnsku','asin','product-name','condition','your-price','mfn-listing-exists',
  'mfn-fulfillable-quantity','afn-listing-exists','afn-warehouse-quantity','afn-fulfillable-quantity',
  'afn-unsellable-quantity','afn-reserved-quantity','afn-total-quantity','per-unit-volume',
  'afn-inbound-working-quantity','afn-inbound-shipped-quantity','afn-inbound-receiving-quantity',
  'afn-researching-quantity','afn-reserved-future-supply','afn-future-supply-buyable',
  'afn-fulfillable-quantity-local','afn-fulfillable-quantity-remote','afn-fc-transfer-quantity',
  'afn-onhand-buyable-quantity','store'];
/* 21 filas de gestión. Reparto: FBA0201 tiene 355 disponibles y 13 reservadas;
   FBA0202 tiene 20 y 45 en investigación; FBA0203 tiene 20 y 2 en transferencia;
   las otras 18, 20 disponibles cada una.
     disponibles = 355 + 20 + 20 + 18x20 = 755
     no disponibles = 13 + 45 + 2 + 0     =  60
     total en almacén                     = 815
   Se numeran FBA02xx a propósito, para que FBA0116 —una de las diez ausentes
   del fichero real— no colisione con ninguna de las presentes. */
const GEST = [];
for(let i=1;i<=21;i++){
  const disp = i===1 ? 355 : 20;
  const res  = i===1 ? 13 : 0, inv = i===2 ? 45 : 0, tr = i===3 ? 2 : 0;
  GEST.push({sku:'FBA0'+String(200+i), disp, res, inv, tr, total:disp+res+inv+tr});
}
const gest = GEST.map((g,i)=>[g.sku,'X'+i,'B0'+i,'Producto '+i,'New','9.99','false','0','true',
  String(g.total),String(g.disp),'0',String(g.res),String(g.total),'0.001',
  '0','0','0',String(g.inv),'0','0','0',String(g.disp),String(g.tr),String(g.disp),'']);
fs.writeFileSync(path.join(D,'gestion.txt'),
  [HG.join('\t')].concat(gest.map(r=>r.join('\t'))).join('\r\n'));   // sin salto final, como Amazon

const HM = ['seller-sku','fulfillment-channel-sku','asin','condition-type','country',
            'quantity-for-local-fulfillment'];
/* El multipaís cuenta las unidades DISPONIBLES EN UN PAÍS, que no son las
   mismas que las «disponibles» del de gestión: incluye las 2 que están en
   transferencia entre centros y excluye las 13 reservadas y las 45 en
   investigación. De ahí el descuadre de 58 que explica la especificación.
     de las 21 presentes ... 755 + 2 = 757 unidades
     de las 10 ausentes  ...           169 unidades
     total                             926
   Por país: FR 137 · IT 99 · DE 5 · PL 1 · ES 684. */
const multi = [];
GEST.forEach((g,i)=>{
  const q = g.disp + g.tr;
  if(i===0){ multi.push([g.sku,'X','B0','New','FR','137']);
             multi.push([g.sku,'X','B0','New','IT','99']);
             multi.push([g.sku,'X','B0','New','DE','5']);
             multi.push([g.sku,'X','B0','New','PL','1']);
             multi.push([g.sku,'X','B0','New','ES',String(q-242)]); }   // 355 - 242 = 113
  else multi.push([g.sku,'X','B0','New','ES',String(q)]);
});
AUSENTES.forEach(([sku,q])=>multi.push([sku,'X','B0','New','ES',String(q)]));
fs.writeFileSync(path.join(D,'multipais.txt'),
  [HM.join('\t')].concat(multi.map(r=>r.join('\t'))).join('\r\n'));

/* Salud del inventario · lo único que trae fecha, y trae DOS. La de la foto es
   `snapshot-date` (2026-08-22); `Inventory age snapshot date` va dos días por
   detrás (2026-08-20) y NO vale como fecha de la foto. */
const HS = ['snapshot-date','sku','fnsku','asin','product-name','condition','available',
            'fc-transfer','pending-removal-quantity','inv-age-0-to-90-days','sell-through',
            'days-of-supply','marketplace','Total Reserved Quantity','unfulfillable-quantity',
            'estimated-excess-quantity','Inventory age snapshot date',
            'Exempted from Low-Inventory cost coverage fee?',
            'Low-Inventory cost coverage fee applied in current week?'];
const salud = [];
[['FBASPB0101',20],['FBASPB0102',20],['FBASPB0103',15],['FBASPB0105',19],
 ['FBASPB0108',33],['FBASPB0109',13],['FBA0201',20],['FBA0202',20]].forEach(([sku,q])=>{
  salud.push(['2026-08-22',sku,'X','B0','P','New',String(q),'0','0',String(q),'0.5','30','ES','0','0','0',
              '2026-08-20','No','No']);
});
fs.writeFileSync(path.join(D,'salud.txt'),'﻿'+           // este SÍ lleva BOM
  [HS.join('\t')].concat(salud.map(r=>r.join('\t'))).join('\r\n'));

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));
  page.on('console', m => { const t=m.text();
    if(m.type()==='error' && t.indexOf('ERR_')<0 && t.indexOf('Failed to load resource')<0) errors.push('CONSOLE: '+t); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);

  const limpia = ()=>page.evaluate(()=>{ DB=blankDB(); DB.mappings={}; saveDB();
    document.getElementById('fileList').innerHTML=''; refreshAll(); });

  console.log('\n=== B0 · EL CRUCE DE LOS TRES INFORMES ===');
  await limpia();
  await page.setInputFiles('#csvFile', path.join(D,'gestion.txt'));
  await page.waitForTimeout(1200);
  await page.setInputFiles('#csvFile', path.join(D,'multipais.txt'));
  await page.waitForTimeout(1200);
  const C = await page.evaluate(()=>{ const c = stockCruce();
    return {skusG:c.skusGestion, skusM:c.skusMulti, disp:c.totDisp, noDisp:c.totNoDisp,
            total:c.totGestion, multi:c.totMulti, ausentes:c.ausentes,
            soloMulti:c.soloMulti.map(f=>f.sku).sort(), porPais:c.porPais, descuadre:c.descuadre, diferencia:c.diferencia,
            noContado:c.noDisponibleNoContado}; });
  check('B0-1 · el informe de gestión declara 21 referencias y 815 unidades',
    C.skusG===21 && C.total===815, C.skusG+' SKUs · '+C.total+' ud');
  check('B0-2 · el multipaís declara 926 unidades',
    C.multi===926, C.skusM+' SKUs · '+C.multi+' ud');
  check('B0-3 · y el desglose por país es ES 684 · FR 137 · IT 99 · DE 5 · PL 1',
    C.porPais.ES===684 && C.porPais.FR===137 && C.porPais.IT===99 &&
    C.porPais.DE===5 && C.porPais.PL===1, JSON.stringify(C.porPais));
  check('B0-4 · nombra las 10 referencias que el informe de gestión NO trae',
    C.soloMulti.length===10 && C.soloMulti.join(',')===AUSENTES.map(a=>a[0]).sort().join(','),
    C.soloMulti.join(', '));
  check('B0-5 · y sus 169 unidades, el 18 % del stock',
    C.ausentes===169, C.ausentes+' ud = '+(C.ausentes/C.multi*100).toFixed(0)+' % de '+C.multi);
  check('B0-6 · la diferencia bruta entre los dos informes son 111 unidades',
    C.diferencia===111, C.multi+' − '+C.total+' = '+C.diferencia+' ud');
  check('B0-7 · y queda entera explicada: +169 ausentes y −58 que existen y no son «disponibles en un país»',
    C.descuadre===0 && C.noContado===58,
    'sin explicar '+C.descuadre+' ud · no contadas por el multipaís '+C.noContado+' ud'+
    ' · 169 − 58 = '+(C.ausentes-C.noContado));

  console.log('\n=== B1 · LA FOTO NO SE FECHA CON EL DÍA DE HOY ===');
  /* Sin fecha, no se archiva. Es el único daño irreversible del hub: `H.obs`
     no se corrige reimportando, así que más vale no escribir que escribir mal. */
  const sinFecha = await page.evaluate(()=>{
    DB.history = {}; delete DB.settings.stockDate;
    const r = captureStock();
    return {sinFecha:!!r.sinFecha, motivo:r.motivo||'', dias:Object.keys((DB.history||{}).d||{}).length};
  });
  check('B1-1 · sin fecha del informe, el hub se NIEGA a archivar',
    sinFecha.sinFecha===true && sinFecha.dias===0, sinFecha.dias+' días archivados');
  check('B1-2 · y dice por qué', /fecha/i.test(sinFecha.motivo), sinFecha.motivo);

  await page.setInputFiles('#csvFile', path.join(D,'salud.txt'));
  await page.waitForTimeout(1200);
  const conSalud = await page.evaluate(()=>{
    DB.history = {}; delete DB.settings.stockDate;
    const f = stockSnapshotDate(), r = captureStock();
    return {fecha:f.k, src:f.src, archivada:Object.keys((DB.history||{}).d||{}),
            skus:r.skus, hoy:iso(today())};
  });
  check('B1-3 · con el informe de Salud del inventario, la foto se fecha el 2026-08-22',
    conSalud.fecha==='2026-08-22' && conSalud.archivada.indexOf('2026-08-22')>=0,
    conSalud.fecha + ' (hoy es ' + conSalud.hoy + ')');
  check('B1-4 · y NO el 2026-08-20, que es la fecha de antigüedad y va dos días por detrás',
    conSalud.fecha!=='2026-08-20', 'usa snapshot-date, no Inventory age snapshot date');
  check('B1-5 · la fecha sale del informe, no de una suposición',
    conSalud.src==='planning', 'fuente: '+conSalud.src);

  const manual = await page.evaluate(()=>{
    DB.imports.planning = null; delete DB.imports.planning;
    DB.history = {}; DB.settings.stockDate = '2026-08-22';
    const r = captureStock();
    return {skus:r.skus, dias:Object.keys((DB.history||{}).d||{})};
  });
  check('B1-6 · y si no está ese informe, vale la fecha que se indique a mano',
    manual.dias.indexOf('2026-08-22')>=0, manual.dias.join(', '));

  console.log('\n=== B2 · EL STOCK RESERVADO O EN TRÁNSITO DEJA DE SER CERO ===');
  const B2 = await page.evaluate(()=>{
    const c = stockCruce(), I = invStats();
    const d = I.reduce((a,r)=>a+r.qty,0), nd = I.reduce((a,r)=>a+(r.qtyNoDisp||0),0);
    const H = ((DB.history.d||{})['2026-08-22']||{}).k || {};
    const conNoDisp = Object.keys(H).filter(s=>H[s][2]>0).map(s=>({sku:s, arch:H[s]}));
    return {disp:c.totDisp, noDisp:c.totNoDisp, total:c.totGestion,
            invDisp:d, invNoDisp:nd, archivado:conNoDisp,
            dias:Object.keys(DB.history.d||{})};
  });
  check('B2-1 · disponible 755, no disponible 60, total 815 · y son tres números distintos',
    B2.disp===755 && B2.noDisp===60 && B2.total===815 &&
    B2.disp!==B2.total && B2.noDisp!==B2.total,
    B2.disp+' + '+B2.noDisp+' = '+B2.total);
  check('B2-2 · el histórico archiva los tres, no solo el disponible',
    B2.archivado.length===3 && B2.archivado.every(x=>x.arch.length===4),
    B2.archivado.length ? B2.archivado.map(x=>x.sku+' ['+x.arch[0]+' disp, '+x.arch[2]+' no disp, '+x.arch[3]+' total]').join(' · ')
      : 'nada archivado el 2026-08-22 · días en el histórico: '+B2.dias.join(', '));
  check('B2-3 · y la pantalla de inventario no presenta uno como si fuera otro',
    B2.invNoDisp===60, 'invStats declara '+B2.invNoDisp+' unidades presentes sin poder venderse');

  console.log('\n=== B3 · NI UN CERO ARCHIVADO PARA UN SKU QUE OTRO INFORME SÍ TRAE ===');
  const B3 = await page.evaluate(()=>{
    const H = ((DB.history.d||{})['2026-08-22']||{}).k || {}, obs = DB.history.obs||{};
    const aus = ['FBA0116','FBASPB0101','FBASPB0102','FBASPB0103','FBASPB0104','FBASPB0105',
                 'FBASPB0107','FBASPB0108','FBASPB0109','FBASPB0110'];
    return {archivadosACero: aus.filter(s=>H[s] && H[s][0]<=0),
            noArchivados:    aus.filter(s=>!H[s]),
            unidades:        aus.reduce((a,s)=>a+((H[s]&&H[s][0])||0),0),
            roturas:         aus.filter(s=>obs[s] && obs[s].z>0)};
  });
  check('B3-1 · ninguna de las diez ausentes se archiva a cero',
    B3.archivadosACero.length===0, B3.archivadosACero.join(', ')||'ninguna');
  check('B3-2 · se archivan con las unidades que declara el multipaís: 169',
    B3.unidades===169, B3.unidades+' ud');
  check('B3-3 · y ninguna queda marcada en rotura',
    B3.roturas.length===0, B3.roturas.join(', ')||'ninguna · con el fallo eran rotura permanente');

  console.log('\n=== B4 · LA DEVOLUCIÓN YA NO DEPENDE DE UN UMBRAL BINARIO ===');
  /* Un SKU que vendió el mes pasado y devuelve este: con el umbral antiguo su
     devolución costaba 0 € porque no había ventas suyas en el periodo. La misma
     devolución cuesta 0 € o cuesta todo según haya habido una venta más o una
     menos. Ahora se imputa al periodo en que se produjo, con el precio medio de
     la ventana más larga disponible, y se dice que la venta cae fuera. */
  await limpia();
  const B4 = await page.evaluate(`(()=>{
    DB = blankDB();
    DB.products = [{id:'v', sku:'VIEJO', name:'Vendido el mes pasado', cogs:4, freight:0,
                    fba:2.18, referral:15, price:20, channel:'FBA', lots:[]},
                   {id:'a', sku:'ACTUAL', name:'Se vende ahora', cogs:4, freight:0,
                    fba:2.18, referral:15, price:20, channel:'FBA', lots:[]}];
    const hoy=new Date(); const dia=k=>{const d=new Date(hoy); d.setDate(d.getDate()-k);
      return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
    const venta=(d,sku,q)=>({amazonorderid:'o'+d+sku, purchasedate:d+'T10:00:00+00:00',
      fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:sku, asin:'B0',
      itemstatus:'Shipped', quantity:String(q), currency:'EUR',
      itemprice:String(20*q), itemtax:'0', shipcountry:'ES'});
    DB.imports.orders = {count:2, file:'o', rows:[venta(dia(120),'VIEJO',10), venta(dia(5),'ACTUAL',10)]};
    DB.imports.returns = {count:2, file:'d', rows:[
      {returndate:dia(3)+'T10:00:00+00:00', orderid:'r1', sku:'VIEJO', quantity:'2',
       detaileddisposition:'SELLABLE', reason:'JEWELRY_TOO_SMALL', status:'Unit returned to inventory'},
      {returndate:dia(3)+'T10:00:00+00:00', orderid:'r2', sku:'ACTUAL', quantity:'1',
       detaileddisposition:'SELLABLE', reason:'JEWELRY_TOO_LARGE', status:'Unit returned to inventory'}]};
    periodDays = 30; countryFilter='ALL';
    const P = pnl(), R = skuStats();
    const v = R.filter(r=>r.sku==='VIEJO')[0] || null;
    return {coste:+P.returnsCost.toFixed(2), descartadas:P.retDescartadas,
            fuera:P.retFueraDePeriodo, motivos:P.retPorMotivo,
            viejoEnTabla: !!v, viejoReturns: v ? +v.returns.toFixed(2) : null,
            suma:+(R.reduce((a,r)=>a+r.profit,0)+P.noImputable).toFixed(2),
            profit:+P.profit.toFixed(2)};
  })()`);
  check('B4-1 · la devolución de un SKU sin ventas en el periodo ya NO se descarta',
    B4.descartadas===0 && B4.coste>0, 'descartadas '+B4.descartadas+' ud · coste '+B4.coste+' €');
  check('B4-2 · se marca que su venta original cae fuera del periodo',
    B4.fuera===2, B4.fuera+' unidades cobradas con el precio del histórico');
  check('B4-3 · y aparece en la tabla por SKU con su coste, no en blanco',
    B4.viejoEnTabla && n(B4.viejoReturns)>0, 'VIEJO · '+B4.viejoReturns+' € de devoluciones');
  check('B4-4 · el desglose por motivo está, que es la señal de negocio',
    B4.motivos.JEWELRY_TOO_SMALL===2 && B4.motivos.JEWELRY_TOO_LARGE===1,
    JSON.stringify(B4.motivos));
  check('B4-5 · y la coherencia con el P&L aguanta el cambio',
    near(B4.suma, B4.profit), B4.suma+' € vs '+B4.profit+' € del P&L');

  console.log('\n=== B5 · LA CURVA DE CAJA DESCUENTA LAS DEVOLUCIONES ===');
  const B5 = await page.evaluate(`(()=>{
    const conDev = cashProjection();
    const minCon = Math.min.apply(null, conDev.map(x=>x.bal));
    const finCon = conDev[conDev.length-1].bal;
    const dr = conDev.meta.dayReturns;
    const guardadas = DB.imports.returns;
    DB.imports.returns = {count:0, file:'', rows:[]};
    const sinDev = cashProjection();
    const minSin = Math.min.apply(null, sinDev.map(x=>x.bal));
    const finSin = sinDev[sinDev.length-1].bal;
    DB.imports.returns = guardadas;
    return {minCon:+minCon.toFixed(2), minSin:+minSin.toFixed(2),
            finCon:+finCon.toFixed(2), finSin:+finSin.toFixed(2),
            dayReturns:+dr.toFixed(4), coste:+conDev.meta.returnsCost.toFixed(2)};
  })()`);
  check('B5-1 · la curva carga un flujo diario de devoluciones',
    B5.dayReturns>0, B5.dayReturns+' €/día · coste del periodo '+B5.coste+' €');
  check('B5-2 · y con devoluciones la caja final es MENOR que sin ellas',
    B5.finCon < B5.finSin - 1,
    'con '+B5.finCon+' € vs sin '+B5.finSin+' € · diferencia '+(B5.finSin-B5.finCon).toFixed(2)+' €');
  check('B5-3 · el mínimo también baja, que es el número con el que se pide financiación',
    B5.minCon < B5.minSin - 1, 'mínimo con '+B5.minCon+' € vs sin '+B5.minSin+' €');

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  try{ fs.rmSync(D,{recursive:true,force:true}); }catch(e){}
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
