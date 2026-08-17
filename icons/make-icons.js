/* Generador del set de iconos de Aresstore Seller Hub.
   Lenguaje visual: squircle, gradiente naranja, glifo geométrico blanco.
   Todo son formas primitivas para que rendericen igual en cualquier motor. */
const fs = require('fs');
const D = __dirname;

const OR1 = '#FF8A00';   // naranja alto
const OR2 = '#FF5A00';   // naranja profundo
const OR3 = '#FFB020';   // reflejo
const INK = '#171210';   // negro cálido

/* squircle superelíptico aproximado con arcos, 1024×1024 con margen 64 */
const R = 216;   // radio de esquina: squircle tipo iOS, no círculo
const SQ = `M280,64 h464 a${R},${R} 0 0 1 ${R},${R} v464 a${R},${R} 0 0 1 -${R},${R} h-464 a${R},${R} 0 0 1 -${R},-${R} v-464 a${R},${R} 0 0 1 ${R},-${R} z`;

function wrap(id, glyph, opts){
  opts = opts || {};
  const bg = opts.dark
    ? `<path d="${SQ}" fill="url(#i${id})"/><path d="${SQ}" fill="none" stroke="url(#r${id})" stroke-width="6"/>`
    : `<path d="${SQ}" fill="url(#g${id})"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" role="img" aria-label="${opts.label||id}">
  <defs>
    <linearGradient id="g${id}" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${OR3}"/><stop offset="0.45" stop-color="${OR1}"/><stop offset="1" stop-color="${OR2}"/>
    </linearGradient>
    <linearGradient id="i${id}" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#241B16"/><stop offset="1" stop-color="${INK}"/>
    </linearGradient>
    <linearGradient id="r${id}" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${OR1}" stop-opacity=".9"/><stop offset="1" stop-color="${OR2}" stop-opacity=".25"/>
    </linearGradient>
    <linearGradient id="s${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${bg}
  <clipPath id="c${id}"><path d="${SQ}"/></clipPath>
  <g clip-path="url(#c${id})"><ellipse cx="512" cy="196" rx="620" ry="420" fill="url(#s${id})"/></g>
  ${glyph}
</svg>`;
}

/* ---------- 1 · HUB: monograma A sobre rejilla de apps ---------- */
const hubGlyph = `
  <g fill="${OR1}">
    <rect x="252" y="252" width="188" height="188" rx="52" opacity=".55"/>
    <rect x="584" y="252" width="188" height="188" rx="52" opacity=".8"/>
    <rect x="252" y="584" width="188" height="188" rx="52" opacity=".8"/>
  </g>
  <g transform="translate(584,584)">
    <rect x="0" y="0" width="188" height="188" rx="52" fill="url(#gA)"/>
    <path d="M94,32 L150,156 L116,156 L106,132 L82,132 L72,156 L38,156 Z M94,74 L84,102 L104,102 Z" fill="#fff"/>
  </g>
  <defs><linearGradient id="gA" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="${OR3}"/><stop offset="1" stop-color="${OR2}"/></linearGradient></defs>`;
fs.writeFileSync(D+'/icon-hub.svg', wrap('hub', hubGlyph, {dark:true, label:'Aresstore Seller Hub'}));

/* ---------- 2 · GESTIÓN SELLER: caja + barras ascendentes ---------- */
const gestionGlyph = `
  <g fill="#fff">
    <path d="M512,214 L790,352 L512,490 L234,352 Z" opacity=".95"/>
    <path d="M234,404 L234,634 L486,760 L486,530 Z" opacity=".78"/>
    <path d="M790,404 L790,634 L538,760 L538,530 Z" opacity=".55"/>
  </g>
  <g fill="${INK}">
    <rect x="586" y="600" width="52" height="112" rx="16"/>
    <rect x="658" y="546" width="52" height="166" rx="16"/>
    <rect x="730" y="474" width="52" height="238" rx="16"/>
  </g>`;
fs.writeFileSync(D+'/icon-gestion.svg', wrap('ges', gestionGlyph, {label:'Gestión Seller'}));

/* ---------- 3 · PPC: diana con flecha ---------- */
const ppcGlyph = `
  <g fill="none" stroke="#fff" stroke-width="52" stroke-linecap="round">
    <circle cx="486" cy="538" r="216"/><circle cx="486" cy="538" r="104"/>
  </g>
  <circle cx="486" cy="538" r="34" fill="#fff"/>
  <g stroke="${INK}" stroke-width="54" stroke-linecap="round">
    <path d="M486,538 L768,256"/>
  </g>
  <path d="M660,232 L800,224 L792,364 Z" fill="${INK}"/>`;
fs.writeFileSync(D+'/icon-ppc.svg', wrap('ppc', ppcGlyph, {label:'PPC'}));

/* ---------- 4 · CONTABILIDAD: documento con € ---------- */
const contaGlyph = `
  <path d="M290,196 h330 l134,134 v498 a34,34 0 0 1 -34,34 h-430 a34,34 0 0 1 -34,-34 v-598 a34,34 0 0 1 34,-34 z" fill="#fff"/>
  <path d="M620,196 l134,134 h-134 z" fill="${OR3}"/>
  <g fill="${INK}">
    <rect x="348" y="466" width="200" height="34" rx="17"/>
    <rect x="348" y="546" width="140" height="34" rx="17"/>
    <rect x="348" y="626" width="176" height="34" rx="17"/>
  </g>
  <g fill="none" stroke="${OR2}" stroke-width="42" stroke-linecap="round">
    <path d="M676,530 a92,92 0 1 0 0,140"/><path d="M572,570 h132"/><path d="M572,630 h132"/>
  </g>`;
fs.writeFileSync(D+'/icon-contabilidad.svg', wrap('con', contaGlyph, {label:'Contabilidad'}));

/* ---------- 5 · PROVEEDORES: fábrica + intercambio ---------- */
const provGlyph = `
  <g fill="#fff">
    <path d="M258,506 L430,410 L430,506 L602,410 L602,506 L774,410 L774,772 a26,26 0 0 1 -26,26 h-464 a26,26 0 0 1 -26,-26 z"/>
    <rect x="290" y="264" width="86" height="200" rx="18"/>
  </g>
  <g fill="${INK}">
    <rect x="336" y="620" width="88" height="112" rx="16"/>
    <rect x="468" y="620" width="88" height="112" rx="16"/>
    <rect x="600" y="620" width="88" height="112" rx="16"/>
  </g>`;
fs.writeFileSync(D+'/icon-proveedores.svg', wrap('pro', provGlyph, {label:'Proveedores'}));

/* ---------- 6 · CUMPLIMIENTO: escudo con check ---------- */
const cumpGlyph = `
  <path d="M512,196 L790,300 v230 c0,168 -118,264 -278,318 c-160,-54 -278,-150 -278,-318 v-230 z" fill="#fff"/>
  <path d="M392,540 L474,622 L646,450" fill="none" stroke="${OR2}" stroke-width="66" stroke-linecap="round" stroke-linejoin="round"/>`;
fs.writeFileSync(D+'/icon-cumplimiento.svg', wrap('cum', cumpGlyph, {label:'Cumplimiento'}));

/* ---------- 7 · ANALÍTICA: barras + línea ---------- */
const anaGlyph = `
  <g fill="#fff">
    <rect x="266" y="546" width="104" height="220" rx="26"/>
    <rect x="418" y="454" width="104" height="312" rx="26"/>
    <rect x="570" y="514" width="104" height="252" rx="26"/>
    <rect x="722" y="358" width="104" height="408" rx="26"/>
  </g>
  <path d="M300,470 L470,362 L622,414 L784,258" fill="none" stroke="${INK}" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="784" cy="258" r="40" fill="${INK}"/>`;
fs.writeFileSync(D+'/icon-analitica.svg', wrap('ana', anaGlyph, {label:'Analítica'}));

console.log('SVG generados:');
fs.readdirSync(D).filter(f=>f.endsWith('.svg')).forEach(f=>console.log('  '+f));
