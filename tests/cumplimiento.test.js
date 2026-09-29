/* =========================================================================
   CARRIL 8 · CUMPLIMIENTO · IVA, OSS, EPR y PPWR por país

   QUÉ PERSIGUE ESTA SUITE. El fallo caro de esta pantalla no es que pete: es
   que diga «cumples» en un país donde no se ha comprobado nada. Un error se
   ve; un «✓ al día» falso se cree, y se cree justo hasta que llega la carta.
   Así que la mitad de estos casos son ADVERSARIALES: intentan sacarle a la
   pantalla una afirmación de cumplimiento que no le corresponde.

   CÓMO ESTÁ ESCRITA. Todas las llamadas a la página van con guarda
   (`typeof X==='function'`) y devuelven un centinela cuando la función no
   existe. Eso no es defensivo por gusto: es lo que hace que sin el arreglo
   esta suite salga ROJA CON MENSAJE —«la función cumplEstadoPais() no
   existe»— y no con un stack, que no dice nada de lo que falta.

   Verificada en las dos direcciones el 17-sep-2026 contra la base sin los
   cambios de este carril (e18ef86). Lo que sale rojo y con qué mensaje está
   escrito en docs/carriles/8-cumplimiento.md.

   LA FIXTURE. Reproduce el formato LITERAL del informe de EPR de Amazon —BOM
   UTF-8, CRLF, separador TAB, cabecera en la línea 1, 34 columnas, decimales
   con punto y tres dígitos, sin espacios finales en las cabeceras—, medido
   con Bash el 17-09-2026 sobre la cabecera del informe real. Lo que NO
   reproduce, y hay que decirlo: el informe real no está en disco en este
   entorno, así que nada de esto está medido contra él. El número de filas del
   informe real tampoco está medido: se habló de 66 y queda SIN CONFIRMAR.
   Esta fixture tiene 14 filas porque son las que hacen falta para los casos,
   no porque se parezca al original.

   Los datos son inventados de cabo a rabo: el repositorio es público.
   ========================================================================= */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

let fails = 0;
const check = (label, cond, extra) => {
  if(!cond) fails++;
  console.log('  ' + (cond?'OK   ':'FALLO') + ' ' + label + (extra!==undefined ? '  → ' + extra : ''));
};

/* ── La fixture del informe de EPR ─────────────────────────────────────────
   Se regenera en cada ejecución y es DETERMINISTA: sin fechas relativas a
   hoy, así que no cambia de un día para otro y no ensucia el árbol. Justo lo
   contrario que tests/fixtures, que sí llevan `ago(k)`. */
const DIR_FX = path.resolve(__dirname, 'fixtures-cumplimiento');
const FX_EPR = path.join(DIR_FX, 'epr-sintetico.txt');

const EPR_COLS = ['UNIQUE_ACCOUNT_IDENTIFIER','REPORT_PERIOD_START','REPORT_PERIOD_END','ASIN',
  'AMAZON_MARKETPLACE','SHIP_TO_COUNTRY_CODE','SHIP_TO_COUNTRY','ITEM_NAME_IN_ENGLISH',
  'ITEM_NAME_AS_IN_MARKETPLACE','REGISTRATION_NUMBER','EPR_CATEGORY','EPR_SUBCATEGORY1',
  'EPR_SUBCATEGORY2','EPR_SUBCATEGORY3','EPR_SUBCATEGORY4','GL_PRODUCT_GROUP_DESCRIPTION',
  'PRODUCT_TYPE','TOTAL_UNITS_SOLD','UNITS_PER_ASIN','BATTERY_EMBEDDED',
  'ITEM_WEIGHT_WITHOUT_PACKAGE_KG','ITEM_WEIGHT_WITH_PACKAGE_KG','TOTAL_REPORTED_WEIGHT_KG',
  'ITEM_WIDTH_CM','PACKAGE_WIDTH_CM','ITEM_HEIGHT_CM','PACKAGE_HEIGHT_CM',
  'PAPER_KG','GLASS_KG','ALUMINUM_KG','STEEL_KG','PLASTIC_KG','WOOD_KG','OTHER_KG'];

/* Cada fila: [marketplace, código de país, nombre de país, nº de registro,
   unidades]. Los números de registro son inventados y se ven a la legua. */
const FILAS_EPR = [
  ['amazon.es',    'ES','SPAIN',         'ES-RPP-DEMO-0001', 4],
  ['amazon.es',    'ES','SPAIN',         'ES-RPP-DEMO-0001', 2],
  ['amazon.es',    'ES','SPAIN',         'ES-RPP-DEMO-0001', 1],
  ['amazon.de',    'DE','GERMANY',       'DE-LUCID-DEMO-01', 3],
  /* Italia sin registro en ninguna fila: es la señal de bloqueo inminente. */
  ['amazon.it',    'IT','ITALY',         '',                 5],
  ['amazon.it',    'IT','ITALY',         '',                 2],
  /* Francia a medias: una fila con número y otra sin él. */
  ['amazon.fr',    'FR','FRANCE',        'FR-IDU-DEMO-0001', 3],
  ['amazon.fr',    'FR','FRANCE',        '',                 1],
  /* Los dos mercados que faltaban en COUNTRIES y sí están en los informes. */
  ['amazon.de',    'AT','AUSTRIA',       '',                 1],
  ['amazon.es',    'PT','PORTUGAL',      '',                 2],
  ['amazon.pl',    'PL','POLAND',        'PL-BDO-DEMO-0001', 1],
  ['amazon.se',    'SE','SWEDEN',        '',                 1],
  ['amazon.com.be','BE','BELGIUM',       '',                 1],
  /* Y una fila cuyo país el hub NO sabe interpretar: tiene que quedarse
     fuera, no repartirse entre los demás. */
  ['amazon.sa',    'SA','SAUDI ARABIA',  '',                 1]
];

function generarFixtureEPR(){
  const filas = FILAS_EPR.map((f, i) => {
    const [mkt, code, nombre, reg, uds] = f;
    const kg = (0.150 + i*0.010);
    const v = {};
    EPR_COLS.forEach(c => v[c] = '');
    v.UNIQUE_ACCOUNT_IDENTIFIER = 'DEMO-ACCOUNT-0000';
    v.REPORT_PERIOD_START = '2026-07-01';
    v.REPORT_PERIOD_END   = '2026-07-31';
    v.ASIN = 'B0DEMO' + String(1000 + i);
    v.AMAZON_MARKETPLACE  = mkt;
    v.SHIP_TO_COUNTRY_CODE = code;
    v.SHIP_TO_COUNTRY      = nombre;
    v.ITEM_NAME_IN_ENGLISH        = 'Demo article ' + (i + 1);
    v.ITEM_NAME_AS_IN_MARKETPLACE = 'Articulo de prueba ' + (i + 1);
    v.REGISTRATION_NUMBER = reg;
    v.EPR_CATEGORY = 'PACKAGING';
    v.EPR_SUBCATEGORY1 = 'HOUSEHOLD';
    v.GL_PRODUCT_GROUP_DESCRIPTION = 'gl_demo';
    v.PRODUCT_TYPE = 'DEMO_TYPE';
    v.TOTAL_UNITS_SOLD = String(uds);
    v.UNITS_PER_ASIN   = '1';
    v.BATTERY_EMBEDDED = 'NO';
    /* Decimales con punto y TRES dígitos, como el informe real. */
    v.ITEM_WEIGHT_WITHOUT_PACKAGE_KG = (kg).toFixed(3);
    v.ITEM_WEIGHT_WITH_PACKAGE_KG    = (kg + 0.040).toFixed(3);
    v.TOTAL_REPORTED_WEIGHT_KG       = ((kg + 0.040) * uds).toFixed(3);
    v.ITEM_WIDTH_CM    = '10.000'; v.PACKAGE_WIDTH_CM  = '12.000';
    v.ITEM_HEIGHT_CM   = '20.000'; v.PACKAGE_HEIGHT_CM = '22.000';
    v.PAPER_KG    = (0.020 * uds).toFixed(3);
    v.GLASS_KG    = '0.000';
    v.ALUMINUM_KG = '0.000';
    v.STEEL_KG    = '0.000';
    v.PLASTIC_KG  = (0.015 * uds).toFixed(3);
    v.WOOD_KG     = '0.000';
    v.OTHER_KG    = '0.000';
    return EPR_COLS.map(c => v[c]).join('\t');
  });
  /* Cabecera en la línea 1, sin espacios finales; CRLF en todo el fichero;
     BOM UTF-8 delante. Los tres detalles del formato real. */
  const texto = [EPR_COLS.join('\t')].concat(filas).join('\r\n') + '\r\n';
  fs.mkdirSync(DIR_FX, {recursive:true});
  fs.writeFileSync(FX_EPR, Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]), Buffer.from(texto,'utf8')]));
  return texto;
}

(async () => {
  generarFixtureEPR();

  const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx = await browser.newContext({viewport:{width:1440,height:1000}, timezoneId:'Europe/Madrid'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { const t=m.text();
    if(m.type()==='error' && t.indexOf('ERR_')<0 && t.indexOf('Failed to load resource')<0) errors.push('CONSOLE: '+t); });
  page.on('dialog', d => d.accept());
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(700);
  await page.click('.appcard:not(.soon)');
  await page.waitForTimeout(300);

  /* A 1440 px la barra lateral va plegada y TODOS los botones de navegación
     miden 0×0: `page.click('.nav-item…')` falla siempre. Se navega llamando a
     `go()`, que es lo que hace el botón por dentro. */
  const ir = async (v) => { await page.evaluate(x=>go(x), v); await page.waitForTimeout(350); };
  const txt = s => page.$eval(s, e=>e.textContent).catch(()=> '');
  const existe = s => page.$(s).then(e=>!!e);

  /* =====================================================================
     CUMP-A · LOS PAÍSES QUE FALTABAN, DEDUCIDOS DE LOS INFORMES REALES
     =====================================================================
     Austria y Portugal aparecen con jurisdicción fiscal propia en los dos
     informes de IVA reales; Eslovaquia aparece como país de SALIDA de
     traslados entre centros logísticos, que es la huella que deja el stock.
     Ninguno de los tres estaba en COUNTRIES, así que el hub no podía ni
     enseñarlos ni cobrarles gestoría.                                       */
  console.log('\n=== CUMP-A · LOS TRES MERCADOS QUE FALTABAN ===');
  const A = await page.evaluate(()=>{
    if(typeof COUNTRIES==='undefined') return {falta:'COUNTRIES no existe'};
    const cod = COUNTRIES.map(c=>c.code);
    const co = (v)=> (typeof countryOf==='function' ? countryOf(v) : 'countryOf() no existe');
    return {
      codigos: cod,
      at: cod.indexOf('AT')>=0, pt: cod.indexOf('PT')>=0,
      sk: cod.indexOf('SK')>=0, cz: cod.indexOf('CZ')>=0,
      atOrigen: (COUNTRIES.filter(c=>c.code==='AT')[0]||{}).origen,
      ptOrigen: (COUNTRIES.filter(c=>c.code==='PT')[0]||{}).origen,
      skOrigen: (COUNTRIES.filter(c=>c.code==='SK')[0]||{}).origen,
      czOrigen: (COUNTRIES.filter(c=>c.code==='CZ')[0]||{}).origen,
      skStorage: (COUNTRIES.filter(c=>c.code==='SK')[0]||{}).storage,
      atStorage: (COUNTRIES.filter(c=>c.code==='AT')[0]||{}).storage,
      vgAT: (typeof VAT_GENERAL==='object'?VAT_GENERAL.AT:null),
      vgPT: (typeof VAT_GENERAL==='object'?VAT_GENERAL.PT:null),
      vgSK: (typeof VAT_GENERAL==='object'?VAT_GENERAL.SK:null),
      /* Los valores TAL Y COMO VIENEN en los informes reales. */
      cAustria: co('AUSTRIA'), cPortugal: co('PORTUGAL'), cSK: co('SK'),
      cAT: co('AT'), cPT: co('PT'), cUK: co('amazon.co.uk'),
      /* Y las tres que no pueden confundirse con AT ni con PT. */
      cCroacia: co('Croatia'), cLetonia: co('Latvia'), cEgipto: co('Egypt'),
      /* Las claves de siempre no pueden haber cambiado de destino. */
      viejas: (typeof MKT_MAP==='object')
        ? ['amazon.de','amazon.fr','amazon.it','amazon.es','amazon.pl','amazon.nl',
           'amazon.com.be','amazon.ie','amazon.se','germany','france','italy','spain',
           'poland','netherlands','belgium','ireland','sweden','de','fr','it','es',
           'pl','nl','be','ie','se'].map(k=>k+'='+MKT_MAP[k]).join(',')
        : 'MKT_MAP no existe'
    };
  });
  check('COUNTRIES incluye Austria, con jurisdicción fiscal en los dos informes de IVA',
    A.at===true, A.falta || (A.codigos||[]).join(','));
  check('COUNTRIES incluye Portugal, con 24 pedidos y jurisdicción propia',
    A.pt===true, A.falta || (A.codigos||[]).join(','));
  check('COUNTRIES incluye Eslovaquia, que sale en FC_TRANSFER como país de salida',
    A.sk===true, A.falta || (A.codigos||[]).join(','));
  check('y Eslovaquia entra como país de ALMACÉN, no como mercado de venta',
    A.skStorage===true && A.atStorage===false,
    'SK storage='+A.skStorage+' · AT storage='+A.atStorage);
  check('los tres van marcados «medido», no de memoria',
    A.atOrigen==='medido' && A.ptOrigen==='medido' && A.skOrigen==='medido',
    'AT='+A.atOrigen+' PT='+A.ptOrigen+' SK='+A.skOrigen);
  check('Chequia entra marcada «heredado»: no aparece en ningún informe real',
    A.cz===true && A.czOrigen==='heredado', 'CZ='+A.cz+' origen='+A.czOrigen);
  check('VAT_GENERAL no se contradice con COUNTRIES en AT, PT y SK',
    A.vgAT===20 && A.vgPT===23 && A.vgSK===23,
    'AT='+A.vgAT+' PT='+A.vgPT+' SK='+A.vgSK);
  check('countryOf lee AUSTRIA y PORTUGAL, que es como vienen en TAXABLE_JURISDICTION',
    A.cAustria==='AT' && A.cPortugal==='PT', 'AUSTRIA→'+A.cAustria+' PORTUGAL→'+A.cPortugal);
  check('countryOf lee AT, PT y SK sueltos, que es como vienen en ship-country',
    A.cAT==='AT' && A.cPT==='PT' && A.cSK==='SK',
    'AT→'+A.cAT+' PT→'+A.cPT+' SK→'+A.cSK);
  check('amazon.co.uk se identifica, pero el Reino Unido NO entra en COUNTRIES',
    A.cUK==='GB' && (A.codigos||[]).indexOf('GB')<0,
    'amazon.co.uk→'+A.cUK+' · GB en COUNTRIES: '+((A.codigos||[]).indexOf('GB')>=0));
  /* Este es el caso que se vio fallar antes de poner las guardas: con 'at' y
     'pt' en el mapa, la pasada de subcadena de countryOf devolvía AT para
     Croacia y Letonia y PT para Egipto. Tres países mal asignados. */
  check('y añadir AT/PT no hace que Croacia, Letonia y Egipto acaben en AT ni en PT',
    A.cCroacia!=='AT' && A.cLetonia!=='AT' && A.cEgipto!=='PT',
    'Croatia→'+A.cCroacia+' Latvia→'+A.cLetonia+' Egypt→'+A.cEgipto);
  check('ninguna clave que ya existía en MKT_MAP ha cambiado de destino',
    A.viejas === 'amazon.de=DE,amazon.fr=FR,amazon.it=IT,amazon.es=ES,amazon.pl=PL,'+
      'amazon.nl=NL,amazon.com.be=BE,amazon.ie=IE,amazon.se=SE,germany=DE,france=FR,'+
      'italy=IT,spain=ES,poland=PL,netherlands=NL,belgium=BE,ireland=IE,sweden=SE,'+
      'de=DE,fr=FR,it=IT,es=ES,pl=PL,nl=NL,be=BE,ie=IE,se=SE',
    A.viejas);

  /* =====================================================================
     CUMP-B · LA PANTALLA VACÍA NO AFIRMA NADA
     =====================================================================
     Sin mercados marcados, la tentación es enseñar todo en verde porque no
     hay ningún incumplimiento detectado. Eso es exactamente el «cumples» sin
     comprobar: no hay nada detectado porque no se ha mirado nada.            */
  console.log('\n=== CUMP-B · PANTALLA VACÍA: NO HAY NADA QUE CELEBRAR ===');
  await page.evaluate(()=>{ DB = blankDB(); COUNTRIES.forEach(c=>DB.compliance[c.code].active=false);
                            saveDB(); refreshAll(); });
  await ir('cumplimiento');
  const vacio = {
    extra: await existe('#cumplExtra'),
    resumen: await txt('#cumplResumen'),
    tabla: await txt('#cumplEstadoTabla'),
    banner: await txt('#ppwrBanner')
  };
  check('la pantalla de cumplimiento se pinta aunque no haya nada marcado',
    vacio.extra===true, vacio.extra ? 'panel presente' : 'no existe #cumplExtra: el módulo del carril no está');
  check('y dice que sin mercados marcados no puede opinar',
    /no puede decir nada|ningún mercado marcado/i.test(vacio.resumen),
    (vacio.resumen||'(vacío)').replace(/\s+/g,' ').slice(0,140));
  check('ninguna fila presume de cumplir con la base en blanco',
    !/\bcumples\b|\bal día\b|\bcumplid[oa]\b|\bconforme\b/i.test(vacio.tabla),
    (vacio.tabla||'(vacío)').replace(/\s+/g,' ').slice(0,140));

  /* =====================================================================
     CUMP-C · EL PPWR ES RIESGO ABIERTO, NO UNA CUENTA ATRÁS
     =====================================================================
     Hoy es posterior al 12-ago-2026. Un banner que siga diciendo «quedan N
     días» estaría contando hacia una fecha ya pasada.                        */
  console.log('\n=== CUMP-C · EL PPWR YA ESTÁ EN VIGOR ===');
  await page.evaluate(()=>{ DB = blankDB(); saveDB(); refreshAll(); });
  await ir('cumplimiento');
  const C = await page.evaluate(()=>({
    dias: (typeof cumplDiasPPWR==='function') ? cumplDiasPPWR() : 'cumplDiasPPWR() no existe',
    banner: (document.getElementById('ppwrBanner')||{}).textContent || '',
    clase: (document.querySelector('#ppwrBanner .note-box')||{}).className || ''
  }));
  check('el hub sabe cuántos días lleva el PPWR en vigor',
    typeof C.dias==='number' && C.dias>0, C.dias);
  check('el banner habla de exposición abierta y no de días que quedan',
    /desde el 12 de agosto de 2026/i.test(C.banner) && !/quedan\s+\d+\s+d[ií]a/i.test(C.banner),
    C.banner.replace(/\s+/g,' ').slice(0,160));
  check('con mercados activos sin número de registro, el aviso sale en rojo',
    /stop/.test(C.clase), C.clase || '(sin banner)');
  check('y el banner reconoce lo que el propio hub NO ha podido confirmar',
    /no ha podido confirmar/i.test(C.banner),
    C.banner.replace(/\s+/g,' ').slice(-180));

  /* =====================================================================
     CUMP-D · ADVERSARIAL · MARCARLO TODO NO PRODUCE UN «CUMPLES»
     =====================================================================
     Este es EL caso de este carril. Se marcan todas las casillas de todos
     los países, que es lo que haría cualquiera que quiera quitarse el aviso
     de encima, y la pantalla no puede convertirse en un parte de buena
     conducta. La casilla es una afirmación del usuario, no una comprobación.
     El hub no consulta LUCID, ni SYDEREP, ni el RPP, ni el EDM.              */
  console.log('\n=== CUMP-D · ADVERSARIAL: TODO MARCADO, Y AUN ASÍ NO «CUMPLES» ===');
  await page.evaluate(()=>{
    DB = blankDB();
    COUNTRIES.forEach(c=>{ DB.compliance[c.code] =
      Object.assign(DB.compliance[c.code]||{}, {active:true, vatReg:true, oss:true, epr:true, eprDate:'2026-01-01'}); });
    saveDB(); refreshAll();
  });
  await ir('cumplimiento');
  const D = await page.evaluate(()=>{
    const est = (typeof cumplEstados==='function') ? cumplEstados() : null;
    return {
      estados: est ? est.map(s=>s.code+':'+s.estado).join(' ') : 'cumplEstados() no existe',
      hayCumple: est ? est.some(s=>/cumple|al d[ií]a|conforme/i.test(s.etiqueta)) : null,
      riesgo: est ? est.filter(s=>s.estado==='riesgo').length : null,
      texto: (document.getElementById('cumplExtra')||{}).textContent || '',
      /* La pantalla ENTERA, no solo el panel nuevo: la afirmación tranquilizadora
         que había antes vivía en el banner y en el veredicto, no aquí. */
      vista: (document.getElementById('view-cumplimiento')||{}).textContent || '',
      banner: (document.getElementById('ppwrBanner')||{}).textContent || ''
    };
  });
  check('con TODAS las casillas marcadas, ningún país pasa a estado de cumplimiento',
    D.hayCumple===false, D.estados);
  check('y todos siguen en riesgo abierto, porque no hay un solo número de registro anotado',
    D.riesgo===13, 'países en riesgo: '+D.riesgo+' → '+D.estados);
  check('la pantalla no contiene en ningún sitio un «cumples» ni un «al día»',
    !/\bcumples\b|\best[aá]s al d[ií]a\b|\bcumplimiento correcto\b/i.test(D.texto),
    (D.texto.match(/[^.]*\bcumples\b[^.]*|[^.]*al d[ií]a[^.]*/i)||['ninguna frase de ese tipo'])[0].slice(0,140));
  check('y dice con todas las letras que no comprueba contra ningún registro',
    /no consulta LUCID/i.test(D.texto) && /sin verificar/i.test(D.texto),
    /no consulta LUCID/i.test(D.texto) ? 'lo dice' : 'NO lo dice');
  /* ESTE es el caso que motivó el carril, y el que sale rojo contra la base.
     Con las cuatro casillas puestas y sin un solo número de registro, la
     pantalla decía «Todos tus mercados activos constan registrados» y bajaba
     el aviso de rojo a azul. Es el «cumples» sin comprobar, con otras
     palabras: constar registrado y haber marcado una casilla no son lo mismo. */
  check('y en NINGUNA parte de la pantalla los da por registrados solo porque haya casillas marcadas',
    !/constan registrados|Tienes marcados los registros EPR de todos/i.test(D.vista),
    (D.vista.match(/[^.]*constan registrados[^.]*|[^.]*Tienes marcados los registros[^.]*/i)
      ||['no lo dice en ningún sitio'])[0].slice(0,150));

  /* Y ahora el escalón siguiente: con número de registro anotado, lo más que
     puede decir es «declarado por ti». Nunca comprobado. */
  console.log('\n=== CUMP-E · CON NÚMERO ANOTADO, SIGUE SIENDO TU PALABRA ===');
  await page.evaluate(()=>{
    COUNTRIES.forEach(c=>{
      if(typeof setComp==='function'){ setComp(c.code,'eprNum','DEMO-'+c.code+'-0001');
        if(c.storage) setComp(c.code,'vatNum','XX'+c.code+'000000000'); }
    });
    refreshAll();
  });
  await ir('cumplimiento');
  const E = await page.evaluate(()=>{
    const est = (typeof cumplEstados==='function') ? cumplEstados() : null;
    return {
      estados: est ? est.map(s=>s.code+':'+s.estado).join(' ') : 'cumplEstados() no existe',
      etiquetas: est ? Array.from(new Set(est.map(s=>s.etiqueta))).join(' | ') : '',
      riesgo: est ? est.filter(s=>s.estado==='riesgo').length : null,
      guardado: (DB.compliance.ES||{}).eprNum,
      recortado: (function(){ if(typeof setComp!=='function') return null;
        setComp('ES','eprNum','   CON-ESPACIOS   '); return (DB.compliance.ES||{}).eprNum; })(),
      banner: (document.getElementById('ppwrBanner')||{}).textContent || ''
    };
  });
  check('el número de registro se guarda donde se anota',
    E.guardado==='DEMO-ES-0001', E.guardado);
  check('y se guarda sin espacios de sobra: un número con espacio delante es otro número',
    E.recortado==='CON-ESPACIOS', '«'+E.recortado+'»');
  check('con número en todos, ya no queda ningún país en riesgo abierto',
    E.riesgo===0, 'en riesgo: '+E.riesgo+' → '+E.estados);
  check('pero la etiqueta más fuerte sigue siendo «declarado por ti · sin verificar»',
    /declarado por ti · sin verificar/i.test(E.etiquetas) && !/cumple|conforme|al d[ií]a/i.test(E.etiquetas),
    E.etiquetas);
  check('y hasta el banner insiste en que anotado no es comprobado',
    /anotado no es comprobado/i.test(E.banner),
    E.banner.replace(/\s+/g,' ').slice(0,180));

  /* =====================================================================
     CUMP-F · CADA REGLA, CON FUENTE Y FECHA DE CONSULTA EN PANTALLA
     =====================================================================
     Una regla sin fuente y una regla con fuente no se pueden parecer en
     pantalla. Y lo que no se pudo confirmar tiene que salir marcado, no
     omitido: omitirlo es dejar que el usuario lo dé por bueno.               */
  console.log('\n=== CUMP-F · DE DÓNDE SALE CADA REGLA ===');
  const F = await page.evaluate(()=>{
    const fu = (typeof CUMPL_FUENTES!=='undefined') ? CUMPL_FUENTES : null;
    const esq = (typeof EPR_ESQUEMAS!=='undefined') ? EPR_ESQUEMAS : null;
    return {
      nFuentes: fu ? fu.length : 'CUMPL_FUENTES no existe',
      sinUrl: fu ? fu.filter(f=>!f.url).map(f=>f.id) : null,
      sinConfirmar: fu ? fu.filter(f=>f.estado!=='ok').map(f=>f.id) : null,
      esquemasOk: esq ? Object.keys(esq).filter(k=>esq[k].estado==='ok') : null,
      esquemasNo: esq ? Object.keys(esq).filter(k=>esq[k].estado!=='ok') : null,
      fecha: (document.getElementById('cumplFecha')||{}).textContent || '',
      tabla: (document.getElementById('cumplFuentes')||{}).textContent || '',
      /* Los cuatro organismos que la pantalla nombra por su nombre. */
      lucid: esq && /LUCID/.test(esq.DE ? esq.DE.registro : ''),
      idu:   esq && /ADEME/.test(esq.FR ? esq.FR.registro : ''),
      rpp:   esq && /MITECO/.test(esq.ES ? esq.ES.registro : ''),
      conai: esq && /CONAI/.test(esq.IT ? esq.IT.registro : '')
    };
  });
  check('la pantalla enseña la fecha de consulta de las fuentes',
    F.fecha==='2026-09-17', F.fecha || '(no la enseña)');
  check('ninguna afirmación normativa se queda sin URL',
    Array.isArray(F.sinUrl) && F.sinUrl.length===0, (F.sinUrl||F.nFuentes)+'');
  check('lo que NO se pudo confirmar aparece marcado, no omitido',
    Array.isArray(F.sinConfirmar) && F.sinConfirmar.indexOf('ppwr-marketplaces')>=0 &&
    /SIN CONFIRMAR/.test(F.tabla),
    (F.sinConfirmar||[]).join(', '));
  check('el registro alemán es LUCID, el francés es el IDU de ADEME, el español el RPP del MITECO y el italiano el CONAI',
    F.lucid && F.idu && F.rpp && F.conai,
    'LUCID='+F.lucid+' IDU/ADEME='+F.idu+' RPP/MITECO='+F.rpp+' CONAI='+F.conai);
  check('seis países con esquema verificado y los demás marcados como no verificados',
    Array.isArray(F.esquemasOk) && F.esquemasOk.length===6 &&
    F.esquemasNo.indexOf('SK')>=0 && F.esquemasNo.indexOf('CZ')>=0,
    'verificados: '+(F.esquemasOk||[]).join(',')+' · sin verificar: '+(F.esquemasNo||[]).join(','));

  /* =====================================================================
     CUMP-G · EL INFORME DE EPR, CON SU FORMATO LITERAL
     =====================================================================
     BOM UTF-8, CRLF, TAB, 34 columnas y decimales con punto. Se importa por
     el mismo camino que usa la aplicación —el input de fichero—, no
     inyectando filas en DB: así se ejercita readSmart, la detección de
     codificación y parseDelimited, que es donde se rompen estas cosas.       */
  console.log('\n=== CUMP-G · EL INFORME DE EPR SE RECONOCE Y SE LEE ===');
  const crudo = fs.readFileSync(FX_EPR);
  check('la fixture lleva BOM UTF-8', crudo[0]===0xEF && crudo[1]===0xBB && crudo[2]===0xBF,
    Array.from(crudo.slice(0,3)).map(b=>b.toString(16)).join(' '));
  const texto = crudo.slice(3).toString('utf8');
  check('la fixture va en CRLF, no en LF suelto',
    texto.indexOf('\r\n')>0 && !/[^\r]\n/.test(texto), 'CRLF');
  const cabecera = texto.split('\r\n')[0];
  check('la cabecera está en la línea 1 y trae las 34 columnas separadas por TAB',
    cabecera.split('\t').length===34, cabecera.split('\t').length+' columnas');
  check('y los nombres de las cabeceras no llevan espacios finales',
    cabecera.split('\t').every(h=>h===h.trim()), 'sin espacios finales');
  check('los pesos van con punto decimal y tres dígitos',
    /\t0\.\d{3}\t/.test(texto), (texto.match(/\t\d+\.\d{3}\t/)||['ninguno'])[0]);

  await page.evaluate(()=>{ DB = blankDB(); saveDB(); refreshAll(); });
  await ir('datos');
  await page.setInputFiles('#csvFile', FX_EPR);
  await page.waitForTimeout(1100);
  const G = await page.evaluate(()=>{
    const el = document.querySelector('#fileList .fileitem');
    const ids = Object.keys(DB.imports||{});
    const por = (typeof eprPorPais==='function') ? eprPorPais() : null;
    return {
      reconocido: !!(el && el.querySelector('.f-dot.ok')),
      ids: ids.join(','),
      filas: (DB.imports.epr||{}).count || 0,
      como: (DB.imports.epr||{}).how || '',
      resumen: por ? Object.keys(por.paises).sort().map(k=>k+':'+por.paises[k].unidades).join(' ') : 'eprPorPais() no existe',
      sinPais: por ? por.sinPais : null,
      itSinRegistro: por && por.paises.IT ? por.paises.IT.sinRegistro : null,
      frMixto: por && por.paises.FR ? por.paises.FR.mixto : null,
      esRegistro: por && por.paises.ES ? Object.keys(por.paises.ES.registros).join(',') : null,
      kilosES: por && por.paises.ES ? Math.round(por.paises.ES.kilos*1000)/1000 : null
    };
  });
  check('el hub reconoce el informe de EPR por sus cabeceras inglesas',
    G.ids==='epr', G.ids || '(no se ha importado nada)');
  check('lee las 14 filas de la fixture', G.filas===14, G.filas+' filas');
  check('y las reparte por país usando el código de envío, no el nombre del fichero',
    G.resumen==='AT:1 BE:1 DE:3 ES:7 FR:4 IT:7 PL:1 PT:2 SE:1',
    G.resumen);
  check('la fila cuyo país no sabe interpretar se queda fuera, no se reparte',
    G.sinPais===1, 'filas sin país: '+G.sinPais);
  /* Aritmética a mano, que es lo que convierte esto en una comprobación y no
     en una foto de lo que salió: las tres filas españolas pesan, con envase,
     0,190 × 4 + 0,200 × 2 + 0,210 × 1 = 0,760 + 0,400 + 0,210 = 1,370 kg. */
  check('los kilos declarados se suman con sus tres decimales',
    G.kilosES!==null && Math.abs(G.kilosES - 1.370) < 0.0005, G.kilosES);
  check('Italia sale marcada: el informe trae ventas y ninguna con número de registro',
    G.itSinRegistro===true, 'IT sinRegistro='+G.itSinRegistro);
  check('Francia sale como caso mixto: unas filas con número y otras sin él',
    G.frMixto===true, 'FR mixto='+G.frMixto);
  check('y donde sí hay número, se lee tal cual viene',
    G.esRegistro==='ES-RPP-DEMO-0001', G.esRegistro);

  await ir('cumplimiento');
  const G2 = await page.evaluate(()=>({
    tabla: (document.getElementById('cumplEprTabla')||{}).textContent || '',
    vacio: !!document.getElementById('cumplEprVacio')
  }));
  check('la pantalla enseña lo que dice el informe, señalando las filas sin número',
    !G2.vacio && /vacío en las 2 filas/.test(G2.tabla) && /1,370 kg/.test(G2.tabla),
    (G2.tabla||'(sin tabla)').replace(/\s+/g,' ').slice(0,160));

  /* =====================================================================
     CUMP-H · EL DOSSIER SALE DE vatReport(), Y NO TOCA NADA
     =====================================================================
     `vatReport()` está congelada: se llama, no se cambia. Y «solo lectura»
     tiene que ser comprobable, no una promesa del comentario: se compara la
     base de datos antes y después de generar el dossier.                     */
  console.log('\n=== CUMP-H · DOSSIER PARA LA GESTORÍA · SOLO LECTURA ===');
  await ir('datos');
  await page.setInputFiles('#csvFile', path.resolve(__dirname,'fixtures','vat-transactions.txt'));
  await page.waitForTimeout(1100);
  const H = await page.evaluate(()=>{
    if(typeof cumplDossierFilas!=='function') return {falta:'cumplDossierFilas() no existe'};
    const V = vatReport();
    const antes = JSON.stringify(DB);
    const D = cumplDossierFilas();
    const despues = JSON.stringify(DB);
    /* Cada cifra del dossier tiene que ser la de vatReport(), sin retocar. */
    const desviados = D.filas.filter(f=>{
      const P = V.porPais[f.pais]; if(!P) return true;
      return f.ventas!==P.ventas ||
             Math.abs(f.base - Math.round(P.base*100)/100) > 0.005 ||
             Math.abs(f.iva  - Math.round(P.vat*100)/100)  > 0.005;
    }).map(f=>f.pais);
    return {
      paises: D.filas.map(f=>f.pais).join(','),
      desviados,
      intacta: antes===despues,
      filasVat: V.rows,
      aviso: (typeof CUMPL_AVISO==='string') ? CUMPL_AVISO : '',
      pantalla: (document.getElementById('cumplExtra')||{}).textContent || ''
    };
  });
  check('el dossier sale del informe de IVA importado',
    !H.falta && (H.paises||'').length>0, H.falta || H.paises);
  /* Con `desviados` vacío y CERO filas esta comprobación pasaría sin haber
     mirado nada, que es la forma más silenciosa de una prueba inútil. Por eso
     exige además que haya países en el dossier. */
  check('y ni una cifra se aparta de lo que devuelve vatReport()',
    Array.isArray(H.desviados) && H.desviados.length===0 && (H.paises||'').split(',').filter(Boolean).length>=3,
    (H.desviados||[]).length ? 'se apartan: '+H.desviados.join(',')
      : 'coinciden en '+((H.paises||'').split(',').filter(Boolean).length)+' países');
  check('generarlo no escribe una sola letra en la base de datos',
    H.intacta===true, H.intacta ? 'DB idéntica antes y después' : 'la DB HA CAMBIADO');
  check('el aviso de que esto no es asesoramiento fiscal existe y es explícito',
    /NO ES ASESORAMIENTO FISCAL/.test(H.aviso||''), (H.aviso||'(no existe)').slice(0,90));

  await ir('cumplimiento');
  const H2 = await page.evaluate(()=>({
    tabla: !!document.getElementById('cumplDossierTabla'),
    boton: !!document.getElementById('cumplDossierBtn'),
    aviso: (document.getElementById('cumplAviso')||{}).textContent || ''
  }));
  check('la pantalla enseña el dossier con su botón de descarga',
    H2.tabla && H2.boton, 'tabla='+H2.tabla+' botón='+H2.boton);
  check('y el aviso va pegado al dossier, no escondido en otra pantalla',
    /NO ES ASESORAMIENTO FISCAL/.test(H2.aviso), (H2.aviso||'(sin aviso)').slice(0,90));

  const H3 = await page.evaluate(()=>{
    const reg = (typeof REGISTRO==='object' && REGISTRO) ? REGISTRO.exportaciones.map(e=>e.id) : [];
    const btn = document.querySelector('#view-datos [data-export="dossier"]');
    return {reg:reg.join(','), boton: btn ? btn.textContent : '(no está)'};
  });
  check('la exportación está registrada por la costura, no colgada a mano',
    /dossier/.test(H3.reg), H3.reg || '(ninguna)');
  check('y aparece su botón en Datos › Salida',
    /Dossier gestoría/.test(H3.boton), H3.boton);

  /* =====================================================================
     CUMP-I · LA PANTALLA COMPLETA, SIN UN SOLO ERROR DE JS
     ===================================================================== */
  console.log('\n=== CUMP-I · VACÍA, A MEDIAS Y COMPLETA, SIN ERRORES ===');
  await page.evaluate(()=>{ loadDemo(); });
  await page.waitForTimeout(600);
  await ir('cumplimiento');
  const I = await page.evaluate(()=>({
    extra: !!document.getElementById('cumplExtra'),
    duplicados: document.querySelectorAll('#view-cumplimiento #cumplExtra').length,
    filas: document.querySelectorAll('#cumplEstadoTabla tr').length,
    comp: document.querySelectorAll('#compTable tr').length,
    nav: (document.getElementById('navCump')||{}).textContent || ''
  }));
  check('con la demo cargada la pantalla sigue entera',
    I.extra===true && I.filas===14, 'filas de estado: '+I.filas);
  check('la tabla de registros lista los 13 países de COUNTRIES',
    I.comp===14, I.comp+' filas (13 países + cabecera)');
  check('los paneles no se duplican al repintar en cada refreshAll',
    I.duplicados===1, I.duplicados+' contenedores #cumplExtra');
  const Inav = await page.evaluate(()=>{
    const est = (typeof cumplEstados==='function') ? cumplEstados() : null;
    return {n: est ? est.filter(s=>s.estado==='riesgo').length : 'cumplEstados() no existe',
            badge: (document.getElementById('navCump')||{}).textContent || ''};
  });
  check('el contador del menú cuenta países en riesgo abierto, no casillas sin marcar',
    typeof Inav.n==='number' && Inav.badge === String(Inav.n || '·'),
    'badge «'+Inav.badge+'» · en riesgo: '+Inav.n);

  /* Un repintado más, a mano, para cazar el duplicado que solo sale a la
     segunda o a la tercera. */
  await page.evaluate(()=>{ refreshAll(); refreshAll(); renderComp(); });
  await page.waitForTimeout(300);
  const I2 = await page.evaluate(()=>({
    dup: document.querySelectorAll('#cumplExtra').length,
    filas: document.querySelectorAll('#cumplEstadoTabla tr').length
  }));
  check('y tras tres repintados seguidos sigue habiendo un solo panel',
    I2.dup===1 && I2.filas===14, 'contenedores='+I2.dup+' filas='+I2.filas);

  check('ni un error de JavaScript en toda la sesión', errors.length===0,
    errors.slice(0,3).join(' | ') || 'ninguno');

  await browser.close();
  console.log('\n' + (fails===0 ? '✓ todo correcto' : '✗ ' + fails + ' fallos'));
  process.exit(fails===0 ? 0 : 1);
})().catch(e=>{ console.error(e); process.exit(1); });
