#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   CARRIL 2 · fixtures del catálogo · TODO SINTÉTICO

   El repositorio es PÚBLICO. Aquí no entra ni un SKU, ni un título, ni un
   precio, ni una unidad de los informes reales de Juancho. Lo que se reproduce
   es el FORMATO LITERAL, que es lo único que hace falta para probar el
   importador, y ese formato sí está MEDIDO con Bash sobre el fichero real el
   17-09-2026:

     · 80.098 bytes · BOM UTF-8 SÍ (ef bb bf) · fin de línea LF puro, no CRLF
     · termina en salto de línea · separador TAB · cabecera en la línea 1
     · 49 columnas · 39 filas de datos · las 40 líneas tienen 49 campos
     · `open-date` = `DD/MM/YYYY HH:MM:SS MET` o `MEST` (las dos aparecen)
     · `quantity` viene VACÍA en las 39 filas (son AFN/FBA)
     · la última línea real acaba en `09 09 09 0a`: tres columnas finales vacías

   Las cabeceras son las 49 de Amazon, en su orden, porque es lo que el
   importador tiene que reconocer. Los datos son inventados.

   Las fechas de VENTA van relativas a hoy (`ago(k)`), porque `pnl()` filtra por
   `periodStart()` y unas fechas absolutas se pudren solas. Las fechas de ALTA
   del informe de listings NO se tocan: nadie filtra por ellas y son justo lo
   que hay que probar del formato.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const D = path.resolve(__dirname, 'fixtures-catalogo');
fs.mkdirSync(D, {recursive:true});

const iso = d => d.toISOString().slice(0,10);
const ago = k => { const d = new Date(); d.setDate(d.getDate()-k); return d; };

/* ── Las 49 columnas del informe de listings activos, en su orden ────────── */
const LIS_H = ['item-name','item-description','listing-id','seller-sku','price','quantity','open-date',
 'image-url','item-is-marketplace','product-id-type','zshop-shipping-fee','item-note','item-condition',
 'zshop-category1','zshop-browse-path','zshop-storefront-feature','asin1','asin2','asin3',
 'will-ship-internationally','expedited-shipping','zshop-boldface','product-id','bid-for-featured-placement',
 'add-delete','pending-quantity','fulfillment-channel','Business Price','Quantity Price Type',
 'Quantity Lower Bound 1','Quantity Price 1','Quantity Lower Bound 2','Quantity Price 2',
 'Quantity Lower Bound 3','Quantity Price 3','Quantity Lower Bound 4','Quantity Price 4',
 'Quantity Lower Bound 5','Quantity Price 5','merchant-shipping-group','Progressive Price Type',
 'Progressive Lower Bound 1','Progressive Price 1','Progressive Lower Bound 2','Progressive Price 2',
 'Progressive Lower Bound 3','Progressive Price 3','Minimum order quantity','Sell remainder'];

/* SKU inventados. `DEMO-AA01` lleva guiones a propósito: es lo que hace
   ambigua la partición de un `amzn.gr.DEMO-AA01-…` y lo que obliga a
   resolverla contra el catálogo en vez de a ojo. */
const LIS = [
  // sku,          título,                        precio,  asin,         alta
  ['DEMO-AA01', 'Producto de prueba alfa 1',      16.99, 'B0DEMO0001', '22/08/2024 18:29:56 MEST'],
  ['DEMO-AA02', 'Producto de prueba alfa 2',      16.99, 'B0DEMO0002', '10/12/2024 07:32:26 MET'],
  ['DEMO-AA03', 'Producto de prueba alfa 3',      15.99, 'B0DEMO0003', '14/01/2025 20:36:53 MET'],
  ['DEMO-NS01', 'Producto de prueba nogales 1',   16.99, 'B0DEMO0004', '01/08/2024 07:51:33 MEST'],
  ['DEMO-NS03', 'Producto de prueba nogales 3',   16.99, 'B0DEMO0005', '18/10/2024 17:30:19 MEST'],
  ['DEMO-SP01', 'Producto de prueba sierra 1',    26.99, 'B0DEMO0006', '24/02/2025 20:01:59 MET'],
  ['DEMO-X500', 'Producto de prueba equis 500',   20.99, 'B0DEMO0007', '28/02/2025 07:41:05 MET']
];

function filaListing(sku, nombre, precio, asin, alta, canal){
  const f = new Array(49).fill('');
  f[0]  = nombre;                 // item-name
  f[2]  = '0801DEMO' + sku.replace(/[^A-Z0-9]/gi,'').slice(-3);  // listing-id
  f[3]  = sku;                    // seller-sku
  f[4]  = precio.toFixed(2);      // price
  f[5]  = '';                     // quantity · VACÍA, igual que en el real (AFN)
  f[6]  = alta;                   // open-date · DD/MM/YYYY HH:MM:SS MET|MEST
  f[9]  = '1';                    // product-id-type
  f[16] = asin;                   // asin1
  f[22] = asin;                   // product-id
  f[26] = canal || 'AMAZON_EU';   // fulfillment-channel
  return f;
}

/* BOM + LF puro + salto final, exactamente como el fichero real. */
function escribirTSV(nombre, cabeceras, filas, opciones){
  const o = opciones || {};
  const txt = [cabeceras.join('\t')].concat(filas.map(f=>f.join('\t'))).join('\n') + '\n';
  const bom = o.bom === false ? '' : '﻿';
  fs.writeFileSync(path.join(D, nombre), Buffer.from(bom + txt, 'utf8'));
}

escribirTSV('listings-activos.txt', LIS_H,
  LIS.map(r=>filaListing(r[0], r[1], r[2], r[3], r[4])));

/* Una segunda copia con un `open-date` roto y un canal que no sé traducir.
   No es decoración: es la prueba de que un formato que no se entiende se DICE
   en vez de quedarse en blanco sin avisar. */
escribirTSV('listings-raros.txt', LIS_H, [
  filaListing('DEMO-ZZ01', 'Producto de prueba con alta ilegible', 9.99, 'B0DEMO0009', 'fecha que no es', 'AMAZON_EU'),
  filaListing('DEMO-ZZ02', 'Producto de prueba con huso raro',     9.99, 'B0DEMO0010', '03/03/2025 10:00:00 XYZ', 'AMAZON_EU'),
  filaListing('DEMO-ZZ03', 'Producto de prueba con canal raro',    9.99, 'B0DEMO0011', '04/04/2025 10:00:00 MEST', 'RARO_9000'),
  filaListing('DEMO-AA01', 'Producto de prueba alfa 1 repetido',  16.99, 'B0DEMO0001', '22/08/2024 18:29:56 MEST', 'AMAZON_EU')
]);

/* ── Informe de pedidos · las 33 columnas reales de All Orders ───────────── */
const ORD_H = ['amazon-order-id','merchant-order-id','purchase-date','last-updated-date','order-status',
 'fulfillment-channel','sales-channel','order-channel','ship-service-level','product-name','sku','asin',
 'item-status','quantity','currency','item-price','item-tax','shipping-price','shipping-tax','gift-wrap-price',
 'gift-wrap-tax','item-promotion-discount','ship-promotion-discount','ship-city','ship-state','ship-postal-code',
 'ship-country','promotion-ids','cpf','is-business-order','purchase-order-number','price-designation',
 'signature-confirmation-recommended'];

/* ARITMÉTICA A MANO, para que el número esperado de la prueba no salga de
   volver a ejecutar el mismo código que se está probando:

     · 12 días de ventas (d = 0..11), todos dentro de los 30 del periodo.
     · 4 unidades por día y SKU para DEMO-AA01, DEMO-AA02, DEMO-NS01,
       DEMO-NS03  →  12 × 4 = 48 unidades por SKU  →  4 × 48 = 192 unidades.
     · 1 unidad por día del SKU amzn.gr.DEMO-AA01-Kq7xR2-VG → 12 unidades.
     · TOTAL = 192 + 12 = 204 unidades vendidas en el periodo.

   Y el reparto que importa:
     · DEMO-AA01 y DEMO-AA02 llevarán coste (se lo pone la prueba).
     · DEMO-NS01, DEMO-NS03 y el amzn.gr.* NO tienen coste ninguno.
       →  48 + 48 + 12 = 108 unidades a coste CERO, que es el 52,9 % de 204.
   Ese 108 es el número que la pantalla tiene que llamar «coste desconocido»
   y que antes se sumaba al beneficio como margen íntegro. */
const VENTAS = [
  ['DEMO-AA01', 'Producto de prueba alfa 1',    16.99, 'B0DEMO0001', 4],
  ['DEMO-AA02', 'Producto de prueba alfa 2',    16.99, 'B0DEMO0002', 4],
  ['DEMO-NS01', 'Producto de prueba nogales 1', 16.99, 'B0DEMO0004', 4],
  ['DEMO-NS03', 'Producto de prueba nogales 3', 16.99, 'B0DEMO0005', 4],
  ['amzn.gr.DEMO-AA01-Kq7xR2-VG', 'Producto de prueba alfa 1 · reventa', 8.49, 'B0DEMO0001', 1]
];
const DIAS = 12;
const ordR = [];
for(let d=0; d<DIAS; d++){
  VENTAS.forEach((v, i)=>{
    const q = v[4];
    const precio = +(v[2]*q).toFixed(2);
    ordR.push([
      '171-'+String(3000000+d*17+i).padStart(7,'0')+'-'+String(2000000+d*11+i).padStart(7,'0'),
      '', iso(ago(d))+'T09:12:44+00:00', iso(ago(d))+'T11:00:00+00:00',
      'Shipped','Amazon','Amazon.es','','Expedited', v[1], v[0], v[3], 'Shipped', q, 'EUR',
      precio, (precio*0.21/1.21).toFixed(2), '0','0','0','0','0','0',
      /* ship-city, ship-state y ship-postal-code VACÍAS: identifican a una
         persona y el repositorio es público. */
      '','','',
      'ES','','','false','','',''
    ]);
  });
}
escribirTSV('all-orders.txt', ORD_H, ordR);

/* Recuentos que la prueba vuelve a comprobar por su cuenta. */
const R = {
  listings: {filas: LIS.length, columnas: LIS_H.length},
  raros: {filas: 4},
  pedidos: {filas: ordR.length, dias: DIAS,
            unidades: VENTAS.reduce((a,v)=>a+v[4],0)*DIAS,
            unidadesSinCoste: (4+4+1)*DIAS}
};
fs.writeFileSync(path.join(D,'recuentos.json'), JSON.stringify(R, null, 2)+'\n');

if(require.main === module){
  console.log('fixtures del carril 2 en ' + D);
  console.log(JSON.stringify(R));
}
module.exports = {D, R};
