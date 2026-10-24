// Offline support: serve from the network when possible, fall back to the cache at the table.
var CACHE='kaboo-v1';
var FILES=['./','index.html','manifest.webmanifest','icon.svg','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(FILES);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(function(res){
    if(res.ok&&(res.type==='basic'||res.type==='cors')){
      var copy=res.clone();caches.open(CACHE).then(function(c){c.put(e.request,copy);});
    }
    return res;
  }).catch(function(){
    return caches.match(e.request).then(function(r){return r||caches.match('index.html');});
  }));
});
