/* ═══════════════════════════════════════════════════════════════════════════
   CARRIL 1 · IMPORTADOR
   Lo que Amazon te da partido, roto o disfrazado, y cómo entra sin mentir

   TRES COSAS VIVEN AQUÍ, Y LAS TRES NACEN DEL MISMO PRINCIPIO: un informe que
   se importa «en verde» con las columnas cruzadas o con filas comidas es mucho
   peor que uno rechazado. Un error se ve; un número creíble y falso, no.

   1 · FUSIÓN DE VARIOS FICHEROS DEL MISMO INFORME.
       Seller Central parte un mismo informe en varios ficheros cuando lo pides
       por tramos de fecha. Antes, el segundo pisaba al primero y nadie decía
       nada: importabas tres trozos de pedidos y te quedabas con el último.
       Ahora cada fichero entra como una aportación con nombre y procedencia,
       las filas se fusionan, y la pantalla de Datos dice de cada uno cuántas
       trajo nuevas y cuántas ya estaban.

   2 · EL PREÁMBULO ANTES DE LA CABECERA.
       Algunos informes traen líneas de aviso antes de la cabecera de verdad.
       No se da por supuesto cuántas: se busca dónde empieza la tabla y SE
       DECLARA cuántas líneas se han saltado, con `registrarPreproceso`, para
       que la nota salga en Datos. Un fichero al que se le han quitado líneas
       por el camino sin decirlo es un número sin trazabilidad.

   3 · LO QUE NO SE IMPORTA SIN PREGUNTAR.
       Cuando la columna de un IMPORTE o de una CANTIDAD obligatoria se ha
       elegido solo por la forma de su contenido —y no por su nombre— la
       elección es posicional: entre varias columnas de dinero se coge la
       primera. Eso es exactamente lo que cruza columnas con las cabeceras en
       italiano, francés o alemán. Se para y se pide confirmación.

   Todo lo de aquí se engancha por `src/19-registro.js` o desde funciones que
   son de este carril. No se edita ningún fichero compartido.
   ═══════════════════════════════════════════════════════════════════════════ */

/* =========================================================================
   1 · IDENTIDAD DE UNA FILA  ·  el cimiento de todo lo demás

   La huella se calcula sobre la FILA YA PARSEADA, nunca sobre el texto crudo.
   Es deliberado y es la diferencia entre fusionar bien y fusionar mal: de los
   dos ficheros del informe de IVA uno viene con marca de orden de bytes (BOM)
   y el otro no, así que sus dos primeras líneas son distintas byte a byte
   aunque digan lo mismo. `normHdr` se come el BOM al normalizar la cabecera,
   de modo que las dos filas producen las mismas claves y la misma huella.
   Comparando texto crudo, la primera columna de uno de los dos ficheros no
   casaría nunca y todas sus filas entrarían por duplicado.

   Se excluyen las claves que empiezan por `_`: son los campos internos que
   `normalizeRows` añade encima (`_sku`, `_amount`…), copias de columnas que ya
   están contadas. Contarlas otra vez haría que dos ficheros con mapeos
   distintos de las mismas columnas parecieran filas distintas.
   ========================================================================= */
function impHash(s){
  /* Dos hashes distintos sobre la misma cadena, más su longitud. Uno solo de
     32 bits empieza a colisionar por el problema del cumpleaños mucho antes de
     lo que parece, y una colisión aquí significa comerse una fila de verdad. */
  let a = 5381, b = 52711;
  for(let i=0;i<s.length;i++){ const c = s.charCodeAt(i);
    a = (((a<<5)+a) ^ c) >>> 0;
    b = (((b<<7)-b) + c*31) >>> 0; }
  return a.toString(36)+'.'+b.toString(36)+'.'+s.length.toString(36);
}
const IMP_SEP_CAMPO = String.fromCharCode(1), IMP_SEP_FILA = String.fromCharCode(2);
function impHuellaFila(fila){
  const ks = [];
  for(const k in fila){
    if(!Object.prototype.hasOwnProperty.call(fila,k)) continue;
    if(k.charAt(0)==='_') continue;                 // campos internos y __fs
    ks.push(k);
  }
  ks.sort();
  let s = '';
  for(let i=0;i<ks.length;i++){
    const v = fila[ks[i]];
    if(v==null || v==='') continue;                 // una celda vacía y una ausente son lo mismo
    /* INTEGRACIÓN · un byte que no se pudo descodificar (U+FFFD) NO es
       información. El mismo informe descargado dos veces, una con la
       codificación rota, traía «Producto uno» y «Producto uno \uFFFD» y la fila
       contaba DOS veces: la comisión salía 60,00 € donde son 45,00 €. Un
       número redondo, creíble y falso. Se ignora ese carácter y el blanco que
       deja, SOLO para decidir si dos filas son la misma; el valor que se
       guarda no se toca. Lo fija tests/reclamaciones.test.js con la fixture
       transacciones-fffd.csv. */
    const t = String(v).replace(/\uFFFD/g,'').replace(/\s+/g,' ').trim();
    if(t==='') continue;
    s += ks[i] + IMP_SEP_CAMPO + t + IMP_SEP_FILA;
  }
  return impHash(s);
}

/* ---------- Claves de fusión por informe ----------
   `clave`   : columnas (ya normalizadas) que identifican la misma fila lógica.
   `reciente`: si dos filas comparten clave, gana la de fecha mayor.
   Sin entrada aquí, la identidad es el contenido entero de la fila. */
const IMP_CLAVES = {
  orders : {clave:['orderitemid'], reciente:'lastupdateddate'},
  returns: {clave:['licenseplatenumber']}
};

/* Un valor de clave que no identifica nada.

   NO ES UN DETALLE. Medido sobre los ficheros reales de pedidos: hay líneas
   que traen `order-item-id` a «0», y son PEDIDOS DISTINTOS, con
   `amazon-order-id` distintos cada uno. Deduplicar por esa clave sin mirar el
   valor las funde todas en una sola y deja un total más bajo: un número
   redondo, creíble, y falso —se ha comido ventas de verdad—. Cuando la clave
   viene degenerada, la fila se identifica por su contenido entero y se cuenta
   aparte, para poder decirlo en pantalla. */
const IMP_CLAVE_DEGENERADA = /^(0+([.,]0+)?|-+|n\/?a|null|none|nil)$/i;

function impValorClave(def, fila){
  if(!def || !def.clave) return null;
  for(let i=0;i<def.clave.length;i++){
    const v = fila[def.clave[i]];
    if(v!=null && String(v).trim()!=='') return String(v).trim();
  }
  return null;
}

/* =========================================================================
   2 · FUSIÓN
   `entradas` = [{fid, nombre, filas}] en el orden en que se importaron.
   Devuelve las filas únicas, las que perdieron un empate de clave con
   contenido distinto (`descartadas`, para poder quitar un fichero sin perder
   información) y el recuento de cada fichero.
   ========================================================================= */
function impFusionar(repId, entradas){
  const def = IMP_CLAVES[repId] || null;
  const indice = Object.create(null);
  const rows = [], descartadas = [];
  let brutas = 0, duplicadas = 0, degeneradas = 0;

  entradas.forEach(e=>{
    e.filas = e.filas || [];
    e.brutas = e.filas.length; e.nuevas = 0; e.duplicadas = 0; e.degeneradas = 0;
    e.filas.forEach(f=>{
      brutas++;
      f.__fs = e.fid;
      const huella = impHuellaFila(f);
      let k = 'h:'+huella;
      const kv = impValorClave(def, f);
      if(kv !== null){
        if(IMP_CLAVE_DEGENERADA.test(kv)){ degeneradas++; e.degeneradas++; }
        else k = 'k:'+kv;
      }
      const pos = indice[k];
      if(pos === undefined){ indice[k] = rows.length; rows.push(f); e.nuevas++; return; }

      duplicadas++; e.duplicadas++;
      const g = rows[pos];
      const fs = String(g.__fs||'').split(',').filter(Boolean);
      if(fs.indexOf(e.fid)<0) fs.push(e.fid);
      const juntos = fs.join(',');
      /* Mismo contenido: no hay nada que elegir, solo que anotar que este
         fichero también la traía. */
      if(impHuellaFila(g) === huella){ g.__fs = juntos; return; }
      /* Contenido distinto con la misma clave: manda la fecha de última
         actualización. Sin criterio de fecha gana la primera leída, que es una
         decisión arbitraria, y por eso se conserva la perdedora. */
      let ganaNueva = false;
      if(def && def.reciente){
        const a = String(f[def.reciente]||''), b = String(g[def.reciente]||'');
        ganaNueva = a > b;
      }
      if(ganaNueva){ f.__fs = juntos; rows[pos] = f; g.__fs = juntos; descartadas.push(g); }
      else         { g.__fs = juntos; f.__fs = juntos; descartadas.push(f); }
    });
  });
  return {rows, descartadas, brutas, unicas:rows.length, duplicadas, degeneradas,
          clave: def && def.clave ? def.clave[0] : null};
}

/* ---------- Deshacer la fusión para poder rehacerla ----------
   Devuelve cada aportación con sus filas. La forma vieja (solo `rows`) se
   sigue entendiendo: una base guardada antes de este cambio, o montada a mano
   por una prueba, se convierte en una aportación llamada como su fichero. */
function impEntradas(store){
  if(!store) return [];
  if(store.ficheros && store.ficheros.length){
    const porId = {};
    store.ficheros.forEach(f=>{ porId[f.fid] = {fid:f.fid, nombre:f.nombre, huella:f.huella,
      cargadoAt:f.cargadoAt, cols:f.cols, how:f.how, map:f.map, avisos:f.avisos, filas:[]}; });
    (store.rows||[]).concat(store.descartadas||[]).forEach(r=>{
      String(r.__fs||'').split(',').filter(Boolean).forEach(fid=>{
        if(!porId[fid]) return;
        /* Una fila que venía de varios ficheros se devuelve a todos ellos: si
           luego se quita uno, la fila sigue viva por los otros. Se clona para
           que quitar un fichero no deje objetos compartidos entre aportaciones,
           que es como se acaba borrando de más. */
        const c = {}; for(const k in r){ if(k!=='__fs') c[k] = r[k]; }
        porId[fid].filas.push(c);
      });
    });
    return store.ficheros.map(f=>porId[f.fid]);
  }
  if(store.rows && store.rows.length)
    return [{fid:'f0', nombre:store.file||'importación anterior', huella:null,
             cargadoAt:store.loadedAt, cols:store.cols, how:store.how, map:store.map,
             filas:store.rows.map(r=>{ const c={}; for(const k in r){ if(k!=='__fs') c[k]=r[k]; } return c; })}];
  return [];
}

function impGuardarFusion(repId, entradas, extra){
  const F = impFusionar(repId, entradas);
  const ultima = entradas[entradas.length-1] || {};
  const store = Object.assign({
    rows: F.rows, descartadas: F.descartadas, count: F.rows.length,
    file: entradas.map(e=>e.nombre).join(' + '),
    map: ultima.map || {}, loadedAt: new Date().toISOString(),
    cols: ultima.cols || 0, how: ultima.how || 'asignación manual',
    ficheros: entradas.map(e=>({fid:e.fid, nombre:e.nombre, huella:e.huella,
      cargadoAt:e.cargadoAt, cols:e.cols, how:e.how, map:e.map, avisos:e.avisos||[],
      brutas:e.brutas, nuevas:e.nuevas, duplicadas:e.duplicadas, degeneradas:e.degeneradas})),
    fusion: {brutas:F.brutas, unicas:F.unicas, duplicadas:F.duplicadas,
             degeneradas:F.degeneradas, clave:F.clave}
  }, extra||{});
  DB.imports[repId] = store;
  return store;
}

/* Añade (o vuelve a añadir) un fichero. Idempotente por construcción: un
   fichero cuyo nombre Y contenido ya están guardados no cambia nada. */
function impAnadirFichero(repId, filasNorm, nombre, cols, how, map, avisos){
  const entradas = impEntradas(DB.imports[repId]);
  const huella = impHash(filasNorm.map(impHuellaFila).join('|'));
  const yaIgual = entradas.filter(e=>e.nombre===nombre && e.huella===huella)[0];
  if(yaIgual){
    const store = impGuardarFusion(repId, entradas);
    return {store, yaEstaba:true, entrada:store.ficheros.filter(f=>f.fid===yaIgual.fid)[0]};
  }
  const usados = {}; entradas.forEach(e=>usados[e.fid]=1);
  let n = entradas.length+1, fid = 'f'+n;
  while(usados[fid]){ n++; fid = 'f'+n; }
  /* Mismo nombre y contenido distinto: es el fichero vuelto a descargar. Se
     sustituye su aportación en su sitio, no se añade una segunda. */
  const nueva = {fid, nombre, huella, cargadoAt:new Date().toISOString(),
                 cols, how, map, avisos:avisos||[], filas:filasNorm};
  const pos = entradas.map(e=>e.nombre).indexOf(nombre);
  let reemplazado = false;
  if(pos>=0){ nueva.fid = entradas[pos].fid; entradas[pos] = nueva; reemplazado = true; }
  else entradas.push(nueva);
  const store = impGuardarFusion(repId, entradas);
  return {store, yaEstaba:false, reemplazado,
          entrada: store.ficheros.filter(f=>f.fid===nueva.fid)[0]};
}

function impQuitarFichero(repId, fid){
  const entradas = impEntradas(DB.imports[repId]).filter(e=>e.fid!==fid);
  if(!entradas.length){ delete DB.imports[repId]; saveDB(); refreshAll(); return null; }
  const store = impGuardarFusion(repId, entradas);
  saveDB(); refreshAll();
  return store;
}
/* Botón de la pantalla de Datos. Pregunta, porque quitar un fichero cambia
   todos los números de la pantalla y eso no debe pasar por un clic distraído. */
function quitarFicheroImportado(repId, fid){
  const store = DB.imports[repId]; if(!store) return;
  const f = (store.ficheros||[]).filter(x=>x.fid===fid)[0]; if(!f) return;
  if(!confirm('Se quita «'+f.nombre+'» de este informe.\n\n'+
              'Las filas que solo trajera ese fichero desaparecen; las que también estén en otro se quedan. '+
              'Los demás ficheros del informe no se tocan.')) return;
  impQuitarFichero(repId, fid);
  toast('Fichero quitado · el informe se ha vuelto a fusionar');
}

/* =========================================================================
   3 · PREÁMBULO ANTES DE LA CABECERA
   Genérico, no clavado a un número de líneas: se busca dónde empieza la tabla.
   ========================================================================= */
/* Parte el texto en registros respetando las comillas: una celda entrecomillada
   puede llevar saltos de línea dentro y partir por `\n` a pelo la rompería. */
function impRegistros(texto, tope){
  const out = []; let cur = '', q = false;
  for(let i=0;i<texto.length && out.length<tope;i++){
    const ch = texto[i];
    if(ch==='"'){ if(q && texto[i+1]==='"'){ cur+='""'; i++; } else { q=!q; cur+='"'; } }
    else if(ch==='\n' && !q){ out.push(cur.replace(/\r$/,'')); cur=''; }
    else cur += ch;
  }
  if(out.length<tope && cur!=='') out.push(cur.replace(/\r$/,''));
  return out;
}
/* Cuenta separadores FUERA de comillas. Sin esto, la primera línea de aviso de
   un informe de transacciones —una sola celda entrecomillada con comas
   dentro— parece una fila de varias columnas. */
function impCuenta(linea, sep){
  let n = 0, q = false;
  for(let i=0;i<linea.length;i++){
    const ch = linea[i];
    if(ch==='"'){ if(q && linea[i+1]==='"'){ i++; } else q = !q; }
    else if(ch===sep && !q) n++;
  }
  return n;
}
/* Dónde empieza la tabla de verdad.
   La cabecera es la primera línea que (a) tiene el número de separadores que
   domina en el fichero, (b) trae al menos tres celdas llenas y (c) NO parece
   una fila de datos: sus celdas son nombres, no números. La condición (c) es
   la que evita empezar una línea tarde y perder la cabecera de verdad. */
function impDondeEmpiezaLaTabla(texto){
  const L = impRegistros(texto, 60);
  if(L.length < 2) return {linea:0, sep:null};
  const seps = ['\t',';',','];
  let mejor = null;
  seps.forEach(sep=>{
    const c = L.map(l=>impCuenta(l, sep));
    const frec = {}; c.forEach(n=>{ if(n>0) frec[n] = (frec[n]||0)+1; });
    let modo = 0, veces = 0;
    for(const n in frec){ if(frec[n]>veces || (frec[n]===veces && +n>modo)){ modo=+n; veces=frec[n]; } }
    if(!modo || veces < 2) return;
    const puntos = veces*100 + (sep==='\t'?2:sep===';'?1:0);
    if(!mejor || puntos > mejor.puntos) mejor = {sep, modo, veces, c, puntos};
  });
  if(!mejor) return {linea:0, sep:null};
  for(let i=0;i<mejor.c.length;i++){
    if(mejor.c[i] !== mejor.modo) continue;
    if(i+1 < mejor.c.length && mejor.c[i+1] !== mejor.modo) continue;  // una fila suelta no es una tabla
    const celdas = L[i].split(mejor.sep).map(x=>x.replace(/^"|"$/g,'').trim());
    const llenas = celdas.filter(x=>x!=='');
    if(llenas.length < 3) continue;
    const numericas = llenas.filter(x=>/^[-+]?[\d.,]+%?$/.test(x)).length;
    if(numericas > llenas.length*0.4) continue;      // eso es una fila de datos
    return {linea:i, sep:mejor.sep, cols:mejor.modo+1};
  }
  return {linea:0, sep:mejor.sep};
}

registrarPreproceso(function preambulo(texto){
  const d = impDondeEmpiezaLaTabla(texto);
  if(!d || !d.linea) return texto;
  /* Se recorta contando saltos de línea FUERA de comillas, igual que se
     contaron los registros: partir por índice de `split('\n')` volvería a
     juntar mal las celdas que llevan un salto dentro. */
  let corte = 0, vistos = 0;
  for(let i=0;i<texto.length;i++){
    const ch = texto[i];
    if(ch==='"'){
      i++;
      while(i<texto.length){
        if(texto[i]==='"'){ if(texto[i+1]==='"') i++; else break; }
        i++;
      }
      continue;
    }
    if(ch==='\n'){ vistos++; if(vistos===d.linea){ corte = i+1; break; } }
  }
  if(!corte) return texto;
  return {texto: texto.slice(corte),
          nota: 'me he saltado '+d.linea+' línea'+(d.linea===1?'':'s')+
                ' de preámbulo antes de la cabecera (la tabla empieza en la línea '+(d.linea+1)+')'};
}, 'preámbulo antes de la cabecera');

/* =========================================================================
   4 · LO QUE NO SE IMPORTA SIN PREGUNTAR  ·  C3
   ========================================================================= */
/* ¿Este campo lo ha resuelto el NOMBRE de la columna, o solo su contenido? */
function impResueltoPorNombre(rep, campo, columna){
  const d = (rep.fields||{})[campo];
  if(!d || !d.alias || !columna) return false;
  for(let i=0;i<d.alias.length;i++) if(d.alias[i].test(columna)) return true;
  return false;
}
/* Campos obligatorios de IMPORTE o CANTIDAD elegidos solo por la forma del
   contenido. Entre varias columnas de dinero, la segunda pasada de
   `resolveFields` coge la PRIMERA: con las cabeceras en italiano, francés o
   alemán eso es tirar una moneda entre el precio del artículo, el del envío y
   el descuento de promoción. Los códigos y las fechas no entran aquí a
   propósito: un SKU se elige por cardinalidad y una fecha tiene una forma que
   no se confunde con nada. */
function impCamposInciertos(rep, map){
  const out = [];
  const fs = rep.fields || {};
  Object.keys(fs).forEach(f=>{
    const d = fs[f];
    if(!d.req || (d.type!=='money' && d.type!=='int')) return;
    if(!map[f]) return;
    if(!impResueltoPorNombre(rep, f, map[f])) out.push({campo:f, columna:map[f]});
  });
  return out;
}

/* =========================================================================
   5 · AVISOS DE IMPORTACIÓN  ·  C1 y el 0,00 de la tarifa
   Se guardan con el informe para que la pantalla de Datos los siga enseñando
   cuando ya no esté delante la línea del fichero recién soltado.
   ========================================================================= */
function impAvisos(rep, map, filasNorm){
  const av = [];
  if(rep.id === 'fees'){
    if(!map._price) av.push({nivel:'stop', txt:
      'Este informe de tarifas <strong>no trae columna de precio de venta</strong>. La comisión de Amazon '+
      'viene en euros por unidad, así que sin el precio no se puede convertir en porcentaje: el hub seguirá '+
      'aplicando el % que tengas puesto en cada producto y, si no lo has puesto, el 15 % por defecto. '+
      'Las filas están cargadas, pero <strong>la comisión NO está medida</strong>. Vuelve a descargar '+
      '«Vista previa de tarifas» incluyendo <em>your-price</em> / <em>sales-price</em>.'});
    if(map._fba){
      let ceros = 0, con = 0;
      filasNorm.forEach(r=>{ const v = r._fba;
        if(!hayNumero(v)) return; con++; if(toNum(v)===0) ceros++; });
      if(ceros) av.push({nivel:'warn', txt:
        'La tarifa de logística viene a <strong>0,00</strong> en '+num(ceros)+' de '+num(con)+
        ' filas con número. Un cero literal pasa por dato medido y luego el cálculo se cae igualmente a la '+
        'tarifa por defecto del producto sin contarlo como ausente: míralo antes de fiarte del coste FBA.'});
    }
  }
  return av;
}

/* =========================================================================
   6 · .XLSX  ·  por qué no se lee, y qué hacer
   Se envuelve `handleFiles` en vez de editarlo: no es de este carril. Lo único
   que hace la envoltura es apartar los libros de Excel antes de que el flujo
   normal los vea; lo demás pasa intacto a la función original.
   // COSTURA → carril de integración: `handleFiles` no es de ningún carril y
   // el mensaje de .xlsx vive dentro. Se envuelve, no se edita.
   ========================================================================= */
if(typeof handleFiles === 'function' && !window.__impXlsx){
  window.__impXlsx = true;
  const _handleFilesBase = handleFiles;
  handleFiles = function(files){
    const resto = [];
    Array.from(files||[]).forEach(f=>{
      if(!/\.xlsx?$/i.test(f.name)){ resto.push(f); return; }
      const list = document.getElementById('fileList');
      if(!list) return;
      const el = document.createElement('div');
      el.className = 'fileitem';
      el.innerHTML = '<span class="f-dot err"></span><span class="f-name">'+esc(f.name)+'</span>'+
        '<span class="f-meta"><strong>No leo libros de Excel, y prefiero decírtelo a adivinar.</strong> '+
        'Un .xlsx es un ZIP con XML dentro, y el que exporta el gestor de campañas declara en su cabecera '+
        'un rango de <em>una sola celda</em> teniendo más de mil filas: un lector que se fiara de ese dato '+
        'te importaría una celda y no daría ningún error. Un informe vacío «en verde» es peor que este mensaje.'+
        '<br><strong>Cómo sacar el CSV:</strong> en <em>Publicidad › Gestor de campañas › Informes</em>, al '+
        'descargar elige <em>CSV</em> en vez de XLSX. En los informes de Logística de Amazon el enlace de '+
        'descarga ya da .txt. Y si solo tienes el .xlsx, ábrelo y usa '+
        '<em>Archivo › Guardar como › CSV UTF-8 (delimitado por comas)</em>.'+
        '<br>Si puedes elegir, coge <strong>.txt</strong>: el CSV se come los ceros a la izquierda de los SKU.'+
        '</span>';
      list.appendChild(el);
    });
    if(resto.length) return _handleFilesBase.call(this, resto);
    try{ refreshAll(); }catch(e){}
    return Promise.resolve();
  };
}

/* =========================================================================
   7 · ESTILOS de lo que este carril añade a la pantalla de Datos
   ========================================================================= */
registrarEstilo(
  '.imp-files{width:100%;border-collapse:collapse;font-size:12.5px}'+
  '.imp-files th,.imp-files td{padding:6px 8px;border-bottom:1px solid var(--hair);text-align:left}'+
  '.imp-files td.num,.imp-files th.num{text-align:right;font-variant-numeric:tabular-nums}'+
  '.imp-files .rep{font-weight:600}'+
  '.imp-nota{font-size:12px;margin-top:6px}'
);

/* =========================================================================
   8 · EL PANEL DE FICHEROS EN LA PANTALLA DE DATOS
   ========================================================================= */
/* Un informe puede venir en varios ficheros, y hay que poder ver cuál trajo
   qué y quitar uno sin tocar los demás.

   POR QUÉ ESTÁ AQUÍ Y NO EN `02-views.html`: ese fichero lo comparten todos los
   carriles y abrirlo garantiza conflictos. El panel se crea desde el render, al
   lado de «Datos cargados», y si ya existe se reutiliza. */
function renderDatosFicheros(){
  const anclaTabla = document.getElementById('dataState');
  const panel = anclaTabla ? anclaTabla.closest('.panel') : null;
  if(!panel) return;
  let caja = document.getElementById('impFicheros');
  if(!caja){
    caja = document.createElement('div');
    caja.id = 'impFicheros';
    caja.style.marginTop = '18px';
    const acciones = panel.querySelector('button[onclick="wipeImports()"]');
    const fila = acciones ? acciones.parentNode : null;
    if(fila && fila.parentNode) fila.parentNode.insertBefore(caja, fila);
    else panel.appendChild(caja);
  }

  const partes = [];
  REPORTS.forEach(r=>{
    const i = DB.imports[r.id];
    if(!i) return;
    const fs = i.ficheros || [];
    if(fs.length < 1) return;
    const fu = i.fusion || {};
    partes.push(
      '<tr><td class="rep" colspan="5">'+esc(r.label)+
        (fs.length>1 ? ' <span class="pill">'+fs.length+' ficheros</span>' : '')+'</td></tr>'+
      fs.map(f=>'<tr><td class="name mut">'+esc(f.nombre)+'</td>'+
        '<td class="num">'+num(f.brutas||0)+'</td>'+
        '<td class="num pos">'+num(f.nuevas||0)+'</td>'+
        '<td class="num '+((f.duplicadas||0)?'warn':'mut')+'">'+num(f.duplicadas||0)+'</td>'+
        '<td class="num"><button class="btn sm danger" onclick="quitarFicheroImportado(\''+
          esc(r.id)+'\',\''+esc(f.fid)+'\')">Quitar</button></td></tr>').join('')+
      (fs.length>1 || fu.duplicadas
        ? '<tr><td class="name mut" style="font-size:11.5px" colspan="5">'+
          num(fu.brutas||0)+' filas leídas → <strong>'+num(fu.unicas||0)+'</strong> únicas'+
          (fu.duplicadas ? ' · '+num(fu.duplicadas)+' repetida'+(fu.duplicadas===1?'':'s')+' entre ficheros' : '')+
          (fu.clave ? ' · se identifican por <code>'+esc(fu.clave)+'</code>' : ' · se identifican por el contenido entero de la fila')+
          (fu.degeneradas
            ? '<br><span class="warn">⚠ '+num(fu.degeneradas)+' fila'+(fu.degeneradas===1?'':'s')+
              ' traen esa columna vacía o a cero.</span> No identifican nada, así que se han contado por su '+
              'contenido en vez de fundirse en una sola: fundirlas habría borrado ventas de verdad y el total '+
              'habría salido más bajo sin ningún aviso.'
            : '')+
          '</td></tr>'
        : '')+
      (i.avisos && i.avisos.length ? '' : '')
    );
  });

  /* Lo que un preproceso ha hecho con el texto antes de leerlo. Un fichero al
     que se le han quitado líneas por el camino y no lo dice en ningún sitio es
     un número sin trazabilidad esperando a que alguien lo descubra tarde. */
  let notas = '';
  try{
    if(typeof REGISTRO==='object' && REGISTRO && REGISTRO.notas.length){
      notas = '<div class="note-box info imp-nota" style="margin-top:12px"><strong>Lo que he tenido que tocar antes de leer:</strong><ul style="margin:6px 0 0 18px">'+
        REGISTRO.notas.slice(-12).map(n=>'<li>'+esc(n.fichero||'(archivo)')+': '+esc(n.nota)+'</li>').join('')+
        '</ul></div>';
    }
  }catch(e){}

  /* Avisos guardados con cada informe (C1 y compañía): siguen visibles cuando
     ya no está delante la línea del fichero recién soltado. */
  let avisos = '';
  REPORTS.forEach(r=>{
    const i = DB.imports[r.id]; if(!i || !i.ficheros) return;
    i.ficheros.forEach(f=>{
      (f.avisos||[]).forEach(a=>{
        avisos += '<div class="note-box '+(a.nivel==='stop'?'stop':'warn')+' imp-nota" style="margin-top:10px">'+
          '<strong>'+esc(r.label)+' · '+esc(f.nombre)+'.</strong> '+a.txt+'</div>';
      });
    });
  });

  caja.innerHTML = (partes.length
    ? '<h3 style="margin:0 0 6px">Qué fichero ha traído cada fila</h3>'+
      '<p class="desc" style="margin:0 0 8px">Un informe puede venir partido en varios ficheros. '+
      'Se fusionan sin repetir filas, y aquí se ve lo que aportó cada uno. Quitar uno rehace la fusión con los demás.</p>'+
      '<div class="tbl-wrap"><table class="imp-files">'+
      '<tr><th>Archivo</th><th class="num">Leídas</th><th class="num">Nuevas</th><th class="num">Repetidas</th><th></th></tr>'+
      partes.join('')+'</table></div>'
    : '') + avisos + notas;
}
