/* ═══════════════════════════════════════════════════════════════════════════
   CARRIL 4 · PUBLICIDAD

   Lo que este módulo arregla, y por qué era grave.

   1 · EL GASTO NO DEPENDÍA DEL PERIODO DE VERDAD.
       La definición `searchterm` no declaraba ninguna columna de fecha, así que
       `adStats()` iba a buscarlas por su nombre en crudo (`startdate`,
       `fechadeinicio`) y se las daba a `parseDate()`. Medido sobre el informe
       real de agosto: `parseDate()` entiende «jun 23, 2026» y «jul 14, 2026»
       —porque el motor de JavaScript reconoce «jun» y «jul» como meses
       ingleses— pero NO entiende «ago 20, 2026», ni «ene», ni «abr», ni «dic».
       Cuatro de los doce meses del año, y uno de ellos es justo el del informe.
       Efecto: el rango del informe salía de 2026-06-19 a 2026-07-31 (43 días)
       cuando de verdad llega hasta 2026-08-22 (65 días). El gasto se prorrateaba
       ×30/43 en vez de ×30/65: un 51 % de gasto de más, presentado como medido.

   2 · EL PRORRATEO ERA UNO SOLO PARA TODO EL INFORME.
       `factor = díasDelPeriodo / díasDelInforme` se aplicaba igual a todas las
       filas. Pero el informe real trae fecha POR FILA, y no todas las filas son
       del mismo día: 205 de sus 1.222 filas (medido el 17-09-2026) no cubren un
       día sino un tramo, de hasta 64 días de diferencia entre inicio y fin
       —65 días naturales—, y esas 205 filas concentran la mayor parte del
       gasto. Con el factor único, el gasto de un término que solo corrió en
       junio se cargaba a un periodo de septiembre, y el de un término que solo
       corrió esta semana se encogía a la mitad. La tabla de términos —la
       pantalla con la que se decide qué puja se toca— quedaba llena de números
       que no eran del periodo que se estaba mirando.

       Aquí cada fila se reparte A PARTES IGUALES entre sus días y se corta con
       el periodo. Repartir a partes iguales es una SUPOSICIÓN, no una medición,
       y por eso la pantalla lo dice fila a fila y en el resumen.

   3 · EL ACOS DE EQUILIBRIO SE PODÍA CALCULAR CON EL MARGEN DEL SKU EQUIVOCADO.
       Un ACOS de equilibrio sacado del margen de otro producto es el número
       creíble y falso más caro de esta pantalla: hace bajar la puja de un
       término rentable. El informe de términos de búsqueda NO trae SKU —el
       real no lo trae— así que el casamiento se hace por el nombre de la
       campaña o del grupo de anuncios, y solo cuenta si es INEQUÍVOCO. Si no
       lo es, la fila lo dice y no se calcula nada que dependa del margen.

   LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO: no cambia pujas, no escribe en
   Amazon y no tiene credenciales. Recomienda; decide una persona.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Parámetros declarados, no escondidos en medio de una fórmula ─────────── */
const PUB_MIN_CLICS   = 10;   // clics mínimos para que una conversión observada signifique algo
const PUB_HORAS_REGLA = 72;   // la regla de las 72 horas entre cambios de puja
const PUB_DIAS_RUIDO  = 3;    // los últimos tres días siguen moviéndose (atribución)
const PUB_MUESTRA_RITMO = 7;  // días con informe, como mínimo, para sacar el ritmo de los días sin informe (una semana)

/* ── Fechas · COSTURA → carril 6 ──────────────────────────────────────────────
   `parseDate()` está en el carril 6 y no se toca. Lo que hace falta aquí es
   entender el formato en que Amazon fecha el informe de publicidad en español,
   «ago 20, 2026», que `new Date()` da por inválido. Se resuelve ANTES de
   llamar a `parseDate()`, y si el formato no es ese se delega en él tal cual,
   con lo que todo lo que ya funcionaba sigue funcionando.

   Pedido al carril 6: que `parseDate()` reconozca los meses abreviados en
   español. Mientras tanto, esta función. */
const PUB_MESES = {ene:0, enero:0, jan:0, january:0,
                   feb:1, febrero:1, february:1,
                   mar:2, marzo:2, march:2,
                   abr:3, abril:3, apr:3, april:3,
                   may:4, mayo:4,
                   jun:5, junio:5, june:5,
                   jul:6, julio:6, july:6,
                   ago:7, agosto:7, aug:7, august:7,
                   sep:8, sept:8, septiembre:8, september:8,
                   oct:9, octubre:9, october:9,
                   nov:10, noviembre:10, november:10,
                   dic:11, diciembre:11, dec:11, december:11};
function pubFecha(v){
  if(v==null || v==='') return null;
  const s = String(v).trim();
  if(!s) return null;
  /* «ago 20, 2026» · «20 ago 2026» · «ago. 20 2026» */
  let m = s.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]{3,10})\.?\s+(\d{1,2})\s*,?\s*(\d{4})$/);
  if(m){
    const mes = PUB_MESES[fold(m[1]).replace(/\./g,'')];
    if(mes!==undefined) return new Date(+m[3], mes, +m[2]);
  }
  m = s.match(/^(\d{1,2})\s*[-\s]\s*([A-Za-zÁÉÍÓÚáéíóúñÑ]{3,10})\.?\s*[-\s]\s*(\d{4})$/);
  if(m){
    const mes = PUB_MESES[fold(m[2]).replace(/\./g,'')];
    if(mes!==undefined) return new Date(+m[3], mes, +m[1]);
  }
  const d = parseDate(s);
  return d && !isNaN(d.getTime()) ? startOfDay(d) : null;
}

/* ── Números · COSTURA → carril 1 ─────────────────────────────────────────────
   `toNum()` es del carril 1 y no se toca. Tiene un agujero medido: decide que
   una coma es decimal solo si van detrás UNA O DOS cifras. El informe de
   publicidad trae columnas con CUATRO decimales («0,4356», «16,6667%»), y ahí
   `toNum('0,4356')` devuelve 4356 — diez mil veces el valor. En la columna de
   gasto eso convierte 0,44 € en 4.356 € y la pantalla manda negativizar un
   término que estaba ganando dinero. No está en la columna «Gasto» del informe
   de agosto, que trae dos decimales, pero sí en CPC y en los porcentajes, y
   nada garantiza que el próximo informe no traiga cuatro en el gasto.

   Pedido al carril 1: que `toNum()` acepte de 1 a 4 decimales tras la coma
   cuando no hay ningún punto en la cadena. Mientras tanto, esta función. */
function pubNum(v){
  if(v==null || v==='') return 0;
  let s = String(v).replace(/[^\d,.\-]/g,'');
  if(!s || s==='-') return 0;
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
  if(coma>=0 && punto>=0){
    /* Manda el separador que va más a la derecha: es el decimal. */
    if(coma>punto) s = s.replace(/\./g,'').replace(',', '.');
    else s = s.replace(/,/g,'');
  } else if(coma>=0){
    /* Una sola coma con 1-4 cifras detrás es decimal europeo; tres cifras
       exactas y más de un grupo es separador de millares. */
    const trozos = s.split(',');
    if(trozos.length===2 && trozos[1].length>=1 && trozos[1].length<=4) s = trozos[0]+'.'+trozos[1];
    else s = s.replace(/,/g,'');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/* ── La ventana de tiempo que se está mirando ─────────────────────────────────
   Son los `daysInPeriod()` días que terminan hoy, ambos extremos incluidos. No
   se usa `periodStart()` directamente porque ese punto de corte deja 31 días
   dentro de un periodo de 30, y entonces el gasto de un informe que cubre el
   periodo entero saldría un día más caro que el gasto declarado. */
function pubVentana(){
  const dias = Math.max(1, daysInPeriod());
  const fin = startOfDay(today());
  return {ini: addDays(fin, -(dias-1)), fin, dias};
}
/* Días de solape entre [a1,a2] y [b1,b2], ambos extremos incluidos. */
function pubSolape(a1, a2, b1, b2){
  const i = a1>b1 ? a1 : b1, f = a2<b2 ? a2 : b2;
  return Math.max(0, daysBetween(i, f) + 1);
}

/* ── Las filas del informe, normalizadas ──────────────────────────────────── */
function pubFilas(){
  return imp('searchterm').map(r=>{
    const desde = pubFecha(gv(r,'_from','startdate','fechadeinicio','fechainicio','start','fecha'));
    let hasta = pubFecha(gv(r,'_to','enddate','fechadefinalizacion','fechadefin','fechafin','end'));
    if(desde && (!hasta || hasta<desde)) hasta = desde;
    const dias = (desde && hasta) ? Math.max(1, daysBetween(desde, hasta)+1) : 0;
    return {
      term:     String(gv(r,'_term','customersearchterm','searchterm','terminodebusquedadecliente')||'').trim(),
      campaign: String(gv(r,'_campaign','campaignname','nombredecampana')||'').trim(),
      adgroup:  String(gv(r,'adgroupname','nombredelgrupodeanuncios','grupodeanuncios')||'').trim(),
      country:  String(gv(r,'country','pais')||'').trim(),
      divisa:   String(gv(r,'currency','divisa')||'').trim().toUpperCase(),
      match:    String(gv(r,'matchtype','tipodecoincidencia')||'').trim(),
      spend:  pubNum(gv(r,'_spend','spend','cost','totalspend','gasto')),
      sales:  pubNum(gv(r,'_sales','sales','attributedsales7d','sales7d','totalsales')),
      orders: pubNum(gv(r,'_orders','orders','attributedconversions7d','totalorders','purchases')),
      clicks: pubNum(gv(r,'_clicks','clicks','clics')),
      impr:   pubNum(gv(r,'_impr','impressions','impresiones')),
      desde, hasta, dias,
      /* De qué fichero viene. Una fila idéntica en dos ficheros lleva los dos
         (`__fs` = «f1,f3»); para decidir solapes vale cualquiera de ellos. */
      ficheros: String(r.__fs||'').split(',').filter(Boolean)
    };
  });
}

/* ── VARIOS INFORMES QUE CUBREN LOS MISMOS DÍAS ───────────────────────────────

   EL FALLO QUE EVITA, medido sobre los informes reales de Juancho: tiene quince
   informes de términos de búsqueda descargados y se solapan entre sí. El de
   julio de 2025 y el llamado «septiembre» cubren a la vez del 6 al 23 de julio
   en España; dos de los de Italia son casi el mismo periodo descargado dos
   veces. El importador deduplica filas IDÉNTICAS, pero dos informes de periodos
   distintos agregan los días de otra manera —una fila de 14 días en uno, catorce
   filas de un día en el otro— y no hay dos filas iguales que quitar. Sumarlos
   todos contaría el gasto de esos días dos veces, con el semáforo en verde.

   LA REGLA. Para cada campaña y cada día, manda UN solo informe: entre los que
   cubren ese día y traen esa campaña, el que llega más lejos (el descargado
   después, con la atribución de 7 días ya asentada); si empatan, el de más
   filas, que es el más fino. Las filas de los demás informes no cuentan para
   ese día. Un informe cubre del primer al último día que trae, y «trae una
   campaña» si tiene alguna fila de ella.

   LO QUE NO HACE, dicho: no reparte un día entre dos informes ni promedia. Si
   los dos informes dicen cifras distintas para el mismo día, gana uno y la
   pantalla dice cuánto gasto ha quedado fuera por solape. */
function pubCobertura(filas){
  const cob = {};
  filas.forEach(f=>{
    /* Una fila sin fichero de origen (una base guardada antes de que el
       importador lo anotara) no se puede decir que pise a otro informe: ni
       crea cobertura ni se le quita ningún día. */
    if(!f.desde || !f.ficheros.length) return;
    f.ficheros.forEach(fid=>{
      const c = cob[fid] || (cob[fid] = {fid, ini:f.desde, fin:f.hasta, filas:0, sumDias:0, camp:{}, campPais:{}});
      if(f.desde<c.ini) c.ini=f.desde;
      if(f.hasta>c.fin) c.fin=f.hasta;
      c.filas++;
      const kc = fold(f.campaign);
      c.camp[kc] = 1;
      if(f.country) c.campPais[kc+'|'+pubPais(f.country)] = 1;
      c.sumDias = (c.sumDias||0) + f.dias;
    });
  });
  return cob;
}
/* ¿El informe `c` trae la campaña de esta fila? Si los dos dicen país, tiene
   que coincidir: una campaña con el mismo nombre en Francia y en Italia son dos
   campañas. Si alguno no trae país (los informes viejos no lo traían), basta el
   nombre. */
/* El país de una fila, como código. Un informe escribe «España», otro «Spain» y
   otro «ES»: comparados en crudo eran tres países y la misma campaña contaba dos
   veces (lo encontró la revisión adversarial del 3-10-2026). */
/* `countryOf()` entiende los nombres en inglés y los códigos, pero no los
   nombres en español con que el informe de publicidad en español escribe el
   país («España», «Alemania», «Países Bajos»). Se resuelven aquí primero. */
const PUB_PAISES_ES = {'espana':'ES','alemania':'DE','francia':'FR','italia':'IT','paises bajos':'NL',
  'belgica':'BE','polonia':'PL','suecia':'SE','reino unido':'GB','irlanda':'IE','austria':'AT',
  'portugal':'PT','republica checa':'CZ','chequia':'CZ','turquia':'TR','eslovaquia':'SK'};
function pubPais(v){
  if(!v) return '';
  const f = fold(String(v)).replace(/\s+/g,' ').trim();
  if(PUB_PAISES_ES[f]) return PUB_PAISES_ES[f];
  let c = null; try{ c = countryOf(v); }catch(e){}
  return c || f;
}
function pubTraeCampana(c, kc, kp){
  if(!c.camp[kc]) return false;
  const conPais = Object.keys(c.campPais).some(k=>k.indexOf(kc+'|')===0);
  if(kp && conPais) return !!c.campPais[kc+'|'+kp];
  return true;
}
function pubDuenoDia(cob, kc, kp, dia, cache){
  const k = kc+'|'+kp+'|'+dia.getTime();
  if(k in cache) return cache[k];
  let mejor = null;
  for(const fid in cob){
    const c = cob[fid];
    if(dia<c.ini || dia>c.fin || !pubTraeCampana(c, kc, kp)) continue;
    /* Desempates, en orden: llega más lejos; es más fino (filas de menos días
       de media: un informe diario gana a uno de resumen aunque tenga menos
       filas); tiene más filas; se cargó después (número de fichero, como
       número: «f10» va después de «f9»). */
    const fino = x=>x.sumDias/x.filas, nf = x=>+String(x.fid).replace(/\D/g,'')||0;
    if(!mejor || c.fin>mejor.fin || (+c.fin===+mejor.fin && (fino(c)<fino(mejor) ||
       (fino(c)===fino(mejor) && (c.filas>mejor.filas || (c.filas===mejor.filas && nf(c)>nf(mejor))))))) mejor = c;
  }
  return (cache[k] = mejor ? mejor.fid : null);
}

/* ── Gasto y desperdicio publicitario, fila a fila y día a día ─────────────────

   MODELO, dicho entero para que se pueda auditar:

   · Cada fila con fechas se reparte A PARTES IGUALES entre sus días naturales
     y se corta con la ventana del periodo. Una fila de un día que cae dentro
     entra entera; una fila de 30 días de la que solo 10 caen dentro entra por
     un tercio. Repartir a partes iguales es una suposición: nadie gasta
     exactamente lo mismo cada día. Por eso se cuenta cuánto gasto viene de
     filas de más de un día y la pantalla lo enseña.

   · Los días del periodo que el informe NO cubre se rellenan al ritmo diario
     medio del informe. Eso es una EXTRAPOLACIÓN y también se dice. Poner cero
     sería peor: un informe de 60 días mirado a 90 dejaría 30 días de ventas
     con cero euros de publicidad, y el beneficio saldría inflado sin que nada
     chirriara. Es la misma razón por la que un informe viejo no se ignora.

   · Una fila SIN fechas no se puede prorratear ni cortar: entra entera, y
     `spanUnknown` se enciende si NO hay ninguna fila fechada, que es lo que
     hace que el P&L deje de llamar «medido» a ese margen.

   Las ventas atribuidas, los clics, las impresiones y los pedidos se prorratean
   CON EL MISMO factor que el gasto. Prorratear solo el gasto dispararía el ACOS
   de cada término prorrateado y la pantalla mandaría bajar pujas rentables. */
function pubAdStats(){
  const filas = pubFilas();
  const V = pubVentana();

  let spendObs=0, salesObs=0, clicksObs=0, imprObs=0, ordersObs=0;
  let spendBruto=0, salesBruto=0;
  let spendSinFecha=0, salesSinFecha=0, clicksSinFecha=0, imprSinFecha=0, ordersSinFecha=0;
  let clicksInforme=0, imprInforme=0;
  let filasSinFecha=0, filasAgregadas=0, gastoAgregado=0, gastoProrrateado=0;
  let maxDias=0, d0=null, d1=null;
  let filasOtraDivisa=0, gastoOtraDivisa=0;
  const otrasDivisas = {};
  const cubierto = {};                 // días del periodo que el informe toca de verdad
  const grupos = {};
  const cob = pubCobertura(filas.filter(f=>!(f.divisa && f.divisa!==DIVISA_VENTAS)));
  const nFicheros = Object.keys(cob).length;
  const cacheDueno = {};
  let gastoSolape=0, ventasSolape=0, filasSolape=0;
  const diasSolape = {};               // días de calendario en que dos informes se pisan
  const gastoDia = {}, ventasDia = {}; // con varios informes: lo que cuenta cada día, ya sin solapes

  filas.forEach(f=>{
    /* UNA LIBRA NO ES UN EURO, Y SUMARLAS ES UN ACOS FALSO HACIA ARRIBA.
       Un informe de publicidad de varios mercados puede traer filas en GBP, PLN
       o SEK junto a las de euros. Sumarlas todas en el mismo montón infla el
       gasto sin tocar las ventas, el ACOS del término sube y la pantalla manda
       bajar una puja que estaba ganando dinero. El hub hace sus cuentas en una
       sola divisa declarada (`DIVISA_VENTAS`); lo que venga en otra se queda
       fuera de TODAS las cifras y se dice cuánto se ha quedado fuera. */
    if(f.divisa && f.divisa!==DIVISA_VENTAS){
      filasOtraDivisa++; gastoOtraDivisa += f.spend;
      otrasDivisas[f.divisa] = (otrasDivisas[f.divisa]||0)+1;
      return;
    }
    /* Qué días de esta fila le tocan a su informe. Con un solo informe, todos;
       con varios que se pisan, solo aquellos en que este informe es el que
       manda para esta campaña (ver `pubCobertura`). */
    let propios = f.dias, diasPropios = null;
    if(f.desde && nFicheros>1 && f.ficheros.length){
      const kc = fold(f.campaign), kp = pubPais(f.country);
      const mios = f.ficheros;
      diasPropios = [];
      for(let k=0;k<f.dias;k++){
        const dia = addDays(f.desde, k);
        const dueno = pubDuenoDia(cob, kc, kp, dia, cacheDueno);
        if(dueno===null || mios.indexOf(dueno)>=0){
          diasPropios.push(dia);
          const kd = iso(dia);
          gastoDia[kd] = (gastoDia[kd]||0) + f.spend/f.dias;
          ventasDia[kd] = (ventasDia[kd]||0) + f.sales/f.dias;
        }
        else diasSolape[iso(dia)] = 1;
      }
      propios = diasPropios.length;
      if(propios<f.dias){
        filasSolape++;
        gastoSolape += f.spend*(f.dias-propios)/f.dias;
        ventasSolape += f.sales*(f.dias-propios)/f.dias;
      }
    }
    const fBruto = f.desde ? propios/f.dias : 1;
    spendBruto += f.spend*fBruto; salesBruto += f.sales*fBruto;
    clicksInforme += f.clicks*fBruto; imprInforme += f.impr*fBruto;
    if(f.dias>1 && propios>0){ filasAgregadas++; gastoAgregado += f.spend*fBruto; if(f.dias>maxDias) maxDias=f.dias; }
    if(f.desde && (!d0 || f.desde<d0)) d0=f.desde;
    if(f.hasta && (!d1 || f.hasta>d1)) d1=f.hasta;

    let factor, dentro=0;
    if(!f.desde){
      filasSinFecha++;
      spendSinFecha+=f.spend; salesSinFecha+=f.sales; clicksSinFecha+=f.clicks;
      imprSinFecha+=f.impr; ordersSinFecha+=f.orders;
      factor = 1;
    } else {
      if(diasPropios===null){
        dentro = pubSolape(f.desde, f.hasta, V.ini, V.fin);
        for(let k=0;k<dentro;k++) cubierto[iso(addDays(f.desde>V.ini?f.desde:V.ini, k))] = 1;
      } else {
        diasPropios.forEach(dia=>{ if(dia>=V.ini && dia<=V.fin){ dentro++; cubierto[iso(dia)] = 1; } });
      }
      factor = dentro / f.dias;
      spendObs += f.spend*factor; salesObs += f.sales*factor;
      clicksObs += f.clicks*factor; imprObs += f.impr*factor; ordersObs += f.orders*factor;
      if(f.dias>1 && dentro>0) gastoProrrateado += f.spend*factor;
    }

    if(!f.term) return;
    const k = fold(f.term)+'|'+fold(f.campaign);
    if(!grupos[k]) grupos[k] = {term:f.term, campaign:f.campaign, adgroup:f.adgroup,
      country:f.country, match:f.match, spend:0, sales:0, orders:0, clicks:0, impr:0,
      spendTot:0, salesTot:0, ordersTot:0, clicksTot:0, imprTot:0, fueraDePeriodo:false,
      filas:0, agregadas:0, prorrateado:0, desde:null, hasta:null, diasEnPeriodo:0, sinFecha:0};
    const g = grupos[k];
    g.filas++;
    g.spend += f.spend*factor; g.sales += f.sales*factor;
    g.orders += f.orders*factor; g.clicks += f.clicks*factor; g.impr += f.impr*factor;
    /* Las mismas cifras SIN recortar. Solo se usan si el informe entero no toca
       el periodo: ver `fueraDePeriodo`, más abajo. */
    g.spendTot += f.spend*fBruto; g.salesTot += f.sales*fBruto;
    g.ordersTot += f.orders*fBruto; g.clicksTot += f.clicks*fBruto; g.imprTot += f.impr*fBruto;
    if(!f.desde) g.sinFecha++;
    else {
      if(!g.desde || f.desde<g.desde) g.desde=f.desde;
      if(!g.hasta || f.hasta>g.hasta) g.hasta=f.hasta;
      if(dentro>g.diasEnPeriodo) g.diasEnPeriodo = dentro;
      if(f.dias>1){ g.agregadas++; g.prorrateado += f.spend*factor; }
    }
  });

  const diasMedidos = Object.keys(cubierto).length;
  /* Días que cubren LOS INFORMES, no días entre el primero y el último. Con un
     informe de mayo de 2025 y otro de agosto de 2026, contar de punta a punta
     metería catorce meses sin informe en el divisor y el ritmo diario saldría
     a una fracción del real: la extrapolación de los días sin informe se
     quedaría corta y el beneficio, optimista. Con un solo informe es lo mismo
     que antes. */
  let adDays = 0, diasTramo = 0, gastoTramo = 0, ventasTramo = 0, tramoIni = null, tramoFin = null;
  if(d0&&d1){
    if(nFicheros<=1){
      adDays = diasTramo = Math.max(1, daysBetween(d0,d1)+1);
      gastoTramo = spendBruto-spendSinFecha; ventasTramo = salesBruto-salesSinFecha;
      tramoIni = d0; tramoFin = d1;
    } else {
      const dias = {};
      for(const fid in cob){ const c=cob[fid];
        for(let k=0, n=daysBetween(c.ini,c.fin)+1; k<n; k++) dias[iso(addDays(c.ini,k))]=1; }
      adDays = Math.max(1, Object.keys(dias).length);
      /* EL RITMO SALE DEL ÚLTIMO TRAMO CONTINUO CON INFORME, no de todo el
         histórico. Medido con los quince informes reales: la media de todo el
         histórico daba 19,67 €/día —el ritmo del último trimestre de 2025— y
         «30 días» imputaba 590 € a un septiembre de 2026 sin un solo informe,
         cuando el último informe, el de agosto, gastaba 7,67 €/día. Para
         rellenar días que nadie ha medido, lo menos malo es lo más reciente.
         Con un solo informe, el tramo es el informe entero: lo de siempre. */
      /* Y CON UNA MUESTRA MÍNIMA. La revisión adversarial lo encontró: si el
         último tramo es de un día —un pico de Prime Day descargado aparte—,
         su ritmo se estiraba a cientos de días. El tramo se alarga hacia atrás,
         saltando los huecos, hasta tener al menos `PUB_MUESTRA_RITMO` días
         con informe (o todos los que haya). */
      let k = d1; tramoFin = d1;
      while(dias[iso(k)]){ diasTramo++; gastoTramo += gastoDia[iso(k)]||0;
        ventasTramo += ventasDia[iso(k)]||0; tramoIni = k; k = addDays(k,-1); }
      const objetivo = Math.min(PUB_MUESTRA_RITMO, adDays);
      while(diasTramo < objetivo && k >= d0){
        if(dias[iso(k)]){ diasTramo++; gastoTramo += gastoDia[iso(k)]||0;
          ventasTramo += ventasDia[iso(k)]||0; tramoIni = k; }
        k = addDays(k,-1);
      }
    }
  }
  /* CAMPAÑAS QUE NO SALEN EN EL INFORME MÁS RECIENTE. La cobertura de un día
     es la de los informes que lo tocan, y un informe que no trae una campaña
     deja esa campaña a cero esos días, dados por medidos. Si la campaña dejó
     de gastar, es verdad; si el informe se pidió filtrado, falta su gasto. El
     hub no puede saber cuál de las dos, así que lo dice: las campañas activas
     en la semana anterior al informe más reciente que no salen en él. */
  let campanasFuera = [];
  if(nFicheros>1){
    let ult = null; for(const fid in cob) if(!ult || cob[fid].fin>ult.fin) ult = cob[fid];
    const ultimaFecha = {};
    filas.forEach(f=>{ if(!f.hasta || !f.ficheros.length) return; const kc=fold(f.campaign);
      if(!ultimaFecha[kc] || f.hasta>ultimaFecha[kc].d) ultimaFecha[kc] = {d:f.hasta, nombre:f.campaign}; });
    const limite = addDays(ult.ini, -7);
    campanasFuera = Object.keys(ultimaFecha).filter(kc=>!ult.camp[kc] && ultimaFecha[kc].d>=limite)
      .map(kc=>ultimaFecha[kc].nombre);
  }
  /* Ritmo diario, para los días del periodo que el informe no cubre. */
  const ritmoGasto  = diasTramo ? gastoTramo/diasTramo : 0;
  const ritmoVentas = diasTramo ? ventasTramo/diasTramo : 0;
  /* HASTA DÓNDE SE PUEDE ESTIRAR UN INFORME.

     Rellenar los días que el informe no cubre al ritmo medio evita el error
     grande —dejar tramos de venta con cero euros de publicidad e inflar el
     beneficio— pero estirado sin límite se vuelve el error contrario. Medido
     con el informe real de agosto —65 días de cobertura— mirando «12 meses»:
     los 300 días que faltaban se rellenaban al ritmo medio y el gasto imputado
     salía CINCO VECES Y MEDIA el que el informe declara, presentado como el
     gasto publicitario del año. (Las cifras de ese informe no se escriben aquí:
     el repositorio es público.)

     Un informe puede informar, como mucho, de tantos días como los que mide.
     Lo que quede fuera se queda SIN DATO y la pantalla lo dice: esos días van
     con cero de publicidad y el beneficio de ese tramo sale optimista. Decirlo
     es lo único honesto; inventarlo, no. */
  const diasPorCubrir = Math.max(0, V.dias - diasMedidos);
  /* Un ritmo se estira, como mucho, tantos días como los que lo sostienen. Con
     un informe es el informe; con varios, la muestra de la que sale el ritmo. */
  const diasExtrapolados = adDays ? Math.min(diasPorCubrir, nFicheros>1 ? diasTramo : adDays) : 0;
  const diasSinDato = diasPorCubrir - diasExtrapolados;
  const spendExtra = diasExtrapolados * ritmoGasto;
  const salesExtra = diasExtrapolados * ritmoVentas;

  const spend = spendObs + spendExtra + spendSinFecha;
  const sales = salesObs + salesExtra + salesSinFecha;
  const clicks = clicksObs + clicksSinFecha;
  const impr   = imprObs + imprSinFecha;
  const orders = ordersObs + ordersSinFecha;

  /* UN INFORME QUE NO TOCA EL PERIODO NO DEJA LA TABLA EN BLANCO.

     Si ni un solo día del informe cae dentro de la ventana, todas las filas se
     recortan a cero y la tabla de términos se queda vacía mientras los KPI
     siguen enseñando euros extrapolados: dos pantallas contándose cosas
     distintas, y la peor de las dos es la vacía, porque un término que quemó
     dinero en junio sigue mereciendo que lo mires. En ese caso la tabla enseña
     las cifras COMPLETAS del informe y lo dice con todas las letras, en el
     veredicto y en cada fila. */
  const fueraDePeriodo = diasMedidos===0 && spendObs===0 && spendBruto>spendSinFecha;
  if(fueraDePeriodo){
    Object.keys(grupos).forEach(k=>{
      const g = grupos[k];
      g.spend=g.spendTot; g.sales=g.salesTot; g.orders=g.ordersTot;
      g.clicks=g.clicksTot; g.impr=g.imprTot; g.fueraDePeriodo=true;
    });
  }
  const terms = Object.keys(grupos).map(k=>grupos[k]).filter(t=>t.spend>0 || t.clicks>0 || t.impr>0);
  let waste=0, wasteTerms=0;
  terms.forEach(t=>{ if(t.spend>0 && t.orders<0.5){ waste+=t.spend; wasteTerms++; } });
  terms.sort((a,b)=> (a.orders<0.5?0:1)-(b.orders<0.5?0:1) || b.spend-a.spend);

  return {
    spend, spendBruto, spendObservado:spendObs, spendExtrapolado:spendExtra, spendSinFecha,
    sales, salesBruto, clicks, impr, orders, clicksInforme, imprInforme,
    /* `factor` conserva su significado para el panel: cuánto del gasto
       declarado por el informe acaba imputado a este periodo. */
    adDays, factor: spendBruto>0 ? spend/spendBruto : 1,
    spanUnknown: spend>0 && !(d0&&d1),
    desde:d0, hasta:d1,
    solape: diasMedidos,
    solapePct: V.dias>0 ? Math.min(100, diasMedidos/V.dias*100) : 0,
    diasMedidos, diasExtrapolados, diasSinDato, ventana:V, fueraDePeriodo,
    filas: filas.length, filasAgregadas, filasSinFecha, maxDiasFila: maxDias,
    filasOtraDivisa, gastoOtraDivisa, otrasDivisas: Object.keys(otrasDivisas),
    ficheros: nFicheros, filasSolape, gastoSolape, ventasSolape,
    ritmoDiario: ritmoGasto, diasTramo, tramoIni, tramoFin, campanasFuera,
    diasSolape: Object.keys(diasSolape).length,
    gastoAgregado, gastoProrrateado,
    prorrateoPct: spend>0 ? Math.min(100, (gastoProrrateado+spendExtra)/spend*100) : 0,
    waste, wasteTerms, terms,
    acos: sales>0 ? spend/sales*100 : 0
  };
}

/* ── Casar un término con un SKU ──────────────────────────────────────────────
   El informe de términos de búsqueda no trae SKU ni ASIN: el real trae campaña,
   grupo de anuncios, país, tipo de coincidencia y el término. Lo único que
   permite llegar al producto es cómo están nombradas las campañas, y eso es una
   convención del vendedor, no un dato de Amazon.

   Por eso el casamiento tiene dos niveles y se exige que sea INEQUÍVOCO:
     · «sku»    · el código exacto aparece en la campaña o en el grupo.
     · «nombre» · una palabra distintiva del nombre del producto aparece, y solo
                  la de UN producto. Dos productos que casen = ambiguo = nada.
   Cualquier otra cosa es «sin casar», se dice en pantalla, y ni el ACOS de
   equilibrio ni la puja de equilibrio se calculan. Un ACOS de equilibrio sobre
   el margen del SKU equivocado hace bajar una puja rentable: es exactamente el
   número creíble y falso que este proyecto prohíbe. */
function pubIndiceSku(){
  const codigos = [], palabras = {};
  const genericas = {de:1, del:1, la:1, el:1, los:1, las:1, para:1, con:1, sin:1, kit:1,
                     set:1, pack:1, sp:1, exacta:1, exact:1, auto:1, automatico:1, broad:1,
                     phrase:1, amplia:1, generico:1, generica:1, producto:1, pro:1, plus:1};
  DB.products.forEach(p=>{
    const sku = String(p.sku||'').trim();
    if(sku) codigos.push({sku, clave:fold(sku).replace(/[^a-z0-9]/g,'')});
    String(p.name||'').split(/[\s,·\-–/]+/).forEach(w=>{
      const t = fold(w).replace(/[^a-z0-9]/g,'');
      if(t.length<4 || genericas[t]) return;
      if(!palabras[t]) palabras[t] = {};
      palabras[t][sku] = 1;
    });
  });
  return {codigos, palabras};
}
function pubCasar(t, idx){
  const texto = fold((t.campaign||'')+' '+(t.adgroup||'')).replace(/[^a-z0-9]/g,'');
  for(const c of idx.codigos){
    if(c.clave && texto.indexOf(c.clave)>=0) return {sku:c.sku, origen:'sku'};
  }
  const trozos = fold((t.campaign||'')+' '+(t.adgroup||'')).split(/[^a-z0-9]+/).filter(Boolean);
  const candidatos = {};
  trozos.forEach(w=>{
    const m = idx.palabras[w];
    if(!m) return;
    const skus = Object.keys(m);
    if(skus.length!==1) return;          // palabra compartida por varios productos: no dice nada
    candidatos[skus[0]] = (candidatos[skus[0]]||0)+1;
  });
  const ks = Object.keys(candidatos);
  if(ks.length===1) return {sku:ks[0], origen:'nombre'};
  if(ks.length>1)  return {sku:null, origen:'ambiguo', entre:ks};
  return {sku:null, origen:null};
}

/* ── Margen de contribución por SKU, ANTES de publicidad ──────────────────────
   Sale de `skuStats()`, que es del carril 5 y aquí solo se LEE. No se rehace la
   cuenta: `skuStats()` ya resta el IVA de cada pedido, las tarifas y el coste
   por lotes, y le quita además la publicidad repartida a prorrata del ingreso.
   Para el ACOS de equilibrio hace falta el margen SIN publicidad, así que se
   le devuelve justo esa parte —la misma que `skuStats()` restó— y nada más.

   El ACOS de equilibrio es ese margen sobre las ventas CON IVA, porque el ACOS
   de Amazon se calcula sobre las ventas con IVA. Mezclar las dos bases da un
   umbral optimista de unos cuatro puntos. */
function pubMargenes(){
  const P = pnl(), filas = skuStats();
  const ppcRate = P.grossInc>0 ? P.ppc/P.grossInc : 0;
  const m = {};
  filas.forEach(r=>{
    const contrib = r.profit + r.revenue*ppcRate;   // margen antes de publicidad
    m[String(r.sku)] = {
      sku:r.sku, name:r.name, units:r.units, revenue:r.revenue,
      contrib, hasCost:r.hasCost,
      margenPct: r.revenue>0 ? contrib/r.revenue*100 : null
    };
  });
  return m;
}

/* ── La tabla de términos, con todo lo que se puede afirmar y nada más ─────── */
function pubTerminos(){
  const A = pubAdStats(), idx = pubIndiceSku(), M = pubMargenes(), P = pnl();
  const hoy = startOfDay(today());
  const porSku = {};
  const lista = A.terms.map(t=>{
    const c = pubCasar(t, idx);
    const sku = c.sku, margen = sku ? M[sku] : null;
    const acos = t.sales>0 ? t.spend/t.sales*100 : null;
    const cvr  = t.clicks>0 ? t.orders/t.clicks : null;
    const aov  = t.orders>0 ? t.sales/t.orders : null;
    const cpc  = t.clicks>0 ? t.spend/t.clicks : null;
    /* ACOS de equilibrio: el porcentaje de las ventas que puedes gastar en
       publicidad antes de que ese término deje de aportar nada. */
    const acosEq = (margen && margen.margenPct!=null && margen.revenue>0) ? margen.margenPct : null;
    /* Puja de equilibrio = ventas por clic × margen. Con la conversión
       OBSERVADA de este término, no con una de manual. Y solo si hay clics
       suficientes: con tres clics, la conversión observada es ruido, y una puja
       calculada sobre ruido es un número creíble y falso. */
    const suficiente = t.clicks >= PUB_MIN_CLICS && t.orders>0;
    const pujaEq = (acosEq!=null && suficiente) ? (t.sales/t.clicks)*(acosEq/100) : null;
    /* ¿Los datos de este término siguen moviéndose? Las conversiones se
       reatribuyen a 1, 7 y 28 días y los clics inválidos se depuran durante
       72 h: sobre los últimos tres días no se decide nada que baje una puja. */
    const enMovimiento = !!(t.hasta && daysBetween(t.hasta, hoy) < PUB_DIAS_RUIDO);
    /* Umbral de desperdicio: lo que aporta UN pedido de ese producto. Sin SKU
       casado se cae al ticket medio de la cuenta, que es lo que ya hacía la
       pantalla, y se dice de dónde sale. */
    const umbral = (margen && margen.units>0 && margen.contrib>0)
      ? margen.contrib/margen.units
      : (P.avgPrice || 0);

    let accion, motivo;
    if(t.orders<0.5 && t.spend>0){
      if(t.clicks < PUB_MIN_CLICS){
        accion='esperar'; motivo='solo '+num(t.clicks,1)+' clic'+(t.clicks===1?'':'s')+': todavía no ha demostrado nada';
      } else if(umbral>0 && t.spend < umbral){
        accion='vigilar'; motivo='ha gastado menos de lo que aporta un pedido ('+fmt(umbral)+')';
      } else if(enMovimiento){
        accion='esperar'; motivo='el dato es de los últimos '+PUB_DIAS_RUIDO+' días y todavía se mueve';
      } else {
        accion='negativizar'; motivo=num(t.clicks,0)+' clics y ni un pedido, '+fmt(t.spend)+' gastados';
      }
    } else if(acos==null){
      accion='mantener'; motivo='sin gasto ni ventas en el periodo';
    } else if(acosEq==null){
      accion='sin veredicto';
      motivo = c.origen==='ambiguo'
        ? 'la campaña casa con varios SKU ('+(c.entre||[]).join(', ')+'): no sé cuál es su margen'
        : 'no sé qué SKU anuncia esta campaña: sin margen no hay ACOS de equilibrio';
    } else if(acos > acosEq){
      accion = enMovimiento ? 'esperar' : 'bajar puja';
      motivo = enMovimiento
        ? 'ACOS '+num(acos,0)+'% sobre el equilibrio ('+num(acosEq,0)+'%), pero el dato aún se mueve'
        : 'ACOS '+num(acos,0)+'% por encima del equilibrio ('+num(acosEq,0)+'%)';
    } else if(acos < acosEq*0.7){
      accion='subir puja'; motivo='ACOS '+num(acos,0)+'% muy por debajo del equilibrio ('+num(acosEq,0)+'%)';
    } else {
      accion='mantener'; motivo='ACOS '+num(acos,0)+'% cerca del equilibrio ('+num(acosEq,0)+'%)';
    }

    if(sku){
      if(!porSku[sku]) porSku[sku] = {sku, spend:0, sales:0, orders:0, clicks:0, terms:0};
      porSku[sku].spend+=t.spend; porSku[sku].sales+=t.sales;
      porSku[sku].orders+=t.orders; porSku[sku].clicks+=t.clicks; porSku[sku].terms++;
    }
    return Object.assign({}, t, {sku, origen:c.origen, entre:c.entre||null, acos, acosEq, pujaEq,
      cvr, aov, cpc, umbral, accion, motivo, enMovimiento, suficiente});
  });

  /* Orgánico y pagado, por SKU. Las ventas atribuidas a publicidad salen del
     informe; las totales, del informe de pedidos vía `skuStats()`. Lo que no
     es pagado es orgánico, y si lo pagado supera a lo total es que la ventana
     de atribución está trayendo ventas de fuera del periodo: se dice, no se
     recorta a cero en silencio. */
  const skus = Object.keys(porSku).map(k=>{
    const x = porSku[k], m = M[k] || {revenue:0, units:0, margenPct:null};
    const total = m.revenue || 0;
    const organico = Math.max(0, total - x.sales);
    return Object.assign(x, {
      name: m.name || k, ventasTotales: total, ventasOrganicas: organico,
      acos: x.sales>0 ? x.spend/x.sales*100 : null,
      tacos: total>0 ? x.spend/total*100 : null,
      acosEq: m.margenPct,
      organicoPct: total>0 ? organico/total*100 : null,
      descuadre: x.sales > total*1.02 && total>0
    });
  }).sort((a,b)=>b.spend-a.spend);

  /* EL HALO ORGÁNICO. Un término puede estar por encima de su ACOS de
     equilibrio y aun así sostener el posicionamiento de un SKU que vende sobre
     todo en orgánico. Bajar esa puja no es gratis, y el hub no puede medir el
     halo: lo que sí puede es no callarlo. No cambia el veredicto —el ACOS sigue
     por encima del equilibrio— pero lo acompaña. */
  const organicoPorSku = {};
  skus.forEach(s=>{ organicoPorSku[s.sku] = s.organicoPct; });
  lista.forEach(t=>{
    const org = t.sku!=null ? organicoPorSku[t.sku] : null;
    t.organicoPct = org==null ? null : org;
    if(t.accion==='bajar puja' && org!=null && org>=50){
      t.motivo += ' · ojo: el '+num(org,0)+' % de las ventas de ese SKU son orgánicas y la puja también sostiene ese sitio';
    }
  });

  const sinCasar = lista.filter(t=>!t.sku);
  return {A, lista, skus,
    sinCasar: sinCasar.length,
    gastoSinCasar: sinCasar.reduce((a,t)=>a+t.spend,0),
    casadosPorNombre: lista.filter(t=>t.origen==='nombre').length,
    ambiguos: lista.filter(t=>t.origen==='ambiguo').length};
}

/* ── Registro de cambios de puja · la regla de las 72 horas ───────────────────
   Amazon necesita entre 48 y 72 horas para estabilizar el rendimiento de una
   puja nueva. Medir antes es medir ruido, y encadenar cambios cada día es la
   forma más rápida de convencerse de algo falso. El hub no lo impide —decide
   una persona— pero lo anota y lo avisa. */
registrarClaveDB('pujas', []);

function pubClavePuja(termino, campana){ return fold(String(termino||''))+'|'+fold(String(campana||'')); }
/* Horas desde el último cambio anotado de esa misma puja. `null` si no hay. */
function pubHorasDesdeUltimo(termino, campana, ts){
  const k = pubClavePuja(termino, campana);
  const t = (ts ? new Date(ts) : new Date()).getTime();
  let mejor = null;
  (DB.pujas||[]).forEach(p=>{
    if(pubClavePuja(p.termino, p.campana)!==k) return;
    const d = new Date(p.ts).getTime();
    if(isNaN(d) || d>t) return;
    const h = (t-d)/3600000;
    if(mejor===null || h<mejor) mejor = h;
  });
  return mejor;
}
function pubAnotarPuja(datos){
  datos = datos || {};
  const termino = String(datos.termino||'').trim();
  const campana = String(datos.campana||'').trim();
  if(!termino){ toast('Anota al menos el término o la palabra clave cuya puja has cambiado.'); return null; }
  const ts = datos.ts || new Date().toISOString();
  const horas = pubHorasDesdeUltimo(termino, campana, ts);
  const prematuro = horas!==null && horas < PUB_HORAS_REGLA;
  const reg = {
    id: uid(), ts, termino, campana,
    sku: String(datos.sku||'').trim(),
    antes: pubNum(datos.antes), despues: pubNum(datos.despues),
    nota: String(datos.nota||'').trim(),
    prematuro, horasDesdeAnterior: horas===null ? null : Math.round(horas*10)/10
  };
  DB.pujas.push(reg);
  saveDB();
  if(prematuro){
    toast('Anotado, pero el cambio anterior de «'+termino+'» fue hace '+num(horas,0)+' h. '+
          'Amazon necesita '+PUB_HORAS_REGLA+' h para estabilizar: lo que midas antes es ruido.');
  } else {
    toast('Cambio de puja anotado.');
  }
  try{ renderPub(); }catch(e){}
  return reg;
}
function pubBorrarPuja(id){
  DB.pujas = (DB.pujas||[]).filter(p=>p.id!==id);
  saveDB();
  try{ renderPub(); }catch(e){}
}
function pubAnotarDesdeFormulario(){
  const v = id => { const e=document.getElementById(id); return e ? e.value : ''; };
  const reg = pubAnotarPuja({termino:v('pubPujaTermino'), campana:v('pubPujaCampana'),
    sku:v('pubPujaSku'), antes:v('pubPujaAntes'), despues:v('pubPujaDespues'), nota:v('pubPujaNota')});
  if(reg){
    ['pubPujaTermino','pubPujaCampana','pubPujaSku','pubPujaAntes','pubPujaDespues','pubPujaNota']
      .forEach(i=>{ const e=document.getElementById(i); if(e) e.value=''; });
  }
}
function pubPrefill(termino, campana, sku){
  const set = (i,v)=>{ const e=document.getElementById(i); if(e) e.value=v||''; };
  set('pubPujaTermino', termino); set('pubPujaCampana', campana); set('pubPujaSku', sku);
  const e = document.getElementById('pubPujaTermino');
  if(e && e.scrollIntoView) e.scrollIntoView({behavior:'smooth', block:'center'});
}
/* Aviso vivo mientras se escribe: el usuario ve la regla ANTES de anotar. */
function pubAvisoRegla(){
  const e = document.getElementById('pubPujaAviso');
  if(!e) return;
  const t = (document.getElementById('pubPujaTermino')||{}).value || '';
  const c = (document.getElementById('pubPujaCampana')||{}).value || '';
  const h = t ? pubHorasDesdeUltimo(t, c) : null;
  if(h===null){ e.innerHTML=''; return; }
  e.innerHTML = h < PUB_HORAS_REGLA
    ? '<span class="pill stop">regla de las 72 h</span> el cambio anterior fue hace '+num(h,0)+
      ' h. Faltan '+num(PUB_HORAS_REGLA-h,0)+' h para que lo que midas signifique algo.'
    : '<span class="pill go">han pasado '+num(h,0)+' h</span> el rendimiento ya está estabilizado.';
}

/* ── Pantalla ─────────────────────────────────────────────────────────────── */
registrarEstilo(
  '#pubExtra .pub-note{font-size:12.5px;line-height:1.5}'+
  '#pubExtra .pub-form{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:10px}'+
  '#pubExtra .pub-form label{font-size:11px;color:#6b7a7f;display:block;margin-bottom:3px}'+
  '#pubExtra .pub-form input{min-width:110px}'+
  '#pubExtra .pub-form .ancho{min-width:210px;flex:1}'+
  '#pubPujaAviso{font-size:12.5px;margin:6px 0 2px}'+
  '.pub-ori{font-size:10.5px;color:#6b7a7f;display:block}');

function pubPanelExtra(){
  let e = document.getElementById('pubExtra');
  if(e) return e;
  const vista = document.getElementById('view-publicidad');
  if(!vista) return null;
  e = document.createElement('div');
  e.id = 'pubExtra';
  e.innerHTML =
    '<div class="panel"><div class="panel-head"><div>'+
      '<h2>ACOS de equilibrio por término</h2>'+
      '<p class="desc" style="margin:0">Hasta qué ACOS aporta cada término, con el margen real del SKU que anuncia. '+
      'Donde no se puede saber qué SKU anuncia una campaña, esta tabla lo dice y no calcula nada: un umbral sacado del '+
      'margen del producto equivocado hace bajar pujas que estaban ganando dinero.</p></div></div>'+
      '<div class="tbl-wrap"><table class="grid" id="pubEqTable"></table></div>'+
      '<div id="pubEqNota" class="assumptions pub-note" style="margin-top:14px"></div></div>'+
    '<div class="panel"><div class="panel-head"><div>'+
      '<h2>Orgánico y pagado por SKU</h2>'+
      '<p class="desc" style="margin:0">El ACOS mide la eficiencia de lo pagado; el TACOS, cuánto del negocio de ese SKU '+
      'sostiene la publicidad. Son dos preguntas distintas y aquí van separadas.</p></div></div>'+
      '<div class="tbl-wrap"><table class="grid" id="pubSkuTable"></table></div></div>'+
    '<div class="panel"><div class="panel-head"><div>'+
      '<h2>Registro de cambios de puja</h2>'+
      '<p class="desc" style="margin:0">Anota aquí cada cambio que hagas en Seller Central. Este hub no toca pujas ni '+
      'escribe nada en Amazon: lleva la cuenta de cuándo cambiaste qué, para que la regla de las 72 horas se pueda '+
      'comprobar en vez de recordarse.</p></div></div>'+
      '<div class="pub-form">'+
        '<div class="ancho"><label for="pubPujaTermino">Término o palabra clave</label>'+
          '<input id="pubPujaTermino" type="text" oninput="pubAvisoRegla()"></div>'+
        '<div class="ancho"><label for="pubPujaCampana">Campaña</label>'+
          '<input id="pubPujaCampana" type="text" oninput="pubAvisoRegla()"></div>'+
        '<div><label for="pubPujaSku">SKU</label><input id="pubPujaSku" type="text"></div>'+
        '<div><label for="pubPujaAntes">Puja anterior</label><input id="pubPujaAntes" type="text" inputmode="decimal"></div>'+
        '<div><label for="pubPujaDespues">Puja nueva</label><input id="pubPujaDespues" type="text" inputmode="decimal"></div>'+
        '<div class="ancho"><label for="pubPujaNota">Nota</label><input id="pubPujaNota" type="text"></div>'+
        '<div><button class="btn sm primary" id="pubPujaBtn" onclick="pubAnotarDesdeFormulario()">Anotar cambio</button></div>'+
      '</div>'+
      '<div id="pubPujaAviso"></div>'+
      '<div class="tbl-wrap"><table class="grid" id="pubPujasTable"></table></div>'+
      '<div class="note-box info" style="margin-bottom:0"><strong>Este módulo no automatiza nada.</strong> '+
      'No cambia pujas, no pausa campañas y no tiene forma de escribir en Amazon. Recomienda con números que se '+
      'pueden auditar; el cambio lo hace una persona, y lo anota aquí.</div></div>';
  vista.appendChild(e);
  return e;
}

function pubRenderPublicidad(){
  const T = pubTerminos(), A = T.A, P = pnl();
  const V = A.ventana;
  const kp = document.getElementById('adKpis');
  if(kp) kp.innerHTML =
    kpi('Inversión', fmt(A.spend,0),
        A.terms.length+' términos · '+(A.prorrateoPct>0.5 ? num(A.prorrateoPct,0)+'% prorrateado' : 'sin prorrateo'),
        'accent')+
    kpi('Ventas atribuidas', fmt(A.sales,0),'ACOS '+num(A.acos,1)+'%', A.acos>0&&A.acos<35?'pos':'warn')+
    kpi('TACOS', num(P.tacos,1)+'%','objetivo <'+TARGET.tacos+'%', P.tacos<=TARGET.tacos?'pos':'warn')+
    kpi('Gasto sin conversión', fmt(A.waste,0),
        A.wasteTerms+' términos a revisar'+(A.fueraDePeriodo?' · del informe completo':''), A.waste>0?'neg':'pos')+
    /* Con el informe fuera del periodo, los clics del periodo son cero y
       enseñarlos al lado de una tabla llena de clics es contradecirse. Se
       enseñan los del informe, dicho. */
    kpi('Clics', num(A.fueraDePeriodo ? A.clicksInforme : A.clicks),
        A.fueraDePeriodo ? (A.clicksInforme? 'del informe completo · CPC '+fmt(A.spendBruto/A.clicksInforme) : 'del informe completo')
        : (A.clicks?'CPC '+fmt(A.spend/A.clicks):''), '')+
    kpi('Días medidos', A.spanUnknown ? '—' : num(A.diasMedidos)+'/'+num(V.dias),
        A.spanUnknown ? 'el informe no trae fechas'
          : A.diasSinDato ? num(A.diasExtrapolados)+' extrapolados · '+num(A.diasSinDato)+' sin dato'
          : A.diasExtrapolados ? num(A.diasExtrapolados)+' días extrapolados'
          : 'el informe cubre el periodo',
        (A.spanUnknown || A.diasSinDato || A.diasExtrapolados) ? 'warn' : 'pos');

  /* Tabla de términos · la que ya estaba, ahora con el gasto del periodo. */
  tbl('stTable','<tr><th>Término de búsqueda</th><th>Campaña</th><th class="num">Impr.</th><th class="num">Clics</th>'+
    '<th class="num">Gasto</th><th class="num">Ventas</th><th class="num">Pedidos</th><th class="num">ACOS</th><th>Acción</th></tr>'+
    (A.terms.length? T.lista.slice(0,60).map(t=>{
      const clase = t.accion==='negativizar' ? 'stop' : (t.accion==='subir puja' ? 'go' : '');
      return '<tr><td class="name"><strong>'+esc(t.term)+'</strong>'+
          (t.fueraDePeriodo? '<span class="pub-ori">cifras del informe completo · fuera del periodo</span>'
           : t.agregadas? '<span class="pub-ori">prorrateado desde '+num(t.agregadas)+' fila'+(t.agregadas===1?'':'s')+' de varios días</span>':'')+'</td>'+
        '<td class="name mut" style="font-size:11.5px">'+esc(t.campaign)+'</td>'+
        '<td class="num mut">'+num(t.impr,0)+'</td><td class="num">'+num(t.clicks,0)+'</td>'+
        '<td class="num '+(t.accion==='negativizar'?'neg':'')+'" style="font-weight:600">'+fmt(t.spend)+'</td>'+
        '<td class="num">'+fmt(t.sales)+'</td><td class="num">'+num(t.orders,0)+'</td>'+
        '<td class="num '+(t.acos==null?'':t.acos<35?'pos':'warn')+'">'+(t.acos!=null?num(t.acos,0)+'%':'—')+'</td>'+
        '<td><span class="pill '+clase+'" title="'+esc(t.motivo)+'">'+esc(t.accion)+'</span></td></tr>';
    }).join('') : '<tr><td colspan="9" class="name mut">Importa el informe de términos de búsqueda desde la consola de publicidad.</td></tr>'));

  /* Veredicto · y, sobre todo, de qué está hecho el número de arriba. */
  let v;
  if(!A.terms.length){
    v='Sin informe de términos de búsqueda cargado. Es el fichero con mejor relación entre esfuerzo y dinero recuperado de todo el PPC: '+
      'la revisión semanal de términos suele recortar entre un 15% y un 30% del desperdicio.';
  } else {
    const negativizar = T.lista.filter(t=>t.accion==='negativizar');
    const esperar = T.lista.filter(t=>t.accion==='esperar');
    v='<strong>'+fmt(A.spend,0)+' de inversión imputada a los últimos '+num(V.dias)+' días</strong> '+
      '(del '+iso(V.ini)+' al '+iso(V.fin)+'), de '+fmt(A.spendBruto,0)+' que declara el informe entero.<br>';
    v+='<span class="mut">Cómo se reparte: ';
    const trozos=[];
    if(A.spendObservado>0) trozos.push(fmt(A.spendObservado,0)+' de filas con fecha dentro del periodo');
    if(A.gastoProrrateado>0) trozos.push(fmt(A.gastoProrrateado,0)+' vienen de filas de varios días repartidas a partes iguales entre sus días — <strong>es un prorrateo, no una medición</strong>');
    if(A.spendExtrapolado>0) trozos.push(fmt(A.spendExtrapolado,0)+' de '+num(A.diasExtrapolados)+' días del periodo que el informe no cubre, '+
      (A.ficheros>1 && A.tramoIni ? 'al ritmo del último tramo con informe (del '+iso(A.tramoIni)+' al '+iso(A.tramoFin)+', '+fmt(A.ritmoDiario,2)+' al día)'
                                  : 'al ritmo diario medio')+' — <strong>extrapolado</strong>');
    if(A.spendSinFecha>0) trozos.push(fmt(A.spendSinFecha,0)+' de '+num(A.filasSinFecha)+' filas sin fecha, cargadas enteras porque no hay con qué repartirlas');
    v+=trozos.join(' · ')+'.</span><br><br>';
    if(A.filasAgregadas>0){
      v+='<div class="note-box warn" style="margin:0 0 12px"><strong>'+num(A.filasAgregadas)+' de '+num(A.filas)+
         ' filas del informe no son de un día</strong>, sino de tramos de hasta '+num(A.maxDiasFila)+' días. '+
         'Amazon las entrega agregadas y no dice cómo se repartió el gasto dentro del tramo, así que este hub lo reparte '+
         'a partes iguales. Es la mejor suposición disponible, y sigue siendo una suposición: las filas afectadas van '+
         'marcadas en la tabla.</div>';
    }
    if(A.gastoSolape>0.005){
      v+='<div class="note-box warn" style="margin:0 0 12px"><strong>Tienes '+num(A.ficheros)+' informes cargados y se pisan '+
         num(A.diasSolape)+' día'+(A.diasSolape===1?'':'s')+'.</strong> Para cada campaña y cada día cuenta un solo informe '+
         '—el que llega más lejos—, así que '+fmt(A.gastoSolape,2)+' de gasto de los otros informes se ha quedado fuera para no '+
         'contarlo dos veces. Si dos informes dicen cifras distintas para el mismo día, no se promedian: manda uno. '+
         'Los ficheros y sus fechas están en <em>Datos</em>.</div>';
    }
    if(A.campanasFuera && A.campanasFuera.length){
      v+='<div class="note-box warn" style="margin:0 0 12px"><strong>'+num(A.campanasFuera.length)+' campaña'+
         (A.campanasFuera.length===1?' que gastaba':'s que gastaban')+' justo antes del informe más reciente no '+
         (A.campanasFuera.length===1?'sale':'salen')+' en él</strong> ('+esc(A.campanasFuera.slice(0,5).join(', '))+
         (A.campanasFuera.length>5?'…':'')+'). Esos días cuentan a cero para ella'+(A.campanasFuera.length===1?'':'s')+
         '. Si se pausó, es correcto; si el informe se pidió filtrado por campaña o por país, falta su gasto.</div>';
    }
    if(A.filasOtraDivisa>0){
      v+='<div class="note-box warn" style="margin:0 0 12px"><strong>'+num(A.filasOtraDivisa)+' fila'+
         (A.filasOtraDivisa===1?'':'s')+' del informe vienen en '+A.otrasDivisas.join(', ')+
         ', no en '+DIVISA_VENTAS+'.</strong> No se suman: un gasto en otra divisa metido en el mismo total sube el ACOS '+
         'de sus términos sin tocar sus ventas, y eso hace bajar pujas que estaban ganando dinero. Ese gasto no está en '+
         'ninguna cifra de esta pantalla; para verlo, descarga el informe de ese mercado por separado.</div>';
    }
    if(A.fueraDePeriodo){
      v+='<div class="note-box stop" style="margin:0 0 12px"><strong>El informe no toca ni un día del periodo que estás mirando.</strong> '+
         'Cubre del '+iso(A.desde)+' al '+iso(A.hasta)+', y la ventana abierta es del '+iso(V.ini)+' al '+iso(V.fin)+'. '+
         'La tabla de términos enseña las cifras COMPLETAS del informe —no las del periodo, que serían todas cero— '+
         'porque un término que quemó dinero entonces sigue mereciendo una decisión. La inversión de arriba, en cambio, '+
         'está extrapolada al ritmo diario del informe: no es una medición de estos días.</div>';
    }
    if(A.diasSinDato>0){
      v+='<div class="note-box warn" style="margin:0 0 12px"><strong>El informe no llega a '+num(A.diasSinDato)+
         ' de los '+num(V.dias)+' días que estás mirando.</strong> Cubre '+num(A.adDays)+' días y se ha estirado '+
         num(A.diasExtrapolados)+' días más al ritmo diario medio, que es todo lo que un informe puede sostener. '+
         'Los '+num(A.diasSinDato)+' días restantes van con CERO euros de publicidad: no es que no gastaras, es que '+
         'no hay informe que lo diga, y el beneficio de ese tramo sale optimista. Descarga el informe del periodo '+
         'completo si vas a decidir sobre él.</div>';
    }
    if(A.spanUnknown){
      v+='<div class="note-box stop" style="margin:0 0 12px"><strong>El informe no trae fechas.</strong> '+
         'Sin ellas no se puede saber qué periodo cubre ni repartirlo: el gasto entra entero, mires siete días o un año. '+
         'Vuelve a descargarlo con las columnas «Fecha de inicio» y «Fecha de finalización».</div>';
    }
    v+='<strong>'+fmt(A.waste,0)+' gastados en '+A.wasteTerms+' términos que no han vendido nada.</strong> ';
    v+=negativizar.length
      ? 'De ellos, '+negativizar.length+' cumplen las tres condiciones para negativizar ya: más de '+PUB_MIN_CLICS+
        ' clics, ni un pedido, y más gasto del que aporta un pedido de ese producto. '
      : 'Ninguno cumple todavía las condiciones para negativizar: o tienen pocos clics, o han gastado menos de lo que aporta un pedido. ';
    if(esperar.length) v+='Otros '+esperar.length+' están a la espera: su dato es de los últimos '+PUB_DIAS_RUIDO+' días y todavía se mueve. ';
    v+='<br><br><span class="mut">Las conversiones se reatribuyen a 1, 7 y 28 días y los clics inválidos se depuran durante 72 h, '+
      'así que un dato puede seguir moviéndose seis semanas después del clic. Por eso ningún término con datos de los últimos '+
      PUB_DIAS_RUIDO+' días recibe aquí una recomendación de bajar la puja.</span>';
  }
  const sv = document.getElementById('stVerdict');
  if(sv) sv.innerHTML=v;

  /* ── Paneles propios del carril ─────────────────────────────────────────── */
  if(!pubPanelExtra()) return;

  tbl('pubEqTable','<tr><th>Término</th><th>SKU</th><th class="num">Gasto</th><th class="num">ACOS</th>'+
    '<th class="num">ACOS equilibrio</th><th class="num">Conversión</th><th class="num">Puja equilibrio</th><th></th></tr>'+
    (T.lista.length ? T.lista.slice(0,60).map(t=>{
      const ori = t.origen==='sku' ? 'código en la campaña'
                : t.origen==='nombre' ? 'por el nombre de la campaña'
                : t.origen==='ambiguo' ? 'varios SKU posibles' : 'sin casar';
      const malo = t.acos!=null && t.acosEq!=null && t.acos>t.acosEq;
      return '<tr><td class="name"><strong>'+esc(t.term)+'</strong>'+
        '<span class="pub-ori">'+esc(t.campaign)+'</span></td>'+
        '<td class="name">'+(t.sku? '<strong>'+esc(t.sku)+'</strong>' : '<span class="pill stop">sin casar</span>')+
          '<span class="pub-ori">'+ori+'</span></td>'+
        '<td class="num">'+fmt(t.spend)+'</td>'+
        '<td class="num '+(t.acos==null?'mut':malo?'warn':'pos')+'">'+(t.acos!=null?num(t.acos,0)+'%':'—')+'</td>'+
        '<td class="num">'+(t.acosEq!=null?num(t.acosEq,0)+'%':'<span class="mut">no lo sé</span>')+'</td>'+
        '<td class="num '+(t.suficiente?'':'mut')+'">'+(t.cvr!=null?num(t.cvr*100,1)+'%':'—')+
          (t.clicks>0 && !t.suficiente? '<span class="pub-ori">muestra corta</span>':'')+'</td>'+
        '<td class="num">'+(t.pujaEq!=null? fmt(t.pujaEq)+(t.cpc!=null?'<span class="pub-ori">CPC actual '+fmt(t.cpc)+'</span>':'')
                                          : '<span class="mut">—</span>')+'</td>'+
        '<td><button class="btn sm" onclick="pubPrefill('+JSON.stringify(t.term).replace(/"/g,'&quot;')+','+
            JSON.stringify(t.campaign).replace(/"/g,'&quot;')+','+
            JSON.stringify(t.sku||'').replace(/"/g,'&quot;')+')">Anotar puja</button></td></tr>';
    }).join('') : '<tr><td colspan="8" class="name mut">Sin términos que evaluar todavía.</td></tr>'));

  const eqn = document.getElementById('pubEqNota');
  if(eqn){
    let n='';
    if(!T.lista.length){
      n='El ACOS de equilibrio sale del margen real de cada SKU: ingreso sin IVA, menos tarifas, menos coste de producto. '+
        'Hace falta el informe de términos de búsqueda y el de pedidos.';
    } else {
      n='<strong>'+T.sinCasar+' de '+T.lista.length+' términos no se han podido casar con un SKU'+
        (T.gastoSinCasar>0? ' ('+fmt(T.gastoSinCasar,0)+' de gasto)':'')+'.</strong> '+
        'El informe de términos de búsqueda no trae SKU: el único hilo es cómo están nombradas las campañas. '+
        'Donde no hay hilo, no hay ACOS de equilibrio, y esta tabla escribe «no lo sé» en vez de usar el margen medio '+
        'de la cuenta. Un umbral sacado del producto equivocado es la forma más rápida de bajar una puja rentable.';
      if(T.casadosPorNombre) n+='<br><br><span class="mut">'+T.casadosPorNombre+' se han casado por el NOMBRE de la campaña, no por el código del SKU. '+
        'Si renombras las campañas incluyendo el SKU, este casamiento deja de depender de una convención.</span>';
      if(T.ambiguos) n+='<br><br><span class="mut">'+T.ambiguos+' casan con varios SKU a la vez y se han dejado sin veredicto a propósito.</span>';
      n+='<br><br><span class="mut">La puja de equilibrio es ventas por clic × margen, con la conversión OBSERVADA de cada término, '+
        'y solo se calcula con '+PUB_MIN_CLICS+' clics o más. Por debajo, la conversión observada es ruido.</span>';
    }
    eqn.innerHTML=n;
  }

  tbl('pubSkuTable','<tr><th>SKU</th><th class="num">Gasto</th><th class="num">Ventas pagadas</th>'+
    '<th class="num">Ventas totales</th><th class="num">Orgánico</th><th class="num">ACOS</th>'+
    '<th class="num">TACOS</th><th class="num">ACOS equilibrio</th></tr>'+
    (T.skus.length ? T.skus.map(s=>
      '<tr><td class="name"><strong>'+esc(s.sku)+'</strong><span class="pub-ori">'+esc(s.name)+' · '+s.terms+' términos</span></td>'+
      '<td class="num">'+fmt(s.spend)+'</td><td class="num">'+fmt(s.sales)+'</td>'+
      '<td class="num">'+fmt(s.ventasTotales)+'</td>'+
      '<td class="num '+(s.organicoPct!=null && s.organicoPct>50?'pos':'')+'">'+
        (s.organicoPct!=null? fmt(s.ventasOrganicas)+' <span class="mut">('+num(s.organicoPct,0)+'%)</span>':'—')+
        (s.descuadre? '<span class="pub-ori">las ventas atribuidas superan a las del periodo: la atribución trae ventas de fuera</span>':'')+'</td>'+
      '<td class="num '+(s.acos!=null && s.acosEq!=null ? (s.acos>s.acosEq?'warn':'pos') : 'mut')+'">'+(s.acos!=null?num(s.acos,0)+'%':'—')+'</td>'+
      '<td class="num">'+(s.tacos!=null?num(s.tacos,1)+'%':'—')+'</td>'+
      '<td class="num">'+(s.acosEq!=null?num(s.acosEq,0)+'%':'<span class="mut">no lo sé</span>')+'</td></tr>'
    ).join('') : '<tr><td colspan="8" class="name mut">Ningún término casado con un SKU todavía.</td></tr>'));

  const pujas = (DB.pujas||[]).slice().sort((a,b)=> String(b.ts).localeCompare(String(a.ts)));
  tbl('pubPujasTable','<tr><th>Cuándo</th><th>Término</th><th>Campaña</th><th class="num">Antes</th>'+
    '<th class="num">Después</th><th>Desde el anterior</th><th>Nota</th><th></th></tr>'+
    (pujas.length ? pujas.map(p=>{
      const d = new Date(p.ts);
      const cuando = isNaN(d.getTime()) ? esc(p.ts) : iso(d)+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
      return '<tr><td class="name mut" style="font-size:11.5px">'+cuando+'</td>'+
        '<td class="name"><strong>'+esc(p.termino)+'</strong>'+(p.sku?'<span class="pub-ori">'+esc(p.sku)+'</span>':'')+'</td>'+
        '<td class="name mut" style="font-size:11.5px">'+esc(p.campana||'')+'</td>'+
        '<td class="num">'+(p.antes?fmt(p.antes):'—')+'</td><td class="num">'+(p.despues?fmt(p.despues):'—')+'</td>'+
        '<td>'+(p.horasDesdeAnterior===null||p.horasDesdeAnterior===undefined ? '<span class="mut">primer cambio anotado</span>'
              : p.prematuro ? '<span class="pill stop">'+num(p.horasDesdeAnterior,0)+' h · antes de las '+PUB_HORAS_REGLA+' h</span>'
              : '<span class="pill go">'+num(p.horasDesdeAnterior,0)+' h</span>')+'</td>'+
        '<td class="name mut" style="font-size:11.5px">'+esc(p.nota||'')+'</td>'+
        '<td><button class="btn sm" onclick="pubBorrarPuja('+JSON.stringify(p.id).replace(/"/g,'&quot;')+')">Borrar</button></td></tr>';
    }).join('')
    : '<tr><td colspan="8" class="name mut">Todavía no has anotado ningún cambio de puja. '+
      'El registro es lo que permite comprobar la regla de las 72 horas en vez de recordarla.</td></tr>'));
  pubAvisoRegla();
}

/* ── Exportación ─────────────────────────────────────────────────────────────
   Lleva las columnas que explican de dónde sale cada número: días del periodo
   que cubre la fila, si viene prorrateada y por qué no hay veredicto cuando no
   lo hay. Una exportación que solo lleva el resultado es la forma de que un
   prorrateo acabe en una hoja de cálculo pareciendo una medición. */
function pubExportPublicidad(){
  const T = pubTerminos();
  descargarCSV('publicidad',
    ['Término de búsqueda','Campaña','SKU','Cómo se ha casado el SKU','Impresiones','Clics','Gasto en el periodo',
     'Ventas atribuidas','Pedidos','ACOS %','ACOS de equilibrio %','Conversión %','Puja de equilibrio',
     'CPC actual','Filas del informe','Filas de varios días (prorrateadas)','Gasto prorrateado','Acción','Motivo'],
    T.lista.map(t=>[t.term, t.campaign, t.sku||'',
      t.origen==='sku' ? 'código del SKU en la campaña'
        : t.origen==='nombre' ? 'nombre del producto en la campaña'
        : t.origen==='ambiguo' ? 'ambiguo: varios SKU' : 'sin casar',
      Math.round(t.impr), Math.round(t.clicks), r2(t.spend), r2(t.sales), Math.round(t.orders),
      t.acos!=null ? r2(t.acos) : '', t.acosEq!=null ? r2(t.acosEq) : '',
      t.cvr!=null ? r2(t.cvr*100) : '', t.pujaEq!=null ? r2(t.pujaEq) : '',
      t.cpc!=null ? r2(t.cpc) : '', t.filas, t.agregadas, r2(t.prorrateado), t.accion, t.motivo]));
}
registrarExportacion('pujas', 'Registro de cambios de puja', function(){
  descargarCSV('cambios-de-puja',
    ['Fecha y hora','Término','Campaña','SKU','Puja anterior','Puja nueva','Horas desde el anterior',
     'Antes de las 72 h','Nota'],
    (DB.pujas||[]).slice().sort((a,b)=>String(a.ts).localeCompare(String(b.ts)))
      .map(p=>[p.ts, p.termino, p.campana||'', p.sku||'', r2(p.antes), r2(p.despues),
               p.horasDesdeAnterior==null?'':p.horasDesdeAnterior, p.prematuro?'sí':'no', p.nota||'']));
});
