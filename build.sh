#!/usr/bin/env bash
# Ensambla la aplicación desde src/ y deja la raíz lista para Vercel.
# Uso:  ./build.sh          (versión desde package.json + fecha)
#       ./build.sh 0.6      (versión explícita)
set -euo pipefail
cd "$(dirname "$0")"

VER="${1:-$(node -p "require('./package.json').version" 2>/dev/null || echo 0.5)}"
BUILD="$(date -u +%Y-%m-%d\ %H:%M)"
STAMP="v${VER} · ${BUILD} UTC"
CACHE="aresstore-${VER}-$(date -u +%Y%m%d%H%M)"

echo "→ Compilando ${STAMP}"

# 1 · un solo archivo HTML con todo dentro
cat src/01-head.html src/02-views.html src/03-calculadora.html src/04-acerca.html \
    src/05-auditoria.html src/06-guia.html src/07-close.html \
    src/10-const.js src/11-motor-validacion.js src/12-datos.js src/13-render.js > index.html
printf '\n</script>\n</body>\n</html>\n' >> index.html

# 2 · sellar la versión para que se vea en la interfaz
node -e "
const fs=require('fs');
let h=fs.readFileSync('index.html','utf8');
h=h.split('{{VERSION}}').join('${STAMP}');
fs.writeFileSync('index.html',h);
"

# 3 · manifest
cat > manifest.webmanifest <<JSON
{
  "name": "Aresstore Seller Hub",
  "short_name": "Aresstore",
  "description": "Gestion del seller de Amazon: rentabilidad, tesoreria, inventario, compras y cumplimiento. FBA y FBM.",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#171210",
  "theme_color": "#FF6A00",
  "lang": "es",
  "icons": [
    {"src":"icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"},
    {"src":"icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"},
    {"src":"icon-maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}
  ]
}
JSON

# 4 · service worker. La versión de cache cambia en cada compilación, y eso es
#     lo que dispara la actualización automatica en los dispositivos.
cat > sw.js <<JS
/* Aresstore Seller Hub — service worker · ${STAMP} */
const CACHE = '${CACHE}';
const SHELL = ['./','./index.html','./manifest.webmanifest',
               './icon-192.png','./icon-512.png','./icon-180.png','./icon-maskable-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if(e.request.method!=='GET') return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit =>
    hit || fetch(e.request).then(res=>{
      if(res && res.ok && res.type==='basic'){ const c=res.clone(); caches.open(CACHE).then(x=>x.put(e.request,c)); }
      return res;
    }).catch(()=>caches.match('./index.html'))
  ));
});
JS

# 5 · iconos, redimensionados desde el maestro versionado en icons/.
#     Para rediseñarlos: node icons/make-icons.js && node icons/render.js
python3 - <<'PY'
from PIL import Image
s=Image.open('icons/master-hub-512.png').convert('RGBA')
for n in (512,192,180): s.resize((n,n), Image.LANCZOS).save('icon-%d.png'%n)
c=Image.new('RGBA',(512,512),(23,18,16,255)); i=s.resize((410,410), Image.LANCZOS)
c.paste(i,(51,51),i); c.save('icon-maskable-512.png')
PY

echo "→ index.html $(wc -c < index.html) bytes · cache ${CACHE}"
node --check <(cat src/10-const.js src/11-motor-validacion.js src/12-datos.js src/13-render.js) 2>/dev/null \
  || { cat src/10-const.js src/11-motor-validacion.js src/12-datos.js src/13-render.js > /tmp/_chk.js; node --check /tmp/_chk.js; }
echo "→ sintaxis correcta"
