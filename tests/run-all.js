#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Lanzador de todas las suites

   POR QUÉ EXISTE. Antes `test:all` era una cadena fija de `npm run` unidos por
   `&&` dentro de package.json. Eso tenía dos problemas para trabajar en varios
   carriles a la vez:

   · Añadir una suite obligaba a editar package.json, que es un fichero que
     tocarían los diez carriles: conflicto garantizado en todos los merges.
     Aquí las suites se descubren solas leyendo `tests/*.test.js`.

   · Con `&&`, la primera suite roja abortaba la cadena y las demás NO llegaban
     a ejecutarse. Un carril veía «un fallo» sin saber si además había roto
     otras cinco. Aquí se ejecutan todas y se resume al final.

   Y UNA TERCERA COSA, QUE ES LA QUE MÁS TIEMPO CUESTA SI NO SE SABE.
   Las fixtures se generan con fechas relativas a hoy (`mkfixtures.js` usa
   `ago(k)`), pero están commiteadas con las fechas del día en que se generaron.
   Como `pnl()` filtra por `periodStart()`, que por defecto son los últimos 30
   días, unas fixtures de hace más de un mes se quedan FUERA del periodo: los
   informes dejan de mover números y suites que estaban verdes salen rojas sin
   que nadie haya tocado una línea de código.

   Pasó exactamente eso: la PR #4 quedó verde el 24 de agosto con «431 OK · 0
   FALLO», y el 17 de septiembre `test:informes` daba dos fallos en un árbol
   idéntico. No era una regresión: era el calendario. Por eso aquí se regeneran
   las fixtures ANTES de correr nada. Es la diferencia entre una suite que mide
   el código y una que mide qué día es hoy.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const TESTS = __dirname;

function correr(cmd, args, etiqueta){
  return spawnSync(cmd, args, {cwd:RAIZ, encoding:'utf8', maxBuffer:64*1024*1024});
}

/* ── 1 · fixtures frescas ─────────────────────────────────────────────────── */
process.stdout.write('→ Regenerando fixtures (llevan fechas relativas a hoy)\n');
for(const gen of ['mkfixtures.js','mkfixtures-es.js']){
  if(!fs.existsSync(path.join(TESTS, gen))) continue;
  const r = correr('node', [path.join('tests', gen)]);
  if(r.status !== 0){
    process.stdout.write('✗ No se han podido generar las fixtures con '+gen+'\n');
    process.stdout.write((r.stderr||r.stdout||'').slice(-2000)+'\n');
    process.exit(1);
  }
}

/* ── 2 · qué suites hay ───────────────────────────────────────────────────────
   Orden: privacidad la primera, porque mira el árbol en busca de credenciales y
   de datos reales colados en un fixture. Si eso falla, lo demás da igual: el
   repositorio es público. El resto, alfabético, para que el informe salga
   siempre igual y dos ejecuciones se puedan comparar línea a línea. */
const suites = fs.readdirSync(TESTS)
  .filter(f=>/\.test\.js$/.test(f))
  .sort((a,b)=> a==='privacidad.test.js' ? -1 : b==='privacidad.test.js' ? 1 : a.localeCompare(b,'es'));

if(!suites.length){ process.stdout.write('✗ No he encontrado ninguna suite en tests/\n'); process.exit(1); }

/* ── 3 · correrlas todas, pase lo que pase ────────────────────────────────── */
const filas = [];
let okTotal = 0, falloTotal = 0, suitesRojas = 0;

for(const s of suites){
  const t0 = Date.now();
  const r = correr('node', [path.join('tests', s)]);
  const seg = ((Date.now()-t0)/1000).toFixed(1);
  const salida = (r.stdout||'') + (r.stderr||'');

  /* Las suites imprimen «  OK    …» y «  FALLO …» por comprobación. Se cuentan
     de la salida en vez de fiarse solo del código de salida, para poder decir
     cuántas comprobaciones han pasado y no solo cuántas suites. */
  const ok = (salida.match(/^\s{2}OK\s/gm)||[]).length;
  const fallo = (salida.match(/^\s{2}FALLO\s/gm)||[]).length;
  okTotal += ok; falloTotal += fallo;

  const roja = r.status !== 0 || fallo > 0;
  if(roja) suitesRojas++;
  filas.push({s, ok, fallo, seg, roja, salida});

  process.stdout.write(
    (roja?'✗ ':'✓ ') + s.replace(/\.test\.js$/,'').padEnd(16) +
    String(ok).padStart(4) + ' OK' +
    (fallo? '  ·  '+fallo+' FALLO' : '') +
    '   '+seg+'s\n');
}

/* ── 4 · el detalle solo de lo que ha fallado ─────────────────────────────── */
if(suitesRojas){
  process.stdout.write('\n─── Detalle de lo rojo ───────────────────────────────\n');
  for(const f of filas.filter(x=>x.roja)){
    process.stdout.write('\n### '+f.s+'\n');
    const lineas = f.salida.split('\n').filter(l=>/^\s{2}FALLO\s/.test(l));
    if(lineas.length) process.stdout.write(lineas.join('\n')+'\n');
    else process.stdout.write(f.salida.slice(-1500)+'\n');
  }
}

/* ── 5 · resumen ──────────────────────────────────────────────────────────── */
process.stdout.write('\n' + '═'.repeat(54) + '\n');
process.stdout.write(
  suites.length+' suites · '+okTotal+' comprobaciones OK · '+falloTotal+' FALLO\n');
process.stdout.write(suitesRojas
  ? '✗ '+suitesRojas+' suite(s) en rojo\n'
  : '✓ todo correcto\n');

process.exit(suitesRojas ? 1 : 0);
