#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Fixtures del carril 4 · el informe de términos de búsqueda, en su formato
   LITERAL

   Por qué no vale un CSV cómodo: todo lo que este carril arregla vive en los
   detalles del fichero, no en sus cifras. Lo que reproduce esta fixture, uno a
   uno y medido contra el informe real de agosto de 2026 (1.222 filas, 258.290
   bytes, fuera del repositorio):

     · BOM UTF-8 al principio.
     · Saltos de línea CRLF, y salto final.
     · Separador PUNTO Y COMA, decimales con COMA, importes con «€» delante.
     · Las 25 columnas del informe en español, en su orden.
     · El ESPACIO FINAL de la cabecera «Coste publicitario de las ventas (ACOS)
       total » — está así en el fichero real. Cualquier alias anclado con `^…$`
       que se aplique al nombre sin normalizar no casaría nunca.
     · Fechas en el formato de Amazon en español: «ago 20, 2026». Cuatro meses
       —ene, abr, ago, dic— son inválidos para `new Date()`, y agosto es uno.
     · Filas de UN DÍA y filas AGREGADAS de varios días, que en el informe real
       son 205 de 1.222 y llegan a 65 días naturales.
     · Una columna de gasto con CUATRO decimales, que es donde `toNum()` del
       carril 1 multiplica por diez mil.

   Las cifras son inventadas y redondas a propósito: las de verdad no salen de
   aquí, y este repositorio es público.

   Las fechas van RELATIVAS a hoy, porque todo este carril va de periodos: una
   fixture con fechas absolutas se sale del periodo sola en cuanto pasa un mes y
   la suite deja de medir el código para medir el calendario. Por eso se genera
   al arrancar la suite y no se versiona.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const p2 = n => (n<10?'0':'')+n;
/* Hace k días, en el formato literal de Amazon en español. */
function ago(k){
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate()-k);
  return MESES[d.getMonth()]+' '+p2(d.getDate())+', '+d.getFullYear();
}
const eur = n => '€'+n.toFixed(2).replace('.',',');
const pct = n => n.toFixed(4).replace('.',',')+'%';

const CAB = ['Fecha de inicio','Fecha de finalización','Nombre de la cartera','Divisa',
  'Nombre de campaña','Nombre del grupo de anuncios','País','Segmentación','Tipo de coincidencia',
  'Término de búsqueda de cliente','Impresiones','Clics','Índice de clics (CTR)','Coste por clic (CPC)',
  'Gasto','Ventas totales de 7 días (€)',
  'Coste publicitario de las ventas (ACOS) total ',   // ← el espacio final es del fichero real
  'Retorno de la inversión publicitaria (ROAS) total','Pedidos totales de 7 días (#)',
  'Unidades totales de 7 días (#)','Tasa de conversión de 7 días','Unidades SKU anunciadas 7 días (#)',
  'Otras unidades SKU de 7 días (#)','Ventas SKU anunciadas 7 días (€)','Otras ventas SKU de 7 días (€)'];

/* Las filas. `gastoTxt` permite escribir el gasto tal cual, con los decimales
   que haga falta, sin pasar por `toFixed(2)`. */
const FILAS = [
  // término,                campaña,                  d0, d1, impr, clics, pedidos, ventas, gasto, gastoTxt
  ['rodillo de espuma',      'SP · TEST-ROD · exacta',  2,  2,  900,  40, 2,  60.00, 12.00],
  ['rodillo masaje muscular','SP · TEST-ROD · exacta', 20, 11, 2200, 100, 5, 150.00, 40.00],
  ['rodillo barato',         'SP · TEST-ROD · exacta', 34, 25, 1400,  60, 0,   0.00,100.00],
  ['bandas elasticas',       'SP · Bandas · amplia',    5,  5,  700,  30, 3,  90.00,  9.00],
  ['gomas baratas',          'SP · Genérico · auto',    8,  8, 1100,  50, 0,   0.00, 25.00],
  ['cinta cuatro decimales', 'SP · Genérico · auto',    9,  9,  300,  12, 0,   0.00,  0.4356, '€0,4356'],
  ['rodillo con bandas',     'SP · Rodillo y Bandas',  12, 12,  400,  20, 1,  30.00,  6.00],
  /* Mismo número malo, fecha distinta: uno de ayer —que Amazon todavía está
     reatribuyendo— y uno de hace dos semanas, ya asentado. */
  ['rodillo caro de ayer',   'SP · TEST-ROD · exacta',  1,  1,  500,  20, 1,  10.00,  9.00],
  ['rodillo con tres clics', 'SP · TEST-ROD · exacta', 15, 15,  200,   3, 0,   0.00,  4.00]
];

function fila(f, paisForzado){
  const [term, camp, d0, d1, impr, clics, ped, ventas, gasto, gastoTxt, paisFila] = f;
  const pais = paisForzado || paisFila || 'España';
  const ctr  = impr ? clics/impr*100 : 0;
  const cpc  = clics ? gasto/clics : 0;
  const acos = ventas ? gasto/ventas*100 : null;
  const roas = gasto ? ventas/gasto : 0;
  const cvr  = clics ? ped/clics*100 : 0;
  return [ago(d0), ago(d1), 'No Portfolio', 'EUR', camp, camp, pais, 'close-match', '-', term,
    String(impr), String(clics), pct(ctr), eur(cpc), gastoTxt || eur(gasto), eur(ventas),
    acos===null ? '' : pct(acos), roas.toFixed(2).replace('.',','), String(ped), String(ped),
    pct(cvr), String(ped), '0', eur(ventas), eur(0)].join(';');
}

/* ─────────────────────────────────────────────────────────────────────────
   CARRIL 4 · BLOQUE 2 · LA MISMA CAMPANA EN DOS PAISES

   «SP · Multi · exacta» existe en Espana y en Alemania, y anuncia PRODUCTOS
   DISTINTOS en cada uno: el rodillo en Espana, las bandas en Alemania. Es el
   caso real de una cuenta PanEU que replica la campana pais a pais.

   Los dos terminos estan elegidos para que la sugerencia automatica NO los
   pueda casar sola: lo que decide es la asignacion a mano, que es lo que la
   prueba mide.

   Gasto: Espana 30,00 · Alemania 70,00 · total 100,00. Numeros redondos y
   distintos a proposito, para que al mirar la imputacion se vea de un golpe
   si el dinero de Alemania se ha ido al producto espanol.
   ───────────────────────────────────────────────────────────────────────── */
const FILAS_DOS_PAISES = [
  // termino,              campana,              d0, d1, impr, clics, ped, ventas, gasto, gastoTxt, pais
  ['rodillo de espuma',    'SP · Multi · exacta', 5,  5, 1000,  50, 2,  60.00, 30.00, null, 'España'],
  ['bandas elasticas',     'SP · Multi · exacta', 5,  5, 1400,  70, 3,  90.00, 70.00, null, 'Alemania']
];

function escribir(dir){
  fs.mkdirSync(dir, {recursive:true});

  const cuerpoDos = [CAB.join(';')].concat(FILAS_DOS_PAISES.map(f=>fila(f))).join('\r\n')+'\r\n';
  fs.writeFileSync(path.join(dir,'terminos-dos-paises.csv'), '\ufeff'+cuerpoDos, 'utf8');
  const cuerpo = [CAB.join(';')].concat(FILAS.map(fila)).join('\r\n')+'\r\n';
  fs.writeFileSync(path.join(dir,'terminos-real.csv'), '﻿'+cuerpo, 'utf8');

  /* Variante con ESPACIOS AL FINAL en las dos cabeceras de fecha. Amazon los
     deja en la del ACOS; nada garantiza que no los deje mañana en otra. Un
     alias `^fechadeinicio$` aplicado al nombre sin normalizar no casaría, la
     columna de fecha se quedaría sin asignar y el gasto volvería a ser el mismo
     a 7 días que a 365 sin que nadie se entere. */
  const cabEsp = CAB.slice();
  cabEsp[0] = 'Fecha de inicio ';
  cabEsp[1] = 'Fecha de finalización  ';
  const cuerpo2 = [cabEsp.join(';')].concat(FILAS.map(fila)).join('\r\n')+'\r\n';
  fs.writeFileSync(path.join(dir,'terminos-cabeceras-con-espacios.csv'), '﻿'+cuerpo2, 'utf8');

  /* Informe SIN columnas de fecha: el caso en que no hay nada que prorratear y
     el hub tiene que decirlo en vez de repartir a ojo. */
  const idx = CAB.map((_,i)=>i).filter(i=>i>1);
  const cab3 = idx.map(i=>CAB[i]).join(';');
  const cuerpo3 = [cab3].concat(FILAS.map(f=>fila(f).split(';').slice(2).join(';'))).join('\r\n')+'\r\n';
  fs.writeFileSync(path.join(dir,'terminos-sin-fechas.csv'), '﻿'+cuerpo3, 'utf8');

  return {dir, filas:FILAS.length, columnas:CAB.length};
}

module.exports = {escribir, FILAS, CAB, ago};

if(require.main === module){
  const dir = process.argv[2] || path.join(__dirname, 'fixtures-publicidad');
  const r = escribir(dir);
  console.log('→ '+r.filas+' filas · '+r.columnas+' columnas · '+r.dir);
}
