/* Pruebas del cargador línea a línea (herramientas/cargar/transacciones.js).
   Ficheros sintéticos escritos con el formato LITERAL de Amazon (cabeceras
   reales de ES, IT y DE copiadas de los informes del 25-nov; datos inventados).
   La aritmética esperada va a mano en cada comentario.

   Cada prueba que persigue un fallo concreto se ha visto ROJA sin su arreglo
   (METODO, corolario del 5-sep):
   · «retenido al IVA»: con la col. 21 sumada a «otros», iva=1,00 y otros=-0,50.
   · «UTF-8 con �»: con el detector antiguo (buscar �) el tipo salía
     «Tarifa de prestaciÃ³n…» y la fila se rechazaba.
   · «Madrid, no UTC»: con el día en UTC, la venta de las 23:30 UTC del 31-ene
     caía en enero.  */
'use strict';
const C = require('../herramientas/cargar/transacciones.js');
let ok = 0, ko = 0;
function es(desc, real, esperado) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('  OK    ' + desc); } else { ko++; console.log('  FALLO ' + desc + '\n        real:     ' + a + '\n        esperado: ' + b); }
}

const PREAMBULO = 'línea 1\nlínea 2\nlínea 3\nlínea 4\nlínea 5\nlínea 6\nlínea 7\nlínea 8\n';
const CAB_ES = '"fecha y hora","identificador de pago","tipo","número de pedido","sku","descripción","cantidad","web de Amazon","gestión logística","ciudad de procedencia del pedido","comunidad autónoma de procedencia del pedido","código postal de procedencia del pedido","Formulario de recaudación de impuestos","ventas de productos","impuesto de ventas de productos","abonos de envío","impuestos por abonos de envío","abonos de envoltorio para regalo","impuestos por abonos de envoltorio para regalo","devoluciones promocionales","impuestos de descuentos por promociones","impuesto retenido en el sitio web","tarifas de venta","tarifas de Logística de Amazon","tarifas de otras transacciones","otro","total","Estado de la transacción","Fecha de liberación de la transacción"';
const CAB_DE = '"Datum/Uhrzeit","Abrechnungsnummer","Typ","Bestellnummer","SKU","Beschreibung","Menge","Marketplace","Versand","Ort der Bestellung","Bundesland","Postleitzahl","Steuererhebungsmodell","Umsätze","Produktumsatzsteuer","Gutschrift für Versandkosten","Steuer auf Versandgutschrift","Gutschrift für Geschenkverpackung","Steuer auf Geschenkverpackungsgutschriften","Rabatte aus Werbeaktionen","Steuer auf Aktionsrabatte","Einbehaltene Steuer auf Marketplace","Verkaufsgebühren","Gebühren zu Versand durch Amazon","Andere Transaktionsgebühren","Andere","Gesamt","Transaktionsstatus","Freigabedatum der Transaktion"';
const fila = c => c.map(x => '"' + x + '"').join(',');
const CIUDAD = 'VILLAPRUEBA', CP = '99999';

/* 1 · Venta ES: ventas 18,54 − iva 1,69 (10 %), envío 0, promo −1,00 con iva −0,09.
   ingreso = 18,54 + 0 + 0 − 1,00 = 17,54 · iva = 1,69 − 0,09 = 1,60
   total = 17,54 + 1,60 − 2,04 − 3,28 − 0,05 = 13,77 */
const venta = fila(['31 ene 2026 23:30:00 UTC','111','Pedido','402-0000000-0000001','FBA0500','Paño','1','amazon.es','Amazon',CIUDAD,'PROVINCIA',CP,'',
  '18,54','1,69','0','0','0','0','-1,00','-0,09','0','-2,04','-3,28','-0,05','0','13,77','Liberado','']);
/* 2 · Publicidad: «Tarifa de prestación de servicio» con «Gastos de publicidad». otros = −50,00 */
const publi = fila(['3 feb 2026 10:00:00 UTC','111','Tarifa de prestación de servicio','','','Gastos de publicidad','','','','','','','',
  '0','0','0','0','0','0','0','0','0','0','0','-50,00','0','-50,00','Liberado','']);
/* 3 · Transferencia: de caja, se cuenta y no se carga. */
const transf = fila(['4 feb 2026 10:00:00 UTC','111','Transferir','','','A tu cuenta','','','','','','','',
  '0','0','0','0','0','0','0','0','0','0','0','0','-100,00','-100,00','Liberado','']);
/* 4 · Misma venta repetida (dos unidades en dos líneas): dos filas, dos referencias. */
const textoES = PREAMBULO + CAB_ES + '\n' + [venta, publi, transf, venta].join('\n') + '\n';

const R = C.leer(textoES, 'ES');
es('idioma ES', R.idioma, 'es');
es('3 líneas cargadas (2 ventas + 1 publicidad) y 1 de caja', [R.filas.length, R.caja, R.rechazadas.length], [3, 1, 0]);
const v = R.filas[0];
es('venta · ingreso, iva, comisión, logística, otros', [v.ingreso, v.iva, v.comision, v.logistica, v.otros], [17.54, 1.6, -2.04, -3.28, -0.05]);
es('venta · el reparto suma el total de Amazon', C.descuadres(R.filas).length, 0);
es('Madrid, no UTC: 23:30 UTC del 31-ene es 1-feb en España', v.dia, '2026-02-01');
es('publicidad reconocida por la descripción', [R.filas[1].tipo, R.filas[1].otros, R.filas[1].sku], ['publicidad', -50, '(cuenta)']);
es('dos líneas idénticas → dos referencias distintas', R.filas[0].ref_linea !== R.filas[2].ref_linea, true);
es('el mismo pedido se cifra igual en las dos líneas', R.filas[0].pedido === R.filas[2].pedido && /^[0-9a-f]{16}$/.test(R.filas[0].pedido), true);
const plano = JSON.stringify(R.filas);
es('privacidad: ni ciudad, ni CP, ni número de pedido legible', [plano.includes(CIUDAD), plano.includes(CP), plano.includes('402-0000000')], [false, false, false]);

/* 5 · Retenido al IVA (FR/IT): ventas 20,00, iva 0, retenido 1,00 → iva 1,00, otros −0,50.
   total = 20 + 1 − 3 − 4 − 0,50 = 13,50 */
const ret = fila(['10 mar 2026 9:00:00 UTC','1','Pedido','405-1','FBA0500','x','1','amazon.es','Amazon','','','','',
  '20,00','0','0','0','0','0','0','0','1,00','-3,00','-4,00','-0,50','0','13,50','Liberado','']);
const Rr = C.leer(PREAMBULO + CAB_ES + '\n' + ret + '\n', 'ES').filas[0];
es('retenido al IVA, no a otros', [Rr.iva, Rr.otros], [1, -0.5]);

/* 6 · Alemán con fecha dd.mm.aaaa y tipo «Liquidationen». */
const de = fila(['07.10.2025 02:37:08 UTC','2','Liquidationen','','FBASPB01','x','1','','','','','','',
  '2,70','0','0','0','0','0','0','0','0','0','0','-1,20','0','1,50','Freigegeben','']);
const Rd = C.leer(PREAMBULO + CAB_DE + '\n' + de + '\n', 'DE');
es('DE · idioma, tipo, día y total', [Rd.idioma, Rd.filas[0].tipo, Rd.filas[0].dia, Rd.filas[0].ingreso], ['de', 'liquidacion', '2025-10-07', 2.7]);

/* 7 · UTF-8 válido con un «�» de verdad en la descripción. */
const raro = fila(['5 feb 2026 10:00:00 UTC','1','Tarifa de prestación de servicio','','','Gastos de publicidad �','','','','','','','',
  '0','0','0','0','0','0','0','0','0','0','0','-1,00','0','-1,00','Liberado','']);
const Ru = C.leer(C.decodificar(Buffer.from(PREAMBULO + CAB_ES + '\n' + raro + '\n', 'utf8')), 'ES');
es('UTF-8 con «�» en un campo sigue siendo UTF-8', [Ru.rechazadas.length, Ru.filas[0] && Ru.filas[0].tipo], [0, 'publicidad']);
/* y cp1252 de verdad (byte 0xF3 = «ó») se lee como latin1 */
const cp = Buffer.from(PREAMBULO + CAB_ES + '\n' + publi + '\n', 'latin1');
es('cp1252 se reconoce', C.leer(C.decodificar(cp), 'ES').filas.length, 1);

/* 8 · Tipo desconocido: se rechaza en voz alta, no se mete en «otros». */
const nuevo = fila(['6 feb 2026 10:00:00 UTC','1','Tipo inventado por Amazon','','','x','','','','','','','',
  '0','0','0','0','0','0','0','0','0','0','0','-7,00','0','-7,00','Liberado','']);
const Rn = C.leer(PREAMBULO + CAB_ES + '\n' + nuevo + '\n', 'ES');
es('tipo desconocido rechazado con su motivo', [Rn.filas.length, Rn.rechazadas.length, /Tipo inventado/.test(Rn.rechazadas[0].motivo)], [0, 1, true]);

/* 9 · Fecha ilegible: error, no un día inventado. */
let lanzo = false; try { C.instante('31/01/2026'); } catch (e) { lanzo = true; }
es('fecha ilegible lanza error', lanzo, true);

/* 10 · Importes con miles: «-1.234,56» */
es('importe con punto de miles', C.num('-1.234,56'), -1234.56);

console.log(`cargar · ${ok} OK · ${ko} FALLO`);
process.exit(ko ? 1 : 0);
