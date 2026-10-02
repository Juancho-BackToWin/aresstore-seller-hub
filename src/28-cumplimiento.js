/* ═══════════════════════════════════════════════════════════════════════════
   CARRIL 8 · CUMPLIMIENTO · IVA, OSS, EPR y PPWR por país

   LA REGLA QUE MANDA AQUÍ. Un hub de gestión no falla dando un error: falla
   dando un número creíble y falso. En esta pantalla el número creíble y falso
   se llama «cumples». Por eso este módulo NO TIENE ningún estado que diga que
   se cumple. El más fuerte que existe es:

       «Declarado por ti · el hub no lo comprueba contra ningún registro»

   Que el usuario marque una casilla no es una comprobación: es una afirmación
   suya que este hub guarda y devuelve. El hub no consulta LUCID, ni SYDEREP,
   ni el RPP, ni el EDM. No puede, y decir lo contrario sería exactamente el
   fallo caro de este carril. Lo dice la pantalla con esas palabras y lo
   comprueba `tests/cumplimiento.test.js` en las dos direcciones.

   SEGUNDA REGLA. Ninguna afirmación normativa se escribe aquí sin fuente y sin
   fecha de consulta, y las dos se ENSEÑAN EN PANTALLA. Lo que no se pudo
   confirmar sale marcado «sin confirmar», no se calla y no se suaviza. El
   catálogo entero está en `CUMPL_FUENTES`, más abajo, verificado a mano el
   17 de septiembre de 2026 contra las webs oficiales de cada organismo.

   TERCERA. El PPWR ya no es un plazo: el Reglamento (UE) 2025/40 se aplica
   desde el 12 de agosto de 2026, o sea que a día de hoy es una EXPOSICIÓN
   ABIERTA, no una tarea pendiente. La pantalla lo trata como riesgo, cuenta
   los días que lleva corriendo y no ofrece la salida cómoda de «ya lo miraré».

   Lo que este módulo NO hace, y conviene que quede escrito: no presenta
   declaraciones, no valida un número de registro contra nada, no es
   asesoramiento fiscal y no sustituye a una gestoría.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Fecha en la que se consultaron las fuentes oficiales de este fichero. Va
   suelta y no calculada, porque una fecha de consulta que se calcula sola con
   `today()` diría «consultado hoy» para siempre, y eso es justo la clase de
   dato creíble y falso que este carril existe para evitar. */
const CUMPL_CONSULTA = '2026-09-17';

/* ── Catálogo de fuentes ────────────────────────────────────────────────────
   Cada entrada es una afirmación que la pantalla hace, con de dónde sale.

     estado: 'ok'   · confirmado contra fuente oficial en la fecha de consulta
             'no'   · NO se ha podido confirmar; la pantalla lo dice así
             'prop' · existe, pero es una propuesta, no derecho vigente        */
const CUMPL_FUENTES = [
  {id:'ppwr-fecha', estado:'ok',
   dice:'El PPWR es el Reglamento (UE) 2025/40. En vigor desde el 11 de febrero de 2025 y aplicable desde el 12 de agosto de 2026.',
   fuente:'Comisión Europea · DG Medio Ambiente, «Packaging waste»',
   url:'https://environment.ec.europa.eu/topics/waste-and-recycling/packaging-waste_en'},

  {id:'ppwr-pfas', estado:'ok',
   dice:'Desde el 12 de agosto de 2026 no puede ponerse en el mercado de la UE envase en contacto con alimentos con PFAS por encima de los límites.',
   fuente:'Comisión Europea, nota de prensa de 11-ago-2026',
   url:'https://environment.ec.europa.eu/news/new-eu-rules-packaging-enter-application-2026-08-11_en'},

  {id:'ppwr-fases', estado:'ok',
   dice:'Aplicación por fases: etiquetado armonizado de clasificación de residuos en 2028; reutilización, contenido reciclado y reciclabilidad en 2030.',
   fuente:'Comisión Europea, nota de prensa de 11-ago-2026',
   url:'https://environment.ec.europa.eu/news/new-eu-rules-packaging-enter-application-2026-08-11_en'},

  {id:'ppwr-omnibus', estado:'prop',
   dice:'La Comisión propuso en diciembre de 2025 (Ómnibus ambiental) SUSPENDER la obligación de nombrar representante autorizado para quien vende a consumidores de otro Estado miembro. Es una PROPUESTA: no cambia nada hoy.',
   fuente:'Comisión Europea · DG Medio Ambiente, «Packaging waste»',
   url:'https://environment.ec.europa.eu/topics/waste-and-recycling/packaging-waste_en'},

  /* Esta es la afirmación que el propio hub llevaba escrita en tres pantallas
     como si fuera un hecho comprobado, y NO lo está. Se queda marcada 'no'
     hasta que alguien pueda leer el articulado. El texto consolidado en
     EUR-Lex no fue accesible desde esta sesión: el servidor devuelve un reto
     de AWS WAF (HTTP 202 con JavaScript) en vez del documento, para
     eur-lex.europa.eu/eli/reg/2025/40/oj/eng y para CELEX 32025R0040. */
  {id:'ppwr-marketplaces', estado:'no',
   dice:'Que los marketplaces estén OBLIGADOS a verificar el registro EPR de cada vendedor desde el 12-ago-2026, y que «Pay on Behalf» deje de valer como cumplimiento.',
   fuente:'SIN CONFIRMAR · solo fuentes secundarias, que además se contradicen sobre el artículo (44 o 45). La página oficial de la Comisión no lo menciona y el texto en EUR-Lex no fue accesible desde esta sesión.',
   url:'https://eur-lex.europa.eu/eli/reg/2025/40/oj/eng'},

  {id:'oss-limite', estado:'ok',
   dice:'La ventanilla única (OSS) declara ventas a distancia intracomunitarias, pero tener mercancía almacenada en un Estado miembro no elimina por sí solo la obligación de registro en ese Estado.',
   fuente:'Comisión Europea · portal One Stop Shop, «Declare and pay OSS»',
   url:'https://vat-one-stop-shop.ec.europa.eu/one-stop-shop/declare-and-pay-oss_en'},

  {id:'iva-tipos', estado:'ok',
   dice:'Tipos generales usados por el hub: AT 20 %, PT 23 %, CZ 21 %.',
   fuente:'Comisión Europea · DG TAXUD, «Table 2: VAT rates in the Member States» (la serie publicada llega a 2021; no hay cambio posterior publicado para estos tres en Access2Markets)',
   url:'https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en'},

  {id:'iva-sk', estado:'ok',
   dice:'Eslovaquia: tipo general del 23 % desde el 1 de enero de 2025 (antes 20 %).',
   fuente:'Comisión Europea · Access2Markets, «Recent VAT changes in certain EU Member States»',
   url:'https://trade.ec.europa.eu/access-to-markets/en/news/recent-vat-changes-certain-eu-member-states'}
];

/* ── El esquema EPR de cada país ────────────────────────────────────────────
   Lo importante de esta tabla no es la lista de organismos: es la columna
   `estado`. Seis países se han verificado contra la web oficial del registro
   o del boletín legal; siete NO, y la pantalla los pinta como no verificados
   en vez de suponer que se parecen a sus vecinos.

   Y una precisión que el propio hub tenía mal en tres sitios: el REGISTRO y el
   SISTEMA COLECTIVO no son lo mismo. En España inscribirse es en el RPP del
   MITECO; Ecoembes es un SCRAP al que además te adhieres. En Francia el número
   que prueba el registro lo da ADEME, no Citeo, y hay tres eco-organismos
   acreditados, no uno. Confundirlos hace creer que con pagar a un sistema
   colectivo ya estás inscrito, y no es así.                                   */
const EPR_ESQUEMAS = {
  DE:{estado:'ok', registro:'Registro de envases LUCID',
      organismo:'Zentrale Stelle Verpackungsregister (ZSVR)',
      dice:'Quien distribuye producto envasado en Alemania tiene que estar registrado en LUCID. El registro lo opera la ZSVR; el sistema dual al que te adhieres es otra cosa y va aparte.',
      url:'https://www.verpackungsregister.org/en/'},

  FR:{estado:'ok', registro:'Identifiant Unique (IDU), emitido por ADEME vía SYDEREP',
      organismo:'Eco-organismos acreditados 2025-2029 para la filière EMPAP: CITEO, ADELPHE y LEKO (coordinador: OCAPEM)',
      dice:'Desde el 1-1-2022 todo productor sujeto a una filière REP necesita su IDU por filière, que emite ADEME y prueba la inscripción (art. L541-10-13 del Code de l\'environnement). Envases domésticos y papel se fusionaron en la filière EMPAP el 1-1-2024. Citeo NO es la única opción.',
      url:'https://filieres-rep.ademe.fr/en/identifiant-unique'},

  ES:{estado:'ok', registro:'Registro de Productores de Producto (RPP), sección envases · MITECO',
      organismo:'Ecoembes, Ecovidrio y demás SCRAP — sistemas colectivos, NO el registro',
      dice:'La inscripción obligatoria es en el RPP del MITECO (art. 15 del RD 1055/2022), y los inscritos declaran antes del 31 de marzo lo puesto en el mercado el año anterior. Adherirse a un SCRAP no sustituye a inscribirse.',
      url:'https://www.miteco.gob.es/en/calidad-y-evaluacion-ambiental/temas/prevencion-y-gestion-residuos/prevencion-y-gestion-residuos/registro-productores-producto-seccion-envases.html'},

  IT:{estado:'ok', registro:'Adhesión al CONAI (Consorzio Nazionale Imballaggi)',
      organismo:'CONAI y los consorcios de material del art. 223',
      dice:'El art. 224 del D.lgs. 152/2006 configura el CONAI como consorcio nacional de envases en el que participan productores y usuarios; la adhesión es obligatoria en los supuestos que fija la norma, con contributo ambientale. Verificado sobre el texto legal publicado en el sitio del Parlamento: conai.org devolvió HTTP 403 desde esta sesión.',
      url:'https://leg14.camera.it/parlam/leggi/deleghe/06152dl4.htm'},

  AT:{estado:'ok', registro:'Registro en el portal EDM (aplicación eVerpackung)',
      organismo:'Sistemas de recogida y valorización autorizados (Sammel- und Verwertungssysteme)',
      dice:'Quien tiene obligación de registro o de declaración por la Verpackungsverordnung se registra en el EDM. La declaración anual de los obligados del Anexo 3 vence el 31 de marzo.',
      url:'https://www.edm.gv.at/edm_portal/cms.do?get=%2Fportal%2Finformationen%2Fanwendungenthemen%2Fverpackung.main'},

  PT:{estado:'ok', registro:'Registo de Produtores de Produtos, en SILiAmb · APA',
      organismo:'Entidades gestoras licenciadas del SIGRE (Sociedade Ponto Verde y otras)',
      dice:'El art. 19 del DL 152-D/2017 obliga a comunicar a la APA, por el registro electrónico, el material y la cantidad de envase puesto en el mercado nacional y el sistema de gestión elegido. La responsabilidad se puede asumir individualmente o transferir a un sistema integrado.',
      url:'https://apambiente.pt/residuos/registo-de-produtores-de-produtos'},

  /* De aquí abajo, lo que NO se ha comprobado. Se nombra el organismo que se
     suele citar, pero `estado:'no'` hace que la pantalla lo etiquete como sin
     verificar y que NUNCA cuente como cumplido. Poner aquí un «sí» de oídas
     sería el fallo que este carril persigue. */
  PL:{estado:'no', registro:'BDO · Baza danych o produktach i opakowaniach (sin verificar)',
      organismo:'sin verificar', url:'',
      dice:'No se ha consultado la fuente oficial polaca en esta sesión.'},
  NL:{estado:'no', registro:'Afvalfonds Verpakkingen (sin verificar)', organismo:'sin verificar', url:'',
      dice:'No se ha consultado la fuente oficial neerlandesa en esta sesión.'},
  BE:{estado:'no', registro:'Fost Plus / Valipac (sin verificar)', organismo:'sin verificar', url:'',
      dice:'No se ha consultado la fuente oficial belga en esta sesión.'},
  IE:{estado:'no', registro:'Repak (sin verificar)', organismo:'sin verificar', url:'',
      dice:'No se ha consultado la fuente oficial irlandesa en esta sesión.'},
  SE:{estado:'no', registro:'Naturvårdsverket (sin verificar)', organismo:'sin verificar', url:'',
      dice:'No se ha consultado la fuente oficial sueca en esta sesión.'},
  CZ:{estado:'no', registro:'EKO-KOM (sin verificar)', organismo:'sin verificar', url:'',
      dice:'No se ha consultado la fuente oficial checa en esta sesión. Además, Chequia no aparece en ninguno de los informes reales.'},
  SK:{estado:'no', registro:'OZV autorizada (sin verificar)', organismo:'sin verificar', url:'',
      dice:'No se ha consultado la fuente oficial eslovaca en esta sesión, y es el país donde SÍ consta mercancía nuestra.'}
};

/* ── Estado de un país · aquí es donde se decide qué puede decir la pantalla ──
   Devuelve siempre uno de estos, y ninguno significa «cumples»:

     inactivo   · no está marcado como mercado ni consta stock: el hub calla.
     riesgo     · hay obligación abierta y no consta registro anotado.
     parcial    · hay algo anotado pero falta el número, o falta el IVA local.
     declarado  · está todo anotado. Sigue siendo TU palabra, no una
                  comprobación: el hub no consulta ningún registro.

   Nota de diseño: `declarado` exige NÚMERO de registro, no una casilla. Una
   casilla se marca sin salir de la pantalla; un número hay que ir a buscarlo.
   Esa es toda la diferencia entre un recordatorio y un registro de evidencia. */
/* ── EL CRUCE CON EL INFORME DE EPR DE AMAZON ─────────────────────────────────

   Hasta aquí, «declarado» era tu palabra y nada más. Pero hay una fuente que SÍ
   se puede mirar sin consultar ningún registro oficial: el informe de EPR de
   Amazon trae, fila a fila, el número de registro que Amazon tiene de ti en ese
   país. Medido en el informe real de abril-junio de 2026: vacío en los cuatro
   países con ventas. Si Amazon no tiene el número, da igual que tú lo tengas
   apuntado en esta pantalla: es Amazon quien bloquea el listado.

   Lo que el cruce dice, y lo que no:
   · coincide      · Amazon tiene el mismo número que anotaste. Sigue sin ser una
                     comprobación contra LUCID o el RPP; es que los dos papeles
                     dicen lo mismo.
   · amazon-no     · el informe trae filas de envase de ese país y ninguna con
                     número. Estés o no registrado, Amazon no lo sabe.
   · distinto      · Amazon tiene un número y no es el que anotaste.
   · mixto         · unas filas con número y otras sin él.
   · solo-amazon   · Amazon tiene un número que tú no has anotado aquí.
   · sin-informe / sin-filas · no hay con qué cruzar: no se afirma nada.
   La comparación ignora espacios, guiones, puntos y mayúsculas: «DE 1234-56» y
   «de123456» son el mismo número escrito de dos formas, y llamarlos distintos
   sería otra alarma falsa. */
function eprNormNum(s){ return String(s||'').toUpperCase().replace(/[\s\-_.\/]/g,''); }
function cumplCruceEpr(code, epr, eprNum){
  if(!epr) epr = eprPorPais();
  if(!epr.filas) return {tipo:'sin-informe'};
  const P = epr.paises[code];
  if(!P || !P.filasEnvase){
    const otrasSinNum = P ? Object.keys(P.otras).filter(n=>P.otras[n].vacias===P.otras[n].filas) : [];
    return {tipo:'sin-filas', unidades: P ? P.unidades : 0, otrasSinNum};
  }
  const regs = Object.keys(P.regEnvase);
  const tuyo = eprNormNum(eprNum);
  const otrasSinNum = Object.keys(P.otras).filter(n=>P.otras[n].vacias===P.otras[n].filas);
  const base = {regs, unidades:P.unidades, filas:P.filasEnvase, vacias:P.vaciasEnvase, otrasSinNum,
                periodo: epr.periodo};
  if(!regs.length) return Object.assign(base, {tipo:'amazon-no'});
  if(!tuyo) return Object.assign(base, {tipo:'solo-amazon'});
  if(!regs.some(r=>eprNormNum(r)===tuyo)) return Object.assign(base, {tipo:'distinto'});
  if(P.vaciasEnvase || regs.length>1) return Object.assign(base, {tipo:'mixto'});
  return Object.assign(base, {tipo:'coincide'});
}
const EPR_CRUCE_TXT = {
  'coincide'   :'Amazon tiene el mismo número',
  'amazon-no'  :'Amazon NO tiene tu número',
  'distinto'   :'Amazon tiene OTRO número',
  'mixto'      :'Amazon lo tiene solo en parte',
  'solo-amazon':'Amazon tiene un número que no has anotado',
  'sin-filas'  :'el informe no trae envases de aquí',
  'sin-informe':'sin informe con que cruzar'
};

function cumplEstadoPais(code, epr){
  const c = COUNTRIES.filter(x=>x.code===code)[0];
  if(!c) return null;
  const x = (typeof DB==='object' && DB && DB.compliance && DB.compliance[code]) || {};
  const esq = EPR_ESQUEMAS[code] || {estado:'no', registro:'sin verificar', organismo:'sin verificar', dice:'', url:''};

  /* Por qué hay obligación. Dos motivos independientes y hay que separarlos:
     vender allí (EPR: pones envase en ese mercado) y almacenar allí (IVA: el
     stock crea hecho imponible local aunque no vendas ni una unidad). */
  /* Vender allí lo dices tú (la casilla de mercado activo) O LO DICE AMAZON:
     si el informe de EPR trae unidades vendidas en un país que no tienes
     marcado, el hub no puede decir «no activo · no afirma nada». Medido: el
     informe real trae Alemania con ventas. */
  const eprNum = String(x.eprNum||'').trim();
  const vatNum = String(x.vatNum||'').trim();
  let cruce = {tipo:'sin-informe'};
  try{ cruce = cumplCruceEpr(code, epr, eprNum); }catch(e){}
  const vendeSegunAmazon = (cruce.unidades||0) > 0;
  const vende  = !!x.active || vendeSegunAmazon;
  const guarda = !!(c.storage && x.active);
  const obligado = vende || guarda;
  const faltaEpr = !eprNum;
  /* El NIF-IVA local solo se exige donde hay almacén. Donde se sirve por EFN
     transfronterizo, el OSS basta y pedirlo sería inventar una obligación. */
  /* `guarda`, no `c.storage`: que un país sea de almacén PanEU no dice que TÚ
     guardes stock allí. Antes daba igual porque solo había obligación con la
     casilla marcada; ahora un país puede estar obligado porque Amazon dice que
     vendiste allí, y afirmar «aquí guardas stock» sería inventárselo. */
  const faltaVat = guarda && !vatNum;

  /* Lo que el cruce no deja llamar «declarado»: que Amazon no tenga tu número,
     que tenga otro, o que lo tenga a medias. Y las obligaciones de papel o
     textil que el informe trae sin ningún número. */
  const cruceMalo = ['amazon-no','distinto','mixto'].indexOf(cruce.tipo)>=0;
  const otrasSinNum = cruce.otrasSinNum || [];

  let estado = 'inactivo';
  if(obligado){
    if(faltaEpr) estado = 'riesgo';
    else if(faltaVat || cruceMalo || otrasSinNum.length) estado = 'parcial';
    else estado = 'declarado';
  }

  const pendientes = [];
  if(vendeSegunAmazon && !x.active)
    pendientes.push('el informe de EPR de Amazon trae '+cruce.unidades+' unidad'+(cruce.unidades===1?'':'es')+
                    ' vendida'+(cruce.unidades===1?'':'s')+' aquí y no lo tienes marcado como mercado');
  if(obligado && faltaEpr) pendientes.push('sin número de registro EPR anotado');
  if(cruce.tipo==='amazon-no') pendientes.push('Amazon no tiene tu número de envases en este país: vacío en '+
                    (cruce.filas===1?'la única fila':'las '+cruce.filas+' filas')+' del informe de EPR');
  if(cruce.tipo==='distinto') pendientes.push('Amazon tiene '+cruce.regs.join(', ')+', que no es el número que has anotado');
  if(cruce.tipo==='mixto') pendientes.push('Amazon tiene el número solo en parte: '+cruce.vacias+' de '+cruce.filas+
                    ' filas sin él'+(cruce.regs.length>1?', y con '+cruce.regs.length+' números distintos':''));
  if(cruce.tipo==='solo-amazon') pendientes.push('Amazon tiene el número '+cruce.regs.join(', ')+' y aquí no está anotado');
  if(otrasSinNum.length) pendientes.push('el informe trae también '+otrasSinNum.join(' y ')+
                    ', con su propio registro, y ninguna fila lleva número');
  if(obligado && faltaVat) pendientes.push('sin NIF-IVA local anotado, y aquí guardas stock');
  if(obligado && esq.estado!=='ok') pendientes.push('el hub no ha verificado qué registro aplica en este país');

  return {code, pais:c, conf:x, esquema:esq, estado, obligado, vende, guarda,
          eprNum, vatNum, pendientes, cruce, vendeSegunAmazon,
          reglaVerificada: esq.estado==='ok',
          /* Lo que la pantalla puede decir, en una frase, y nunca «cumples». */
          etiqueta: {
            inactivo :'No activo · el hub no afirma nada',
            riesgo   :'RIESGO ABIERTO · nada comprobado',
            parcial  :'Declarado a medias',
            declarado:'Declarado por ti · sin verificar'
          }[estado]};
}

/* Todos los países, en el orden de COUNTRIES. */
function cumplEstados(){
  let epr = null; try{ epr = eprPorPais(); }catch(e){}
  return COUNTRIES.map(c=>cumplEstadoPais(c.code, epr)).filter(Boolean);
}

/* ── Lo que este carril NO puede arreglar desde aquí ────────────────────────
   Dos sitios del hub siguen diciendo lo que esta pantalla ya no dice, y
   ninguno de los dos es de este carril:

   // COSTURA → carril 5: renderPanel() levanta la alerta de EPR mirando la
   // CASILLA `epr`, no el número de registro. Quien marca la casilla para
   // quitarse el aviso de encima deja de ver la alerta del panel mientras
   // sigue sin registro: es el mismo «cumples» sin comprobar, un piso más
   // arriba. Debería usar `cumplEstadoPais(code).estado==='riesgo'`, que está
   // aquí al lado y ya cuenta lo que hay que contar. No se toca desde aquí.

   // COSTURA → integración: el texto de renderPanel(), src/05-auditoria.html,
   // src/06-guia.html y el bloque fijo de src/02-views.html afirman como hecho
   // que los marketplaces están obligados a verificar el registro EPR y que
   // «Pay on Behalf» deja de valer como cumplimiento. Esta pantalla lo marca
   // SIN CONFIRMAR (ver CUMPL_FUENTES: el texto del Reglamento no fue
   // accesible). Hasta que alguien lea el articulado, el hub se contradice a
   // sí mismo en cuatro sitios. Ninguno de los cuatro es de este carril.

/* Días desde la aplicación del PPWR. Positivo = ya está en vigor. `today()` es
   de carril 6 y `PPWR_DATE` es constante, así que esto no inventa fechas. */
function cumplDiasPPWR(){
  try{ return -daysBetween(today(), new Date(PPWR_DATE)); }catch(e){ return null; }
}

/* ═══════════════════════════════════════════════════════════════════════════
   El informe de EPR de Amazon

   MEDIDO CONTRA EL FICHERO REAL el 29-09-2026 (273303020688.txt, 66 filas,
   periodo 2026-04-01 → 2026-06-30), cargándolo en la aplicación compilada y
   contrastando con una lectura directa del fichero: herramientas/medir/
   medir-epr.js. Formato: BOM UTF-8, CRLF, TAB, cabecera en la línea 1, 34
   columnas, decimales con punto y tres dígitos.

   Lo que la fixture del 17-09 NO reproducía y el fichero real sí trae está
   explicado en eprPorPais(): categorías con nombre largo («Primary
   Packaging», «Print Paper», «Textiles»), el mismo ASIN repetido por
   categoría y TOTAL_REPORTED_WEIGHT_KG vacío en las filas de envase.
   ═══════════════════════════════════════════════════════════════════════════ */
const EPR_COLUMNAS = [
  'UNIQUE_ACCOUNT_IDENTIFIER','REPORT_PERIOD_START','REPORT_PERIOD_END','ASIN',
  'AMAZON_MARKETPLACE','SHIP_TO_COUNTRY_CODE','SHIP_TO_COUNTRY','ITEM_NAME_IN_ENGLISH',
  'ITEM_NAME_AS_IN_MARKETPLACE','REGISTRATION_NUMBER','EPR_CATEGORY','EPR_SUBCATEGORY1',
  'EPR_SUBCATEGORY2','EPR_SUBCATEGORY3','EPR_SUBCATEGORY4','GL_PRODUCT_GROUP_DESCRIPTION',
  'PRODUCT_TYPE','TOTAL_UNITS_SOLD','UNITS_PER_ASIN','BATTERY_EMBEDDED',
  'ITEM_WEIGHT_WITHOUT_PACKAGE_KG','ITEM_WEIGHT_WITH_PACKAGE_KG','TOTAL_REPORTED_WEIGHT_KG',
  'ITEM_WIDTH_CM','PACKAGE_WIDTH_CM','ITEM_HEIGHT_CM','PACKAGE_HEIGHT_CM',
  'PAPER_KG','GLASS_KG','ALUMINUM_KG','STEEL_KG','PLASTIC_KG','WOOD_KG','OTHER_KG'
];

registrarInforme({
  id:'epr', label:'Informe de responsabilidad ampliada del productor (EPR)',
  en:'EPR Report',
  path:'Informes › Cumplimiento › Responsabilidad ampliada del productor',
  feeds:'la pantalla de Cumplimiento: en qué países hay envase puesto en el mercado y con qué número de registro consta cada uno',
  /* Detección por cabecera inglesa exacta, que es el camino sin ambigüedad.
     `EPR_CATEGORY` y `TOTAL_REPORTED_WEIGHT_KG` no existen en ningún otro de
     los informes del catálogo, así que no puede confundirse con ninguno. */
  hdr:['eprcategory','totalreportedweightkg'], onlyEn:true,
  fields:{
    _period :{req:0, type:null,   alias:[/reportperiodstart/]},
    _periodE:{req:0, type:null,   alias:[/reportperiodend/]},
    _asin   :{req:0, type:'code', alias:[/^asin$/]},
    _market :{req:0, type:null,   alias:[/amazonmarketplace/]},
    _country:{req:0, type:null,   alias:[/shiptocountrycode/,/shiptocountry/]},
    _reg    :{req:0, type:null,   alias:[/registrationnumber/]},
    _cat    :{req:0, type:null,   alias:[/^eprcategory$/]},
    _units  :{req:0, type:'int',  alias:[/totalunitssold/]},
    _kg     :{req:0, type:null,   alias:[/totalreportedweightkg/]}
  },
  sig:()=>false
});

/* Lectura del informe ya importado. Devuelve, POR PAÍS, lo que el informe dice
   de verdad: unidades, kilos de ENVASE, qué otras obligaciones EPR aparecen
   (papel impreso, textil…) y qué números de registro constan.

   Un país aparece aquí con `sinRegistro:true` cuando el informe trae ventas
   suyas y la columna REGISTRATION_NUMBER viene vacía. Eso no es un detalle de
   formato: es Amazon diciendo que no le consta tu registro en ese país.

   TRES COSAS QUE SOLO SE VIERON CON EL FICHERO REAL (29-09-2026), y que la
   fixture escrita a partir de la especificación no traía:

   1 · UN MISMO ASIN APARECE UNA VEZ POR CADA CATEGORÍA EPR. En el informe real
       el mismo artículo sale como «Primary Packaging» y como «Print Paper»
       (el manual que va dentro), con las MISMAS unidades vendidas en las dos
       filas. Sumar TOTAL_UNITS_SOLD fila a fila contaba cada venta dos veces:
       Francia salía con el doble de unidades. Las unidades se cuentan una vez
       por ASIN y país.

   2 · EN LAS FILAS DE ENVASE, TOTAL_REPORTED_WEIGHT_KG VIENE VACÍA. El peso del
       envase está repartido por material (PAPER_KG, PLASTIC_KG…). Leer solo
       TOTAL_REPORTED daba 0 kg de envase en España, Italia y Alemania, y en
       Francia daba el peso del TEXTIL como si fuera envase: un número creíble
       y falso en la columna que se lleva a la declaración.

   3 · HAY CATEGORÍAS QUE NO SON ENVASE. «Print Paper» y «Textiles» son
       obligaciones EPR distintas, con su propio registro. Se cuentan aparte
       (`otras`) y nunca se suman a los kilos de envase.

   Y UNA CUARTA: la fila de «Secondary Packaging» no trae ASIN sino el texto
   «SP FBA». Es la caja de los envíos a los almacenes de Amazon. Sus kilos SÍ
   son envase que pones en ese mercado; sus «unidades» NO son ventas. Contarlas
   duplicaba las de Alemania.                                               */
const EPR_MATERIALES = [
  ['paperkg','papel/cartón'], ['glasskg','vidrio'], ['aluminumkg','aluminio'],
  ['steelkg','acero'], ['plastickg','plástico'], ['woodkg','madera'], ['otherkg','otros']
];
function eprEsEnvase(cat){ return /packag/i.test(String(cat||'')); }
function eprNombreCategoria(cat){
  const c = String(cat||'').trim();
  if(!c) return 'sin categoría';
  if(/primary\s*packag/i.test(c)) return 'envase primario';
  if(/secondary\s*packag/i.test(c)) return 'envase secundario';
  if(/packag/i.test(c)) return 'envase';
  if(/print\s*paper/i.test(c)) return 'papel impreso';
  if(/textil/i.test(c)) return 'textil';
  if(/batter/i.test(c)) return 'pilas';
  if(/electr|weee/i.test(c)) return 'aparatos eléctricos';
  if(/furnit/i.test(c)) return 'mueble';
  return c;
}
function eprPorPais(){
  const out = {paises:{}, filas:0, periodo:null, sinPais:0};
  let filas = [];
  try{ filas = (typeof imp==='function' ? imp('epr') : []) || []; }catch(e){ filas = []; }
  out.filas = filas.length;
  if(!filas.length) return out;
  const udsPorAsin = {};
  filas.forEach(r=>{
    const bruto = gv(r,'_country','shiptocountrycode','shiptocountry') ||
                  gv(r,'_market','amazonmarketplace');
    const code = countryOf(bruto);
    const p0 = String(gv(r,'_period','reportperiodstart')||'').trim();
    if(p0 && !out.periodo) out.periodo = p0;
    if(!code){ out.sinPais++; return; }
    const P = out.paises[code] || (out.paises[code] =
      {code, filas:0, unidades:0, kilos:0, materiales:{}, registros:{}, vacias:0, otras:{},
       regEnvase:{}, vaciasEnvase:0, filasEnvase:0});
    P.filas++;
    /* (1) una venta por ASIN y país, aunque salga en varias categorías */
    const asin = String(gv(r,'_asin','asin')||'').trim().toUpperCase();
    const esArticulo = /^[A-Z0-9]{10}$/.test(asin);
    const k = code+'|'+asin;
    const u = toNum(gv(r,'_units','totalunitssold'));
    if(!esArticulo){ /* «SP FBA» y similares: no es una venta */ }
    else if(udsPorAsin[k]===undefined){ udsPorAsin[k] = u; P.unidades += u; }
    else if(u > udsPorAsin[k]){ P.unidades += u - udsPorAsin[k]; udsPorAsin[k] = u; }
    const cat = gv(r,'_cat','eprcategory');
    if(eprEsEnvase(cat)){
      /* (2) el envase pesa lo que suman sus materiales */
      let kg = 0, hay = false;
      EPR_MATERIALES.forEach(m=>{
        const v = gv(r, m[0]);
        if(v===undefined) return;
        hay = true;
        const n = toNum(v);
        if(n){ kg += n; P.materiales[m[1]] = (P.materiales[m[1]]||0) + n; }
      });
      /* Si una fila de envase no trae NINGÚN material, se usa el total que
         declare. Nunca las dos cosas a la vez. */
      if(!hay) kg = toNum(gv(r,'_kg','totalreportedweightkg'));
      P.kilos += kg;
      /* El número de registro de ENVASES va aparte de los de papel o textil:
         es el que se cruza con el que anotas en esta pantalla. */
      P.filasEnvase++;
      const rEnv = String(gv(r,'_reg','registrationnumber')||'').trim();
      if(rEnv) P.regEnvase[rEnv] = (P.regEnvase[rEnv]||0)+1; else P.vaciasEnvase++;
    }else{
      /* (3) papel impreso, textil…: otra obligación, contada aparte */
      const nom = eprNombreCategoria(cat);
      const O = P.otras[nom] || (P.otras[nom] = {filas:0, kilos:0, vacias:0});
      O.filas++;
      O.kilos += toNum(gv(r,'_kg','totalreportedweightkg'));
      const rO = String(gv(r,'_reg','registrationnumber')||'').trim();
      if(!rO) O.vacias++;
      else { O.registros = O.registros || {}; O.registros[rO] = 1; }
    }
    const reg = String(gv(r,'_reg','registrationnumber')||'').trim();
    if(reg) P.registros[reg] = (P.registros[reg]||0)+1; else P.vacias++;
  });
  Object.keys(out.paises).forEach(k=>{
    const P = out.paises[k];
    P.sinRegistro = P.vacias > 0 && !Object.keys(P.registros).length;
    P.mixto = P.vacias > 0 && Object.keys(P.registros).length > 0;
  });
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Dossier para la gestoría · SOLO LECTURA

   Sale entero de `vatReport()`, que está CONGELADA: se llama, no se toca, y no
   se recalcula nada por el camino. Si aquí apareciera una cifra que no está en
   `vatReport()`, sería una segunda verdad sobre el mismo IVA, que es peor que
   no tener dossier.

   «Solo lectura» significa dos cosas y las dos se comprueban en la suite: no
   escribe en DB, y no cambia ningún estado de la pantalla.
   ═══════════════════════════════════════════════════════════════════════════ */
const CUMPL_AVISO = 'Este documento lo genera un hub de gestión a partir de tus '+
  'propios informes de Amazon. NO ES ASESORAMIENTO FISCAL, no es una declaración '+
  'y no sustituye a tu gestoría. Las cifras hay que contrastarlas contra los '+
  'informes originales antes de usarlas para presentar nada.';

function cumplDossierFilas(){
  let V;
  try{ V = vatReport(); }catch(e){ V = null; }
  if(!V) return {filas:[], vat:null, periodos:[]};
  const periodos = Object.keys(V.periodos||{}).sort();
  const filas = Object.keys(V.porPais||{}).sort().map(code=>{
    const P = V.porPais[code];
    const c = COUNTRIES.filter(x=>x.code===code)[0];
    const st = cumplEstadoPais(code);
    /* Los tipos que el informe trae de verdad para ese país, no el nominal.
       Si salen dos, la gestoría tiene que saberlo: puede ser tipo reducido
       legítimo o una clasificación mal puesta, y son cosas distintas. */
    const tipos = Object.keys(P.tipos||{}).sort((a,b)=>parseFloat(a)-parseFloat(b));
    return {
      pais: code,
      nombre: c ? c.name : 'Fuera de la lista de países del hub',
      periodos: periodos.join(' · ') || 'el informe no trae periodo',
      ventas: P.ventas,
      base: r2(P.base),
      iva: r2(P.vat),
      tiposAplicados: tipos.join(' / ') || '—',
      tipoGeneral: (VAT_GENERAL[code]!=null ? VAT_GENERAL[code]+' %' : 'no consta'),
      difReducido: r2(P.dif),
      difIvaIncluido: r2(P.difIncl||0),
      b2bCero: P.b2bCero||0,
      registroIva: st ? (st.vatNum || 'no anotado') : 'no anotado',
      registroEpr: st ? (st.eprNum || 'no anotado') : 'no anotado',
      estado: st ? st.etiqueta : 'país fuera de la lista'
    };
  });
  return {filas, vat:V, periodos};
}

function exportarDossierGestoria(){
  const D = cumplDossierFilas();
  if(!D.vat || !D.filas.length){
    if(typeof toast==='function') toast('Todavía no hay informe de IVA importado: el dossier saldría vacío y no serviría de nada.');
    return null;
  }
  const cab = ['País','Nombre','Periodos del informe','Ventas','Base imponible','IVA repercutido',
               'Tipos aplicados %','Tipo general %','Diferencia por tipo reducido',
               'Diferencia si el precio incluía IVA','Ventas B2B a tipo cero (no son deuda)',
               'NIF-IVA anotado','Registro EPR anotado','Estado en el hub'];
  const filas = D.filas.map(f=>[f.pais, f.nombre, f.periodos, f.ventas, f.base, f.iva,
                                f.tiposAplicados, f.tipoGeneral, f.difReducido,
                                f.difIvaIncluido, f.b2bCero,
                                f.registroIva, f.registroEpr, f.estado]);
  /* El aviso va DENTRO del fichero, no solo en la pantalla. Un CSV se reenvía
     por correo y llega sin la pantalla detrás. */
  filas.push([]);
  filas.push(['AVISO', CUMPL_AVISO]);
  filas.push(['Origen', 'vatReport() sobre el informe de IVA importado · '+D.vat.rows+' filas leídas']);
  if(D.vat.reembolsos) filas.push(['Reembolsos', D.vat.reembolsos+' filas REFUND · '+D.vat.reembolsosReducidos+
    ' a tipo reducido, que restan '+r2(-D.vat.difReembolsos)+' de la diferencia (o '+r2(-D.vat.difReembolsosIncl)+
    ' con el criterio de precio con IVA incluido). Ya descontados en las cifras por país.']);
  filas.push(['Generado', typeof iso==='function' ? iso(today()) : '']);
  if(typeof descargarCSV==='function') descargarCSV('dossier-gestoria', cab, filas);
  return {filas:filas.length, paises:D.filas.length};
}
registrarExportacion('dossier', 'Dossier gestoría (IVA)', exportarDossierGestoria);

/* ═══════════════════════════════════════════════════════════════════════════
   Pintado
   ═══════════════════════════════════════════════════════════════════════════ */
registrarEstilo(
  '.cumpl-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;'+
  'font-weight:700;letter-spacing:.02em;white-space:nowrap}'+
  '.cumpl-riesgo{background:#fde8e6;color:#8a1c10}'+
  '.cumpl-parcial{background:#fdf1d8;color:#7a5200}'+
  '.cumpl-declarado{background:#e6f0fb;color:#134a86}'+
  '.cumpl-inactivo{background:#eceff1;color:#4a5a60}'+
  '.cumpl-noverif{background:#f3e8fd;color:#5b2a86}'+
  '.cumpl-src{font-size:11.5px;line-height:1.55;color:#42555c}'+
  '.cumpl-src td{vertical-align:top}'+
  '.cumpl-src code{font-size:11px;word-break:break-all}'+
  '.cumpl-nota{font-size:12px;color:#5d6d73;margin-top:10px;line-height:1.55}'
);

/* Los paneles nuevos no caben en `src/02-views.html`, que no es de este carril.
   Se insertan desde aquí en la sección que ya existe, una sola vez y de forma
   idempotente: `renderComp()` se llama en cada `refreshAll()` y duplicar
   paneles en cada refresco sería un bug muy vistoso. */
function cumplMontarPaneles(){
  const vista = document.getElementById('view-cumplimiento');
  if(!vista) return null;
  let host = document.getElementById('cumplExtra');
  if(host) return host;
  host = document.createElement('div');
  host.id = 'cumplExtra';
  /* Delante de la rejilla de dos paneles fijos: lo que es riesgo vivo va
     arriba, y lo que es material de consulta, debajo. */
  const rejilla = vista.querySelector('.grid-2');
  if(rejilla && rejilla.parentNode) rejilla.parentNode.insertBefore(host, rejilla);
  else vista.appendChild(host);
  return host;
}

function cumplPintarEstados(){
  const host = cumplMontarPaneles();
  if(!host) return;
  const E = cumplEstados();
  const dias = cumplDiasPPWR();
  const enVigor = dias!=null && dias>=0;
  const riesgo = E.filter(s=>s.estado==='riesgo');
  const parcial = E.filter(s=>s.estado==='parcial');
  const declarado = E.filter(s=>s.estado==='declarado');
  const epr = eprPorPais();

  const badge = s=>'<span class="cumpl-badge cumpl-'+s.estado+'">'+esc(s.etiqueta)+'</span>';

  let h = '<div class="panel"><div class="panel-head"><div>'+
    '<h2>Qué está comprobado, país por país</h2>'+
    '<p class="desc" style="margin:0">Esta tabla no dice en ningún caso que cumplas. '+
    'El hub no consulta LUCID, ni SYDEREP, ni el RPP, ni el EDM, ni ningún otro registro: '+
    'guarda lo que tú anotas y te lo devuelve. Lo más fuerte que puede decir una fila es '+
    '<strong>«declarado por ti, sin verificar»</strong>, y eso solo cuando hay un número de '+
    'registro escrito — una casilla marcada no cuenta, porque se marca sin levantarse de la silla.</p>'+
    '</div></div>';

  h += '<div class="tbl-wrap"><table class="grid" id="cumplEstadoTabla">'+
    '<tr><th>País</th><th>Por qué hay obligación</th><th>Registro EPR que aplica</th>'+
    '<th>Nº EPR anotado</th><th>NIF-IVA anotado</th><th>Estado</th></tr>';

  E.forEach(s=>{
    const motivo = !s.obligado ? '<span class="mut">no marcado como mercado</span>'
      : (s.guarda
          ? 'vendes <strong>y guardas stock</strong> aquí'
          : 'vendes aquí, sin stock propio');
    const reg = s.reglaVerificada
      ? esc(s.esquema.registro)+'<br><span class="mut" style="font-size:11px">'+esc(s.esquema.organismo)+'</span>'
      : '<span class="cumpl-badge cumpl-noverif">sin verificar</span> <span class="mut" style="font-size:11px">'+esc(s.esquema.registro)+'</span>';
    const origen = s.pais.origen==='heredado'
      ? ' <span class="cumpl-badge cumpl-noverif" title="No aparece en ningún informe real">país sin confirmar</span>' : '';
    h += '<tr class="'+(s.obligado?'':'dim')+'">'+
      '<td class="name"><strong>'+esc(s.code)+'</strong> '+esc(s.pais.name)+origen+'</td>'+
      '<td>'+motivo+'</td>'+
      '<td>'+reg+'</td>'+
      '<td><input type="text" style="width:150px" placeholder="sin anotar" value="'+esc(s.eprNum)+'" '+
        'onchange="setComp(\''+s.code+'\',\'eprNum\',this.value)"></td>'+
      '<td><input type="text" style="width:140px" placeholder="'+(s.pais.storage?'sin anotar':'no hace falta')+'" value="'+esc(s.vatNum)+'" '+
        'onchange="setComp(\''+s.code+'\',\'vatNum\',this.value)"></td>'+
      '<td>'+badge(s)+(s.pendientes.length
          ? '<br><span class="mut" style="font-size:11px">'+esc(s.pendientes.join(' · '))+'</span>' : '')+'</td></tr>';
  });
  h += '</table></div>';

  /* El veredicto. Dice el número y dice de qué está hecho: cuántos países
     están en riesgo abierto, cuántos declarados sin verificar, y cuántos ni
     siquiera tienen regla comprobada en el hub. */
  let v = '<div class="cumpl-nota" id="cumplResumen">';
  if(!E.some(s=>s.obligado)){
    v += '<strong>No hay ningún mercado marcado como activo.</strong> Sin eso, esta pantalla no puede '+
         'decir nada de tu cumplimiento — ni bueno ni malo. Marca arriba dónde vendes y dónde guardas stock.';
  }else{
    v += '<strong>'+riesgo.length+' país'+(riesgo.length===1?'':'es')+' en riesgo abierto</strong> '+
         (riesgo.length? '('+riesgo.map(s=>s.code).join(', ')+') · ' : '· ')+
         parcial.length+' declarado'+(parcial.length===1?'':'s')+' a medias · '+
         declarado.length+' declarado'+(declarado.length===1?'':'s')+' por ti y sin verificar. ';
    const sinRegla = E.filter(s=>s.obligado && !s.reglaVerificada);
    if(sinRegla.length)
      v += '<br><br>En <strong>'+sinRegla.map(s=>s.code).join(', ')+'</strong> el hub no ha verificado '+
           'contra fuente oficial qué registro aplica, así que ahí no puede ni orientarte: '+
           'trátalo como no comprobado aunque lo tengas resuelto.';
    v += '<br><br>Ninguna fila de arriba significa que estés al día. Significa, como mucho, que lo has anotado.';
  }
  v += '</div>';
  h += v + '</div>';

  /* ── Lo que dice el informe de EPR de Amazon, si está importado ────────── */
  h += '<div class="panel"><div class="panel-head"><div>'+
    '<h2>Lo que dice el informe de EPR de Amazon</h2>'+
    '<p class="desc" style="margin:0">El informe trae una columna <code>REGISTRATION_NUMBER</code> por fila. '+
    'Cuando viene vacía para un país con ventas, es Amazon diciendo que no le consta tu registro allí, '+
    'que es la señal más temprana que vas a tener antes de un bloqueo de listados.</p></div></div>';
  if(!epr.filas){
    h += '<div class="note-box info" style="margin-bottom:0" id="cumplEprVacio">'+
         'No has importado el informe de EPR todavía. El hub lo reconoce por sus cabeceras inglesas '+
         '('+EPR_COLUMNAS.length+' columnas, separador TAB); lo encuentras en '+
         '<em>Informes › Cumplimiento › Responsabilidad ampliada del productor</em>. '+
         'Sin él, esta sección no puede decir nada, y no va a suponerlo.</div>';
  }else{
    const codes = Object.keys(epr.paises).sort();
    h += '<div class="tbl-wrap"><table class="grid" id="cumplEprTabla">'+
      '<tr><th>País</th><th class="num">Filas</th><th class="num">Unidades</th>'+
      '<th class="num">Kg de envase</th><th>Otras obligaciones EPR</th><th>Nº de registro en el informe</th>'+
      '<th>Contra lo que has anotado</th></tr>';
    codes.forEach(k=>{
      const P = epr.paises[k];
      const regs = Object.keys(P.registros);
      const celda = P.sinRegistro
        ? '<span class="cumpl-badge cumpl-riesgo">vacío en '+(P.vacias===1?'la única fila':'las '+P.vacias+' filas')+'</span>'
        : (P.mixto
            ? '<span class="cumpl-badge cumpl-parcial">'+P.vacias+' filas sin número</span> '+esc(regs.join(', '))
            : esc(regs.join(', ')));
      h += '<tr><td class="name"><strong>'+esc(k)+'</strong></td>'+
        '<td class="num">'+P.filas+'</td><td class="num">'+P.unidades+'</td>'+
        /* `num`, no `fmt`: fmt pone el símbolo del euro delante, y aquí son
           kilos. Un «€0,270» en una columna de peso es pequeño, pero es
           exactamente la misma clase de error que un número de más. */
        '<td class="num">'+num(P.kilos,3)+' kg</td>'+
        '<td>'+(Object.keys(P.otras).length
          ? Object.keys(P.otras).sort().map(n=>{ const O=P.otras[n];
              return esc(n)+(O.kilos?' · '+num(O.kilos,3)+' kg':'')+
                (O.vacias===O.filas?' <span class="cumpl-badge cumpl-riesgo">sin nº</span>':''); }).join('<br>')
          : '—')+'</td><td>'+celda+'</td>'+
        '<td>'+(function(){ const anot = ((DB.compliance||{})[k]||{}).eprNum;
          const X = cumplCruceEpr(k, epr, anot);
          const cls = X.tipo==='coincide' ? 'cumpl-declarado' : (['amazon-no','distinto'].indexOf(X.tipo)>=0 ? 'cumpl-riesgo' : 'cumpl-parcial');
          return '<span class="cumpl-badge '+cls+'" data-cruce="'+esc(X.tipo)+'">'+esc(EPR_CRUCE_TXT[X.tipo]||X.tipo)+'</span>'+
            (anot ? '<br><span class="mut" style="font-size:11px">anotado: '+esc(anot)+'</span>' : ''); })()+'</td></tr>';
    });
    h += '</table></div>';
    if(epr.sinPais)
      h += '<div class="note-box warn" style="margin-bottom:0">'+epr.sinPais+' fila'+(epr.sinPais===1?'':'s')+
           ' del informe no traen un país que el hub sepa interpretar. No se reparten entre los demás: '+
           'un kilo colocado en el país equivocado es peor que un kilo sin país.</div>';
  }
  h += '</div>';

  /* ── Dossier ──────────────────────────────────────────────────────────── */
  const D = cumplDossierFilas();
  h += '<div class="panel"><div class="panel-head"><div>'+
    '<h2>Dossier para la gestoría</h2>'+
    '<p class="desc" style="margin:0">Una salida de SOLO LECTURA de lo que ya calcula el hub sobre el '+
    'informe de IVA, por país y por periodo. No recalcula nada ni añade ninguna cifra propia: '+
    'si aquí apareciera un número que no está en la pantalla de IVA, habría dos verdades sobre el mismo impuesto.</p>'+
    '</div></div>';
  if(!D.vat || !D.filas.length){
    h += '<div class="note-box info" id="cumplDossierVacio">Importa el informe de transacciones sujetas a IVA '+
         'y aquí aparecerá el dossier, país a país. Vacío no se exporta.</div>';
  }else{
    h += '<div class="tbl-wrap"><table class="grid" id="cumplDossierTabla">'+
      '<tr><th>País</th><th>Periodos</th><th class="num">Ventas</th><th class="num">Base</th>'+
      '<th class="num">IVA</th><th>Tipos aplicados</th><th>Estado en el hub</th></tr>'+
      D.filas.map(f=>'<tr><td class="name"><strong>'+esc(f.pais)+'</strong> '+esc(f.nombre)+'</td>'+
        '<td class="mut">'+esc(f.periodos)+'</td><td class="num">'+f.ventas+'</td>'+
        '<td class="num">'+fmt(f.base)+'</td><td class="num">'+fmt(f.iva)+'</td>'+
        '<td class="mut">'+esc(f.tiposAplicados)+' <span class="mut">(general '+esc(f.tipoGeneral)+')</span></td>'+
        '<td class="mut">'+esc(f.estado)+'</td></tr>').join('')+'</table></div>';
    h += '<div style="margin-top:12px"><button class="btn sm" id="cumplDossierBtn" '+
         'onclick="exportarDossierGestoria()">Descargar dossier (CSV)</button></div>';
  }
  h += '<div class="note-box stop" style="margin-bottom:0" id="cumplAviso"><strong>Aviso.</strong> '+esc(CUMPL_AVISO)+'</div>';
  h += '</div>';

  /* ── De dónde sale cada regla ─────────────────────────────────────────── */
  h += '<div class="panel"><div class="panel-head"><div>'+
    '<h2>De dónde sale cada regla de esta pantalla</h2>'+
    '<p class="desc" style="margin:0">Consultado el <strong id="cumplFecha">'+esc(CUMPL_CONSULTA)+'</strong>. '+
    'Lo que no se pudo confirmar aparece aquí igual, marcado como tal: una regla sin fuente y una regla '+
    'con fuente no se pueden parecer en pantalla.</p></div></div>'+
    '<div class="tbl-wrap"><table class="grid cumpl-src" id="cumplFuentes">'+
    '<tr><th style="width:110px">Estado</th><th>Lo que dice la pantalla</th><th>Fuente y fecha de consulta</th></tr>';
  CUMPL_FUENTES.forEach(f=>{
    const et = {ok:['cumpl-declarado','confirmado'], no:['cumpl-riesgo','SIN CONFIRMAR'],
                prop:['cumpl-parcial','solo propuesta']}[f.estado];
    h += '<tr><td><span class="cumpl-badge '+et[0]+'">'+et[1]+'</span></td>'+
      '<td>'+esc(f.dice)+'</td>'+
      '<td>'+esc(f.fuente)+'<br><code>'+esc(f.url)+'</code><br><span class="mut">consultado el '+esc(CUMPL_CONSULTA)+'</span></td></tr>';
  });
  /* Y los esquemas EPR país a país, en la misma tabla de fuentes: separar
     «las reglas» de «los organismos» haría que el usuario mirara una y no la
     otra, y el organismo es justo la parte que cambia de país a país. */
  COUNTRIES.forEach(c=>{
    const e = EPR_ESQUEMAS[c.code]; if(!e) return;
    const et = e.estado==='ok' ? ['cumpl-declarado','confirmado'] : ['cumpl-riesgo','SIN CONFIRMAR'];
    h += '<tr><td><span class="cumpl-badge '+et[0]+'">'+et[1]+'</span></td>'+
      '<td><strong>'+esc(c.code)+' · '+esc(c.name)+'</strong><br>'+esc(e.dice)+'</td>'+
      '<td>'+(e.url ? '<code>'+esc(e.url)+'</code><br><span class="mut">consultado el '+esc(CUMPL_CONSULTA)+'</span>'
                    : '<span class="mut">ninguna · no consultado en esta sesión</span>')+'</td></tr>';
  });
  h += '</table></div>'+
    '<div class="cumpl-nota">Sobre el informe de EPR de Amazon: su cabecera está <strong>medida</strong> '+
    '(33.845 bytes, BOM UTF-8, CRLF, TAB, '+EPR_COLUMNAS.length+' columnas, decimales con punto y tres dígitos), '+
    'pero el fichero no está en disco en este entorno, así que <strong>nada de este módulo se ha medido contra el '+
    'informe real</strong>: las pruebas corren sobre una fixture sintética con ese mismo formato. '+
    'El número de filas del informe real <strong>no está medido</strong> — se mencionaron 66 y queda sin confirmar.</div>'+
    '</div>';

  host.innerHTML = h;
}

/* El banner de riesgo del PPWR. Sustituye al mensaje de cuenta atrás, que a
   día de hoy contaría hacia atrás desde una fecha ya pasada. */
function cumplBannerPPWR(){
  const el = document.getElementById('ppwrBanner');
  if(!el) return;
  const dias = cumplDiasPPWR();
  const E = cumplEstados();
  const riesgo = E.filter(s=>s.estado==='riesgo');
  const parcial = E.filter(s=>s.estado==='parcial');
  if(dias==null){ el.innerHTML=''; return; }

  if(dias < 0){
    el.innerHTML = '<div class="note-box warn" style="margin-top:0"><strong>Faltan '+(-dias)+' días '+
      'para el 12 de agosto de 2026</strong>, fecha de aplicación del Reglamento (UE) 2025/40. '+
      'Los registros EPR llevan semanas de tramitación: no es un trámite de última semana.</div>';
    return;
  }

  const clase = riesgo.length ? 'stop' : (parcial.length ? 'warn' : 'info');
  let t = '<div class="note-box '+clase+'" style="margin-top:0" id="cumplPPWR">'+
    '<strong>El PPWR se aplica desde el 12 de agosto de 2026 · hace '+dias+' día'+(dias===1?'':'s')+'.</strong> '+
    'Esto ya no es un plazo que agotar: es una exposición abierta, y cada día cuenta hacia atrás. ';
  if(riesgo.length){
    t += 'Tienes <strong>'+riesgo.length+' mercado'+(riesgo.length===1?'':'s')+' sin un solo número de registro EPR anotado</strong> ('+
         riesgo.map(s=>s.code).join(', ')+'). ';
  }else if(parcial.length){
    t += 'Tienes número de EPR en todos tus mercados, pero <strong>'+parcial.length+'</strong> ('+
         parcial.map(s=>s.code).join(', ')+') siguen sin NIF-IVA local anotado teniendo stock allí. ';
  }else if(E.some(s=>s.obligado)){
    t += 'Consta un número de registro anotado en todos tus mercados activos. <strong>Anotado no es comprobado</strong>: '+
         'el hub no lo ha validado contra ningún registro oficial, y quien tiene que darlo por bueno es el organismo, no esta pantalla. ';
  }else{
    t += 'No has marcado ningún mercado como activo, así que el hub no puede decirte en qué países estás expuesto. ';
  }
  /* Lo que el hub NO sabe va en el mismo banner, no escondido abajo. Un aviso
     rojo que omite su propia incertidumbre es medio aviso. */
  t += '<br><br><span class="mut">Lo que aquí no está comprobado: que los marketplaces estén obligados a verificar '+
       'tu registro desde esa fecha, y que «Pay on Behalf» haya dejado de valer como cumplimiento, son afirmaciones '+
       'que este hub <strong>no ha podido confirmar</strong> contra el texto del Reglamento (el documento en EUR-Lex '+
       'no fue accesible al preparar esta pantalla). Tómalas como riesgo probable, no como hecho.</span></div>';
  el.innerHTML = t;
}
