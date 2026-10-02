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
   6 · .XLSX  ·  se lee, sin librerías y sin fiarse de la cabecera

   ANTES SE RECHAZABA, y por una razón buena que sigue vigente: el .xlsx que
   exporta el gestor de campañas declara en `<dimension>` un rango de UNA sola
   celda («A1») teniendo más de mil filas. Un lector que se fiara de ese dato
   importaría una celda y no daría ningún error. Este no lo mira: recorre las
   filas que hay de verdad.

   POR QUÉ HACÍA FALTA. Juancho tiene quince informes de términos de búsqueda
   descargados en .xlsx —de mayo de 2025 a agosto de 2026— y Amazon ya no deja
   volver a pedir la mayoría de esos periodos. Exigir CSV era dejar un año de
   publicidad fuera del hub.

   CÓMO. Un .xlsx es un ZIP con XML dentro. El ZIP se descomprime con
   `DecompressionStream('deflate-raw')`, que está en Chrome, Edge, Safari y
   Firefox actuales; el XML se lee con expresiones regulares acotadas a las
   cuatro etiquetas que importan. Se convierte en un TSV y entra por el mismo
   camino que un .txt: detección, columnas, deduplicación y avisos idénticos.

   LO QUE SE CUIDA, porque cada punto era un número creíble y falso:
   · Un número de Excel puede venir en notación científica («4.18E-3»). `toNum`
     quita la «E» y leería 4,18: mil veces más. Aquí se escribe en decimal.
   · Las fechas son números de serie con un formato de celda. Sin mirar el
     estilo, «46217» sería un número y el informe quedaría sin fechas, con el
     gasto sin poder cortarse por periodo. Se convierten a AAAA-MM-DD.
   · Las filas OCULTAS en Excel (un filtro que alguien dejó puesto) son datos:
     se leen igual y se dice cuántas había.
   · Una celda con comillas dobles —«pulsera 18"»— rompería el TSV si no se
     entrecomilla. Se entrecomilla.
   · Una celda con error de fórmula (#N/A) no es un cero: se deja vacía y se
     cuenta.
   Un .xls (formato binario antiguo) sigue sin leerse, y se dice.
   ========================================================================= */

/* ── ZIP: el directorio central, no las cabeceras locales ─────────────────────
   Las cabeceras locales pueden llevar los tamaños a cero (bit 3, «data
   descriptor»); el directorio central del final siempre los trae. */
async function xlsxUnzip(buf){
  const b = new Uint8Array(buf), dv = new DataView(buf);
  const u16 = o=>dv.getUint16(o,true), u32 = o=>dv.getUint32(o,true);
  let eocd = -1;
  for(let i=b.length-22; i>=Math.max(0,b.length-65557); i--){
    if(u32(i)===0x06054b50){ eocd=i; break; }
  }
  if(eocd<0) throw new Error('no es un ZIP: no encuentro su índice');
  const total = u16(eocd+10); let p = u32(eocd+16);
  const td = new TextDecoder('utf-8');
  const out = {};
  for(let n=0;n<total;n++){
    if(u32(p)!==0x02014b50) throw new Error('índice del ZIP dañado');
    const metodo = u16(p+10), comp = u32(p+20);
    const lNom = u16(p+28), lExtra = u16(p+30), lCom = u16(p+32), local = u32(p+42);
    const nombre = td.decode(b.subarray(p+46, p+46+lNom));
    p += 46 + lNom + lExtra + lCom;
    out[nombre] = {metodo, comp, local};
  }
  const leer = async nombre=>{
    const e = out[nombre]; if(!e) return null;
    const ini = e.local + 30 + u16(e.local+26) + u16(e.local+28);
    const datos = b.subarray(ini, ini+e.comp);
    if(e.metodo===0) return td.decode(datos);
    if(e.metodo!==8) throw new Error('compresión ZIP no soportada ('+e.metodo+')');
    const ds = new DecompressionStream('deflate-raw');
    const txt = await new Response(new Blob([datos]).stream().pipeThrough(ds)).arrayBuffer();
    return td.decode(txt);
  };
  return {nombres:Object.keys(out), leer};
}

function xlsxEnt(s){
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m,c)=>{
    const l = c.toLowerCase();
    if(l==='amp') return '&'; if(l==='lt') return '<'; if(l==='gt') return '>';
    if(l==='quot') return '"'; if(l==='apos') return "'";
    const cp = l[1]==='x' ? parseInt(l.slice(2),16) : parseInt(l.slice(1),10);
    return isFinite(cp) ? String.fromCodePoint(cp) : m;
  });
}
/* El texto de un `<si>` o de un `<is>`: todos sus `<t>`, MENOS los de la
   guía fonética `<rPh>`, que es una transcripción y no el texto. */
function xlsxTexto(xml){
  const sinFon = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g,'');
  /* `<t/>` (un trozo de texto vacío) existe en libros reales. Una expresión que
     lo leyera como apertura se tragaba hasta el siguiente `</t>` y metía
     «</r><r><t>» dentro del nombre de una campaña. */
  let s=''; const re=/<t(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/t>)/g; let m;
  while((m=re.exec(sinFon))) s += m[1]||'';
  return xlsxEnt(s);
}
function xlsxAttr(tag, nom){
  const m = tag.match(new RegExp('\\b'+nom+'="([^"]*)"'));
  return m ? m[1] : null;
}
function xlsxCol(ref){
  const m = /^([A-Z]+)/.exec(ref||''); if(!m) return -1;
  let n=0; for(const ch of m[1]) n = n*26 + (ch.charCodeAt(0)-64);
  return n-1;
}
/* ¿Este formato de número es una fecha? Los incorporados de Excel que lo son,
   y los propios cuyo código lleva día o año fuera de comillas y corchetes.
   «MMM dd, yyyy» es el que pone Amazon. */
const XLSX_FMT_FECHA = [14,15,16,17,18,19,20,21,22,27,28,29,30,31,32,33,34,35,36,45,46,47,50,51,52,53,54,55,56,57,58];
function xlsxEsFecha(id, codigo){
  if(XLSX_FMT_FECHA.indexOf(id)>=0) return true;
  if(!codigo) return false;
  const limpio = codigo.replace(/"[^"]*"/g,'').replace(/\[[^\]]*\]/g,'').replace(/\\./g,'');
  return /[dy]/i.test(limpio);
}
/* Serie de Excel → «AAAA-MM-DD» (y la hora solo si la hay). Se hace con UTC
   para que el huso de quien abre el fichero no mueva el día: el fallo de
   `iso()` que daba el día anterior en horario español entró por ahí. */
function xlsxFecha(serie, base1904){
  const ms = Math.round((serie + (base1904 ? 1462 : 0) - 25569) * 86400000);
  const d = new Date(ms); if(isNaN(d.getTime())) return '';
  const p = n=>String(n).padStart(2,'0');
  let s = d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate());
  const seg = Math.round((serie % 1) * 86400);
  if(seg>0 && seg<86400) s += ' '+p(Math.floor(seg/3600))+':'+p(Math.floor(seg%3600/60))+':'+p(seg%60);
  return s;
}
/* Un número de Excel en decimal, nunca en notación científica. */
function xlsxNum(txt){
  const n = Number(txt);
  if(!isFinite(n)) return String(txt);
  /* A partir de 1e21, String() vuelve a la notación científica. */
  if(Math.abs(n) >= 1e21) return n.toLocaleString('en-US', {useGrouping:false, maximumFractionDigits:0});
  if(Number.isInteger(n)) return String(n);
  const s = n.toFixed(10).replace(/0+$/,'').replace(/\.$/,'');
  return s==='-0' ? '0' : s;
}

/* El libro entero → {hoja, hojas, filas:[[celdas]], ocultas, errores, fechas}.
   Lee la PRIMERA hoja del libro en el orden en que el libro las declara. */
async function xlsxLeer(buf){
  const z = await xlsxUnzip(buf);
  const wb = await z.leer('xl/workbook.xml');
  if(!wb) throw new Error('el ZIP no trae xl/workbook.xml: no es un libro de Excel');
  const hojasDecl = []; const reH = /<sheet\b[^>]*>/g; let m;
  while((m=reH.exec(wb))) hojasDecl.push({nombre:xlsxEnt(xlsxAttr(m[0],'name')||''),
    rid:xlsxAttr(m[0],'r:id')});
  const base1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(wb);
  let ruta = null;
  const rels = await z.leer('xl/_rels/workbook.xml.rels');
  if(rels && hojasDecl.length){
    const reR = /<Relationship\b[^>]*>/g; let r;
    while((r=reR.exec(rels))){
      if(xlsxAttr(r[0],'Id')===hojasDecl[0].rid){
        let t = xlsxAttr(r[0],'Target')||'';
        t = t.replace(/^\/?xl\//,'').replace(/^\//,'');
        ruta = 'xl/'+t; break;
      }
    }
  }
  if(!ruta || z.nombres.indexOf(ruta)<0)
    ruta = z.nombres.filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if(!ruta) throw new Error('el libro no trae ninguna hoja');

  const ss = [];
  const ssXml = await z.leer('xl/sharedStrings.xml');
  if(ssXml){ const reS=/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g; let s;
    while((s=reS.exec(ssXml))) ss.push(s[1]==null ? '' : xlsxTexto(s[1])); }

  const estiloFecha = [];
  const st = await z.leer('xl/styles.xml');
  if(st){
    const codigos = {}; const reF=/<numFmt\b[^>]*>/g; let f;
    while((f=reF.exec(st))) codigos[+xlsxAttr(f[0],'numFmtId')] = xlsxEnt(xlsxAttr(f[0],'formatCode')||'');
    const xfs = (st.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)||[''])[0];
    const reX=/<xf\b[^>]*>/g; let x;
    while((x=reX.exec(xfs))){ const id=+(xlsxAttr(x[0],'numFmtId')||0);
      estiloFecha.push(xlsxEsFecha(id, codigos[id])); }
  }

  const hoja = await z.leer(ruta);
  const filas = []; let ocultas=0, errores=0, fechas=0;
  const reFila = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g; let rf;
  while((rf=reFila.exec(hoja))){
    if(rf[2]==null) continue;
    if(/\bhidden="(1|true)"/.test(rf[1]||'')) ocultas++;
    const celdas = [];
    const reC = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g; let c;
    let auto = 0;
    while((c=reC.exec(rf[2]))){
      const at = c[1], cuerpo = c[3]||'';
      let col = xlsxCol(xlsxAttr(at,'r')); if(col<0) col = auto;
      auto = col+1;
      const t = xlsxAttr(at,'t'), s = +(xlsxAttr(at,'s')||0);
      const vm = cuerpo.match(/<v>([\s\S]*?)<\/v>/), v = vm ? xlsxEnt(vm[1]) : '';
      let val = '';
      if(t==='s') val = ss[+v]!=null ? ss[+v] : '';
      else if(t==='inlineStr') val = xlsxTexto(cuerpo);
      else if(t==='str') val = v;
      else if(t==='b') val = v==='1' ? 'TRUE' : 'FALSE';
      else if(t==='e'){ val = ''; errores++; }
      /* Fecha ISO guardada como tal (`t="d"`): no es un número de serie. */
      else if(t==='d'){ val = v ? v.replace('T',' ').replace(/(\s00:00(:00(\.0+)?)?)?Z?$/,'') : ''; if(val) fechas++; }
      /* Una fórmula sin valor guardado: Excel no la calculó al guardar. Vacía,
         y contada como error: no es un cero. */
      else if(v==='' && /<f\b/.test(cuerpo)){ val = ''; errores++; }
      else if(v!==''){
        if(estiloFecha[s]){ val = xlsxFecha(Number(v), base1904); fechas++; }
        else val = xlsxNum(v);
      }
      celdas[col] = val;
    }
    for(let i=0;i<celdas.length;i++) if(celdas[i]===undefined) celdas[i]='';
    filas.push(celdas);
  }
  /* Las filas que Excel deja completamente vacías al final no son datos. */
  while(filas.length && !filas[filas.length-1].some(v=>String(v).trim()!=='')) filas.pop();
  return {hoja: hojasDecl[0] ? hojasDecl[0].nombre : ruta, hojas: hojasDecl.length||1,
          filas, ocultas, errores, fechas};
}

/* Filas → TSV que `parseDelimited` lee sin ambigüedad. */
function xlsxATsv(filas){
  const ancho = filas.reduce((a,f)=>Math.max(a,f.length),0);
  return filas.map(f=>{
    const out=[]; for(let i=0;i<ancho;i++){
      let v = f[i]==null ? '' : String(f[i]);
      v = v.replace(/[\t\r\n]+/g,' ');
      if(v.indexOf('"')>=0) v = '"'+v.replace(/"/g,'""')+'"';
      out.push(v);
    }
    return out.join('\t');
  }).join('\n');
}

/* Nombre del fichero convertido: se conserva el original, para que volver a
   cargar el mismo .xlsx se reconozca como el mismo fichero. */
function xlsxNombre(n){ return String(n).replace(/\.xlsx$/i,'')+' (xlsx).tsv'; }

if(typeof handleFiles === 'function' && !window.__impXlsx){
  window.__impXlsx = true;
  const _handleFilesBase = handleFiles;
  const fila = (nombre, html, clase, el)=>{
    const list = document.getElementById('fileList'); if(!list) return null;
    if(!el){ el = document.createElement('div'); el.className = 'fileitem'; list.appendChild(el); }
    el.innerHTML = '<span class="f-dot '+(clase||'err')+'"></span><span class="f-name">'+esc(nombre)+'</span>'+
      '<span class="f-meta">'+html+'</span>';
    return el;
  };
  handleFiles = async function(files){
    const resto = [];
    for(const f of Array.from(files||[])){
      if(/\.xls$/i.test(f.name)){
        fila(f.name, '<strong>Es un .xls antiguo (formato binario) y ese no lo leo.</strong> '+
          'Ábrelo en Excel y guárdalo como <em>.xlsx</em> o como <em>CSV UTF-8</em>.');
        continue;
      }
      if(!/\.xlsx$/i.test(f.name)){ resto.push(f); continue; }
      /* Mientras se descomprime, que se vea: un libro de tres mil filas tarda un
         momento, y sin esto la pantalla parecía no haber hecho caso. Usa el
         mismo «leyendo…» que el resto de ficheros. */
      const el = fila(f.name, 'leyendo… (libro de Excel)', 'wait');
      try{
        const L = await xlsxLeer(await f.arrayBuffer());
        if(L.filas.length<2){ fila(f.name, 'El libro no tiene filas de datos en su primera hoja.', 'err', el); continue; }
        const notas = [];
        if(L.hojas>1) notas.push('el libro trae '+L.hojas+' hojas y leo la primera, «'+esc(L.hoja)+'»');
        if(L.ocultas) notas.push(num(L.ocultas)+' fila'+(L.ocultas===1?' estaba oculta':'s estaban ocultas')+' en Excel y se leen igual');
        if(L.errores) notas.push(num(L.errores)+' celda'+(L.errores===1?'':'s')+' con error de fórmula se dejan vacías');
        const tsv = xlsxATsv(L.filas);
        const conv = new File([tsv], xlsxNombre(f.name), {type:'text/tab-separated-values'});
        if(notas.length) fila(f.name, 'Libro de Excel convertido: '+notas.join(' · ')+'.', 'ok', el);
        else if(el && el.parentNode) el.parentNode.removeChild(el);
        resto.push(conv);
      }catch(e){
        fila(f.name, '<strong>No he podido leer este libro de Excel</strong> ('+esc(e.message||String(e))+'). '+
          'Si es un informe de publicidad, pídelo en CSV: <em>Publicidad › Gestor de campañas › Informes</em>, '+
          'y al descargar elige <em>CSV</em>. Si solo tienes el libro, ábrelo en Excel y usa '+
          '<em>Archivo › Guardar como › CSV UTF-8</em>.', 'err', el);
      }
    }
    if(resto.length) return _handleFilesBase.call(this, resto);
    try{ refreshAll(); }catch(e){}
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
