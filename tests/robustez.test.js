/* =========================================================================
   Robustez del importador · los cuatro informes de los que come el negocio

   Las fixtures de `npm run fixtures` son limpias: UTF-8, saltos de línea de
   Unix, números con punto decimal. Los ficheros que Amazon entrega de verdad no
   siempre lo son, y cada manía de las de abajo es una que Amazon tiene.

   Lo que se comprueba no es que el fichero se «reconozca». Es que los NÚMEROS
   que salen sean los mismos que con el fichero limpio. Un informe reconocido
   del que no se lee nada es peor que uno rechazado: el rechazado se ve.

   El caso base, en todas las variantes de pedidos:
     10 unidades a 121,00 € con IVA  →  bruto 1.210,00 · IVA 210,00
   ========================================================================= */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'robustez-'));
const iso = d => d.toISOString().slice(0,10);
const ago = k => { const d=new Date(); d.setDate(d.getDate()-k); return d; };
const esc = (v,d) => /["\n\r]/.test(v)||String(v).includes(d) ? '"'+String(v).split('"').join('""')+'"' : v;
const tabla = (h, rows, o={}) => {
  const {delim='\t', eol='\n', bom=false, enc='utf8', trailing=''} = o;
  const txt = [h.map(x=>esc(String(x),delim)).join(delim)]
    .concat(rows.map(r=>r.map(x=>esc(String(x),delim)).join(delim))).join(eol)+eol+trailing;
  return Buffer.from((bom?'﻿':'')+txt, enc);
};
const utf16le = buf => Buffer.concat([Buffer.from([0xFF,0xFE]),
                                      Buffer.from(buf.toString('utf8'),'utf16le')]);
const w = (n, buf) => { fs.writeFileSync(path.join(D,n), buf); return path.join(D,n); };

/* ---------- Todos los pedidos, 33 columnas reales ---------- */
const ordH=['amazon-order-id','merchant-order-id','purchase-date','last-updated-date','order-status',
 'fulfillment-channel','sales-channel','order-channel','ship-service-level','product-name','sku','asin',
 'item-status','quantity','currency','item-price','item-tax','shipping-price','shipping-tax','gift-wrap-price',
 'gift-wrap-tax','item-promotion-discount','ship-promotion-discount','ship-city','ship-state','ship-postal-code',
 'ship-country','promotion-ids','cpf','is-business-order','purchase-order-number','price-designation',
 'signature-confirmation-recommended'];
const ord=(oid,q,precio,iva,estado='Shipped')=>['171-'+oid,'',iso(ago(5))+'T09:12:44+00:00',
 iso(ago(4))+'T11:00:00+00:00','Shipped','Amazon','Amazon.es','','Expedited','Rodillo de masaje',
 'ARS-ROD-01','B0TEST0',estado,String(q),'EUR',precio,iva,'0','0','0','0','0','0','Madrid','','28001',
 'ES','','','false','','',''];
const BASE=[ord('2000001-1000001',10,'1210.00','210.00')];

const PEDIDOS = [
  ['limpio, de referencia',        w('00.txt', tabla(ordH,BASE))],
  ['con BOM y saltos de Windows',  w('01.txt', tabla(ordH,BASE,{bom:true,eol:'\r\n'}))],
  ['en UTF-16, como sirve Amazon varios TSV', w('02.txt', utf16le(tabla(ordH,BASE)))],
  ['con separador de miles y símbolo de euro',
     w('03.txt', tabla(ordH,[ord('2000002-1000002',10,'1.210,00 €','210,00 €')]))],
  ['CSV con una coma dentro de una celda entrecomillada',
     w('04.csv', tabla(ordH,[(()=>{const r=ord('2000003-1000003',10,'1210.00','210.00');
        r[9]='Rodillo de masaje, grande, azul'; return r;})()],{delim:','}))],
  ['con líneas en blanco al final', w('06.txt', tabla(ordH,BASE,{trailing:'\n\n\n'}))],
  ['con la cabecera en mayúsculas y con espacios',
     w('07.txt', tabla(ordH.map(h=>' '+h.toUpperCase()+' '),BASE))],
];

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
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);

  const limpiar = () => page.evaluate(()=>{
    DB = blankDB();
    DB.products=[{id:'p', sku:'ARS-ROD-01', name:'Rodillo', cogs:5, freight:0, fba:3,
                  referral:15, price:24.99, channel:'FBA', lots:[]}];
    DB.mappings={}; saveDB();
    document.getElementById('fileList').innerHTML=''; refreshAll();
  });
  const importar = async f => { await page.setInputFiles('#csvFile', f); await page.waitForTimeout(850); };
  const cifras = () => page.evaluate(()=>{
    periodDays = 30;
    const P = (()=>{ try{ return pnl(); }catch(e){ return {err:e.message}; } })();
    const I = (()=>{ try{ return invStats(); }catch(e){ return []; } })();
    const fee = (DB.imports.fees && DB.imports.fees.rows[0]) || {};
    const ref = toNum(gv(fee,'_referral','estimatedreferralfeeperunit'));
    const pre = toNum(gv(fee,'_price','yourprice','salesprice'));
    return {ids:Object.keys(DB.imports), unid:P.units||0,
            bruto:+(P.grossInc||0).toFixed(2), iva:+(P.tax||0).toFixed(2),
            stock:I.reduce((a,x)=>a+x.qty,0), dev:P.retUnits||0,
            pct: pre>0 ? +(ref/pre*100).toFixed(1) : 0, err:P.err};
  });

  console.log('\n=== ROB-A · TODOS LOS PEDIDOS, EN SIETE FORMAS DISTINTAS ===');
  /* La de UTF-16 es la que importa. Leído como UTF-8, un TSV en UTF-16 queda
     con un NUL entre cada letra; normHdr los quita al limpiar la cabecera, así
     que el informe se daba por RECONOCIDO —tick verde y todo— con cero unidades
     y cero euros dentro. */
  for(const [nombre, f] of PEDIDOS){
    await limpiar(); await importar(f);
    const c = await cifras();
    check(nombre,
      c.ids.indexOf('orders')>=0 && c.unid===10 && Math.abs(c.bruto-1210)<0.01 && Math.abs(c.iva-210)<0.01,
      c.unid+' ud · '+c.bruto+' € · IVA '+c.iva+(c.err?' · '+c.err:''));
  }

  console.log('\n=== ROB-B · «--» NO ES UN CERO, ES UN HUECO ===');
  /* Amazon rellena celdas vacías con «--» y «N/A». En la columna del IVA eso
     era el fallo más caro del hub entrando por otra puerta: taxBasis() ya cubría
     la columna AUSENTE, pero una columna presente con «--» pasaba por un IVA
     medido de 0 € y el margen se sellaba como medido.
       bruto 1.210 con IVA deducido al 21 % → 210,00 € de IVA
       tomándolo por un cero medido        →   0,00 €, y +210 € de beneficio */
  await limpiar();
  await importar(w('05.txt', tabla(ordH,[(()=>{const r=ord('2000004-1000004',10,'1210.00','210.00');
      r[16]='--'; r[24]='N/A'; return r;})()])));
  const guiones = await cifras();
  check('el «--» de la columna de IVA no se toma por un cero medido',
    Math.abs(guiones.iva-210)<0.01, guiones.iva+' € · con el fallo daban 0,00 € y el margen se sellaba «medido»');
  check('y el resto del pedido se lee igual', guiones.unid===10 && Math.abs(guiones.bruto-1210)<0.01,
    guiones.unid+' ud · '+guiones.bruto+' €');

  console.log('\n=== ROB-C · UN PEDIDO PENDIENTE NO ES UNA VENTA ===');
  /* «Pendiente» es un pedido que el comprador aún no ha pagado, y el informe lo
     trae sin importe. Contarlo sumaba unidades fantasma —que bajan el precio
     medio— y les cobraba tarifa de logística a unidades que nunca se enviaron.
     «Sin enviar» sí es una venta y no debe caer aquí.
       10 buenas + 5 canceladas + 3 pendientes  →  10 unidades, no 13 */
  await limpiar();
  await importar(w('08.txt', tabla(ordH,[
      ord('2000005-1000005',10,'1210.00','210.00'),
      ord('2000006-1000006',5,'605.00','105.00','Cancelled'),
      ord('2000007-1000007',3,'','','Pending')])));
  const estados = await cifras();
  check('las canceladas y las pendientes se quedan fuera', estados.unid===10,
    estados.unid+' ud de 18 en el fichero · con el fallo eran 13');
  check('sin tocar el ingreso ni el IVA',
    Math.abs(estados.bruto-1210)<0.01 && Math.abs(estados.iva-210)<0.01,
    estados.bruto+' € · IVA '+estados.iva);
  await limpiar();
  await importar(w('09.txt', tabla(ordH,[ord('2000008-1000008',10,'1210.00','210.00','Unshipped')])));
  const sinEnviar = await cifras();
  check('pero «sin enviar» SÍ es una venta', sinEnviar.unid===10,
    sinEnviar.unid+' ud · está pagada, solo falta que salga del almacén');

  console.log('\n=== ROB-D · INVENTARIO, DEVOLUCIONES Y TARIFAS, CON LAS MISMAS MANÍAS ===');
  const invH=['sku','fnsku','asin','product-name','condition','your-price','mfn-listing-exists',
   'mfn-fulfillable-quantity','afn-listing-exists','afn-warehouse-quantity','afn-fulfillable-quantity',
   'afn-unsellable-quantity','afn-reserved-quantity','afn-total-quantity','per-unit-volume',
   'afn-inbound-working-quantity','afn-inbound-shipped-quantity','afn-inbound-receiving-quantity',
   'afn-researching-quantity','afn-reserved-future-supply','afn-future-supply-buyable'];
  const invR=[['ARS-ROD-01','X000','B0TEST0','Rodillo','New','24.99','','--','Yes','420','420','0','0',
               '420','0.0015','0','0','0','0','0','0']];
  const invEsH=['SKU','FNSKU','ASIN','Nombre del producto','Estado','Tu precio','Existe anuncio MFN',
   'Cantidad gestionada por el vendedor','Existe anuncio AFN','Cantidad en almacén','Cantidad disponible',
   'Cantidad no vendible','Cantidad reservada','Cantidad total','Volumen por unidad',
   'Entrante en preparación','Entrante enviada','Entrante recibiéndose','En investigación',
   'Reservada suministro futuro','Suministro futuro comprable'];
  const retH=['return-date','order-id','sku','asin','fnsku','product-name','quantity',
   'fulfillment-center-id','detailed-disposition','reason','status','license-plate-number','customer-comments'];
  const retEsH=['Fecha de devolución','ID de pedido','SKU','ASIN','FNSKU','Nombre del producto','Cantidad',
   'Centro logístico','Estado detallado','Motivo','Estado','Matrícula','Comentarios del cliente'];
  const feeH=['sku','fnsku','asin','product-name','product-group','brand','fulfilled-by','your-price',
   'sales-price','longest-side','median-side','shortest-side','length-and-girth','unit-of-dimension',
   'item-package-weight','unit-of-weight','product-size-tier','currency','estimated-fee-total',
   'estimated-referral-fee-per-unit','estimated-variable-closing-fee',
   'estimated-order-handling-fee-per-order','estimated-pick-pack-fee-per-unit',
   'estimated-weight-handling-fee-per-unit','expected-fulfillment-fee-per-unit','estimated-future-fee',
   'estimated-future-order-handling-fee-per-order','estimated-future-pick-pack-fee-per-unit',
   'estimated-future-weight-handling-fee-per-unit','expected-future-fulfillment-fee-per-unit'];
  /* Comisión 5,10 € sobre 24,99 € = 20,4 %, que es la de joyería, y con símbolo
     de euro y coma decimal, que es como la sirve un Seller Central en español. */
  const feeR=[['ARS-ROD-01','X000','B0TEST0','Rodillo (grande)','Sports','Aresstore','Amazon','24,99 €',
   '24,99 €','20','15','8','60','centimeters','450','grams','Standard','EUR','8,30 €','5,10 €','0,00 €',
   '0,00 €','2,10 €','1,10 €','3,20 €','8,30 €','0,00 €','2,10 €','1,10 €','3,20 €']];

  const OTROS = [
    ['inventario en UTF-16',            w('10.txt', utf16le(tabla(invH,invR))),          'inventory','stock',420],
    ['inventario en español, BOM y CRLF',w('11.txt', tabla(invEsH,invR,{bom:true,eol:'\r\n'})),'inventory','stock',420],
    ['devoluciones en CSV con comillas dentro',
       w('12.csv', tabla(retH,[[iso(ago(3)),'171-9000001-8000001','ARS-ROD-01','B0TEST0','X000',
         'Rodillo, grande','2','FRA7','SELLABLE','UNWANTED_ITEM','Unit returned to inventory','LPN1',
         'No me gustó, "muy grande"']],{delim:','})), 'returns','dev',2],
    ['devoluciones en español y Latin-1',
       w('13.txt', tabla(retEsH,[[iso(ago(3)),'171-9000001-8000001','ARS-ROD-01','B0TEST0','X000',
         'Rodillo','2','FRA7','VENDIBLE','ARTICULO_NO_DESEADO','Unidad devuelta','LPN1',
         'Demasiado grande']],{enc:'latin1'})), 'returns','dev',2],
    ['tarifas con símbolo de euro y coma decimal', w('14.txt', tabla(feeH,feeR)), 'fees','pct',20.4],
    ['tarifas en UTF-16 con CRLF', w('15.txt', utf16le(tabla(feeH,feeR,{eol:'\r\n'}))), 'fees','pct',20.4],
  ];
  for(const [nombre, f, id, campo, esperado] of OTROS){
    await limpiar();
    await importar(PEDIDOS[0][1]);   // un negocio sobre el que notar el efecto
    await importar(f);
    const c = await cifras();
    check(nombre, c.ids.indexOf(id)>=0 && Math.abs(c[campo]-esperado)<0.05,
      campo+'='+c[campo]+' (esperado '+esperado+') · informes: '+(c.ids.join(', ')||'ninguno'));
  }

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  try{ fs.rmSync(D, {recursive:true, force:true}); }catch(e){}
  await browser.close();
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
