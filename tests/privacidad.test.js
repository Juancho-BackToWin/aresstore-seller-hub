#!/usr/bin/env node
/* =========================================================================
   El repositorio es público · ni datos de comprador ni credenciales

   Esta suite no abre el navegador: mira el árbol de ficheros. Existe porque
   el informe de pedidos de Amazon trae `ship-city`, `ship-state` y
   `ship-postal-code` con datos de compradores reales, y subir uno como fixture
   sería una brecha de datos personales — además de contradecir por escrito los
   controles de seguridad firmados ante Amazon el 23 de agosto de 2026.

   Los fixtures se SINTETIZAN a partir de las especificaciones de cabecera y de
   los recuentos, nunca copiando un fichero real. Las columnas de comprador van
   vacías, y esta prueba es lo que impide que dejen de estarlo por descuido.
   ========================================================================= */
const fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};

const ficheros = (dir, acc=[]) => {
  for(const e of fs.readdirSync(dir, {withFileTypes:true})){
    if(e.name==='node_modules' || e.name==='.git') continue;
    const f = path.join(dir, e.name);
    if(e.isDirectory()) ficheros(f, acc); else acc.push(f);
  }
  return acc;
};
const TODOS = ficheros(RAIZ);

console.log('\n=== PRIV-A · NINGUNA CREDENCIAL EN EL ÁRBOL ===');
/* Ni en una prueba. Un secreto en un repositorio público está comprometido
   desde el segundo en que se empuja, y rotarlo después no lo borra del
   historial. */
const PATRONES = [
  ['clave de AWS',            /\bAKIA[0-9A-Z]{16}\b/],
  ['token de GitHub',         /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['clave de OpenAI',         /\bsk-[A-Za-z0-9]{32,}\b/],
  ['clave privada PEM',       /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['token JWT',               /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['cabecera Authorization',  /authorization\s*[:=]\s*['"]?(bearer|basic)\s+\S/i],
  ['contraseña asignada',     /\b(password|passwd|contrasena|contraseña)\s*[:=]\s*['"][^'"\s]{4,}['"]/i],
  ['secreto asignado',        /\b(api[_-]?key|secret|access[_-]?token)\s*[:=]\s*['"][^'"\s]{8,}['"]/i]
];
const TEXTO = TODOS.filter(f=>/\.(js|html|json|sh|md|txt|csv|webmanifest|yml|yaml)$/i.test(f));
let hallazgos = [];
TEXTO.forEach(f=>{
  let t; try{ t = fs.readFileSync(f,'latin1'); }catch(e){ return; }
  PATRONES.forEach(([nombre, rx])=>{
    const m = t.match(rx);
    if(m) hallazgos.push(path.relative(RAIZ,f)+' · '+nombre+' · '+String(m[0]).slice(0,24)+'…');
  });
});
check(TEXTO.length+' ficheros de texto revisados, ninguna credencial',
  hallazgos.length===0, hallazgos.join(' | ') || 'limpio');

console.log('\n=== PRIV-B · LAS COLUMNAS DE COMPRADOR VAN VACÍAS ===');
/* `ship-city`, `ship-state` y `ship-postal-code` son las tres que identifican a
   una persona. No basta con que hoy digan «Madrid»: la prueba exige que estén
   vacías, para que nadie las rellene «para que se vea más real». */
const COMPRADOR = /^(ship-city|ship-state|ship-postal-code|ciudad.*envio|provincia|codigo.*postal|c[oó]digo postal)$/i;
const pedidos = TODOS.filter(f=>/fixtures(-es)?\/.*\.(txt|csv)$/.test(f.replace(/\\/g,'/')));
let sucias = [];
pedidos.forEach(f=>{
  let t; try{ t = fs.readFileSync(f,'latin1'); }catch(e){ return; }
  const lineas = t.split(/\r?\n/).filter(x=>x.trim());
  if(lineas.length<2) return;
  const delim = lineas[0].indexOf('\t')>=0 ? '\t' : ',';
  const H = lineas[0].split(delim).map(h=>h.trim().replace(/^"|"$/g,''));
  const idx = H.map((h,i)=>COMPRADOR.test(h)?i:-1).filter(i=>i>=0);
  if(!idx.length) return;
  lineas.slice(1).forEach(l=>{
    const c = l.split(delim);
    idx.forEach(i=>{ const v=(c[i]||'').trim().replace(/^"|"$/g,'');
      if(v) sucias.push(path.relative(RAIZ,f)+' · '+H[i]+' = «'+v+'»'); });
  });
});
check('ningún fixture lleva ciudad, provincia ni código postal',
  sucias.length===0, [...new Set(sucias)].slice(0,4).join(' | ') || 'todas vacías');

console.log('\n=== PRIV-C · NINGÚN INFORME REAL SUBIDO POR ERROR ===');
/* Los informes que Amazon entrega tienen nombres muy reconocibles. Si uno
   aparece en el árbol, es que alguien ha subido un fichero real. */
const SOSPECHOSOS = /(CustomTransaction|_ALL_ORDERS_|GET_[A-Z_]+_DATA|Fee_?Preview|VAT_TRANSACTIONS|InventoryHealth|MerchantListings|_flat_file_)/i;
const intrusos = TODOS.map(f=>path.relative(RAIZ,f)).filter(f=>SOSPECHOSOS.test(f));
check('no hay ficheros con nombre de descarga de Seller Central',
  intrusos.length===0, intrusos.join(', ') || 'ninguno');

console.log('\n=== PRIV-D · NI UN DATO DE COMPRADOR EN NINGÚN FICHERO VERSIONADO ===');
/* PRIV-B mira los fixtures, que es donde se sabe que hay tablas. Esto mira EL
   ÁRBOL ENTERO, porque el fichero que de verdad hace daño es el que nadie
   esperaba: un informe real dejado en la raíz «un momento para probar», o
   copiado dentro de docs/. El nombre puede ser inocente — `datos.txt`,
   `prueba.csv` — así que aquí no se mira el nombre: se mira el contenido.

   Se busca cualquier columna de comprador con algo escrito. Vacía es válida:
   los fixtures llevan esas columnas para reproducir el formato literal del
   informe de Amazon, y tienen que seguir llevándolas. Lo que no puede haber es
   un valor dentro. */
/* `ship-country` NO entra aquí a propósito: es el país de destino, no identifica
   a nadie, y el hub lo necesita para el IVA multipaís y para `countryOf`. Lo que
   identifica a una persona es la ciudad, la provincia, el código postal, la
   dirección y todo lo que empiece por `buyer-`. */
const PERSONAL = /^"?(ship-(city|state|postal-code|address-?\d*)|buyer-.*|recipient-name|ciudad|provincia|c[oó]digo[ _-]?postal|destinatario)"?$/i;
const TABLAS = TODOS.map(f=>path.relative(RAIZ,f).replace(/\\/g,'/'))
  .filter(f=>/\.(txt|csv|tsv)$/i.test(f) && !/^node_modules\//.test(f));
const conPersonales = [];
for(const rel of TABLAS){
  let t; try{ t = fs.readFileSync(path.join(RAIZ, rel),'utf8'); }catch(e){ continue; }
  const lineas = t.split(/\r?\n/).filter(x=>x.trim());
  if(lineas.length < 2) continue;
  /* El separador se deduce de la cabecera, igual que hace el importador: TAB si
     lo hay, luego punto y coma, luego coma. */
  const cab = lineas[0].replace(/^﻿/,'');
  const delim = cab.indexOf('\t')>=0 ? '\t' : (cab.indexOf(';')>=0 ? ';' : ',');
  const H = cab.split(delim).map(h=>h.trim());
  const idx = H.map((h,i)=>PERSONAL.test(h)?i:-1).filter(i=>i>=0);
  if(!idx.length) continue;
  for(const l of lineas.slice(1)){
    const c = l.split(delim);
    const sucia = idx.some(i=>{
      const v = (c[i]||'').trim().replace(/^"|"$/g,'');
      return v!=='' && v!=='--';
    });
    if(sucia){ conPersonales.push(rel+' · columna '+idx.map(i=>H[i]).join('/')); break; }
  }
}
check(TABLAS.length+' ficheros tabulares revisados, ninguno con datos de comprador',
  conPersonales.length===0,
  conPersonales.join(' | ') || 'ninguno');

console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
process.exit(fails===0 ? 0 : 1);
