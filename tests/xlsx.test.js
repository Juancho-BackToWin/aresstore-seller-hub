#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   PUBLICIDAD EN .XLSX, Y VARIOS INFORMES QUE SE PISAN

   Por qué existe esta suite. Juancho tiene quince informes de términos de
   búsqueda descargados en .xlsx, de mayo de 2025 a agosto de 2026. El hub los
   rechazaba todos. Leerlos abre tres puertas a números creíbles y falsos, y
   cada una tiene aquí su prueba:

   X-A · El libro, con las rarezas que trae el de Amazon: `<dimension>` de UNA
         celda con mil filas, fechas como número de serie con formato
         «MMM dd, yyyy», números en notación científica, filas ocultas por un
         filtro, comillas dentro de un término y celdas con error.
   X-B · Dos informes que cubren los mismos días. El importador quita filas
         IDÉNTICAS, pero dos periodos distintos agregan los días de otra forma:
         no hay dos filas iguales y el gasto de los días comunes contaba dos
         veces. Medido en los informes reales: el de julio de 2025 y el de
         «septiembre» se pisan del 6 al 23 de julio en España.
   X-C · Dos informes separados por meses. El ritmo diario con que se rellenan
         los días sin informe se dividía por los días de punta a punta, huecos
         incluidos, y salía a una fracción del real.

   Las fixtures se generan aquí, con fechas relativas a hoy y cifras inventadas
   y redondas. Ningún informe real entra en el repositorio: es público.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const zlib = require('zlib');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const n2 = (x,d)=> (typeof x==='number' && isFinite(x)) ? x.toFixed(d==null?2:d) : '—';

const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-fixtures-'));

/* ── Un ZIP mínimo, escrito a mano para controlar cada byte ───────────────── */
function zip(ficheros){
  const locales = [], central = [];
  let off = 0;
  for(const [nombre, contenido] of ficheros){
    const nom = Buffer.from(nombre, 'utf8');
    const crudo = Buffer.from(contenido, 'utf8');
    const comp = zlib.deflateRawSync(crudo);
    const crc = zlib.crc32(crudo) >>> 0;
    const L = Buffer.alloc(30);
    L.writeUInt32LE(0x04034b50,0); L.writeUInt16LE(20,4); L.writeUInt16LE(0,6); L.writeUInt16LE(8,8);
    L.writeUInt32LE(crc,14); L.writeUInt32LE(comp.length,18); L.writeUInt32LE(crudo.length,22);
    L.writeUInt16LE(nom.length,26); L.writeUInt16LE(0,28);
    locales.push(L, nom, comp);
    const C = Buffer.alloc(46);
    C.writeUInt32LE(0x02014b50,0); C.writeUInt16LE(20,4); C.writeUInt16LE(20,6); C.writeUInt16LE(0,8);
    C.writeUInt16LE(8,10); C.writeUInt32LE(crc,16); C.writeUInt32LE(comp.length,20);
    C.writeUInt32LE(crudo.length,24); C.writeUInt16LE(nom.length,28); C.writeUInt32LE(off,42);
    central.push(C, nom);
    off += 30 + nom.length + comp.length;
  }
  const cen = Buffer.concat(central);
  const E = Buffer.alloc(22);
  E.writeUInt32LE(0x06054b50,0); E.writeUInt16LE(ficheros.length,8); E.writeUInt16LE(ficheros.length,10);
  E.writeUInt32LE(cen.length,12); E.writeUInt32LE(off,16);
  return Buffer.concat([...locales, cen, E]);
}

/* Serie de Excel de hace k días (base 1900). */
const serie = k => { const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-k);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())/86400000) + 25569; };
const isoHace = k => { const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-k);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const xe = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* El libro de X-A. Copia la forma del de Amazon de agosto de 2026: cabeceras
   en `inlineStr`, estilo 2 = fecha «MMM dd, yyyy», `<dimension ref="A1"/>`. */
function libroAmazon(){
  const CAB = ['Fecha de inicio','Fecha de finalización','Nombre de la cartera','Divisa','Nombre de campaña',
    'Nombre del grupo de anuncios','País','Segmentación','Tipo de coincidencia','Término de búsqueda de cliente',
    'Impresiones','Clics','Índice de clics (CTR)','Coste por clic (CPC)','Gasto','Ventas totales de 7 días (€)',
    'Pedidos totales de 7 días (#)'];
  const col = i => String.fromCharCode(65+i);
  const is = (r,i,v) => '<c r="'+col(i)+r+'" t="inlineStr"><is><t>'+xe(v)+'</t></is></c>';
  const n  = (r,i,v,s) => '<c r="'+col(i)+r+'"'+(s!=null?' s="'+s+'"':'')+' t="n"><v>'+v+'</v></c>';
  const filas = ['<row r="1">'+CAB.map((c,i)=>is(1,i,c)).join('')+'</row>'];
  /* Cuatro filas de datos. Gasto: 2,00 + 3,00 + 0,05 + 4,95 = 10,00 €.
     · la 3.ª escribe el gasto en notación científica, «5E-2» = 0,05 €. Un
       lector que lo pasara tal cual a `toNum` leería «5-2» → 5,00 € y el total
       saldría 14,95 €.
     · la 2.ª va OCULTA (un filtro de Excel): es un dato y cuenta.
     · la 4.ª lleva comillas dentro del término: «pulsera 18"».
     · la 2.ª lleva un #N/A en el CTR: se deja vacío, no es un cero que mida.
     Fechas: todas de hace 5 días, de un día. */
  const datos = [
    {k:5, term:'pulsera cuero', g:'2', v:'20', p:'1', ctr:'4.1892940263770374E-3'},
    {k:5, term:'pulsera plata', g:'3', v:'0',  p:'0', ctr:null, oculta:true},
    {k:5, term:'pulsera hilo',  g:'5E-2', v:'0', p:'0', ctr:'0.01'},
    {k:5, term:'pulsera 18"',   g:'4.95', v:'10', p:'1', ctr:'0.02'}
  ];
  datos.forEach((d,j)=>{
    const r = j+2;
    const c = [n(r,0,serie(d.k),2), n(r,1,serie(d.k),2), is(r,2,'No Portfolio'), is(r,3,'EUR'),
      is(r,4,'Pulseras ES'), is(r,5,'Pulseras ES'), is(r,6,'España'), is(r,7,'close-match'), is(r,8,'-'),
      is(r,9,d.term), n(r,10,'100',4), n(r,11,'10',4),
      d.ctr==null ? '<c r="M'+r+'" t="e"><v>#N/A</v></c>' : n(r,12,d.ctr,1),
      n(r,13,'0.2',3), n(r,14,d.g,3), n(r,15,d.v,3), n(r,16,d.p,4)];
    filas.push('<row r="'+r+'"'+(d.oculta?' hidden="1"':'')+'>'+c.join('')+'</row>');
  });
  const hoja = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<dimension ref="A1"/><sheetData>'+filas.join('')+'</sheetData></worksheet>';
  const estilos = '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.0000%"/><numFmt numFmtId="165" formatCode="MMM dd, yyyy"/>'+
    '<numFmt numFmtId="166" formatCode="[$€-en-US]#,##0.00"/></numFmts>'+
    '<cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="166"/><xf numFmtId="1"/></cellXfs></styleSheet>';
  const wb = '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '+
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Términos" sheetId="1" r:id="rId3"/></sheets></workbook>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
  return zip([['[Content_Types].xml','<?xml version="1.0"?><Types/>'], ['xl/workbook.xml', wb],
    ['xl/_rels/workbook.xml.rels', rels], ['xl/styles.xml', estilos],
    ['xl/sharedStrings.xml','<?xml version="1.0"?><sst count="0" uniqueCount="0"/>'],
    ['xl/worksheets/sheet1.xml', hoja]]);
}

/* TSV de términos para X-B y X-C. `filas` = [{d,h,camp,pais,term,g,v}], d y h en
   «hace k días». */
function tsv(filas){
  const CAB = ['Fecha de inicio','Fecha de finalización','Divisa','Nombre de campaña','País',
               'Término de búsqueda de cliente','Impresiones','Clics','Gasto','Ventas totales de 7 días (€)',
               'Pedidos totales de 7 días (#)'];
  return [CAB.join('\t')].concat(filas.map(f=>[isoHace(f.d), isoHace(f.h), 'EUR', f.camp, f.pais||'',
    f.term, '100', '10', String(f.g), String(f.v||0), f.v ? '1' : '0'].join('\t'))).join('\n');
}

fs.writeFileSync(path.join(FIX,'amazon.xlsx'), libroAmazon());
fs.writeFileSync(path.join(FIX,'fecha-iso.xlsx'), (()=>{
  const cab = ['Fecha de inicio','Fecha de finalización','Divisa','Nombre de campaña','Término de búsqueda de cliente','Impresiones','Clics','Gasto'];
  const is = (c,v)=>'<c r="'+c+'" t="inlineStr"><is><t>'+xe(v)+'</t></is></c>';
  const r1 = '<row r="1">'+cab.map((v,i)=>is(String.fromCharCode(65+i)+'1',v)).join('')+'</row>';
  /* Con estilo de fecha (s="1"): es donde fallaba, porque el lector trataba la
     celda como número de serie y `Number('2026-…')` da NaN. */
  const r2 = '<row r="2"><c r="A2" s="1" t="d"><v>'+isoHace(5)+'T00:00:00</v></c><c r="B2" s="1" t="d"><v>'+isoHace(5)+'T00:00:00</v></c>'+
    is('C2','EUR')+is('D2','X')+is('E2','fecha iso')+'<c r="F2"><v>10</v></c><c r="G2"><v>2</v></c><c r="H2"><v>1.5</v></c></row>';
  return zip([['xl/workbook.xml','<workbook><sheets><sheet name="H" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/styles.xml','<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml','<worksheet><sheetData>'+r1+r2+'</sheetData></worksheet>']]);
})());
fs.writeFileSync(path.join(FIX,'viejo.xls'), Buffer.from('D0CF11E0', 'hex'));

/* X-B · dos informes que se pisan.
   Informe A: campaña «C», 1,00 €/día de hace 20 a hace 6 (15 filas de un día =
              15,00 €), y campaña «Solo A», 2,00 € hace 8.
   Informe B: campaña «C», UNA fila agregada de hace 10 a hace 1 (10 días) por
              10,00 €.
   B llega más lejos → manda en «C» los días de hace 10 a hace 1. De A, en «C»,
   solo cuentan hace 20…11 = 10 días = 10,00 €. Total en «C»: 10 + 10 = 20,00 €.
   Sumando sin más saldría 15 + 10 = 25,00 €: 5,00 € contados dos veces.
   «Solo A» no está en B: cuenta entera, 2,00 €. Bruto total esperado: 22,00 €.
   Y una campaña con el MISMO nombre en otro país no se pisa:
   A trae «D» en España hace 3 (1,00 €) — ojo, A acaba hace 6, así que esa fila
   alarga A hasta hace 3 — y B trae «D» en Italia hace 3 (1,00 €). Son dos
   campañas: las dos cuentan. Total bruto esperado: 22 + 2 = 24,00 €.
   Con la fila de «D» de A llegando a hace 3, A cubre hace 20…3 y B hace 10…1:
   B sigue llegando más lejos y la cuenta de «C» no cambia. */
const A = []; for(let k=20;k>=6;k--) A.push({d:k,h:k,camp:'C',pais:'España',term:'t'+k,g:1});
A.push({d:8,h:8,camp:'Solo A',pais:'España',term:'solo',g:2});
A.push({d:3,h:3,camp:'D',pais:'España',term:'d es',g:1});
const B = [{d:10,h:1,camp:'C',pais:'España',term:'agregada',g:10},
           {d:3,h:3,camp:'D',pais:'Italia',term:'d it',g:1}];
fs.writeFileSync(path.join(FIX,'informe-A.txt'), tsv(A));
fs.writeFileSync(path.join(FIX,'informe-B.txt'), tsv(B));

/* X-C · dos informes separados por un hueco.
   Antiguo: 10 filas de 1,00 € de hace 109 a hace 100 (10 días).
   Reciente: 10 filas de 1,00 € de hace 10 a hace 1 (10 días).
   Días cubiertos: 20. Ritmo diario: 20 € / 20 días = 1,00 €/día.
   De punta a punta serían 109 días y 0,18 €/día: un ritmo cinco veces y media
   más bajo, que es con el que se rellenarían los días sin informe. */
const V1=[], V2=[];
for(let k=109;k>=100;k--) V1.push({d:k,h:k,camp:'E',pais:'España',term:'e'+k,g:1});
for(let k=10;k>=1;k--)   V2.push({d:k,h:k,camp:'E',pais:'España',term:'e'+k,g:1});
fs.writeFileSync(path.join(FIX,'antiguo.txt'), tsv(V1));
fs.writeFileSync(path.join(FIX,'reciente.txt'), tsv(V2));
const V3=[]; for(let k=109;k>=100;k--) V3.push({d:k,h:k,camp:'E',pais:'España',term:'e'+k,g:5});
fs.writeFileSync(path.join(FIX,'antiguo-caro.txt'), tsv(V3));

/* ── Fixtures de la revisión adversarial del 3-10-2026 ──────────────────────
   R1 · Informe largo de hace 200 a hace 5 a 2,00 €/día y un informe de UN día
        (hace 2) con 40,00 € —un pico de Prime Day—. Con el ritmo del último
        tramo y el tope de todos los días medidos, a 365 días se extrapolaban
        6.720 €. Ahora: muestra mínima de 7 días con informe (hace 2 y hace 5…10)
        = (40 + 6×2)/7 = 7,43 €/día, estirado como mucho 7 días = 52,00 €. */
const L1=[]; for(let k=200;k>=5;k--) L1.push({d:k,h:k,camp:'L',pais:'España',term:'l'+k,g:2});
fs.writeFileSync(path.join(FIX,'largo.txt'), tsv(L1));
fs.writeFileSync(path.join(FIX,'pico.txt'), tsv([{d:2,h:2,camp:'L',pais:'España',term:'pico',g:40}]));
/* R3 · el mismo informe con «España» y con «Spain»: 10,00 €, no 20,00 €. */
const P1=[], P2=[]; for(let k=10;k>=1;k--){ P1.push({d:k,h:k,camp:'P',pais:'España',term:'p'+k,g:1});
  P2.push({d:k,h:k,camp:'P',pais:'Spain',term:'p'+k+' ',g:1}); }
fs.writeFileSync(path.join(FIX,'pais-es.txt'), tsv(P1));
fs.writeFileSync(path.join(FIX,'pais-en.txt'), tsv(P2));
/* R5 · un informe con las campañas A y B (hace 60…5) y otro solo con B
        (hace 4…1): A no sale en el más reciente y tiene que decirse. */
const C1=[], C2=[]; for(let k=60;k>=5;k--){ C1.push({d:k,h:k,camp:'Campaña A',pais:'España',term:'a'+k,g:5});
  C1.push({d:k,h:k,camp:'Campaña B',pais:'España',term:'b'+k,g:5}); }
for(let k=4;k>=1;k--) C2.push({d:k,h:k,camp:'Campaña B',pais:'España',term:'b'+k,g:5});
fs.writeFileSync(path.join(FIX,'dos-campanas.txt'), tsv(C1));
fs.writeFileSync(path.join(FIX,'solo-b.txt'), tsv(C2));

(async () => {
  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname,'..','index.html'));
  await page.waitForTimeout(700);
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);

  const ev = async (src) => {
    try{ return await page.evaluate(src); }
    catch(e){ return {__err: String((e && e.message) || e).split('\n')[0].slice(0,140)}; }
  };
  const err = r => (r && r.__err) ? 'sin el arreglo: '+r.__err : undefined;
  const limpiar = async ()=>{
    await page.evaluate(()=>{ DB.imports={}; DB.mappings={}; saveDB();
      const l=document.getElementById('fileList'); if(l) l.innerHTML=''; refreshAll(); go('datos'); });
    await page.waitForTimeout(200);
  };
  /* Cargar varios ficheros UNO DETRÁS DE OTRO, como haría una persona: cada uno
     entra como un fichero distinto del mismo informe. Se espera a que no quede
     ninguno «leyendo…», con tope. */
  const cargar = async (...nombres)=>{
    for(const n of nombres){
      await page.setInputFiles('#csvFile', []);
      await page.setInputFiles('#csvFile', path.resolve(FIX, n));
      for(let i=0;i<40;i++){
        await page.waitForTimeout(150);
        const leyendo = await page.evaluate(()=>Array.from(document.querySelectorAll('#fileList .f-meta'))
          .some(e=>/leyendo/.test(e.textContent)));
        if(!leyendo) break;
      }
      await page.waitForTimeout(150);
    }
  };
  const estado = ()=>ev(`(()=>{ const st=DB.imports.searchterm||{};
    return {filas:st.count||0, ficheros:(st.ficheros||[]).length,
      metas:Array.from(document.querySelectorAll('#fileList .fileitem')).map(e=>e.textContent)}; })()`);

  console.log('\n=== X-A · EL LIBRO DE AMAZON, CON SUS RAREZAS ===');
  await limpiar();
  await cargar('amazon.xlsx');
  const a = await estado();
  check('el .xlsx se reconoce como informe de términos de búsqueda', a.filas>0,
    a.filas+' filas · '+(a.metas||[]).join(' | ').slice(0,160));
  check('con las cuatro filas, aunque la cabecera del libro declare una sola celda', a.filas===4, a.filas+' filas');
  /* Periodo «Todo» para no depender de la ventana: 2+3+0,05+4,95 = 10,00 €. */
  const ga = await ev(`(()=>{ periodDays=3650; const A=pubAdStats();
    return {bruto:A.spendBruto, desde:A.desde?iso(A.desde):null, hasta:A.hasta?iso(A.hasta):null,
            terms:A.terms.map(t=>t.term)}; })()`);
  check('el gasto total es 10,00 € (el «5E-2» son 0,05 €, no 5,00 €)',
    !ga.__err && Math.abs(ga.bruto-10)<0.005, err(ga) || n2(ga.bruto)+' € (con el fallo saldría 14,95 €)');
  check('las fechas de serie salen como el día que son', ga.desde===isoHace(5) && ga.hasta===isoHace(5),
    err(ga) || (ga.desde+' → '+ga.hasta+' · esperado '+isoHace(5)));
  check('la fila oculta por un filtro de Excel cuenta', (ga.terms||[]).indexOf('pulsera plata')>=0,
    err(ga) || (ga.terms||[]).join(', '));
  check('el término con comillas llega entero', (ga.terms||[]).indexOf('pulsera 18"')>=0,
    err(ga) || (ga.terms||[]).join(', '));
  check('y la pantalla dice que había una fila oculta y una celda con error',
    (a.metas||[]).some(m=>/oculta/.test(m) && /error/.test(m)), (a.metas||[]).join(' | ').slice(0,200));

  await limpiar();
  await cargar('viejo.xls');
  const x = await estado();
  check('un .xls antiguo no se traga: se dice qué hacer', x.filas===0 && (x.metas||[]).some(m=>/\.xls antiguo/.test(m)),
    (x.metas||[]).join(' | ').slice(0,140));

  console.log('\n=== X-B · DOS INFORMES QUE SE PISAN NO CUENTAN DOS VECES ===');
  await limpiar();
  await cargar('informe-A.txt', 'informe-B.txt');
  const b0 = await estado();
  check('los dos ficheros entran como dos ficheros del mismo informe', b0.ficheros===2, b0.ficheros+' ficheros · '+b0.filas+' filas');
  const gb = await ev(`(()=>{ periodDays=3650; const A=pubAdStats();
    const camp = n => A.terms.filter(t=>t.campaign===n).reduce((s,t)=>s+t.spendTot,0);
    return {bruto:A.spendBruto, C:camp('C'), soloA:camp('Solo A'), D:camp('D'),
            solape:A.gastoSolape, dias:A.diasSolape}; })()`);
  check('el gasto bruto es 24,00 €, no 29,00 €', !gb.__err && Math.abs(gb.bruto-24)<0.005,
    err(gb) || n2(gb.bruto)+' € (sumando sin más: 29,00 €)');
  check('en la campaña que se pisa, 20,00 € y no 25,00 €', Math.abs(gb.C-20)<0.005, n2(gb.C)+' €');
  check('la campaña que solo trae un informe cuenta entera', Math.abs(gb.soloA-2)<0.005, n2(gb.soloA)+' €');
  check('una campaña con el mismo nombre en otro país no se pisa: 2,00 €', Math.abs(gb.D-2)<0.005, n2(gb.D)+' €');
  check('y se dice cuánto ha quedado fuera por solape: 5,00 € en 5 días',
    Math.abs(gb.solape-5)<0.005 && gb.dias===5, n2(gb.solape)+' € · '+gb.dias+' días');
  await page.evaluate(()=>go('publicidad'));
  await page.waitForTimeout(400);
  const txtB = await page.evaluate(()=>document.body.innerText);
  check('la pantalla de Publicidad lo avisa', /se pisan/.test(txtB), /se pisan/.test(txtB) ? 'aviso visible' : 'sin aviso');

  /* El orden de carga no puede cambiar el resultado. */
  await limpiar();
  await cargar('informe-B.txt', 'informe-A.txt');
  const gb2 = await ev(`(()=>{ periodDays=3650; return pubAdStats().spendBruto; })()`);
  check('cargados en el otro orden, la misma cifra', typeof gb2==='number' && Math.abs(gb2-24)<0.005, n2(gb2)+' €');

  /* Un solo fichero: nada cambia respecto a antes de esta regla. */
  await limpiar();
  await cargar('informe-A.txt');
  const g1 = await ev(`(()=>{ periodDays=3650; const A=pubAdStats(); return {b:A.spendBruto, s:A.gastoSolape}; })()`);
  check('con un solo informe no se quita nada', Math.abs(g1.b-18)<0.005 && !(g1.s>0), n2(g1.b)+' € · solape '+n2(g1.s));

  console.log('\n=== X-C · EL RITMO DIARIO SE DIVIDE POR DÍAS CON INFORME, NO POR EL CALENDARIO ===');
  await limpiar();
  await cargar('antiguo.txt', 'reciente.txt');
  const gc = await ev(`(()=>{ periodDays=30; const A=pubAdStats(); return {adDays:A.adDays, bruto:A.spendBruto,
      extra:A.spendExtrapolado, extDias:A.diasExtrapolados}; })()`);
  check('los informes cubren 20 días, no 109', gc.adDays===20, err(gc) || gc.adDays+' días');
  /* A 30 días: el informe reciente mide 10 días de la ventana (hace 10…1) y
     quedan 20 por cubrir. Se rellenan al ritmo de 1,00 €/día → 20,00 €.
     Con el divisor de 109 días: 20 días × 20/109 = 3,67 €.
     OJO: a 365 días las dos fórmulas dan 20,00 € por casualidad (se estiran
     tantos días como el divisor), y la prueba pasaba sin el arreglo. Por eso
     va a 30. */
  /* Desde la revisión adversarial, un ritmo se estira como mucho los días que
     lo sostienen: el tramo reciente son 10 días, así que se rellenan 10 de los
     20 a 1,00 €/día = 10,00 €, y los otros 10 quedan sin dato y se dicen. */
  check('y se extrapola al ritmo real, 1,00 €/día, tantos días como lo sostienen: 10,00 €', Math.abs(gc.extra-10)<0.005,
    n2(gc.extra)+' € en '+gc.extDias+' días (con el fallo, 3,67 €)');

  /* X-D · EL RITMO ES EL DEL ÚLTIMO TRAMO, NO EL DE TODO EL HISTÓRICO.
     Antiguo: 10 días a 5,00 € (hace 109…100) = 50 €. Reciente: 10 días a 1,00 €
     (hace 10…1) = 10 €. Media del histórico: 60 € / 20 días = 3,00 €/día.
     Ritmo del último tramo: 1,00 €/día. A 30 días quedan 20 sin informe:
     20,00 € con el tramo, 60,00 € con la media. Es el fallo medido con los
     informes reales: la media de 2025 rellenando un mes de 2026. */
  console.log('\n=== X-D · LOS DÍAS SIN INFORME SE RELLENAN AL RITMO MÁS RECIENTE ===');
  await limpiar();
  await cargar('antiguo-caro.txt', 'reciente.txt');
  const gd = await ev(`(()=>{ periodDays=30; const A=pubAdStats(); return {extra:A.spendExtrapolado, ritmo:A.ritmoDiario,
      tramo:A.diasTramo, sinDato:A.diasSinDato}; })()`);
  check('el ritmo es el del último tramo continuo: 1,00 €/día en 10 días', !gd.__err && Math.abs(gd.ritmo-1)<0.005 && gd.tramo===10,
    err(gd) || n2(gd.ritmo)+' €/día · tramo de '+gd.tramo+' días');
  /* Y el ritmo de 10 días se estira, como mucho, 10 días: 10,00 €; los otros
     10 días quedan sin dato y se dicen. Con la media del histórico y el tope
     de todos los días medidos salían 60,00 €. */
  check('y de los 20 días sin informe, 10 se rellenan a ese ritmo: 10,00 €, no 60,00 €', Math.abs(gd.extra-10)<0.005,
    err(gd) || n2(gd.extra)+' € (con la media del histórico, 60,00 €)');
  await limpiar();
  await cargar('reciente.txt');
  const g1r = await ev(`(()=>{ periodDays=30; const A=pubAdStats(); return {extra:A.spendExtrapolado, ritmo:A.ritmoDiario}; })()`);
  check('con un solo informe, el ritmo es el del informe entero, como siempre',
    Math.abs(g1r.ritmo-1)<0.005 && Math.abs(g1r.extra-10)<0.005, n2(g1r.ritmo)+' €/día · '+n2(g1r.extra)+' € extrapolados');

  console.log('\n=== X-E · REVISIÓN ADVERSARIAL DEL 3-10-2026 ===');
  await limpiar(); await cargar('largo.txt', 'pico.txt');
  const r1 = await ev(`(()=>{ periodDays=365; const A=pubAdStats(); return {extra:A.spendExtrapolado, ritmo:A.ritmoDiario, tramo:A.diasTramo}; })()`);
  check('R1 · un pico de un día no se estira a cientos de días: 52,00 € extrapolados, no 6.720 €',
    !r1.__err && Math.abs(r1.extra-52)<0.01 && r1.tramo===7, err(r1) || n2(r1.extra)+' € · ritmo '+n2(r1.ritmo)+' €/día · muestra '+r1.tramo+' días');
  await limpiar(); await cargar('pais-es.txt', 'pais-en.txt');
  const r3 = await ev(`(()=>{ periodDays=3650; return pubAdStats().spendBruto; })()`);
  check('R3 · «España» y «Spain» son el mismo país: 10,00 €, no 20,00 €', typeof r3==='number' && Math.abs(r3-10)<0.005, n2(r3)+' €');
  await limpiar(); await cargar('dos-campanas.txt', 'solo-b.txt');
  const r5 = await ev(`(()=>{ periodDays=30; return pubAdStats().campanasFuera||null; })()`);
  check('R5 · la campaña que no sale en el informe más reciente se nombra', Array.isArray(r5) && r5.indexOf('Campaña A')>=0 && r5.indexOf('Campaña B')<0,
    JSON.stringify(r5));
  await page.evaluate(()=>go('publicidad')); await page.waitForTimeout(300);
  check('R5 · y la pantalla lo avisa', /no sale en él/.test(await page.evaluate(()=>document.body.innerText)), 'aviso en Publicidad');
  const r7 = await ev(`xlsxTexto('<r><t/></r><r><t xml:space="preserve">Pulseras</t></r>')`);
  check('R7 · un trozo de texto vacío «<t/>» no se come el texto de al lado', r7==='Pulseras', JSON.stringify(r7));
  const r9 = await ev(`[xlsxNum('1E+21'), xlsxNum('-2.5E-3'), xlsxNum('12')]`);
  check('R9 · números grandes y pequeños, en decimal', Array.isArray(r9) && r9[0]==='1000000000000000000000' && r9[1]==='-0.0025' && r9[2]==='12',
    JSON.stringify(r9));
  await limpiar(); await cargar('fecha-iso.xlsx');
  const r8 = await ev(`(()=>{ const F=pubFilas(); return F.length ? (F[0].desde?iso(F[0].desde):null) : 'sin filas'; })()`);
  check('R8 · una fecha guardada como ISO («t=\"d\"») se lee como fecha', r8===isoHace(5), JSON.stringify(r8)+' · esperado '+isoHace(5));

  check('sin errores de JS en toda la sesión', errors.length===0, errors.slice(0,3).join(' | ') || 'limpio');
  await browser.close();
  console.log(fails ? '\n✗ '+fails+' fallos' : '\n✓ todo correcto');
  process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
