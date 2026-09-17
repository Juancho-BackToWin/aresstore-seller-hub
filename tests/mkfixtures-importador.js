#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Fixtures del carril 1 · IMPORTADOR

   REPRODUCEN EL FORMATO LITERAL, no una versión limpia de él. Es lo único que
   sirve: los fallos de este carril no están en la lógica, están en los bytes.
   Por eso cada fichero declara a propósito su marca de orden de bytes, su fin
   de línea, si termina o no en salto, su separador, su coma decimal y los
   espacios finales de la cabecera, y están mezclados igual que vienen de
   Amazon —un fichero del mismo informe con BOM y el otro sin él—.

   NO LLEVAN FECHAS RELATIVAS A HOY. Las suites que las usan miran
   `DB.imports` y `vatReport()`, no `pnl()`, así que no dependen del periodo y
   estas fixtures no caducan con el calendario. Se regeneran igualmente antes
   de cada ejecución para que un cambio aquí no pueda quedarse sin aplicar.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const D = path.resolve(__dirname, 'fixtures-importador');
fs.mkdirSync(D, {recursive:true});

const BOM = '﻿';
/* nl: '\r\n' o '\n' · bom: si lleva marca de orden de bytes · fin: si termina
   en salto de línea. Cinco de los ficheros reales NO terminan en salto, y
   trocear mal por ahí se come la última fila. */
function escribir(nombre, filas, {nl='\r\n', bom=false, fin=true, sep='\t'}={}){
  const cuerpo = filas.map(f=>f.join(sep)).join(nl) + (fin ? nl : '');
  fs.writeFileSync(path.join(D, nombre), Buffer.from((bom?BOM:'') + cuerpo, 'utf8'));
}

/* ───────────────────────────────────────────────────────────────────────────
   1 · TODOS LOS PEDIDOS, partido en dos ficheros
   Las 34 columnas con los nombres literales de Amazon. `order-item-id` lleva
   UN ESPACIO FINAL, como en los tres ficheros reales: si algún alias anclado
   con ^…$ se aplicara sobre el nombre sin recortar, la clave de fusión no se
   encontraría y no se deduplicaría nada.
   ─────────────────────────────────────────────────────────────────────────── */
const PED_H = ['amazon-order-id','merchant-order-id','purchase-date','last-updated-date',
  'order-status','fulfillment-channel','sales-channel','order-channel','url','ship-service-level',
  'product-name','sku','asin','item-status','quantity','currency','item-price','item-tax',
  'shipping-price','shipping-tax','gift-wrap-price','gift-wrap-tax','item-promotion-discount',
  'ship-promotion-discount','ship-city','ship-state','ship-postal-code','ship-country',
  'promotion-ids','is-business-order','purchase-order-number','price-designation','is-iba',
  'order-item-id '];

function ped({oid, item, upd, sku, qty, precio, iva, estado='Shipped', canal='Amazon.es', pais='ES'}){
  return [oid, '', '2026-08-15T09:00:00+00:00', upd, estado, 'Amazon', canal, '', '', 'Standard',
    'Producto de prueba '+sku, sku, 'B00'+sku.slice(-7), estado, String(qty), 'EUR',
    precio, iva, '0.00','0.00','0.00','0.00','0.00','0.00',
    /* `ship-city`, `ship-state` y `ship-postal-code` van VACÍAS a propósito:
       son las tres columnas que identifican a una persona y el repositorio es
       público. `privacidad.test.js` lo comprueba en cada ejecución. */
    '','','', pais, '', 'false','','','false', item];
}
/* Fichero A · CRLF, sin BOM, termina en salto. Cuatro líneas. */
escribir('pedidos-a.txt', [PED_H,
  ped({oid:'111-0000001-0000001', item:'OI-1001', upd:'2026-08-16T10:00:00+00:00', sku:'FBA0001', qty:2, precio:'21.00', iva:'2.10'}),
  ped({oid:'111-0000002-0000002', item:'OI-1002', upd:'2026-08-17T10:00:00+00:00', sku:'FBA0002', qty:1, precio:'10.00', iva:'1.00'}),
  ped({oid:'111-0000003-0000003', item:'OI-1003', upd:'2026-08-18T10:00:00+00:00', sku:'FBA0003', qty:3, precio:'33.00', iva:'3.30'}),
  /* Y una con el identificador de línea a «0». En los ficheros reales hay
     bastantes así y son PEDIDOS DISTINTOS: el valor no identifica nada. */
  ped({oid:'111-0000004-0000004', item:'0',       upd:'2026-08-19T10:00:00+00:00', sku:'FBA0004', qty:1, precio:'9.00',  iva:'0.90'})
], {nl:'\r\n', bom:false, fin:true});

/* Fichero B · LF, CON BOM y SIN salto final. Solapa con el A. */
escribir('pedidos-b.txt', [PED_H,
  /* idéntica a la del fichero A: duplicado exacto */
  ped({oid:'111-0000003-0000003', item:'OI-1003', upd:'2026-08-18T10:00:00+00:00', sku:'FBA0003', qty:3, precio:'33.00', iva:'3.30'}),
  /* misma línea de pedido, corregida más tarde: gana esta por fecha */
  ped({oid:'111-0000002-0000002', item:'OI-1002', upd:'2026-08-25T10:00:00+00:00', sku:'FBA0002', qty:1, precio:'12.00', iva:'1.20'}),
  /* otro «0»: no puede fundirse con el «0» del fichero A */
  ped({oid:'111-0000005-0000005', item:'0',       upd:'2026-08-20T10:00:00+00:00', sku:'FBA0005', qty:1, precio:'7.00',  iva:'0.70'}),
  /* la última línea del fichero, que es la que se come un troceo mal hecho */
  ped({oid:'111-0000006-0000006', item:'OI-1004', upd:'2026-08-21T10:00:00+00:00', sku:'FBA0006', qty:4, precio:'44.00', iva:'4.40'})
], {nl:'\n', bom:true, fin:false});

/* ───────────────────────────────────────────────────────────────────────────
   2 · DEVOLUCIONES, partido en dos
   ─────────────────────────────────────────────────────────────────────────── */
const DEV_H = ['return-date','order-id','sku','asin','fnsku','product-name','quantity',
  'fulfillment-center-id','detailed-disposition','reason','status','license-plate-number','customer-comments'];
const dev = (lpn, oid, sku, fecha) =>
  [fecha, oid, sku, 'B00'+sku.slice(-7), 'X00'+sku.slice(-7), 'Producto '+sku, '1',
   'MAD4', 'SELLABLE', 'NO_REASON_GIVEN', 'Reimbursed', lpn, ''];

escribir('devoluciones-a.txt', [DEV_H,
  dev('LPN-A', '403-0000001-0000001', 'FBA0001', '2026-08-10T12:00:00+00:00'),
  dev('LPN-B', '403-0000002-0000002', 'FBA0002', '2026-08-11T12:00:00+00:00')
], {nl:'\r\n', bom:false, fin:false});      // sin salto final, como los reales

escribir('devoluciones-b.txt', [DEV_H,
  dev('LPN-B', '403-0000002-0000002', 'FBA0002', '2026-08-11T12:00:00+00:00'),   // idéntica
  dev('LPN-C', '403-0000003-0000003', 'FBA0003', '2026-08-12T12:00:00+00:00'),
  dev('LPN-D', '403-0000004-0000004', 'FBA0004', '2026-08-13T12:00:00+00:00')
], {nl:'\n', bom:true, fin:true});

/* ───────────────────────────────────────────────────────────────────────────
   3 · TRANSACCIONES SUJETAS A IVA, partido en dos, uno con BOM y otro sin él
   Se incluyen A PROPÓSITO las dos columnas de jurisdicción que trae el informe
   real: la de código ISO y la del nombre del país en inglés. Cuál de las dos se
   lea cambia el resultado, y por eso están las dos.
   ─────────────────────────────────────────────────────────────────────────── */
const IVA_H = ['ACTIVITY_PERIOD','TRANSACTION_TYPE','TRANSACTION_EVENT_ID','ACTIVITY_TRANSACTION_ID',
  'SELLER_SKU','QTY','TOTAL_PRICE_OF_ITEMS_AMT_VAT_EXCL','PRICE_OF_ITEMS_VAT_RATE_PERCENT',
  'TOTAL_PRICE_OF_ITEMS_VAT_AMT','SALE_ARRIVAL_COUNTRY','TAXABLE_JURISDICTION',
  'PRODUCT_TAX_CODE','TAX_REPORTING_SCHEME','TAX_COLLECTION_RESPONSIBILITY'];
const iva = (ev, sku, qty, base, rate, vat, iso, nombre) =>
  ['Aug-2026','SALE', ev, ev+'-1', sku, String(qty), base, rate, vat, iso, nombre,
   'A_GEN_REDUCED','REGULAR','SELLER'];

/* Las cinco filas y su aritmética, hecha a mano:
     ES  base 100,00 · aplicado 10 % · general 21 % → 100 × (21−10)/100 = 11,00 €
     IT  base  50,00 · aplicado 22 % · general 22 % → nada
     ES  base 200,00 · aplicado 21 % · general 21 % → nada
     PT  base 100,00 · aplicado  6 % · general 23 % → 100 × (23−6)/100  = 17,00 €
     PL  base 100,00 · aplicado  8 % · general 23 % → 100 × (23−8)/100  = 15,00 €
   Diferencia total = 11,00 + 17,00 + 15,00 = 43,00 €
   Base total  = 100 + 50 + 200 + 100 + 100 = 550,00 €
   IVA total   =  10 + 11 +  42 +   6 +   8 =  77,00 € */
const IVA_1 = iva('EV0001','FBA0001',1,'100.00','0.1','10.00','ES','SPAIN');
const IVA_2 = iva('EV0002','FBA0002',1,'50.00','0.22','11.00','IT','ITALY');
const IVA_3 = iva('EV0003','FBA0003',2,'200.00','0.21','42.00','ES','SPAIN');
const IVA_4 = iva('EV0004','FBA0004',1,'100.00','0.06','6.00','PT','PORTUGAL');
const IVA_5 = iva('EV0005','FBA0005',1,'100.00','0.08','8.00','PL','POLAND');

escribir('iva-a.txt', [IVA_H, IVA_1, IVA_2], {nl:'\n',  bom:false, fin:true});
escribir('iva-b.txt', [IVA_H, IVA_1, IVA_2, IVA_3, IVA_4, IVA_5], {nl:'\r\n', bom:true, fin:false});

/* ───────────────────────────────────────────────────────────────────────────
   4 · PREÁMBULO ANTES DE LA CABECERA
   Siete líneas de aviso, cada una UNA SOLA celda entrecomillada con comas
   dentro: contar comas sin mirar las comillas las toma por columnas.
   ─────────────────────────────────────────────────────────────────────────── */
(function(){
  const pre = [
    '"Incluye transacciones del Marketplace de Amazon, Logística de Amazon y Amazon Webstore"',
    '"Todos los importes en EUR, a menos que se especifique lo contrario"',
    '"Definiciones:"',
    '"Recaudación de impuestos sobre ventas: incluye los impuestos recaudados al comprador."',
    '"Tarifas por venta: incluyen tarifas variables por cierre de venta y por referencia."',
    '"Tarifas de otras transacciones: incluye reintegros de los cargos por envío."',
    '"Otro: incluye importes de transacciones distintas del pedido, consulta ""Tipo"" y ""Descripción""."'
  ];
  const cab = ['"fecha y hora"','"identificador de pago"','"tipo"','"número de pedido"','"sku"',
               '"descripción"','"cantidad"','"total"'];
  const fila = (f,id,tipo,ped,sku,desc,cant,total) =>
    ['"'+f+'"','"'+id+'"','"'+tipo+'"','"'+ped+'"','"'+sku+'"','"'+desc+'"','"'+cant+'"','"'+total+'"'];
  const filas = [
    fila('17 dic 2026 22:37:41 UTC','21101302612','Pedido','406-0000001-0000001','FBA0001','Pulsera, acero','1','12,72'),
    fila('18 dic 2026 09:02:11 UTC','21101302613','Pedido','406-0000002-0000002','FBA0002','Colgante, plata','2','24,50'),
    fila('19 dic 2026 11:45:00 UTC','21101302614','Reembolso','406-0000001-0000001','FBA0001','Pulsera, acero','-1','-12,72')
  ];
  const cuerpo = pre.concat([cab.join(',')]).concat(filas.map(f=>f.join(','))).join('\n') + '\n';
  fs.writeFileSync(path.join(D,'preambulo.csv'), Buffer.from(BOM+cuerpo,'utf8'));
})();

/* ───────────────────────────────────────────────────────────────────────────
   5 · SEPARADOR «;», DECIMALES CON COMA, SÍMBOLO DE EURO Y ESPACIO FINAL
   Calcado del informe de publicidad real: BOM, CRLF, punto y coma, importes
   como «€1.234,56» y una cabecera que termina en espacio.
   ─────────────────────────────────────────────────────────────────────────── */
(function(){
  const H = ['Fecha de inicio','Fecha de finalización','Nombre de la cartera','Divisa',
    'Nombre de campaña','Nombre del grupo de anuncios','País','Segmentación','Tipo de coincidencia',
    'Término de búsqueda de cliente','Impresiones','Clics','Índice de clics (CTR)',
    'Coste por clic (CPC)','Gasto','Ventas totales de 7 días (€)',
    'Coste publicitario de las ventas (ACOS) total ',   // ← espacio final, como en el real
    'Pedidos totales','Unidades totales'];
  /* Gasto: 1,50 + 2,25 + 1.234,56 = 1.238,31 €
     Ventas: 10,00 + 0,00 + 2.000,00 = 2.010,00 € */
  const R = [
    ['jul 14, 2026','jul 14, 2026','No Portfolio','EUR','Campaña ES','Grupo 1','España','close-match','-',
     'pulsera acero hombre','600','12','2,0000%','€0,13','€1,50','€10,00','15,0000%','1','1'],
    ['jul 14, 2026','jul 14, 2026','No Portfolio','EUR','Campaña IT','Grupo 1','Italia','close-match','-',
     'bracciale uomo acciaio','900','18','2,0000%','€0,13','€2,25','€0,00','0,0000%','0','0'],
    ['jul 14, 2026','jul 14, 2026','No Portfolio','EUR','Campaña FR','Grupo 1','Francia','loose-match','-',
     'bracelet homme acier','1200','24','2,0000%','€0,13','€1.234,56','€2.000,00','61,7280%','30','33']
  ];
  const cuerpo = [H.join(';')].concat(R.map(r=>r.join(';'))).join('\r\n') + '\r\n';
  fs.writeFileSync(path.join(D,'publicidad-es.csv'), Buffer.from(BOM+cuerpo,'utf8'));
})();

/* ───────────────────────────────────────────────────────────────────────────
   6 · CABECERAS EN ITALIANO · el informe que no debe entrar en silencio
   Los nombres no se reconocen, pero las columnas tienen forma de fecha, de
   identificador de pedido y de dinero. Sin freno, el importe de la venta sale
   de «la primera columna de dinero», que aquí es el gasto de envío.
   ─────────────────────────────────────────────────────────────────────────── */
(function(){
  const H = ['identificativo-ordine-amazon','data-acquisto','data-ultimo-aggiornamento','stato-ordine',
    'canale-di-gestione','canale-di-vendita','nome-prodotto','sku','asin','stato-articolo',
    'quantita','valuta','spese-di-spedizione','prezzo-articolo','imposta-articolo',
    'sconto-promozione','citta-spedizione','provincia-spedizione','cap-spedizione','paese-spedizione'];
  const R = [];
  for(let i=1;i<=8;i++){
    R.push(['171-000000'+i+'-1234567','2026-08-0'+i,'2026-08-1'+i,'Spedito','Amazon','Amazon.it',
      'Braccialetto '+i,'FBA010'+i,'B00FBA010'+i,'Spedito','1','EUR',
      '3.99', (10+i)+'.99', '2.42', '0.00','','','','IT']);   // columnas de comprador vacías: el repositorio es público
  }
  const cuerpo = [H.join('\t')].concat(R.map(r=>r.join('\t'))).join('\r\n')+'\r\n';
  fs.writeFileSync(path.join(D,'pedidos-italiano.txt'), Buffer.from(cuerpo,'utf8'));
})();

/* ───────────────────────────────────────────────────────────────────────────
   7 · TARIFAS SIN COLUMNA DE PRECIO  (C1)  y con la tarifa FBA a 0,00  (A5)
   ─────────────────────────────────────────────────────────────────────────── */
const FEE_H_BASE = ['sku','fnsku','asin','amazon-store','product-name','brand','fulfilled-by',
  'has-local-inventory','your-price','sales-price','longest-side','median-side','shortest-side',
  'length-and-girth','unit-of-dimension','item-package-weight','unit-of-weight','currency',
  'estimated-referral-fee-per-unit','estimated-variable-closing-fee',
  'expected-domestic-fulfilment-fee-per-unit','expected-efn-fulfilment-fee-per-unit-uk',
  'expected-efn-fulfilment-fee-per-unit-de','expected-efn-fulfilment-fee-per-unit-fr',
  'expected-efn-fulfilment-fee-per-unit-it','expected-efn-fulfilment-fee-per-unit-es'];
function fee(sku, precio, referral, fba){
  return [sku,'X00'+sku.slice(-7),'B00'+sku.slice(-7),'Amazon.es','Producto '+sku,'Aresstore','Amazon','Yes',
    precio, precio, '20','15','8','40','centimeters','0.5','kilograms','EUR',
    referral,'0.00', fba,'--','--','--','--','--'];
}
/* C1 · el mismo fichero SIN `your-price` ni `sales-price`. La comisión viene en
   euros por unidad y sin precio no hay porcentaje que calcular. */
(function(){
  const quitar = {'your-price':1,'sales-price':1};
  const idx = FEE_H_BASE.map((h,i)=>quitar[h]?i:-1).filter(i=>i>=0);
  const H = FEE_H_BASE.filter(h=>!quitar[h]);
  const R = [fee('FBA0101','19.99','4.08','3.05'), fee('FBA0102','9.99','2.04','2.24'),
             fee('FBA0103','24.99','5.10','4.01')].map(r=>r.filter((_,i)=>idx.indexOf(i)<0));
  fs.writeFileSync(path.join(D,'tarifas-sin-precio.txt'),
    Buffer.from([H.join('\t')].concat(R.map(r=>r.join('\t'))).join('\r\n')+'\r\n','utf8'));
})();
/* A5 · dos de las tres filas traen la tarifa de logística a 0,00 literal. */
escribir('tarifas-cero.txt', [FEE_H_BASE,
  fee('FBA0201','19.99','4.08','0.00'),
  fee('FBA0202','9.99','2.04','0.00'),
  fee('FBA0203','24.99','5.10','4.01')], {nl:'\r\n', bom:false, fin:true});

/* 8 · Un libro de Excel de mentira: basta la firma ZIP para que el nombre y el
       contenido digan lo mismo que diría el de verdad. */
fs.writeFileSync(path.join(D,'informe_ppc.xlsx'),
  Buffer.concat([Buffer.from([0x50,0x4B,0x03,0x04]), Buffer.alloc(200)]));

console.log('Fixtures del importador creadas en tests/fixtures-importador:');
fs.readdirSync(D).sort().forEach(f=>console.log('  '+f+'  '+fs.statSync(path.join(D,f)).size+' bytes'));
