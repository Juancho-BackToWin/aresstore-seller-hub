/* Aresstore Seller Hub — service worker · v0.7.0 · 2026-08-20 17:06 UTC */
const CACHE = 'aresstore-0.7.0-202608201706';
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
