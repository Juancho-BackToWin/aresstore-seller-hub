/* Carga LÍNEA A LÍNEA del informe de transacciones de Seller Central
   («Informe de fecha de transacción», CustomTransaction.csv) en la tabla
   amz_ventas_linea de Supabase.

   Por qué existe: los scripts del análisis del 25-nov vivían en el contenedor
   de aquel chat y se perdieron. Este es el mismo cálculo, en el repositorio.

   Lectura POSICIONAL de las 29 columnas: cada tienda escribe la cabecera en su
   idioma (ES, IT, FR, DE), pero el orden es el mismo. Se comprueba que hay 29
   columnas y que la cabecera es una de las cuatro conocidas; si no, se para.

   Qué NO se guarda nunca (el repositorio es público y Supabase no es el sitio
   de los datos de comprador): ciudad, región y código postal (columnas 9-11)
   se descartan al leer. El número de pedido se guarda cifrado (sha256 con un
   prefijo fijo), solo para poder casar un reembolso con su venta.

   Uso:
     node herramientas/cargar/transacciones.js --pais ES fichero.csv [...] \
          [--sql salida.sql] [--csv salida.csv] [--json f.json] \
          [--documento clave]
   Los ficheros reales NO están en el repositorio y no deben estarlo.  */
'use strict';
const fs = require('fs'), crypto = require('crypto'), path = require('path');

/* Columnas, en el orden que Amazon las escribe en las cuatro tiendas. */
const COL = {
  fecha:0, pago:1, tipo:2, pedido:3, sku:4, desc:5, cantidad:6, mercado:7,
  logistica_modo:8, /* 9-11: ciudad, región, CP · se descartan */ modelo:12,
  ventas:13, iva_ventas:14, envio:15, iva_envio:16, regalo:17, iva_regalo:18,
  promo:19, iva_promo:20, retenido:21, comision:22, tarifa_fba:23,
  otras_tarifas:24, otro:25, total:26, estado:27, liberacion:28,
};
const N_COLUMNAS = 29;

/* Primera celda de la cabecera de cada idioma, para reconocer el informe. */
const CABECERAS = {
  'fecha y hora': 'es', 'data/ora:': 'it', 'date/heure': 'fr', 'datum/uhrzeit': 'de',
};

/* Tipo de movimiento → tipo normalizado. Lo que no está aquí se rechaza en
   voz alta (no se mete en «otros» sin decirlo). */
const TIPOS = {
  venta:      ['Pedido','Ordine','Commande','Bestellung'],
  reembolso:  ['Reembolso','Rimborso','Remboursement','Erstattung'],
  ajuste:     ['Ajuste','Modifica','Ajustement','Anpassung'],
  retrocargo: ['Cargo retroactivo','Refund_Retrocharge'],
  liquidacion:['Liquidationen','Liquidaciones','Liquidazioni','Liquidations'],
  servicio:   ['Tarifa de prestación de servicio','Commissione di servizio','Frais de service','Servicegebühr'],
  tarifa:     ['Tarifas de inventario de Logística de Amazon','Costo di stoccaggio Logistica di Amazon',
               'Frais de stock Expédié par Amazon','Versand durch Amazon Lagergebühr',
               'Tarifas de transacción de Logística de Amazon','Commissioni per le transazioni di Logistica di Amazon',
               'Frais de transaction Expédié par Amazon','Transaktionsgebühren für Versand durch Amazon',
               'Tarifas de transacción de Logística de Amazon - Corrección','Tarifas de transacción de Logística de Amazon - Reversión',
               'Commissioni per le transazioni di Logistica di Amazon - Correzione','Commissioni per le transazioni di Logistica di Amazon - Inversione',
               'Frais de transaction Expédié par Amazon - Correction','Frais de transaction Expédié par Amazon - Inversion',
               'Tarifas de Amazon','Tariffe e commissioni Amazon','Amazon Fees','Gebühren von Amazon'],
  /* Movimientos de caja, no de cuenta de resultados: se cuentan y se saltan. */
  _caja:      ['Transferir','Trasferimento','Transfert','Übertrag',
               'Saldo descubierto','Saldo negativo','Solde négatif','Verbindlichkeit'],
};
const TIPO_DE = {};
for (const [k, v] of Object.entries(TIPOS)) v.forEach(t => { TIPO_DE[t] = k; });

const RE_PUBLICIDAD = /publicidad|pubblicit|publicit|werbe|advertis/i;

const MESES = { ene:1,jan:1,gen:1,janv:1, feb:2,febr:2,fev:2,'févr':2, mar:3,mars:3,'mär':3,
  abr:4,apr:4,avr:4, may:5,mag:5,mai:5, jun:6,giu:6,juin:6, jul:7,lug:7,juil:7,
  ago:8,aug:8,'août':8,aou:8, sept:9,sep:9,set:9, oct:10,ott:10,okt:10, nov:11, dic:12,dec:12,'déc':12,dez:12 };

/* «1 oct 2025 1:22:43 UTC», «1 oct. 2025 …», «1 ott 2025 …», «07.10.2025 02:37:08 UTC»
   → instante UTC. Si no se entiende, se lanza error: una fecha mal leída
   mueve una venta de mes sin que nadie lo vea. */
function instante(s) {
  s = s.trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) UTC$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2]-1, +m[1], +m[4], +m[5], +m[6]));
  m = s.match(/^(\d{1,2}) ([^\s.]+)\.? (\d{4}),? (\d{1,2}):(\d{2}):(\d{2}) UTC$/);
  if (m) {
    const mes = MESES[m[2].toLowerCase()];
    if (!mes) throw new Error('mes desconocido en fecha: ' + s);
    return new Date(Date.UTC(+m[3], mes-1, +m[1], +m[4], +m[5], +m[6]));
  }
  throw new Error('fecha no reconocida: ' + s);
}
/* Día en hora de Madrid (así se cierran los meses del negocio). */
const FMT_DIA = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' });
const diaMadrid = d => FMT_DIA.format(d);

/* «12,72» · «-1.234,56» · «12.72» · «» → número. */
function num(x) {
  x = (x || '').trim();
  if (!x) return 0;
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.');
  const v = Number(x);
  if (!Number.isFinite(v)) throw new Error('importe no numérico: ' + x);
  return v;
}
const r2 = v => Math.round(v * 100) / 100;

/* CSV con comillas dobles, sin dependencias. */
function filasCSV(texto) {
  const out = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (q) {
      if (c === '"') { if (texto[i+1] === '"') { campo += '"'; i++; } else q = false; }
      else campo += c;
    } else if (c === '"') q = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i+1] === '\n') i++;
      fila.push(campo); out.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); out.push(fila); }
  return out;
}

function decodificar(buf) {
  /* Validación estricta: el de DE a veces llega en cp1252. NO se mira si hay
     «�» en el texto: hay descripciones de producto que lo traen de
     verdad, y eso hacía leer como latin1 un UTF-8 válido (visto el 26-nov). */
  let t;
  try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { t = buf.toString('latin1'); }
  return t.replace(/^﻿/, '');
}

const huella = s => crypto.createHash('sha256').update(s).digest('hex');

/* Lee un informe y devuelve { idioma, filas, caja, rechazadas }. `pais` es la
   tienda de la que se descargó (el informe no lo dice de forma fiable: la
   columna «web de Amazon» viene vacía en tarifas y publicidad). */
function leer(texto, pais, nombre = '') {
  const todas = filasCSV(texto);
  const i0 = todas.findIndex(f => f.length === N_COLUMNAS && CABECERAS[(f[0] || '').trim().toLowerCase()]);
  if (i0 < 0) throw new Error(nombre + ': no encuentro la cabecera de 29 columnas en ningún idioma conocido');
  const idioma = CABECERAS[todas[i0][0].trim().toLowerCase()];
  const filas = [], rechazadas = [], vistos = {};
  let caja = 0;
  for (let k = i0 + 1; k < todas.length; k++) {
    const f = todas[k];
    if (f.length === 1 && f[0] === '') continue;
    if (f.length !== N_COLUMNAS) { rechazadas.push({ linea:k+1, motivo:'tiene ' + f.length + ' columnas' }); continue; }
    const tipoAmz = f[COL.tipo].trim();
    let tipo = TIPO_DE[tipoAmz];
    if (!tipo) { rechazadas.push({ linea:k+1, motivo:'tipo desconocido: ' + tipoAmz }); continue; }
    if (tipo === '_caja') { caja++; continue; }
    if (tipo === 'servicio') tipo = RE_PUBLICIDAD.test(f[COL.desc]) ? 'publicidad' : 'tarifa';
    const d = instante(f[COL.fecha]);
    const pedido = f[COL.pedido].trim();
    const sku = f[COL.sku].trim() || '(cuenta)';
    const dia = diaMadrid(d);
    /* Referencia estable y sin dato legible: pedido cifrado + tipo + sku +
       día + ordinal de repetición (dos líneas idénticas de un mismo pedido
       son dos unidades, no un duplicado). */
    const base = [pais, pedido ? 'p:' + huella('aresstore-pedido|' + pedido).slice(0, 16) : 'sin-pedido',
                  tipoAmz, sku, dia, f[COL.pago].trim(), f[COL.total].trim()].join('|');
    vistos[base] = (vistos[base] || 0) + 1;
    filas.push({
      dia, sku, pais, tipo,
      unidades: Math.trunc(num(f[COL.cantidad])),
      ingreso:  r2(num(f[COL.ventas]) + num(f[COL.envio]) + num(f[COL.regalo]) + num(f[COL.promo])),
      /* «impuesto retenido en el sitio web» (col. 21) es IVA que Amazon
         retiene como intermediario: va con el IVA, no con «otros». Así cuadra
         con el agregado del 25-nov (FR 3,86 € e IT 4,17 €). */
      iva:      r2(num(f[COL.iva_ventas]) + num(f[COL.iva_envio]) + num(f[COL.iva_regalo]) + num(f[COL.iva_promo]) + num(f[COL.retenido])),
      comision: r2(num(f[COL.comision])),
      logistica:r2(num(f[COL.tarifa_fba])),
      otros:    r2(num(f[COL.otras_tarifas]) + num(f[COL.otro])),
      total:    r2(num(f[COL.total])),
      ref_linea: huella(base + '|' + vistos[base]).slice(0, 24),
      pedido: pedido ? huella('aresstore-pedido|' + pedido).slice(0, 16) : null,
    });
  }
  return { idioma, filas, caja, rechazadas };
}

/* Comprobación interna de cada fila: lo que se reparte en columnas tiene que
   sumar el total que da Amazon. Si no cuadra, la fila se ha leído mal. */
function descuadres(filas) {
  return filas.filter(r => Math.abs(r2(r.ingreso + r.iva + r.comision + r.logistica + r.otros) - r.total) > 0.011);
}

const sqlTxt = v => v == null ? 'null' : "'" + String(v).replace(/'/g, "''") + "'";
function sqlInsert(filas, documento, lote = 400) {
  const out = [];
  for (let i = 0; i < filas.length; i += lote) {
    const vals = filas.slice(i, i + lote).map(r =>
      `(${sqlTxt(r.dia)},${sqlTxt(r.sku)},${sqlTxt(r.pais)},${sqlTxt(r.tipo)},${r.unidades},${r.ingreso},${r.iva},${r.comision},${r.logistica},${r.otros},'EUR',${sqlTxt(r.ref_linea)},${sqlTxt(documento)})`);
    out.push('insert into public.amz_ventas_linea (dia,sku,pais,tipo,unidades,ingreso,iva,comision,logistica,otros,divisa,ref_linea,documento) values\n' +
             vals.join(',\n') + '\non conflict (documento, ref_linea, tipo, sku, dia) do nothing;');
  }
  return out;
}

module.exports = { leer, descuadres, sqlInsert, instante, diaMadrid, num, filasCSV, decodificar, TIPOS, COL };

if (require.main === module) {
  const a = process.argv.slice(2);
  const opt = { ficheros: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--pais') opt.pais = a[++i];
    else if (a[i] === '--sql') opt.sql = a[++i];
    else if (a[i] === '--json') opt.json = a[++i];
    else if (a[i] === '--csv') opt.csv = a[++i];
    else if (a[i] === '--documento') opt.documento = a[++i];
    else opt.ficheros.push(a[i]);
  }
  if (!opt.pais || !opt.ficheros.length) { console.error('uso: transacciones.js --pais ES fichero.csv [...] [--sql s.sql] [--json f.json] [--documento clave]'); process.exit(2); }
  let todas = [], caja = 0, rech = [];
  for (const f of opt.ficheros) {
    const r = leer(decodificar(fs.readFileSync(f)), opt.pais, path.basename(f));
    todas = todas.concat(r.filas); caja += r.caja; rech = rech.concat(r.rechazadas.map(x => ({ ...x, fichero: path.basename(f) })));
    console.error(`${path.basename(f)} · ${r.idioma} · ${r.filas.length} líneas · ${r.caja} de caja · ${r.rechazadas.length} rechazadas`);
  }
  const dq = descuadres(todas);
  console.error(`total ${opt.pais}: ${todas.length} líneas · ${caja} de caja · ${rech.length} rechazadas · ${dq.length} que no suman su total`);
  rech.forEach(x => console.error('  RECHAZADA ' + x.fichero + ':' + x.linea + ' · ' + x.motivo));
  if (dq.length) { console.error('  DESCUADRE en ' + dq.length + ' filas; no se genera SQL'); process.exit(1); }
  const dup = todas.length - new Set(todas.map(r => [r.ref_linea, r.tipo, r.sku, r.dia].join('|'))).size;
  if (dup) { console.error('  ' + dup + ' referencias repetidas: no se genera SQL'); process.exit(1); }
  if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(todas));
  /* CSV para el importador de tablas de Supabase (columnas de amz_ventas_linea). */
  if (opt.csv) {
    const doc = opt.documento || 'informes/transacciones/' + opt.pais;
    const cab = 'dia,sku,pais,tipo,unidades,ingreso,iva,comision,logistica,otros,divisa,ref_linea,documento';
    const q = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    fs.writeFileSync(opt.csv, cab + '\n' + todas.map(r => [r.dia, r.sku, r.pais, r.tipo, r.unidades, r.ingreso, r.iva,
      r.comision, r.logistica, r.otros, 'EUR', r.ref_linea, doc].map(q).join(',')).join('\n') + '\n');
  }
  if (opt.sql) fs.writeFileSync(opt.sql, sqlInsert(todas, opt.documento || 'informes/transacciones/' + opt.pais).join('\n\n'));
}
