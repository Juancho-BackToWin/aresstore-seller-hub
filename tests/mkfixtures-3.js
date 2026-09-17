#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Fixtures del carril 3 · informe de transacciones (Pagos › Transacciones)

   SINTÉTICAS. El repositorio es PÚBLICO: aquí no entra ni una cifra del
   negocio ni un dato de comprador. Lo que se copia del fichero real es
   únicamente EL FORMATO, medido con Bash el 17-09-2026 sobre
   `2022Aug22-2026Aug21CustomTransaction.csv` (2.015.117 bytes, fuera del
   repositorio):

     · BOM UTF-8 al principio
     · fin de línea LF, y el fichero TERMINA en salto de línea
     · separador COMA, TODOS los campos entrecomillados
     · DECIMALES CON COMA («-1,14», no «-1.14»)
     · 27 columnas, con las cabeceras en español
     · SIETE líneas de preámbulo: la cabecera está en la LÍNEA 8
     · fechas «17 dic 2023 22:37:41 UTC», con el mes abreviado en español

   Las tres columnas de comprador (ciudad, comunidad autónoma, código postal)
   van VACÍAS y tienen que seguir vacías: existen para reproducir el formato,
   no para llevar datos. `tests/privacidad.test.js` vigila eso.

   Las fechas son relativas a HOY, como en `mkfixtures.js`, porque las ventanas
   de reclamación se miden en días desde hoy y una fixture con fechas fijas
   caducaría sola.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const D = path.resolve(__dirname, 'fixtures-3');
fs.mkdirSync(D, {recursive:true});

const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const ago = k => { const d = new Date(); d.setDate(d.getDate()-k); return d; };
const sello = k => { const d = ago(k);
  return d.getDate()+' '+MES[d.getMonth()]+' '+d.getFullYear()+' 10:00:00 UTC'; };

const CAB = ['fecha y hora','identificador de pago','tipo','número de pedido','sku','descripción',
  'cantidad','web de Amazon','gestión logística','ciudad de procedencia del pedido',
  'comunidad autónoma de procedencia del pedido','código postal de procedencia del pedido',
  'Formulario de recaudación de impuestos','ventas de productos','impuesto de ventas de productos',
  'abonos de envío','impuestos por abonos de envío','abonos de envoltorio para regalo',
  'impuestos por abonos de envoltorio para regalo','devoluciones promocionales',
  'impuestos de descuentos por promociones','impuesto retenido en el sitio web','tarifas de venta',
  'tarifas de Logística de Amazon','tarifas de otras transacciones','otro','total'];

const PREAMBULO = [
  'Incluye transacciones del Marketplace de Amazon, Logística de Amazon y Amazon Webstore',
  'Todos los importes en EUR, a menos que se especifique lo contrario',
  'Definiciones:',
  'Recaudación de impuestos sobre ventas: incluye los impuestos sobre ventas recaudados al comprador.',
  'Tarifas por venta: incluyen tarifas variables por cierre de venta y tarifas por referencia.',
  'Tarifas de otras transacciones: incluye reintegros de los cargos por envío y retenciones de envío.',
  'Otro: incluye importes de transacciones distintas del pedido.'
];

/* Decimales con coma, como los escribe Amazon en el fichero español. */
const eur = n => (n===0 ? '0' : n.toFixed(2).replace('.', ','));

/* Una fila. Los importes van por nombre para que la aritmética del comentario
   de cada prueba se pueda seguir leyendo aquí. */
function fila(o){
  const c = new Array(27).fill('');
  c[0]=sello(o.k); c[1]=o.pago||''; c[2]=o.tipo; c[3]=o.oid||''; c[4]=o.sku||'';
  c[5]=o.desc||''; c[6]=o.qty!=null?String(o.qty):''; c[7]=o.web||'amazon.es'; c[8]=o.gestion||'';
  /* c[9], c[10], c[11] son ciudad, comunidad autónoma y código postal: VACÍAS. */
  c[12]='';
  c[13]=eur(o.ventas||0); c[14]=eur(o.iva||0);
  c[15]='0'; c[16]='0'; c[17]='0'; c[18]='0'; c[19]='0'; c[20]='0'; c[21]='0';
  c[22]=eur(o.com||0); c[23]=eur(o.fba||0); c[24]=eur(o.otras||0); c[25]=eur(o.otro||0);
  const total = (o.ventas||0)+(o.iva||0)+(o.com||0)+(o.fba||0)+(o.otras||0)+(o.otro||0);
  c[26]=eur(o.total!=null?o.total:total);
  return c;
}

/* ── El caso de prueba, con la aritmética a mano ────────────────────────────

   VENTAS (tres pedidos, liquidación «900001»)
     3 × ventas 100,00 · tarifas de venta −15,00 · logística −3,00
     → comisión cobrada 45,00 · tarifa FBA 9,00

   REEMBOLSOS (liquidación «900002»)
     ago(60)  pedido …0009  −100,00 y +12,00 → fantasma DENTRO de plazo (45–105)
                                               importe = 100,00 − 12,00 = 88,00
     ago(10)  pedido …0010   −50,00 y  +6,00 → «aún no»: faltan 35 días
     ago(200) pedido …0011   −70,00 y  +8,00 → fuera de plazo
     ago(60)  pedido …0012   −40,00 y  +5,00 → gestión «Vendedor»: Amazon no debe nada
     ago(61)  pedido …0013   −30,00 y  +4,00 → tiene devolución registrada
     ago(62)  pedido …0015   −25,00 y  +3,00 → ya compensado (ajuste de ago(55))
     → crédito de comisión total = 12+6+8+5+4+3 = 38,00

   COMPENSACIONES
     ago(20) ajuste …0014 · 2,00 por 1 ud de ARS-REC-01, que cuesta 5,00
             → reembolso corto: 5,00 − 2,00 = 3,00 reclamables
     ago(55) ajuste …0015 · 22,00 por 1 ud → por encima del coste: no se reclama

   LO QUE NO ES UNA TARIFA Y NO PUEDE ENTRAR EN LAS COMISIONES
     ago(3)  publicidad −20,00 · ya la mide adStats() desde el informe de PPC
     ago(4)  transferencia −0,01 · movimiento de caja
     ago(20) y ago(55) los dos ajustes · dinero que ENTRA
     → 4 filas fuera de tarifas

   ALMACENAMIENTO
     ago(8) −4,00 con descripción «Tarifa por almacenamiento…» → storage 4,00
   ───────────────────────────────────────────────────────────────────────── */
const FILAS = [
  fila({k:5, pago:'900001', tipo:'Pedido', oid:'111-0000001-0000001', sku:'ARS-REC-01',
        desc:'Producto de prueba uno', qty:1, gestion:'Amazon', ventas:100, com:-15, fba:-3}),
  fila({k:6, pago:'900001', tipo:'Pedido', oid:'111-0000002-0000002', sku:'ARS-REC-01',
        desc:'Producto de prueba uno', qty:1, gestion:'Amazon', ventas:100, com:-15, fba:-3}),
  fila({k:7, pago:'900001', tipo:'Pedido', oid:'111-0000003-0000003', sku:'ARS-REC-02',
        desc:'Producto de prueba dos', qty:1, gestion:'Amazon', ventas:100, com:-15, fba:-3}),

  fila({k:60, pago:'900002', tipo:'Reembolso', oid:'111-0000009-0000009', sku:'ARS-REC-01',
        desc:'Producto de prueba uno', qty:1, gestion:'Amazon', ventas:-100, com:12}),
  fila({k:10, pago:'900002', tipo:'Reembolso', oid:'111-0000010-0000010', sku:'ARS-REC-01',
        desc:'Producto de prueba uno', qty:1, gestion:'Amazon', ventas:-50, com:6}),
  fila({k:200, pago:'900002', tipo:'Reembolso', oid:'111-0000011-0000011', sku:'ARS-REC-01',
        desc:'Producto de prueba uno', qty:1, gestion:'Amazon', ventas:-70, com:8}),
  fila({k:60, pago:'900002', tipo:'Reembolso', oid:'111-0000012-0000012', sku:'ARS-REC-03',
        desc:'Producto gestionado por el vendedor', qty:1, gestion:'Vendedor', ventas:-40, com:5}),
  fila({k:61, pago:'900002', tipo:'Reembolso', oid:'111-0000013-0000013', sku:'ARS-REC-01',
        desc:'Producto de prueba uno', qty:1, gestion:'Amazon', ventas:-30, com:4}),
  fila({k:62, pago:'900002', tipo:'Reembolso', oid:'111-0000015-0000015', sku:'ARS-REC-01',
        desc:'Producto de prueba uno', qty:1, gestion:'Amazon', ventas:-25, com:3}),

  fila({k:20, pago:'900002', tipo:'Ajuste', oid:'111-0000014-0000014', sku:'ARS-REC-01',
        desc:'Reembolso de inventario de Logística de Amazon (Devolución del cliente)',
        qty:1, web:'', otro:2}),
  fila({k:55, pago:'900002', tipo:'Ajuste', oid:'111-0000015-0000015', sku:'ARS-REC-01',
        desc:'Reembolso de inventario - extraviado en el almacén', qty:1, web:'', otro:22}),

  fila({k:3, pago:'900002', tipo:'Tarifa de prestación de servicio', desc:'Gastos de publicidad',
        web:'', otras:-20}),
  fila({k:4, pago:'900002', tipo:'Transferir', desc:'Microdepósito', web:'Amazon.es', otro:-0.01}),
  fila({k:8, pago:'900002', tipo:'Tarifas de inventario de Logística de Amazon', sku:'ARS-REC-01',
        desc:'Tarifa por almacenamiento de Logística de Amazon', web:'', otro:-4})
];

const q = v => '"'+String(v).replace(/"/g,'""')+'"';
const lineas = PREAMBULO.map(p=>q(p))
  .concat([CAB.map(q).join(',')])
  .concat(FILAS.map(f=>f.map(q).join(',')));

/* BOM + LF + salto de línea final, exactamente como lo sirve Amazon. */
fs.writeFileSync(path.join(D,'transacciones.csv'),
  Buffer.from('﻿' + lineas.join('\n') + '\n', 'utf8'));

/* ── El mismo fichero, con un carácter de sustitución dentro ────────────────
   REPRODUCE UN FALLO MEDIDO CONTRA EL FICHERO REAL el 17-09-2026. El informe
   real es UTF-8 VÁLIDO y contiene un U+FFFD escrito por el propio Amazon
   (bytes EF BF BD, en el byte 867.186 de 2.015.117, dentro del título de un
   producto). `readSmart` usa la aparición de U+FFFD como señal de «esto era
   windows-1252» y vuelve a decodificar el fichero entero así: un solo carácter
   convierte todo el informe en mojibake.

   Y el mojibake no da error, da números: «tarifas de Logística de Amazon» se
   normaliza a `tarifasdelogasticadeamazon`, ningún alias casa, y la tarifa de
   logística de cuatro años sale 0,00 €.

   Aquí se mete ese mismo carácter en una descripción y se comprueba que el
   fichero se sigue leyendo bien. */
const conFffd = lineas.map((l,i)=> i===8 ? l.replace('Producto de prueba uno','Producto de prueba uno \uFFFD') : l);
fs.writeFileSync(path.join(D,'transacciones-fffd.csv'),
  Buffer.from('\uFEFF' + conFffd.join('\n') + '\n', 'utf8'));

console.log('fixtures-3: transacciones.csv y transacciones-fffd.csv · '+PREAMBULO.length+
            ' líneas de preámbulo · '+CAB.length+' columnas · '+FILAS.length+' filas de datos');
