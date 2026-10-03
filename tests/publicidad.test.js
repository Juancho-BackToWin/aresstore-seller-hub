#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   CARRIL 4 · PUBLICIDAD

   Un hub de gestión no falla dando error: falla dando un número creíble y
   falso. En esta pantalla el número creíble y falso tiene consecuencias
   inmediatas y caras: hace bajar la puja de un término que estaba ganando
   dinero, o negativizar una palabra que traía descubrimiento.

   Cada caso lleva la aritmética a mano en el comentario. Si el motor cambia y
   la prueba falla, ahí está la cuenta para saber quién de los dos se equivoca.

   Las fixtures se generan al arrancar (`mkfixtures-publicidad.js`) con las
   fechas relativas a hoy. Todo este carril va de periodos: una fixture con
   fechas absolutas se sale del periodo sola y la suite pasaría a medir qué día
   es hoy en vez de medir el código.
   ═══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const mk = require('./mkfixtures-publicidad.js');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};
const near = (a,b,t)=> typeof a==='number' && isFinite(a) && Math.abs(a-b) < (t==null?0.01:t);
/* Un número para el mensaje, que nunca reviente aunque venga vacío: una prueba
   que persigue un fallo tiene que salir roja CON MENSAJE, no con un stack. */
const n2 = (x,d)=> (typeof x==='number' && isFinite(x)) ? x.toFixed(d==null?2:d) : '—';

/* Las fixtures van a un directorio temporal: se regeneran en cada ejecución
   porque llevan fechas relativas, así que versionarlas solo añadiría ruido a
   todos los merges. */
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-fixtures-'));
mk.escribir(FIX);

/* Laboratorio: dos productos con MÁRGENES DISTINTOS a propósito.
     TEST-ROD · precio 25,00 · coste 5,00  → margen antes de tarifas 80 %
     TEST-BAN · precio 20,00 · coste 8,00  → margen antes de tarifas 60 %
   Veinte puntos de diferencia. Si el ACOS de equilibrio saliera del margen
   medio de la cuenta —o del SKU equivocado— los dos darían lo mismo, y esos
   veinte puntos son justo la diferencia entre subir una puja y bajarla.
   Ventas: 30 días, una unidad de cada uno al día, sin IVA para que la cuenta
   se pueda seguir de cabeza. */
const LAB = `
  /* Se conserva lo ya importado: el laboratorio pone catálogo y ventas, no
     tira el informe que la prueba acaba de cargar por el selector de ficheros. */
  const _importado = DB.imports;
  DB = blankDB();
  DB.imports = _importado;
  DB.products = [
    {id:'t1', sku:'TEST-ROD', name:'Rodillo de espuma muscular', cogs:5, freight:0, fba:3,
     referral:15, price:25, channel:'FBA', lots:[]},
    {id:'t2', sku:'TEST-BAN', name:'Set de bandas elasticas', cogs:8, freight:0, fba:2,
     referral:15, price:20, channel:'FBA', lots:[]}];
  const hoy = new Date();
  const dia = k => { const d=new Date(hoy); d.setDate(d.getDate()-k);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const venta = (d,sku,precio)=>({amazonorderid:'o'+d+sku, purchasedate:d+'T10:00:00+00:00',
    fulfillmentchannel:'Amazon', saleschannel:'Amazon.es', sku:sku, asin:'B0'+sku,
    itemstatus:'Shipped', quantity:'1', itemprice:String(precio), itemtax:'0', shipcountry:'ES'});
  const ventas=[]; for(let k=0;k<30;k++){ ventas.push(venta(dia(k),'TEST-ROD',25)); ventas.push(venta(dia(k),'TEST-BAN',20)); }
`;

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

  /* Evaluar sin que una función que todavía no existe reviente la suite con un
     stack. Una prueba que persigue un fallo tiene que salir ROJA CON MENSAJE
     también cuando el arreglo no está puesto: si solo sabe petar, no dice nada. */
  const ev = async (src) => {
    try{ return await page.evaluate(src); }
    catch(e){ return {__err: String((e && e.message) || e).split('\n')[0].slice(0,140)}; }
  };
  const err = r => (r && r.__err) ? 'sin el arreglo del carril 4: '+r.__err : undefined;

  /* Importar una fixture por el mismo camino que un usuario: el selector de
     ficheros de la pantalla de Datos. */
  const importar = async (fichero) => {
    await page.evaluate(()=>{ DB.imports={}; DB.mappings={}; saveDB();
      const l=document.getElementById('fileList'); if(l) l.innerHTML=''; refreshAll(); });
    await page.waitForTimeout(200);
    await page.evaluate(()=>go('datos'));
    /* Vaciar el selector antes: repetir el MISMO fichero dos veces seguidas no
       dispara el evento `change` y la importación no llegaría a ocurrir, con lo
       que la prueba mediría la pantalla anterior sin enterarse. */
    await page.setInputFiles('#csvFile', []);
    await page.setInputFiles('#csvFile', path.resolve(FIX, fichero));
    await page.waitForTimeout(1200);
    return page.evaluate(()=>{
      const el = document.querySelector('#fileList .fileitem');
      return {ok: !!(el && el.querySelector('.f-dot.ok')),
              meta: el ? (el.querySelector('.f-meta')||{}).textContent : '',
              id: Object.keys(DB.imports)[0]||'', filas: (DB.imports.searchterm||{}).count||0};
    });
  };

  console.log('\n=== PUB-A · EL INFORME, EN SU FORMATO LITERAL ===');
  /* BOM, CRLF, punto y coma, decimales con coma, 25 columnas, fechas en
     español y el espacio final en la cabecera del ACOS. Si algo de eso rompe la
     lectura, todo lo demás de esta suite mide aire. */
  const imp = await importar('terminos-real.csv');
  check('el CSV con BOM, CRLF, «;» y decimales con coma se reconoce',
    imp.ok && imp.id==='searchterm', imp.id+' · '+imp.meta.slice(0,70));
  check('y trae las 9 filas', imp.filas===9, imp.filas+' filas');

  console.log('\n=== PUB-B · «ago 20, 2026» ES AGOSTO, NO UNA FECHA INVÁLIDA ===');
  /* `parseDate()` (carril 6) delega en `new Date()`, que entiende «jun» y
     «jul» —son abreviaturas inglesas— pero NO «ene», «abr», «ago» ni «dic».
     Cuatro de doce. Medido sobre el informe real de agosto de 2026: el rango
     salía 2026-06-19 → 2026-07-31 (43 días) en vez de → 2026-08-22 (65 días),
     y el gasto imputado al periodo era un 51 % más alto, con la etiqueta
     «medido» puesta. */
  const fechas = await ev(`(()=>{
    const casos = ['ene 05, 2026','abr 02, 2026','ago 20, 2026','dic 01, 2026','jul 14, 2026'];
    return casos.map(s=>({s, pub: pubFecha(s) ? iso(pubFecha(s)) : null,
                             base: parseDate(s) && !isNaN(parseDate(s)) ? iso(parseDate(s)) : null}));
  })()`);
  check('los cuatro meses que el motor de JavaScript no entiende, aquí sí',
    Array.isArray(fechas) && fechas.every(f=>f.pub && /^\d{4}-\d{2}-\d{2}$/.test(f.pub)),
    err(fechas) || (Array.isArray(fechas) ? fechas.map(f=>f.s+'→'+f.pub).join(' · ') : String(fechas)));
  check('y se documenta que sin esto agosto se perdía',
    Array.isArray(fechas) && fechas.filter(f=>f.base===null).length===4,
    Array.isArray(fechas) ? fechas.filter(f=>f.base===null).map(f=>f.s).join(', ')+' son inválidas para parseDate()' : '');

  console.log('\n=== PUB-C · UNA FILA AGREGADA SE REPARTE POR DÍA Y SE CORTA ===');
  /* La fixture trae «rodillo barato» con fecha de inicio hace 34 días y fecha
     de fin hace 25: 10 días naturales y 100,00 € de gasto = 10,00 €/día.
     Mirando los últimos 30 días, la ventana es [hoy−29, hoy], así que de esa
     fila solo caen dentro los días hoy−29 … hoy−25, que son CINCO.

       100,00 € × 5/10 = 50,00 €

     Y «rodillo masaje muscular», de hace 20 a hace 11 días, cae entera:
     40,00 €. Con el prorrateo antiguo —un factor único para todo el informe—
     las dos salían multiplicadas por el mismo número, que es como el gasto de
     junio acababa imputado a septiembre. */
  await page.evaluate(`(()=>{${LAB}
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'};
    periodDays = 30; refreshAll(); })()`);
  const corte = await ev(`(()=>{ periodDays=30; const A=adStats();
    const t = n => { const x=A.terms.filter(t=>t.term===n)[0]; return x? x.spend : null; };
    return {barato:t('rodillo barato'), masaje:t('rodillo masaje muscular'),
            obs:A.spendObservado, bruto:A.spendBruto, medidos:A.diasMedidos,
            extrap:A.diasExtrapolados, adDays:A.adDays, spend:A.spend};
  })()`);
  check('la fila de 10 días entra por los 5 que caen dentro: 50,00 €',
    near(corte.barato, 50), err(corte) || (corte.barato==null?'no existe ese término':n2(corte.barato)+' € · 100,00 × 5/10 = 50,00'));
  check('la fila de 10 días que cae entera entra entera: 40,00 €',
    near(corte.masaje, 40), err(corte) || (corte.masaje==null?'no existe ese término':n2(corte.masaje)+' €'));
  /* 12,00 + 40,00 + 50,00 + 9,00 + 25,00 + 0,4356 + 6,00 + 9,00 + 4,00 */
  check('el gasto observado dentro del periodo suma 155,4356 €',
    near(corte.obs, 155.4356, 0.02), err(corte) || n2(corte.obs,4)+' €');
  check('y el informe declara 205,4356 € en total',
    near(corte.bruto, 205.4356, 0.02), err(corte) || n2(corte.bruto,4)+' €');
  /* Días del periodo que el informe toca, contados SIN repetir:
       · hoy−20 … hoy−11 → 10 días de «rodillo masaje muscular», que ya se
         tragan el hoy−12 de «rodillo con bandas» y el hoy−15 de «rodillo con
         tres clics»;
       · hoy−29 … hoy−25 →  5 días de «rodillo barato» dentro de la ventana;
       · hoy−1, hoy−2, hoy−5, hoy−8, hoy−9 → 5 días sueltos.
     Total 20 días medidos de 30, y 10 sin medir. Que un día tocado por dos
     filas cuente una sola vez es la diferencia entre decir «el informe cubre
     el periodo» y decir la verdad. */
  check('cuenta 20 días medidos de 30 · un día tocado dos veces cuenta una',
    corte.medidos===20 && corte.extrap===10,
    err(corte) || corte.medidos+' días medidos · '+corte.extrap+' extrapolados');

  console.log('\n=== PUB-D · EL GASTO DEPENDE DEL PERIODO · EL FALLO PRINCIPAL ===');
  /* Era el síntoma que se veía desde fuera: el mismo gasto a 7 días que a 365.
     Con las fechas leídas y cortadas, a 7 días solo entran las filas de hoy−1,
     hoy−2 y hoy−5: 9,00 + 12,00 + 9,00 = 30,00 € observados. */
  const periodos = await ev(`(()=>{ const out={};
    [7,30,365].forEach(d=>{ periodDays=d; const A=adStats();
      out[d]={spend:A.spend, obs:A.spendObservado, medidos:A.diasMedidos, extrap:A.diasExtrapolados,
              sinDato:A.diasSinDato, terms:A.terms.length}; });
    periodDays=30; return out; })()`);
  check('a 7 días solo entran las tres filas de esa semana: 30,00 € observados',
    near(periodos[7] && periodos[7].obs, 30), err(periodos) || (periodos[7]?n2(periodos[7].obs)+' €':''));
  check('el gasto imputado cambia con el periodo',
    periodos[7] && periodos[7].spend !== periodos[30].spend && periodos[30].spend !== periodos[365].spend,
    err(periodos) || (periodos[7] ? '7d='+n2(periodos[7].spend)+' · 30d='+n2(periodos[30].spend)+
      ' · 365d='+n2(periodos[365].spend)+' € (con el fallo, los tres iguales)' : ''));
  /* Un informe de 34 días no puede hablar de 365. Se estira como mucho otros
     34 días y el resto se declara SIN DATO, en vez de multiplicar por diez lo
     que el informe sabe: con la extrapolación sin tope, el informe real de
     agosto —65 días de cobertura— imputaba a «12 meses» cinco veces y media el
     gasto que declara. (Las cifras de ese informe no se escriben aquí: el
     repositorio es público.) */
  check('un informe de 34 días no se estira a 365: el resto se declara sin dato',
    periodos[365] && periodos[365].extrap<=periodos[365].sinDato+periodos[365].extrap && periodos[365].sinDato>290,
    err(periodos) || (periodos[365] ? periodos[365].extrap+' días extrapolados y '+periodos[365].sinDato+' sin dato' : ''));

  console.log('\n=== PUB-E · PRORRATEAR SOLO EL GASTO DISPARARÍA EL ACOS ===');
  /* El fallo que este carril podría haberse metido él solo. «rodillo masaje
     muscular» tiene 40,00 € de gasto y 150,00 € de ventas: ACOS 26,67 %.
     Mirando 15 días, de sus 10 días solo caen 4 dentro:
       gasto  = 40,00 × 4/10 =  16,00 €
       ventas = 150,00 × 4/10 = 60,00 €
       ACOS   = 16 / 60       = 26,67 %  ← el mismo
     Si se prorrateara el gasto y no las ventas, el ACOS saldría 100 % y la
     pantalla mandaría bajar la puja de un término que está al 26 %. */
  const acos = await ev(`(()=>{ const out={};
    [30,15].forEach(d=>{ periodDays=d; const A=adStats();
      const t=A.terms.filter(t=>t.term==='rodillo masaje muscular')[0]||{};
      out[d]={spend:t.spend, sales:t.sales, acos: t.sales? t.spend/t.sales*100 : null}; });
    periodDays=30; return out; })()`);
  check('el gasto del término se recorta a 16,00 € y las ventas a 60,00 €',
    near(acos[15] && acos[15].spend, 16) && near(acos[15] && acos[15].sales, 60),
    err(acos) || (acos[15] ? n2(acos[15].spend)+' € de gasto · '+n2(acos[15].sales)+' € de ventas' : ''));
  check('y el ACOS del término no se mueve: 26,7 % en los dos periodos',
    near(acos[30] && acos[30].acos, 26.667, 0.05) && near(acos[15] && acos[15].acos, 26.667, 0.05),
    err(acos) || (acos[15] ? 'a 30 días '+n2(acos[30].acos,1)+' % · a 15 días '+n2(acos[15].acos,1)+' %' : ''));

  console.log('\n=== PUB-F · CUATRO DECIMALES CON COMA NO SON DIEZ MIL VECES MÁS ===');
  /* `toNum('0,4356')` devuelve 4356: decide que la coma es decimal solo si
     lleva detrás una o dos cifras. El informe de publicidad trae columnas de
     cuatro decimales. En la columna de gasto, eso convierte 0,44 € en
     4.356,00 € y ese término se coloca el primero de la lista de desperdicio
     con una orden de negativizar encima. */
  const dec = await ev(`(()=>{ periodDays=30; const A=adStats();
    const t=A.terms.filter(t=>t.term==='cinta cuatro decimales')[0]||{};
    return {spend:t.spend, toNum:toNum('€0,4356'), pubNum:pubNum('€0,4356'),
            mayor: A.terms.slice().sort((a,b)=>b.spend-a.spend)[0].term}; })()`);
  check('el gasto de esa fila es 0,4356 €, no 4.356 €',
    near(dec.spend, 0.4356, 0.0001), err(dec) || n2(dec.spend,4)+' €');
  check('y se documenta el agujero de toNum() que obliga a la costura',
    dec.toNum===4356 && near(dec.pubNum, 0.4356, 0.0001),
    err(dec) || 'toNum→'+dec.toNum+' · pubNum→'+dec.pubNum);
  check('ese término no se cuela como el que más gasta',
    typeof dec.mayor==='string' && dec.mayor && dec.mayor!=='cinta cuatro decimales',
    err(dec) || 'el que más gasta es «'+dec.mayor+'»');

  console.log('\n=== PUB-G · UN ESPACIO AL FINAL DE LA CABECERA NO PUEDE ROMPER EL PRORRATEO ===');
  /* El informe real trae «Coste publicitario de las ventas (ACOS) total » con
     un espacio al final. Los alias de las columnas de fecha van anclados con
     `^…$`, así que si se aplicaran al nombre SIN normalizar, un espacio de más
     dejaría la columna sin asignar, el gasto volvería a ser el mismo a 7 días
     que a 365 y nadie vería un error por ningún lado. */
  const espacios = await importar('terminos-cabeceras-con-espacios.csv');
  await page.evaluate(`(()=>{${LAB}
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'}; periodDays=30; })()`);
  const esp = await ev(`(()=>{ periodDays=30; const A=adStats();
    const t=A.terms.filter(t=>t.term==='rodillo barato')[0]||{};
    return {ok:A.spanUnknown===false, barato:t.spend, adDays:A.adDays,
            norm: normHdr('Coste publicitario de las ventas (ACOS) total ')}; })()`);
  check('el informe con espacios al final en las cabeceras de fecha se sigue fechando',
    espacios.ok && esp.ok===true && near(esp.barato, 50),
    err(esp) || ('spanUnknown='+(esp.ok===true?'false':'true')+' · rodillo barato = '+
      n2(esp.barato)+' €'));
  check('la cabecera del ACOS se normaliza sin el espacio final',
    esp.norm==='costepublicitariodelasventasacostotal', err(esp) || '«'+esp.norm+'»');

  console.log('\n=== PUB-H · UN INFORME SIN FECHAS SE DICE, NO SE REPARTE A OJO ===');
  const sinF = await importar('terminos-sin-fechas.csv');
  await page.evaluate(`(()=>{${LAB}
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'}; periodDays=30; })()`);
  const sf = await ev(`(()=>{ const out={};
    [7,365].forEach(d=>{ periodDays=d; const P=pnl(); out[d]={ppc:P.ppc, src:P.ppcSource, med:P.measured}; });
    periodDays=30; const A=adStats();
    return {out, span:A.spanUnknown, kpi:(document.getElementById('adKpis')||{}).textContent||''}; })()`);
  check('sin columnas de fecha, el gasto es el mismo a 7 días que a 365 · no hay nada que repartir',
    sinF.ok && sf.out && near(sf.out[7].ppc, sf.out[365].ppc, 0.02),
    err(sf) || (sf.out ? n2(sf.out[7].ppc)+' € y '+n2(sf.out[365].ppc)+' €' : ''));
  check('pero el hub dice que no sabe qué periodo cubre y deja de llamarlo medido',
    sf.span===true && sf.out && sf.out[7].src==='informe-sin-fechas' && sf.out[7].med===false,
    err(sf) || (sf.out ? sf.out[7].src+' · measured='+sf.out[7].med : ''));

  console.log('\n=== PUB-I · SIN SABER QUÉ SKU ANUNCIA, NO HAY ACOS DE EQUILIBRIO ===');
  /* El informe de términos de búsqueda NO trae SKU. El único hilo es cómo se
     llaman las campañas, que es una convención del vendedor. La fixture trae
     los cuatro casos:
       · «SP · TEST-ROD · exacta»   el código del SKU, inequívoco.
       · «SP · Bandas · amplia»     una palabra del nombre de UN producto.
       · «SP · Rodillo y Bandas»    palabras de DOS productos → ambiguo.
       · «SP · Genérico · auto»     nada.
     Un ACOS de equilibrio calculado con el margen del SKU equivocado es el
     número que hace bajar una puja rentable: donde no hay casamiento, la
     pantalla escribe «no lo sé». */
  await importar('terminos-real.csv');
  await page.evaluate(`(()=>{${LAB}
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'}; periodDays=30; refreshAll(); })()`);
  const casar = await ev(`(()=>{ periodDays=30; const T=pubTerminos();
    const t = n => T.lista.filter(x=>x.term===n)[0]||{};
    return {porSku:t('rodillo de espuma'), porNombre:t('bandas elasticas'),
            ambiguo:t('rodillo con bandas'), sinCasar:t('gomas baratas'),
            sinCasarTotal:T.sinCasar, total:T.lista.length,
            eqRod:(T.skus.filter(s=>s.sku==='TEST-ROD')[0]||{}).acosEq,
            eqBan:(T.skus.filter(s=>s.sku==='TEST-BAN')[0]||{}).acosEq}; })()`);
  check('el código del SKU en la campaña casa, y lo dice',
    casar.porSku && casar.porSku.sku==='TEST-ROD' && casar.porSku.origen==='sku',
    err(casar) || (casar.porSku ? casar.porSku.sku+' por '+casar.porSku.origen : ''));
  check('el nombre del producto en la campaña casa, marcado como tal',
    casar.porNombre && casar.porNombre.sku==='TEST-BAN' && casar.porNombre.origen==='nombre',
    err(casar) || (casar.porNombre ? casar.porNombre.sku+' por '+casar.porNombre.origen : ''));
  check('una campaña que casa con dos SKU se deja SIN veredicto, no se elige uno',
    casar.ambiguo && casar.ambiguo.sku===null && casar.ambiguo.origen==='ambiguo' &&
    casar.ambiguo.acosEq===null && casar.ambiguo.accion==='sin veredicto',
    err(casar) || (casar.ambiguo ? 'sku='+casar.ambiguo.sku+' · '+casar.ambiguo.accion : ''));
  check('y una campaña genérica no recibe ACOS de equilibrio inventado',
    casar.sinCasar && casar.sinCasar.sku===null && casar.sinCasar.acosEq===null,
    err(casar) || (casar.sinCasar ? 'acosEq='+casar.sinCasar.acosEq : ''));
  /* INTEGRACIÓN · esta comprobación exigía 20,0 puntos EXACTOS de diferencia, y
     lo razonaba así: «las tarifas son las mismas para los dos en el modelo de
     skuStats()». Eso era cierto con la fórmula anterior, que repartía las
     tarifas como un porcentaje del ingreso; entonces la diferencia entre los
     dos márgenes era solo la del coste de producto: 80 % − 60 % = 20 puntos.

     Con la entrega del 6-sep ya no lo es, Y ESE ES EL ARREGLO: la tarifa de
     logística es un importe FIJO por unidad —3,00 € el rodillo, 2,00 € las
     bandas, con el recargo de combustible— y un importe fijo pesa MÁS sobre el
     artículo barato en porcentaje. Sobre 25,00 € y 20,00 €, eso mueve la
     diferencia de 20,0 a 18,0 puntos. Exigir los 20,0 sería exigir que la
     tarifa volviera a repartirse por ingreso, que es justo lo que invertía el
     orden del ABC.

     Así que se comprueba lo que esta prueba quería decir, y se comprueba más
     fuerte que antes: que los dos umbrales son DISTINTOS entre sí, que el de
     más margen es el más alto, y que ninguno de los dos coincide con la media
     de ambos — que es lo que saldría si el umbral fuera un promedio. */
  const eqMedia = ((casar.eqRod||0) + (casar.eqBan||0)) / 2;
  check('el ACOS de equilibrio es el del SKU, no un promedio: 18 puntos de diferencia',
    (casar.eqRod||0) - (casar.eqBan||0) > 10 &&
    Math.abs((casar.eqRod||0) - eqMedia) > 5 &&
    Math.abs((casar.eqBan||0) - eqMedia) > 5,
    err(casar) || ('TEST-ROD '+n2(casar.eqRod,1)+' % vs TEST-BAN '+n2(casar.eqBan,1)+' %'));

  console.log('\n=== PUB-J · REVISIÓN ADVERSARIAL · QUÉ HARÍA BAJAR UNA PUJA RENTABLE ===');
  /* Tres informes reales que llevarían a la recomendación equivocada:

     1 · El dato de ayer. Las conversiones se reatribuyen a 1, 7 y 28 días y
         los clics inválidos se depuran durante 72 h: el ACOS de los últimos
         tres días SIEMPRE sale peor de lo que acabará siendo. «rodillo caro de
         ayer» tiene 9,00 € de gasto y 10,00 € de ventas —ACOS 90 %, por encima
         del equilibrio— pero es de ayer.
     2 · El término con tres clics y ninguna venta. Tres clics no demuestran
         nada; negativizar por impaciencia cuesta descubrimiento.
     3 · El término que ha gastado menos de lo que aporta un pedido. */
  const adver = await ev(`(()=>{ periodDays=30; const T=pubTerminos();
    const t = n => T.lista.filter(x=>x.term===n)[0]||{};
    return {ayer:t('rodillo caro de ayer'), tres:t('rodillo con tres clics'),
            claro:t('rodillo barato'), generico:t('gomas baratas')}; })()`);
  check('un ACOS malo de ayer no baja la puja: espera a que el dato se asiente',
    adver.ayer && adver.ayer.accion==='esperar' && adver.ayer.enMovimiento===true,
    err(adver) || (adver.ayer ? adver.ayer.accion+' · '+adver.ayer.motivo : ''));
  check('tres clics sin venta no se negativizan',
    adver.tres && adver.tres.accion==='esperar',
    err(adver) || (adver.tres ? adver.tres.accion+' · '+adver.tres.motivo : ''));
  check('pero 60 clics, ni un pedido y 50,00 € sí se negativizan',
    adver.claro && adver.claro.accion==='negativizar',
    err(adver) || (adver.claro ? adver.claro.accion+' · '+adver.claro.motivo : ''));
  /* El mismo número malo con fecha vieja sí baja la puja: si no, la regla
     anterior no estaría midiendo la fecha, estaría tapando el veredicto. */
  const viejo = await ev(`(()=>{ periodDays=30;
    const hoy=new Date(); const d=k=>{const x=new Date(hoy); x.setDate(x.getDate()-k);
      return ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][x.getMonth()]+
             ' '+String(x.getDate()).padStart(2,'0')+', '+x.getFullYear();};
    DB.imports.searchterm.rows.push({_term:'rodillo caro de hace tiempo', _campaign:'SP · TEST-ROD · exacta',
      _from:d(14), _to:d(14), _spend:'€9,00', _sales:'€10,00', _orders:'1', _clicks:'20', _impr:'500',
      campaignname:'SP · TEST-ROD · exacta'});
    const T=pubTerminos();
    const x=T.lista.filter(t=>t.term==='rodillo caro de hace tiempo')[0]||{};
    DB.imports.searchterm.rows.pop();
    return {accion:x.accion, acos:x.acos, eq:x.acosEq}; })()`);
  check('el mismo ACOS del 90 %, pero de hace dos semanas, sí manda bajar la puja',
    viejo.accion==='bajar puja',
    err(viejo) || (viejo.accion||'—')+' · ACOS '+n2(viejo.acos,0)+
      ' % contra un equilibrio del '+n2(viejo.eq,0)+' %');

  console.log('\n=== PUB-K · LA REGLA DE LAS 72 HORAS ===');
  /* Amazon necesita entre 48 y 72 horas para estabilizar una puja nueva. Medir
     antes es medir ruido. El hub no lo impide —decide una persona— pero lo
     anota y lo avisa. */
  const regla = await ev(`(()=>{
    DB.pujas=[];
    const h = k => { const d=new Date(); d.setHours(d.getHours()-k); return d.toISOString(); };
    const a = pubAnotarPuja({termino:'rodillo de espuma', campana:'SP · TEST-ROD · exacta',
                             sku:'TEST-ROD', antes:'0,45', despues:'0,60', ts:h(100)});
    const b = pubAnotarPuja({termino:'rodillo de espuma', campana:'SP · TEST-ROD · exacta',
                             antes:'0,60', despues:'0,75', ts:h(90)});   // 10 h después
    const c = pubAnotarPuja({termino:'rodillo de espuma', campana:'SP · TEST-ROD · exacta',
                             antes:'0,75', despues:'0,80', ts:h(5)});    // 85 h después
    const d = pubAnotarPuja({termino:'bandas elasticas', campana:'SP · Bandas · amplia',
                             antes:'0,30', despues:'0,40', ts:h(1)});    // otra puja, primer cambio
    const sinTermino = pubAnotarPuja({termino:'', campana:'x'});
    renderPub();
    return {a:{prem:a.prematuro, h:a.horasDesdeAnterior, antes:a.antes, despues:a.despues},
            b:{prem:b.prematuro, h:b.horasDesdeAnterior},
            c:{prem:c.prematuro, h:c.horasDesdeAnterior},
            d:{prem:d.prematuro, h:d.horasDesdeAnterior},
            sinTermino, guardados:DB.pujas.length,
            tabla:(document.getElementById('pubPujasTable')||{}).textContent||''}; })()`);
  check('el primer cambio anotado no avisa de nada',
    regla.a && regla.a.prem===false && regla.a.h===null,
    err(regla) || (regla.a ? 'prematuro='+regla.a.prem : ''));
  check('un cambio 10 horas después del anterior avisa: faltan 62 h',
    regla.b && regla.b.prem===true && near(regla.b.h, 10, 0.2),
    err(regla) || (regla.b ? regla.b.h+' h · prematuro='+regla.b.prem : ''));
  check('uno 85 horas después ya no avisa',
    regla.c && regla.c.prem===false && near(regla.c.h, 85, 0.2),
    err(regla) || (regla.c ? regla.c.h+' h · prematuro='+regla.c.prem : ''));
  check('la regla es por puja, no por cuenta: otro término empieza de cero',
    regla.d && regla.d.prem===false && regla.d.h===null,
    err(regla) || (regla.d ? 'horas='+regla.d.h : ''));
  check('los importes con coma decimal se guardan bien (0,45 → 0,45 €)',
    regla.a && near(regla.a.antes, 0.45) && near(regla.a.despues, 0.60),
    err(regla) || (regla.a ? regla.a.antes+' → '+regla.a.despues : ''));
  check('un cambio sin término no se guarda',
    regla.sinTermino===null && regla.guardados===4,
    err(regla) || (regla.guardados+' anotaciones guardadas'));
  check('y la tabla enseña el aviso de las 72 horas',
    typeof regla.tabla==='string' && regla.tabla.indexOf('antes de las 72 h')>=0,
    err(regla) || (regla.tabla||'').replace(/\s+/g,' ').slice(0,90));

  console.log('\n=== PUB-L · LA PANTALLA DICE QUE ES UN PRORRATEO ===');
  /* Presentar como medido lo que es estimado está prohibido. Un prorrateo que
     no se ve en pantalla es exactamente eso. */
  await importar('terminos-real.csv');
  await page.evaluate(`(()=>{${LAB}
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'}; periodDays=30; refreshAll(); })()`);
  await page.evaluate(()=>go('publicidad'));
  await page.waitForTimeout(500);
  const pantalla = await page.evaluate(()=>({
    verdict: (document.getElementById('stVerdict')||{}).textContent||'',
    kpis: Array.from(document.querySelectorAll('#adKpis .kpi')).map(e=>e.textContent).join(' | '),
    eq: (document.getElementById('pubEqTable')||{}).textContent||'',
    nota: (document.getElementById('pubEqNota')||{}).textContent||'',
    extra: !!document.getElementById('pubExtra'),
    filasEq: document.querySelectorAll('#pubEqTable tr').length,
    filasSku: document.querySelectorAll('#pubSkuTable tr').length,
    tablaSku: (document.getElementById('pubSkuTable')||{}).textContent||''
  }));
  check('el veredicto dice, con esas palabras, que es un prorrateo y no una medición',
    /prorrateo, no una medici/i.test(pantalla.verdict),
    pantalla.verdict.replace(/\s+/g,' ').slice(0,120));
  check('y cuenta cuántas filas del informe son de varios días',
    /no son de un d[ií]a/i.test(pantalla.verdict), /3 de 9/.test(pantalla.verdict)?'3 de 9 filas':'—');
  check('los KPI dicen cuántos días están medidos y cuántos extrapolados',
    /Días medidos/.test(pantalla.kpis) && /extrapolad/.test(pantalla.kpis),
    pantalla.kpis.replace(/\s+/g,' ').slice(0,150));
  check('la tabla de equilibrio marca los términos sin casar',
    pantalla.extra && /sin casar/i.test(pantalla.eq) && /no lo s[ée]/i.test(pantalla.eq),
    pantalla.filasEq+' filas en la tabla de equilibrio');
  check('y la nota dice cuántos términos se han quedado sin SKU',
    /no se han podido casar con un SKU/i.test(pantalla.nota),
    pantalla.nota.replace(/\s+/g,' ').slice(0,110));
  check('la tabla por SKU separa lo orgánico de lo pagado',
    /TACOS/.test(pantalla.tablaSku) && /TEST-ROD/.test(pantalla.tablaSku),
    pantalla.filasSku+' filas por SKU');

  console.log('\n=== PUB-M · NI UNA ESCRITURA EN AMAZON ===');
  /* El hub recomienda; decide una persona. Ni automatización de pujas, ni
     llamadas a ninguna API, ni credenciales. Se comprueba sobre el código
     fuente del módulo, no sobre lo que diga la pantalla. */
  let fuente = '';
  try{ fuente = fs.readFileSync(path.resolve(__dirname,'..','src','24-publicidad.js'),'utf8'); }
  catch(e){ fuente = ''; }
  check('el módulo del carril 4 existe', fuente.length>0,
    fuente.length ? Math.round(fuente.length/1024)+' KB' : 'falta src/24-publicidad.js');
  check('el módulo no hace ninguna llamada de red',
    fuente.length>0 && !/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket\s*\(/.test(fuente),
    fuente.length ? 'sin fetch, XHR, beacon ni websocket' : 'no hay módulo que revisar');
  check('ni guarda credenciales de ningún tipo',
    fuente.length>0 && !/(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)/i.test(fuente),
    fuente.length ? 'limpio' : 'no hay módulo que revisar');
  const rotulo = await page.evaluate(()=>{ const e=document.getElementById('pubExtra'); return e? e.textContent : ''; });
  check('y la pantalla dice por escrito que no automatiza nada',
    /no automatiza nada/i.test(rotulo), rotulo ? 'declarado en pantalla' : 'la pantalla del carril 4 no está');

  console.log('\n=== PUB-N · LA EXPORTACIÓN LLEVA DE DÓNDE SALE CADA NÚMERO ===');
  const exp = await ev(`(()=>{
    let cap=null; const base=descargarCSV;
    descargarCSV = (nombre,cab,filas)=>{ cap={nombre,cab,filas}; };
    try{ exportPublicidad(); } finally { descargarCSV = base; }
    if(!cap) return {vacio:true};
    const i = cap.cab.indexOf('Cómo se ha casado el SKU');
    return {cols:cab_len(cap), i, filas:cap.filas.length,
            origenes: cap.filas.map(f=>f[i]),
            tieneProrrateo: cap.cab.indexOf('Gasto prorrateado')>=0,
            tieneMotivo: cap.cab.indexOf('Motivo')>=0};
    function cab_len(c){ return c.cab.length; } })()`);
  check('exporta una fila por término con la columna de cómo se casó el SKU',
    exp.filas===9 && exp.i>=0, err(exp) || (exp.filas+' filas · '+exp.cols+' columnas'));
  check('y lleva el gasto prorrateado y el motivo de cada recomendación',
    exp.tieneProrrateo===true && exp.tieneMotivo===true,
    err(exp) || ('gasto prorrateado: '+(exp.tieneProrrateo?'sí':'NO')+' · motivo: '+(exp.tieneMotivo?'sí':'NO')));
  check('en la exportación también se distingue lo casado de lo que no',
    Array.isArray(exp.origenes) && exp.origenes.indexOf('sin casar')>=0 && exp.origenes.indexOf('código del SKU en la campaña')>=0,
    err(exp) || (Array.isArray(exp.origenes) ? [...new Set(exp.origenes)].join(' · ') : ''));

  console.log('\n=== PUB-Q · UNA LIBRA NO ES UN EURO ===');
  /* Segunda vuelta de la revisión adversarial: ¿qué informe REAL haría que el
     hub mandara bajar una puja rentable? Uno de varios mercados. El informe de
     términos trae una columna «Divisa», y un informe de Reino Unido o Polonia
     trae filas en GBP o PLN. Sumadas al mismo montón, el gasto sube sin que
     suban las ventas en euros: el ACOS de esos términos se dispara y la
     recomendación se invierte.

     Caso: 100,00 € en euros y 100,00 «GBP» en la misma pantalla. Lo que no se
     puede sumar sin un tipo de cambio se queda fuera, y se dice cuánto. */
  const divisas = await ev(`(()=>{
    const hoy=new Date(); const d=k=>{const x=new Date(hoy); x.setDate(x.getDate()-k);
      return ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][x.getMonth()]+
             ' '+String(x.getDate()).padStart(2,'0')+', '+x.getFullYear();};
    const fila = (div,gasto,term)=>({_term:term, _campaign:'SP · TEST-ROD · exacta',
      campaignname:'SP · TEST-ROD · exacta', divisa:div, _from:d(3), _to:d(3),
      _spend:gasto, _sales:'€200,00', _orders:'4', _clicks:'50', _impr:'2000'});
    DB.imports.searchterm = {count:2, file:'multi', rows:[
      fila('EUR','€100,00','termino en euros'), fila('GBP','100,00','termino en libras')]};
    periodDays=30; renderPub(); const A=adStats();
    return {spend:A.spendBruto, filas:A.filas, fuera:A.filasOtraDivisa, gastoFuera:A.gastoOtraDivisa,
            divisas:A.otrasDivisas, terms:A.terms.map(t=>t.term),
            verdict:(document.getElementById('stVerdict')||{}).textContent||''}; })()`);
  check('el gasto en otra divisa no se suma al total en euros',
    near(divisas.spend, 100) && divisas.fuera===1 && near(divisas.gastoFuera, 100),
    err(divisas) || (n2(divisas.spend)+' € sumados · '+divisas.fuera+' fila fuera'));
  check('ese término no aparece mezclado con los demás',
    Array.isArray(divisas.terms) && divisas.terms.length===1 && divisas.terms[0]==='termino en euros',
    err(divisas) || (Array.isArray(divisas.terms)? divisas.terms.join(' · ') : ''));
  check('y la pantalla dice qué divisa se ha quedado fuera',
    /vienen en GBP/.test(divisas.verdict||''),
    err(divisas) || (divisas.verdict||'').replace(/\s+/g,' ').slice(0,120));

  console.log('\n=== PUB-P · UN INFORME QUE NO TOCA EL PERIODO NO DEJA LA TABLA EN BLANCO ===');
  /* Si ni un día del informe cae en la ventana, todas las filas se recortan a
     cero. Dejar así la tabla sería lo peor de los dos mundos: los KPI enseñando
     euros extrapolados encima de una tabla vacía que invita a importar el
     informe que ya está importado. Y un término que quemó dinero hace tres
     meses sigue mereciendo una decisión.

     Caso: informe de hace 119 a 90 días, 100,00 € de gasto y ni un pedido,
     mirando los últimos 30 días. */
  const fuera = await ev(`(()=>{
    const hoy=new Date(); const d=k=>{const x=new Date(hoy); x.setDate(x.getDate()-k);
      return ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][x.getMonth()]+
             ' '+String(x.getDate()).padStart(2,'0')+', '+x.getFullYear();};
    DB.imports.searchterm = {count:1, file:'viejo', rows:[{
      _term:'termino de hace tres meses', _campaign:'SP · TEST-ROD · exacta', campaignname:'SP · TEST-ROD · exacta',
      _from:d(119), _to:d(90), _spend:'€100,00', _sales:'€0,00', _orders:'0', _clicks:'80', _impr:'4000'}]};
    periodDays=30; renderPub(); const A=adStats();
    const t=A.terms[0]||{};
    return {terms:A.terms.length, spend:t.spend, clicks:t.clicks, fuera:t.fueraDePeriodo,
            fueraA:A.fueraDePeriodo, medidos:A.diasMedidos, ppc:pnl().ppc,
            verdict:(document.getElementById('stVerdict')||{}).textContent||'',
            tabla:(document.getElementById('stTable')||{}).textContent||''}; })()`);
  check('el término sigue en la tabla, con las cifras completas del informe',
    fuera.terms===1 && near(fuera.spend, 100) && near(fuera.clicks, 80),
    err(fuera) || (fuera.terms+' términos · '+n2(fuera.spend)+' € · '+n2(fuera.clicks,0)+' clics'));
  check('y cada fila dice que son cifras de fuera del periodo',
    fuera.fuera===true && fuera.fueraA===true && /fuera del periodo/.test(fuera.tabla),
    err(fuera) || ('marcado='+fuera.fuera));
  check('el veredicto dice que el informe no toca ni un día del periodo',
    /no toca ni un d[ií]a del periodo/i.test(fuera.verdict||''),
    err(fuera) || (fuera.verdict||'').replace(/\s+/g,' ').slice(0,110));
  check('y el P&L sigue sin poner la publicidad a cero, que inflaría el margen',
    fuera.ppc>0 && fuera.medidos===0,
    err(fuera) || (n2(fuera.ppc)+' € extrapolados con 0 días medidos'));

  console.log('\n=== PUB-O · PUBLICIDAD VACÍA, PARCIAL Y COMPLETA, SIN ERRORES ===');
  /* A 1440 px la barra lateral va plegada y los botones de navegación miden
     0×0: se navega con go(), no con un click que no llegaría nunca. */
  const estados = [];
  // vacío
  await page.evaluate(()=>{ DB=blankDB(); DB.pujas=[]; saveDB(); refreshAll(); go('publicidad'); });
  await page.waitForTimeout(400);
  estados.push(await page.evaluate(()=>({
    caso:'vacía', txt:(document.getElementById('stVerdict')||{}).textContent.slice(0,60),
    kpis:document.querySelectorAll('#adKpis .kpi').length,
    filas:document.querySelectorAll('#stTable tr').length})));
  // parcial: solo el informe de publicidad, sin pedidos ni catálogo
  await importar('terminos-real.csv');
  await page.evaluate(()=>{ go('publicidad'); });
  await page.waitForTimeout(400);
  estados.push(await page.evaluate(()=>({
    caso:'solo publicidad', txt:(document.getElementById('stVerdict')||{}).textContent.slice(0,60),
    kpis:document.querySelectorAll('#adKpis .kpi').length,
    filas:document.querySelectorAll('#stTable tr').length,
    sinSku:/sin casar/.test((document.getElementById('pubEqTable')||{}).textContent||'')})));
  // completa
  await page.evaluate(`(()=>{${LAB}
    DB.imports.orders = {rows:ventas, count:ventas.length, file:'o'}; periodDays=30; refreshAll(); go('publicidad'); })()`);
  await page.waitForTimeout(500);
  estados.push(await page.evaluate(()=>({
    caso:'completa', txt:(document.getElementById('stVerdict')||{}).textContent.slice(0,60),
    kpis:document.querySelectorAll('#adKpis .kpi').length,
    filas:document.querySelectorAll('#stTable tr').length,
    sinSku:/sin casar/.test((document.getElementById('pubEqTable')||{}).textContent||'')})));
  estados.forEach(e=>console.log('     '+e.caso.padEnd(16)+' '+e.kpis+' KPI · '+e.filas+' filas'));
  check('la pantalla vacía explica qué falta en vez de enseñar ceros',
    estados[0].kpis===6 && /Sin informe de t[ée]rminos/.test(estados[0].txt), estados[0].txt.slice(0,50));
  check('con el informe pero sin catálogo, ningún término se casa y se dice',
    estados[1].filas>1 && estados[1].sinSku===true, estados[1].filas+' filas');
  check('con todo cargado, la pantalla se completa', estados[2].filas>1 && estados[2].kpis===6,
    estados[2].filas+' filas');

  /* ═══════════════════════════════════════════════════════════════════════
     BLOQUE 2 · LA MISMA CAMPANA EN DOS PAISES

     «SP · Multi · exacta» existe en España y en Alemania y anuncia productos
     distintos en cada uno. La fixture: España 30,00 € sobre «rodillo de
     espuma», Alemania 70,00 € sobre «bandas elasticas». Total 100,00 €.

     LA CUENTA A MANO
     Asignando TEST-ROD al par (campaña, ES) y TEST-BAN al par (campaña, DE):
        ES → TEST-ROD  30,00 €
        DE → TEST-BAN  70,00 €
     Antes del arreglo la clave era solo el nombre, así que la segunda
     asignación PISABA la primera y las dos filas acababan en el mismo SKU: o
     100,00 € al rodillo o 100,00 € a las bandas, según cuál se escribiera
     última. Cuarenta euros mal puestos sobre cien, y el ACOS del producto
     equivocado moviéndose en consecuencia.
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n── bloque 2 · la misma campaña en dos países ──');
  {
    const r = await importar('terminos-dos-paises.csv');
    check('la fixture de dos países se importa', r.ok === true, r.meta);
    await page.evaluate(LAB + ';DB.orders=ventas;DB.ppcAsig={};saveDB();refreshAll();');
    await page.waitForTimeout(400);

    const filas = await ev(`(()=>{ const C = pubPpcPorCampana();
      return C.map(c=>({campana:c.campana, pais:c.pais, gasto:c.gasto})); })()`);
    check('una fila por campaña Y país, no una por campaña',
      Array.isArray(filas) && filas.length === 2 &&
      filas.filter(f=>f.pais==='ES').length === 1 && filas.filter(f=>f.pais==='DE').length === 1,
      err(filas) || (Array.isArray(filas) ? filas.map(f=>f.pais+':'+n2(f.gasto)).join(' · ') : String(filas)));
    const es = Array.isArray(filas) ? filas.find(f=>f.pais==='ES') : null;
    const de = Array.isArray(filas) ? filas.find(f=>f.pais==='DE') : null;
    check('cada país se queda con SU gasto · ES 30,00 y DE 70,00',
      !!es && !!de && near(es.gasto, 30) && near(de.gasto, 70),
      err(filas) || (es&&de ? 'ES '+n2(es.gasto)+' · DE '+n2(de.gasto) : 'sin filas por país'));

    /* El corazón del bloque: dos asignaciones distintas que NO se pisan. */
    const dos = await ev(`(()=>{
      pubAsignar('SP · Multi · exacta','TEST-ROD','ES');
      pubAsignar('SP · Multi · exacta','TEST-BAN','DE');
      const C = pubPpcPorCampana();
      const f = p => { const c = C.find(x=>x.pais===p); return c ? {gasto:c.gasto, skus:c.skus} : null; };
      return {es:f('ES'), de:f('DE'), claves:Object.keys(DB.ppcAsig||{}).length}; })()`);
    check('asignar Alemania NO reasigna España · dos claves guardadas',
      dos && !dos.__err && dos.claves === 2,
      err(dos) || ('claves: '+((dos&&dos.claves)!==undefined?dos.claves:'—')));
    check('España se queda con TEST-ROD y sus 30,00 €',
      dos && !dos.__err && dos.es && dos.es.skus.length===1 && dos.es.skus[0]==='TEST-ROD' && near(dos.es.gasto,30),
      err(dos) || (dos&&dos.es ? (dos.es.skus.join(',')||'ninguno')+' · '+n2(dos.es.gasto) : '—'));
    check('Alemania se queda con TEST-BAN y sus 70,00 €',
      dos && !dos.__err && dos.de && dos.de.skus.length===1 && dos.de.skus[0]==='TEST-BAN' && near(dos.de.gasto,70),
      err(dos) || (dos&&dos.de ? (dos.de.skus.join(',')||'ninguno')+' · '+n2(dos.de.gasto) : '—'));

    /* NO ROMPER LO GUARDADO · una asignación vieja (clave = nombre plegado, sin
       país) tiene que seguir aplicándose a LOS DOS países. Es la forma exacta en
       que están guardadas todas las que Juancho ya ha confirmado. */
    const vieja = await ev(`(()=>{
      DB.ppcAsig = {}; DB.ppcAsig[fold('SP · Multi · exacta').trim()] = {prefijos:['TEST-ROD'], fecha:'2026-09-01'};
      saveDB();
      const C = pubPpcPorCampana();
      const f = p => { const c = C.find(x=>x.pais===p); return c ? c.skus : null; };
      return {es:f('ES'), de:f('DE')}; })()`);
    check('una asignación ya guardada (sin país) sigue valiendo para los dos países',
      vieja && !vieja.__err && vieja.es && vieja.de &&
      vieja.es.length===1 && vieja.es[0]==='TEST-ROD' && vieja.de.length===1 && vieja.de[0]==='TEST-ROD',
      err(vieja) || (vieja&&vieja.es ? 'ES '+vieja.es.join(',')+' · DE '+(vieja.de||[]).join(',') : '—'));

    /* Y la específica gana a la global, que es lo que permite diferenciar un
       país sin tener que borrar lo que ya estaba puesto. */
    const gana = await ev(`(()=>{
      pubAsignar('SP · Multi · exacta','TEST-BAN','DE');
      const C = pubPpcPorCampana();
      const f = p => { const c = C.find(x=>x.pais===p); return c ? c.skus : null; };
      return {es:f('ES'), de:f('DE')}; })()`);
    check('la del país gana a la global, y la global sigue rigiendo el resto',
      gana && !gana.__err && gana.es && gana.de &&
      gana.es[0]==='TEST-ROD' && gana.de[0]==='TEST-BAN',
      err(gana) || (gana&&gana.es ? 'ES '+gana.es.join(',')+' · DE '+(gana.de||[]).join(',') : '—'));

    /* EL DINERO. Con filtro de país, el P&L por SKU tiene que llevar el gasto
       de ESE país al SKU de ESE país. 30,00 € al rodillo en España; y el
       rodillo no puede llevarse ni un céntimo de los 70,00 € alemanes. */
    const dinero = await ev(`(()=>{
      pubAsignar('SP · Multi · exacta','TEST-ROD','ES');
      pubAsignar('SP · Multi · exacta','TEST-BAN','DE');
      const C = pubPpcPorCampana();
      const g = (p,sku) => { const c = C.find(x=>x.pais===p); return c && c.skus.indexOf(sku)>=0 ? (c.porPais||{})[p]||0 : 0; };
      return {rodEnES:g('ES','TEST-ROD'), banEnDE:g('DE','TEST-BAN'),
              rodEnDE:g('DE','TEST-ROD'), banEnES:g('ES','TEST-BAN')}; })()`);
    check('el gasto alemán NO toca al producto español, ni al revés',
      dinero && !dinero.__err && near(dinero.rodEnES,30) && near(dinero.banEnDE,70) &&
      dinero.rodEnDE===0 && dinero.banEnES===0,
      err(dinero) || (dinero ? 'ROD/ES '+n2(dinero.rodEnES)+' · BAN/DE '+n2(dinero.banEnDE)+
        ' · ROD/DE '+n2(dinero.rodEnDE)+' · BAN/ES '+n2(dinero.banEnES) : '—'));

    /* La suma no cambia: el arreglo reparte, no inventa. */
    const suma = await ev(`(()=>{ const C=pubPpcPorCampana(); return C.reduce((a,c)=>a+c.gasto,0); })()`);
    check('la suma observada sigue siendo 100,00 € · se reparte, no se inventa',
      near(suma, 100), err(suma) || n2(suma));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BLOQUE 4 · UNA CAMPANA RENOMBRADA ENTRE DOS INFORMES

     El solape se deduplica por NOMBRE de campaña. Si el nombre cambió entre dos
     descargas, ninguno de los dos informes «trae» la campaña del otro, cada uno
     es dueño único de sus propios días, y el gasto de los días comunes se cuenta
     DOS VECES. El 3-10 quedó como sospecha; aquí está medido.

     LA CUENTA A MANO · filas de un solo día para que salga exacta:
        v1  días 14, 13 y 12  ·  10,00 cada uno  =  30,00   (rango 12..14)
        v2  días 13, 12 y 11  ·  20,00 cada uno  =  60,00   (rango 11..13)
        días comunes: el 13 y el 12  →  2 días
        v1 dentro de esos dos días: 10 + 10 =  20,00
        v2 dentro de esos dos días: 20 + 20 =  40,00
        suelo de lo contado dos veces = min(20, 40) = 20,00 €

     Y «SP · Otra · amplia» NO debe saltar: su propio grupo de anuncios y un solo
     término en común. Compartir una palabra genérica no es un renombrado.
     ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n── bloque 4 · campaña renombrada entre informes ──');
  {
    /* Los dos informes tienen que convivir, así que este importador ACUMULA en
       vez de vaciar `DB.imports` como hace `importar`. Es justamente lo que pasa
       en la realidad: Juancho tiene quince informes cargados a la vez. */
    const importarMas = async (fichero) => {
      await page.evaluate(()=>go('datos'));
      await page.setInputFiles('#csvFile', []);
      await page.setInputFiles('#csvFile', path.resolve(FIX, fichero));
      await page.waitForTimeout(1200);
      return page.evaluate(()=>Object.keys(DB.imports||{}).length);
    };
    await page.evaluate(()=>{ DB.imports={}; DB.mappings={}; saveDB();
      const l=document.getElementById('fileList'); if(l) l.innerHTML=''; refreshAll(); });
    await page.waitForTimeout(200);
    await importarMas('terminos-renombrada-1.csv');
    await importarMas('terminos-renombrada-2.csv');
    await page.evaluate(LAB + ';DB.orders=ventas;DB.ppcAsig={};saveDB();refreshAll();');
    await page.waitForTimeout(500);

    const nFich = await page.evaluate(()=>{ const f=(DB.imports.searchterm||{}).ficheros;
      return f ? Object.keys(f).length : ((DB.imports.searchterm||{}).count?1:0); });
    const R = await ev(`(()=>{ const r = pubRenombradas();
      return r.map(x=>({a:x.a.campana, b:x.b.campana, pais:x.pais, dias:x.dias,
                        ga:x.a.gasto, gb:x.b.gasto, suelo:x.suelo,
                        comunes:x.comunes, de:x.de})); })()`);

    /* Esto mide el escenario, no el arreglo: si los dos informes no conviven,
       todo lo de abajo mediría otra cosa sin avisar. */
    check('los dos informes conviven, no se sustituyen', nFich >= 1, 'ficheros: '+nFich);
    check('detecta UN solo candidato a renombrado',
      Array.isArray(R) && R.length === 1,
      err(R) || (Array.isArray(R) ? R.length+' candidatos: '+R.map(x=>x.a+'/'+x.b).join(' · ') : String(R)));

    const c = Array.isArray(R) && R[0] ? R[0] : null;
    check('señala las dos versiones del nombre, y no otra campaña',
      !!c && /v1|v2/.test(String(c.a)) && /v1|v2/.test(String(c.b)) &&
      !/Otra/.test(String(c.a)+String(c.b)),
      err(R) || (c ? c.a+' ↔ '+c.b : '—'));
    check('cuenta los 2 días comunes',
      !!c && c.dias === 2, err(R) || (c ? c.dias+' días' : '—'));
    check('el gasto de cada nombre DENTRO de la ventana común · 20,00 y 40,00',
      !!c && ((near(c.ga,20) && near(c.gb,40)) || (near(c.ga,40) && near(c.gb,20))),
      err(R) || (c ? n2(c.ga)+' y '+n2(c.gb) : '—'));
    check('el suelo de lo contado dos veces es el MENOR · 20,00 €',
      !!c && near(c.suelo, 20), err(R) || (c ? n2(c.suelo) : '—'));
    check('«SP · Otra · amplia» no salta: UN par en común no es evidencia',
      Array.isArray(R) && !R.some(x=>/Otra/.test(String(x.a)+String(x.b))),
      err(R) || (Array.isArray(R) ? R.map(x=>x.a+'/'+x.b).join(' · ') : '—'));

    /* Y el aviso tiene que LLEGAR A LA PANTALLA con su cifra: un detector que
       solo existe en el motor no avisa a nadie. */
    const pantalla = await page.evaluate(async ()=>{ go('publicidad');
      await new Promise(r=>setTimeout(r,600));
      const e = document.getElementById('pubRenomAviso');
      return e ? e.textContent.replace(/\s+/g,' ').trim() : '(sin nodo)'; });
    check('el aviso aparece en Publicidad y dice el gasto en juego',
      /renombrado|renombrad/i.test(pantalla) && /20,00/.test(pantalla),
      pantalla.slice(0, 150));

    /* Y cuando NO hay renombrado, el aviso no está: un panel que siempre dice
       algo entrena a no mirarlo. */
    const limpio = await page.evaluate(async ()=>{
      DB.imports={}; DB.mappings={}; saveDB(); go('publicidad');
      await new Promise(r=>setTimeout(r,500));
      const e = document.getElementById('pubRenomAviso');
      return e ? e.textContent.trim() : '(sin nodo)'; });
    check('sin informes solapados el aviso no aparece', limpio === '', '«'+limpio.slice(0,60)+'»');
  }

  check('sin errores de JS en toda la sesión', errors.length===0, errors.join(' | ') || 'limpio');
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  await browser.close();
  try{ fs.rmSync(FIX, {recursive:true, force:true}); }catch(e){}
  process.exit(fails===0 && errors.length===0 ? 0 : 1);
})();
