/* ═══════════════════════════════════════════════════════════════════════════
   Registro de extensiones · la costura por la que se engancha todo lo nuevo

   POR QUÉ EXISTE. Casi toda la lógica vive en dos ficheros de mil quinientas y
   mil setecientas líneas, y build.sh concatena una lista fija de nombres. Diez
   carriles trabajando a la vez sobre eso chocarían en todos los merges: no por
   tocar la misma función, sino por tocar el mismo fichero. Aquí cada carril
   declara lo suyo desde su propio `src/2x-*.js` y no abre ninguno compartido.

   EL ORDEN DE EJECUCIÓN ES LO QUE HACE QUE ESTO FUNCIONE:

     10-const · 11-motor · 12-datos · 12b · 12c · [19-registro] · 2x · 13-render

   Los módulos 2x corren ANTES que 13-render. Dos consecuencias que mandan sobre
   el diseño de este fichero:

   · Un botón de navegación insertado desde un 2x YA ESTÁ en el DOM cuando
     13-render recorre `.nav-item[data-view]` para engancharle su escuchador.
     Por eso las vistas se insertan en el acto y no hace falta tocar `go()`.

   · `CRUMBS` es un `const` de 13-render, así que en ese momento sigue en zona
     muerta temporal: leerlo lanzaría ReferenceError. Todo lo que dependa de él
     se aplaza a un flush en DOMContentLoaded.

   Las funciones declaradas con `function` sí están izadas en todo el archivo
   concatenado, y su binding es reasignable. De ahí que aquí se puedan envolver
   `refreshAll`, `readSmart` y `blankDB` sin editar el cuerpo de ninguna: el
   carril dueño sigue siendo el dueño, y este fichero solo añade alrededor.
   ═══════════════════════════════════════════════════════════════════════════ */

const REGISTRO = {
  informes:[], vistas:[], clavesDB:[], preprocesos:[], estilos:[], exportaciones:[],
  /* Lo que cada preproceso dice haber hecho con el texto. La pantalla de Datos
     lo enseña: una transformación silenciosa sobre el fichero de entrada es
     justo la clase de cosa que luego produce un número creíble y falso. */
  notas:[]
};

/* ── Informes ───────────────────────────────────────────────────────────────
   Añade una definición a REPORTS con la misma forma que las que ya hay. Falla
   ruidosamente si el id se repite: dos carriles registrando el mismo id es un
   choque de propiedad, y descubrirlo al integrar cuesta mucho más que aquí. */
function registrarInforme(def){
  if(!def || !def.id) throw new Error('registrarInforme: la definición no trae id.');
  if(typeof REPORTS==='undefined') throw new Error('registrarInforme: REPORTS no existe todavía.');
  if(REPORTS.some(r=>r.id===def.id))
    throw new Error('registrarInforme: ya hay un informe con id "'+def.id+'". '+
      'Dos carriles se están pisando: usa otro id o reutiliza el que existe.');
  REPORTS.push(def);
  REGISTRO.informes.push(def.id);
  return def;
}

/* ── Vistas ─────────────────────────────────────────────────────────────────
   Crea la sección, el botón de navegación dentro de su grupo, la miga de pan y
   el render periódico. El render va envuelto en try/catch igual que los diez
   que ya tiene `refreshAll`: una vista nueva que peta no puede dejar en blanco
   las que ya funcionaban. */
function registrarVista(cfg){
  cfg = cfg || {};
  const id = cfg.id;
  if(!id) throw new Error('registrarVista: falta el id.');
  if(document.getElementById('view-'+id))
    throw new Error('registrarVista: la vista "'+id+'" ya existe. Dos carriles se están pisando.');

  /* 1 · la sección, junto a las demás */
  const hermana = document.getElementById('view-panel');
  const contenedor = hermana ? hermana.parentNode : document.body;
  const sec = document.createElement('section');
  sec.className = 'view';
  sec.id = 'view-'+id;
  sec.innerHTML = cfg.html || '';
  contenedor.appendChild(sec);

  /* 2 · el botón, al final de su grupo. Si el grupo no existe se crea al final
         de la navegación, que es preferible a colgar el botón de cualquier
         sitio y que el usuario no sepa a qué familia pertenece. */
  const nav = document.querySelector('nav');
  if(nav){
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.dataset.view = id;
    btn.innerHTML = '<span class="ic">'+(cfg.icono||'▫')+'</span> '+(cfg.etiqueta||id);

    let ancla = null;
    if(cfg.grupo){
      const etiquetas = Array.from(nav.querySelectorAll('.nav-label'));
      const lbl = etiquetas.filter(e=>e.textContent.trim()===String(cfg.grupo).trim())[0];
      if(lbl){
        /* El último nav-item de ese grupo es el que precede a la siguiente
           etiqueta, o el último de la navegación si es el grupo final. */
        let n = lbl.nextElementSibling, ultimo = null;
        while(n && !n.classList.contains('nav-label')){
          if(n.classList.contains('nav-item')) ultimo = n;
          n = n.nextElementSibling;
        }
        ancla = ultimo || lbl;
      }else{
        const nueva = document.createElement('div');
        nueva.className = 'nav-label';
        nueva.textContent = cfg.grupo;
        nav.appendChild(nueva);
        ancla = nueva;
      }
    }
    if(ancla && ancla.parentNode) ancla.parentNode.insertBefore(btn, ancla.nextSibling);
    else nav.appendChild(btn);
  }

  REGISTRO.vistas.push({id, crumb:cfg.crumb||cfg.grupo||'', render:cfg.render});
  return sec;
}

/* ── Claves de la base ──────────────────────────────────────────────────────
   La clave tiene que aparecer en cuatro sitios, y los cuatro se cubren desde
   aquí:
     · `blankDB()`  → se envuelve, así toda base nueva la trae.
     · `loadDB()`   → llama a blankDB y luego Object.assign(base, guardado); una
                      base antigua que no tenga la clave conserva el valor por
                      defecto, que es exactamente la migración que hace falta.
     · copia        → `exportData()` serializa `Object.assign({}, DB, …)`, o sea
                      todas las claves de DB sin enumerarlas.
     · restauración → vuelca el JSON sobre DB, con lo mismo.
   Y se parchea la DB VIVA, porque `let DB = blankDB()` ya se ejecutó en
   12-datos antes de que este fichero exista. Sin eso, la clave solo aparecería
   al recargar. */
function registrarClaveDB(nombre, inicial){
  if(!nombre) throw new Error('registrarClaveDB: falta el nombre de la clave.');
  if(REGISTRO.clavesDB.some(c=>c.nombre===nombre))
    throw new Error('registrarClaveDB: la clave "'+nombre+'" ya está registrada. Dos carriles se están pisando.');
  const clonar = () => JSON.parse(JSON.stringify(inicial===undefined?null:inicial));
  REGISTRO.clavesDB.push({nombre, clonar});

  if(!_blankDBEnvuelto){
    const base = blankDB;
    blankDB = function(){
      const d = base.apply(this, arguments);
      REGISTRO.clavesDB.forEach(c=>{ if(d[c.nombre]===undefined) d[c.nombre] = c.clonar(); });
      return d;
    };
    _blankDBEnvuelto = true;
  }
  if(typeof DB==='object' && DB && DB[nombre]===undefined) DB[nombre] = clonar();
  return nombre;
}
let _blankDBEnvuelto = false;

/* ── Preprocesos de texto ───────────────────────────────────────────────────
   Transformaciones que `readSmart` aplica al texto ANTES de `parseDelimited`:
   quitar un preámbulo de aviso, normalizar un separador raro, lo que sea.

   Cada una devuelve o bien el texto, o bien `{texto, nota}`. La nota se guarda
   y la enseña Datos. Esto no es cosmética: un fichero al que se le han quitado
   ocho líneas por el camino y no lo dice en ningún sitio es un número sin
   trazabilidad esperando a que alguien lo descubra tarde. */
function registrarPreproceso(fn, etiqueta){
  if(typeof fn!=='function') throw new Error('registrarPreproceso: hace falta una función.');
  REGISTRO.preprocesos.push({fn, etiqueta:etiqueta||fn.name||'preproceso'});
  if(!_readSmartEnvuelto && typeof readSmart==='function'){
    const base = readSmart;
    readSmart = function(file){
      return Promise.resolve(base.apply(this, arguments)).then(txt=>{
        REGISTRO.preprocesos.forEach(p=>{
          try{
            const r = p.fn(txt, file);
            if(r && typeof r==='object' && typeof r.texto==='string'){
              if(r.texto!==txt && r.nota)
                REGISTRO.notas.push({fichero:(file&&file.name)||'', etiqueta:p.etiqueta, nota:r.nota});
              txt = r.texto;
            }else if(typeof r==='string'){ txt = r; }
          }catch(e){ console.warn('preproceso '+p.etiqueta, e); }
        });
        return txt;
      });
    };
    _readSmartEnvuelto = true;
  }
  return fn;
}
let _readSmartEnvuelto = false;

/* ── Estilos ────────────────────────────────────────────────────────────────
   Inyecta CSS sin abrir 01-head.html, que está congelado y donde diez carriles
   se pisarían sin remedio. */
function registrarEstilo(css){
  if(!css) return null;
  const s = document.createElement('style');
  s.setAttribute('data-registro','1');
  s.textContent = css;
  document.head.appendChild(s);
  REGISTRO.estilos.push(css.length);
  return s;
}

/* ── Exportaciones ──────────────────────────────────────────────────────────
   Un botón más en Datos › Salida, junto a la copia de seguridad. */
function registrarExportacion(id, etiqueta, fn){
  if(!id || typeof fn!=='function') throw new Error('registrarExportacion: hacen falta id y función.');
  if(REGISTRO.exportaciones.some(e=>e.id===id))
    throw new Error('registrarExportacion: ya hay una exportación con id "'+id+'". Dos carriles se están pisando.');
  REGISTRO.exportaciones.push({id, etiqueta:etiqueta||id, fn});
  window['exportar_'+id] = fn;
  return id;
}

/* ── Flush aplazado ─────────────────────────────────────────────────────────
   Lo que no se puede hacer mientras corren los 2x porque 13-render todavía no
   ha definido sus `const`. */
function _flushRegistro(){
  /* Migas de pan */
  try{
    if(typeof CRUMBS==='object' && CRUMBS)
      REGISTRO.vistas.forEach(v=>{ if(v.crumb && CRUMBS[v.id]===undefined) CRUMBS[v.id] = v.crumb; });
  }catch(e){ console.warn('registro: migas', e); }

  /* Botones de exportación, al lado de la copia de seguridad de Datos */
  try{
    if(REGISTRO.exportaciones.length){
      const refBtn = document.querySelector('#view-datos button[onclick="exportData()"]');
      const destino = refBtn ? refBtn.parentNode : null;
      if(destino) REGISTRO.exportaciones.forEach(e=>{
        if(destino.querySelector('[data-export="'+e.id+'"]')) return;
        const b = document.createElement('button');
        b.className = 'btn sm';
        b.setAttribute('data-export', e.id);
        b.textContent = e.etiqueta;
        b.addEventListener('click', ()=>{ try{ e.fn(); }catch(err){ console.warn('exportación '+e.id, err); } });
        destino.appendChild(b);
      });
    }
  }catch(e){ console.warn('registro: exportaciones', e); }

  /* Los render de las vistas nuevas entran en refreshAll. Se envuelve una sola
     vez y se lee el registro en cada llamada, no al envolver: así vale también
     para lo que se registre después. */
  try{
    if(!_refreshEnvuelto && typeof refreshAll==='function'){
      const base = refreshAll;
      refreshAll = function(){
        base.apply(this, arguments);
        REGISTRO.vistas.forEach(v=>{
          if(typeof v.render!=='function') return;
          try{ v.render(); }catch(e){ console.warn('vista '+v.id, e); }
        });
      };
      _refreshEnvuelto = true;
      refreshAll();
    }
  }catch(e){ console.warn('registro: refreshAll', e); }
}
let _refreshEnvuelto = false;

if(typeof document!=='undefined'){
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', _flushRegistro);
  else setTimeout(_flushRegistro, 0);
}
